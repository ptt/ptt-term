import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initUAO, b2uTable, u2bTable } from '../src/conv/uao.js';

test('initUAO initializes Big5 tables and applies UAO 2.50 patches', () => {
  initUAO();

  // 1. Standard Big5 character 中 (0xa4a4 -> U+4E2D)
  const bZhong = 0xa4a4;
  assert.equal(b2uTable[bZhong], 0x4e2d);
  assert.equal(u2bTable[0x4e2d], bZhong);

  // 2. Japanese Hiragana and Katakana extensions supported by UAO 2.50
  // あ = U+3042 -> 0xc6e8
  assert.equal(b2uTable[0xc6e8], 0x3042);
  assert.equal(u2bTable[0x3042], 0xc6e8);

  // い = U+3044 -> 0xc6ea
  assert.equal(b2uTable[0xc6ea], 0x3044);
  assert.equal(u2bTable[0x3044], 0xc6ea);

  // ア = U+30a2 -> 0xc77c
  assert.equal(b2uTable[0xc77c], 0x30a2);
  assert.equal(u2bTable[0x30a2], 0xc77c);

  // 3. Special BBS drawing symbols in UAO
  // ★ = U+2605 -> 0xa1b9
  assert.equal(b2uTable[0xa1b9], 0x2605);
  assert.equal(u2bTable[0x2605], 0xa1b9);

  // Repeated call to initUAO is idempotent
  assert.doesNotThrow(() => initUAO());
});
