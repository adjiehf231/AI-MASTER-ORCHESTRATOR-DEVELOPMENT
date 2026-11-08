const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

test('sync-adapters.js generates all platform adapters deterministically', () => {
  const syncScript = path.join(repoRoot, 'scripts', 'sync-adapters.js');
  const res = spawnSync('node', [syncScript], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.equal(res.status, 0, `Sync script must exit 0: ${res.stderr}`);

  // Check generated root files
  assert.ok(fs.existsSync(path.join(repoRoot, 'CLAUDE.md')), 'Must generate CLAUDE.md');
  assert.ok(fs.existsSync(path.join(repoRoot, '.cursorrules')), 'Must generate .cursorrules');
  assert.ok(fs.existsSync(path.join(repoRoot, '.windsurfrules')), 'Must generate .windsurfrules');
  assert.ok(fs.existsSync(path.join(repoRoot, '.clinerules')), 'Must generate .clinerules');
  assert.ok(fs.existsSync(path.join(repoRoot, '.opencoderules')), 'Must generate .opencoderules');
  assert.ok(fs.existsSync(path.join(repoRoot, 'CONVENTIONS.md')), 'Must generate CONVENTIONS.md');
  assert.ok(fs.existsSync(path.join(repoRoot, '.aider.conf.yml')), 'Must generate .aider.conf.yml');
  assert.ok(fs.existsSync(path.join(repoRoot, '.continue', 'rules', 'universal-orchestrator.md')), 'Must generate continue.dev rules');

  // Check subagents directories (F06)
  assert.ok(fs.existsSync(path.join(repoRoot, '.claude', 'agents', 'security-engineer.md')), 'Must generate Claude subagents');
  assert.ok(fs.existsSync(path.join(repoRoot, '.opencode', 'agents', 'security-engineer.md')), 'Must generate OpenCode subagents');
  assert.ok(fs.existsSync(path.join(repoRoot, 'adapters', 'opencode', 'AGENTS.md')), 'Must generate OpenCode AGENTS.md');

  // Check Antigravity (F06)
  assert.ok(fs.existsSync(path.join(repoRoot, 'adapters', 'antigravity', 'rules', 'AGENTS.md')), 'Must generate Antigravity rules');
  assert.ok(fs.existsSync(path.join(repoRoot, 'adapters', 'antigravity', 'plugin.json')), 'Must generate Antigravity plugin manifest');

  // Check folded scalar parsed properly without literal >- (F05)
  const bundleContent = fs.readFileSync(path.join(repoRoot, 'adapters', 'bundle', 'universal-system-prompt.md'), 'utf8');
  assert.ok(!bundleContent.includes('(ui-ux-design-system): >-'), 'Folded scalar >- must be resolved into full description');
});
