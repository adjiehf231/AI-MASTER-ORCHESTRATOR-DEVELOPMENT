# Task Workflow

Create a task before implementation with an expected outcome and a verification criterion. Use the same ID while adding work, discussing decisions, resuming, and reporting.

```bash
npm run orchestrator:task -- start --title "Review callback handling" --scope "Callback idempotency" --todo "Verify duplicate callbacks" --verification "Duplicate event has one effect" --check test
npm run orchestrator:task -- show --id <UUID>
npm run orchestrator:task -- update --id <UUID> --item 1 --status IN_PROGRESS
npm run orchestrator:task -- check --id <UUID> --item 1 --check test
npm run orchestrator:task -- update --id <UUID> --item 1 --status DONE
npm run orchestrator:task -- report --id <UUID>
```

Commands default to this repository. Use `--workspace` to target another local Git repository root. The check registry in that project must already be reviewed as part of the authorized task.

## Verification and reports

Checks execute a named JavaScript file with fixed arguments and no shell. The built-in check IDs in this repository are `test`, `t1`, `gates`, `audit`, and `adapter-parity`. Another project can supply `orchestrator-checks.json` with a `checks` map whose entries contain a relative `script`, optional string `args`, and optional `timeoutMs`.

An item can become `DONE` only with current passing execution evidence for every declared check. A task with no declared executable check can instead record a reviewed local artifact by path and digest. Notes can record `FAIL`, `NOT_RUN`, and `BLOCKED`. A note cannot create passing evidence.

A Git HEAD, working tree, index, scope, or criterion change invalidates affected evidence. The current implementation conservatively reopens completed items when any source fingerprint changes. Task storage under `.orchestrator/tasks/` is excluded from that fingerprint.

Use `decide` to record a question, selected choice, reason, optional alternatives, dissent, and reviewed artifact references. Use `note` to explain verification blockers and `update --status BLOCKED --reason ...` when an item cannot proceed. The report is available for successful, incomplete, and blocked tasks. Generate it at each handoff or final response.

Task state is local metadata. Keep its scope, decisions, and notes free of credentials and personal data. It stores check status, duration, source fingerprint, and artifact hashes. Check terminal output is streamed and is not copied into task state.
