#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod/v4');

function createContextServer(workspace) {
  const root = fs.realpathSync(workspace);
  if (!fs.statSync(root).isDirectory()) throw new Error('Workspace must be a directory.');
  const { getTaskContext, searchContext, readContext } = require('./lib/context');
  const server = new McpServer({ name: 'orchestrator-context', version: '1.0.0' }, {
    instructions: 'Search and read local project sources in bounded excerpts. Follow cursors and check source digests before making broader claims.',
    maxToolInputElements: 256
  });
  const paths = z.array(z.string().min(1).max(512)).max(32).optional();
  const maxBytes = z.number().int().min(1024).max(32768).optional();
  const cursor = z.string().min(1).max(4096).optional();
  const annotations = {
    readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false
  };

  function register(name, description, inputSchema, execute) {
    server.registerTool(name, { description, inputSchema, annotations }, args => {
      try {
        const result = execute(root, args);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (error) {
        const message = String(error.message).replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').slice(0, 512);
        return { isError: true, content: [{ type: 'text', text: message }] };
      }
    });
  }

  register('get_task_context', 'Get relevant TODO, routing and memory excerpts for a local task.',
    z.object({
      taskId: z.string().uuid().optional(),
      paths,
      tags: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).max(32).optional(),
      cursor, maxBytes
    }).strict(), getTaskContext);
  register('search_context', 'Find literal text in project sources and return versioned excerpt references.',
    z.object({
      query: z.string().min(1).max(512), paths,
      limit: z.number().int().min(1).max(100).optional(),
      cursor, maxBytes
    }).strict(), searchContext);
  register('read_context', 'Read a versioned source excerpt, continuing with a cursor when truncated.',
    z.object({
      ref: z.string().min(1).max(4096),
      startLine: z.number().int().min(1).optional(),
      endLine: z.number().int().min(1).optional(),
      cursor, maxBytes
    }).strict(), readContext);
  return server;
}

async function main(args) {
  const { values } = parseArgs({
    args, options: { workspace: { type: 'string' }, help: { type: 'boolean' } }
  });
  if (values.help) {
    console.log('Usage: node scripts/context-mcp.js --workspace <project-root>');
    return;
  }
  if (!values.workspace) throw new Error('An explicit --workspace is required.');
  const server = createContextServer(path.resolve(values.workspace));
  await server.connect(new StdioServerTransport());
  const close = () => server.close().catch(error => {
    console.error('MCP shutdown failed: ' + error.message);
    process.exitCode = 1;
  });
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(error => {
    console.error('Context MCP failed: ' + error.message);
    process.exitCode = 1;
  });
}

module.exports = { createContextServer };
