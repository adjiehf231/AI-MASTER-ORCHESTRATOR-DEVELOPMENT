const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('node:fs');
const path = require('path');
const { fixtureRepository } = require('./fixture-repository');
const { parseFrontmatter } = require('../scripts/lib/frontmatter');
const { saveComponent } = require('../scripts/lib/component-store');
const { applyFilePlan, withFileLock } = require('../scripts/lib/file-plan');

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
  assert.ok(cleanOutput.includes('codebase-ast-map:'), 'Must list codebase-ast-map');
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

test('invalid component identifiers are rejected before acquiring a repository lock', t => {
  const fixture = fixtureRepository(t);
  const unavailableRoot = fixture.write('unavailable-root', 'not a directory');
  for (const [kind, name] of [['agent', 'Invalid_Agent_Name'], ['skill', 'BadSkillName']]) {
    assert.throws(() => saveComponent(unavailableRoot, kind, name, {}, () => {
      assert.fail('Invalid identifiers must not reach content generation');
    }), /Invalid identifier/);
  }
});

test('skill:update changes YAML safely while preserving body and synchronizing only in the repository', t => {
  const fixture = fixtureRepository(t);
  const relativePath = 'skills/fixture-skill/SKILL.md';
  const original = `---\nname: fixture-skill\n# Keep author annotation.\ndescription: "Project's original"\n---\n\n# Body stays the same.\n`;
  fixture.write(relativePath, original);
  const description = `Project's new "Windows" file C:\\workspace\\fixture`;
  const result = fixture.run('manage-orchestrator.js', ['skill:update', 'fixture-skill', `--desc=${description}`]);
  assert.equal(result.status, 0, result.stderr);
  const saved = fixture.read(relativePath);
  assert.equal(parseFrontmatter(saved, relativePath).attributes.description, description);
  assert.equal(parseFrontmatter(saved, relativePath).body, parseFrontmatter(original, relativePath).body);
  assert.match(saved, /# Keep author annotation/);
  const catalog = JSON.parse(fixture.read('adapters/component-catalog.json'));
  assert.equal(catalog.skills.find(skill => skill.id === 'fixture-skill').description, description);
  assert.equal(parseFrontmatter(fixture.read('.claude/skills/fixture-skill/SKILL.md'), 'native skill').attributes.description, description);
  assert.equal(fs.existsSync(fixture.plugin), false);
});

test('a rejected component update preserves source and generated adapter files', t => {
  const fixture = fixtureRepository(t);
  let result = fixture.run('sync-adapters.js');
  assert.equal(result.status, 0, result.stderr);
  const file = 'agents/orchestrator.md';
  const source = fixture.read(file);
  const adapter = fixture.read('CLAUDE.md');
  result = fixture.run('manage-orchestrator.js', ['agent:update', 'orchestrator', '--mode=subagent']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must support primary mode/);
  assert.equal(fixture.read(file), source);
  assert.equal(fixture.read('CLAUDE.md'), adapter);
  assert.equal(fs.existsSync(fixture.plugin), false);
});

test('a failed multi-file write restores replaced files and removes new files', t => {
  const fixture = fixtureRepository(t);
  fixture.write('before.txt', 'original');
  assert.throws(() => withFileLock(fixture.root, () => applyFilePlan(fixture.root, {
    files: new Map([
      ['before.txt', 'changed'],
      ['temporary.txt', 'temporary'],
      ['temporary.txt/invalid.txt', 'cannot create inside a file']
    ])
  })), /Unexpected file type/);
  assert.equal(fixture.read('before.txt'), 'original');
  assert.equal(fs.existsSync(path.join(fixture.root, 'temporary.txt')), false);
});

