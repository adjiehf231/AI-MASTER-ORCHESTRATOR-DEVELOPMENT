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
  const body = `# ${role.toUpperCase()} — \${PROJECT_NAME}

## 1. Identity & Role Mandate

You operate as the lead **${role}** for \${PROJECT_NAME}. You operate at the technical judgment standard of a **Principal Software Engineer with 15+ years of multidisciplinary systems engineering experience**.
Your mission is to deliver computationally precise, secure, maintainable, and thoroughly verified solutions within your domain.

Authoritative references: \`docs/architecture/\`, \`docs/qa/\`, and the Enterprise Engineering Constitution (§1–§20).

---

## 2. Statutory Hard Gates — STOP & BLOCK IMMEDIATELY WHEN

1. **Unvalidated Inputs & Boundary Flaws:** Any code path accepting unvalidated external data without schema validation (OpenAPI/Zod) = **GATE FAILURE -> REJECTED**.
2. **Security & Authorization Vulnerability:** Any missing tenant check, role escalation, or IDOR vulnerability = **SEVERITY S1 CRITICAL SECURITY BLOCKER**.
3. **Unverified Implementation:** Declaring completion without concrete terminal test execution logs = **CONSTITUTION §13 VIOLATION**.
4. **Anti-AI-Slop & Contract Violation:** Introducing low-effort template code, missing negative paths, or skipping error state matrices = **REJECTED**.

---

## 3. Core Operating Playbook & Inspection Domains

Execute your domain responsibilities through these systematic inspection phases:

### Phase 1 — Discovery & Baseline Review
- Read \`docs/memory/PROJECT_STATE.md\`, \`DECISIONS.md\`, and active domain contracts.
- Identify module boundaries, existing interfaces, and data models before introducing changes.

### Phase 2 — Architectural & Security Analysis
- Review blast radius, transaction atomicity, and potential concurrency race conditions.
- Enforce strict server-side authorization and data minimization.

### Phase 3 — Implementation & Verification
- Deliver minimal, coherent vertical slice changes.
- Execute the complete verification ladder (\`lint\`, \`typecheck\`, and T1 fast-path unit suites).

---

## 4. Output Contract & Delivery Invariants

Every response or deliverable must provide:
- **CHANGES:** Concrete architectural and implementation modifications.
- **FILES:** Affected files with exact paths.
- **TESTS:** Executed terminal commands and exit codes.
- **FINDINGS & RISKS:** Severity-ranked observations (🔴 S1 / 🟡 S2 / 🔵 S3).`;
  return formatFrontmatter(attributes, body);
}

function createSkill(attributes, title) {
  const body = `# ${title} Playbook — \${PROJECT_NAME}

Authoritative sources: \`docs/architecture/\`, \`docs/qa/\`, and the Enterprise Engineering Constitution (§1–§20).

This playbook defines mandatory technical standards, operational patterns, and verification gates for ${title} across \${PROJECT_NAME}.

---

## 1. Core Operating Principles

1. **Computational Precision & Correctness:** Never settle for nominal happy-path code. Handle edge cases, invalid inputs, and boundary limits.
2. **Statutory Compliance & Security:** Enforce least privilege, server-side validation, and data minimization.
3. **Evidence-Based Completion:** Implementation is incomplete until verified via executed test suites with concrete logs.

---

## 2. Standard Implementation Workflow

### Step 1 — Context & Memory Ingestion
- Read active system state in \`docs/memory/PROJECT_STATE.md\` and binding decisions in \`docs/memory/DECISIONS.md\`.

### Step 2 — Architecture & Interface Locking
- Define typed request/response contracts before modifying production logic.

### Step 3 — Tiered Verification Ladder
- **Tier 0:** Static linting and typecheck (\`npm run lint\`, \`npm run typecheck\`).
- **Tier 1:** Fast-path air-gapped unit tests ($< 10\\text{s}$, zero database).
- **Tier 2:** Integration contract verification.

---

## 3. Verification & Quality Gate Checklist

- [ ] Strict schema validation enforced for all inputs.
- [ ] Server-side authorization verified on every mutation.
- [ ] Error handling implements structured error envelopes (no unhandled rejections).
- [ ] Colocated unit tests added for both happy and negative paths.
- [ ] Zero secret leaks or unmasked PII in logs/telemetry.`;
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
