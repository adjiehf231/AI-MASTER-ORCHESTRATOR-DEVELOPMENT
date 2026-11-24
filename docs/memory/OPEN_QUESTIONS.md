# Open Questions & Ambiguity Register

> **Living Memory Document:** Active ambiguities, architectural uncertainties, or product questions requiring clarification.
> **Rule:** Every question must have an assigned owner, impact level, and target resolution milestone. Consulted during **Phase 0 (Pre-Flight Ingestion)**.

---

## 1. Active Open Questions

| ID | Topic / Module | Question & Context | Impact | Owner | Target Resolution |
|---|---|---|---|---|---|
| **Q-003** | Host runtime | Which host versions pass native discovery, tool calls, and representative development cases? | High | Orchestrator owner | Token-efficiency pilot |

---

## 2. Resolved Questions Archive

| ID | Question & Context | Resolution / Decision | Date Resolved | Resolution Reference |
|---|---|---|---|---|
| **`Q-001`** | How should multi-platform adapters stay in sync across Claude, Cursor, Windsurf, Cline, and Antigravity? | Single Source of Truth (SSOT) via `scripts/sync-adapters.js` compiling Markdown definitions. | 2026-10-29 | `docs/memory/DECISIONS.md#ADR-001` |
| **`Q-002`** | How to enforce high-craft UI and eliminate generic AI-slop interfaces? | Established mandatory Anti-AI-Slop Craft Standard, Universal 6-State Matrix, and Obsidian Slate tokens. | 2026-10-29 | `docs/memory/DECISIONS.md#ADR-002` |
