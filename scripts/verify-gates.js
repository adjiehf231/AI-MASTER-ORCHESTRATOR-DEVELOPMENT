#!/usr/bin/env node
/**
 * Universal Gate Verification Engine
 * Enforces Gate 0 (Hygiene), Gate 1 (DoR), and Gate 2 (DoD) compliance.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
console.log('=== [QUALITY GATES] Universal Enterprise Gate Enforcement ===\n');

let failedGates = [];

function runGate(gateName, checkFn) {
  process.stdout.write(`Evaluating ${gateName}... `);
  try {
    checkFn();
    console.log('✅ PASSED');
  } catch (err) {
    console.log('🔴 REJECTED');
    console.error(`  Failure Details: ${err.message}`);
    failedGates.push({ gate: gateName, error: err.message });
  }
}

// Gate 0: Static Hygiene & Secret Checks
runGate('Gate 0: Static Hygiene & Code Sanitation', () => {
  // Check for lingering .env files or exposed secrets in tracked git files
  const gitStatus = spawnSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' });
  if (gitStatus.stdout.includes('.env.production') || gitStatus.stdout.includes('.env.test')) {
    throw new Error('Sensitive environment files detected in git working tree');
  }

  // Verify that all markdown files have valid YAML frontmatter and proper code fences
  const testRes = spawnSync('node', ['--test', 'tests/metadata-yaml.test.js'], { cwd: repoRoot, encoding: 'utf8' });
  if (testRes.status !== 0) {
    throw new Error('YAML metadata validation failed for agents/skills');
  }
});

// Gate 1: Definition of Ready (DoR) Standard
runGate('Gate 1: Definition of Ready (DoR)', () => {
  const prdFile = path.join(repoRoot, 'PROJECT_CONTEXT.md');
  if (!fs.existsSync(prdFile)) {
    throw new Error('PROJECT_CONTEXT.md missing in workspace root');
  }
  const content = fs.readFileSync(prdFile, 'utf8');
  if (!content.includes('${PROJECT_ID}') && !content.includes('AIMASTER')) {
    throw new Error('PROJECT_CONTEXT.md missing valid project identifier');
  }
});

// Gate 2: Definition of Done (DoD) & T1 Fast-Path
runGate('Gate 2: Definition of Done (DoD)', () => {
  // Run complete unit test suite
  const testSuite = spawnSync('node', ['--test', 'tests/*.test.js'], { cwd: repoRoot, encoding: 'utf8' });
  if (testSuite.status !== 0) {
    throw new Error(`Unit test verification failed with exit code ${testSuite.status}`);
  }

  // Verify zero legacy domain leaks
  const decoupRes = spawnSync('node', ['--test', 'tests/decoupling.test.js'], { cwd: repoRoot, encoding: 'utf8' });
  if (decoupRes.status !== 0) {
    throw new Error('Decoupling invariant failed: legacy domain terms detected');
  }
});

console.log('\n------------------------------------------------------------');
if (failedGates.length === 0) {
  console.log('🏆 VERDICT: ALL RELEASE QUALITY GATES PASSED (Exit 0)');
  process.exit(0);
} else {
  console.error(`❌ VERDICT: ${failedGates.length} GATES FAILED. PROMOTION BLOCKED.`);
  process.exit(1);
}

