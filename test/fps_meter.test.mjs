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
      const el = {
        tagName: tag,
        className: '',
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

    assert.equal(meter.element.textContent, 'FPS: -- (-- ms) [DOM] [smoothANSI: on]');

    meter.setSmoothAnsiArt(false);
    assert.equal(meter.element.textContent, 'FPS: -- (-- ms) [DOM] [smoothANSI: off]');
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
    assert.equal(meter.element.textContent, 'FPS: -- (-- ms) [DOM] [smoothANSI: on]');

    // Click the smoothANSI button
    meter.smoothAnsiBtn.click();
    assert.equal(meter.smoothAnsiArt, false);
    assert.equal(toggledState, false);
    assert.equal(meter.element.textContent, 'FPS: -- (-- ms) [DOM] [smoothANSI: off]');

    // Click again to toggle back to on
    meter.smoothAnsiBtn.click();
    assert.equal(meter.smoothAnsiArt, true);
    assert.equal(toggledState, true);
    assert.equal(meter.element.textContent, 'FPS: -- (-- ms) [DOM] [smoothANSI: on]');
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

    assert.ok(meter.element.textContent.includes('[Canvas] [smoothANSI: on]'));
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
    assert.equal(meter.element.textContent, 'FPS: -- (-- ms) [Canvas] [smoothANSI: on]');

    // Click canvas button to toggle to DOM
    meter.canvasBtn.click();
    assert.equal(meter.isCanvas, false);
    assert.equal(toggledCanvas, false);
    assert.equal(meter.element.textContent, 'FPS: -- (-- ms) [DOM] [smoothANSI: on]');

    // Click again to toggle back to Canvas
    meter.canvasBtn.click();
    assert.equal(meter.isCanvas, true);
    assert.equal(toggledCanvas, true);
    assert.equal(meter.element.textContent, 'FPS: -- (-- ms) [Canvas] [smoothANSI: on]');
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

    assert.equal(meter.element.textContent, 'FPS: -- (-- ms) [DOM] [smoothANSI: on]');

    meter.setIsCanvas(true);
    assert.equal(meter.element.textContent, 'FPS: -- (-- ms) [Canvas] [smoothANSI: on]');

    meter.setIsCanvas(false);
    assert.equal(meter.element.textContent, 'FPS: -- (-- ms) [DOM] [smoothANSI: on]');
  } finally {
    if (meter) meter.setEnabled(false);
    delete global.document;
  }
});

