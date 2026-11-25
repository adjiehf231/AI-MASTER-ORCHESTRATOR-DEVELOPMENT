const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildAdapters, buildArtifacts } = require('../scripts/sync-adapters');
const { renderRelease, patchManagedMarkdown } = require('../scripts/lib/updater/render');

function fixture(t) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestrator-render-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const source = path.join(temporary, 'signed-vendor');
  const project = path.join(temporary, 'customer-project');
  fs.mkdirSync(project);
  function write(root, filename, contents) {
    const target = path.join(root, filename);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
  const context = name => `PROJECT_NAME: ${name}\nPROJECT_ID: OFFICE\nPROJECT_DOMAIN: office.example\nDB_NAME: office_db\nSRC_DIR: app\n`;
  write(source, 'PROJECT_CONTEXT.template.md', context('Vendor Identity'));
  write(source, 'PROJECT_CONTEXT.md', context('Wrong Active Vendor'));
  write(project, 'ai-orchestrator/PROJECT_CONTEXT.md', context('Customer Office'));
  write(source, 'agents/orchestrator.md', [
    '---', 'name: orchestrator', 'description: Build ${PROJECT_NAME}.', 'mode: primary', '---',
    '# ${PROJECT_NAME}', 'Use ${DB_NAME} from ${SRC_DIR}.',
    'Read `orchestration/routes.json`, `docs/process/TASK_WORKFLOW.md` and `docs/memory/index.json`.',
    ''
  ].join('\n'));
  write(source, 'skills/passive/SKILL.md', '---\nname: passive\ndescription: Help ${PROJECT_NAME}.\n---\n# Passive resource\n');
  write(source, 'skills/passive/assets/payload.bin', Buffer.from([0, 255, 128, 1]));
  write(source, 'orchestration/routes.json', '{}\n');
  write(source, 'docs/process/TASK_WORKFLOW.md', '# Task workflow\n');
  return { temporary, source, project, write, context };
}

test('pure artifacts preserve the original single-root adapter contract', t => {
  const { source } = fixture(t);
  const pure = buildArtifacts(source);
  const legacy = buildAdapters(source);
  assert.equal(legacy.files.size, pure.files.size + 1);
  for (const [filename, bytes] of pure.files) assert.deepEqual(legacy.files.get(filename), bytes, filename);
  assert.deepEqual(legacy.removals, []);
  assert.equal(fs.existsSync(path.join(source, 'CLAUDE.md')), false);
});

test('passive multi-root rendering binds only active customer context and writes nothing', t => {
  const { source, project, temporary, write } = fixture(t);
  const canary = path.join(temporary, 'executed');
  const code = `require('node:fs').writeFileSync(${JSON.stringify(canary)}, 'bad'); throw new Error('must not execute');`;
  write(source, 'scripts/sync-adapters.js', code);
  write(source, 'package.json', JSON.stringify({ scripts: { postinstall: code } }));
  write(project, '.orchestrator/tasks/local.json', '{"local":true}\n');
  write(project, 'ai-orchestrator/docs/memory/custom.md', 'Retain project knowledge.\r\n');
  const result = renderRelease(source, { projectRoot: project });
  assert.deepEqual(result.conflicts, []);
  const prompt = result.files.get('CLAUDE.md').toString();
  assert.match(prompt, /Customer Office/);
  assert.match(prompt, /office_db from app/);
  assert.match(prompt, /`ai-orchestrator\/orchestration\/routes.json`/);
  assert.match(prompt, /`ai-orchestrator\/docs\/process\/TASK_WORKFLOW.md`/);
  assert.match(prompt, /`docs\/memory\/index.json`/);
  assert.doesNotMatch(prompt, /Vendor Identity|Wrong Active Vendor/);
  assert.equal(prompt.includes(source), false);
  const catalog = JSON.parse(result.files.get('ai-orchestrator/adapters/component-catalog.json'));
  assert.equal(catalog.agents[0].filename, 'ai-orchestrator/agents/orchestrator.md');
  assert.deepEqual(result.files.get('.agents/skills/passive/assets/payload.bin'), Buffer.from([0, 255, 128, 1]));
  assert.equal(result.files.has('ai-orchestrator/PROJECT_CONTEXT.md'), false);
  assert.equal(fs.existsSync(canary), false);
  assert.equal(fs.existsSync(path.join(project, 'CLAUDE.md')), false);
  assert.equal(fs.readFileSync(path.join(project, '.orchestrator/tasks/local.json'), 'utf8'), '{"local":true}\n');
  assert.equal(fs.readFileSync(path.join(project, 'ai-orchestrator/docs/memory/custom.md'), 'utf8'), 'Retain project knowledge.\r\n');
});

test('missing or malformed active project context blocks without vendor template fallback', t => {
  const { source, project, write } = fixture(t);
  fs.unlinkSync(path.join(project, 'ai-orchestrator/PROJECT_CONTEXT.md'));
  write(project, 'ai-orchestrator/PROJECT_CONTEXT.template.md', 'PROJECT_NAME: Still not active\n');
  let result = renderRelease(source, { projectRoot: project });
  assert.equal(result.files.size, 0);
  assert.equal(result.conflicts[0].code, 'PROJECT_CONTEXT_UNSUPPORTED');
  write(project, 'ai-orchestrator/PROJECT_CONTEXT.md', '# Legacy context with no recognized settings\n');
  result = renderRelease(source, { projectRoot: project });
  assert.equal(result.files.size, 0);
  assert.match(result.conflicts[0].message, /missing project settings/);
});

test('explicit install and context roots remain separate and support passive custom components', t => {
  const { source, project, write, context } = fixture(t);
  write(project, 'config/PROJECT_CONTEXT.md', context('Separate Context'));
  const sourceOverrides = new Map([['agents/project-reviewer.md', '---\nname: project-reviewer\ndescription: Review ${PROJECT_NAME}.\n---\n# Project reviewer\n']]);
  const result = renderRelease(source, { projectRoot: project, installationPath: 'tools/engine',
    contextRoot: path.join(project, 'config'), sourceOverrides });
  assert.deepEqual(result.conflicts, []);
  assert.match(result.files.get('.claude/agents/project-reviewer.md').toString(), /Separate Context/);
  assert.ok(result.files.has('tools/engine/adapters/codex/AGENTS.md'));
  assert.equal(result.files.has('ai-orchestrator/adapters/codex/AGENTS.md'), false);
  assert.throws(() => renderRelease(source, { projectRoot: project, installationPath: '../escape' }), /safe project-relative/);
  const outside = renderRelease(source, { projectRoot: project, contextRoot: source });
  assert.equal(outside.files.size, 0);
  assert.equal(outside.conflicts[0].code, 'PROJECT_CONTEXT_UNSUPPORTED');
});

test('prior verified context can be re-rendered without changing the active project context', t => {
  const { source, project, context } = fixture(t);
  const activePath = path.join(project, 'ai-orchestrator/PROJECT_CONTEXT.md');
  const active = fs.readFileSync(activePath);
  const previous = Buffer.from(context('Prior Project Name'));
  const result = renderRelease(source, { projectRoot: project, contextBytes: previous });
  assert.deepEqual(result.conflicts, []);
  assert.match(result.files.get('CLAUDE.md').toString(), /Prior Project Name/);
  assert.deepEqual(fs.readFileSync(activePath), active);
});

test('authenticated source snapshots determine all rendered bytes without reading mutable source files', t => {
  const { source, project, write } = fixture(t);
  const sourceFiles = new Map();
  function snapshot(directory, prefix = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      if (entry.isDirectory()) snapshot(path.join(directory, entry.name), relative + '/');
      else sourceFiles.set(relative, fs.readFileSync(path.join(directory, entry.name)));
    }
  }
  snapshot(source);
  write(source, 'agents/orchestrator.md', 'Corrupted after signature verification');
  write(source, 'skills/passive/assets/injected.md', 'Unverified resource');
  fs.renameSync(source, source + '-no-longer-present');
  const rendered = renderRelease(source, { projectRoot: project, sourceFiles });
  assert.deepEqual(rendered.conflicts, []);
  assert.match(rendered.files.get('CLAUDE.md').toString(), /Customer Office/);
  assert.deepEqual(rendered.files.get('.agents/skills/passive/assets/payload.bin'), Buffer.from([0, 255, 128, 1]));
  assert.equal(rendered.files.has('.agents/skills/passive/assets/injected.md'), false);
  assert.throws(() => buildArtifacts(source, { sourceFiles }), /explicit project context/);
  const invalid = new Map(sourceFiles);
  invalid.set('skills/passive/../../escape.md', Buffer.from('bad'));
  assert.throws(() => renderRelease(source, { projectRoot: project, sourceFiles: invalid }), /invalid relative path/);
});

test('library relocation leaves project scripts and context-expanded paths in the active project scope', t => {
  const { source, project, write, context } = fixture(t);
  write(source, 'scripts/memory.js', '// Passive library source\n');
  write(project, 'ai-orchestrator/PROJECT_CONTEXT.md', context('Customer Office').replace('SRC_DIR: app', 'SRC_DIR: scripts'));
  const component = fs.readFileSync(path.join(source, 'agents/orchestrator.md'), 'utf8');
  write(source, 'agents/orchestrator.md', component + '\nUse `scripts/memory.js`, `scripts/guard-db-push.ts`, `${SRC_DIR}/memory.js`, `docs/architecture/ADR-001.md` and `docs/delivery/report.md`.\n');
  const result = renderRelease(source, { projectRoot: project });
  const prompt = result.files.get('CLAUDE.md').toString();
  assert.match(prompt, /`ai-orchestrator\/scripts\/memory.js`/);
  assert.match(prompt, /`scripts\/guard-db-push.ts`/);
  assert.match(prompt, /, `scripts\/memory.js`,/);
  assert.match(prompt, /`docs\/architecture\/ADR-001.md`/);
  assert.match(prompt, /`docs\/delivery\/report.md`/);
});

test('skill metadata and component-relative resources retain their native meaning', t => {
  const { source, project, write } = fixture(t);
  const { parseFrontmatter } = require('../scripts/lib/frontmatter');
  write(source, 'scripts/check.js', '// Library helper\n');
  write(source, 'skills/passive/scripts/check.js', '// Skill-owned helper, never executed by renderer\n');
  write(source, 'skills/passive/references/details.md', '# Local resource\n');
  write(source, 'skills/passive/SKILL.md', [
    '---', 'name: passive', 'description: Help ${PROJECT_NAME}.', 'license: MIT',
    'compatibility: Node 22', 'metadata:', '  owner: project-team', '  features:', '    - read-only', '---',
    '# Passive resource', 'Run `scripts/check.js` only through approved project tooling.',
    'Read [details](references/details.md) and `docs/process/TASK_WORKFLOW.md`.', ''
  ].join('\n'));
  const result = renderRelease(source, { projectRoot: project });
  const component = parseFrontmatter(result.files.get('.agents/skills/passive/SKILL.md').toString(), 'rendered skill');
  assert.equal(component.attributes.license, 'MIT');
  assert.equal(component.attributes.compatibility, 'Node 22');
  assert.deepEqual(component.attributes.metadata, { owner: 'project-team', features: ['read-only'] });
  assert.match(component.body, /`scripts\/check.js`/);
  assert.doesNotMatch(component.body, /`ai-orchestrator\/scripts\/check.js`/);
  assert.match(component.body, /\[details\]\(references\/details.md\)/);
  assert.match(component.body, /`ai-orchestrator\/docs\/process\/TASK_WORKFLOW.md`/);
  assert.equal(result.files.get('.agents/skills/passive/scripts/check.js').toString(), '// Skill-owned helper, never executed by renderer\n');
});

test('shared files without adopted regions and existing YAML yield fragments and conflicts', t => {
  const { source, project, write } = fixture(t);
  const local = Buffer.from('\ufeff# Existing customer rules\r\nNever relax access.\r\n');
  write(project, 'CLAUDE.md', local);
  write(project, '.aider.conf.yml', 'custom-key: local\n');
  const result = renderRelease(source, { projectRoot: project });
  assert.equal(result.files.has('CLAUDE.md'), false);
  assert.equal(result.files.has('.aider.conf.yml'), false);
  assert.ok(result.conflicts.some(item => item.path === 'CLAUDE.md' && item.code === 'SHARED_REGION_CONFLICT'));
  assert.ok(result.conflicts.some(item => item.path === '.aider.conf.yml' && item.code === 'SHARED_FORMAT_UNSUPPORTED'));
  assert.deepEqual(fs.readFileSync(path.join(project, 'CLAUDE.md')), local);
  assert.equal(fs.readFileSync(path.join(project, '.aider.conf.yml'), 'utf8'), 'custom-key: local\n');
});

test('an unchanged generated shared YAML remains a no-op candidate', t => {
  const { source, project, write } = fixture(t);
  const first = renderRelease(source, { projectRoot: project });
  write(project, '.aider.conf.yml', first.files.get('.aider.conf.yml'));
  const repeated = renderRelease(source, { projectRoot: project });
  assert.deepEqual(repeated.conflicts, []);
  assert.deepEqual(repeated.files.get('.aider.conf.yml'), first.files.get('.aider.conf.yml'));
});

test('managed Markdown retains every byte outside its region including BOM, CRLF and Unicode', () => {
  const start = '<!-- orchestrator:managed:start id="orchestrator-guidance-v1" -->';
  const end = '<!-- orchestrator:managed:end id="orchestrator-guidance-v1" -->';
  const prefix = Buffer.from('\ufeff# Aturan pengguna: selamat\r\n\r\n' + start + '\r\n');
  const suffix = Buffer.from(end + '\r\n\r\n## Pengetahuan proyek\r\nTetap utuh.');
  const original = Buffer.concat([prefix, Buffer.from('Old\r\n'), suffix]);
  const result = patchManagedMarkdown(original, 'New\nSecond line\n');
  assert.deepEqual(result, Buffer.concat([prefix, Buffer.from('New\r\nSecond line\r\n'), suffix]));
  assert.deepEqual(patchManagedMarkdown(result, 'New\nSecond line\n'), result);
  const bomFirst = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), patchManagedMarkdown(undefined, 'Old')]);
  assert.ok(patchManagedMarkdown(bomFirst, 'New').subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])));
});

test('ambiguous markers and unsupported encoding never produce a shared-file proposal', () => {
  const valid = patchManagedMarkdown(undefined, 'Original');
  assert.throws(() => patchManagedMarkdown(Buffer.concat([valid, valid]), 'New'), /unambiguous/);
  assert.throws(() => patchManagedMarkdown(Buffer.from('User rules'), 'New'), /unambiguous/);
  assert.throws(() => patchManagedMarkdown(Buffer.from([255, 254]), 'New'), /encoding/);
  assert.throws(() => patchManagedMarkdown(valid, '<!-- orchestrator:managed:start id="evil" -->'), /reserved/);
  assert.throws(() => patchManagedMarkdown(Buffer.from('prefix' + valid), 'New'), /boundaries/);
});
