# Lessons Learned & Sprint Retrospectives

> **Living Memory Document:** Distilled insights, unexpected discoveries, and breakthroughs across development milestones.

---

## MILESTONE: Universalization & Anti-AI-Slop Architecture (2026-10-29)

### 1. Key Accomplishments
- Cleaned 100% of single-project hardcoding across 23 agents and 30 skills (0 remaining single-project references).
- Integrated `ui-ux-design-system` into frontend, UX, and SDLC playbooks.
- Established automated multi-platform adapter compiler (`scripts/sync-adapters.js`) producing `CLAUDE.md`, `.cursorrules`, `.windsurfrules`, `.clinerules`, universal bundle, and Antigravity plugin manifest.
- Initialized official Git repository and established `docs/memory/` living memory ecosystem.

### 2. Forensic Learnings & Surprises
- **Expectation vs Reality:** Initially, agent instructions were heavily coupled to specific product database names (`karirly_dev`, `karirly_test`) and specific Next.js 16 lock rules. Generalizing them into polymorphic parameters (`${DB_NAME}_dev`, `${PROJECT_NAME}`) makes the orchestrator immediately applicable to any polyglot enterprise project.
- **Hidden Friction:** Different AI tools format prompt instructions differently (Claude prefers XML/Markdown headers, Cursor prefers terse rule lists, Cline prefers system role instructions). Generating all formats from one Markdown SSOT solves divergence permanently.

### 3. Newly Established Invariants
- Zero prompt duplication: Never manually edit platform adapters; always edit `agents/*.md` or `skills/*/SKILL.md` and run `node scripts/sync-adapters.js`.
- Universal 6-State Matrix is mandatory for every user interface component.
