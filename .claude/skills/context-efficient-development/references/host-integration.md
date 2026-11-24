# Host Integration

Use the host's native skill discovery and read the selected skill body on demand. The generated component catalog provides names, descriptions, and source paths when native discovery is unavailable.

Native MCP configuration examples are generated under `adapters/claude/`, `adapters/codex/`, `adapters/opencode/`, and `adapters/antigravity/`. Replace source and workspace placeholders with the intended absolute directories before enabling a template. Install runtime dependencies in the source repository first. Keep the workspace root restricted to the project being inspected.

The Antigravity deploy command writes a source-linked MCP configuration pointing to the installed repository runtime. Moving or removing that source installation requires redeploying the plugin. Verify discovery, tool calls, and access controls on each host version used in development.

The context MCP exposes `get_task_context`, `search_context`, and `read_context`. Each host manages history, compaction, provider cache, and other servers through its own configuration. Observe those settings through the host's supported diagnostics.

The Codex context-agent file uses native custom-agent TOML. Its host permissions are inherited from the parent session. Use a parent session with enforced read-only access when that isolation is required. The role disables its shell, apps, and plugins, and uses the parent-configured context MCP for scoped source reads.
