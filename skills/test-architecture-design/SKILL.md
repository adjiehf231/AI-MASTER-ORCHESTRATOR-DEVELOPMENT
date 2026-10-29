---
name: Test Architecture Design
description: Architecting and governing ${PROJECT_NAME} STLC test systems — test pyramid distribution, test double design (MockAIProvider, MailHog), synthetic data pipelines, contract testing, flakiness eradication, and mutation testing. Use when designing test suites, harnesses, or refactoring test architecture.
---

# Test Architecture Design — ${PROJECT_NAME} (STLC Engineering)

Authoritative sources: `docs/qa/TEST_ARCHITECTURE.md`, `docs/qa/TEST_PYRAMID.md`, `docs/qa/QA_MASTER_STRATEGY.md`, and `docs/qa/TEST_DATA_STRATEGY.md`.

Test architecture ensures that test suites run deterministically, fast, and maintainably without test pyramid inversion or flaky failures.

---

## 1. Test Pyramid Distribution & Layer Allocation

Maintain strict allocation across the testing pyramid:

```
        / \
       /   \     E2E UI (~10%) - Critical user journeys (Playwright Chromium)
      / ----\
     /       \   API & Integration (~20%) - Endpoints, DB repos, authz (Vitest + Postgres)
    / --------\
   /           \ Unit & Domain (~70%) - Business rules, ATS parser, Zod validations (Vitest)
  /_____________\
```

- **Unit Layer (Fast, In-Memory):** Test pure business logic, ATS scoring algorithms, date formatting, and input parsing. Execution speed target: `< 10ms` per unit test.
- **Integration Layer (Isolated Database):** Test Drizzle repository queries, transaction rollback behavior, and multi-service orchestration against Docker Postgres 16 (`${DB_NAME}_test`). Execution speed target: `< 100ms` per integration test.
- **API & Contract Layer:** Test route handlers for HTTP error envelopes, Zod request/response validation, role-based authz, and IDOR prevention.
- **E2E Layer (Golden Path Only):** Reserve Playwright browser automation strictly for top 5 critical user journeys (Identity login, 3-pane CV Builder, ATS Diagnostic report generation, Job Matcher, and Account Deletion cascade).

---

## 2. Test Double Architecture (Zero-Cost-First)

Design test doubles that eliminate flaky external network dependencies:

1. **AI Provider Abstraction (`MockAIProvider`):**
   - Default for CI and local development: `AI_PROVIDER=mock`.
   - Seeded with deterministic golden responses returning valid JSON matching the Zod response schema.
   - Preserves provenance tags (`VERIFIED`, `INFERRED`, `SUGGESTED`) deterministically.
2. **Email System (`MailHog`):**
   - SMTP on port `1025`, HTTP API on port `8025`.
   - E2E tests query `http://localhost:8025/api/v2/messages` to verify OTP tokens and transactional email content without real SMTP delivery.
3. **Database Test Harness (`tests/setup-test-db.ts`):**
   - Single-fork Vitest runner to avoid connection pool exhaustion.
   - Isolated transaction wrapper or database truncate between test suites.

---

## 3. Test Data Management & Synthetic Fixtures

Per Statutory Data Privacy (GDPR / UU PDP / CCPA per project profile), real customer data is strictly prohibited in testing environments.

1. **Synthetic Persona Generators (`scripts/seed-sit.ts`):**
   - Standardized test personas: Fresh Graduate, Mid-Career Software Engineer, Executive Recruiter, Super Admin.
   - Realistic Indonesian names, synthetic education institutions, and mock employment histories.
2. **Deterministic State Resetting:**
   - Every integration test suite must establish its own preconditions and clean up residual entities.
   - Never rely on the execution order of other test suites.

---

## 4. Contract & Schema Drift Prevention

Prevent frontend-backend disconnects through automated contract tests:

- **Type Alignment:** Export Zod inferred types (`z.infer<typeof schema>`) from backend schemas and consume them in frontend components.
- **Schema Test Suite:** Test that mock API responses strictly validate against current Zod schemas. Any unmapped or extraneous field is flagged as a schema drift defect.

---

## 5. Flakiness Eradication & Determinism Protocol

Flaky tests undermine trust in the entire CI/CD pipeline. Enforce these zero-flakiness rules:

1. **Zero Sleep Calls:** Never use `setTimeout()` or `sleep()` in tests. Use explicit condition waiters (e.g. `await page.waitForSelector()`, `await vi.waitFor()`).
2. **Deterministic Clocks:** Mock timers and system time using `vi.useFakeTimers()` when testing expiration, session timeouts, or token TTLs.
3. **Async Race Elimination:** Await all promises. Unawaited asynchronous operations leaking across test boundaries cause unhandled rejection crashes.
4. **Mutation Testing:** Periodically evaluate test sensitivity by intentionally altering logic (e.g. flipping boolean conditions, changing `<` to `<=`). If tests still pass, the test assertions are inadequate and must be rewritten.

---

## 6. Non-Functional Test Harness Architecture

- **Performance (k6):** Author modular JavaScript load scripts in `tests/performance/` simulating concurrent users against cached CRUD endpoints and credit deduction APIs.
- **Accessibility (@axe-core/playwright):** Embed automated axe scans directly into Playwright E2E journeys to assert zero WCAG 2.1 AA violations on all rendered views.

---

## Output Contract

STATUS: DONE / PARTIAL / BLOCKED
- **TEST SYSTEM ARTIFACTS:** Created or modified test runners, mocks, or harnesses.
- **PYRAMID BALANCE:** Current test distribution breakdown.
- **FIXTURE & HARNESS HEALTH:** Verification of synthetic data pipelines and mocks.
- **DETERMINISM AUDIT:** Flakiness mitigation actions taken.
- **NEXT ACTIONS:** Recommended next STLC milestone.
