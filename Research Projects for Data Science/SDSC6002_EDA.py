import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns

# Set global style and consistent color palette for 'N' and 'Y'
sns.set(style="whitegrid")
default_colors = sns.color_palette()
fraud_palette = {'N': default_colors[0], 'Y': default_colors[1]}

# ==========================================
# 1. DATA LOADING & CLEANING
# ==========================================
df = pd.read_csv('insurance_fraud_data.csv')

# Clean and convert data types as per report requirements
df.replace('*', np.nan, inplace=True)
df['injury_claim'] = pd.to_numeric(df['injury_claim'])
df['age_of_vehicle'] = pd.to_numeric(df['age_of_vehicle'])
df['witness_present'] = pd.to_numeric(df['witness_present'])

# Handle missing values and basic filtering
df.dropna(subset=['fraud reported'], inplace=True)
df['injury_claim'] = df['injury_claim'].fillna(df['injury_claim'].median())
df = df[(df['age_of_driver'] >= 18) & (df['age_of_driver'] <= 100)]
df = df[df['annual_income'] >= 0]

target_col = 'fraud reported'

# ==========================================
# 2. GENERATING REPORT-SPECIFIC GRAPHS
# ==========================================

# Graph 1: Distribution of Fraud Reported (Report Section 2.1.1)
plt.figure(figsize=(6, 4))
sns.countplot(data=df, x=target_col, palette=fraud_palette)
plt.title('Distribution of Fraud Reported')
plt.savefig('1_fraud_distribution.png')
plt.close()

# Graph 2: Correlation Heatmap (Report Section 2.1.2)
numeric_df = df.select_dtypes(include=[np.number])
corr = numeric_df.corr(method='spearman') # Report mentions Spearman
plt.figure(figsize=(12, 10))
sns.heatmap(corr, annot=False, cmap='coolwarm', vmin=-1, vmax=1) 
plt.title('Correlation Heatmap of Numeric Features (-1 to +1)')
plt.tight_layout()
plt.savefig('2_correlation_heatmap.png')
plt.close()

# Graph 3: KDE Plots for Distribution Overlaps (Report Section 2.1.3)
top_num_features = ['injury_claim', 'days open', 'total_claim', 'vehicle_price']
fig, axes = plt.subplots(2, 2, figsize=(14, 10))
axes = axes.flatten()
for i, feature in enumerate(top_num_features):
    if feature in df.columns:
        sns.kdeplot(data=df, x=feature, hue=target_col, palette=fraud_palette, common_norm=False, fill=True, alpha=0.3, ax=axes[i])
        axes[i].set_title(f'KDE of {feature} by Fraud Status')
plt.tight_layout()
plt.savefig('3_kde_top_features.png')
plt.close()

# Graph 4: Variance and Outlier Analysis Boxplots (Report Section 2.1.4)
box_features = ['safety_rating', 'past_num_of_claims', 'liab_prct', 'total_claim']
fig, axes = plt.subplots(2, 2, figsize=(14, 10))
axes = axes.flatten()
for i, feature in enumerate(box_features):
    if feature in df.columns:
        sns.boxplot(data=df, x=target_col, y=feature, ax=axes[i], palette=fraud_palette)
        axes[i].set_title(f'{feature} by Fraud Status')
plt.tight_layout()
plt.savefig('4_top_features_boxplot.png')
plt.close()

# Graph 5: Distribution of Driver Age (Report Section 2.1.5)
plt.figure(figsize=(8, 6))
sns.histplot(df['age_of_driver'], bins=30, kde=True, color=default_colors[0])
plt.title('Distribution of Driver Age')
plt.xlabel('Age')
plt.ylabel('Frequency')
plt.savefig('5_age_distribution.png')
plt.close()

# Graph 6: Annual Income vs Total Claim (Report Section 2.1.6)
plt.figure(figsize=(10, 8))
sns.scatterplot(x='annual_income', y='total_claim', hue=target_col, alpha=0.6, data=df, palette=fraud_palette)
plt.title('Annual Income vs Total Claim (Colored by Fraud)')
plt.xlabel('Annual Income')
plt.ylabel('Total Claim')
plt.savefig('6_income_vs_claim.png')
plt.close()

print("Successfully generated the 6 graphs referenced in the SDSC6002 report.")