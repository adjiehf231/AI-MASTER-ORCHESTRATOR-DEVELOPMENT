---
name: SDLC & Enterprise Delivery Playbook
description: Master operating map of the Universal Enterprise Software Development Life Cycle (SDLC 01–10), STLC, the 15 mandatory system documents, Change Request (CR) governance, RACI accountability matrix, and DORA/Engineering KPIs per Master Framework (§1–§25).
---

# SDLC & Enterprise Delivery Playbook — Universal Enterprise Standard

Authoritative sources: Master Framework (§1–§25), `docs/process/SDLC.md`, `docs/process/STLC.md`, `docs/process/CHANGE_MANAGEMENT.md`, `docs/qa/RELEASE_QUALITY_GATES.md`, and the Enterprise Engineering Constitution.

Principles: The system must be **business-aligned, technically precise, secure, verified, measurable, auditable, and maintainable** without single-person or vendor dependency.

---

## 1. The 10-Stage Enterprise SDLC Operating Map (Framework §14)

| # | Enterprise SDLC Stage | Primary Role | Support Roles | Primary Skills | Key Artifacts | Mandatory Exit Criteria & Gate |
|---|---|---|---|---|---|---|
| **01** | **Discovery & Feasibility** | `product-manager` / `orchestrator` | `system-analyst`, `solution-architect` | `requirement-analysis`, `technical-innovation` | Feasibility memo, initial scope, risk register | Business goal aligned, technical viability confirmed, zero-cost-first approved |
| **02** | **Requirement Analysis** | `product-manager` | `system-analyst`, `privacy-reviewer` | `requirement-analysis`, `change-request-governance` | **BRD**, User Stories, `BR-${PROJECT_ID}-*`, Given/When/Then ACs | **Gate 1 (DoR):** Unique BR numbers, testable ACs, data minimization justified |
| **03** | **System & UX Design** | `system-analyst` & `solution-architect` | `ux-engineer`, `database-engineer`, `security-engineer` | `system-modeling`, `architecture-decision`, `ui-ux-design-system`, `uiux-review`, `nfr-governance` | **SRS**, **ADR**, **ERD & Data Dictionary**, **API Contract**, Wireframes | Contracts locked, state machines defined, NFRs budgeted, threat model reviewed |
| **04** | **Development & Peer Review** | `fullstack-engineer` (or specialist: `frontend`, `backend`, `integration`, `data`, `ai`, `mobile`) | `code-reviewer` | `implement-feature`, `frontend-quality`, `system-integration`, `offline-unit-harness`, `code-review` | Source code in `${SRC_DIR}/`, colocated unit tests | **Gate 2 (DoD):** 0 lint/typecheck errors, T1 air-gapped unit tests pass (<10s), peer review clean |
| **05** | **Continuous Integration** | `devops-engineer` | `test-architect` | `ci-cd-deployment`, `offline-unit-harness` | `.github/workflows/ci.yml`, CI build artifacts | Gitleaks secret scan clean, T1 unit pass, db:migrate verification, static analysis clean |
| **06** | **SIT & Quality Validation** | `qa-engineer` (Auto) + `qa-manual` (Exploratory) | `security-engineer`, `performance-engineer` | `qa-verification`, `defect-lifecycle`, `system-debugging-rca`, `security-review`, `performance-testing` | **Test Plan & Cases**, **Defect Log**, **SIT Report**, k6 load reports | **Gate 4 (Beta SIT Gate) & Gate 6 (Safety):** Invariant algorithms pass, zero open S1/S2, 100% AI eval |
| **07** | **UAT & Business Approval** | `release-manager` | `qa-manual`, Human Business Owner | `release-management`, `change-request-governance` | **UAT Report**, Business Sign-off Certificate | **Gate 5 (UAT Gate):** 1:1 sanitized prod mirror pass; formal PO sign-off archived |
| **08** | **Deployment & Promotion** | `release-manager` | `devops-engineer`, `database-engineer` | `release-management`, `ci-cd-deployment` | **Deployment & Rollback Plan**, Release candidate tag | **Gate 7 (RC Gate):** Golden path E2E green, migration parity and schema integrity verified |
| **09** | **Production Verification** | `release-manager` & `devops-engineer` | `qa-manual`, `sre-engineer` | `observability-resilience`, `manual-testing` | Smoke test logs (<30s), live telemetry, **Release Notes** | **Gate 8 (Production Gate):** Zero-downtime rollout, smoke test green, canary telemetry stable |
| **10** | **Maintenance, Debt & Distillation** | `orchestrator` | All Leads | `continuous-learning`, `system-debugging-rca`, `change-request-governance` | **Runbook & SOP**, **LESSONS_LEARNED.md**, **HEURISTICS.md**, **TECHNICAL_DEBT.md** | Post-mortem distilled, technical debt logged, heuristics codified for next cycle |

---

## 2. The 15 Mandatory Enterprise System Documents (Framework §15)

Every major release cycle or feature capability must maintain and synchronize the 15 mandatory artifacts:

```
 1. Business Requirements Document (BRD)       ──► docs/product/
 2. System Requirements Specification (SRS)     ──► docs/product/SRS/
 3. Functional & Non-Functional (NFR) Specs     ──► docs/design/NFR/
 4. Architecture Document & Boundary Maps       ──► docs/architecture/
 5. ERD & Data Dictionary                       ──► docs/data/DATA_DICTIONARY.md
 6. API Contracts (Zod / OpenAPI)               ──► docs/api/ & src/modules/*/contracts
 7. UI/UX Design, Flow & Design System          ──► docs/design/ & src/components/
 8. Test Plan & Test Cases (TC-*)               ──► docs/qa/ & tests/
 9. Defect & Open Ticket Log                    ──► docs/qa/DEFECT_MANAGEMENT.md
10. Change Request (CR) Register                ──► docs/process/CR_REGISTER.md
11. SIT & UAT Execution Reports                 ──► docs/reports/
12. Deployment & Rollback Plan                  ──► docs/delivery/DEPLOYMENT_RUNBOOK.md
13. Release Notes & Changelog                   ──► docs/memory/CHANGELOG.md
14. Runbook & Operational SOP                   ──► docs/operations/RUNBOOK.md
15. ADR & Technical Debt Register               ──► docs/architecture/ADR-* & docs/memory/TECHNICAL_DEBT.md
```

---

## 3. Change Request (CR) Governance & Control Rules (Framework §17)

Every feature change or bug fix follows the 9-stage CR pipeline:
1. **Request:** CR logged with background, business goal, and scope (`CR-${PROJECT_ID}-YYYY-NNN`).
2. **Analysis:** BA / System Analyst evaluates requirements, dependencies, and Given/When/Then ACs.
3. **Technical Review:** Architect & Leads evaluate architecture impact, security, and data migration.
4. **Approval:** Business Owner and Technical Authority approve scope.
5. **Implementation:** Developers implement code with version control, lint, typecheck, and T1 unit tests.
6. **SIT:** QA validates functional integration, regression, and negative edge cases.
7. **UAT:** Business users validate expected business workflows.
8. **Release Gate:** Release Authority verifies 0 open S1/S2 defects, rollback runbook, and sign-offs.
9. **Deployment & Verification:** DevOps deploys; team executes production smoke tests and monitors telemetry.

---

## 4. STLC Phase Mapping (Software Testing Life Cycle)

| STLC Phase | Lead Owner | Support | Primary Skill | Core Deliverables & Standards |
|---|---|---|---|---|
| **1. Test Requirement Analysis** | `test-architect` | `system-analyst`, `qa-engineer` | `test-architecture-design`, `requirement-analysis` | Testability review of BRD/SRS; initiate `TEST_TRACEABILITY_MATRIX.md` |
| **2. Test Planning & Strategy** | `test-architect` | `qa-engineer` | `test-architecture-design`, `qa-verification` | 3-tier pyramid allocation, domain test strategies in `docs/qa/` |
| **3. Test Case Design** | `qa-engineer` | `system-analyst` | `qa-verification`, `system-modeling` | Formal `TC-<AREA>-NNN` design covering happy, boundary, negative, and IDOR paths |
| **4. Test Environment & Data Setup** | `test-architect` | `devops-engineer`, `qa-manual` | `test-architecture-design`, `manual-testing` | Synthetic persona seeding (`scripts/seed-sit.ts`); Docker Postgres tiers; MailHog setup |
| **5. Test Execution (Automation & Manual)** | `qa-engineer` (Auto) + `qa-manual` (Manual) | `mobile-engineer` | `qa-verification`, `offline-unit-harness`, `manual-testing`, `mobile-quality` | T1 air-gapped unit runs (<10s), Vitest, Playwright, k6 load runs, exploratory charters |
| **6. Defect Forensics & Retesting** | `qa-engineer` | `system-debugging-rca`, Developer | `system-debugging-rca`, `defect-lifecycle`, `qa-verification` | Reproduction packages, S1–S4 triage, forensic 5-Whys RCA, mandatory regression test binding |
| **7. Test Closure & Quality Gate Audit** | `quality-auditor` | `test-architect`, `release-manager` | `quality-audit`, `release-management`, `continuous-learning` | Real code coverage report (`npm run test:coverage`), Gate 1–8 readiness audit, distilled heuristics |

---

## 5. Enterprise RACI Accountability Matrix (Framework §18)

```
R = Responsible (Does the work)
A = Accountable (Final sign-off / approves)
C = Consulted (Provides inputs)
V = Verifies / Audits (Adversarial check)
```

| Lifecycle Activity | Product / BA | System Analyst | Solution Architect | Developer / Integration / Data | QA / Test Arch | Security / Privacy | DevOps / Release | Operations / SRE | Quality Auditor |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **BRD & Scope (`BR-${PROJECT_ID}-*`)** | **A/R** | C | C | I | C | C | I | I | **V** |
| **SRS & Zod Contracts** | C | **A/R** | C | C | C | C | I | I | **V** |
| **Architecture Decision (ADR)** | I | C | **A/R** | C | C | C | C | C | **V** |
| **Test Strategy & Harness** | I | C | C | I | **A/R** | C | C | I | **V** |
| **Implementation (Code & Unit Tests)** | I | I | C | **A/R** | C | I | I | I | **V** |
| **Inter-System & Webhooks** | I | C | C | **A/R** | C | C | C | I | **V** |
| **Adversarial Code & Sec Review**| I | I | C | I | C | **A/R** | I | I | **V** |
| **SIT Verification (Sandbox)** | I | I | I | C | **A/R** | C | C | I | **V** |
| **UAT Business Acceptance** | **A** | I | I | I | C | I | **R** | I | **V** |
| **Security & Safety Approval** | I | I | C | I | C | **A/R** | I | I | **V** |
| **Deployment & Rollback (Gate 7-8)**| I | I | C | I | I | C | **A/R** | C | **V** |
| **Live Telemetry & SRE SLO** | I | I | C | I | I | C | C | **A/R** | **V** |
| **Statutory Gate Compliance Audit**| I | I | I | I | I | I | I | I | **A/R** |
| **Continuous Learning & Distillation**| C | C | C | C | C | C | C | C | **A/R (Orch)** |

---

## 6. Engineering Quality & KPI Governance (Framework §20)

Orchestrator tracks delivery, quality, and reliability against standard enterprise benchmarks:

| Dimension | Metric | Measurement Standard / Target |
|---|---|---|
| **Delivery** | Lead Time for Changes | Commit to production deployment $< 24\text{ hours}$ |
| **Delivery** | Deployment Frequency | Daily/weekly repeatable zero-downtime releases |
| **Quality** | Defect Leakage Rate | $< 2\%$ of defects discovered post-production |
| **Quality** | Regression Escape Rate | $0$ regression defects escaping to production |
| **Quality** | Test Effectiveness | $> 80\%$ test coverage on critical business modules |
| **Reliability** | Change Failure Rate | $< 5\%$ of deployments requiring rollback or remediation |
| **Reliability** | Mean Time to Recover (MTTR) | $< 15\text{ minutes}$ from alert to recovery |
| **Security** | Vulnerability SLA | S1 Critical remediated in $< 24\text{h}$; S2 High in $< 7\text{ days}$ |
| **Maintainability**| Technical Debt Trend | Downward or stable; $\ge 15\%$ capacity allocated to debt |
| **Documentation** | Traceability Coverage | $100\%$ of PRs linked to `BR-${PROJECT_ID}-*`, `CR-${PROJECT_ID}-*`, and `TC-*` |
| **Operations** | Recovery Readiness | $100\%$ pass on quarterly backup/restore simulations |
