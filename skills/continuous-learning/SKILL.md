---
name: continuous-learning
description: Select scoped project memory and propose evidence-linked updates after verification. Use when a task reveals a reusable decision, pitfall, or lesson, or when resuming work across sessions.
---

# Continuous Learning — ${PROJECT_NAME}

Repository references: `docs/memory/MEMORY_GUIDE.md`, `scripts/memory.js`, `docs/process/TASK_WORKFLOW.md`.

## Read relevant memory

Run `npm run orchestrator:memory -- context` with the affected paths and tags. Inspect status, source, evidence, revision, and omitted counts. Read additional source when selected context does not answer the current question.

Implementation facts come from the current source and executed checks. Approved decisions stay explicit policies. Record a discrepancy between those sources and resolve it with the responsible owner.

## Propose a reusable update

At the end of work, identify a concrete finding that applies beyond this task. Record its scope, evidence, and a concise summary in a proposal JSON file. Use `npm run orchestrator:memory -- propose --file <path>` to validate the proposed entry.

Review the candidate before activating it in the index. When a decision or heuristic changes, mark the previous entry superseded and link the replacement. Preserve the historical text and its date. Keep source credentials, personal data, and raw logs outside memory.

## Handoff

Generate the task report and retain unresolved TODO items, decisions, source fingerprints, verification outcomes, and the next step. An old passing test remains evidence for the recorded revision. Recheck after relevant source or scope changes.
