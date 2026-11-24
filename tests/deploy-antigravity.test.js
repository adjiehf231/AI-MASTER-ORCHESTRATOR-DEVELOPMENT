const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixtureRepository } = require('./fixture-repository');
const { parseFrontmatter } = require('../scripts/lib/frontmatter');

test('deploy preflights required artifact files before creating a plugin directory', t => {
  const fixture = fixtureRepository(t);
  const result = fixture.run('deploy-antigravity.js');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Required plugin source is missing: adapters\/antigravity\/plugin\.json/);
  assert.equal(fs.existsSync(fixture.plugin), false);
});

test('Antigravity deployment renders native YAML, removes only stale managed files, and preserves local files', t => {
  const fixture = fixtureRepository(t);
  fixture.write('scripts/context-mcp.js', '// Context runtime fixture.\n');
  const savedSkill = fixture.write('skills/deploy-example/SKILL.md',
    '---\nname: deploy-example\ndescription: "Café for ${PROJECT_NAME}"\n---\n\n# Café ${PROJECT_ID}\n');
  const reference = fixture.write('skills/deploy-example/references/details.md', '# Details\n');
  let result = fixture.run('sync-adapters.js');
  assert.equal(result.status, 0, result.stderr);
  result = fixture.run('deploy-antigravity.js');
  assert.equal(result.status, 0, result.stderr);
  const installed = relative => path.join(fixture.plugin, relative);
  const manifest = installed('plugin.json');
  const rules = installed('rules/AGENTS.md');
  assert.equal(fs.readFileSync(manifest, 'utf8'), fixture.read('adapters/antigravity/plugin.json'));
  assert.equal(fs.readFileSync(rules, 'utf8'), fixture.read('adapters/antigravity/rules/AGENTS.md'));
  const agent = parseFrontmatter(fs.readFileSync(installed('agents/orchestrator.md'), 'utf8'), 'orchestrator.md');
  assert.equal(agent.attributes.mainAgent, true);
  assert.equal(agent.attributes.subagent, false);
  const mcp = JSON.parse(fs.readFileSync(installed('mcp_config.json'), 'utf8')).mcpServers['orchestrator-context'];
  assert.equal(mcp.command, process.execPath);
  assert.deepEqual(mcp.args, [path.join(fixture.root, 'scripts', 'context-mcp.js'), '--workspace', fixture.root]);
  assert.equal(fs.readFileSync(installed('adapters/component-catalog.json'), 'utf8'), fixture.read('adapters/component-catalog.json'));
  assert.match(fs.readFileSync(installed('skills/deploy-example/SKILL.md'), 'utf8'), /Café AIMASTER/);
  const unmanaged = installed('skills/deploy-example/local.md');
  fs.writeFileSync(unmanaged, 'Keep this local file.');
  fs.unlinkSync(savedSkill);
  fs.unlinkSync(reference);
  result = fixture.run('sync-adapters.js');
  assert.equal(result.status, 0, result.stderr);
  result = fixture.run('deploy-antigravity.js');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(installed('skills/deploy-example/SKILL.md')), false);
  assert.equal(fs.existsSync(installed('skills/deploy-example/references/details.md')), false);
  assert.equal(fs.readFileSync(unmanaged, 'utf8'), 'Keep this local file.');

  fs.writeFileSync(rules, '# Manually customized');
  result = fixture.run('deploy-antigravity.js');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /locally modified or unmanaged/);
  assert.equal(fs.readFileSync(rules, 'utf8'), '# Manually customized');
  result = fixture.run('deploy-antigravity.js', ['--force']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(rules, 'utf8'), fixture.read('adapters/antigravity/rules/AGENTS.md'));
});

test('deploy accepts an explicit source-linked workspace and preserves reviewer read-only flags', t => {
  const fixture = fixtureRepository(t);
  fixture.write('scripts/context-mcp.js', '// Context runtime fixture.\n');
  const project = path.join(path.dirname(fixture.root), 'project');
  fs.mkdirSync(project);
  fixture.write('agents/reviewer.md', [
    '---', 'name: reviewer', 'description: Read the source.', 'mode: subagent', 'permissions:',
    '  - action: edit', '    resource: "*"', '    effect: deny', '---', '# Reviewer\n'
  ].join('\n'));
  let result = fixture.run('sync-adapters.js');
  assert.equal(result.status, 0, result.stderr);
  result = fixture.run('deploy-antigravity.js', ['--workspace', project]);
  assert.equal(result.status, 0, result.stderr);
  const installed = relative => path.join(fixture.plugin, relative);
  const native = parseFrontmatter(fs.readFileSync(installed('agents/reviewer.md'), 'utf8'), 'Antigravity reviewer');
  assert.deepEqual(native.attributes.tools, ['view_file', 'grep_search', 'find_by_name']);
  assert.equal(native.attributes.commandExecutionPolicy, 'off');
  assert.equal(native.attributes.inheritMcp, false);
  const mcp = JSON.parse(fs.readFileSync(installed('mcp_config.json'), 'utf8')).mcpServers['orchestrator-context'];
  assert.equal(mcp.args[2], project);
  assert.equal(mcp.cwd, project);
});
