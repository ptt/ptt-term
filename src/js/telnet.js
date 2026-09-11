// Handle Telnet Connections and Filters according to RFC 854

import { EventEmitter } from './event.js';
import { Conv, CHARSETS } from './conv.js';

// Telnet commands
export const SE = 0xf0;
export const NOP = 0xf1;
export const DATA_MARK = 0xf2;
export const BREAK = 0xf3;
export const INTERRUPT_PROCESS = 0xf4;
export const ABORT_OUTPUT = 0xf5;
export const ARE_YOU_THERE = 0xf6;
export const ERASE_CHARACTER = 0xf7;
export const ERASE_LINE = 0xf8;
export const GO_AHEAD  = 0xf9;
export const SB = 0xfa;

// Option commands
export const WILL  = 0xfb;
export const WONT  = 0xfc;
export const DO = 0xfd;
export const DONT = 0xfe;
export const IAC = 0xff;

// Telnet options
export const BINARY = 0x00;
export const ECHO  = 0x01;
export const SUPRESS_GO_AHEAD = 0x03;
export const TERM_TYPE = 0x18;
export const IS = 0x00;
export const SEND = 0x01;
export const NAWS = 0x1f;

// state
export const STATE_DATA = 0;
export const STATE_IAC = 1;
export const STATE_WILL = 2;
export const STATE_WONT = 3;
export const STATE_DO = 4;
export const STATE_DONT = 5;
export const STATE_SB = 6;

/**
 * Escapes outgoing IAC (0xFF -> 0xFF 0xFF) per RFC 854.
 * @param {string | Uint8Array | number[]} data
 * @returns {Uint8Array | string}
 */
export function escapeIAC(data) {
  if (!data) return new Uint8Array(0);
  if (typeof data === 'string') {
    return data.indexOf('\xff') < 0 ? data : data.split('\xff').join('\xff\xff');
  }
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (!bytes.includes(IAC)) {
    return bytes;
  }
  let count = 0;
  for (let i = 0; i < bytes.length; ++i) {
    if (bytes[i] === IAC) count++;
  }
  const out = new Uint8Array(bytes.length + count);
  let pos = 0;
  for (let i = 0; i < bytes.length; ++i) {
    out[pos++] = bytes[i];
    if (bytes[i] === IAC) {
      out[pos++] = IAC;
    }
  }
  return out;
}


/**
 * TelnetFilter handles RFC 854 Telnet option negotiations and IAC escaping/unescaping.
 */
export class TelnetFilter extends EventEmitter {
  constructor(options = {}) {
    super();
    this.name = 'telnet';
    this.stream = null;
    this.termType = options.termType || 'VT100';
    this.state = STATE_DATA;
    this.iac_sb = [];
  }

  attachStream(stream) {
    this.stream = stream;
  }

  /**
   * Inbound: process incoming bytes, handle Telnet options, and return clean data bytes.
   * @param {string | Uint8Array} data
   * @param {any} [stream]
   * @returns {Uint8Array}
   */
  inbound(data, stream) {
    const s = stream || this.stream;
    let bytes = data;
    if (typeof bytes === 'string') {
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; ++i) {
        arr[i] = bytes.charCodeAt(i) & 0xff;
      }
      bytes = arr;
    } else if (!(bytes instanceof Uint8Array)) {
      bytes = new Uint8Array(bytes);
    }

    const n = bytes.length;
    if (n === 0) return new Uint8Array(0);

    // Fast path: if already in STATE_DATA and no IAC byte, return as-is
    if (this.state === STATE_DATA && !bytes.includes(IAC)) {
      return bytes;
    }

    const cleanChunks = [];
    let start = -1;

    for (let i = 0; i < n; ++i) {
      const b = bytes[i];

      switch (this.state) {
      case STATE_DATA:
        if (b === IAC) {
          if (start !== -1) {
            cleanChunks.push(bytes.subarray(start, i));
            start = -1;
          }
          this.state = STATE_IAC;
        } else {
          if (start === -1) {
            start = i;
          }
        }
        break;

      case STATE_IAC:
        switch (b) {
        case WILL:
          this.state = STATE_WILL;
          break;
        case WONT:
          this.state = STATE_WONT;
          break;
        case DO:
          this.state = STATE_DO;
          break;
        case DONT:
          this.state = STATE_DONT;
          break;
        case SB:
          this.state = STATE_SB;
          this.iac_sb = [];
          break;
        case NOP: {
          const payload = { cmd: 'NOP', opt: null };
          this.emit('nop');
          this.emit('telopt', payload);
          s?.emit?.('telopt', payload);
          this.state = STATE_DATA;
          break;
        }
        case IAC:
          // Escaped IAC byte in data stream (0xFF 0xFF -> 0xFF)
          cleanChunks.push(new Uint8Array([IAC]));
          this.state = STATE_DATA;
          break;
        default:
          this.state = STATE_DATA;
        }
        break;

      case STATE_WILL: {
        const payload = { cmd: 'WILL', opt: b };
        this.emit('telopt', payload);
        s?.emit?.('telopt', payload);
        switch (b) {
        case BINARY:
        case ECHO:
        case SUPRESS_GO_AHEAD:
          if (s && s.sendRaw) {
            s.sendRaw(new Uint8Array([IAC, DO, b]));
          }
          break;
        default:
          if (s && s.sendRaw) {
            s.sendRaw(new Uint8Array([IAC, DONT, b]));
          }
        }
        this.state = STATE_DATA;
        break;
      }

      case STATE_DO: {
        const payload = { cmd: 'DO', opt: b };
        this.emit('telopt', payload);
        s?.emit?.('telopt', payload);
        switch (b) {
        case BINARY:
        case TERM_TYPE:
          if (s && s.sendRaw) {
            s.sendRaw(new Uint8Array([IAC, WILL, b]));
          }
          break;
        case NAWS:
          this.emit('doNaws');
          s?.emit?.('doNaws');
          break;
        default:
          if (s && s.sendRaw) {
            s.sendRaw(new Uint8Array([IAC, WONT, b]));
          }
        }
        this.state = STATE_DATA;
        break;
      }

      case STATE_DONT: {
        const payload = { cmd: 'DONT', opt: b };
        this.emit('telopt', payload);
        s?.emit?.('telopt', payload);
        this.state = STATE_DATA;
        break;
      }

      case STATE_WONT: {
        const payload = { cmd: 'WONT', opt: b };
        this.emit('telopt', payload);
        s?.emit?.('telopt', payload);
        this.state = STATE_DATA;
        break;
      }

      case STATE_SB: // sub negotiation
        this.iac_sb.push(b);
        if (this.iac_sb.length >= 2 &&
            this.iac_sb[this.iac_sb.length - 2] === IAC &&
            this.iac_sb[this.iac_sb.length - 1] === SE) {
          // end of sub negotiation
          if (this.iac_sb[0] === TERM_TYPE) {
            const typeBytes = [];
            for (let j = 0; j < this.termType.length; ++j) {
              typeBytes.push(this.termType.charCodeAt(j) & 0xff);
            }
            if (s && s.sendRaw) {
              s.sendRaw(new Uint8Array([IAC, SB, TERM_TYPE, IS, ...typeBytes, IAC, SE]));
            }
          }
          this.state = STATE_DATA;
          this.iac_sb = [];
        }
        break;
      }
    }

    if (start !== -1) {
      cleanChunks.push(bytes.subarray(start, n));
    }

    if (cleanChunks.length === 0) {
      return new Uint8Array(0);
    }
    if (cleanChunks.length === 1) {
      return cleanChunks[0];
    }
    const totalLen = cleanChunks.reduce((acc, c) => acc + c.length, 0);
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const c of cleanChunks) {
      result.set(c, offset);
      offset += c.length;
    }
    return result;
  }

  /**
   * Outbound: escape IAC (0xFF -> 0xFF 0xFF).
   * @param {string | Uint8Array} bytes
   * @returns {Uint8Array | string}
   */
  outbound(bytes) {
    return escapeIAC(bytes);
  }

  sendWillNaws(cols, rows, stream) {
    const s = stream || this.stream;
    if (s && s.sendRaw) {
      s.sendRaw(new Uint8Array([IAC, WILL, NAWS]));
    }
  }

  sendNaws(cols, rows, stream) {
    const s = stream || this.stream;
    if (!s || !s.sendRaw) return;
    const w1 = Math.floor(cols / 256);
    const w2 = cols % 256;
    const h1 = Math.floor(rows / 256);
    const h2 = rows % 256;
    const bytes = [IAC, SB, NAWS];
    for (const b of [w1, w2, h1, h2]) {
      bytes.push(b);
      if (b === IAC) bytes.push(IAC);
    }
    bytes.push(IAC, SE);
    s.sendRaw(new Uint8Array(bytes));
  }

  sendNop(stream) {
    const s = stream || this.stream;
    if (s && s.sendRaw) {
      s.sendRaw(new Uint8Array([IAC, NOP]));
    }
  }
}

export class TelnetConnection extends EventEmitter {
  constructor(socket, site = null) {
    super();
    this.socket = socket;
    this.site = site;
    this.filter = new TelnetFilter();

    this.socket.on('open', (e) => this._onOpen(e));
    this.socket.on('data', (e) => this._onDataAvailable(e));
    this.socket.on('close', (e) => this._onClose(e));

    // Forward filter events
    this.filter.on('telopt', (e) => {
      this.emit('telopt', e);
    });
    this.filter.on('doNaws', () => this.emit('doNaws'));
    this.filter.on('nop', () => this.emit('nop'));

    this.termType = 'VT100';
  }

  get isUtf8() {
    return this.site ? this.site.isUtf8 : false;
  }

  get state() {
    return this.filter.state;
  }

  set state(val) {
    this.filter.state = val;
  }

  get iac_sb() {
    return this.filter.iac_sb;
  }

  set iac_sb(val) {
    this.filter.iac_sb = val;
  }

  _onOpen(e) {
    this.emit('open');
  }

  _onClose(e) {
    this.emit('close');
  }

  _onDataAvailable(e) {
    const raw = (e && e.data !== undefined) ? e.data : e;
    const clean = this.filter.inbound(raw, {
      sendRaw: (d) => this._sendRaw(d),
    });
    this._dispatchData(clean);
  }

  _dispatchData(data) {
    if (!data || data.length === 0) return;
    this.emit('data', { data });
  }

  send(str) {
    this._sendEscaped(str);
  }

  _sendEscaped(data) {
    if (!data) return;
    const escaped = escapeIAC(data);
    this._sendRaw(escaped);
  }

  _sendRaw(data) {
    if (data && this.socket) {
      this.socket.send(data);
    }
  }

  convSend(unicode_str) {
    if (!unicode_str) return;
    const conv = new Conv(this.isUtf8 ? CHARSETS.UTF8 : CHARSETS.BIG5);
    const bytes = conv.encode(unicode_str);
    this._sendEscaped(bytes);
  }

  sendWillNaws(cols, rows) {
    this.filter.sendWillNaws(cols, rows, { sendRaw: (d) => this._sendRaw(d) });
  }

  sendNaws(cols, rows) {
    this.filter.sendNaws(cols, rows, { sendRaw: (d) => this._sendRaw(d) });
  }

  sendNop() {
    this.filter.sendNop({ sendRaw: (d) => this._sendRaw(d) });
  }
}
