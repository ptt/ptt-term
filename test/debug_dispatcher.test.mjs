import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from '../src/js/event.js';
import { TouchDebugHUD } from '../src/plugins/touch_debug_hud/index.js';

test('EventEmitter: basic on, emit, off, and subscribe', () => {
  const ee = new EventEmitter();
  const received = [];

  assert.equal(ee._singleType, null);
  assert.equal(ee._events, null);

  const handler = (event) => received.push(event);
  const unsubscribe = ee.subscribe('touch', handler);

  // Single slot verification
  assert.equal(ee._singleType, 'touch');
  assert.equal(ee._singleListener, handler);
  assert.equal(ee._events, null);

  ee.emit('touch', 'event-1');
  assert.deepEqual(received, ['event-1']);

  // Unsubscribe using returned function
  unsubscribe();
  assert.equal(ee._singleType, null);
  assert.equal(ee._singleListener, null);

  ee.emit('touch', 'event-2');
  assert.deepEqual(received, ['event-1'], 'Handler should not be called after unsubscribe');
});

test('EventEmitter: promotion to Map and demotion back to single slot', () => {
  const ee = new EventEmitter();
  const log = [];

  const h1 = (e) => log.push('h1:' + e);
  const h2 = (e) => log.push('h2:' + e);

  ee.on('touch', h1);
  assert.equal(ee._singleType, 'touch');
  assert.equal(ee._events, null);

  // Adding second listener promotes to Map
  ee.on('touch', h2);
  assert.equal(ee._singleType, null);
  assert.ok(ee._events instanceof Map);
  assert.equal(ee.listenerCount('touch'), 2);

  ee.emit('touch', 'test1');
  assert.deepEqual(log, ['h1:test1', 'h2:test1']);

  // Removing one demotes back to single slot
  ee.off('touch', h2);
  assert.equal(ee._singleType, 'touch');
  assert.equal(ee._singleListener, h1);
  assert.equal(ee._events, null);
  assert.equal(ee.listenerCount('touch'), 1);

  ee.emit('touch', 'test2');
  assert.deepEqual(log, ['h1:test1', 'h2:test1', 'h1:test2']);

  // Removing last listener clears completely
  ee.off('touch', h1);
  assert.equal(ee._singleType, null);
  assert.equal(ee._singleListener, null);
  assert.equal(ee._events, null);
  assert.equal(ee.listenerCount('touch'), 0);
});

test('EventEmitter: multiple event types promotion and demotion', () => {
  const ee = new EventEmitter();
  const log = [];

  ee.on('touch', (e) => log.push('touch:' + e));
  ee.on('network', (e) => log.push('net:' + e));

  assert.ok(ee._events instanceof Map, 'Multiple types must promote to Map');
  assert.equal(ee._events.size, 2);

  ee.emit('touch', 'tap');
  ee.emit('network', 'connected');
  assert.deepEqual(log, ['touch:tap', 'net:connected']);

  // Remove network -> only 1 type with 1 listener remains -> demotes to single slot!
  ee.removeAllListeners('network');
  assert.equal(ee._singleType, 'touch');
  assert.equal(ee._events, null);
});

test('EventEmitter: once listener executes only once and cleans up', () => {
  const ee = new EventEmitter();
  const log = [];

  ee.once('init', (val) => log.push(val));
  assert.equal(ee._singleType, 'init');

  ee.emit('init', 100);
  ee.emit('init', 200);

  assert.deepEqual(log, [100]);
  assert.equal(ee._singleType, null);
});

test('EventEmitter: wildcard (*) listener receives all events', () => {
  const ee = new EventEmitter();
  const log = [];

  ee.on('*', (data, type) => log.push({ type, data }));

  ee.emit('touch', 'tap');
  ee.emit('custom', 42);

  assert.deepEqual(log, [
    { type: 'touch', data: 'tap' },
    { type: 'custom', data: 42 },
  ]);
});

test('EventEmitter: error in one listener does not crash emit or stop others', () => {
  const ee = new EventEmitter();
  const log = [];

  ee.on('touch', () => {
    throw new Error('Listener error');
  });
  ee.on('touch', (data) => log.push(data));

  assert.doesNotThrow(() => {
    ee.emit('touch', 'ok');
  });
  assert.deepEqual(log, ['ok']);
});

test('EventEmitter: safe no-ops and invalid arguments', () => {
  const ee = new EventEmitter();
  assert.doesNotThrow(() => {
    ee.emit('non_existent', 123);
    ee.off('non_existent', () => {});
    ee.on('test', null);
    assert.equal(ee.listenerCount('test'), 0);
  });
});

// App integration simulation
function createMockApp() {
  const app = {
    _debugEmitter: null,
    get debugEmitter() {
      if (!this._debugEmitter) {
        this._debugEmitter = new EventEmitter();
      }
      return this._debugEmitter;
    },
    registerDebugHandler(type, handler) {
      return this.debugEmitter.subscribe(type, handler);
    },
    unregisterDebugHandler(type, handler) {
      this._debugEmitter?.off(type, handler);
    },
    sendDebugEvent(type, event) {
      this._debugEmitter?.emit(type, event, type);
    },
    _debugTouchLog(msg) {
      this.sendDebugEvent('touch', msg);
    },
  };
  return app;
}

test('App debug dispatcher delegates to EventEmitter cleanly', () => {
  const app = createMockApp();
  const received = [];

  const unsub = app.registerDebugHandler('touch', (msg) => received.push(msg));
  assert.ok(app._debugEmitter instanceof EventEmitter);

  app.sendDebugEvent('touch', 'touch-1');
  assert.deepEqual(received, ['touch-1']);

  unsub();
  app.sendDebugEvent('touch', 'touch-2');
  assert.deepEqual(received, ['touch-1']);
});

test('App _debugTouchLog sends debug event directly without fallback', () => {
  const app = createMockApp();
  const touchEvents = [];
  app.registerDebugHandler('touch', (e) => touchEvents.push(e));

  app._debugTouchLog('focus blocked');
  assert.deepEqual(touchEvents, ['focus blocked']);
});

test('TouchDebugHUD integrates with App debug event dispatcher', () => {
  const app1 = createMockApp();
  const app2 = createMockApp();

  const logs = [];
  const mockHud = {
    props: { app: app1 },
    state: { enabled: true },
    eventListeners: [],
    addEventLog(text) { logs.push(text); },
    attachListeners: TouchDebugHUD.prototype.attachListeners,
    detachListeners: TouchDebugHUD.prototype.detachListeners,
    componentDidUpdate: TouchDebugHUD.prototype.componentDidUpdate,
  };

  const origWindow = global.window;
  global.window = {
    addEventListener() {},
    removeEventListener() {},
  };

  try {
    mockHud.attachListeners();

    app1._debugTouchLog('blocked on app1');
    assert.deepEqual(logs, ['[APP] blocked on app1']);

    const prevProps = { app: app1 };
    mockHud.props = { app: app2 };
    mockHud.componentDidUpdate(prevProps);

    app1._debugTouchLog('ignored on old app1');
    app2._debugTouchLog('blocked on new app2');
    assert.deepEqual(logs, ['[APP] blocked on app1', '[APP] blocked on new app2']);

    mockHud.detachListeners();
    app2._debugTouchLog('ignored on detached app2');
    assert.deepEqual(logs, ['[APP] blocked on app1', '[APP] blocked on new app2']);
  } finally {
    global.window = origWindow;
  }
});

test('VirtualKeyboard interacts with App via EventEmitter (pref-change and overlay:update)', async () => {
  const { VirtualKeyboardPlugin } = await import('../src/plugins/virtual_keyboard/index.js');
  const mockApp = new EventEmitter();
  let overlayUpdated = false;
  mockApp.on('term:overlay:update', () => {
    overlayUpdated = true;
  });

  const plugin = new VirtualKeyboardPlugin(mockApp);
  plugin.init({ app: mockApp });

  assert.equal(plugin.enabled, false);

  // 1. Enabling emits term:overlay:update
  plugin.setEnabled(true);
  assert.equal(plugin.enabled, true);
  assert.equal(overlayUpdated, true);

  // 2. Pref change event via emit triggers plugin
  mockApp.emit('term:pref-change', { key: 'enableVirtualKeyboard', value: false });
  assert.equal(plugin.enabled, false);

  // 3. Destroy unregisters listener
  plugin.destroy();
  mockApp.emit('term:pref-change', { key: 'enableVirtualKeyboard', value: true });
  assert.equal(plugin.enabled, false, 'Plugin should not react to events after destroy');
});

test('TouchKeyboard and ContextMenu communicate via ui:floating-menu-toggle EventEmitter', async () => {
  const mockApp = new EventEmitter();
  let toggledWith = null;

  // Simulate ContextMenu mounting and listening
  const unsub = mockApp.subscribe('ui:floating-menu-toggle', ({ event, targetEl }) => {
    toggledWith = { event, targetEl };
  });

  assert.equal(mockApp.listenerCount('ui:floating-menu-toggle'), 1);

  // Simulate TouchKeyboard handleFloatingMenuToggle
  const dummyEvent = { type: 'pointerdown' };
  const dummyTarget = { id: 'btn' };
  mockApp.emit('ui:floating-menu-toggle', { event: dummyEvent, targetEl: dummyTarget });

  assert.deepEqual(toggledWith, { event: dummyEvent, targetEl: dummyTarget });

  // Unsubscribe
  unsub();
  assert.equal(mockApp.listenerCount('ui:floating-menu-toggle'), 0);
});

test('TermKeyboard emits term:key event directly to EventEmitter subscribers', async () => {
  const { TermKeyboard } = await import('../src/js/term_keyboard.js');
  const kb = new TermKeyboard(() => {});
  const received = [];

  kb.on('term:key', (detail) => {
    received.push(detail);
  });

  kb._fireKeyEvent('ArrowUp', '\x1b[A', null);
  assert.equal(received.length, 1);
  assert.equal(received[0].key, 'ArrowUp');
  assert.equal(received[0].mapped, '\x1b[A');
  assert.equal(received[0].term, kb);
});

