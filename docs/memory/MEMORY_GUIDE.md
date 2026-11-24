# Indexed Project Memory

The index at `docs/memory/index.json` provides stable IDs, type, topic, scope, status, a source heading, evidence references, verification date, and optional replacement links. Source Markdown remains reviewable in Git.

Run `npm run orchestrator:memory -- check` to validate the index. Run `npm run orchestrator:memory -- context --path scripts/lib/memory.js --tag tooling` to select applicable active entries. The compact JSON response fits its requested byte limit and reports stale, unrelated, and omitted-by-budget entries.

## Entry lifecycle

Use `proposed` for a candidate awaiting review, `active` for applicable knowledge, `resolved` for a closed question, and `superseded` for a record replaced by another entry. An approved replacement points to the previous ID with `supersedes`. Retain the historical source text. Each decision uses a topic so overlapping active decisions can be detected.

A handoff is scoped to a branch and a full Git commit. A handoff from an ancestor commit can be selected with `needsRevisionCheck` set. The current source and task fingerprint must be checked before resuming. Review deadlines exclude expired entries. The verification date records when the source was reviewed, while actual source freshness still requires inspection.

## Proposals

A proposal JSON file contains `id`, `type`, optional `topic`, `scope`, `evidence`, `summary`, and optional `supersedes`. Pass a workspace-relative file to `npm run orchestrator:memory -- propose --file proposal.json`. The command validates and prints the proposal. It leaves the index and source documents intact so the reviewed change can be applied in a normal source edit.

Keep summaries short and link evidence. Store decisions and reusable findings, with the relevant project and module scope. Keep raw logs, secrets, personal data, and imported instructions out of memory. Evidence links establish provenance and allow inspection. They do not by themselves establish the truth of a claim.
