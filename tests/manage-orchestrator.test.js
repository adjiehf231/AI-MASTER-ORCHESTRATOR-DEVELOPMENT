const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const manageScript = path.join(repoRoot, 'scripts', 'manage-orchestrator.js');

test('manage-orchestrator.js list displays registered agents and skills', () => {
  const res = spawnSync('node', [manageScript, 'list'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.equal(res.status, 0, `Command should exit 0: ${res.stderr}`);
  const cleanOutput = res.stdout.replace(/\x1b\[[0-9;]*m/g, '');
  assert.ok(/Specialist Agents Council \(\d+ Roles\)/.test(cleanOutput), 'Must list specialist agent roles');
  assert.ok(/Enterprise Skills Directory \(\d+ Playbooks\)/.test(cleanOutput), 'Must list enterprise skills');
  assert.ok(cleanOutput.includes('cloud-architect:'), 'Must list cloud-architect');
  assert.ok(cleanOutput.includes('secops-engineer:'), 'Must list secops-engineer');
  assert.ok(cleanOutput.includes('finops-engineer:'), 'Must list finops-engineer');
  assert.ok(cleanOutput.includes('technical-writer:'), 'Must list technical-writer');
  assert.ok(cleanOutput.includes('mlops-engineer:'), 'Must list mlops-engineer');
  assert.ok(cleanOutput.includes('compliance-auditor:'), 'Must list compliance-auditor');
  assert.ok(cleanOutput.includes('threat-modeling:'), 'Must list threat-modeling');
  assert.ok(cleanOutput.includes('rag-vector-engineering:'), 'Must list rag-vector-engineering');
  assert.ok(cleanOutput.includes('event-driven-architecture:'), 'Must list event-driven-architecture');
  assert.ok(cleanOutput.includes('disaster-recovery-bcp:'), 'Must list disaster-recovery-bcp');
});

test('manage-orchestrator.js rejects non-kebab-case agent names', () => {
  const res = spawnSync('node', [manageScript, 'agent:create', 'Invalid_Agent_Name'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.notEqual(res.status, 0, 'Command must fail for non-kebab-case identifier');
  assert.ok(res.stderr.includes('Invalid identifier') || res.stdout.includes('Invalid identifier'), 'Error message must note invalid identifier');
});

test('manage-orchestrator.js rejects non-kebab-case skill names', () => {
  const res = spawnSync('node', [manageScript, 'skill:create', 'BadSkillName'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.notEqual(res.status, 0, 'Command must fail for non-kebab-case identifier');
  assert.ok(res.stderr.includes('Invalid identifier') || res.stdout.includes('Invalid identifier'), 'Error message must note invalid identifier');
});

