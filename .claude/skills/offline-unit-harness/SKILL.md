---
name: offline-unit-harness
description: T1 unit testing with deterministic fixtures, sanitized test environments, and no required network services or databases. Use for pure business logic, validation, and state-transition tests.
---

# T1 Unit Tests — AI Master Orchestrator Development

Repository references: `scripts/qa-unit-offline.cjs`, `docs/qa/TEST_PYRAMID.md`, `docs/process/STLC.md`.

Keep the fastest test tier runnable without a database, browser, or external service. Include pure rules, parsers, authorization decisions, and state transitions. Stub dependencies at the boundary and use deterministic clocks, IDs, and fixtures. Run tests that need real services in the integration tier.

## Run the local harness

Run `npm run test:t1` in this repository. The runner passes an allowlisted environment to Node's test runner and propagates test, startup, and signal failures. Tests which need independent repositories or plugin state use temporary fixtures.

Use the test command already configured in the active project. When network isolation is a project requirement, run the tests in an OS or container sandbox with network access disabled and verify that restriction separately. The local environment allowlist controls inherited configuration and credentials.

## Add coverage

1. Start with a representative success case, a meaningful failure case, and applicable boundary cases.
2. Keep integration contracts and external service tests in their own tier. Use temporary workspaces for filesystem side effects.
3. Verify that tests actually ran. Record the command, count, and exit status. Investigate failures before proceeding to integration or browser checks.
