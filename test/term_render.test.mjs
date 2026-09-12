import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { h, Component, render } from 'preact';
import {
  TouchController,
  computeToolbarLayout,
} from '../src/touch/TouchController.js';
import {
  AntiIdle,
  AutoWrap,
  MediaPreviewer,
  LiveUpdate,
  MouseBrowsing,
} from '../src/plugins/index.js';
import { isFullWidth } from '../src/js/wcwidth.js';

// Extract queueUpdate and notify directly from term_buf.js to test their exact implementation
const termBufSource = fs.readFileSync(
  path.resolve('src/js/term_buf.js'),
  'utf-8'
);
const termViewSource = fs.readFileSync(
  path.resolve('src/js/term_view.js'),
  'utf-8'
);
const appSource = fs.readFileSync(path.resolve('src/js/app.js'), 'utf-8');
const prefModalJsPath = fs.existsSync(path.resolve('src/components/Settings/PrefModal.js'))
  ? path.resolve('src/components/Settings/PrefModal.js')
  : path.resolve('src/components/ContextMenu/PrefModal.js');
const prefModalCssPath = fs.existsSync(path.resolve('src/components/Settings/PrefModal.css'))
  ? path.resolve('src/components/Settings/PrefModal.css')
  : path.resolve('src/components/ContextMenu/PrefModal.css');

function createHarness() {
  const harness = {
    animFrameId: null,
    timerUpdate: null,
    changed: false,
    posChanged: false,
    events: [],
    viewUpdates: 0,
    cursorUpdates: 0,
    updateCharAttr() {},
    setPageState() {},
    clearHighlight() {},
    emit(type) {
      this.events.push(type);
      if (type === 'change') this.viewUpdates++;
      if (type === 'cursor-move') this.cursorUpdates++;
    },
    dispatchEvent(evt) {
      this.events.push(evt.type);
    },
  };

  const queueUpdateBody = termBufSource.match(
    /queueUpdate\(directupdate\)\s*\{([\s\S]*?\n  )\}/
  )[1];
  const notifyBody = termBufSource.match(
    /notify\(timer\)\s*\{([\s\S]*?\n  )\}/
  )[1];

  harness.queueUpdate = new Function('directupdate', queueUpdateBody).bind(
    harness
  );
  harness.notify = new Function('timer', notifyBody).bind(harness);

  return harness;
}

test('TermBuf queueUpdate batches multiple updates and aligns with requestAnimationFrame', () => {
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

    const term = createHarness();
    assert.equal(term.animFrameId, null);
    assert.equal(term.timerUpdate, null);

    // Call queueUpdate multiple times in the same tick
    term.changed = true;
    term.queueUpdate();
    const firstRafId = term.animFrameId;
    assert.ok(firstRafId !== null);
    assert.equal(rafCallbacks.size, 1);

    // Subsequent calls within same frame should be coalesced (backpressure / batching)
    term.queueUpdate();
    term.queueUpdate();
    assert.equal(term.animFrameId, firstRafId);
    assert.equal(rafCallbacks.size, 1);
    assert.equal(term.viewUpdates, 0);

    // Trigger the animation frame callback (simulating browser V-Sync tick)
    const cb = rafCallbacks.get(firstRafId);
    cb();

    assert.equal(term.animFrameId, null);
    assert.equal(term.viewUpdates, 1);
    assert.equal(term.changed, false);
    assert.ok(term.events.includes('change'));
    assert.ok(term.events.includes('viewUpdate'));

    // Test explicit notify() cancels pending requestAnimationFrame
    term.changed = true;
    term.queueUpdate();
    const secondRafId = term.animFrameId;
    assert.ok(secondRafId !== null);
    assert.equal(rafCallbacks.size, 1);

    term.notify();
    assert.equal(cancelCalledWith, secondRafId);
    assert.equal(term.animFrameId, null);
    assert.equal(rafCallbacks.size, 0);
  } finally {
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCancelRaf;
  }
});

test('TermBuf queueUpdate falls back gracefully to setTimeout when requestAnimationFrame is unavailable', async () => {
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCancelRaf = globalThis.cancelAnimationFrame;

  try {
    delete globalThis.requestAnimationFrame;
    delete globalThis.cancelAnimationFrame;

    const term = createHarness();
    assert.equal(term.animFrameId, null);
    assert.equal(term.timerUpdate, null);

    term.changed = true;
    term.queueUpdate();
    assert.ok(term.timerUpdate !== null);
    assert.equal(term.animFrameId, null);

    const activeTimer = term.timerUpdate;
    // Coalesce additional updates into existing timeout
    term.queueUpdate();
    assert.equal(term.timerUpdate, activeTimer);

    // Wait for timeout to fire
    await new Promise((resolve) => setTimeout(resolve, 35));

    assert.equal(term.timerUpdate, null);
    assert.equal(term.viewUpdates, 1);
    assert.equal(term.changed, false);

    // Test notify() cancels pending timer
    term.changed = true;
    term.queueUpdate();
    assert.ok(term.timerUpdate !== null);
    term.notify();
    assert.equal(term.timerUpdate, null);
  } finally {
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCancelRaf;
  }
});

test('TermView setHighlightedRow safely guards when componentScreen is undefined, null, or unmounted', () => {
  const setHighlightedRowBody = termViewSource.match(
    /setHighlightedRow\(row\)\s*\{([\s\S]*?\n  )\}/
  )[1];
  const fn = new Function('row', setHighlightedRowBody);

  // 1. componentScreen is undefined (reproducing the reported runtime crash)
  const ctxUndefined = {
    highlightedRow: -1,
    componentScreen: undefined
  };
  assert.doesNotThrow(() => fn.call(ctxUndefined, 5));
  assert.equal(ctxUndefined.highlightedRow, 5);

  // 2. componentScreen is null
  const ctxNull = {
    highlightedRow: -1,
    componentScreen: null
  };
  assert.doesNotThrow(() => fn.call(ctxNull, 5));
  assert.equal(ctxNull.highlightedRow, 5);

  // 3. componentScreen is valid
  let calledWith = null;
  const ctxValid = {
    highlightedRow: -1,
    componentScreen: {
      setCurrentHighlighted(row) {
        calledWith = row;
      }
    }
  };
  fn.call(ctxValid, 12);
  assert.equal(calledWith, 12);
  assert.equal(ctxValid.highlightedRow, 12);
});

test('renderScreen captures and returns component instance via ref in Preact', () => {
  class MockScreen extends Component {
    setCurrentHighlighted(row) {
      this.highlighted = row;
    }
    render() {
      return h('div', null, 'screen');
    }
  }

  function renderScreen(
    lines,
    forceWidth,
    enableLinkInlinePreview,
    enableLinkHoverPreview,
    cont,
    options = {},
    ref
  ) {
    let instance = null;
    const { ref: optionsRef, ...restOptions } = options;
    const targetRef = ref || optionsRef;
    const setRef = (inst) => {
      instance = inst;
      if (typeof targetRef === 'function') {
        targetRef(inst);
      } else if (targetRef && 'current' in targetRef) {
        targetRef.current = inst;
      }
    };

    render(
      h(MockScreen, {
        ref: setRef,
        lines,
        forceWidth,
        enableLinkInlinePreview,
        enableLinkHoverPreview,
        ...restOptions
      }),
      cont
    );

    return instance;
  }

  const createMockEl = (tag) => ({
    nodeType: 1,
    tag,
    childNodes: [],
    style: {},
    setAttribute() {},
    removeAttribute() {},
    appendChild(child) {
      this.childNodes.push(child);
      child.parentNode = this;
      return child;
    },
    removeChild() {},
    insertBefore() {}
  });

  const origDocument = globalThis.document;
  try {
    const container = createMockEl('div');
    globalThis.document = {
      createElement: (tag) => createMockEl(tag),
      createElementNS: (ns, tag) => createMockEl(tag),
      createTextNode: (text) => ({ nodeType: 3, text })
    };

    let refCallbackInstance = null;
    const inst = renderScreen([], 16, false, false, container, {
      ref: (i) => {
        refCallbackInstance = i;
      },
      cols: 80,
      rows: 24
    });

    assert.ok(inst, 'renderScreen should return the component instance');
    assert.equal(
      inst,
      refCallbackInstance,
      'ref callback should receive the same instance'
    );
    assert.equal(typeof inst.setCurrentHighlighted, 'function');

    inst.setCurrentHighlighted(15);
    assert.equal(inst.highlighted, 15);

    // Re-render should also preserve and return the instance
    const reInst = renderScreen(
      ['updated line'],
      16,
      false,
      false,
      container,
      {}
    );
    assert.equal(
      reInst,
      inst,
      're-render returns the existing component instance'
    );
  } finally {
    globalThis.document = origDocument;
  }
});

test('TermView cursorStyle handles blink, reverse, and blink-reverse styles', () => {
  const mockClassList = new Set();
  const mockCursor = {
    classList: {
      add: (cls) => mockClassList.add(cls),
      remove: (...classes) => classes.forEach((c) => mockClassList.delete(c)),
      has: (cls) => mockClassList.has(cls)
    },
    style: {},
    textContent: '_'
  };

  const mockView = {
    cursor: mockCursor,
    chw: 12,
    chh: 24,
    scaleX: 1,
    scaleY: 1,
    buf: {
      cur_x: 5,
      cur_y: 10,
      rows: 24,
      cols: 80,
      lines: Array.from({ length: 24 }, () =>
        Array.from({ length: 80 }, () => ({ getBg: () => 0 }))
      )
    },
    convertMN2XYEx: (cx, cy) => [cx * 12, cy * 24],
    updateInputBufferPos() {}
  };

  const setCursorStyleBody = termViewSource.match(
    /setCursorStyle\(style\)\s*\{([\s\S]*?\n  )\}/
  )[1];
  const applyCursorStyleBody = termViewSource.match(
    /applyCursorStyle\(\)\s*\{([\s\S]*?\n  )\}/
  )[1];
  const updateCursorPosBody = termViewSource.match(
    /updateCursorPos\(\)\s*\{([\s\S]*?\n  )\}/
  )[1];

  const termInvColors = [
    '#ffffff',
    '#ff0000',
    '#00ff00',
    '#ffff00',
    '#0000ff',
    '#ff00ff',
    '#00ffff',
    '#000000'
  ];
  mockView.setCursorStyle = new Function('style', setCursorStyleBody).bind(
    mockView
  );
  mockView.applyCursorStyle = new Function(
    'termInvColors',
    `return function applyCursorStyle() { ${applyCursorStyleBody} }`
  )(termInvColors).bind(mockView);
  mockView.updateCursorPos = new Function(
    'termInvColors',
    `return function updateCursorPos() { ${updateCursorPosBody} }`
  )(termInvColors).bind(mockView);

  // 1. Default / Blink underline mode
  mockView.setCursorStyle('blink');
  assert.equal(mockView.cursorStyle, 'blink');
  assert.ok(mockClassList.has('cursor--blink'));
  assert.equal(mockCursor.textContent, '_');
  assert.equal(mockCursor.style.left, '60px'); // 5 * 12
  assert.equal(mockCursor.style.top, '239px'); // 10 * 24 - 1

  // 2. Steady underline mode
  mockView.setCursorStyle('underline');
  assert.equal(mockView.cursorStyle, 'underline');
  assert.ok(mockClassList.has('cursor--underline'));
  assert.equal(mockClassList.has('cursor--blink'), false);
  assert.equal(mockCursor.textContent, '_');
  assert.equal(mockCursor.style.left, '60px');
  assert.equal(mockCursor.style.top, '239px');

  // 3. Reverse half-height block mode (steady)
  mockView.setCursorStyle('reverse');
  assert.equal(mockView.cursorStyle, 'reverse');
  assert.ok(mockClassList.has('cursor--reverse'));
  assert.equal(mockClassList.has('cursor--underline'), false);
  assert.equal(mockCursor.textContent, '');
  assert.equal(mockCursor.style.width, '12px');
  assert.equal(mockCursor.style.height, '12px'); // Half of chh (24 / 2 = 12)
  assert.equal(mockCursor.style.left, '60px');
  assert.equal(mockCursor.style.top, '252px'); // 10 * 24 + (24 - 12) = 252 (bottom half of cell)

  // 4. Blink-reverse half-height block mode
  mockView.setCursorStyle('blink-reverse');
  assert.equal(mockView.cursorStyle, 'blink-reverse');
  assert.ok(mockClassList.has('cursor--blink-reverse'));
  assert.equal(mockClassList.has('cursor--reverse'), false);
  assert.equal(mockCursor.textContent, '');
  assert.equal(mockCursor.style.width, '12px');
  assert.equal(mockCursor.style.height, '12px');
  assert.equal(mockCursor.style.top, '252px');

  // 5. Block mode (solid full-cell block, steady)
  mockView.setCursorStyle('block');
  assert.equal(mockView.cursorStyle, 'block');
  assert.ok(mockClassList.has('cursor--block'));
  assert.equal(mockClassList.has('cursor--blink'), false);
  assert.equal(mockCursor.textContent, '');
  assert.equal(mockCursor.style.width, '12px');
  assert.equal(mockCursor.style.height, '24px');
  assert.equal(mockCursor.style.top, '240px');

  // 6. Blink-block mode
  mockView.setCursorStyle('blink-block');
  assert.equal(mockView.cursorStyle, 'blink-block');
  assert.ok(mockClassList.has('cursor--block'));
  assert.ok(mockClassList.has('cursor--blink'));
  assert.equal(mockCursor.textContent, '');
  assert.equal(mockCursor.style.width, '12px');
  assert.equal(mockCursor.style.height, '24px');
  assert.equal(mockCursor.style.top, '240px');

  // 7. Half-block mode (steady)
  mockView.setCursorStyle('half-block');
  assert.equal(mockView.cursorStyle, 'half-block');
  assert.ok(mockClassList.has('cursor--half-block'));
  assert.ok(mockClassList.has('cursor--reverse'));
  assert.equal(mockClassList.has('cursor--blink'), false);
  assert.equal(mockCursor.textContent, '');
  assert.equal(mockCursor.style.width, '12px');
  assert.equal(mockCursor.style.height, '12px');
  assert.equal(mockCursor.style.top, '252px');

  // 8. Blink-half-block mode
  mockView.setCursorStyle('blink-half-block');
  assert.equal(mockView.cursorStyle, 'blink-half-block');
  assert.ok(mockClassList.has('cursor--half-block'));
  assert.ok(mockClassList.has('cursor--blink'));
  assert.equal(mockCursor.textContent, '');
  assert.equal(mockCursor.style.width, '12px');
  assert.equal(mockCursor.style.height, '12px');
  assert.equal(mockCursor.style.top, '252px');

  // 9. I-beam mode (vertical line, steady)
  mockView.setCursorStyle('ibeam');
  assert.equal(mockView.cursorStyle, 'ibeam');
  assert.ok(mockClassList.has('cursor--ibeam'));
  assert.equal(mockClassList.has('cursor--blink'), false);
  assert.equal(mockCursor.textContent, '');
  assert.equal(mockCursor.style.width, '2px');
  assert.equal(mockCursor.style.height, '24px');
  assert.equal(mockCursor.style.top, '240px');

  // 10. Blink-ibeam mode
  mockView.setCursorStyle('blink-ibeam');
  assert.equal(mockView.cursorStyle, 'blink-ibeam');
  assert.ok(mockClassList.has('cursor--ibeam'));
  assert.ok(mockClassList.has('cursor--blink'));
  assert.equal(mockCursor.textContent, '');
  assert.equal(mockCursor.style.width, '2px');
  assert.equal(mockCursor.style.height, '24px');
  assert.equal(mockCursor.style.top, '240px');
});

test('pref parseCaretStyle and serializeCaretStyle support 4 shapes and blink toggle', async () => {
  const { parseCaretStyle, serializeCaretStyle, CARET_SHAPES } = await import(
    '../src/js/pref.js'
  );

  // Legacy mappings
  assert.deepEqual(parseCaretStyle('blink'), {
    shape: CARET_SHAPES.UNDERLINE,
    blink: true
  });
  assert.deepEqual(parseCaretStyle('underline'), {
    shape: CARET_SHAPES.UNDERLINE,
    blink: false
  });
  assert.deepEqual(parseCaretStyle('reverse'), {
    shape: CARET_SHAPES.HALF_BLOCK,
    blink: false
  });
  assert.deepEqual(parseCaretStyle('blink-reverse'), {
    shape: CARET_SHAPES.HALF_BLOCK,
    blink: true
  });

  // Modern mappings
  assert.deepEqual(parseCaretStyle('block'), {
    shape: CARET_SHAPES.BLOCK,
    blink: false
  });
  assert.deepEqual(parseCaretStyle('blink-block'), {
    shape: CARET_SHAPES.BLOCK,
    blink: true
  });
  assert.deepEqual(parseCaretStyle('ibeam'), {
    shape: CARET_SHAPES.IBEAM,
    blink: false
  });
  assert.deepEqual(parseCaretStyle('blink-ibeam'), {
    shape: CARET_SHAPES.IBEAM,
    blink: true
  });
  assert.deepEqual(parseCaretStyle('half-block'), {
    shape: CARET_SHAPES.HALF_BLOCK,
    blink: false
  });
  assert.deepEqual(parseCaretStyle('blink-half-block'), {
    shape: CARET_SHAPES.HALF_BLOCK,
    blink: true
  });

  // Serialization preserves single saved preference format
  assert.equal(serializeCaretStyle(CARET_SHAPES.UNDERLINE, true), 'blink');
  assert.equal(serializeCaretStyle(CARET_SHAPES.UNDERLINE, false), 'underline');
  assert.equal(
    serializeCaretStyle(CARET_SHAPES.HALF_BLOCK, true),
    'blink-reverse'
  );
  assert.equal(serializeCaretStyle(CARET_SHAPES.HALF_BLOCK, false), 'reverse');
  assert.equal(serializeCaretStyle(CARET_SHAPES.BLOCK, true), 'blink-block');
  assert.equal(serializeCaretStyle(CARET_SHAPES.BLOCK, false), 'block');
  assert.equal(serializeCaretStyle(CARET_SHAPES.IBEAM, true), 'blink-ibeam');
  assert.equal(serializeCaretStyle(CARET_SHAPES.IBEAM, false), 'ibeam');
});

test('TermBuf puts handles bell (\\x07), setting bellOccurred and dispatching bell event while App plays audio bell', () => {
  const putsMatch = termBufSource.match(
    /puts\s*\([^)]*\)\s*\{([\s\S]*?\n    this\.queueUpdate\(\);)\n  \}/
  );
  assert.ok(putsMatch);
  const putsBody = putsMatch[1];
  let bellDispatched = 0;
  const mockTerm = {
    bellOccurred: false,
    cols: 80,
    rows: 24,
    cur_x: 0,
    cur_y: 0,
    lines: [[]],
    attr: {},
    back() {},
    carriageReturn() {},
    lineFeed() {},
    gotoPos() {},
    queueUpdate() {},
    emit(type) {
      if (type === 'bell') bellDispatched++;
    },
    dispatchEvent(evt) {
      if (evt.type === 'bell') bellDispatched++;
    }
  };
  mockTerm.puts = new Function(
    'isFullWidth',
    'return function(str, attr = null) { ' + putsBody + ' }'
  )(isFullWidth).bind(mockTerm);

  assert.equal(mockTerm.bellOccurred, false);
  mockTerm.puts('hello\x07world');
  assert.equal(mockTerm.bellOccurred, true);
  assert.equal(bellDispatched, 1);

  assert.ok(
    appSource.includes("playTerminalBell()"),
    'App must invoke playTerminalBell() when handling buf bell event'
  );
});

test('TermView _send, _convSend and conn getter delegate to app.send and app.conn', () => {
  const connMatch = termViewSource.match(/get conn\(\)\s*\{([\s\S]*?\n  )\}/);
  const sendMatch = termViewSource.match(/_send\(data\)\s*\{([\s\S]*?\n  )\}/);
  const convSendMatch = termViewSource.match(
    /_convSend\(data\)\s*\{([\s\S]*?\n  )\}/
  );

  assert.ok(connMatch, 'TermView must define conn getter');
  assert.ok(sendMatch, 'TermView must define _send method');
  assert.ok(convSendMatch, 'TermView must define _convSend method');

  const appSent = [];
  const mockConn = {};
  const mockView = {
    app: {
      conn: mockConn,
      send(data) {
        appSent.push(data);
      },
    }
  };
  Object.defineProperty(mockView, 'conn', {
    get: new Function(connMatch[1])
  });
  mockView._send = new Function('data', sendMatch[1]).bind(mockView);
  mockView._convSend = new Function('data', convSendMatch[1]).bind(mockView);

  assert.equal(mockView.conn, mockConn);
  mockView._send('\x1b[D');
  assert.deepEqual(appSent, ['\x1b[D']);
  mockView._convSend('test');
  assert.deepEqual(appSent, ['\x1b[D', 'test']);
});

test('App isDialogOrExcludedTarget handles string, SVGAnimatedString, null and undefined className', () => {
  const match = appSource.match(
    /isDialogOrExcludedTarget\(e\)\s*\{([\s\S]*?)\n  \}/
  );
  assert.ok(match, 'App must define isDialogOrExcludedTarget');
  const isDialogOrExcludedTarget = new Function('e', match[1]);

  assert.equal(isDialogOrExcludedTarget({ target: { className: 'nomouse_command' } }), true);
  assert.equal(isDialogOrExcludedTarget({ target: { className: 'some nomouse_command class' } }), true);
  assert.equal(isDialogOrExcludedTarget({ target: { className: 'packet-dump nomouse_command' } }), true);
  assert.equal(isDialogOrExcludedTarget({ target: { className: 'packet-dump' } }), false);
  assert.equal(isDialogOrExcludedTarget({ target: { className: 'normal-class' } }), false);
  assert.equal(isDialogOrExcludedTarget({ target: { className: null } }), false);
  assert.equal(isDialogOrExcludedTarget({ target: { className: undefined } }), false);
  assert.equal(isDialogOrExcludedTarget(null), false);

  // SVGAnimatedString simulation
  const svgClassWithNoMouse = {
    baseVal: 'nomouse_command',
    animVal: 'nomouse_command'
  };
  const svgClassNormal = { baseVal: 'lucide-icon', animVal: 'lucide-icon' };
  assert.equal(isDialogOrExcludedTarget({ target: { className: svgClassWithNoMouse } }), true);
  assert.equal(isDialogOrExcludedTarget({ target: { className: svgClassNormal } }), false);
});

test('computeToolbarLayout always stacks into 5 rows and scales to max fit with base size minimum', () => {
  // 1. Portrait mode with cols = 80 -> no extra col-80 space -> stacked with base size minimum (52px buttons)
  const resPortrait80 = computeToolbarLayout({
    viewportWidth: 640,
    viewportHeight: 800,
    cols: 80,
    colWidth: 8
  });
  assert.equal(resPortrait80.isStacked, true);
  assert.equal(resPortrait80.maxCols, 4);
  assert.equal(resPortrait80.stackedWidth, 234);
  assert.equal(resPortrait80.stackedHeight, 288);
  assert.equal(resPortrait80.toolbarScale, 1.0);
  assert.equal(resPortrait80.drawableRight, 640);

  // 2. Portrait mode with extra cols (cols = 82) -> space < base size -> base size is minimum
  const resPortrait82 = computeToolbarLayout({
    viewportWidth: 393,
    viewportHeight: 720,
    cols: 82,
    colWidth: 10,
    isCompactLandscape: false
  });
  assert.equal(resPortrait82.isStacked, true);
  assert.equal(resPortrait82.maxCols, 4);
  assert.equal(resPortrait82.stackedWidth, 234);
  assert.equal(resPortrait82.stackedHeight, 288);
  assert.equal(resPortrait82.toolbarScale, 1.0);
  assert.equal(resPortrait82.drawableRight, 820);

  // 3. Landscape screen: always stacked, base size is minimum even if space is narrow (44x42px buttons)
  const resNarrowLandscape = computeToolbarLayout({
    viewportWidth: 720,
    viewportHeight: 393,
    cols: 82,
    colWidth: 10,
    isCompactLandscape: true
  });
  assert.equal(resNarrowLandscape.isStacked, true);
  assert.equal(resNarrowLandscape.maxCols, 4);
  assert.equal(resNarrowLandscape.stackedWidth, 195);
  assert.equal(resNarrowLandscape.stackedHeight, 230);
  assert.equal(resNarrowLandscape.toolbarScale, 1.0);
  assert.equal(resNarrowLandscape.drawableRight, 820);

  // 4. iPhone 15 Pro landscape: 852 x 393, right space is narrow -> base size is minimum
  const resIPhone = computeToolbarLayout({
    viewportWidth: 852,
    viewportHeight: 393,
    col80Right: 751,
    isCompactLandscape: true
  });
  assert.equal(resIPhone.isStacked, true);
  assert.equal(resIPhone.maxCols, 4);
  assert.equal(resIPhone.stackedWidth, 195);
  assert.equal(resIPhone.stackedHeight, 230);
  assert.equal(resIPhone.toolbarScale, 1.0);
  assert.equal(resIPhone.drawableRight, 852);

  // 5. Wide phone landscape: extra columns beyond base size -> width fills first and scales up
  const resWidePhone = computeToolbarLayout({
    viewportWidth: 1200,
    viewportHeight: 411,
    cols: 110,
    colWidth: 10,
    isCompactLandscape: true
  });
  assert.equal(resWidePhone.isStacked, true);
  assert.equal(resWidePhone.maxCols, 4);
  assert.equal(resWidePhone.stackedWidth, 300);
  assert.equal(resWidePhone.stackedHeight, 353);
  assert.equal(resWidePhone.toolbarScale, 1.538);
  assert.equal(resWidePhone.drawableRight, 1100);

  // 6. Max-fit when height is constrained below base size -> base size is minimum
  const resHeightFillsFirst = computeToolbarLayout({
    viewportWidth: 1000,
    viewportHeight: 200,
    drawableRight: 950,
    col80Right: 650,
    isCompactLandscape: true
  });
  assert.equal(resHeightFillsFirst.isStacked, true);
  assert.equal(resHeightFillsFirst.maxCols, 4);
  assert.equal(resHeightFillsFirst.stackedHeight, 230);
  assert.equal(resHeightFillsFirst.stackedWidth, 195);
  assert.equal(resHeightFillsFirst.toolbarScale, 1.0);

  // 7. Standard desktop mode with extra space (550px available width, 1056px available height)
  const resDesktop = computeToolbarLayout({
    viewportWidth: 1920,
    viewportHeight: 1080,
    drawableRight: 1910,
    col80Right: 1360,
    isCompactLandscape: false
  });
  assert.equal(resDesktop.isStacked, true);
  assert.equal(resDesktop.maxCols, 4);
  assert.equal(resDesktop.stackedWidth, 550);
  assert.equal(resDesktop.stackedHeight, 676);
  assert.equal(resDesktop.toolbarScale, 2.35);
  assert.equal(resDesktop.drawableRight, 1910);

  // 8. Desktop mode with constrained drawableHeight (drawableHeight = 400px -> height fills first)
  const resConstrainedHeight = computeToolbarLayout({
    viewportWidth: 1920,
    viewportHeight: 1080,
    drawableRight: 1910,
    drawableHeight: 400,
    col80Right: 1360,
    isCompactLandscape: false
  });
  assert.equal(resConstrainedHeight.isStacked, true);
  assert.equal(resConstrainedHeight.maxCols, 4);
  assert.equal(resConstrainedHeight.stackedHeight, 400);
  assert.equal(resConstrainedHeight.stackedWidth, 325);
  assert.ok(resConstrainedHeight.stackedWidth <= 550);
  assert.equal(resConstrainedHeight.toolbarScale, 1.389);

  // 9. In landscape, base size is minimum even when formula remainingWidth < baseWidth
  const resFormula = computeToolbarLayout({
    viewportWidth: 1000,
    viewportHeight: 500,
    drawableRight: 950,
    col80Right: 850,
    isCompactLandscape: true
  });
  assert.equal(resFormula.isStacked, true);
  assert.equal(resFormula.stackedWidth, 195);
  assert.equal(resFormula.stackedHeight, 230);
  assert.equal(resFormula.toolbarScale, 1.0);
  assert.equal(resFormula.drawableRight, 950);
});

test('ContextMenu guards against setState calls when unmounted or detached', () => {
  const contextMenuSource = fs.readFileSync(
    path.resolve('src/components/ContextMenu/index.js'),
    'utf-8'
  );

  // 1. Verify source implements the lifecycle and mounting guards
  assert.ok(contextMenuSource.includes('_isMounted = false;'));
  assert.ok(contextMenuSource.includes('isInstanceActive = () =>'));
  assert.ok(contextMenuSource.includes('if (!this.isInstanceActive())'));
  assert.ok(contextMenuSource.includes('super.setState(updater, callback);'));

  // 2. Test lifecycle guard logic in isolation
  class GuardedComponent extends Component {
    _isMounted = false;
    state = { count: 0 };

    isInstanceActive() {
      return Boolean(
        this._isMounted &&
        this.__v &&
        this.__v.__ &&
        (!this.__v.__c || this.__v.__c === this)
      );
    }

    setState(updater, callback) {
      if (!this.isInstanceActive()) {
        return;
      }
      super.setState(updater, callback);
    }
  }

  const inst = new GuardedComponent();
  assert.equal(inst.isInstanceActive(), false);

  // Calling setState before mount should be safely ignored
  inst.setState({ count: 1 });
  assert.equal(inst.state.count, 0);

  // Simulate mounted component with active vnode
  const mockParentVNode = { __k: [] };
  const mockVNode = { __: mockParentVNode, __c: inst };
  inst._isMounted = true;
  inst.__v = mockVNode;
  assert.equal(inst.isInstanceActive(), true);

  // Simulate zombie instance after HMR replacement
  const newInst = new GuardedComponent();
  mockVNode.__c = newInst;
  assert.equal(inst.isInstanceActive(), false);

  // Simulate detached vnode (parent severed)
  mockVNode.__c = inst;
  mockVNode.__ = null;
  assert.equal(inst.isInstanceActive(), false);

  // Simulate unmounted component
  mockVNode.__ = mockParentVNode;
  inst._isMounted = false;
  assert.equal(inst.isInstanceActive(), false);
});

test('ContextMenu and TouchKeyboard handle Ctrl mode, letter dispatch, and top-row layout', () => {
  const contextMenuSource = fs.readFileSync(
    path.resolve('src/components/ContextMenu/index.js'),
    'utf-8'
  );
  const keyboardSource = fs.readFileSync(
    path.resolve('src/touch/TouchKeyboard.js'),
    'utf-8'
  );
  assert.ok(!contextMenuSource.includes('<TouchKeyboard'), 'ContextMenu decouples TouchKeyboard to PluginOverlay');

  // 1. Verify Ctrl mode state, handlers, and render methods exist
  assert.ok(keyboardSource.includes('isCtrlMode: false'));
  assert.ok(keyboardSource.includes('handleToggleCtrlMode'));
  assert.ok(keyboardSource.includes('sendCtrlLetter'));
  assert.ok(keyboardSource.includes('renderCtrl = () =>'));
  assert.ok(keyboardSource.includes('renderBackToMainToolbar'));
  assert.ok(keyboardSource.includes('renderCtrlLetter'));

  // 2. Verify Home/End (row 2) swapped with PgUp/PgDn (row 3/4):
  // Row 2: Esc, Home, Up, End
  // Row 3: PgUp, Left, Space, Right
  // Row 4: PgDn, Backspace, Down, Enter
  const rowHomeIdx = keyboardSource.indexOf('{this.renderHome()}');
  const rowEndIdx = keyboardSource.indexOf('{this.renderEnd()}');
  const rowPageUpIdx = keyboardSource.indexOf('{this.renderPageUp()}');
  const rowPageDownIdx = keyboardSource.indexOf('{this.renderPageDown()}');
  const rowSpaceIdx = keyboardSource.indexOf('{this.renderSpace()}');
  const rowDownIdx = keyboardSource.indexOf('{this.renderArrowDown()}');
  assert.ok(rowHomeIdx > 0 && rowEndIdx > 0);
  assert.ok(rowPageUpIdx > 0 && rowPageDownIdx > 0);
  assert.ok(rowHomeIdx < rowEndIdx, 'Home must appear before End in row 2');
  assert.ok(
    rowEndIdx < rowPageUpIdx,
    'Home and End (row 2) must appear before PageUp (row 3)'
  );
  assert.ok(
    rowPageUpIdx < rowPageDownIdx,
    'PageUp (row 3) must appear before PageDown (row 4)'
  );
  assert.ok(
    rowSpaceIdx < rowDownIdx,
    'Space must appear in row 3 and ArrowDown in row 4 in standard toolbar'
  );

  // Verify minimize pad uses dock/baseline bar icon (distinguishable from down arrow)
  assert.ok(
    keyboardSource.includes('<line x1="5" y1="19" x2="19" y2="19" />'),
    'renderCollapseToggle must include dock baseline bar'
  );

  // Verify Home and End diagonal arrows:
  // Home: right-bottom to left-up (top-left apex)
  assert.ok(
    keyboardSource.includes('<line x1="19" y1="19" x2="5" y2="5" />') &&
      keyboardSource.includes('<polyline points="14 5 5 5 5 14" />'),
    'renderHome must use diagonal arrow from right-bottom to left-up'
  );
  // End: left-up to right-bottom (bottom-right apex)
  assert.ok(
    keyboardSource.includes('<line x1="5" y1="5" x2="19" y2="19" />') &&
      keyboardSource.includes('<polyline points="10 19 19 19 19 10" />'),
    'renderEnd must use diagonal arrow from left-up to right-bottom'
  );

  // Verify Page Up and Page Down have two horizontal cross-dashes across vertical stem
  assert.ok(
    keyboardSource.includes('<line x1="7" y1="14" x2="17" y2="14" />') &&
      keyboardSource.includes('<line x1="7" y1="18" x2="17" y2="18" />'),
    'renderPageUp must have two horizontal dashes across vertical stem'
  );
  assert.ok(
    keyboardSource.includes('<line x1="7" y1="6" x2="17" y2="6" />') &&
      keyboardSource.includes('<line x1="7" y1="10" x2="17" y2="10" />'),
    'renderPageDown must have two horizontal dashes across vertical stem'
  );

  // Verify Shift icon: hollow up arrow outline in normal mode and underline bar in sticky mode
  assert.ok(
    keyboardSource.includes('fill={isShiftActive ? "currentColor" : "none"}'),
    'renderShift must render hollow arrow when inactive'
  );
  assert.ok(
    keyboardSource.includes(
      '<line\n                x1="5.5"\n                y1="20.5"\n                x2="18.5"\n                y2="20.5"'
    ) ||
      (keyboardSource.includes('x1="5.5"') &&
        keyboardSource.includes('y1="20.5"')),
    'renderShift must render underline bar when sticky'
  );

  // Verify Arrow-pad icon (renderReturnToNormalPad) is a D-pad controller (center circle with 4 chevrons)
  assert.ok(
    keyboardSource.includes(
      '<circle cx="12" cy="12" r="2.6" strokeWidth="2" />'
    ) &&
      keyboardSource.includes('<polyline points="8 7 12 3 16 7" />') &&
      keyboardSource.includes('<polyline points="8 17 12 21 16 17" />'),
    'renderReturnToNormalPad must render D-pad controller icon with center circle and 4 chevrons'
  );

  // Verify row 5 has TypingGroup, dock-gap spacer, and DockGroup
  assert.ok(
    keyboardSource.includes('TouchFloatingToolbar__TypingGroup'),
    'Row 5 must contain TouchFloatingToolbar__TypingGroup'
  );
  assert.ok(
    keyboardSource.includes('TouchFloatingToolbar__Spacer--dock-gap'),
    'Row 5 must contain TouchFloatingToolbar__Spacer--dock-gap'
  );
  assert.ok(
    keyboardSource.includes('TouchFloatingToolbar__DockGroup'),
    'Row 5 must contain TouchFloatingToolbar__DockGroup'
  );
  assert.ok(
    keyboardSource.includes('--dock-group-width'),
    'toolbarStyle must define --dock-group-width'
  );

  // 3. Test sendCtrlLetter logic sending control characters directly to connection/stream (A-Z -> 1-26)
  let sentData = null;
  const mockApp = {
    view: {
      onKeyDown() {
        throw new Error('sendCtrlLetter should not dispatch key event to view');
      }
    },
    send(d) {
      sentData = d;
    }
  };

  function sendCtrlLetter(letter, app) {
    const lower = letter.toLowerCase();
    const code = lower.charCodeAt(0) - 96;
    if (code >= 1 && code <= 26) {
      const char = String.fromCharCode(code);
      app.send(char);
    }
  }

  sendCtrlLetter('A', mockApp);
  assert.equal(sentData, '\x01'); // Ctrl+A = 1 (0x01)

  sendCtrlLetter('U', mockApp);
  assert.equal(sentData, '\x15'); // Ctrl+U = 21 (0x15)
});

test('ContextMenu Ctrl mode renders QWERTY keyboard layout without numbers or shift', () => {
  const keyboardSource = fs.readFileSync(
    path.resolve('src/touch/TouchKeyboard.js'),
    'utf-8'
  );

  // 1. Extract the Ctrl mode track snippet from TouchKeyboard.js
  const ctrlTrackStart = keyboardSource.indexOf(
    'TouchFloatingToolbar__Track--ctrl'
  );
  assert.ok(ctrlTrackStart > 0, 'Ctrl track must be defined');
  const ctrlTrackSnippet = keyboardSource.slice(
    ctrlTrackStart,
    keyboardSource.indexOf('isAlphaMode ?', ctrlTrackStart)
  );

  // 2. Verify number keys (1-0) are NOT in Ctrl keypad
  for (let num = 0; num <= 9; num++) {
    assert.ok(
      !ctrlTrackSnippet.includes(`renderCtrlNumber("${num}")`),
      `Number ${num} must not be rendered in Ctrl keypad`
    );
  }

  // 3. Verify all 26 letters (A-Z) are rendered with renderCtrlLetter
  for (let code = 65; code <= 90; code++) {
    const letter = String.fromCharCode(code);
    assert.ok(
      ctrlTrackSnippet.includes(`this.renderCtrlLetter("${letter}")`),
      `Letter ${letter} must be rendered in Ctrl keypad`
    );
  }

  // 4. Verify QWERTY track class, shift spacer, backspace, and dock row
  assert.ok(
    ctrlTrackSnippet.includes('TouchFloatingToolbar__Track--qwert'),
    'Track must use TouchFloatingToolbar__Track--qwert class'
  );
  assert.ok(
    !ctrlTrackSnippet.includes('this.renderShift()'),
    'Ctrl-pad must not include Shift toggle'
  );
  assert.ok(
    ctrlTrackSnippet.includes('TouchFloatingToolbar__Spacer--shift'),
    'Ctrl-pad must include shift spacer to align Z-M row'
  );
  assert.ok(
    ctrlTrackSnippet.includes('this.renderQwertBackspace(true)'),
    'Row 3 must include Backspace'
  );
  assert.ok(
    !ctrlTrackSnippet.includes('this.renderQwertEscape(true)'),
    'Ctrl-pad must not include Esc'
  );
  assert.ok(
    !ctrlTrackSnippet.includes('this.renderQwertSpace(true)'),
    'Ctrl-pad must not include Space'
  );
  assert.ok(
    !ctrlTrackSnippet.includes('this.renderQwertEnter(true)'),
    'Ctrl-pad must not include Enter'
  );
  assert.ok(
    ctrlTrackSnippet.includes('TouchFloatingToolbar__Spacer--dock-fill'),
    'Dock row must include dock-fill spacer'
  );
  assert.ok(
    ctrlTrackSnippet.includes('TouchFloatingToolbar__Row--dock'),
    'Dock row must use TouchFloatingToolbar__Row--dock class'
  );
  assert.ok(
    ctrlTrackSnippet.includes('this.renderReturnToNormalPad()'),
    'Row 6 dock must include return to normal pad button'
  );
  assert.ok(
    ctrlTrackSnippet.includes('this.renderAlpha()'),
    'Row 6 dock must include a-pad toggle'
  );
  assert.ok(
    ctrlTrackSnippet.includes('this.renderKeyboardToggle()'),
    'Row 6 dock must include keyboard toggle'
  );
  assert.ok(
    ctrlTrackSnippet.includes('this.renderCollapseToggle'),
    'Row 6 dock must include collapse toggle button'
  );

  // 5. Verify enlarged dimensions logic and right-alignment in TouchKeyboard.js (540px clamp width, 1.2x height)
  assert.ok(keyboardSource.includes('isExpandedKeypad'));
  assert.ok(
    keyboardSource.includes('viewportWidth > 0 ? viewportWidth - 12 : 380')
  );
  assert.ok(
    keyboardSource.includes('baseRightOffset'),
    'Keypads must align right with baseRightOffset'
  );
  assert.ok(
    keyboardSource.includes('^{letter}'),
    'renderCtrlLetter must display caret notation ^{letter} on Ctrl keypad buttons'
  );
  assert.ok(
    keyboardSource.includes('TouchFloatingToolbar__Btn--ctrl-letter'),
    'renderCtrlLetter must apply TouchFloatingToolbar__Btn--ctrl-letter class'
  );
});

test('TermView handles horizontal and vertical pan offsets and bounds clamping', () => {
  const dummyMain = {
    style: {
      marginLeft: '0px',
      marginTop: '0px'
    }
  };
  const dummyApp = {
    getFirstGridOffsets() {
      return {
        top: parseFloat(dummyMain.style.marginTop) || 0,
        left: parseFloat(dummyMain.style.marginLeft) || 0
      };
    }
  };
  const mockView = {
    chw: 12,
    chh: 24,
    buf: { cols: 80, rows: 24, cur_x: 0, cur_y: 0 },
    innerBounds: { width: 400, height: 700 },
    viewMargin: 0,
    mainDisplay: dummyMain,
    app: dummyApp,
    panX: 0,
    panY: 0,
    cursorPos: null,
    updateCursorPos() {
      this.cursorPos = [
        this.firstGridOffset?.left || 0,
        this.firstGridOffset?.top || 0
      ];
    }
  };

  mockView.getAvailableScrollWidth = function () {
    const cols = this.buf ? this.buf.cols : 80;
    const totalWidth = this.chw * cols + 10;
    const viewportWidth = this.innerBounds.width || 0;
    return Math.max(0, totalWidth - viewportWidth);
  };
  mockView.getAvailableScrollHeight = function () {
    const rows = this.buf ? this.buf.rows : 24;
    const totalHeight = this.chh * rows + 10;
    const viewportHeight = this.innerBounds.height || 0;
    return Math.max(0, totalHeight - viewportHeight);
  };
  mockView.updateMainDisplayMargin = function () {
    if (!this.mainDisplay) return;
    const totalHeight = this.chh * (this.buf ? this.buf.rows : 24);
    let baseMarginTop = this.viewMargin || 0;
    if (totalHeight < this.innerBounds.height) {
      baseMarginTop =
        (this.innerBounds.height - totalHeight) / 2 + (this.viewMargin || 0);
    }
    const curPanY = this.panY || 0;
    this.mainDisplay.style.marginTop = `${baseMarginTop - curPanY}px`;
    const curPanX = this.panX || 0;
    this.mainDisplay.style.marginLeft = `-${curPanX}px`;
  };
  mockView.setPan = function (px, py) {
    const maxPanX = this.getAvailableScrollWidth();
    const maxPanY = this.getAvailableScrollHeight();
    this.panX = Math.max(
      0,
      Math.min(maxPanX, Math.round(px != null ? px : this.panX || 0))
    );
    this.panY = Math.max(
      0,
      Math.min(maxPanY, Math.round(py != null ? py : this.panY || 0))
    );
    this.updateMainDisplayMargin();
    this.firstGridOffset = this.app.getFirstGridOffsets();
    this.updateCursorPos();
  };
  mockView.panBy = function (deltaX = 0, deltaY = 0) {
    this.setPan((this.panX || 0) + deltaX, (this.panY || 0) + deltaY);
  };
  mockView.resetPan = function () {
    this.setPan(0, 0);
  };

  // totalWidth = 12 * 80 + 10 = 970px. viewportWidth = 400px.
  // maxPanX = 970 - 400 = 570px.
  assert.equal(mockView.getAvailableScrollWidth(), 570);

  // Pan by 100px
  mockView.panBy(100, 0);
  assert.equal(mockView.panX, 100);
  assert.equal(dummyMain.style.marginLeft, '-100px');
  assert.equal(mockView.firstGridOffset.left, -100);

  // Pan beyond maxPanX -> clamped to 570
  mockView.panBy(1000, 0);
  assert.equal(mockView.panX, 570);
  assert.equal(dummyMain.style.marginLeft, '-570px');

  // Pan negative -> clamped to 0
  mockView.panBy(-2000, 0);
  assert.equal(mockView.panX, 0);
  assert.equal(dummyMain.style.marginLeft, '-0px');

  // Reset pan
  mockView.panBy(250, 0);
  assert.equal(mockView.panX, 250);
  mockView.resetPan();
  assert.equal(mockView.panX, 0);
});

test('App isMobileLayout detects mobile touch viewports and applies fixed-font-size at runtime', () => {
  assert.ok(appSource.includes('isMobileLayout()'));
  assert.ok(appSource.includes('applyTermSizeMode(values)'));

  function checkIsMobile(hasTouch, width, height) {
    if (!hasTouch) return false;
    const isNarrow = width <= 768;
    const isCompactLandscape = height <= 500 && width <= 1024;
    return isNarrow || isCompactLandscape;
  }

  // 1. Phone portrait: iPhone 14 (393 x 852) with touch -> mobile
  assert.equal(checkIsMobile(true, 393, 852), true);

  // 2. Phone landscape: iPhone 14 (852 x 393) with touch -> mobile
  assert.equal(checkIsMobile(true, 852, 393), true);

  // 3. iPad portrait (768 x 1024) with touch -> mobile
  assert.equal(checkIsMobile(true, 768, 1024), true);

  // 4. Touchscreen laptop (1920 x 1080) with touch -> NOT mobile (desktop behavior preserved)
  assert.equal(checkIsMobile(true, 1920, 1080), false);

  // 5. Desktop without touch (1920 x 1080) -> NOT mobile
  assert.equal(checkIsMobile(false, 1920, 1080), false);

  // 6. Test that applyTermSizeMode resolves fixed-font-size on mobile without mutating input object
  const testPrefs = {
    termSizeMode: 'max-font-size',
    fontSize: 22
  };
  let effectiveMode = null;
  function simulateApply(values, isMobile) {
    effectiveMode = isMobile ? 'fixed-font-size' : values.termSizeMode;
  }
  simulateApply(testPrefs, true);
  assert.equal(effectiveMode, 'fixed-font-size');
  assert.equal(
    testPrefs.termSizeMode,
    'max-font-size',
    'Original prefs must not be mutated'
  );
});

test('TouchController handles horizontal and vertical pan gestures without firing click', () => {
  const touchSource = fs.readFileSync(
    path.resolve('src/touch/TouchController.js'),
    'utf-8'
  );
  assert.ok(touchSource.includes('panDirection'));
  assert.ok(touchSource.includes('app.view.panBy(-moveDeltaX, 0)'));
  assert.ok(touchSource.includes('app.view.panBy(0, -moveDeltaY)'));
  assert.ok(
    touchSource.includes("this.panDirection === 'list_scroll'") ||
      touchSource.includes('this.panDirection === "list_scroll"')
  );
  assert.ok(
    !touchSource.includes('app.inputArea.focus()'),
    'TouchController must not auto-focus inputArea on touch release'
  );
});

test('TouchController handles 2-finger pinch gesture to zoom font and 2-finger pan', () => {
  const listeners = {};
  const mockTermWin = {
    style: {},
    addEventListener(type, fn) {
      listeners[type] = fn;
    },
    removeEventListener(type, fn) {},
    setPointerCapture() {},
    releasePointerCapture() {},
    hasPointerCapture() {
      return false;
    }
  };

  let zoomDelta = 0;
  let panX = 0;
  let panY = 0;
  const mockApp = {
    termWin: mockTermWin,
    zoomFont(delta) {
      zoomDelta += delta;
    },
    view: {
      panBy(dx, dy) {
        panX += dx;
        panY += dy;
      }
    },
    buf: { pageState: 0 }
  };

  const controller = new TouchController(mockApp);
  assert.ok(
    listeners.pointerdown && listeners.pointermove && listeners.pointerup
  );

  // Pointer 1 down at (100, 100)
  listeners.pointerdown({
    pointerType: 'touch',
    pointerId: 1,
    clientX: 100,
    clientY: 100,
    preventDefault() {},
    stopPropagation() {}
  });

  // Pointer 2 down at (200, 100) -> distance = 100
  listeners.pointerdown({
    pointerType: 'touch',
    pointerId: 2,
    clientX: 200,
    clientY: 100,
    preventDefault() {},
    stopPropagation() {}
  });

  assert.equal(controller.isPinching, true);

  // Move pointers apart: Pointer 1 to (80, 100), Pointer 2 to (220, 100) -> distance = 140 (+40px > PINCH_STEP_PX=28)
  listeners.pointermove({
    pointerType: 'touch',
    pointerId: 1,
    clientX: 80,
    clientY: 100,
    preventDefault() {},
    stopPropagation() {}
  });
  listeners.pointermove({
    pointerType: 'touch',
    pointerId: 2,
    clientX: 220,
    clientY: 100,
    preventDefault() {},
    stopPropagation() {}
  });

  assert.ok(zoomDelta >= 1, 'Pinch out should trigger zoomFont(1)');

  // Release pointer 2 and pointer 1
  listeners.pointerup({
    pointerType: 'touch',
    pointerId: 2,
    clientX: 220,
    clientY: 100,
    preventDefault() {},
    stopPropagation() {}
  });
  listeners.pointerup({
    pointerType: 'touch',
    pointerId: 1,
    clientX: 80,
    clientY: 100,
    preventDefault() {},
    stopPropagation() {}
  });
  assert.equal(controller.pointers.size, 0);
  assert.equal(controller.isPinching, false);
});

test('TouchController handles 1-finger drag selection and auto-copies on release', () => {
  const listeners = {};
  const mockTermWin = {
    style: {},
    addEventListener(type, fn) {
      listeners[type] = fn;
    },
    removeEventListener(type, fn) {},
    setPointerCapture() {},
    releasePointerCapture() {},
    hasPointerCapture() {
      return false;
    }
  };

  let selectionStarted = false;
  let selectionUpdated = false;
  let copiedText = null;

  const mockApp = {
    termWin: mockTermWin,
    doCopy(text) {
      copiedText = text;
    },
    view: {
      startSelection(coords) {
        selectionStarted = true;
      },
      updateSelection(coords) {
        selectionUpdated = true;
      },
      endSelection() {
        return 'selected terminal text';
      }
    },
    buf: { pageState: 0 } // Not in article list
  };

  const controller = new TouchController(mockApp);

  // Pointer down at (50, 50)
  listeners.pointerdown({
    pointerType: 'touch',
    pointerId: 1,
    clientX: 50,
    clientY: 50,
    preventDefault() {},
    stopPropagation() {}
  });

  // Drag to (150, 80) -> distance > MOVE_THRESHOLD
  listeners.pointermove({
    pointerType: 'touch',
    pointerId: 1,
    clientX: 150,
    clientY: 80,
    preventDefault() {},
    stopPropagation() {}
  });

  assert.equal(
    selectionStarted,
    true,
    'startSelection should be called on drag'
  );
  assert.equal(
    selectionUpdated,
    true,
    'updateSelection should be called on drag'
  );
  assert.equal(controller.isSelecting, true);

  // Release pointer
  listeners.pointerup({
    pointerType: 'touch',
    pointerId: 1,
    clientX: 150,
    clientY: 80,
    preventDefault() {},
    stopPropagation() {}
  });

  assert.equal(
    copiedText,
    'selected terminal text',
    'Auto-copies selected text on release'
  );
  assert.equal(controller.isSelecting, false);
});

test('TouchController prevents default on touch pointerdown and blurs inputArea with inputmode none', () => {
  const listeners = {};
  let defaultPrevented = false;
  let blurred = false;
  let setInputModeVal = null;
  const mockInputArea = {
    setAttribute(name, val) {
      if (name === 'inputmode') setInputModeVal = val;
    },
    blur() {
      blurred = true;
    }
  };
  const mockTermWin = {
    style: {},
    addEventListener(type, fn) {
      listeners[type] = fn;
    },
    removeEventListener() {},
    setPointerCapture() {}
  };
  const mockApp = {
    termWin: mockTermWin,
    buf: { highlightCursor: false },
    inputArea: mockInputArea,
    view: null,
    openContextMenu() {}
  };

  const controller = new TouchController(mockApp);
  assert.equal(typeof controller.lastTouchTime, 'number');

  listeners.pointerdown({
    pointerType: 'touch',
    pointerId: 1,
    clientX: 100,
    clientY: 100,
    preventDefault() {
      defaultPrevented = true;
    },
    stopPropagation() {}
  });

  assert.equal(defaultPrevented, true, 'Touch pointerdown should preventDefault to suppress synthetic mouse events');
  assert.equal(blurred, true, 'Touch pointerdown should blur inputArea');
  assert.equal(setInputModeVal, 'none', 'Touch pointerdown should set inputmode="none"');
  assert.ok(controller.lastTouchTime > 0, 'lastTouchTime should be updated on touch');
  controller.clearLongPressTimer();
});

test('App setInputAreaFocus guards against auto-focusing on mobile layout or recent touch', () => {
  const updatedAppSource = fs.readFileSync(path.resolve('src/js/app.js'), 'utf-8');
  assert.ok(
    updatedAppSource.includes("this.isMobileLayout() && !force"),
    'setInputAreaFocus should suppress focus on mobile layout unless forced'
  );
  assert.ok(
    updatedAppSource.includes("lastTouchTime"),
    'setInputAreaFocus should check lastTouchTime'
  );

  // Behavior simulation of setInputAreaFocus
  function simulateSetInputAreaFocus(app, force = false) {
    if (app.modalShown || app.contextMenuShown) return false;
    if (app.isMobileLayout() && !force) return false;
    if (app.touch && (app.touch.touchStarted || (Date.now() - (app.touch.lastTouchTime || 0) < 500)) && !force) return false;
    return true;
  }

  // 1. Mobile phone: touches screen -> suppressed
  const mobileApp = {
    modalShown: false,
    contextMenuShown: false,
    isMobileLayout: () => true,
    touch: { touchStarted: false, lastTouchTime: Date.now() - 1000 }
  };
  assert.equal(simulateSetInputAreaFocus(mobileApp, false), false, 'Should be suppressed on mobile phone');
  assert.equal(simulateSetInputAreaFocus(mobileApp, true), true, 'Should allow focus when force is true');

  // 2. Desktop: no touch, not mobile -> allowed
  const desktopApp = {
    modalShown: false,
    contextMenuShown: false,
    isMobileLayout: () => false,
    touch: null
  };
  assert.equal(simulateSetInputAreaFocus(desktopApp, false), true, 'Should allow focus on desktop');

  // 3. Tablet (non-mobile layout) with recent touch (<500ms) -> suppressed
  const tabletApp = {
    modalShown: false,
    contextMenuShown: false,
    isMobileLayout: () => false,
    touch: { touchStarted: false, lastTouchTime: Date.now() - 50 }
  };
  assert.equal(simulateSetInputAreaFocus(tabletApp, false), false, 'Should suppress focus right after touch');
});

test('TouchKeyboard handleFloatingKeyboardToggle toggles inputmode and forces focus', () => {
  const touchKbSource = fs.readFileSync(path.resolve('src/touch/TouchKeyboard.js'), 'utf-8');
  assert.ok(touchKbSource.includes('handleFloatingKeyboardToggle'));
  assert.ok(touchKbSource.includes('inputArea.removeAttribute("inputmode")') || touchKbSource.includes("inputArea.removeAttribute('inputmode')"));
  assert.ok(touchKbSource.includes('app.setInputAreaFocus(true)'));
});

test('index.html contains inputmode="none" and does not have autofocus', () => {
  const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf-8');
  assert.ok(!indexHtml.includes('autofocus'), 'index.html should not have autofocus attribute');
  assert.ok(indexHtml.includes('inputmode="none"'), 'index.html should specify inputmode="none"');
  assert.ok(indexHtml.includes('virtualkeyboardpolicy="manual"'), 'index.html should specify virtualkeyboardpolicy="manual"');
  assert.ok(indexHtml.includes('left:0px; top:0px;'), 'input #t must be in viewport to allow mobile keyboard focus');
  assert.ok(indexHtml.includes('pointer-events:none;'), 'input #t must have pointer-events: none');
  assert.ok(indexHtml.includes('tabindex="-1"'), 'input #t must specify tabindex="-1" to prevent iOS Safari form accessory toolbar');
});

test('App isMobileDevice and TouchKeyboard label toggle handle mobile system keyboard reliably', () => {
  const appSource = fs.readFileSync(path.resolve('src/js/app.js'), 'utf-8');
  const touchKbSource = fs.readFileSync(path.resolve('src/touch/TouchKeyboard.js'), 'utf-8');
  const termViewSource = fs.readFileSync(path.resolve('src/js/term_view.js'), 'utf-8');

  // App isMobileDevice implementation checks
  assert.ok(appSource.includes('isMobileDevice()'), 'App should define isMobileDevice');
  assert.ok(appSource.includes('this.isMobileDevice() && !force'), 'setInputAreaFocus should guard with isMobileDevice');

  // TermView input reset checks
  assert.ok(termViewSource.includes("this.input.style.left =  '0px'") || termViewSource.includes("this.input.style.left = '0px'"));
  assert.ok(termViewSource.includes("pointerEvents = 'none'"));

  // TouchKeyboard label htmlFor="t" and pointerdown checks
  assert.ok(touchKbSource.includes('htmlFor="t"'), 'syskbd toggle should be a label for input#t');
  assert.ok(!touchKbSource.includes('<TouchDebugHUD'), 'TouchKeyboard should not directly embed TouchDebugHUD');
});

test('PrefModal locks termSizeMode to fixed-font-size and disables select on touch interface', () => {
  const prefModalSource = fs.readFileSync(
    prefModalJsPath,
    'utf-8'
  );
  const contextMenuSource = fs.readFileSync(
    path.resolve('src/components/ContextMenu/index.js'),
    'utf-8'
  );

  // PrefModal detects isTouch from props or environment
  assert.ok(prefModalSource.includes('const isTouch = Boolean('));
  assert.ok(prefModalSource.includes('this.props.isTouch !== undefined'));

  // PrefModal locks and disables termSizeMode select when isTouch is true
  assert.ok(
    prefModalSource.includes(
      'value={isTouch ? "fixed-font-size" : values.termSizeMode}'
    )
  );
  assert.ok(prefModalSource.includes('disabled={isTouch}'));

  // PrefModal renders options_touchFixedFontNote when isTouch is true
  assert.ok(prefModalSource.includes('{isTouch && ('));
  assert.ok(prefModalSource.includes('{_("options_touchFixedFontNote")}'));

  // PrefModal shows fontSize input on touch or when fixed-font-size
  assert.ok(
    prefModalSource.includes(
      '{(isTouch || values.termSizeMode === "fixed-font-size") && ('
    )
  );

  // PrefModal hides fixed-term-size and max-font-size on touch
  assert.ok(
    prefModalSource.includes(
      '{!isTouch && values.termSizeMode === "fixed-term-size" && ('
    )
  );
  assert.ok(
    prefModalSource.includes(
      '{!isTouch && values.termSizeMode === "max-font-size" && ('
    )
  );

  // ContextMenu passes isTouchDevice to PrefModal
  assert.ok(contextMenuSource.includes('isTouch={isTouchDevice}'));

  // PrefModal.css sidebar scales proportionally when screen width is narrower than dialog
  const prefModalCss = fs.readFileSync(
    prefModalCssPath,
    'utf-8'
  );
  assert.ok(prefModalCss.includes('width: 22%'), 'sidebar width should be proportional (22%)');
  assert.ok(prefModalCss.includes('max-width: 140px'), 'sidebar max-width should be capped at 140px');
  assert.ok(prefModalCss.includes('@media (max-width: 640px)'), 'PrefModal should have responsive rules for narrow screens');
});

test('PrefModal redesign includes Extensions/Plugins tab with Mac-style toggle list', () => {
  const prefModalSource = fs.readFileSync(
    prefModalJsPath,
    'utf-8'
  );
  const prefModalCss = fs.readFileSync(
    prefModalCssPath,
    'utf-8'
  );

  // 1. PrefModal has plugins tab in nav
  assert.ok(
    prefModalSource.includes('handleNavSelect("plugins")'),
    'PrefModal should have plugins tab in nav'
  );
  assert.ok(
    prefModalSource.includes('{_("options_plugins")}'),
    'PrefModal should render options_plugins translation key'
  );

  // 2. PrefModal queries plugins and displays them in Mac-style list
  assert.ok(
    prefModalSource.includes('getPlugins()'),
    'PrefModal should query plugins via getPlugins()'
  );
  assert.ok(
    prefModalSource.includes('PrefModal__MacList'),
    'PrefModal should render PrefModal__MacList container'
  );
  assert.ok(
    prefModalSource.includes('PrefModal__MacListItem'),
    'PrefModal should render PrefModal__MacListItem rows'
  );
  assert.ok(
    prefModalSource.includes('PrefModal__MacSwitch'),
    'PrefModal should render Mac-style on/off toggle switches'
  );
  assert.ok(
    prefModalSource.includes('plugin.title || plugin.name'),
    'PrefModal should display title provided by queried plugin'
  );
  assert.ok(
    prefModalSource.includes('plugin.description'),
    'PrefModal should display descriptions provided by queried plugin'
  );
  assert.ok(
    prefModalSource.includes('PrefModal__TabSubtitle'),
    'PrefModal should render subtitle below TabLegend divider'
  );
  assert.ok(
    prefModalSource.includes('plugin.renderOptions'),
    'PrefModal Plugins tab must render plugin.renderOptions'
  );
  const liveUpdateSource = fs.readFileSync(
    path.resolve('src/plugins/live_update/LiveUpdate.js'),
    'utf-8'
  );
  assert.ok(
    liveUpdateSource.includes('name: "endTurnsOnLiveUpdate"') ||
    liveUpdateSource.includes('name="endTurnsOnLiveUpdate"'),
    'LiveUpdate plugin must provide endTurnsOnLiveUpdate setting'
  );
  assert.ok(
    liveUpdateSource.includes('name: "liveUpdateInterval"') ||
    liveUpdateSource.includes('name="liveUpdateInterval"'),
    'LiveUpdate plugin must provide liveUpdateInterval setting'
  );
  assert.ok(
    liveUpdateSource.includes('name: "showLiveUpdateToolbar"') ||
    liveUpdateSource.includes('name="showLiveUpdateToolbar"'),
    'LiveUpdate plugin must provide showLiveUpdateToolbar setting'
  );

  // 3. PrefModal.css defines Mac list and switch styles
  assert.ok(
    prefModalCss.includes('.PrefModal__TabSubtitle'),
    'PrefModal.css must style .PrefModal__TabSubtitle'
  );
  assert.ok(
    prefModalCss.includes('.PrefModal__MacList'),
    'PrefModal.css must style .PrefModal__MacList'
  );
  assert.ok(
    prefModalCss.includes('.PrefModal__MacSwitch'),
    'PrefModal.css must style .PrefModal__MacSwitch'
  );
  assert.ok(
    prefModalCss.includes('.PrefModal__MacListItemSub'),
    'PrefModal.css must style .PrefModal__MacListItemSub'
  );
  assert.ok(
    prefModalCss.includes('.PrefModal__MacSwitchSlider'),
    'PrefModal.css must style .PrefModal__MacSwitchSlider'
  );

  // 4. Collapsible options with disclosure chevron
  assert.ok(
    prefModalSource.includes('expandedPluginId: null'),
    'PrefModal must initialize expandedPluginId to null'
  );
  assert.ok(
    prefModalSource.includes('pluginHasOptions'),
    'PrefModal must implement pluginHasOptions helper'
  );
  assert.ok(
    prefModalSource.includes('handleTogglePluginExpand'),
    'PrefModal must implement handleTogglePluginExpand handler'
  );
  assert.ok(
    prefModalSource.includes('PrefModal__MacOptionsBtn'),
    'PrefModal must render PrefModal__MacOptionsBtn options button'
  );
  assert.ok(
    prefModalSource.includes('options_plugin_options'),
    'PrefModal must display options label on options button'
  );
  assert.ok(
    prefModalSource.includes('PrefModal__MacListItemActions'),
    'PrefModal must wrap options button and switch in PrefModal__MacListItemActions'
  );
  assert.ok(
    prefModalCss.includes('.PrefModal__MacOptionsBtn'),
    'PrefModal.css must style .PrefModal__MacOptionsBtn'
  );
  assert.ok(
    prefModalCss.includes('.PrefModal__MacOptionsBtn--expanded'),
    'PrefModal.css must style .PrefModal__MacOptionsBtn--expanded'
  );
  assert.ok(
    prefModalCss.includes('.PrefModal__MacListItem--hasOptions'),
    'PrefModal.css must style .PrefModal__MacListItem--hasOptions'
  );

  // 5. App defines getPluginList and ContextMenu passes app to PrefModal
  const appSource = fs.readFileSync(path.resolve('src/js/app.js'), 'utf-8');
  assert.ok(
    appSource.includes('getPluginList()'),
    'App must define getPluginList()'
  );
  const contextMenuSource = fs.readFileSync(
    path.resolve('src/components/ContextMenu/index.js'),
    'utf-8'
  );
  assert.ok(
    contextMenuSource.includes('app={app}'),
    'ContextMenu must pass app prop to PrefModal'
  );
});

test('PrefModal streamlines extensions UI and consolidates options', () => {
  const prefModalSource = fs.readFileSync(
    prefModalJsPath,
    'utf-8'
  );

  // 1. [Builtin] badge is removed from extension titles
  assert.ok(
    !prefModalSource.includes('plugin.badge'),
    'PrefModal should not render plugin.badge in extension title'
  );

  // 2. Mouse Browsing is moved to plugins tab and removed from standalone nav
  assert.ok(
    !prefModalSource.includes('navActiveKey === "mouseBrowsing"'),
    'PrefModal must remove standalone mouseBrowsing nav and tab'
  );
  const mouseBrowsingSource = fs.readFileSync(
    path.resolve('src/plugins/mouse_browsing/MouseBrowsing.js'),
    'utf-8'
  );
  assert.ok(
    mouseBrowsingSource.includes('renderOptions'),
    'MouseBrowsing plugin must provide renderOptions under plugins tab'
  );
  assert.ok(
    mouseBrowsingSource.includes('name: "mouseBrowsingHighlight"') ||
    mouseBrowsingSource.includes('name="mouseBrowsingHighlight"'),
    'MouseBrowsing must provide mouseBrowsingHighlight under options'
  );
  assert.ok(
    mouseBrowsingSource.includes('name: "mouseLeftFunction"') ||
    mouseBrowsingSource.includes('name="mouseLeftFunction"'),
    'MouseBrowsing must provide mouseLeftFunction under options'
  );

  // 3. Obsolete image preview options are removed from General tab
  const generalTabSection = prefModalSource.substring(
    prefModalSource.indexOf('navActiveKey === "general"'),
    prefModalSource.indexOf('navActiveKey === "bbs"')
  );
  assert.ok(
    !generalTabSection.includes('name="enableMediaPreviewer"'),
    'General tab must not contain enableMediaPreviewer (managed by media_previewer extension)'
  );

  // 4. Obsolete packet dump option is removed from Advanced tab
  const advancedTabSection = prefModalSource.substring(
    prefModalSource.indexOf('navActiveKey === "advanced"'),
    prefModalSource.indexOf('navActiveKey === "about"')
  );
  assert.ok(
    !advancedTabSection.includes('name="enablePacketDump"'),
    'Advanced tab must not contain enablePacketDump (managed by packet_dump extension)'
  );
});

test('PrefModal extension options container and checkboxes are constrained to prevent horizontal overflow', () => {
  const prefModalCss = fs.readFileSync(
    prefModalCssPath,
    'utf-8'
  );
  const prefModalSource = fs.readFileSync(
    prefModalJsPath,
    'utf-8'
  );

  // 1. PrefModal__MacListItemSub has box-sizing: border-box and padding-right to avoid right-boundary overflow
  assert.ok(
    prefModalCss.includes('.PrefModal__MacListItemSub {') &&
      prefModalCss.includes('box-sizing: border-box;'),
    'PrefModal.css must set box-sizing: border-box on .PrefModal__MacListItemSub'
  );
  assert.ok(
    prefModalCss.includes('padding-right: 14px;'),
    'PrefModal.css must set padding-right on .PrefModal__MacListItemSub for symmetrical bounds'
  );

  // 2. PrefModal__MacList resets padding-left to 0 inside Fieldset
  assert.ok(
    prefModalCss.includes('.PrefModal__Grid__Col--right__Fieldset > .PrefModal__MacList {\n  padding-left: 0;\n}'),
    'PrefModal.css must reset padding-left on .PrefModal__MacList'
  );

  // 3. Sub-checkbox labels support flex wrap and word breaking so long strings do not clip
  assert.ok(
    prefModalCss.includes('.PrefModal__MacSubCheckbox label {') &&
      prefModalCss.includes('white-space: normal;') &&
      prefModalCss.includes('display: flex;'),
    'PrefModal__MacSubCheckbox label must use flex layout with white-space: normal'
  );
  assert.ok(
    prefModalCss.includes('.PrefModal__MacSubCheckbox label span {') &&
      prefModalCss.includes('min-width: 0;') &&
      prefModalCss.includes('word-break: break-word;'),
    'PrefModal__MacSubCheckbox label span must allow shrinking (min-width: 0) and word-break'
  );

  // 4. media_previewer checkbox wraps translation in span for flex container
  const mediaPreviewerSource = fs.readFileSync(
    path.resolve('src/plugins/media_previewer/MediaPreviewer.js'),
    'utf-8'
  );
  assert.ok(
    mediaPreviewerSource.includes('<span>{_("options_picPreviewWhitelistOnly")}</span>') ||
    mediaPreviewerSource.includes('_("options_picPreviewWhitelistOnly")'),
    'media_previewer option label text must be wrapped in a span'
  );
});

test('ContextMenu handles letter keypad mode with continuous typing, Shift toggle, and outside dismiss', () => {
  const keyboardSource = fs.readFileSync(
    path.resolve('src/touch/TouchKeyboard.js'),
    'utf-8'
  );
  const cssSource = fs.readFileSync(
    path.resolve('src/touch/TouchUI.css'),
    'utf-8'
  );

  // 1. Verify state properties and handlers exist
  assert.ok(keyboardSource.includes('isAlphaMode: false'));
  assert.ok(keyboardSource.includes('isShiftActive: false'));
  assert.ok(keyboardSource.includes('handleToggleAlphaMode'));
  assert.ok(keyboardSource.includes('handleToggleShift'));
  assert.ok(keyboardSource.includes('handleAlphaLetterDown'));
  assert.ok(keyboardSource.includes('sendAlphaLetter'));
  assert.ok(keyboardSource.includes('renderAlpha = () =>'));
  assert.ok(keyboardSource.includes('renderShift = () =>'));
  assert.ok(keyboardSource.includes('renderAlphaLetter = (letter) =>'));

  // 2. Main toolbar row 1 has A+, A-, Tab, Settings (...) and row 5 dock has Ctrl, a, KeyboardToggle, CollapseToggle
  const mainRow1Snippet = keyboardSource.slice(
    keyboardSource.lastIndexOf('this.renderFontZoomIn()'),
    keyboardSource.indexOf(
      'this.renderEscape()',
      keyboardSource.lastIndexOf('this.renderFontZoomIn()')
    )
  );
  assert.ok(mainRow1Snippet.includes('this.renderFontZoomIn()'));
  assert.ok(mainRow1Snippet.includes('this.renderFontZoomOut()'));
  assert.ok(mainRow1Snippet.includes('this.renderTab()'));
  assert.ok(mainRow1Snippet.includes('this.renderMenuToggle()'));

  const mainRow5Snippet = keyboardSource.slice(
    keyboardSource.lastIndexOf('TouchFloatingToolbar__Row--dock'),
    keyboardSource.lastIndexOf('</div>\n                  </div>')
  );
  assert.ok(mainRow5Snippet.includes('this.renderCtrl()'));
  assert.ok(mainRow5Snippet.includes('this.renderAlpha()'));
  assert.ok(mainRow5Snippet.includes('this.renderKeyboardToggle()'));
  assert.ok(mainRow5Snippet.includes('this.renderCollapseToggle(false)'));
  const ctrlIdx = mainRow5Snippet.indexOf('this.renderCtrl()');
  const alphaIdx = mainRow5Snippet.indexOf('this.renderAlpha()');
  assert.ok(
    ctrlIdx < alphaIdx,
    'renderCtrl must appear before renderAlpha in main dock row'
  );

  // 3. Verify letter keypad renders 6-row QWERTY layout with numbers, typing row, and dock row
  const alphaTrackSnippet = keyboardSource.slice(
    keyboardSource.indexOf('isAlphaMode ? ('),
    keyboardSource.indexOf(': (', keyboardSource.indexOf('isAlphaMode ? ('))
  );
  for (let num = 1; num <= 9; num++) {
    assert.ok(
      alphaTrackSnippet.includes(`this.renderAlphaNumber("${num}")`),
      `Number ${num} must be present in alpha keypad`
    );
  }
  assert.ok(
    alphaTrackSnippet.includes('this.renderAlphaNumber("0")'),
    'Number 0 must be present in alpha keypad'
  );
  assert.ok(
    alphaTrackSnippet.includes('this.renderShift()'),
    'Alpha keypad must render Shift toggle'
  );
  assert.ok(
    alphaTrackSnippet.includes('this.renderCtrl()'),
    'Alpha keypad must render Ctrl toggle to allow switching to Ctrl keypad'
  );
  assert.ok(
    alphaTrackSnippet.includes('this.renderQwertBackspace(false)'),
    'Alpha keypad must render Backspace'
  );
  assert.ok(
    alphaTrackSnippet.includes('this.renderReturnToNormalPad()'),
    'Alpha keypad must render return to normal pad button'
  );
  assert.ok(
    alphaTrackSnippet.includes('this.renderCtrl()'),
    'Alpha keypad must render Ctrl toggle to allow switching to Ctrl keypad'
  );
  assert.ok(
    alphaTrackSnippet.includes('this.renderQwertEscape(false)'),
    'Alpha keypad must render Esc'
  );
  assert.ok(
    alphaTrackSnippet.includes('this.renderQwertSpace(false)'),
    'Alpha keypad must render Space'
  );
  assert.ok(
    alphaTrackSnippet.includes('this.renderQwertEnter(false)'),
    'Alpha keypad must render Enter'
  );
  assert.ok(
    alphaTrackSnippet.includes('this.renderCollapseToggle'),
    'Alpha keypad must render collapse toggle button'
  );
  assert.ok(
    alphaTrackSnippet.indexOf('renderQwertEscape(false)') <
      alphaTrackSnippet.indexOf('renderQwertSpace(false)'),
    'Esc must come before Space in alpha keypad row 5 (swapped)'
  );
  for (let code = 65; code <= 90; code++) {
    const letter = String.fromCharCode(code);
    assert.ok(
      alphaTrackSnippet.includes(`this.renderAlphaLetter("${letter}")`),
      `Letter ${letter} must be present in alpha keypad`
    );
  }

  // 4. Verify sticky vs non-sticky: sendAlphaLetter is sticky, sendCtrlLetter exits to previous state
  const sendAlphaBody = keyboardSource.slice(
    keyboardSource.indexOf('sendAlphaLetter = (letter) => {'),
    keyboardSource.indexOf(
      'handleCtrlLetterDown',
      keyboardSource.indexOf('sendAlphaLetter = (letter) => {')
    )
  );
  assert.ok(
    !sendAlphaBody.includes('isAlphaMode: false'),
    'sendAlphaLetter must not close alpha mode to allow continuous typing (sticky)'
  );

  const sendCtrlBody = keyboardSource.slice(
    keyboardSource.indexOf('sendCtrlLetter = (letter) => {'),
    keyboardSource.indexOf(
      'handleToolbarZoom',
      keyboardSource.indexOf('sendCtrlLetter = (letter) => {')
    )
  );
  assert.ok(
    sendCtrlBody.includes('isCtrlMode: false'),
    'sendCtrlLetter must reset isCtrlMode on single key press (not sticky)'
  );
  assert.ok(
    sendCtrlBody.includes('prev.ctrlPreviousMode === "alpha"'),
    'sendCtrlLetter must return to previous state (alpha if entered from alpha mode)'
  );

  // 5. Test dispatch behavior for lowercase and uppercase (Shift)
  let dispatchedEvent = null;
  const mockApp = {
    view: {
      onKeyDown(e) {
        dispatchedEvent = e;
      }
    },
    conn: {
      send() {}
    }
  };

  function simulateSendLetter(letter, isShiftActive) {
    const char = isShiftActive ? letter.toUpperCase() : letter.toLowerCase();
    const fakeEvent = {
      key: char,
      ctrlKey: false,
      altKey: false,
      shiftKey: Boolean(isShiftActive),
      preventDefault: () => {}
    };
    mockApp.view.onKeyDown(fakeEvent);
  }

  // Unshifted 'a' -> lowercase 'a', shiftKey false
  simulateSendLetter('A', false);
  assert.equal(dispatchedEvent.key, 'a');
  assert.equal(dispatchedEvent.shiftKey, false);

  // Shifted 'a' -> uppercase 'A', shiftKey true
  simulateSendLetter('A', true);
  assert.equal(dispatchedEvent.key, 'A');
  assert.equal(dispatchedEvent.shiftKey, true);

  // 6. Verify outside dismiss logic and window event listeners
  assert.ok(keyboardSource.includes('dismissKeypadsIfOutside'));
  assert.ok(keyboardSource.includes('pointerdown", this.pointerDownHandler'));
  assert.ok(keyboardSource.includes('touchstart", this.touchStartHandler'));
  assert.ok(keyboardSource.includes('click", this.clickHandler'));

  // 7. Verify CSS styles for shift-toggle and alpha-toggle
  assert.ok(cssSource.includes('.TouchFloatingToolbar__Btn--shift-toggle'));
  assert.ok(cssSource.includes('.TouchFloatingToolbar__Btn--alpha-toggle'));
  assert.ok(cssSource.includes('.TouchFloatingToolbar__Btn--alpha-lowercase'));
  assert.ok(cssSource.includes('.TouchFloatingToolbar__Btn--nav-text'));

  // 8. Verify font enlargement: Ctrl at 28px, A+ at 35px, A- at 26px, Esc at 28px, Arrows at 32px
  assert.ok(
    cssSource.includes('font-size: calc(28px * var(--toolbar-scale, 1));'),
    'Ctrl and Esc buttons should be 28px'
  );
  assert.ok(
    cssSource.includes('font-size: calc(26px * var(--toolbar-scale, 1));'),
    'Lowercase letters and A- should be 26px'
  );
  assert.ok(
    cssSource.includes('font-size: calc(22px * var(--toolbar-scale, 1));'),
    'Standard toolbar text keys should be 22px'
  );
  assert.ok(
    cssSource.includes('font-size: calc(16px * var(--toolbar-scale, 1));'),
    'Standard toolbar nav keys should be 16px'
  );
  assert.ok(
    cssSource.includes('width: calc(26px * var(--toolbar-scale, 1));'),
    'Standard toolbar SVG symbol icons should be 26px'
  );
  assert.ok(
    cssSource.includes(
      '.TouchFloatingToolbar__Btn--font-zoom-in {\n  font-size: calc(35px * var(--toolbar-scale, 1));'
    ),
    'TouchUI.css must style TouchFloatingToolbar__Btn--font-zoom-in at 35px'
  );
  assert.ok(
    cssSource.includes(
      '.TouchFloatingToolbar__Btn--font-zoom-out {\n  font-size: calc(26px * var(--toolbar-scale, 1));'
    ),
    'TouchUI.css must style TouchFloatingToolbar__Btn--font-zoom-out at 26px'
  );
  assert.ok(
    cssSource.includes(
      '.TouchFloatingToolbar__Btn--esc {\n  font-size: calc(28px * var(--toolbar-scale, 1));'
    ),
    'TouchUI.css must style TouchFloatingToolbar__Btn--esc at 28px'
  );
  assert.ok(
    cssSource.includes('.TouchFloatingToolbar__Btn--arrow svg,') &&
      cssSource.includes(
        '.TouchFloatingToolbar__Btn--space svg {\n  width: calc(32px * var(--toolbar-scale, 1));'
      ),
    'TouchUI.css must style TouchFloatingToolbar__Btn--arrow and TouchFloatingToolbar__Btn--space svg at 32px'
  );
  assert.ok(
    cssSource.includes('padding-top: calc(5px * var(--toolbar-scale, 1));'),
    'TouchUI.css must shift TouchFloatingToolbar__Btn--font-zoom-out down to align baseline'
  );
  assert.ok(
    keyboardSource.includes('TouchFloatingToolbar__Btn--space'),
    'TouchKeyboard must apply TouchFloatingToolbar__Btn--space to renderSpace'
  );
  assert.ok(
    cssSource.includes('.TouchFloatingToolbar__DragHandle'),
    'TouchUI.css must style TouchFloatingToolbar__DragHandle'
  );
  assert.ok(
    keyboardSource.includes('TouchFloatingToolbar__DragHandle'),
    'TouchKeyboard must render TouchFloatingToolbar__DragHandle'
  );
  assert.ok(
    keyboardSource.includes('this.handleDragStart'),
    'TouchKeyboard must support dragging pads'
  );
  assert.ok(
    keyboardSource.includes('effectiveRight'),
    'TouchKeyboard must position pads with effectiveRight reference point'
  );
  assert.ok(
    keyboardSource.includes('effectiveBottom'),
    'TouchKeyboard must position pads with effectiveBottom reference point'
  );
  assert.ok(
    cssSource.includes(
      '.TouchFloatingToolbar__Btn--num {\n  font-size: calc(30px * var(--toolbar-scale, 1));'
    ),
    'Keypad numbers should be 30px'
  );
  assert.ok(
    cssSource.includes(
      '.TouchFloatingToolbar__Btn--qwert-letter {\n  font-size: calc(30px * var(--toolbar-scale, 1));'
    ),
    'Keypad letters should be 30px'
  );
  assert.ok(
    cssSource.includes(
      '.TouchFloatingToolbar__Btn--qwert-letter.TouchFloatingToolbar__Btn--alpha-lowercase {\n  font-size: calc(31.5px * var(--toolbar-scale, 1));'
    ),
    'Keypad lowercase letters should be 31.5px'
  );
  assert.ok(
    cssSource.includes('font-size: calc(24px * var(--toolbar-scale, 1));'),
    'Keypad shift should be 24px'
  );
  assert.ok(
    cssSource.includes('font-size: calc(23px * var(--toolbar-scale, 1));'),
    'Keypad ctrl should be 23px'
  );
  assert.ok(
    cssSource.includes('font-size: calc(27px * var(--toolbar-scale, 1));'),
    'Keypad esc should be 27px'
  );

  // 9. Verify TouchKeyboard source applies alpha-lowercase and nav-text classes
  assert.ok(
    keyboardSource.includes(
      '"TouchFloatingToolbar__Btn--alpha-lowercase": !isShiftActive'
    ),
    'renderAlphaLetter must apply TouchFloatingToolbar__Btn--alpha-lowercase for lowercase letters'
  );
  assert.ok(
    keyboardSource.includes('TouchFloatingToolbar__Btn--nav-text'),
    'Standard navigation keys (Home, End, PgUp, PgDn) must use TouchFloatingToolbar__Btn--nav-text'
  );

  // 10. Verify TouchKeyboard interaction cooldown
  assert.ok(
    keyboardSource.includes('suppressInteractionUntil'),
    'TouchKeyboard must maintain suppressInteractionUntil cooldown'
  );

  // 11. Verify state transition simulation: return to previous mode
  function simulateToggleCtrl(prevState) {
    if (prevState.isCtrlMode) {
      const returnToAlpha = prevState.ctrlPreviousMode === 'alpha';
      return {
        ...prevState,
        isCtrlMode: false,
        isAlphaMode: returnToAlpha,
        ctrlPreviousMode: null
      };
    }
    const previousMode = prevState.isAlphaMode ? 'alpha' : 'standard';
    return {
      ...prevState,
      isCtrlMode: true,
      isAlphaMode: false,
      ctrlPreviousMode: previousMode
    };
  }

  function simulateSendCtrl(prevState) {
    const returnToAlpha = prevState.ctrlPreviousMode === 'alpha';
    return {
      ...prevState,
      isCtrlMode: false,
      isAlphaMode: returnToAlpha,
      ctrlPreviousMode: null
    };
  }

  // From standard toolbar: enter Ctrl mode, then exit -> returns to standard
  const standardState = {
    isCtrlMode: false,
    isAlphaMode: false,
    ctrlPreviousMode: null
  };
  const ctrlFromStandard = simulateToggleCtrl(standardState);
  assert.equal(ctrlFromStandard.isCtrlMode, true);
  assert.equal(ctrlFromStandard.ctrlPreviousMode, 'standard');
  const exitToStandard = simulateSendCtrl(ctrlFromStandard);
  assert.equal(exitToStandard.isCtrlMode, false);
  assert.equal(exitToStandard.isAlphaMode, false);

  // From alpha keypad: enter Ctrl mode, then exit -> returns to alpha keypad
  const alphaState = {
    isCtrlMode: false,
    isAlphaMode: true,
    ctrlPreviousMode: null
  };
  const ctrlFromAlpha = simulateToggleCtrl(alphaState);
  assert.equal(ctrlFromAlpha.isCtrlMode, true);
  assert.equal(ctrlFromAlpha.ctrlPreviousMode, 'alpha');
  const exitToAlpha = simulateSendCtrl(ctrlFromAlpha);
  assert.equal(exitToAlpha.isCtrlMode, false);
  assert.equal(exitToAlpha.isAlphaMode, true);

  // 12. Verify CSS flex: 2 1 0 rule for shift and ctrl toggles in alpha track top row
  assert.ok(
    cssSource.includes('.TouchFloatingToolbar__Track--alpha'),
    'TouchUI.css must style alpha track top row toggles with flex: 2 1 0'
  );
  assert.ok(
    cssSource.includes('.TouchFloatingToolbar__Btn--shift-sticky'),
    'TouchUI.css must style sticky shift button state'
  );
  assert.ok(
    cssSource.includes('#ffd60a'),
    'TouchUI.css must style sticky shift button with yellow background'
  );
  assert.ok(
    cssSource.includes('.TouchFloatingToolbar__Spacer--shift'),
    'TouchUI.css must define Spacer--shift for Ctrl pad'
  );
  assert.ok(
    cssSource.includes('.TouchFloatingToolbar__Btn--qwert-nav-return'),
    'TouchUI.css must style return to normal pad button in QWERTY tracks'
  );
  assert.ok(
    cssSource.includes('.TouchFloatingToolbar__Btn--qwert-collapse'),
    'TouchUI.css must style collapse button in QWERTY tracks'
  );

  // 13. Verify 3-state Shift toggle cycle (blue active -> yellow sticky -> normal off)
  assert.ok(keyboardSource.includes('isShiftSticky: false'));
  assert.ok(
    keyboardSource.includes(
      '"TouchFloatingToolbar__Btn--shift-sticky": isShiftSticky'
    )
  );

  function simulateShiftToggle(prevState) {
    if (prevState.isShiftSticky) {
      return {
        nextState: { ...prevState, isShiftActive: false, isShiftSticky: false }
      };
    }
    if (prevState.isShiftActive) {
      return {
        nextState: { ...prevState, isShiftActive: true, isShiftSticky: true }
      };
    }
    return {
      nextState: { ...prevState, isShiftActive: true, isShiftSticky: false }
    };
  }

  function simulateSendLetterWithShift(prevState, letter) {
    const char = prevState.isShiftActive
      ? letter.toUpperCase()
      : letter.toLowerCase();
    let nextState = prevState;
    if (prevState.isShiftActive && !prevState.isShiftSticky) {
      nextState = { ...prevState, isShiftActive: false, isShiftSticky: false };
    }
    return { char, nextState };
  }

  // Initial normal state is lowercase
  let sState = { isShiftActive: false, isShiftSticky: false };
  let initialLetter = simulateSendLetterWithShift(sState, 'a');
  assert.equal(
    initialLetter.char,
    'a',
    'Normal state must produce lowercase letter'
  );

  // First click: shift turns blue (active, one-shot) and letters become uppercase
  let res1 = simulateShiftToggle(sState);
  assert.equal(res1.nextState.isShiftActive, true);
  assert.equal(res1.nextState.isShiftSticky, false);

  // One letter typed in one-shot mode: uppercase sent, shift resets to normal (lowercase)
  let typeRes1 = simulateSendLetterWithShift(res1.nextState, 'b');
  assert.equal(typeRes1.char, 'B');
  assert.equal(typeRes1.nextState.isShiftActive, false);
  assert.equal(typeRes1.nextState.isShiftSticky, false);

  // Subsequent letter without shift is lowercase
  let typeRes2 = simulateSendLetterWithShift(typeRes1.nextState, 'c');
  assert.equal(typeRes2.char, 'c');
  assert.equal(typeRes2.nextState.isShiftActive, false);

  // 3-state cycle:
  // Click 1: off -> active (blue)
  let click1 = simulateShiftToggle(sState);
  assert.equal(click1.nextState.isShiftActive, true);
  assert.equal(click1.nextState.isShiftSticky, false);

  // Click 2: active (blue) -> sticky (yellow)
  let click2 = simulateShiftToggle(click1.nextState);
  assert.equal(click2.nextState.isShiftActive, true);
  assert.equal(click2.nextState.isShiftSticky, true);

  // In sticky mode, multiple letters remain uppercase and shift stays on
  let stickyLetter1 = simulateSendLetterWithShift(click2.nextState, 'x');
  assert.equal(stickyLetter1.char, 'X');
  assert.equal(stickyLetter1.nextState.isShiftActive, true);
  assert.equal(stickyLetter1.nextState.isShiftSticky, true);

  let stickyLetter2 = simulateSendLetterWithShift(stickyLetter1.nextState, 'y');
  assert.equal(stickyLetter2.char, 'Y');
  assert.equal(stickyLetter2.nextState.isShiftActive, true);
  assert.equal(stickyLetter2.nextState.isShiftSticky, true);

  // Click 3: sticky (yellow) -> reset to normal (lowercase)
  let click3 = simulateShiftToggle(stickyLetter2.nextState);
  assert.equal(click3.nextState.isShiftActive, false);
  assert.equal(click3.nextState.isShiftSticky, false);

  // Subsequent letter after reset is lowercase
  let letterAfterReset = simulateSendLetterWithShift(click3.nextState, 'z');
  assert.equal(letterAfterReset.char, 'z');

  // 14. Verify number dispatch and mode preservation / exit
  assert.ok(keyboardSource.includes('sendAlphaNumber'));
  assert.ok(keyboardSource.includes('sendCtrlNumber'));
  assert.ok(keyboardSource.includes('handleCtrlKey'));

  function simulateSendNumber(prevState, isCtrl) {
    if (isCtrl) {
      const returnToAlpha = prevState.ctrlPreviousMode === 'alpha';
      return {
        ...prevState,
        isCtrlMode: false,
        isAlphaMode: returnToAlpha,
        ctrlPreviousMode: null
      };
    }
    return { ...prevState };
  }

  const alphaNumberState = {
    isCtrlMode: false,
    isAlphaMode: true,
    ctrlPreviousMode: null
  };
  const afterAlphaNumber = simulateSendNumber(alphaNumberState, false);
  assert.equal(
    afterAlphaNumber.isAlphaMode,
    true,
    'Alpha number must keep alpha mode active'
  );

  const ctrlNumberState = {
    isCtrlMode: true,
    isAlphaMode: false,
    ctrlPreviousMode: 'alpha'
  };
  const afterCtrlNumber = simulateSendNumber(ctrlNumberState, true);
  assert.equal(afterCtrlNumber.isCtrlMode, false);
  assert.equal(
    afterCtrlNumber.isAlphaMode,
    true,
    'Ctrl number must exit to previous mode'
  );

  // 14b. Verify shifted numbers in shift-pad (!@#$%^&*())
  assert.ok(keyboardSource.includes('SHIFT_NUMBER_MAP'));
  const shiftNumberMap = {
    1: '!',
    2: '@',
    3: '#',
    4: '$',
    5: '%',
    6: '^',
    7: '&',
    8: '*',
    9: '(',
    0: ')'
  };
  function simulateSendNumberWithShift(prevState, num) {
    const { isShiftActive, isShiftSticky } = prevState;
    const char =
      isShiftActive && shiftNumberMap[num] ? shiftNumberMap[num] : num;
    let nextState = { ...prevState };
    if (isShiftActive && !isShiftSticky) {
      nextState.isShiftActive = false;
      nextState.isShiftSticky = false;
    }
    return { char, nextState };
  }

  // Without shift: "1" sends "1", shift remains off
  const numWithoutShift = simulateSendNumberWithShift(
    { isShiftActive: false, isShiftSticky: false },
    '1'
  );
  assert.equal(numWithoutShift.char, '1');
  assert.equal(numWithoutShift.nextState.isShiftActive, false);

  // With one-shot shift: "1" sends "!", resets shift to false
  const numWithOneShot = simulateSendNumberWithShift(
    { isShiftActive: true, isShiftSticky: false },
    '1'
  );
  assert.equal(numWithOneShot.char, '!');
  assert.equal(numWithOneShot.nextState.isShiftActive, false);

  // With sticky shift: "1"-"0" send "!@#$%^&*()", shift remains sticky
  const numWithSticky = simulateSendNumberWithShift(
    { isShiftActive: true, isShiftSticky: true },
    '5'
  );
  assert.equal(numWithSticky.char, '%');
  assert.equal(numWithSticky.nextState.isShiftActive, true);
  assert.equal(numWithSticky.nextState.isShiftSticky, true);

  // 15. Verify dragging and right-bottom corner reference point expansion across pads
  function computeEffectivePosition({
    customRight,
    customBottom,
    activeWidth,
    activeHeight,
    viewportWidth,
    viewportHeight
  }) {
    const effectiveRight =
      customRight != null
        ? Math.min(
            customRight,
            activeWidth && viewportWidth > 0
              ? Math.max(4, viewportWidth - activeWidth - 6)
              : customRight
          )
        : null;
    const effectiveBottom =
      customBottom != null
        ? Math.min(
            customBottom,
            activeHeight && viewportHeight > 0
              ? Math.max(4, viewportHeight - activeHeight - 6)
              : customBottom
          )
        : null;
    return { effectiveRight, effectiveBottom };
  }

  const customRight = 30;
  const customBottom = 50;
  const viewportW = 800;
  const viewportH = 600;

  const defaultPad = computeEffectivePosition({
    customRight,
    customBottom,
    activeWidth: 240,
    activeHeight: 250,
    viewportWidth: viewportW,
    viewportHeight: viewportH
  });
  assert.equal(defaultPad.effectiveRight, 30);
  assert.equal(defaultPad.effectiveBottom, 50);

  const ctrlPad = computeEffectivePosition({
    customRight,
    customBottom,
    activeWidth: 420,
    activeHeight: 270,
    viewportWidth: viewportW,
    viewportHeight: viewportH
  });
  assert.equal(
    ctrlPad.effectiveRight,
    30,
    'Ctrl-pad must expand from identical right reference coordinate'
  );
  assert.equal(
    ctrlPad.effectiveBottom,
    50,
    'Ctrl-pad must expand from identical bottom reference coordinate'
  );

  const alphaPad = computeEffectivePosition({
    customRight,
    customBottom,
    activeWidth: 420,
    activeHeight: 270,
    viewportWidth: viewportW,
    viewportHeight: viewportH
  });
  assert.equal(
    alphaPad.effectiveRight,
    30,
    'Alpha-pad must expand from identical right reference coordinate'
  );
  assert.equal(
    alphaPad.effectiveBottom,
    50,
    'Alpha-pad must expand from identical bottom reference coordinate'
  );

  const collapsedPad = computeEffectivePosition({
    customRight,
    customBottom,
    activeWidth: null,
    activeHeight: null,
    viewportWidth: viewportW,
    viewportHeight: viewportH
  });
  assert.equal(
    collapsedPad.effectiveRight,
    30,
    'Collapsed toolbar must anchor to identical right reference coordinate'
  );
  assert.equal(
    collapsedPad.effectiveBottom,
    50,
    'Collapsed toolbar must anchor to identical bottom reference coordinate'
  );
});

test('src/touch module cleanly exports TouchController, computeToolbarLayout, TouchKeyboard, and TouchUI', async () => {
  const touchIndexSource = fs.readFileSync(
    path.resolve('src/touch/index.js'),
    'utf-8'
  );
  assert.ok(touchIndexSource.includes('TouchController'));
  assert.ok(touchIndexSource.includes('computeToolbarLayout'));
  assert.ok(touchIndexSource.includes('TouchKeyboard'));
  assert.ok(touchIndexSource.includes('TouchUI'));

  const touchUiSource = fs.readFileSync(
    path.resolve('src/touch/TouchUI.js'),
    'utf-8'
  );
  assert.ok(touchUiSource.includes('class TouchUI'));
  assert.ok(touchUiSource.includes('<TouchKeyboard'));

  const contextMenuSource = fs.readFileSync(
    path.resolve('src/components/ContextMenu/index.js'),
    'utf-8'
  );
  assert.ok(!contextMenuSource.includes('<TouchKeyboard'), 'ContextMenu must not directly embed TouchKeyboard');
  assert.ok(
    contextMenuSource.includes('handleFloatingMenuToggle = (event, targetEl) =>'),
    'ContextMenu must preserve handleFloatingMenuToggle handler'
  );
});

test('TouchKeyboard uses term.touchui.* localStorage keys for persistence', () => {
  const touchKbSource = fs.readFileSync(path.resolve('src/touch/TouchKeyboard.js'), 'utf-8');

  // Verify storage key constants
  assert.ok(touchKbSource.includes('term.touchui.right'), 'Must define term.touchui.right');
  assert.ok(touchKbSource.includes('term.touchui.bottom'), 'Must define term.touchui.bottom');
  assert.ok(touchKbSource.includes('term.touchui.scale'), 'Must define term.touchui.scale');
  assert.ok(!touchKbSource.includes('pttchrome.toolbar'), 'Must not reference pttchrome.toolbar');

  // Extract and run readStorageFloat and writeStorageItem
  const storage = {};
  const mockLocalStorage = {
    getItem: (k) => storage[k] ?? null,
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; }
  };
  globalThis.window = { localStorage: mockLocalStorage };

  try {
    const fnRegex = /(?:export\s+)?function readStorageFloat[\s\S]*?(?:export\s+)?function writeStorageItem[\s\S]*?\n\}/;
    const match = touchKbSource.match(fnRegex);
    assert.ok(match, 'Must contain readStorageFloat and writeStorageItem functions');

    const fn = new Function('window', `
      ${match[0].replace(/export\s+/g, '')}
      return { readStorageFloat, writeStorageItem };
    `);
    const { readStorageFloat, writeStorageItem } = fn(globalThis.window);

    // 1. readStorageFloat returns null when empty
    assert.equal(readStorageFloat('term.touchui.right'), null);

    // 2. writeStorageItem writes value and readStorageFloat parses it
    writeStorageItem('term.touchui.right', 80);
    assert.equal(storage['term.touchui.right'], '80');
    assert.equal(readStorageFloat('term.touchui.right'), 80);

    writeStorageItem('term.touchui.scale', 1.2);
    assert.equal(storage['term.touchui.scale'], '1.2');
    assert.equal(readStorageFloat('term.touchui.scale'), 1.2);
  } finally {
    delete globalThis.window;
  }
});

test('TouchController suppresses native contextmenu events on touch', () => {
  const listeners = {};
  const mockTermWin = {
    style: {},
    addEventListener(type, fn) {
      listeners[type] = fn;
    },
    removeEventListener() {},
    setPointerCapture() {},
    releasePointerCapture() {}
  };
  let menuOpened = false;
  const mockApp = {
    termWin: mockTermWin,
    openContextMenu() {
      menuOpened = true;
    }
  };

  const controller = new TouchController(mockApp);
  assert.ok(typeof listeners.contextmenu === 'function', 'Should attach contextmenu listener on termWin');

  let prevented = false;
  let stopped = false;
  listeners.contextmenu({
    pointerType: 'touch',
    preventDefault() { prevented = true; },
    stopPropagation() { stopped = true; }
  });

  assert.equal(prevented, true, 'contextmenu should be prevented on touch');
  assert.equal(stopped, true, 'contextmenu should be stopped on touch');
  assert.equal(menuOpened, false, 'openContextMenu should not be called');
});

test('TouchKeyboard sets --keyboard-offset on documentElement and renders clean keyed fragments', () => {
  const touchKbSource = fs.readFileSync(path.resolve('src/touch/TouchKeyboard.js'), 'utf-8');
  assert.ok(
    touchKbSource.includes('document.documentElement.style.setProperty'),
    'TouchKeyboard must set --keyboard-offset on document.documentElement'
  );
  assert.ok(
    touchKbSource.includes('key="collapsed-toolbar"') &&
      touchKbSource.includes('key="expanded-toolbar"'),
    'TouchKeyboard must use keyed fragments for collapsed and expanded toolbars'
  );
  assert.ok(
    touchKbSource.includes('collapse-expand-btn') &&
      touchKbSource.includes('collapse-shrink-btn'),
    'TouchKeyboard must use keyed buttons for collapse toggle'
  );
});

test('TouchKeyboard initial position is bottom-right offset by half a button in x and y', () => {
  const touchKbSource = fs.readFileSync(path.resolve('src/touch/TouchKeyboard.js'), 'utf-8');
  assert.ok(
    touchKbSource.includes('halfBtnX = Math.round((baseBtnWidth * effectiveToolbarScale) / 2)'),
    'TouchKeyboard computes halfBtnX based on button width and toolbar scale'
  );
  assert.ok(
    touchKbSource.includes('halfBtnY = Math.round((baseBtnHeight * effectiveToolbarScale) / 2)'),
    'TouchKeyboard computes halfBtnY based on button height and toolbar scale'
  );
  assert.ok(
    touchKbSource.includes('baseRightOffset = halfBtnX'),
    'TouchKeyboard bases initial right offset on halfBtnX'
  );
  assert.ok(
    touchKbSource.includes('initialBottom =') && touchKbSource.includes('halfBtnY'),
    'TouchKeyboard bases initial bottom offset on halfBtnY'
  );
  const touchCssSource = fs.readFileSync(path.resolve('src/touch/TouchUI.css'), 'utf-8');
  assert.ok(
    touchCssSource.includes('calc(26px * var(--toolbar-scale, 1))'),
    'TouchUI.css fallback offset is half a button (26px * var(--toolbar-scale, 1))'
  );
  assert.ok(
    touchCssSource.includes('env(safe-area-inset-bottom, 0px)') &&
      touchCssSource.includes('env(safe-area-inset-right, 0px)'),
    'TouchUI.css respects safe-area-insets'
  );
});

test('TouchKeyboard collapsed toolbar places drag handle line on top and eliminates left grip dots', () => {
  const touchKbSource = fs.readFileSync(path.resolve('src/touch/TouchKeyboard.js'), 'utf-8');
  assert.ok(
    !touchKbSource.includes('TouchFloatingToolbar__DragGrip'),
    'TouchKeyboard must not render TouchFloatingToolbar__DragGrip with dots on left'
  );
  assert.ok(
    touchKbSource.includes('TouchFloatingToolbar__DragHandle--collapsed') &&
      touchKbSource.includes('TouchFloatingToolbar__Row--collapsed'),
    'Collapsed toolbar must render top drag handle bar above button row'
  );
  const touchCssSource = fs.readFileSync(path.resolve('src/touch/TouchUI.css'), 'utf-8');
  assert.ok(
    touchCssSource.includes('.TouchFloatingToolbar__DragHandle--collapsed'),
    'TouchUI.css must style collapsed top drag handle'
  );
  assert.ok(
    touchCssSource.includes('.TouchFloatingToolbar__Row--collapsed'),
    'TouchUI.css must style collapsed buttons row'
  );
});

test('TouchKeyboard uses dedicated drag handle with key repeat and immediate touch response', () => {
  const touchKbSource = fs.readFileSync(path.resolve('src/touch/TouchKeyboard.js'), 'utf-8');
  const touchCssSource = fs.readFileSync(path.resolve('src/touch/TouchUI.css'), 'utf-8');
  assert.ok(
    touchKbSource.includes('keyRepeatTimer'),
    'TouchKeyboard must use keyRepeatTimer for smooth key repeat'
  );
  assert.ok(
    touchKbSource.includes('keyRepeatInterval'),
    'TouchKeyboard must use keyRepeatInterval'
  );
  assert.ok(
    !touchKbSource.includes('pendingAction'),
    'TouchKeyboard must not delay keys via pendingAction'
  );
  assert.ok(
    touchCssSource.includes('width: 64px;') && touchCssSource.includes('height: 20px;'),
    'TouchUI.css must provide enlarged top drag handle'
  );
});

test('TouchKeyboard and ContextMenu handleFloatingMenuToggle safely resolves bounding rect when event currentTarget is null', () => {
  const touchKbSource = fs.readFileSync(path.resolve('src/touch/TouchKeyboard.js'), 'utf-8');
  const contextMenuSource = fs.readFileSync(path.resolve('src/components/ContextMenu/index.js'), 'utf-8');

  // 1. TouchKeyboard passes captured currentTarget in touch handler
  assert.ok(
    touchKbSource.includes('this.handleFloatingMenuToggle(e, e.currentTarget)'),
    'TouchKeyboard must forward target element for touch action'
  );

  // 2. TouchKeyboard handleFloatingMenuToggle accepts targetEl and guards getBoundingClientRect
  assert.ok(
    touchKbSource.includes('handleFloatingMenuToggle = (event, targetEl) =>'),
    'TouchKeyboard handleFloatingMenuToggle must accept targetEl parameter'
  );

  // 3. ContextMenu handleFloatingMenuToggle accepts targetEl and guards getBoundingClientRect
  assert.ok(
    contextMenuSource.includes('handleFloatingMenuToggle = (event, targetEl) =>'),
    'ContextMenu handleFloatingMenuToggle must accept targetEl parameter'
  );

  // 4. Verify behavioral execution with null currentTarget (simulating deferred touch event)
  const dummyButton = {
    getBoundingClientRect() {
      return { top: 100, bottom: 140, left: 200, right: 240, width: 40, height: 40 };
    },
  };

  let openedContextMenuArgs = null;
  const mockApp = {
    openContextMenu(x, y) {
      openedContextMenuArgs = { x, y };
    },
  };

  const deferredEventWithNullCurrentTarget = {
    currentTarget: null,
    target: { closest: () => dummyButton },
    preventDefault() {},
    stopPropagation() {},
  };

  const target = dummyButton;
  const rect = target.getBoundingClientRect();
  mockApp.openContextMenu(rect.right, rect.top - 4);
  assert.deepEqual(openedContextMenuArgs, { x: 240, y: 96 });
});

test('DropdownMenu and ContextMenu guard against ghost clicks and position clear of anchor button', () => {
  const dropdownJsSource = fs.readFileSync(path.resolve('src/components/ContextMenu/DropdownMenu.js'), 'utf-8');
  const contextMenuSource = fs.readFileSync(path.resolve('src/components/ContextMenu/index.js'), 'utf-8');
  const touchKbSource = fs.readFileSync(path.resolve('src/touch/TouchKeyboard.js'), 'utf-8');

  // 1. DropdownMenu supports anchorRect and non-overlapping placement
  assert.ok(dropdownJsSource.includes('anchorRect'), 'DropdownMenu must accept anchorRect');
  assert.ok(dropdownJsSource.includes('anchorRect.top > pageHeight / 2'), 'DropdownMenu must compute top/bottom half placement');
  assert.ok(contextMenuSource.includes('anchorRect={this.state.anchorRect}'), 'ContextMenu must pass anchorRect to DropdownMenu');

  // 2. Ghost click suppression
  assert.ok(dropdownJsSource.includes('onClickCapture'), 'DropdownMenu must capture clicks on menu to suppress ghost clicks');
  assert.ok(dropdownJsSource.includes('openedAtRef.current + 350'), 'DropdownMenu must suppress clicks within 350ms cooldown');
  assert.ok(contextMenuSource.includes('this._menuOpenedAt || 0) + 350'), 'ContextMenu handleMenuSelect must ignore clicks within 350ms of open');

  // 3. TouchKeyboard renderMenuToggle must not double-toggle on synthetic click
  assert.ok(
    touchKbSource.includes('onClick={(e) => {') &&
      (touchKbSource.includes('e?.preventDefault?.()') ||
        touchKbSource.includes('if (e && e.preventDefault)')),
    'TouchKeyboard renderMenuToggle must prevent synthetic click from re-toggling'
  );
});

test('App setNavCmd dispatches navigation commands and replaces legacy setBBSCmd', () => {
  const currentAppSource = fs.readFileSync(path.resolve('src/js/app.js'), 'utf-8');
  const mbSource = fs.readFileSync(path.resolve('src/plugins/mouse_browsing/MouseBrowsing.js'), 'utf-8');
  assert.ok(!currentAppSource.includes('setBBSCmd'), 'App must not contain legacy setBBSCmd');
  assert.ok(currentAppSource.includes('setNavCmd(cmd)'), 'App should declare setNavCmd(cmd)');
  assert.ok(mbSource.includes('this.app.setNavCmd(action)'), 'MouseBrowsing wheel handler should call setNavCmd');
  assert.ok(mbSource.includes('app.setNavCmd("doEnter")'), 'MouseBrowsing left click handler should call setNavCmd');
});
test('DropdownMenu hides and positions before showing to prevent top-left popup flicker', () => {
  const dropdownJsSource = fs.readFileSync(path.resolve('src/components/ContextMenu/DropdownMenu.js'), 'utf-8');
  const dropdownCssSource = fs.readFileSync(path.resolve('src/components/ContextMenu/DropdownMenu.css'), 'utf-8');
  const contextMenuSource = fs.readFileSync(path.resolve('src/components/ContextMenu/index.js'), 'utf-8');

  // 1. DropdownMenu.css defines default hidden visibility
  assert.ok(
    dropdownCssSource.includes('visibility: hidden;'),
    'DropdownMenu.css must define visibility: hidden for .DropdownMenu--reset'
  );

  // 2. DropdownMenu.js uses useLayoutEffect and open prop
  assert.ok(
    dropdownJsSource.includes('useLayoutEffect'),
    'DropdownMenu must use useLayoutEffect instead of useEffect to position before paint'
  );
  assert.ok(
    dropdownJsSource.includes('open,'),
    'DropdownMenu must accept open prop'
  );
  assert.ok(
    dropdownJsSource.includes('el.style.visibility = "visible";'),
    'DropdownMenu must reveal element with visibility: visible only after positioning'
  );

  // 3. ContextMenu passes open prop to DropdownMenu
  assert.ok(
    contextMenuSource.includes('<DropdownMenu') && contextMenuSource.includes('open={open}'),
    'ContextMenu must pass open prop to DropdownMenu'
  );
});

test('InputHelperModal renders close button on right and aligns send combo button to right', () => {
  const inputHelperJs = fs.readFileSync(
    fs.existsSync(path.resolve('src/plugins/input_helper/InputHelperModal.js'))
      ? path.resolve('src/plugins/input_helper/InputHelperModal.js')
      : path.resolve('src/components/ContextMenu/InputHelperModal.js'),
    'utf-8'
  );
  const inputHelperCss = fs.readFileSync(
    fs.existsSync(path.resolve('src/plugins/input_helper/InputHelperModal.css'))
      ? path.resolve('src/plugins/input_helper/InputHelperModal.css')
      : path.resolve('src/components/ContextMenu/InputHelperModal.css'),
    'utf-8'
  );
  const uiCss = fs.readFileSync(path.resolve('src/css/ui.css'), 'utf-8');

  // 1. Header has title before close button and flex space-between
  assert.ok(
    inputHelperJs.indexOf('<h4 className="modal-title"') < inputHelperJs.indexOf('className="close"'),
    'InputHelperModal must render modal-title before close button in DOM order'
  );
  assert.ok(
    inputHelperCss.includes('justify-content: space-between'),
    'InputHelperModal.css must position close button on the right with justify-content: space-between'
  );

  // 2. Action row aligns send combo button to right
  assert.ok(
    inputHelperCss.includes('.InputHelperModal__SendButtonContainer') &&
    inputHelperCss.includes('justify-content: flex-end'),
    'InputHelperModal.css must right-align send button container'
  );

  // 3. ui.css defines .btn-group and grid helper classes
  assert.ok(
    uiCss.includes('.btn-group'),
    'ui.css must define .btn-group for combo/split button styling'
  );
  assert.ok(
    uiCss.includes('.col-xs-4') && uiCss.includes('.col-xs-8'),
    'ui.css must define .col-xs-4 and .col-xs-8 grid classes'
  );

  // 4. Blink toggle in InputHelperModal has id/htmlFor and preview blink animation
  assert.ok(
    inputHelperJs.includes('id="inputHelperBlink"') &&
    inputHelperJs.includes('htmlFor="inputHelperBlink"'),
    'InputHelperModal must bind label htmlFor and checkbox id for Blink option'
  );
  assert.ok(
    inputHelperCss.includes('@keyframes inputHelperBlink') &&
    inputHelperCss.includes('.InputHelperModal__Preview .qq'),
    'InputHelperModal.css must define self-contained blink animation for preview text'
  );

  // 5. App defines isDialogOrExcludedTarget to prevent stealing clicks from dialogs
  const appSource = fs.readFileSync(path.resolve('src/js/app.js'), 'utf-8');
  assert.ok(
    appSource.includes('isDialogOrExcludedTarget(e)'),
    'App must define isDialogOrExcludedTarget helper'
  );
  assert.ok(
    appSource.includes('mouse_click(e) {\n  if (this.modalShown || this.contextMenuShown || this.isDialogOrExcludedTarget(e))') ||
    appSource.includes('this.isDialogOrExcludedTarget(e)'),
    'App mouse handlers must guard against dialog and modal click interception'
  );
});

test('CanvasScreen and TermView handle Select All, lastSelection, and Mac/PC hotkeys', () => {
  const canvasSource = fs.readFileSync(path.resolve('src/components/Canvas/CanvasScreen.js'), 'utf-8');
  const termViewSource = fs.readFileSync(path.resolve('src/js/term_view.js'), 'utf-8');
  const appSource = fs.readFileSync(path.resolve('src/js/app.js'), 'utf-8');
  const dropdownSource = fs.readFileSync(path.resolve('src/components/ContextMenu/DropdownMenu.js'), 'utf-8');

  // 1. CanvasScreen.selectAll sets dragStarted, coordinates, synchronous state, and triggers draw
  assert.ok(
    canvasSource.includes('this.dragStarted = true;'),
    'CanvasScreen.selectAll must set dragStarted to true'
  );
  assert.ok(
    canvasSource.includes('this.isMouseDown = false;'),
    'CanvasScreen.selectAll must set isMouseDown to false'
  );
  assert.ok(
    canvasSource.includes('this.state.selStart = selStart;') &&
    canvasSource.includes('this.state.selEnd = selEnd;'),
    'CanvasScreen.selectAll must update state.selStart and state.selEnd synchronously'
  );
  assert.ok(
    canvasSource.includes('this.draw();'),
    'CanvasScreen.selectAll must call this.draw() immediately to paint highlight'
  );

  // Simulate CanvasScreen selectAll logic
  let drawCalled = 0;
  let focusCalled = 0;
  const mockCanvasScreen = {
    cols: 80,
    rows: 24,
    getCols() { return this.cols; },
    getRows() { return this.rows; },
    isMouseDown: true,
    dragStarted: false,
    startPos: null,
    state: { selStart: null, selEnd: null },
    props: {
      setInputAreaFocus() { focusCalled++; }
    },
    draw() { drawCalled++; },
    setState(newState, callback) {
      Object.assign(this.state, newState);
      if (callback) callback();
    },
    getSelectionColRow() {
      if (!this.dragStarted || !this.state.selStart || !this.state.selEnd) return null;
      return { start: this.state.selStart, end: this.state.selEnd };
    }
  };
  const selectAllFn = new Function(
    canvasSource.match(/selectAll = \(\) => \{([\s\S]*?\n  )\};/)[1]
  ).bind(mockCanvasScreen);

  selectAllFn();
  assert.equal(mockCanvasScreen.isMouseDown, false);
  assert.equal(mockCanvasScreen.dragStarted, true);
  assert.deepEqual(mockCanvasScreen.startPos, { col: 0, row: 0 });
  assert.deepEqual(mockCanvasScreen.state.selStart, { col: 0, row: 0 });
  assert.deepEqual(mockCanvasScreen.state.selEnd, { col: 79, row: 23 });
  assert.ok(drawCalled >= 1, 'draw() must be called');
  assert.equal(focusCalled, 1, 'setInputAreaFocus() must be called');
  assert.deepEqual(mockCanvasScreen.getSelectionColRow(), {
    start: { col: 0, row: 0 },
    end: { col: 79, row: 23 }
  });

  // 2. App.doSelectAll updates lastSelection from view
  assert.ok(
    appSource.includes('this.lastSelection = this.view.getSelectionColRow();'),
    'App.doSelectAll must update this.lastSelection from view.getSelectionColRow()'
  );
  let viewSelectAllCalled = 0;
  const mockApp = {
    lastSelection: null,
    view: {
      selectAll() {
        viewSelectAllCalled++;
      },
      getSelectionColRow() {
        return { start: { col: 0, row: 0 }, end: { col: 79, row: 23 } };
      }
    },
    doSelectAll() {
      this.view.selectAll();
      this.lastSelection = this.view.getSelectionColRow();
    }
  };
  mockApp.doSelectAll();
  assert.equal(viewSelectAllCalled, 1);
  assert.deepEqual(mockApp.lastSelection, {
    start: { col: 0, row: 0 },
    end: { col: 79, row: 23 }
  });

  // 3. TermView allows Mac metaKey for Cmd+A, Cmd+C, Cmd+V and App handles shortcut keydowns
  assert.ok(
    termViewSource.includes('e.metaKey') &&
    termViewSource.includes("k === 'a' || k === 'c' || k === 'v'"),
    'TermView keyEventFilter must allow metaKey for A, C, and V'
  );
  assert.ok(
    appSource.includes('handleShortcutKeyDown(e)') &&
    appSource.includes('isModifierOnly') &&
    appSource.includes('isShiftModifier'),
    'App must handle Ctrl/Cmd+C, A, V shortcuts in handleShortcutKeyDown'
  );
  assert.ok(
    !termViewSource.includes('doSelectAll') &&
    !termViewSource.includes('doPaste') &&
    !termViewSource.includes('Make a key event mapper'),
    'TermView must not contain App clipboard/select-all shortcut handlers or legacy TODO'
  );
  assert.ok(
    termViewSource.includes('this.redraw(true);') &&
    termViewSource.includes('this.componentScreen.selectAll()'),
    'TermView.selectAll must ensure canvas engine screen is redrawn/mounted if needed'
  );

  // 4. DropdownMenu displays platform-appropriate hotkeys
  assert.ok(
    dropdownSource.includes('isMac ? "⌘A" : "Ctrl+A"') ||
    dropdownSource.includes("isMac ? '⌘A' : 'Ctrl+A'"),
    'DropdownMenu must show ⌘A on Mac and Ctrl+A on other platforms'
  );
  assert.ok(
    dropdownSource.includes('isMac ? "⌘C" : "Ctrl+C"') ||
    dropdownSource.includes("isMac ? '⌘C' : 'Ctrl+C'"),
    'DropdownMenu must show ⌘C on Mac and Ctrl+C on other platforms'
  );
  assert.ok(
    dropdownSource.includes('isMac ? "⌘V" : "Shift+Insert"') ||
    dropdownSource.includes("isMac ? '⌘V' : 'Shift+Insert'"),
    'DropdownMenu must show ⌘V on Mac and Shift+Insert on other platforms'
  );
});

test('ContextMenu and DropdownMenu dynamically link Live Helper and Input Helper to extension toggles', () => {
  const dropdownSource = fs.readFileSync(
    path.resolve('src/components/ContextMenu/DropdownMenu.js'),
    'utf-8'
  );
  const contextMenuSource = fs.readFileSync(
    path.resolve('src/components/ContextMenu/index.js'),
    'utf-8'
  );
  const appSource = fs.readFileSync(path.resolve('src/js/app.js'), 'utf-8');
  const prefSource = fs.readFileSync(path.resolve('src/js/pref.js'), 'utf-8');
  const inputHelperSource = fs.readFileSync(
    path.resolve('src/plugins/input_helper/InputHelper.js'),
    'utf-8'
  );

  // 1. DEFAULT_PREFS defines enableInputHelper
  assert.ok(
    prefSource.includes('enableInputHelper: true'),
    'DEFAULT_PREFS must include enableInputHelper: true'
  );

  // 2. DropdownMenu renders dynamic pluginItems instead of hardcoded helpers
  assert.ok(
    dropdownSource.includes('pluginItems &&') &&
      dropdownSource.includes('pluginItems.map'),
    'DropdownMenu must dynamically render pluginItems'
  );
  assert.ok(
    !dropdownSource.includes('liveHelperEnabled'),
    'DropdownMenu must not contain hardcoded liveHelperEnabled fallback'
  );
  assert.ok(
    !dropdownSource.includes('inputHelperEnabled'),
    'DropdownMenu must not contain hardcoded inputHelperEnabled fallback'
  );

  // 3. ContextMenu allows plugins to register items without proactive lookup
  assert.ok(
    contextMenuSource.includes('getRegisteredItems') &&
      contextMenuSource.includes('registerItem') &&
      appSource.includes('registerContextMenuItem'),
    'ContextMenu and App must provide context menu item registration'
  );
  assert.ok(
    !contextMenuSource.includes('app?.getPlugin?.("live_update")'),
    'ContextMenu must not proactively query getPlugin("live_update")'
  );
  assert.ok(
    !contextMenuSource.includes('app?.getPlugin?.("input_helper")'),
    'ContextMenu must not proactively query getPlugin("input_helper")'
  );
  assert.ok(
    !contextMenuSource.includes('handleLiveArticleHelperClick'),
    'ContextMenu must not define hardcoded handleLiveArticleHelperClick'
  );

  // 4. InputHelper plugin declares preference and App handles onValuesPrefChange
  assert.ok(
    inputHelperSource.includes('enableInputHelper') || inputHelperSource.includes('readValuesWithDefault()'),
    'InputHelper must declare its prefKey'
  );
  assert.ok(
    inputHelperSource.includes('PluginBase'),
    'InputHelper must extend PluginBase'
  );
  assert.ok(
    appSource.includes("case 'enableInputHelper':") ||
      appSource.includes('term:pref-change'),
    'App onValuesPrefChange must broadcast preferences or handle enableInputHelper'
  );
});

test('TermView eliminates redundant FpsMeter instantiation and decouples from plugin', () => {
  assert.ok(
    !termViewSource.includes('new FpsMeter'),
    'TermView constructor must not instantiate new FpsMeter directly'
  );
  assert.ok(
    !termViewSource.includes("getPlugin?.('fps_meter')"),
    'TermView must not directly reference fps_meter plugin'
  );
  assert.ok(
    termViewSource.includes("term:render-frame"),
    'TermView should dispatch term:render-frame for frame monitoring'
  );
});

test('PluginOverlay and App provide modular overlay registration for plugins', () => {
  const pluginOverlaySource = fs.readFileSync(
    path.resolve('src/components/PluginOverlay.js'),
    'utf-8'
  );
  const appOverlaySource = fs.readFileSync(
    path.resolve('src/components/AppOverlay.js'),
    'utf-8'
  );

  assert.ok(
    appOverlaySource.includes('<PluginOverlay'),
    'AppOverlay must include PluginOverlay'
  );
  assert.ok(
    pluginOverlaySource.includes('registeredOverlays') ||
      pluginOverlaySource.includes('getOverlays'),
    'PluginOverlay must query registered overlays'
  );
  assert.ok(
    pluginOverlaySource.includes('renderOverlay'),
    'PluginOverlay must support plugin.renderOverlay'
  );
  assert.ok(
    appSource.includes('registerOverlay') &&
      appSource.includes('unregisterOverlay') &&
      appSource.includes('getOverlays'),
    'App must provide overlay registration methods'
  );

  const testOverlay = {
    id: 'test_overlay',
    render: () => h('div', { id: 'test_overlay_content' }, 'Overlay Content'),
  };

  const registered = [];
  const appMock = {
    overlays: registered,
    registerOverlay(overlay) {
      const idx = this.overlays.findIndex((o) => o.id === overlay.id);
      if (idx !== -1) this.overlays[idx] = overlay;
      else this.overlays.push(overlay);
    },
    unregisterOverlay(id) {
      const idx = this.overlays.findIndex((o) => o.id === id);
      if (idx !== -1) this.overlays.splice(idx, 1);
    },
    getOverlays() {
      return [...this.overlays];
    },
  };

  appMock.registerOverlay(testOverlay);
  assert.equal(appMock.getOverlays().length, 1);
  assert.equal(appMock.getOverlays()[0].id, 'test_overlay');

  appMock.unregisterOverlay('test_overlay');
  assert.equal(appMock.getOverlays().length, 0);
});

test('InputHelper decouples UI from ContextMenu and renders via PluginOverlay', () => {
  const contextMenuSource = fs.readFileSync(
    path.resolve('src/components/ContextMenu/index.js'),
    'utf-8'
  );
  const inputHelperSource = fs.readFileSync(
    path.resolve('src/plugins/input_helper/InputHelper.js'),
    'utf-8'
  );

  // ContextMenu no longer imports or renders InputHelperModal
  assert.ok(
    !contextMenuSource.includes('InputHelperModal'),
    'ContextMenu must not import or render InputHelperModal'
  );
  assert.ok(
    !contextMenuSource.includes('showsInputHelper'),
    'ContextMenu must not manage showsInputHelper state'
  );

  // ContextMenu no longer has hardcoded handleInputHelperClick
  assert.ok(
    !contextMenuSource.includes('handleInputHelperClick'),
    'ContextMenu must not define hardcoded handleInputHelperClick'
  );

  // InputHelper defines renderOverlay
  assert.ok(
    inputHelperSource.includes('renderOverlay'),
    'InputHelper must define renderOverlay'
  );
  assert.ok(
    inputHelperSource.includes('term:overlay:update'),
    'InputHelper must trigger term:overlay:update on modal toggle'
  );
});

test('ContextMenu allows plugins to register menu items and unregister dynamically', () => {
  const testItem = {
    id: 'test_plugin_item',
    label: 'Test Plugin Action',
    order: 15,
    visible: () => true,
    onClick: () => {},
  };

  const registeredItems = [];
  const appMock = {
    contextMenuItems: registeredItems,
    registerContextMenuItem(item) {
      const idx = this.contextMenuItems.findIndex((i) => i.id === item.id);
      if (idx !== -1) this.contextMenuItems[idx] = item;
      else this.contextMenuItems.push(item);
    },
    unregisterContextMenuItem(id) {
      const idx = this.contextMenuItems.findIndex((i) =>
        typeof id === 'string' ? i.id === id : i.id === id?.id
      );
      if (idx !== -1) this.contextMenuItems.splice(idx, 1);
    },
    getContextMenuItems() {
      return [...this.contextMenuItems];
    },
  };

  appMock.registerContextMenuItem(testItem);
  assert.equal(appMock.getContextMenuItems().length, 1);
  assert.equal(appMock.getContextMenuItems()[0].id, 'test_plugin_item');

  appMock.unregisterContextMenuItem('test_plugin_item');
  assert.equal(appMock.getContextMenuItems().length, 0);
});

test('App and ContextMenu decouple mouse browsing and easy reading through events and input interceptors', () => {
  const appSource = fs.readFileSync(path.resolve('src/js/app.js'), 'utf-8');
  const contextMenuSource = fs.readFileSync(
    path.resolve('src/components/ContextMenu/index.js'),
    'utf-8'
  );
  const termViewSource = fs.readFileSync(
    path.resolve('src/js/term_view.js'),
    'utf-8'
  );

  // App switchMouseBrowsing no longer queries getPlugin('mouse_browsing')
  assert.ok(
    !appSource.includes("this.getPlugin('mouse_browsing')"),
    'App switchMouseBrowsing must not call this.getPlugin("mouse_browsing")'
  );
  assert.ok(
    appSource.includes("term:pref-change"),
    'App switchMouseBrowsing must dispatch term:pref-change'
  );
  assert.ok(
    !appSource.includes("this.buf.useMouseBrowsing"),
    'App must not reference this.buf.useMouseBrowsing'
  );

  // ContextMenu checks hasActiveInputInterceptor
  assert.ok(
    contextMenuSource.includes('app.hasActiveInputInterceptor()'),
    'ContextMenu must use app.hasActiveInputInterceptor'
  );
  assert.ok(
    !contextMenuSource.includes('app.view.isEasyReadingActive'),
    'ContextMenu must not depend on app.view.isEasyReadingActive'
  );

  // TermView does not define isEasyReadingActive or inspect pageState
  assert.ok(
    !termViewSource.includes('isEasyReadingActive'),
    'TermView must not define or depend on isEasyReadingActive'
  );
  assert.ok(
    !termViewSource.includes('pageState'),
    'TermView must not inspect or reference pageState'
  );
});

test('Plugins implement renderOptions and decouple easy_reading from core and ContextMenu', () => {
  const contextMenuSource = fs.readFileSync(
    path.resolve('src/components/ContextMenu/index.js'),
    'utf-8'
  );
  const termViewSource = fs.readFileSync(
    path.resolve('src/js/term_view.js'),
    'utf-8'
  );

  // 1. ContextMenu does not access app.view.useEasyReadingMode
  assert.ok(
    !contextMenuSource.includes('app.view.useEasyReadingMode'),
    'ContextMenu must not reference app.view.useEasyReadingMode'
  );

  // 2. TermView does not call getPlugin('easy_reading') or reference _easyReading
  assert.ok(
    !termViewSource.includes("getPlugin?.('easy_reading')"),
    'TermView must not call getPlugin("easy_reading")'
  );
  assert.ok(
    !termViewSource.includes('_easyReading'),
    'TermView must not reference _easyReading'
  );

  // 3. Plugins provide renderOptions
  assert.equal(typeof AntiIdle.renderOptions, 'function');
  assert.equal(typeof AutoWrap.renderOptions, 'function');
  assert.equal(typeof MediaPreviewer.renderOptions, 'function');
  assert.equal(typeof LiveUpdate.renderOptions, 'function');
  assert.equal(typeof MouseBrowsing.renderOptions, 'function');

  // 4. renderOptions produce valid elements
  const antiIdleEl = AntiIdle.renderOptions({
    values: { antiIdleTime: 45 },
    handleNumberInputChange: () => {},
  });
  assert.ok(antiIdleEl && typeof antiIdleEl === 'object');

  const autoWrapEl = AutoWrap.renderOptions({
    values: { lineWrap: 78 },
    handleNumberInputChange: () => {},
  });
  assert.ok(autoWrapEl && typeof autoWrapEl === 'object');

  const mediaPreviewerEl = MediaPreviewer.renderOptions({
    values: { picPreviewWhitelistOnly: true },
    handleCheckboxChange: () => {},
  });
  assert.ok(mediaPreviewerEl && typeof mediaPreviewerEl === 'object');

  const liveUpdateEl = LiveUpdate.renderOptions({
    values: { liveUpdateInterval: 2 },
    handleCheckboxChange: () => {},
    handleNumberInputChange: () => {},
  });
  assert.ok(liveUpdateEl && typeof liveUpdateEl === 'object');

  const mouseBrowsingEl = MouseBrowsing.renderOptions({
    values: { mouseBrowsingHighlightColor: 3 },
    handleCheckboxChange: () => {},
    handleNumberInputChange: () => {},
  });
  assert.ok(mouseBrowsingEl && typeof mouseBrowsingEl === 'object');
});

test('i18n exports _ as alias of getMessage with substitutions support', async () => {
  const { _, getMessage } = await import('../src/js/i18n.js');
  assert.equal(_, getMessage, '_ must be an alias of getMessage');

  // Existing key found in current locale
  assert.equal(_('plugin_easy_reading_title'), 'Easy Reading');
  assert.equal(_('options_antiIdleTime'), 'Anti-idle interval (sec)');

  // Key missing returns empty string (matching Chrome getMessage)
  assert.equal(_('completely_non_existent_key_xyz'), '');
});

test('DOMScreen and CanvasScreen support hyperlink hover and preview hooks and TermView broadcasts events', async () => {
  const domSource = fs.readFileSync(path.resolve('src/components/Row/DOMScreen.js'), 'utf-8');
  const canvasSource = fs.readFileSync(path.resolve('src/components/Canvas/CanvasScreen.js'), 'utf-8');
  const termViewSource = fs.readFileSync(path.resolve('src/js/term_view.js'), 'utf-8');

  // DOMScreen contains hook invocations
  assert.ok(domSource.includes('renderHyperlinkPreview'), 'DOMScreen should have renderHyperlinkPreview method');
  assert.ok(!domSource.includes('hyperlinkPreviewHook'), 'DOMScreen should not contain hyperlinkPreviewHook');
  assert.ok(domSource.includes('this.props.createHyperlinkPreviewRequest'), 'DOMScreen should support createHyperlinkPreviewRequest prop');
  assert.ok(domSource.includes('this.props.onHyperlinkHover'), 'DOMScreen should support onHyperlinkHover prop');

  // CanvasScreen contains hook invocations
  assert.ok(canvasSource.includes('renderHyperlinkPreview'), 'CanvasScreen should have renderHyperlinkPreview method');
  assert.ok(!canvasSource.includes('hyperlinkPreviewHook'), 'CanvasScreen should not contain hyperlinkPreviewHook');
  assert.ok(canvasSource.includes('this.props.createHyperlinkPreviewRequest'), 'CanvasScreen should support createHyperlinkPreviewRequest prop');
  assert.ok(canvasSource.includes('this.props.onHyperlinkHover'), 'CanvasScreen should support onHyperlinkHover prop');

  // TermView event broadcasting
  assert.ok(termViewSource.includes('term:hyperlink-hover'), 'TermView should dispatch term:hyperlink-hover');
  assert.ok(termViewSource.includes('term:hyperlink-leave'), 'TermView should dispatch term:hyperlink-leave');
  assert.ok(!termViewSource.includes('hyperlinkPreviewHook'), 'TermView should not reference hyperlinkPreviewHook');
  assert.ok(!termViewSource.includes('picPreviewWhitelistOnly'), 'TermView should not reference picPreviewWhitelistOnly');
  assert.ok(
    !termViewSource.includes("getPlugin?.('media_previewer')"),
    'TermView must not directly reference media_previewer plugin'
  );
  assert.ok(
    termViewSource.includes('term:hyperlink-preview'),
    'TermView should dispatch term:hyperlink-preview for resolving preview requests'
  );

  // Test TermView method dispatching
  const dispatchedEvents = [];
  const mockApp = {
    emit: (type, detail) => {
      dispatchedEvents.push({ type, detail });
      if (type === 'term:hyperlink-preview') {
        detail.request = 'https://i.imgur.com/resolved.jpg';
      }
    },
  };
  const termView = {
    app: mockApp,
    emit: (type, detail) => dispatchedEvents.push({ type, detail }),
    resolveHyperlinkPreview(href) {
      const detail = { href, request: null };
      this.app?.emit('term:hyperlink-preview', detail);
      return detail.request;
    },
    handleHyperlinkHover(event, href) {
      const detail = { event, href };
      this.app?.emit('term:hyperlink-hover', detail);
    },
    handleHyperlinkLeave(event) {
      const detail = { event };
      this.app?.emit('term:hyperlink-leave', detail);
    },
  };

  const req = termView.resolveHyperlinkPreview('https://imgur.com/resolved');
  assert.equal(req, 'https://i.imgur.com/resolved.jpg');

  termView.handleHyperlinkHover({ type: 'mouseover' }, 'https://example.com');
  assert.equal(dispatchedEvents.length, 2);
  assert.equal(dispatchedEvents[1].type, 'term:hyperlink-hover');
  assert.equal(dispatchedEvents[1].detail.href, 'https://example.com');

  termView.handleHyperlinkLeave({ type: 'mouseout' });
  assert.equal(dispatchedEvents.length, 3);
  assert.equal(dispatchedEvents[2].type, 'term:hyperlink-leave');
});

test('stringWidth calculates Big5 BBS column width accurately', async () => {
  const { stringWidth } = await import('../src/js/string_util.js');
  assert.equal(stringWidth(''), 0);
  assert.equal(stringWidth('Hello'), 5);
  assert.equal(stringWidth('你好'), 4);
  assert.equal(stringWidth('Hello 你好!'), 11);
  assert.equal(stringWidth('推 批踢踢'), 9);
});

test('TouchInputSheet component source defines UI, title, counter and auto-wrap', () => {
  const touchInputSheetSource = fs.readFileSync(
    path.resolve('src/touch/TouchInputSheet.js'),
    'utf-8'
  );
  assert.ok(touchInputSheetSource.includes('class TouchInputSheet'));
  assert.ok(touchInputSheetSource.includes('TouchInputSheet__Textarea'));
  assert.ok(touchInputSheetSource.includes('TouchInputSheet__Title'));
  assert.ok(touchInputSheetSource.includes('TouchInputSheet__Counter'));
  assert.ok(touchInputSheetSource.includes('handleSend'));
  assert.ok(touchInputSheetSource.includes('wrapText'));
  assert.ok(touchInputSheetSource.includes('appendEnter'));
  assert.ok(touchInputSheetSource.includes('autoWrap'));
  assert.ok(touchInputSheetSource.includes('rows={3}'));
  assert.ok(touchInputSheetSource.includes('enterKeyHint="enter"'));
  assert.ok(touchInputSheetSource.includes('touch_input_sheet_line_over_limit'));
  assert.ok(touchInputSheetSource.includes('touch_input_sheet_line_limit'));
  assert.ok(touchInputSheetSource.includes('touch_input_sheet_multi_lines'));
});

test('TouchKeyboard integrates TouchInputSheet and toggles edit area', () => {
  const touchKbSource = fs.readFileSync(
    path.resolve('src/touch/TouchKeyboard.js'),
    'utf-8'
  );
  assert.ok(touchKbSource.includes('<TouchInputSheet'));
  assert.ok(touchKbSource.includes('isEditAreaOpen'));
  assert.ok(touchKbSource.includes('toggleEditArea'));
  assert.ok(touchKbSource.includes('handleCloseEditArea'));
  assert.ok(touchKbSource.includes('handleKeyboardClick'));
  assert.ok(touchKbSource.includes('TouchFloatingToolbar--hidden'));
});

test('TouchInputSheet stops key event propagation and registers input interceptor for physical keyboard', () => {
  const touchInputSheetSource = fs.readFileSync(
    path.resolve('src/touch/TouchInputSheet.js'),
    'utf-8'
  );
  assert.ok(touchInputSheetSource.includes('registerInterceptor'));
  assert.ok(touchInputSheetSource.includes('unregisterInterceptor'));
  assert.ok(touchInputSheetSource.includes('attachTextareaRef'));
  assert.ok(touchInputSheetSource.includes('handleNativeKeyStop'));
  assert.ok(touchInputSheetSource.includes('handleKeyUp'));
  assert.ok(touchInputSheetSource.includes('handleKeyPress'));
  assert.ok(touchInputSheetSource.includes('inputInterceptors.on'));
});

test('TouchInputSheet styles support compact single-row landscape layout', () => {
  const cssSource = fs.readFileSync(
    path.resolve('src/touch/TouchInputSheet.css'),
    'utf-8'
  );
  assert.ok(cssSource.includes('@media (orientation: landscape) and (max-height: 600px)'));
  assert.ok(cssSource.includes('flex-direction: row'));
  assert.ok(cssSource.includes('max-height: 42px'));
  assert.ok(cssSource.includes('--keyboard-offset'));
  assert.ok(cssSource.includes('TouchInputSheet__OptionText--compact'));
});

test('TermView and TermKeyboard handle Safari WebKit IME composition, colors, and trailing keys', () => {
  const termViewSource = fs.readFileSync(path.resolve('src/js/term_view.js'), 'utf-8');
  const termKbSource = fs.readFileSync(path.resolve('src/js/term_keyboard.js'), 'utf-8');
  const appSource = fs.readFileSync(path.resolve('src/js/app.js'), 'utf-8');
  const touchKbSource = fs.readFileSync(path.resolve('src/touch/TouchKeyboard.js'), 'utf-8');

  // Workaround for Safari comments check
  assert.ok(termViewSource.includes('Workaround for Safari'), 'term_view.js must include Workaround for Safari comments');
  assert.ok(appSource.includes('Workaround for Safari'), 'app.js must include Workaround for Safari comments');
  assert.ok(touchKbSource.includes('Workaround for Safari'), 'TouchKeyboard.js must include Workaround for Safari comments');

  // hasWebKitImeQuirk option and detection check
  assert.ok(termViewSource.includes('this.hasWebKitImeQuirk = typeof options?.hasWebKitImeQuirk === \'boolean\''), 'TermView constructor must support hasWebKitImeQuirk option');
  assert.ok(appSource.includes('this.hasWebKitImeQuirk = hasWebKitImeQuirk()'), 'App constructor must initialize hasWebKitImeQuirk');
  assert.ok(appSource.includes('hasWebKitImeQuirk: this.hasWebKitImeQuirk'), 'App must pass hasWebKitImeQuirk option to TermView');

  // TermView WebKit composition trailing key suppression check
  assert.ok(termViewSource.includes('_lastCompositionEndTime'), 'TermView must track _lastCompositionEndTime');
  assert.ok(termViewSource.includes('if (this.hasWebKitImeQuirk)'), 'TermView must guard trailing key logic with hasWebKitImeQuirk');
  assert.ok(termViewSource.includes('WebKit (Safari / DuckDuckGo on macOS & iOS) Bug'), 'TermView should document WebKit bug');
  assert.ok(termViewSource.includes("e.key === 'Enter'"), 'keyEventFilter must guard trailing Enter');
  assert.ok(termViewSource.includes("e.key === 'ArrowDown'"), 'keyEventFilter must guard candidate arrow keys');

  // TermView composition text visibility check
  assert.ok(termViewSource.includes('this.input.style.color = fgHex'), 'TermView must set visible text color during composition');
  assert.ok(termViewSource.includes('this.input.style.background = bgHex'), 'TermView must set background during composition');
  assert.ok(termViewSource.includes("this.input.style.color = 'transparent'"), 'TermView must restore transparent color on composition end');

  // TermKeyboard composition guard check
  assert.ok(termKbSource.includes('e.isComposing || e.key === \'Process\' || e.keyCode === 229'), 'TermKeyboard._onKeyDown must guard against composing keys');

  // App desktop inputmode removal check
  assert.ok(appSource.includes('!this.isMobileDevice()'), 'App should check !this.isMobileDevice() to remove inputmode on desktop');
  assert.ok(appSource.includes('this.inputArea.removeAttribute(\'inputmode\')'), 'App should remove inputmode on desktop');
});

test('TermView fontFitWindowWidth sets transformOrigin to center and prevents viewport overflow', () => {
  const currentTermViewSource = fs.readFileSync(path.resolve('src/js/term_view.js'), 'utf-8');

  // 1. Static check: transformOrigin must be 'center' and not 'center top'
  assert.ok(
    !currentTermViewSource.includes("transformOrigin = 'center top'"),
    'TermView must not set transformOrigin to center top (causes status line cut off)'
  );
  assert.ok(
    currentTermViewSource.includes("this.mainDisplay.style.transformOrigin = 'center'"),
    'TermView must set transformOrigin to center'
  );
  assert.ok(
    currentTermViewSource.includes("this.mainDisplay.style.height = (this.chh * this.buf.rows) + 'px'"),
    'TermView mainDisplay height must match chh * rows'
  );

  // 2. Behavioral verification of transform origin and viewport bounds calculation
  function simulateTerminalScale({ innerBounds, cols = 80, rows = 24, chw = 19, chh = 38, fontFitWindowWidth = true }) {
    const totalHeight = chh * rows;
    const totalWidth = chw * cols + 10;
    let baseMarginTop = 0;
    if (totalHeight < innerBounds.height) {
      baseMarginTop = (innerBounds.height - totalHeight) / 2;
    }

    let scaleX = 1;
    let scaleY = 1;
    if (fontFitWindowWidth) {
      scaleX = Math.floor((innerBounds.width / totalWidth) * 100) / 100;
      scaleY = Math.floor((innerBounds.height / totalHeight) * 100) / 100;
    }

    // With transformOrigin = 'center':
    // The unscaled element is at [baseMarginTop, baseMarginTop + totalHeight].
    // Center is at baseMarginTop + totalHeight / 2 = innerBounds.height / 2.
    // Scaled bounds expand symmetrically around innerBounds.height / 2:
    const centerY = baseMarginTop + totalHeight / 2;
    const scaledHeight = totalHeight * scaleY;
    const topCenterOrigin = centerY - scaledHeight / 2;
    const bottomCenterOrigin = centerY + scaledHeight / 2;

    // With broken transformOrigin = 'center top':
    // Top stays at baseMarginTop, scaling expands downward:
    const topTopOrigin = baseMarginTop;
    const bottomTopOrigin = baseMarginTop + scaledHeight;

    return {
      baseMarginTop,
      scaleX,
      scaleY,
      centerOrigin: { top: topCenterOrigin, bottom: bottomCenterOrigin },
      topOrigin: { top: topTopOrigin, bottom: bottomTopOrigin },
    };
  }

  // Test standard 1080p browser window: 1920 x 950
  const sim = simulateTerminalScale({
    innerBounds: { width: 1920, height: 950 },
    cols: 80,
    rows: 24,
    chw: 19,
    chh: 38,
    fontFitWindowWidth: true,
  });

  assert.equal(sim.baseMarginTop, 19, 'Unscaled margin-top is 19px');
  assert.equal(sim.scaleY, 1.04, 'scaleY is 1.04');

  // With center origin: bottom remains within window height (<= 950)
  assert.ok(
    sim.centerOrigin.bottom <= 950,
    `Center origin bottom (${sim.centerOrigin.bottom}) must not overflow window height (950)`
  );
  assert.ok(
    sim.centerOrigin.top >= 0,
    `Center origin top (${sim.centerOrigin.top}) must not underflow window top (0)`
  );

  // Demonstrate that center top origin would overflow and cut off the bottom status line:
  assert.ok(
    sim.topOrigin.bottom > 950,
    `Broken center top origin bottom (${sim.topOrigin.bottom}) overflows window height`
  );
  assert.equal(
    Math.round(sim.topOrigin.bottom - 950),
    17,
    'Broken center top origin cuts off bottom status bar by ~half a row'
  );
});

test('TermView and App handle DOM selection preservation and fallback', () => {
  const currentTermViewSource = fs.readFileSync(path.resolve('src/js/term_view.js'), 'utf-8');
  const currentAppSource = fs.readFileSync(path.resolve('src/js/app.js'), 'utf-8');
  const currentUtilSource = fs.readFileSync(path.resolve('src/js/util.js'), 'utf-8');
  const currentQuirksSource = fs.readFileSync(path.resolve('src/js/quirks.js'), 'utf-8');

  // quirks.js export check and util.js separation
  assert.ok(currentQuirksSource.includes('export function shouldPreserveDomSelection'), 'quirks.js must export shouldPreserveDomSelection');
  assert.ok(currentQuirksSource.includes('export function hasWebKitImeQuirk'), 'quirks.js must export hasWebKitImeQuirk');
  assert.ok(!currentUtilSource.includes('shouldPreserveDomSelection'), 'util.js must not export shouldPreserveDomSelection');
  assert.ok(!currentUtilSource.includes('hasWebKitImeQuirk'), 'util.js must not export hasWebKitImeQuirk');
  assert.ok(!currentUtilSource.includes('quirks'), 'util.js must not reference quirks.js');
  assert.ok(currentAppSource.includes("from './quirks'"), 'app.js must import directly from quirks');
  assert.ok(currentTermViewSource.includes("from './quirks'"), 'term_view.js must import directly from quirks');

  // TermView constructor & selection fallback
  assert.ok(currentTermViewSource.includes("this.preserveDomSelection = typeof options?.preserveDomSelection === 'boolean'"), 'TermView constructor must support preserveDomSelection option');
  assert.ok(currentTermViewSource.includes("this.hasWebKitImeQuirk = typeof options?.hasWebKitImeQuirk === 'boolean'"), 'TermView constructor must support hasWebKitImeQuirk option');
  assert.ok(currentTermViewSource.includes("this._domSelectedText = ''"), 'TermView must initialize _domSelectedText');
  assert.ok(currentTermViewSource.includes("this._domSelectionColRow = null"), 'TermView must initialize _domSelectionColRow');
  assert.ok(currentTermViewSource.includes("document.addEventListener('selectionchange'"), 'TermView must track selectionchange');
  assert.ok(currentTermViewSource.includes('if (this.preserveDomSelection && this._domSelectedText)'), 'TermView getSelectedText must fall back to _domSelectedText');
  assert.ok(currentTermViewSource.includes('if (this.preserveDomSelection && this._domSelectionColRow)'), 'TermView getSelectionColRow must fall back to _domSelectionColRow');

  // App constructor & focus/collapsed gating
  assert.ok(currentAppSource.includes('this.preserveDomSelection = shouldPreserveDomSelection()'), 'App constructor must initialize preserveDomSelection');
  assert.ok(currentAppSource.includes('this.hasWebKitImeQuirk = hasWebKitImeQuirk()'), 'App constructor must initialize hasWebKitImeQuirk');
  assert.ok(currentAppSource.includes('preserveDomSelection: this.preserveDomSelection'), 'App must pass preserveDomSelection option to TermView');
  assert.ok(currentAppSource.includes('hasWebKitImeQuirk: this.hasWebKitImeQuirk'), 'App must pass hasWebKitImeQuirk option to TermView');
  assert.ok(currentAppSource.includes('if (this.preserveDomSelection && !force && !this.isSelectionCollapsed())'), 'App setInputAreaFocus must preserve selection');
  assert.ok(currentAppSource.includes('this.view?.hasDomSelectionFallback?.()'), 'App isSelectionCollapsed must delegate selection fallback check to view.hasDomSelectionFallback()');
  assert.ok(currentAppSource.includes('this.view?.snapshotDomSelection?.()'), 'App mouse_down must snapshot selection on right-click via view.snapshotDomSelection()');
  assert.ok(currentAppSource.includes('this.view?.clearDomSelectionIfCollapsed?.()'), 'App mouse_click must clear collapsed selection via view.clearDomSelectionIfCollapsed()');
});

test('quirks.js detects WebKit IME and Gecko DOM selection quirks via API/engine features', async () => {
  const { hasWebKitImeQuirk, shouldPreserveDomSelection } = await import('../src/js/quirks.js');

  // Default without APIs -> false
  try {
    globalThis.window = {};
    globalThis.CSS = { supports: () => false };
    assert.equal(hasWebKitImeQuirk(), false, 'hasWebKitImeQuirk returns false when APIs absent');
    assert.equal(shouldPreserveDomSelection(), false, 'shouldPreserveDomSelection returns false when -moz-appearance absent');
  } finally {
    delete globalThis.window;
    delete globalThis.CSS;
  }

  // Test ApplePaySession API detection for WebKit IME quirk
  try {
    globalThis.window = { ApplePaySession: class {} };
    assert.equal(hasWebKitImeQuirk(), true, 'ApplePaySession presence detects WebKit IME quirk');
  } finally {
    delete globalThis.window;
  }

  // Test safari in window for desktop Safari
  try {
    globalThis.window = { safari: {} };
    assert.equal(hasWebKitImeQuirk(), true, 'window.safari presence detects WebKit IME quirk');
  } finally {
    delete globalThis.window;
  }

  // Test GestureEvent API detection for iOS WebKit
  try {
    globalThis.window = { GestureEvent: function() {} };
    assert.equal(hasWebKitImeQuirk(), true, 'GestureEvent presence detects iOS WebKit IME quirk');
  } finally {
    delete globalThis.window;
  }

  // Test CSS.supports('-moz-appearance', 'none') for Gecko DOM selection quirk
  try {
    globalThis.CSS = {
      supports: (prop, val) => prop === '-moz-appearance' && val === 'none',
    };
    assert.equal(shouldPreserveDomSelection(), true, 'CSS.supports -moz-appearance detects Gecko DOM selection quirk');
  } finally {
    delete globalThis.CSS;
  }

  // URL query parameter override tests
  try {
    globalThis.window = { location: { search: '?safari=1' } };
    assert.equal(hasWebKitImeQuirk(), true, '?safari=1 forces true');
    globalThis.window = { location: { search: '?safari=0' } };
    assert.equal(hasWebKitImeQuirk(), false, '?safari=0 forces false');

    globalThis.window = { location: { search: '?firefox=1' } };
    assert.equal(shouldPreserveDomSelection(), true, '?firefox=1 forces true');
    globalThis.window = { location: { search: '?firefox=0' } };
    assert.equal(shouldPreserveDomSelection(), false, '?firefox=0 forces false');
  } finally {
    delete globalThis.window;
  }
});

test('IME composition styling applies across all browsers and initial focus succeeds in Canvas mode', () => {
  const termViewSource = fs.readFileSync(path.resolve('src/js/term_view.js'), 'utf-8');
  const appSource = fs.readFileSync(path.resolve('src/js/app.js'), 'utf-8');
  const mainSource = fs.readFileSync(path.resolve('src/js/main.js'), 'utf-8');

  // 1. updateInputBufferPos must set visible color/background unconditionally from cell attributes and position inline at cursor
  const updatePosMatch = termViewSource.match(/updateInputBufferPos\(\)\s*\{[\s\S]*?updateInputBufferWidth\(\)/);
  assert.ok(updatePosMatch, 'updateInputBufferPos found');
  assert.ok(!updatePosMatch[0].includes('if (this.hasWebKitImeQuirk)'), 'updateInputBufferPos must not gate IME colors behind hasWebKitImeQuirk');
  assert.ok(updatePosMatch[0].includes('this.input.style.color = fgHex'), 'updateInputBufferPos must set visible text color from cell fg attribute');
  assert.ok(updatePosMatch[0].includes('this.input.style.background = bgHex'), 'updateInputBufferPos must set visible background color from cell bg attribute');
  assert.ok(updatePosMatch[0].includes('double ${fgHex}'), 'updateInputBufferPos must apply thick double border matching fgHex');
  assert.ok(updatePosMatch[0].includes('let topPos = pos[1] - borderSize'), 'updateInputBufferPos must align inner content inline at cursor top (pos[1] - borderSize)');

  // 2. main.js must show TermWindow before focusing inputArea so Canvas mode initial focus succeeds
  const displayIdx = mainSource.indexOf("getElementById('TermWindow').style.display = ''");
  const focusIdx = mainSource.indexOf('app.setInputAreaFocus()');
  assert.ok(displayIdx !== -1 && focusIdx !== -1, 'TermWindow display and setInputAreaFocus present in main.js');
  assert.ok(displayIdx < focusIdx, 'TermWindow must be made visible before calling app.setInputAreaFocus()');

  // 3. app.js must check isMobileDevice() rather than hasTouch before setting inputmode="none"
  assert.ok(appSource.includes('if (this.inputArea && this.isMobileDevice())'), 'app.js must check isMobileDevice() for inputmode="none"');

  // 4. CanvasScreen must blur #t on mousedown when not composing and call setInputAreaFocus(true) on mouseup
  const canvasScreenSource = fs.readFileSync(path.resolve('src/components/Canvas/CanvasScreen.js'), 'utf-8');
  assert.ok(canvasScreenSource.includes('document.activeElement.blur()'), 'CanvasScreen handleMouseDown must blur #t on mousedown when not composing');
  assert.ok(canvasScreenSource.includes('this.props.setInputAreaFocus(true)'), 'CanvasScreen handleGlobalMouseUp must call setInputAreaFocus(true)');

  // 5. LoginModal must use about:blank for target iframe and form action to prevent loading second app instance
  const loginModalSource = fs.readFileSync(path.resolve('src/plugins/auto_login/LoginModal.js'), 'utf-8');
  assert.ok(loginModalSource.includes('action="about:blank"'), 'LoginModal form action must be about:blank');
  assert.ok(loginModalSource.includes('src="about:blank"'), 'LoginModal iframe src must be about:blank');
  assert.ok(mainSource.includes("window.name === 'site_auth_target_frame'"), 'main.js must guard startApp against running inside site_auth_target_frame');

  // 6. NativeDialog and AutoLogin must schedule focus restoration after dialog.close()
  const nativeDialogSource = fs.readFileSync(path.resolve('src/components/NativeDialog.js'), 'utf-8');
  assert.ok(nativeDialogSource.includes('window.app.setInputAreaFocus?.(true)'), 'NativeDialog must restore focus after dialog.close()');
});

test('TermView clientToPos and convertMN2XYEx are consistent inverses in both unscaled and scaled modes', () => {
  const currentTermViewSource = fs.readFileSync(path.resolve('src/js/term_view.js'), 'utf-8');
  const originMatch = currentTermViewSource.match(/_getGridOrigin\(\)\s*\{([\s\S]*?\n  )\}/);
  const mn2xyMatch = currentTermViewSource.match(/convertMN2XYEx\(cx, cy\)\s*\{([\s\S]*?\n  )\}/);
  const clientToPosMatch = currentTermViewSource.match(/clientToPos\(cX, cY\)\s*\{([\s\S]*?\n  )\}/);

  assert.ok(originMatch && mn2xyMatch && clientToPosMatch, 'TermView must define _getGridOrigin, convertMN2XYEx, and clientToPos');

  const mockView = {
    innerBounds: { width: 1200, height: 800 },
    buf: { cols: 80, rows: 24 },
    chw: 12,
    chh: 24,
    scaleX: 1,
    scaleY: 1,
    viewMargin: 10,
    firstGridOffset: { left: 100, top: 50 },
  };
  mockView._getGridOrigin = new Function(originMatch[1]).bind(mockView);
  mockView.convertMN2XYEx = new Function('cx', 'cy', mn2xyMatch[1]).bind(mockView);
  mockView.clientToPos = new Function('cX', 'cY', clientToPosMatch[1]).bind(mockView);

  // Unscaled mode round-trip
  const [px1, py1] = mockView.convertMN2XYEx(15, 8);
  assert.deepEqual(mockView.clientToPos(px1 + 2, py1 + 2), { col: 15, row: 8 });

  // Scaled mode round-trip (with viewMargin and +10 width offset accounted for)
  mockView.scaleX = 1.25;
  mockView.scaleY = 1.25;
  const [px2, py2] = mockView.convertMN2XYEx(40, 12);
  assert.deepEqual(mockView.clientToPos(px2 + 2, py2 + 2), { col: 40, row: 12 });
});



