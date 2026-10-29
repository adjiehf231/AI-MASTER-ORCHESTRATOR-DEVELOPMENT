# Technical Debt Register

> **Living Memory Document:** Active technical debt items logged during development cycles.
> Governed by `skills/change-request-governance/` and `skills/continuous-learning/`.

---

## Technical Debt Inventory

| ID | Module / Area | Description & Compromise | Incurred In | Severity | Remediation Plan |
|---|---|---|---|---|---|
| **`DEBT-001`** | `adapters` | Platform adapters are statically compiled markdown; dynamic CLI flags are not yet exposed via npm package. | Universalization Sprint | Low | Create `bin/cli.js` to enable `npx ai-orchestrator init` and `npx ai-orchestrator sync`. |
| **`DEBT-002`** | `presets` | Architecture presets are currently document-based; need runnable starter templates for Vue, Flutter, and FastAPI. | Universalization Sprint | Medium | Add automated scaffolding under `presets/` directory. |

---

## Governance Rules
- Every technical debt item must carry an assigned severity and explicit remediation plan.
- High-severity debt must be addressed before minor feature expansion.
