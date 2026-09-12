import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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

test('Locator handleMouseClick sends SGR sequence when host activates it', () => {
  const buf = new MockTermBuf(80, 24);

  // Host activates mouse mode
  buf.handleDECSET(1000);
  assert.equal(buf.locator.isActive(), true);

  const report = buf.locator.handleMouseClick({ button: 0 }, { col: 15, row: 8 });
  assert.equal(report, '\x1b[<0;16;9M\x1b[<0;16;9m');
});

test('Locator handleWheel sends SGR wheel sequence when active', () => {
  const buf = new MockTermBuf(80, 24);
  buf.handleDECSET(1000);

  const report = buf.locator.handleWheel({ deltaY: -100 }, { col: 20, row: 10 });
  assert.equal(report, '\x1b[<64;21;11M');
});

test('Locator enabled property toggles mouse reporting active state', () => {
  const buf = new MockTermBuf(80, 24);
  buf.handleDECSET(1000);
  assert.equal(buf.locator.isActive(), true);

  buf.locator.enabled = false;
  assert.equal(buf.locator.isActive(), false);

  buf.locator.enabled = true;
  assert.equal(buf.locator.isActive(), true);
});

test('MouseBrowsing is cleanly decoupled from VT Mouse Reporting (Locator)', () => {
  const buf = new MockTermBuf(80, 24);
  const interceptors = [];
  const mockApp = {
    conn: { isConnected: true },
    buf,
    on: () => {},
    off: () => {},
    registerInputInterceptor: (i) => interceptors.push(i),
    unregisterInputInterceptor: (i) => {
      const idx = interceptors.indexOf(i);
      if (idx !== -1) interceptors.splice(idx, 1);
    },
  };

  const mb = new MouseBrowsing(mockApp, { enabled: false });
  mb.init({ app: mockApp, buf });
  assert.equal(interceptors.length, 0, 'MouseBrowsing should not register input interceptor while disabled');
  assert.equal(mb.supportMouseReporting, undefined, 'MouseBrowsing should not own supportMouseReporting');

  mb.enable();
  assert.equal(interceptors.length, 1, 'MouseBrowsing should register input interceptor when enabled');

  mb.destroy();
  assert.equal(interceptors.length, 0, 'MouseBrowsing should unregister input interceptor on destroy');
  assert.equal(mockApp._useMouseBrowsing, false, 'MouseBrowsing destroy should reset app._useMouseBrowsing');
});

test('Preferences defaults supportMouseReporting to true', () => {
  const prefs = readValuesWithDefault();
  assert.equal(prefs.supportMouseReporting, true);
});

function extractAppMethod(appSrc, methodName) {
  const startIdx = appSrc.indexOf(`  ${methodName}(`);
  if (startIdx === -1) throw new Error(`Method ${methodName} not found`);
  let depth = 0;
  let bodyStart = -1;
  for (let i = startIdx; i < appSrc.length; i++) {
    if (appSrc[i] === '{') {
      if (depth === 0) bodyStart = i + 1;
      depth++;
    } else if (appSrc[i] === '}') {
      depth--;
      if (depth === 0) {
        const header = appSrc.slice(startIdx, bodyStart - 1);
        const argsMatch = header.match(/\(([^)]*)\)/);
        const args = argsMatch
          ? argsMatch[1].split(',').map((s) => s.trim().split('=')[0].trim()).filter(Boolean)
          : [];
        const body = appSrc.slice(bodyStart, i);
        return new Function(...args, body);
      }
    }
  }
  throw new Error(`Unbalanced braces for ${methodName}`);
}

test('App handles VT Mouse Reporting (Locator) click, move, and wheel when MouseBrowsing is disabled', () => {
  const appSrc = fs.readFileSync(path.resolve('src/js/app.js'), 'utf-8');
  const mouse_click = extractAppMethod(appSrc, 'mouse_click');
  const mouse_move = extractAppMethod(appSrc, 'mouse_move');
  const mouse_scroll = extractAppMethod(appSrc, 'mouse_scroll');
  const setSupportMouseReporting = extractAppMethod(appSrc, 'setSupportMouseReporting');

  const buf = new MockTermBuf(80, 24);
  buf.handleDECSET(1003); // any-event tracking
  buf.handleDECSET(1006); // SGR mode

  const sent = [];
  const mockApp = {
    modalShown: false,
    contextMenuShown: false,
    isDialogOrExcludedTarget: () => false,
    isSelectionCollapsed: () => true,
    useMouseBrowsing: false,
    buf,
    view: { useCanvasEngine: false },
    site: {
      handleCustomLink: () => false,
      handlePassScreenClick: () => false,
    },
    termWin: { style: { cursor: 'pointer' } },
    clientToPos: () => ({ col: 9, row: 4 }),
    send: (str) => sent.push(str),
    setInputAreaFocus: () => {},
    dispatchWheel: () => false,
    prefValues: { supportMouseReporting: true },
  };

  // 1. Click
  let defaultPrevented = false;
  mouse_click.call(mockApp, {
    button: 0,
    clientX: 100,
    clientY: 50,
    target: { closest: () => null },
    preventDefault: () => { defaultPrevented = true; },
  });
  assert.equal(defaultPrevented, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0], '\x1b[<0;10;5M\x1b[<0;10;5m');

  // 2. Move (with 1003 any-event mode)
  mouse_move.call(mockApp, {
    clientX: 100,
    clientY: 50,
  });
  assert.equal(mockApp.termWin.style.cursor, 'default');
  assert.equal(sent.length, 2);
  assert.equal(sent[1], '\x1b[<32;10;5M');

  // 3. Wheel
  let wheelStopped = false;
  let wheelPrevented = false;
  mouse_scroll.call(mockApp, {
    deltaY: -100,
    clientX: 100,
    clientY: 50,
    stopPropagation: () => { wheelStopped = true; },
    preventDefault: () => { wheelPrevented = true; },
  });
  assert.equal(wheelStopped, true);
  assert.equal(wheelPrevented, true);
  assert.equal(sent.length, 3);
  assert.equal(sent[2], '\x1b[<64;10;5M');

  // 4. setSupportMouseReporting
  setSupportMouseReporting.call(mockApp, false, false);
  assert.equal(buf.locator.enabled, false);
  assert.equal(mockApp.prefValues.supportMouseReporting, false);
});


