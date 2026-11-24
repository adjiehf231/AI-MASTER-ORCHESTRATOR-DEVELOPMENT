#!/usr/bin/env node
const path = require('node:path');
const { parseArgs } = require('node:util');
const { checkMemory, selectMemory, buildMemoryProposal } = require('./lib/memory');

function main(args) {
  const [command = 'context', ...rest] = args;
  const { values } = parseArgs({
    args: command === '--help' ? [] : rest,
    options: {
      path: { type: 'string', multiple: true },
      tag: { type: 'string', multiple: true },
      branch: { type: 'string' },
      'max-bytes': { type: 'string' },
      file: { type: 'string' },
      help: { type: 'boolean' }
    }
  });
  if (command === '--help' || values.help) {
    console.log('Usage: npm run orchestrator:memory -- check|context|propose');
    console.log('  context [--path <relative-path>] [--tag <tag>] [--branch <branch>] [--max-bytes <1024..65536>]');
    console.log('  propose --file <workspace-relative-proposal.json>');
    console.log('Context and proposal commands are read-only. Repeat path and tag options as required.');
    return;
  }
  const root = path.resolve(__dirname, '..');
  if (command === 'check') {
    console.log('Validated ' + checkMemory(root) + ' indexed memory entries.');
    return;
  }
  let result;
  if (command === 'context') {
    result = selectMemory(root, {
      paths: values.path,
      tags: values.tag,
      branch: values.branch,
      maxBytes: values['max-bytes'] === undefined ? undefined : Number(values['max-bytes'])
    });
    // The service measures this compact JSON representation against maxBytes.
    console.log(JSON.stringify(result));
    return;
  }
  if (command === 'propose') result = buildMemoryProposal(root, values.file);
  else throw new Error('Unknown memory command: ' + command);
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error('Memory command failed: ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = { main };
