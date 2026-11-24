const fs = require('node:fs');
const { buildAdapters } = require('../sync-adapters');
const { componentName, validateComponent } = require('./frontmatter');
const { applyFilePlan, inspectFile, withFileLock } = require('./file-plan');
const { checkRepositoryReferences } = require('./repository-references');

function componentPath(kind, name) {
  if (typeof name !== 'string' || !componentName.test(name)
    || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(name)) {
    throw new Error(`Invalid identifier "${name}". Must be a lowercase kebab-case filename.`);
  }
  return kind === 'agent' ? `agents/${name}.md` : `skills/${name}/SKILL.md`;
}

function prepareComponent(root, kind, name, options, edit) {
  const relativePath = componentPath(kind, name);
  const { stats, target } = inspectFile(root, relativePath);
  if (options.update && !stats) throw new Error(`Component not found: ${relativePath}`);
  if (!options.update && stats && !options.force) {
    throw new Error(`Component already exists: ${relativePath}. Pass --force to overwrite.`);
  }

  const original = options.update ? fs.readFileSync(target, 'utf8') : undefined;
  const markdown = edit(original, relativePath);
  validateComponent(markdown, name, kind, relativePath);
  const sourceOverrides = new Map([[relativePath, markdown]]);
  checkRepositoryReferences(root, { sourceOverrides });
  return { relativePath, markdown, sourceOverrides, adapters: buildAdapters(root, { sourceOverrides }) };
}

function saveComponent(root, kind, name, options, edit) {
  componentPath(kind, name);
  return withFileLock(root, () => {
    const { relativePath, sourceOverrides, adapters } = prepareComponent(root, kind, name, options, edit);
    applyFilePlan(root, { files: new Map([...sourceOverrides, ...adapters.files]), removals: adapters.removals });
    return relativePath;
  });
}

module.exports = { componentPath, prepareComponent, saveComponent };
