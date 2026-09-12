import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TermKeyboard } from '../src/js/term_keyboard.js';
import { PttSite, BaseSite, Maple3Site, AutoSite } from '../src/js/sites/index.js';

function createKeyboard({ isLeftDB = false, isCurDB = false, site = null } = {}) {
  const sent = [];
  const kb = new TermKeyboard((data) => sent.push(data));
  kb.checkLeftDBCS = () => isLeftDB;
  kb.checkCurrentDBCS = () => isCurDB;
  if (site) {
    site.attach(kb);
  }
  return { kb, term: kb, sent };
}

function mockKeyEvent(overrides = {}) {
  let prevented = false;
  return {
    key: '',
    keyCode: 0,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    isComposing: false,
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

test('TermKeyboard dispatches term:key event on key down', () => {
  const events = [];
  const kb = new TermKeyboard(() => {});
  kb.addEventListener('term:key', (e) => events.push(e.detail));

  kb.onKeyDown(mockKeyEvent({ key: 'ArrowLeft' }));
  assert.equal(events.length, 1);
  assert.equal(events[0].key, 'ArrowLeft');
  assert.equal(events[0].mapped, '\x1b[D');
});

test('TermKeyboard sendKey sends sequence without firing term:key', () => {
  const sent = [];
  const events = [];
  const kb = new TermKeyboard((data) => sent.push(data));
  kb.addEventListener('term:key', (e) => events.push(e.detail));

  kb.sendKey('ArrowLeft');
  assert.equal(sent[0], '\x1b[D');
  assert.equal(events.length, 0);
});

test('BaseSite listens to term:key and sends double keystrokes when crossing DBCS characters', () => {
  const baseSite = new BaseSite();
  // Left DBCS: Backspace and ArrowLeft should double
  const leftCtx = createKeyboard({ isLeftDB: true, isCurDB: false, site: baseSite });
  leftCtx.kb.onKeyDown(mockKeyEvent({ key: 'Backspace' }));
  assert.equal(leftCtx.sent.join(''), '\b\b');

  leftCtx.sent.length = 0;
  leftCtx.kb.onKeyDown(mockKeyEvent({ key: 'ArrowLeft' }));
  assert.equal(leftCtx.sent.join(''), '\x1b[D\x1b[D');

  // Current DBCS: Delete and ArrowRight should double
  const curCtx = createKeyboard({ isLeftDB: false, isCurDB: true, site: baseSite });
  curCtx.kb.onKeyDown(mockKeyEvent({ key: 'Delete' }));
  assert.equal(curCtx.sent.join(''), '\x1b[3~\x1b[3~');

  curCtx.sent.length = 0;
  curCtx.kb.onKeyDown(mockKeyEvent({ key: 'ArrowRight' }));
  assert.equal(curCtx.sent.join(''), '\x1b[C\x1b[C');
});

test('BaseSite.checkDBCSCursor checks left and current DBCS conditions', () => {
  const baseSite = new BaseSite();
  assert.equal(baseSite.checkDBCSCursor('Backspace', () => true, () => false), true);
  assert.equal(baseSite.checkDBCSCursor('ArrowLeft', () => true, () => false), true);
  assert.equal(baseSite.checkDBCSCursor('Backspace', () => false, () => false), false);
  assert.equal(baseSite.checkDBCSCursor('Delete', () => false, () => true), true);
  assert.equal(baseSite.checkDBCSCursor('ArrowRight', () => false, () => true), true);
  assert.equal(baseSite.checkDBCSCursor('Delete', () => false, () => false), false);
  assert.equal(baseSite.checkDBCSCursor('Enter', () => true, () => true), false);

  const pttSite = new PttSite();
  assert.equal(pttSite.checkDBCSCursor('Backspace', () => true, () => true), false);
  assert.equal(pttSite.checkDBCSCursor('ArrowLeft', () => true, () => true), false);
  assert.equal(pttSite.checkDBCSCursor('ArrowRight', () => true, () => true), false);
});


test('TermKeyboard with PttSite does NOT double escape sequences for DBCS', () => {
  const pttSite = new PttSite();
  const leftCtx = createKeyboard({ isLeftDB: true, isCurDB: false, site: pttSite });
  leftCtx.kb.onKeyDown(mockKeyEvent({ key: 'Backspace' }));
  assert.equal(leftCtx.sent.join(''), '\b');

  leftCtx.sent.length = 0;
  leftCtx.kb.onKeyDown(mockKeyEvent({ key: 'ArrowLeft' }));
  assert.equal(leftCtx.sent.join(''), '\x1b[D');

  const curCtx = createKeyboard({ isLeftDB: false, isCurDB: true, site: pttSite });
  curCtx.kb.onKeyDown(mockKeyEvent({ key: 'Delete' }));
  assert.equal(curCtx.sent.join(''), '\x1b[3~');

  curCtx.sent.length = 0;
  curCtx.kb.onKeyDown(mockKeyEvent({ key: 'ArrowRight' }));
  assert.equal(curCtx.sent.join(''), '\x1b[C');
});

test('TermKeyboard with Maple3Site doubles escape sequences for DBCS', () => {
  const maple3Site = new Maple3Site();
  const leftCtx = createKeyboard({ isLeftDB: true, isCurDB: false, site: maple3Site });
  leftCtx.kb.onKeyDown(mockKeyEvent({ key: 'Backspace' }));
  assert.equal(leftCtx.sent.join(''), '\b\b');

  leftCtx.sent.length = 0;
  leftCtx.kb.onKeyDown(mockKeyEvent({ key: 'ArrowLeft' }));
  assert.equal(leftCtx.sent.join(''), '\x1b[D\x1b[D');
});

test('TermKeyboard with AutoSite adapts DBCS behavior after locking site', () => {
  const autoSite = new AutoSite();
  const ctx = createKeyboard({ isLeftDB: true, isCurDB: false, site: autoSite });

  // Default active site is PTT: does not double
  ctx.kb.onKeyDown(mockKeyEvent({ key: 'ArrowLeft' }));
  assert.equal(ctx.sent.join(''), '\x1b[D');

  // Lock to Maple 3: now doubles
  ctx.sent.length = 0;
  autoSite.lockSite('maple3');
  ctx.kb.onKeyDown(mockKeyEvent({ key: 'ArrowLeft' }));
  assert.equal(ctx.sent.join(''), '\x1b[D\x1b[D');
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

  // Composing flag for char key
  const compEvent = mockKeyEvent({ key: 'a', isComposing: true });
  kb.onKeyDown(compEvent);
  assert.equal(sent.length, 0);
  assert.equal(compEvent.isDefaultPrevented, false);

  // Composing flag for mapped navigation keys (ArrowDown, ArrowUp, Enter, Backspace)
  for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'Backspace', ' ']) {
    const navCompEvent = mockKeyEvent({ key, isComposing: true });
    kb.onKeyDown(navCompEvent);
    assert.equal(sent.length, 0, `Expected mapped key ${key} to be ignored during composition`);
    assert.equal(navCompEvent.isDefaultPrevented, false);
  }

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
    metaKey: true,
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

test('TermKeyboard safely handles events without getModifierState or missing properties', () => {
  const { kb, sent } = createKeyboard();

  // Bare event without getModifierState or modifiers
  const bareEvent = {
    key: 'x',
    preventDefault() {},
  };
  assert.doesNotThrow(() => {
    kb.onKeyDown(bareEvent);
  });
  assert.deepEqual(sent, ['x']);

  // Bare event with metaKey: true and no getModifierState
  const bareMetaEvent = {
    key: 'c',
    metaKey: true,
    preventDefault() {},
  };
  sent.length = 0;
  assert.doesNotThrow(() => {
    kb.onKeyDown(bareMetaEvent);
  });
  assert.equal(sent.length, 0, 'Meta key without getModifierState should be bypassed');

  // Null/undefined event does not throw
  assert.doesNotThrow(() => {
    kb.onKeyDown(null);
    kb.onKeyDown(undefined);
  });
});

