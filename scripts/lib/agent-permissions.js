const readOnlyRule = Object.freeze({ action: 'edit', resource: '*', effect: 'deny' });
const effects = new Set(['allow', 'ask', 'deny']);
const readTools = [
  { action: 'read', claude: 'Read', antigravity: 'view_file' },
  { action: 'grep', claude: 'Grep', antigravity: 'grep_search' },
  { action: 'glob', claude: 'Glob', antigravity: 'find_by_name' }
];

function validateAgentPermissions(permissions, filename) {
  if (permissions === undefined) return;
  if (!Array.isArray(permissions) || permissions.some(rule => (
    !rule || typeof rule !== 'object' || Object.keys(rule).length !== 3
    || typeof rule.action !== 'string' || !rule.action.trim() || typeof rule.resource !== 'string'
    || !rule.resource.trim() || !effects.has(rule.effect)
  ))) {
    throw new Error(`${filename}: expected permissions with action, resource, and effect (allow, ask, or deny)`);
  }
}

function isReadOnlyAgent(permissions = []) {
  return permissions.some(rule => Object.entries(readOnlyRule).every(([key, value]) => rule[key] === value));
}

function affectsTool(pattern, action) {
  const terms = pattern.split(/([*?])/).map(term => {
    if (term === '*') return '.*';
    if (term === '?') return '.';
    return term.replace(/[|\\{}()[\]^$+?.-]/g, '\\$&');
  });
  return new RegExp('^' + terms.join('') + '$').test(action);
}

function readOnlyTools(permissions) {
  return readTools.filter(({ action }) => !permissions.some(rule => (
    affectsTool(rule.action, action) && (rule.effect !== 'allow' || rule.resource !== '*')
  )));
}

function claudePermissions(permissions = []) {
  if (!isReadOnlyAgent(permissions)) return {};
  const tools = readOnlyTools(permissions).map(tool => tool.claude);
  // Prevent an empty allowlist from reverting to a host default.
  return tools.length ? { tools: tools.join(', ') } : { disallowedTools: '*' };
}

function openCodePermissions(permissions = []) {
  if (!isReadOnlyAgent(permissions)) return permissions.length ? { permissions } : {};
  return {
    permissions: [
      { action: '*', resource: '*', effect: 'deny' },
      ...readOnlyTools(permissions).map(({ action }) => ({ action, resource: '*', effect: 'ask' }))
    ]
  };
}

function antigravityPermissions(permissions = []) {
  if (!isReadOnlyAgent(permissions)) return {};
  return {
    tools: readOnlyTools(permissions).map(tool => tool.antigravity),
    commandExecutionPolicy: 'off',
    inheritMcp: false,
    inheritCustomizations: false
  };
}

module.exports = {
  antigravityPermissions,
  claudePermissions,
  isReadOnlyAgent,
  openCodePermissions,
  readOnlyRule,
  validateAgentPermissions
};
