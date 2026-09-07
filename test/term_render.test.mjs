import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Extract queueUpdate and notify directly from term_buf.js to test their exact implementation
const termBufSource = fs.readFileSync(path.resolve('src/js/term_buf.js'), 'utf-8');

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
