const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { applyFilePlan, inspectFile, withFileLock } = require('./lib/file-plan');
const { formatFrontmatter, normalizeLines, validateComponent } = require('./lib/frontmatter');
const { bindProjectContext, loadProjectContext, parseProjectContext } = require('./lib/project-context');
const { claudePermissions, openCodePermissions } = require('./lib/agent-permissions');

const manifestPath = 'adapters/native-profiles.json';
const nativeProfilePath = /^(?:\.(?:claude|opencode)\/agents\/[a-z0-9]+(?:-[a-z0-9]+)*\.md|\.codex\/agents\/[a-z0-9]+(?:-[a-z0-9]+)*\.toml|\.(?:agents|claude)\/skills\/[a-z0-9]+(?:-[a-z0-9]+)*\/[A-Za-z0-9_.\/-]+)$/;

function readFile(repoRoot, filename, sourceFiles) {
  if (sourceFiles) {
    const bytes = sourceFiles.get(filename);
    return bytes === undefined ? undefined : new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  }
  const { target, stats } = inspectFile(repoRoot, filename);
  return stats && fs.readFileSync(target, 'utf8');
}

function sourcePaths(repoRoot, overrides, sourceFiles) {
  const agentPaths = new Set(sourceFiles ? [...sourceFiles.keys()].filter(filename => /^agents\/[^/]+\.md$/.test(filename)) :
    fs.readdirSync(path.join(repoRoot, 'agents'), { withFileTypes: true })
      .filter(entry => !entry.isDirectory() && entry.name.endsWith('.md'))
      .map(entry => 'agents/' + entry.name)
  );
  const skillPaths = new Set(sourceFiles ? [...sourceFiles.keys()].filter(filename => /^skills\/[^/]+\/SKILL\.md$/.test(filename)) :
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

function loadComponents(repoRoot, overrides, bind, sourceFiles) {
  const { agentPaths, skillPaths } = sourcePaths(repoRoot, overrides, sourceFiles);
  function load(filename, id, kind) {
    const source = overrides.get(filename) ?? readFile(repoRoot, filename, sourceFiles);
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

function corePrompt(orchestrator, agents, skills, platform, referencePrefix = '') {
  const header = `Target Platform: **${platform}**`;
  const prefix = referencePrefix ? referencePrefix + '/' : '';
  return [
    header,
    orchestrator.body,
    '---',
    `The catalog contains ${agents.length} agent profiles and ${skills.length} skills.`,
    `Use native skill discovery or search \`${prefix}adapters/component-catalog.json\` for relevant names and source paths. Read selected playbooks and references when needed.`,
    referencePrefix
      ? 'Resolve library references from the project root. Application, memory, architecture and delivery paths remain project scoped; use project-approved tool wiring and verification commands.'
      : 'Run `npm run orchestrator:list` for the full local catalog. Keep source evidence and report verification outcomes.',
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

function skillResources(repoRoot, relativeDir, sourceFiles) {
  if (sourceFiles) {
    return [...sourceFiles].filter(([filename]) => filename.startsWith(relativeDir + '/'))
      .filter(([filename]) => {
        const parts = filename.slice(relativeDir.length + 1).split('/');
        return !parts.some(part => part.startsWith('.')) && parts.at(-1) !== 'SKILL.md'
          && !/\.(?:pem|key|p12|pfx)$/i.test(parts.at(-1));
      }).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([filename, bytes]) => [filename,
        /\.(?:md|txt|json|ya?ml|toml|js|mjs|cjs|ts|tsx|jsx|py|sh|ps1|css|html)$/i.test(filename)
          ? normalizeLines(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) : bytes]);
  }
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

// Pure rendering: only this installed, trusted implementation runs. sourceRoot supplies data,
// never executable modules. Ownership and target mutation belong to the calling planner.
function buildArtifacts(repoRoot, { template = false, sourceOverrides = new Map(), contextRoot = repoRoot,
  context: suppliedContext, referencePrefix = '', sourceFiles: suppliedFiles } = {}) {
  let sourceFiles;
  if (suppliedFiles !== undefined) {
    if (!(suppliedFiles instanceof Map)) throw new Error('sourceFiles must be an authenticated file Map');
    sourceFiles = new Map([...suppliedFiles].map(([filename, bytes]) => {
      if (typeof filename !== 'string' || path.isAbsolute(filename) || path.win32.isAbsolute(filename)
          || filename.split('/').some(part => !part || part === '.' || part === '..'
            || /[\\:\u0000-\u001f\u007f<>"|?*]/.test(part) || /[. ]$/.test(part)
            || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))
          || (!Buffer.isBuffer(bytes) && typeof bytes !== 'string')) {
        throw new Error('sourceFiles contains an invalid relative path or passive file');
      }
      return [filename, Buffer.from(bytes)];
    }));
  }
  if (sourceFiles ? !sourceFiles.has('PROJECT_CONTEXT.template.md') : !inspectFile(repoRoot, 'PROJECT_CONTEXT.template.md').stats) {
    throw new Error('PROJECT_CONTEXT.template.md: repository sentinel not found');
  }
  if (referencePrefix && (path.isAbsolute(referencePrefix) || path.win32.isAbsolute(referencePrefix)
      || referencePrefix.split('/').some(part => !part || part === '.' || part === '..' || /[\\:`\r\n]/.test(part)))) {
    throw new Error('referencePrefix must be a safe project-relative path');
  }
  const libraryReferences = new Map();
  function libraryPath(reference) {
    const filename = reference.split('#')[0].replace(/\/$/, '');
    if (libraryReferences.has(filename)) return libraryReferences.get(filename);
    const parts = filename.split('/');
    let exists = false;
    if (!parts.some(part => !part || part === '.' || part === '..' || /[\\:\u0000-\u001f\u007f]/.test(part))) {
      if (sourceOverrides.has(filename)) exists = true;
      else if (sourceFiles) exists = sourceFiles.has(filename) || [...sourceFiles.keys()].some(key => key.startsWith(filename + '/'));
      else {
        let target = repoRoot;
        exists = parts.every(part => {
          target = path.join(target, part);
          const stats = fs.lstatSync(target, { throwIfNoEntry: false });
          return stats && !stats.isSymbolicLink() && (stats.isDirectory() || stats.isFile());
        });
      }
    }
    libraryReferences.set(filename, !!exists);
    return exists;
  }
  let context = null;
  if (!template) {
    if (sourceFiles && suppliedContext === undefined) {
      throw new Error('Authenticated source rendering requires explicit project context');
    }
    if (suppliedContext !== undefined) {
      if (!suppliedContext || typeof suppliedContext !== 'object' || Array.isArray(suppliedContext)) {
        throw new Error('context must be a validated project settings object');
      }
      const entries = Object.entries(suppliedContext);
      if (entries.some(([key, value]) => !/^[A-Z][A-Z0-9_]*$/.test(key)
          || typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value))) {
        throw new Error('context settings must contain literal string values');
      }
      context = parseProjectContext(entries.map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n'));
    } else context = loadProjectContext(contextRoot);
  }
  const bind = (text, filename) => {
    if (!referencePrefix) return template ? text : bindProjectContext(text, context, filename);
    // Only known library namespaces are relocated. Project memory, application source,
    // delivery documents and component-relative resource links keep their own meaning.
    const relocated = text.replace(/`((?:agents|skills|adapters|orchestration|scripts)\/[^`\s]+|docs\/(?:process|qa)\/[^`\s]+)`/g,
      (match, reference) => {
        const componentResource = filename.startsWith('skills/')
          && libraryPath(`${path.posix.dirname(filename)}/${reference}`);
        return !componentResource && libraryPath(reference) ? `\`${referencePrefix}/${reference}\`` : match;
      });
    // Context-expanded paths belong to the project even when they happen to match
    // a library filename; relocation must precede context interpolation.
    return template ? relocated : bindProjectContext(relocated, context, filename);
  };
  const { agents, skills } = loadComponents(repoRoot, sourceOverrides, bind, sourceFiles);
  const orchestrator = agents.find(agent => agent.id === 'orchestrator');
  if (!orchestrator || (orchestrator.mode !== 'primary' && orchestrator.mode !== 'all')) {
    throw new Error('agents/orchestrator.md: required orchestrator must support primary mode');
  }

  const promptFor = platform => corePrompt(orchestrator, agents, skills, platform, referencePrefix);
  const files = new Map([
    ['CLAUDE.md', promptFor('Claude Code (CLI & Desktop)')],
    ['.cursorrules', promptFor('Cursor IDE AI (Composer & Chat)')],
    ['.windsurfrules', promptFor('Windsurf IDE (Cascade)')],
    ['.clinerules', promptFor('Cline / Roo Code')],
    ['.opencoderules', promptFor('OpenCode (legacy rules file)')],
    ['adapters/opencode/AGENTS.md', '# OpenCode Project Guidance\n\nThe primary `orchestrator` profile carries the project workflow. Use native skills and search `' + (referencePrefix ? referencePrefix + '/' : '') + 'adapters/component-catalog.json` for relevant source paths. Record TODO, evidence, and report outcomes.\n'],
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
    agents: agents.map(({ id, filename, description, mode }) => ({ id, filename: referencePrefix ? referencePrefix + '/' + filename : filename, description, mode })),
    skills: skills.map(({ id, filename, description }) => ({ id, filename: referencePrefix ? referencePrefix + '/' + filename : filename, description }))
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
    const resources = skillResources(repoRoot, `skills/${skill.id}`, sourceFiles);
    for (const base of ['.agents/skills', '.claude/skills']) {
      profiles.set(`${base}/${skill.id}/SKILL.md`, markdown);
      for (const [filename, content] of resources) {
        profiles.set(`${base}/${filename.slice('skills/'.length)}`, content);
      }
    }
  }
  for (const [filename, contents] of profiles) files.set(filename, contents);
  return { files, profiles };
}

function buildAdapters(repoRoot, options = {}) {
  const { files, profiles } = buildArtifacts(repoRoot, options);
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

module.exports = { buildAdapters, buildArtifacts, checkAdapters };
