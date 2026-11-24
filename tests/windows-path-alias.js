const path = require('node:path');
const { spawnSync } = require('node:child_process');

function shortDirectoryAlias(directory) {
  if (process.platform !== 'win32') return null;
  // The command is fixed. The fixture path is passed through the environment and remains quoted.
  const result = spawnSync(process.env.ComSpec ?? 'cmd.exe', [
    '/d', '/e:on', '/v:off', '/c', 'for %I in ("%AOM_CONTEXT_ALIAS_FIXTURE%") do @echo "%~sI"'
  ], {
    encoding: 'utf8', windowsHide: true, windowsVerbatimArguments: true, timeout: 10_000,
    env: { ...process.env, AOM_CONTEXT_ALIAS_FIXTURE: directory }
  });
  if (result.error || result.status !== 0 || !result.stdout.trim()) {
    throw new Error('Cannot obtain the Windows short path for the test fixture.', { cause: result.error });
  }
  const quotedAlias = result.stdout.trim();
  if (!quotedAlias.startsWith('"') || !quotedAlias.endsWith('"')) {
    throw new Error('The Windows short path response must stay quoted.');
  }
  const alias = quotedAlias.slice(1, -1);
  return path.relative(alias, directory) ? alias : null;
}

module.exports = { shortDirectoryAlias };
