# Enterprise Release Quality Gates (Gates 1–8)

> **Authoritative Specification:** Governed by `skills/quality-audit/SKILL.md`, `skills/sdlc-playbook/SKILL.md`, and the Enterprise Engineering Constitution.

---

## 1. Quality Gates Lifecycle Map

```
Gate 1 (DoR) ──► Gate 2 (DoD) ──► Gate 3 (Alpha) ──► Gate 4 (Beta SIT)
                                                               │
Gate 8 (Prod) ◄── Gate 7 (RC) ◄── Gate 6 (Hardening) ◄── Gate 5 (UAT)
```

---

## 2. Gate Verification Standards

| Gate | Stage Focus | Exit Criteria & Required Evidence | Sign-off Authority |
|---|---|---|---|
| **Gate 1 (DoR)** | Requirements | Testable Given/When/Then ACs, immutable `BR-${PROJECT_ID}-*` numbers, data minimization verified, 0 unresolved questions. | `product-manager` |
| **Gate 2 (DoD)** | Story Implementation | 0 lint/typecheck errors, colocated unit tests pass, WCAG 2.2 AA compliant, peer review approved. | `fullstack-engineer` & `code-reviewer` |
| **Gate 3 (Alpha)** | Core Flow Verification | Core Identity, User Profile, and Primary Workspace flows verified green in development environment. | `solution-architect` |
| **Gate 4 (Beta SIT)**| Integration Sandbox | Integration test suite passing against `${DB_NAME}_sit` sandbox with synthetic seeds, 0 invariant algorithmic failures. | `qa-engineer` |
| **Gate 5 (UAT)** | Business Validation | 1:1 sanitized production mirror in `${DB_NAME}_uat` passing business scenarios; formal Human PO sign-off certificate archived. | `release-manager` & Product Owner |
| **Gate 6 (Hardening)**| Security & AI Safety | 0 open S1/S2 vulnerabilities, 100% zero-hallucination factuality benchmark, IDOR penetration matrix clean. | `security-engineer` & `quality-auditor` |
| **Gate 7 (RC)** | Release Candidate | CI golden path E2E suite passes on release candidate tag; migration parity and schema rollback runbook verified. | `release-manager` & `devops-engineer` |
| **Gate 8 (Production)**| Operations & Rollout | Zero-downtime deployment, automated smoke tests (<30s) green, canary telemetry stable, zero critical alerts. | `release-manager` & Exec Sponsor |

---

## 3. Enforcement Invariant
No feature or release may skip an intermediate gate without an explicit, documented Architectural Decision Record (ADR) signed off by the Technical Director.
