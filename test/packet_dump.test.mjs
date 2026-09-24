import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bytesToHex,
  parsePacket,
  PacketDump,
} from '../src/plugins/packet_dump/index.js';
import {
  IAC,
  WILL,
  WONT,
  DO,
  DONT,
  SB,
  SE,
  NOP,
  ECHO,
  NAWS,
  TERM_TYPE,
  IS,
  SEND,
} from '../src/js/telnet.js';

function strToBytes(str) {
  return new TextEncoder().encode(str);
}

test('parsePacket: decodes ANSI SGR colors and attributes with Color: FG=..., BG=... format', () => {
  // ESC[1;33;44m -> Bright Yellow FG (3), Blue BG (4)
  const tokens1 = parsePacket(strToBytes('\x1b[1;33;44m'));
  assert.equal(tokens1.length, 1);
  assert.equal(tokens1[0].type, 'sgr');
  assert.equal(tokens1[0].hex, '1B 5B 31 3B 33 33 3B 34 34 6D');
  assert.match(tokens1[0].tooltip, /^Color: FG=3 \(Yellow\), BG=4 \(Blue\).*Bright/);

  // ESC[m -> Reset FG=7 (White), BG=0 (Black)
  const tokens2 = parsePacket(strToBytes('\x1b[m'));
  assert.equal(tokens2.length, 1);
  assert.equal(tokens2[0].type, 'sgr');
  assert.match(tokens2[0].tooltip, /^Color: FG=7 \(White\), BG=0 \(Black\).*Reset/);
});

test('parsePacket: groups contiguous printable UTF-8 multi-byte runs and single chars with UTF8:<str>', () => {
  // Single UTF-8 char '中' -> E4 B8 AD
  const singleTokens = parsePacket(strToBytes('中'), { isUtf8: true });
  assert.equal(singleTokens.length, 1);
  assert.equal(singleTokens[0].type, 'utf8');
  assert.equal(singleTokens[0].hex, 'E4 B8 AD');
  assert.equal(singleTokens[0].tooltip, 'UTF8:中');

  // Contiguous run "中文測試" -> merged into a single utf8 block
  const runBytes = strToBytes('中文測試');
  const runTokens = parsePacket(runBytes, { isUtf8: true });
  assert.equal(runTokens.length, 1);
  assert.equal(runTokens[0].type, 'utf8');
  assert.equal(runTokens[0].hex, bytesToHex(runBytes));
  assert.equal(runTokens[0].tooltip, 'UTF8:中文測試');
});

test('parsePacket: groups contiguous printable Big5 runs and printable ASCII runs', () => {
  // Big5 for "中文": A4 A4 (中) + A4 E5 (文)
  const big5Bytes = new Uint8Array([0xa4, 0xa4, 0xa4, 0xe5]);
  const big5Tokens = parsePacket(big5Bytes, { isUtf8: false });
  assert.equal(big5Tokens.length, 1);
  assert.equal(big5Tokens[0].type, 'utf8');
  assert.equal(big5Tokens[0].hex, 'A4 A4 A4 E5');
  assert.equal(big5Tokens[0].tooltip, 'Big5:中文');

  // Mixed stream: "看板" (UTF-8) + "Gossiping" (printable ASCII) + "\r\n" (ctrl)
  const mixed = strToBytes('看板Gossiping\r\n');
  const mixedTokens = parsePacket(mixed, { isUtf8: true });
  assert.equal(mixedTokens.length, 4);
  assert.equal(mixedTokens[0].type, 'utf8');
  assert.equal(mixedTokens[0].tooltip, 'UTF8:看板');
  assert.equal(mixedTokens[1].type, 'ascii');
  assert.equal(mixedTokens[1].tooltip, 'ASCII: "Gossiping"');
  assert.equal(mixedTokens[2].type, 'ctrl');
  assert.match(mixedTokens[2].tooltip, /CR/);
  assert.equal(mixedTokens[3].type, 'ctrl');
  assert.match(mixedTokens[3].tooltip, /LF/);
  assert.equal(mixedTokens.map((t) => t.hex).join(' '), bytesToHex(mixed));
});

test('parsePacket: decodes DEC 2026 Synchronized Update sequences', () => {
  const bytes = strToBytes('\x1b[?2026h\x1b[?2026l');
  const tokens = parsePacket(bytes);
  assert.equal(tokens.length, 2);

  assert.equal(tokens[0].type, 'dec2026');
  assert.match(tokens[0].tooltip, /DEC 2026: Begin Synchronized Update/);

  assert.equal(tokens[1].type, 'dec2026');
  assert.match(tokens[1].tooltip, /DEC 2026: End Synchronized Update/);
});

test('parsePacket: decodes XTerm Locator SGR mouse reports and DEC mouse tracking modes', () => {
  // Left Press at Col=10, Row=5 -> ESC[<0;10;5M
  // Left Release at Col=10, Row=5 -> ESC[<0;10;5m
  // Wheel Up at Col=40, Row=12 -> ESC[<64;40;12M
  const bytes = strToBytes('\x1b[<0;10;5M\x1b[<0;10;5m\x1b[<64;40;12M');
  const tokens = parsePacket(bytes);
  assert.equal(tokens.length, 3);

  assert.equal(tokens[0].type, 'locator');
  assert.match(tokens[0].tooltip, /XTerm Locator SGR: Left Press \(Col=10, Row=5\)/);

  assert.equal(tokens[1].type, 'locator');
  assert.match(tokens[1].tooltip, /XTerm Locator SGR: Left Release \(Col=10, Row=5\)/);

  assert.equal(tokens[2].type, 'locator');
  assert.match(tokens[2].tooltip, /XTerm Locator SGR: Wheel Up \(Col=40, Row=12\)/);

  // Mouse tracking DECSET / DECRST: ESC[?1000;1006h
  const modeTokens = parsePacket(strToBytes('\x1b[?1000;1006h'));
  assert.equal(modeTokens.length, 1);
  assert.equal(modeTokens[0].type, 'locator');
  assert.match(modeTokens[0].tooltip, /XTerm Locator: Enable.*1000.*1006/);
});

test('parsePacket: decodes Telnet IAC commands, negotiations, and subnegotiations', () => {
  const raw = new Uint8Array([
    IAC, WILL, ECHO,
    IAC, DO, NAWS,
    IAC, NOP,
    IAC, SB, NAWS, 0x00, 80, 0x00, 24, IAC, SE,
    IAC, SB, TERM_TYPE, SEND, IAC, SE,
    IAC, SB, TERM_TYPE, IS, 0x56, 0x54, 0x31, 0x30, 0x30, IAC, SE,
    IAC, IAC,
  ]);
  const tokens = parsePacket(raw);
  assert.equal(tokens.length, 7);

  assert.equal(tokens[0].type, 'iac');
  assert.match(tokens[0].tooltip, /IAC: WILL ECHO/);

  assert.equal(tokens[1].type, 'iac');
  assert.match(tokens[1].tooltip, /IAC: DO NAWS/);

  assert.equal(tokens[2].type, 'iac');
  assert.match(tokens[2].tooltip, /IAC: NOP/);

  assert.equal(tokens[3].type, 'iac');
  assert.match(tokens[3].tooltip, /IAC: SB NAWS 80x24/);

  assert.equal(tokens[4].type, 'iac');
  assert.match(tokens[4].tooltip, /IAC: SB TERM_TYPE SEND/);

  assert.equal(tokens[5].type, 'iac');
  assert.match(tokens[5].tooltip, /IAC: SB TERM_TYPE IS "VT100"/);

  assert.equal(tokens[6].type, 'iac');
  assert.match(tokens[6].tooltip, /IAC: Escaped 0xFF/);
});

test('parsePacket: decodes ANSI CSI cursor, OSC title, and C1 escape sequences', () => {
  const bytes = strToBytes('\x1b[12;34H\x1b[2J\x1b]2;PTT BBS\x07\x1b7');
  const tokens = parsePacket(bytes);
  assert.equal(tokens.length, 4);

  assert.equal(tokens[0].type, 'ansi');
  assert.match(tokens[0].tooltip, /Cursor Position \(Row=12, Col=34\)/);

  assert.equal(tokens[1].type, 'ansi');
  assert.match(tokens[1].tooltip, /Erase in Display \(Entire Screen\)/);

  assert.equal(tokens[2].type, 'ansi');
  assert.match(tokens[2].tooltip, /Set Window Title "PTT BBS"/);

  assert.equal(tokens[3].type, 'ansi');
  assert.match(tokens[3].tooltip, /Save Cursor/);
});

test('PacketDump._positionTooltip aligns rail tooltip with clientY across tall rails', () => {
  const pd = new PacketDump({});
  pd.tooltipEl = {
    style: {},
    getBoundingClientRect: () => ({ width: 100, height: 24 }),
  };

  const tallRailEl = {
    classList: { contains: (cls) => cls === 'packet-dump-rail' },
    getBoundingClientRect: () => ({
      top: 100,
      bottom: 1100,
      height: 1000,
      left: 0,
      right: 10,
      width: 10,
    }),
  };

  // Hover near the top of the tall rail (clientY = 130)
  pd._positionTooltip(tallRailEl, { clientY: 130 });
  assert.equal(pd.tooltipEl.style.left, '16px');
  assert.equal(pd.tooltipEl.style.top, `${130 - 12}px`);

  // Move towards middle of the tall rail (clientY = 350)
  pd._positionTooltip(tallRailEl, { clientY: 350 });
  assert.equal(pd.tooltipEl.style.left, '16px');
  assert.equal(pd.tooltipEl.style.top, `${350 - 12}px`);

  // Near the bottom, tooltip is clamped so it does not exceed the viewport
  pd._positionTooltip(tallRailEl, { clientY: 600 });
  assert.equal(pd.tooltipEl.style.left, '16px');
  assert.equal(pd.tooltipEl.style.top, '570px');
});

test('PacketDump._positionTooltip centers tooltip above token for regular tokens', () => {
  const pd = new PacketDump({});
  pd.tooltipEl = {
    style: {},
    getBoundingClientRect: () => ({ width: 80, height: 20 }),
  };

  const tokenEl = {
    classList: { contains: (cls) => cls === 'packet-dump-token' },
    getBoundingClientRect: () => ({
      top: 200,
      bottom: 220,
      height: 20,
      left: 50,
      right: 90,
      width: 40,
    }),
  };

  pd._positionTooltip(tokenEl, {});
  // Centered horizontally above token: left = 50 + 20 - 40 = 30; top = 200 - 20 - 6 = 174
  assert.equal(pd.tooltipEl.style.left, '30px');
  assert.equal(pd.tooltipEl.style.top, '174px');
});
