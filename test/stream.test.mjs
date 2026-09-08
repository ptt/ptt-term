import fs from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Stream } from '../src/js/stream.js';
import { Conv, CHARSETS } from '../src/js/conv.js';
import { TelnetFilter, IAC, WILL, DO, ECHO, NAWS } from '../src/js/telnet.js';
import { AnsiFilter } from '../src/js/ansi_parser.js';
import { initUAO } from '../src/conv/uao.js';

initUAO();

class MockConnection {
  constructor() {
    this.listeners = {};
    this.sent = [];
  }
  addEventListener(type, fn) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(fn);
  }
  emit(type, data) {
    const fns = this.listeners[type] || [];
    for (const fn of fns) {
      fn({ detail: { data } });
    }
  }
  send(data) {
    this.sent.push(data);
  }
}

class MockTermBuf {
  constructor() {
    this.output = [];
    this.cells = [];
    this.cur_x = 0;
    this.cur_y = 0;
    this.attr = {
      fg: 7, bg: 0,
      cloneAttr() { return Object.assign({}, this); },
      assignParams(p) { if (p[0] === 31) this.fg = 1; }
    };
  }
  puts(s) {
    this.output.push(s);
  }
  putDBCS(ch, leadAttr, trailAttr) {
    this.output.push(ch);
    this.cells.push({ ch, leadAttr, trailAttr });
  }
  gotoPos(x, y) {
    this.cur_x = x;
    this.cur_y = y;
  }
  assignParamsToAttrs(params) {
    if (this.attr && this.attr.assignParams) {
      this.attr.assignParams(params);
    }
  }
  clear() {}
  insert() {}
  eraseLine() {}
  insertLine() {}
  deleteLine() {}
  del() {}
  tab() {}
  backTab() {}
  eraseChar() {}
  scroll() {}
  setTitle() {}
  lineFeed() {}
  carriageReturn() {}
}

test('Conv encodes and decodes Big5 and UTF-8 strings', () => {
  const convBig5 = new Conv(CHARSETS.BIG5);
  assert.equal(convBig5.isUtf8, false);
  assert.equal(convBig5.charset, CHARSETS.BIG5);

  const encodedBig5 = convBig5.encode('批踢');
  assert.equal(typeof encodedBig5, 'string');
  assert.equal(convBig5.decode(encodedBig5), '批踢');

  const convUtf8 = new Conv(CHARSETS.UTF8);
  assert.equal(convUtf8.isUtf8, true);
  assert.equal(convUtf8.charset, CHARSETS.UTF8);

  const encodedUtf8 = convUtf8.encode('批踢');
  assert.ok(encodedUtf8 instanceof Uint8Array);
  assert.equal(convUtf8.decode(encodedUtf8), '批踢');
});

test('Stream on top of conn manages charset and filter pipeline', () => {
  const conn = new MockConnection();
  const stream = new Stream(conn, { charset: CHARSETS.BIG5 });
  const term = new MockTermBuf();

  const telnetFilter = new TelnetFilter();
  const ansiFilter = new AnsiFilter(term);

  stream.registerFilter(telnetFilter);
  stream.registerFilter(ansiFilter);

  assert.equal(stream.charset, CHARSETS.BIG5);
  assert.equal(stream.isUtf8, false);

  // Inbound: conn receives raw data with Telnet IAC DO ECHO followed by Big5 bytes for '批' (0xA7, 0xE5)
  conn.emit('data', new Uint8Array([IAC, DO, ECHO, 0xa7, 0xe5]));

  // Telnet filter should have intercepted negotiation and responded via conn
  assert.ok(conn.sent.length > 0);
  assert.deepEqual(conn.sent[0], new Uint8Array([IAC, 0xfc, ECHO])); // IAC WONT ECHO

  // ANSI filter and Conv should have decoded '批' into term.puts
  assert.equal(term.output.join(''), '批');
});

test('Stream.send encodes via conv and escapes IAC per Telnet filter', () => {
  const conn = new MockConnection();
  const stream = new Stream(conn, { charset: CHARSETS.BIG5 });
  const telnetFilter = new TelnetFilter();
  stream.registerFilter(telnetFilter);

  // In Big5 mode: string containing UAO char \uF8F8 produces byte 0xFF, which TelnetFilter escapes to 0xFF 0xFF
  stream.send('\uF8F8');
  assert.equal(conn.sent[0], '\x00\xff\xff');

  // Switch charset to UTF-8
  stream.charset = CHARSETS.UTF8;
  assert.equal(stream.isUtf8, true);

  stream.send('測試');
  const expectedUtf8 = new TextEncoder().encode('測試');
  assert.deepEqual(conn.sent[1], expectedUtf8);
});

test('Stream sendNaws and sendWillNaws sends NAWS telnet packets', () => {
  const conn = new MockConnection();
  const stream = new Stream(conn);
  const telnetFilter = new TelnetFilter();
  stream.registerFilter(telnetFilter);

  stream.sendWillNaws(80, 24);
  assert.deepEqual(conn.sent[0], new Uint8Array([IAC, WILL, NAWS]));

  stream.sendNaws(80, 24);
  // w1=0, w2=80, h1=0, h2=24
  assert.deepEqual(conn.sent[1], new Uint8Array([IAC, 0xfa, NAWS, 0, 80, 0, 24, IAC, 0xf0]));
});

test('Stream correctly decodes PTT1 welcome screen across chunk boundaries without ;31m leaks', () => {
  const ptt1Raw = fs.readFileSync(new URL('ptt1.txt', import.meta.url));

  for (const chunkSize of [1, 7, 23, 64, 256, 512, ptt1Raw.length]) {
    const conn = new MockConnection();
    const stream = new Stream(conn, { charset: CHARSETS.BIG5 });
    const term = new MockTermBuf();
    const telnetFilter = new TelnetFilter();
    const ansiFilter = new AnsiFilter(term, { stream });

    stream.registerFilter(telnetFilter);
    stream.registerFilter(ansiFilter);

    for (let i = 0; i < ptt1Raw.length; i += chunkSize) {
      const chunk = ptt1Raw.subarray(i, Math.min(ptt1Raw.length, i + chunkSize));
      conn.emit('data', chunk);
    }

    const output = term.output.join('');
    assert.equal(output.includes(';31m'), false, `chunkSize ${chunkSize} leaked ;31m to terminal`);
    assert.ok(output.includes('批踢踢實業坊'), `chunkSize ${chunkSize} missing site title`);
  }
});

test('Stream skips internal TelnetFilter when conn has its own filter', () => {
  const conn = new MockConnection();
  conn.filter = new TelnetFilter(); // Simulates a connection that already handles Telnet

  const stream = new Stream(conn, { charset: CHARSETS.BIG5 });
  const term = new MockTermBuf();
  const telnetFilter = new TelnetFilter();
  const ansiFilter = new AnsiFilter(term, { stream });

  stream.registerFilter(telnetFilter);
  stream.registerFilter(ansiFilter);

  // If conn already handles telnet, an incoming 0xFF byte followed by \x1b[31m should not be dropped
  conn.emit('data', new Uint8Array([0xff, 0x1b, 0x5b, 0x33, 0x31, 0x6d, 0x61]));
  // 'a' should be rendered without dropping ESC or leaking 31m
  assert.equal(term.output.join('').includes('31m'), false);

  // On send: should not double-escape
  stream.send('\uF8F8');
  assert.equal(conn.sent[0], '\x00\xff');
});

