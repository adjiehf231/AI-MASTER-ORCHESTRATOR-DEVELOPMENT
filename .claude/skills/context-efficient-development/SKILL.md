---
name: context-efficient-development
description: Gather focused source context for code investigations, long logs, and multi-session development while retaining contracts, failed checks, and evidence. Use when context is large or repeated reads slow the task.
---

# Efficient Context for Development

Start with the task's acceptance criteria and TODO. Identify the question each source must answer before reading it.

1. Search paths, symbols, callers, or the exact error with the available native tool or `search_context`. Load the selected skill and its relevant references when needed.
2. Read the relevant function, contract, validation, and failure path using native readers or `read_context`. Expand to callers and dependencies when authorization, transactions, or edge cases remain unclear.
3. Keep path, line range, and source revision or digest with the evidence. Recheck sources after edits. Paginated or summarized results describe their coverage and how to retrieve the next part.
4. Share a bounded brief with a specialist when its independent work adds value. Include the question, relevant paths, acceptance criteria, and expected output. Inspect the returned source references before relying on its conclusion.
5. Preserve TODO, decisions, authorizations, failing checks, and remaining work in a handoff. Report checks as PASS, FAIL, NOT_RUN, or BLOCKED with supporting evidence.

Use `get_task_context` when the context MCP is available to select task and memory references. Native search and readers provide the fallback when the server is unavailable. MCP tools return only the context owned by that service. The host controls its conversation history and compaction.

Read [evidence-preservation](references/evidence-preservation.md) when paging through long source or logs, preparing a handoff, or comparing token usage. Read [host-integration](references/host-integration.md) when configuring a host or diagnosing discovery.
