import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { h, Component, render } from 'preact';

// Extract queueUpdate and notify directly from term_buf.js to test their exact implementation
const termBufSource = fs.readFileSync(path.resolve('src/js/term_buf.js'), 'utf-8');
const termViewSource = fs.readFileSync(path.resolve('src/js/term_view.js'), 'utf-8');

function createHarness() {
  const harness = {
    animFrameId: null,
    timerUpdate: null,
    changed: false,
    posChanged: false,
    events: [],
    viewUpdates: 0,
    cursorUpdates: 0,
    useMouseBrowsing: false,
    updateCharAttr() {},
    setPageState() {},
    clearHighlight() {},
    dispatchEvent(evt) {
      this.events.push(evt.type);
    },
    view: {
      blinkOn: false,
      update() {
        harness.viewUpdates++;
      },
      updateCursorPos() {
        harness.cursorUpdates++;
      },
      onBlinkToggle() {},
    },
  };

  const queueUpdateBody = termBufSource.match(
    /queueUpdate\(directupdate\)\s*\{([\s\S]*?\n  )\}/
  )[1];
  const notifyBody = termBufSource.match(
    /notify\(timer\)\s*\{([\s\S]*?\n  )\}/
  )[1];

  harness.queueUpdate = new Function('directupdate', queueUpdateBody).bind(harness);
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
    buf: { highlightCursor: true },
    componentScreen: undefined,
  };
  assert.doesNotThrow(() => fn.call(ctxUndefined, 5));

  // 2. componentScreen is null
  const ctxNull = {
    buf: { highlightCursor: true },
    componentScreen: null,
  };
  assert.doesNotThrow(() => fn.call(ctxNull, 5));

  // 3. componentScreen is dummy initial object
  let calledWith = null;
  const ctxValid = {
    buf: { highlightCursor: true },
    componentScreen: {
      setCurrentHighlighted(row) {
        calledWith = row;
      },
    },
  };
  fn.call(ctxValid, 12);
  assert.equal(calledWith, 12);

  // 4. highlightCursor is false
  calledWith = null;
  const ctxDisabled = {
    buf: { highlightCursor: false },
    componentScreen: {
      setCurrentHighlighted(row) {
        calledWith = row;
      },
    },
  };
  fn.call(ctxDisabled, 12);
  assert.equal(calledWith, null);
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

  function renderScreen(lines, forceWidth, enableLinkInlinePreview, enableLinkHoverPreview, cont, options = {}, ref) {
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
        ...restOptions,
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
    insertBefore() {},
  });

  const origDocument = globalThis.document;
  try {
    const container = createMockEl('div');
    globalThis.document = {
      createElement: (tag) => createMockEl(tag),
      createElementNS: (ns, tag) => createMockEl(tag),
      createTextNode: (text) => ({ nodeType: 3, text }),
    };

    let refCallbackInstance = null;
    const inst = renderScreen([], 16, false, false, container, {
      ref: (i) => {
        refCallbackInstance = i;
      },
      cols: 80,
      rows: 24,
    });

    assert.ok(inst, 'renderScreen should return the component instance');
    assert.equal(inst, refCallbackInstance, 'ref callback should receive the same instance');
    assert.equal(typeof inst.setCurrentHighlighted, 'function');

    inst.setCurrentHighlighted(15);
    assert.equal(inst.highlighted, 15);

    // Re-render should also preserve and return the instance
    const reInst = renderScreen(['updated line'], 16, false, false, container, {});
    assert.equal(reInst, inst, 're-render returns the existing component instance');
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
      has: (cls) => mockClassList.has(cls),
    },
    style: {},
    textContent: '_',
  };

  const mockView = {
    bbsCursor: mockCursor,
    chw: 12,
    chh: 24,
    scaleX: 1,
    scaleY: 1,
    buf: {
      cur_x: 5,
      cur_y: 10,
      rows: 24,
      cols: 80,
      lines: Array.from({ length: 24 }, () => Array.from({ length: 80 }, () => ({ getBg: () => 0 }))),
    },
    convertMN2XYEx: (cx, cy) => [cx * 12, cy * 24],
    updateInputBufferPos() {},
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

  const termInvColors = ['#ffffff', '#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#000000'];
  mockView.setCursorStyle = new Function('style', setCursorStyleBody).bind(mockView);
  mockView.applyCursorStyle = new Function("termInvColors", `return function applyCursorStyle() { ${applyCursorStyleBody} }`)(termInvColors).bind(mockView);
  mockView.updateCursorPos = new Function('termInvColors', `return function updateCursorPos() { ${updateCursorPosBody} }`)(termInvColors).bind(mockView);

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
});

test('TermBuf puts handles bell (\\x07), setting bellOccurred and dispatching bell event', () => {
  const putsMatch = termBufSource.match(
    /puts\s*\([^)]*\)\s*\{([\s\S]*?\n    this\.queueUpdate\(\);)\n  \}/
  );
  assert.ok(putsMatch);
  const putsBody = putsMatch[1];
  let bellDispatched = 0;
  let bellSoundPlayed = 0;
  const playTerminalBell = () => { bellSoundPlayed++; };
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
    isFullWidth() { return false; },
    queueUpdate() {},
    dispatchEvent(evt) {
      if (evt.type === 'bell') bellDispatched++;
    },
  };
  mockTerm.puts = new Function('playTerminalBell', 'return function(str, attr = null) { ' + putsBody + ' }')(playTerminalBell).bind(mockTerm);

  assert.equal(mockTerm.bellOccurred, false);
  mockTerm.puts('hello\x07world');
  assert.equal(mockTerm.bellOccurred, true);
  assert.equal(bellDispatched, 1);
  assert.equal(bellSoundPlayed, 1);
});

test('TermView _send, _convSend and conn getter delegate to bbscore.conn', () => {
  const connMatch = termViewSource.match(/get conn\(\)\s*\{([\s\S]*?\n  )\}/);
  const sendMatch = termViewSource.match(/_send\(data\)\s*\{([\s\S]*?\n  )\}/);
  const convSendMatch = termViewSource.match(/_convSend\(data\)\s*\{([\s\S]*?\n  )\}/);

  assert.ok(connMatch, 'TermView must define conn getter');
  assert.ok(sendMatch, 'TermView must define _send method');
  assert.ok(convSendMatch, 'TermView must define _convSend method');

  const sent = [];
  const convSent = [];
  const mockConn = {
    send(data) {
      sent.push(data);
    },
    convSend(data) {
      convSent.push(data);
    },
  };
  const mockView = {
    bbscore: { conn: mockConn },
  };
  Object.defineProperty(mockView, 'conn', {
    get: new Function(connMatch[1]),
  });
  mockView._send = new Function('data', sendMatch[1]).bind(mockView);
  mockView._convSend = new Function('data', convSendMatch[1]).bind(mockView);

  assert.equal(mockView.conn, mockConn);
  mockView._send('\x1b[D');
  assert.deepEqual(sent, ['\x1b[D']);
  mockView._convSend('test');
  assert.deepEqual(convSent, ['test']);
});

