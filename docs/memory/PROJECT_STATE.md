# Project Living State & Runtime Reality

Update this file when verified facts, decisions, and open items change.

## Current project

- **[FACT]** AI Master Orchestrator is a Markdown instruction library with Node.js tooling for context binding, adapter generation, catalog management, and validation.
- **[FACT]** The source catalog contains 32 agent profiles, including the orchestrator, and 44 skill playbooks. Run `npm run orchestrator:list` for the current inventory.
- **[FACT]** The repository has its own syntax, metadata, integrity, adapter, and CLI checks. The target-project gates in `docs/qa/RELEASE_QUALITY_GATES.md` describe project evidence and sign-offs.
- **[DECISION]** Edit the canonical sources in `agents/`, `skills/`, and `PROJECT_CONTEXT.md`. Use the generator to refresh the tracked outputs.

## Deployment and compatibility

- **[DECISION]** Local catalog changes synchronize the workspace artifacts. Plugin deployment is a separate command.
- **[UNKNOWN]** Host IDE execution depends on host version, active configuration, permissions, and model behavior. Validate the workflows used in the deployment environment.
