// Handle Telnet Connections according to RFC 854

import { Event } from './event.js';
import { u2b, ansiHalfColorConv } from './string_util.js';

// Telnet commands
export const SE = '\xf0';
export const NOP = '\xf1';
export const DATA_MARK = '\xf2';
export const BREAK = '\xf3';
export const INTERRUPT_PROCESS = '\xf4';
export const ABORT_OUTPUT = '\xf5';
export const ARE_YOU_THERE = '\xf6';
export const ERASE_CHARACTER = '\xf7';
export const ERASE_LINE = '\xf8';
export const GO_AHEAD  = '\xf9';
export const SB = '\xfa';

// Option commands
export const WILL  = '\xfb';
export const WONT  = '\xfc';
export const DO = '\xfd';
export const DONT = '\xfe';
export const IAC = '\xff';

// Telnet options
export const BINARY = '\x00';
export const ECHO  = '\x01';
export const SUPRESS_GO_AHEAD = '\x03';
export const TERM_TYPE = '\x18';
export const IS = '\x00';
export const SEND = '\x01';
export const NAWS = '\x1f';

// state
const STATE_DATA=0;
const STATE_IAC=1;
const STATE_WILL=2;
const STATE_WONT=3;
const STATE_DO=4;
const STATE_DONT=5;
const STATE_SB=6;

export class TelnetConnection extends Event {
  constructor(socket) {
    super();
    this.socket = socket;
    this.socket.addEventListener('open', (e) => this._onOpen(e));
    this.socket.addEventListener('data', (e) => this._onDataAvailable(e));
    this.socket.addEventListener('close', (e) => this._onClose(e));

    this.state = STATE_DATA;
    this.iac_sb = '';

    this.termType = 'VT100';
  }

  _onOpen(e) {
    this.dispatchEvent(new CustomEvent('open'));
  }

  _onClose(e) {
    this.dispatchEvent(new CustomEvent('close'));
  }

  _onDataAvailable(e) {
    const str = e.detail.data;
    let data = '';
    let count = str.length;
    while (count > 0) {
      const s = str;
      count -= s.length;
      const n = s.length;
      for (let i = 0; i < n; ++i) {
        const ch = s[i];
      switch (this.state) {
      case STATE_DATA:
        if( ch == IAC ) {
          if (data) {
            this._dispatchData(data);
            data='';
          }
          this.state = STATE_IAC;
        } else {
          data += ch;
        }
        break;
      case STATE_IAC:
        switch (ch) {
        case WILL:
          this.state=STATE_WILL;
          break;
        case WONT:
          this.state=STATE_WONT;
          break;
        case DO:
          this.state=STATE_DO;
          break;
        case DONT:
          this.state=STATE_DONT;
          break;
        case SB:
          this.state=STATE_SB;
          break;
        case NOP:
          this.dispatchEvent(new CustomEvent('nop'));
          this.dispatchEvent(new CustomEvent('telopt', { detail: { cmd: 'NOP', opt: null } }));
          this.state = STATE_DATA;
          break;
        case IAC:
          // RFC 854: Escaped IAC byte in data stream
          data += IAC;
          this.state = STATE_DATA;
          break;
        default:
          this.state=STATE_DATA;
        }
        break;
      case STATE_WILL:
        this.dispatchEvent(new CustomEvent('telopt', { detail: { cmd: 'WILL', opt: ch } }));
        switch (ch) {
        case BINARY:
        case ECHO:
        case SUPRESS_GO_AHEAD:
          this._sendRaw( IAC + DO + ch );
          break;
        default:
          this._sendRaw( IAC + DONT + ch );
        }
        this.state = STATE_DATA;
        break;
      case STATE_DO:
        this.dispatchEvent(new CustomEvent('telopt', { detail: { cmd: 'DO', opt: ch } }));
        switch (ch) {
        case BINARY:
        case TERM_TYPE:
          this._sendRaw( IAC + WILL + ch );
          break;
        case NAWS:
          this.dispatchEvent(new CustomEvent('doNaws'));
          break;
        default:
          this._sendRaw( IAC + WONT + ch );
        }
        this.state = STATE_DATA;
        break;
      case STATE_DONT:
        this.dispatchEvent(new CustomEvent('telopt', { detail: { cmd: 'DONT', opt: ch } }));
        this.state = STATE_DATA;
        break;
      case STATE_WONT:
        this.dispatchEvent(new CustomEvent('telopt', { detail: { cmd: 'WONT', opt: ch } }));
        this.state = STATE_DATA;
        break;
      case STATE_SB: // sub negotiation
        this.iac_sb += ch;
        if ( this.iac_sb.slice(-2) == IAC + SE ) {
          // end of sub negotiation
          switch (this.iac_sb[0]) {
          case TERM_TYPE: 
            // FIXME: support other terminal types
            const rep = IAC + SB + TERM_TYPE + IS + this.termType + IAC + SE;
            this._sendRaw( rep );
            break;
          }
          this.state = STATE_DATA;
          this.iac_sb = '';
          break;
        }
      }
    }
    if (data) {
      this._dispatchData(data);
      data='';
    }
  }
  }

  _dispatchData(data) {
    this.dispatchEvent(new CustomEvent('data', {
      detail: {
        data: data
      }
    }));
  }

  send(str) {
    // XXX Should do escape on IAC.
    this._sendRaw(str);
  }

  _sendRaw(data) {
    if (data) {
      this.socket.send(data);
    }
  }

  convSend(unicode_str) {
    // supports UAO
    // when converting unicode to big5, use UAO.

    let s = u2b(unicode_str);
    // detect ;50m (half color) and then convert accordingly
    if (s) {
      s = ansiHalfColorConv(s);
      this._sendRaw(s);
    }
  }

  sendWillNaws(cols, rows) {
    this._sendRaw(IAC + WILL + NAWS);
  }

  sendNaws(cols, rows) {
    const nawsStr = String.fromCharCode(Math.floor(cols/256), cols%256, Math.floor(rows/256), rows%256).replace(/(\xff)/g,'\xff\xff');
    const rep = IAC + SB + NAWS + nawsStr + IAC + SE;
    this._sendRaw( rep );
  }

  sendNop() {
    this._sendRaw(IAC + NOP);
  }
}
