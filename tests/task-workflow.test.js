const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const workflow = require('../scripts/lib/task-workflow');
const { shortDirectoryAlias } = require('./windows-path-alias');

const repo = path.resolve(__dirname, '..');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aom-task-test-'));
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
  write('.gitignore', '.orchestrator/\n');
  write('source.js', 'module.exports = 1;\n');
  write('scripts/probe.js', "if(process.env.AOM_PRIVATE_FIXTURE)process.exit(4);\n");
  write('scripts/fail.js', 'process.exit(3);\n');
  write('orchestrator-checks.json', JSON.stringify({
    checks: {
      probe: { script: 'scripts/probe.js' },
      failure: { script: 'scripts/fail.js' }
    }
  }));
  git('add', '.');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '--quiet', '-m', 'fixture');
  return { root, write, git };
}

function task(root, checks = ['probe']) {
  return workflow.createTask({
    title: 'Check a fixture',
    scope: 'The fixture source',
    todo: 'Verify source behavior',
    verification: 'The named probe exits successfully',
    owner: 'qa-engineer',
    check: checks
  }, workflow.snapshot(root));
}

test('task workspace accepts a Windows short path for the same Git root and rejects a nested directory', {
  skip: process.platform !== 'win32'
}, t => {
  const { root } = fixture(t);
  const alias = shortDirectoryAlias(root);
  if (!alias) return t.skip('The fixture filesystem does not provide Windows short path aliases.');
  assert.equal(workflow.resolveWorkspace(alias), fs.realpathSync.native(root));
  const nested = path.join(root, 'nested');
  fs.mkdirSync(nested);
  assert.throws(() => workflow.resolveWorkspace(nested), /Git workspace root/);
});

test('task completion requires executed checks at the current source and scope', t => {
  const { root, write } = fixture(t);
  const state = task(root);
  assert.throws(() => workflow.updateTask(state, { item: '1', status: 'DONE' }), /evidence is required/);
  assert.throws(() => workflow.recordNote(state, { item: '1', status: 'PASS', check: ['probe'] }), /PASS comes from/);
  const previous = process.env.AOM_PRIVATE_FIXTURE;
  process.env.AOM_PRIVATE_FIXTURE = 'private-fixture-marker';
  try {
    const result = workflow.executeCheck(root, state, { item: '1', check: ['probe'] });
    assert.equal(result.status, 'PASS');
    assert.equal(result.exitCode, 0);
  } finally {
    if (previous === undefined) delete process.env.AOM_PRIVATE_FIXTURE;
    else process.env.AOM_PRIVATE_FIXTURE = previous;
  }
  workflow.updateTask(state, { item: '1', status: 'DONE' });
  workflow.completeReport(state);
  assert.equal(workflow.taskView(state).lastReport.outcome, 'DONE');
  assert.equal(workflow.taskView(state).lastReport.current, true);
  write('source.js', 'module.exports = 2;\n');
  workflow.refreshTask(state, workflow.snapshot(root));
  assert.equal(state.items[0].status, 'IN_PROGRESS');
  assert.equal(workflow.taskView(state).lastReport.current, false);
  workflow.executeCheck(root, state, { item: '1', check: ['probe'] });
  workflow.updateTask(state, { item: '1', status: 'DONE' });
  workflow.updateTask(state, { scope: 'Expanded source requirement' });
  assert.equal(state.items[0].status, 'IN_PROGRESS');
});

test('task records blockers and failures without claiming a passing check', t => {
  const { root } = fixture(t);
  const state = task(root, ['failure']);
  assert.equal(workflow.executeCheck(root, state, { item: '1', check: ['failure'] }).status, 'FAIL');
  assert.equal(workflow.executeCheck(root, state, { item: '1', check: ['unknown'] }).status, 'BLOCKED');
  workflow.updateTask(state, { item: '1', status: 'BLOCKED', reason: 'The check needs a repair' });
  const report = workflow.completeReport(state);
  assert.match(report, /Status BLOCKED/);
  assert.match(report, /FAIL.*failure/);
  assert.match(report, /BLOCKED.*unknown/);
  assert.equal(workflow.taskView(state).lastReport.current, true);
});

test('artifact proof is distinct from executed evidence and decisions preserve dissent', t => {
  const { root, write } = fixture(t);
  write('docs/review.md', '# Fixture review\n');
  const state = task(root, []);
  workflow.recordArtifact(root, state, { item: '1', artifact: ['docs/review.md'], reason: 'Reviewed the expected text' });
  workflow.updateTask(state, { item: '1', status: 'DONE' });
  workflow.recordDecision(root, state, {
    question: 'Which local check?',
    choice: 'Use the fixture probe',
    reason: 'Its scope matches the acceptance criterion',
    alternative: ['Use a browser'],
    dissent: ['Browser evidence is not required for this source'],
    artifact: ['docs/review.md'],
    owner: 'orchestrator'
  });
  const report = workflow.completeReport(state);
  assert.match(report, /Reviewed artifact docs\/review.md/);
  assert.match(report, /Alternative Use a browser/);
  assert.match(report, /Dissent Browser evidence/);
  assert.equal(state.decisions[0].revision.fingerprint, state.observed.fingerprint);
  assert.throws(() => workflow.recordArtifact(root, state, {
    item: '1', artifact: ['../outside.md'], reason: 'invalid'
  }), /Invalid relative path/);
});

test('task metadata stays outside the source fingerprint and incomplete reports stay open', t => {
  const { root } = fixture(t);
  const state = task(root);
  const before = workflow.snapshot(root);
  workflow.updateState(root, directory => workflow.storeTask(directory, state, workflow.completeReport(state)));
  assert.deepEqual(workflow.snapshot(root), before);
  const loaded = workflow.loadTask(root, state.id);
  assert.equal(loaded.id, state.id);
  assert.equal(workflow.taskView(loaded).lastReport.outcome, 'INCOMPLETE');
  assert.throws(() => workflow.loadTask(root, '../source'), /valid task ID/);
});

test('task CLI creates, resumes, and reports the same durable TODO', t => {
  const { root } = fixture(t);
  const invoke = (...args) => spawnSync(process.execPath, [path.join(repo, 'scripts/task-workflow.js'), ...args, '--workspace', root], {
    cwd: root, encoding: 'utf8', timeout: 10_000
  });
  const created = invoke('start', '--title', 'CLI fixture', '--scope', 'Local fixture', '--todo', 'Check source',
    '--verification', 'Probe exits 0', '--check', 'probe');
  assert.equal(created.status, 0, created.stderr);
  const state = JSON.parse(created.stdout);
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].status, 'PENDING');
  const resumed = invoke('resume', '--id', state.id);
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.equal(JSON.parse(resumed.stdout).id, state.id);
  const other = invoke('start', '--title', 'Failing fixture', '--scope', 'Failure path', '--todo', 'Check failure',
    '--verification', 'Report actual nonzero exit', '--check', 'failure');
  assert.equal(other.status, 0, other.stderr);
  assert.equal(invoke('check', '--id', JSON.parse(other.stdout).id, '--item', '1', '--check', 'failure').status, 1);
  assert.equal(invoke('check', '--id', state.id, '--item', '1', '--check', 'probe').status, 0);
  assert.equal(invoke('update', '--id', state.id, '--item', '1', '--status', 'DONE').status, 0);
  const result = invoke('report', '--id', state.id);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Status DONE/);
  assert.ok(fs.existsSync(path.join(root, '.orchestrator/tasks', state.id + '.md')));
});
