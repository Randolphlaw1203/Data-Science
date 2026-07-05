import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.svm import SVC
from sklearn.metrics import confusion_matrix, accuracy_score, roc_curve, auc
from imblearn.over_sampling import SMOTE
from matplotlib.ticker import FormatStrFormatter # Changed to FormatStrFormatter

# --- 1. Load and Preprocess ---
df = pd.read_csv('insurance_fraud_data_processed.csv')

df['fraud_reported'] = df['fraud reported'].map({'Y': 1, 'N': 0})
df['claim_date'] = pd.to_datetime(df['claim_date'], errors='coerce')
df['claim_month'], df['claim_day'] = df['claim_date'].dt.month, df['claim_date'].dt.day
df = df.drop(columns=['fraud reported', 'claim_date', 'claim_number'])

cat_cols = df.select_dtypes(include=['object']).columns
encoder = OneHotEncoder(sparse_output=False, handle_unknown='ignore', drop='first')
encoded_df = pd.DataFrame(encoder.fit_transform(df[cat_cols]), 
                          columns=encoder.get_feature_names_out(cat_cols))

num_cols = df.select_dtypes(include=['number']).columns.drop('fraud_reported')
X = pd.concat([df[num_cols].reset_index(drop=True), encoded_df.reset_index(drop=True)], axis=1)
y = df['fraud_reported']

# --- 2. 100-Split Simulation ---
type_I_error_rates = []     
type_II_error_rates = []    
error_rates = []       

# Variables to store ROC data across all splits
tprs = []
aucs = []
mean_fpr = np.linspace(0, 1, 100) # Standardized FPR axis for averaging

print("Running 100 iterations of SVM with SMOTE and computing ROC...")

for i in range(100):
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, stratify=y, random_state=i)
    
    smote = SMOTE(random_state=42)
    X_res, y_res = smote.fit_resample(X_train, y_train)
    
    scaler = StandardScaler()
    X_res_scaled = scaler.fit_transform(X_res)
    X_test_scaled = scaler.transform(X_test)
    
    model = SVC(kernel='linear', class_weight='balanced', random_state=42)
    model.fit(X_res_scaled, y_res)
    
    y_pred = model.predict(X_test_scaled)
    cm = confusion_matrix(y_test, y_pred)
    
    # Calculate rates instead of raw counts
    tn, fp, fn, tp = cm.ravel()
    fpr_rate = fp / (fp + tn)
    fnr_rate = fn / (fn + tp)
    
    type_I_error_rates.append(fpr_rate)  
    type_II_error_rates.append(fnr_rate) 
    error_rates.append(1 - accuracy_score(y_test, y_pred))

    # Calculate ROC metrics using decision_function (distance to hyperplane)
    y_score = model.decision_function(X_test_scaled)
    fpr_roc, tpr_roc, _ = roc_curve(y_test, y_score)
    
    # Interpolate TPRs so we can average them later over the common mean_fpr grid
    interp_tpr = np.interp(mean_fpr, fpr_roc, tpr_roc)
    interp_tpr[0] = 0.0
    tprs.append(interp_tpr)
    aucs.append(auc(fpr_roc, tpr_roc))

results_df = pd.DataFrame({
    'Type I Error Rate (FPR)': type_I_error_rates,
    'Type II Error Rate (FNR)': type_II_error_rates,
    'Classification Error Rate': error_rates
})

# Calculate final Mean ROC and Confidence Bands
mean_tpr = np.mean(tprs, axis=0)
mean_tpr[-1] = 1.0
mean_auc = auc(mean_fpr, mean_tpr)
std_auc = np.std(aucs)
std_tpr = np.std(tprs, axis=0)

# Calculate +/- 1.96 standard deviations for the 95% confidence band
tprs_upper = np.minimum(mean_tpr + 1.96 * std_tpr, 1)
tprs_lower = np.maximum(mean_tpr - 1.96 * std_tpr, 0)

# --- 3. Visualizations ---
# Explicitly defining colors
COLOR_TYPE_I = '#4682B4'   # SteelBlue
COLOR_TYPE_II = '#FF8C00'  # DarkOrange
COLOR_OVERALL = '#228B22'  # ForestGreen
COLOR_ROC_LINE = '#FF8C00' # DarkOrange
COLOR_ROC_BAND = '#FFE4B5' # Moccasin
COLOR_RANDOM = '#000080'   # Navy

# --- Graph 1: Histograms ---
plt.figure(figsize=(18, 5))

ax1 = plt.subplot(1, 3, 1)
sns.histplot(results_df['Type I Error Rate (FPR)'], bins=15, kde=True, color=COLOR_TYPE_I)
ax1.xaxis.set_major_formatter(FormatStrFormatter('%.2f')) # Format X axis as 0.00
plt.title('Distribution of Type I Error Rate (FPR)')

ax2 = plt.subplot(1, 3, 2)
sns.histplot(results_df['Type II Error Rate (FNR)'], bins=15, kde=True, color=COLOR_TYPE_II)
ax2.xaxis.set_major_formatter(FormatStrFormatter('%.2f')) # Format X axis as 0.00
plt.title('Distribution of Type II Error Rate (FNR)')

ax3 = plt.subplot(1, 3, 3)
sns.histplot(results_df['Classification Error Rate'], bins=15, kde=True, color=COLOR_OVERALL)
ax3.xaxis.set_major_formatter(FormatStrFormatter('%.2f')) # Format X axis as 0.00
plt.title('Distribution of Classification Error Rate')

plt.tight_layout()
plt.savefig('svm_100_split_histograms.png', dpi=300, bbox_inches='tight')
plt.show()

# --- Graph 2: Box Plots ---
plt.figure(figsize=(18, 5))

ax4 = plt.subplot(1, 3, 1)
sns.boxplot(y=results_df['Type I Error Rate (FPR)'], color=COLOR_TYPE_I)
ax4.yaxis.set_major_formatter(FormatStrFormatter('%.2f')) # Format Y axis as 0.00
plt.title('Box Plot of Type I Error Rate (FPR)')

ax5 = plt.subplot(1, 3, 2)
sns.boxplot(y=results_df['Type II Error Rate (FNR)'], color=COLOR_TYPE_II)
ax5.yaxis.set_major_formatter(FormatStrFormatter('%.2f')) # Format Y axis as 0.00
plt.title('Box Plot of Type II Error Rate (FNR)')

ax6 = plt.subplot(1, 3, 3)
sns.boxplot(y=results_df['Classification Error Rate'], color=COLOR_OVERALL)
ax6.yaxis.set_major_formatter(FormatStrFormatter('%.2f')) # Format Y axis as 0.00
plt.title('Box Plot of Classification Error Rate')

plt.tight_layout()
plt.savefig('svm_100_split_boxplots.png', dpi=300, bbox_inches='tight')
plt.show()

# --- Graph 3: Mean ROC Curve ---
plt.figure(figsize=(8, 6))

plt.plot(mean_fpr, mean_tpr, color=COLOR_ROC_LINE,
         label=f'Mean ROC (AUC = {mean_auc:.3f} ± {std_auc:.3f})',
         lw=2, alpha=0.9)

plt.fill_between(mean_fpr, tprs_lower, tprs_upper, color=COLOR_ROC_BAND, alpha=0.5,
                 label='±1.96 std band')

plt.plot([0, 1], [0, 1], linestyle='--', lw=2, color=COLOR_RANDOM, label='Random', alpha=0.8)

plt.xlim([-0.01, 1.01])
plt.ylim([-0.01, 1.01])
plt.xlabel('False Positive Rate')
plt.ylabel('True Positive Rate')
plt.title('Mean ROC Curve Across 100 Splits (SVM + SMOTE)')
plt.legend(loc="lower right")
plt.grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig('svm_100_split_roc.png', dpi=300, bbox_inches='tight')
plt.show()

print("\n[INFO] All 3 graphs have been successfully generated and auto-downloaded to your directory:")
print("  1. 'svm_100_split_histograms.png'")
print("  2. 'svm_100_split_boxplots.png'")
print("  3. 'svm_100_split_roc.png'")

print("\n--- Summary Statistics (100 Iterations) ---")
print(results_df.describe().round(4))