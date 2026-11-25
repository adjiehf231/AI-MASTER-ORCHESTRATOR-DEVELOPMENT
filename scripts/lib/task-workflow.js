const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { applyFilePlan, inspectFile, withFileLock } = require('./file-plan');

const taskDirectory = '.orchestrator/tasks';
const checkConfig = 'orchestrator-checks.json';
const orchestratorRoot = path.resolve(__dirname, '..', '..');
const taskIdPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const checkIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const itemStates = new Set(['PENDING', 'IN_PROGRESS', 'DONE', 'BLOCKED']);
const runtimeVariables = ['PATH', 'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT', 'TEMP', 'TMP', 'TMPDIR'];
const credentialText = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:Bearer\s+\S+|gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-(?:proj-)?[A-Za-z0-9_-]{12,})/i;
const builtInChecks = {
  test: 'scripts/qa-unit-offline.cjs',
  t1: 'scripts/qa-unit-offline.cjs',
  gates: 'scripts/verify-gates.js',
  audit: 'scripts/audit-integrity.js',
  'adapter-parity': 'scripts/sync-adapters.js'
};

function textField(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2000
    || /[\x00-\x1f\x7f]/.test(value) || credentialText.test(value)) {
    throw new Error(label + ' must be a nonempty single line of at most 2000 characters');
  }
  return value.trim();
}

function checkId(value) {
  if (typeof value !== 'string' || !checkIdPattern.test(value)) throw new Error('Expected a kebab-case check ID');
  return value;
}

function safeEnvironment() {
  const env = { NODE_ENV: 'test' };
  for (const name of runtimeVariables) {
    if (process.env[name] !== undefined) env[name] = process.env[name];
  }
  return env;
}

function git(root, args) {
  const result = spawnSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', ...args], {
    cwd: root,
    env: safeEnvironment(),
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 30_000,
    windowsHide: true
  });
  if (result.error || result.status !== 0) throw new Error('Cannot read Git workspace using git ' + args[0]);
  return result.stdout;
}

function resolveWorkspace(directory) {
  const root = fs.realpathSync.native(directory);
  const gitRoot = fs.realpathSync.native(git(root, ['rev-parse', '--show-toplevel']).trim());
  if (path.relative(root, gitRoot)) throw new Error('--workspace must name the Git workspace root');
  return root;
}

function isInternal(filename) {
  return filename === '.orchestrator' || filename.startsWith('.orchestrator/');
}

function hashFile(hash, filename) {
  const fd = fs.openSync(filename, 'r');
  try {
    const buffer = Buffer.alloc(64 * 1024);
    let count;
    while ((count = fs.readSync(fd, buffer, 0, buffer.length, null)) !== 0) hash.update(buffer.subarray(0, count));
  } finally {
    fs.closeSync(fd);
  }
}

function snapshot(root) {
  const head = git(root, ['rev-parse', '--verify', 'HEAD']).trim();
  const staged = git(root, ['diff', '--cached', '--raw', '-z', '--no-renames', '--no-ext-diff', 'HEAD',
    '--', '.', ':(exclude).orchestrator', ':(exclude).orchestrator/**']);
  const paths = git(root, ['diff', '--name-only', '-z', '--no-renames', '--no-ext-diff', 'HEAD']).split('\0')
    .concat(git(root, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0'));
  const hash = createHash('sha256').update(head + '\0').update(staged);
  const files = [...new Set(paths.filter(name => name && !isInternal(name)))].sort();
  for (const name of files) {
    const { target, stats } = inspectFile(root, name);
    const content = createHash('sha256');
    if (stats) hashFile(content, target);
    hash.update(JSON.stringify([name, stats ? stats.mode & 0o111 : null, content.digest('hex')]));
  }
  return { head, fingerprint: hash.digest('hex') };
}

function sameSnapshot(first, second) {
  return first?.head === second?.head && first?.fingerprint === second?.fingerprint;
}

function taskFile(id, extension) {
  if (typeof id !== 'string' || !taskIdPattern.test(id)) throw new Error('Expected a valid task ID');
  return taskDirectory + '/' + id.toLowerCase() + '.' + extension;
}

function loadTask(root, id) {
  const relative = taskFile(id, 'json');
  const { target, stats } = inspectFile(root, relative);
  if (!stats) throw new Error('Task was not found in this workspace');
  if (stats.size > 2 * 1024 * 1024) throw new Error('Task state exceeds the 2 MiB limit');
  const task = JSON.parse(fs.readFileSync(target, 'utf8'));
  if (task.version !== 1 || task.id !== id.toLowerCase() || !Array.isArray(task.items) || !Array.isArray(task.decisions)) {
    throw new Error('Invalid task state in ' + relative);
  }
  textField(task.title, 'Stored title');
  textField(task.scope, 'Stored scope');
  if (!Number.isSafeInteger(task.scopeVersion) || task.scopeVersion < 1 || task.items.length === 0) {
    throw new Error('Invalid scope or TODO state in ' + relative);
  }
  for (const [index, item] of task.items.entries()) {
    if (item.id !== index + 1 || !itemStates.has(item.status) || !Array.isArray(item.evidence)
      || !Array.isArray(item.checks) || item.checks.some(check => !checkIdPattern.test(check))) {
      throw new Error('Invalid TODO item in ' + relative);
    }
    textField(item.outcome, 'Stored TODO');
    textField(item.verification, 'Stored verification');
    textField(item.owner, 'Stored owner');
  }
  return task;
}

function addItem(task, options) {
  const item = {
    id: task.items.length + 1,
    outcome: textField(options.todo, 'TODO outcome'),
    verification: textField(options.verification, 'Verification criterion'),
    owner: textField(options.owner ?? 'orchestrator', 'Owner'),
    status: 'PENDING',
    checks: [...new Set((options.check ?? []).map(checkId))],
    evidence: []
  };
  task.items.push(item);
  return item;
}

function createTask(options, revision) {
  const task = {
    version: 1,
    id: randomUUID(),
    title: textField(options.title, 'Title'),
    scope: textField(options.scope, 'Scope'),
    createdAt: new Date().toISOString(),
    baseline: revision,
    observed: revision,
    scopeVersion: 1,
    items: [],
    decisions: []
  };
  addItem(task, options);
  return task;
}

function getItem(task, id) {
  if (!/^[1-9][0-9]*$/.test(id ?? '')) throw new Error('Expected --item with a positive TODO item number');
  const item = task.items.find(entry => entry.id === Number(id));
  if (!item) throw new Error('Unknown TODO item ' + id);
  return item;
}

function currentEvidence(task, item) {
  return item.evidence.filter(entry => entry.scopeVersion === task.scopeVersion
    && sameSnapshot(entry.revision, task.observed));
}

function hasCompletionEvidence(task, item) {
  const current = currentEvidence(task, item);
  const latest = new Map();
  for (const entry of current) {
    if (entry.check) latest.set(entry.check, entry);
  }
  if ([...latest.values()].some(entry => entry.status !== 'PASS')) return false;
  if (item.checks.length > 0) {
    return item.checks.every(check => {
      const entry = latest.get(check);
      return entry?.kind === 'execution' && entry.status === 'PASS';
    });
  }
  return latest.size > 0 || current.some(entry => entry.kind === 'artifact');
}

function reopenInvalidItems(task, reason) {
  for (const item of task.items) {
    if (item.status !== 'DONE' || hasCompletionEvidence(task, item)) continue;
    item.status = 'IN_PROGRESS';
    item.reason = reason;
  }
}

function refreshTask(task, revision) {
  if (!sameSnapshot(task.observed, revision)) {
    task.observed = revision;
    reopenInvalidItems(task, 'Git workspace changed. Recheck this item at the new snapshot.');
  }
  return task;
}

function updateTask(task, options) {
  if (options.scope !== undefined) {
    const scope = textField(options.scope, 'Scope');
    if (scope !== task.scope) {
      task.scope = scope;
      task.scopeVersion++;
      reopenInvalidItems(task, 'Task scope changed. Recheck this item against the new scope.');
    }
  }
  if (options.item === undefined) return;
  const item = getItem(task, options.item);
  if (options.owner !== undefined) item.owner = textField(options.owner, 'Owner');
  if (options.verification !== undefined) {
    const verification = textField(options.verification, 'Verification criterion');
    if (verification !== item.verification) {
      item.verification = verification;
      task.scopeVersion++;
      reopenInvalidItems(task, 'Verification criterion changed. Recheck against the current criteria.');
    }
  }
  if (options.status === undefined) return;
  if (!itemStates.has(options.status)) throw new Error('Unknown TODO status ' + options.status);
  if (options.status === 'DONE' && !hasCompletionEvidence(task, item)) {
    throw new Error('Current execution or reviewed artifact evidence is required before marking this item DONE');
  }
  if (options.status === 'BLOCKED') item.reason = textField(options.reason, 'Blocker reason');
  else if (options.reason !== undefined) item.reason = textField(options.reason, 'Reason');
  else delete item.reason;
  item.status = options.status;
}

function artifactDigest(root, filename) {
  const relative = textField(filename, 'Artifact path').replace(/\\/g, '/');
  const parts = relative.split('/');
  if (parts.some(part => /^(?:\.git|\.orchestrator|\.env(?:\..*)?)$/i.test(part) || /\.(?:pem|key)$/i.test(part))) {
    throw new Error('Artifact path is reserved or may contain secrets');
  }
  const { target, stats } = inspectFile(root, relative);
  if (!stats) throw new Error('Artifact does not exist in this workspace');
  const hash = createHash('sha256');
  hashFile(hash, target);
  return { path: relative, sha256: hash.digest('hex') };
}

function recordDecision(root, task, options) {
  const decision = {
    question: textField(options.question, 'Decision question'),
    choice: textField(options.choice, 'Decision'),
    reason: textField(options.reason, 'Decision rationale'),
    alternatives: (options.alternative ?? []).map(value => textField(value, 'Alternative')),
    dissent: (options.dissent ?? []).map(value => textField(value, 'Dissent')),
    artifacts: (options.artifact ?? []).map(filename => artifactDigest(root, filename)),
    owner: textField(options.owner ?? 'orchestrator', 'Decision owner'),
    revision: task.observed,
    scopeVersion: task.scopeVersion,
    at: new Date().toISOString()
  };
  task.decisions.push(decision);
  return decision;
}

function addEvidence(task, item, entry) {
  const evidence = {
    at: new Date().toISOString(),
    revision: task.observed,
    scopeVersion: task.scopeVersion,
    ...entry
  };
  item.evidence.push(evidence);
  reopenInvalidItems(task, 'Current verification is no longer sufficient.');
  return evidence;
}

function recordNote(task, options) {
  if (!['FAIL', 'NOT_RUN', 'BLOCKED'].includes(options.status)) {
    throw new Error('Notes accept FAIL, NOT_RUN, or BLOCKED. PASS comes from an executed check.');
  }
  const item = getItem(task, options.item);
  return addEvidence(task, item, {
    kind: 'note',
    check: checkId(options.check?.[0]),
    status: options.status,
    reason: textField(options.reason, 'Verification note')
  });
}

function recordArtifact(root, task, options) {
  const item = getItem(task, options.item);
  return addEvidence(task, item, {
    kind: 'artifact',
    artifact: artifactDigest(root, options.artifact?.[0]),
    reason: textField(options.reason, 'Review rationale')
  });
}

function registeredCheck(root, id) {
  if (root === orchestratorRoot && Object.hasOwn(builtInChecks, id)) {
    const args = id === 'adapter-parity' ? ['--check'] : [];
    return { script: builtInChecks[id], args, timeoutMs: id === 'adapter-parity' ? 60_000 : 420_000 };
  }
  const { target, stats } = inspectFile(root, checkConfig);
  if (!stats) return undefined;
  if (stats.size > 64 * 1024) throw new Error(checkConfig + ' exceeds the 64 KiB limit');
  const config = JSON.parse(fs.readFileSync(target, 'utf8'));
  if (!config.checks || Array.isArray(config.checks) || typeof config.checks !== 'object') {
    throw new Error(checkConfig + ' must contain a checks mapping');
  }
  if (!Object.hasOwn(config.checks, id)) return undefined;
  const descriptor = config.checks[id];
  const script = textField(descriptor?.script, 'Registered check script');
  if (!/\.(?:cjs|mjs|js)$/.test(script) || isInternal(script)) throw new Error('Expected a workspace JavaScript check script');
  const args = descriptor.args ?? [];
  if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string' || /[\x00-\x1f\x7f]/.test(arg))) {
    throw new Error('Registered check args must be an array of safe argument strings');
  }
  const timeoutMs = descriptor.timeoutMs ?? 30_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) {
    throw new Error('Registered check timeoutMs must be an integer from 1 to 300000');
  }
  return { script, args, timeoutMs };
}

function executeCheck(root, task, options) {
  const item = getItem(task, options.item);
  const id = checkId(options.check?.[0]);
  const check = registeredCheck(root, id);
  if (!check) return addEvidence(task, item, { kind: 'note', check: id, status: 'BLOCKED', reason: 'Check is not registered for this workspace.' });

  const { target, stats } = inspectFile(root, check.script);
  if (!stats) return addEvidence(task, item, { kind: 'note', check: id, status: 'BLOCKED', reason: 'Registered check script is missing.' });

  const start = process.hrtime.bigint();
  const revision = task.observed;
  const result = spawnSync(process.execPath, [target, ...check.args], {
    cwd: root,
    env: safeEnvironment(),
    shell: false,
    stdio: 'inherit',
    timeout: check.timeoutMs,
    windowsHide: true
  });
  const durationMs = Number((process.hrtime.bigint() - start) / 1_000_000n);
  let after;
  let reason;
  try {
    after = snapshot(root);
  } catch {
    reason = 'Unable to capture the Git workspace after executing the check.';
  }
  if (after) {
    refreshTask(task, after);
    if (!sameSnapshot(revision, after)) reason = 'The Git workspace changed while the check ran.';
  }
  if (result.error) reason = result.error.code === 'ETIMEDOUT'
    ? 'Check timed out.' : 'Check process could not start or complete.';
  if (result.signal) reason ??= 'Check stopped by ' + result.signal + '.';
  const status = reason || result.status === null ? 'BLOCKED' : result.status === 0 ? 'PASS' : 'FAIL';
  return addEvidence(task, item, {
    kind: 'execution',
    check: id,
    revision,
    status,
    command: { executable: 'node', script: check.script, argumentCount: check.args.length },
    exitCode: result.status,
    durationMs,
    ...(reason ? { reason } : {})
  });
}

function markdown(text) {
  return String(text).replace(/[\\`*_[\]<>|&]/g, '\\$&');
}

function reportOutcome(task) {
  if (task.items.every(item => item.status === 'DONE' && hasCompletionEvidence(task, item))) return 'DONE';
  return task.items.some(item => item.status === 'BLOCKED') ? 'BLOCKED' : 'INCOMPLETE';
}

function renderReport(task) {
  const outcome = reportOutcome(task);
  const lines = [
    '# Report ' + task.id + ' — ' + markdown(task.title),
    '',
    '- Status ' + outcome,
    '- Scope ' + markdown(task.scope),
    '- Git HEAD `' + task.observed.head + '`',
    '- Workspace fingerprint `' + task.observed.fingerprint + '`',
    '- Scope version ' + task.scopeVersion,
    '',
    '## TODO and verification',
    ''
  ];
  for (const item of task.items) {
    lines.push('### ' + item.id + '. ' + markdown(item.outcome), '',
      '- ' + item.status + ' · ' + markdown(item.owner),
      '- Criterion ' + markdown(item.verification));
    if (item.reason) lines.push('- ' + markdown(item.reason));
    const current = currentEvidence(task, item);
    if (current.length === 0) lines.push('- No recorded evidence for current scope and snapshot.');
    for (const entry of item.evidence) {
      const freshness = current.includes(entry) ? '' : ' · superseded snapshot or scope';
      if (entry.kind === 'artifact') {
        lines.push('- Reviewed artifact ' + markdown(entry.artifact.path) + ' · SHA-256 `' + entry.artifact.sha256
          + '` · ' + markdown(entry.reason) + freshness);
        continue;
      }
      const start = '- ' + entry.status + ' · `' + entry.check + '` · ' + entry.kind;
      const execution = entry.kind === 'execution'
        ? ' · node ' + markdown(entry.command.script) + ' · exit ' + (entry.exitCode ?? 'unavailable') + ' · ' + entry.durationMs + ' ms'
        : '';
      lines.push(start + execution + (entry.reason ? ' · ' + markdown(entry.reason) : '') + freshness);
    }
    lines.push('');
  }

  lines.push('## Decisions', '');
  if (task.decisions.length === 0) lines.push('No material decision recorded.', '');
  for (const decision of task.decisions) {
    lines.push('### ' + markdown(decision.question), '',
      '- Choice ' + markdown(decision.choice),
      '- Reason ' + markdown(decision.reason),
      '- Owner ' + markdown(decision.owner),
      '- Source revision `' + decision.revision.head + '` · scope version ' + decision.scopeVersion);
    for (const alternative of decision.alternatives) lines.push('- Alternative ' + markdown(alternative));
    for (const dissent of decision.dissent) lines.push('- Dissent ' + markdown(dissent));
    for (const artifact of decision.artifacts) {
      lines.push('- Reviewed artifact ' + markdown(artifact.path) + ' · `' + artifact.sha256 + '`');
    }
    lines.push('');
  }
  return lines.join('\n');
}

function entrySnapshot(task) {
  const hashable = { ...task };
  delete hashable.lastReport;
  return createHash('sha256').update(JSON.stringify(hashable)).digest('hex');
}

function taskView(task) {
  const { lastReport, ...details } = task;
  return {
    ...details,
    lastReport: lastReport
      ? { ...lastReport, current: lastReport.stateFingerprint === entrySnapshot(task) }
      : null
  };
}

function updateState(root, execute) {
  inspectFile(root, taskDirectory + '/.sentinel');
  const directory = path.join(root, taskDirectory);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  return withFileLock(directory, () => execute(directory));
}

function storeTask(directory, task, report) {
  const files = new Map([[task.id + '.json', {
    bytes: JSON.stringify(task, null, 2) + '\n',
    mode: 0o600
  }]]);
  if (report !== undefined) files.set(task.id + '.md', { bytes: report, mode: 0o600 });
  applyFilePlan(directory, { files });
}

function completeReport(task) {
  const report = renderReport(task);
  task.lastReport = {
    outcome: reportOutcome(task),
    path: taskFile(task.id, 'md'),
    at: new Date().toISOString(),
    stateFingerprint: entrySnapshot(task)
  };
  return report;
}

module.exports = {
  addItem,
  completeReport,
  createTask,
  executeCheck,
  loadTask,
  recordArtifact,
  recordDecision,
  recordNote,
  refreshTask,
  resolveWorkspace,
  snapshot,
  storeTask,
  taskView,
  updateState,
  updateTask
};
