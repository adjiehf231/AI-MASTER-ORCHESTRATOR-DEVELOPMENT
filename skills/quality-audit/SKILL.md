---
name: Quality Audit
description: Comprehensive quality, compliance, and gate audit across the 8 Release Quality Gates — evidence verification, RTM traceability check, zero-hallucination validation, UU PDP compliance audit, and gate certification. Use for auditing pull requests, release candidates, and gate transitions.
---

# Quality & Compliance Audit — ${PROJECT_NAME} (Gate 1–8 Assessment)

Authoritative sources: `docs/qa/RELEASE_QUALITY_GATES.md`, `docs/process/RELEASE_GOVERNANCE.md`, `docs/process/SDLC_STLC_ALIGNMENT.md`, and the ${PROJECT_NAME} Constitution.

The Auditor verifies reality against claims. Verbal assurances, optimistic assumptions, or unexecuted test documentation are grounds for immediate audit rejection.

---

## Phase 1 — Evidence Chain Verification (Forensic Check)

Never accept "all tests pass" without inspecting the raw, unedited execution evidence:

1. **Static Analysis & Build Evidence:**
   - Verify `npm run lint` produced 0 errors and 0 warnings (no anti-developer artifacts suppressed).
   - Verify `npm run typecheck` completed with exit code 0.
   - Verify `npm run build` compiled client/server bundles without unresolved module warnings.
2. **Test Runner Evidence:**
   - Inspect Vitest execution output: total suites, total tests, execution duration, and timestamp.
   - Inspect Playwright E2E report: verify browser engine (Chromium), base URL (http://127.0.0.1:3100), and test artifacts (traces/screenshots on failure).
   - If Flutter code touched: verify `flutter analyze` (0 issues) and `flutter test` execution log.
3. **Evidence Authenticity Rule:** If execution logs lack timestamps, terminal outputs, or real run IDs, mark the check **UNVERIFIED (AUDIT DEFECT)**.

---

## Phase 2 — Requirement Traceability Matrix (RTM) Audit

Verify bidirectional traceability:

$$\text{PRD / SRS} \iff \text{BR-${PROJECT_ID}-NNN} \iff \text{User Story AC} \iff \text{TC-<AREA>-NNN} \iff \text{Test Execution Code}$$

- **Forward Traceability:** Ensure every Given/When/Then AC in the requirement package is traced to at least one formal test case (`TC-*`) with status `EXECUTED: PASSED`.
- **Backward Traceability:** Ensure no extraneous features or undocumented behaviors exist in the code diff without an approved requirement (scope creep detection).
- **Regression Traceability:** For bug fixes, ensure a dedicated test reproduces the original defect and passes against the fix. Missing regression test = **GATE 2 DEFECT**.

---

## Phase 3 — Statutory & Constitutional Compliance Audit

1. **Statutory Data Privacy (GDPR / UU PDP / CCPA per project profile) Privacy Compliance:**
   - Audit diff for forbidden personal data fields (`nik` and `alamat_lengkap` must be rejected with HTTP 422 per BR-${PROJECT_ID}-006).
   - Telemetry event audit: ensure telemetry payloads contain ONLY whitelisted fields (`event_id`, `timestamp`, `template_id`, `user_id_hash`).
   - Erasure cascade parity: verify that new user-data tables are integrated into the hard-delete cascade (`DELETE /api/v1/user/account` completing under `< 30s`).
   - UAT tier sanitization: verify that data in `${DB_NAME}_uat` was synchronized via `npm run sync:uat` with deterministic masking.
2. **AI Factuality & Provenance Invariants:**
   - Verify provenance tags: every career claim must be explicitly tagged as `VERIFIED`, `INFERRED`, or `SUGGESTED`.
   - Verify that `SUGGESTED` or `INFERRED` facts cannot be promoted to `VERIFIED` without active user confirmation.
   - Verify Gate 6 Factuality Benchmark: 100% zero-hallucination score on golden eval test sets.
3. **Zero-Cost-First Principle:**
   - Audit dependencies for paid API packages, proprietary SDKs, or external SaaS dependencies.
   - Confirm that external integrations utilize local/mock abstractions (`AI_PROVIDER=mock`, MailHog on `:1025/:8025`).

---

## Phase 4 — Database & Environment Promotion Audit

1. **Migration Safety & Parity:**
   - Review DDL scripts in `drizzle/` for unapproved destructive statements (`DROP TABLE`, `DROP COLUMN`, `ALTER COLUMN TYPE` without expand/contract staging).
   - Verify migration version consistency: `npm run db:verify` executed against target tier with parity matching the 12 canonical migrations baseline.
   - Verify that push scripts (`db:push`) were NOT executed against shared tiers (`scripts/guard-db-push.ts` enforcement).
2. **Rollback Verification:**
   - Confirm documented down-migration scripts or container rollback commands are present and valid.

---

## Phase 5 — Gate Sign-Off Assessment & Audit Reporting

Score the target against the applicable gate (Gate 1 through Gate 8):

| Gate | Focus | Primary Required Evidence | Verdict (Pass/Fail) |
|---|---|---|---|
| **Gate 1 (DoR)** | Requirements | Testable ACs, BR-${PROJECT_ID}-* IDs, Zod schemas, zero OPEN_QUESTIONS | |
| **Gate 2 (DoD)** | Implementation | 0 lint/typecheck, unit/integration test execution, code review | |
| **Gate 3 (Alpha)**| Core Flows | Identity, Master Profile, 3-pane CV builder pass in Dev | |
| **Gate 4 (Beta)** | SIT Sandbox | ATS engine & Matcher pass in `${DB_NAME}_sit` with synthetic seeds | |
| **Gate 5 (UAT)** | UAT Business | Sanitized prod mirror in `${DB_NAME}_uat`, PO sign-off artifact | |
| **Gate 6 (Hardening)**| Security/AI | 0 open S1/S2, 100% factuality benchmark, IDOR matrix clean | |
| **Gate 7 (RC)** | Candidate | CI golden path E2E pass, migration parity, rollback verified | |
| **Gate 8 (Prod)** | Operations | Zero-downtime deploy, smoke <30s, canary active, Exec sign-off | |

### Output Contract: Formal Audit Certificate

```markdown
### QUALITY AUDIT CERTIFICATE
- **TARGET:** [PR # / Feature / Release Candidate Version]
- **AUDITED BY:** Quality & Compliance Auditor
- **AUDIT VERDICT:** [APPROVED / CONDITIONAL / REJECTED]

#### 1. Evidence Verification Checklist
- Lint & Typecheck: [VERIFIED: 0 errors | FAILED]
- Test Execution: [VERIFIED: N passed in X.Xs | FAILED]
- Coverage: [VERIFIED: XX.X% via npm run test:coverage | FAILED]
- Security & Privacy: [VERIFIED: 0 open S1/S2, UU PDP clean | FAILED]
- Migration Parity: [VERIFIED: 12 canonical migrations baseline | FAILED]

#### 2. Audit Findings & Non-Compliances
- [ID] [Severity S1-S4] [Location] [Description & Required Remediation]

#### 3. Formal Recommendation
[Explicit statement approving gate transition or ordering blocking remediation]
```
