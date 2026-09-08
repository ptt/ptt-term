import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { AnsiParser } from '../src/js/ansi_parser.js';

const termBufSource = fs.readFileSync(path.resolve('src/js/term_buf.js'), 'utf-8');
const termCharMatch = termBufSource.match(/(class TermChar \{[\s\S]*?\n\})/);
const TermChar = new Function(termCharMatch[1] + '\nreturn TermChar;')();

class MockTermBuf {
  constructor() {
    this.site = { isUtf8: false };
    this.output = [];
    this.attrs = [];
    this.cells = [];
    this.cur_x = 0;
    this.cur_y = 0;
    this.attr = {
      fg: 7, bg: 0, bright: false, invert: false, blink: false, underLine: false,
      assignParams(params) {
        for (const p of params) {
          if (p >= 30 && p <= 37) this.fg = p - 30;
        }
      },
      cloneAttr() {
        return Object.assign({}, this);
      },
      equalsAttr(oth) {
        return oth && this.fg === oth.fg && this.bg === oth.bg;
      }
    };
  }
  puts(str) {
    this.output.push(str);
  }
  putDBCS(ch, leadAttr, trailAttr) {
    this.output.push(ch);
    const lead = new TermChar(ch);
    lead.isDBCSLead = true;
    lead.fg = leadAttr ? leadAttr.fg : this.attr.fg;
    const trail = new TermChar('');
    trail.isDBCSTrail = true;
    trail.fg = trailAttr ? trailAttr.fg : this.attr.fg;
    this.cells.push(lead, trail);
  }
  assignParamsToAttrs(params) {
    this.attrs.push(params);
    this.attr.assignParams(params);
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

  parser.feed('Hello Term');
  // Parser flushes text on escape or when fed; in text state, it appends to s
  parser.feed('\x1b[0m'); // ESC flushes 'Hello Term'
  assert.equal(term.output.join(''), 'Hello Term');
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

test('AnsiParser parses real-world ANSI art fixtures without throwing', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const fixtures = ['ptt1.txt', 'ptt2.txt'];

  for (const file of fixtures) {
    const filePath = path.resolve('test', file);
    const content = fs.readFileSync(filePath, 'binary');
    const term = new MockTermBuf();
    const parser = new AnsiParser(term);

    assert.doesNotThrow(() => {
      parser.feed(content);
    }, `Failed parsing fixture ${file}`);

    if (file === 'ptt1.txt') {
      const output = term.output.join('');
      // Verify no corrupted single-byte fragments for split-color symbols
      assert.equal(output.includes('¢'), false, 'ptt1.txt should not contain broken cent symbols (¢)');
      assert.equal(output.includes('«'), false, 'ptt1.txt should not contain broken angle quotation symbols («)');
      // Verify decoded double-byte symbols are present
      assert.ok(output.includes('◤'), 'ptt1.txt should contain decoded ◤');
      assert.ok(output.includes('▂'), 'ptt1.txt should contain decoded ▂');
      assert.ok(output.includes('▃'), 'ptt1.txt should contain decoded ▃');
      assert.ok(output.includes('▅'), 'ptt1.txt should contain decoded ▅');
      assert.ok(output.includes('▆'), 'ptt1.txt should contain decoded ▆');
    }
  }
});

test('AnsiParser decodes Big5 Uint8Array stream into Unicode characters', () => {
  const term = new MockTermBuf();
  const parser = new AnsiParser(term);

  // '批' (0xA7, 0xE5) followed by '踢' (0xBD, 0xF0)
  const big5Bytes = new Uint8Array([0xa7, 0xe5, 0xbd, 0xf0]);
  parser.feed(big5Bytes);
  assert.equal(term.output.join(''), '批踢');
});

test('AnsiParser decodes Big5 double-byte characters across split chunk boundaries', () => {
  const term = new MockTermBuf();
  const parser = new AnsiParser(term);

  // Chunk 1 ends with lead byte 0xA7 ('批')
  parser.feed(new Uint8Array([0x48, 0x69, 0x20, 0xa7])); // "Hi " + 0xa7
  assert.equal(term.output.join(''), 'Hi ');
  assert.equal(parser.pendingLead, 0xa7);

  // Chunk 2 provides trail byte 0xE5 ('批') and ASCII text
  parser.feed(new Uint8Array([0xe5, 0x21])); // 0xe5 + "!"
  assert.equal(term.output.join(''), 'Hi 批!');
  assert.equal(parser.pendingLead, null);
});

test('AnsiParser decodes Big5 two-color split characters (一字雙色) with distinct attributes', () => {
  const term = new MockTermBuf();
  const parser = new AnsiParser(term);

  // '你' (0xA7, 0x41) split by ESC [ 31 m (red text)
  parser.feed(new Uint8Array([0xa7, 0x1b, 0x5b, 0x33, 0x31, 0x6d, 0x41]));
  assert.equal(term.output.join(''), '你');
  assert.deepEqual(term.attrs[0], [31]);

  // Big5 symbols with 一字雙色 (user reported: ¢«, ¢c, ¢d, ¢f, ¢g)
  // ◤ (0xA2, 0xAB) split by ESC [ 32 m (green)
  parser.feed(new Uint8Array([0xa2, 0x1b, 0x5b, 0x33, 0x32, 0x6d, 0xab]));
  // ▂ (0xA2, 0x63) split by ESC [ 33 m (yellow)
  parser.feed(new Uint8Array([0xa2, 0x1b, 0x5b, 0x33, 0x33, 0x6d, 0x63]));
  // ▃ (0xA2, 0x64) split by ESC [ 34 m (blue)
  parser.feed(new Uint8Array([0xa2, 0x1b, 0x5b, 0x33, 0x34, 0x6d, 0x64]));
  // ▅ (0xA2, 0x66) split by ESC [ 35 m (magenta)
  parser.feed(new Uint8Array([0xa2, 0x1b, 0x5b, 0x33, 0x35, 0x6d, 0x66]));
  // ▆ (0xA2, 0x67) split by ESC [ 36 m (cyan)
  parser.feed(new Uint8Array([0xa2, 0x1b, 0x5b, 0x33, 0x36, 0x6d, 0x67]));

  assert.equal(term.output.join(''), '你◤▂▃▅▆');
});

test('AnsiParser flushes pending lead byte on non-SGR ESC sequence, control characters, and non-trail byte', () => {
  const term = new MockTermBuf();
  const parser = new AnsiParser(term);

  // Feed isolated lead byte 0xA7 followed by cursor movement ESC [ 5 C and 'A'
  parser.feed(new Uint8Array([0xa7, 0x1b, 0x5b, 0x35, 0x43, 0x41]));
  assert.equal(term.output.join(''), '\xa7A');
  assert.equal(term.cur_x, 5);

  // Feed isolated lead byte 0xA7 followed by '\n' and 'B'
  parser.feed(new Uint8Array([0xa7, 0x0a, 0x42]));
  assert.equal(term.output.join(''), '\xa7A\xa7\nB');

  // Feed isolated lead byte 0xA7 followed by SGR ESC [ 31 m and non-trail byte (space 0x20)
  parser.feed(new Uint8Array([0xa7, 0x1b, 0x5b, 0x33, 0x31, 0x6d, 0x20]));
  assert.equal(term.output.join(''), '\xa7A\xa7\nB\xa7 ');
});

test('AnsiParser preserves real-world ANSI art with mixed single-color and two-color blocks', () => {
  const term = new MockTermBuf();
  const parser = new AnsiParser(term);

  // Recreate the user's snippet where split-color blocks previously degraded into ¢« ¢c ¢d ¢f ¢g:
  // ◤ (0xa2, ESC, 0xab)
  // ' '
  // ▃▄▃▅ (0xa264, 0xa265, 0xa264, 0xa266)
  // ▂ (0xa2, ESC, 0x63)
  // ▃ (0xa264)
  // ▅ (0xa2, ESC, 0x66)
  // '     ▍ ▍ ▏  '
  // ▃ (0xa2, ESC, 0x64)
  // ▆ (0xa2, ESC, 0x67)
  // ▃ (0xa2, ESC, 0x64)
  // '   ▍ ▌   ▊   ▏'
  const stream = new Uint8Array([
    // ◤ split color
    0x1b, 0x5b, 0x33, 0x31, 0x6d, 0xa2, 0x1b, 0x5b, 0x33, 0x32, 0x6d, 0xab,
    0x20,
    // ▃▄▃▅ single color
    0xa2, 0x64, 0xa2, 0x65, 0xa2, 0x64, 0xa2, 0x66,
    // ▂ split color
    0xa2, 0x1b, 0x5b, 0x33, 0x33, 0x6d, 0x63,
    // ▃ single color
    0xa2, 0x64,
    // ▅ split color
    0xa2, 0x1b, 0x5b, 0x33, 0x34, 0x6d, 0x66,
    // spaces and single color blocks: ▍ ▍ ▏
    0x20, 0x20, 0x20, 0x20, 0x20, 0xa2, 0x6c, 0x20, 0xa2, 0x6c, 0x20, 0xa2, 0x6a, 0x20, 0x20,
    // ▃ split color
    0xa2, 0x1b, 0x5b, 0x33, 0x35, 0x6d, 0x64,
    // ▆ split color
    0xa2, 0x1b, 0x5b, 0x33, 0x36, 0x6d, 0x67,
    // ▃ split color
    0xa2, 0x1b, 0x5b, 0x33, 0x37, 0x6d, 0x64,
    // spaces and single color blocks: ▍ ▌   ▊   ▏
    0x20, 0x20, 0x20, 0xa2, 0x6c, 0x20, 0xa2, 0x6d, 0x20, 0x20, 0x20, 0xa2, 0x6f, 0x20, 0x20, 0x20, 0xa2, 0x6a
  ]);

  parser.feed(stream);
  const result = term.output.join('');

  // Absolutely no broken cent symbol '¢' should be present
  assert.equal(result.includes('¢'), false);
  assert.equal(result, '◤ ▃▄▃▅▂▃▅     ▍ ▍ ▏  ▃▆▃   ▍ ▌   ▊   ▏');
});

test('AnsiParser preserves raw stream in UTF-8 mode', () => {
  const term = new MockTermBuf();
  term.view = { charset: 'UTF-8' };
  const parser = new AnsiParser(term);

  // In UTF-8 mode, raw UTF-8 bytes or string are passed directly
  parser.feed('中文測試');
  assert.equal(term.output.join(''), '中文測試');
});

test('AnsiParser decodes UTF-8 Uint8Array stream when term.site.isUtf8 is true', () => {
  const term = new MockTermBuf();
  term.site = { isUtf8: true };
  const parser = new AnsiParser(term);

  // Decodes UTF-8 bytes into characters
  parser.feed(new TextEncoder().encode('中文測試'));
  assert.equal(term.output.join(''), '中文測試');

  // Handles character split across chunks
  const term2 = new MockTermBuf();
  term2.site = { isUtf8: true };
  const parser2 = new AnsiParser(term2);
  const bytes = new TextEncoder().encode('你'); // 3 bytes
  parser2.feed(bytes.subarray(0, 2));
  assert.equal(term2.output.join(''), '');
  parser2.feed(bytes.subarray(2));
  assert.equal(term2.output.join(''), '你');
});

test('TermChar supports isDBCSLead and isDBCSTrail', () => {
  const c = new TermChar('中');
  assert.equal(c.isDBCSLead, false);
  assert.equal(c.isDBCSTrail, false);

  c.isDBCSLead = true;
  assert.equal(c.isDBCSLead, true);

  c.isDBCSTrail = true;
  assert.equal(c.isDBCSTrail, true);

  c.isDBCSTrail = false;
  assert.equal(c.isDBCSTrail, false);
});

test('AnsiParser feeds DBCS characters through putDBCS with isDBCSLead and isDBCSTrail', () => {
  const term = new MockTermBuf();
  const parser = new AnsiParser(term);

  // '你' (0xA7, 0x41) split by ESC [ 31 m (red text)
  parser.feed(new Uint8Array([0xa7, 0x1b, 0x5b, 0x33, 0x31, 0x6d, 0x41]));
  assert.equal(term.output.join(''), '你');
  assert.equal(term.cells.length, 2);

  const [leadCell, trailCell] = term.cells;
  assert.equal(leadCell.ch, '你');
  assert.equal(leadCell.isDBCSLead, true);
  assert.equal(leadCell.isDBCSTrail, false);
  assert.equal(leadCell.fg, 7); // Default fg before SGR

  assert.equal(trailCell.ch, '');
  assert.equal(trailCell.isDBCSLead, false);
  assert.equal(trailCell.isDBCSTrail, true);
  assert.equal(trailCell.fg, 1); // Red fg after SGR 31m
});

test('TermBuf getRowText and getText correctly handle DBCS slice boundaries without leaking characters', () => {
  const getRowTextMatch = termBufSource.match(/(getRowText\(row, colStart, colEnd, lines\)\s*\{[\s\S]*?\n  \})/);
  const getTextMatch = termBufSource.match(/(getText\(row, colStart, colEnd, color, isutf8, reset, lines\)\s*\{[\s\S]*?\n  \})/);
  const getRowText = new Function('TermChar', 'return function ' + getRowTextMatch[1])(TermChar);
  const getText = new Function('TermChar', 'return function ' + getTextMatch[1])(TermChar);

  const line = [
    new TermChar('A'),
    new TermChar('你'),
    new TermChar(''),
    new TermChar('好'),
    new TermChar('')
  ];
  line[1].isDBCSLead = true;
  line[2].isDBCSTrail = true;
  line[3].isDBCSLead = true;
  line[4].isDBCSTrail = true;

  const buf = { cols: 5, rows: 1, lines: [line], getRowText, getText, view: { charset: 'UTF-8' } };

  // colEnd = 0 returns empty string
  assert.equal(buf.getRowText(0, 0, 0), '');
  assert.equal(buf.getText(0, 0, 0), '');

  // Slicing column 0 only ('A') must NOT leak column 1 ('你')
  assert.equal(buf.getRowText(0, 0, 1), 'A');
  assert.equal(buf.getText(0, 0, 1), 'A');

  // Slicing columns 0..2 includes 'A' and full DBCS character '你'
  assert.equal(buf.getRowText(0, 0, 2), 'A你');
  assert.equal(buf.getText(0, 0, 2), 'A你');

  // Slicing columns 1..3 includes '你'
  assert.equal(buf.getRowText(0, 1, 3), '你');

  // Slicing column 2 (trail of '你') expands backward to include '你'
  assert.equal(buf.getRowText(0, 2, 3), '你');

  // Slicing columns 3..5 includes '好'
  assert.equal(buf.getRowText(0, 3, 5), '好');
});

test('TermBuf updateCharAttr resets orphaned trail cells to space and clears isDBCSTrail', () => {
  const updateCharAttrMatch = termBufSource.match(/(updateCharAttr\(\)\s*\{[\s\S]*?\n  \})/);
  const isFullWidthMatch = termBufSource.match(/(isFullWidth\(str\)\s*\{[\s\S]*?\n  \})/);
  const isFullWidth = new Function('return function ' + isFullWidthMatch[1])();
  const updateCharAttr = new Function('TermChar', 'return function ' + updateCharAttrMatch[1])(TermChar);

  const line = [
    new TermChar('A'),
    new TermChar('') // orphaned trail cell whose lead cell was overwritten with 'A'
  ];
  line[0].isDBCSLead = false;
  line[0].isDBCSTrail = false;
  line[1].isDBCSLead = false;
  line[1].isDBCSTrail = true;

  const buf = {
    cols: 2,
    rows: 1,
    lines: [line],
    lineChangeds: [false],
    isFullWidth,
    updateCharAttr
  };

  buf.updateCharAttr();
  assert.equal(line[1].ch, ' ');
  assert.equal(line[1].isDBCSTrail, false);
});

test('AnsiParser parses DEC Private Mode 2026 Synchronized Output sequences', () => {
  const term = new MockTermBuf();
  let syncState = [];
  term.beginSyncUpdate = () => syncState.push('begin');
  term.endSyncUpdate = () => syncState.push('end');

  const parser = new AnsiParser(term);
  parser.feed('\x1b[?2026h');
  assert.deepEqual(syncState, ['begin']);

  parser.feed('Hello');
  parser.feed('\x1b[?2026l');
  assert.deepEqual(syncState, ['begin', 'end']);
});

test('TermBuf isFrameReady manages DEC 2026 frame sync and falls back to site isCursorParked', () => {
  const isFrameReadyMatch = termBufSource.match(/(isFrameReady\(\)\s*\{[\s\S]*?\n  \})/);
  assert.ok(isFrameReadyMatch, 'isFrameReady method found');
  const isFrameReady = new Function('return function ' + isFrameReadyMatch[1])();

  const buf = {
    hasFrameSync: true,
    inSyncUpdate: true,
    site: {
      isCursorParked: () => false,
    },
  };
  buf.isFrameReady = isFrameReady.bind(buf);

  // DEC 2026 active: inSyncUpdate -> false regardless of site
  assert.equal(buf.isFrameReady(), false);

  // DEC 2026 active: frame complete (!inSyncUpdate) -> true regardless of site
  buf.inSyncUpdate = false;
  assert.equal(buf.isFrameReady(), true);

  // Legacy mode: fallback to site.isCursorParked
  buf.hasFrameSync = false;
  let siteParked = false;
  buf.site.isCursorParked = () => siteParked;
  assert.equal(buf.isFrameReady(), false);
  siteParked = true;
  assert.equal(buf.isFrameReady(), true);
});

test('TermBuf defers rendering during synchronized update and aligns with V-Sync on endSyncUpdate', () => {
  const beginSyncUpdateMatch = termBufSource.match(/(beginSyncUpdate\(\)\s*\{[\s\S]*?\n  \})/);
  const endSyncUpdateMatch = termBufSource.match(/(endSyncUpdate\(\)\s*\{[\s\S]*?\n  \})/);
  const queueUpdateMatch = termBufSource.match(/(queueUpdate\(directupdate\)\s*\{[\s\S]*?\n  \})/);
  const notifyMatch = termBufSource.match(/(notify\(timer\)\s*\{[\s\S]*?\n  \})/);

  const beginSyncUpdate = new Function('return function ' + beginSyncUpdateMatch[1])();
  const endSyncUpdate = new Function('return function ' + endSyncUpdateMatch[1])();
  const queueUpdate = new Function('return function ' + queueUpdateMatch[1])();
  const notify = new Function('return function ' + notifyMatch[1])();

  const rafCallbacks = new Map();
  let rafIdCounter = 100;
  let cancelCalledWith = null;

  const mockRaf = (cb) => {
    const id = ++rafIdCounter;
    rafCallbacks.set(id, () => {
      rafCallbacks.delete(id);
      cb();
    });
    return id;
  };
  const mockCancelRaf = (id) => {
    cancelCalledWith = id;
    rafCallbacks.delete(id);
  };

  const originalRaf = globalThis.requestAnimationFrame;
  const originalCancelRaf = globalThis.cancelAnimationFrame;

  try {
    globalThis.requestAnimationFrame = mockRaf;
    globalThis.cancelAnimationFrame = mockCancelRaf;

    const events = [];
    let viewUpdates = 0;
    const buf = {
      inSyncUpdate: false,
      hasFrameSync: false,
      _syncUpdateTimeout: null,
      animFrameId: null,
      timerUpdate: null,
      changed: false,
      posChanged: false,
      useMouseBrowsing: false,
      updateCharAttr() {},
      setPageState() {},
      clearHighlight() {},
      dispatchEvent(e) { events.push(e.type); },
      view: {
        update() { viewUpdates++; },
        updateCursorPos() {},
        blinkOn: false,
        onBlinkToggle() {}
      }
    };
    buf.beginSyncUpdate = beginSyncUpdate.bind(buf);
    buf.endSyncUpdate = endSyncUpdate.bind(buf);
    buf.queueUpdate = queueUpdate.bind(buf);
    buf.notify = notify.bind(buf);

    // 1. Enter synchronized update
    buf.beginSyncUpdate();
    assert.equal(buf.inSyncUpdate, true);
    assert.equal(buf.hasFrameSync, true);

    // 2. Buffer mutations occur while inside frame: queueUpdate must NOT schedule notify
    buf.changed = true;
    buf.queueUpdate();
    assert.equal(buf.animFrameId, null);
    assert.equal(buf.timerUpdate, null);
    assert.equal(viewUpdates, 0);

    // 3. Frame completes via endSyncUpdate: dispatches 'frame' and queues update for V-Sync
    buf.endSyncUpdate();
    assert.equal(buf.inSyncUpdate, false);
    assert.equal(buf.hasFrameSync, true);
    assert.ok(events.includes('frame'));
    // V-Sync alignment: rendering is scheduled via rAF, not synchronously flushed yet
    assert.equal(viewUpdates, 0);
    assert.ok(buf.animFrameId !== null);
    assert.equal(rafCallbacks.size, 1);

    // 4. Browser V-Sync tick: rAF callback executes
    const cb = rafCallbacks.get(buf.animFrameId);
    cb();
    assert.equal(buf.animFrameId, null);
    assert.equal(viewUpdates, 1);
    assert.ok(events.includes('change'));
    assert.ok(events.includes('viewUpdate'));
  } finally {
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCancelRaf;
  }
});



