const fs = require('node:fs');
const path = require('node:path');
const { inspectFile } = require('./file-plan');

const routesFile = 'orchestration/routes.json';
const risks = ['low', 'medium', 'high', 'critical'];
const capabilities = new Set([
  'workspace-read', 'workspace-write', 'terminal', 'browser', 'ci',
  'documents', 'structured-data', 'subagents'
]);
const toolKinds = new Set(['local', 'native', 'mcp', 'extension']);
const toolStatuses = new Set(['available', 'unavailable', 'denied']);
const identifier = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const toolIdentifier = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/;
const toolPreferences = {
  'workspace-read': ['local', 'native', 'mcp', 'extension'],
  'workspace-write': ['local', 'native', 'extension', 'mcp'],
  terminal: ['local', 'native', 'extension', 'mcp'],
  browser: ['native', 'mcp', 'extension', 'local'],
  ci: ['mcp', 'native', 'local', 'extension'],
  documents: ['native', 'mcp', 'extension', 'local'],
  'structured-data': ['mcp', 'native', 'extension', 'local'],
  subagents: ['native', 'local', 'extension', 'mcp']
};

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function uniqueList(value, predicate, label, minimum = 0) {
  if (!Array.isArray(value) || value.length < minimum || !value.every(predicate)
    || new Set(value).size !== value.length) {
    throw new Error(label + ' must be a list of distinct, valid values.');
  }
  return value;
}

function isIdentifier(value) {
  return typeof value === 'string' && identifier.test(value);
}

function readRoutes(root) {
  const { target, stats } = inspectFile(root, routesFile);
  if (!stats) throw new Error('Missing routing configuration: ' + routesFile);
  const manifest = JSON.parse(fs.readFileSync(target, 'utf8'));
  if (!isRecord(manifest) || manifest.version !== 1 || !Array.isArray(manifest.routes)) {
    throw new Error(routesFile + ' must contain version 1 and a routes array.');
  }

  const ids = new Set();
  for (const route of manifest.routes) {
    if (!isRecord(route) || !isIdentifier(route.id) || ids.has(route.id)) {
      throw new Error(routesFile + ' contains an invalid or duplicated route ID.');
    }
    ids.add(route.id);
    if (typeof route.label !== 'string' || !route.label.trim() || !isIdentifier(route.lead)) {
      throw new Error(route.id + ' requires a label and a valid lead agent ID.');
    }
    uniqueList(route.reviewers, isIdentifier, route.id + '.reviewers');
    uniqueList(route.skills, isIdentifier, route.id + '.skills', 1);
    uniqueList(route.needs, value => capabilities.has(value), route.id + '.needs');
    uniqueList(route.tags, isIdentifier, route.id + '.tags');
    if (route.minRisk !== undefined && !risks.includes(route.minRisk)) {
      throw new Error(route.id + ' has an invalid minRisk.');
    }
    if (route.reviewers.includes(route.lead)) {
      throw new Error(route.id + ' must assign review to a different role than the lead.');
    }

    for (const id of [route.lead, ...route.reviewers]) {
      if (!inspectFile(root, 'agents/' + id + '.md').stats) {
        throw new Error(route.id + ' -> unresolved agent ' + id);
      }
    }
    for (const id of route.skills) {
      if (!inspectFile(root, 'skills/' + id + '/SKILL.md').stats) {
        throw new Error(route.id + ' -> unresolved skill ' + id);
      }
    }
  }
  if (!ids.has('general')) throw new Error(routesFile + ' must define a general fallback route.');
  return manifest.routes;
}

function validateInventory(inventory) {
  if (!isRecord(inventory) || typeof inventory.host !== 'string'
    || !toolIdentifier.test(inventory.host) || !Array.isArray(inventory.tools)) {
    throw new Error('Host inventory requires a host ID and a tools array.');
  }
  uniqueList(inventory.deniedCapabilities ?? [], value => capabilities.has(value), 'Denied capabilities');
  const ids = new Set();
  for (const tool of inventory.tools) {
    if (!isRecord(tool) || typeof tool.id !== 'string' || !toolIdentifier.test(tool.id) || ids.has(tool.id)
      || !toolKinds.has(tool.kind) || !toolStatuses.has(tool.status) || !['read', 'write'].includes(tool.access)) {
      throw new Error('Host inventory contains an invalid or duplicated tool.');
    }
    ids.add(tool.id);
    uniqueList(tool.capabilities, value => capabilities.has(value), tool.id + '.capabilities', 1);
  }
  return inventory;
}

function splitPathTags(file) {
  if (typeof file !== 'string' || !file || path.isAbsolute(file) || path.win32.isAbsolute(file)
    || file.split(/[/\\]/).includes('..')) {
    throw new Error('Paths must be relative to the project root.');
  }
  return file.toLowerCase().split(/[^a-z0-9-]+/).filter(Boolean);
}

function chooseTools(inventory, needs, operation) {
  const tools = inventory?.tools ?? [];
  return needs.map(capability => {
    if (inventory?.deniedCapabilities?.includes(capability)) {
      return { capability, status: 'BLOCKED', operation, reason: 'The session policy denied this capability.' };
    }
    const candidates = tools.filter(tool =>
      tool.capabilities.includes(capability) && (capability !== 'workspace-write' || tool.access === 'write'));
    const available = candidates.filter(tool => tool.status === 'available').sort((first, second) =>
      toolPreferences[capability].indexOf(first.kind) - toolPreferences[capability].indexOf(second.kind)
      || Number(first.access === 'write') - Number(second.access === 'write'));
    if (available.length) {
      const describe = ({ id, kind, access }) => ({ id, kind, access });
      return { capability, status: 'AVAILABLE', selected: describe(available[0]), alternatives: available.slice(1).map(describe) };
    }
    const reason = !inventory ? 'Confirm the host capabilities in this session.'
      : candidates.some(tool => tool.status === 'denied') ? 'The host denied access.'
      : 'No available tool in the supplied host inventory.';
    return { capability, status: inventory && capability !== 'subagents' ? 'BLOCKED' : 'NOT_RUN', operation, reason };
  });
}

function planTask(root, {
  risk = 'low', routeId, tags = [], paths = [], needs = [], operation = 'read', inventory
} = {}) {
  if (!risks.includes(risk)) throw new Error('Unknown risk level: ' + risk);
  if (!['read', 'edit'].includes(operation)) throw new Error('Operation must be read or edit.');
  uniqueList(tags, isIdentifier, 'Task tags');
  uniqueList(needs, value => capabilities.has(value), 'Required capabilities');
  const routes = readRoutes(root);
  if (inventory !== undefined) validateInventory(inventory);
  const signals = new Set([...tags, ...paths.flatMap(splitPathTags)]);
  const matching = routes.map(route => ({
    route,
    matched: route.tags.filter(tag => signals.has(tag))
  })).filter(match => match.matched.length > 0).sort((first, second) =>
    risks.indexOf(second.route.minRisk ?? 'low') - risks.indexOf(first.route.minRisk ?? 'low')
    || second.matched.length - first.matched.length);
  const route = routeId ? routes.find(item => item.id === routeId)
    : matching[0]?.route ?? routes.find(item => item.id === 'general');
  if (!route) throw new Error('Unknown route: ' + routeId);

  const minRisk = Math.max(risks.indexOf(risk), risks.indexOf(route.minRisk ?? 'low'),
    ...matching.map(match => risks.indexOf(match.route.minRisk ?? 'low')));
  const reviewCandidates = [...new Set([
    ...route.reviewers,
    ...matching.filter(match => match.route.minRisk === 'high').flatMap(match => match.route.reviewers),
    'code-reviewer', 'qa-engineer'
  ])].filter(id => id !== route.lead);
  const reviewers = minRisk < 2 ? reviewCandidates.slice(0, minRisk)
    : [reviewCandidates.find(id => id === 'security-engineer' || id === 'privacy-reviewer') ?? reviewCandidates[0],
      ...reviewCandidates].filter((id, index, all) => all.indexOf(id) === index).slice(0, 2);
  const requested = [...new Set([
    ...route.needs, ...needs,
    ...(operation === 'edit' ? ['workspace-write'] : []),
    ...(reviewers.length ? ['subagents'] : [])
  ])];
  const tools = chooseTools(inventory, requested, operation);
  const independent = tools.some(tool => tool.capability === 'subagents' && tool.status === 'AVAILABLE');

  return {
    route: route.id, label: route.label,
    basis: routeId ? 'explicit route' : matching.length ? 'matched tags or path segments' : 'general fallback',
    matched: matching.map(match => ({ route: match.route.id, tags: match.matched })),
    risk: risks[minRisk], operation, lead: route.lead, reviewers,
    reviewMode: reviewers.length ? independent ? 'subagents-available' : 'same-session' : 'lead-only',
    skills: route.skills.slice(0, Math.min(4, minRisk + 1)),
    tools,
    host: inventory?.host ?? null
  };
}

module.exports = { planTask, readRoutes, validateInventory };
