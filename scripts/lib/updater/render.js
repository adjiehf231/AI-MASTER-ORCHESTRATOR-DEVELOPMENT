const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { buildArtifacts } = require('../../sync-adapters');
const { inspectFile } = require('../file-plan');
const { parseProjectContext } = require('../project-context');

const regionId = 'orchestrator-guidance-v1';
const markerPrefix = '<!-- orchestrator:managed:';
const sharedMarkdown = new Set(['CLAUDE.md', 'CONVENTIONS.md', '.cursorrules', '.windsurfrules', '.clinerules', '.opencoderules']);

function relativeInstallation(value) {
  if (typeof value !== 'string' || path.isAbsolute(value) || path.win32.isAbsolute(value)) {
    throw new Error('installationPath must be a project-relative path');
  }
  const normalized = value.replace(/\\/g, '/');
  if (normalized.split('/').some(part => !part || part === '.' || part === '..' || /[:`\r\n\u0000]/.test(part))) {
    throw new Error('installationPath must be a safe project-relative path');
  }
  return normalized;
}

function decode(bytes, filename) {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${filename}: unsupported text encoding`, { cause: error });
  }
}

// This function proposes bytes only. A valid marker never establishes ownership;
// the planner must independently validate the baseline/receipt before applying it.
function patchManagedMarkdown(existing, contents, { id = regionId, filename = 'Markdown guidance' } = {}) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error('Invalid managed region ID');
  const start = `${markerPrefix}start id="${id}" -->`;
  const end = `${markerPrefix}end id="${id}" -->`;
  const body = decode(Buffer.from(contents), filename);
  if (body.includes(markerPrefix)) throw new Error(`${filename}: candidate contains reserved managed markers`);
  if (existing === undefined) {
    return Buffer.from(`${start}\n${body.replace(/\r\n?/g, '\n').replace(/\n*$/, '')}\n${end}\n`);
  }
  const original = Buffer.from(existing);
  const text = decode(original, filename);
  const starts = text.split(start).length - 1;
  const ends = text.split(end).length - 1;
  if (starts !== 1 || ends !== 1 || text.split(markerPrefix).length - 1 !== 2) {
    throw new Error(`${filename}: existing file lacks one unambiguous managed region`);
  }
  const first = original.indexOf(Buffer.from(start));
  const last = original.indexOf(Buffer.from(end));
  const startEnd = first + Buffer.byteLength(start);
  const afterStart = original.subarray(startEnd, startEnd + 2);
  const eol = afterStart.equals(Buffer.from('\r\n')) ? '\r\n'
    : original[startEnd] === 10 ? '\n' : null;
  const endEnd = last + Buffer.byteLength(end);
  const afterEnd = original.subarray(endEnd, endEnd + 2);
  const atBom = first === 3 && original.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]));
  if (!eol || first >= last || (first !== 0 && !atBom && original[first - 1] !== 10)
      || original[last - 1] !== 10 || (endEnd < original.length
        && original[endEnd] !== 10 && !afterEnd.equals(Buffer.from('\r\n')))) {
    throw new Error(`${filename}: malformed managed region boundaries`);
  }
  const replacement = body.replace(/\r\n?/g, '\n').replace(/\n*$/, '').replace(/\n/g, eol) + eol;
  return Buffer.concat([original.subarray(0, startEnd + eol.length), Buffer.from(replacement), original.subarray(last)]);
}

function renderRelease(sourceRoot, { projectRoot, installationPath = 'ai-orchestrator', contextRoot,
  contextBytes: suppliedContextBytes, sourceOverrides = new Map(), sourceFiles } = {}) {
  if (typeof projectRoot !== 'string' || !path.isAbsolute(projectRoot)) throw new Error('An absolute projectRoot is required');
  const project = path.resolve(projectRoot);
  const rootStats = fs.lstatSync(project);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) throw new Error('projectRoot must be a regular directory');
  const installation = relativeInstallation(installationPath);
  const contextDirectory = path.resolve(contextRoot ?? path.join(project, installation));
  const contextRelative = path.relative(project, path.join(contextDirectory, 'PROJECT_CONTEXT.md')).replace(/\\/g, '/');
  const files = new Map();
  const fragments = [];
  const conflicts = [];
  let context;
  let contextBytes;
  try {
    const inspected = inspectFile(project, contextRelative);
    if (suppliedContextBytes !== undefined && !Buffer.isBuffer(suppliedContextBytes)) {
      throw new Error('contextBytes must be a Buffer containing the verified prior project context');
    }
    if (suppliedContextBytes === undefined && !inspected.stats) {
      throw new Error('An active PROJECT_CONTEXT.md is required; upstream templates are not a project baseline');
    }
    contextBytes = suppliedContextBytes ?? fs.readFileSync(inspected.target);
    context = parseProjectContext(decode(contextBytes, contextRelative), contextRelative);
  } catch (error) {
    return { files, fragments, conflicts: [{ path: contextRelative, code: 'PROJECT_CONTEXT_UNSUPPORTED', message: error.message }] };
  }
  const artifacts = buildArtifacts(sourceRoot, { context, sourceOverrides, sourceFiles, referencePrefix: installation });
  const candidates = new Map(artifacts.files);
  // Codex uses the root project guidance file; never replace a pre-existing user file.
  candidates.set('AGENTS.md', artifacts.files.get('adapters/codex/AGENTS.md'));
  for (const [filename, contents] of candidates) {
    const bytes = Buffer.from(contents);
    if (filename.startsWith('adapters/')) {
      files.set(`${installation}/${filename}`, bytes);
      continue;
    }
    if (filename === '.aider.conf.yml') {
      const { stats, target } = inspectFile(project, filename);
      if (stats && !fs.readFileSync(target).equals(bytes)) {
        fragments.push({ path: filename, bytes, reason: 'Existing YAML requires a separately reviewed namespace patch' });
        conflicts.push({ path: filename, code: 'SHARED_FORMAT_UNSUPPORTED', message: 'Existing YAML is protected; no whole-file serialization is permitted' });
      } else files.set(filename, bytes);
      continue;
    }
    if (sharedMarkdown.has(filename) || filename === 'AGENTS.md') {
      try {
        const { target, stats } = inspectFile(project, filename);
        const existing = stats ? fs.readFileSync(target) : undefined;
        files.set(filename, patchManagedMarkdown(existing, bytes, { filename }));
      } catch (error) {
        fragments.push({ path: filename, bytes, reason: 'Existing Markdown requires an adopted managed region' });
        conflicts.push({ path: filename, code: 'SHARED_REGION_CONFLICT', message: error.message });
      }
      continue;
    }
    // Native profiles/resources remain candidates. Receipt-based ownership checks in
    // the planner protect existing local copies, even if their bytes look generated.
    inspectFile(project, filename);
    files.set(filename, bytes);
  }
  return { files, fragments, conflicts, contextDigest: createHash('sha256').update(contextBytes).digest('hex') };
}

module.exports = { renderRelease, patchManagedMarkdown, relativeInstallation };
