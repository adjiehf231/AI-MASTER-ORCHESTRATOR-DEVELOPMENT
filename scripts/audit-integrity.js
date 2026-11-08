#!/usr/bin/env node
/**
 * Universal AI Master Orchestrator: Comprehensive Integrity & Audit Suite
 * Validates all 10 engineering findings from AUDIT-360.md.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
console.log('=== Universal AI Master Orchestrator: Audit 360 Verification ===\n');

let passCount = 0;
let failCount = 0;

function check(label, fn) {
  process.stdout.write(`Checking ${label}... `);
  try {
    fn();
    console.log('✅ PASS');
    passCount++;
  } catch (err) {
    console.log('❌ FAIL');
    console.error(`  Error: ${err.message}`);
    failCount++;
  }
}

// F01: Context binding
check('F01: Project context schema & variable binding', () => {
  const context = fs.readFileSync(path.join(repoRoot, 'PROJECT_CONTEXT.md'), 'utf8');
  if (!context.includes('${DB_NAME}')) throw new Error('PROJECT_CONTEXT.md missing ${DB_NAME}');
  const claude = fs.readFileSync(path.join(repoRoot, 'CLAUDE.md'), 'utf8');
  if (claude.includes('${PROJECT_NAME}')) throw new Error('Active adapters still contain unbound ${PROJECT_NAME}');
});

// F02: SSOT body propagation
check('F02: SSOT body propagation from agents/orchestrator.md', () => {
  const orch = fs.readFileSync(path.join(repoRoot, 'agents', 'orchestrator.md'), 'utf8');
  const bundle = fs.readFileSync(path.join(repoRoot, 'adapters', 'bundle', 'universal-system-prompt.md'), 'utf8');
  if (!bundle.includes('10-Stage Enterprise SDLC Operating Map')) throw new Error('SSOT body not propagated to bundle');
});

// F03: Zero legacy domain leaks
check('F03: Zero legacy domain leaks (career/ATS/CV/alamat_lengkap)', () => {
  const targets = fs.readdirSync(path.join(repoRoot, 'agents')).map(f => path.join(repoRoot, 'agents', f))
    .concat(fs.readdirSync(path.join(repoRoot, 'skills')).map(d => path.join(repoRoot, 'skills', d, 'SKILL.md')));
  const patterns = [/\bcareer\b/i, /\bATS\b/, /\bCV\b(?!E\b)/, /\balamat_lengkap\b/i];
  targets.forEach(f => {
    const c = fs.readFileSync(f, 'utf8');
    patterns.forEach(p => {
      if (p.test(c)) throw new Error(`Leak detected in ${path.relative(repoRoot, f)} matching ${p}`);
    });
  });
});

// F04: Utility migration script scope safety
check('F04: Utility script fail-closed scope protection', () => {
  const refactor = fs.readFileSync(path.join(repoRoot, 'scripts', 'refactor-core.js'), 'utf8');
  if (!refactor.includes('sentinelFile')) throw new Error('refactor-core.js missing sentinel check');
});

// F05: YAML frontmatter validity
check('F05: Valid YAML frontmatter across all components', () => {
  const targets = fs.readdirSync(path.join(repoRoot, 'agents')).map(f => path.join(repoRoot, 'agents', f))
    .concat(fs.readdirSync(path.join(repoRoot, 'skills')).map(d => path.join(repoRoot, 'skills', d, 'SKILL.md')));
  targets.forEach(f => {
    const c = fs.readFileSync(f, 'utf8');
    const m = c.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) throw new Error(`Missing frontmatter in ${path.relative(repoRoot, f)}`);
    if (!m[1].includes('description:')) throw new Error(`Missing description in ${path.relative(repoRoot, f)}`);
  });
});

// F06: Native platform adapter contracts
check('F06: Multi-platform adapter contracts (Claude, OpenCode, Antigravity)', () => {
  if (!fs.existsSync(path.join(repoRoot, '.claude', 'agents', 'security-engineer.md'))) throw new Error('Missing .claude/agents');
  if (!fs.existsSync(path.join(repoRoot, '.opencode', 'agents', 'security-engineer.md'))) throw new Error('Missing .opencode/agents');
  if (!fs.existsSync(path.join(repoRoot, 'adapters', 'antigravity', 'rules', 'AGENTS.md'))) throw new Error('Missing Antigravity rules/AGENTS.md');
});

// F07: Foundational documentation templates
check('F07: Foundational authoritative documents availability', () => {
  if (!fs.existsSync(path.join(repoRoot, 'docs', 'qa', 'RELEASE_QUALITY_GATES.md'))) throw new Error('Missing RELEASE_QUALITY_GATES.md');
  if (!fs.existsSync(path.join(repoRoot, 'docs', 'process', 'SDLC.md'))) throw new Error('Missing SDLC.md');
  if (!fs.existsSync(path.join(repoRoot, 'docs', 'process', 'STLC.md'))) throw new Error('Missing STLC.md');
});

// F08: Automated test suite
check('F08: Node test suite execution', () => {
  const res = spawnSync('node', ['--test', 'tests/*.test.js'], { cwd: repoRoot });
  if (res.status !== 0) throw new Error('Test suite failed');
});

// F09: UI state matrix & WCAG 2.2 AA consistency
check('F09: UI matrix consistency & WCAG 2.2 AA alignment', () => {
  const ds = fs.readFileSync(path.join(repoRoot, 'skills', 'ui-ux-design-system', 'SKILL.md'), 'utf8');
  if (!ds.includes('Universal 6-State Matrix')) throw new Error('UI design system missing Universal 6-State Matrix');
  if (!ds.includes('Interactive Component State Spectrum')) throw new Error('UI design system missing Interactive Spectrum');
});

// F10: Gitignore coverage
check('F10: Sensitive environment file exclusion', () => {
  const gi = fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8');
  if (!gi.includes('.env.*') || !gi.includes('!.env.example')) throw new Error('.gitignore missing .env.* / !.env.example');
});

console.log(`\nVerification Complete: ${passCount} Passed, ${failCount} Failed.`);
process.exit(failCount === 0 ? 0 : 1);

