const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { applyFilePlan, inspectFile, withFileLock } = require('./lib/file-plan');
const { formatFrontmatter, normalizeLines, validateComponent } = require('./lib/frontmatter');
const { bindProjectContext, loadProjectContext } = require('./lib/project-context');

const manifestPath = 'adapters/native-profiles.json';
const nativeProfilePath = /^\.(?:claude|opencode)\/agents\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

function readFile(repoRoot, filename) {
  const { target, stats } = inspectFile(repoRoot, filename);
  return stats && fs.readFileSync(target, 'utf8');
}

function sourcePaths(repoRoot, overrides) {
  const agentPaths = new Set(
    fs.readdirSync(path.join(repoRoot, 'agents'), { withFileTypes: true })
      .filter(entry => !entry.isDirectory() && entry.name.endsWith('.md'))
      .map(entry => 'agents/' + entry.name)
  );
  const skillPaths = new Set(
    fs.readdirSync(path.join(repoRoot, 'skills'), { withFileTypes: true })
      .filter(entry => entry.isDirectory() && !entry.isSymbolicLink())
      .map(entry => 'skills/' + entry.name + '/SKILL.md')
      .filter(filename => inspectFile(repoRoot, filename).stats)
  );
  for (const filename of overrides.keys()) {
    if (/^agents\/[^/]+\.md$/.test(filename)) agentPaths.add(filename);
    else if (/^skills\/[^/]+\/SKILL\.md$/.test(filename)) skillPaths.add(filename);
    else throw new Error('Unknown canonical component path ' + filename);
  }
  return { agentPaths: [...agentPaths].sort(), skillPaths: [...skillPaths].sort() };
}

function loadComponents(repoRoot, overrides, bind) {
  const { agentPaths, skillPaths } = sourcePaths(repoRoot, overrides);
  function load(filename, id, kind) {
    const source = overrides.get(filename) ?? readFile(repoRoot, filename);
    const { attributes, body } = validateComponent(source, id, kind, filename);
    return {
      id,
      filename,
      description: bind(attributes.description, filename),
      mode: attributes.mode ?? 'subagent',
      body: bind(body, filename).trim(),
    };
  }
  const agents = agentPaths.map(filename => load(filename, path.basename(filename, '.md'), 'agent'));
  const skills = skillPaths.map(filename => load(filename, path.basename(path.dirname(filename)), 'skill'));
  return { agents, skills };
}

function corePrompt(orchestrator, agents, skills, platform) {
  const header = `Target Platform: **${platform}**`;
  const agentCatalog = agents.map(agent => {
    const title = /^#\s+(.+)$/m.exec(agent.body)?.[1] ?? agent.id;
    const description = agent.description.trim().replace(/\n+/g, ' ');
    return `- **\`${agent.id}\`** — ${title}\n  *Mandate:* ${description}`;
  });
  const skillCatalog = skills.map(skill => {
    const description = skill.description.trim().replace(/\n+/g, ' ');
    return `- **\`${skill.filename}\`** (${skill.id}): ${description}`;
  });
  return [
    header,
    orchestrator.body,
    '---',
    `## 5. Master Specialist Agent Directory (${agents.length} Roles)`,
    `You can embody or dispatch any of the following ${agents.length} specialist roles:`,
    agentCatalog.join('\n'),
    '---',
    `## 6. Enterprise Skill Directory (${skills.length} Skills)`,
    'Invoke or reference these specialized skill playbooks:',
    skillCatalog.join('\n'),
  ].join('\n\n') + '\n';
}

function json(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

function digest(markdown) {
  return createHash('sha256').update(normalizeLines(markdown)).digest('hex');
}

function loadProfileManifest(repoRoot) {
  const manifest = readFile(repoRoot, manifestPath);
  if (manifest === undefined) return {};
  let profiles;
  try {
    profiles = JSON.parse(manifest);
  } catch (error) {
    throw new Error(`${manifestPath}: ${error.message}`, { cause: error });
  }
  if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) {
    throw new Error(manifestPath + ': expected a native profile hash mapping');
  }
  for (const [filename, hash] of Object.entries(profiles)) {
    if (!nativeProfilePath.test(filename) || typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) {
      throw new Error(`${manifestPath}: invalid native profile entry ${filename}`);
    }
  }
  return profiles;
}

function planNativeProfiles(repoRoot, files, profiles) {
  const previous = loadProfileManifest(repoRoot);
  const current = {};
  for (const [filename, profile] of profiles) {
    const existing = readFile(repoRoot, filename);
    const nextHash = digest(profile);
    const ownedHashes = [previous[filename], nextHash];
    if (existing !== undefined && !ownedHashes.includes(digest(existing))) {
      throw new Error(`${filename}: native profile is unmanaged or locally modified; move your copy before syncing`);
    }
    files.set(filename, profile);
    current[filename] = nextHash;
  }

  const removals = Object.entries(previous).filter(([filename, hash]) => {
    if (Object.hasOwn(current, filename)) return false;
    const existing = readFile(repoRoot, filename);
    return existing !== undefined && digest(existing) === hash;
  }).map(([filename]) => filename).sort();

  files.set(manifestPath, json(Object.fromEntries(Object.entries(current).sort())));
  return removals;
}

function buildAdapters(repoRoot, { template = false, sourceOverrides = new Map() } = {}) {
  if (!inspectFile(repoRoot, 'PROJECT_CONTEXT.template.md').stats) {
    throw new Error('PROJECT_CONTEXT.template.md: repository sentinel not found');
  }
  const context = template ? null : loadProjectContext(repoRoot);
  const bind = (text, filename) => template ? text : bindProjectContext(text, context, filename);
  const { agents, skills } = loadComponents(repoRoot, sourceOverrides, bind);
  const orchestrator = agents.find(agent => agent.id === 'orchestrator');
  if (!orchestrator || (orchestrator.mode !== 'primary' && orchestrator.mode !== 'all')) {
    throw new Error('agents/orchestrator.md: required orchestrator must support primary mode');
  }

  const promptFor = platform => corePrompt(orchestrator, agents, skills, platform);
  const files = new Map([
    ['CLAUDE.md', promptFor('Claude Code (CLI & Desktop)')],
    ['.cursorrules', promptFor('Cursor IDE AI (Composer & Chat)')],
    ['.windsurfrules', promptFor('Windsurf IDE (Cascade)')],
    ['.clinerules', promptFor('Cline / Roo Code')],
    ['.opencoderules', promptFor('OpenCode (legacy rules file)')],
    ['adapters/opencode/AGENTS.md', promptFor('OpenCode V2')],
    ['CONVENTIONS.md', promptFor('Aider & Polyglot Coding Agents')],
    ['.aider.conf.yml', 'read: CONVENTIONS.md\nauto-commits: false\nattribute-author: false\n'],
    ['.continue/rules/universal-orchestrator.md', formatFrontmatter(
      { name: 'Universal Master Orchestrator' }, promptFor('Continue.dev IDE Assistant')
    )],
    ['adapters/bundle/universal-system-prompt.md', promptFor('Universal Prompt Bundle (Codex, ChatGPT, DeepSeek, Ollama)')],
    ['adapters/antigravity/rules/AGENTS.md', promptFor('Google Antigravity & Gemini Agents')],
    ['adapters/antigravity/plugin.json', json({
      name: 'universal-orchestrator',
      version: '1.0.0',
      description: `Universal orchestration guidance, ${agents.length} agent profiles, and ${skills.length} SDLC skills.`,
      author: 'Antigravity Engineering Council',
    })],
  ]);

  const openrouterPrompt = promptFor('OpenRouter / 9router / OneRouter / Gateway Models');
  files.set('adapters/openrouter/system-prompt.txt', openrouterPrompt);
  files.set('adapters/openrouter/payload.json', json({
    model: template ? '${OPENROUTER_MODEL}' : context.OPENROUTER_MODEL,
    messages: [{ role: 'system', content: openrouterPrompt }],
    temperature: 0.2,
    top_p: 0.95,
  }));

  const profiles = new Map();
  for (const { id, description, mode, body } of agents) {
    profiles.set(`.claude/agents/${id}.md`, formatFrontmatter({ name: id, description }, body));
    profiles.set(`.opencode/agents/${id}.md`, formatFrontmatter({ description, mode }, body));
  }
  const removals = planNativeProfiles(repoRoot, files, profiles);
  return { files, removals };
}

function checkAdapters(repoRoot, plan = buildAdapters(repoRoot)) {
  const drift = [...plan.files].filter(([filename, contents]) => readFile(repoRoot, filename) !== contents)
    .map(([filename]) => filename);
  drift.push(...plan.removals);
  if (drift.length) {
    throw new Error('Adapter outputs differ. Run npm run sync:\n' + drift.join('\n'));
  }
  return plan.files.size;
}

function main() {
  const args = process.argv.slice(2);
  const invalid = args.find(arg => arg !== '--template' && arg !== '--check');
  if (invalid) throw new Error('Unknown sync option: ' + invalid);
  const repoRoot = path.resolve(__dirname, '..');
  const options = { template: args.includes('--template') };
  if (args.includes('--check')) {
    const count = checkAdapters(repoRoot, buildAdapters(repoRoot, options));
    console.log(`Verified ${count} generated adapter files.`);
    return;
  }
  withFileLock(repoRoot, () => {
    const plan = buildAdapters(repoRoot, options);
    const changed = applyFilePlan(repoRoot, plan);
    console.log(`Synchronized ${plan.files.size} adapter files (${changed} changes).`);
  });
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('Adapter sync failed: ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = { buildAdapters, checkAdapters };
