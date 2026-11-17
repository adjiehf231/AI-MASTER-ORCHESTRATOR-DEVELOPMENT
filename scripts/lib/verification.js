const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { parseFrontmatter, validateComponent } = require('./frontmatter.js');
const { loadProjectContext } = require('./project-context.js');
const { runUnitTests } = require('../qa-unit-offline.cjs');

function git(root, args, { expected = [0], input } = {}) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', input, windowsHide: true });
  if (result.error) throw new Error('Unable to run Git', { cause: result.error });
  if (!expected.includes(result.status)) {
    throw new Error('git ' + args[0] + ' failed: ' + (result.stderr.trim() || result.status));
  }
  return result.stdout.split('\0').filter(Boolean);
}

function checkTrackedFilenames(root) {
  const tracked = git(root, ['ls-files', '--cached', '-z']);
  const sensitive = tracked.filter(file => {
    const name = path.posix.basename(file);
    return (name !== '.env.example' && /^\.env(?:\..*)?$/i.test(name)) || /\.(?:pem|key)$/i.test(name);
  });
  if (sensitive.length > 0) {
    throw new Error('Sensitive environment or key filenames in Git index: ' + sensitive.join(', '));
  }
}

function checkGitIgnore(root) {
  const files = ['', 'nested/']
    .flatMap(prefix => ['.env', '.env.production', '.env.test', '.env.local', '.env.example', 'sample.pem', 'sample.key']
    .map(name => prefix + name));
  const ignored = new Set(git(root, ['check-ignore', '--no-index', '--stdin', '-z'], {
    expected: [0, 1],
    input: files.join('\0') + '\0'
  }));
  for (const file of files) {
    const shouldBeIgnored = path.posix.basename(file) !== '.env.example';
    if (ignored.has(file) !== shouldBeIgnored) {
      throw new Error('.gitignore does not apply the expected rule for ' + file);
    }
  }
}

function checkMetadata(root) {
  const agentFiles = fs.readdirSync(path.join(root, 'agents'), { withFileTypes: true })
    .filter(file => file.isFile() && file.name.endsWith('.md'))
    .map(file => file.name);
  const skillDirs = fs.readdirSync(path.join(root, 'skills'), { withFileTypes: true })
    .filter(file => file.isDirectory())
    .map(file => file.name);
  if (!agentFiles.includes('orchestrator.md') || skillDirs.length === 0) {
    throw new Error('Expected the orchestrator and at least one skill in the canonical library');
  }
  for (const file of agentFiles) {
    const relative = 'agents/' + file;
    validateComponent(fs.readFileSync(path.join(root, relative), 'utf8'), file.slice(0, -3), 'agent', relative);
  }
  for (const skill of skillDirs) {
    const relative = 'skills/' + skill + '/SKILL.md';
    validateComponent(fs.readFileSync(path.join(root, relative), 'utf8'), skill, 'skill', relative);
  }
}

function checkActiveContext(root) {
  if (!fs.statSync(path.join(root, 'PROJECT_CONTEXT.md'), { throwIfNoEntry: false })?.isFile()) {
    throw new Error('PROJECT_CONTEXT.md missing from repository root');
  }
  return loadProjectContext(root);
}

function componentMarkdown(root) {
  return ['agents', 'skills'].flatMap(dir => fs.readdirSync(path.join(root, dir), {
    recursive: true,
    withFileTypes: true
  }).filter(file => file.isFile() && file.name.endsWith('.md'))
    .map(file => path.join(file.parentPath, file.name)).sort());
}

function checkLegacyTerms(root) {
  const patterns = [/\bcareer\b/i, /\bATS\b/, /\bCV\b/, /\balamat_lengkap\b/i, /\bkarirly\b/i];
  for (const file of componentMarkdown(root)) {
    const content = fs.readFileSync(file, 'utf8');
    const leak = patterns.find(pattern => pattern.test(content));
    if (leak) throw new Error(path.relative(root, file) + ' contains a legacy domain term: ' + leak.source);
  }
}

const REFERENCE_LABEL = /^\s*(?:[-*]\s+)?(?:\*\*)?(?:Repository references|Authoritative (?:sources|references|artifacts|standards)|Source of truth(?: references)?)\s*(?:\*\*)?:/i;
const REPOSITORY_PATH = /^(?:\.\/)?(?:docs|skills|agents|scripts|tests|adapters|\.github)\//;
const ROOT_FILE = /^(?:\.\/)?[\w.-]+\.[\w-]+$/;

function checkRepositoryReferences(root) {
  const missing = [];
  for (const file of componentMarkdown(root)) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!REFERENCE_LABEL.test(line)) return;
      for (const match of line.matchAll(/\x60([^\x60]+)\x60/g)) {
        const reference = match[1].split('#')[0];
        if (!REPOSITORY_PATH.test(reference) && !ROOT_FILE.test(reference)) continue;
        if (reference.split('/').includes('..') || !fs.existsSync(path.join(root, reference))) {
          missing.push(path.relative(root, file) + ':' + (index + 1) + ' -> ' + reference);
        }
      }
    });
  }
  if (missing.length > 0) throw new Error('Unresolved repository references:\n' + missing.join('\n'));
}

function checkDispatchReferences(root) {
  const relative = 'agents/orchestrator.md';
  const lines = fs.readFileSync(path.join(root, relative), 'utf8').split(/\r?\n/);
  const header = lines.findIndex(line => /^\|\s*Workstream\s*\|\s*(?:Autonomous|Specialist) Dispatch Chain\s*\|/i.test(line));
  if (header < 0) throw new Error(relative + ': expected the Master Dispatch Matrix');

  const invalid = [];
  let rowCount = 0;
  for (let index = header + 2; index < lines.length && lines[index].startsWith('|'); index++) {
    const cells = /^\|([^|]+)\|([^|]+)\|([^|]+)\|\s*$/.exec(lines[index]);
    if (!cells) throw new Error(relative + ':' + (index + 1) + ': malformed dispatch row');
    rowCount++;
    for (const column of [
      { text: cells[2], kind: 'agent', destination: id => 'agents/' + id + '.md' },
      { text: cells[3], kind: 'skill', destination: id => 'skills/' + id + '/SKILL.md' }
    ]) {
      const ids = [...column.text.matchAll(/\x60([^\x60]+)\x60/g)].map(match => match[1]);
      if (ids.length === 0) throw new Error(relative + ':' + (index + 1) + ': expected a ' + column.kind);
      for (const id of ids) {
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) ||
            !fs.statSync(path.join(root, column.destination(id)), { throwIfNoEntry: false })?.isFile()) {
          invalid.push(relative + ':' + (index + 1) + ' -> unresolved ' + column.kind + ' ' + id);
        }
      }
    }
  }
  if (rowCount === 0) throw new Error(relative + ': expected at least one dispatch row');
  if (invalid.length > 0) throw new Error('Invalid dispatch references:\n' + invalid.join('\n'));
  return rowCount;
}

function checkNativeAdapters(root) {
  const openCodeConfig = JSON.parse(fs.readFileSync(path.join(root, 'opencode.json'), 'utf8'));
  const openCodeAgent = 'orchestrator';
  if (openCodeConfig.default_agent !== openCodeAgent ||
      !openCodeConfig.instructions?.includes('adapters/opencode/AGENTS.md')) {
    throw new Error('OpenCode must start the project orchestrator and load its project instructions');
  }
  const profile = '.opencode/agents/orchestrator.md';
  const { attributes } = parseFrontmatter(fs.readFileSync(path.join(root, profile), 'utf8'), profile);
  if (typeof attributes.description !== 'string' || !attributes.description.trim()) {
    throw new Error(profile + ': expected a nonempty frontmatter description');
  }
  if (attributes.mode !== 'primary' && attributes.mode !== 'all') {
    throw new Error('The OpenCode default agent must support primary use');
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'adapters/antigravity/plugin.json'), 'utf8'));
  if (manifest.name !== 'universal-orchestrator') throw new Error('Unexpected Antigravity plugin name');
  const openRouterDir = path.join(root, 'adapters', 'openrouter');
  const prompt = fs.readFileSync(path.join(openRouterDir, 'system-prompt.txt'), 'utf8');
  const payload = JSON.parse(fs.readFileSync(path.join(openRouterDir, 'payload.json'), 'utf8'));
  if (payload.model !== loadProjectContext(root).OPENROUTER_MODEL ||
      payload.messages?.[0]?.role !== 'system' || payload.messages[0].content !== prompt) {
    throw new Error('OpenRouter payload does not match its configured model and generated system prompt');
  }
}

function checkUiStateGuidelines(root) {
  const ui = fs.readFileSync(path.join(root, 'skills', 'ui-ux-design-system', 'SKILL.md'), 'utf8');
  if (!/^#{2,6}\s+(?:(?:\d+|[A-Z])\.\s+)?Universal 6-State (?:View )?Matrix\b/im.test(ui) ||
      !/^#{2,6}\s+(?:(?:\d+|[A-Z])\.\s+)?Interactive Component State Spectrum\b/im.test(ui)) {
    throw new Error('UI/UX design system must document view and interactive control states separately');
  }
  if (!ui.split(/\r?\n/).some(line =>
    /2\.5\.8/.test(line) && /(?:24\s*(?:×|x)\s*24|24\s+CSS\s+(?:px|pixels))/i.test(line))) {
    throw new Error('WCAG 2.2 SC 2.5.8 must document the AA minimum target size of 24 CSS pixels');
  }
}

function checkAdapterParity(root) {
  const { checkAdapters } = require('../sync-adapters.js');
  checkAdapters(root);
}

function checkUnitTests(root, files) {
  runUnitTests(root, { files });
}

module.exports = {
  checkActiveContext,
  checkAdapterParity,
  checkDispatchReferences,
  checkGitIgnore,
  checkLegacyTerms,
  checkMetadata,
  checkNativeAdapters,
  checkRepositoryReferences,
  checkTrackedFilenames,
  checkUiStateGuidelines,
  checkUnitTests
};
