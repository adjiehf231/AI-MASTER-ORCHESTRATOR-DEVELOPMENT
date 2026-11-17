#!/usr/bin/env node
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { buildAdapters } = require('./sync-adapters');
const { applyFilePlan, inspectFile, withFileLock } = require('./lib/file-plan');
const { formatFrontmatter, validateComponent } = require('./lib/frontmatter');
const { bindProjectContext, loadProjectContext } = require('./lib/project-context');

const repoRoot = path.resolve(__dirname, '..');
const manifestPath = 'plugin.json';
const rulesPath = 'rules/AGENTS.md';
const statePath = '.orchestrator-deployment.json';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function mustRead(root, relativePath) {
  const { target, stats } = inspectFile(root, relativePath);
  if (!stats) throw new Error(`Required plugin source is missing: ${relativePath}`);
  return fs.readFileSync(target);
}

function readDirectory(root, relativePath) {
  const filename = path.join(root, relativePath);
  const stats = fs.lstatSync(filename);
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error(`Expected regular source directory: ${filename}`);
  return fs.readdirSync(filename, { withFileTypes: true });
}

function renderComponent(root, relativePath, name, kind, context) {
  const source = mustRead(root, relativePath).toString('utf8');
  const { attributes, body } = validateComponent(source, name, kind, relativePath);
  const { mode = 'subagent', ...metadata } = attributes;
  const description = bindProjectContext(metadata.description, context, relativePath);
  const bound = { ...metadata, description };
  if (kind === 'agent') {
    Object.assign(bound, { mainAgent: mode !== 'subagent', subagent: mode !== 'primary' });
  }
  return Buffer.from(formatFrontmatter(bound, bindProjectContext(body, context, relativePath)), 'utf8');
}

function copySkillResources(root, relativePath, files) {
  for (const entry of readDirectory(root, relativePath)) {
    if (entry.name.startsWith('.') || /\.(?:pem|key)$/i.test(entry.name)) continue;
    const nested = `${relativePath}/${entry.name}`;
    if (entry.name === 'SKILL.md' && relativePath.split('/').length === 2) continue;
    if (entry.isDirectory()) copySkillResources(root, nested, files);
    else files.set(nested, mustRead(root, nested));
  }
}

function buildPlugin(root) {
  const sourceFiles = new Map();
  const adapterScope = 'adapters/antigravity';
  const expected = buildAdapters(root).files;
  for (const relativePath of [manifestPath, rulesPath]) {
    const adapterPath = `${adapterScope}/${relativePath}`;
    const content = mustRead(root, adapterPath);
    const generated = expected.get(path.normalize(adapterPath)) ?? expected.get(adapterPath);
    if (typeof generated !== 'string' || !content.equals(Buffer.from(generated))) {
      throw new Error(`Outdated Antigravity source: ${adapterPath}. Run npm run sync before deployment.`);
    }
    sourceFiles.set(relativePath, content);
  }

  const manifest = JSON.parse(sourceFiles.get(manifestPath).toString('utf8'));
  if (manifest.name !== 'universal-orchestrator' || typeof manifest.version !== 'string'
    || typeof manifest.description !== 'string' || !manifest.description.trim()) {
    throw new Error('Invalid Antigravity plugin manifest.');
  }
  const context = loadProjectContext(root);
  for (const entry of readDirectory(root, 'agents').filter(item => item.name.endsWith('.md'))) {
    const relativePath = `agents/${entry.name}`;
    sourceFiles.set(relativePath, renderComponent(root, relativePath, entry.name.slice(0, -3), 'agent', context));
  }
  for (const entry of readDirectory(root, 'skills').filter(item => item.isDirectory())) {
    const skillPath = `skills/${entry.name}`;
    const relativePath = `${skillPath}/SKILL.md`;
    if (!inspectFile(root, relativePath).stats) continue;
    sourceFiles.set(relativePath, renderComponent(root, relativePath, entry.name, 'skill', context));
    copySkillResources(root, skillPath, sourceFiles);
  }
  return sourceFiles;
}

function loadDeploymentState(root) {
  const { stats, target } = inspectFile(root, statePath);
  if (!stats) return new Map();
  const state = JSON.parse(fs.readFileSync(target, 'utf8'));
  if (state?.version !== 1 || !state.files || Array.isArray(state.files) || typeof state.files !== 'object') {
    throw new Error(`Unrecognized deployment manifest: ${target}`);
  }

  const entries = Object.entries(state.files);
  for (const [relativePath, hash] of entries) {
    const ownedNamespace = relativePath === manifestPath || relativePath === rulesPath
      || /^agents\/[a-z0-9-]+\.md$/.test(relativePath)
      || /^skills\/[a-z0-9-]+\/.+$/.test(relativePath);
    if (!ownedNamespace || !/^[a-f0-9]{64}$/.test(hash)) {
      throw new Error(`Invalid managed entry in ${target}: ${relativePath}`);
    }
    inspectFile(root, relativePath);
  }
  return new Map(entries);
}

function deployPlugin(root, files, force) {
  const previous = loadDeploymentState(root);
  const hashes = new Map([...files].map(([relativePath, bytes]) => [relativePath, sha256(bytes)]));
  const removals = [];
  for (const [relativePath, hash] of new Map([...previous, ...hashes])) {
    const { stats, target } = inspectFile(root, relativePath);
    if (!stats) continue;
    const currentHash = sha256(fs.readFileSync(target));
    const oldHash = previous.get(relativePath);
    if (currentHash === hash && hashes.has(relativePath)) continue;
    if (currentHash !== oldHash && (!force || !hashes.has(relativePath))) {
      throw new Error(`Refusing to replace or remove a locally modified or unmanaged plugin file: ${target}.`
        + (hashes.has(relativePath) ? ' Review it and pass --force to replace it.' : ' Move the file out of the target before retrying.'));
    }
    if (!hashes.has(relativePath)) removals.push(relativePath);
  }

  const state = { version: 1, files: Object.fromEntries([...hashes].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) };
  const changed = applyFilePlan(root, {
    files: new Map([...files, [statePath, `${JSON.stringify(state, null, 2)}\n`]]),
    removals
  });
  console.log(`Antigravity bundle copied to ${root} (${files.size} managed plugin files, ${changed} file changes).`);
}

function containsPath(parent, child) {
  const relative = path.relative(parent, child);
  return !relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function validateTarget(root, target) {
  if (containsPath(target, root) || ['agents', 'skills', 'adapters', 'scripts'].some(directory => (
    containsPath(path.join(root, directory), target)
  ))) {
    throw new Error('Choose a plugin target outside the source and generated adapter directories.');
  }
  let existingAncestor = target;
  while (!fs.lstatSync(existingAncestor, { throwIfNoEntry: false })) {
    existingAncestor = path.dirname(existingAncestor);
  }
  const realTarget = path.join(fs.realpathSync(existingAncestor), path.relative(existingAncestor, target));
  if (realTarget !== target && path.relative(realTarget, target)) {
    throw new Error('Antigravity deployment target resolves through a linked directory.');
  }
}

function main(args) {
  const { values } = parseArgs({ args, options: { force: { type: 'boolean' }, help: { type: 'boolean' } } });
  if (values.help) {
    console.log('Usage: npm run deploy:antigravity -- [--force]\nSet ANTIGRAVITY_PLUGIN_DIR to override the default plugin folder.');
    return;
  }
  const root = fs.realpathSync(repoRoot);
  const target = path.resolve(process.env.ANTIGRAVITY_PLUGIN_DIR
    || path.join(os.homedir(), '.gemini', 'config', 'plugins', 'universal-orchestrator'));
  validateTarget(root, target);
  withFileLock(root, () => {
    const files = buildPlugin(root);
    fs.mkdirSync(target, { recursive: true });
    withFileLock(target, () => deployPlugin(target, files, values.force));
  });
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(`Antigravity deployment failed: ${error.message}`);
  process.exitCode = 1;
}

