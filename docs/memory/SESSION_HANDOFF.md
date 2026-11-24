# Session Continuity & Handoff

## Foundation integration — 24 November 2026

The current branch began at `6c15c79`. The task workflow and indexed memory services are part of the local token-efficiency implementation. Recheck the working tree and the current test results before relying on this handoff.

- Resume an existing task through `npm run orchestrator:task -- resume --id <UUID>`. The task retains TODO ownership, decisions, evidence, and the source fingerprint.
- Run `npm run orchestrator:memory -- context` with the relevant path or tag. Inspect omitted counts and expand context when needed.
- Create a report for complete, incomplete, and blocked tasks. A source or scope change reopens completed items whose evidence is outdated.
- Validate generated output and the full test suite after canonical instructions change.
