const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(full));
    } else if (file.endsWith('.md')) {
      results.push(full);
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

console.log('--- Starting Systematic Decoupling of Agents & Skills ---');

const files = walk('.');
let totalModified = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  generalReplacements.forEach(({ from, to }) => {
    content = content.replace(from, to);
  });

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    totalModified++;
    console.log(`Decoupled: ${file}`);
  }
});

console.log(`\nDecoupling complete. ${totalModified} files modified.`);
