import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IAC, WILL, WONT, DO, DONT, ECHO, TelnetConnection } from '../src/js/telnet.js';

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
