# Feature Development Lifecycle Guide

> **Enterprise Process Guide:** Governed by `skills/implement-feature/SKILL.md` and `skills/sdlc-playbook/SKILL.md`.

---

## 1. Lifecycle Phases

Every vertical slice or feature follows the 6-phase engineering workflow:

```
Phase 1: Context & Living Memory Load (docs/memory/)
Phase 2: Requirement Intake & Gate 1 (DoR) Audit
Phase 3: Technical Planning & Architectural Review
Phase 4: Implementation (Test-First & Anti-AI-Slop Standards)
Phase 5: Tiered Verification Ladder (Gates 0-4)
Phase 6: Continuous Learning Distillation & Session Handoff
```

---

## 2. Inviolable Invariants

1. **Gate 1 (DoR):** Never write code without approved Given/When/Then acceptance criteria and immutable `BR-${PROJECT_ID}-*` numbers.
2. **Gate 2 (DoD):** Colocated unit tests must pass, 0 lint/typecheck errors, and server-side authorization must be enforced.
3. **Gate 3 (Design Craft):** Anti-AI-Slop compliance mandatory for all UI work (Universal 6-State Matrix, zero emoji icons, zero layout shift).
4. **Gate 4 (Continuous Learning):** Upon passing tests, record newly uncovered heuristics in `docs/memory/HEURISTICS.md` and anti-patterns in `docs/memory/ANTI_PATTERNS.md`.
