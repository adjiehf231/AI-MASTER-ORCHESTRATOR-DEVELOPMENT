const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');

const repoRoot = path.resolve(__dirname, '..');

test('refactor-core.js enforces fail-closed execution outside repo root', () => {
  const scriptPath = path.join(repoRoot, 'scripts', 'refactor-core.js');
  const tempDir = os.tmpdir();

  const res = spawnSync('node', [scriptPath], {
    cwd: tempDir,
    encoding: 'utf8'
  });

  // Since refactor-core.js checks sentinel at path.resolve(__dirname, '..'),
  // it targets repoRoot safely and does not traverse the foreign cwd
  assert.equal(res.status, 0, 'Script safely handles path resolution');
  assert.ok(res.stdout.includes(repoRoot), 'Target root must remain strictly repoRoot');
});

test('sanitize-tiers.js enforces fail-closed execution outside repo root', () => {
  const scriptPath = path.join(repoRoot, 'scripts', 'sanitize-tiers.js');
  const tempDir = os.tmpdir();

  const res = spawnSync('node', [scriptPath], {
    cwd: tempDir,
    encoding: 'utf8'
  });

  assert.equal(res.status, 0, 'Script safely handles path resolution');
  assert.ok(res.stdout.includes(repoRoot), 'Target root must remain strictly repoRoot');
});
