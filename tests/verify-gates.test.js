const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { checkTrackedFilenames } = require('../scripts/lib/verification.js');
const { runUnitTests } = require('../scripts/qa-unit-offline.cjs');
const { checkReadiness } = require('../scripts/verify-gates.js');

function withWorkspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aom-gate-'));
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  return root;
}

test('Gate 0 rejects environment file names in the Git index', (t) => {
  const root = withWorkspace(t);
  function git(...args) {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
  git('init', '--quiet');
  checkTrackedFilenames(root);
  fs.writeFileSync(path.join(root, '.env.local'), '# Empty fixture\n');
  git('add', '--force', '.env.local');
  assert.throws(() => checkTrackedFilenames(root), /Sensitive environment or key filenames.*\.env\.local/);
});

const validContext = [
  'PROJECT_NAME: Example workspace',
  'PROJECT_ID: EXAMPLE',
  'PROJECT_DOMAIN: example.test',
  'DB_NAME: example'
].join('\n');

test('Gate 1 requires the complete project context and every declared repository reference', (t) => {
  const root = withWorkspace(t);
  const contextPath = path.join(root, 'PROJECT_CONTEXT.md');
  assert.throws(() => checkReadiness(root), /PROJECT_CONTEXT.md missing/);
  fs.writeFileSync(contextPath, validContext.replace('EXAMPLE', ''));
  assert.throws(() => checkReadiness(root), /PROJECT_ID.*non-empty/);

  fs.writeFileSync(contextPath, validContext);
  fs.mkdirSync(path.join(root, 'agents'));
  fs.mkdirSync(path.join(root, 'skills'));
  fs.writeFileSync(path.join(root, 'agents', 'test-agent.md'), [
    'Repository references: `docs/guide.md`.',
    'Target-project evidence: `docs/product/ACCEPTANCE.md`.'
  ].join('\n'));
  assert.throws(() => checkReadiness(root), /Unresolved repository references:\n.*docs\/guide.md/);
  fs.mkdirSync(path.join(root, 'docs'));
  fs.writeFileSync(path.join(root, 'docs', 'guide.md'), '# Test guide\n');

  const skill = path.join(root, 'skills', 'example-skill');
  fs.mkdirSync(skill);
  fs.writeFileSync(path.join(skill, 'SKILL.md'), '# Example skill\n');
  function writeMatrix(agent) {
    fs.writeFileSync(path.join(root, 'agents', 'orchestrator.md'), [
      '| Workstream | Specialist Dispatch Chain | Relevant Skills |',
      '| --- | --- | --- |',
      '| Example | `' + agent + '` | `example-skill` |'
    ].join('\n'));
  }
  writeMatrix('example-skill');
  assert.throws(() => checkReadiness(root), /unresolved agent example-skill/);
  writeMatrix('test-agent');
  checkReadiness(root);
});

test('T1 executes its unit tests with a sanitized environment and reports child failures', (t) => {
  const root = withWorkspace(t);
  const testsPath = path.join(root, 'tests');
  fs.mkdirSync(testsPath);
  assert.throws(() => runUnitTests(root, { stdio: 'pipe' }), /No unit test files/);
  const fixture = path.join(testsPath, 'runner.test.js');
  fs.writeFileSync(fixture, [
    "const test = require('node:test');",
    "const assert = require('node:assert/strict');",
    "test('test fixture', () => {",
    "  assert.equal(process.env.AOM_TEST_PRIVATE_VALUE, undefined);",
    "  assert.equal(process.env.NODE_ENV, 'test');",
    '});'
  ].join('\n'));
  const before = process.env.AOM_TEST_PRIVATE_VALUE;
  process.env.AOM_TEST_PRIVATE_VALUE = 'local-test-marker';
  try {
    assert.equal(runUnitTests(root, { stdio: 'pipe' }), 1);
  } finally {
    if (before === undefined) delete process.env.AOM_TEST_PRIVATE_VALUE;
    else process.env.AOM_TEST_PRIVATE_VALUE = before;
  }
  fs.appendFileSync(fixture, "\ntest('intentional failure', () => assert.fail('fixture failure'));\n");
  assert.throws(() => runUnitTests(root, { stdio: 'pipe' }), /Unit test suite failed with exit code 1/);
  assert.throws(() => runUnitTests(root, {
    executable: path.join(root, 'missing-node-executable'), stdio: 'pipe'
  }), /Unable to run the unit test suite/);
});
