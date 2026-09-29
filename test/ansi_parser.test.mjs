import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { AnsiParser } from '../src/js/ansi_parser.js';
import { isFullWidth } from '../src/js/wcwidth.js';

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
  const updateCharAttr = new Function(
    'TermChar',
    'isFullWidth',
    'return function ' + updateCharAttrMatch[1]
  )(TermChar, isFullWidth);

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
      updateCharAttr() {},
      setPageState() {},
      clearHighlight() {},
      emit(type) {
        events.push(type);
        if (type === 'change') viewUpdates++;
      },
      dispatchEvent(e) { events.push(e.type); },
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

test('AnsiParser parses VT100 DECAWM (DECSET 7 / DECRST 7)', () => {
  const calls = [];
  const mockTerm = {
    puts() {},
    assignParamsToAttrs() {},
    gotoPos() {},
    clear() {},
    insert() {},
    tab() {},
    beginSyncUpdate() {},
    endSyncUpdate() {},
    handleDECSET(mode) { calls.push(['DECSET', mode]); },
    handleDECRST(mode) { calls.push(['DECRST', mode]); },
  };

  const parser = new AnsiParser(mockTerm);

  // DECRST 7: Turn auto-wrap OFF (CSI ? 7 l)
  parser.feed('\x1b[?7l');
  assert.deepEqual(calls[0], ['DECRST', 7]);

  // DECSET 7: Turn auto-wrap ON (CSI ? 7 h)
  parser.feed('\x1b[?7h');
  assert.deepEqual(calls[1], ['DECSET', 7]);

  // Compound parameters with mode 7
  parser.feed('\x1b[?7;1000h');
  assert.deepEqual(calls[2], ['DECSET', 7]);
  assert.deepEqual(calls[3], ['DECSET', 1000]);
});

test('TermBuf handles VT100 DECAWM and prevents auto-wrap when wrap=false', async () => {
  const { TermBuf } = await import('../src/js/term_buf.js');
  const buf = new TermBuf(80, 24);
  const parser = new AnsiParser(buf);

  // Default autoWrap is true
  assert.equal(buf.autoWrap, true);
  assert.equal(buf.wrap, true);

  // Print 85 ASCII characters: should wrap to row 1, col 5
  parser.feed('A'.repeat(85));
  assert.equal(buf.cur_y, 1);
  assert.equal(buf.cur_x, 5);

  // Reset to (0, 0)
  buf.gotoPos(0, 0);

  // Turn auto-wrap OFF via VT100 DECAWM sequence: CSI ? 7 l
  parser.feed('\x1b[?7l');
  assert.equal(buf.autoWrap, false);
  assert.equal(buf.wrap, false);

// Print 85 ASCII characters: must NOT wrap to row 1, clamps at col 79
  buf.gotoPos(0, 0);
  parser.feed('B'.repeat(85));
  assert.equal(buf.cur_y, 0, 'cur_y must stay on row 0 when autoWrap is off');
  assert.equal(buf.cur_x, 79, 'cur_x must clamp to cols - 1 (79) when autoWrap is off');

  // Turn auto-wrap ON via VT100 DECAWM sequence: CSI ? 7 h
  parser.feed('\x1b[?7h');
  assert.equal(buf.autoWrap, true);
  assert.equal(buf.wrap, true);

  // Printing next characters wraps to row 1
  parser.feed('CD');
  assert.equal(buf.cur_y, 1);
  assert.equal(buf.cur_x, 1);
});

test('AnsiParser parses VT100 DECSTBM (CSI Pt ; Pb r)', () => {
  const calls = [];
  const mockTerm = {
    rows: 24,
    puts() {},
    assignParamsToAttrs() {},
    gotoPos() {},
    clear() {},
    insert() {},
    tab() {},
    beginSyncUpdate() {},
    endSyncUpdate() {},
    handleDECSTBM(top, bottom) { calls.push(['DECSTBM', top, bottom]); },
  };

  const parser = new AnsiParser(mockTerm);

  // Default / reset: CSI r -> (1, 24)
  parser.feed('\x1b[r');
  assert.deepEqual(calls[0], ['DECSTBM', 1, 24]);

  // CSI ; r -> (1, 24)
  parser.feed('\x1b[;r');
  assert.deepEqual(calls[1], ['DECSTBM', 1, 24]);

  // Explicit margins: CSI 5 ; 20 r -> (5, 20)
  parser.feed('\x1b[5;20r');
  assert.deepEqual(calls[2], ['DECSTBM', 5, 20]);

  // Top specified, bottom omitted: CSI 10 r -> (10, 24)
  parser.feed('\x1b[10r');
  assert.deepEqual(calls[3], ['DECSTBM', 10, 24]);

  // Top specified with semicolon: CSI 10 ; r -> (10, 24)
  parser.feed('\x1b[10;r');
  assert.deepEqual(calls[4], ['DECSTBM', 10, 24]);

  // Top omitted, bottom specified: CSI ; 15 r -> (1, 15)
  parser.feed('\x1b[;15r');
  assert.deepEqual(calls[5], ['DECSTBM', 1, 15]);
});

test('TermBuf handles DECSTBM and clamps/ignores invalid parameters', async () => {
  const { TermBuf } = await import('../src/js/term_buf.js');
  const buf = new TermBuf(80, 24);
  const parser = new AnsiParser(buf);

  // Initial full screen margins (0-based: 0..23)
  assert.equal(buf.scrollStart, 0);
  assert.equal(buf.scrollEnd, 23);

  // Position cursor away from home
  buf.gotoPos(10, 10);
  assert.equal(buf.cur_x, 10);
  assert.equal(buf.cur_y, 10);

  // Valid margins: 5..20 (1-based), 0-based: 4..19. Cursor moves to (0, 0)
  parser.feed('\x1b[5;20r');
  assert.equal(buf.scrollStart, 4);
  assert.equal(buf.scrollEnd, 19);
  assert.equal(buf.cur_x, 0);
  assert.equal(buf.cur_y, 0);

  // Invalid: Pt >= Pb (e.g. 20;5) must be ignored, margins & cursor untouched
  buf.gotoPos(5, 5);
  parser.feed('\x1b[20;5r');
  assert.equal(buf.scrollStart, 4, 'Invalid Pt >= Pb must not change scrollStart');
  assert.equal(buf.scrollEnd, 19, 'Invalid Pt >= Pb must not change scrollEnd');
  assert.equal(buf.cur_x, 5, 'Invalid sequence must not move cursor');
  assert.equal(buf.cur_y, 5);

  // Invalid: Pt == Pb (e.g. 10;10) must be ignored
  parser.feed('\x1b[10;10r');
  assert.equal(buf.scrollStart, 4);
  assert.equal(buf.scrollEnd, 19);

  // Invalid: Pb > rows (e.g. 1;30 on 24-row term) must be ignored
  parser.feed('\x1b[1;30r');
  assert.equal(buf.scrollStart, 4);
  assert.equal(buf.scrollEnd, 19);

  // Reset margins: CSI r
  parser.feed('\x1b[r');
  assert.equal(buf.scrollStart, 0);
  assert.equal(buf.scrollEnd, 23);
  assert.equal(buf.cur_x, 0);
  assert.equal(buf.cur_y, 0);
});

test('TermBuf lineFeed with DECSTBM margins scrolls within margins and preserves outside rows', async () => {
  const { TermBuf } = await import('../src/js/term_buf.js');
  const buf = new TermBuf(80, 24);
  const parser = new AnsiParser(buf);

  // Populate rows 0..23 with identifiable text
  for (let r = 0; r < 24; ++r) {
    buf.gotoPos(0, r);
    parser.feed(`Line ${r.toString().padStart(2, '0')}`);
  }

  // Set scrolling region: lines 5..10 (1-based -> rows 4..9 in 0-based)
  parser.feed('\x1b[5;10r');
  assert.equal(buf.scrollStart, 4);
  assert.equal(buf.scrollEnd, 9);

  // Move cursor to bottom of scroll region (row 9)
  buf.gotoPos(0, 9);

  // Linefeed: should scroll rows 4..9 up by 1 line
  buf.lineFeed();

  // Verify rows 0..3 (above margin) are untouched
  for (let r = 0; r < 4; ++r) {
    const text = buf.getText(r, 0, 7);
    assert.equal(text, `Line ${r.toString().padStart(2, '0')}`);
  }

  // Verify scrolled region:
  // Row 4 was old row 5
  assert.equal(buf.getText(4, 0, 7), 'Line 05');
  // Row 8 was old row 9
  assert.equal(buf.getText(8, 0, 7), 'Line 09');
  // Row 9 is newly cleared blank line
  assert.equal(buf.getText(9, 0, 7).trim(), '');

  // Verify rows 10..23 (below margin) are untouched
  for (let r = 10; r < 24; ++r) {
    const text = buf.getText(r, 0, 7);
    assert.equal(text, `Line ${r.toString().padStart(2, '0')}`);
  }

  // Cursor remains at row 9
  assert.equal(buf.cur_y, 9);

  // Cursor below margin: linefeed advances cursor without scrolling margin
  buf.gotoPos(0, 20);
  buf.lineFeed();
  assert.equal(buf.cur_y, 21);
  assert.equal(buf.getText(4, 0, 7), 'Line 05', 'Margin must not scroll when cursor is below margin');

  // Cursor at bottom of screen (row 23) outside margin: linefeed does not scroll
  buf.gotoPos(0, 23);
  buf.lineFeed();
  assert.equal(buf.cur_y, 23);
  assert.equal(buf.getText(4, 0, 7), 'Line 05');
});

test('TermBuf reverseLineFeed (ESC M) with DECSTBM margins scrolls down at top margin', async () => {
  const { TermBuf } = await import('../src/js/term_buf.js');
  const buf = new TermBuf(80, 24);
  const parser = new AnsiParser(buf);

  // Populate rows 0..23 with identifiable text
  for (let r = 0; r < 24; ++r) {
    buf.gotoPos(0, r);
    parser.feed(`Line ${r.toString().padStart(2, '0')}`);
  }

  // Set margins to lines 5..10 (rows 4..9)
  parser.feed('\x1b[5;10r');

  // Position cursor inside margin but below top margin (row 6)
  buf.gotoPos(0, 6);
  // ESC M: cursor moves up to row 5, no scroll
  parser.feed('\x1bM');
  assert.equal(buf.cur_y, 5);
  assert.equal(buf.getText(4, 0, 7), 'Line 04');

  // Move to top margin (row 4)
  buf.gotoPos(0, 4);
  // ESC M at top margin: scrolls margin DOWN by 1 line
  parser.feed('\x1bM');
  assert.equal(buf.cur_y, 4, 'Cursor must stay at top margin after scroll down');

  // Row 4 is newly cleared blank line
  assert.equal(buf.getText(4, 0, 7).trim(), '');
  // Old row 4 moved to row 5
  assert.equal(buf.getText(5, 0, 7), 'Line 04');
  // Old row 8 moved to row 9
  assert.equal(buf.getText(9, 0, 7), 'Line 08');

  // Rows 0..3 and 10..23 outside margin are untouched
  assert.equal(buf.getText(3, 0, 7), 'Line 03');
  assert.equal(buf.getText(10, 0, 7), 'Line 10');
});

test('TermBuf insertLine and deleteLine respect DECSTBM scrolling margins', async () => {
  const { TermBuf } = await import('../src/js/term_buf.js');
  const buf = new TermBuf(80, 24);
  const parser = new AnsiParser(buf);

  for (let r = 0; r < 24; ++r) {
    buf.gotoPos(0, r);
    parser.feed(`Line ${r.toString().padStart(2, '0')}`);
  }

  // Margins: lines 5..10 (rows 4..9)
  parser.feed('\x1b[5;10r');

  // 1. Cursor outside margins (row 2): IL and DL have no effect
  buf.gotoPos(0, 2);
  parser.feed('\x1b[1L'); // Insert Line
  assert.equal(buf.getText(2, 0, 7), 'Line 02', 'IL outside margin must be ignored');
  parser.feed('\x1b[1M'); // Delete Line
  assert.equal(buf.getText(2, 0, 7), 'Line 02', 'DL outside margin must be ignored');

  // 2. Cursor inside margins (row 6):
  buf.gotoPos(0, 6);
  // Delete Line (CSI 1 M): deletes row 6, shifts rows 7..9 up to 6..8, blanks row 9
  parser.feed('\x1b[1M');
  assert.equal(buf.getText(6, 0, 7), 'Line 07');
  assert.equal(buf.getText(7, 0, 7), 'Line 08');
  assert.equal(buf.getText(8, 0, 7), 'Line 09');
  assert.equal(buf.getText(9, 0, 7).trim(), '');
  // Rows outside margin untouched
  assert.equal(buf.getText(3, 0, 7), 'Line 03');
  assert.equal(buf.getText(10, 0, 7), 'Line 10');

  // Insert Line (CSI 1 L) at row 6: shifts rows 6..8 down to 7..9, blanks row 6
  parser.feed('\x1b[1L');
  assert.equal(buf.getText(6, 0, 7).trim(), '');
  assert.equal(buf.getText(7, 0, 7), 'Line 07');
  assert.equal(buf.getText(8, 0, 7), 'Line 08');
  assert.equal(buf.getText(9, 0, 7), 'Line 09');
  assert.equal(buf.getText(3, 0, 7), 'Line 03');
  assert.equal(buf.getText(10, 0, 7), 'Line 10');
});

test('TermBuf resize, connect, and disconnect reset DECSTBM margins', async () => {
  const { TermBuf } = await import('../src/js/term_buf.js');
  const buf = new TermBuf(80, 24);
  const parser = new AnsiParser(buf);

  // Set subregion margins
  parser.feed('\x1b[5;15r');
  assert.equal(buf.scrollStart, 4);
  assert.equal(buf.scrollEnd, 14);

  // Buffer resize resets margins to full height
  buf.resize(100, 30);
  assert.equal(buf.scrollStart, 0);
  assert.equal(buf.scrollEnd, 29);

  // Re-set margins on resized buffer
  parser.feed('\x1b[8;25r');
  assert.equal(buf.scrollStart, 7);
  assert.equal(buf.scrollEnd, 24);

  // Connect event resets margins
  buf.emit('term:connect');
  assert.equal(buf.scrollStart, 0);
  assert.equal(buf.scrollEnd, 29);

  // Disconnect event resets margins
  parser.feed('\x1b[8;25r');
  assert.equal(buf.scrollStart, 7);
  buf.emit('term:disconnect');
  assert.equal(buf.scrollStart, 0);
  assert.equal(buf.scrollEnd, 29);
});

test('AnsiParser parses OSC 8 hyperlink sequences (open and close, ST and BEL terminated)', () => {
  const calls = [];
  const mockTerm = {
    puts() {},
    setHyperlink(url, params) { calls.push(['OSC8', url, params]); },
    setTitle() {},
  };

  const parser = new AnsiParser(mockTerm);

  // 1. Open hyperlink with ST (\x1b\) terminator
  parser.feed('\x1b]8;;https://term.ptt.cc\x1b\\');
  assert.deepEqual(calls[0], ['OSC8', 'https://term.ptt.cc', '']);

  // 2. Open hyperlink with parameters (e.g. id=link1) and BEL (\x07) terminator
  parser.feed('\x1b]8;id=link1;https://example.com/path?a=1;b=2\x07');
  assert.deepEqual(calls[1], ['OSC8', 'https://example.com/path?a=1;b=2', 'id=link1']);

  // 3. Close hyperlink with ST
  parser.feed('\x1b]8;;\x1b\\');
  assert.deepEqual(calls[2], ['OSC8', '', '']);

  // 4. Close hyperlink with BEL and optional id
  parser.feed('\x1b]8;id=link1;\x07');
  assert.deepEqual(calls[3], ['OSC8', '', 'id=link1']);
});

test('TermBuf creates clickable hyperlinks for OSC 8 anchor text and DBCS characters', async () => {
  const { TermBuf } = await import('../src/js/term_buf.js');
  const buf = new TermBuf(80, 24);
  const parser = new AnsiParser(buf);

  // Write text with OSC 8: 'PTT Web' linked to https://term.ptt.cc
  buf.gotoPos(0, 0);
  parser.feed('\x1b]8;;https://term.ptt.cc\x1b\\PTT Web\x1b]8;;\x1b\\ Plain Text');
  buf.updateCharAttr();

  // Verify 'PTT Web' (cols 0..6) are recognized as a hyperlink
  assert.equal(buf.lines[0][0].isStartOfURL(), true);
  assert.equal(buf.lines[0][0].getFullURL(), 'https://term.ptt.cc');
  for (let c = 0; c <= 6; ++c) {
    assert.equal(buf.lines[0][c].isPartOfURL(), true, `Col ${c} must be partOfURL`);
  }
  assert.equal(buf.lines[0][6].isEndOfURL(), true);

  // Verify ' Plain Text' (cols 7..) is NOT part of the URL
  for (let c = 7; c < 18; ++c) {
    assert.equal(buf.lines[0][c].isPartOfURL(), false, `Col ${c} must not be partOfURL`);
  }

  // Row 1: Write Chinese DBCS text with OSC 8: '批踢踢' (3 full-width chars = 6 cols)
  buf.gotoPos(0, 1);
  parser.feed('\x1b]8;;https://www.ptt.cc\x1b\\批踢踢\x1b]8;;\x1b\\');
  buf.updateCharAttr();
  assert.equal(buf.lines[1][0].isStartOfURL(), true);
  assert.equal(buf.lines[1][0].getFullURL(), 'https://www.ptt.cc');
  for (let c = 0; c < 6; ++c) {
    assert.equal(buf.lines[1][c].isPartOfURL(), true);
  }
  assert.equal(buf.lines[1][5].isEndOfURL(), true);
  assert.equal(buf.lines[1][6].isPartOfURL(), false);
});

test('TermBuf handles adjacent distinct OSC 8 hyperlinks without merging', async () => {
  const { TermBuf } = await import('../src/js/term_buf.js');
  const buf = new TermBuf(80, 24);
  const parser = new AnsiParser(buf);

  // Two adjacent links: 'First' (5 cols) and 'Second' (6 cols)
  buf.gotoPos(0, 0);
  parser.feed('\x1b]8;;https://first.com\x1b\\First\x1b]8;;\x1b\\\x1b]8;;https://second.com\x1b\\Second\x1b]8;;\x1b\\');
  buf.updateCharAttr();

  const line = buf.lines[0];
  assert.equal(line.uris.length, 2, 'Must create 2 separate URI spans');

  // Link 1: 0..4
  assert.equal(line[0].isStartOfURL(), true);
  assert.equal(line[0].getFullURL(), 'https://first.com');
  assert.equal(line[4].isEndOfURL(), true);

  // Link 2: 5..10
  assert.equal(line[5].isStartOfURL(), true);
  assert.equal(line[5].getFullURL(), 'https://second.com');
  assert.equal(line[10].isEndOfURL(), true);
});

test('TermBuf only accepts http:// and https:// URI schemes in OSC 8', async () => {
  const { TermBuf } = await import('../src/js/term_buf.js');
  const buf = new TermBuf(80, 24);
  const parser = new AnsiParser(buf);

  // Attempt javascript: URI
  buf.gotoPos(0, 0);
  parser.feed('\x1b]8;;javascript:alert(1)\x1b\\Evil Link\x1b]8;;\x1b\\');
  buf.updateCharAttr();
  assert.equal(buf.lines[0][0].isStartOfURL(), false);
  assert.equal(buf.lines[0][0].isPartOfURL(), false);

  // Attempt data: URI
  buf.gotoPos(0, 1);
  parser.feed('\x1b]8;;data:text/html,<script>alert(1)</script>\x1b\\Evil Data\x1b]8;;\x1b\\');
  buf.updateCharAttr();
  assert.equal(buf.lines[1][0].isStartOfURL(), false);
  assert.equal(buf.lines[1][0].isPartOfURL(), false);

  // Attempt file: URI
  buf.gotoPos(0, 2);
  parser.feed('\x1b]8;;file:///etc/passwd\x1b\\Local File\x1b]8;;\x1b\\');
  buf.updateCharAttr();
  assert.equal(buf.lines[2][0].isStartOfURL(), false);
  assert.equal(buf.lines[2][0].isPartOfURL(), false);

  // Attempt telnet: URI
  buf.gotoPos(0, 3);
  parser.feed('\x1b]8;;telnet://ptt.cc\x1b\\Telnet\x1b]8;;\x1b\\');
  buf.updateCharAttr();
  assert.equal(buf.lines[3][0].isStartOfURL(), false);
  assert.equal(buf.lines[3][0].isPartOfURL(), false);

  // Valid http: URI
  buf.gotoPos(0, 4);
  parser.feed('\x1b]8;;http://ptt.cc\x1b\\HTTP Link\x1b]8;;\x1b\\');
  buf.updateCharAttr();
  assert.equal(buf.lines[4][0].isStartOfURL(), true);
  assert.equal(buf.lines[4][0].getFullURL(), 'http://ptt.cc');

  // Valid https: URI
  buf.gotoPos(0, 5);
  parser.feed('\x1b]8;;HTTPS://term.ptt.cc\x1b\\HTTPS Link\x1b]8;;\x1b\\');
  buf.updateCharAttr();
  assert.equal(buf.lines[5][0].isStartOfURL(), true);
  assert.equal(buf.lines[5][0].getFullURL(), 'HTTPS://term.ptt.cc');
});
