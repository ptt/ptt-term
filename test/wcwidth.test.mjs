import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  wcwidth,
  isFullWidth,
  stringWidth,
  wcswidth,
  widthTable,
  initWidthTable,
  applyUAOToWidthTable,
} from '../src/js/wcwidth.js';

test('wcwidth returns 0 for null, empty, control, and zero-width characters', () => {
  assert.equal(wcwidth(null), 0);
  assert.equal(wcwidth(undefined), 0);
  assert.equal(wcwidth(''), 0);
  assert.equal(wcwidth('\x00'), 0);
  assert.equal(wcwidth('\n'), 0);
  assert.equal(wcwidth('\r'), 0);
  assert.equal(wcwidth('\x1b'), 0);
  assert.equal(wcwidth('\u200B'), 0); // Zero Width Space
  assert.equal(wcwidth('\uFEFF'), 0); // BOM
  assert.equal(wcwidth('\u00AD'), 0); // Soft Hyphen
});

test('wcwidth returns 1 for ASCII printable characters', () => {
  assert.equal(wcwidth('a'), 1);
  assert.equal(wcwidth('Z'), 1);
  assert.equal(wcwidth('0'), 1);
  assert.equal(wcwidth(' '), 1);
  assert.equal(wcwidth('~'), 1);
  assert.equal(wcwidth(0x41), 1);
});

test('wcwidth returns 2 for CJK ideographs and symbols', () => {
  assert.equal(wcwidth('中'), 2);
  assert.equal(wcwidth('文'), 2);
  assert.equal(wcwidth('批'), 2);
  assert.equal(wcwidth('踢'), 2);
  assert.equal(wcwidth('，'), 2);
  assert.equal(wcwidth('。'), 2);
  assert.equal(wcwidth('！'), 2);
  assert.equal(wcwidth('ㄅ'), 2); // Bopomofo
  assert.equal(wcwidth('あ'), 2); // Hiragana
  assert.equal(wcwidth('ア'), 2); // Katakana
  assert.equal(wcwidth('한'), 2); // Hangul
});

test('wcwidth returns 2 for box-drawing and block symbols', () => {
  assert.equal(wcwidth('─'), 2);
  assert.equal(wcwidth('│'), 2);
  assert.equal(wcwidth('┌'), 2);
  assert.equal(wcwidth('┐'), 2);
  assert.equal(wcwidth('┼'), 2);
  assert.equal(wcwidth('▂'), 2);
  assert.equal(wcwidth('▃'), 2);
  assert.equal(wcwidth('▄'), 2);
  assert.equal(wcwidth('★'), 2);
  assert.equal(wcwidth('→'), 2);
});

test('wcwidth returns 2 for Greek and Cyrillic (East Asian Wide)', () => {
  assert.equal(wcwidth('α'), 2);
  assert.equal(wcwidth('Ω'), 2);
  assert.equal(wcwidth('д'), 2);
  assert.equal(wcwidth('Ж'), 2);
});

test('wcwidth returns 2 for UAO Private Use Area characters', () => {
  assert.equal(wcwidth('\uE000'), 2);
  assert.equal(wcwidth('\uF8F8'), 2);
});

test('wcwidth returns 2 for surrogate pair emojis', () => {
  assert.equal(wcwidth('😀'), 2);
  assert.equal(wcwidth('🚀'), 2);
});

test('wcwidth returns 2 for half-width Katakana in UAO (mapped as double-byte 0xC8xx)', () => {
  // In UAO / symbol_table G1, half-width Katakana (0xFF61..0xFF9F) is mapped as double-byte Big5
  assert.equal(wcwidth('ｱ'), 2);
  assert.equal(wcwidth('ｲ'), 2);
});

test('isFullWidth correctly identifies width 2 characters', () => {
  assert.equal(isFullWidth('A'), false);
  assert.equal(isFullWidth('1'), false);
  assert.equal(isFullWidth('中'), true);
  assert.equal(isFullWidth('★'), true);
  assert.equal(isFullWidth('─'), true);
});

test('stringWidth and wcswidth calculate terminal column width', () => {
  assert.equal(stringWidth(''), 0);
  assert.equal(stringWidth('Hello'), 5);
  assert.equal(stringWidth('你好'), 4);
  assert.equal(stringWidth('Hello 你好!'), 11);
  assert.equal(stringWidth('推 批踢踢'), 9);
  assert.equal(stringWidth('ptt測試'), 7); // 3 + 4 = 7
  assert.equal(stringWidth('A😀B'), 4); // 1 + 2 + 1 = 4
  assert.equal(wcswidth('推 批踢踢'), 9);
});

test('widthTable is a 64KB Uint8Array synchronized with UAO mappings', () => {
  assert.ok(widthTable instanceof Uint8Array);
  assert.equal(widthTable.length, 65536);

  // Soft hyphen is 0
  assert.equal(widthTable[0x00ad], 0);

  // Standard ASCII printable is 1
  assert.equal(widthTable[0x41], 1); // 'A'
  assert.equal(widthTable[0x20], 1); // ' '

  // CJK ideographs and UAO mappings are 2
  assert.equal(widthTable[0x4e2d], 2); // '中'
  assert.equal(widthTable[0x00a2], 2); // '¢' (mapped in UAO)
  assert.equal(widthTable[0x00a3], 2); // '£' (mapped in UAO)
  assert.equal(widthTable[0x0101], 2); // 'ā' (mapped in UAO)
  assert.equal(widthTable[0xff61], 2); // '｡' (halfwidth Katakana mapped in UAO)

  // Test re-initializing width table and applying UAO
  initWidthTable();
  assert.equal(widthTable[0x4e2d], 2);
  assert.equal(widthTable[0x00ad], 0);

  applyUAOToWidthTable();
  assert.equal(widthTable[0x4e2d], 2);
  assert.equal(widthTable[0x00ad], 0);
});

test('wcwidth asserts when string length exceeds 2', () => {
  let assertLogged = false;
  const originalAssert = console.assert;
  console.assert = (condition, msg) => {
    if (!condition) {
      assertLogged = true;
    }
  };
  try {
    wcwidth('hello');
    assert.equal(assertLogged, true);

    assertLogged = false;
    wcwidth('😀'); // length 2 (surrogate pair) -> valid single code point, must NOT assert
    assert.equal(assertLogged, false);

    assertLogged = false;
    wcwidth('中'); // length 1 -> valid single code point, must NOT assert
    assert.equal(assertLogged, false);
  } finally {
    console.assert = originalAssert;
  }
});


