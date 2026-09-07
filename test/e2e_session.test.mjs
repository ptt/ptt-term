import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import {
  TelnetConnection,
  IAC,
  WILL,
  ECHO,
  SUPRESS_GO_AHEAD,
} from '../src/js/telnet.js';
import { AnsiParser } from '../src/js/ansi_parser.js';
import { uint8ArrayToBinaryString } from '../src/js/websocket.js';
import { Event } from '../src/js/event.js';

class MockTermBuf {
  constructor() {
    this.output = [];
    this.attrs = [];
  }
  puts(str) {
    this.output.push(str);
  }
  assignParamsToAttrs(params) {
    this.attrs.push(params);
  }
  gotoPos() {}
  clear() {}
  insert() {}
  tab() {}
}

test('E2E Session: Mock BBS WebSocket server negotiates Telnet and feeds ANSI terminal', async () => {
  let clientRawSocket = null;
  const serverReceivedChunks = [];
  let server = null;
  let ws = null;

  try {
    server = http.createServer();
    server.on('upgrade', (req, socket) => {
      clientRawSocket = socket;
      const key = req.headers['sec-websocket-key'];
      const accept = crypto
        .createHash('sha1')
        .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');

      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          'Sec-WebSocket-Accept: ' +
          accept +
          '\r\n' +
          'Sec-WebSocket-Protocol: telnet\r\n\r\n'
      );

      socket.on('data', (buf) => {
        let cursor = 0;
        while (cursor + 2 <= buf.length) {
          const isMasked = (buf[cursor + 1] & 0x80) !== 0;
          let payloadLen = buf[cursor + 1] & 0x7f;
          let headerLen = 2;
          if (payloadLen === 126) {
            if (cursor + 4 > buf.length) break;
            payloadLen = buf.readUInt16BE(cursor + 2);
            headerLen = 4;
          }
          let mask = null;
          if (isMasked) {
            if (cursor + headerLen + 4 > buf.length) break;
            mask = buf.subarray(cursor + headerLen, cursor + headerLen + 4);
            headerLen += 4;
          }
          const payload = Buffer.from(buf.subarray(cursor + headerLen, cursor + headerLen + payloadLen));
          if (mask) {
            for (let i = 0; i < payload.length; i++) {
              payload[i] ^= mask[i % 4];
            }
          }
          serverReceivedChunks.push(payload);
          cursor += headerLen + payloadLen;
        }
      });

      const telnetOpts = [
        IAC.charCodeAt(0),
        WILL.charCodeAt(0),
        ECHO.charCodeAt(0),
        IAC.charCodeAt(0),
        WILL.charCodeAt(0),
        SUPRESS_GO_AHEAD.charCodeAt(0),
      ];

      // ANSI BBS Login Banner
      const ansiBanner = Buffer.from('\x1b[1;33;44mHello BBS\x1b[0m\r\n');
      const combined = Buffer.concat([Buffer.from(telnetOpts), ansiBanner]);

      const frame = Buffer.concat([Buffer.from([0x82, combined.length]), combined]);
      socket.write(frame);
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    ws = new WebSocket(`ws://127.0.0.1:${port}`, 'telnet');
    ws.binaryType = 'arraybuffer';

    class ClientSocketAdapter extends Event {
      send(str) {
        const bytes = Buffer.from(str, 'binary');
        ws.send(bytes);
      }
    }
    const socketAdapter = new ClientSocketAdapter();

    const term = new MockTermBuf();
    const parser = new AnsiParser(term);
    const telnetConn = new TelnetConnection(socketAdapter);

    telnetConn.addEventListener('data', (e) => {
      parser.feed(e.detail.data);
    });

    await new Promise((resolve) => {
      ws.onmessage = (e) => {
        const data = new Uint8Array(e.data);
        socketAdapter.dispatchEvent(new CustomEvent('data', {
          detail: { data: uint8ArrayToBinaryString(data) }
        }));

        socketAdapter.send('guest\r');
        setTimeout(resolve, 60);
      };
    });

    // Flush any pending text in parser
    parser.feed('\x1b[0m');

    // Verify ANSI parsing and terminal output
    const allOutput = term.output.join('');
    assert.ok(allOutput.includes('Hello BBS'), `Expected 'Hello BBS' in output, got: '${allOutput}'`);
    assert.ok(term.attrs.some((attr) => attr.includes(33) && attr.includes(44)));

    // Verify server received client input
    const allServerReceived = Buffer.concat(serverReceivedChunks).toString();
    assert.ok(allServerReceived.includes('guest') || allServerReceived.includes('\r'));
  } finally {
    if (ws) {
      try { ws.close(); } catch (e) {}
    }
    if (clientRawSocket) {
      try { clientRawSocket.destroy(); } catch (e) {}
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
});
