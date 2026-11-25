const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { fixture } = require('./updater-fixture');
const planning = require('../scripts/lib/updater/planning');
const transaction = require('../scripts/lib/updater/transaction');
const storage = require('../scripts/lib/updater/storage');
const { shortDirectoryAlias } = require('./windows-path-alias');

function directOptions(f, relative = 'ai-orchestrator/skills/fixture/SKILL.md') {
  const before = storage.snapshotFile(f.project, relative);
  const mode = before.mode ?? (process.platform === 'win32' ? 0o666 : (0o644 & ~process.umask()));
  return { workspace: f.project, store: f.store, installPath: 'ai-orchestrator', quiescent: true,
    expectedGit: planning.snapshotGit(f.project), verify: () => {},
    operations: [{ path: relative, before, after: { dataBase64: Buffer.from('Updated fixture bytes\n').toString('base64'), mode } }],
    receipt: { schemaVersion: 1, workspace: f.project, installPath: 'ai-orchestrator', installationId: storage.installationId(f.project, 'ai-orchestrator') } };
}
function rollbackOptions(options, transactionId) {
  return { workspace: options.workspace, store: options.store, installPath: options.installPath, transactionId, quiescent: true };
}
function windowsAcl(target, body) {
  const executable = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const code = '$ErrorActionPreference="Stop";$p=$env:UPDATER_TEST_TARGET;$a=Get-Acl -LiteralPath $p;' + body + ';Set-Acl -LiteralPath $p -AclObject $a';
  const env = { UPDATER_TEST_TARGET: target };
  for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP']) if (process.env[key]) env[key] = process.env[key];
  const result = spawnSync(executable, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(code, 'utf16le').toString('base64')], { env, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
}

test('private metadata parsing never exposes malformed input in errors', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'updater-private-json-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'private.json');
  const secret = 'DEMO_PRIVATE_CONTEXT';
  fs.writeFileSync(file, secret);
  assert.throws(() => storage.readJson(file), error => {
    assert.equal(error.message, 'Invalid private metadata JSON');
    assert.equal(error.cause, undefined);
    assert.equal(String(error.stack).includes(secret), false);
    return true;
  });
  assert.equal(fs.readFileSync(file, 'utf8'), secret);
});

test('private metadata readers reject linked directory ancestors', t => {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'updater-linked-json-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'source'); fs.mkdirSync(source);
  const file = path.join(source, 'private.json');
  const contents = JSON.stringify({ value: 'DEMO_PRIVATE_CONTEXT' }); fs.writeFileSync(file, contents);
  const linked = path.join(directory, 'linked');
  fs.symlinkSync(source, linked, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => storage.readJson(path.join(linked, 'private.json')), /Linked or unsupported directory ancestor/);
  assert.equal(fs.readFileSync(file, 'utf8'), contents);
});

test('Windows metadata launch errors identify the missing tool without exposing its path', { skip: process.platform !== 'win32' }, t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'updater-native-error-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const systemRoot = process.env.SystemRoot;
  process.env.SystemRoot = path.join(directory, 'missing-system-root');
  try {
    assert.throws(() => storage.processIdentity(), error => {
      assert.match(error.message, /powershell\.exe executable missing/);
      assert.equal(error.message.includes(directory), false);
      assert.equal(error.cause, undefined);
      return true;
    });
  } finally {
    if (systemRoot === undefined) delete process.env.SystemRoot;
    else process.env.SystemRoot = systemRoot;
  }
});

test('an existing Windows short store alias cannot overlap a workspace or source', { skip: process.platform !== 'win32' }, t => {
  const f = fixture(t);
  const alias = shortDirectoryAlias(f.store);
  if (!alias || path.basename(alias).toLowerCase() === path.basename(f.store).toLowerCase()) {
    t.skip('The filesystem does not expose a distinct short alias for the final store component.');
    return;
  }
  // This root already has a verified private DACL, so privacy checks must not
  // accidentally permit the canonical workspace/source overlap through its alias.
  assert.throws(() => storage.assertPrivateStore(alias, { workspace: f.store, create: false }), /must be separate/);
  assert.throws(() => storage.assertPrivateStore(alias, { workspace: f.project, sourceRoot: f.store, create: false }), /must be separate/);
});

test('a verified update and rollback preserve custom data and the Git index', t => {
  const f = fixture(t); const before = f.protectedBytes(); const gitBefore = planning.snapshotGit(f.project);
  f.adopt();
  const plan = planning.planUpdate(f.options(f.next()));
  assert.equal(plan.status, 'READY', JSON.stringify(plan.blockers));
  assert.ok(plan.operations.length);
  const result = f.apply(plan);
  assert.equal(result.state, 'COMMITTED');
  assert.match(fs.readFileSync(path.join(f.project, 'ai-orchestrator/skills/fixture/SKILL.md'), 'utf8'), /New guidance/);
  assert.deepEqual(f.protectedBytes(), before);
  const after = planning.snapshotGit(f.project);
  assert.equal(after.head, gitBefore.head); assert.equal(after.indexSha256, gitBefore.indexSha256);
  const repeated = planning.planUpdate(f.options({ releaseRoot: plan.release.root }));
  assert.equal(repeated.status, 'NOOP');
  const rolled = transaction.rollbackTransaction({ workspace: f.project, store: f.store, installPath: 'ai-orchestrator', transactionId: result.transactionId, quiescent: true });
  assert.equal(rolled.state, 'ROLLED_BACK');
  assert.match(fs.readFileSync(path.join(f.project, 'ai-orchestrator/skills/fixture/SKILL.md'), 'utf8'), /Old guidance/);
  assert.deepEqual(f.protectedBytes(), before);
  assert.deepEqual(planning.snapshotGit(f.project), gitBefore);
});

test('rollback refuses to overwrite edits made after an update', t => {
  const f = fixture(t); f.adopt(); const plan = planning.planUpdate(f.options(f.next())); const result = f.apply(plan);
  const target = path.join(f.project, 'ai-orchestrator/skills/fixture/SKILL.md');
  fs.writeFileSync(target, 'New user content after update\n');
  assert.throws(() => transaction.rollbackTransaction({ workspace: f.project, store: f.store, installPath: 'ai-orchestrator', transactionId: result.transactionId, quiescent: true }), /Recovery conflict/);
  assert.equal(fs.readFileSync(target, 'utf8'), 'New user content after update\n');
});

test('quiescence, signed revalidation and verified backups are mandatory', t => {
  const f = fixture(t); const plan = planning.planAdoption(f.options(f.base));
  assert.throws(() => f.apply(plan, { quiescent: false }), /quiescent/);
  assert.throws(() => transaction.applyTransaction({ workspace: f.project, store: f.store, installPath: 'ai-orchestrator', quiescent: true }), /revalidation/);
  f.adopt(); const update = planning.planUpdate(f.options(f.next()));
  assert.throws(() => f.apply(update, { fault: ({ phase, transactionId }) => {
    if (phase === 'BACKUP_VERIFIED') {
      const dir = path.join(f.store, 'transactions', storage.installationId(f.project, 'ai-orchestrator'), transactionId);
      fs.writeFileSync(path.join(dir, 'before-0.bin'), 'corrupt'); throw new Error('Injected backup corruption');
    }
  } }), /Injected backup/);
  assert.match(fs.readFileSync(path.join(f.project, 'ai-orchestrator/skills/fixture/SKILL.md'), 'utf8'), /Old guidance/);
  assert.throws(() => f.apply(update), /unfinished transaction/);
});

test('a caught apply failure rolls back only known updater postimages', t => {
  const f = fixture(t); f.adopt(); const before = f.protectedBytes(); const plan = planning.planUpdate(f.options(f.next()));
  let id;
  assert.throws(() => f.apply(plan, { fault: ({ phase, transactionId }) => { id = transactionId; if (phase === 'APPLIED') throw new Error('Injected interruption'); } }), /Injected interruption/);
  assert.equal(transaction.statusTransaction({ workspace: f.project, store: f.store, installPath: 'ai-orchestrator', transactionId: id }).state, 'ROLLED_BACK');
  assert.match(fs.readFileSync(path.join(f.project, 'ai-orchestrator/skills/fixture/SKILL.md'), 'utf8'), /Old guidance/);
  assert.deepEqual(f.protectedBytes(), before);
});

test('a killed updater retains verified recovery data and explicitly recovers its stale lock', t => {
  const f = fixture(t); const options = directOptions(f); const target = path.join(f.project, options.operations[0].path);
  const original = fs.readFileSync(target); const gitBefore = planning.snapshotGit(f.project);
  const input = path.join(f.store, 'child-options.json');
  const { verify, ...serializable } = options;
  storage.writeJson(input, serializable);
  const script = 'const fs=require("node:fs");const tx=require(process.argv[1]);const o=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));tx.applyTransaction({...o,verify:()=>{},fault:({phase})=>{if(phase==="APPLIED")process.kill(process.pid,"SIGKILL")}});';
  const child = spawnSync(process.execPath, ['-e', script, require.resolve('../scripts/lib/updater/transaction'), input], { encoding: 'utf8', windowsHide: true, timeout: 90000 });
  assert.ifError(child.error); assert.notEqual(child.status, 0, child.stderr);
  const status = transaction.statusTransaction(rollbackOptions(options));
  assert.equal(status.transactions.length, 1);
  const id = status.transactions[0].transactionId;
  assert.equal(status.transactions[0].state, 'APPLYING');
  assert.equal(fs.readFileSync(target, 'utf8'), 'Updated fixture bytes\n');
  assert.throws(() => transaction.applyTransaction(options), /explicit recover\/rollback/);
  const recovered = transaction.recoverTransaction(rollbackOptions(options, id));
  assert.equal(recovered.state, 'ROLLED_BACK');
  assert.deepEqual(fs.readFileSync(target), original);
  assert.deepEqual(planning.snapshotGit(f.project), gitBefore);
  const journalPath = path.join(f.store, 'transactions', options.receipt.installationId, id, 'journal.json');
  const journal = storage.readJson(journalPath); journal.createdAt = 'tampered'; storage.writeJson(journalPath, journal);
  assert.throws(() => transaction.applyTransaction(options), /Corrupt or mismatched/);
  assert.deepEqual(fs.readFileSync(target), original);
});

test('permission-only edits after apply are preserved, including Windows ACL-only drift', t => {
  const f = fixture(t); const options = directOptions(f); const target = path.join(f.project, options.operations[0].path);
  const result = transaction.applyTransaction(options); const bytes = fs.readFileSync(target);
  const originalMode = fs.statSync(target).mode & 0o777;
  fs.chmodSync(target, 0o444);
  try {
    assert.throws(() => transaction.rollbackTransaction(rollbackOptions(options, result.transactionId)), /Recovery conflict/);
    assert.deepEqual(fs.readFileSync(target), bytes);
    assert.equal(fs.statSync(target).mode & 0o222, 0);
  } finally { fs.chmodSync(target, originalMode); }
  if (process.platform === 'win32') {
    const before = storage.snapshotFile(f.project, options.operations[0].path);
    windowsAcl(target, '$a.SetAccessRuleProtection($true,$true)');
    const after = storage.snapshotFile(f.project, options.operations[0].path);
    assert.equal(before.mode, after.mode);
    assert.notDeepEqual(before.metadata, after.metadata);
    assert.throws(() => transaction.rollbackTransaction(rollbackOptions(options, result.transactionId)), /Recovery conflict/);
    assert.deepEqual(fs.readFileSync(target), bytes);
  }
});

test('a live process lock cannot be stolen and unknown ownership fails closed', t => {
  const f = fixture(t); const options = directOptions(f);
  const directory = storage.privateSubdirectory(f.store, `installations/${options.receipt.installationId}`);
  const lock = path.join(directory, 'write.lock'); fs.mkdirSync(lock);
  const owner = { schemaVersion: 1, installationId: options.receipt.installationId, pid: process.pid, start: storage.processIdentity().start, token: 'test-owner' };
  storage.writeJson(path.join(lock, 'owner.json'), { ...owner, checksum: storage.sha256(storage.canonical(owner)) });
  assert.throws(() => transaction.applyTransaction(options), /Another updater owns/);
  storage.writeDurable(path.join(lock, 'owner.json'), Buffer.from('broken-owner'));
  assert.throws(() => transaction.applyTransaction(options), /ownership is unknown/);
  assert.match(fs.readFileSync(path.join(f.project, options.operations[0].path), 'utf8'), /Old guidance/);
});

test('unsafe private store permissions and deletion operations fail before project mutation', t => {
  const f = fixture(t); const options = directOptions(f); const target = path.join(f.project, options.operations[0].path);
  const before = fs.readFileSync(target);
  assert.throws(() => transaction.applyTransaction({ ...options, operations: [{ ...options.operations[0], after: null }] }), /deletion is unsupported/);
  assert.deepEqual(fs.readFileSync(target), before);
  const unsafeStore = path.join(f.temp, 'unsafe-store'); fs.mkdirSync(unsafeStore, { mode: 0o755 });
  assert.throws(() => storage.assertPrivateStore(unsafeStore, { workspace: f.project, create: false }), /metadata capability|mode 0700/);
  assert.deepEqual(fs.readFileSync(target), before);
});

test('new files use supported native modes and rollback preserves later permission edits', t => {
  const f = fixture(t); const options = directOptions(f, 'ai-orchestrator/skills/added/SKILL.md');
  const result = transaction.applyTransaction(options);
  const target = path.join(f.project, options.operations[0].path);
  assert.equal(fs.statSync(target).mode & 0o777, options.operations[0].after.mode);
  fs.chmodSync(target, 0o444);
  assert.throws(() => transaction.rollbackTransaction(rollbackOptions(options, result.transactionId)), /Recovery conflict/);
  assert.equal(fs.readFileSync(target, 'utf8'), 'Updated fixture bytes\n');
  fs.chmodSync(target, options.operations[0].after.mode);
  assert.equal(transaction.rollbackTransaction(rollbackOptions(options, result.transactionId)).state, 'ROLLED_BACK');
  assert.equal(fs.existsSync(target), false);
  assert.equal(fs.existsSync(path.dirname(target)), true, 'Empty created directories retain any later directory metadata');
});
