#!/usr/bin/env node
/**
 * Universal AI Master Orchestrator: Agent & Skill Management CLI
 * Automates creation, updating, scaffolding, and synchronization of Specialist Agents and Enterprise Skills.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

// Helper to parse CLI arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0];
  const params = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        const key = arg.slice(2, eqIdx);
        const val = arg.slice(eqIdx + 1);
        params[key] = val;
      } else {
        const key = arg.slice(2);
        const next = args[i + 1];
        if (next && !next.startsWith('--')) {
          params[key] = next;
          i++;
        } else {
          params[key] = true;
        }
      }
    } else if (!params.target) {
      params.target = arg;
    }
  }

  return { command, params };
}

// Helper to validate kebab-case naming
function validateKebabCase(name) {
  if (!name || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
    throw new Error(`Invalid identifier "${name}". Must be lowercase kebab-case (e.g. "cloud-architect", "threat-modeling").`);
  }
}

// Trigger automatic multi-platform synchronization and live deployment
function triggerSyncAndDeploy() {
  console.log('\n-> Synchronizing multi-platform adapters...');
  const syncRes = spawnSync('node', [path.join(repoRoot, 'scripts', 'sync-adapters.js')], { stdio: 'inherit', cwd: repoRoot });
  if (syncRes.status !== 0) throw new Error('Adapter synchronization failed.');

  console.log('-> Deploying updates to local Antigravity plugin...');
  const deployRes = spawnSync('node', [path.join(repoRoot, 'scripts', 'deploy-antigravity.js')], { stdio: 'inherit', cwd: repoRoot });
  if (deployRes.status !== 0) throw new Error('Antigravity deployment failed.');

  console.log('-> Running integrity validation...');
  const auditRes = spawnSync('node', [path.join(repoRoot, 'scripts', 'audit-integrity.js')], { stdio: 'inherit', cwd: repoRoot });
  if (auditRes.status !== 0) throw new Error('Integrity audit failed.');
}

// 1. Create Agent
function createAgent(params) {
  const name = params.name || params.target;
  validateKebabCase(name);

  const title = params.title || name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const role = params.role || `Principal ${title} Engineer`;
  const desc = params.desc || `${role} — governs \${PROJECT_NAME} systems, architecture, and verification.`;
  const mode = params.mode || 'subagent';

  const agentPath = path.join(repoRoot, 'agents', `${name}.md`);
  if (fs.existsSync(agentPath) && !params.force) {
    throw new Error(`Agent "${name}" already exists at ${path.relative(repoRoot, agentPath)}. Pass --force to overwrite.`);
  }

  const cleanDesc = desc.replace(/"/g, '\\"');
  const content = `---
name: ${name}
description: "${cleanDesc}"
mode: ${mode}
---

# ${role.toUpperCase()} — \${PROJECT_NAME}

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
- **FINDINGS & RISKS:** Severity-ranked observations (🔴 S1 / 🟡 S2 / 🔵 S3).
`;

  fs.writeFileSync(agentPath, content, 'utf8');
  console.log(`✅ Successfully created Agent: agents/${name}.md`);
  triggerSyncAndDeploy();
}

// 2. Update Agent
function updateAgent(params) {
  const name = params.name || params.target;
  validateKebabCase(name);

  const agentPath = path.join(repoRoot, 'agents', `${name}.md`);
  if (!fs.existsSync(agentPath)) {
    throw new Error(`Agent "${name}" not found at ${path.relative(repoRoot, agentPath)}.`);
  }

  let content = fs.readFileSync(agentPath, 'utf8');
  if (params.desc) {
    const cleanDesc = params.desc.replace(/"/g, '\\"');
    content = content.replace(/^description:\s*["'][^"'\r\n]+["']/m, `description: "${cleanDesc}"`);
  }
  if (params.mode) {
    content = content.replace(/^mode:\s*[^\r\n]+/m, `mode: ${params.mode}`);
  }

  fs.writeFileSync(agentPath, content, 'utf8');
  console.log(`✅ Successfully updated Agent: agents/${name}.md`);
  triggerSyncAndDeploy();
}

// 3. Create Skill
function createSkill(params) {
  const name = params.name || params.target;
  validateKebabCase(name);

  const title = params.title || name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const desc = params.desc || `Enterprise ${title} Playbook — standards, implementation patterns, and verification matrices for \${PROJECT_NAME}.`;

  const skillDir = path.join(repoRoot, 'skills', name);
  const skillFile = path.join(skillDir, 'SKILL.md');

  if (fs.existsSync(skillFile) && !params.force) {
    throw new Error(`Skill "${name}" already exists at ${path.relative(repoRoot, skillFile)}. Pass --force to overwrite.`);
  }

  if (!fs.existsSync(skillDir)) fs.mkdirSync(skillDir, { recursive: true });

  const cleanDesc = desc.replace(/"/g, '\\"');
  const content = `---
name: ${name}
description: "${cleanDesc}"
---

# ${title} Playbook — \${PROJECT_NAME}

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
- [ ] Zero secret leaks or unmasked PII in logs/telemetry.
`;

  fs.writeFileSync(skillFile, content, 'utf8');
  console.log(`✅ Successfully created Skill: skills/${name}/SKILL.md`);
  triggerSyncAndDeploy();
}

// 4. Update Skill
function updateSkill(params) {
  const name = params.name || params.target;
  validateKebabCase(name);

  const skillFile = path.join(repoRoot, 'skills', name, 'SKILL.md');
  if (!fs.existsSync(skillFile)) {
    throw new Error(`Skill "${name}" not found at ${path.relative(repoRoot, skillFile)}.`);
  }

  let content = fs.readFileSync(skillFile, 'utf8');
  if (params.desc) {
    const cleanDesc = params.desc.replace(/"/g, '\\"');
    content = content.replace(/^description:\s*["'][^"'\r\n]+["']/m, `description: "${cleanDesc}"`);
  }

  fs.writeFileSync(skillFile, content, 'utf8');
  console.log(`✅ Successfully updated Skill: skills/${name}/SKILL.md`);
  triggerSyncAndDeploy();
}

// 5. List Agents & Skills
function listAll() {
  const agentsDir = path.join(repoRoot, 'agents');
  const agentFiles = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));

  const skillsDir = path.join(repoRoot, 'skills');
  const skillDirs = fs.readdirSync(skillsDir).filter(f => fs.statSync(path.join(skillsDir, f)).isDirectory());

  console.log(`\n=== Specialist Agents Council (${agentFiles.length} Roles) ===`);
  agentFiles.forEach((file, idx) => {
    const content = fs.readFileSync(path.join(agentsDir, file), 'utf8');
    const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const descMatch = m ? m[1].match(/description:\s*["']?([^"'\r\n]+)/) : null;
    const desc = descMatch ? descMatch[1].slice(0, 75) + '...' : 'No description';
    console.log(` ${String(idx + 1).padStart(2, '0')}. \x1b[36m${file.replace('.md', '')}\x1b[0m: ${desc}`);
  });

  console.log(`\n=== Enterprise Skills Directory (${skillDirs.length} Playbooks) ===`);
  skillDirs.forEach((dir, idx) => {
    const skillPath = path.join(skillsDir, dir, 'SKILL.md');
    let desc = 'No description';
    if (fs.existsSync(skillPath)) {
      const content = fs.readFileSync(skillPath, 'utf8');
      const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      const descMatch = m ? m[1].match(/description:\s*["']?([^"'\r\n]+)/) : null;
      desc = descMatch ? descMatch[1].slice(0, 75) + '...' : 'No description';
    }
    console.log(` ${String(idx + 1).padStart(2, '0')}. \x1b[32m${dir}\x1b[0m: ${desc}`);
  });
  console.log('');
}

// Main Router
const { command, params } = parseArgs();

switch (command) {
  case 'agent:create':
  case 'create:agent':
  case 'add:agent':
    createAgent(params);
    break;
  case 'agent:update':
  case 'update:agent':
    updateAgent(params);
    break;
  case 'skill:create':
  case 'create:skill':
  case 'add:skill':
    createSkill(params);
    break;
  case 'skill:update':
  case 'update:skill':
    updateSkill(params);
    break;
  case 'list':
  case 'status':
    listAll();
    break;
  default:
    console.log(`Universal AI Master Orchestrator: Agent & Skill Management CLI

Usage:
  node scripts/manage-orchestrator.js <command> [options]

Commands:
  agent:create <name>  [--title="..."] [--role="..."] [--desc="..."] [--mode="all|subagent"]
  agent:update <name>  [--desc="..."] [--mode="..."]
  skill:create <name>  [--title="..."] [--desc="..."]
  skill:update <name>  [--desc="..."]
  list                 Display all registered agents and skills

Examples:
  node scripts/manage-orchestrator.js agent:create cloud-architect --desc="Governs cloud topologies and IaC."
  node scripts/manage-orchestrator.js skill:create threat-modeling --desc="STRIDE threat modeling standards."
`);
}

