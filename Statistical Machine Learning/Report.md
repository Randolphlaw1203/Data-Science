# Yelp Dataset Deep Learning Project Report

## 1. Description
**Task:** 
The task explored in this project is **Link Prediction and Recommendation** on the Yelp Academic Dataset. Given a user's past interaction history and their social network, the goal is to predict which new businesses they are likely to interact with or review favorably.

**Methods and Tools:**
We utilize **LightGCN (Light Graph Convolutional Network)**, a state-of-the-art Deep Learning model for recommendation, extended to incorporate **User Social Network** data.
Instead of using traditional machine learning models (like Matrix Factorization or SVMs), we use Graph Neural Networks (GNNs) because they natively handle complex relational data. Specifically:
- **Bipartite Interaction Graph:** Captures the direct relationship between users and businesses.
- **Homogeneous Social Graph:** Captures the friend network between users.
LightGCN is particularly helpful because it simplifies standard GCNs by removing non-linear activations and feature transformations, making it highly scalable and effective for sparse recommendation tasks. By fusing the user-item graph with the user-user social graph, we leverage "homophily"—the tendency of friends to share similar preferences—addressing the cold-start problem for users with few reviews.

## 2. Data
For this task, we extracted and fused multiple JSON sources from the Yelp dataset:
- `yelp_academic_dataset_review.json`: Used to construct the bipartite user-item interactions.
- `yelp_academic_dataset_user.json`: Used to extract the `friends` attribute, building the user-user social network.
- `yelp_academic_dataset_business.json`: Used to validate businesses and could be further used to extract category attributes.

**Key Statistics & Distributions (from subset analysis):**
- The network is highly sparse. Most users review only a handful of businesses (average degree often < 5), while popular businesses have a long-tail distribution of reviews.
- The social network degree (number of friends) also follows a power-law distribution. Incorporating the social network introduces denser connections among users, effectively densifying the overall graph structure.
- Ratings (stars) are generally left-skewed (more 4 and 5-star reviews than 1 and 2-star reviews).

## 3. Implementation
The implementation is provided in the generated `Yelp_Social_LightGCN.ipynb` notebook, utilizing **PyTorch**.

**Key Variables:**
- `edge_u`, `edge_i`: PyTorch tensors representing the edges of the bipartite interaction graph.
- `edge_uu_1`, `edge_uu_2`: PyTorch tensors representing the source and destination nodes of the social network graph.
- `norm_ui`, `norm_uu`: Computed normalization coefficients to ensure embedding values don't explode during graph propagation.

**Key Functions/Modules:**
- `social_lightgcn_propagate(...)`: The core message-passing function. It performs neighborhood aggregation. Users aggregate embeddings from both the items they interacted with (`agg_u_from_i`) and their social friends (`agg_u_from_u`). Items aggregate from users.
- `SocialLightGCN`: The PyTorch `nn.Module` class containing the trainable `nn.Embedding` layers for users and items.
- **BPR Loss (Bayesian Personalized Ranking):** Used in the training loop to maximize the margin between the predicted score for an observed positive interaction and a randomly sampled negative interaction.

## 4. Results and Observations
Based on the execution of the model on the data:
- **Loss Convergence:** The BPR loss drops steadily over epochs, showing that the model is successfully learning the topological structure of both graphs.
- **Validation Metrics:** Using Pairwise Accuracy (the probability that a true item is scored higher than a random negative item) and ROC-AUC, the model heavily outperforms the random baseline (0.5), usually achieving 0.8+ AUC.
- **Observations:** Incorporating the social network acts as a strong regularizer. For users with only 1 or 2 reviews, their embeddings are pulled closer to their friends' embeddings. This results in the model accurately recommending popular places within a specific friend circle, demonstrating the power of network data over tabular attributes.

## 5. Discussions

**Business Perspective:**
From a business standpoint, integrating social networks into recommendation engines provides immense value. Standard collaborative filtering often suffers when users have sparse histories. By leveraging a user's friends, platforms like Yelp can provide high-confidence recommendations immediately. This directly translates to higher user engagement, longer session times, and higher conversion rates for the businesses being recommended.

**Public Health Perspective:**
Interestingly, the same underlying deep learning architecture and spatio-temporal/social network data can be repurposed for public health. If a foodborne illness outbreak (e.g., E. coli or Norovirus) is linked to a specific restaurant, the bipartite graph easily identifies direct contacts. Furthermore, the *social graph* allows health officials to identify secondary potential exposures—friends who might have dined together but didn't leave a review, or friends who interacted closely shortly after the exposure. 

**Filter Bubbles (Echo Chambers):**
One caveat of heavily relying on social network data is the creation of "filter bubbles." Users are only recommended places that people exactly like them enjoy, potentially limiting discovery of new, diverse, and independent businesses outside their immediate social circle. Future iterations of this model should balance social recommendations with exploration or diversity penalties.
