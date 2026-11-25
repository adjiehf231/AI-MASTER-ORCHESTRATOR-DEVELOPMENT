#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const workspaceRoot = path.resolve(__dirname, '..');
const runtimeVariables = [
  'PATH', 'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT', 'TEMP', 'TMP', 'TMPDIR'
];

function runUnitTests(root, { files, executable = process.execPath, stdio = 'inherit' } = {}) {
  const directory = path.join(root, 'tests');
  const suite = files ?? fs.readdirSync(directory, { withFileTypes: true })
    .filter(file => file.isFile() && file.name.endsWith('.test.js'))
    .map(file => file.name)
    .sort();
  if (suite.length === 0) throw new Error('No unit test files were found');

  const env = { NODE_ENV: 'test' };
  for (const name of runtimeVariables) {
    if (process.env[name] !== undefined) env[name] = process.env[name];
  }
  const result = spawnSync(executable, ['--test', '--test-concurrency=4', ...suite.map(file => path.join(directory, file))], {
    cwd: root,
    env,
    encoding: 'utf8',
    stdio,
    timeout: 360_000,
    windowsHide: true
  });

  if (result.error) throw new Error('Unable to run the unit test suite', { cause: result.error });
  if (result.status !== 0) {
    const outcome = result.signal ? `signal ${result.signal}` : `exit code ${result.status}`;
    throw new Error(`Unit test suite failed with ${outcome}`);
  }
  return suite.length;
}

if (require.main === module) {
  console.log('=== [T1] Local unit tests with a sanitized environment ===');
  try {
    runUnitTests(workspaceRoot);
  } catch (error) {
    console.error(error.message, error.cause?.message ?? '');
    process.exitCode = 1;
  }
}

module.exports = { runUnitTests };
