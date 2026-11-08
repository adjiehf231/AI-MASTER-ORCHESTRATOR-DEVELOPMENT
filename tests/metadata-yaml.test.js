const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

test('all specialist agents have valid frontmatter and non-empty description', () => {
  const agentsDir = path.join(repoRoot, 'agents');
  const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
  assert.ok(files.length >= 23, `Must discover at least 23 agent files (found ${files.length})`);

  files.forEach(file => {
    const content = fs.readFileSync(path.join(agentsDir, file), 'utf8');
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    assert.ok(match, `Agent ${file} must contain YAML frontmatter`);

    const raw = match[1];
    const hasName = raw.includes('name:');
    const hasDesc = raw.includes('description:');
    assert.ok(hasName, `Agent ${file} frontmatter must have name:`);
    assert.ok(hasDesc, `Agent ${file} frontmatter must have description:`);
  });
});

test('all enterprise skills have valid frontmatter and kebab-case name', () => {
  const skillsDir = path.join(repoRoot, 'skills');
  const dirs = fs.readdirSync(skillsDir).filter(f => fs.statSync(path.join(skillsDir, f)).isDirectory());
  assert.ok(dirs.length >= 31, `Must discover at least 31 skill directories (found ${dirs.length})`);

  dirs.forEach(dir => {
    const skillPath = path.join(skillsDir, dir, 'SKILL.md');
    assert.ok(fs.existsSync(skillPath), `Skill directory ${dir} must contain SKILL.md`);

    const content = fs.readFileSync(skillPath, 'utf8');
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    assert.ok(match, `Skill ${dir} must contain YAML frontmatter`);

    const raw = match[1];
    assert.ok(raw.includes(`name: ${dir}`), `Skill ${dir} frontmatter must have name matching folder in kebab-case`);
    assert.ok(raw.includes('description:'), `Skill ${dir} frontmatter must have description`);
  });
});

