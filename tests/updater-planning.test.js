const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { fixture } = require('./updater-fixture');
const release = require('../scripts/lib/updater/release');
const planning = require('../scripts/lib/updater/planning');
const { shortDirectoryAlias } = require('./windows-path-alias');

function resign(fixture, bundle, edit) {
  const filename = path.join(bundle.releaseRoot, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(filename, 'utf8'));
  edit(manifest);
  const raw = Buffer.from(`${release.canonical(manifest)}\n`);
  fs.writeFileSync(filename, raw);
  const key = crypto.createPrivateKey(fs.readFileSync(fixture.key));
  fs.writeFileSync(path.join(bundle.releaseRoot, 'signature.json'), JSON.stringify({ algorithm: 'Ed25519', signature: crypto.sign(null, raw, key).toString('base64') }));
}

test('release signatures authenticate passive bytes and exclude private project state', t => {
  const f = fixture(t);
  const verified = release.verifyRelease({ releaseRoot: f.base.releaseRoot, trustFile: f.trust, workspace: f.project });
  assert.ok(verified.files.has('skills/fixture/SKILL.md'));
  assert.equal([...verified.files.keys()].some(p => /PROJECT_CONTEXT\.md|memory\/|\.env|\.orchestrator/.test(p)), false);
  fs.appendFileSync(path.join(f.base.releaseRoot, 'payload/scripts/passive.js'), '// changed');
  assert.throws(() => release.verifyRelease({ releaseRoot: f.base.releaseRoot, trustFile: f.trust, workspace: f.project }), /digest mismatch/);
});

test('wrong keys, self-supplied project trust, unsigned extra files and unsafe paths fail closed', t => {
  const f = fixture(t);
  f.write(f.temp, 'untrusted.json', '{"schemaVersion":1,"keys":{}}');
  assert.throws(() => release.verifyRelease({ releaseRoot: f.base.releaseRoot, trustFile: path.join(f.temp, 'untrusted.json'), workspace: f.project }), /not trusted/);
  f.write(f.project, 'trust.json', fs.readFileSync(f.trust));
  assert.throws(() => release.verifyRelease({ releaseRoot: f.base.releaseRoot, trustFile: path.join(f.project, 'trust.json'), workspace: f.project }), /outside/);
  f.write(f.base.releaseRoot, 'payload/extra.txt', 'unsigned');
  assert.throws(() => release.verifyRelease({ releaseRoot: f.base.releaseRoot, trustFile: f.trust, workspace: f.project }), /Unsigned or missing/);
  for (const name of ['../escape', '/tmp/escape', 'C:/escape', 'a/file:stream', 'a/NUL.txt', 'a/trailing.']) assert.throws(() => release.validatePath(name));
  assert.throws(() => release.ensureDistinct(['agents/A.md', 'agents/a.md']), /collision/);
});

test('unknown baseline and dry-run inspection preserve workspace and Git state', t => {
  const f = fixture(t); const before = planning.snapshotGit(f.project); const protectedBefore = f.protectedBytes();
  const plan = planning.planUpdate(f.options(f.next()));
  assert.equal(plan.status, 'BLOCKED'); assert.ok(plan.blockers.some(b => b.code === 'UNKNOWN_BASELINE'));
  assert.deepEqual(planning.snapshotGit(f.project), before);
  assert.deepEqual(f.protectedBytes(), protectedBefore);
  assert.equal(planning.inspectInstallation(f.options(f.base)).adopted, false);
});

test('adoption and update plans are bound to signed bytes, local inputs and explicit roots', t => {
  const f = fixture(t); const plan = planning.planAdoption(f.options(f.base));
  assert.equal(plan.status, 'READY');
  const forged = JSON.parse(JSON.stringify(plan)); forged.operations.push({ path: 'src/app.js', before: {}, after: { dataBase64: 'ZXZpbA==', mode: 0o644 } });
  assert.throws(() => planning.verifyPlan({ plan: forged, trustFile: f.trust, store: f.store }), /tampered/);
  f.write(f.project, 'ai-orchestrator/PROJECT_CONTEXT.md', 'PROJECT_NAME: Changed\nPROJECT_ID: OFFICE\nPROJECT_DOMAIN: x.test\nDB_NAME: none\n');
  assert.throws(() => planning.verifyPlan({ plan, trustFile: f.trust, store: f.store }), /stale/);
  for (const target of ['src/app.js', '.env', 'ai-orchestrator/PROJECT_CONTEXT.md', 'ai-orchestrator/docs/memory/DECISIONS.md', '.orchestrator/tasks/a.json']) assert.equal(planning.allowedTarget(target, 'ai-orchestrator'), false, target);
});

test('custom files, local-only edits and pre-existing shared host rules are preserved', t => {
  const f = fixture(t);
  f.write(f.project, 'CLAUDE.md', '# Customer-only security rules\r\n');
  const before = f.protectedBytes();
  f.adopt();
  f.write(f.project, 'ai-orchestrator/scripts/passive.js', 'module.exports = "custom";\n');
  const plan = planning.planUpdate(f.options(f.next()));
  assert.equal(plan.status, 'READY', JSON.stringify(plan.blockers));
  assert.ok(plan.preserved.some(p => p.path.endsWith('scripts/passive.js') && p.reason === 'LOCAL_ONLY_CHANGE'));
  assert.equal(plan.operations.some(p => p.path === 'CLAUDE.md'), false);
  assert.deepEqual(f.protectedBytes(), before);
  assert.equal(fs.readFileSync(path.join(f.project, 'CLAUDE.md'), 'utf8'), '# Customer-only security rules\r\n');
});

test('both-side changes, collisions, permission changes and deletions block automatic mutation', t => {
  const f = fixture(t); f.adopt();
  f.write(f.project, 'ai-orchestrator/skills/fixture/SKILL.md', '# Customer customization\n');
  let plan = planning.planUpdate(f.options(f.next()));
  assert.ok(plan.blockers.some(b => b.code === 'BOTH_SIDES_CHANGED'));
  const before = f.protectedBytes();
  const changedPolicy = f.next(root => f.write(root, 'agents/orchestrator.md', '---\nname: orchestrator\ndescription: Guide ${PROJECT_NAME}.\nmode: all\n---\n# ${PROJECT_NAME}\n'));
  plan = planning.planUpdate(f.options(changedPolicy));
  assert.ok(plan.blockers.some(b => b.code === 'SECURITY_POLICY_REVIEW_REQUIRED'));
  const deleted = f.next(root => fs.unlinkSync(path.join(root, 'scripts/passive.js')));
  plan = planning.planUpdate(f.options(deleted));
  assert.ok(plan.blockers.some(b => b.code === 'DELETION_REVIEW_REQUIRED'));
  const addition = f.next(root => f.write(root, 'scripts/custom.js', 'upstream collision'));
  plan = planning.planUpdate(f.options(addition));
  assert.ok(plan.blockers.some(b => b.code === 'NEW_PATH_COLLISION'));
  assert.deepEqual(f.protectedBytes(), before);
});

test('invalid signatures, canonical manifest tampering and signed unsupported formats are rejected', t => {
  const f = fixture(t);
  const manifestFile = path.join(f.base.releaseRoot, 'manifest.json');
  const signatureFile = path.join(f.base.releaseRoot, 'signature.json');
  const manifest = fs.readFileSync(manifestFile);
  const signature = fs.readFileSync(signatureFile);
  fs.writeFileSync(signatureFile, JSON.stringify({ algorithm: 'Ed25519', signature: Buffer.alloc(64).toString('base64') }));
  assert.throws(() => release.verifyRelease({ releaseRoot: f.base.releaseRoot, trustFile: f.trust, workspace: f.project }), /signature verification/);
  fs.writeFileSync(signatureFile, signature);
  fs.writeFileSync(manifestFile, JSON.stringify(JSON.parse(manifest), null, 2));
  assert.throws(() => release.verifyRelease({ releaseRoot: f.base.releaseRoot, trustFile: f.trust, workspace: f.project }), /canonical/);
  fs.writeFileSync(manifestFile, manifest);
  resign(f, f.base, value => { value.schemaVersion = 2; });
  assert.throws(() => release.verifyRelease({ releaseRoot: f.base.releaseRoot, trustFile: f.trust, workspace: f.project }), /Unsupported release/);
});

test('publisher signing keys and oversized unsigned payload inventory fail before publication or consumption', t => {
  const f = fixture(t);
  const disguisedKey = f.write(f.source, 'scripts/signing-material.js', fs.readFileSync(f.key));
  assert.throws(() => release.packRelease({ sourceRoot: f.source, output: path.join(f.temp, 'unsafe-release'), keyFile: disguisedKey, revision: 'a'.repeat(40) }), /Signing key must be outside/);
  assert.equal(fs.existsSync(path.join(f.temp, 'unsafe-release')), false);
  const excess = path.join(f.base.releaseRoot, 'payload', 'overflow');
  fs.mkdirSync(excess);
  for (let i = 0; i < release.LIMITS.files + 1; i++) fs.writeFileSync(path.join(excess, `${i}.txt`), '');
  assert.throws(() => release.verifyRelease({ releaseRoot: f.base.releaseRoot, trustFile: f.trust, workspace: f.project }), /file count limit/);
});

test('unadopted custom content blocks intersecting upstream updates', t => {
  const f = fixture(t);
  f.write(f.project, 'ai-orchestrator/skills/fixture/SKILL.md', '# Existing customer guidance\r\n');
  const before = fs.readFileSync(path.join(f.project, 'ai-orchestrator/skills/fixture/SKILL.md'));
  f.adopt();
  const plan = planning.planUpdate(f.options(f.next()));
  assert.equal(plan.status, 'BLOCKED');
  assert.ok(plan.blockers.some(item => item.code === 'UNADOPTED_UPSTREAM_CHANGE'));
  assert.deepEqual(fs.readFileSync(path.join(f.project, 'ai-orchestrator/skills/fixture/SKILL.md')), before);
});

test('staged target changes and later Git input drift invalidate otherwise clean signed updates', t => {
  const f = fixture(t);
  const relative = 'ai-orchestrator/skills/fixture/SKILL.md';
  const original = fs.readFileSync(path.join(f.project, relative));
  f.write(f.project, relative, '# Staged customer change\n');
  f.git('add', '--', relative);
  f.write(f.project, relative, original);
  f.adopt();
  const dirty = planning.planUpdate(f.options(f.next()));
  assert.equal(dirty.status, 'BLOCKED');
  assert.ok(dirty.blockers.some(item => item.code === 'DIRTY_TARGET'));
  f.git('reset', '--quiet', 'HEAD', '--', relative);
  const clean = planning.planUpdate(f.options(f.next()));
  assert.equal(clean.status, 'READY');
  f.write(f.project, 'src/app.js', 'export const changed = true;\n');
  f.git('add', '--', 'src/app.js');
  assert.throws(() => planning.verifyPlan({ plan: clean, trustFile: f.trust, store: f.store }), /stale/);
});

test('a recomputed plan hash cannot authorize different candidates or a changed trust root', t => {
  const f = fixture(t); f.adopt();
  const plan = planning.planUpdate(f.options(f.next()));
  assert.equal(plan.status, 'READY');
  const forged = JSON.parse(JSON.stringify(plan));
  forged.operations[0].after.dataBase64 = Buffer.from('unsigned candidate').toString('base64');
  const { digest, ...unsigned } = forged;
  forged.digest = release.sha256(Buffer.from(release.canonical(unsigned)));
  assert.throws(() => planning.verifyPlan({ plan: forged, trustFile: f.trust, store: f.store }), /tampered/);
  fs.appendFileSync(f.trust, '\n');
  assert.throws(() => planning.verifyPlan({ plan, trustFile: f.trust, store: f.store }), /stale/);
});

test('signed executable requirements remain blocked and project Git filters never execute', t => {
  const f = fixture(t); f.adopt();
  const candidate = f.next();
  const sentinel = path.join(f.temp, 'must-not-execute.txt');
  resign(f, candidate, manifest => { manifest.requiredChecks = [{ type: 'command', command: `node -e "require('fs').writeFileSync('${sentinel}', 'bad')"` }]; });
  const plan = planning.planUpdate(f.options(candidate));
  assert.equal(plan.status, 'BLOCKED');
  assert.ok(plan.blockers.some(item => item.code === 'EXECUTABLE_CHECKS_UNSUPPORTED'));
  assert.equal(fs.existsSync(sentinel), false);
  const driver = f.write(f.temp, 'forbidden-filter.js', `require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'bad'); process.stdout.write('filtered');`);
  f.git('config', 'filter.updater-test.clean', `node "${driver}"`);
  f.write(f.project, '.gitattributes', '*.js filter=updater-test\n');
  assert.throws(() => planning.snapshotGit(f.project), /content filters are unsupported/);
  assert.equal(fs.existsSync(sentinel), false);
});

test('credential filenames are excluded without reading and cannot enter even a signed payload', t => {
  const f = fixture(t);
  const names = ['config/credentials.json', 'config/id_rsa', 'config/secrets.json', 'config/signing.jks', 'config/app.keystore', 'skills/fixture/resources/service-account.json'];
  const blockedSourceFiles = new Set(names.map(name => f.write(f.source, name, 'synthetic-credential-canary')));
  const originalRead = fs.readFileSync;
  let consumed = false;
  fs.readFileSync = function (file, ...args) {
    if (typeof file === 'string' && blockedSourceFiles.has(path.resolve(file))) { consumed = true; throw new Error('Credential content must never be read'); }
    return originalRead.call(this, file, ...args);
  };
  let bundle;
  try {
    bundle = release.packRelease({ sourceRoot: f.source, output: path.join(f.temp, 'filtered-release'), keyFile: f.key, revision: 'a'.repeat(40) });
  } finally { fs.readFileSync = originalRead; }
  assert.equal(consumed, false);
  const verified = release.verifyRelease({ releaseRoot: bundle.releaseRoot, trustFile: f.trust, workspace: f.project });
  for (const name of names) {
    assert.equal(verified.files.has(name), false, name);
    assert.equal(planning.allowedTarget(`ai-orchestrator/${name}`, 'ai-orchestrator'), false, name);
    assert.equal(planning.allowedTarget(`.agents/skills/test/${path.basename(name)}`, 'ai-orchestrator'), false, name);
  }
  const forbidden = 'config/credentials.json';
  const bytes = Buffer.from('synthetic-credential-canary');
  const signedTarget = f.write(bundle.releaseRoot, `payload/${forbidden}`, bytes);
  resign(f, bundle, manifest => {
    manifest.files.push({ path: forbidden, sha256: release.sha256(bytes), size: bytes.length, mode: 0o644 });
    manifest.files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  });
  fs.readFileSync = function (file, ...args) {
    if (typeof file === 'string' && path.resolve(file) === signedTarget) { consumed = true; throw new Error('Forbidden signed credential must never be read'); }
    return originalRead.call(this, file, ...args);
  };
  try {
    assert.throws(() => release.verifyRelease({ releaseRoot: bundle.releaseRoot, trustFile: f.trust, workspace: f.project }), /Unsupported release entry/);
  } finally { fs.readFileSync = originalRead; }
  assert.equal(consumed, false);
  f.write(f.project, 'config/credentials.json', 'synthetic-credential-canary');
  f.git('add', '--', 'config/credentials.json');
  assert.throws(() => planning.snapshotGit(f.project), /Tracked credential filenames/);
});

test('inspection inventories ignored customization using metadata and never traverses protected or linked trees', t => {
  const f = fixture(t); f.adopt();
  f.write(f.project, 'ai-orchestrator/scripts/local.ignored', 'customer-only ignored bytes');
  fs.appendFileSync(path.join(f.project, '.gitignore'), 'ai-orchestrator/scripts/local.ignored\n');
  assert.equal(f.git('check-ignore', 'ai-orchestrator/scripts/local.ignored'), 'ai-orchestrator/scripts/local.ignored');
  f.write(f.project, 'ai-orchestrator/node_modules/private-package/index.js', 'must stay unopened');
  f.write(f.temp, 'outside/MUST_NOT_LIST.txt', 'outside content');
  fs.symlinkSync(path.join(f.temp, 'outside'), path.join(f.project, 'ai-orchestrator/external-link'), process.platform === 'win32' ? 'junction' : 'dir');
  const before = planning.snapshotGit(f.project);
  const read = fs.readFileSync;
  fs.readFileSync = function (file, ...args) {
    if (typeof file === 'string') {
      const relative = path.relative(f.project, path.resolve(file)).replace(/\\/g, '/');
      if (relative && !relative.startsWith('../') && !relative.startsWith('.git/')) throw new Error('Inspection cannot read project file content');
    }
    return read.call(this, file, ...args);
  };
  let inspected;
  try { inspected = planning.inspectInstallation(f.options(f.base)); }
  finally { fs.readFileSync = read; }
  const inventory = inspected.inventory;
  const entry = name => inventory.entries.find(item => item.path === name);
  assert.equal(inventory.coverage.complete, true);
  assert.equal(inventory.coverage.truncated, false);
  assert.equal(entry('ai-orchestrator/scripts/custom.js').ownership, 'PROJECT_OWNED');
  assert.equal(entry('ai-orchestrator/scripts/local.ignored').ownership, 'PROJECT_OWNED');
  assert.equal(entry('ai-orchestrator/scripts/passive.js').ownership, 'BASELINE_MANAGED_CLAIM');
  for (const name of ['ai-orchestrator/docs/memory', 'ai-orchestrator/node_modules', '.orchestrator/tasks']) {
    assert.equal(entry(name).ownership, 'PROTECTED', name);
    assert.equal(entry(name).traversed, false, name);
  }
  assert.equal(entry('ai-orchestrator/external-link').type, 'symlink');
  assert.ok(inventory.coverage.linkedEntries >= 1);
  assert.equal(inventory.entries.some(item => /MUST_NOT_LIST|DECISIONS\.md|customer\.json|private-package/.test(item.path)), false);
  assert.deepEqual(planning.snapshotGit(f.project), before);
});

test('inspection reports truncated coverage at its bounded entry limit', t => {
  const f = fixture(t);
  for (let i = 0; i < 4097; i++) f.write(f.project, `ai-orchestrator/inventory/custom-${i}.txt`, '');
  const before = planning.snapshotGit(f.project);
  const inventory = planning.inspectInstallation(f.options(f.base)).inventory;
  assert.equal(inventory.coverage.complete, false);
  assert.equal(inventory.coverage.truncated, true);
  assert.equal(inventory.coverage.visitedEntries, 4096);
  assert.equal(inventory.entries.length, 4096);
  assert.deepEqual(planning.snapshotGit(f.project), before);
});

test('Windows short aliases cannot place trust inside the project or signed release', { skip: process.platform !== 'win32' }, t => {
  const f = fixture(t);
  const alias = shortDirectoryAlias(f.temp);
  if (!alias) { t.skip('The fixture volume has no Windows short directory aliases'); return; }
  f.write(f.project, 'embedded-trust.json', fs.readFileSync(f.trust));
  assert.throws(() => release.verifyRelease({ releaseRoot: f.base.releaseRoot, trustFile: path.join(alias, 'project', 'embedded-trust.json'), workspace: f.project }), /outside release and workspace/);
  f.write(f.source, 'config/publisher-trust.json', fs.readFileSync(f.trust));
  const embedded = release.packRelease({ sourceRoot: f.source, output: path.join(f.temp, 'embedded-release'), keyFile: f.key, revision: 'a'.repeat(40) });
  assert.throws(() => release.verifyRelease({ releaseRoot: embedded.releaseRoot, trustFile: path.join(alias, 'embedded-release', 'payload', 'config', 'publisher-trust.json'), workspace: f.project }), /outside release and workspace/);
  const plan = planning.planAdoption({ ...f.options(f.base), trustFile: path.join(alias, 'trust.json') });
  assert.equal(plan.trust.path, fs.realpathSync.native(f.trust));
});

test('Windows short aliases cannot publish a release inside its source', { skip: process.platform !== 'win32' }, t => {
  const f = fixture(t);
  const alias = shortDirectoryAlias(f.source);
  if (!alias) { t.skip('The fixture volume has no Windows short directory aliases'); return; }
  assert.throws(() => release.packRelease({ sourceRoot: f.source, output: path.join(alias, 'nested-release'), keyFile: f.key, revision: 'b'.repeat(40) }), /separate from source/);
  assert.equal(fs.existsSync(path.join(f.source, 'nested-release')), false);
});

test('Windows short aliases cannot read a signing key from the source tree', { skip: process.platform !== 'win32' }, t => {
  const f = fixture(t);
  const alias = shortDirectoryAlias(f.source);
  if (!alias) { t.skip('The fixture volume has no Windows short directory aliases'); return; }
  f.write(f.source, 'embedded-signing.pem', fs.readFileSync(f.key));
  const aliasedKey = path.join(alias, 'embedded-signing.pem');
  const read = fs.readFileSync;
  let consumed = false;
  fs.readFileSync = function (file, ...args) {
    if (file === aliasedKey || file === path.join(f.source, 'embedded-signing.pem')) consumed = true;
    return read.call(this, file, ...args);
  };
  try {
    assert.throws(() => release.packRelease({ sourceRoot: f.source, output: path.join(f.temp, 'key-alias-release'), keyFile: aliasedKey, revision: 'c'.repeat(40) }), /Signing key must be outside/);
  } finally { fs.readFileSync = read; }
  assert.equal(consumed, false);
  assert.equal(fs.existsSync(path.join(f.temp, 'key-alias-release')), false);
});
