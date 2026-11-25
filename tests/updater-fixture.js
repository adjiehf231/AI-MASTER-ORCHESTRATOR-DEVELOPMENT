const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const release = require('../scripts/lib/updater/release');
const storage = require('../scripts/lib/updater/storage');
const planning = require('../scripts/lib/updater/planning');
const transaction = require('../scripts/lib/updater/transaction');

const repo = path.resolve(__dirname, '..');
function fixture(t) {
  const temp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'safe-updater-')));
  t.after(() => {
    assert.equal(path.dirname(temp), fs.realpathSync.native(os.tmpdir()));
    assert.ok(path.basename(temp).startsWith('safe-updater-'));
    fs.rmSync(temp, { recursive: true, force: true });
  });
  const project = path.join(temp, 'project');
  const source = path.join(temp, 'publisher-v1');
  const store = path.join(temp, 'private-store');
  fs.mkdirSync(project); fs.mkdirSync(source);
  const write = (root, relative, bytes) => {
    const target = path.join(root, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes); return target;
  };
  const context = 'PROJECT_NAME: Customer Office\nPROJECT_ID: OFFICE\nPROJECT_DOMAIN: example.test\nDB_NAME: fixture_only\n';
  write(source, 'PROJECT_CONTEXT.template.md', context.replace('Customer Office', 'Vendor'));
  write(source, 'agents/orchestrator.md', '---\nname: orchestrator\ndescription: Guide ${PROJECT_NAME}.\nmode: primary\n---\n# ${PROJECT_NAME}\nPreserve customer files.\n');
  write(source, 'skills/fixture/SKILL.md', '---\nname: fixture\ndescription: Check ${PROJECT_NAME}.\n---\n# Fixture\nOld guidance.\n');
  write(source, 'scripts/passive.js', 'module.exports = "original";\n');
  write(source, 'package.json', '{"name":"orchestrator-fixture","scripts":{"postinstall":"exit 87"}}\n');
  fs.cpSync(source, path.join(project, 'ai-orchestrator'), { recursive: true });
  write(project, 'ai-orchestrator/PROJECT_CONTEXT.md', context);
  write(project, 'ai-orchestrator/docs/memory/DECISIONS.md', '# Local decision\r\nKeep this.\r\n');
  write(project, 'ai-orchestrator/scripts/custom.js', 'module.exports = "customer-only";\n');
  write(project, '.orchestrator/tasks/customer.json', '{"local":"keep"}\n');
  write(project, '.env', 'FIXTURE_ONLY=synthetic-canary\n');
  write(project, '.gitignore', '.orchestrator/\n.env\n');
  write(project, 'package.json', '{"name":"customer-app"}\n');
  write(project, 'src/app.js', 'export const app = true;\n');
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: project, encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
  };
  git('init', '--quiet'); git('add', '.');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '--quiet', '-m', 'customer baseline');
  const pair = crypto.generateKeyPairSync('ed25519');
  const key = write(temp, 'signing.pem', pair.privateKey.export({ format: 'pem', type: 'pkcs8' }));
  const keyId = release.sha256(pair.publicKey.export({ type: 'spki', format: 'der' }));
  const trust = write(temp, 'trust.json', JSON.stringify({ schemaVersion: 1, keys: { [keyId]: pair.publicKey.export({ format: 'pem', type: 'spki' }) } }));
  storage.assertPrivateStore(store, { workspace: project });
  const base = release.packRelease({ sourceRoot: source, output: path.join(temp, 'release-v1'), keyFile: key, revision: '1'.repeat(40) });
  const options = bundle => ({ workspace: project, installPath: 'ai-orchestrator', releaseRoot: bundle.releaseRoot, trustFile: trust, store });
  const apply = (plan, extra = {}) => {
    release.cacheRelease({ releaseRoot: plan.release.root, trustFile: trust, store, workspace: project });
    return transaction.applyTransaction({ workspace: project, installPath: 'ai-orchestrator', store, operations: plan.operations,
      receipt: plan.receipt, expectedGit: plan.expectedGit, verify: () => planning.verifyPlan({ plan, trustFile: trust, store }), quiescent: true, ...extra });
  };
  const adopt = () => { const plan = planning.planAdoption(options(base)); assert.equal(plan.status, 'READY', JSON.stringify(plan.blockers)); return apply(plan); };
  let version = 1;
  const next = (modify = root => write(root, 'skills/fixture/SKILL.md', '---\nname: fixture\ndescription: Check ${PROJECT_NAME}.\n---\n# Fixture\nNew guidance.\n')) => {
    version++; const root = path.join(temp, `publisher-v${version}`); fs.cpSync(source, root, { recursive: true }); modify(root);
    return release.packRelease({ sourceRoot: root, output: path.join(temp, `release-v${version}`), keyFile: key, revision: String(version).repeat(40) });
  };
  const protectedPaths = ['package.json', 'src/app.js', '.env', '.orchestrator/tasks/customer.json', 'ai-orchestrator/PROJECT_CONTEXT.md', 'ai-orchestrator/docs/memory/DECISIONS.md', 'ai-orchestrator/scripts/custom.js'];
  const protectedBytes = () => Object.fromEntries(protectedPaths.map(name => [name, fs.readFileSync(path.join(project, name)).toString('base64')]));
  return { repo, temp, project, source, store, key, keyId, trust, base, options, apply, adopt, next, write, git, protectedBytes };
}
module.exports = { fixture, repo };
