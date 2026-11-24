#!/usr/bin/env node
const path = require('node:path');
const { parseArgs } = require('node:util');
const workflow = require('./lib/task-workflow');

const commands = new Set(['start', 'show', 'resume', 'add', 'update', 'decide', 'check', 'note', 'artifact', 'report']);
const optionSchema = {
  workspace: { type: 'string' },
  id: { type: 'string' },
  title: { type: 'string' },
  scope: { type: 'string' },
  todo: { type: 'string' },
  verification: { type: 'string' },
  owner: { type: 'string' },
  item: { type: 'string' },
  status: { type: 'string' },
  reason: { type: 'string' },
  check: { type: 'string', multiple: true },
  question: { type: 'string' },
  choice: { type: 'string' },
  alternative: { type: 'string', multiple: true },
  dissent: { type: 'string', multiple: true },
  artifact: { type: 'string', multiple: true },
  help: { type: 'boolean' }
};

function help() {
  console.log(`Task workflow

  start --title <title> --scope <scope> --todo <outcome> --verification <criterion> [--owner <agent>] [--check <id>]
  show|resume --id <task-id>
  add --id <task-id> --todo <outcome> --verification <criterion> [--owner <agent>] [--check <id>]
  update --id <task-id> [--scope <scope>] [--item <number> --status PENDING|IN_PROGRESS|DONE|BLOCKED --reason <reason>]
  decide --id <task-id> --question <question> --choice <choice> --reason <reason> [--alternative <choice>] [--dissent <objection>] [--artifact <path>]
  check --id <task-id> --item <number> --check <registered-id>
  note --id <task-id> --item <number> --check <id> --status FAIL|NOT_RUN|BLOCKED --reason <reason>
  artifact --id <task-id> --item <number> --artifact <path> --reason <review>
  report --id <task-id>

Every command accepts --workspace <Git-workspace-root>. Check, artifact, alternative, and dissent options are repeatable.
Task state and reports are stored in .orchestrator/tasks/. Check output appears in the terminal and is not saved in task state.`);
}

function main(args) {
  const [command, ...rest] = args;
  if (!command || command === '--help') {
    help();
    return;
  }
  if (!commands.has(command)) throw new Error('Unknown task command: ' + command);
  const { values } = parseArgs({ args: rest, options: optionSchema });
  if (values.help) {
    help();
    return;
  }
  if (['check', 'note'].includes(command) && values.check?.length !== 1) {
    throw new Error(command + ' requires exactly one --check.');
  }
  if (command === 'artifact' && values.artifact?.length !== 1) {
    throw new Error('artifact requires exactly one --artifact.');
  }
  const root = workflow.resolveWorkspace(values.workspace ?? path.resolve(__dirname, '..'));
  let output;
  let checkFailed = false;
  workflow.updateState(root, directory => {
    const revision = workflow.snapshot(root);
    const task = command === 'start'
      ? workflow.createTask(values, revision)
      : workflow.refreshTask(workflow.loadTask(root, values.id), revision);
    let report;
    if (command === 'add') workflow.addItem(task, values);
    if (command === 'update') workflow.updateTask(task, values);
    if (command === 'decide') workflow.recordDecision(root, task, values);
    if (command === 'check') {
      checkFailed = workflow.executeCheck(root, task, values).status !== 'PASS';
    }
    if (command === 'note') workflow.recordNote(task, values);
    if (command === 'artifact') workflow.recordArtifact(root, task, values);
    if (command === 'report') report = workflow.completeReport(task);
    workflow.storeTask(directory, task, report);
    output = report ?? JSON.stringify(workflow.taskView(task), null, 2);
  });
  console.log(output);
  if (checkFailed) process.exitCode = 1;
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error('Task workflow failed: ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = { main };
