const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { searchContext, readContext, getTaskContext } = require('../scripts/lib/context');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'context-fixture-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  function git(...args) {
    const result = spawnSync('git', args, { cwd: directory, encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
  }
  function write(relative, content) {
    const destination = path.join(directory, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, content);
  }
  git('init', '--quiet');
  write('.gitignore', 'node_modules/\n.orchestrator/\n.env*\nignored/\n');
  write('src/example.js', 'const label = "Café 🌍";\r\nexport function sample() { return label; }\r\n');
  git('add', '.');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '--quiet', '-m', 'fixture');
  return { root: directory, write, git };
}

function size(value) {
  return Buffer.byteLength(JSON.stringify(value));
}

test('context search returns source proofs and reads exact UTF-8 text and line ranges', t => {
  const { root } = fixture(t);
  const result = searchContext(root, { query: 'SAMPLE', paths: ['src'] });
  assert.equal(result.totalMatches, 1);
  assert.equal(result.coverage.complete, true);
  assert.equal(result.entries[0].path, 'src/example.js');
  assert.equal(result.entries[0].line, 2);
  const source = fs.readFileSync(path.join(root, result.entries[0].path));
  assert.equal(result.entries[0].sha256, createHash('sha256').update(source).digest('hex'));
  const full = readContext(root, { ref: result.entries[0].ref });
  assert.equal(full.content, source.toString('utf8'));
  assert.equal(full.truncated, false);
  assert.equal(full.nextCursor, null);
  const line = readContext(root, { ref: result.entries[0].ref, startLine: 2, endLine: 2 });
  assert.equal(line.content, source.toString('utf8').split('\n')[1] + '\n');
  assert.deepEqual(line.range.start, { line: 2, column: 1 });
  assert.deepEqual(line.range.endExclusive, { line: 3, column: 1 });
});

test('search pagination fits the entire response budget and invalidates on uncommitted edits', t => {
  const { root, write } = fixture(t);
  write('src/matches.txt', Array.from({ length: 12 }, (_, i) => `needle ${i}`).join('\n'));
  const pages = [];
  let cursor;
  do {
    const page = searchContext(root, { query: 'needle', limit: 2, cursor, maxBytes: 2048 });
    assert.ok(size(page) <= 2048);
    pages.push(...page.entries);
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(pages.length, 12);
  assert.equal(new Set(pages.map(entry => entry.line)).size, 12);

  const first = searchContext(root, { query: 'needle', limit: 1 });
  write('src/matches.txt', 'needle changed\nneedle changed again');
  assert.throws(() => searchContext(root, { query: 'needle', cursor: first.nextCursor }), /stale/);
  assert.throws(() => readContext(root, { ref: first.entries[0].ref }), /stale/);
  assert.equal(searchContext(root, { query: 'needle' }).totalMatches, 2);
});

test('cache and source inventory reflect new and removed nonignored files', t => {
  const { root, write } = fixture(t);
  assert.equal(searchContext(root, { query: 'unique-context-fixture' }).totalMatches, 0);
  write('src/new-file.txt', 'unique-context-fixture');
  const found = searchContext(root, { query: 'unique-context-fixture' });
  assert.equal(found.totalMatches, 1);
  fs.unlinkSync(path.join(root, 'src/new-file.txt'));
  assert.equal(searchContext(root, { query: 'unique-context-fixture' }).totalMatches, 0);
  assert.throws(() => readContext(root, { ref: found.entries[0].ref }), /no longer available/);
});

test('default searches skip unchanged managed copies while explicit source paths retain access', t => {
  const { root, write } = fixture(t);
  const text = 'needle canonical body\n';
  write('skills/context-example/SKILL.md', text);
  const generated = '.claude/skills/context-example/SKILL.md';
  write(generated, text);
  write('adapters/native-profiles.json', JSON.stringify({ [generated]: createHash('sha256').update(text).digest('hex') }));
  const canonical = searchContext(root, { query: 'needle' });
  assert.equal(canonical.totalMatches, 1);
  assert.equal(canonical.entries[0].path, 'skills/context-example/SKILL.md');
  assert.equal(canonical.coverage.skipped.generated, 1);
  const explicit = searchContext(root, { query: 'needle', paths: [generated] });
  assert.equal(explicit.totalMatches, 1);
  assert.equal(readContext(root, { ref: explicit.entries[0].ref }).content, text);
  write(generated, text + 'manual change\n');
  assert.equal(searchContext(root, { query: 'needle' }).totalMatches, 2);
});

test('large Unicode lines paginate without losing content or splitting surrogate pairs', t => {
  const { root, write } = fixture(t);
  const original = '\uFEFF' + 'café 🌍 नमस्ते '.repeat(200) + '\nlast line\n';
  write('src/unicode.txt', original);
  const found = searchContext(root, { query: 'last line', paths: ['src/unicode.txt'] });
  let cursor;
  let reconstructed = '';
  let previousPosition = { line: 1, column: 1 };
  do {
    const page = readContext(root, { ref: found.entries[0].ref, cursor, maxBytes: 2048 });
    assert.ok(size(page) <= 2048);
    assert.equal(page.content.includes('\uFFFD'), false);
    assert.deepEqual(page.range.start, previousPosition);
    previousPosition = page.range.endExclusive;
    reconstructed += page.content;
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(reconstructed, original);
});

test('matching excerpts retain a match far into a large line', t => {
  const { root, write } = fixture(t);
  write('src/long.txt', 'a'.repeat(5000) + 'needle' + 'b'.repeat(5000));
  const found = searchContext(root, { query: 'needle', paths: ['src/long.txt'] });
  assert.match(found.entries[0].excerpt, /needle/);
  assert.ok(found.entries[0].excerptStartColumn > 4900);
});

test('context enforces source boundaries and skips credential files, ignored output and binary data', t => {
  const { root, write, git } = fixture(t);
  write('.env.production', 'context-private-marker');
  write('node_modules/fixture/index.js', 'context-private-marker');
  write('ignored/report.txt', 'context-private-marker');
  write('keys/private.pem', 'context-private-marker');
  write('src/binary.dat', Buffer.from([0, 255, 120]));
  write('src/too-big.txt', 'x'.repeat(1_048_577));
  git('add', '--force', '.env.production', 'keys/private.pem');
  const result = searchContext(root, { query: 'context-private-marker' });
  assert.equal(result.totalMatches, 0);
  assert.ok(result.coverage.skipped.excluded >= 2);
  assert.equal(result.coverage.skipped.binary, 1);
  assert.equal(result.coverage.skipped.oversized, 1);
  assert.equal(result.coverage.complete, false);
  for (const invalid of ['../outside', '/outside', 'C:\\outside', '.git/config', '.env.production', 'keys/private.pem']) {
    assert.throws(() => searchContext(root, { query: 'test', paths: [invalid] }), /path|excluded|escapes/);
  }
  const forged = Buffer.from(JSON.stringify({ version: 1, kind: 'source', path: 'ignored/report.txt',
    sha256: createHash('sha256').update('context-private-marker').digest('hex') })).toString('base64url');
  assert.throws(() => readContext(root, { ref: forged }), /no longer available/);
});

test('linked files cannot expose external content', t => {
  const { root, write } = fixture(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'context-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, 'outside.txt'), 'external-context-marker');
  try { fs.symlinkSync(path.join(outside, 'outside.txt'), path.join(root, 'src', 'link.txt')); }
  catch (error) {
    if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code)) {
      write('src/link.txt', 'temporary');
      const initial = searchContext(root, { query: 'temporary', paths: ['src/link.txt'] });
      fs.unlinkSync(path.join(root, 'src/link.txt'));
      fs.mkdirSync(path.join(root, 'src', 'link.txt'));
      assert.throws(() => readContext(root, { ref: initial.entries[0].ref }), /file type/);
      return;
    }
    throw error;
  }
  const result = searchContext(root, { query: 'external-context-marker' });
  assert.equal(result.totalMatches, 0);
  assert.ok(result.coverage.skipped.excluded > 0);
});

test('continuations cannot be reused with another query or workspace and arguments are validated', t => {
  const first = fixture(t);
  const second = fixture(t);
  first.write('src/matches.txt', 'sample\nsample\nsample');
  const found = searchContext(first.root, { query: 'sample', limit: 1 });
  assert.throws(() => searchContext(first.root, { query: 'label', cursor: found.nextCursor }), /stale/);
  assert.throws(() => searchContext(second.root, { query: 'sample', cursor: found.nextCursor }), /stale/);
  const sameSource = searchContext(first.root, { query: 'label', paths: ['src/example.js'] }).entries[0];
  assert.throws(() => readContext(second.root, { ref: sameSource.ref }), /another workspace/);
  assert.throws(() => readContext(first.root, { ref: 'invalid-json' }), /Invalid source/);
  assert.throws(() => searchContext(first.root, { query: '' }), /nonempty/);
  assert.throws(() => searchContext(first.root, { query: 'sample', maxBytes: 500 }), /maxBytes/);
  assert.throws(() => readContext(first.root, { ref: found.entries[0].ref, startLine: 99 }), /line range/);
  assert.throws(() => getTaskContext(first.root, { taskId: '../task' }), /Invalid task/);
  assert.throws(() => getTaskContext(first.root, { tags: ['invalid_tag'] }), /tags/);
});

test('task context reports unavailable optional foundations explicitly and is read-only', t => {
  const { root, git } = fixture(t);
  const before = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).stdout;
  const result = getTaskContext(root, { maxBytes: 1024 });
  assert.ok(size(result) <= 1024);
  assert.deepEqual(result.entries, []);
  assert.equal(result.services.memory.status, 'NOT_AVAILABLE');
  assert.equal(result.services.routing, 'NOT_AVAILABLE');
  assert.equal(result.services.task, 'NOT_REQUESTED');
  git('diff', '--exit-code');
  assert.equal(spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).stdout, before);
});

test('task context combines selected routing and TODO state with decision evidence without modifying it', t => {
  const { root, write } = fixture(t);
  write('orchestration/routes.json', JSON.stringify({ version: 1, routes: [{
    id: 'general', label: 'General', lead: 'orchestrator', reviewers: [], skills: ['test-skill'],
    needs: ['workspace-read'], tags: []
  }] }));
  write('agents/orchestrator.md', '# Fixture');
  write('skills/test-skill/SKILL.md', '# Fixture');
  const { createTask, snapshot, recordDecision } = require('../scripts/lib/task-workflow');
  const task = createTask({ title: 'Task context fixture', scope: 'Read source state', todo: 'Check result',
    verification: 'The result preserves the requested evidence' }, snapshot(root));
  recordDecision(root, task, { question: 'How to inspect?', choice: 'Read focused source', reason: 'Known entry point',
    alternative: ['Read everything'], dissent: ['Need the caller if incomplete'] });
  const filename = '.orchestrator/tasks/' + task.id + '.json';
  write(filename, JSON.stringify(task));
  const original = fs.readFileSync(path.join(root, filename), 'utf8');
  const result = getTaskContext(root, { taskId: task.id, maxBytes: 8192 });
  assert.equal(result.services.routing, 'AVAILABLE');
  assert.equal(result.services.task, 'AVAILABLE');
  assert.ok(result.entries.some(entry => entry.kind === 'todo' && entry.status === 'PENDING'));
  const decision = result.entries.find(entry => entry.kind === 'decision');
  assert.deepEqual(decision.alternatives, ['Read everything']);
  assert.deepEqual(decision.dissent, ['Need the caller if incomplete']);
  assert.equal(fs.readFileSync(path.join(root, filename), 'utf8'), original);
  assert.ok(size(result) <= 8192);
});
