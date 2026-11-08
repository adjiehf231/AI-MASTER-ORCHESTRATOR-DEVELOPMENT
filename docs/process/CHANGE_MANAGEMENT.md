# Change Request (CR) Governance & Control Rules

> **Authoritative Specification:** Governed by `skills/change-request-governance/SKILL.md` and Master Framework §17.

---

## 1. The 9-Stage Change Request Pipeline

Every non-trivial modification, feature addition, or bug fix follows this lifecycle:

1. **Request Intake:** CR logged with business goal, scope, and target tier (`CR-${PROJECT_ID}-YYYY-NNN`).
2. **Impact & Blast Radius Analysis:** Assess module boundaries, backward compatibility, and security surface.
3. **Architecture & Contract Review:** Confirm adherence to existing ADRs and Zod/OpenAPI contracts.
4. **Development (Gate 2 DoD):** Implementation accompanied by colocated unit tests and static checks.
5. **Continuous Integration (CI):** Automated lint, typecheck, secret scanning, and T1 fast-path execution.
6. **SIT Quality Validation (Gate 4):** Integration testing in sandbox tier with synthetic seeds.
7. **UAT Business Verification (Gate 5):** Validation against sanitized mirror; human sponsor sign-off.
8. **Deployment & Promotion (Gate 7-8):** Zero-downtime release with verified rollback runbook.
9. **Post-Task Distillation (Gate 10):** Reflection protocol; codifying new heuristics and anti-patterns into `docs/memory/`.
