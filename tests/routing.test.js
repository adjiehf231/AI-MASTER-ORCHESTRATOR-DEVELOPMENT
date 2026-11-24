const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { planTask, readRoutes, validateInventory } = require('../scripts/lib/routing');

const root = path.resolve(__dirname, '..');
const inventory = {
  host: 'test-host',
  tools: [
    { id: 'reader', kind: 'local', status: 'available', access: 'read', capabilities: ['workspace-read'] },
    { id: 'terminal', kind: 'native', status: 'available', access: 'write', capabilities: ['terminal', 'workspace-write'] },
    { id: 'browser', kind: 'mcp', status: 'available', access: 'read', capabilities: ['browser'] },
    { id: 'agents', kind: 'native', status: 'available', access: 'write', capabilities: ['subagents'] }
  ]
};

test('routing selects scoped work and escalates authorization and database changes', () => {
  assert.ok(readRoutes(root).length >= 23);
  const small = planTask(root, { tags: ['backend'], risk: 'low' });
  assert.equal(small.lead, 'backend-engineer');
  assert.equal(small.reviewMode, 'lead-only');
  assert.equal(small.skills.length, 1);
  const ui = planTask(root, { paths: ['src/components/settings.tsx'], risk: 'medium', inventory });
  assert.equal(ui.route, 'frontend');
  assert.equal(ui.reviewers.length, 1);
  assert.equal(ui.reviewMode, 'subagents-available');
  const secure = planTask(root, { tags: ['authorization'], operation: 'edit', inventory });
  assert.equal(secure.risk, 'high');
  assert.equal(secure.lead, 'backend-engineer');
  assert.ok(secure.reviewers.includes('security-engineer'));
  assert.ok(secure.reviewers.includes('qa-engineer'));
  const db = planTask(root, { tags: ['database'], risk: 'low' });
  assert.equal(db.risk, 'high');
  assert.equal(db.reviewMode, 'same-session');
  assert.equal(db.tools.find(tool => tool.capability === 'subagents').status, 'NOT_RUN');
});

test('tool routing honors a denied capability across MCP and local alternatives', () => {
  const host = structuredClone(inventory);
  host.deniedCapabilities = ['workspace-write'];
  host.tools.push({
    id: 'mcp-editor', kind: 'mcp', status: 'available', access: 'write', capabilities: ['workspace-write']
  });
  const plan = planTask(root, { tags: ['backend'], operation: 'edit', inventory: host });
  assert.equal(plan.tools.find(tool => tool.capability === 'workspace-write').status, 'BLOCKED');
  assert.equal(plan.tools.find(tool => tool.capability === 'workspace-read').selected.id, 'reader');
  assert.throws(() => validateInventory({ ...inventory, tools: [inventory.tools[0], inventory.tools[0]] }), /duplicated/);
  assert.throws(() => planTask(root, { paths: ['../other/repo'] }), /relative/);
  assert.throws(() => planTask(root, { routeId: 'missing' }), /Unknown route/);
});

test('route enrollment rejects unresolved custom components', t => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'routing-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  fs.mkdirSync(path.join(fixture, 'orchestration'));
  fs.writeFileSync(path.join(fixture, 'orchestration/routes.json'), JSON.stringify({
    version: 1, routes: [{
      id: 'general', label: 'Local custom work', lead: 'unknown-agent',
      reviewers: [], skills: ['custom'], needs: ['workspace-read'], tags: ['custom']
    }]
  }));
  assert.throws(() => readRoutes(fixture), /unresolved agent unknown-agent/);
});
