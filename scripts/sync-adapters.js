const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { applyFilePlan, inspectFile, withFileLock } = require('./lib/file-plan');
const { formatFrontmatter, normalizeLines, validateComponent } = require('./lib/frontmatter');
const { bindProjectContext, loadProjectContext } = require('./lib/project-context');
const { claudePermissions, openCodePermissions } = require('./lib/agent-permissions');

const manifestPath = 'adapters/native-profiles.json';
const nativeProfilePath = /^(?:\.(?:claude|opencode)\/agents\/[a-z0-9]+(?:-[a-z0-9]+)*\.md|\.codex\/agents\/[a-z0-9]+(?:-[a-z0-9]+)*\.toml|\.(?:agents|claude)\/skills\/[a-z0-9]+(?:-[a-z0-9]+)*\/[A-Za-z0-9_.\/-]+)$/;

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
      permissions: attributes.permissions,
      attributes,
      body: bind(body, filename).trim(),
    };
  }
  const agents = agentPaths.map(filename => load(filename, path.basename(filename, '.md'), 'agent'));
  const skills = skillPaths.map(filename => load(filename, path.basename(path.dirname(filename)), 'skill'));
  return { agents, skills };
}

function corePrompt(orchestrator, agents, skills, platform) {
  const header = `Target Platform: **${platform}**`;
  return [
    header,
    orchestrator.body,
    '---',
    `The catalog contains ${agents.length} agent profiles and ${skills.length} skills.`,
    'Use native skill discovery or search `adapters/component-catalog.json` for relevant names and source paths. Read selected playbooks and references when needed.',
    'Run `npm run orchestrator:list` for the full local catalog. Keep source evidence and report verification outcomes.',
  ].join('\n\n') + '\n';
}

function json(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

function digest(contents, filename) {
  const textFile = /\.(?:md|txt|json|ya?ml|toml|js|mjs|cjs|ts|tsx|jsx|py|sh|ps1|css|html)$/i.test(filename);
  const text = Buffer.isBuffer(contents) && textFile ? new TextDecoder('utf-8', { fatal: true }).decode(contents) : contents;
  const normalized = Buffer.isBuffer(text) ? text : normalizeLines(text);
  return createHash('sha256').update(normalized).digest('hex');
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
    inspectFile(repoRoot, filename);
  }
  return profiles;
}

function planNativeProfiles(repoRoot, files, profiles) {
  const previous = loadProfileManifest(repoRoot);
  const current = {};
  for (const [filename, profile] of profiles) {
    const { target, stats } = inspectFile(repoRoot, filename);
    const existing = stats && fs.readFileSync(target);
    const nextHash = digest(profile, filename);
    const ownedHashes = [previous[filename], nextHash];
    if (existing && !ownedHashes.includes(digest(existing, filename))) {
      throw new Error(`${filename}: native profile is unmanaged or locally modified; move your copy before syncing`);
    }
    files.set(filename, profile);
    current[filename] = nextHash;
  }

  const removals = Object.entries(previous).filter(([filename, hash]) => {
    if (Object.hasOwn(current, filename)) return false;
    const { target, stats } = inspectFile(repoRoot, filename);
    return stats && digest(fs.readFileSync(target), filename) === hash;
  }).map(([filename]) => filename).sort();

  files.set(manifestPath, json(Object.fromEntries(Object.entries(current).sort())));
  return removals;
}

function skillResources(repoRoot, relativeDir) {
  if (!fs.existsSync(path.join(repoRoot, relativeDir))) return [];
  const resources = [];
  for (const entry of fs.readdirSync(path.join(repoRoot, relativeDir), { withFileTypes: true })) {
    if (entry.name.startsWith('.') || /\.(?:pem|key|p12|pfx)$/i.test(entry.name)) continue;
    const relative = relativeDir + '/' + entry.name;
    if (entry.isDirectory() && !entry.isSymbolicLink()) resources.push(...skillResources(repoRoot, relative));
    else if (entry.name !== 'SKILL.md') {
      const { target, stats } = inspectFile(repoRoot, relative);
      if (stats) {
        const bytes = fs.readFileSync(target);
        resources.push([relative, /\.(?:md|txt|json|ya?ml|toml|js|mjs|cjs|ts|tsx|jsx|py|sh|ps1|css|html)$/i.test(relative)
          ? normalizeLines(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) : bytes]);
      }
    }
  }
  return resources;
}

function mcpTemplates() {
  const args = ['__ORCHESTRATOR_SOURCE_ROOT__/scripts/context-mcp.js', '--workspace', '__WORKSPACE_ROOT__'];
  const enabledTools = ['get_task_context', 'search_context', 'read_context'];
  return new Map([
    ['adapters/claude/mcp.json', json({ mcpServers: { 'orchestrator-context': { command: 'node', args } } })],
    ['adapters/opencode/mcp.json', json({ mcp: { servers: { 'orchestrator-context': {
      type: 'local', command: ['node', ...args], cwd: '__WORKSPACE_ROOT__', codemode: false
    } } } })],
    ['adapters/antigravity/mcp_config.json', json({ mcpServers: { 'orchestrator-context': {
      command: 'node', args, cwd: '__WORKSPACE_ROOT__', enabledTools
    } } })],
    ['adapters/codex/config.toml', [
      '# Merge after replacing the source and workspace placeholders with absolute paths.',
      '[mcp_servers.orchestrator-context]',
      'command = "node"',
      'args = ' + JSON.stringify(args),
      'enabled_tools = ' + JSON.stringify(enabledTools),
      ''
    ].join('\n')]
  ]);
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
    ['adapters/opencode/AGENTS.md', '# OpenCode Project Guidance\n\nThe primary `orchestrator` profile carries the project workflow. Use native skills and search `adapters/component-catalog.json` for relevant source paths. Record TODO, evidence, and report outcomes.\n'],
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
  files.set('adapters/component-catalog.json', json({
    agents: agents.map(({ id, filename, description, mode }) => ({ id, filename, description, mode })),
    skills: skills.map(({ id, filename, description }) => ({ id, filename, description }))
  }));
  files.set('adapters/codex/AGENTS.md', promptFor('Codex'));
  for (const [filename, content] of mcpTemplates()) files.set(filename, content);

  const openrouterPrompt = promptFor('OpenRouter / 9router / OneRouter / Gateway Models');
  files.set('adapters/openrouter/system-prompt.txt', openrouterPrompt);
  files.set('adapters/openrouter/payload.json', json({
    model: template ? '${OPENROUTER_MODEL}' : context.OPENROUTER_MODEL,
    messages: [{ role: 'system', content: openrouterPrompt }],
    temperature: 0.2,
    top_p: 0.95,
  }));

  const profiles = new Map();
  for (const { id, description, mode, permissions, body } of agents) {
    profiles.set(`.claude/agents/${id}.md`, formatFrontmatter({ name: id, description, ...claudePermissions(permissions) }, body));
    profiles.set(`.opencode/agents/${id}.md`, formatFrontmatter({ description, mode, ...openCodePermissions(permissions) }, body));
    if (id === 'context-engineer') {
      profiles.set('.codex/agents/context-engineer.toml', [
        '# Host permissions are inherited. Run the parent session in read-only mode for enforced write isolation.',
        'name = "context-engineer"',
        'description = ' + JSON.stringify(description),
        'developer_instructions = ' + JSON.stringify(body),
        '',
        '[features]',
        'shell_tool = false',
        'apps = false',
        'plugins = false',
        ''
      ].join('\n'));
    }
  }
  for (const skill of skills) {
    const { name, license, compatibility, metadata } = skill.attributes;
    const attributes = { name, description: skill.description };
    for (const [key, value] of Object.entries({ license, compatibility, metadata })) {
      if (value !== undefined) attributes[key] = value;
    }
    const markdown = formatFrontmatter(attributes, skill.body);
    const resources = skillResources(repoRoot, `skills/${skill.id}`);
    for (const base of ['.agents/skills', '.claude/skills']) {
      profiles.set(`${base}/${skill.id}/SKILL.md`, markdown);
      for (const [filename, content] of resources) {
        profiles.set(`${base}/${filename.slice('skills/'.length)}`, content);
      }
    }
  }
  const removals = planNativeProfiles(repoRoot, files, profiles);
  return { files, removals };
}

function checkAdapters(repoRoot, plan = buildAdapters(repoRoot)) {
  const drift = [...plan.files].filter(([filename, contents]) => {
    const { target, stats } = inspectFile(repoRoot, filename);
    return !stats || !fs.readFileSync(target).equals(Buffer.from(contents));
  })
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
