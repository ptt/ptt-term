// Parser for ANSI escape sequence

import { b2u } from './string_util.js';
import { b2uTable } from '../conv/uao.js';

export class AnsiParser {
  static STATE_TEXT = 0;
  static STATE_ESC = 1;
  static STATE_CSI = 2;
  static STATE_C1 = 3;
  static STATE_OSC = 4;

  /**
   * @param {import('./term_buf').TermBuf} [termbuf]
   */
  constructor(termbuf, options = {}) {
    /** @type {import('./term_buf').TermBuf | null} */
    this.termbuf = termbuf || null;
    this.name = 'ansi';
    this.stream = options.stream || null;
    /** @type {number} */
    this.state = AnsiParser.STATE_TEXT;
    /** @type {string} */
    this.esc = '';
    /** @type {number | null} */
    this.pendingLead = null;
    /** @type {any | null} */
    this.pendingLeadAttr = null;
    /** @type {number[]} */
    this.utf8Bytes = [];
    /** @type {TextDecoder | null} */
    this.utf8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;
  }

  attachStream(stream) {
    this.stream = stream;
  }

  /**
   * Inbound processor for Stream pipeline.
   * @param {string | Uint8Array} data
   * @param {any} [stream]
   */
  inbound(data, stream) {
    this.stream = stream || this.stream;
    this.feed(data);
    return null;
  }

  flushPendingLead() {
    if (this.utf8Bytes.length > 0) {
      const bytes = new Uint8Array(this.utf8Bytes);
      this.utf8Bytes = [];
      if (this.utf8Decoder && this.termbuf) {
        this.termbuf.puts(this.utf8Decoder.decode(bytes));
      }
    }
    if (this.pendingLead === null) return;
    const lead = this.pendingLead;
    const leadAttr = this.pendingLeadAttr;
    this.pendingLead = null;
    this.pendingLeadAttr = null;
    this.termbuf.puts(String.fromCharCode(lead), leadAttr);
  }

  /**
   * Feed string or Uint8Array data into the ANSI parser.
   * @param {string | Uint8Array} data
   */
  feed(data) {
    const term = this.termbuf;
    if (!term || !data || data.length === 0)
      return;
    let s = '';
    const isArray = data instanceof Uint8Array;
    const n = data.length;
    const isUtf8 = this.stream ? this.stream.isUtf8 : (term.site ? term.site.isUtf8 : false);

    for (let i = 0; i < n; ++i) {
      const b = isArray ? data[i] : data.charCodeAt(i);
      let ch = isArray ? String.fromCharCode(b) : data[i];

      switch (this.state) {
      case AnsiParser.STATE_TEXT:
        if (b === 0x1b) {
          if (this.utf8Bytes.length > 0) {
            const bytes = new Uint8Array(this.utf8Bytes);
            this.utf8Bytes = [];
            if (this.utf8Decoder) {
              s += this.utf8Decoder.decode(bytes);
            }
          }
          if (s) {
            term.puts(s);
            s = '';
          }
          this.state = AnsiParser.STATE_ESC;
          break;
        }

        if (isUtf8) {
          if (isArray && b >= 0x80) {
            this.utf8Bytes.push(b);
            const first = this.utf8Bytes[0];
            let expectedLen = 1;
            if ((first & 0xe0) === 0xc0) expectedLen = 2;
            else if ((first & 0xf0) === 0xe0) expectedLen = 3;
            else if ((first & 0xf8) === 0xf0) expectedLen = 4;
            else expectedLen = 1;

            if (this.utf8Bytes.length >= expectedLen) {
              const decoded = this.utf8Decoder ? this.utf8Decoder.decode(new Uint8Array(this.utf8Bytes)) : '';
              this.utf8Bytes = [];
              s += decoded;
            }
          } else {
            if (this.utf8Bytes.length > 0) {
              const bytes = new Uint8Array(this.utf8Bytes);
              this.utf8Bytes = [];
              if (this.utf8Decoder) {
                s += this.utf8Decoder.decode(bytes);
              }
            }
            s += ch;
          }
        } else {
          // Decode Big5 / UAO double-byte characters to Unicode at the entrance
          if (this.pendingLead !== null) {
            const lead = this.pendingLead;
            const leadAttr = this.pendingLeadAttr;
            const trail = b;
            const pos = (lead << 8) | trail;
            const isTrail = (trail >= 0x40 && trail <= 0xfe && (trail <= 0x7e || trail >= 0xa1));
            const u = isTrail ? b2uTable[pos] : 0;

            if (u) {
              this.pendingLead = null;
              this.pendingLeadAttr = null;
              const charStr = String.fromCharCode(u);
              if (s) {
                term.puts(s);
                s = '';
              }
              term.putDBCS(charStr, leadAttr, term.attr);
            } else {
              this.pendingLead = null;
              this.pendingLeadAttr = null;
              if (s) {
                term.puts(s);
                s = '';
              }
              term.puts(String.fromCharCode(lead), leadAttr);
              if (b >= 0x81 && b <= 0xfe) {
                this.pendingLead = b;
                this.pendingLeadAttr = term.attr ? (term.attr.cloneAttr ? term.attr.cloneAttr() : Object.assign({}, term.attr)) : null;
              } else {
                s += ch;
              }
            }
          } else if (b >= 0x81 && b <= 0xfe) {
            this.pendingLead = b;
            this.pendingLeadAttr = term.attr ? (term.attr.cloneAttr ? term.attr.cloneAttr() : Object.assign({}, term.attr)) : null;
          } else {
            s += ch;
          }
        }
        break;
      case AnsiParser.STATE_CSI:
        if ( (ch >= '`' && ch <= 'z') || (ch >= '@' && ch <='Z') ) {
          if (ch !== 'm') {
            this.flushPendingLead();
          }
          // if(ch != 'm')
          //    dump('CSI: ' + this.esc + ch + '\n');
          const rawParams = this.esc.split(';');
          let firstChar = '';
          if (rawParams[0]) {
            if (rawParams[0].charAt(0)<'0' || rawParams[0].charAt(0)>'9') {
              firstChar = rawParams[0].charAt(0);
              rawParams[0] = rawParams[0].slice(1);
            }
          }
          if (firstChar && ch != 'h' && ch != 'l') { // unknown CSI
            this.flushPendingLead();
            //dump('unknown CSI: ' + this.esc + ch + '\n');
            this.state = AnsiParser.STATE_TEXT;
            this.esc = '';
            break;
          }
          /** @type {number[]} */
          const params = new Array(rawParams.length);
          for (let j = 0; j < rawParams.length; ++j) {
            if (rawParams[j]) {
              const parsed = parseInt(rawParams[j], 10);
              params[j] = Number.isFinite(parsed) ? parsed : 0;
            } else {
              params[j] = 0;
            }
          }
          /**
           * @param {number} idx
           * @param {number} fallback
           * @returns {number}
           */
          const getParam = (idx, fallback = 1) => {
            const v = params[idx];
            return (typeof v === 'number' && Number.isFinite(v) && v > 0) ? v : fallback;
          };
          /**
           * @param {number} idx
           * @param {number} fallback
           * @returns {number}
           */
          const getRawParam = (idx, fallback = 0) => {
            const v = params[idx];
            return (typeof v === 'number' && Number.isFinite(v)) ? v : fallback;
          };

          switch (ch) {
          case 'm':
            term.assignParamsToAttrs(params);
            break;
          case '@':
            term.insert(getParam(0, 1));
            break;
          case 'A':
            term.gotoPos(term.cur_x, term.cur_y - getParam(0, 1));
            break;
          case 'B':
          case 'e':
            term.gotoPos(term.cur_x, term.cur_y + getParam(0, 1));
            break;
          case 'C':
          case 'a':
            term.gotoPos(term.cur_x + getParam(0, 1), term.cur_y);
            break;
          case 'D':
            term.gotoPos(term.cur_x - getParam(0, 1), term.cur_y);
            break;
          case 'E':
            term.gotoPos(0, term.cur_y + getParam(0, 1));
            break;
          case 'F':
            term.gotoPos(0, term.cur_y - getParam(0, 1));
            break;
          case 'G':
          case '`':
            term.gotoPos(getParam(0, 1) - 1, term.cur_y);
            break;
          case 'I':
            term.tab(getParam(0, 1));
            break;
          case 'd':
            term.gotoPos(term.cur_x, getParam(0, 1) - 1);
            break;
          case 'h':
            if (firstChar === '?') {
              if (params.includes(2026) && term && typeof term.beginSyncUpdate === 'function') {
                term.beginSyncUpdate();
              }
            }
            break;
          case 'l':
            if (firstChar === '?') {
              if (params.includes(2026) && term && typeof term.endSyncUpdate === 'function') {
                term.endSyncUpdate();
              }
            }
            break;
          /*
          case 'h':
            if (firstChar == '?') {
              const mainobj = term.view.conn.listener;
              switch(params[0]) {
              case 1:
                term.view.cursorAppMode = true;
                break;
              case 1048:
              case 1049:
                term.cur_x_sav = term.cur_x;
                term.cur_y_sav = term.cur_y;
                if (params[0] != 1049) break; // 1049 fall through
              case 47:
              case 1047:
                mainobj.selAll(true); // skipRedraw
                term.altScreen=mainobj.ansiCopy(true); // external buffer
                term.altScreen+=term.ansiCmp(TermChar.newChar, term.attr);
                term.clear(2);
                term.attr.resetAttr();
                break;
              default:
              }
            }
            break;
          case 'l':
            if (firstChar == '?') {
              switch (params[0]) {
              case 1:
                term.view.cursorAppMode = false;
                break;
              case 47:
              case 1047:
              case 1049:
                term.clear(2);
                term.attr.resetAttr();
                if (term.altScreen) {
                  this.state = AnsiParser.STATE_TEXT;
                  this.esc = '';
                  this.feed(term.altScreen.replace(/(\r\n)+$/g, '\r\n'));
                }
                term.altScreen='';
                if (params[0] != 1049) break; // 1049 fall through
              case 1048:
                if (term.cur_x_sav<0 || term.cur_y_sav<0) break;
                term.cur_x = term.cur_x_sav;
                term.cur_y = term.cur_y_sav;
                break;
              default:
              }
            }
            break;
          */
          case 'J':
            term.clear(getRawParam(0, 0));
            break;
          case 'H':
          case 'f':
            if (params.length < 2) {
              term.gotoPos(0, 0);
            } else {
              term.gotoPos(getParam(1, 1) - 1, getParam(0, 1) - 1);
            }
            break;
          case 'K':
            term.eraseLine(getRawParam(0, 0));
            break;
          case 'L':
            term.insertLine(getParam(0, 1));
            break;
          case 'M':
            term.deleteLine(getParam(0, 1));
            break;
          case 'P':
            term.del(getParam(0, 1));
            break;
          case 'r': // scroll range
            if (params.length < 2) {
              term.scrollStart = 0;
              term.scrollEnd = term.rows - 1;
            } else {
              term.scrollStart = Math.max(0, getParam(0, 1) - 1);
              term.scrollEnd = Math.max(0, getParam(1, 1) - 1);
            }
            break;
          case 's':
            term.cur_x_sav = term.cur_x;
            term.cur_y_sav = term.cur_y;
            break;
          case 'u':
            if (typeof term.cur_x_sav === 'number' && term.cur_x_sav >= 0 &&
                typeof term.cur_y_sav === 'number' && term.cur_y_sav >= 0) {
              term.cur_x = term.cur_x_sav;
              term.cur_y = term.cur_y_sav;
            }
            break;
          case 'S':
            term.scroll(false, getParam(0, 1));
            break;
          case 'T':
            term.scroll(true, getParam(0, 1));
            break;
          case 'X':
            term.eraseChar(getParam(0, 1));
            break;
          case 'Z':
            term.backTab(getParam(0, 1));
            break;
          default:
            break;
          }
          this.state = AnsiParser.STATE_TEXT;
          this.esc = '';
        } else {
          this.esc += ch;
        }
        break;
      case AnsiParser.STATE_OSC:
        if (ch == '\\' && this.esc[this.esc.length - 1] == '\x1b') {
          // ST = ESC \
          this.esc = this.esc.slice(0, -1);
          ch = '\x07';
        }
        if (ch == '\x07') {
          const params = this.esc.split(';');
          let firstChar = '';
          if (params[0] && (params[0].charAt(0)<'0' || params[0].charAt(0)>'9')) {
            if (firstChar) { // unknown OSC
              //dump('unknown OSC: ' + this.esc + ch + '\n');
              this.state = AnsiParser.STATE_TEXT;
              this.esc = '';
              break;
            }
          }
          for (let j = 0; j < params.length - 1; ++j) {
            if (params[j]) {
              const parsed = parseInt(params[j], 10);
              params[j] = Number.isFinite(parsed) ? parsed : 0;
            } else {
              params[j] = 0;
            }
          }
          switch (params[0]) {
          case 2:
            if (params[1] == '?')
              ; // elicits a response; not implemented
            else if (params[1] !== undefined) {
              let title = String(params[1]);
              if (!isUtf8)
                title = b2u(title);
              term.setTitle({site: title});
            }
            break;
          default:
            break;
          }
          this.state = AnsiParser.STATE_TEXT;
          this.esc = '';
        } else {
          this.esc += ch;
        }
        break;
      case AnsiParser.STATE_C1:
        let C1_End = true;
        const C1_Char = [' ', '#', '%', '(', ')', '*', '+', '-', '.', '/'];
        if (this.esc) { // multi-char is not supported now
          for (let j = 0; j < C1_Char.length; ++j)
            if (this.esc == C1_Char[j]) C1_End = false;
          if (C1_End) --i;
          else this.esc += ch;
          //dump('UNKNOWN C1 CONTROL CHAR IS FOUND: ' + this.esc + '\n');
          this.esc = '';
          this.state = AnsiParser.STATE_TEXT;
          break;
        }
        switch (ch) {
        case '7':
          term.cur_x_sav = term.cur_x;
          term.cur_y_sav = term.cur_y;
          break;
        case '8':
          if (typeof term.cur_x_sav === 'number' && term.cur_x_sav >= 0 &&
              typeof term.cur_y_sav === 'number' && term.cur_y_sav >= 0) {
            term.cur_x = term.cur_x_sav;
            term.cur_y = term.cur_y_sav;
          }
          break;
        case 'D':
          term.scroll(false,1);
          break;
        case 'E':
          term.lineFeed();
          term.carriageReturn();
          break;
        case 'M':
          term.scroll(true,1);
          break;
        /*
        case '=':
            term.view.keypadAppMode = true;
            break;
        case '>':
            term.view.keypadAppMode = false;
            break;
        */
        default:
          this.esc += ch;
          C1_End=false;
        }
        if (!C1_End) break;
        this.esc = '';
        this.state = AnsiParser.STATE_TEXT;
        break;
      case AnsiParser.STATE_ESC:
        if (ch == '[')
          this.state=AnsiParser.STATE_CSI;
        else if (ch == ']') {
          this.flushPendingLead();
          this.state=AnsiParser.STATE_OSC;
        } else {
          this.flushPendingLead();
          this.state=AnsiParser.STATE_C1;
          --i;
        }
        break;
      }
    }
    if (s) {
      term.puts(s);
      s = '';
    }
  }
}

export const AnsiFilter = AnsiParser;
