---
name: privacy-review
description: Statutory privacy review framework under Statutory Data Privacy (GDPR / UU PDP / CCPA per project profile) — personal data inventory, purpose limitation & minimization, consent governance (user_consents), telemetry zero-PII whitelist, and account erasure cascade completeness (project-defined SLA). Use when auditing features touching personal data, analytics, logging, or persistence.
---

# Statutory Privacy Review — AI Master Orchestrator Development (Statutory Data Privacy (GDPR / UU PDP / CCPA per project profile))

Repository references: `docs/qa/RELEASE_QUALITY_GATES.md`, `skills/security-review/SKILL.md`.

Target-project evidence: the current data inventory, privacy architecture, retention and erasure policies, and applicable jurisdiction.

Identify the personal data processed by AI Master Orchestrator Development, the affected people, and the governing jurisdiction. Use the project's approved policies and applicable obligations to determine requirements.

---

## 1. Statutory Hard Gates — STOP & BLOCK IMMEDIATELY WHEN

1. **Account Erasure Cascade Parity Failure (Right to erasure):** In-scope personal data persisting after the project's approved erasure deadline without a documented lawful retention exception = **SEVERITY S1 STATUTORY VIOLATION**.
2. **Data Minimization Violation:** Collecting high-risk identifiers or addresses without a documented purpose, legal basis, and appropriate safeguards = **STATUTORY COMPLIANCE BLOCKER**.
3. **Telemetry & Log PII Leakage:** Emitting user names, email addresses, phone numbers, or raw document/input text into application logs or analytics payloads. Telemetry must use an approved minimal event schema = **SEVERITY S2 PRIVACY DEFECT**.
4. **Non-Sanitized Production Data in Lower Tiers:** Copying raw production customer data into Sandbox (`orchestrator_db_sit`) or UAT (`orchestrator_db_uat`) environments without deterministic masking via `npm run sync:uat` = **CRITICAL REGULATORY BREACH**.
5. **Unbundled or Coerced Consent:** Bundling unrelated processing purposes into a single required checkbox or using dark patterns (e.g. pre-ticked consent boxes) = **LEGAL BASIS DEFECT**.

---

## 2. The 6-Step Statutory Inspection Protocol

### Step 1: PII Inventory of the Diff
Perform an exhaustive code sweep of the diff and its dependencies:
- Grep for personal data fields: `email`, `phone`, `telepon`, `alamat`, `nik`, `nama`, `birth_date`, `tanggal_lahir`, `salary`, `gaji`.
- Classify touched data into:
  - *General Personal Data (Data Pribadi Umum):* Name, email, phone, user history.
  - *Specific Personal Data (Data Pribadi Spesifik):* Assessment scores, behavioral data.
  - *Prohibited Data:* fields explicitly prohibited by the project's approved data policy.

### Step 2: Purpose Limitation & Data Minimization
- **The Necessity Rule:** Every personal field collected must have an explicit business and service delivery justification.
- **Payload Scoping:** API response payloads must contain only the fields required by the active view. Mask or omit unneeded personal data.

### Step 3: End-to-End Data Flow & Egress Audit
Trace the path of every personal datum:
- **Application Logs:** Structured logging must scrub or hash personal identifiers. Never log passwords, tokens, or raw document/input text.
- **Telemetry Whitelist:** Only include fields in the project's approved minimal telemetry schema.
  Raw document text, user names, or phone numbers in telemetry are an automatic S2 finding.
- **Third-Party AI Services:** Forward only minimized, de-identified text snippets to external LLM providers. Never forward personal contact details.

### Step 4: Consent Governance
- Where consent is the lawful basis, verify consent records, withdrawal behavior, and enforcement for the approved purpose.
- Consent must be informed, specific, unbundled, and as easy to revoke as it was to grant.

### Step 5: Account Erasure Cascade Parity
Verify erasure across the data inventory, including applicable replicas, queues, derived stores, indexes, and external processors. Record the approved SLA and any lawful retention exceptions.
Any new table holding user data without cascade inclusion is an automatic S1 defect.

### Step 6: Lower-Tier Sanitization & Retention Hygiene
- When preparing lower-tier data, use synthetic fixtures or an approved sanitization pipeline and verify its privacy controls.
- Backup and logging retention windows must be documented and enforced.

---

## 3. Privacy Finding Classification (S1–S4)

- **`S1` (Critical):** Erasure cascade failure, raw production PII exposed in lower tiers, unauthorized third-party data transmission, collection of a prohibited field.
- **`S2` (High):** Telemetry payload containing PII outside whitelist, missing consent record for sensitive processing, excessive data collection without documented purpose.
- **`S3` (Medium):** Missing PII masking on UI displays, ambiguous privacy notice copy, unverified data retention window.
- **`S4` (Low):** Minor privacy documentation inconsistency, non-blocking labeling omission.

---

## Output Contract

STATUS: APPROVED (Applicable controls verified) / REJECTED (Statutory Violations Found)
- **PII INVENTORY:** List of personal data items touched by the change.
- **FLOW & EGRESS AUDIT:** Status of databases, logs, telemetry, and external providers.
- **PRIVACY FINDINGS:** Ranked list with exact `file:line`, statutory article, impact, and remediation.
- **PROPOSED REGRESSION CHECKS:** Specific `TC-PRIV-NNN` test case specifications.
- **INVARIANT AUDIT:** Parity confirmation for Erasure Cascade, Data Minimization, and Telemetry Whitelist.
