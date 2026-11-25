const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { fixture } = require('./updater-fixture');
const { publishFromCheckout } = require('../scripts/publish-updater-release');
const { verifyRelease } = require('../scripts/lib/updater/release');

test('publisher signs only an exact clean checkout and authenticates the resulting artifact', t => {
  const f = fixture(t);
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: f.source, encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
  };
  git('init', '--quiet'); git('add', '.');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '--quiet', '-m', 'publisher fixture');
  const revision = git('rev-parse', 'HEAD');
  // Ignored publisher data must never be included under a clean commit label.
  fs.writeFileSync(path.join(f.source, '.git/info/exclude'), 'config/private.json\n');
  f.write(f.source, 'config/private.json', 'DEMO_PRIVATE_CONTENT_MUST_NOT_BE_SIGNED');
  const keyPem = fs.readFileSync(f.key, 'utf8');
  const originalBlob = git('rev-parse', 'HEAD:scripts/passive.js');
  const replacement = spawnSync('git', ['hash-object', '-w', '--stdin'], { cwd: f.source, encoding: 'utf8', input: 'module.exports = "replacement-object";\n', windowsHide: true });
  assert.equal(replacement.status, 0, replacement.stderr);
  git('replace', originalBlob, replacement.stdout.trim());
  assert.throws(() => publishFromCheckout({ sourceRoot: f.source, output: path.join(f.temp, 'bad'), keyPem, expectedRevision: '0'.repeat(40) }), /exact checkout/);
  const packed = publishFromCheckout({ sourceRoot: f.source, output: path.join(f.temp, 'published'), keyPem, expectedRevision: revision });
  const verified = verifyRelease({ releaseRoot: packed.releaseRoot, trustFile: f.trust, workspace: f.project });
  assert.equal(verified.revision, revision);
  assert.equal(verified.files.has('config/private.json'), false);
  assert.equal(verified.files.get('scripts/passive.js').toString(), 'module.exports = "original";\n');
  f.write(f.source, 'scripts/passive.js', 'dirty publisher content');
  assert.throws(() => publishFromCheckout({ sourceRoot: f.source, output: path.join(f.temp, 'dirty'), keyPem, expectedRevision: revision }), /clean exact checkout/);
  assert.equal(fs.existsSync(path.join(f.temp, 'dirty')), false);
});

test('publisher rejects an output inside its checkout through a Windows short directory alias', { skip: process.platform !== 'win32' }, t => {
  const f = fixture(t);
  const script = '[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false);$f=New-Object -ComObject Scripting.FileSystemObject;[Console]::Write($f.GetFolder($env:ORCH_ALIAS_PATH).ShortPath)';
  const alias = spawnSync(path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
    { env: { ...process.env, ORCH_ALIAS_PATH: f.source }, encoding: 'utf8', windowsHide: true, timeout: 15000 });
  assert.equal(alias.status, 0, alias.stderr);
  const shortSource = alias.stdout.trim();
  assert.equal(fs.realpathSync.native(shortSource), f.source);
  if (shortSource.toLowerCase() === f.source.toLowerCase()) { t.skip('Short directory aliases are unavailable on this volume'); return; }
  for (const args of [['init', '--quiet'], ['add', '.'], ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '--quiet', '-m', 'publisher fixture']]) {
    const result = spawnSync('git', args, { cwd: f.source, encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
  }
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: f.source, encoding: 'utf8', windowsHide: true });
  assert.equal(revision.status, 0, revision.stderr);
  assert.throws(() => publishFromCheckout({ sourceRoot: f.source, output: path.join(shortSource, 'candidate'),
    keyPem: fs.readFileSync(f.key, 'utf8'), expectedRevision: revision.stdout.trim() }), /outside the checkout/);
  assert.equal(fs.existsSync(path.join(f.source, 'candidate')), false);
});
