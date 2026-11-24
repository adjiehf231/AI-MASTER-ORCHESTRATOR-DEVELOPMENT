# Context efficiency

The orchestrator loads a short core workflow and discovers specialist descriptions through native skill discovery or `adapters/component-catalog.json`. The `context-efficient-development` skill handles scoped source exploration. Use the read-only `context-engineer` profile for a bounded exploration or handoff when its result can reduce repeated work.

## Local context commands

Install the pinned dependencies in the orchestrator source installation with `npm ci --ignore-scripts`. Run the short npm commands below from that source directory. They target the current directory by default; pass `--workspace <absolute-root>` to select another Git project.

```bash
npm run orchestrator:context -- search --query "buildAdapters" --path scripts/sync-adapters.js
npm run orchestrator:context -- read --ref "<ref returned by search>" --start-line 1 --end-line 30
npm run orchestrator:context -- task --path scripts --tag backend
npm run orchestrator:context -- task --task-id "<UUID>"
npm run orchestrator:context -- audit --baseline 6c15c79
```

An external project does not need these npm scripts in its own package. Invoke the installed source runtime with an explicit target workspace instead:

```bash
node "<orchestrator-source>/scripts/context.js" search --workspace "<project-root>" --query "authorize" --path src
npm --prefix "<orchestrator-source>" run orchestrator:context -- task --workspace "<project-root>" --path src
```

Search returns literal text matches with paths, line numbers, content digests, and source references. Read returns the exact source text for the requested range. It can paginate inside a large line and reports UTF-16 columns for that case. Use the returned cursor with the same command and source inputs to continue. A source edit invalidates its previous reference. Pagination also checks the request and source state.

Responses use compact JSON with a default 8,192-byte budget. Set `--max-bytes` between 1,024 and 32,768. The budget covers the serialized context result. MCP protocol metadata and host-added context consume additional space. If metadata or the next entry cannot fit, increase the budget or narrow the paths. Inspect `truncated`, `nextCursor`, and coverage before making a claim about the search.

The service searches Git tracked and nonignored files. It excludes linked paths, credential filenames, binary data, common build outputs, files above 1 MiB, and managed copies of unchanged native profiles during default search. Explicit paths can search a managed copy. Scan coverage records skipped files and the scan limit. These controls constrain local retrieval. Choose source paths based on the active task and permissions.

## Connect the MCP

The local stdio server exposes `get_task_context`, `search_context`, and `read_context`. It performs source retrieval and context selection without model requests.

```bash
node scripts/context-mcp.js --workspace "<absolute-project-root>"
npm run orchestrator:context -- config --host codex --workspace "<absolute-project-root>"
npm run orchestrator:context -- config --host claude --workspace "<absolute-project-root>"
npm run orchestrator:context -- config --host opencode --workspace "<absolute-project-root>"
npm run orchestrator:context -- config --host antigravity --workspace "<absolute-project-root>"
```

The `config` command prints concrete configuration for the source installation and selected project. Merge the relevant server entry into the host's existing MCP configuration, preserving its other settings. Generated templates under `adapters/` use `__ORCHESTRATOR_SOURCE_ROOT__` and `__WORKSPACE_ROOT__` placeholders. Replace both before use.

For this repository, root `AGENTS.md` connects Codex to the canonical workflow. A trusted workspace can load its MCP server from `.codex/config.toml`; use the printed Codex entry with the explicit workspace. Keep that machine-specific configuration in a local Git exclusion and merge with existing project settings. Verify it with `codex mcp get orchestrator-context --json` from the workspace. Open a fresh Codex session to check native discovery after configuration changes.

| Host | Integration |
| --- | --- |
| Codex | Discover the generated `.agents/skills/` entry and `.codex/agents/context-engineer.toml`. Use the printed TOML server entry with the installed client. Role permissions follow the parent session and host enforcement. |
| Claude Code | Load `CLAUDE.md`, `.claude/agents/`, and `.claude/skills/`. Merge the printed entry into the appropriate MCP configuration. The context agent has a native read-tool allowlist. |
| OpenCode | `opencode.json` selects the primary profile, and project instructions point to source references. Skills are discoverable through `.agents/skills/`. Merge the printed V2 `mcp.servers` entry. |
| Antigravity App, IDE, CLI | Use the plugin or workspace configuration for the installed surface. `npm run deploy:antigravity -- --workspace "<absolute-project-root>"` prepares a local bundle at `ANTIGRAVITY_PLUGIN_DIR` or the configured default. Its MCP points back to this source installation. Validate and load it in the installed host. |

Antigravity deployment requires this source directory, its Node dependencies, and the selected project to remain available. Redeploy after moving the source. The transport uses text results, so it also works on hosts that do not render MCP App views. Discovery, native permissions, model selection, context panels, and compaction depend on the installed host version.

## TODO, handoff, and memory

Use the stable task ID and the commands in [Task Workflow](TASK_WORKFLOW.md). A task report records executed checks and outstanding blockers. `get_task_context` can retrieve the current scoped TODO, decision, route, and indexed memory summaries. It reports foundation services that are unavailable in a target project.

Use `npm run orchestrator:memory -- context --path scripts` for selected memory or `npm run orchestrator:memory -- check` to validate the index. Keep facts tied to their evidence and recheck stale handoffs. [Memory guide](../memory/MEMORY_GUIDE.md)

## Measure the result

`audit` reports source bytes and word counts for the root instructions and main native profiles. A baseline uses an explicit Git revision. Newly installed instruction paths have baseline status `NOT_PRESENT` and no reduction percentage. The report labels these as source measurements. It excludes host prompts, discovery metadata, tool schemas, history, compaction calls, and other agent requests.

Evaluate real tasks on a fixed host, model, and fixture. Include the complete main-agent and subagent input/output, retries, cached input where available, elapsed time, and acceptance-criterion results. Count cached input according to the provider's definition to avoid counting it twice. Use the pilot cases in `orchestration/context-evaluations.json` to record comparable trials. Unknown telemetry stays `NOT_RUN` or unavailable.

The deterministic regression suite checks discovery of the three tools with the official MCP SDK client, exact source retrieval, pagination, invalidation, boundaries, task evidence, and memory scope. These checks establish local tool behavior. Model task completion and end-to-end token use are evaluated separately for each host.
