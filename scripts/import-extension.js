#!/usr/bin/env node
/**
 * Universal AI Master Orchestrator: Trusted Extension & Importer Engine
 * Ingests external agents and skills from trusted GitHub repositories, local files, or catalogs,
 * automatically decouples, sanitizes, and adapts them into the Universal Master Orchestrator standard.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const https = require('https');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

// Helper to fetch content via HTTPS
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchUrl(res.headers.location));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP request failed with status ${res.statusCode}: ${url}`));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// Universal decoupling replacements to convert specific projects into universal parameters
const universalDecouplingRules = [
  { from: /\b(Acme|Contoso|FooCorp|MyCompany|Karirly)\b/gi, to: '${PROJECT_NAME}' },
  { from: /\bacme_dev\b/gi, to: '${DB_NAME}_dev' },
  { from: /\bacme_prod\b/gi, to: '${DB_NAME}_prod' },
  { from: /\bacme_uat\b/gi, to: '${DB_NAME}_uat' },
  { from: /\bacme_test\b/gi, to: '${DB_NAME}_test' },
  { from: /https?:\/\/[a-z0-9.-]+\.acme\.com/gi, to: 'https://${PROJECT_DOMAIN}' },
  { from: /https?:\/\/[a-z0-9.-]+\.example\.com/gi, to: 'https://${PROJECT_DOMAIN}' }
];

function sanitizeContent(rawMarkdown) {
  let content = rawMarkdown;
  universalDecouplingRules.forEach(({ from, to }) => {
    content = content.replace(from, to);
  });
  return content;
}

// Ensure YAML frontmatter is 100% compliant and clean
function normalizeFrontmatter(content, defaultName, defaultDesc, kind) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  let body = content;
  let name = defaultName;
  let desc = defaultDesc;
  let mode = kind === 'agent' ? 'subagent' : undefined;

  if (match) {
    const rawYaml = match[1];
    body = content.slice(match[0].length).trim();

    const nameMatch = rawYaml.match(/name:\s*["']?([a-z0-9-]+)["']?/i);
    if (nameMatch) name = nameMatch[1].toLowerCase();

    const descMatch = rawYaml.match(/description:\s*["']?([^"'\r\n]+)["']?/i);
    if (descMatch) desc = descMatch[1].trim();

    const modeMatch = rawYaml.match(/mode:\s*([a-z0-9_-]+)/i);
    if (modeMatch && kind === 'agent') mode = modeMatch[1];
  }

  const cleanDesc = desc.replace(/"/g, '\\"');
  let header = `---\nname: ${name}\ndescription: "${cleanDesc}"`;
  if (mode) header += `\nmode: ${mode}`;
  header += '\n---';

  // Inject Statutory Hard Gates if missing from agent
  if (kind === 'agent' && !body.includes('Statutory Hard Gates')) {
    const gateSection = `

---

## 2. Statutory Hard Gates — STOP & BLOCK IMMEDIATELY WHEN

1. **Unvalidated Inputs & Boundary Flaws:** Any code path accepting unvalidated external data without schema validation (OpenAPI/Zod) = **GATE FAILURE -> REJECTED**.
2. **Security & Authorization Vulnerability:** Any missing tenant check, role escalation, or IDOR vulnerability = **SEVERITY S1 CRITICAL SECURITY BLOCKER**.
3. **Unverified Implementation:** Declaring completion without concrete terminal test execution logs = **CONSTITUTION §13 VIOLATION**.
4. **Anti-AI-Slop & Contract Violation:** Introducing low-effort template code, missing negative paths, or skipping error state matrices = **REJECTED**.
`;
    body = body.replace(/(## 1\.[^\n]+\n[\s\S]*?)(---|\n## 2)/, `$1${gateSection}\n$2`);
  }

  return `${header}\n\n${body}\n`;
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

async function importExtension(options) {
  const { type, name, url, file, desc } = options;

  if (!type || !['agent', 'skill'].includes(type)) {
    throw new Error('Type must be "agent" or "skill"');
  }

  if (!name || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
    throw new Error(`Invalid identifier "${name}". Must be lowercase kebab-case.`);
  }

  let rawSource = '';

  if (url) {
    console.log(`-> Fetching from remote trusted source: ${url}`);
    rawSource = await fetchUrl(url);
  } else if (file) {
    console.log(`-> Ingesting from local file: ${file}`);
    const resolvedPath = path.resolve(process.cwd(), file);
    if (!fs.existsSync(resolvedPath)) throw new Error(`File not found: ${resolvedPath}`);
    rawSource = fs.readFileSync(resolvedPath, 'utf8');
  } else {
    throw new Error('Must provide either --url or --file');
  }

  console.log('-> Decoupling and universalizing source markdown...');
  const sanitized = sanitizeContent(rawSource);
  const defaultDesc = desc || `Enterprise ${name} capability for \${PROJECT_NAME}.`;
  const adapted = normalizeFrontmatter(sanitized, name, defaultDesc, type);

  if (type === 'agent') {
    const dest = path.join(repoRoot, 'agents', `${name}.md`);
    fs.writeFileSync(dest, adapted, 'utf8');
    console.log(`✅ Successfully imported and adapted Agent: agents/${name}.md`);
  } else {
    const destDir = path.join(repoRoot, 'skills', name);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, 'SKILL.md'), adapted, 'utf8');
    console.log(`✅ Successfully imported and adapted Skill: skills/${name}/SKILL.md`);
  }

  triggerSyncAndDeploy();
}

// Parse args
const args = process.argv.slice(2);
const options = {};
args.forEach(arg => {
  if (arg.startsWith('--')) {
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      options[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else {
      options[arg.slice(2)] = true;
    }
  }
});

if (options.help || Object.keys(options).length === 0) {
  console.log(`Universal AI Master Orchestrator: Extension Importer CLI

Usage:
  node scripts/import-extension.js --type=agent|skill --name=<kebab-name> [--url=<url> | --file=<file>] [--desc="..."]

Examples:
  node scripts/import-extension.js --type=agent --name=cloud-architect --file=./templates/cloud-architect.md
  node scripts/import-extension.js --type=skill --name=threat-modeling --url=https://raw.githubusercontent.com/.../SKILL.md
`);
  process.exit(0);
}

importExtension(options).catch(err => {
  console.error(`❌ Import Failed: ${err.message}`);
  process.exit(1);
});

