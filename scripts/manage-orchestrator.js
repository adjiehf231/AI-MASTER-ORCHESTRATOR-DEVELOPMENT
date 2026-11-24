#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { saveComponent } = require('./lib/component-store');
const { formatFrontmatter, validateComponent } = require('./lib/frontmatter');

const repoRoot = path.resolve(__dirname, '..');
const commands = {
  'agent:create': ['agent', false],
  'create:agent': ['agent', false],
  'add:agent': ['agent', false],
  'agent:update': ['agent', true],
  'update:agent': ['agent', true],
  'skill:create': ['skill', false],
  'create:skill': ['skill', false],
  'add:skill': ['skill', false],
  'skill:update': ['skill', true],
  'update:skill': ['skill', true]
};

function createAgent(attributes, role) {
  const body = `# ${role} — \${PROJECT_NAME}

Repository references: \`PROJECT_CONTEXT.md\`.

## Mandate
Handle work within the ${role} remit. Record the expected result, evidence, and any limits on access or authority.

## When to use
Replace this section with the task types, modules, and risks this role handles.

## When to skip
Name work that belongs to another specialist or lacks the required tools, contracts, or permissions.

## Working agreement
- Read the assigned task, existing contracts, and relevant project decisions. Confirm scope before editing.
- Send the lead your proposal, evidence, risks, and verification plan. Coordinate ownership for shared files.
- Use only authorized tools. Record actual checks and classify unresolved results as blocked or unverified.

## Activation examples
- Positive: a task directly within the configured remit.
- Negative: a task outside the remit or requiring authority this profile does not have.
`;
  return formatFrontmatter(attributes, body);
}

function createSkill(attributes, title) {
  const body = `# ${title} Playbook — \${PROJECT_NAME}

Repository references: \`PROJECT_CONTEXT.md\`.

## When to use
Replace this section with concrete triggers, inputs, and expected deliverables.

## When to skip
List overlapping playbooks, excluded cases, and prerequisites that would block this workflow.

## Procedure
1. Confirm requirements and inspect relevant project contracts.
2. Use authorized tools and collect evidence from the current revision.
3. Report the outcome, exact checks, and any remaining blockers.

## Verification
List the checks that establish whether the result meets the acceptance criteria.

## Activation examples
- Positive: a task that matches a listed trigger and meets its prerequisites.
- Negative: a task outside the listed triggers or lacking a prerequisite.
`;
  return formatFrontmatter(attributes, body);
}

function create(kind, name, options) {
  const title = options.title ?? name.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
  const role = options.role ?? `Principal ${title} Engineer`;
  const description = options.desc ?? (kind === 'agent'
    ? `${role} — governs \${PROJECT_NAME} systems, architecture, and verification.`
    : `Enterprise ${title} Playbook — implementation patterns and verification for \${PROJECT_NAME}.`);
  const attributes = { name, description };
  if (kind === 'agent') attributes.mode = options.mode ?? 'subagent';
  return kind === 'agent' ? createAgent(attributes, role) : createSkill(attributes, title);
}

function update(kind, name, options, original, filename) {
  const { body, document } = validateComponent(original, name, kind, filename);
  if (options.desc !== undefined) document.set('description', options.desc);
  if (options.mode !== undefined) document.set('mode', options.mode);
  return formatFrontmatter(document, body);
}

function listComponents(kind, entries, parent) {
  const items = entries.map(({ name, filename }) => {
    const { attributes } = validateComponent(fs.readFileSync(filename, 'utf8'), name, kind, filename);
    const summary = attributes.description.replace(/\s+/g, ' ');
    const description = summary.length > 75 ? `${summary.slice(0, 75)}...` : summary;
    return { name, description };
  });
  console.log(`\n=== ${parent} ===`);
  items.forEach(({ name, description }, index) => {
    console.log(` ${String(index + 1).padStart(2, '0')}. ${name}: ${description}`);
  });
}

function listAll() {
  const agentsDir = path.join(repoRoot, 'agents');
  const agents = fs.readdirSync(agentsDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => ({ name: entry.name.slice(0, -3), filename: path.join(agentsDir, entry.name) }));
  const skillsDir = path.join(repoRoot, 'skills');
  const skills = fs.readdirSync(skillsDir, { withFileTypes: true }).filter(entry => entry.isDirectory())
    .map(entry => ({ name: entry.name, filename: path.join(skillsDir, entry.name, 'SKILL.md') }))
    .filter(entry => fs.existsSync(entry.filename));
  listComponents('agent', agents, `Specialist Agents Council (${agents.length} Roles)`);
  listComponents('skill', skills, `Enterprise Skills Directory (${skills.length} Playbooks)`);
}

function printHelp() {
  console.log(`Universal AI Master Orchestrator: Agent & Skill Management CLI

Usage:
  node scripts/manage-orchestrator.js agent:create <name> [--title="..."] [--role="..."] [--desc="..."] [--mode="all|primary|subagent"] [--force]
  node scripts/manage-orchestrator.js agent:update <name> [--desc="..."] [--mode="all|primary|subagent"]
  node scripts/manage-orchestrator.js skill:create <name> [--title="..."] [--desc="..."] [--force]
  node scripts/manage-orchestrator.js skill:update <name> --desc="..."
  node scripts/manage-orchestrator.js list

Creation and update synchronize adapters in this repository. Antigravity deployment is a separate command.`);
}

function main(args) {
  const [command, ...options] = args;
  if (!command || command === '--help' || command === 'help' || options.includes('--help')) {
    printHelp();
    return;
  }
  if ((command === 'list' || command === 'status') && options.length === 0) {
    listAll();
    return;
  }
  if (!Object.hasOwn(commands, command)) throw new Error(`Unknown command: ${command}`);
  const [kind, isUpdate] = commands[command];
  const allowed = { name: { type: 'string' }, desc: { type: 'string' } };
  if (kind === 'agent') allowed.mode = { type: 'string' };
  if (!isUpdate) {
    allowed.title = { type: 'string' };
    allowed.force = { type: 'boolean' };
    if (kind === 'agent') allowed.role = { type: 'string' };
  }
  const { values, positionals } = parseArgs({ args: options, options: allowed, allowPositionals: true });
  if (positionals.length > 1 || (values.name && positionals.length)) {
    throw new Error('Specify one component name.');
  }
  if (isUpdate && values.desc === undefined && values.mode === undefined) {
    throw new Error('Specify a description or agent mode to update.');
  }
  for (const label of ['title', 'role']) {
    if (values[label] !== undefined && (!values[label].trim() || /[\r\n]/.test(values[label]))) {
      throw new Error(`--${label} must be a nonempty line.`);
    }
  }
  const name = values.name ?? positionals[0];
  const result = saveComponent(repoRoot, kind, name, { update: isUpdate, force: values.force }, (original, filename) => (
    isUpdate ? update(kind, name, values, original, filename) : create(kind, name, values)
  ));
  console.log(`${isUpdate ? 'Updated' : 'Created'} ${result} and synchronized adapters.`);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
