const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { validateComponent } = require('../scripts/lib/frontmatter.js');
const { checkMetadata } = require('../scripts/lib/verification.js');

const root = path.resolve(__dirname, '..');

test('canonical agent and skill metadata are valid YAML and match their source paths', () => {
  checkMetadata(root);
});

test('YAML validation rejects malformed or duplicate mappings and invalid component metadata', () => {
  const fixture = (yaml) => '---\n' + yaml + '\n---\n\n# Fixture\n';
  const validate = (yaml) => validateComponent(fixture(yaml), 'example-agent', 'agent', 'example-agent.md');

  assert.throws(() => validate('name: example-agent\ndescription: [unclosed'), /invalid YAML frontmatter/);
  assert.throws(() => validate('name: example-agent\ndescription: one\ndescription: two'), /invalid YAML frontmatter/);
  assert.throws(() => validate('name: different-name\ndescription: text'), /frontmatter name/);
  assert.throws(() => validate('name: example-agent\ndescription: 42'), /nonempty frontmatter description/);
  assert.throws(() => validate('name: example-agent\ndescription: text\nmode: unexpected'), /invalid agent mode/);
  assert.equal(validate('name: example-agent\ndescription: >-\n  First line.\n  Second line.').attributes.description,
    'First line. Second line.');
});
