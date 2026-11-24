const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { contextConfig, auditContext } = require('../scripts/context');

const repo = path.resolve(__dirname, '..');

test('context audit compares existing baseline files and reports newly installed instructions explicitly', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'context-audit-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  };
  git('init', '--quiet');
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), 'original workflow instructions\n');
  git('add', '.');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '--quiet', '-m', 'baseline');
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), 'short workflow\n');
  fs.mkdirSync(path.join(root, '.opencode/agents'), { recursive: true });
  fs.writeFileSync(path.join(root, '.opencode/agents/orchestrator.md'), 'new profile\n');
  const result = auditContext(root, 'HEAD');
  const existing = result.files.find(file => file.path === 'CLAUDE.md');
  const added = result.files.find(file => file.path === '.opencode/agents/orchestrator.md');
  assert.equal(existing.baselineStatus, 'PRESENT');
  assert.equal(existing.baseline.bytes, Buffer.byteLength('original workflow instructions\n'));
  assert.ok(existing.byteReductionPercent > 0);
  assert.equal(added.baselineStatus, 'NOT_PRESENT');
  assert.equal(added.baseline, null);
  assert.equal(added.byteReductionPercent, null);
  assert.equal(result.modelUsage, null);
  assert.throws(() => auditContext(root, 'missing-baseline'), /Cannot read the requested Git baseline/);
});

test('the official MCP client discovers exactly three read-only tools and reads bounded versioned sources', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-context-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const init = spawnSync('git', ['init', '--quiet'], { cwd: root, encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'flow.js'), [
    'export function authorize(user, record) {',
    '  return user.tenantId === record.tenantId;',
    '}'
  ].join('\n'));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repo, 'scripts/context-mcp.js'), '--workspace', root],
    cwd: os.tmpdir(),
    stderr: 'pipe'
  });
  const client = new Client({ name: 'context-regression-client', version: '1.0.0' });
  let stderr = '';
  transport.stderr.on('data', chunk => { stderr += chunk; });
  t.after(() => client.close());
  await client.connect(transport);
  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map(tool => tool.name).sort(), ['get_task_context', 'read_context', 'search_context']);
  assert.ok(listed.tools.every(tool => tool.annotations.readOnlyHint && !tool.annotations.destructiveHint));
  const invalid = await client.callTool({ name: 'search_context', arguments: { query: 'authorize', maxBytes: 1 } });
  assert.equal(invalid.isError, true);
  const result = await client.callTool({
    name: 'search_context', arguments: { query: 'authorize', paths: ['src'], maxBytes: 2048 }
  });
  assert.equal(result.isError, undefined);
  const json = result.content.find(block => block.type === 'text').text;
  assert.ok(Buffer.byteLength(json) <= 2048);
  const search = JSON.parse(json);
  assert.equal(search.entries[0].path, 'src/flow.js');
  const source = await client.callTool({ name: 'read_context', arguments: { ref: search.entries[0].ref } });
  const read = JSON.parse(source.content[0].text);
  assert.match(read.content, /user\.tenantId === record\.tenantId/);
  assert.equal(read.truncated, false);
  const task = await client.callTool({ name: 'get_task_context', arguments: { paths: ['src'] } });
  assert.equal(JSON.parse(task.content[0].text).services.task, 'NOT_REQUESTED');
  const escaped = await client.callTool({ name: 'search_context', arguments: { query: 'authorize', paths: ['../outside'] } });
  assert.equal(escaped.isError, true);
  fs.appendFileSync(path.join(root, 'src', 'flow.js'), '\n// updated\n');
  const stale = await client.callTool({ name: 'read_context', arguments: { ref: search.entries[0].ref } });
  assert.equal(stale.isError, true);
  assert.match(stale.content[0].text, /stale/);
  assert.equal(stderr, '');
});

test('each host configuration refers to the same explicit workspace and source runtime', () => {
  const workspace = fs.realpathSync(repo);
  const claude = JSON.parse(contextConfig('claude', workspace));
  const ag = JSON.parse(contextConfig('antigravity', workspace));
  const openCode = JSON.parse(contextConfig('opencode', workspace));
  assert.equal(claude.mcpServers['orchestrator-context'].type, 'stdio');
  assert.deepEqual(ag.mcpServers['orchestrator-context'].args, claude.mcpServers['orchestrator-context'].args);
  assert.deepEqual(openCode.mcp.servers['orchestrator-context'].command.slice(1), claude.mcpServers['orchestrator-context'].args);
  assert.equal(claude.mcpServers['orchestrator-context'].args.at(-1), workspace);
  assert.match(contextConfig('codex', workspace), /\[mcp_servers\.orchestrator-context\]/);
  assert.throws(() => contextConfig('unknown', workspace), /Choose host/);
  const startup = spawnSync(process.execPath, ['scripts/context-mcp.js'], { cwd: repo, encoding: 'utf8' });
  assert.equal(startup.status, 1);
  assert.equal(startup.stdout, '');
  assert.match(startup.stderr, /explicit --workspace/);
});
