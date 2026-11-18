import test from 'node:test';
import assert from 'node:assert/strict';
import { matches } from '../src/utils/compare.js';

test('matches fuzzy names', () => {
  assert.equal(matches('Castify TV', 'Castify'), true);
  assert.equal(matches('Other App', 'Castify'), false);
  assert.equal(matches('Anything', ''), true);
});
