# Test Pyramid & T1 Air-Gapped Fast-Path Standard

> **Authoritative Specification:** Governed by `skills/offline-unit-harness/SKILL.md` and `skills/test-architecture-design/SKILL.md`.

---

## 1. Distribution Ratios

- **Tier 1 (Air-Gapped Unit Tests):** 70% of total test count. Must execute in $< 10\text{s}$ with zero network or database dependencies.
- **Tier 2 (Integration & Contract Tests):** 25% of total test count. Verifies database repositories, transactions, migrations, and provider boundaries.
- **Tier 3 (E2E & Accessibility Tests):** 5% of total test count. Verifies top critical user journeys and automated WCAG 2.2 AA scans.

---

## 2. Fast-Path Air-Gapped Invariants

1. **Fail-Closed Network Guard:** Any external HTTP, socket, or database call triggered during T1 execution must immediately throw an unhandled exception and abort the suite.
2. **Deterministic Execution:** No reliance on random seeds, real clock timers, or ambient environment credentials.
3. **Colocation:** Unit tests live adjacent to the units they test (`*.test.ts` or `*.unit.test.ts`).

