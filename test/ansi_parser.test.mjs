import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AnsiParser } from '../src/js/ansi_parser.js';

class MockTermBuf {
  constructor() {
    this.output = [];
    this.attrs = [];
    this.cur_x = 0;
    this.cur_y = 0;
  }
  puts(str) {
    this.output.push(str);
  }
  assignParamsToAttrs(params) {
    this.attrs.push(params);
  }
  gotoPos(x, y) {
    this.cur_x = x;
    this.cur_y = y;
  }
  clear() {}
  insert() {}
  tab() {}
}

test('AnsiParser feeds plain text', () => {
  const term = new MockTermBuf();
  const parser = new AnsiParser(term);

  parser.feed('Hello BBS');
  // Parser flushes text on escape or when fed; in text state, it appends to s
  parser.feed('\x1b[0m'); // ESC flushes 'Hello BBS'
  assert.equal(term.output.join(''), 'Hello BBS');
});

test('AnsiParser parses SGR color parameters', () => {
  const term = new MockTermBuf();
  const parser = new AnsiParser(term);

  parser.feed('\x1b[1;33;44mText\x1b[m');
  assert.equal(term.attrs.length, 2);
  assert.deepEqual(term.attrs[0], [1, 33, 44]);
  assert.deepEqual(term.attrs[1], [0]);
  assert.equal(term.output.join(''), 'Text');
});

test('AnsiParser parses cursor movement commands', () => {
  const term = new MockTermBuf();
  const parser = new AnsiParser(term);

  // Move down 3
  parser.feed('\x1b[3B');
  assert.equal(term.cur_y, 3);

  // Move right 5
  parser.feed('\x1b[5C');
  assert.equal(term.cur_x, 5);
});

test('AnsiParser parses real-world ANSI BBS art fixtures without throwing', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const fixtures = ['ptt2.txt'];

  for (const file of fixtures) {
    const filePath = path.resolve('test', file);
    const content = fs.readFileSync(filePath, 'binary');
    const term = new MockTermBuf();
    const parser = new AnsiParser(term);

    assert.doesNotThrow(() => {
      parser.feed(content);
    }, `Failed parsing fixture ${file}`);
  }
});
