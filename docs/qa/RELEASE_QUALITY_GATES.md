# Enterprise Release Quality Gates Specification (Gates 0–8)

> **Authoritative Specification:** Governed by `skills/quality-audit/SKILL.md`, `skills/sdlc-playbook/SKILL.md`, `skills/qa-verification/SKILL.md`, and the Enterprise Engineering Constitution (§1–§20).

---

## 1. Quality Gates Lifecycle Map

```
[Gate 0: Static Hygiene] ──► [Gate 1: Definition of Ready (DoR)] ──► [Gate 2: Definition of Done (DoD)]
                                                                                │
                                                                                ▼
[Gate 5: UAT Business] ◄── [Gate 4: Beta SIT Sandbox] ◄── [Gate 3: Alpha Component Integration]
         │
         ▼
[Gate 6: Hardening & AI Safety] ──► [Gate 7: Release Candidate] ──► [Gate 8: Zero-Downtime Production]
```

---

## 2. Formal Gate Verification Matrix

| Gate | Stage Focus | Exit Criteria & Mandatory Verifications | Required Evidence Artifact | Sign-off Authority |
|---|---|---|---|---|
| **Gate 0: Static Hygiene** | Code Sanitation | 0 ESLint/Linter errors, 0 TypeScript compiler errors, 0 secrets detected via Gitleaks scan. | `npm run lint` & `npm run typecheck` logs (Exit 0) | `devops-engineer` |
| **Gate 1: Definition of Ready (DoR)** | Requirements | Frozen user stories (INVEST), Given/When/Then Gherkin ACs, unique immutable `BR-${PROJECT_ID}-*` IDs, boundary value matrices, statutory data minimization verified, 0 unresolved `OPEN_QUESTIONS`. | Approved BRD / SRS in `docs/product/` | `product-manager` & `system-analyst` |
| **Gate 2: Definition of Done (DoD)** | Vertical Slice Implementation | Colocated unit tests passing, T1 Air-Gapped Zero-DB unit tests passing in $< 10\text{s}$, Server/Client boundaries strictly enforced, Anti-AI-Slop compliant, Universal 6-State Matrix complete, WCAG 2.2 AA verified, peer code review approved (0 blocking findings). | Executed test suite logs, Code Review Certificate | `fullstack-engineer` & `code-reviewer` |
| **Gate 3: Alpha Component Integration** | Subsystem Integrity | Subsystem contracts validated against OpenAPI/Zod schemas, zero circular package dependencies, ACID transactional boundaries confirmed with row-level locking. | Colocated integration suite logs | `solution-architect` |
| **Gate 4: Beta SIT Sandbox** | Environment Integration | Full integration suite passing in `${DB_NAME}_sit` sandbox with synthetic seeds, API $p_{95} < 300\text{ms}$, 0 invariant algorithmic failures, IDOR penetration matrix verified (0 BOLA leaks). | SIT Test Report in `docs/reports/` | `qa-engineer` & `backend-engineer` |
| **Gate 5: UAT Business Validation** | Business Acceptance | 1:1 sanitized production mirror in `${DB_NAME}_uat` passing user journeys; all business rules (`BR-${PROJECT_ID}-*`) confirmed; formal Human Product Owner sign-off certificate archived. | UAT Sign-off Certificate in `docs/reports/` | `release-manager` & Human PO |
| **Gate 6: Hardening & AI Safety** | Security, Privacy & AI | 0 open S1/S2 vulnerabilities (OWASP Top 10 clean), 100% Zero-Hallucination score on golden eval sets ($N_{out} \subseteq N_{in}$), prompt injection boundary fuzzing passed, account erasure cascade parity verified ($< 30\text{s}$ SLA). | Security & AI Audit Report in `docs/reports/` | `security-engineer` & `quality-auditor` |
| **Gate 7: Release Candidate (RC)** | Promotion Readiness | Golden path E2E browser journeys passing on release tag (`v*.*.*`), database migration parity verified against target tier, zero-downtime rollback runbook tested and verified. | RC Readiness Package in `docs/delivery/` | `release-manager` & `database-engineer` |
| **Gate 8: Zero-Downtime Production** | Live Rollout & Health | Zero-downtime blue/green or rolling deployment, automated production smoke tests passing in $< 30\text{s}$, real-time APM telemetry stable, error budget within SLO. | Production Verification Log & Release Notes | `release-manager` & `devops-engineer` |

---

## 3. Strict Fail-Closed Governance & Bypass Prohibition

1. **Zero Skipping Invariant:** No feature, bugfix, or release candidate may skip an intermediate gate under any circumstances.
2. **Adversarial Separation of Duties:** Implementation engineers cannot approve their own Gate 2, Gate 4, or Gate 6 reviews.
3. **Automated Gate Interception:** If any command in the verification ladder fails or an independent reviewer files a `🔴 BLOCKING` finding, the promotion pipeline halts immediately and initiates the closed-loop self-healing protocol (maximum 3 iterations).
4. **Permanent Traceability:** Every gate sign-off must link the immutable `CR-${PROJECT_ID}-*` to executed terminal logs with concrete timestamps and assertion counts.
