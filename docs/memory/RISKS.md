# System Risk & Mitigation Register

> **Living Memory Document:** Active architectural, security, operational, and delivery risks.
> **Rule:** Every risk must carry an assigned likelihood, severity, blast radius, mitigation strategy, and contingency plan.

---

## 1. Active Risk Matrix

| Risk ID | Risk Category | Description & Potential Failure Mode | Likelihood | Impact | Severity | Mitigation Strategy | Contingency Plan |
|---|---|---|:---:|:---:|:---:|---|---|
| **`RSK-001`** | Interoperability | Platform adapter formats change in future IDE updates (Cursor, Windsurf, Claude). | Low | Medium | Low | Centralized generator in `scripts/sync-adapters.js` with regression tests. | Manual adapter overrides in root. |
| **`RSK-002`** | AI Safety | Non-deterministic code generation introducing subtle concurrency or IDOR flaws. | Medium | High | High | Enforce mandatory 4-tier verification ladder, Zod contracts, and pessimistic row locking. | Automated self-healing loop (max 3 retries) and human escalation. |
| **`RSK-003`** | Memory Drift | Developers or agents failing to record heuristics or architectural decisions after tasks. | Medium | Low | Low | Enforce Phase 5 Post-Task Continuous Learning protocol before marking tasks complete. | Automated audit script for living memory sync. |
