import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Locator } from '../src/js/locator.js';
import { AnsiParser } from '../src/js/ansi_parser.js';
import { MouseBrowsing } from '../src/plugins/mouse_browsing/MouseBrowsing.js';
import { readValuesWithDefault } from '../src/js/pref.js';

class MockTermBuf {
  constructor(cols = 80, rows = 24) {
    this.cols = cols;
    this.rows = rows;
    this.cur_x = 0;
    this.cur_y = 0;
    this.locator = new Locator(this);
    this.view = null;
  }


  handleDECSET(mode) {
    this.locator?.handleDECSET(mode);
  }

  handleDECRST(mode) {
    this.locator?.handleDECRST(mode);
  }
}

test('Locator defaults to inactive and handles DECSET 1000/1006', () => {
  const locator = new Locator(null);
  assert.equal(locator.isActive(), false);

  locator.handleDECSET(1000);
  assert.equal(locator.isActive(), true);
  assert.equal(locator.mouseTrackingMode, 1000);

  locator.handleDECRST(1000);
  assert.equal(locator.isActive(), false);
});

test('Locator formats SGR click and location correctly', () => {
  const locator = new Locator(null);
  locator.handleDECSET(1000);

  // Left click at col 10, row 5 (0-indexed: col 9, row 4)
  const clickSeq = locator.handleMouseClick({ button: 0 }, { col: 9, row: 4 });
  assert.equal(clickSeq, '\x1b[<0;10;5M\x1b[<0;10;5m');

  // Middle click at col 20, row 8 (0-indexed: col 19, row 7)
  const midClickSeq = locator.handleMouseClick({ button: 1 }, { col: 19, row: 7 });
  assert.equal(midClickSeq, '\x1b[<1;20;8M\x1b[<1;20;8m');

  // Right click at col 30, row 15 (0-indexed: col 29, row 14)
  const rightClickSeq = locator.handleMouseClick({ button: 2 }, { col: 29, row: 14 });
  assert.equal(rightClickSeq, '\x1b[<2;30;15M\x1b[<2;30;15m');
});

test('Locator supports mousedown and mouseup separately', () => {
  const locator = new Locator(null);
  locator.handleDECSET(1000);

  // Mouse down left button at col 12, row 6
  const downSeq = locator.handleMouseDown({ button: 0 }, { col: 11, row: 5 });
  assert.equal(downSeq, '\x1b[<0;12;6M');
  assert.equal(locator.downButtons.has(0), true);

  // Mouse up left button
  const upSeq = locator.handleMouseUp({ button: 0 }, { col: 11, row: 5 });
  assert.equal(upSeq, '\x1b[<0;12;6m');
  assert.equal(locator.downButtons.has(0), false);
});

test('Locator handles motion reporting for 1002 (drag) and 1003 (any motion)', () => {
  const locator = new Locator(null);

  // Normal 1000 mode does not track motion without click
  locator.handleDECSET(1000);
  assert.equal(locator.requiresMotionReports(), false);
  assert.equal(locator.handleMouseMove(null, { col: 10, row: 10 }), null);

  // Button-event tracking (1002): tracks motion while a button is down
  locator.handleDECSET(1002);
  assert.equal(locator.requiresMotionReports(), false);
  locator.downButtons.add(0); // left button pressed
  assert.equal(locator.requiresMotionReports(), true);
  const dragSeq = locator.handleMouseMove(null, { col: 14, row: 9 });
  assert.equal(dragSeq, '\x1b[<32;15;10M'); // 0 | 32 = 32 (motion)

  locator.downButtons.clear();

  // Any-event tracking (1003): tracks all motion
  locator.handleDECSET(1003);
  assert.equal(locator.requiresMotionReports(), true);
  const anyMotionSeq = locator.handleMouseMove(null, { col: 20, row: 15 });
  assert.equal(anyMotionSeq, '\x1b[<32;21;16M');
});

test('Locator handles mouse wheel in SGR format', () => {
  const locator = new Locator(null);
  locator.handleDECSET(1000);

  // Wheel up (button 64)
  const wheelUp = locator.handleWheel({ deltaY: -100 }, { col: 9, row: 4 });
  assert.equal(wheelUp, '\x1b[<64;10;5M');

  // Wheel down (button 65)
  const wheelDown = locator.handleWheel({ deltaY: 100 }, { col: 9, row: 4 });
  assert.equal(wheelDown, '\x1b[<65;10;5M');
});

test('Locator shiftKey bypasses mouse reporting for native browser text selection', () => {
  const locator = new Locator(null);
  locator.handleDECSET(1000);

  assert.equal(locator.handleMouseClick({ button: 0, shiftKey: true }, { col: 9, row: 4 }), null);
  assert.equal(locator.handleMouseDown({ button: 0, shiftKey: true }, { col: 9, row: 4 }), null);
  assert.equal(locator.handleMouseUp({ button: 0, shiftKey: true }, { col: 9, row: 4 }), null);
  assert.equal(locator.handleWheel({ deltaY: 100, shiftKey: true }, { col: 9, row: 4 }), null);
});

test('Locator enabled flag toggles isActive and suppresses reporting when false', () => {
  const locator = new Locator(null, { enabled: false });
  locator.handleDECSET(1000);

  assert.equal(locator.isActive(), false);
  assert.equal(locator.handleMouseClick({ button: 0 }, { col: 5, row: 5 }), null);

  locator.enabled = true;
  assert.equal(locator.isActive(), true);
  assert.equal(locator.handleMouseClick({ button: 0 }, { col: 5, row: 5 }), '\x1b[<0;6;6M\x1b[<0;6;6m');
});

test('AnsiParser parses DECSET and DECRST for mouse modes', () => {
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

  // DECSET: ESC [ ? 1000 ; 1006 h
  parser.feed('\x1b[?1000;1006h');
  assert.deepEqual(calls[0], ['DECSET', 1000]);
  assert.deepEqual(calls[1], ['DECSET', 1006]);

  // DECRST: ESC [ ? 1000 l
  parser.feed('\x1b[?1000l');
  assert.deepEqual(calls[2], ['DECRST', 1000]);
});

test('TermBuf integrates with Locator and routes DECSET/DECRST', () => {
  const buf = new MockTermBuf(80, 24);
  assert.equal(buf.locator.isActive(), false);

  buf.handleDECSET(1000);
  assert.equal(buf.locator.isActive(), true);

  buf.handleDECRST(1000);
  assert.equal(buf.locator.isActive(), false);
});

test('MouseBrowsing delegates to SGR Locator reporting when host activates it', () => {
  const sent = [];
  const buf = new MockTermBuf(80, 24);
  const mockApp = {
    conn: { isConnected: true },
    buf,
    send: (data) => sent.push(data),
    clientToPos: () => ({ col: 15, row: 8 }),
    on: () => {},
    off: () => {},
  };

  const mb = new MouseBrowsing(mockApp, { enabled: true, supportMouseReporting: true });
  mb.init({ app: mockApp, buf });

  // Host activates mouse mode
  buf.handleDECSET(1000);
  assert.equal(buf.locator.isActive(), true);

  // Clicking should send SGR sequence instead of simulated navigation keys
  const handled = mb.handleMouseClick({ clientX: 100, clientY: 100, button: 0 });
  assert.equal(handled, true);
  assert.equal(sent[0], '\x1b[<0;16;9M\x1b[<0;16;9m');
});

test('MouseBrowsing handleWheel sends SGR wheel sequence when active', () => {
  const sent = [];
  const buf = new MockTermBuf(80, 24);
  const mockApp = {
    conn: { isConnected: true },
    buf,
    send: (data) => sent.push(data),
    clientToPos: () => ({ col: 20, row: 10 }),
    on: () => {},
    off: () => {},
  };

  const mb = new MouseBrowsing(mockApp, { enabled: true, supportMouseReporting: true });
  mb.init({ app: mockApp, buf });

  buf.handleDECSET(1000);

  const handled = mb.handleWheel({ clientX: 150, clientY: 150, deltaY: -100 });
  assert.equal(handled, true);
  assert.equal(sent[0], '\x1b[<64;21;11M');
});

test('MouseBrowsing setSupportMouseReporting toggles locator', () => {
  const buf = new MockTermBuf(80, 24);
  const mockApp = { conn: { isConnected: true }, buf, on: () => {}, off: () => {} };
  const mb = new MouseBrowsing(mockApp, { enabled: true, supportMouseReporting: true });
  mb.init({ app: mockApp, buf });

  buf.handleDECSET(1000);
  assert.equal(buf.locator.isActive(), true);

  mb.setSupportMouseReporting(false);
  assert.equal(buf.locator.isActive(), false);

  mb.setSupportMouseReporting(true);
  assert.equal(buf.locator.isActive(), true);
});

test('Preferences defaults supportMouseReporting to true', () => {
  const prefs = readValuesWithDefault();
  assert.equal(prefs.supportMouseReporting, true);
});

