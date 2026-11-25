const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { fixture, repo } = require('./updater-fixture');
const planning = require('../scripts/lib/updater/planning');
const release = require('../scripts/lib/updater/release');
const storage = require('../scripts/lib/updater/storage');

function invoke(f, command, args = []) {
  return spawnSync(process.execPath, [path.join(repo, 'scripts/update-orchestrator.js'), command,
    '--workspace', f.project, '--store', f.store, ...args], { cwd: f.temp, encoding: 'utf8', windowsHide: true, timeout: 120000 });
}
function success(result) { assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout); }

test('public CLI adopts, plans, applies, reports and rolls back with project state preserved', t => {
  const f = fixture(t); const original = f.protectedBytes(); const index = planning.snapshotGit(f.project).indexSha256;
  f.write(f.project, 'AGENTS.md', '# Project rules\r\nPreserve local decisions.\r\n');
  const adoption = success(invoke(f, 'adopt', ['--release', f.base.releaseRoot, '--trust', f.trust]));
  assert.equal(adoption.status, 'READY'); assert.equal(adoption.operations.length, 0);
  assert.ok(fs.existsSync(adoption.planPath)); assert.ok(fs.existsSync(adoption.reports.markdownPath));
  assert.equal(JSON.stringify(adoption).includes('contentBase64'), false);
  assert.equal(JSON.stringify(adoption).includes('synthetic-canary'), false);
  assert.deepEqual(f.protectedBytes(), original);
  const applied = success(invoke(f, 'apply', ['--plan', adoption.planPath, '--trust', f.trust, '--quiescent']));
  assert.equal(applied.state, 'COMMITTED');
  const next = f.next();
  const update = success(invoke(f, 'plan', ['--release', next.releaseRoot, '--trust', f.trust]));
  assert.equal(update.status, 'READY'); assert.ok(update.operations.length > 0);
  const installed = success(invoke(f, 'auto', ['--release', next.releaseRoot, '--trust', f.trust, '--quiescent']));
  assert.equal(installed.state, 'COMMITTED');
  assert.equal(installed.activationStatus, 'PENDING_HOST_INTEGRATION');
  assert.match(fs.readFileSync(path.join(f.project, 'ai-orchestrator/skills/fixture/SKILL.md'), 'utf8'), /New guidance/);
  const status = success(invoke(f, 'status'));
  assert.equal(status.transactions.length, 2);
  const check = success(invoke(f, 'check', ['--release', next.releaseRoot, '--trust', f.trust]));
  assert.equal(check.status, 'NOOP');
  // Simulate the durable window after receipt persistence but before COMMITTED.
  // Matching receipt/files must not let a no-op bypass pending-journal guards.
  const journalFile = path.join(installed.backupDirectory, 'journal.json');
  const journal = storage.readJson(journalFile);
  const persistState = state => {
    const value = { ...journal, state }; delete value.checksum;
    storage.writeJson(journalFile, { ...value, checksum: storage.sha256(storage.canonical(value)) });
  };
  persistState('VALIDATED');
  const pending = invoke(f, 'auto', ['--release', next.releaseRoot, '--trust', f.trust, '--quiescent']);
  assert.notEqual(pending.status, 0); assert.match(JSON.parse(pending.stderr).error, /unfinished transaction/);
  persistState('COMMITTED');
  const noOp = success(invoke(f, 'auto', ['--release', next.releaseRoot, '--trust', f.trust, '--quiescent']));
  assert.equal(noOp.noOp, true); assert.equal(noOp.changedFiles, 0);
  const rolled = success(invoke(f, 'rollback', ['--transaction', installed.transactionId, '--quiescent']));
  assert.equal(rolled.state, 'ROLLED_BACK');
  assert.match(fs.readFileSync(path.join(f.project, 'ai-orchestrator/skills/fixture/SKILL.md'), 'utf8'), /Old guidance/);
  assert.equal(planning.snapshotGit(f.project).indexSha256, index);
  assert.deepEqual(f.protectedBytes(), original);
  assert.equal(fs.readFileSync(path.join(f.project, 'AGENTS.md'), 'utf8'), '# Project rules\r\nPreserve local decisions.\r\n');
});

test('blocked plans and invalid CLI inputs return failures with reports and no project writes', t => {
  const f = fixture(t); const before = planning.snapshotGit(f.project); const bytes = f.protectedBytes();
  const blocked = invoke(f, 'plan', ['--release', f.base.releaseRoot, '--trust', f.trust]);
  assert.equal(blocked.status, 2);
  const summary = JSON.parse(blocked.stdout); assert.equal(summary.status, 'BLOCKED');
  assert.ok(fs.existsSync(summary.reports.jsonPath));
  const apply = invoke(f, 'apply', ['--plan', summary.planPath, '--trust', f.trust, '--quiescent']);
  assert.notEqual(apply.status, 0); assert.equal(JSON.parse(apply.stderr).status, 'FAIL');
  const force = invoke(f, 'apply', ['--force']); assert.notEqual(force.status, 0);
  const inside = invoke(f, 'init-store', ['--store', path.join(f.project, 'bad-store')]); assert.notEqual(inside.status, 0);
  assert.equal(fs.existsSync(path.join(f.project, 'bad-store')), false);
  assert.deepEqual(planning.snapshotGit(f.project), before); assert.deepEqual(f.protectedBytes(), bytes);
});

test('publisher CLI packs authenticated passive artifacts without executing package hooks', t => {
  const f = fixture(t); const output = path.join(f.temp, 'cli-release');
  const result = spawnSync(process.execPath, [path.join(repo, 'scripts/update-orchestrator.js'), 'pack', '--source', f.source,
    '--out', output, '--key', f.key, '--revision', '1'.repeat(40)], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  const packed = success(result);
  assert.equal(packed.digest, f.base.digest);
  assert.equal(release.verifyRelease({ releaseRoot: output, trustFile: f.trust, workspace: f.project }).revision, '1'.repeat(40));
});
