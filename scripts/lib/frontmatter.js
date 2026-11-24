const YAML = require('yaml');
const { validateAgentPermissions } = require('./agent-permissions');

const componentName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const agentModes = new Set(['all', 'primary', 'subagent']);

function normalizeLines(content) {
  return content.replace(/\r\n?/g, '\n');
}

function parseFrontmatter(content, filename) {
  const normalized = normalizeLines(content).replace(/^\uFEFF/, '');
  const match = /^---[ \t]*\n([\s\S]*?)^---[ \t]*(?:\n|$)/m.exec(normalized);
  if (!match || match.index !== 0) {
    throw new Error(`${filename}: expected YAML frontmatter delimited by ---`);
  }

  try {
    const document = YAML.parseDocument(match[1]);
    const error = document.errors[0] || document.warnings[0];
    if (error) throw error;
    if (!YAML.isMap(document.contents)) throw new Error('expected a YAML mapping');
    for (const { key } of document.contents.items) {
      if (!YAML.isScalar(key) || typeof key.value !== 'string') {
        throw new Error('expected string keys at the top level');
      }
    }
    const attributes = document.toJS({ maxAliasCount: 0 });
    const body = normalized.slice(match[0].length);
    return { attributes, body, document };
  } catch (error) {
    throw new Error(`${filename}: invalid YAML frontmatter (${error.message})`, { cause: error });
  }
}

function formatFrontmatter(attributes, body) {
  const markdown = normalizeLines(body);
  const separator = markdown.startsWith('\n') ? '' : '\n';
  const ending = markdown.endsWith('\n') ? '' : '\n';
  const yaml = YAML.isDocument(attributes)
    ? attributes.toString({ lineWidth: 0 })
    : YAML.stringify(attributes, { lineWidth: 0 });
  return `---\n${yaml}---\n${separator}${markdown}${ending}`;
}

function validateComponent(content, expectedName, kind, filename) {
  const component = parseFrontmatter(content, filename);
  const { attributes, body } = component;
  if (!componentName.test(expectedName) || attributes.name !== expectedName) {
    throw new Error(`${filename}: frontmatter name must be ${expectedName} and use lowercase kebab-case`);
  }
  if (typeof attributes.description !== 'string' || !attributes.description.trim()) {
    throw new Error(`${filename}: expected a nonempty frontmatter description`);
  }
  if (kind === 'agent' && attributes.mode !== undefined && !agentModes.has(attributes.mode)) {
    throw new Error(`${filename}: invalid agent mode (use all, primary, or subagent)`);
  }
  if (kind === 'agent') validateAgentPermissions(attributes.permissions, filename);
  if (kind === 'skill' && (expectedName.length > 64 || attributes.description.length > 1024)) {
    throw new Error(`${filename}: skill names support up to 64 characters and descriptions up to 1024 characters`);
  }
  if (!body.trim()) throw new Error(`${filename}: expected a nonempty Markdown body`);
  return component;
}

module.exports = { componentName, normalizeLines, parseFrontmatter, formatFrontmatter, validateComponent };
