const test = require('node:test');
const assert = require('node:assert/strict');
const { changePreview, summarize } = require('../scripts/lib/updater/report');

test('private diff previews preserve inputs and make omitted content explicit', () => {
  const before = Buffer.from('same\r\nold\r\n'); const after = Buffer.from('same\r\nnew\r\n');
  const preview = changePreview(before, after);
  assert.ok(preview.some(line => line.startsWith('REMOVE: old')));
  assert.ok(preview.some(line => line.startsWith('ADD: new')));
  assert.equal(before.toString(), 'same\r\nold\r\n');
  assert.match(changePreview(Buffer.alloc(32769), Buffer.alloc(0))[0], /complete private plan/);
  assert.match(changePreview(Buffer.from([255]), Buffer.from('text'))[0], /Binary/);
});

test('public summaries omit context, candidates and private metadata while preserving scope/status', () => {
  const summary = summarize({ status: 'READY', workspace: '/project', contextBase64: 'PRIVATE_CONTEXT',
    operations: [{ path: 'ai-orchestrator/scripts/file.js', before: { sha256: 'a', metadata: { secret: 'PRIVATE_METADATA' } }, after: { dataBase64: Buffer.from('PRIVATE_CANDIDATE').toString('base64') } }],
    fragments: [{ path: 'AGENTS.md', contentBase64: 'PRIVATE_FRAGMENT', reason: 'Review integration' }] });
  const serialized = JSON.stringify(summary);
  for (const value of ['PRIVATE_CONTEXT', 'PRIVATE_METADATA', 'PRIVATE_CANDIDATE', 'PRIVATE_FRAGMENT', 'dataBase64']) assert.equal(serialized.includes(value), false);
  assert.equal(summary.status, 'READY'); assert.equal(summary.operations[0].path, 'ai-orchestrator/scripts/file.js');
});
