const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const storage = require('./storage');
const { allowedTarget, installRelative, snapshotGit } = require('./planning');
const { ensureDistinct } = require('./release');

const terminal = new Set(['COMMITTED', 'ROLLED_BACK']);
const states = new Set(['PREPARED', 'BACKUP_VERIFIED', 'APPLYING', 'VALIDATED', 'COMMITTED', 'RECOVERY_REQUIRED', 'ROLLING_BACK', 'ROLLED_BACK']);
const digestPattern = /^[a-f0-9]{64}$/;
function check(condition, message) { if (!condition) throw new Error(message); }
function trustedCall(callback) {
  if (!callback) return;
  const result = callback();
  check(!result || typeof result.then !== 'function', 'Transaction validation callbacks must be synchronous');
}
function identity(options, create) {
  const workspace = storage.regularRoot(options.workspace);
  const installPath = installRelative(options.installPath);
  const store = storage.assertPrivateStore(options.store, { workspace, create });
  return { workspace, installPath, store, installationId: storage.installationId(workspace, installPath) };
}
function transactionPath(info, id) {
  check(typeof id === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id), 'Invalid transaction ID');
  return path.join(info.store, 'transactions', info.installationId, id);
}
function seal(journal) {
  const value = { ...journal }; delete value.checksum;
  return { ...value, checksum: storage.sha256(storage.canonical(value)) };
}
function save(directory, journal) {
  journal.updatedAt = new Date().toISOString();
  const sealed = seal(journal);
  check(Buffer.byteLength(storage.canonical(sealed)) <= 32 * 1024 * 1024, 'Transaction journal exceeds its supported bound');
  storage.writeJson(path.join(directory, 'journal.json'), sealed);
}
function load(info, id) {
  const directory = transactionPath(info, id);
  storage.regularRoot(directory);
  const journal = storage.readJson(path.join(directory, 'journal.json'));
  const sealed = seal(journal);
  check(journal.checksum === sealed.checksum && journal.schemaVersion === 1 && journal.transactionId === id
    && journal.workspace === info.workspace && journal.installPath === info.installPath && journal.installationId === info.installationId
    && states.has(journal.state) && Array.isArray(journal.entries) && journal.entries.length <= 4096
    && Array.isArray(journal.createdDirectories), 'Corrupt or mismatched transaction journal');
  for (const entry of journal.entries) {
    check(allowedTarget(entry.path, info.installPath), 'Journal contains a protected target');
    check(typeof entry.backup === 'string' && /^before-[0-9]+\.bin$/.test(entry.backup), 'Invalid backup reference');
    check(entry.before && ['file', 'absent'].includes(entry.before.type) && typeof entry.before.exists === 'boolean'
      && entry.before.exists === (entry.before.type === 'file') && (!entry.before.exists || (digestPattern.test(entry.before.sha256) && entry.before.metadata))
      && entry.after && digestPattern.test(entry.after.sha256) && Number.isInteger(entry.after.mode), 'Unsupported journal operation; automatic deletion is unsupported');
  }
  ensureDistinct(journal.entries.map(e => e.path));
  for (const relative of journal.createdDirectories) {
    storage.validateRelative(relative);
    check(journal.entries.some(entry => entry.path.startsWith(`${relative}/`)), 'Journal contains an unrelated directory removal');
  }
  return { directory, journal };
}
function pendingTransactions(info) {
  const root = path.join(info.store, 'transactions', info.installationId);
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(storage.regularRoot(root)).map(id => load(info, id).journal).filter(journal => !terminal.has(journal.state));
}
function lock(info, recover = false) {
  const parent = storage.privateSubdirectory(info.store, `installations/${info.installationId}`);
  const directory = path.join(parent, 'write.lock');
  try { fs.mkdirSync(directory, { mode: 0o700 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const ownerPath = path.join(storage.regularRoot(directory), 'owner.json');
    let owner;
    try { owner = storage.readJson(ownerPath, 8192); } catch { throw new Error('Lock ownership is unknown; inspect the private lock before recovery'); }
    const { checksum, ...ownerValue } = owner;
    check(checksum === storage.sha256(storage.canonical(ownerValue)) && owner.schemaVersion === 1
      && owner.installationId === info.installationId && Number.isSafeInteger(owner.pid) && owner.pid > 0
      && typeof owner.start === 'string' && owner.start.length > 0 && typeof owner.token === 'string', 'Invalid lock owner; lock ownership is unknown');
    const current = storage.processIdentity(owner.pid);
    check(!current.alive || current.start !== owner.start, 'Another updater owns this installation lock');
    check(recover, 'Interrupted updater lock requires explicit recover/rollback');
    fs.unlinkSync(ownerPath); fs.rmdirSync(directory);
    fs.mkdirSync(directory, { mode: 0o700 });
  }
  const self = storage.processIdentity();
  check(self.alive && typeof self.start === 'string', 'Reliable lock identity is unavailable');
  const token = crypto.randomUUID();
  const ownerValue = { schemaVersion: 1, installationId: info.installationId, pid: process.pid, start: self.start, token };
  storage.writeDurable(path.join(directory, 'owner.json'), Buffer.from(storage.canonical({ ...ownerValue, checksum: storage.sha256(storage.canonical(ownerValue)) })), true);
  return () => {
    const owner = storage.readJson(path.join(directory, 'owner.json'), 8192);
    check(owner.token === token, 'Updater lock ownership changed');
    fs.unlinkSync(path.join(directory, 'owner.json')); fs.rmdirSync(directory);
  };
}
function gitGuard(info, expected) {
  check(expected && expected.root === info.workspace, 'Expected Git state is not bound to this workspace');
  const actual = snapshotGit(info.workspace);
  check(actual.head === expected.head && actual.indexSha256 === expected.indexSha256, 'Git HEAD or index changed; update/recovery must preserve the current Git state');
}
function receiptFile(info) { return path.join(info.store, 'installations', info.installationId, 'installed.json'); }
function readReceipt(info) {
  const file = receiptFile(info);
  return fs.existsSync(file) ? storage.readJson(file, 4 * 1024 * 1024) : null;
}
function checkReceipt(info, journal) {
  const current = storage.canonical(readReceipt(info));
  check(current === storage.canonical(journal.receiptBefore) || current === storage.canonical(journal.receiptAfter), 'Installation receipt was changed after the transaction');
}
function markFault(fault, phase, journal, index) { if (fault) fault({ phase, transactionId: journal.transactionId, index }); }
function prepareOperations(info, operations) {
  check(Array.isArray(operations) && operations.length <= 4096, 'Invalid transaction operations');
  ensureDistinct(operations.map(op => op.path));
  let total = 0, metadataBytes = 0;
  return operations.map((op, index) => {
    check(allowedTarget(op.path, info.installPath), 'Transaction attempts to write a protected path');
    check(op.after !== null && op.after && typeof op.after.dataBase64 === 'string', 'Automatic deletion is unsupported; preserve the file and resolve its removal separately');
    const bytes = Buffer.from(op.after.dataBase64, 'base64');
    check(bytes.toString('base64') === op.after.dataBase64 && bytes.length <= storage.MAX_FILE_BYTES, 'Invalid or oversized candidate bytes');
    total += bytes.length;
    check(total <= 32 * 1024 * 1024, 'Transaction exceeds byte limit');
    const defaultMode = process.platform === 'win32' ? 0o666 : (0o644 & ~process.umask());
    check(Number.isInteger(op.after.mode) && op.after.mode === (op.before?.mode ?? defaultMode), 'Automatic permission changes are unsupported');
    const before = storage.snapshotFile(info.workspace, op.path);
    check(storage.sameState(before, op.before), 'A transaction target changed after planning');
    metadataBytes += Buffer.byteLength(storage.canonical(before));
    check(metadataBytes <= 8 * 1024 * 1024, 'Transaction metadata exceeds its supported bound');
    return { path: op.path, before, after: { sha256: storage.sha256(bytes), mode: op.after.mode }, backup: `before-${index}.bin`, candidate: `after-${index}.bin`, phase: 'PREPARED', post: null };
  });
}
function validateBackup(directory, entry) {
  const file = path.join(directory, entry.backup);
  if (!entry.before.exists) { check(!fs.existsSync(file), 'Unexpected backup for an absent preimage'); return null; }
  const bytes = fs.readFileSync(storage.inspectTarget(directory, entry.backup).target);
  check(bytes.length <= storage.MAX_FILE_BYTES && storage.sha256(bytes) === entry.before.sha256, 'Backup digest mismatch; recovery is blocked');
  return bytes;
}
function validateCandidate(directory, entry) {
  check(/^after-[0-9]+\.bin$/.test(entry.candidate), 'Invalid candidate reference');
  const inspected = storage.inspectTarget(directory, entry.candidate);
  check(inspected.stat, 'Candidate is missing');
  const bytes = fs.readFileSync(inspected.target);
  check(storage.sha256(bytes) === entry.after.sha256, 'Candidate digest mismatch');
  return bytes;
}
function parentDirectories(info, relative, journal, directory) {
  let current = info.workspace;
  const parts = storage.validateRelative(relative).slice(0, -1);
  for (const part of parts) {
    current = path.join(current, part);
    if (!fs.existsSync(current)) {
      const rel = path.relative(info.workspace, current).replaceAll(path.sep, '/');
      journal.createdDirectories.push(rel); save(directory, journal);
      fs.mkdirSync(current, { mode: 0o755 }); storage.fsyncDirectory(path.dirname(current));
    }
    storage.regularRoot(current);
  }
}
function replaceBytes(info, relative, bytes, expected, mode) {
  check(storage.sameState(storage.snapshotFile(info.workspace, relative), expected), 'Target bytes or native permissions changed before writing');
  const { target, stat } = storage.inspectTarget(info.workspace, relative);
  const fd = fs.openSync(target, (expected.exists ? fs.constants.O_RDWR : fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL) | (fs.constants.O_NOFOLLOW || 0), mode);
  try {
    const opened = fs.fstatSync(fd);
    check(opened.isFile() && opened.nlink === 1 && (!stat || (opened.dev === stat.dev && opened.ino === stat.ino)), 'Target identity changed before writing');
    if (expected.exists) {
      const current = fs.readFileSync(fd);
      check(storage.sha256(current) === expected.sha256, 'Target bytes changed before writing');
    }
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.writeSync(fd, bytes, offset, bytes.length - offset, offset);
      check(count > 0, 'Candidate write made no progress'); offset += count;
    }
    fs.ftruncateSync(fd, bytes.length); fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  storage.fsyncDirectory(path.dirname(target));
}
function knownPost(entry, current) {
  if (entry.post) return storage.sameState(current, entry.post);
  // A crash before the postimage metadata was persisted is never guessed safe.
  return false;
}
function restore(info, directory, journal, fault) {
  gitGuard(info, journal.expectedGit); checkReceipt(info, journal);
  const actions = [];
  for (const entry of journal.entries) {
    const bytes = validateBackup(directory, entry);
    const current = storage.snapshotFile(info.workspace, entry.path);
    if (storage.sameState(current, entry.before)) continue;
    check(knownPost(entry, current), `Recovery conflict: newer or partial content/permissions at ${entry.path}; current bytes were preserved`);
    actions.push({ entry, current, bytes });
  }
  journal.state = 'ROLLING_BACK'; save(directory, journal);
  for (const { entry, current, bytes } of actions.reverse()) {
    gitGuard(info, journal.expectedGit);
    check(storage.sameState(storage.snapshotFile(info.workspace, entry.path), current), 'Recovery target changed after preflight');
    if (entry.before.exists) {
      replaceBytes(info, entry.path, bytes, current, entry.before.mode);
      check(storage.sameState(storage.snapshotFile(info.workspace, entry.path), entry.before), 'Restored preimage verification failed; recovery remains required');
    }
    else { const target = storage.inspectTarget(info.workspace, entry.path).target; fs.unlinkSync(target); storage.fsyncDirectory(path.dirname(target)); }
    entry.phase = 'RESTORED'; save(directory, journal); markFault(fault, 'RESTORED', journal);
  }
  if (journal.receiptBefore === null) { if (fs.existsSync(receiptFile(info))) fs.unlinkSync(receiptFile(info)); }
  else storage.writeJson(receiptFile(info), journal.receiptBefore);
  storage.fsyncDirectory(path.dirname(receiptFile(info)));
  // Retain empty created directories: deleting them would need a separately
  // journaled native directory-metadata baseline to preserve later ACL edits.
  journal.state = 'ROLLED_BACK'; save(directory, journal);
}
function applyTransaction(options) {
  check(options.quiescent === true, 'Apply requires explicit quiescent/cooperating-writer acknowledgement');
  check(typeof options.verify === 'function', 'A trusted signed-plan revalidation callback is required');
  const info = identity(options, true);
  storage.assertSupportedFilesystem(info.workspace);
  storage.assertSupportedFilesystem(info.store);
  const releaseLock = lock(info);
  let directory, journal;
  try {
    check(pendingTransactions(info).length === 0, 'An unfinished transaction requires explicit recovery before another apply');
    check(options.receipt && options.receipt.schemaVersion === 1 && options.receipt.workspace === info.workspace
      && options.receipt.installPath === info.installPath && options.receipt.installationId === info.installationId, 'A bound installation receipt is required');
    check(Buffer.byteLength(storage.canonical(options.receipt)) <= 4 * 1024 * 1024, 'Installation receipt exceeds its supported bound');
    trustedCall(options.verify); trustedCall(options.guard); gitGuard(info, options.expectedGit);
    const previous = readReceipt(info);
    const entries = prepareOperations(info, options.operations);
    const id = crypto.randomUUID();
    directory = storage.privateSubdirectory(info.store, `transactions/${info.installationId}/${id}`);
    journal = { schemaVersion: 1, transactionId: id, installationId: info.installationId, workspace: info.workspace, installPath: info.installPath,
      state: 'PREPARED', expectedGit: options.expectedGit, receiptBefore: previous, receiptAfter: options.receipt, entries, createdDirectories: [], createdAt: new Date().toISOString() };
    save(directory, journal); markFault(options.fault, 'PREPARED', journal);
    for (const [index, entry] of entries.entries()) {
      if (entry.before.exists) {
        check(storage.sameState(storage.snapshotFile(info.workspace, entry.path), entry.before), 'Preimage changed before backup');
        storage.writeDurable(path.join(directory, entry.backup), fs.readFileSync(storage.inspectTarget(info.workspace, entry.path).target), true);
      }
      storage.writeDurable(path.join(directory, entry.candidate), Buffer.from(options.operations[index].after.dataBase64, 'base64'), true);
      validateBackup(directory, entry); validateCandidate(directory, entry);
    }
    journal.state = 'BACKUP_VERIFIED'; save(directory, journal); markFault(options.fault, 'BACKUP_VERIFIED', journal);
    trustedCall(options.verify); trustedCall(options.guard); gitGuard(info, options.expectedGit);
    for (const [index, entry] of entries.entries()) {
      const current = storage.snapshotFile(info.workspace, entry.path);
      check(storage.sameState(current, entry.before), 'Target changed after backup verification');
      gitGuard(info, options.expectedGit);
      entry.phase = 'WRITE_INTENT'; journal.state = 'APPLYING'; save(directory, journal); markFault(options.fault, 'WRITE_INTENT', journal, index);
      parentDirectories(info, entry.path, journal, directory);
      trustedCall(options.guard); gitGuard(info, options.expectedGit);
      validateBackup(directory, entry);
      replaceBytes(info, entry.path, validateCandidate(directory, entry), current, entry.after.mode);
      const post = storage.snapshotFile(info.workspace, entry.path);
      check(post.sha256 === entry.after.sha256 && post.mode === entry.after.mode, 'Postimage bytes or permission verification failed');
      check(!entry.before.exists || storage.sameState(post.metadata, entry.before.metadata), 'Native permissions or metadata changed during writing; current content is preserved for recovery');
      entry.post = post;
      entry.phase = 'APPLIED'; save(directory, journal); markFault(options.fault, 'APPLIED', journal, index);
    }
    gitGuard(info, options.expectedGit);
    journal.state = 'VALIDATED'; save(directory, journal); markFault(options.fault, 'VALIDATED', journal);
    trustedCall(options.guard); gitGuard(info, options.expectedGit);
    for (const entry of entries) check(storage.sameState(storage.snapshotFile(info.workspace, entry.path), entry.post), 'An applied target changed before commit; current edits are preserved');
    check(storage.canonical(readReceipt(info)) === storage.canonical(previous), 'Installation receipt changed during apply');
    storage.writeJson(receiptFile(info), options.receipt);
    journal.state = 'COMMITTED'; save(directory, journal); markFault(options.fault, 'COMMITTED', journal);
    return { transactionId: id, installationId: info.installationId, state: 'COMMITTED', changedFiles: entries.length, backupDirectory: directory };
  } catch (error) {
    if (journal && directory && journal.state !== 'COMMITTED') {
      journal.state = 'RECOVERY_REQUIRED'; journal.failure = String(error.message).slice(0, 1024);
      try { save(directory, journal); restore(info, directory, journal); }
      catch (recoveryError) {
        journal.state = 'RECOVERY_REQUIRED'; journal.recoveryFailure = String(recoveryError.message).slice(0, 1024);
        error.recoveryFailure = journal.recoveryFailure;
        try { save(directory, journal); }
        catch (journalError) { error.journalError = String(journalError.message).slice(0, 1024); }
      }
      error.transactionId = journal.transactionId; error.recoveryState = journal.state;
    }
    throw error;
  } finally { releaseLock(); }
}
function statusTransaction(options) {
  const info = identity(options, false);
  if (options.transactionId) { const { journal } = load(info, options.transactionId); return journal; }
  const root = path.join(info.store, 'transactions', info.installationId);
  const transactions = fs.existsSync(root) ? fs.readdirSync(storage.regularRoot(root)).map(id => {
    const { journal } = load(info, id); return { transactionId: id, state: journal.state, createdAt: journal.createdAt };
  }) : [];
  return { installationId: info.installationId, receipt: readReceipt(info), transactions };
}
function rollbackTransaction(options) {
  check(options.quiescent === true, 'Recovery requires explicit quiescent/cooperating-writer acknowledgement');
  const info = identity(options, false);
  storage.assertSupportedFilesystem(info.workspace);
  storage.assertSupportedFilesystem(info.store);
  const releaseLock = lock(info, true);
  try {
    const { directory, journal } = load(info, options.transactionId);
    if (journal.state === 'ROLLED_BACK') return { transactionId: journal.transactionId, state: 'ROLLED_BACK', noOp: true };
    restore(info, directory, journal, options.fault);
    return { transactionId: journal.transactionId, state: journal.state };
  } finally { releaseLock(); }
}
function recoverTransaction(options) {
  const info = identity(options, false);
  const { journal } = load(info, options.transactionId);
  check(!terminal.has(journal.state), 'Completed transactions use rollback explicitly; recovery will not undo a committed update');
  return rollbackTransaction(options);
}

module.exports = { applyTransaction, statusTransaction, recoverTransaction, rollbackTransaction };
