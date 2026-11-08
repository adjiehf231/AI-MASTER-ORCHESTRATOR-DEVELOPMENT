const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const verifyGatesScript = path.join(repoRoot, 'scripts', 'verify-gates.js');

test('verify-gates.js validates Gates 0, 1, and 2 successfully', () => {
  const res = spawnSync('node', [verifyGatesScript], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.equal(res.status, 0, `verify-gates.js must exit 0: ${res.stderr}`);
  assert.ok(res.stdout.includes('Gate 0: Static Hygiene & Code Sanitation... ✅ PASSED'), 'Gate 0 must pass');
  assert.ok(res.stdout.includes('Gate 1: Definition of Ready (DoR)... ✅ PASSED'), 'Gate 1 must pass');
  assert.ok(res.stdout.includes('Gate 2: Definition of Done (DoD)... ✅ PASSED'), 'Gate 2 must pass');
  assert.ok(res.stdout.includes('ALL RELEASE QUALITY GATES PASSED'), 'Final verdict must be passed');
});

