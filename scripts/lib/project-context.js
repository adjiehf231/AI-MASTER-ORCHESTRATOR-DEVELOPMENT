const fs = require('node:fs');
const path = require('node:path');

const templateName = 'PROJECT_CONTEXT.template.md';
const activeName = 'PROJECT_CONTEXT.md';
const required = ['PROJECT_NAME', 'PROJECT_ID', 'PROJECT_DOMAIN', 'DB_NAME'];
const defaults = {
  SRC_DIR: 'src',
  COMPONENTS_DIR: 'src/components',
  MODULES_DIR: 'src/features',
  DOCS_DIR: 'docs',
  OPENROUTER_MODEL: 'openrouter/auto'
};
const known = new Set([...required, ...Object.keys(defaults), 'CR_PREFIX']);

function readValue(rawValue, location) {
  const raw = rawValue.trim();
  const doubleQuoted = raw.match(/^"((?:\\.|[^"\\])*)"(?:\s+\(.*\))?$/);
  const quoted = raw.match(/^'([^']*)'(?:\s+\(.*\))?$/) || raw.match(/^`([^`]*)`(?:\s+\(.*\))?$/);
  const value = doubleQuoted ? doubleQuoted[1].replace(/\\(["\\])/g, '$1').trim()
    : quoted ? quoted[1].trim() : raw;

  if (!value || value === '**' || (!doubleQuoted && !quoted && /^["'`]/.test(raw))
      || /[\u0000-\u001f\u007f]/.test(value) || /\$\{/.test(value)) {
    throw new Error(`${location}: expected a non-empty, literal value`);
  }
  return value;
}

function parseProjectContext(content, filename = activeName) {
  const context = { ...defaults };
  const seen = new Set();
  for (const [index, line] of content.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    const match = line.match(/^\s*-\s*\*\*.*?\(`\$\{([A-Z][A-Z0-9_]*)\}`\):\*\*\s*(.*)$/)
      || line.match(/^([A-Z][A-Z0-9_]*)\s*:\s*(.*)$/);
    if (!match || !known.has(match[1])) continue;

    const [, key, rawValue] = match;
    const location = `${filename}:${index + 1} (${key})`;
    if (seen.has(key)) throw new Error(`${location}: duplicate project setting`);
    context[key] = readValue(rawValue, location);
    seen.add(key);
  }

  const missing = required.filter(key => !seen.has(key));
  if (missing.length) throw new Error(`${filename}: missing project settings ${missing.join(', ')}`);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(context.PROJECT_ID)) {
    throw new Error(`${filename}: PROJECT_ID must use letters, digits, underscores, or hyphens`);
  }
  if (!/^[a-z0-9][a-z0-9_.-]*\/[a-z0-9][a-z0-9_.:-]*$/i.test(context.OPENROUTER_MODEL)) {
    throw new Error(`${filename}: OPENROUTER_MODEL must use provider/model format`);
  }
  context.CR_PREFIX ??= `CR-${context.PROJECT_ID}-`;
  return context;
}

function loadProjectContext(repoRoot) {
  const filename = fs.existsSync(path.join(repoRoot, activeName)) ? activeName : templateName;
  return parseProjectContext(fs.readFileSync(path.join(repoRoot, filename), 'utf8'), filename);
}

function bindProjectContext(text, context, filename) {
  return text.replace(/\\?\$\{([A-Z][A-Z0-9_]*)\}/g, (placeholder, key) => {
    if (placeholder.startsWith('\\')) return placeholder.slice(1);
    if (!Object.hasOwn(context, key)) throw new Error(`${filename}: unknown project placeholder ${placeholder}`);
    return context[key];
  });
}

module.exports = { bindProjectContext, loadProjectContext, parseProjectContext };
