const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { inspectFile } = require('./file-plan');
const { loadProjectContext } = require('./project-context');

const indexPath = 'docs/memory/index.json';
const defaultBudget = 8_192;
const maxSourceBytes = 128 * 1024;
const types = new Set(['state', 'handoff', 'decision', 'question', 'heuristic', 'anti-pattern', 'lesson']);
const statuses = new Set(['active', 'superseded', 'resolved', 'proposed']);
const identifier = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;
const tagPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const projectPattern = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const fullRevision = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const controlCharacters = /[\u0000-\u001f\u007f]/;
const unsafeSegments = /^(?:\.git|\.orchestrator|node_modules|\.env(?:\..*)?)$|\.(?:pem|key|log|p12|pfx)$/i;
const secretText = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:Bearer\s+\S+|gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-(?:proj-)?[A-Za-z0-9_-]{12,})|\b(?:password|secret|token|api[-_ ]?key)\s*=\s*\S+/i;

function expect(condition, label, message) {
  if (!condition) throw new Error(`${label}: ${message}`);
}

function fields(value, allowed, label) {
  expect(value && typeof value === 'object' && !Array.isArray(value), label, 'expected an object');
  const unknown = Object.keys(value).find(key => !allowed.includes(key));
  expect(unknown === undefined, label, `unknown field ${unknown}`);
}

function list(values, validate, label) {
  expect(Array.isArray(values), label, 'expected an array');
  expect(values.every(validate), label, 'contains an invalid value');
  expect(new Set(values).size === values.length, label, 'contains a duplicate value');
}

function validPath(value) {
  return typeof value === 'string' && !path.isAbsolute(value) && !path.win32.isAbsolute(value)
    && !/[\\:#]/.test(value) && !controlCharacters.test(value)
    && value.split('/').every(part => part && part !== '.' && part !== '..' && !unsafeSegments.test(part));
}

function validBranch(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_][A-Za-z0-9_./-]*$/.test(value)
    && !value.includes('..') && value.split('/').every(part => part && !part.startsWith('.') && !part.endsWith('.lock'))
    && !value.endsWith('.');
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function isTag(value) {
  return typeof value === 'string' && tagPattern.test(value);
}

function verifyScope(scope, label) {
  fields(scope, ['project', 'branch', 'paths', 'tags'], label);
  expect(scope.project === undefined || (typeof scope.project === 'string' && projectPattern.test(scope.project)),
    label, 'expected a valid project ID');
  expect(scope.branch === undefined || validBranch(scope.branch), label, 'expected a local Git branch name');
  if (scope.paths !== undefined) list(scope.paths, validPath, `${label}.paths`);
  if (scope.tags !== undefined) list(scope.tags, isTag, `${label}.tags`);
}

function git(root, args, expected = [0]) {
  const result = spawnSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', ...args], {
    cwd: root, encoding: 'utf8', timeout: 5_000, windowsHide: true
  });
  if (result.error) throw new Error('Unable to inspect Git for memory', { cause: result.error });
  if (!expected.includes(result.status)) throw new Error(`Memory Git check failed (${args[0]}, exit ${result.status})`);
  return { status: result.status, output: result.stdout.trim() };
}

function gitState(root, requestedBranch) {
  const active = git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'], [0, 1]);
  const branch = requestedBranch ?? (active.output || null);
  const target = !requestedBranch || requestedBranch === active.output ? 'HEAD' : `refs/heads/${requestedBranch}`;
  const revision = git(root, ['rev-parse', '--verify', '--quiet', `${target}^{commit}`], [0, 1]);
  if (requestedBranch && !revision.output) throw new Error('Memory branch does not exist locally.');
  const sourceDiff = git(root, ['diff', '--quiet', '--no-ext-diff', 'HEAD',
    '--', '.', ':(exclude).orchestrator', ':(exclude).orchestrator/**'], [0, 1]);
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z']).output.split('\0')
    .some(filename => filename && filename !== '.orchestrator' && !filename.startsWith('.orchestrator/'));
  return { branch, revision: revision.output || null, worktreeChanged: sourceDiff.status !== 0 || untracked };
}

function excerpt(source, section, label) {
  const headings = [...source.matchAll(/^(#{1,6})[ \t]+(.+?)[ \t]*$/gm)];
  const matches = headings.filter(match => match[2] === section || match[2].startsWith(`[${section}]`));
  expect(matches.length === 1, label, `expected one Markdown heading for ${section}`);
  const start = matches[0];
  const end = headings.find(match => match.index > start.index && match[1].length <= start[1].length);
  return source.slice(start.index, end?.index).trim();
}

function inspectReference(root, reference, label, bodyRequired = false) {
  fields(reference, ['path', 'section'], label);
  expect(validPath(reference.path), label, 'expected a safe repository-relative path');
  const markdown = reference.path.endsWith('.md');
  if (bodyRequired) expect(markdown && reference.path.startsWith('docs/memory/'), label, 'expected memory Markdown');
  const { target, stats } = inspectFile(root, reference.path);
  expect(stats, label, `missing source ${reference.path}`);
  if (reference.section !== undefined) {
    expect(markdown && typeof reference.section === 'string' && reference.section.trim()
      && !controlCharacters.test(reference.section), label, 'expected a Markdown heading');
  }
  if (!bodyRequired && reference.section === undefined) return;
  expect(stats.size <= maxSourceBytes, label, `source exceeds ${maxSourceBytes} bytes`);
  const content = fs.readFileSync(target, 'utf8').replace(/\r\n?/g, '\n');
  const body = reference.section === undefined ? content.trim() : excerpt(content, reference.section, label);
  expect(body, label, 'source is empty');
  if (bodyRequired) expect(!secretText.test(body), label, 'source contains credential-like text');
  return body;
}

function verifyEvidence(root, evidence, label, required) {
  expect(Array.isArray(evidence) && (!required || evidence.length > 0), label, 'expected evidence references');
  for (const [index, reference] of evidence.entries()) {
    inspectReference(root, reference, `${label}[${index}]`);
  }
}

function pathOverlaps(left, right) {
  return left === right || left.startsWith(right + '/') || right.startsWith(left + '/');
}

function scopeOverlaps(left, right) {
  if (left.project && right.project && left.project !== right.project) return false;
  if (left.branch && right.branch && left.branch !== right.branch) return false;
  return !left.paths?.length || !right.paths?.length
    || left.paths.some(first => right.paths.some(second => pathOverlaps(first, second)));
}

function verifyTransitions(entries) {
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const replacements = new Map();
  const decisions = new Map();
  for (const entry of entries) {
    if (entry.supersedes) {
      const previous = byId.get(entry.supersedes);
      expect(previous && previous !== entry && previous.type === entry.type && previous.topic === entry.topic
        && scopeOverlaps(entry.scope, previous.scope) && previous.status === 'superseded'
        && (entry.status === 'active' || entry.status === 'superseded') && entry.verifiedOn >= previous.verifiedOn,
      entry.id, `invalid replacement of ${entry.supersedes}`);
      expect(!replacements.has(previous.id), entry.id, `more than one replacement for ${previous.id}`);
      replacements.set(previous.id, entry.id);
    }
    if (entry.type === 'decision' && entry.status === 'active') {
      const peers = decisions.get(entry.topic) ?? [];
      const conflict = peers.find(previous => scopeOverlaps(entry.scope, previous.scope));
      expect(!conflict, entry.id, `ambiguous active decision with ${conflict?.id} on ${entry.topic}`);
      decisions.set(entry.topic, [...peers, entry]);
    }
  }
  for (const entry of entries.filter(item => item.status === 'superseded')) {
    const visited = new Set();
    let current = entry.id;
    while (byId.get(current)?.status === 'superseded') {
      expect(!visited.has(current), entry.id, 'supersession cycle');
      visited.add(current);
      expect(replacements.has(current), entry.id, `superseded entry ${current} has no replacement`);
      current = replacements.get(current);
    }
  }
}

function readJson(root, relative, maxBytes) {
  expect(validPath(relative), relative, 'expected a safe repository-relative path');
  const { target, stats } = inspectFile(root, relative);
  expect(stats?.size <= maxBytes, relative, `expected a JSON file up to ${maxBytes} bytes`);
  try {
    return JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch (error) {
    throw new Error(`${relative}: invalid JSON`, { cause: error });
  }
}

function loadIndex(root) {
  const manifest = readJson(root, indexPath, 256 * 1024);
  fields(manifest, ['version', 'entries'], indexPath);
  expect(manifest.version === 1 && Array.isArray(manifest.entries), indexPath, 'expected version 1 and an entry array');
  const seen = new Set();
  let projectState = 0;
  const entries = manifest.entries.map((entry, i) => {
    const label = `${indexPath} entry ${i + 1}`;
    fields(entry, ['id', 'type', 'topic', 'scope', 'status', 'source', 'evidence', 'verifiedOn', 'reviewBy', 'revision', 'supersedes'], label);
    expect(typeof entry.id === 'string' && identifier.test(entry.id) && !seen.has(entry.id), label,
      'expected a unique memory ID');
    seen.add(entry.id);
    expect(types.has(entry.type) && statuses.has(entry.status), entry.id, 'unknown type or status');
    expect(entry.topic === undefined ? entry.type !== 'decision' : isTag(entry.topic), entry.id, 'expected a topic for a decision');
    verifyScope(entry.scope, `${entry.id}.scope`);
    if (entry.type === 'state') {
      expect(entry.status === 'active' && !Object.keys(entry.scope).length, entry.id, 'project state must be active and project-wide');
      projectState++;
    }
    if (entry.type === 'handoff') {
      expect(entry.scope.branch && typeof entry.revision === 'string' && fullRevision.test(entry.revision),
        entry.id, 'handoffs require a branch and a full Git commit ID');
    } else {
      expect(entry.revision === undefined, entry.id, 'revision is only used by a handoff');
    }
    expect(entry.verifiedOn === undefined ? entry.status === 'proposed' : validDate(entry.verifiedOn), entry.id, 'invalid verification date');
    expect(entry.reviewBy === undefined || (validDate(entry.reviewBy) && entry.reviewBy >= entry.verifiedOn),
      entry.id, 'review date must be on or after verification');
    expect(entry.supersedes === undefined || (typeof entry.supersedes === 'string' && identifier.test(entry.supersedes)),
      entry.id, 'invalid supersession ID');
    verifyEvidence(root, entry.evidence, `${entry.id}.evidence`, entry.status !== 'proposed');
    return { ...entry, body: inspectReference(root, entry.source, `${entry.id}.source`, true) };
  });
  expect(projectState === 1, indexPath, 'expected exactly one current project state');
  verifyTransitions(entries);
  return entries;
}

function checkMemory(root) {
  return loadIndex(root).length;
}

function matchScope(scope, { project, branch, paths, tags }) {
  if ((scope.project && scope.project !== project) || (scope.branch && scope.branch !== branch)) return -1;
  const pathMatch = scope.paths?.some(prefix => paths.some(filename => pathOverlaps(prefix, filename)));
  const tagCount = scope.tags?.filter(tag => tags.includes(tag)).length ?? 0;
  if (scope.paths?.length && !pathMatch && (paths.length || !tagCount)) return -1;
  if (scope.tags?.length && !tagCount && !pathMatch) return -1;
  return Number(Boolean(pathMatch)) * 10 + tagCount;
}

function handoffMatches(root, recorded, current) {
  if (!current) return false;
  if (recorded === current) return true;
  const result = git(root, ['merge-base', '--is-ancestor', recorded, current], [0, 1, 128]);
  return result.status === 0;
}

const priority = { state: 0, handoff: 1, question: 2, decision: 3, heuristic: 4, 'anti-pattern': 4, lesson: 4 };

function selectMemory(root, { branch, paths = [], tags = [], maxBytes = defaultBudget, today = new Date().toISOString().slice(0, 10) } = {}) {
  expect(branch === undefined || validBranch(branch), 'memory', 'invalid branch');
  list(paths, validPath, 'memory paths');
  list(tags, isTag, 'memory tags');
  expect(Number.isSafeInteger(maxBytes) && maxBytes >= 1_024 && maxBytes <= 64 * 1_024,
    'memory', 'max-bytes must be between 1024 and 65536');
  expect(validDate(today), 'memory', 'invalid current date');
  const gitContext = gitState(root, branch);
  const project = loadProjectContext(root).PROJECT_ID;
  const context = { ...gitContext, project, paths, tags };
  const omitted = { stale: 0, unrelated: 0, budget: 0 };
  const matches = [];
  for (const entry of loadIndex(root)) {
    if (entry.status !== 'active') continue;
    const relevance = matchScope(entry.scope, context);
    if (relevance < 0) {
      omitted.unrelated++;
    } else if (entry.verifiedOn > today || (entry.reviewBy && entry.reviewBy < today)
      || (entry.type === 'handoff' && !handoffMatches(root, entry.revision, context.revision))) {
      omitted.stale++;
    } else {
      matches.push({ entry, relevance });
    }
  }
  matches.sort((a, b) => priority[a.entry.type] - priority[b.entry.type] || b.relevance - a.relevance
    || b.entry.verifiedOn.localeCompare(a.entry.verifiedOn) || a.entry.id.localeCompare(b.entry.id));
  const result = { version: 1, project, ...gitContext, maxBytes, omitted, entries: [] };
  let hasHandoff = false;
  for (const { entry } of matches) {
    if (entry.type === 'handoff' && hasHandoff) {
      omitted.unrelated++;
      continue;
    }
    const { id, type, source, evidence, verifiedOn, revision, body } = entry;
    const selected = { id, type, source, evidence, verifiedOn, body };
    if (revision) Object.assign(selected, {
      revision, needsRevisionCheck: revision !== context.revision || context.worktreeChanged
    });
    result.entries.push(selected);
    if (Buffer.byteLength(JSON.stringify(result)) + 16 > maxBytes) {
      result.entries.pop();
      omitted.budget++;
    } else if (entry.type === 'handoff') {
      hasHandoff = true;
    }
  }
  return result;
}

function buildMemoryProposal(root, relative) {
  const proposal = readJson(root, relative, 8_192);
  fields(proposal, ['id', 'type', 'topic', 'scope', 'evidence', 'summary', 'supersedes'], 'memory proposal');
  expect(typeof proposal.id === 'string' && identifier.test(proposal.id), 'memory proposal', 'expected a valid ID');
  expect(types.has(proposal.type) && !['state', 'handoff'].includes(proposal.type), 'memory proposal', 'invalid proposed type');
  expect(proposal.topic === undefined ? proposal.type !== 'decision' : isTag(proposal.topic),
    proposal.id, 'expected a topic for a decision');
  verifyScope(proposal.scope, `${proposal.id}.scope`);
  verifyEvidence(root, proposal.evidence, `${proposal.id}.evidence`, true);
  expect(typeof proposal.summary === 'string' && proposal.summary.trim() && proposal.summary.length <= 500
    && !controlCharacters.test(proposal.summary) && !secretText.test(proposal.summary),
  proposal.id, 'expected a sanitized single-line summary up to 500 characters');
  const entries = loadIndex(root);
  expect(!entries.some(entry => entry.id === proposal.id), proposal.id, 'ID already exists');
  if (proposal.supersedes !== undefined) {
    expect(entries.some(entry => entry.id === proposal.supersedes && entry.status === 'active'
      && entry.type === proposal.type && entry.topic === proposal.topic && scopeOverlaps(entry.scope, proposal.scope)),
    proposal.id, 'expected an applicable active entry to replace');
  }
  return { status: 'proposed', ...proposal };
}

module.exports = { checkMemory, selectMemory, buildMemoryProposal };
