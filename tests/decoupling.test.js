const test = require('node:test');
const path = require('node:path');
const { checkLegacyTerms } = require('../scripts/lib/verification.js');

test('agents and skills do not reuse the retired project vocabulary', () => {
  checkLegacyTerms(path.resolve(__dirname, '..'));
});
