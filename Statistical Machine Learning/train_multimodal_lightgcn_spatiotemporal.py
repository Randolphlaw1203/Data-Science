#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Train LightGCN fused with spatio-temporal features (GPS + time) and a
star-rating sentiment branch on Yelp Academic reviews.

Reuses encoding from ``export_spatiotemporal_features.py`` so ST tensors match
the existing handoff pipeline.

Training efficiency
---------------------
By default, **one** ``lightgcn_propagate`` runs per **chunk** of micro-batches
(see ``--micro-batches-per-propagate``, default **32**). Each micro-batch loss
is backpropagated with scaling ``1/N`` so gradients match the **mean** loss,
without stacking all losses (avoids CUDA OOM). Use ``1`` for the legacy (slow)
per-micro-batch propagate behavior.

Examples::

    # All reviews in review.json (default; needs RAM and patience on CPU)
    python multimodal_recommender/train_multimodal_lightgcn.py --device cuda

    # Subset for quick tests
    python multimodal_recommender/train_multimodal_lightgcn.py --max-reviews 50000

Checkpoint is written under ``handoff_photo_analysis/checkpoints/`` for the
next teammate (photo branch).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F
from sklearn.metrics import roc_auc_score

# Repo root (parent of multimodal_recommender/)
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from export_spatiotemporal_features import (  # noqa: E402
    DEFAULT_RANDOM_SEED,
    build_interaction_table,
    compute_spatiotemporal_tensors,
    fit_gps_normalizer,
    load_business_dataframe,
    load_reviews_dataframe,
    resolve_yelp_json_path,
)


def _sync_device(device: torch.device) -> None:
    if device.type == "cuda":
        torch.cuda.synchronize()


def resolve_training_device(requested: str) -> torch.device:
    """
    Map CLI --device to a real torch.device.

    If the user passes ``cuda`` but this Python build has CPU-only PyTorch,
    fall back to CPU with a clear message instead of crashing mid-run.
    """
    req = (requested or "cpu").strip().lower()
    if req == "cuda":
        if torch.cuda.is_available():
            return torch.device("cuda")
        print(
            "[warn] --device cuda was set, but PyTorch has no CUDA (CPU-only build). "
            "Using CPU. Install a CUDA wheel from https://pytorch.org to use the GPU.",
            file=sys.stderr,
        )
        return torch.device("cpu")
    return torch.device(req)


def build_unique_graph_edges(
    user_idx: np.ndarray,
    item_idx: np.ndarray,
) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    """Deduplicate (user, item) pairs; return edge_u, edge_i, norm coeffs."""
    pairs = np.stack([user_idx, item_idx], axis=1)
    uniq = np.unique(pairs, axis=0)
    edge_u = torch.from_numpy(uniq[:, 0].astype(np.int64))
    edge_i = torch.from_numpy(uniq[:, 1].astype(np.int64))
    num_u = int(user_idx.max()) + 1
    num_i = int(item_idx.max()) + 1
    deg_u = torch.bincount(edge_u, minlength=num_u).float().clamp(min=1.0)
    deg_i = torch.bincount(edge_i, minlength=num_i).float().clamp(min=1.0)
    norm = (deg_u[edge_u] * deg_i[edge_i]).pow(-0.5)
    return edge_u, edge_i, norm


def lightgcn_propagate(
    emb_u: torch.Tensor,
    emb_i: torch.Tensor,
    edge_u: torch.Tensor,
    edge_i: torch.Tensor,
    norm: torch.Tensor,
    n_layers: int,
) -> Tuple[torch.Tensor, torch.Tensor]:
    """Bipartite normalized adjacency message passing (LightGCN-style)."""
    all_u = [emb_u]
    all_i = [emb_i]
    eu, ei = emb_u, emb_i
    for _ in range(n_layers):
        # users aggregate from items
        msg_i = norm.unsqueeze(1) * eu[edge_u]
        agg_i = torch.zeros_like(ei)
        agg_i.index_add_(0, edge_i, msg_i)
        # items aggregate from users
        msg_u = norm.unsqueeze(1) * ei[edge_i]
        agg_u = torch.zeros_like(eu)
        agg_u.index_add_(0, edge_u, msg_u)
        eu, ei = agg_u, agg_i
        all_u.append(eu)
        all_i.append(ei)
    out_u = torch.stack(all_u, dim=0).mean(dim=0)
    out_i = torch.stack(all_i, dim=0).mean(dim=0)
    return out_u, out_i


class MultimodalLightGCN(nn.Module):
    """
    LightGCN embeddings + interaction MLP over [u, i, ST, star sentiment].
    Star ratings use nn.Embedding (coarse text-free sentiment prior).
    """

    def __init__(
        self,
        num_users: int,
        num_items: int,
        emb_dim: int,
        n_layers: int,
        st_dim: int,
        star_emb_dim: int,
        mlp_hidden: int,
    ) -> None:
        super().__init__()
        self.n_layers = n_layers
        self.emb_dim = emb_dim
        self.user_emb = nn.Embedding(num_users, emb_dim)
        self.item_emb = nn.Embedding(num_items, emb_dim)
        nn.init.xavier_uniform_(self.user_emb.weight)
        nn.init.xavier_uniform_(self.item_emb.weight)
        # 0..5 — use 1..5 for Yelp stars
        self.star_emb = nn.Embedding(6, star_emb_dim)
        nn.init.xavier_uniform_(self.star_emb.weight)
        in_mlp = emb_dim * 2 + st_dim + star_emb_dim
        self.mlp = nn.Sequential(
            nn.Linear(in_mlp, mlp_hidden),
            nn.ReLU(inplace=True),
            nn.Linear(mlp_hidden, 1),
        )
        for m in self.mlp.modules():
            if isinstance(m, nn.Linear):
                nn.init.xavier_uniform_(m.weight)
                if m.bias is not None:
                    nn.init.zeros_(m.bias)

    def forward_scores(
        self,
        eu: torch.Tensor,
        ei: torch.Tensor,
        u: torch.Tensor,
        i: torch.Tensor,
        st: torch.Tensor,
        star_idx: torch.Tensor,
    ) -> torch.Tensor:
        u_vec = eu[u]
        i_vec = ei[i]
        s_vec = self.star_emb(star_idx)
        x = torch.cat([u_vec, i_vec, st, s_vec], dim=-1)
        return (u_vec * i_vec).sum(dim=-1) + self.mlp(x).squeeze(-1)


@torch.no_grad()
def pairwise_val_metrics(
    model: MultimodalLightGCN,
    edge_u: torch.Tensor,
    edge_i: torch.Tensor,
    norm: torch.Tensor,
    st: torch.Tensor,
    star_t: torch.Tensor,
    u_idx_t: torch.Tensor,
    i_idx_t: torch.Tensor,
    val_rows: np.ndarray,
    num_items: int,
    device: torch.device,
    batch_size: int,
    max_samples: int,
    rng: np.random.Generator,
) -> Tuple[float, float]:
    """
    Validation on held-out interaction rows (same random negative as training).

    Returns
    -------
    pairwise_acc : float
        P(score_pos > score_neg) per row.
    roc_auc : float
        sklearn ROC AUC on labels [1,...,0,...] for scores [s_pos..., s_neg...]
        (one positive + one random negative per validation row).
    """
    if val_rows.size == 0:
        return float("nan"), float("nan")
    n = int(min(max_samples, val_rows.size))
    pick = rng.choice(val_rows, size=n, replace=False)
    rows = torch.from_numpy(pick.astype(np.int64)).to(device)
    model.eval()
    eu, ei = lightgcn_propagate(
        model.user_emb.weight,
        model.item_emb.weight,
        edge_u,
        edge_i,
        norm,
        model.n_layers,
    )
    pos_chunks: List[np.ndarray] = []
    neg_chunks: List[np.ndarray] = []
    for start in range(0, n, batch_size):
        sl = rows[start : start + batch_size]
        u = u_idx_t[sl]
        i_pos = i_idx_t[sl]
        st_b = st[sl]
        star_b = star_t[sl]
        j = (i_pos + torch.randint(1, num_items, (sl.numel(),), device=device)) % num_items
        s_pos = model.forward_scores(eu, ei, u, i_pos, st_b, star_b)
        s_neg = model.forward_scores(eu, ei, u, j, st_b, star_b)
        pos_chunks.append(s_pos.detach().float().cpu().numpy())
        neg_chunks.append(s_neg.detach().float().cpu().numpy())
    pos = np.concatenate(pos_chunks)
    neg = np.concatenate(neg_chunks)
    pairwise_acc = float((pos > neg).mean())
    y_true = np.concatenate([np.ones(pos.shape[0], dtype=np.int32), np.zeros(neg.shape[0], dtype=np.int32)])
    y_score = np.concatenate([pos, neg])
    try:
        roc_auc = float(roc_auc_score(y_true, y_score))
    except ValueError:
        roc_auc = float("nan")
    return pairwise_acc, roc_auc


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Multimodal LightGCN (Yelp)")
    p.add_argument("--business-json", type=str, default="yelp_academic_dataset_business.json")
    p.add_argument("--review-json", type=str, default="yelp_academic_dataset_review.json")
    p.add_argument(
        "--max-reviews",
        type=int,
        default=None,
        metavar="N",
        help="Load at most N review rows. Omit this flag (default) to load the entire review.json.",
    )
    p.add_argument("--epochs", type=int, default=15)
    p.add_argument("--batch-size", type=int, default=4096)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--emb-dim", type=int, default=64)
    p.add_argument("--n-layers", type=int, default=3)
    p.add_argument("--st-fused-dim", type=int, default=64)
    p.add_argument("--star-emb-dim", type=int, default=16)
    p.add_argument("--mlp-hidden", type=int, default=64)
    p.add_argument("--device", type=str, default="cuda" if torch.cuda.is_available() else "cpu")
    p.add_argument("--seed", type=int, default=DEFAULT_RANDOM_SEED)
    p.add_argument(
        "--checkpoint-dir",
        type=str,
        default=os.path.join(_ROOT, "handoff_photo_analysis", "checkpoints"),
    )
    p.add_argument(
        "--log-every",
        type=int,
        default=50,
        metavar="B",
        help="Print batch progress every B training steps (0 = off). Shows loss and throughput.",
    )
    p.add_argument(
        "--val-ratio",
        type=float,
        default=0.0,
        metavar="R",
        help="Fraction of interactions held out for validation (0 = use all rows for training "
        "and skip val). If R>0, graph edges are built from training interactions only.",
    )
    p.add_argument(
        "--val-every",
        type=int,
        default=1,
        help="Run validation every N epochs (1 = every epoch).",
    )
    p.add_argument(
        "--val-max-samples",
        type=int,
        default=8192,
        help="Max validation interactions to score (keeps eval fast on huge data).",
    )
    p.add_argument(
        "--heartbeat-sec",
        type=float,
        default=0.0,
        metavar="T",
        help="If T>0, print a heartbeat line at most every T seconds between batches "
        "(confirms the loop is still advancing; use if the machine sleeps or output looks frozen).",
    )
    p.add_argument(
        "--debug-timing",
        action="store_true",
        help="Print timing: per-chunk propagate ms; if --micro-batches-per-propagate is 1, also "
        "per-batch forward/backward ms (CUDA sync).",
    )
    p.add_argument(
        "--micro-batches-per-propagate",
        type=int,
        default=32,
        metavar="K",
        help="Micro-batches per chunk: one propagate, then one scaled backward per micro-batch "
        "(gradients match mean loss; avoids OOM from stacking the whole chunk). "
        "0 = entire epoch in one chunk (fastest propagate count; still may OOM on huge graphs). "
        "1 = legacy: propagate every micro-batch (slowest).",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()
    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    device = resolve_training_device(args.device)
    print(f"[info] using device: {device}")

    t0 = time.perf_counter()

    bp, _ = resolve_yelp_json_path(args.business_json)
    rp, _ = resolve_yelp_json_path(args.review_json)
    if not bp or not rp:
        print("[error] Could not resolve Yelp business/review JSON paths.", file=sys.stderr)
        return 2

    print(f"[info] business: {bp}")
    print(f"[info] review: {rp}")
    if args.max_reviews is None:
        print("[info] loading all reviews from review.json (no row cap) ...")
    else:
        print(f"[info] loading at most {args.max_reviews:,} reviews ...")
    df_b = load_business_dataframe(bp)
    df_r = load_reviews_dataframe(rp, max_rows=args.max_reviews)
    if "user_id" not in df_r.columns:
        print("[error] reviews need user_id", file=sys.stderr)
        return 2
    if "stars" not in df_r.columns:
        print("[error] reviews need stars (sentiment proxy)", file=sys.stderr)
        return 2

    df_i = build_interaction_table(df_r, df_b)
    print(f"[info] interactions after join: {len(df_i):,}")

    normalizer = fit_gps_normalizer(df_b)
    tensors = compute_spatiotemporal_tensors(
        df_i,
        normalizer=normalizer,
        spatial_dim=32,
        temporal_dim=32,
        fused_dim=args.st_fused_dim,
        device=torch.device("cpu"),
        random_seed=args.seed,
    )
    st = tensors["fused_features"].to(device)
    t_data = time.perf_counter()
    print(f"[time] data + ST encode: {t_data - t0:.1f}s")

    u_ids = df_i["user_id"].astype(str).tolist()
    b_ids = df_i["business_id"].astype(str).tolist()
    u_map: Dict[str, int] = {}
    i_map: Dict[str, int] = {}
    u_idx_list: List[int] = []
    i_idx_list: List[int] = []
    for u, b in zip(u_ids, b_ids):
        if u not in u_map:
            u_map[u] = len(u_map)
        if b not in i_map:
            i_map[b] = len(i_map)
        u_idx_list.append(u_map[u])
        i_idx_list.append(i_map[b])
    u_idx = np.array(u_idx_list, dtype=np.int64)
    i_idx = np.array(i_idx_list, dtype=np.int64)
    num_users = len(u_map)
    num_items = len(i_map)
    print(f"[info] users={num_users:,} items={num_items:,}")

    n_int = len(df_i)
    rng_split = np.random.default_rng(args.seed)
    if args.val_ratio > 0.0:
        is_val = rng_split.random(n_int) < float(args.val_ratio)
        train_rows_np = np.where(~is_val)[0].astype(np.int64)
        val_rows_np = np.where(is_val)[0].astype(np.int64)
        if train_rows_np.size == 0:
            print("[warn] val-ratio left no training rows; using all rows for train.", file=sys.stderr)
            train_rows_np = np.arange(n_int, dtype=np.int64)
            val_rows_np = np.array([], dtype=np.int64)
    else:
        train_rows_np = np.arange(n_int, dtype=np.int64)
        val_rows_np = np.array([], dtype=np.int64)

    n_edges_full = len(np.unique(np.stack([u_idx, i_idx], axis=1), axis=0))
    edge_u, edge_i, norm = build_unique_graph_edges(u_idx[train_rows_np], i_idx[train_rows_np])
    edge_u, edge_i, norm = edge_u.to(device), edge_i.to(device), norm.to(device)
    n_edges_train = int(edge_u.shape[0])
    print(
        f"[info] interactions train={train_rows_np.size:,} val={val_rows_np.size:,} | "
        f"unique edges train={n_edges_train:,} (full-data edges would be {n_edges_full:,})"
    )
    print(
        "[info] Each training step runs full LightGCN propagation over all train edges - "
        "large edge counts mean long epochs; progress lines confirm it is not stuck."
    )

    stars = pd.to_numeric(df_i["stars"], errors="coerce").fillna(3.0).to_numpy()
    stars = np.round(stars).clip(1, 5).astype(np.int64)
    star_t = torch.from_numpy(stars).to(device)

    u_idx_t = torch.from_numpy(u_idx).to(device)
    i_idx_t = torch.from_numpy(i_idx).to(device)

    model = MultimodalLightGCN(
        num_users=num_users,
        num_items=num_items,
        emb_dim=args.emb_dim,
        n_layers=args.n_layers,
        st_dim=args.st_fused_dim,
        star_emb_dim=args.star_emb_dim,
        mlp_hidden=args.mlp_hidden,
    ).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=args.lr)

    n_train = int(train_rows_np.size)
    train_rows_t = torch.from_numpy(train_rows_np).to(device)
    val_rng = np.random.default_rng(args.seed + 999)
    last_val_pairwise_acc: float = float("nan")
    last_val_roc_auc: float = float("nan")
    n_batches = (n_train + args.batch_size - 1) // args.batch_size
    if args.micro_batches_per_propagate <= 0:
        mb_per_prop = n_batches
    else:
        mb_per_prop = min(max(1, args.micro_batches_per_propagate), n_batches)
    n_chunks = (n_batches + mb_per_prop - 1) // mb_per_prop
    print(
        f"[info] micro-batches per propagate: {mb_per_prop} "
        f"(optimizer steps/epoch: {n_chunks}; micro-batches/epoch: {n_batches})",
        flush=True,
    )

    t_train_start = time.perf_counter()
    last_heartbeat = time.perf_counter()
    for epoch in range(args.epochs):
        model.train()
        perm = torch.randperm(n_train, device=device)
        losses: List[float] = []
        t_epoch = time.perf_counter()
        last_log = t_epoch
        for chunk_start in range(0, n_batches, mb_per_prop):
            chunk_end = min(chunk_start + mb_per_prop, n_batches)
            opt.zero_grad()

            t_prop0 = time.perf_counter()
            eu, ei = lightgcn_propagate(
                model.user_emb.weight,
                model.item_emb.weight,
                edge_u,
                edge_i,
                norm,
                model.n_layers,
            )
            _sync_device(device)
            t_prop1 = time.perf_counter()
            if args.debug_timing:
                print(
                    f"[timing] chunk micro[{chunk_start + 1}-{chunk_end}] "
                    f"propagate_ms={(t_prop1 - t_prop0) * 1000:.1f}",
                    flush=True,
                )

            chunk_len = chunk_end - chunk_start
            t_bwd0 = time.perf_counter()
            for bi, b in enumerate(range(chunk_start, chunk_end)):
                if args.heartbeat_sec > 0:
                    hb_now = time.perf_counter()
                    if hb_now - last_heartbeat >= args.heartbeat_sec:
                        print(
                            f"[heartbeat] epoch {epoch + 1}/{args.epochs} "
                            f"micro-batch {b + 1}/{n_batches}",
                            flush=True,
                        )
                        last_heartbeat = hb_now

                start_m = b * args.batch_size
                end_m = min(start_m + args.batch_size, n_train)
                idx = train_rows_t[perm[start_m:end_m]]
                u = u_idx_t[idx]
                i_pos = i_idx_t[idx]
                st_b = st[idx]
                star_b = star_t[idx]
                j = (i_pos + torch.randint(1, num_items, (idx.numel(),), device=device)) % num_items

                s_pos = model.forward_scores(eu, ei, u, i_pos, st_b, star_b)
                s_neg = model.forward_scores(eu, ei, u, j, st_b, star_b)
                loss_mb = -F.logsigmoid(s_pos - s_neg).mean()
                reg = (
                    model.user_emb.weight[u].pow(2).mean()
                    + model.item_emb.weight[i_pos].pow(2).mean()
                    + model.item_emb.weight[j].pow(2).mean()
                ) * 1e-4
                loss_mb = loss_mb + reg

                losses.append(loss_mb.detach().item())
                last_heartbeat = time.perf_counter()

                if args.log_every > 0 and (b + 1) % args.log_every == 0:
                    now = time.perf_counter()
                    dt = now - last_log
                    inst = args.log_every / dt if dt > 0 else 0.0
                    done = b + 1
                    eta = (n_batches - done) * (now - t_epoch) / max(done, 1)
                    print(
                        f"[epoch {epoch + 1}/{args.epochs}] batch {done}/{n_batches} "
                        f"loss={float(np.mean(losses[-args.log_every :])):.4f} "
                        f"~{inst:.2f} batch/s ETA_epoch~{eta / 60:.1f}m",
                        flush=True,
                    )
                    last_log = now

                # Mean loss gradient: sum_i (1/N) grad L_i — do not stack all L_i (VRAM spike).
                is_last_in_chunk = bi == chunk_len - 1
                (loss_mb / float(chunk_len)).backward(retain_graph=not is_last_in_chunk)

            _sync_device(device)
            t_bwd1 = time.perf_counter()
            opt.step()
            if device.type == "cuda":
                torch.cuda.empty_cache()
            _sync_device(device)
            if args.debug_timing and mb_per_prop == 1:
                print(
                    f"[timing] backward+step_ms={(t_bwd1 - t_bwd0) * 1000:.1f}",
                    flush=True,
                )

        mean_loss = float(np.mean(losses))
        if (epoch + 1) % max(1, args.epochs // 5) == 0 or epoch == 0:
            print(f"[epoch {epoch+1}/{args.epochs}] loss_avg={mean_loss:.4f}", flush=True)

        if (
            val_rows_np.size > 0
            and args.val_every > 0
            and (epoch + 1) % args.val_every == 0
        ):
            last_val_pairwise_acc, last_val_roc_auc = pairwise_val_metrics(
                model,
                edge_u,
                edge_i,
                norm,
                st,
                star_t,
                u_idx_t,
                i_idx_t,
                val_rows_np,
                num_items,
                device,
                args.batch_size,
                args.val_max_samples,
                val_rng,
            )
            print(
                f"[val] epoch {epoch + 1} pairwise_acc={last_val_pairwise_acc:.4f}  "
                f"roc_auc={last_val_roc_auc:.4f}  "
                f"(random neg item per row; 0.5 = random, 1.0 = perfect separation)",
                flush=True,
            )

    t_train_end = time.perf_counter()
    train_secs = t_train_end - t_train_start
    total_secs = t_train_end - t0
    print(f"[time] training only ({args.epochs} epochs): {train_secs:.1f}s")
    print(f"[time] total (load + ST + train): {total_secs:.1f}s")

    os.makedirs(args.checkpoint_dir, exist_ok=True)
    ckpt_path = os.path.join(args.checkpoint_dir, "multimodal_lightgcn_state.pt")
    payload = {
        "model_state_dict": model.state_dict(),
        "meta": {
            "num_users": num_users,
            "num_items": num_items,
            "emb_dim": args.emb_dim,
            "n_layers": args.n_layers,
            "st_fused_dim": args.st_fused_dim,
            "star_emb_dim": args.star_emb_dim,
            "mlp_hidden": args.mlp_hidden,
            "epochs": args.epochs,
            "max_reviews": args.max_reviews,
            "train_seconds": round(train_secs, 2),
            "total_seconds": round(total_secs, 2),
            "device": str(device),
            "val_pairwise_accuracy": None
            if last_val_pairwise_acc != last_val_pairwise_acc
            else round(float(last_val_pairwise_acc), 6),
            "val_roc_auc": None
            if last_val_roc_auc != last_val_roc_auc
            else round(float(last_val_roc_auc), 6),
            "micro_batches_per_propagate": mb_per_prop,
            "optimizer_steps_per_epoch": n_chunks,
        },
        "id_maps": {
            "user_to_idx": u_map,
            "business_to_idx": i_map,
        },
    }
    torch.save(payload, ckpt_path)
    print(f"[saved] {ckpt_path}")

    summary_path = os.path.join(args.checkpoint_dir, "run_summary.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "checkpoint": os.path.abspath(ckpt_path),
                "approx_train_seconds": round(train_secs, 2),
                "approx_total_seconds": round(total_secs, 2),
                "val_pairwise_accuracy": None
                if last_val_pairwise_acc != last_val_pairwise_acc
                else round(float(last_val_pairwise_acc), 6),
                "val_roc_auc": None
                if last_val_roc_auc != last_val_roc_auc
                else round(float(last_val_roc_auc), 6),
                "config": {k: getattr(args, k) for k in vars(args)},
            },
            f,
            indent=2,
        )
    print(f"[saved] {summary_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
