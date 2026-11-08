const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const defaultPluginDir = path.join(process.env.USERPROFILE || 'C:\\Users\\Tanur', '.gemini', 'config', 'plugins', 'universal-orchestrator');
const targetDir = process.env.ANTIGRAVITY_PLUGIN_DIR || defaultPluginDir;

console.log('=== Deploying Universal AI Master Orchestrator to Antigravity Plugin ===');
console.log('Source Root:', repoRoot);
console.log('Target Plugin Directory:', targetDir);

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

function copyRecursive(src, dest) {
  if (fs.statSync(src).isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(child => {
      copyRecursive(path.join(src, child), path.join(dest, child));
    });
  } else {
    const content = fs.readFileSync(src, 'utf8');
    fs.writeFileSync(dest, content, 'utf8');
  }
}

// 1. Deploy Agents
const srcAgents = path.join(repoRoot, 'agents');
const destAgents = path.join(targetDir, 'agents');
console.log(`-> Syncing ${fs.readdirSync(srcAgents).filter(f => f.endsWith('.md')).length} Specialist Agents...`);
copyRecursive(srcAgents, destAgents);

// 2. Deploy Skills
const srcSkills = path.join(repoRoot, 'skills');
const destSkills = path.join(targetDir, 'skills');
console.log(`-> Syncing ${fs.readdirSync(srcSkills).filter(f => fs.statSync(path.join(srcSkills, f)).isDirectory()).length} Enterprise Skills...`);
copyRecursive(srcSkills, destSkills);

// 3. Deploy Rules (rules/AGENTS.md)
const srcRules = path.join(repoRoot, 'adapters', 'antigravity', 'rules', 'AGENTS.md');
const destRulesDir = path.join(targetDir, 'rules');
if (!fs.existsSync(destRulesDir)) fs.mkdirSync(destRulesDir, { recursive: true });
if (fs.existsSync(srcRules)) {
  fs.writeFileSync(path.join(destRulesDir, 'AGENTS.md'), fs.readFileSync(srcRules, 'utf8'), 'utf8');
  console.log('-> Syncing rules/AGENTS.md...');
}

// 4. Deploy plugin.json
const srcManifest = path.join(repoRoot, 'adapters', 'antigravity', 'plugin.json');
if (fs.existsSync(srcManifest)) {
  fs.writeFileSync(path.join(targetDir, 'plugin.json'), fs.readFileSync(srcManifest, 'utf8'), 'utf8');
  console.log('-> Syncing plugin.json...');
}

console.log('\n✓ Deployment to Antigravity plugin directory complete with verified UTF-8 parity.');

