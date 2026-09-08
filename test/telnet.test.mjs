import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IAC, WILL, WONT, DO, DONT, ECHO, TelnetConnection } from '../src/js/telnet.js';
import { initUAO } from '../src/conv/uao.js';

initUAO();

class MockSocket {
  constructor() {
    this.listeners = {};
    this.sent = [];
  }
  addEventListener(type, fn) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(fn);
  }
  emit(type, detail) {
    const fns = this.listeners[type] || [];
    for (const fn of fns) {
      fn({ detail });
    }
  }
  send(data) {
    this.sent.push(data);
  }
}

test('Telnet constants have standard RFC 854 values', () => {
  assert.equal(IAC, 0xff);
  assert.equal(WILL, 0xfb);
  assert.equal(WONT, 0xfc);
  assert.equal(DO, 0xfd);
  assert.equal(DONT, 0xfe);
  assert.equal(ECHO, 0x01);
});

test('TelnetConnection parses stream and dispatches pure data', () => {
  const socket = new MockSocket();
  const conn = new TelnetConnection(socket);
  const received = [];

  conn.addEventListener('data', (e) => {
    assert.ok(e.detail.data instanceof Uint8Array);
    received.push(e.detail.data);
  });

  // Plain data
  socket.emit('data', { data: new TextEncoder().encode('Hello World') });
  assert.equal(new TextDecoder().decode(received[0]), 'Hello World');

  // Telnet negotiation IAC DO ECHO -> should respond IAC WONT ECHO and not leak into data
  socket.emit('data', { data: new Uint8Array([IAC, DO, ECHO, 0x4d, 0x6f, 0x72, 0x65, 0x20, 0x54, 0x65, 0x78, 0x74]) });
  assert.equal(new TextDecoder().decode(received[1]), 'More Text');
  assert.ok(socket.sent.length > 0);
  assert.deepEqual(socket.sent[0], new Uint8Array([IAC, WONT, ECHO]));
});

test('TelnetConnection escapes outgoing IAC in send() and convSend()', () => {
  const socket = new MockSocket();
  const conn = new TelnetConnection(socket);

  // Normal send without IAC
  conn.send('Normal');
  assert.equal(socket.sent[0], 'Normal');

  // send() containing single IAC (\xff) must be doubled to \xff\xff
  conn.send('Prefix\xffSuffix');
  assert.equal(socket.sent[1], 'Prefix\xff\xffSuffix');

  // convSend() with UAO character mapping to byte 0xFF (\uF8F8 -> 0x00 0xFF)
  // or any character whose Big5 code has 0xFF must escape 0xFF to 0xFF 0xFF
  conn.convSend('\uF8F8');
  assert.equal(socket.sent[2], '\x00\xff\xff');

  // send() with Uint8Array containing 0xFF byte
  conn.send(new Uint8Array([0x01, 0xff, 0x02]));
  assert.deepEqual(socket.sent[3], new Uint8Array([0x01, 0xff, 0xff, 0x02]));
});

test('TelnetConnection convSend encodes via UTF-8 when site isUtf8 is true', () => {
  const socket = new MockSocket();
  const site = { isUtf8: true };
  const conn = new TelnetConnection(socket, site);

  assert.equal(conn.isUtf8, true);

  // convSend with UTF-8 string encodes to Uint8Array
  conn.convSend('測試');
  const expectedBytes = new TextEncoder().encode('測試');
  assert.deepEqual(socket.sent[0], expectedBytes);

  conn.convSend('ABC');
  assert.deepEqual(socket.sent[1], new Uint8Array([0x41, 0x42, 0x43]));
});


