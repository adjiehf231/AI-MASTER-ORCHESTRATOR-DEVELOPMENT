# Project Living State

## Current project

- **FACT** The repository contains canonical agent and skill Markdown plus Node.js tooling for adapters, local task records, scoped memory, and repository validation.
- **FACT** Use `npm run orchestrator:list` to inspect the current catalog and `npm run sync -- --check` to inspect generated output parity.
- **DECISION** Canonical instructions live in `agents/` and `skills/`. The memory index selects applicable entries by project, branch, paths, tags, and status.
- **DECISION** Local catalog changes synchronize repository adapters. Plugin deployment is an explicit command.
- **UNKNOWN** A platform configuration can load successfully while task quality remains unmeasured. Report actual host, model, revision, and verification coverage.

## Source freshness

Current source and executed checks establish implementation facts. Approved policies remain explicit decisions. When the implementation and a decision differ, record the discrepancy and resolve it before relying on the disputed behavior.
