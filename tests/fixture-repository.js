const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repo = path.resolve(__dirname, '..');

function fixtureRepository(t) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestrator-fixture-'));
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  const root = path.join(workspace, 'repo');
  const plugin = path.join(workspace, 'plugin');
  fs.mkdirSync(path.join(root, 'agents'), { recursive: true });
  fs.mkdirSync(path.join(root, 'skills'));
  fs.cpSync(path.join(repo, 'scripts'), path.join(root, 'scripts'), { recursive: true });
  for (const file of ['PROJECT_CONTEXT.md', 'PROJECT_CONTEXT.template.md']) {
    fs.copyFileSync(path.join(repo, file), path.join(root, file));
  }
  const fixture = {
    root,
    plugin,
    write(filename, data) {
      const target = path.join(root, filename);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, data);
      return target;
    },
    read(filename) { return fs.readFileSync(path.join(root, filename), 'utf8'); },
    run(script, args = []) {
      return spawnSync(process.execPath, [path.join(root, 'scripts', script), ...args], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, NODE_PATH: path.join(repo, 'node_modules'), ANTIGRAVITY_PLUGIN_DIR: plugin },
        timeout: 10_000
      });
    }
  };
  fixture.write('agents/orchestrator.md', '---\nname: orchestrator\ndescription: Fixture\nmode: primary\n---\n\n# Fixture\n');
  return fixture;
}

module.exports = { fixtureRepository };
