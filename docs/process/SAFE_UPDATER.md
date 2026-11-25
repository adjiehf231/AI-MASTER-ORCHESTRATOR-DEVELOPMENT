# Safe project updater

The updater consumes a local, signed passive release and a public trust file selected outside the project and release. It can adopt byte-identical vendor files, produce a bound update plan, apply unchanged owned files, and recover or roll back through verified backups. It never runs code from a release, package hooks, project Git filters, database operations, or automatic Git mutations.

This is a conservative first implementation. It updates owned files inside a descendant installation directory named `ai-orchestrator` and supported native agent/skill paths. Unrecognized content is project-owned. Project context, memory, task/history state, secrets, app source and root package metadata remain protected. A locally modified vendor file is preserved; an upstream change to that file blocks the plan.

## Scope and prerequisites

- Node.js 22.18 or newer and Git.
- Windows: built-in Windows PowerShell, a fixed NTFS volume, and current-user private storage with a protected DACL.
- Linux: Python 3 standard library for complete supported xattr/mode inspection; local ext4, xfs, btrfs, tmpfs or overlay filesystem.
- macOS and other platforms currently support passive package/render operations only. Apply/recovery are blocked until reliable process identity and filesystem capability are implemented and verified.
- A separate private store outside the project, source, and release. Its parent directory must already exist. The updater does not weaken existing storage permissions to make an operation succeed.
- Explicit quiescence for apply/recovery: pause cooperating writers and readers of managed files, including legacy sync scripts. The lock coordinates updater processes; it does not stop an arbitrary editor or synchronization agent. A digest check followed by a write is not a cross-platform atomic CAS.

Existing file writes preserve the inode, ACLs and xattrs through in-place updates. Journaled bytes and supported metadata are compared before writing, before commit and during rollback. Windows snapshots include owner/group/DACL and nonvolatile attributes; privileged SACL audit state, timestamps and the volatile Archive flag are not comparison fields. Those fields are not rewritten by the updater. Additional data streams, hardlinks, symlinks/junction ancestors, unsupported file flags and automatic deletion are rejected.

In-place writes are not atomic for concurrent readers. A process interruption after a partial write can produce `RECOVERY_REQUIRED`; backups and candidate bytes remain available and unknown bytes are not silently replaced. The updater makes no universal power-loss or runtime semantic-equivalence guarantee.

## Consumer workflow

Run commands from the orchestrator source installation, or invoke its `scripts/update-orchestrator.js` by absolute path. Do not replace the application's package or lockfile with this package.

```powershell
npm run orchestrator:update -- init-store --workspace "D:\PROJECT" --store "D:\PRIVATE\orchestrator-store"
npm run orchestrator:update -- inspect --workspace "D:\PROJECT" --store "D:\PRIVATE\orchestrator-store"

# The signed bundle must represent a known old baseline for first adoption.
npm run orchestrator:update -- adopt --workspace "D:\PROJECT" --store "D:\PRIVATE\orchestrator-store" --release "D:\RELEASES\baseline" --trust "D:\TRUST\publisher.json"

# Read the summary and the private plan before applying its exact contents.
npm run orchestrator:update -- apply --workspace "D:\PROJECT" --store "D:\PRIVATE\orchestrator-store" --plan "<planPath returned above>" --trust "D:\TRUST\publisher.json" --quiescent

npm run orchestrator:update -- plan --workspace "D:\PROJECT" --store "D:\PRIVATE\orchestrator-store" --release "D:\RELEASES\new-version" --trust "D:\TRUST\publisher.json"
npm run orchestrator:update -- apply --workspace "D:\PROJECT" --store "D:\PRIVATE\orchestrator-store" --plan "<new planPath>" --trust "D:\TRUST\publisher.json" --quiescent
```

`adopt` creates a proposal; its `apply` records ownership and a cached signed baseline without replacing project files. Unknown baselines and pre-existing custom bytes cannot be claimed by name. Inspect/adopt/plan/check do not write project files. Their reports and plans live in private storage. `--install-path tools/ai-orchestrator` supports an explicitly selected nested installation.

Inspection includes a bounded metadata-only inventory of installation/native roots, including ignored/untracked custom files. Protected directories and links are listed without traversal; coverage reports truncation and errors. Detailed entries are written to a private inventory file. Only this inventory is metadata-only: planning reads the selected project context and hashes candidate target files; Git status may hash ordinary tracked files. Raw context is retained only in private plans/receipts. Plan reports list ownership claims and bounded change previews; stdout contains summaries rather than raw context/candidate bytes.

`check` uses the same required `--release` and `--trust` inputs as `plan`. There is no automatic remote feed or release download. A plan binds the workspace, baseline, source bytes, project context, exact external trust file, Git state, supported metadata and candidates. Editing/re-hashing a plan does not authorize new content: apply rederives it from signed sources and ownership policy. Changed inputs require a new plan.

After adoption, `auto` explicitly opts into planning and applying a conflict-free signed update in one invocation. Supply the same workspace/store/release/trust arguments plus `--quiescent`. Blockers still exit 2 without project mutations; there is no force fallback. Repeating the installed release produces a verified no-op. This command does not create a scheduler or imply that writers have actually paused.

The process leaves HEAD, index and staged changes alone. A dirty target blocks replacement; unrelated work is retained. Projects with configured Git content filters are blocked before status inspection so an external clean/process driver cannot run. Tracked conventional credential filenames also block before status; this deliberately conservative rule includes names such as `.env.example` and `tokens.ts`. Protection follows known names/path namespaces and is not a detector for secrets embedded in arbitrarily named files. Do not bypass these blockers with force; use a separately reviewed migration.

## Shared settings and activation

Shared root rules/configuration are proposals in this version. Existing `AGENTS.md`, `CLAUDE.md`, MCP servers, YAML/TOML/JSON settings and other host rules are not automatically replaced. Markdown region composition exists as a pure renderer, but the planner does not adopt shared root regions. Fragment content is available in the private plan. Review and integrate it separately with the project's existing instructions.

`COMMITTED` means verified file installation and receipt persistence. `PENDING_HOST_INTEGRATION` or `PENDING_HOST_RELOAD` explicitly means native activation has not been established. Runtime dependencies are not installed, and MCP source/workspace placeholders are not silently enabled. Required executable checks, new agent authority, permission changes, file deletion and unsupported configuration migration block automatic apply. Existing custom scripts/policies remain protected; arbitrary overlay semantics are not automatically reconciled.

For legacy integrations such as `THANUR-OFFICE`, maintain the project-specific context and memory and inventory the old sync writers/checks before activation. This implementation has not updated that running project. First rehearse against a disposable fixture/copy without production credentials or databases.

## Status, recovery and rollback

```powershell
npm run orchestrator:update -- status --workspace "D:\PROJECT" --store "D:\PRIVATE\orchestrator-store"
npm run orchestrator:update -- recover --workspace "D:\PROJECT" --store "D:\PRIVATE\orchestrator-store" --transaction "<id>" --quiescent
npm run orchestrator:update -- rollback --workspace "D:\PROJECT" --store "D:\PRIVATE\orchestrator-store" --transaction "<id>" --quiescent
```

Every target has a before-image backup and candidate whose hashes are verified before the first project mutation. Intent and postimage records are flushed to a checksummed journal. A dead process lock needs explicit recovery; age alone never removes an active or unknown lock. An unfinished/corrupt transaction blocks another apply.

Recovery rolls back interrupted work only where the current state equals the recorded before/postimage. Rollback of a committed update is explicit. A newer content, permission or supported ACL/xattr edit is a conflict and is retained. Changed Git HEAD/index, corrupt backup/journal and unknown partial writes also stop recovery. Review the private journal, backup and candidate rather than overwriting the current state.

Backups/journals are retained; there is no automatic prune. Empty updater-created directories may remain after rollback because their later permission/ACL state cannot safely be inferred. No recursive project cleanup is performed.

Exit 0 indicates successful planning/checking or a committed/no-op/rolled-back operation as reported. A blocked plan exits 2; invalid/unsafe/failed operations exit 1. Installation success does not imply host activation success. JSON/Markdown reports exclude raw candidate/context bytes from summaries; complete plans and backups must stay private because shared/project content can be sensitive.

## Publisher and trust

A release directory contains `manifest.json`, `signature.json` and exactly the signed `payload/` files. Ed25519 signatures bind canonical manifest bytes; every file has a raw byte hash, size and fixed supported mode. File count, traversal depth, path/case/Unicode collisions and total bytes are bounded. Active `PROJECT_CONTEXT.md`, memory, task state and credential namespaces are excluded from packing.

```powershell
npm run orchestrator:update -- pack --source "D:\PUBLISHER\checkout" --out "D:\RELEASES\candidate" --key "D:\PRIVATE\signing.pem" --revision "<full revision digest>"
```

Keep the signing key outside the source. The low-level pack command signs the supplied revision label and payload; it does not itself attest a clean Git checkout. `scripts/publish-updater-release.js` additionally requires a clean exact checkout of `GITHUB_SHA`, reads only allowlisted tracked blobs from that exact commit into private staging, and uses a private temporary signing directory. Ignored files and concurrent worktree content cannot enter that artifact.

Trust JSON format:

```json
{"schemaVersion":1,"keys":{"<public-key-id>":"<Ed25519 public PEM>"}}
```

Obtain the public key through an independently trusted channel. Do not automatically trust a public key merely because it accompanies an artifact. The trust file must be outside both release and project and is bound by path and byte hash into each plan. Signing authenticates the configured publisher; it does not prove arbitrary new code's runtime behavior.

The optional `publish-updater.yml` workflow is manual only, restricted to protected `main`, and gated by repository variable `UPDATER_PUBLISH_ENABLED=true`. Configure the protected `updater-release` environment and its `UPDATER_SIGNING_KEY_PEM` secret before use. It runs gates and Gitleaks before exposing the signing secret, prepares a signed artifact and uploads it as an Actions artifact; it does not publish an npm package or update any project. No publisher key or workflow dispatch was created by this implementation.
