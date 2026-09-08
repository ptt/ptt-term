import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FpsMeter } from '../src/js/fps_meter.js';

function setupMockDom() {
  const element = {
    id: 'fpsOverlay',
    style: {},
    children: [],
    innerHTML: '',
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    get textContent() {
      return this.children.map(c => c.textContent || '').join('');
    },
    set textContent(val) {
      this.children = [{ textContent: val }];
    }
  };

  const documentMock = {
    getElementById(id) {
      if (id === 'fpsOverlay') return element;
      return null;
    },
    createElement(tag) {
      const classList = {
        classes: new Set(),
        add(c) { this.classes.add(c); el.className = Array.from(this.classes).join(' '); },
        remove(c) { this.classes.delete(c); el.className = Array.from(this.classes).join(' '); },
        contains(c) { return this.classes.has(c); }
      };
      const el = {
        tagName: tag,
        className: '',
        classList,
        style: {},
        textContent: '',
        listeners: {},
        addEventListener(type, fn) {
          if (!this.listeners[type]) this.listeners[type] = [];
          this.listeners[type].push(fn);
        },
        dispatchEvent(evt) {
          const fns = this.listeners[evt.type] || [];
          fns.forEach(fn => fn(evt));
        },
        click() {
          this.dispatchEvent({
            type: 'click',
            stopPropagation() {},
            preventDefault() {}
          });
        }
      };
      return el;
    },
    createTextNode(text) {
      return { textContent: text };
    },
    body: {
      appendChild() {}
    }
  };

  return { documentMock, element };
}

test('FpsMeter initializes with options and formats display string', () => {
  const { documentMock } = setupMockDom();
  global.document = documentMock;
  let meter;

  try {
    meter = new FpsMeter({ smoothAnsiArt: true });
    meter.setEnabled(true);
    meter.updateDisplay(1000, true);

    assert.equal(meter.element.textContent, 'FPS: -- (-- ms) [DOM][SmoothANSI][TouchDbg]');

    meter.setSmoothAnsiArt(false);
    assert.equal(meter.element.textContent, 'FPS: -- (-- ms) [DOM][OriginalANSI][TouchDbg]');
  } finally {
    if (meter) meter.setEnabled(false);
    delete global.document;
  }
});

test('FpsMeter toggles smoothAnsiArt on click and triggers callback', () => {
  const { documentMock } = setupMockDom();
  global.document = documentMock;
  let meter;

  try {
    let toggledState = null;
    meter = new FpsMeter({
      smoothAnsiArt: true,
      onToggleSmoothAnsi: (val) => {
        toggledState = val;
      }
    });
    meter.setEnabled(true);

    assert.equal(meter.smoothAnsiArt, true);
    assert.equal(meter.element.textContent, 'FPS: -- (-- ms) [DOM][SmoothANSI][TouchDbg]');

    // Click the smoothANSI button
    meter.smoothAnsiBtn.click();
    assert.equal(meter.smoothAnsiArt, false);
    assert.equal(toggledState, false);
    assert.equal(meter.element.textContent, 'FPS: -- (-- ms) [DOM][OriginalANSI][TouchDbg]');

    // Click again to toggle back to on
    meter.smoothAnsiBtn.click();
    assert.equal(meter.smoothAnsiArt, true);
    assert.equal(toggledState, true);
    assert.equal(meter.element.textContent, 'FPS: -- (-- ms) [DOM][SmoothANSI][TouchDbg]');
  } finally {
    if (meter) meter.setEnabled(false);
    delete global.document;
  }
});

test('FpsMeter recordFrame reflects Canvas engine in display text', () => {
  const { documentMock } = setupMockDom();
  global.document = documentMock;
  let meter;

  try {
    meter = new FpsMeter({ smoothAnsiArt: true });
    meter.setEnabled(true);

    meter.recordFrame(1.5, true); // Canvas = true
    meter.updateDisplay(performance.now(), false);

    assert.ok(meter.element.textContent.includes('[Canvas][SmoothANSI][TouchDbg]'));
  } finally {
    if (meter) meter.setEnabled(false);
    delete global.document;
  }
});

test('FpsMeter toggles canvas on click and triggers callback', () => {
  const { documentMock } = setupMockDom();
  global.document = documentMock;
  let meter;

  try {
    let toggledCanvas = null;
    meter = new FpsMeter({
      isCanvas: true,
      smoothAnsiArt: true,
      onToggleCanvas: (val) => {
        toggledCanvas = val;
      }
    });
    meter.setEnabled(true);

    assert.equal(meter.isCanvas, true);
    assert.equal(meter.element.textContent, 'FPS: -- (-- ms) [Canvas][SmoothANSI][TouchDbg]');

    // Click canvas button to toggle to DOM
    meter.canvasBtn.click();
    assert.equal(meter.isCanvas, false);
    assert.equal(toggledCanvas, false);
    assert.equal(meter.element.textContent, 'FPS: -- (-- ms) [DOM][SmoothANSI][TouchDbg]');

    // Click again to toggle back to Canvas
    meter.canvasBtn.click();
    assert.equal(meter.isCanvas, true);
    assert.equal(toggledCanvas, true);
    assert.equal(meter.element.textContent, 'FPS: -- (-- ms) [Canvas][SmoothANSI][TouchDbg]');
  } finally {
    if (meter) meter.setEnabled(false);
    delete global.document;
  }
});

test('FpsMeter setIsCanvas updates display string directly', () => {
  const { documentMock } = setupMockDom();
  global.document = documentMock;
  let meter;

  try {
    meter = new FpsMeter({ isCanvas: false, smoothAnsiArt: true });
    meter.setEnabled(true);
    meter.updateDisplay(1000, true);

    assert.equal(meter.element.textContent, 'FPS: -- (-- ms) [DOM][SmoothANSI][TouchDbg]');

    meter.setIsCanvas(true);
    assert.equal(meter.element.textContent, 'FPS: -- (-- ms) [Canvas][SmoothANSI][TouchDbg]');

    meter.setIsCanvas(false);
    assert.equal(meter.element.textContent, 'FPS: -- (-- ms) [DOM][SmoothANSI][TouchDbg]');
  } finally {
    if (meter) meter.setEnabled(false);
    delete global.document;
  }
});

test('FpsMeter toggles touch debug on click and triggers callback', () => {
  const { documentMock } = setupMockDom();
  global.document = documentMock;
  let meter;

  try {
    let toggledTouchDebug = false;
    meter = new FpsMeter({
      onToggleTouchDebug: () => {
        toggledTouchDebug = !toggledTouchDebug;
      }
    });
    meter.setEnabled(true);

    assert.equal(toggledTouchDebug, false);
    assert.equal(meter.element.textContent, 'FPS: -- (-- ms) [DOM][SmoothANSI][TouchDbg]');

    meter.touchDbgBtn.click();
    assert.equal(toggledTouchDebug, true);
  } finally {
    if (meter) meter.setEnabled(false);
    delete global.document;
  }
});

test('FpsMeter toggles touch debug via window.toggleTouchDebugHUD and reflects active class', () => {
  const { documentMock } = setupMockDom();
  global.document = documentMock;
  let isHudActive = false;
  let toggleCalled = 0;
  const windowMock = {
    listeners: {},
    addEventListener(type, fn) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(fn);
    },
    removeEventListener(type, fn) {
      if (this.listeners[type]) {
        this.listeners[type] = this.listeners[type].filter(f => f !== fn);
      }
    },
    dispatchEvent(evt) {
      const fns = this.listeners[evt.type] || [];
      fns.forEach(fn => fn(evt));
    },
    isTouchDebugHUDActive: () => isHudActive,
    toggleTouchDebugHUD: () => {
      toggleCalled++;
      isHudActive = !isHudActive;
    }
  };
  global.window = windowMock;
  let meter;

  try {
    meter = new FpsMeter({});
    meter.setEnabled(true);

    assert.equal(meter.touchDbgBtn.classList.contains('active'), false);

    meter.touchDbgBtn.click();
    assert.equal(toggleCalled, 1);
    assert.equal(isHudActive, true);
    assert.equal(meter.touchDbgBtn.classList.contains('active'), true);

    // Simulate touch debug changed event
    isHudActive = false;
    windowMock.dispatchEvent({ type: 'term:touch-debug-changed' });
    assert.equal(meter.touchDbgBtn.classList.contains('active'), false);
  } finally {
    if (meter) meter.setEnabled(false);
    delete global.document;
    delete global.window;
  }
});

test('FpsMeter dispatches term:toggle-touch-debug when window.toggleTouchDebugHUD is not available', () => {
  const { documentMock } = setupMockDom();
  global.document = documentMock;
  let dispatchedEvent = null;
  const windowMock = {
    listeners: {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent(evt) {
      dispatchedEvent = evt.type;
    }
  };
  global.window = windowMock;
  let meter;

  try {
    meter = new FpsMeter({});
    meter.setEnabled(true);

    meter.touchDbgBtn.click();
    assert.equal(dispatchedEvent, 'term:toggle-touch-debug');
  } finally {
    if (meter) meter.setEnabled(false);
    delete global.document;
    delete global.window;
  }
});

