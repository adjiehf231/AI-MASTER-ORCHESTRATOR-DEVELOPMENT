---
name: exploratory-data-analysis
description: "Enterprise exploratory data analysis (EDA) and business intelligence playbook — dataset profiling, distribution diagnostics, anomaly detection, SQL verification, and executive-grade data synthesis."
---

# Enterprise Exploratory Data Analysis & BI Playbook — ${PROJECT_NAME}

Authoritative sources: DAMA-DMBOK v2, Kimball Dimensional Modeling Techniques, Tukey Exploratory Data Analysis, and the Enterprise Engineering Constitution (§1–§20).

This playbook defines the standardized operational methodology for conducting systematic Exploratory Data Analysis (EDA), verifying SQL analytics, diagnosing data anomalies, and delivering decision-grade business intelligence across all ${PROJECT_NAME} data repositories.

---

## 1. Statutory Governance Principles

1. **Read-Only Invariant:** EDA operations must execute under read-only database connections or against analytical replicas. State-mutating commands (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `TRUNCATE`) are strictly prohibited.
2. **Statutory Privacy Invariant:** Never query or surface unmasked Personally Identifiable Information (PII). All sensitive personal fields must be masked, pseudonymized via HMAC, or aggregated.
3. **Reproducibility Guarantee:** All findings must include the exact SQL queries, parameters, date windows, and schema versions used to generate them.

---

## 2. The 5-Step Systematic EDA Framework

```
[01 Schema & Volume Profiling] ──► [02 Data Integrity & Null Audit]
                                                 │
                                                 ▼
[05 Synthesis & Decision Deck] ◄── [04 Segmentation & Cohorts] ◄── [03 Statistical Distribution & Outliers]
```

### Step 1: Schema & Volume Profiling
- **Table Topology:** Inspect column data types, primary keys, foreign keys, partition keys, and index configurations in `${DB_NAME}`.
- **Row Volume & Growth:** Determine table cardinality and daily event velocity to size query execution budgets safely.
- **Time Grain & Window:** Identify timestamp fields (creation time vs update time vs event occurrence time) and ensure UTC normalization.

### Step 2: Data Integrity & Null Audit
- **Nullability Analysis:** Calculate null counts and null percentages across all primary dimensions:
  ```sql
  SELECT
    COUNT(*) AS total_rows,
    COUNT(column_a) AS non_null_count,
    ROUND(100.0 * (1.0 - COUNT(column_a)::numeric / COUNT(*)), 2) AS null_pct
  FROM target_table;
  ```
- **Uniqueness & Cardinality:** Check distinct counts (`COUNT(DISTINCT column)`) to detect unexpected duplication or foreign key integrity breaks.

### Step 3: Statistical Distribution & Outliers
- **Central Tendency & Dispersion:** Compute five-number summaries (minimum, 25th percentile, median, 75th percentile, maximum) alongside mean and standard deviation.
- **Outlier Detection:** Apply the Interquartile Range (IQR) rule:
  $$\text{IQR} = Q_3 - Q_1$$
  $$\text{Outlier Range} = [Q_1 - 1.5 \times \text{IQR},\; Q_3 + 1.5 \times \text{IQR}]$$
- Evaluate whether outliers represent legitimate extreme behavior (power users, high-value transactions) or data pipeline corruption.

### Step 4: Segmentation & Cohort Analysis
- **Cohort Grouping:** Group records by natural acquisition windows (e.g. signup week/month) to track performance longitudinally.
- **Funnel Progression:** Measure drop-off rates between adjacent stages in key business processes:
  $$\text{Step Conversion Rate} = \frac{\text{Users at Stage } N}{\text{Users at Stage } N - 1} \times 100\%$$
- **Cross-Dimensional Slicing:** Dissect metrics across tenant tier, client platform, and geographic regions.

### Step 5: Synthesis & Decision-Grade Reporting
- Structure takeaways into actionable findings rather than raw data dumps.
- Highlight counter-intuitive trends, potential risks, and high-impact growth opportunities.

---

## 3. High-Performance SQL Optimization Rules

When writing analytical queries against operational or warehouse databases:
- **Rule 1 — No `SELECT *`:** Only project the explicit columns required for the analysis.
- **Rule 2 — Predicate Pushdown:** Apply `WHERE` filters inside Common Table Expressions (CTEs) before joins are computed.
- **Rule 3 — Divide-by-Zero Defense:** Always wrap denominators with `NULLIF(denominator, 0)` to guarantee fail-safe computation.
- **Rule 4 — EXPLAIN Validation:** On large datasets, run `EXPLAIN` to ensure queries utilize indexes and avoid costly sequential table scans.

