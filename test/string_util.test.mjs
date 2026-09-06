import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unescapeStr, wrapText, b2u, u2b, isDBCSLead } from '../src/js/string_util.js';

test('unescapeStr parses caret notation correctly', () => {
  assert.equal(unescapeStr('^C'), '\x03');
  assert.equal(unescapeStr('^M'), '\r');
  assert.equal(unescapeStr('^['), '\x1b');
  assert.equal(unescapeStr('^?'), '\x7f');
  assert.equal(unescapeStr('\\^'), '^');
  assert.equal(unescapeStr('\\\\'), '\\');
  assert.equal(unescapeStr('plain text'), 'plain text');
});

test('b2u and u2b round-trip standard Big5 characters', () => {
  // 中 = 0xa4a4
  const big5Zhong = '\xa4\xa4';
  const uZhong = b2u(big5Zhong);
  assert.equal(uZhong, '中');
  assert.equal(u2b(uZhong), big5Zhong);

  // 文 = 0xa4e5
  const big5Wen = '\xa4\xe5';
  const uWen = b2u(big5Wen);
  assert.equal(uWen, '文');
  assert.equal(u2b(uWen), big5Wen);
});

test('b2u handles ASCII and mixed strings', () => {
  const mixed = 'Hello \xa4\xa4\xa4\xe5!';
  assert.equal(b2u(mixed), 'Hello 中文!');
  assert.equal(u2b('Hello 中文!'), mixed);
});

test('isDBCSLead identifies Big5 lead bytes', () => {
  assert.equal(isDBCSLead('\x81'), true);
  assert.equal(isDBCSLead('\xa4'), true);
  assert.equal(isDBCSLead('\xfe'), true);
  assert.equal(isDBCSLead('A'), false);
  assert.equal(isDBCSLead('~'), false);
  assert.equal(isDBCSLead('\x80'), false);
});

test('wrapText wraps within max length without breaking words', () => {
  const text = 'This is a long sentence that needs to be wrapped properly across lines.';
  const wrapped = wrapText(text, 20, '\n');
  const lines = wrapped.split('\n');
  assert.ok(lines.length > 1);
  for (const line of lines) {
    assert.ok(line.length <= 25);
  }
});
