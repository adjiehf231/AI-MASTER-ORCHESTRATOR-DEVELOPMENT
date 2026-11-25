const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const storage = require('./storage');

function safeMessage(value) {
  return String(value).replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/(?:Bearer\s+\S+|gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-(?:proj-)?[A-Za-z0-9_-]{12,})/g, '[REDACTED]').slice(0, 2048);
}
function markdown(value) { return safeMessage(value).replace(/[\\`*_{}\[\]<>]/g, '\\$&'); }
function changePreview(before, after) {
  if (before.length + after.length > 32768 || before.includes(0) || after.includes(0)) return ['Byte change; inspect the complete private plan and backup.'];
  let left, right;
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
    left = decoder.decode(before).split('\n'); right = decoder.decode(after).split('\n');
  } catch { return ['Binary/unsupported text; inspect the private byte artifacts.']; }
  let start = 0, suffix = 0;
  while (start < left.length && start < right.length && left[start] === right[start]) start++;
  while (suffix < left.length - start && suffix < right.length - start && left.at(-suffix - 1) === right.at(-suffix - 1)) suffix++;
  const removed = left.slice(start, left.length - suffix), added = right.slice(start, right.length - suffix);
  const lines = [`Lines from ${start + 1}; ${removed.length} removed, ${added.length} added.`];
  lines.push(...removed.slice(0, 40).map(line => `REMOVE: ${line}`), ...added.slice(0, 40).map(line => `ADD: ${line}`));
  if (removed.length > 40 || added.length > 40) lines.push('Preview truncated; full bytes remain in the private plan and backup.');
  return lines;
}
function summarize(value) {
  const result = {};
  for (const key of ['schemaVersion', 'kind', 'status', 'state', 'digest', 'workspace', 'installPath', 'installationId', 'transactionId', 'activationStatus', 'changedFiles', 'backupDirectory', 'release', 'error', 'recoveryState', 'recoveryFailure', 'journalError', 'noOp']) {
    if (value[key] !== undefined) result[key] = value[key];
  }
  for (const key of ['blockers', 'preserved', 'excluded', 'fragments']) if (Array.isArray(value[key])) {
    result[key] = value[key].map(item => ({ path: item.path, code: item.code, reason: safeMessage(item.reason || item.message || '') }));
  }
  if (Array.isArray(value.operations)) result.operations = value.operations.map(op => ({ path: op.path, action: op.after ? 'write' : 'delete', beforeSha256: op.before?.sha256 ?? null, afterSha256: op.after ? storage.sha256(Buffer.from(op.after.dataBase64, 'base64')) : null }));
  if (Array.isArray(value.transactions)) result.transactions = value.transactions;
  if (Array.isArray(value.entries)) result.operations = value.entries.map(entry => ({ path: entry.path, action: entry.phase, beforeSha256: entry.before?.sha256, afterSha256: entry.after?.sha256 }));
  if (value.adopted !== undefined) result.adopted = value.adopted;
  if (value.receipt) result.installedRelease = value.receipt.release;
  if (value.revision) result.revision = value.revision;
  if (value.keyId) result.keyId = value.keyId;
  if (value.inventory) result.inventory = { roots: value.inventory.roots, counts: value.inventory.counts, coverage: value.inventory.coverage };
  if (value.inventoryPath) result.inventoryPath = value.inventoryPath;
  if (value.receipt?.ownership) result.ownedPathCount = Object.keys(value.receipt.ownership).length;
  return result;
}
function saveReport(store, command, value) {
  const directory = storage.privateSubdirectory(store, 'reports');
  const id = `${command}-${crypto.randomUUID()}`;
  const summary = summarize(value);
  const jsonPath = path.join(directory, `${id}.json`);
  storage.writeJson(jsonPath, summary);
  const lines = [`# Orchestrator updater: ${command}`, '', `- Status: ${summary.state || summary.status || (summary.error ? 'FAIL' : 'CHECKED')}`, `- Workspace: ${summary.workspace || 'not supplied'}`];
  for (const key of ['digest', 'transactionId', 'activationStatus', 'backupDirectory', 'error', 'recoveryState']) if (summary[key] !== undefined) lines.push(`- ${key}: ${safeMessage(summary[key])}`);
  for (const key of ['operations', 'blockers', 'preserved', 'excluded', 'fragments']) if (summary[key]?.length) {
    lines.push('', `## ${key}`, '');
    for (const item of summary[key]) lines.push(`- ${markdown(item.path || item.code || 'installation')}: ${markdown(item.reason || item.action || item.code || '')}`);
  }
  if (value.receipt?.ownership) {
    lines.push('', '## Baseline ownership claims', '');
    for (const filename of Object.keys(value.receipt.ownership).sort()) lines.push(`- ${markdown(filename)}`);
  }
  if (value.operations?.length) {
    lines.push('', '## Private change previews', '', 'Summaries are bounded; exact bytes remain in the private plan and transaction backup.', '');
    for (const [index, op] of value.operations.entries()) {
      lines.push(`### ${markdown(op.path)}`, '');
      let before = Buffer.alloc(0);
      try {
        if (op.before.exists) {
          if (value.backupDirectory) before = fs.readFileSync(storage.inspectTarget(value.backupDirectory, `before-${index}.bin`).target);
          else before = fs.readFileSync(storage.inspectTarget(value.workspace, op.path).target);
          if (storage.sha256(before) !== op.before.sha256) throw new Error('Preimage changed');
        }
        const after = op.after ? Buffer.from(op.after.dataBase64, 'base64') : Buffer.alloc(0);
        for (const line of changePreview(before, after)) lines.push(`- ${markdown(line)}`);
      } catch { lines.push('- Preview unavailable; use the recorded private preimage and candidate artifacts.'); }
      lines.push('');
    }
  }
  const markdownPath = path.join(directory, `${id}.md`);
  storage.writeDurable(markdownPath, Buffer.from(lines.join('\n') + '\n'), true);
  return { jsonPath, markdownPath };
}
function writePlan(store, output, plan) {
  const root = storage.regularRoot(store);
  const directory = storage.privateSubdirectory(root, 'plans');
  const target = output ? path.resolve(output) : path.join(directory, `${plan.digest}.json`);
  if (!storage.within(directory, target) || path.dirname(target) !== directory || !/^[A-Za-z0-9_.-]+\.json$/.test(path.basename(target))) throw new Error('Plan output must be a JSON file directly inside the private store plans directory');
  if (fs.existsSync(target)) {
    if (storage.canonical(storage.readJson(target)) !== storage.canonical(plan)) throw new Error('Plan output already contains different data');
  } else storage.writeDurable(target, Buffer.from(storage.canonical(plan) + '\n'), true);
  return target;
}
function writeInventory(store, inventory) {
  const directory = storage.privateSubdirectory(store, 'inventories');
  const file = path.join(directory, `${crypto.randomUUID()}.json`);
  storage.writeDurable(file, Buffer.from(storage.canonical(inventory) + '\n'), true);
  return file;
}
module.exports = { safeMessage, summarize, saveReport, writePlan, writeInventory, changePreview };
