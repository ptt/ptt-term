// Handle Telnet Connections according to RFC 854

import { Event } from './event.js';
import { u2b, ansiHalfColorConv } from './string_util.js';

// Telnet commands (RFC 854)
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
const STATE_DATA=0;
const STATE_IAC=1;
const STATE_WILL=2;
const STATE_WONT=3;
const STATE_DO=4;
const STATE_DONT=5;
const STATE_SB=6;

export class TelnetConnection extends Event {
  constructor(socket, site = null) {
    super();
    this.socket = socket;
    this.site = site;
    this.socket.addEventListener('open', (e) => this._onOpen(e));
    this.socket.addEventListener('data', (e) => this._onDataAvailable(e));
    this.socket.addEventListener('close', (e) => this._onClose(e));

    this.state = STATE_DATA;
    this.iac_sb = [];

    this.termType = 'VT100';
  }

  get isUtf8() {
    return this.site ? this.site.isUtf8 : false;
  }

  _onOpen(e) {
    this.dispatchEvent(new CustomEvent('open'));
  }

  _onClose(e) {
    this.dispatchEvent(new CustomEvent('close'));
  }

  _onDataAvailable(e) {
    let bytes = e.detail.data;
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
    if (n === 0) return;

    // Fast path: if already in STATE_DATA and no IAC (0xFF) byte in packet,
    // dispatch the entire Uint8Array zero-copy.
    if (this.state === STATE_DATA && !bytes.includes(IAC)) {
      this._dispatchData(bytes);
      return;
    }

    let start = -1;

    for (let i = 0; i < n; ++i) {
      const b = bytes[i];

      switch (this.state) {
      case STATE_DATA:
        if (b === IAC) {
          if (start !== -1) {
            this._dispatchData(bytes.subarray(start, i));
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
        case NOP:
          this.dispatchEvent(new CustomEvent('nop'));
          this.dispatchEvent(new CustomEvent('telopt', { detail: { cmd: 'NOP', opt: null } }));
          this.state = STATE_DATA;
          break;
        case IAC:
          // Escaped IAC in data stream (0xFF 0xFF -> 0xFF)
          this._dispatchData(new Uint8Array([IAC]));
          this.state = STATE_DATA;
          break;
        default:
          this.state = STATE_DATA;
        }
        break;

      case STATE_WILL:
        this.dispatchEvent(new CustomEvent('telopt', { detail: { cmd: 'WILL', opt: b } }));
        switch (b) {
        case BINARY:
        case ECHO:
        case SUPRESS_GO_AHEAD:
          this._sendRaw(new Uint8Array([IAC, DO, b]));
          break;
        default:
          this._sendRaw(new Uint8Array([IAC, DONT, b]));
        }
        this.state = STATE_DATA;
        break;

      case STATE_DO:
        this.dispatchEvent(new CustomEvent('telopt', { detail: { cmd: 'DO', opt: b } }));
        switch (b) {
        case BINARY:
        case TERM_TYPE:
          this._sendRaw(new Uint8Array([IAC, WILL, b]));
          break;
        case NAWS:
          this.dispatchEvent(new CustomEvent('doNaws'));
          break;
        default:
          this._sendRaw(new Uint8Array([IAC, WONT, b]));
        }
        this.state = STATE_DATA;
        break;

      case STATE_DONT:
        this.dispatchEvent(new CustomEvent('telopt', { detail: { cmd: 'DONT', opt: b } }));
        this.state = STATE_DATA;
        break;

      case STATE_WONT:
        this.dispatchEvent(new CustomEvent('telopt', { detail: { cmd: 'WONT', opt: b } }));
        this.state = STATE_DATA;
        break;

      case STATE_SB:
        this.iac_sb.push(b);
        const sbLen = this.iac_sb.length;
        if (sbLen >= 2 && this.iac_sb[sbLen - 2] === IAC && this.iac_sb[sbLen - 1] === SE) {
          if (this.iac_sb[0] === TERM_TYPE) {
            const typeBytes = [];
            for (let j = 0; j < this.termType.length; ++j) {
              typeBytes.push(this.termType.charCodeAt(j) & 0xff);
            }
            this._sendRaw(new Uint8Array([IAC, SB, TERM_TYPE, IS, ...typeBytes, IAC, SE]));
          }
          this.state = STATE_DATA;
          this.iac_sb = [];
        }
        break;
      }
    }

    if (start !== -1) {
      this._dispatchData(bytes.subarray(start, n));
    }
  }

  _dispatchData(data) {
    if (!data || data.length === 0) return;
    this.dispatchEvent(new CustomEvent('data', {
      detail: {
        data: data
      }
    }));
  }

  send(str) {
    this._sendEscaped(str);
  }

  _sendEscaped(data) {
    if (!data) return;
    if (typeof data === 'string') {
      this._sendRaw(data.indexOf('\xff') < 0 ? data : data.split('\xff').join('\xff\xff'));
    } else if (data instanceof Uint8Array) {
      if (!data.includes(IAC)) {
        this._sendRaw(data);
      } else {
        let count = 0;
        for (let i = 0; i < data.length; ++i) {
          if (data[i] === IAC) count++;
        }
        const out = new Uint8Array(data.length + count);
        let pos = 0;
        for (let i = 0; i < data.length; ++i) {
          out[pos++] = data[i];
          if (data[i] === IAC) {
            out[pos++] = IAC;
          }
        }
        this._sendRaw(out);
      }
    } else {
      this._sendRaw(data);
    }
  }

  _sendRaw(data) {
    if (data) {
      this.socket.send(data);
    }
  }

  convSend(unicode_str) {
    if (!unicode_str) return;
    if (this.isUtf8) {
      const bytes = new TextEncoder().encode(unicode_str);
      this._sendEscaped(bytes);
      return;
    }

    // supports UAO
    // when converting unicode to big5, use UAO.
    let s = u2b(unicode_str);
    // detect ;50m (half color) and then convert accordingly
    if (s) {
      s = ansiHalfColorConv(s);
      this._sendEscaped(s);
    }
  }

  sendWillNaws(cols, rows) {
    this._sendRaw(new Uint8Array([IAC, WILL, NAWS]));
  }

  sendNaws(cols, rows) {
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
    this._sendRaw(new Uint8Array(bytes));
  }

  sendNop() {
    this._sendRaw(new Uint8Array([IAC, NOP]));
  }
}
