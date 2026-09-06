import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBadDBCSCode, isForceWidthCode } from '../src/js/symbol_table.js';

test('isBadDBCSCode detects bad DBCS symbols', () => {
  assert.equal(isBadDBCSCode(7922), true);
  assert.equal(isBadDBCSCode(65533), true);
  assert.equal(isBadDBCSCode(65), false); // 'A'
  assert.equal(isBadDBCSCode('A'), false);
});

test('isForceWidthCode detects force-width symbols', () => {
  assert.equal(isForceWidthCode(160), true);
  assert.equal(isForceWidthCode(9825), true);
  assert.equal(isForceWidthCode(330), true);
  assert.equal(isForceWidthCode(65), false); // 'A'
  assert.equal(isForceWidthCode('A'), false);
});
