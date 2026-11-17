#!/usr/bin/env node
const path = require('node:path');
const checks = require('./lib/verification.js');

const root = path.resolve(__dirname, '..');
const items = [
  ['F01', 'Active project context', () => checks.checkActiveContext(root)],
  ['F02', 'Generated adapters match canonical sources', () => checks.checkAdapterParity(root)],
  ['F03', 'Legacy project vocabulary', () => checks.checkLegacyTerms(root)],
  ['F04', 'Utility migration scope tests', () => checks.checkUnitTests(root, ['scope-safety.test.js'])],
  ['F05', 'Canonical agent and skill YAML metadata', () => checks.checkMetadata(root)],
  ['F06', 'Local native adapter configuration', () => checks.checkNativeAdapters(root)],
  ['F07', 'Repository and dispatch references', () => {
    checks.checkRepositoryReferences(root);
    checks.checkDispatchReferences(root);
  }],
  ['F08', 'Repository unit test suite', () => checks.checkUnitTests(root)],
  ['F09', 'UI state and target-size guidance', () => checks.checkUiStateGuidelines(root)],
  ['F10', 'Git index and ignore rules for sensitive filenames', () => {
    checks.checkTrackedFilenames(root);
    checks.checkGitIgnore(root);
  }]
];

console.log('=== Audit 360 repository checks ===');
let failures = 0;
for (const [id, title, verify] of items) {
  console.log('Checking ' + id + ' - ' + title);
  try {
    verify();
    console.log(id + ' PASS');
  } catch (error) {
    failures++;
    console.error(id + ' FAIL - ' + error.message);
  }
}
console.log('Verification complete: ' + (items.length - failures) + ' passed, ' + failures + ' failed.');
if (failures > 0) process.exitCode = 1;
