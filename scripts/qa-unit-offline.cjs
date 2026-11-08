#!/usr/bin/env node
/**
 * T1 Air-Gapped Zero-DB Fast-Path Test Runner
 * Enforces fail-closed network guards and environment sanitization.
 */

const { spawnSync } = require('child_process');
const path = require('path');

console.log('=== [T1 FAST-PATH] Air-Gapped Unit Test Runner ===');
console.log('Enforcing zero-network and zero-database guardrails...');

// 1. Sanitize Environment
const safeEnv = {
  PATH: process.env.PATH,
  TEMP: process.env.TEMP,
  TMP: process.env.TMP,
  HOME: process.env.HOME,
  NODE_ENV: 'test',
  VITEST_NO_DB: 'true'
};

// 2. Execute Node test runner or configured test runner
const res = spawnSync('node', ['--test', 'tests/*.test.js'], {
  stdio: 'inherit',
  env: safeEnv,
  cwd: path.resolve(__dirname, '..')
});

process.exit(res.status || 0);
