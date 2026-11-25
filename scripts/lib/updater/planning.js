const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { inspectFile } = require('../file-plan');
const { LIMITS, allowedSourcePath, canonical, ensureDistinct, isCredentialName, regularRoot, sha256, validatePath, verifyRelease } = require('./release');

const POLICY_VERSION = 1;
const SHARED = new Set(['AGENTS.md', 'CLAUDE.md', 'CONVENTIONS.md', '.cursorrules', '.windsurfrules', '.clinerules', '.opencoderules', '.aider.conf.yml', '.mcp.json', 'opencode.json', '.gitignore']);
const NATIVE = ['.agents/skills/', '.claude/skills/', '.claude/agents/', '.codex/agents/', '.opencode/agents/'];

function installRelative(value = 'ai-orchestrator') {
  validatePath(value);
  if (value.split('/').at(-1) !== 'ai-orchestrator') throw new Error('The installation must be a descendant directory named ai-orchestrator');
  if (value.split('/').some(part => part.startsWith('.'))) throw new Error('Installation cannot use a hidden namespace');
  return value;
}
function isProtected(relative) {
  const parts = relative.split('/');
  return parts.some(part => /^(?:\.git|\.orchestrator|node_modules|memory|tasks?|reports?|handoffs?|adr|uploads?)$/i.test(part)
    || isCredentialName(part) || /^(?:PROJECT_CONTEXT\.md|.*\.(?:sqlite|db))$/i.test(part));
}
function allowedTarget(relative, installPath) {
  validatePath(relative);
  if (isProtected(relative)) return false;
  if (relative.startsWith(`${installPath}/`)) return allowedSourcePath(relative.slice(installPath.length + 1)) || relative.startsWith(`${installPath}/adapters/`);
  return NATIVE.some(prefix => relative.startsWith(prefix));
}
function gitEnvironment() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^GIT_/i.test(key)) delete env[key];
  env.GIT_CONFIG_NOSYSTEM = '1';
  env.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : '/dev/null';
  env.GIT_OPTIONAL_LOCKS = '0';
  env.GIT_NO_REPLACE_OBJECTS = '1';
  env.GIT_TERMINAL_PROMPT = '0';
  return env;
}
function git(workspace, args, { allowFailure = false } = {}) {
  const result = spawnSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=', '-c', 'diff.external=', '-C', workspace, ...args], {
    env: gitEnvironment(), maxBuffer: 16 * 1024 * 1024, timeout: 15000, windowsHide: true
  });
  if (result.error || (!allowFailure && result.status !== 0)) throw new Error(`Git inspection failed: ${result.error?.message || result.stderr.toString('utf8').trim()}`);
  return result.status === 0 ? result.stdout : null;
}
function snapshotGit(workspace) {
  const root = regularRoot(workspace);
  const top = git(root, ['rev-parse', '--show-toplevel']).toString('utf8').trim();
  if (regularRoot(top) !== root) throw new Error('Workspace must be the exact Git project root');
  // Status can invoke clean/process filters while hashing tracked worktree files.
  // Config inspection is passive; unsupported filter drivers stop before status.
  if (git(root, ['config', '--null', '--get-regexp', '^filter\\.'], { allowFailure: true })?.length) {
    throw new Error('Git content filters are unsupported for passive updater inspection');
  }
  // ls-files reads index names. Stop before status can hash sensitive tracked files.
  const tracked = git(root, ['ls-files', '--cached', '--full-name', '-z']).toString('utf8').split('\0');
  if (tracked.some(relative => relative.split('/').some(isCredentialName))) throw new Error('Tracked credential filenames are unsupported for passive updater inspection');
  const head = git(root, ['rev-parse', '--verify', 'HEAD'], { allowFailure: true });
  const indexPath = git(root, ['rev-parse', '--git-path', 'index']).toString('utf8').trim();
  const index = path.resolve(root, indexPath);
  const indexStats = fs.lstatSync(index, { throwIfNoEntry: false });
  if (indexStats && (!indexStats.isFile() || indexStats.isSymbolicLink())) throw new Error('Unsupported Git index type');
  const status = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignored=no']);
  return { root, head: head ? head.toString('utf8').trim() : null, indexSha256: indexStats ? sha256(fs.readFileSync(index)) : null, statusSha256: sha256(status) };
}
function rawSnapshot(workspace, relative) {
  const { target, stats } = inspectFile(workspace, relative);
  if (!stats) return { exists: false, type: 'absent' };
  if (stats.nlink !== 1 || stats.size > LIMITS.fileBytes) throw new Error(`Hard-linked or oversized target is unsupported: ${relative}`);
  return { exists: true, type: 'file', sha256: sha256(fs.readFileSync(target)), mode: stats.mode & 0o777 };
}
function targetDirty(workspace, relative) {
  const output = git(workspace, ['status', '--porcelain=v1', '-z', '--untracked-files=no', '--', relative]);
  return output.length !== 0;
}
function readContext(workspace, installPath) {
  const relative = `${installPath}/PROJECT_CONTEXT.md`;
  const { target, stats } = inspectFile(workspace, relative);
  if (!stats) throw new Error('An existing project-owned PROJECT_CONTEXT.md is required');
  if (stats.size > 1024 * 1024) throw new Error('Project context exceeds supported size');
  return fs.readFileSync(target);
}
function inputs(options) {
  const workspace = regularRoot(options.workspace);
  const installPath = installRelative(options.installPath);
  // Validate each installation component even if no candidate would write it.
  inspectFile(workspace, `${installPath}/PROJECT_CONTEXT.md`);
  const release = verifyRelease({ releaseRoot: options.releaseRoot, trustFile: options.trustFile, workspace });
  const { assertPrivateStore } = require('./storage');
  assertPrivateStore(options.store, { workspace, sourceRoot: release.releaseRoot, create: false });
  const contextBytes = readContext(workspace, installPath);
  return { workspace, installPath, release, contextBytes,
    trust: release.trust, expectedGit: snapshotGit(workspace) };
}
function desired(release, workspace, installPath, contextBytes) {
  const files = new Map();
  const excluded = [];
  for (const [relative, bytes] of release.files) {
    const target = `${installPath}/${relative}`;
    if (allowedTarget(target, installPath)) files.set(target, bytes);
    else excluded.push({ path: target, reason: 'PROTECTED_PROJECT_PATH' });
  }
  const { renderRelease } = require('./render');
  const rendered = renderRelease(release.sourceRoot, { projectRoot: workspace, installationPath: installPath, contextBytes, sourceFiles: release.files });
  const fragments = (rendered.fragments || []).map(fragment => ({ path: fragment.path, reason: fragment.reason, contentBase64: fragment.bytes ? Buffer.from(fragment.bytes).toString('base64') : undefined }));
  for (const [relative, bytes] of rendered.files) {
    if (allowedTarget(relative, installPath)) files.set(relative, Buffer.from(bytes));
    else {
      excluded.push({ path: relative, reason: SHARED.has(relative) || relative.startsWith('.continue/') ? 'SHARED_CONFIG_REQUIRES_SEPARATE_ADOPTION' : 'PROTECTED_PROJECT_PATH' });
      if (SHARED.has(relative) || relative.startsWith('.continue/')) fragments.push({ path: relative, reason: 'Shared configuration is outside automatic ownership in this version', contentBase64: Buffer.from(bytes).toString('base64') });
    }
  }
  ensureDistinct([...files.keys()]);
  // Shared host settings are proposals only in this version. Their conflicts cannot
  // authorize a write and do not prevent an independent vendor-file update.
  const conflicts = (rendered.conflicts || []).filter(item => !SHARED.has(item.path) && !item.path.startsWith('.continue/'));
  return { files, excluded, fragments, conflicts, contextDigest: sha256(contextBytes) };
}
function publicRelease(release) { return { root: release.releaseRoot, digest: release.digest, revision: release.revision }; }
function seal(plan) { return { ...plan, digest: sha256(Buffer.from(canonical(plan))) }; }
function basePlan(kind, options, current) {
  const { installationId } = require('./storage');
  return {
    schemaVersion: 1, policyVersion: POLICY_VERSION, kind, workspace: current.workspace, installPath: current.installPath,
    installationId: installationId(current.workspace, current.installPath), release: publicRelease(current.release), trust: current.trust, expectedGit: current.expectedGit,
    contextDigest: sha256(current.contextBytes), operations: [], preserved: [], excluded: [], fragments: [], blockers: [],
    status: 'READY', activationStatus: 'PENDING_HOST_RELOAD', store: path.resolve(options.store)
  };
}
function receiptFor(plan, release, contextBytes, ownership) {
  return {
    schemaVersion: 1, policyVersion: POLICY_VERSION, installationId: plan.installationId, workspace: plan.workspace, installPath: plan.installPath,
    release: { digest: release.digest, revision: release.revision, cachedRoot: path.join(plan.store, 'releases', release.digest) },
    contextDigest: sha256(contextBytes), contextBase64: contextBytes.toString('base64'), ownership
  };
}
function finish(plan) {
  plan.operations.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  for (const key of ['preserved', 'excluded', 'fragments', 'blockers']) plan[key].sort((a, b) => `${a.path || ''}:${a.code || a.reason || ''}`.localeCompare(`${b.path || ''}:${b.code || b.reason || ''}`, 'en'));
  if (plan.blockers.length) plan.status = 'BLOCKED';
  else if (!plan.operations.length && plan.kind === 'update') plan.status = 'NOOP';
  if (plan.fragments.length) plan.activationStatus = 'PENDING_HOST_INTEGRATION';
  return seal(plan);
}
function planAdoption(options) {
  const current = inputs(options);
  const { readInstallation } = require('./storage');
  if (readInstallation({ store: options.store, workspace: current.workspace, installPath: current.installPath })) throw new Error('Installation is already adopted');
  const plan = basePlan('adopt', options, current);
  const candidate = desired(current.release, current.workspace, current.installPath, current.contextBytes);
  plan.excluded = candidate.excluded;
  plan.fragments = candidate.fragments;
  plan.blockers = candidate.conflicts.map(conflict => ({ ...conflict, code: conflict.code || 'RENDER_CONFLICT' }));
  const ownership = {};
  for (const [relative, bytes] of [...candidate.files].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    const local = rawSnapshot(current.workspace, relative);
    if (local.exists && local.sha256 === sha256(bytes)) ownership[relative] = { sha256: local.sha256, mode: local.mode };
    else plan.preserved.push({ path: relative, reason: local.exists ? 'UNKNOWN_OR_CUSTOM_CONTENT' : 'NOT_INSTALLED' });
  }
  if (!Object.keys(ownership).length) plan.blockers.push({ code: 'NO_KNOWN_BASELINE', message: 'No installed bytes match the trusted release outputs' });
  if (current.release.manifest.requiredChecks.length) plan.blockers.push({ code: 'EXECUTABLE_CHECKS_UNSUPPORTED', message: 'Required release checks need a capability sandbox' });
  plan.receipt = receiptFor(plan, current.release, current.contextBytes, ownership);
  return finish(plan);
}
function planUpdate(options) {
  const current = inputs(options);
  const { readInstallation, snapshotFile } = require('./storage');
  const receipt = readInstallation({ store: options.store, workspace: current.workspace, installPath: current.installPath });
  const plan = basePlan('update', options, current);
  if (!receipt) {
    plan.blockers.push({ code: 'UNKNOWN_BASELINE', message: 'Adopt a byte-equal trusted baseline before updating' });
    return finish(plan);
  }
  if (receipt.schemaVersion !== 1 || receipt.policyVersion !== POLICY_VERSION || receipt.installationId !== plan.installationId || receipt.workspace !== current.workspace || receipt.installPath !== current.installPath
      || typeof receipt.contextBase64 !== 'string' || receipt.contextBase64.length > 2 * 1024 * 1024 || !receipt.ownership || typeof receipt.ownership !== 'object' || Array.isArray(receipt.ownership)
      || !/^[a-f0-9]{64}$/.test(receipt.release?.digest || '') || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(receipt.release?.revision || '')) throw new Error('Unsupported or mismatched installation receipt');
  const cachedRoot = path.join(plan.store, 'releases', receipt.release?.digest || 'invalid');
  if (receipt.release?.cachedRoot !== cachedRoot) throw new Error('Baseline release must use the private immutable cache');
  const baseline = verifyRelease({ releaseRoot: cachedRoot, trustFile: options.trustFile, workspace: current.workspace });
  if (baseline.digest !== receipt.release.digest || baseline.revision !== receipt.release.revision) throw new Error('Trusted baseline release does not match installation receipt');
  const oldContext = Buffer.from(receipt.contextBase64, 'base64');
  if (oldContext.toString('base64') !== receipt.contextBase64 || sha256(oldContext) !== receipt.contextDigest) throw new Error('Baseline context receipt digest mismatch');
  const old = desired(baseline, current.workspace, current.installPath, oldContext);
  const next = desired(current.release, current.workspace, current.installPath, current.contextBytes);
  plan.baseline = publicRelease(baseline);
  plan.receiptDigest = sha256(Buffer.from(canonical(receipt)));
  plan.excluded = next.excluded;
  plan.fragments = next.fragments;
  plan.blockers = next.conflicts.map(conflict => ({ ...conflict, code: conflict.code || 'RENDER_CONFLICT' }));
  if (old.conflicts.length) plan.blockers.push({ code: 'BASELINE_RENDER_UNSUPPORTED', message: 'Trusted baseline cannot be passively rendered' });
  if (current.release.manifest.requiredChecks.length) plan.blockers.push({ code: 'EXECUTABLE_CHECKS_UNSUPPORTED', message: 'Required release checks need a capability sandbox' });
  const { parseFrontmatter } = require('../frontmatter');
  for (const [name, bytes] of current.release.files) {
    if (!/^agents\/[^/]+\.md$/.test(name)) continue;
    const before = baseline.files.get(name);
    const attributes = parseFrontmatter(bytes.toString('utf8'), name).attributes;
    if (before) {
      const previous = parseFrontmatter(before.toString('utf8'), name).attributes;
      if (canonical(previous.permissions ?? []) !== canonical(attributes.permissions ?? []) || (previous.mode ?? 'subagent') !== (attributes.mode ?? 'subagent')) {
        plan.blockers.push({ path: `${current.installPath}/${name}`, code: 'SECURITY_POLICY_REVIEW_REQUIRED', message: 'Agent permission or role changes require a separate reviewed migration' });
      }
    } else plan.blockers.push({ path: `${current.installPath}/${name}`, code: 'NEW_AGENT_REVIEW_REQUIRED', message: 'New agent authority requires a separate reviewed migration' });
  }
  const ownership = {};
  const paths = new Set([...old.files.keys(), ...next.files.keys(), ...Object.keys(receipt.ownership)]);
  ensureDistinct([...paths]);
  for (const relative of [...paths].sort()) {
    if (!allowedTarget(relative, current.installPath)) throw new Error(`Receipt attempts ownership of a protected path: ${relative}`);
    const baseBytes = old.files.get(relative);
    const newBytes = next.files.get(relative);
    const baseHash = baseBytes && sha256(baseBytes);
    const newHash = newBytes && sha256(newBytes);
    const claim = receipt.ownership[relative];
    const local = rawSnapshot(current.workspace, relative);
    if (claim && (!baseBytes || claim.sha256 !== baseHash)) throw new Error(`Ownership baseline is not a signed release output: ${relative}`);
    if (!claim) {
      if (baseBytes || !newBytes) {
        plan.preserved.push({ path: relative, reason: 'PROJECT_OWNED_UNADOPTED_PATH' });
        if (baseBytes && baseHash !== newHash && local.exists) plan.blockers.push({ path: relative, code: 'UNADOPTED_UPSTREAM_CHANGE', message: 'An upstream change intersects protected project content' });
        continue;
      }
      if (local.exists) {
        plan.blockers.push({ path: relative, code: 'NEW_PATH_COLLISION', message: 'A new release path collides with project-owned content' });
        continue;
      }
    } else if (local.sha256 === newHash && local.exists === !!newBytes) {
      if (newBytes) ownership[relative] = { sha256: newHash, mode: local.mode };
      continue;
    } else if (newHash === baseHash) {
      ownership[relative] = claim;
      plan.preserved.push({ path: relative, reason: 'LOCAL_ONLY_CHANGE' });
      continue;
    } else if (!local.exists || local.sha256 !== baseHash || (local.mode !== claim.mode)) {
      plan.blockers.push({ path: relative, code: 'BOTH_SIDES_CHANGED', message: 'Local content or permissions differ from the adopted baseline' });
      continue;
    }
    if (targetDirty(current.workspace, relative)) {
      plan.blockers.push({ path: relative, code: 'DIRTY_TARGET', message: 'A tracked update target has staged or unstaged project changes' });
      continue;
    }
    const before = snapshotFile(current.workspace, relative);
    if (!newBytes) {
      plan.blockers.push({ path: relative, code: 'DELETION_REVIEW_REQUIRED', message: 'Automatic file removal is unsupported; the existing file is preserved' });
      continue;
    }
    const mode = before.mode ?? (process.platform === 'win32' ? 0o666 : (0o644 & ~process.umask()));
    plan.operations.push({ path: relative, before, after: newBytes ? { dataBase64: newBytes.toString('base64'), mode } : null });
    if (newBytes) ownership[relative] = { sha256: newHash, mode };
  }
  plan.receipt = receiptFor(plan, current.release, current.contextBytes, ownership);
  return finish(plan);
}
function verifyPlan({ plan, trustFile, store }) {
  if (!plan || plan.schemaVersion !== 1 || !['adopt', 'update'].includes(plan.kind) || !['READY', 'NOOP'].includes(plan.status)) throw new Error('Plan is blocked or unsupported');
  if (path.resolve(store) !== plan.store) throw new Error('Plan private store does not match');
  const options = { workspace: plan.workspace, installPath: plan.installPath, releaseRoot: plan.release?.root, trustFile, store };
  const derived = plan.kind === 'adopt' ? planAdoption(options) : planUpdate(options);
  if (canonical(plan) !== canonical(derived)) throw new Error('Plan is stale, tampered, or no longer matches the signed release and ownership policy');
  return derived;
}
function installationInventory(workspace, installPath, receipt) {
  const roots = [...new Set([installPath, ...NATIVE.map(prefix => prefix.slice(0, -1)), '.orchestrator', '.orchestrator/tasks', 'docs/memory'])];
  const entries = [];
  const seen = new Set();
  const coverage = { complete: true, truncated: false, visitedEntries: 0, maxEntries: 4096, skippedProtectedDirectories: 0, linkedEntries: 0, errors: [] };
  const counts = { files: 0, directories: 0, links: 0, protected: 0, projectOwned: 0, baselineManagedClaims: 0 };
  function failure(relative, error) {
    coverage.complete = false;
    coverage.errors.push({ path: relative, code: error.code || 'INVENTORY_ERROR' });
  }
  function visit(relative, depth = 0) {
    if (seen.has(relative)) return;
    if (coverage.visitedEntries >= coverage.maxEntries) { coverage.complete = false; coverage.truncated = true; return; }
    seen.add(relative);
    coverage.visitedEntries++;
    const target = path.join(workspace, relative);
    let stats;
    try { stats = fs.lstatSync(target); } catch (error) {
      if (error.code === 'ENOENT') entries.push({ path: relative, type: 'missing', ownership: 'PROJECT_OWNED' });
      else { entries.push({ path: relative, type: 'error', ownership: 'PROJECT_OWNED', reason: error.code || 'INVENTORY_ERROR' }); failure(relative, error); }
      return;
    }
    const type = stats.isSymbolicLink() ? 'symlink' : stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : 'special';
    const protectedPath = isProtected(relative);
    const claimed = !protectedPath && type === 'file' && !!receipt?.ownership && Object.hasOwn(receipt.ownership, relative);
    const ownership = protectedPath ? 'PROTECTED' : claimed ? 'BASELINE_MANAGED_CLAIM' : 'PROJECT_OWNED';
    const entry = { path: relative, type, ownership, mode: stats.mode & 0o777 };
    if (type === 'file') { entry.size = stats.size; counts.files++; }
    if (type === 'directory') { entry.traversed = false; counts.directories++; }
    if (ownership === 'PROTECTED') counts.protected++;
    else if (claimed) counts.baselineManagedClaims++;
    else counts.projectOwned++;
    entries.push(entry);
    if (type === 'symlink') { entry.reason = 'LINK_NOT_FOLLOWED'; counts.links++; coverage.linkedEntries++; return; }
    if (type !== 'directory') return;
    if (protectedPath) { entry.reason = 'PROTECTED_SUBTREE_NOT_TRAVERSED'; coverage.skippedProtectedDirectories++; return; }
    if (depth >= LIMITS.depth) { entry.reason = 'DEPTH_LIMIT'; coverage.complete = false; coverage.truncated = true; return; }
    let directory;
    try {
      directory = fs.opendirSync(target);
      entry.traversed = true;
      for (let child; (child = directory.readSync()) !== null;) {
        if (coverage.visitedEntries >= coverage.maxEntries) { coverage.complete = false; coverage.truncated = true; break; }
        visit(`${relative}/${child.name}`, depth + 1);
      }
    } catch (error) { failure(relative, error); }
    finally { if (directory) { try { directory.closeSync(); } catch (error) { failure(relative, error); } } }
  }
  for (const root of roots) {
    // Check ancestors without following a linked or protected directory into a root.
    const parts = root.split('/');
    let stop = false;
    for (let i = 1; i < parts.length; i++) {
      const ancestor = parts.slice(0, i).join('/');
      let stats;
      try { stats = fs.lstatSync(path.join(workspace, ancestor)); } catch (error) { if (error.code !== 'ENOENT') failure(ancestor, error); break; }
      if (stats.isSymbolicLink() || !stats.isDirectory() || (isProtected(ancestor) && ancestor !== '.orchestrator')) { visit(ancestor); stop = true; break; }
    }
    if (!stop) visit(root);
  }
  entries.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  return { roots, entries, coverage, counts };
}
function inspectInstallation(options) {
  const workspace = regularRoot(options.workspace);
  const installPath = installRelative(options.installPath);
  const { readInstallation, installationId, assertPrivateStore } = require('./storage');
  assertPrivateStore(options.store, { workspace, create: false });
  const receipt = readInstallation({ store: options.store, workspace, installPath });
  return { schemaVersion: 1, workspace, installPath, installationId: installationId(workspace, installPath), adopted: !!receipt, receipt, expectedGit: snapshotGit(workspace), inventory: installationInventory(workspace, installPath, receipt), protectedPaths: ['PROJECT_CONTEXT.md', 'memory', 'tasks', 'secrets', 'application files and root package metadata'], activationStatus: 'NOT_VERIFIED' };
}

module.exports = { POLICY_VERSION, allowedTarget, inspectInstallation, installRelative, isProtected, planAdoption, planUpdate, snapshotGit, verifyPlan };
