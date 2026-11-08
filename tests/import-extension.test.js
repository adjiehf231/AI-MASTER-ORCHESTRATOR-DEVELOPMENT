const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const importerScript = path.join(repoRoot, 'scripts', 'import-extension.js');

test('import-extension.js shows usage instructions with --help', () => {
  const res = spawnSync('node', [importerScript, '--help'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.equal(res.status, 0, 'CLI help must exit 0');
  assert.ok(res.stdout.includes('Universal AI Master Orchestrator: Extension Importer CLI'), 'Must show CLI header');
  assert.ok(res.stdout.includes('--type=agent|skill'), 'Must show parameter flags');
});

test('import-extension.js validates required arguments', () => {
  const res = spawnSync('node', [importerScript, '--type=invalid-type', '--name=test-agent', '--file=nonexistent.md'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.notEqual(res.status, 0, 'Must fail on invalid type');
  assert.ok(res.stderr.includes('Type must be "agent" or "skill"') || res.stdout.includes('Type must be "agent" or "skill"'), 'Must print type validation error');
});

