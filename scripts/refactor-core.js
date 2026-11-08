const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const sentinelFile = path.join(repoRoot, 'PROJECT_CONTEXT.template.md');

if (!fs.existsSync(sentinelFile)) {
  console.error('FATAL: Execution scope violation. Sentinel file not found at repository root: ' + repoRoot);
  process.exit(1);
}

const isApply = process.argv.includes('--apply');
console.log('--- Systematic Decoupling of Agents & Skills ---');
console.log('Target Root:', repoRoot);
console.log('Mode:', isApply ? 'APPLY (Modifying files)' : 'DRY-RUN (Simulating changes - pass --apply to write)');

const ignoredDirs = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next']);

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    if (ignoredDirs.has(file)) return;
    const full = path.join(dir, file);
    try {
      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) return; // Prevent symlink traversal
      if (stat.isDirectory()) {
        results = results.concat(walk(full));
      } else if (file.endsWith('.md')) {
        results.push(full);
      }
    } catch (e) {
      // Skip unreadable files
    }
  });
  return results;
}

// 1. General replacements across all markdown files
const generalReplacements = [
  // Names and branding
  { from: /Karirly Autonomous Technical Director & Master Orchestrator/g, to: 'Universal Autonomous Technical Director & Master Orchestrator' },
  { from: /KARIRLY MASTER ORCHESTRATOR — Autonomous Technical Director/g, to: 'UNIVERSAL MASTER ORCHESTRATOR — Autonomous Technical Director' },
  { from: /Karirly Chief Technical Director & Autonomous Orchestration Engine/g, to: 'Universal Chief Technical Director & Autonomous Orchestration Engine' },
  { from: /Karirly Engineering Constitution/g, to: 'Enterprise Engineering Constitution' },
  { from: /Karirly Enterprise Software Development Life Cycle/g, to: 'Universal Enterprise Software Development Life Cycle' },
  { from: /SDLC & Enterprise Delivery Playbook — Karirly/g, to: 'SDLC & Enterprise Delivery Playbook — Universal Enterprise Standard' },
  { from: /Karirly/g, to: '${PROJECT_NAME}' },

  // Change request & requirement prefixes
  { from: /CR-KAR-/g, to: 'CR-${PROJECT_ID}-' },
  { from: /BR-KAR-/g, to: 'BR-${PROJECT_ID}-' },

  // Paths
  { from: /`src\/domains\/\*`/g, to: '`${SRC_DIR}/domains/*`' },
  { from: /`src\/modules\/\*`/g, to: '`${SRC_DIR}/modules/*`' },
  { from: /`src\/infrastructure\/\*`/g, to: '`${SRC_DIR}/infrastructure/*`' },
  { from: /`src\/components\/\*`/g, to: '`${SRC_DIR}/components/*`' },

  // Compliance
  { from: /UU PDP No\. 27\/2022/g, to: 'Statutory Data Privacy (GDPR / UU PDP / CCPA per project profile)' }
];

const files = walk(repoRoot);
let totalModified = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  generalReplacements.forEach(({ from, to }) => {
    content = content.replace(from, to);
  });

  if (content !== original) {
    totalModified++;
    console.log(`${isApply ? 'Modified' : '[DRY-RUN] Would modify'}: ${path.relative(repoRoot, file)}`);
    if (isApply) {
      fs.writeFileSync(file, content, 'utf8');
    }
  }
});

console.log(`\nScan complete. ${totalModified} files identified for decoupling.`);
