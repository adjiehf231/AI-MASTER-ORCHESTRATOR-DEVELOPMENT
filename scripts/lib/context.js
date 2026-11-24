const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { inspectFile } = require('./file-plan');

const defaultBudget = 8_192;
const maximumBudget = 32_768;
const maximumFileBytes = 1_048_576;
const maximumScanBytes = 32 * 1_048_576;
const excludedDirectory = /^(?:\.git|\.orchestrator|node_modules|coverage|\.nyc_output|playwright-report|test-results|blob-report|dist|build|\.cache|\.turbo|\.next|out)$/i;
const secretFile = /^(?:\.env(?:\..*)?|\.npmrc|\.pypirc|credentials(?:\..*)?|id_(?:rsa|dsa|ecdsa|ed25519))$|\.(?:pem|key|p12|pfx|jks|keystore)$/i;
const hashes = new Map();

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function serializedBytes(value) {
  return Buffer.byteLength(JSON.stringify(value));
}

function budget(value = defaultBudget) {
  if (!Number.isSafeInteger(value) || value < 1_024 || value > maximumBudget) {
    throw new Error('maxBytes must be an integer between 1024 and 32768.');
  }
  return value;
}

function argumentsObject(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a context arguments object.');
  const unknown = Object.keys(value).find(key => !allowed.includes(key));
  if (unknown) throw new Error('Unknown context argument: ' + unknown);
}

function relativePath(value) {
  if (typeof value !== 'string' || !value || value.length > 512 || path.isAbsolute(value)
    || path.win32.isAbsolute(value) || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error('Expected a repository-relative source path of at most 512 characters.');
  }
  const normalized = value.replace(/\\/g, '/');
  if (normalized.split('/').some(part => !part || part === '.' || part === '..' || part.includes(':')
    || excludedDirectory.test(part) || secretFile.test(part))) {
    throw new Error('Source path is excluded or escapes its repository.');
  }
  return normalized;
}

function sourcePaths(values = []) {
  if (!Array.isArray(values) || values.length > 32) throw new Error('paths must contain at most 32 relative paths.');
  return [...new Set(values.map(relativePath))].sort();
}

function git(root, args, allowed = [0]) {
  const result = spawnSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', ...args], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 10_000, maxBuffer: 8 * 1_048_576
  });
  if (result.error || !allowed.includes(result.status)) {
    throw new Error('Cannot inspect the source workspace using git ' + args[0] + '.');
  }
  return result.stdout;
}

function workspace(root) {
  const stats = fs.lstatSync(root);
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error('Expected a regular workspace directory.');
  const canonical = fs.realpathSync.native(root);
  const gitRoot = fs.realpathSync.native(git(canonical, ['rev-parse', '--show-toplevel']).trim());
  if (path.relative(canonical, gitRoot)) throw new Error('The context workspace must be the Git repository root.');
  const revision = git(canonical, ['rev-parse', '--verify', '--quiet', 'HEAD'], [0, 1]).trim() || null;
  return { root: canonical, identity: { id: digest(canonical), revision } };
}

function inventory(root, paths) {
  const all = [...new Set(git(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
    .split('\0').filter(Boolean))].sort();
  if (all.length > 100_000) throw new Error('Source inventory is too large. Use a smaller Git workspace.');
  const files = [];
  const skipped = { excluded: 0, binary: 0, oversized: 0, missing: 0, scanLimit: 0 };
  for (const candidate of all) {
    let relative;
    try { relative = relativePath(candidate); } catch { skipped.excluded++; continue; }
    if (paths.length && !paths.some(prefix => relative === prefix || relative.startsWith(prefix + '/'))) continue;
    files.push(relative);
  }
  return { files, skipped };
}

function source(root, filename) {
  const { target, stats } = inspectFile(root, filename);
  if (!stats) return { skipped: 'missing' };
  if (stats.size > maximumFileBytes) return { skipped: 'oversized' };
  const descriptor = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  let bytes;
  try {
    const current = fs.fstatSync(descriptor);
    if (!current.isFile() || current.size > maximumFileBytes) return { skipped: 'oversized' };
    const buffer = Buffer.alloc(maximumFileBytes + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const length = fs.readSync(descriptor, buffer, offset, buffer.length - offset, null);
      if (length === 0) break;
      offset += length;
    }
    if (offset > maximumFileBytes) return { skipped: 'oversized' };
    bytes = buffer.subarray(0, offset);
  } finally {
    fs.closeSync(descriptor);
  }
  if (bytes.includes(0)) return { skipped: 'binary' };
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { return { skipped: 'binary' }; }
  return { path: filename, text, sha256: digest(bytes), bytes: bytes.length, workspace: digest(root) };
}

function managedProfiles(root) {
  const { target, stats } = inspectFile(root, 'adapters/native-profiles.json');
  if (!stats) return {};
  if (stats.size > maximumFileBytes) throw new Error('The generated profile manifest exceeds the context source limit.');
  const manifest = JSON.parse(fs.readFileSync(target, 'utf8'));
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)
    || Object.entries(manifest).some(([filename, hash]) => (
      !/^[a-f0-9]{64}$/.test(hash) || !/^(?:\.(?:claude|opencode|codex)\/agents\/|\.(?:agents|claude)\/skills\/)/.test(filename)
    ))) {
    throw new Error('Invalid generated profile manifest.');
  }
  return manifest;
}

function token(value) {
  return Buffer.from(JSON.stringify({ version: 1, ...value })).toString('base64url');
}

function decode(value, kind) {
  if (typeof value !== 'string' || value.length > 4_096 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('Invalid ' + kind + ' reference or cursor.');
  }
  let decoded;
  try { decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); }
  catch { throw new Error('Invalid ' + kind + ' reference or cursor.'); }
  if (!decoded || decoded.version !== 1 || decoded.kind !== kind) throw new Error('Invalid ' + kind + ' reference or cursor.');
  return decoded;
}

function reference(entry) {
  return token({ kind: 'source', workspace: entry.workspace, path: entry.path, sha256: entry.sha256 });
}

function entryPreview(text) {
  return [...text].slice(0, 160).join('');
}

function paginate(base, entries, { offset = 0, limit = entries.length, maxBytes, cursor }) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > entries.length) throw new Error('Invalid continuation offset.');
  const result = { version: 1, ...base, maxBytes, entries: [], truncated: false, nextCursor: null };
  for (let index = offset; index < Math.min(entries.length, offset + limit); index++) {
    result.entries.push(entries[index]);
    const next = index + 1;
    result.truncated = next < entries.length;
    result.nextCursor = result.truncated ? cursor(next) : null;
    if (serializedBytes(result) > maxBytes) {
      result.entries.pop();
      break;
    }
  }
  const next = offset + result.entries.length;
  result.truncated = next < entries.length;
  result.nextCursor = result.truncated ? cursor(next) : null;
  if (serializedBytes(result) > maxBytes || (result.truncated && result.entries.length === 0)) {
    throw new Error('The next context entry does not fit maxBytes. Increase the budget or narrow the request.');
  }
  return result;
}

function searchContext(root, args = {}) {
  argumentsObject(args, ['query', 'paths', 'limit', 'cursor', 'maxBytes']);
  const { query, limit = 20 } = args;
  if (typeof query !== 'string' || !query.trim() || query.length > 512 || /[\u0000-\u001f\u007f]/.test(query)) {
    throw new Error('query must be a nonempty single line of at most 512 characters.');
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('limit must be between 1 and 100.');
  const paths = sourcePaths(args.paths);
  const maxBytes = budget(args.maxBytes);
  const current = workspace(root);
  const { files, skipped } = inventory(current.root, paths);
  const managed = paths.length === 0 ? managedProfiles(current.root) : {};
  skipped.generated = 0;
  const input = digest(JSON.stringify({ query, paths }));
  const contentHash = createHash('sha256');
  const sources = [];
  let scannedBytes = 0;
  for (const filename of files) {
    if (scannedBytes >= maximumScanBytes) { skipped.scanLimit++; continue; }
    let loaded;
    try { loaded = source(current.root, filename); }
    catch (error) {
      if (/linked path/.test(error.message)) { skipped.excluded++; continue; }
      throw error;
    }
    if (loaded.skipped) { skipped[loaded.skipped]++; contentHash.update(filename + ':' + loaded.skipped + '\n'); continue; }
    scannedBytes += loaded.bytes;
    contentHash.update(filename + ':' + loaded.sha256 + '\n');
    if (managed[filename] === digest(loaded.text.replace(/\r\n?/g, '\n'))) { skipped.generated++; continue; }
    sources.push(loaded);
  }
  const snapshot = contentHash.update(JSON.stringify(skipped)).digest('hex');
  const key = current.identity.id + ':' + input + ':' + snapshot;
  let matches = hashes.get(key);
  if (!matches) {
    matches = [];
    const needle = query.toLowerCase();
    for (const loaded of sources) {
      const lines = loaded.text.split('\n');
      for (let index = 0; index < lines.length; index++) {
        const matchedColumn = lines[index].toLowerCase().indexOf(needle);
        if (matchedColumn < 0) continue;
        const excerptStart = boundary(lines[index], Math.max(0, matchedColumn - 50));
        matches.push({ path: loaded.path, line: index + 1, sha256: loaded.sha256,
          ref: reference(loaded), excerptStartColumn: excerptStart + 1,
          excerpt: entryPreview(lines[index].slice(excerptStart)) });
        if (matches.length > 10_000) throw new Error('Search exceeds 10000 matching lines. Narrow query or paths.');
      }
    }
    if (hashes.size >= 4) hashes.delete(hashes.keys().next().value);
    hashes.set(key, matches);
  }
  const continuation = args.cursor ? decode(args.cursor, 'search') : { offset: 0 };
  if (args.cursor && (continuation.workspace !== current.identity.id || continuation.input !== input || continuation.snapshot !== snapshot)) {
    throw new Error('Search continuation is stale. Restart the search at the current workspace state.');
  }
  return paginate({ workspace: current.identity, snapshot, query, paths,
    coverage: { consideredFiles: files.length, scannedFiles: sources.length, scannedBytes, skipped,
      complete: Object.entries(skipped).every(([reason, count]) => reason === 'generated' || count === 0) }, totalMatches: matches.length }, matches, {
    offset: continuation.offset, limit, maxBytes,
    cursor: offset => token({ kind: 'search', workspace: current.identity.id, input, snapshot, offset })
  });
}

function lineStarts(text) {
  const starts = [0];
  for (let index = 0; index < text.length; index++) if (text[index] === '\n') starts.push(index + 1);
  return starts;
}

function position(starts, offset) {
  let lower = 0;
  let upper = starts.length;
  while (lower + 1 < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (starts[middle] <= offset) lower = middle;
    else upper = middle;
  }
  return { line: lower + 1, column: offset - starts[lower] + 1 };
}

function boundary(text, offset) {
  return offset > 0 && /[\uD800-\uDBFF]/.test(text[offset - 1]) && /[\uDC00-\uDFFF]/.test(text[offset]) ? offset - 1 : offset;
}

function readContext(root, args = {}) {
  argumentsObject(args, ['ref', 'startLine', 'endLine', 'cursor', 'maxBytes']);
  const pointer = decode(args.ref, 'source');
  const filename = relativePath(pointer.path);
  if (!/^[a-f0-9]{64}$/.test(pointer.sha256)) throw new Error('Invalid source digest.');
  const maxBytes = budget(args.maxBytes);
  const current = workspace(root);
  if (!inventory(current.root, []).files.includes(filename)) throw new Error('Source is no longer available in this workspace.');
  if (pointer.workspace !== current.identity.id) throw new Error('Source reference belongs to another workspace.');
  const loaded = source(current.root, filename);
  if (loaded.skipped || loaded.sha256 !== pointer.sha256) throw new Error('Source reference is stale or unavailable. Search again.');
  const starts = lineStarts(loaded.text);
  const startLine = args.startLine ?? 1;
  const endLine = args.endLine ?? starts.length;
  if (!Number.isSafeInteger(startLine) || !Number.isSafeInteger(endLine)
    || startLine < 1 || endLine < startLine || endLine > starts.length) {
    throw new Error('Requested source line range is invalid.');
  }
  const continuation = args.cursor ? decode(args.cursor, 'read') : {
    offset: starts[startLine - 1], end: starts[endLine] ?? loaded.text.length
  };
  if (args.cursor && (continuation.workspace !== current.identity.id || continuation.ref !== args.ref)) {
    throw new Error('Read continuation belongs to another source or workspace.');
  }
  if (!Number.isSafeInteger(continuation.offset) || !Number.isSafeInteger(continuation.end)
    || continuation.offset < 0 || continuation.end < continuation.offset || continuation.end > loaded.text.length
    || boundary(loaded.text, continuation.offset) !== continuation.offset) throw new Error('Invalid source continuation range.');
  const base = { version: 1, workspace: current.identity, path: filename, sha256: loaded.sha256, ref: args.ref,
    totalLines: starts.length, maxBytes, range: {}, content: '', truncated: false, nextCursor: null };
  const render = end => {
    const finished = end === continuation.end;
    return { ...base, range: { start: position(starts, continuation.offset), endExclusive: position(starts, end), columnEncoding: 'utf-16' },
      content: loaded.text.slice(continuation.offset, end), truncated: !finished,
      nextCursor: finished ? null : token({ kind: 'read', workspace: current.identity.id, ref: args.ref, offset: end, end: continuation.end }) };
  };
  let lower = continuation.offset;
  let upper = continuation.end;
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2);
    if (serializedBytes(render(boundary(loaded.text, middle))) <= maxBytes) lower = middle;
    else upper = middle - 1;
  }
  const end = boundary(loaded.text, lower);
  const result = render(end);
  if (serializedBytes(result) > maxBytes || (end === continuation.offset && end < continuation.end)) {
    throw new Error('Source metadata does not fit maxBytes. Increase the budget.');
  }
  return result;
}

function getTaskContext(root, args = {}) {
  argumentsObject(args, ['taskId', 'paths', 'tags', 'cursor', 'maxBytes']);
  const paths = sourcePaths(args.paths);
  const tags = args.tags ?? [];
  if (!Array.isArray(tags) || tags.length > 32 || tags.some(tag => typeof tag !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tag))) {
    throw new Error('tags must contain at most 32 kebab-case values.');
  }
  const maxBytes = budget(args.maxBytes);
  const current = workspace(root);
  const entries = [];
  const services = {};
  if (fs.existsSync(path.join(current.root, 'orchestration', 'routes.json'))) {
    const { planTask } = require('./routing');
    const route = planTask(current.root, { paths, tags });
    entries.push({ kind: 'routing', lead: route.lead, reviewers: route.reviewers, skills: route.skills, risk: route.risk, reviewMode: route.reviewMode });
    services.routing = 'AVAILABLE';
  } else services.routing = 'NOT_AVAILABLE';
  if (args.taskId !== undefined) {
    if (typeof args.taskId !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(args.taskId)) throw new Error('Invalid task ID.');
    const relative = '.orchestrator/tasks/' + args.taskId.toLowerCase() + '.json';
    const taskStats = inspectFile(current.root, relative).stats;
    if (!taskStats || taskStats.size > 256 * 1_024) throw new Error('Expected a task state file no larger than 256 KiB.');
    const { loadTask, refreshTask, snapshot } = require('./task-workflow');
    const task = refreshTask(loadTask(current.root, args.taskId), snapshot(current.root));
    entries.push({ kind: 'task', id: task.id, title: task.title, scope: task.scope,
      revision: task.observed, scopeVersion: task.scopeVersion, report: task.lastReport?.path ?? null });
    for (const item of task.items) {
      entries.push({ kind: 'todo', id: item.id, outcome: item.outcome, owner: item.owner,
        status: item.status, verification: item.verification, checks: item.checks, reason: item.reason });
    }
    for (const decision of task.decisions) {
      entries.push({ kind: 'decision', question: decision.question, choice: decision.choice,
        reason: decision.reason, owner: decision.owner, sourceRevision: decision.revision.head,
        alternatives: decision.alternatives, dissent: decision.dissent, artifacts: decision.artifacts });
    }
    services.task = 'AVAILABLE';
  } else services.task = 'NOT_REQUESTED';
  if (fs.existsSync(path.join(current.root, 'docs', 'memory', 'index.json'))) {
    const { selectMemory } = require('./memory');
    const selected = selectMemory(current.root, { paths, tags, maxBytes: 65_536 });
    for (const memory of selected.entries) {
      const loaded = source(current.root, relativePath(memory.source.path));
      if (loaded.skipped) throw new Error('Selected memory source is unavailable.');
      entries.push({ kind: 'memory', id: memory.id, type: memory.type, source: memory.source,
        ref: reference(loaded), verifiedOn: memory.verifiedOn, excerpt: entryPreview(memory.body),
        evidence: memory.evidence, needsRevisionCheck: memory.needsRevisionCheck });
    }
    services.memory = { status: 'AVAILABLE', omitted: selected.omitted };
  } else services.memory = { status: 'NOT_AVAILABLE', reason: 'No memory index is configured.' };
  const input = digest(JSON.stringify({ paths, tags, taskId: args.taskId }));
  const snapshot = digest(JSON.stringify(entries));
  const continuation = args.cursor ? decode(args.cursor, 'task') : { offset: 0 };
  if (args.cursor && (continuation.workspace !== current.identity.id || continuation.input !== input || continuation.snapshot !== snapshot)) {
    throw new Error('Task context continuation is stale. Restart at the current task and source state.');
  }
  return paginate({ workspace: current.identity, snapshot, services, totalEntries: entries.length }, entries, {
    offset: continuation.offset, maxBytes,
    cursor: offset => token({ kind: 'task', workspace: current.identity.id, input, snapshot, offset })
  });
}

module.exports = { getTaskContext, searchContext, readContext };
