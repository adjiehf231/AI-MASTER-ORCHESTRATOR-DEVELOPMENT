# Architectural & Product Decisions Register (ADRs)

> **Living Memory Document:** Binding architectural, product, and engineering decisions.
> **Format:** Context, Decision, Rationale, Trade-offs, and Consequences.
> Inviolable: If instructions contradict approved decisions, agents must halt and log the conflict.

---

## [ADR-001] Single Source of Truth (SSOT) Architecture for Universal AI Agents
- **Status:** APPROVED
- **Date:** 2026-10-29
- **Context:** Multiple AI coding platforms (Antigravity, Claude Code, Cursor, Windsurf, OpenCode, Codex, DeepSeek) require different instruction formats (.cursorrules, CLAUDE.md, .clinerules, plugin manifests). Maintaining separate copies creates divergence and sync errors.
- **Decision:** Use standard Markdown (`agents/*.md` and `skills/*/SKILL.md`) as the Single Source of Truth (SSOT). All platform adapters are automatically generated via `node scripts/sync-adapters.js`.
- **Consequences:**
  - Zero prompt duplication.
  - Updating a skill or agent in one place automatically synchronizes all platform adapters.

---

## [ADR-002] Anti-AI-Slop Craft Standards as Non-Negotiable Pass/Fail Gate
- **Status:** APPROVED
- **Date:** 2026-10-29
- **Context:** Large language models default to generic templates, emoji UI icons, decorative neon glows, and incomplete state handling.
- **Decision:** Codify Anti-AI-Slop and UI/UX craft rules into the statutory hard gates of the Frontend Engineer, UX Architect, and Quality skills.
- **Consequences:**
  - Automated Axe accessibility audits and visual reviews reject generic templates before code review.
  - Requires curated SVG icon systems (Lucide/Radix) and layered Obsidian Slate tokens.

---

## [ADR-003] Living Memory & Continuous Learning Framework
- **Status:** APPROVED
- **Date:** 2026-10-29
- **Context:** AI assistants typically suffer from inter-session amnesia, repeatedly making the same errors across different chat sessions.
- **Decision:** Mandate a 2-way living memory protocol: Phase 0 Pre-Flight Ingestion (reading `docs/memory/`) and Phase 5 Post-Task Distillation (codifying newly learned heuristics and anti-patterns).
- **Consequences:**
  - The engineering team becomes cumulatively smarter with every completed task.
  - Past bug fixes and architectural rules persist permanently on disk.

---

## [ADR-004] Formal Release Quality Gates (Gates 0–8) Enforcement
- **Status:** APPROVED
- **Date:** 2026-11-08
- **Context:** Delivering code without strict gates leads to silent defects, unvalidated inputs, and deployment regressions.
- **Decision:** Formally codify Gates 0 through 8 in `docs/qa/RELEASE_QUALITY_GATES.md` with an automated CLI enforcement script (`scripts/verify-gates.js`).
- **Consequences:**
  - Automated Gate 0 (Hygiene), Gate 1 (DoR), and Gate 2 (DoD) checks run before code merging.
  - S1/S2 defects immediately block deployment until verified root-cause remediation occurs.

---

## [ADR-005] Universal Extension Lifecycle CLI & Multi-Tier Enterprise Expansion (Waves 1–3)
- **Status:** APPROVED
- **Date:** 2026-11-08
- **Context:** Teams need to rapidly create, customize, or import specialized domain agents and skills (FinOps, MLOps, GRC, RAG, Event-Driven) without manual boilerplate or vendor lock-in.
- **Decision:** Build automated CLI lifecycle tools (`manage-orchestrator.js` and `import-extension.js`) and scale out the core organization with 6 new specialist roles and 8 enterprise skill playbooks across FinOps, RAG, DocOps, Event-Driven, and Disaster Recovery.
- **Consequences:**
  - Standardized agent and skill scaffolding with auto-injected Statutory Hard Gates.
  - Single-command multi-platform synchronization and live Antigravity plugin deployment.
  - Zero-effort ingestion of trusted external tools with automatic sanitization and decoupling.
