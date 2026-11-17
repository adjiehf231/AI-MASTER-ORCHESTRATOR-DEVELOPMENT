const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const root = path.resolve(__dirname, '..');

const cases = [
  ['refactor-core.js', 'Karirly Engineering Constitution', 'Enterprise Engineering Constitution'],
  ['sanitize-tiers.js', 'karirly_sit', '${DB_NAME}_sit']
];

for (const [script, original, expected] of cases) {
  test(script + ' honors the sentinel, dry-run and script-relative root', (t) => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'aom-migration-'));
    t.after(() => fs.rmSync(parent, { force: true, recursive: true }));
    const project = path.join(parent, 'project');
    const scripts = path.join(project, 'scripts');
    const outside = path.join(parent, 'outside');
    fs.mkdirSync(scripts, { recursive: true });
    fs.mkdirSync(outside);
    const scriptPath = path.join(scripts, script);
    fs.copyFileSync(path.join(root, 'scripts', script), scriptPath);
    const canonical = path.join(project, 'fixture.md');
    const foreign = path.join(outside, 'fixture.md');
    for (const file of [canonical, foreign]) fs.writeFileSync(file, original);

    function run(...args) {
      return spawnSync(process.execPath, [scriptPath, ...args], { cwd: outside, encoding: 'utf8' });
    }
    const missing = run('--apply');
    assert.equal(missing.status, 1, missing.stderr);
    assert.match(missing.stderr, /Sentinel file not found/);
    assert.equal(fs.readFileSync(canonical, 'utf8'), original);

    fs.writeFileSync(path.join(project, 'PROJECT_CONTEXT.template.md'), '# Sentinel\n');
    const dry = run();
    assert.equal(dry.status, 0, dry.stderr);
    assert.ok(dry.stdout.includes(project));
    assert.equal(fs.readFileSync(canonical, 'utf8'), original);

    const applied = run('--apply');
    assert.equal(applied.status, 0, applied.stderr);
    assert.equal(fs.readFileSync(canonical, 'utf8'), expected);
    assert.equal(fs.readFileSync(foreign, 'utf8'), original);
  });
}
