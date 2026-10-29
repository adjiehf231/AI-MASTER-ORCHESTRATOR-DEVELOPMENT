# Universal AI Master Orchestrator & Enterprise Engineering Team

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Specialist Agents](https://img.shields.io/badge/Specialist%20Agents-23%20Roles-indigo.svg)](agents/)
[![Enterprise Skills](https://img.shields.io/badge/Enterprise%20Skills-31%20Playbooks-emerald.svg)](skills/)
[![Frontend Standard](https://img.shields.io/badge/UI%2FUX-Anti--AI--Slop%20Craft-rose.svg)](skills/ui-ux-design-system/)
[![Accessibility](https://img.shields.io/badge/Accessibility-WCAG%202.2%20AA-purple.svg)](skills/frontend-quality/)
[![Compatibility](https://img.shields.io/badge/Platforms-Antigravity%20%7C%20Claude%20%7C%20Cursor%20%7C%20Cline%20%7C%20Codex%20%7C%20DeepSeek-cyan.svg)](adapters/)

> **A project-agnostic, enterprise-grade AI software engineering organization.**
> Embodying 23 specialized engineering roles and 31 SDLC skill playbooks operating at the technical judgment standard of a **Principal Software Engineer & Autonomous Technical Director (25+ years experience)**.
> Engineered for cross-platform interoperability (**Antigravity, Claude Code, OpenAI Codex, OpenCode, Cline, DeepSeek, Cursor, Windsurf**) with an uncompromising **Anti-AI-Slop UI/UX design standard**.

---

## 🌟 Why Universal AI Master Orchestrator?

Most AI coding assistants function as passive autocomplete bots that generate generic, template-ridden code ("AI Slop"), skip negative paths, hallucinate facts, and fail on complex architectures.

**Universal AI Master Orchestrator** transforms your AI into an **Autonomous Autonomous Engineering Team**:
1. **Project-Agnostic Core:** Completely decoupled from specific project names or rigid stacks. Configure once via `PROJECT_CONTEXT.md` for any SaaS, FinTech, E-Commerce, Mobile, or AI system.
2. **Autonomous SDLC Lifecycle (Stages 01–10):** Governs the entire engineering lifecycle—from discovery, requirements (Given/When/Then ACs), architectural decision records (ADRs), contract-first APIs, to tiered verification ladders.
3. **Anti-AI-Slop & High-Craft UI/UX:** Strictly eradicates low-effort AI UI habits (no emoji icons, no neon background blobs, no fake stats, no rigid `max-w-4xl` layouts). Enforces the **Universal 6-State Matrix**, **Obsidian/Slate design tokens**, and **WCAG 2.2 AA accessibility**.
4. **Single Source of Truth (SSOT) Portability:** Write prompts and skills once in standard Markdown. The built-in generator compiles native adapters for **Claude Code**, **Cursor**, **Windsurf**, **Cline/OpenCode**, **Antigravity**, and **DeepSeek/ChatGPT**.
5. **Tiered Verification & Autonomous Self-Healing:** Enforces a 4-tier verification ladder (Static, T1 Unit, Integration, E2E Accessibility). Automatically captures test failures, diagnoses root causes, and self-heals up to 3 cycles.

---

## 🏛️ Autonomous Operating Map

### 10-Stage Enterprise SDLC
```
[01 Discovery & Feasibility] ──► [02 Requirement Analysis] ──► [03 System & UX Design]
               │                                                              │
               ▼                                                              ▼
[06 SIT & Quality Validation] ◄── [05 Continuous Integration] ◄── [04 Development & Review]
               │
               ▼
[07 UAT & Approval] ──► [08 Deployment] ──► [09 Production Verification] ──► [10 Maintenance & Distillation]
```

### The 6-Phase Autonomous Loop
```mermaid
flowchart TD
    TaskIn[User Request / CR Goal] --> P0[Phase 0: Memory & Heuristic Ingestion]
    P0 --> P1[Phase 1: Critical Premise Evaluation & Blast Radius Triage]
    P1 --> P2[Phase 2: Autonomous Specialist Dispatch & Skill Activation]
    P2 --> P3[Phase 3: Automated Tiered Verification Ladder Execution]
    P3 --> GateCheck{Gates & Tests Pass?}
    GateCheck -->|Fail / Defect Detected| P4[Phase 4: Autonomous Closed-Loop Self-Healing (Max 3 Retries)]
    P4 --> P3
    GateCheck -->|Pass| P5[Phase 5: Continuous Learning & Living Memory Sync]
    P5 --> P6[Phase 6: Session Handoff & Governance Reporting]
```

---

## 🎨 The Anti-AI-Slop & UI/UX Standard

Antigravity and other LLMs frequently fall into generic design traps. Universal Orchestrator establishes non-negotiable rules for all frontend and design work:

```
❌ PROHIBITED AI-SLOP PATTERNS                ✅ MANDATORY CRAFT STANDARDS
─────────────────────────────────────────────────────────────────────────────────────────────
• Emoji icons for UI controls (📁, ⚡, 🔍, 💼)  • Curated SVG Icon Systems (Lucide, Radix, Heroicons)
• Random glowing neon background blur blobs    • Layered Depth & Obsidian Slate Palette
• Fake decorative metrics / dummy analytics    • Structured, context-rich product data
• Boxed-in desktop layouts (max-w-4xl gutters) • Fluid Responsive Grids (320px to 4K widescreen)
• Inverted dark mode (#000000 pitch black)     • Tonal Slate Hierarchy (#0b0f19 -> #111827 -> #161f33)
• Only building the happy path                 • Universal 6-State Component Matrix
• Inaccessible interactive controls            • WCAG 2.2 AA Compliance (Contrast ≥ 4.5:1, Focus ring ≥ 3:1)
```

### The Universal 6-State Component Matrix
Every dynamic view and component must explicitly support:
1. **Loading State:** Skeleton screens with exact aspect ratio and dimensions to guarantee **Zero Layout Shift (CLS = 0)**.
2. **Empty State:** Helpful onboarding guidance with a prominent primary Call-to-Action.
3. **Error State:** Human-actionable error explanation with a retry affordance (never raw JSON).
4. **Success State:** Unambiguous confirmation with accessible live-region announcements.
5. **Denied State:** Transparent permission explanation without leaking sensitive internal IDs.
6. **Stale/Offline State:** Cached data presentation with a non-intrusive re-sync indicator.

---

## 🚀 Quick Start: Using in Any Project

### 1. Configure Your Project Profile
Copy the template to your project root and update the parameters:
```bash
cp PROJECT_CONTEXT.template.md PROJECT_CONTEXT.md
```
Open `PROJECT_CONTEXT.md` and define your project name, tech stack, source directories, and change governance prefixes.

### 2. Generate Multi-Platform Adapters
Run the synchronization script to compile native instruction files:
```bash
node scripts/sync-adapters.js
```
This automatically updates:
- `CLAUDE.md` (for Claude Code CLI & Desktop)
- `.cursorrules` (for Cursor IDE)
- `.windsurfrules` (for Windsurf IDE)
- `.clinerules` (for Cline / Roo-Code / OpenCode)
- `adapters/bundle/universal-system-prompt.md` (for ChatGPT, OpenAI Codex, DeepSeek, Ollama)
- `adapters/antigravity/plugin.json` (for Google Antigravity & Gemini)

### 3. Start Pair-Programming
Open your IDE or CLI assistant of choice. The orchestrator will autonomously classify tasks, activate the relevant specialist agents, and enforce verification gates!

---

## 👥 The 23 Specialist Agents

| Agent ID | Role | Mandate & Capabilities |
| :--- | :--- | :--- |
| **`orchestrator`** | Chief Technical Director | Autonomous SDLC orchestration, dispatch matrix, verification ladders, closed-loop healing. |
| **`solution-architect`** | Principal Solution Architect | System architecture, ADRs, module boundaries, C4 models, NFR budgets. |
| **`system-analyst`** | Lead System Analyst | Requirement decomposition, state machine modeling, data flow diagrams, contract validation. |
| **`product-manager`** | Principal Product Manager | Business requirements (BRDs), user journeys, Given/When/Then acceptance criteria. |
| **`frontend-engineer`** | Principal Frontend Engineer | Modern web UI, anti-AI-slop design tokens, Server/Client boundaries, CLS=0, WCAG 2.2 AA. |
| **`ux-engineer`** | Principal UX/UI Architect | Nielsen heuristics, accessibility audits, microcopy governance, fluid layout walkthroughs. |
| **`backend-engineer`** | Principal Backend Engineer | Route handlers, Zod contracts, ACID transactions, row locking, IDOR protection. |
| **`fullstack-engineer`** | Principal Fullstack Engineer | End-to-end vertical slice delivery across frontend, API, and database layers. |
| **`database-engineer`** | Principal Database Engineer | Schema design, zero-downtime expand/contract migrations, indexing, concurrency controls. |
| **`devops-engineer`** | Principal DevOps & SRE | Multi-tier environments, zero-cost-first dev stack, Docker, CI/CD gates, canary releases. |
| **`security-engineer`** | Principal Security Engineer | OWASP Top 10 defense, threat modeling (STRIDE), auth flows, cryptographic hygiene. |
| **`privacy-reviewer`** | Regulatory Privacy Officer | Data minimization, GDPR / CCPA / statutory privacy, PII scrubbing, audit trails. |
| **`integration-engineer`**| Principal Integration Engineer | Webhooks, message queues, idempotency keys, exponential backoff with DLQ. |
| **`data-engineer`** | Principal Data Engineer | ETL/ELT pipelines, analytical warehousing, stream processing, data reconciliation. |
| **`ai-engineer`** | Principal AI/LLM Engineer | Zero-hallucination pipelines, factuality benchmarks, provenance tags, prompt injection defenses. |
| **`mobile-engineer`** | Mobile Application Engineer | Flutter / React Native cross-platform apps, offline sync, secure storage, mobile a11y. |
| **`performance-engineer`**| Performance Engineer | Core Web Vitals, k6 load testing, algorithmic complexity ($O(n)$ audits), query plans. |
| **`qa-engineer`** | QA Automation Architect | Colocated unit tests, integration test harnesses, Playwright E2E with Axe scans. |
| **`qa-manual`** | Principal Exploratory Tester | Adversarial manual walkthroughs, boundary probes, multi-tier environment validation. |
| **`test-architect`** | Enterprise Test Architect | Test pyramid strategy, air-gapped fast unit suites, synthetic seed datasets. |
| **`code-reviewer`** | Independent Code Reviewer | Adversarial peer review, regression identification, code smell and security blocker detection. |
| **`quality-auditor`** | Enterprise Quality Auditor | Formal SDLC quality gate audits (Gates 1–8), compliance sign-off. |
| **`release-manager`** | Release & Promotion Manager | Multi-tier environment promotion (Sandbox $\to$ UAT $\to$ Production), zero-downtime deployment. |

---

## 📚 The 31 Enterprise Skills

| Category | Skills |
| :--- | :--- |
| **Architecture & SDLC** | `sdlc-playbook`, `architecture-decision`, `requirement-analysis`, `system-modeling`, `change-request-governance`, `technical-innovation` |
| **Frontend & UI/UX** | `ui-ux-design-system`, `frontend-quality`, `uiux-review`, `mobile-quality` |
| **Backend & Data** | `api-design`, `database-change`, `system-integration`, `observability-resilience`, `nfr-governance` |
| **AI & Intelligence** | `ai-feature`, `continuous-learning` |
| **Testing & Quality** | `offline-unit-harness`, `qa-verification`, `manual-testing`, `defect-lifecycle`, `system-debugging-rca`, `performance-testing`, `test-architecture-design` |
| **Security & Privacy** | `security-review`, `privacy-review`, `code-review`, `quality-audit` |
| **Delivery & SRE** | `ci-cd-deployment`, `release-management`, `implement-feature` |

---

## 🛠️ Verification Ladder Protocol

Every substantive code delivery must pass the strict 4-tier verification ladder before completion:

```bash
# Tier 0: Static Hygiene & Compiler Strictness (<5s)
npm run lint          # 0 errors, 0 warnings
npm run typecheck     # 0 TypeScript / compiler errors

# Tier 1: Fast Air-Gapped Unit Tests (<10s)
npm test -- tests/unit

# Tier 2: Colocated Integration & Contract Tests (<2m)
npm test -- tests/integration

# Tier 3: E2E Journeys with Accessibility Audits (<5m)
npm run test:e2e      # Automated Playwright + @axe-core scans (0 violations)
```

---

## 📂 Repository Structure

```
ai-master-orchestrator/
├── .github/                         # GitHub Actions CI/CD workflows
├── adapters/                        # Multi-platform adapters & bundles
│   ├── antigravity/                 # Google Antigravity & Gemini config
│   └── bundle/                      # Universal prompt bundle (Codex, DeepSeek, Ollama)
├── agents/                          # 23 Generalized Specialist Agents (SSOT)
│   ├── orchestrator.md              # Master SDLC Director
│   ├── frontend-engineer.md         # Anti-AI-Slop, Accessible Frontend Architect
│   ├── backend-engineer.md          # Contract-first, ACID Backend Architect
│   └── ...                          # 20 other specialist agents
├── skills/                          # 31 Enterprise SDLC Skills (SSOT)
│   ├── ui-ux-design-system/         # Anti-AI-slop design token & craft rules
│   ├── frontend-quality/            # 6-state matrix, zero CLS, WCAG 2.2 AA
│   ├── sdlc-playbook/               # 10-stage SDLC & STLC master operating map
│   └── ...                          # 28 other enterprise skills
├── scripts/                         # Automation & synchronization scripts
│   ├── refactor-core.js             # Core decoupling utility
│   ├── sanitize-tiers.js            # Tier environment sanitizer
│   └── sync-adapters.js             # Platform adapter compiler
├── CLAUDE.md                        # Generated adapter for Claude Code
├── .cursorrules                     # Generated adapter for Cursor IDE
├── .windsurfrules                   # Generated adapter for Windsurf IDE
├── .clinerules                      # Generated adapter for Cline & OpenCode
├── PROJECT_CONTEXT.template.md      # Template configuration for user projects
├── PROJECT_CONTEXT.md               # Active workspace project context
├── LICENSE                          # MIT License
└── README.md                        # World-class documentation
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE). Built for the global software engineering community.
