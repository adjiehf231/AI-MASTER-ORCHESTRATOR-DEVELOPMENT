# Universal Software Testing Life Cycle (STLC) Specification

> **Authoritative Specification:** Governed by `skills/qa-verification/SKILL.md`, `skills/test-architecture-design/SKILL.md`, `skills/offline-unit-harness/SKILL.md`, and `skills/defect-lifecycle/SKILL.md`.

---

## 1. The 6-Phase STLC Execution Lifecycle

Every test cycle follows six disciplined phases synchronized with the development stages:

```
[1. Requirement Analysis] ──► [2. Test Planning] ──► [3. Test Case Design (TC-*)]
             │                                                        │
             ▼                                                        ▼
[6. Test Cycle Closure] ◄── [5. Test Execution & Defect Triage] ◄── [4. Environment Setup]
```

---

## 2. The 3-Tier Test Pyramid Standards

```
       /\
      /  \      Tier 3: User-Facing E2E Journeys & Accessibility (Playwright / Axe) - ~5%
     /----\     - Golden path critical user journeys only.
    /      \    Tier 2: Colocated Unit & Isolated Integration Suites (Database & APIs) - ~25%
   /--------\   - Repository contracts, transaction boundaries, migrations.
  /          \  Tier 1: Fast-Path Air-Gapped Zero-DB Unit Suites (<10s) - ~70% ⚡
 /------------\ - Pure algorithmic domain scoring, state transitions, security ownership.
```

### Tier 1 Fast-Path Invariants (Sub-10s Zero-DB)
1. **Network Air-Gap:** Any network or external database I/O throws an unhandled exception.
2. **Determinism:** Tests must never depend on real wall-clock time or external random seeds.
3. **Fail-Fast Boundary:** If Tier 1 fails, the CI/CD pipeline aborts immediately before spinning up containers or browser runners.

---

## 3. Defect Severity & Priority Classification Matrix

| Severity | Definition & Impact | Example Scenarios | Resolution SLA | Release Blocking? |
|---|---|---|---|:---:|
| **S1: Critical** | System crash, data corruption, unauthorized privilege escalation (IDOR), persistent AI hallucination, or statutory compliance violation. | Cross-user data access, double-spend under concurrency, account erasure failure. | $< 4\text{ hours}$ | 🔴 **BLOCKS ALL GATES** |
| **S2: Major** | Primary user workflow broken with no viable workaround; severe performance degradation violating SLA. | Checkout form failing on valid input, API $p_{95} > 2000\text{ms}$, layout shift breaking UI. | $< 24\text{ hours}$ | 🔴 **BLOCKS GATE 4+** |
| **S3: Minor** | Secondary workflow glitch, edge-case failure with an obvious user workaround, or minor UI flaw. | Filter dropdown resetting on page refresh, visual misplacement of secondary button. | $< 3\text{ sprints}$ | 🟡 Non-blocking for Alpha |
| **S4: Trivial** | Cosmetic imperfection, spelling typo in static copy, minor microcopy ambiguity. | Minor text contrast variance in non-critical footer text. | Backlog triage | 🔵 Permitted in Beta/RC |

---

## 4. Test Case Authoring Standard (`TC-${PROJECT_ID}-*`)

Every automated and manual test case must follow the universal standard:
1. **Identifier:** `TC-${PROJECT_ID}-<MODULE>-NNN` (e.g. `TC-${PROJECT_ID}-AUTH-001`, `TC-${PROJECT_ID}-DOC-012`).
2. **Traceability:** Direct foreign key reference to requirement `BR-${PROJECT_ID}-*`.
3. **Given/When/Then Format:**
   - **GIVEN:** Initial preconditions, authenticated user context, database fixtures.
   - **WHEN:** The explicit action or request triggered.
   - **THEN:** Observable post-conditions, response status, state transitions, event emissions.
4. **Negative Paths Mandatory:** For every nominal happy-path case, author at least 3 negative/boundary cases (invalid input, permission denial, race condition).

---

## 5. Anti-Flakiness & Reliability Governance
- **Zero Flakiness Tolerance:** Any test that intermittently passes and fails without code changes is quarantined immediately; running tests in a loop without fixing the root cause is strictly prohibited.
- **No Arbitrary Sleep Timers:** Replace `sleep(5000)` with explicit condition polling (`waitForCondition`, `expect.poll`).
- **Idempotent Fixtures:** Every test suite must isolate its database records with unique test tenant IDs or transactional rollbacks.
