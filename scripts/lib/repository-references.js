const fs = require('node:fs');
const path = require('node:path');

const referenceLabel = /^\s*(?:[-*]\s+)?(?:\*\*)?(?:Repository references|Authoritative (?:sources|references|artifacts|standards)|Source of truth(?: references)?)\s*(?:\*\*)?:/i;
const repositoryPath = /^(?:\.\/)?(?:docs|skills|agents|scripts|tests|adapters|orchestration|\.github)\//;
const rootFile = /^(?:\.\/)?[\w.-]+\.[\w-]+$/;

function checkRepositoryReferences(root, { sourceOverrides = new Map() } = {}) {
  const paths = new Set(sourceOverrides.keys());
  for (const dir of ['agents', 'skills']) {
    for (const entry of fs.readdirSync(path.join(root, dir), { recursive: true, withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        paths.add(path.relative(root, path.join(entry.parentPath, entry.name)).replaceAll(path.sep, '/'));
      }
    }
  }

  const missing = [];
  for (const file of [...paths].sort()) {
    const content = sourceOverrides.get(file) ?? fs.readFileSync(path.join(root, file), 'utf8');
    content.split(/\r?\n/).forEach((line, index) => {
      if (!referenceLabel.test(line)) return;
      for (const match of line.matchAll(/\x60([^\x60]+)\x60/g)) {
        const reference = match[1].split('#')[0].replaceAll('\\', '/');
        if (!repositoryPath.test(reference) && !rootFile.test(reference)) continue;
        const normalized = reference.replace(/^\.\//, '');
        if (normalized.split('/').includes('..') ||
            (!sourceOverrides.has(normalized) && !fs.existsSync(path.join(root, normalized)))) {
          missing.push(file + ':' + (index + 1) + ' -> ' + reference);
        }
      }
    });
  }
  if (missing.length > 0) throw new Error('Unresolved repository references:\n' + missing.join('\n'));
}

module.exports = { checkRepositoryReferences };
