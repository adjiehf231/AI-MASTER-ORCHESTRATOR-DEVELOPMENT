const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(full));
    } else if (file.endsWith('.md')) {
      results.push(full);
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

console.log('--- Sanitizing Environment & Database Tier Identifiers ---');
const files = walk('.');
let totalModified = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  tierDbReplacements.forEach(({ from, to }) => {
    content = content.replace(from, to);
  });

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    totalModified++;
    console.log(`Cleaned tier identifiers in: ${file}`);
  }
});

console.log(`\nTier sanitation complete. ${totalModified} files modified.`);
