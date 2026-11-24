#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { planTask } = require('./lib/routing');

const root = path.resolve(__dirname, '..');

function readInventory(filename) {
  const stats = fs.statSync(filename);
  if (!stats.isFile() || stats.size > 64 * 1024) {
    throw new Error('Host inventory must be a regular JSON file no larger than 64 KiB.');
  }
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

function main(args) {
  const { values } = parseArgs({
    args,
    options: {
      route: { type: 'string' },
      risk: { type: 'string' },
      operation: { type: 'string' },
      path: { type: 'string', multiple: true },
      tag: { type: 'string', multiple: true },
      need: { type: 'string', multiple: true },
      inventory: { type: 'string' },
      help: { type: 'boolean' }
    }
  });
  if (values.help) {
    console.log('Usage: npm run orchestrator:plan -- [--route <id>] [--risk low|medium|high|critical]');
    console.log('  [--operation read|edit] [--path <relative-path>] [--tag <tag>] [--need <capability>]');
    console.log('  [--inventory <host-inventory.json>]. Repeat path, tag and need as required.');
    return;
  }

  const result = planTask(root, {
    routeId: values.route, risk: values.risk, operation: values.operation,
    paths: values.path, tags: values.tag, needs: values.need,
    inventory: values.inventory === undefined ? undefined : readInventory(values.inventory)
  });
  console.log(JSON.stringify(result, null, 2));
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error('Unable to plan task: ' + error.message);
  process.exitCode = 1;
}
