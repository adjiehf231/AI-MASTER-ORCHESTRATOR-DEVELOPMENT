const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { checkMemory, selectMemory, buildMemoryProposal } = require('../scripts/lib/memory');

const repo = path.resolve(__dirname, '..');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aom-memory-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  function write(file, content) {
    const destination = path.join(root, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, content);
  }
  function git(...args) {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  git('init', '--quiet', '--initial-branch=main');
  write('PROJECT_CONTEXT.md', 'PROJECT_NAME: Fixture\nPROJECT_ID: FIXTURE\nPROJECT_DOMAIN: fixture.test\nDB_NAME: fixture_db\n');
  write('evidence.js', '// Reference evidence\n');
  write('docs/memory/state.md', '# State\nThe local fixture contains a reviewed source.\n');
  write('docs/memory/decisions.md', '# Old\nHistorical behavior\n\n# Current\nUse explicit activation.\n\n# Other\nDifferent branch policy.\n');
  write('docs/memory/handoff.md', '# Handoff\nContinue the pending source review.\n');
  write('docs/memory/heuristic.md', '# Rule\nRead the relevant source.\n');
  git('add', '.');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '--quiet', '-m', 'fixture');
  const revision = git('rev-parse', 'HEAD');
  const make = (id, type, source, extra = {}) => ({
    id, type, status: 'active', scope: {},
    source: { path: source },
    evidence: [{ path: 'evidence.js' }],
    verifiedOn: '2026-11-24',
    ...extra
  });
  const entries = [
    make('MEM-STATE-001', 'state', 'docs/memory/state.md'),
    make('ADR-OLD-001', 'decision', 'docs/memory/decisions.md', {
      status: 'superseded', topic: 'activation',
      source: { path: 'docs/memory/decisions.md', section: 'Old' },
      verifiedOn: '2026-11-10'
    }),
    make('ADR-CURRENT-001', 'decision', 'docs/memory/decisions.md', {
      topic: 'activation', supersedes: 'ADR-OLD-001',
      source: { path: 'docs/memory/decisions.md', section: 'Current' }
    }),
    make('MEM-HANDOFF-001', 'handoff', 'docs/memory/handoff.md', { scope: { branch: 'main' }, revision }),
    make('HEUR-TOOLS-001', 'heuristic', 'docs/memory/heuristic.md', {
      scope: { paths: ['scripts'], tags: ['tooling'] }
    })
  ];
  const save = () => write('docs/memory/index.json', JSON.stringify({ version: 1, entries }, null, 2));
  save();
  return { root, write, git, make, entries, save };
}

test('memory selects active, scoped sources and excludes replaced and foreign branch entries', t => {
  const { root, entries, make, save } = fixture(t);
  entries.push(make('ADR-OTHER-001', 'decision', 'docs/memory/decisions.md', {
    topic: 'other-activation', scope: { branch: 'other' },
    source: { path: 'docs/memory/decisions.md', section: 'Other' }
  }));
  save();
  assert.equal(checkMemory(root), 6);
  const result = selectMemory(root, { paths: ['scripts/tool.js'], tags: ['tooling'], today: '2026-11-24' });
  assert.deepEqual(result.entries.map(entry => entry.id), [
    'MEM-STATE-001', 'MEM-HANDOFF-001', 'ADR-CURRENT-001', 'HEUR-TOOLS-001'
  ]);
  assert.ok(result.entries.every(entry => !entry.body.includes('Historical behavior')));
  assert.equal(result.omitted.unrelated, 1);
  const unrelated = selectMemory(root, { tags: ['frontend'], today: '2026-11-24' });
  assert.equal(unrelated.entries.some(entry => entry.id === 'HEUR-TOOLS-001'), false);
});

test('memory reports omission and preserves an exact serialized byte budget', t => {
  const { root, write, entries, make, save } = fixture(t);
  write('docs/memory/large.md', '# Large\n' + 'Important source. '.repeat(1000));
  entries.push(make('HEUR-LARGE-001', 'heuristic', 'docs/memory/large.md'));
  entries.push(make('HEUR-STALE-001', 'heuristic', 'docs/memory/heuristic.md', {
    verifiedOn: '2026-11-01', reviewBy: '2026-11-10'
  }));
  save();
  const result = selectMemory(root, { maxBytes: 1024, today: '2026-11-24' });
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 1024);
  assert.ok(result.omitted.budget > 0);
  assert.equal(result.omitted.stale, 1);
  assert.throws(() => selectMemory(root, { maxBytes: 10 }), /between 1024 and 65536/);
});

test('memory rejects ambiguous decisions, duplicate IDs, broken references, and invalid replacement chains', t => {
  const { root, entries, make, save } = fixture(t);
  const conflict = make('ADR-CONFLICT-001', 'decision', 'docs/memory/decisions.md', { topic: 'activation' });
  entries.push(conflict);
  save();
  assert.throws(() => checkMemory(root), /ambiguous active decision/);
  entries.pop();
  entries.push({ ...entries[0] });
  save();
  assert.throws(() => checkMemory(root), /unique memory ID/);
  entries.pop();
  entries[0].evidence = [{ path: 'missing.js' }];
  save();
  assert.throws(() => checkMemory(root), /missing source missing.js/);
  entries[0].evidence = [{ path: 'evidence.js' }];
  delete entries[2].supersedes;
  save();
  assert.throws(() => checkMemory(root), /has no replacement/);
});

test('memory proposals keep index read-only and require evidence and safe source metadata', t => {
  const { root, write } = fixture(t);
  const index = path.join(root, 'docs/memory/index.json');
  const original = fs.readFileSync(index, 'utf8');
  write('proposal.json', JSON.stringify({
    id: 'HEUR-PROPOSAL-001', type: 'heuristic', scope: { tags: ['tooling'] },
    evidence: [{ path: 'evidence.js' }], summary: 'Inspect the current implementation before selecting a tool.'
  }));
  const result = buildMemoryProposal(root, 'proposal.json');
  assert.equal(result.status, 'proposed');
  assert.equal(fs.readFileSync(index, 'utf8'), original);
  write('proposal.json', JSON.stringify({
    id: 'HEUR-PROPOSAL-002', type: 'heuristic', scope: {},
    evidence: [{ path: '.env.local' }], summary: 'invalid'
  }));
  assert.throws(() => buildMemoryProposal(root, 'proposal.json'), /safe repository-relative path/);
});

test('handoff from an earlier revision requires rechecking and an unrelated revision is excluded', t => {
  const { root, write, git, entries, save } = fixture(t);
  write('another.js', '// New source\n');
  git('add', 'another.js');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '--quiet', '-m', 'next');
  const result = selectMemory(root, { today: '2026-11-24' });
  assert.equal(result.entries.find(entry => entry.type === 'handoff').needsRevisionCheck, true);
  entries.find(entry => entry.type === 'handoff').revision = '0'.repeat(40);
  save();
  const missing = selectMemory(root, { today: '2026-11-24' });
  assert.equal(missing.entries.some(entry => entry.type === 'handoff'), false);
  assert.equal(missing.omitted.stale, 1);
});

test('memory CLI validates the project index and returns bounded compact JSON', () => {
  const checked = spawnSync(process.execPath, [path.join(repo, 'scripts/memory.js'), 'check'], {
    cwd: repo, encoding: 'utf8', timeout: 10_000
  });
  assert.equal(checked.status, 0, checked.stderr);
  assert.match(checked.stdout, /Validated \d+ indexed memory entries/);
  const context = spawnSync(process.execPath, [path.join(repo, 'scripts/memory.js'), 'context', '--tag', 'tooling', '--max-bytes', '2048'], {
    cwd: repo, encoding: 'utf8', timeout: 10_000
  });
  assert.equal(context.status, 0, context.stderr);
  assert.ok(Buffer.byteLength(context.stdout.trimEnd()) <= 2048);
  assert.equal(JSON.parse(context.stdout).project, 'AIMASTER');
});
