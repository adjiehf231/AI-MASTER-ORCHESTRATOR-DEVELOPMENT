# Battle-Tested Heuristics Register

> **Living Memory Document:** Codified rules-of-thumb distilled from direct execution in this codebase.
> **Format:** `[HEUR-<AREA>-NNN]` with Context, Observed Behavior, Expert Heuristic, and Evidence/Origin.
> Consulted automatically during **Phase 0 (Pre-Flight Ingestion)** by all agents before writing code.

---

## 1. Frontend & UI/UX Craft Heuristics

### [HEUR-UI-001] Curated SVG Icons vs Emoji Fallbacks
- **Context:** Building navigation items, action buttons, status pills, or dropdown triggers.
- **Observed Behavior:** Naive AI models inject emojis (`📁`, `🚀`, `⚡`, `🔍`, `💼`) which look childish, lack accessibility, and render inconsistently across operating systems.
- **Expert Heuristic:** Strictly prohibit emoji UI controls. Always use curated SVG icon libraries (Lucide, Radix, Heroicons) with explicit optical sizing (`w-4 h-4` or `w-5 h-5`), proper `aria-hidden="true"` or accessible labels.
- **Evidence / Origin:** Codified during Anti-AI-Slop system design standard.

### [HEUR-UI-002] Layout Reservation for Zero Layout Shift (CLS = 0)
- **Context:** Async data fetching, image loading, and dynamic list rendering.
- **Observed Behavior:** Loading content without reserved dimensions causes visual jumping (CLS > 0), failing Core Web Vitals and jarring user experience.
- **Expert Heuristic:** Always render skeleton loaders that mirror the exact aspect ratio, padding, and height of target loaded content. Reserve layout slots before async promises resolve.
- **Evidence / Origin:** Core Web Vitals mandate & Frontend Quality Gate.

### [HEUR-UI-003] Widescreen Responsive Density
- **Context:** Responsive layouts viewed on desktop and widescreen monitors ($1440\text{px}$ to $4\text{K}$).
- **Observed Behavior:** Rigid `max-w-4xl` or `max-w-5xl` constraints leave massive awkward empty side gutters on widescreen displays.
- **Expert Heuristic:** Use fluid responsive containers with dynamic padding (`px-4 sm:px-6 lg:px-12 2xl:px-20`) and asymmetric grid ratios ($8$-column main workspace + $4$-column contextual inspector/sidebar).
- **Evidence / Origin:** Anti-AI-Slop Responsive Fluid Standard.

---

## 2. Accessibility & Interaction Heuristics

### [HEUR-A11Y-001] Visible Focus Rings & Contrast Ratios
- **Context:** Styling interactive buttons, links, inputs, and custom dropdowns.
- **Observed Behavior:** Developers often remove default outlines (`outline-none`) without adding high-contrast custom rings, rendering interfaces inaccessible to keyboard users.
- **Expert Heuristic:** Never suppress focus outlines without providing a prominent high-contrast ring (`focus-visible:ring-2 focus-visible:ring-indigo-500/80 focus-visible:ring-offset-2`) achieving $\ge 3:1$ contrast against adjacent background.
- **Evidence / Origin:** WCAG 2.2 AA Release Gate.

### [HEUR-A11Y-002] Modal & Drawer Focus Trapping
- **Context:** Dialogs, slide-over sheets, and popovers.
- **Observed Behavior:** Keyboard Tab navigation slips behind open modals into background page elements, causing user disorientation and accessibility failures.
- **Expert Heuristic:** Always trap focus inside active modal dialogs, bind Escape to dismiss, and restore focus to the triggering element upon dismissal.
- **Evidence / Origin:** WCAG 2.2 Level AA Operable Checklist.

---

## 3. Architecture & Backend Heuristics

### [HEUR-ARCH-001] Server vs Client Component Boundary Discipline
- **Context:** Modern web architectures (Next.js App Router, Nuxt, SvelteKit).
- **Observed Behavior:** Developers mark top-level pages with `'use client'`, causing massive bundle bloat, leaking server secrets, and losing SSR streaming benefits.
- **Expert Heuristic:** Server Components / SSR are the mandatory default. Restrict `'use client'` strictly to leaf nodes requiring user interaction (local toggles, drag-and-drop, rich form inputs). Never pass sensitive tokens across serialization boundaries.
- **Evidence / Origin:** Modern Web Architecture Invariant.

### [HEUR-DATA-001] Pessimistic Row Locking for State & Financial Mutations
- **Context:** Deducting balances, updating quotas, or decrementing inventory under high concurrency.
- **Observed Behavior:** Reading balance in memory before writing causes race conditions and negative balances during concurrent requests.
- **Expert Heuristic:** Always execute balance checks, mutations, and ledger appends within an explicit ACID transaction using database-level row locking (`SELECT ... FOR UPDATE`) accompanied by a database `CHECK balance >= 0`.
- **Evidence / Origin:** Concurrency & Transactional Integrity Gate.

---

## 4. Automation, Tooling & AI Systems Heuristics

### [HEUR-CLI-001] ANSI Escape Code Sanitization in CLI Automated Assertions
- **Context:** Writing automated integration tests against CLI tool output formatted with terminal colors.
- **Observed Behavior:** Literal string matching on `res.stdout` fails unexpectedly because invisible ANSI color codes (`\x1b[36m...`) are embedded between characters and delimiters.
- **Expert Heuristic:** Always strip ANSI escape codes (`res.stdout.replace(/\x1b\[[0-9;]*m/g, '')`) before performing substring or boundary assertions on terminal command output.
- **Evidence / Origin:** Unit test stabilization for `scripts/manage-orchestrator.js`.

### [HEUR-YAML-001] Folded Scalar & Escaped Quote Resilience in Frontmatter Parsers
- **Context:** Reading multi-line descriptions or quoted strings in agent and skill frontmatter.
- **Observed Behavior:** Simple regex parsers break when frontmatter uses PyYAML 6.0.3 folded scalars (`>-`) or colons inside quoted strings (`description: "Role: ..."`).
- **Expert Heuristic:** Custom frontmatter parsers must support multiline folded scalar blocks (`>-`, `|`) and clean unescaping of surrounding double-quotes to guarantee cross-parser compatibility without external dependencies.
- **Evidence / Origin:** Audit 360 Finding F05 resolution.

### [HEUR-RAG-001] Reciprocal Rank Fusion (RRF) for Technical Domain Retrieval
- **Context:** Building semantic retrieval for codebases, technical documentation, and error codes.
- **Observed Behavior:** Pure vector embeddings fail on exact error codes, variable names, or acronyms, while pure keyword search fails on conceptual synonyms.
- **Expert Heuristic:** Always fuse sparse lexical search (BM25 / PostgreSQL full-text) with dense vector embeddings using Reciprocal Rank Fusion ($1 / (60 + r_{\text{dense}}) + 1 / (60 + r_{\text{sparse}})$) before passing to re-rankers.
- **Evidence / Origin:** `skills/rag-vector-engineering/SKILL.md`.

### [HEUR-FINOPS-001] Prompt Prefix Stability for Maximum LLM Cache Discounts
- **Context:** Designing system prompts and few-shot examples for Anthropic, Gemini, and OpenAI APIs.
- **Observed Behavior:** Putting dynamic timestamps or session IDs at the head of system prompts invalidates the entire prefix cache, multiplying token inference costs.
- **Expert Heuristic:** Maintain an immutable, static prefix (identity, static rules, tool schemas) at the top of prompts exceeding 1,024 tokens. Always append dynamic session state and user queries at the end to achieve 60–80% prompt caching cost savings.
- **Evidence / Origin:** `skills/finops-cost-governance/SKILL.md`.
