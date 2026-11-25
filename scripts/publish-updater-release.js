#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { snapshotGit } = require('./lib/updater/planning');
const { LIMITS, allowedSourcePath, ensureDistinct, packRelease, sha256, regularRoot, within, validatePath } = require('./lib/updater/release');
const { assertPrivateStore } = require('./lib/updater/storage');

function gitRead(source, args, maxBuffer) {
  const env = {};
  for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP']) if (process.env[key] !== undefined) env[key] = process.env[key];
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_OPTIONAL_LOCKS: '0' });
  const result = spawnSync('git', ['--no-replace-objects', '--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', source, ...args], { env, windowsHide: true, maxBuffer, timeout: 30000 });
  if (result.error || result.status !== 0) throw new Error('Cannot read exact publisher Git objects');
  return result.stdout;
}

function publishFromCheckout({ sourceRoot, output, keyPem, expectedRevision }) {
  if (typeof keyPem !== 'string' || !keyPem || Buffer.byteLength(keyPem) > 32768) throw new Error('An Ed25519 signing key must be supplied privately');
  const key = crypto.createPrivateKey(keyPem);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Publisher signing key must be Ed25519');
  const source = regularRoot(sourceRoot);
  const requestedOutput = path.resolve(output);
  const destination = path.join(regularRoot(path.dirname(requestedOutput)), path.basename(requestedOutput));
  if (within(source, destination) || within(destination, source)) throw new Error('Publisher output must be outside the checkout');
  const state = snapshotGit(source);
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(expectedRevision || '') || state.head !== expectedRevision
    || state.statusSha256 !== sha256(Buffer.alloc(0))) throw new Error('Publisher requires a clean exact checkout of the expected Git revision');
  const directory = path.join(fs.realpathSync.native(os.tmpdir()), 'orchestrator-signing-' + crypto.randomUUID());
  assertPrivateStore(directory, { workspace: source });
  const keyFile = path.join(directory, 'signing.pem');
  const staged = path.join(directory, 'source');
  try {
    // Source comes from the named commit, never ignored or concurrently edited
    // working-tree files. Only allowlisted committed regular blobs are read.
    fs.mkdirSync(staged, { mode: 0o700 });
    const tree = gitRead(source, ['ls-tree', '-r', '-z', '--full-tree', state.head], 16 * 1024 * 1024);
    const entries = [];
    for (const record of tree.toString('utf8').split('\0').filter(Boolean)) {
      const match = record.match(/^([0-9]+) (\w+) ([a-f0-9]+)\t([\s\S]+)$/);
      if (!match) throw new Error('Unsupported publisher Git tree entry');
      const [, mode, type, object, relative] = match;
      if (!allowedSourcePath(relative)) continue;
      validatePath(relative);
      if (type !== 'blob' || !['100644', '100755'].includes(mode) || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(object)) throw new Error('Publisher requires committed regular source files');
      entries.push({ relative, object });
    }
    if (!entries.length || entries.length > LIMITS.files) throw new Error('Publisher source file count exceeds limits');
    ensureDistinct(entries.map(entry => entry.relative));
    let total = 0;
    for (const { relative, object } of entries) {
      const bytes = gitRead(source, ['cat-file', 'blob', object], LIMITS.fileBytes);
      total += bytes.length;
      if (total > LIMITS.totalBytes) throw new Error('Publisher source byte limit exceeded');
      const target = path.join(staged, ...relative.split('/'));
      fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
      fs.writeFileSync(target, bytes, { flag: 'wx', mode: 0o600 });
    }
    fs.writeFileSync(keyFile, keyPem, { flag: 'wx', mode: 0o600 });
    return packRelease({ sourceRoot: staged, output: destination, keyFile, revision: state.head });
  } finally {
    // Both paths were allocated here. Never recursively delete a supplied path.
    if (fs.existsSync(keyFile)) fs.unlinkSync(keyFile);
    // The staging target is a fixed child of this invocation's newly allocated
    // private directory. It only contains regular committed Git blob copies.
    if (path.dirname(staged) !== directory || path.basename(staged) !== 'source') throw new Error('Invalid publisher cleanup scope');
    if (fs.existsSync(staged)) fs.rmSync(staged, { recursive: true, force: true });
    fs.rmdirSync(directory);
  }
}
if (require.main === module) {
  try {
    const value = publishFromCheckout({ sourceRoot: path.resolve(__dirname, '..'), output: process.env.UPDATER_RELEASE_OUTPUT,
      keyPem: process.env.UPDATER_SIGNING_KEY_PEM, expectedRevision: process.env.GITHUB_SHA });
    console.log(JSON.stringify(value));
  } catch (error) { console.error('Release publishing preparation failed: ' + error.message); process.exitCode = 1; }
}
module.exports = { publishFromCheckout };
