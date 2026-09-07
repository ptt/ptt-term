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
  assert.equal(IAC, '\xff');
  assert.equal(WILL, '\xfb');
  assert.equal(WONT, '\xfc');
  assert.equal(DO, '\xfd');
  assert.equal(DONT, '\xfe');
  assert.equal(ECHO, '\x01');
});

test('TelnetConnection parses stream and dispatches pure data', () => {
  const socket = new MockSocket();
  const conn = new TelnetConnection(socket);
  const received = [];

  conn.addEventListener('data', (e) => {
    received.push(e.detail.data);
  });

  // Plain data
  socket.emit('data', { data: 'Hello World' });
  assert.equal(received.join(''), 'Hello World');

  // Telnet negotiation IAC DO ECHO -> should respond IAC WONT ECHO and not leak into data
  socket.emit('data', { data: `${IAC}${DO}${ECHO}More Text` });
  assert.equal(received.join(''), 'Hello WorldMore Text');
  assert.ok(socket.sent.length > 0);
  assert.equal(socket.sent[0], `${IAC}${WONT}${ECHO}`);
});

test('TelnetConnection escapes outgoing IAC in send() and convSend()', () => {
  const socket = new MockSocket();
  const conn = new TelnetConnection(socket);

  // Normal send without IAC
  conn.send('Normal');
  assert.equal(socket.sent[0], 'Normal');

  // send() containing single IAC (\xff) must be doubled to \xff\xff
  conn.send(`Prefix${IAC}Suffix`);
  assert.equal(socket.sent[1], `Prefix${IAC}${IAC}Suffix`);

  // convSend() with UAO character mapping to byte 0xFF (\uF8F8 -> 0x00 0xFF)
  // or any character whose Big5 code has 0xFF must escape 0xFF to 0xFF 0xFF
  conn.convSend('\uF8F8');
  assert.equal(socket.sent[2], `\x00${IAC}${IAC}`);

  // send() with Uint8Array containing 0xFF byte
  conn.send(new Uint8Array([0x01, 0xff, 0x02]));
  assert.deepEqual(socket.sent[3], new Uint8Array([0x01, 0xff, 0xff, 0x02]));
});

