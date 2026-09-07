import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Event } from '../src/js/event.js';
import { setTimer, getQueryVariable, resolveWebSocketUrl, parseConnectUrl } from '../src/js/util.js';
import { uint8ArrayToBinaryString } from '../src/js/websocket.js';
import { bytesToHex, ConnectionLog } from '../src/js/conn_log.js';

test('Event target supports addEventListener, dispatchEvent, and removeEventListener', () => {
  const emitter = new Event();
  const received = [];

  const listener1 = (e) => received.push(`l1:${e.type}:${e.detail || ''}`);
  const listener2 = (e) => received.push(`l2:${e.type}:${e.detail || ''}`);

  emitter.addEventListener('custom', listener1);
  emitter.addEventListener('custom', listener2);

  // Dispatch event
  const evt1 = new CustomEvent('custom', { detail: 'first' });
  emitter.dispatchEvent(evt1);

  assert.deepEqual(received, ['l1:custom:first', 'l2:custom:first']);

  // Remove listener 1
  emitter.removeEventListener('custom', listener1);
  emitter.dispatchEvent(new CustomEvent('custom', { detail: 'second' }));

  assert.deepEqual(received, ['l1:custom:first', 'l2:custom:first', 'l2:custom:second']);

  // Removing already removed listener doesn't throw
  emitter.removeEventListener('custom', listener1);
  emitter.removeEventListener('nonexistent', listener1);
});

test('setTimer handles timeouts and intervals with cancelation', async () => {
  // 1. One-shot timer
  let timeoutFired = false;
  const t1 = setTimer(false, () => { timeoutFired = true; }, 10);
  assert.ok(t1.timer);
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(timeoutFired, true);

  // Cancelled one-shot timer
  let cancelledFired = false;
  const t2 = setTimer(false, () => { cancelledFired = true; }, 30);
  t2.cancel();
  await new Promise((r) => setTimeout(r, 45));
  assert.equal(cancelledFired, false);

  // 2. Interval timer
  let count = 0;
  const t3 = setTimer(true, () => { count++; }, 10);
  await new Promise((r) => setTimeout(r, 35));
  t3.cancel();
  const countAfterCancel = count;
  assert.ok(countAfterCancel >= 2);
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(count, countAfterCancel);
});

test('getQueryVariable extracts URL parameters', () => {
  const originalWindow = globalThis.window;
  try {
    // 1. window is undefined
    delete globalThis.window;
    assert.equal(getQueryVariable('site'), null);

    // 2. window with search string
    globalThis.window = {
      location: {
        search: '?site=wss%3A%2F%2Fws.ptt.cc%2Fbbs&type=ptt&debug=1',
      },
    };
    assert.equal(getQueryVariable('site'), 'wss://ws.ptt.cc/bbs');
    assert.equal(getQueryVariable('type'), 'ptt');
    assert.equal(getQueryVariable('debug'), '1');
    assert.equal(getQueryVariable('nonexistent'), null);

    // 3. empty search
    globalThis.window = { location: { search: '' } };
    assert.equal(getQueryVariable('site'), null);
  } finally {
    globalThis.window = originalWindow;
  }
});

test('uint8ArrayToBinaryString converts binary data across small and large chunk thresholds', () => {
  // Small array
  const small = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
  assert.equal(uint8ArrayToBinaryString(small), 'Hello');

  // Empty array
  assert.equal(uint8ArrayToBinaryString(new Uint8Array(0)), '');

  // Large array exceeding 8192 bytes chunk size
  const largeLen = 20000;
  const large = new Uint8Array(largeLen);
  for (let i = 0; i < largeLen; i++) {
    large[i] = (i % 95) + 32; // printable ASCII range 32..126
  }
  const result = uint8ArrayToBinaryString(large);
  assert.equal(result.length, largeLen);
  assert.equal(result.charCodeAt(0), 32);
  assert.equal(result.charCodeAt(10000), (10000 % 95) + 32);
  assert.equal(result.charCodeAt(largeLen - 1), ((largeLen - 1) % 95) + 32);
});

test('bytesToHex formats byte arrays as uppercase two-digit hex strings', () => {
  assert.equal(bytesToHex([]), '');
  assert.equal(bytesToHex(null), '');
  assert.equal(bytesToHex(new Uint8Array([0])), '00');
  assert.equal(bytesToHex(new Uint8Array([15, 16, 255])), '0F 10 FF');
  assert.equal(bytesToHex([0x1b, 0x5b, 0x30, 0x6d]), '1B 5B 30 6D');
});

test('ConnectionLog manages logging, formatting, and UI state', () => {
  // Mock DOM environment for ConnectionLog
  const elements = {};
  const mockDocument = {
    getElementById: (id) => elements[id] || null,
    createElement: (tag) => {
      const el = {
        tagName: tag.toUpperCase(),
        style: {},
        classList: {
          classes: new Set(),
          add: (c) => el.classList.classes.add(c),
          remove: (c) => el.classList.classes.delete(c),
          contains: (c) => el.classList.classes.has(c),
        },
        childNodes: [],
        appendChild: (child) => {
          el.childNodes.push(child);
          return child;
        },
        removeChild: (child) => {
          const idx = el.childNodes.indexOf(child);
          if (idx !== -1) el.childNodes.splice(idx, 1);
          return child;
        },
        get firstChild() {
          return el.childNodes[0] || null;
        },
        querySelector: (sel) => {
          const id = sel.startsWith('#') ? sel.slice(1) : sel;
          return elements[id] || null;
        },
      };
      return el;
    },
    body: {
      appendChild: (el) => {
        if (el.id) elements[el.id] = el;
      },
    },
  };

  const originalDoc = globalThis.document;
  try {
    globalThis.document = mockDocument;

    const mockApp = {
      onPrefChange: () => {},
    };

    const connLog = new ConnectionLog(mockApp);
    assert.equal(connLog.enabled, false);

    // Toggle collapse
    connLog.toggleCollapse();
    assert.equal(connLog.collapsed, true);
    connLog.toggleCollapse();
    assert.equal(connLog.collapsed, false);
  } finally {
    globalThis.document = originalDoc;
  }
});

test('Websocket chunks outgoing data and pauses on bufferedAmount backpressure', async () => {
  const sentBuffers = [];
  let currentBufferedAmount = 0;

  class MockWsNative {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    constructor(url, protocol) {
      this.url = url;
      this.protocol = protocol;
      this.binaryType = 'arraybuffer';
      this.readyState = MockWsNative.OPEN;
      this.listeners = {};
    }
    get bufferedAmount() {
      return currentBufferedAmount;
    }
    addEventListener(type, fn) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(fn);
    }
    send(buf) {
      sentBuffers.push(new Uint8Array(buf));
    }
    close() {
      this.readyState = 3; // CLOSED
    }
  }

  const originalWs = globalThis.WebSocket;
  try {
    globalThis.WebSocket = MockWsNative;
    const { Websocket, BUFFER_HIGH_WATERMARK } = await import('../src/js/websocket.js');

    const ws = new Websocket('ws://localhost:8080/bbs');
    assert.equal(ws.bufferedAmount, 0);

    // Test sending large string: 1200 bytes should split into 3 chunks (512, 512, 176)
    const largePayload = 'A'.repeat(1200);
    ws.send(largePayload);

    // Wait for the async queue to flush
    await new Promise((r) => setTimeout(r, 60));

    assert.equal(sentBuffers.length, 3);
    assert.equal(sentBuffers[0].length, 512);
    assert.equal(sentBuffers[1].length, 512);
    assert.equal(sentBuffers[2].length, 176);

    // Test backpressure throttle: simulate high bufferedAmount
    sentBuffers.length = 0;
    currentBufferedAmount = BUFFER_HIGH_WATERMARK + 100;

    ws.send('B'.repeat(100));
    // Since bufferedAmount is high, it should not send immediately
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(sentBuffers.length, 0);

    // Drain buffer
    currentBufferedAmount = 0;
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(sentBuffers.length, 1);
    assert.equal(sentBuffers[0].length, 100);

    ws.close();
  } finally {
    globalThis.WebSocket = originalWs;
  }
});

test('parseConnectUrl parses absolute, relative, and legacy protocol URLs', () => {
  assert.equal(parseConnectUrl(''), null);
  assert.equal(parseConnectUrl(null), null);

  const p1 = parseConnectUrl('wss://ws.ptt.cc/bbs');
  assert.deepEqual(p1, {
    url: 'wss://ws.ptt.cc/bbs',
    protocol: 'wss',
    host: 'ws.ptt.cc',
    hostname: 'ws.ptt.cc',
    port: 443,
    path: '/bbs'
  });

  const p2 = parseConnectUrl('wsstelnet://ws.ptt.cc:8443/bbs');
  assert.deepEqual(p2, {
    url: 'wss://ws.ptt.cc:8443/bbs',
    protocol: 'wss',
    host: 'ws.ptt.cc:8443',
    hostname: 'ws.ptt.cc',
    port: 8443,
    path: '/bbs'
  });

  const loc = { protocol: 'https:', host: 'term.ptt.cc' };
  const p3 = parseConnectUrl('/bbs', loc);
  assert.deepEqual(p3, {
    url: 'wss://term.ptt.cc/bbs',
    protocol: 'wss',
    host: 'term.ptt.cc',
    hostname: 'term.ptt.cc',
    port: 443,
    path: '/bbs'
  });
});

test('resolveWebSocketUrl resolves absolute and relative WebSocket URLs', () => {
  // Empty or invalid inputs
  assert.equal(resolveWebSocketUrl(''), '');
  assert.equal(resolveWebSocketUrl(null), '');

  // Absolute URLs are preserved / normalized
  assert.equal(resolveWebSocketUrl('ws://localhost:8080/bbs'), 'ws://localhost:8080/bbs');
  assert.equal(resolveWebSocketUrl('wss://ws.ptt.cc/bbs'), 'wss://ws.ptt.cc/bbs');
  assert.equal(resolveWebSocketUrl('wsstelnet://ws.ptt.cc/bbs'), 'wss://ws.ptt.cc/bbs');

  // Relative URLs with custom location (HTTP -> ws, HTTPS -> wss)
  const locHttp = { protocol: 'http:', host: '192.168.1.100:8080' };
  assert.equal(resolveWebSocketUrl('/bbs', locHttp), 'ws://192.168.1.100:8080/bbs');
  assert.equal(resolveWebSocketUrl('bbs', locHttp), 'ws://192.168.1.100:8080/bbs');

  const locHttps = { protocol: 'https:', host: 'term.ptt.cc' };
  assert.equal(resolveWebSocketUrl('/bbs', locHttps), 'wss://term.ptt.cc/bbs');

  // Node environment fallback when location is null
  assert.equal(resolveWebSocketUrl('/bbs', null), 'ws://localhost/bbs');
});
