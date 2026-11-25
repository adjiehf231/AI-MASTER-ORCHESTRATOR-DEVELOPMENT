#!/usr/bin/env node
const path = require('node:path');
const fs = require('node:fs');
const { parseArgs } = require('node:util');
const release = require('./lib/updater/release');
const planning = require('./lib/updater/planning');
const storage = require('./lib/updater/storage');
const transaction = require('./lib/updater/transaction');
const report = require('./lib/updater/report');

const commands = new Set(['init-store', 'pack', 'inspect', 'adopt', 'check', 'plan', 'apply', 'auto', 'status', 'recover', 'rollback']);
function help() {
  console.log(`Preservation-first orchestrator updater

  init-store --workspace <Git-root> --store <private-directory-outside-project>
  pack --source <publisher-source> --out <new-directory> --key <Ed25519-private-key> --revision <full-digest>
  inspect --workspace <Git-root> --store <private-directory> [--install-path ai-orchestrator]
  adopt|plan|check --workspace <Git-root> --store <private-directory> --release <signed-directory> --trust <external-public-trust-json>
  apply --workspace <Git-root> --store <private-directory> --plan <private-plan-json> --trust <external-public-trust-json> --quiescent
  auto --workspace <Git-root> --store <private-directory> --release <signed-directory> --trust <external-public-trust-json> --quiescent
  status --workspace <Git-root> --store <private-directory> [--transaction <id>]
  recover|rollback --workspace <Git-root> --store <private-directory> --transaction <id> --quiescent

adopt creates a reviewed adoption plan; apply persists it. It does not replace legacy custom content.
plan/check never mutate project files. Plans and reports are stored privately.
auto explicitly opts into a fresh conflict-free signed update of already adopted files.
All project operations accept --install-path (default ai-orchestrator).
Existing root host settings are integration fragments. Native activation remains separately verified.
No release code, lifecycle hooks, database commands, automatic Git changes, or force mode run.`);
}
function required(values, key) {
  if (!values[key]) throw new Error(`--${key} is required`);
  return values[key];
}
function run(args) {
  const [command, ...rest] = args;
  if (!command || command === '--help') { help(); return; }
  if (!commands.has(command)) throw new Error('Unknown updater command');
  const { values } = parseArgs({ args: rest, options: {
    workspace: { type: 'string' }, store: { type: 'string' }, 'install-path': { type: 'string' },
    release: { type: 'string' }, trust: { type: 'string' }, plan: { type: 'string' },
    source: { type: 'string' }, out: { type: 'string' }, key: { type: 'string' }, revision: { type: 'string' },
    transaction: { type: 'string' }, quiescent: { type: 'boolean' }, help: { type: 'boolean' }
  } });
  if (values.help) { help(); return; }
  if (command === 'pack') {
    const result = release.packRelease({ sourceRoot: required(values, 'source'), output: required(values, 'out'), keyFile: required(values, 'key'), revision: required(values, 'revision') });
    console.log(JSON.stringify(result)); return;
  }
  const workspace = storage.regularRoot(required(values, 'workspace'));
  const store = path.resolve(required(values, 'store'));
  const installPath = planning.installRelative(values['install-path']);
  if (command === 'init-store') {
    storage.assertPrivateStore(store, { workspace });
    console.log(JSON.stringify({ status: 'INITIALIZED', workspace, store })); return;
  }
  // Validate privacy before even reading or writing a report/plan in the store.
  storage.assertPrivateStore(store, { workspace, create: false });
  let value;
  try {
    const options = { workspace, store, installPath, releaseRoot: values.release, trustFile: values.trust };
    const applySelectedPlan = loaded => {
      if (values.quiescent !== true) throw new Error('Apply requires --quiescent after pausing writers in the managed scope');
      required(values, 'trust');
      if (loaded.workspace !== workspace || loaded.installPath !== installPath) throw new Error('Plan does not match the explicitly selected project and installation');
      const verify = () => planning.verifyPlan({ plan: loaded, trustFile: values.trust, store });
      verify();
      const trustDigest = release.sha256(release.regularFile(values.trust));
      const guard = () => {
        const context = storage.inspectTarget(workspace, `${installPath}/PROJECT_CONTEXT.md`);
        if (!context.stat || release.sha256(fs.readFileSync(context.target)) !== loaded.contextDigest
          || release.sha256(release.regularFile(values.trust)) !== trustDigest) throw new Error('Project context or external trust changed during apply');
      };
      release.cacheRelease({ releaseRoot: loaded.release.root, trustFile: values.trust, workspace, store });
      const result = transaction.applyTransaction({ workspace, store, installPath, operations: loaded.operations,
        expectedGit: loaded.expectedGit, receipt: loaded.receipt, verify, guard, quiescent: values.quiescent });
      return { ...result, workspace, installPath, operations: loaded.operations, noOp: loaded.status === 'NOOP', activationStatus: loaded.activationStatus };
    };
    if (command === 'inspect') {
      value = planning.inspectInstallation(options);
      if (value.inventory) value.inventoryPath = report.writeInventory(store, value.inventory);
    }
    if (['adopt', 'plan', 'check', 'auto'].includes(command)) {
      required(values, 'release'); required(values, 'trust');
      const plan = command === 'adopt' ? planning.planAdoption(options) : planning.planUpdate(options);
      const planPath = report.writePlan(store, values.out, plan);
      value = command === 'auto' && plan.status !== 'BLOCKED' ? { ...applySelectedPlan(plan), planPath } : { ...plan, planPath };
    }
    if (command === 'apply') {
      const loaded = storage.readJson(required(values, 'plan'));
      value = applySelectedPlan(loaded);
    }
    if (command === 'status') value = { ...transaction.statusTransaction({ workspace, store, installPath, transactionId: values.transaction }), workspace, installPath };
    if (command === 'recover' || command === 'rollback') {
      const operation = command === 'recover' ? transaction.recoverTransaction : transaction.rollbackTransaction;
      value = { ...operation({ workspace, store, installPath, transactionId: required(values, 'transaction'), quiescent: values.quiescent }), workspace, installPath };
    }
    const reports = report.saveReport(store, command, value);
    console.log(JSON.stringify({ ...report.summarize(value), planPath: value.planPath, reports }));
    if (value.status === 'BLOCKED') process.exitCode = 2;
  } catch (error) {
    const failure = { status: 'FAIL', workspace, installPath, error: report.safeMessage(error.message), transactionId: error.transactionId, recoveryState: error.recoveryState,
      recoveryFailure: error.recoveryFailure ? report.safeMessage(error.recoveryFailure) : undefined, journalError: error.journalError ? report.safeMessage(error.journalError) : undefined };
    let reports;
    try { reports = report.saveReport(store, command, failure); }
    catch (reportError) { failure.reportError = report.safeMessage(reportError.message); }
    console.error(JSON.stringify({ ...failure, reports })); process.exitCode = 1;
  }
}
if (require.main === module) {
  try { run(process.argv.slice(2)); }
  catch (error) { console.error(JSON.stringify({ status: 'FAIL', error: report.safeMessage(error.message) })); process.exitCode = 1; }
}
module.exports = { run };
