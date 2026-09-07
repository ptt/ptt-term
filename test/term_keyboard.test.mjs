import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TermKeyboard } from '../src/js/term_keyboard.js';

function createKeyboard({ isLeftDB = false, isCurDB = false } = {}) {
  const sent = [];
  const kb = new TermKeyboard(
    () => isLeftDB,
    () => isCurDB,
    (data) => sent.push(data)
  );
  return { kb, sent };
}

function mockKeyEvent(overrides = {}) {
  let prevented = false;
  return {
    key: '',
    keyCode: 0,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    getModifierState: (mod) => false,
    preventDefault: () => { prevented = true; },
    get isDefaultPrevented() { return prevented; },
    ...overrides,
  };
}

test('TermKeyboard maps standard navigation keys without DBCS', () => {
  const { kb, sent } = createKeyboard({ isLeftDB: false, isCurDB: false });

  const navigationCases = [
    { key: 'Backspace', expected: '\b' },
    { key: 'Tab', expected: '\t' },
    { key: 'Enter', expected: '\r' },
    { key: 'Escape', expected: '\x1b' },
    { key: 'Home', expected: '\x1b[1~' },
    { key: 'Insert', expected: '\x1b[2~' },
    { key: 'Delete', expected: '\x1b[3~' },
    { key: 'End', expected: '\x1b[4~' },
    { key: 'PageUp', expected: '\x1b[5~' },
    { key: 'PageDown', expected: '\x1b[6~' },
    { key: 'ArrowUp', expected: '\x1b[A' },
    { key: 'ArrowDown', expected: '\x1b[B' },
    { key: 'ArrowRight', expected: '\x1b[C' },
    { key: 'ArrowLeft', expected: '\x1b[D' },
    // Edge browser legacy names
    { key: 'Up', expected: '\x1b[A' },
    { key: 'Down', expected: '\x1b[B' },
    { key: 'Right', expected: '\x1b[C' },
    { key: 'Left', expected: '\x1b[D' },
  ];

  for (const { key, expected } of navigationCases) {
    const event = mockKeyEvent({ key });
    kb.onKeyDown(event);
    assert.equal(sent[sent.length - 1], expected, `Failed mapping key ${key}`);
    assert.equal(event.isDefaultPrevented, true, `Expected preventDefault for ${key}`);
  }
});

test('TermKeyboard sends double escape sequences when crossing DBCS characters', () => {
  // Left DBCS: Backspace and ArrowLeft should double
  const leftCtx = createKeyboard({ isLeftDB: true, isCurDB: false });
  leftCtx.kb.onKeyDown(mockKeyEvent({ key: 'Backspace' }));
  assert.equal(leftCtx.sent[0], '\b\b');

  leftCtx.kb.onKeyDown(mockKeyEvent({ key: 'ArrowLeft' }));
  assert.equal(leftCtx.sent[1], '\x1b[D\x1b[D');

  // Current DBCS: Delete and ArrowRight should double
  const curCtx = createKeyboard({ isLeftDB: false, isCurDB: true });
  curCtx.kb.onKeyDown(mockKeyEvent({ key: 'Delete' }));
  assert.equal(curCtx.sent[0], '\x1b[3~\x1b[3~');

  curCtx.kb.onKeyDown(mockKeyEvent({ key: 'ArrowRight' }));
  assert.equal(curCtx.sent[1], '\x1b[C\x1b[C');
});

test('TermKeyboard sends single printable characters', () => {
  const { kb, sent } = createKeyboard();

  const chars = ['a', 'Z', '9', ' ', '/', '中'];
  for (const ch of chars) {
    const event = mockKeyEvent({ key: ch });
    kb.onKeyDown(event);
    assert.equal(sent[sent.length - 1], ch);
    assert.equal(event.isDefaultPrevented, true);
  }
});

test('TermKeyboard ignores key events during IME composition', () => {
  const { kb, sent } = createKeyboard();

  // Composing flag
  const compEvent = mockKeyEvent({ key: 'a', isComposing: true });
  kb.onKeyDown(compEvent);
  assert.equal(sent.length, 0);
  assert.equal(compEvent.isDefaultPrevented, false);

  // keyCode 229 (standard IME composition keycode)
  const imeEvent = mockKeyEvent({ key: 'Process', keyCode: 229 });
  kb.onKeyDown(imeEvent);
  assert.equal(sent.length, 0);
  assert.equal(imeEvent.isDefaultPrevented, false);
});

test('TermKeyboard maps Ctrl+letter combinations to ASCII control codes 1-26', () => {
  const { kb, sent } = createKeyboard();

  // Ctrl+A (1) through Ctrl+Z (26)
  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(97 + i);
    const event = mockKeyEvent({ key: letter, ctrlKey: true });
    kb.onKeyDown(event);
    assert.equal(sent[sent.length - 1], String.fromCharCode(i + 1), `Failed Ctrl+${letter}`);
    assert.equal(event.isDefaultPrevented, true);
  }
});

test('TermKeyboard maps Ctrl+punctuation and special symbols', () => {
  const { kb, sent } = createKeyboard();

  const cases = [
    { key: '@', expected: '\x00' },
    { key: '[', expected: '\x1b' },
    { key: '\\', expected: '\x1c' },
    { key: ']', expected: '\x1d' },
    { key: '^', expected: '\x1e' },
    { key: '_', expected: '\x1f' },
    { key: '?', expected: '\x7f' },
  ];

  for (const { key, expected } of cases) {
    const event = mockKeyEvent({ key, ctrlKey: true });
    kb.onKeyDown(event);
    assert.equal(sent[sent.length - 1], expected, `Failed Ctrl+${key}`);
    assert.equal(event.isDefaultPrevented, true);
  }
});

test('TermKeyboard remaps Alt shortcuts that conflict with browser hotkeys', () => {
  const { kb, sent } = createKeyboard();

  // Alt+R -> Ctrl+R (18), Alt+T -> Ctrl+T (20), Alt+W -> Ctrl+W (23), Alt+A -> Ctrl+A (1)
  const cases = [
    { key: 'r', expected: String.fromCharCode(18) },
    { key: 't', expected: String.fromCharCode(20) },
    { key: 'w', expected: String.fromCharCode(23) },
    { key: 'a', expected: String.fromCharCode(1) },
    // Uppercase key when capslock is on
    { key: 'R', expected: String.fromCharCode(18) },
  ];

  for (const { key, expected } of cases) {
    const event = mockKeyEvent({ key, altKey: true });
    kb.onKeyDown(event);
    assert.equal(sent[sent.length - 1], expected, `Failed Alt+${key}`);
    assert.equal(event.isDefaultPrevented, true);
  }
});

test('TermKeyboard bypasses Meta modifier and Shift-Insert', () => {
  const { kb, sent } = createKeyboard();

  // Meta key (Cmd / Win)
  const metaEvent = mockKeyEvent({
    key: 'c',
    getModifierState: (mod) => mod === 'Meta',
  });
  kb.onKeyDown(metaEvent);
  assert.equal(sent.length, 0);
  assert.equal(metaEvent.isDefaultPrevented, false);

  // Shift-Insert paste
  const pasteEvent = mockKeyEvent({
    key: 'Insert',
    shiftKey: true,
  });
  kb.onKeyDown(pasteEvent);
  assert.equal(sent.length, 0);
  assert.equal(pasteEvent.isDefaultPrevented, false);
});
