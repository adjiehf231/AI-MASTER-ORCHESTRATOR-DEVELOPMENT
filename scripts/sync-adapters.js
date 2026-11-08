const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const sentinelFile = path.join(repoRoot, 'PROJECT_CONTEXT.template.md');

if (!fs.existsSync(sentinelFile)) {
  console.error('FATAL: Execution scope violation. Sentinel file not found at repository root: ' + repoRoot);
  process.exit(1);
}

const isTemplateMode = process.argv.includes('--template');
console.log('=== Universal AI Master Orchestrator: Multi-Platform Adapter Generator ===');
console.log('Target Root:', repoRoot);
console.log('Mode:', isTemplateMode ? 'TEMPLATE (Retaining ${VARIABLE} placeholders)' : 'ACTIVE CONTEXT (Binding from PROJECT_CONTEXT.md)');

// 1. Robust Frontmatter Parser (Supports standard YAML, folded scalars, quoted strings)
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { frontmatter: {}, body: content };

  const rawYaml = match[1];
  const body = content.slice(match[0].length).trim();
  const frontmatter = {};

  const lines = rawYaml.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const colonIdx = line.indexOf(':');
    if (colonIdx !== -1 && !line.startsWith(' ') && !line.startsWith('\t')) {
      const key = line.slice(0, colonIdx).trim();
      let val = line.slice(colonIdx + 1).trim();

      // Check for folded or multiline scalar (>- , > , |)
      if (val === '>-' || val === '>' || val === '|' || val === '|-') {
        const blockLines = [];
        i++;
        while (i < lines.length && (lines[i].startsWith('  ') || lines[i].trim() === '')) {
          if (lines[i].trim().length > 0) blockLines.push(lines[i].trim());
          i++;
        }
        i--; // Step back to last processed line
        val = blockLines.join(' ');
      }

      // Strip outer quotes and unescape
      val = val.replace(/^["']|["']$/g, '').replace(/\\"/g, '"');
      frontmatter[key] = val;
    }
  }

  return { frontmatter, body };
}

// 2. Load and Parse Project Context
function loadProjectContext() {
  const contextPath = path.join(repoRoot, 'PROJECT_CONTEXT.md');
  const templatePath = path.join(repoRoot, 'PROJECT_CONTEXT.template.md');
  const activePath = fs.existsSync(contextPath) ? contextPath : templatePath;
  const content = fs.readFileSync(activePath, 'utf8');

  const context = {
    PROJECT_NAME: 'Universal Project',
    PROJECT_ID: 'PROJECT',
    PROJECT_DOMAIN: 'domain.local',
    DB_NAME: 'project_db',
    SRC_DIR: 'src',
    COMPONENTS_DIR: 'src/components',
    MODULES_DIR: 'src/features',
    DOCS_DIR: 'docs'
  };

  const lines = content.split(/\r?\n/);
  lines.forEach(line => {
    // Match pattern: - **Label (`${VAR_NAME}`):** "value"
    const match = line.match(/\(`\$\{([A-Z0-9_]+)\}`\):\s*["']?([^"'\r\n]+)["']?/);
    if (match) {
      context[match[1]] = match[2].trim();
    }
  });

  return context;
}

const projectContext = loadProjectContext();

function applyContext(text, context) {
  if (isTemplateMode) return text;
  let result = text;
  Object.keys(context).forEach(key => {
    const placeholder = new RegExp(`\\$\\{${key}\\}`, 'g');
    result = result.replace(placeholder, context[key]);
  });
  return result;
}

// 3. Discover all Agents
const agentsDir = path.join(repoRoot, 'agents');
const agentFiles = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
const agents = agentFiles.map(file => {
  const fullPath = path.join(agentsDir, file);
  const content = fs.readFileSync(fullPath, 'utf8');
  const { frontmatter, body } = parseFrontmatter(content);
  const titleMatch = body.match(/^#\s+(.+)$/m);
  const id = file.replace('.md', '');
  return {
    id,
    filename: file,
    title: titleMatch ? titleMatch[1] : id,
    description: frontmatter.description || '',
    mode: frontmatter.mode || 'all',
    body
  };
});

// 4. Discover all Skills
const skillsDir = path.join(repoRoot, 'skills');
const skillDirs = fs.readdirSync(skillsDir).filter(f => {
  const full = path.join(skillsDir, f);
  return fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, 'SKILL.md'));
});

const skills = skillDirs.map(dir => {
  const skillFile = path.join(skillsDir, dir, 'SKILL.md');
  const content = fs.readFileSync(skillFile, 'utf8');
  const { frontmatter, body } = parseFrontmatter(content);
  return {
    id: dir,
    name: frontmatter.name || dir,
    description: frontmatter.description || '',
    body
  };
});

console.log(`Discovered ${agents.length} Specialist Agents.`);
console.log(`Discovered ${skills.length} Enterprise Skills.`);

// 5. Build Core Orchestration Prompt Body from SSOT (agents/orchestrator.md)
function buildCorePrompt(targetPlatform) {
  const orchestrator = agents.find(a => a.id === 'orchestrator');
  let basePrompt = orchestrator ? orchestrator.body : '# UNIVERSAL MASTER ORCHESTRATOR';

  const agentCatalog = `
---

## 5. Master Specialist Agent Directory (${agents.length} Roles)
You can embody or dispatch any of the following ${agents.length} specialist roles:

${agents.map(a => `- **\`${a.id}\`** — ${a.title}\n  *Mandate:* ${a.description}`).join('\n')}
`;

  const skillCatalog = `
---

## 6. Enterprise Skill Directory (${skills.length} Skills)
Invoke or reference these specialized skill playbooks:

${skills.map(s => `- **\`skills/${s.id}/SKILL.md\`** (${s.name}): ${s.description}`).join('\n')}
`;

  const platformHeader = `Target Platform: **${targetPlatform}**\n\n`;

  // Inject target platform and dynamic catalogs
  let fullPrompt = basePrompt.replace('## 1. Identity & Autonomous Mandate', `${platformHeader}## 1. Identity & Autonomous Mandate`);
  fullPrompt = fullPrompt + '\n' + agentCatalog + '\n' + skillCatalog;

  return applyContext(fullPrompt, projectContext);
}

// 6. Write File Helper with Directory Creation
function writeAdapter(destPath, content) {
  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(destPath, content, 'utf8');
}

// --- GENERATE ADAPTERS ---

// 1. CLAUDE.md & .claude/agents/ (Claude Code)
const claudeContent = buildCorePrompt('Claude Code (CLI & Desktop)');
writeAdapter(path.join(repoRoot, 'CLAUDE.md'), claudeContent);

const claudeAgentsDir = path.join(repoRoot, '.claude', 'agents');
agents.forEach(agent => {
  const subagentDoc = `---
name: ${agent.id}
description: "${agent.description.replace(/"/g, '\\"')}"
---

${applyContext(agent.body, projectContext)}
`;
  writeAdapter(path.join(claudeAgentsDir, `${agent.id}.md`), subagentDoc);
});
console.log('✓ Generated CLAUDE.md & .claude/agents/*.md (Native Subagent Profiles)');

// 2. Cursor IDE (.cursorrules)
const cursorContent = buildCorePrompt('Cursor IDE AI (Composer & Chat)');
writeAdapter(path.join(repoRoot, '.cursorrules'), cursorContent);
console.log('✓ Generated .cursorrules');

// 3. Windsurf IDE (.windsurfrules)
const windsurfContent = buildCorePrompt('Windsurf IDE (Cascade)');
writeAdapter(path.join(repoRoot, '.windsurfrules'), windsurfContent);
console.log('✓ Generated .windsurfrules');

// 4. Cline / Roo-Code (.clinerules) & OpenCode (.opencoderules + .opencode/agents/)
const clineContent = buildCorePrompt('Cline / Roo-Code / OpenCode');
writeAdapter(path.join(repoRoot, '.clinerules'), clineContent);
writeAdapter(path.join(repoRoot, '.opencoderules'), clineContent);

const opencodeAgentsDir = path.join(repoRoot, '.opencode', 'agents');
agents.forEach(agent => {
  const opencodeDoc = `---
name: ${agent.id}
description: "${agent.description.replace(/"/g, '\\"')}"
mode: subagent
---

${applyContext(agent.body, projectContext)}
`;
  writeAdapter(path.join(opencodeAgentsDir, `${agent.id}.md`), opencodeDoc);
});

// Also output adapters/opencode/AGENTS.md for OpenCode V2 compliance
writeAdapter(path.join(repoRoot, 'adapters', 'opencode', 'AGENTS.md'), clineContent);
console.log('✓ Generated .clinerules, .opencoderules, and .opencode/agents/*.md (OpenCode V2)');

// 5. Aider CLI (CONVENTIONS.md & .aider.conf.yml)
const conventionsContent = buildCorePrompt('Aider & Polyglot Coding Agents (CONVENTIONS.md)');
writeAdapter(path.join(repoRoot, 'CONVENTIONS.md'), conventionsContent);
writeAdapter(path.join(repoRoot, '.aider.conf.yml'), `# Aider configuration for Universal AI Master Orchestrator
read: CONVENTIONS.md
auto-commits: false
attribute-author: false
`);
console.log('✓ Generated CONVENTIONS.md & .aider.conf.yml');

// 6. Continue.dev Rules
const continueContent = buildCorePrompt('Continue.dev IDE Assistant');
writeAdapter(path.join(repoRoot, '.continue', 'rules', 'universal-orchestrator.md'), continueContent);
console.log('✓ Generated .continue/rules/universal-orchestrator.md');

// 7. OpenRouter / 9router / LiteLLM Gateway
const openrouterPrompt = buildCorePrompt('OpenRouter / 9router / OneRouter / Gateway Models');
const openrouterDir = path.join(repoRoot, 'adapters', 'openrouter');
writeAdapter(path.join(openrouterDir, 'system-prompt.txt'), openrouterPrompt);
const openrouterPayload = {
  model: "anthropic/claude-3.5-sonnet",
  messages: [
    {
      role: "system",
      content: openrouterPrompt
    }
  ],
  temperature: 0.2,
  top_p: 0.95
};
writeAdapter(path.join(openrouterDir, 'payload.json'), JSON.stringify(openrouterPayload, null, 2));
console.log('✓ Generated adapters/openrouter/system-prompt.txt & payload.json');

// 8. Universal Prompt Bundle (Codex, ChatGPT, DeepSeek, Ollama)
const bundleContent = buildCorePrompt('Universal Prompt Bundle (OpenAI Codex, ChatGPT, DeepSeek, Ollama)');
writeAdapter(path.join(repoRoot, 'adapters', 'bundle', 'universal-system-prompt.md'), bundleContent);
console.log('✓ Generated adapters/bundle/universal-system-prompt.md');

// 9. Antigravity Plugin Structure (plugin.json + rules/AGENTS.md)
const antigravityRules = buildCorePrompt('Google Antigravity & Gemini Agents');
const antigravityDir = path.join(repoRoot, 'adapters', 'antigravity');
writeAdapter(path.join(antigravityDir, 'rules', 'AGENTS.md'), antigravityRules);

const antigravityPlugin = {
  name: "universal-orchestrator",
  version: "1.0.0",
  description: `Universal Autonomous Technical Director & ${agents.length} Specialist Agents with Anti-AI-Slop UI/UX Engineering, Perpetual Living Memory, and ${skills.length} Enterprise SDLC Skills.`,
  author: "Antigravity Engineering Council"
};
writeAdapter(path.join(antigravityDir, 'plugin.json'), JSON.stringify(antigravityPlugin, null, 2));
console.log('✓ Generated adapters/antigravity/plugin.json & rules/AGENTS.md');

console.log('\n=== Multi-Platform Adapter Synchronization Complete ===');
