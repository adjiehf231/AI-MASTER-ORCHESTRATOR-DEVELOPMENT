const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

test('.gitignore covers sensitive environment variants and tracks .env.example (F10)', () => {
  const check = spawnSync('git', ['check-ignore', '--no-index', '.env', '.env.production', '.env.test', '.env.example'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  const ignored = check.stdout.split(/\r?\n/).filter(Boolean);
  assert.ok(ignored.includes('.env'), '.env must be ignored');
  assert.ok(ignored.includes('.env.production'), '.env.production must be ignored');
  assert.ok(ignored.includes('.env.test'), '.env.test must be ignored');
  assert.ok(!ignored.includes('.env.example'), '.env.example must NOT be ignored');
});
