---
name: Security Review
description: Adversarial application security review framework to Gate 6 standards (zero open S1/S2 vulnerabilities) — IDOR penetration checklists, session security, credit concurrency integrity, prompt injection defense, secrets hygiene, and UU PDP privacy. Use when auditing code changes touching auth, payments, uploads, AI, or public routes.
---

# Adversarial Security Review — ${PROJECT_NAME} (Gate 6 Standard)

Authoritative sources: `docs/qa/SECURITY_TEST_STRATEGY.md`, `docs/security/`, `docs/qa/RELEASE_QUALITY_GATES.md` (Gate 6), and `docs/qa/DEFECT_MANAGEMENT.md`.

Security is an integral implementation constraint, not a pre-release afterthought. Review posture: **The diff is guilty until proven secure by concrete evidence**. A single unmitigated S1 or S2 vulnerability blocks the release candidate from passing Gate 6.

---

## 1. Statutory Hard Gates — STOP & BLOCK IMMEDIATELY WHEN

1. **Broken Object-Level Authorization (IDOR):** Any route receiving an entity ID in path, query, or body without server-side tenancy verification (`entity.userId === session.userId` or verified admin role) = **SEVERITY S1 CRITICAL SECURITY BLOCKER**.
2. **Credit Concurrency Race Condition:** Deducting credits or updating user balances without wrapping the check, debit, and ledger append in an atomic transaction with pessimistic row locking (`SELECT ... FOR UPDATE`) = **SEVERITY S1 FINANCIAL INTEGRITY DEFECT**.
3. **Hardcoded Secrets in Source / Commits:** Committing API keys, private keys, session secrets, or passwords into Git history or serializing them into client bundles = **CRITICAL SECURITY LEAK**.
4. **Prompt Injection Executing as System Instruction:** Allowing user-supplied CV text, portfolio URLs, or job descriptions to escape boundary tags and override system prompts = **SEVERITY S1 AI INJECTION DEFECT**.
5. **Account Erasure Cascade Bypass (Statutory Data Privacy (GDPR / UU PDP / CCPA per project profile)):** Any user career data persisting in database tables after executing `DELETE /api/v1/user/account` ($< 30\text{s}$ SLA) = **STATUTORY COMPLIANCE VIOLATION**.

---

## 2. The 8-Domain Adversarial Inspection Checklist

### 2.1 Authorization & IDOR (The S1 Factory)
- [ ] Server-side ownership verification executes **BEFORE** any data is fetched, updated, or deleted.
- [ ] Jobseekers cannot access recruiter-owned applicant records and vice versa.
- [ ] Admin endpoints are gated by verified administrative role checks in server code (never frontend visibility).
- [ ] Write-side operations (`PUT`, `PATCH`, `DELETE`) are guarded with the exact same rigor as read operations (`GET`).
- [ ] The Existence Oracle Defense: Unauthorized resource access returns `404 Not Found` rather than `403 Forbidden` to prevent foreign resource enumeration.
- [ ] Bulk operations loop through individual authorization checks per entity, avoiding bulk authorization bypasses.

### 2.2 Authentication & Session Hygiene
- [ ] Passwords hashed using Argon2id (`@node-rs/argon2`) with OWASP-compliant parameters.
- [ ] Session tokens generated with 256-bit cryptographically secure pseudorandom entropy.
- [ ] Session cookies configured with `HttpOnly; Secure; SameSite=Strict`.
- [ ] Session tokens invalidated in database immediately upon logout or password reset.
- [ ] Multi-Factor Authentication (MFA) paths cannot be bypassed by direct calls to downstream APIs.
- [ ] Destructive account actions (e.g. account deletion) require explicit password re-authentication.

### 2.3 Financial & Credit Ledger Concurrency
- [ ] Credit deduction and ledger append execute in a single atomic database transaction.
- [ ] Concurrency-safe row locking: `SELECT ... FOR UPDATE` applied to user credit records.
- [ ] Database-level check constraint: `CHECK balance >= 0`.
- [ ] Idempotency keys enforced on payment and credit mutation endpoints to prevent duplicate charges.

### 2.4 Generative AI Security & Injection Defense
- [ ] User-supplied CV text wrapped in `<untrusted_user_career_data>` delimiters and treated as passive data.
- [ ] System prompts explicitly forbid the model from executing instructions embedded in user data.
- [ ] Cross-user prompt isolation: Zero shared conversational state between different candidate sessions.
- [ ] Provenance Invariant: Generative recommendations tagged `SUGGESTED`; user confirmation required for promotion to `VERIFIED`.

### 2.5 Injection Vulnerabilities (OWASP Top 10)
- [ ] SQL Injection: Drizzle ORM parameterized queries exclusively. Zero raw SQL string concatenation.
- [ ] Command Injection: Zero user-influenced strings passed to system shell commands.
- [ ] Path Traversal: File upload and PDF export filenames sanitized; traversal characters (`../`) blocked.
- [ ] SSRF (Server-Side Request Forgery): Outbound URL requests restricted to approved domains; internal private network ranges (`127.0.0.1`, `10.0.0.0/8`, `169.254.169.254`) blocked.

### 2.6 Cross-Site Scripting (XSS) & Content Security
- [ ] Zero usage of `dangerouslySetInnerHTML` containing user-supplied, scraped, or AI-generated content.
- [ ] React JSX dynamic attribute escaping verified intact.
- [ ] Strict Content Security Policy (CSP) headers configured in Next.js production headers.

### 2.7 Privacy & Data Minimization (Statutory Data Privacy (GDPR / UU PDP / CCPA per project profile))
- [ ] Rejection of national identification numbers (`nik`) and full addresses (`alamat_lengkap`) with HTTP 422 per `BR-${PROJECT_ID}-006`.
- [ ] Telemetry whitelist enforced: Analytics events contain ONLY `event_id`, `timestamp`, `template_id`, and `user_id_hash`. Raw CV text or PII in analytics is an S2 defect.

### 2.8 Secrets & Environment Hygiene
- [ ] Gitleaks scanner (`.gitleaks.toml`) executed clean on active diff.
- [ ] `.env*` files untracked in `.gitignore`.
- [ ] CI placeholder secrets (`SESSION_SECRET`) never copied into real operational tiers.
- [ ] Error responses return uniform error envelopes with zero stack traces or internal hostnames leaked.

---

## 3. Vulnerability Classification Standard (S1–S4)

Map all security findings to `docs/qa/DEFECT_MANAGEMENT.md`:
- **`S1` (Critical):** Remote code execution, SQL injection, cross-user IDOR access, credit double-spend race condition, persisted hallucinated career facts, account erasure failure.
- **`S2` (High):** Stored XSS, SSRF to internal network, PII leakage into logs/telemetry, authentication brute-force vulnerability, unhandled PDF export crash.
- **`S3` (Medium):** Missing rate limiting on non-sensitive endpoints, descriptive server error disclosures, minor CSRF misconfigurations.
- **`S4` (Low):** Missing security headers, verbose server banner disclosure, minor information leakage.

---

## Output Contract

STATUS: APPROVED (Zero S1/S2 Vulnerabilities) / REJECTED (Vulnerabilities Found)
- **AUDITED ARTIFACTS:** Routes, database queries, and third-party integrations audited.
- **VULNERABILITY FINDINGS:** Ranked list with exact `file:line`, exploit scenario, impact, and concrete remediation.
- **PROPOSED REGRESSION CHECKS:** Specific `TC-SEC-NNN` test case specifications.
- **GATE 6 EVALUATION:** Pass/Fail readiness for Release Quality Gate 6.
