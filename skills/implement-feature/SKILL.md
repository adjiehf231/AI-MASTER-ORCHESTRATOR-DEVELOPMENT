---
name: Implement Feature
description: Master engineering workflow for implementing ${PROJECT_NAME} vertical slices to Gate 2 (DoD) and beyond — context loading, codebase discovery, formal planning, boundary validation, the 6-step verification ladder, independent review triggers, and memory updates. Use when building or changing features, bug fixes, or refactors.
---

# Feature Implementation & Vertical Slice Engineering — ${PROJECT_NAME}

Authoritative sources: `docs/process/DEVELOP_FEATURE.md`, `docs/qa/RELEASE_QUALITY_GATES.md` (Gate 2: Story DoD), and the Enterprise Engineering Constitution (§1–§20).

Feature delivery is not complete merely because code compiles. Implementation is complete when all acceptance criteria are satisfied, statutory invariants are preserved, the 6-step verification ladder passes with executed evidence, independent reviews are cleared, and project memory is synchronized.

---

## Phase 1 — Context & Memory Load (Skip at Your Peril)

Never start coding with stale memory or unverified assumptions:
1. **Load Project State:** Read `docs/memory/PROJECT_STATE.md`, `DECISIONS.md`, `OPEN_QUESTIONS.md`, `RISKS.md`, and `KNOWN_ISSUES.md`.
2. **Memory Contradiction Rule:** If current instructions contradict recorded project decisions, **HALT** implementation. Log the contradiction in `OPEN_QUESTIONS.md` and seek clarification. Never proceed on ambiguous assumptions.

---

## Phase 2 — Requirement Intake & Gate 1 (DoR) Audit

Demand an approved requirement package satisfying Gate 1:
- Acceptance criteria must be formatted as testable Given/When/Then Gherkin scenarios.
- Business rules must carry immutable `BR-${PROJECT_ID}-NNN` identifiers.
- Data minimization must be justified (rejection of NIK and full residential address per `BR-${PROJECT_ID}-006`).
- Classify all requirement statements as **FACT**, **DECISION**, **ASSUMPTION**, or **UNKNOWN**.

---

## Phase 3 — Codebase Discovery (Inspect Before Editing)

Map the blast radius before modifying any file:
1. **Module & Entity Map:** Locate affected business capability in `src/modules/<module>/` and its database models in `drizzle/schema/`.
2. **Presentation Surfaces:** Locate consuming views in `src/domains/<domain>/` and shared UI primitives in `src/components/`.
3. **Next.js 16 Documentation:** If writing framework code, inspect the official documentation in `node_modules/next/dist/docs/`.
4. **Existing Patterns:** Identify existing implementations of similar functionality (e.g. transactional wrappers, Zod validation, error envelopes) to ensure consistency.

---

## Phase 4 — Formal Implementation Plan

Write down a concise, actionable plan before touching code:
- **Files Affected:** Enumerate files to create or modify with specific rationales.
- **Contract Boundary:** Zod request schema $\to$ API response type $\to$ UI component model.
- **Database Staging:** Expand/contract steps, backfill requirements, rollback runbook.
- **Statutory Invariants:** Provenance preservation, Account Erasure cascade integration, Credit Ledger atomicity.
- **Test Strategy:** Specific `TC-*` test cases to colocate in `src/**/*.test.ts` and E2E journeys in `tests/e2e/`.

---

## Phase 5 — Implementation Discipline (Constitution §7–§12)

1. **Smallest Coherent Change:** Implement exactly what the acceptance criteria require. Never smuggle unrelated refactors or speculative features into a feature branch.
2. **Zero-Cost-First Principle:** External dependencies must sit behind interface abstractions with default local/mock adapters (`AI_PROVIDER=mock`, MailHog `:1025`).
3. **Strict Boundary Validation:** Parse and validate all external inputs using Zod with `.strict()`. Never use `any` escapes.
4. **Server-Side Security:** Verify server-side ownership/tenancy on 100% of entity IDs (IDOR elimination).
5. **Account Erasure Parity:** Any new table storing user career or personal data must join the transactional hard-deletion cascade (`DELETE /api/v1/user/account` completing in $< 30\text{s}$).

---

## Phase 6 — The Tiered Verification Ladder (Run & Capture Evidence)

Execute every tier in exact fail-fast order. A failure at any tier triggers autonomous self-healing:

```bash
# Tier 0: Static Hygiene & Type Safety (<5s)
npm run lint         # 0 ESLint errors, 0 warnings
npm run typecheck    # 0 TypeScript compiler errors

# Tier 1: Fast-Path T1 Air-Gapped Zero-DB Unit Verification (<10s) ⚡
node scripts/qa-unit-offline.cjs
# (OR: npx vitest run --config vitest.unit-no-db.config.ts)

# Tier 2: Colocated Unit & Integration Tests (PostgreSQL test database)
npm test -- <path_to_colocated_test>

# Tier 3: User-Facing E2E Journeys with Accessibility Audit
npm run test:e2e

# Tier 4: Database Migration Baseline Parity (if schema touched)
npm run db:verify

# Tier 5: Core Web Vitals Audit (if performance-sensitive UI touched)
npm run perf:lighthouse
```

---

## Phase 7 — Mandatory Independent Review Triggers (Constitution §15)

Trigger specialized subagent reviews based on change surface:
- **`code-reviewer`:** Required when $> 1$ module is touched, for bug fixes, or significant refactoring.
- **`security-engineer`:** Required when touching authentication, session tokens, billing/credits, file uploads, AI factuality, or public endpoints.
- **`privacy-reviewer`:** Required when adding new personal data fields, telemetry events, or external data flows.
- **`integration-engineer`:** Required when touching external webhooks, third-party APIs, or OAuth 2.0 flows.
- **Resolution:** All 🔴 BLOCKING findings must be resolved and verified before reporting completion.

---

## Phase 8 — Documentation & Living Memory Synchronization

Update all artifacts invalidated by the change per the 15 Mandatory Documents Checklist:
1. **API Contracts:** Update route specifications in `docs/api/`.
2. **Data Models:** Update entity descriptions in `docs/data/DATA_DICTIONARY.md`.
3. **Architecture Decisions:** Author ADR in `docs/architecture/` if module boundaries, persistent storage shapes, or dependencies were altered.
4. **Project Memory & Debt:**
   - Record confirmed decisions in `docs/memory/DECISIONS.md`.
   - Update current development status in `docs/memory/PROJECT_STATE.md`.
   - Update unresolved blockers in `docs/memory/OPEN_QUESTIONS.md`.
   - Codify newly discovered heuristics into `docs/memory/HEURISTICS.md`.
   - Log any deferred technical tasks into `docs/memory/TECHNICAL_DEBT.md`.
   - Update `docs/memory/SESSION_HANDOFF.md` for seamless session transitions.

---

## Phase 9 — Delivery Report (Constitution §20)

Every completed feature must conclude with a standardized report:

```markdown
### FEATURE IMPLEMENTATION DELIVERY REPORT
- **FEATURE:** [Name & ID]
- **STATUS:** [DONE / PARTIAL / BLOCKED]

#### 1. Changes Implemented
- [Detailed summary of architectural and code changes]

#### 2. Affected Files
- [List of created, modified, or deleted files with paths]

#### 3. Contract & Schema Modifications
- API Changes: [Zod schemas added or modified]
- Database Changes: [DDL summary and migration file paths]

#### 4. Executed Verification Evidence
- `npm run lint`: [0 errors, 0 warnings]
- `npm run typecheck`: [0 compiler errors]
- `npm test`: [N passed in X.Xs]
- `npm run test:e2e`: [Passed on Chromium, Axe 0 violations]
- `npm run db:verify`: [Migration parity verified]

#### 5. Independent Review Audit
- Reviewer: [code-reviewer / security-engineer / privacy-reviewer]
- Status: [APPROVED / 0 Open Blocking Findings]

#### 6. Known Limitations, Risks & Next Actions
- Risks: [Residual risks or operational notes]
- Next Action: [Handoff to QA or Release Manager]
```
