const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const sentinelFile = path.join(repoRoot, 'PROJECT_CONTEXT.template.md');

if (!fs.existsSync(sentinelFile)) {
  console.error('FATAL: Execution scope violation. Sentinel file not found at repository root: ' + repoRoot);
  process.exit(1);
}

const isApply = process.argv.includes('--apply');
console.log('--- Sanitizing Environment & Database Tier Identifiers ---');
console.log('Target Root:', repoRoot);
console.log('Mode:', isApply ? 'APPLY (Modifying files)' : 'DRY-RUN (Simulating changes - pass --apply to write)');

const ignoredDirs = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next']);

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    if (ignoredDirs.has(file)) return;
    const full = path.join(dir, file);
    try {
      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) return; // Prevent symlink traversal
      if (stat.isDirectory()) {
        results = results.concat(walk(full));
      } else if (file.endsWith('.md')) {
        results.push(full);
      }
    } catch (e) {
      // Skip unreadable files
    }
  });
  return results;
}

const tierDbReplacements = [
  { from: /karirly_dev/g, to: '${DB_NAME}_dev' },
  { from: /karirly_test/g, to: '${DB_NAME}_test' },
  { from: /karirly_sit/g, to: '${DB_NAME}_sit' },
  { from: /karirly_uat/g, to: '${DB_NAME}_uat' },
  { from: /karirly_prod/g, to: '${DB_NAME}_prod' },
  { from: /@uat\.karirly\.id/g, to: '@uat.${PROJECT_DOMAIN}' },
  { from: /\.agents\/workflows\/karirly-develop-feature\.md/g, to: 'docs/process/DEVELOP_FEATURE.md' }
];

const files = walk(repoRoot);
let totalModified = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  tierDbReplacements.forEach(({ from, to }) => {
    content = content.replace(from, to);
  });

  if (content !== original) {
    totalModified++;
    console.log(`${isApply ? 'Cleaned' : '[DRY-RUN] Would clean'}: ${path.relative(repoRoot, file)}`);
    if (isApply) {
      fs.writeFileSync(file, content, 'utf8');
    }
  }
});

console.log(`\nScan complete. ${totalModified} files identified for tier sanitation.`);
