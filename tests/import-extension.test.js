const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { fixtureRepository } = require('./fixture-repository');
const { parseFrontmatter } = require('../scripts/lib/frontmatter');

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

test('local import previews without mutation and normalizes metadata only on explicit apply', t => {
  const fixture = fixtureRepository(t);
  fixture.write('example.md', [
    '---', 'name: upstream-name', 'description: >-', '  Upstream guide for', '  Acme users.',
    '---', '', '# Acme walkthrough', '', 'Follow this playbook.', ''
  ].join('\n'));
  const target = 'skills/new-name/SKILL.md';
  const args = ['--type=skill', '--name=new-name', '--file=example.md'];
  const preview = fixture.run('import-extension.js', args);
  assert.equal(preview.status, 0, preview.stderr);
  const digest = /^SHA-256: ([a-f0-9]{64})$/m.exec(preview.stdout)[1];
  assert.match(preview.stdout, /name: new-name/);
  assert.equal(fs.existsSync(path.join(fixture.root, target)), false);
  assert.equal(fs.existsSync(path.join(fixture.root, 'CLAUDE.md')), false);

  const applied = fixture.run('import-extension.js', [...args, '--apply', `--sha256=${digest}`]);
  assert.equal(applied.status, 0, applied.stderr);
  const saved = fixture.read(target);
  const { attributes, body } = parseFrontmatter(saved, target);
  assert.equal(attributes.name, 'new-name');
  assert.equal(attributes.description, 'Upstream guide for ${PROJECT_NAME} users.');
  assert.match(body, /^# \$\{PROJECT_NAME\} walkthrough$/m);
  assert.match(fixture.read('CLAUDE.md'), /new-name\/SKILL\.md/);
  assert.equal(fs.existsSync(fixture.plugin), false);

  const collision = fixture.run('import-extension.js', [...args, '--apply', '--desc=Different']);
  assert.notEqual(collision.status, 0);
  assert.match(collision.stderr, /Pass --force/);
  assert.equal(fixture.read(target), saved);

  const replaced = fixture.run('import-extension.js', [...args, '--apply', '--force', '--desc=Different']);
  assert.equal(replaced.status, 0, replaced.stderr);
  assert.equal(parseFrontmatter(fixture.read(target), target).attributes.description, 'Different');
});

test('import rejects unreviewed remote activation and a changed digest before writing files', t => {
  const fixture = fixtureRepository(t);
  fixture.write('new.md', '# Local draft\n');
  const common = ['--type=agent', '--name=new-agent', '--apply'];
  const unreviewed = fixture.run('import-extension.js', [...common, '--url=https://example.com/new.md']);
  assert.notEqual(unreviewed.status, 0);
  assert.match(unreviewed.stderr, /--sha256 digest from the reviewed preview/);
  const changed = fixture.run('import-extension.js', [...common, '--file=new.md', `--sha256=${'0'.repeat(64)}`]);
  assert.notEqual(changed.status, 0);
  assert.match(changed.stderr, /does not match the reviewed file/);
  assert.equal(fs.existsSync(path.join(fixture.root, 'agents/new-agent.md')), false);
  assert.equal(fs.existsSync(path.join(fixture.root, 'CLAUDE.md')), false);
});

