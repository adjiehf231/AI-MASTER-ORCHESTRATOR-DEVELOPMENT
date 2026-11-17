# Test Pyramid & T1 Fast-Path Standard

Repository references: `skills/offline-unit-harness/SKILL.md` and `skills/test-architecture-design/SKILL.md`.

| Tier | Scope | Environment |
| --- | --- | --- |
| T1 — Unit | Pure business logic, validation, state transitions, and local CLI fixtures | Repository test runner with deterministic inputs and an allowlisted environment. No external service or database dependency. |
| T2 — Integration | Repository contracts, transactions, migration parity, and provider boundaries | Isolated test services and synthetic data. |
| T3 — End-to-end | Critical user journeys and applicable accessibility checks | A target-project browser or device setup and a representative test environment. |

Run T1 first. Verify the suite count and the process status. Measure duration against the project's agreed feedback budget. Keep network egress controls in the test infrastructure when isolation is required.
