# Universal Enterprise SDLC Framework (Stages 01–10)

> **Authoritative Specification:** Governed by `skills/sdlc-playbook/SKILL.md` and Master Framework §14.

---

## 1. Operating Map

```
[01 Discovery & Feasibility] ──► [02 Requirement Analysis] ──► [03 System & UX Design]
               │                                                              │
               ▼                                                              ▼
[06 SIT & Quality Validation] ◄── [05 Continuous Integration] ◄── [04 Development & Review]
               │
               ▼
[07 UAT & Approval] ──► [08 Deployment] ──► [09 Production Verification] ──► [10 Maintenance & Distillation]
```

---

## 2. Stage Governance & Mandatory Artifacts

1. **Stage 01 (Discovery & Feasibility):** Problem definition, ROI analysis, technical feasibility memo.
2. **Stage 02 (Requirement Analysis):** Business Requirements Document (`docs/product/`), Given/When/Then acceptance criteria, immutable `BR-${PROJECT_ID}-*` rules.
3. **Stage 03 (System & UX Design):** Architecture Decision Records (`docs/architecture/ADR-*`), Zod/OpenAPI contracts (`docs/api/`), ERD & Data Dictionary (`docs/data/DATA_DICTIONARY.md`), High-craft UI tokens (`docs/design/`).
4. **Stage 04 (Development & Review):** Vertical slice implementation in `${SRC_DIR}/`, colocated unit tests, adversarial peer review.
5. **Stage 05 (Continuous Integration):** Automated CI pipeline (`.github/workflows/ci.yml`), Gitleaks secrets audit, T1 air-gapped unit execution.
6. **Stage 06 (SIT & Quality Validation):** Sandbox integration verification (`docs/qa/`), k6 load testing, IDOR penetration scans, AI evaluation benchmarks.
7. **Stage 07 (UAT & Approval):** Sanitized production mirror validation, formal business acceptance sign-off (`docs/reports/`).
8. **Stage 08 (Deployment & Promotion):** Zero-downtime blue/green or rolling promotion, database expand/contract migrations, rollback runbook (`docs/delivery/DEPLOYMENT_RUNBOOK.md`).
9. **Stage 09 (Production Verification):** Automated smoke test suite (<30s), live metrics & tracing (`docs/operations/RUNBOOK.md`).
10. **Stage 10 (Maintenance & Distillation):** 4-step reflection protocol, updating `docs/memory/HEURISTICS.md`, `docs/memory/ANTI_PATTERNS.md`, and `docs/memory/TECHNICAL_DEBT.md`.
