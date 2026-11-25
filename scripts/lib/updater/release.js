const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const FORMAT = 'ai-orchestrator-passive-release';
const LIMITS = Object.freeze({ files: 4096, entries: 8192, depth: 32, fileBytes: 4 * 1024 * 1024, totalBytes: 32 * 1024 * 1024, manifestBytes: 2 * 1024 * 1024 });
const FIXED = new Set(['PROJECT_CONTEXT.template.md', 'README.md', 'LICENSE', 'LICENSE.md', 'package.json', 'package-lock.json']);
const DIRECTORIES = new Set(['agents', 'skills', 'templates', 'scripts', 'docs', 'config', 'orchestration']);
const RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function within(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
function regularRoot(input) {
  if (typeof input !== 'string' || !input) throw new Error('An explicit directory path is required');
  const root = path.resolve(input);
  let current = path.parse(root).root;
  for (const part of root.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stats = fs.lstatSync(current);
    if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error(`Unsupported directory or linked path: ${current}`);
  }
  return fs.realpathSync.native(root);
}
function canonicalFilePath(input, maxBytes = LIMITS.fileBytes) {
  if (typeof input !== 'string' || !input) throw new Error('An explicit regular file path is required');
  const target = path.resolve(input);
  const parent = regularRoot(path.dirname(target));
  const checked = path.join(parent, path.basename(target));
  const stats = fs.lstatSync(checked);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.nlink !== 1 || stats.size > maxBytes) throw new Error(`Unsupported or oversized regular file: ${target}`);
  // Both ancestors and the leaf may be Windows 8.3 aliases. Boundaries must
  // compare the existing canonical path before any sensitive contents are read.
  return fs.realpathSync.native(checked);
}
function regularFile(input, maxBytes = LIMITS.fileBytes) {
  return fs.readFileSync(canonicalFilePath(input, maxBytes));
}
function validatePath(relative) {
  if (typeof relative !== 'string' || !relative || relative.length > 2048 || relative.includes('\\') || path.posix.isAbsolute(relative) || path.win32.isAbsolute(relative)) throw new Error('Release paths must be portable relative paths');
  const parts = relative.split('/');
  if (parts.length > LIMITS.depth) throw new Error('Release path depth exceeds limit');
  if (parts.some(part => !part || part === '.' || part === '..' || /[\u0000-\u001f\u007f:<>"|?*]/.test(part) || /[. ]$/.test(part) || RESERVED.test(part))) throw new Error(`Invalid release path: ${relative}`);
  return parts;
}
// Filename policy is deliberately conservative. Contents of these namespaces are
// never inspected to decide whether they contain credentials.
function isCredentialName(name) {
  return /^(?:\.env(?:\..*)?|\.netrc|\.npmrc|\.pypirc|\.htpasswd|\.git-credentials)$/i.test(name)
    || /^(?:credentials?|secrets?|passwords?|tokens?)(?:[._-].*)?$/i.test(name)
    || /^(?:id_(?:rsa|dsa|ecdsa|ed25519)|identity|authorized_keys|known_hosts)(?:[._-].*)?$/i.test(name)
    || /^(?:client[_-]?secret.*|service[_-]?account.*|.*adminsdk.*|application_default_credentials)\.(?:json|ya?ml|xml|p12)$/i.test(name)
    || /\.(?:pem|key|p12|pfx|p8|ppk|der|jks|keystore|kdbx|asc|gpg|pgp|ovpn|tfstate|tfvars)$/i.test(name);
}
function allowedSourcePath(relative) {
  const parts = validatePath(relative);
  if (FIXED.has(relative)) return true;
  if (!DIRECTORIES.has(parts[0]) || parts.length < 2) return false;
  if (parts.some(part => part.startsWith('.') || /^(?:memory|tasks?|reports?|handoffs?|adr|uploads?|node_modules|dist|coverage)$/i.test(part))) return false;
  if (parts.some(part => isCredentialName(part) || /^(?:PROJECT_CONTEXT\.md|.*\.(?:sqlite|db))$/i.test(part))) return false;
  return true;
}
function readJson(file, limit) {
  const raw = regularFile(file, limit);
  try { return { raw, value: JSON.parse(raw.toString('utf8')) }; } catch { throw new Error(`Invalid JSON metadata: ${path.basename(file)}`); }
}
function inventory(root, { sourcePolicy = false } = {}) {
  const result = [];
  let visited = 0;
  function visit(prefix) {
    const directory = fs.opendirSync(path.join(root, prefix));
    try {
      for (let item; (item = directory.readSync()) !== null;) {
        if (++visited > LIMITS.entries) throw new Error('Release directory entry limit exceeded');
        const relative = prefix ? `${prefix}/${item.name}` : item.name;
        // Excluded project namespaces are never traversed or read while packing.
        if (sourcePolicy && !FIXED.has(relative) && !DIRECTORIES.has(relative)
            && !allowedSourcePath(relative) && !allowedSourcePath(`${relative}/__probe__`)) continue;
        validatePath(relative);
        const stats = fs.lstatSync(path.join(root, relative));
        if (stats.isSymbolicLink() || (!stats.isDirectory() && !stats.isFile())) throw new Error(`Linked or unsupported release entry: ${relative}`);
        if (stats.isDirectory()) visit(relative);
        else {
          if (sourcePolicy && !allowedSourcePath(relative)) continue;
          if (result.length >= LIMITS.files) throw new Error('Release file count limit exceeded');
          result.push(relative);
        }
      }
    } finally { directory.closeSync(); }
  }
  visit('');
  return result;
}
function ensureDistinct(paths) {
  const seen = new Set();
  for (const relative of paths) {
    validatePath(relative);
    const key = relative.normalize('NFC').toLowerCase();
    if (seen.has(key) || [...seen].some(other => other.startsWith(`${key}/`) || key.startsWith(`${other}/`))) throw new Error(`Case or directory collision in release: ${relative}`);
    seen.add(key);
  }
}
function manifestBytes(manifest) { return Buffer.from(`${canonical(manifest)}\n`); }

function packRelease({ sourceRoot, output, keyFile, revision, keyId }) {
  const source = regularRoot(sourceRoot);
  const requestedOutput = path.resolve(output);
  const destination = path.join(regularRoot(path.dirname(requestedOutput)), path.basename(requestedOutput));
  if (within(source, destination) || within(destination, source)) throw new Error('Release output must be separate from source');
  if (fs.existsSync(destination)) throw new Error('Release output already exists');
  const signingKey = canonicalFilePath(keyFile, 32 * 1024);
  if (within(source, signingKey)) throw new Error('Signing key must be outside publisher source');
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(revision || '')) throw new Error('A full lowercase revision digest is required');
  const key = crypto.createPrivateKey(regularFile(signingKey, 32 * 1024));
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Release signing requires an Ed25519 key');
  const publicKey = crypto.createPublicKey(key);
  const actualId = keyId || sha256(publicKey.export({ type: 'spki', format: 'der' }));
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(actualId)) throw new Error('Invalid signing key ID');
  // Walk only fixed publisher namespaces. Project state and secret namespaces are never read.
  const entries = inventory(source, { sourcePolicy: true });
  entries.sort();
  ensureDistinct(entries);
  if (!entries.length || entries.length > LIMITS.files) throw new Error('Release file count exceeds limits or is empty');
  let total = 0;
  const payload = entries.map(relative => {
    const bytes = regularFile(path.join(source, relative));
    total += bytes.length;
    if (total > LIMITS.totalBytes) throw new Error('Release byte limit exceeded');
    return { path: relative, bytes, size: bytes.length, sha256: sha256(bytes), mode: 0o644 };
  });
  const manifest = { format: FORMAT, schemaVersion: 1, policyVersion: 1, revision, keyId: actualId, requiredChecks: [], files: payload.map(({ bytes, ...entry }) => entry) };
  const raw = manifestBytes(manifest);
  if (raw.length > LIMITS.manifestBytes) throw new Error('Release manifest exceeds limit');
  const signature = { algorithm: 'Ed25519', signature: crypto.sign(null, raw, key).toString('base64') };
  fs.mkdirSync(destination, { mode: 0o700 });
  try {
    fs.mkdirSync(path.join(destination, 'payload'), { mode: 0o700 });
    for (const entry of payload) {
      const target = path.join(destination, 'payload', entry.path);
      fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
      fs.writeFileSync(target, entry.bytes, { flag: 'wx', mode: 0o644 });
    }
    fs.writeFileSync(path.join(destination, 'manifest.json'), raw, { flag: 'wx', mode: 0o644 });
    fs.writeFileSync(path.join(destination, 'signature.json'), `${canonical(signature)}\n`, { flag: 'wx', mode: 0o644 });
  } catch (error) {
    // Keep an incomplete output for diagnosis; never recursively remove a caller path.
    throw new Error(`Release pack failed; incomplete output retained: ${error.message}`, { cause: error });
  }
  return { releaseRoot: destination, digest: sha256(raw), revision, keyId: actualId, files: payload.length, bytes: total };
}

function verifyRelease({ releaseRoot, trustFile, workspace }) {
  const root = regularRoot(releaseRoot);
  if (!trustFile) throw new Error('Trust file must be explicit and outside release and workspace');
  const trustPath = canonicalFilePath(trustFile, 128 * 1024);
  if (within(root, trustPath) || (workspace && within(regularRoot(workspace), trustPath))) throw new Error('Trust file must be explicit and outside release and workspace');
  const { raw: trustBytes, value: trust } = readJson(trustPath, 128 * 1024);
  if (trust.schemaVersion !== 1 || !trust.keys || Array.isArray(trust.keys) || typeof trust.keys !== 'object') throw new Error('Unsupported external trust format');
  const { raw, value: manifest } = readJson(path.join(root, 'manifest.json'), LIMITS.manifestBytes);
  const { value: signature } = readJson(path.join(root, 'signature.json'), 16 * 1024);
  if (manifest.format !== FORMAT || manifest.schemaVersion !== 1 || manifest.policyVersion !== 1 || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(manifest.revision || '')
      || !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > LIMITS.files || !Array.isArray(manifest.requiredChecks)) throw new Error('Unsupported release manifest');
  if (!raw.equals(manifestBytes(manifest))) throw new Error('Release manifest must use canonical UTF-8 bytes');
  if (!Object.hasOwn(trust.keys, manifest.keyId) || typeof trust.keys[manifest.keyId] !== 'string') throw new Error('Release signing key is not trusted');
  const key = crypto.createPublicKey(trust.keys[manifest.keyId]);
  if (key.asymmetricKeyType !== 'ed25519' || signature.algorithm !== 'Ed25519' || typeof signature.signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(signature.signature)
      || !crypto.verify(null, raw, key, Buffer.from(signature.signature, 'base64'))) throw new Error('Release signature verification failed');
  const expectedKeys = ['files', 'format', 'keyId', 'policyVersion', 'requiredChecks', 'revision', 'schemaVersion'];
  if (canonical(Object.keys(manifest).sort()) !== canonical(expectedKeys.sort())) throw new Error('Unsupported release manifest fields');
  ensureDistinct(manifest.files.map(file => file.path));
  if (canonical(manifest.files.map(file => file.path)) !== canonical(manifest.files.map(file => file.path).sort())) throw new Error('Release files must be sorted');
  const payloadRoot = regularRoot(path.join(root, 'payload'));
  const actualPaths = inventory(payloadRoot).sort();
  if (canonical(actualPaths) !== canonical(manifest.files.map(file => file.path))) throw new Error('Unsigned or missing release payload');
  const top = fs.readdirSync(root).sort();
  if (canonical(top) !== canonical(['manifest.json', 'payload', 'signature.json'])) throw new Error('Unsupported unsigned release entries');
  let total = 0;
  const files = new Map();
  for (const file of manifest.files) {
    if (!allowedSourcePath(file.path) || file.mode !== 0o644 || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > LIMITS.fileBytes || !/^[a-f0-9]{64}$/.test(file.sha256)
        || canonical(Object.keys(file).sort()) !== canonical(['mode', 'path', 'sha256', 'size'])) throw new Error(`Unsupported release entry: ${file.path}`);
    total += file.size;
    if (total > LIMITS.totalBytes) throw new Error('Release byte limit exceeded');
    const bytes = regularFile(path.join(payloadRoot, file.path));
    if (bytes.length !== file.size || sha256(bytes) !== file.sha256) throw new Error(`Release payload digest mismatch: ${file.path}`);
    files.set(file.path, bytes);
  }
  return { schemaVersion: 1, digest: sha256(raw), revision: manifest.revision, keyId: manifest.keyId, sourceRoot: payloadRoot, releaseRoot: root, manifest, files,
    trust: { path: trustPath, sha256: sha256(trustBytes) } };
}

function cacheRelease({ releaseRoot, trustFile, store, workspace }) {
  const verified = verifyRelease({ releaseRoot, trustFile, workspace });
  const { assertPrivateStore, privateSubdirectory, writeDurable, fsyncDirectory } = require('./storage');
  const privateRoot = assertPrivateStore(store, { workspace, sourceRoot: verified.releaseRoot, create: true });
  const storeRoot = typeof privateRoot === 'string' ? privateRoot : path.resolve(store);
  const releases = privateSubdirectory(storeRoot, 'releases');
  const destination = path.join(releases, verified.digest);
  if (fs.existsSync(destination)) {
    const cached = verifyRelease({ releaseRoot: destination, trustFile, workspace });
    if (cached.digest !== verified.digest) throw new Error('Immutable release cache differs from signed release');
    return cached;
  }
  const staging = fs.mkdtempSync(path.join(releases, '.incoming-'));
  try {
    fsyncDirectory(releases);
    fs.mkdirSync(path.join(staging, 'payload'), { mode: 0o700 });
    const directories = new Set([staging, path.join(staging, 'payload')]);
    for (const [relative, bytes] of verified.files) {
      const target = path.join(staging, 'payload', relative);
      fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
      for (let directory = path.dirname(target); within(staging, directory); directory = path.dirname(directory)) {
        directories.add(directory);
        if (directory === staging) break;
      }
      writeDurable(target, bytes, true);
    }
    for (const filename of ['manifest.json', 'signature.json']) writeDurable(path.join(staging, filename), regularFile(path.join(verified.releaseRoot, filename), LIMITS.manifestBytes), true);
    for (const directory of [...directories].sort((a, b) => b.length - a.length)) fsyncDirectory(directory);
    const staged = verifyRelease({ releaseRoot: staging, trustFile, workspace });
    if (staged.digest !== verified.digest) throw new Error('Staged release cache digest mismatch');
    fs.renameSync(staging, destination);
    fsyncDirectory(releases);
  } catch (error) {
    throw new Error(`Release cache failed; staging retained at ${staging}: ${error.message}`, { cause: error });
  }
  return verifyRelease({ releaseRoot: destination, trustFile, workspace });
}

module.exports = { LIMITS, FORMAT, allowedSourcePath, cacheRelease, canonical, canonicalFilePath, ensureDistinct, isCredentialName, packRelease, regularFile, regularRoot, sha256, validatePath, verifyRelease, within };
