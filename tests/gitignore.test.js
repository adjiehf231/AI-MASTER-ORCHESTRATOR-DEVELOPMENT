const test = require('node:test');
const path = require('node:path');
const { checkGitIgnore } = require('../scripts/lib/verification.js');

test('.gitignore excludes sensitive environment / key files and keeps the example file visible', () => {
  checkGitIgnore(path.resolve(__dirname, '..'));
});
