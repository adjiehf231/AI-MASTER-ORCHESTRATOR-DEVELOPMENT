const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

function walk(dir) {
  let results = [];
  fs.readdirSync(dir).forEach(f => {
    if (f === '.git' || f === 'node_modules' || f === 'dist' || f === 'docs') return;
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) results = results.concat(walk(full));
    else if (f.endsWith('.md')) results.push(full);
  });
  return results;
}

test('agents and skills contain 0 legacy domain terms (F03 invariant)', () => {
  // Use regex patterns with word boundaries (excluding security CVEs)
  const patterns = [
    { name: 'career', regex: /\bcareer\b/i },
    { name: 'ATS', regex: /\bATS\b/ },
    { name: 'CV (non-CVE)', regex: /\bCV\b(?!E\b)/ },
    { name: 'alamat_lengkap', regex: /\balamat_lengkap\b/i },
    { name: 'karirly', regex: /\bkarirly\b/i }
  ];

  const targets = walk(path.join(repoRoot, 'agents')).concat(walk(path.join(repoRoot, 'skills')));
  const leaks = [];

  targets.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    patterns.forEach(({ name, regex }) => {
      if (regex.test(content)) {
        leaks.push({ file: path.relative(repoRoot, file), term: name });
      }
    });
  });

  assert.equal(leaks.length, 0, `Detected legacy domain leaks in production prompts: ${JSON.stringify(leaks, null, 2)}`);
});
