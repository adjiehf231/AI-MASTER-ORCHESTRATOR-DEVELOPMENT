const fs = require('node:fs');
const path = require('node:path');

function inspectFile(root, relativePath) {
  if (path.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) {
    throw new Error(`Expected a relative path: ${relativePath}`);
  }
  const parts = relativePath.split(/[/\\]/);
  if (parts.some(part => !part || part === '.' || part === '..' || part.includes(':'))) {
    throw new Error(`Invalid relative path: ${relativePath}`);
  }

  let target = root;
  for (const [index, part] of parts.entries()) {
    target = path.join(target, part);
    const stats = fs.lstatSync(target, { throwIfNoEntry: false });
    if (!stats) return { target: path.join(root, ...parts), stats };
    const expectedType = index === parts.length - 1 ? stats.isFile() : stats.isDirectory();
    if (!expectedType || stats.isSymbolicLink()) {
      throw new Error(`Unexpected file type or linked path: ${target}`);
    }
    if (index === parts.length - 1) return { target, stats };
  }
}

function withFileLock(root, execute) {
  const stats = fs.lstatSync(root);
  if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error(`Expected a regular directory: ${root}`);
  const lock = path.join(root, '.orchestrator.lock');
  try {
    fs.mkdirSync(lock);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw new Error(`Another orchestrator command may be writing to ${root}. Retry after it finishes.`, { cause: error });
  }

  try {
    return execute();
  } finally {
    fs.rmdirSync(lock);
  }
}

function prepareChanges(root, files, removals) {
  const planned = new Set();
  const changes = [];
  function plan(relativePath, bytes, mode) {
    const { target, stats } = inspectFile(root, relativePath);
    const key = process.platform === 'win32' ? target.toLowerCase() : target;
    if (planned.has(key)) throw new Error(`Duplicate path in file plan: ${relativePath}`);
    planned.add(key);

    const original = stats && fs.readFileSync(target);
    const hasNewMode = mode !== undefined && stats && process.platform !== 'win32'
      && (stats.mode & 0o777) !== (mode & 0o777);
    if ((!bytes && !original) || (bytes && original?.equals(bytes) && !hasNewMode)) return;
    changes.push({ relativePath, target, original, originalMode: stats?.mode, bytes, mode });
  }

  for (const [relativePath, contents] of files) {
    const bytes = typeof contents === 'object' && !Buffer.isBuffer(contents) ? contents.bytes : contents;
    plan(relativePath, Buffer.from(bytes), contents.mode);
  }
  for (const relativePath of removals) plan(relativePath, undefined);
  return changes;
}

function createParentDirs(root, destination, created) {
  const parent = path.dirname(destination);
  if (parent === root || fs.existsSync(parent)) return;
  createParentDirs(root, parent, created);
  fs.mkdirSync(parent);
  created.push(parent);
}

// Call under withFileLock so planning and writing use the same source state.
function applyFilePlan(root, { files, removals = [] }) {
  const changes = prepareChanges(root, files, removals);
  if (changes.length === 0) return 0;

  const staging = fs.mkdtempSync(path.join(root, '.orchestrator-transaction-'));
  const staged = [];
  const applied = [];
  const created = [];
  let preserveStaging = false;

  function stage(name, bytes, mode) {
    if (!bytes) return undefined;
    const file = path.join(staging, name);
    staged.push(file);
    fs.writeFileSync(file, bytes, { flag: 'wx' });
    if (mode !== undefined) fs.chmodSync(file, mode & 0o777);
    return file;
  }

  try {
    const prepared = changes.map((change, i) => ({
      ...change,
      replacement: stage(`${i}.new`, change.bytes, change.mode ?? change.originalMode),
      backup: stage(`${i}.old`, change.original, change.originalMode)
    }));

    for (const change of prepared) {
      inspectFile(root, change.relativePath);
      if (change.replacement) {
        createParentDirs(root, change.target, created);
        fs.renameSync(change.replacement, change.target);
      } else {
        fs.unlinkSync(change.target);
      }
      applied.push(change);
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const { relativePath, target, backup } of applied.reverse()) {
      try {
        inspectFile(root, relativePath);
        if (backup) fs.renameSync(backup, target);
        else fs.unlinkSync(target);
      } catch (rollbackError) {
        rollbackErrors.push(`${relativePath}: ${rollbackError.message}${backup ? ` (backup ${backup})` : ''}`);
      }
    }
    for (const dir of created.reverse()) {
      try {
        fs.rmdirSync(dir);
      } catch (rollbackError) {
        rollbackErrors.push(`${dir}: ${rollbackError.message}`);
      }
    }
    if (rollbackErrors.length) {
      preserveStaging = true;
      throw new Error(`${error.message}; rollback incomplete: ${rollbackErrors.join('; ')}`, { cause: error });
    }
    throw error;
  } finally {
    if (!preserveStaging) {
      for (const file of staged) fs.rmSync(file, { force: true });
      fs.rmdirSync(staging);
    }
  }
  return changes.length;
}

module.exports = { applyFilePlan, inspectFile, withFileLock };
