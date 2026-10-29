---
name: Privacy Review
description: Statutory privacy review framework under Statutory Data Privacy (GDPR / UU PDP / CCPA per project profile) — personal data inventory, purpose limitation & minimization, consent governance (user_consents), telemetry zero-PII whitelist, and account erasure cascade completeness (<30s SLA). Use when auditing features touching personal data, analytics, logging, or persistence.
---

# Statutory Privacy Review — ${PROJECT_NAME} (Statutory Data Privacy (GDPR / UU PDP / CCPA per project profile))

Authoritative sources: `docs/qa/PRIVACY_TEST_STRATEGY.md`, `docs/architecture/PRIVACY_ARCHITECTURE.md`, `docs/delivery/PRIVACY_BACKLOG.md`, and the Enterprise Engineering Constitution (§12).

${PROJECT_NAME} processes career data, biographical records, employment histories, contact details, and AI-derived assessments belonging to Indonesian data subjects. Compliance with **Undang-Undang Pelindungan Data Pribadi (Statutory Data Privacy (GDPR / UU PDP / CCPA per project profile))** is a mandatory statutory obligation, not a cosmetic policy.

---

## 1. Statutory Hard Gates — STOP & BLOCK IMMEDIATELY WHEN

1. **Account Erasure Cascade Parity Failure (Hak Penghapusan):** Any user career data, CV sections, ATS diagnostic scores, credit ledgers, or consent logs persisting in database tables after executing `DELETE /api/v1/user/account` ($< 30\text{s}$ SLA) = **SEVERITY S1 STATUTORY VIOLATION**.
2. **Data Minimization Rejection Violation (`BR-${PROJECT_ID}-006`):** Any code path or form accepting national identification numbers (`nik`) or full residential addresses (`alamat_lengkap`) without triggering immediate HTTP 422 rejection = **STATUTORY COMPLIANCE BLOCKER**.
3. **Telemetry & Log PII Leakage:** Emitting user names, email addresses, phone numbers, or raw CV text into application logs or analytics payloads. Telemetry must strictly adhere to the narrow whitelist (`event_id`, `timestamp`, `template_id`, `user_id_hash`) = **SEVERITY S2 PRIVACY DEFECT**.
4. **Non-Sanitized Production Data in Lower Tiers:** Copying raw production customer data into Sandbox (`${DB_NAME}_sit`) or UAT (`${DB_NAME}_uat`) environments without deterministic masking via `npm run sync:uat` = **CRITICAL REGULATORY BREACH**.
5. **Unbundled or Coerced Consent:** Bundling unrelated processing purposes into a single required checkbox or using dark patterns (e.g. pre-ticked consent boxes) = **LEGAL BASIS DEFECT**.

---

## 2. The 6-Step Statutory Inspection Protocol

### Step 1: PII Inventory of the Diff
Perform an exhaustive code sweep of the diff and its dependencies:
- Grep for personal data fields: `email`, `phone`, `telepon`, `alamat`, `nik`, `nama`, `birth_date`, `tanggal_lahir`, `salary`, `gaji`.
- Classify touched data into:
  - *General Personal Data (Data Pribadi Umum):* Name, email, phone, career history.
  - *Specific Personal Data (Data Pribadi Spesifik):* Assessment scores, behavioral data.
  - *Prohibited Data:* `nik` and `alamat_lengkap` (must be rejected per `BR-${PROJECT_ID}-006`).

### Step 2: Purpose Limitation & Data Minimization
- **The Necessity Rule:** Every personal field collected must have an explicit business and service delivery justification.
- **Payload Scoping:** API response payloads must contain only the fields required by the active view. Mask or omit unneeded personal data.

### Step 3: End-to-End Data Flow & Egress Audit
Trace the path of every personal datum:
- **Application Logs:** Structured logging must scrub or hash personal identifiers. Never log passwords, tokens, or raw CV text.
- **Telemetry Whitelist:** Events emitted to internal or external analytics must contain ONLY:
  $$\text{Whitelist} = \{\text{event\_id}, \text{timestamp}, \text{template\_id}, \text{user\_id\_hash}\}$$
  Raw CV text, user names, or phone numbers in telemetry are an automatic S2 finding.
- **Third-Party AI Services:** Forward only minimized, de-identified text snippets to external LLM providers. Never forward personal contact details.

### Step 4: Consent Governance (`user_consents`)
- Ensure sensitive processing actions record an explicit record in `user_consents`.
- Consent must be informed, specific, unbundled, and as easy to revoke as it was to grant.

### Step 5: Account Erasure Cascade Parity (`DELETE /api/v1/user/account`)
Verify that the transactional cascade deletion hard-deletes across all 10 user entities in $< 30\text{s}$:
$$\text{users} \to \text{career\_profiles} \to \text{career\_items} \to \text{cvs} \to \text{cv\_sections} \to \text{ats\_reports} \to \text{job\_matches} \to \text{user\_credits} \to \text{credit\_ledgers} \to \text{user\_consents}$$
Any new table holding user data without cascade inclusion is an automatic S1 defect.

### Step 6: Lower-Tier Sanitization & Retention Hygiene
- Lower-tier synchronization (`npm run sync:uat`) must replace all customer names, emails, and phone numbers with deterministic synthetic masks.
- Backup and logging retention windows must be documented and enforced.

---

## 3. Privacy Finding Classification (S1–S4)

- **`S1` (Critical):** Erasure cascade failure, raw production PII exposed in lower tiers, unauthorized third-party data transmission, collection of prohibited `nik`.
- **`S2` (High):** Telemetry payload containing PII outside whitelist, missing consent record for sensitive processing, excessive data collection without documented purpose.
- **`S3` (Medium):** Missing PII masking on UI displays, ambiguous privacy notice copy, unverified data retention window.
- **`S4` (Low):** Minor privacy documentation inconsistency, non-blocking labeling omission.

---

## Output Contract

STATUS: APPROVED (UU PDP Compliant) / REJECTED (Statutory Violations Found)
- **PII INVENTORY:** List of personal data items touched by the change.
- **FLOW & EGRESS AUDIT:** Status of databases, logs, telemetry, and external providers.
- **PRIVACY FINDINGS:** Ranked list with exact `file:line`, statutory article, impact, and remediation.
- **PROPOSED REGRESSION CHECKS:** Specific `TC-PRIV-NNN` test case specifications.
- **INVARIANT AUDIT:** Parity confirmation for Erasure Cascade, Data Minimization, and Telemetry Whitelist.
