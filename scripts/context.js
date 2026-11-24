#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { spawnSync } = require('node:child_process');

const instructionPaths = [
  'CLAUDE.md', 'agents/orchestrator.md',
  'adapters/opencode/AGENTS.md', '.opencode/agents/orchestrator.md',
  'adapters/antigravity/rules/AGENTS.md', 'adapters/codex/AGENTS.md'
];
const toolNames = ['get_task_context', 'search_context', 'read_context'];

function measure(text) {
  return { bytes: Buffer.byteLength(text), words: text.match(/\S+/g)?.length ?? 0 };
}

function git(root, args) {
  const result = spawnSync('git', ['--no-optional-locks', ...args], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 10_000, maxBuffer: 4 * 1024 * 1024
  });
  if (result.error || result.status !== 0) throw new Error('Cannot read the requested Git baseline.');
  return result.stdout;
}

function auditContext(root, baseline) {
  let baselineRevision;
  let baselinePaths;
  if (baseline !== undefined) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_./-]{0,127}$/.test(baseline)) throw new Error('Invalid baseline ref.');
    baselineRevision = git(root, ['rev-parse', '--verify', '--end-of-options', baseline + '^{commit}']).trim();
    baselinePaths = new Set(git(root, ['ls-tree', '-r', '--name-only', baselineRevision, '--', ...instructionPaths]).trim().split('\n'));
  }
  const files = [];
  for (const filename of instructionPaths) {
    const full = path.join(root, filename);
    if (!fs.statSync(full, { throwIfNoEntry: false })?.isFile()) continue;
    const current = measure(fs.readFileSync(full, 'utf8'));
    const item = { path: filename, current };
    if (baselineRevision) {
      item.baselineStatus = baselinePaths.has(filename) ? 'PRESENT' : 'NOT_PRESENT';
      item.baseline = baselinePaths.has(filename) ? measure(git(root, ['show', baselineRevision + ':' + filename])) : null;
      item.byteReductionPercent = item.baseline?.bytes ? Math.round((1 - current.bytes / item.baseline.bytes) * 10000) / 100 : null;
    }
    files.push(item);
  }
  return {
    measurement: 'source-utf8-bytes-and-words',
    baselineRevision: baselineRevision ?? null,
    modelUsage: null,
    note: 'Source sizes exclude host instructions, skill discovery, tool schemas, history and all model calls.',
    files
  };
}

function contextConfig(host, workspace) {
  const root = fs.realpathSync(workspace);
  if (!fs.statSync(root).isDirectory()) throw new Error('Workspace must be a directory.');
  const runtime = path.resolve(__dirname, 'context-mcp.js');
  const args = [runtime, '--workspace', root];
  const entry = { command: process.execPath, args };
  switch (host) {
    case 'claude':
      return JSON.stringify({ mcpServers: { 'orchestrator-context': { type: 'stdio', ...entry } } }, null, 2);
    case 'antigravity':
      return JSON.stringify({ mcpServers: { 'orchestrator-context': entry } }, null, 2);
    case 'opencode':
      return JSON.stringify({ mcp: { servers: {
        'orchestrator-context': { type: 'local', command: [process.execPath, ...args] }
      } } }, null, 2);
    case 'codex':
      return [
        '[mcp_servers.orchestrator-context]',
        'command = ' + JSON.stringify(process.execPath),
        'args = ' + JSON.stringify(args),
        'enabled_tools = ' + JSON.stringify(toolNames)
      ].join('\n');
    default:
      throw new Error('Choose host claude, codex, opencode or antigravity.');
  }
}

function integer(value, name) {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(name + ' must be an integer.');
  return Number(value);
}

function main(args) {
  const { values, positionals } = parseArgs({
    args, allowPositionals: true,
    options: {
      workspace: { type: 'string' }, query: { type: 'string' }, ref: { type: 'string' },
      path: { type: 'string', multiple: true }, tag: { type: 'string', multiple: true },
      'task-id': { type: 'string' }, 'start-line': { type: 'string' }, 'end-line': { type: 'string' },
      'max-bytes': { type: 'string' }, limit: { type: 'string' }, cursor: { type: 'string' },
      baseline: { type: 'string' }, host: { type: 'string' }, help: { type: 'boolean' }
    }
  });
  if (values.help || positionals.length === 0) {
    console.log('Usage: npm run orchestrator:context -- task|search|read|audit|config [options]');
    console.log('  task --task-id <id> --path <relative> --tag <tag>');
    console.log('  search --query <text> --path <relative> --limit <count>');
    console.log('  read --ref <source-ref> --start-line <n> --end-line <n>');
    console.log('  audit --baseline <git-ref>');
    console.log('  config --host codex|claude|opencode|antigravity --workspace <root>');
    console.log('  Retrieval options: --workspace <root> --max-bytes 1024..32768 --cursor <cursor>. Repeat path or tag.');
    return;
  }
  if (positionals.length !== 1) throw new Error('Expected a single context command.');
  const command = positionals[0];
  const root = path.resolve(values.workspace ?? process.cwd());
  if (command === 'config') {
    console.log(contextConfig(values.host, root));
    return;
  }
  if (command === 'audit') {
    console.log(JSON.stringify(auditContext(root, values.baseline), null, 2));
    return;
  }
  const { getTaskContext, searchContext, readContext } = require('./lib/context');
  const common = { maxBytes: integer(values['max-bytes'], 'max-bytes'), cursor: values.cursor };
  let result;
  switch (command) {
    case 'task':
      result = getTaskContext(root, { ...common, taskId: values['task-id'], paths: values.path, tags: values.tag });
      break;
    case 'search':
      result = searchContext(root, { ...common, query: values.query, paths: values.path, limit: integer(values.limit, 'limit') });
      break;
    case 'read':
      result = readContext(root, {
        ...common, ref: values.ref,
        startLine: integer(values['start-line'], 'start-line'), endLine: integer(values['end-line'], 'end-line')
      });
      break;
    default:
      throw new Error('Unknown context command: ' + command);
  }
  // Keep the same compact serialization used to enforce the retrieval byte budget.
  console.log(JSON.stringify(result));
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error('Context command failed: ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = { auditContext, contextConfig };
