#!/usr/bin/env node
const path = require('node:path');
const checks = require('./lib/verification.js');

function checkHygiene(root) {
  checks.checkTrackedFilenames(root);
  checks.checkGitIgnore(root);
  checks.checkMetadata(root);
  checks.checkLegacyTerms(root);
}

function checkReadiness(root) {
  checks.checkActiveContext(root);
  checks.checkRepositoryReferences(root);
  checks.checkDispatchReferences(root);
}

function checkCompletion(root) {
  checks.checkAdapterParity(root);
  checks.checkNativeAdapters(root);
  checks.checkUiStateGuidelines(root);
  checks.checkUnitTests(root);
}

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const gates = [
    ['Gate 0 - Repository hygiene', checkHygiene],
    ['Gate 1 - Project configuration and references', checkReadiness],
    ['Gate 2 - Adapter parity and unit tests', checkCompletion]
  ];
  console.log('=== Repository quality gates ===');
  let failures = 0;
  for (const [name, verify] of gates) {
    console.log('Evaluating ' + name);
    try {
      verify(root);
      console.log(name + ' PASSED');
    } catch (error) {
      failures++;
      console.error(name + ' FAILED - ' + error.message);
    }
  }
  if (failures > 0) {
    console.error(failures + ' repository quality gates failed.');
    process.exitCode = 1;
  } else {
    console.log('All three repository quality gates passed.');
  }
}

module.exports = { checkHygiene, checkReadiness };
