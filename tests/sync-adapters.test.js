const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { applyFilePlan, withFileLock } = require('../scripts/lib/file-plan');
const { parseFrontmatter } = require('../scripts/lib/frontmatter');
const { loadProjectContext } = require('../scripts/lib/project-context');
const { buildAdapters, checkAdapters } = require('../scripts/sync-adapters');

const repoRoot = path.resolve(__dirname, '..');
const markdownContext = [
  '# Context',
  '- **Project Name (`${PROJECT_NAME}`):** \'Beta "Lab" $& Workspace\'',
  '- **Project ID (`${PROJECT_ID}`):** "AMP"',
  '- **Primary Domain (`${PROJECT_DOMAIN}`):** "amp.example"',
  '- **Database Name (`${DB_NAME}`):** "amp_db"',
  '- **Source Root (`${SRC_DIR}`):** `packages/app` (formerly `src`)',
  '- **Routing Model (`${OPENROUTER_MODEL}`):** `provider/model:variant`',
  '',
].join('\n');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestrator-sync-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  function write(filename, content) {
    const file = path.join(root, filename);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, 'utf8');
  }
  const read = filename => fs.readFileSync(path.join(root, filename), 'utf8');

  write('PROJECT_CONTEXT.template.md', markdownContext);
  write('PROJECT_CONTEXT.md', markdownContext);
  write('agents/orchestrator.md', [
    '---',
    'name: orchestrator',
    'description: \'Builds ${PROJECT_NAME} in C:\\workspace\\fixtures\'',
    'mode: primary',
    '---',
    '# Orchestrator',
    '',
    'Canonical marker. Use CR-${PROJECT_ID}-* and ${DB_NAME}_dev from ${SRC_DIR}.',
    '',
  ].join('\n'));
  write('skills/test-skill/SKILL.md', [
    '---',
    'name: test-skill',
    'description: >-',
    '  Help ${PROJECT_NAME}',
    '  validate its outputs.',
    '---',
    '# Test skill',
    '',
  ].join('\n'));

  return { root, write, read };
}

function sync(root, options) {
  return withFileLock(root, () => applyFilePlan(root, buildAdapters(root, options)));
}

test('sync binds actual context values in prompts, YAML and gateway payloads', t => {
  const { root, read } = fixture(t);
  const plan = buildAdapters(root);
  assert.ok(sync(root) > 0);
  assert.equal(checkAdapters(root, plan), plan.files.size);
  assert.equal(sync(root), 0);

  for (const filename of [
    'CLAUDE.md', '.cursorrules', '.windsurfrules', '.clinerules', '.opencoderules',
    'CONVENTIONS.md', '.continue/rules/universal-orchestrator.md',
    'adapters/opencode/AGENTS.md', 'adapters/openrouter/system-prompt.txt',
    'adapters/bundle/universal-system-prompt.md', 'adapters/antigravity/rules/AGENTS.md',
    '.claude/agents/orchestrator.md', '.opencode/agents/orchestrator.md',
  ]) {
    const output = read(filename);
    assert.match(output, /Canonical marker\. Use CR-AMP-\* and amp_db_dev from packages\/app\./);
    assert.doesNotMatch(output, /\$\{[A-Z_]+\}/);
  }
  const claude = parseFrontmatter(read('.claude/agents/orchestrator.md'), 'Claude');
  assert.equal(claude.attributes.description, 'Builds Beta "Lab" $& Workspace in C:\\workspace\\fixtures');
  const openCode = parseFrontmatter(read('.opencode/agents/orchestrator.md'), 'OpenCode');
  assert.equal(openCode.attributes.mode, 'primary');
  assert.match(read('CLAUDE.md'), /Help Beta "Lab" \$& Workspace validate its outputs\./);
  const continued = parseFrontmatter(read('.continue/rules/universal-orchestrator.md'), 'Continue');
  assert.equal(continued.attributes.name, 'Universal Master Orchestrator');
  const payload = JSON.parse(read('adapters/openrouter/payload.json'));
  assert.equal(payload.model, 'provider/model:variant');
  assert.deepEqual(payload.messages, [{ role: 'system', content: read('adapters/openrouter/system-prompt.txt') }]);
});

test('sync check is read-only, supports CRLF inputs, and keeps template placeholders', t => {
  const { root, read, write } = fixture(t);
  const script = path.join('scripts', 'sync-adapters.js');
  for (const file of [script, 'scripts/lib/file-plan.js', 'scripts/lib/frontmatter.js', 'scripts/lib/project-context.js']) {
    write(file, fs.readFileSync(path.join(repoRoot, file), 'utf8'));
  }
  const invoke = args => spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NODE_PATH: path.join(repoRoot, 'node_modules') },
  });
  assert.equal(invoke(['--check']).status, 1);
  assert.equal(fs.existsSync(path.join(root, 'CLAUDE.md')), false);

  assert.equal(invoke([]).status, 0);
  for (const file of ['agents/orchestrator.md', 'skills/test-skill/SKILL.md', 'PROJECT_CONTEXT.md']) {
    write(file, read(file).replace(/\n/g, '\r\n'));
  }
  const verified = invoke(['--check']);
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(invoke(['--template']).status, 0);
  const templates = JSON.parse(read('adapters/openrouter/payload.json'));
  assert.equal(templates.model, '${OPENROUTER_MODEL}');
  assert.match(templates.messages[0].content, /\$\{DB_NAME\}_dev/);
  assert.match(read('.claude/agents/orchestrator.md'), /\$\{PROJECT_NAME\}/);
  assert.equal(invoke(['--template', '--check']).status, 0);
  assert.equal(invoke(['--check']).status, 1);
});

test('simple project keys are supported and malformed context fails before sync', t => {
  const { root, write, read } = fixture(t);
  const simpleContext = 'PROJECT_NAME: User Platform\nPROJECT_ID: USER\nPROJECT_DOMAIN: user.example\nDB_NAME: user_db\n';
  write('PROJECT_CONTEXT.md', simpleContext);
  assert.equal(loadProjectContext(root).OPENROUTER_MODEL, 'openrouter/auto');
  assert.match(buildAdapters(root).files.get('CLAUDE.md'), /CR-USER-\* and user_db_dev/);

  write('PROJECT_CONTEXT.md', simpleContext + 'PROJECT_ID: USER\n');
  assert.throws(() => sync(root), /duplicate project setting/);
  write('PROJECT_CONTEXT.md', 'PROJECT_NAME: "unterminated\n');
  assert.throws(() => sync(root), /expected a non-empty, literal value/);
  write('PROJECT_CONTEXT.md', 'PROJECT_NAME: incomplete\n');
  assert.throws(() => sync(root), /missing project settings PROJECT_ID, PROJECT_DOMAIN, DB_NAME/);
  assert.equal(fs.existsSync(path.join(root, 'CLAUDE.md')), false);

  write('PROJECT_CONTEXT.md', simpleContext);
  write('agents/orchestrator.md', read('agents/orchestrator.md') + '${PROJECT_NAM}\n');
  assert.throws(() => buildAdapters(root), /unknown project placeholder/);
});

test('sync removes stale generated profiles and preserves unrelated or edited files', t => {
  const { root, write, read } = fixture(t);
  write('agents/checker.md', '---\nname: checker\ndescription: Check the workspace.\nmode: subagent\n---\n# Checker\n');
  write('.claude/agents/custom.md', 'Hand-written custom profile\n');
  sync(root);
  const claudeChecker = '.claude/agents/checker.md';
  const openCodeChecker = '.opencode/agents/checker.md';
  write(openCodeChecker, read(openCodeChecker) + '\nUser edits\n');

  fs.unlinkSync(path.join(root, 'agents/checker.md'));
  const stale = buildAdapters(root);
  assert.deepEqual(stale.removals, [claudeChecker]);
  assert.throws(() => checkAdapters(root, stale), /checker\.md/);
  sync(root);
  assert.equal(fs.existsSync(path.join(root, claudeChecker)), false);
  assert.match(read(openCodeChecker), /User edits/);
  assert.equal(read('.claude/agents/custom.md'), 'Hand-written custom profile\n');

  // Outputs copied with the canonical source can be adopted without overwriting a profile.
  fs.unlinkSync(path.join(root, 'adapters/native-profiles.json'));
  assert.equal(sync(root), 1);

  write('agents/custom.md', '---\nname: custom\ndescription: A matching profile.\n---\n# Custom\n');
  assert.throws(() => sync(root), /native profile is unmanaged or locally modified/);
  assert.equal(read('.claude/agents/custom.md'), 'Hand-written custom profile\n');
});

