---
name: ml-experimentation-lifecycle
description: "Enterprise machine learning experimentation and modeling playbook — statistical learning pipelines, zero-leakage cross-validation, baseline benchmarking, hyperparameter tuning, and model diagnostic auditing."
---

# Enterprise Machine Learning Experimentation Playbook — ${PROJECT_NAME}

Authoritative sources: CRISP-DM Standard, scikit-learn Architecture Guidelines, MLflow Model Governance, and the Enterprise Engineering Constitution (§1–§20).

This playbook defines the standardized operational methodology for executing reproducible, leakage-free machine learning experiments, statistical modeling pipelines, and model evaluation audits across ${PROJECT_NAME}.

---

## 1. Statutory Scientific Principles & Hard Gates

1. **Zero-Leakage Invariant:** Data preprocessing (imputation, scaling, encoding, feature selection) must strictly be fitted solely on the training partition. Holdout test sets must only ever be transformed using pre-fitted transformers.
2. **Mandatory Baseline Gate:** Every machine learning model must be evaluated against a deterministic naive baseline (majority class or median/mean regressor) and a simple linear/logistic model before advancing.
3. **Reproducibility Invariant:** All experiments must use fixed random seeds, version-controlled feature schemas, and serializable pipeline specifications.

---

## 2. The 6-Stage Machine Learning Lifecycle

```
[01 Problem Formulation] ──► [02 Data Partitioning & Leakage Guard]
                                                │
                                                ▼
[04 Validation & Tuning] ◄── [03 Feature Engineering Pipeline]
           │
           ▼
[05 Diagnostic Auditing] ──► [06 Model Serialization & Packaging]
```

### Stage 1: Problem Formulation & Metric Strategy
- Define the learning paradigm: Supervised (Binary/Multiclass Classification, Regression), Unsupervised (Clustering, Dimensionality Reduction), or Ranking.
- Align evaluation metrics with business loss functions:
  - Imbalanced Classification: Precision, Recall, F1-Score, PR-AUC, Matthews Correlation Coefficient (MCC).
  - Regression: Root Mean Squared Error (RMSE), Mean Absolute Error (MAE), $R^2$, Mean Absolute Percentage Error (MAPE).
  - Ranking: Normalized Discounted Cumulative Gain (NDCG@K), Mean Reciprocal Rank (MRR).

### Stage 2: Data Partitioning & Leakage Guard
- Separate data before any preprocessing occurs:
  - **Stratified Partition:** For classification with class imbalance.
  - **Temporal Partition (`TimeSeriesSplit`):** For data with temporal ordering; past data trains, future data validates.
  - **Grouped Partition (`GroupKFold`):** For clustered data where group entities must not overlap across splits.

### Stage 3: Feature Engineering Pipeline Construction
- Bundle all feature transformation logic inside declarative pipelines (e.g. `Pipeline` or `ColumnTransformer`):
  ```python
  from sklearn.compose import ColumnTransformer
  from sklearn.impute import SimpleImputer
  from sklearn.pipeline import Pipeline
  from sklearn.preprocessing import OneHotEncoder, StandardScaler

  numeric_transformer = Pipeline(
      steps=[
          ("imputer", SimpleImputer(strategy="median")),
          ("scaler", StandardScaler()),
      ]
  )

  categorical_transformer = Pipeline(
      steps=[
          (
              "imputer",
              SimpleImputer(strategy="constant", fill_value="missing"),
          ),
          ("onehot", OneHotEncoder(handle_unknown="ignore")),
      ]
  )

  preprocessor = ColumnTransformer(
      transformers=[
          ("num", numeric_transformer, numeric_features),
          ("cat", categorical_transformer, categorical_features),
      ]
  )
```

### Stage 4: Cross-Validation & Hyperparameter Tuning
- Apply repeated k-fold validation or nested cross-validation to tune hyperparameters without overfitting the validation split:
  $$\text{Expected Performance} = \frac{1}{K} \sum_{k=1}^{K} \text{Metric}(\text{Fold}_k)$$
- Track standard deviation across folds ($\sigma$) to verify model stability. If $\sigma > 0.05$, investigate sample variance or split instability.

### Stage 5: Diagnostic Auditing & Interpretability
- **Residual Analysis (Regression):** Plot residuals against predicted values to check for heteroscedasticity or systematic non-linear error.
- **Confusion Matrix & Cost Matrix (Classification):** Quantify concrete business costs of False Positives vs False Negatives.
- **Explainability:** Compute permutation feature importances or TreeSHAP values to verify that predictions align with domain logic and do not exploit spurious correlations.

### Stage 6: Model Packaging & Production Readiness
- Serialize trained pipelines in deterministic formats (ONNX, joblib, or MLflow model artifacts).
- Document inference latency budgets ($<50\text{ms}$ batch) and memory requirements.
- Define baseline data distribution profiles for subsequent production data drift monitoring.

