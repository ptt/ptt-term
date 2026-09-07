// Terminal Screen Buffer, displayed by TermView

import { Event } from './event';
import { ColorState } from './term_ui';
import { isForceWidthCode } from './symbol_table';
import { u2bTable } from '../conv/uao';
import { getSite } from './sites';
import { playTerminalBell } from './bell.js';
import cursorBack from '../cursor/back.png';
import cursorPageup from '../cursor/pageup.png';
import cursorPagedown from '../cursor/pagedown.png';
import cursorHome from '../cursor/home.png';
import cursorEnd from '../cursor/end.png';
import cursorPrevous from '../cursor/prevous.png';
import cursorNext from '../cursor/next.png';
import cursorFirst from '../cursor/first.png';
import cursorRefresh from '../cursor/refresh.png';
import cursorLast from '../cursor/last.png';

export const termColors = [
  // dark
  '#000000', // black
  '#800000', // red
  '#008000', // green
  '#808000', // yellow
  '#000080', // blue
  '#800080', // magenta
  '#008080', // cyan
  '#c0c0c0', // light gray
  // bright
  '#808080', // gray
  '#ff0000', // red
  '#00ff00', // green
  '#ffff00', // yellow
  '#0000ff', // blue
  '#ff00ff', // magenta
  '#00ffff', // cyan
  '#ffffff'  // white
];

export const termInvColors = [
  // dark
  '#FFFFFF', // black
  '#7FFFFF', // red
  '#FF7FFF', // green
  '#7F7FFF', // yellow
  '#FFFF7F', // blue
  '#7FFF7F', // magenta
  '#FF7F7F', // cyan
  '#3F3F3F', // light gray
  // bright
  '#7F7F7F', // gray
  '#00FFFF', // red
  '#FF00FF', // green
  '#0000FF', // yellow
  '#FFFF00', // blue
  '#00FF00', // magenta
  '#FF0000', // cyan
  '#000000'  // white
];

const mouseCursorMap = [
  'auto',                                                // 0
  `url(${cursorBack}) 0 6,auto`,                         // 1
  `url(${cursorPageup}) 6 0,auto`,                       // 2
  `url(${cursorPagedown}) 6 21,auto`,                    // 3
  `url(${cursorHome}) 0 0,auto`,                         // 4
  `url(${cursorEnd}) 0 0,auto`,                          // 5
  'pointer',                                             // 6
  'default',                                             // 7
  `url(${cursorPrevous}) 6 0,auto`,                      // 8
  `url(${cursorNext}) 6 0,auto`,                         // 9
  `url(${cursorFirst}) 0 0,auto`,                        // 10
  'auto',                                                // 11
  `url(${cursorRefresh}) 0 0,auto`,                      // 12
  `url(${cursorLast}) 0 0,auto`,                         // 13
  `url(${cursorLast}) 0 0,auto`                          // 14
];

export class TermChar {
  static defaultFg = 7;
  static defaultBg = 0;

  /**
   * @param {string} [ch]
   */
  constructor(ch) {
    /** @type {string} */
    this.ch = typeof ch === 'string' ? ch : ' ';
    this.resetAttr();
    /** @type {boolean} */
    this.needUpdate = false;
    /** @type {boolean} */
    this.isDBCSLead = false;
    /** @type {boolean} */
    this.isDBCSTrail = false;
    /** @type {boolean} */
    this.startOfURL = false;
    /** @type {boolean} */
    this.endOfURL = false;
    /** @type {boolean} */
    this.partOfURL = false;
    /** @type {boolean} */
    this.partOfKeyWord = false;
    /** @type {string} */
    this.keyWordColor = '#ff0000';
    /** @type {string} */
    this.fullurl = '';
  }

  /**
   * @param {number[]} params
   */
  assignParams(params) {
    if (!Array.isArray(params)) return;
    params.forEach(rawV => {
      const v = typeof rawV === 'number' && Number.isFinite(rawV) ? rawV : parseInt(rawV, 10);
      if (!Number.isFinite(v)) return;
      switch (v) {
      case 0: // reset
        this.resetAttr();
        break;
      case 1: // bright
        this.bright = true;
        break;
      case 4:
        this.underLine = true;
        break;
      case 5: // blink
      case 6:
        this.blink = true;
        break;
      case 7: // invert
        this.invert = true;
        break;
      case 8:
        // invisible is not supported
        break;
      default:
        if (v <= 37) {
          if (v >= 30) { // fg
            this.fg = v - 30;
          }
        } else if (v >= 40) {
          if (v <= 47) { //bg
            this.bg = v - 40;
          }
        }
        break;
      }
    });
  }

  copyFromNewChar() {
    this.ch = TermChar.newChar ? TermChar.newChar.ch : ' ';
    this.isDBCSLead = TermChar.newChar ? TermChar.newChar.isDBCSLead : false;
    this.isDBCSTrail = TermChar.newChar ? TermChar.newChar.isDBCSTrail : false;
    this.resetAttr();
  }

  /**
   * @param {TermChar} attr
   */
  copyAttr(attr) {
    if (!attr || typeof attr !== 'object') return;
    this.fg = typeof attr.fg === 'number' ? attr.fg : 7;
    this.bg = typeof attr.bg === 'number' ? attr.bg : 0;
    this.bright = Boolean(attr.bright);
    this.invert = Boolean(attr.invert);
    this.blink = Boolean(attr.blink);
    this.underLine = Boolean(attr.underLine);
  }

  resetAttr() {
    this.fg = 7;
    this.bg = 0;
    this.bright = false;
    this.invert = false;
    this.blink = false;
    this.underLine = false;
  }

  /**
   * @param {TermChar} [oth]
   * @returns {boolean}
   */
  equalsAttr(oth) {
    if (!oth) return false;
    return this.fg === oth.fg &&
           this.bg === oth.bg &&
           this.bright === Boolean(oth.bright) &&
           this.invert === Boolean(oth.invert) &&
           this.blink === Boolean(oth.blink) &&
           this.underLine === Boolean(oth.underLine);
  }

  /**
   * @returns {TermChar}
   */
  cloneAttr() {
    const c = new TermChar(' ');
    c.copyAttr(this);
    return c;
  }
  
  getFg() {
    if (this.invert)
      return this.bright ? (this.bg + 8) : this.bg;
    return this.bright ? (this.fg + 8) : this.fg;
  }

  getBg() {
    return this.invert ? this.fg : this.bg;
  }

  getColor() {
    return new ColorState(this.getFg(), this.getBg(), this.blink);
  }

  isUnderLine() {
    return this.underLine;
  }

  isStartOfURL() {
    return this.startOfURL;
  }

  isEndOfURL() {
    return this.endOfURL;
  }

  isPartOfURL() {
    return this.partOfURL;
  }

  isPartOfKeyWord() {
    return this.partOfKeyWord;
  }

  getKeyWordColor() {
    return this.keyWordColor;
  }

  getFullURL() {
    return this.fullurl;
  }
}

TermChar.newChar = new TermChar(' ');

export class TermBuf extends Event {
  timerUpdate = null;
  animFrameId = null;
  uriRegEx = /((ftp|http|https|telnet):\/\/([A-Za-z0-9_]+:{0,1}[A-Za-z0-9_]*@)?([A-Za-z0-9_#!:.?+=&%@!\-\/\$\^,;|*~'()]+)(:[0-9]+)?(\/|\/([A-Za-z0-9_#!:.?+=&%@!\-\/]))?)|(pid:\/\/(\d{1,10}))/ig;

  /**
   * @param {number} cols
   * @param {number} rows
   */
  constructor(cols, rows) {
    super();
    const validCols = (typeof cols === 'number' && Number.isFinite(cols) && cols > 0) ? Math.floor(cols) : 80;
    const validRows = (typeof rows === 'number' && Number.isFinite(rows) && rows > 0) ? Math.floor(rows) : 24;
    this.cols = validCols;
    this.rows = validRows;
    this.view = null;
    this.cur_x = 0;
    this.cur_y = 0;
    this.cur_x_sav = -1;
    this.cur_y_sav = -1;
    this.scrollStart = 0;
    this.scrollEnd = validRows - 1;
    this._nowHighlight = -1;
    this.tempMouseCol = 0;
    this.tempMouseRow = 0;
    this.mouseCursor = 0;
    this.highlightCursor = true;
    this.useMouseBrowsing = true;
    //this.scrollingTop=0;
    //this.scrollingBottom=23;
    this.attr = new TermChar(' ');
    this.disableLinefeed = false;
    this.altScreen = '';
    this.changed = false;
    this.posChanged = false;
    this.bellOccurred = false;
    this.pageState = 0;
    this.forceFullWidth = false;

    this.startedEasyReading = false;
    this.easyReadingShowReplyText = false;
    this.easyReadingShowPushInitText = false;
    this.prevPageState = 0;
    this.site = getSite(process.env.SITE_TYPE || 'auto');

    /** @type {TermChar[][]} */
    this.lines = new Array(validRows);

    this.pageLines = [];
    this.pageWrappedLines = [];

    this.lineChangeds = new Array(validRows);

    this.viewBufferTimer = 30;

    let r = validRows;
    while (--r >= 0) {
      const line = new Array(validCols);
      let c = validCols;
      while (--c >= 0) {
        line[c] = new TermChar(' ');
      }
      this.lines[r] = line;
      //this.keyWordLine[rows]=false;
    }
    this.BBSWin = document.getElementById('BBSWindow');
    this.titleBase = process.env.PTTCHROME_PAGE_TITLE;
    this.titleSite = null;
    this.titleConn = null;
    this.dynamicTitle = (process.env.PTTCHROME_DYNAMIC_TITLE !== false);
    document.title = this.title = this.titleBase;
  }

  get nowHighlight() {
    return this._nowHighlight;
  }

  set nowHighlight(val) {
    this.setHighlight(val);
  }

  /**
   * @param {number} cols
   * @param {number} rows
   */
  resize(cols, rows) {
    cols = (typeof cols === 'number' && Number.isFinite(cols) && cols > 0) ? Math.floor(cols) : this.cols;
    rows = (typeof rows === 'number' && Number.isFinite(rows) && rows > 0) ? Math.floor(rows) : this.rows;
    if (this.site && typeof this.site.clampTermSize === 'function') {
      const clamped = this.site.clampTermSize(cols, rows);
      if (clamped && typeof clamped.cols === 'number' && typeof clamped.rows === 'number') {
        cols = Math.floor(clamped.cols);
        rows = Math.floor(clamped.rows);
      }
    }
    console.debug(`[TermBuf.resize] Resizing buffer to ${cols}x${rows}`);
    this.cols = cols;
    this.rows = rows;
    this.lineChangeds.length = rows;
    this.scrollEnd = rows - 1;
    this.lines.length = rows;
    for (let r = 0; r < rows; r++) {
      if (!this.lines[r]) {
        this.lines[r] = new Array(cols);
      }
      this.lines[r].length = cols;
      for (let c = 0; c < cols; c++){
        if (!this.lines[r][c]) {
          this.lines[r][c] = new TermChar(' ');
        }
      }
    }
    if (this.cur_x >= cols) this.cur_x = cols - 1;
    if (this.cur_y >= rows) this.cur_y = rows - 1;
  }

  /**
   * @param {any} view
   */
  setView(view) {
    this.view = view;
  }

  /**
   * @param {number[]} params
   */
  assignParamsToAttrs(params) {
    if (!Array.isArray(params)) return;
    this.attr.assignParams(params);
  }

  /**
   * @param {string} str
   * @param {TermChar} [attr]
   */
  puts(str, attr = null) {
    if (!str || typeof str !== 'string')
      return;
    const cols = this.cols;
    const rows = this.rows;
    const lines = this.lines;
    const n = str.length;
    if (!Number.isFinite(this.cur_x) || this.cur_x < 0) this.cur_x = 0;
    if (!Number.isFinite(this.cur_y) || this.cur_y < 0) this.cur_y = 0;
    if (this.cur_y >= rows) this.cur_y = rows - 1;
    let line = lines[this.cur_y];
    if (!line) {
      this.gotoPos(this.cur_x, this.cur_y);
      line = lines[this.cur_y];
    }
    for (let i = 0; i < n; ++i) {
      const ch = str[i];
      switch (ch) {
      case '\x07':
        this.bellOccurred = true;
        playTerminalBell();
        this.dispatchEvent(new CustomEvent('bell'));
        continue;
      case '\b':
        this.back();
        continue;
      case '\r':
        this.carriageReturn();
        continue;
      case '\n':
      case '\f':
      case '\v':
        this.lineFeed();
        line = lines[this.cur_y];
        if (!line) line = lines[this.cur_y] = new Array(cols).fill(null).map(() => new TermChar(' '));
        continue;
      case '\0':
          continue;
      }
      //if( ch < ' ')
      //    //dump('Unhandled invisible char' + ch.charCodeAt(0)+ '\n');

      if (this.cur_x >= cols) {
        // next line
        if(!this.disableLinefeed) this.lineFeed();
        this.cur_x = 0;
        line = lines[this.cur_y];
        if (!line) line = lines[this.cur_y] = new Array(cols).fill(null).map(() => new TermChar(' '));
        this.posChanged = true;
      }

      switch (ch) {
      case '\t':
        this.tab();
        break;
      default: {
        const isWide = this.isFullWidth(ch);
        if (isWide && this.cur_x >= cols - 1) {
          if (!this.disableLinefeed) this.lineFeed();
          this.cur_x = 0;
          line = lines[this.cur_y];
          if (!line) line = lines[this.cur_y] = new Array(cols).fill(null).map(() => new TermChar(' '));
          this.posChanged = true;
        }

        if (this.cur_x >= cols) this.cur_x = cols - 1;
        let ch2 = line[this.cur_x];
        if (ch2) {
          ch2.ch = ch;
          ch2.copyAttr(attr || this.attr);
          ch2.needUpdate = true;
          ch2.isDBCSLead = isWide;
          ch2.isDBCSTrail = false;
          ++this.cur_x;

          if (isWide && this.cur_x < cols) {
            let chTrail = line[this.cur_x];
            if (chTrail) {
              chTrail.ch = '';
              chTrail.copyAttr(attr || this.attr);
              chTrail.needUpdate = true;
              chTrail.isDBCSLead = false;
              chTrail.isDBCSTrail = true;
              ++this.cur_x;
            }
          }
          this.changed = true;
          this.posChanged = true;
        }
        break;
      }
      }
    }
    this.queueUpdate();
  }

  /**
   * Put a DBCS character (occupying 2 cells) with lead and trail cell attributes.
   * Lead cell has isDBCSLead=true, and trail cell has isDBCSTrail=true.
   * @param {string} ch
   * @param {TermChar} [leadAttr]
   * @param {TermChar} [trailAttr]
   */
  putDBCS(ch, leadAttr, trailAttr) {
    const cols = this.cols;
    const lines = this.lines;
    let line = lines[this.cur_y];
    if (!line) line = lines[this.cur_y] = new Array(cols).fill(null).map(() => new TermChar(' '));

    if (this.cur_x >= cols - 1) {
      if (!this.disableLinefeed) this.lineFeed();
      this.cur_x = 0;
      line = lines[this.cur_y];
      if (!line) line = lines[this.cur_y] = new Array(cols).fill(null).map(() => new TermChar(' '));
      this.posChanged = true;
    }

    if (this.cur_x >= cols) this.cur_x = cols - 1;
    let ch2 = line[this.cur_x];
    if (ch2) {
      ch2.ch = ch;
      ch2.copyAttr(leadAttr || this.attr);
      ch2.needUpdate = true;
      ch2.isDBCSLead = true;
      ch2.isDBCSTrail = false;
      ++this.cur_x;

      if (this.cur_x < cols) {
        let chTrail = line[this.cur_x];
        if (chTrail) {
          chTrail.ch = '';
          chTrail.copyAttr(trailAttr || this.attr);
          chTrail.needUpdate = true;
          chTrail.isDBCSLead = false;
          chTrail.isDBCSTrail = true;
          ++this.cur_x;
        }
      }
      this.changed = true;
      this.posChanged = true;
    }
    this.queueUpdate();
  }

  updateCharAttr() {
    const cols = this.cols;
    const rows = this.rows;
    const lines = this.lines;
    for (let row = 0; row < rows; ++row) {
      const line = lines[row];
      let needUpdate = false;
      for (let col = 0; col < cols; ++col) {
        let ch = line[col];
        if (ch.needUpdate)
            needUpdate=true;

        if ((ch.isDBCSLead || this.isFullWidth(ch.ch)) && (col + 1) < cols) {
          ch.isDBCSLead = true;
          ch.isDBCSTrail = false;
          ++col;
          const ch0 = ch;
          ch = line[col];
          ch.isDBCSLead = false;
          ch.isDBCSTrail = true;
          if (ch.needUpdate)
            needUpdate = true;
          // ensure simultaneous redraw of both bytes
          if (ch0.needUpdate !== ch.needUpdate) {
            ch0.needUpdate = ch.needUpdate = true;
          }
        } else {
          ch.isDBCSLead = false;
          ch.isDBCSTrail = false;
          if (ch.ch === '') {
            ch.ch = ' ';
            ch.needUpdate = true;
          }
        }
      }

      if (needUpdate) { // this line has been changed
        this.lineChangeds[row] = true;
        // perform URI detection again
        // remove all previously cached uri positions
        if (line.uris) {
          const uris = line.uris;
          const nuris = uris.length;

          // FIXME: this is inefficient
          for (let iuri = 0; iuri < nuris; ++iuri) {
            const uri = uris[iuri];
            line[uri[0]].startOfURL = false;
            line[uri[0]].endOfURL = false;
            line[uri[0]].fullurl = '';
            line[uri[1]-1].startOfURL = false;
            line[uri[1]-1].endOfURL = false;
            line[uri[1]-1].fullurl = '';
            for (let c = uri[0]; c < uri[1]; ++c) {
              line[c].partOfURL = false;
              line[c].needUpdate = true;
            }
          }
          line.uris=null;
        }
        let s = '';
        for (let col = 0; col < cols; ++col) {
          const c = line[col];
          s += (c && !c.isDBCSTrail && c.ch !== '') ? c.ch : ' ';
        }

        let res;
        let uris = null;
        this.uriRegEx.lastIndex = 0;
        // pairs of URI start and end positions are stored in line.uris.
        while ( (res = this.uriRegEx.exec(s)) !== null ) {
          if (!uris)   uris = [];
          const uri = [res.index, res.index+res[0].length];
          uris.push(uri);
          // dump('found URI: ' + res[0] + '\n');
        }

        if (this.site && typeof this.site.detectCustomLinks === 'function') {
          const customLinks = this.site.detectCustomLinks(s, line, this);
          if (Array.isArray(customLinks)) {
            for (let i = 0; i < customLinks.length; ++i) {
              const cl = customLinks[i];
              if (cl && typeof cl.start === 'number' && typeof cl.end === 'number' && cl.end > cl.start) {
                const overlap = uris && uris.some(u => !(cl.end <= u[0] || cl.start >= u[1]));
                if (!overlap) {
                  if (!uris) uris = [];
                  uris.push([cl.start, cl.end, cl.url]);
                }
              }
            }
            if (uris) {
              uris.sort((a, b) => a[0] - b[0]);
            }
          }
        }

        if (uris) {
          line.uris = uris;
          // dump(line.uris.length + "uris found\n");
        }
        //
        if (line.uris) {
          const uris = line.uris;
          const nuris = uris.length;
          for (let iuri = 0; iuri < nuris; ++iuri) {
            const uri = uris[iuri];
            let urlTemp = '';

            for (let col = uri[0]; col < uri[1]; ++col) {
              urlTemp += line[col].ch;
              line[col].partOfURL = true;
              line[col].needUpdate = true; //fix link bug
            }
            const targetUrl = uri[2] || urlTemp;
            const fullurl = this.site && typeof this.site.resolveUrl === 'function'
              ? this.site.resolveUrl(targetUrl)
              : (targetUrl.toLowerCase().startsWith('pid://') ? 'https://www.pixiv.net/artworks/' + targetUrl.slice(6) : targetUrl);
            line[uri[0]].startOfURL = true;
            line[uri[0]].fullurl = fullurl;
            line[uri[1]-1].endOfURL = true;
          }
        }
        //
      }
    }
  }

  /**
   * @param {number} [param]
   */
  clear(param) {
    let rows = this.rows;
    const cols = this.cols;
    const lines = this.lines;
    const mode = (typeof param === 'number' && Number.isFinite(param)) ? Math.floor(param) : 0;

    switch (mode) {
    case 0: {
      if (this.cur_y >= 0 && this.cur_y < rows && lines[this.cur_y]) {
        const line = lines[this.cur_y];
        const cur_x = Math.max(0, Math.min(cols, (typeof this.cur_x === 'number' && Number.isFinite(this.cur_x)) ? Math.floor(this.cur_x) : 0));
        for (let col = cur_x; col < cols; ++col) {
          if (line[col]) {
            line[col].copyFromNewChar();
            line[col].needUpdate = true;
          }
        }
      }
      for (let row = Math.max(0, this.cur_y + 1); row < rows; ++row) {
        const curLine = lines[row];
        if (curLine) {
          for (let col = 0; col < cols; ++col) {
            if (curLine[col]) {
              curLine[col].copyFromNewChar();
              curLine[col].needUpdate = true;
            }
          }
        }
      }
      break;
    }
    case 1: {
      const endRow = Math.min(rows, Math.max(0, this.cur_y));
      for (let row = 0; row < endRow; ++row) {
        const curLine = lines[row];
        if (curLine) {
          for (let col = 0; col < cols; ++col) {
            if (curLine[col]) {
              curLine[col].copyFromNewChar();
              curLine[col].needUpdate = true;
            }
          }
        }
      }
      if (this.cur_y >= 0 && this.cur_y < rows && lines[this.cur_y]) {
        const line = lines[this.cur_y];
        const cur_x = Math.max(0, Math.min(cols, (typeof this.cur_x === 'number' && Number.isFinite(this.cur_x)) ? Math.floor(this.cur_x) : 0));
        for (let col = 0; col < cur_x; ++col) {
          if (line[col]) {
            line[col].copyFromNewChar();
            line[col].needUpdate = true;
          }
        }
      }
      break;
    }
    case 2:
      while (--rows >= 0) {
        let col = cols;
        const line = lines[rows];
        if (line) {
          while (--col >= 0) {
            if (line[col]) {
              line[col].copyFromNewChar();
              line[col].needUpdate = true;
            }
          }
        }
      }
      break;
    }
    this.changed = true;
    this.gotoPos(0, 0);
    this.queueUpdate();
  }

  back() {
    if (!Number.isFinite(this.cur_x)) this.cur_x = 0;
    if (this.cur_x > 0) {
      --this.cur_x;
      this.posChanged = true;
      this.queueUpdate();
    }
  }

  /**
   * @param {number} [param]
   */
  tab(param) {
    if (!Number.isFinite(this.cur_x) || this.cur_x < 0) this.cur_x = 0;
    const p = (typeof param === 'number' && Number.isFinite(param) && param > 0) ? Math.floor(param) : 1;
    const mod = this.cur_x % 4;
    this.cur_x += 4 - mod;
    if (p > 1) this.cur_x += 4 * (p - 1);
    if (this.cur_x >= this.cols)
      this.cur_x = this.cols - 1;
    this.posChanged = true;
    this.queueUpdate();
  }

  /**
   * @param {number} [param]
   */
  backTab(param) {
    if (!Number.isFinite(this.cur_x) || this.cur_x < 0) this.cur_x = 0;
    const p = (typeof param === 'number' && Number.isFinite(param) && param > 0) ? Math.floor(param) : 1;
    const mod = this.cur_x % 4;
    this.cur_x -= (mod > 0 ? mod : 4);
    if (p > 1) this.cur_x -= 4 * (p - 1);
    if (this.cur_x < 0)
      this.cur_x = 0;
    this.posChanged = true;
    this.queueUpdate();
  }

  /**
   * @param {number} [param]
   */
  insert(param) {
    let p = (typeof param === 'number' && Number.isFinite(param) && param > 0) ? Math.floor(param) : 1;
    if (this.cur_y < 0 || this.cur_y >= this.rows) return;
    const line = this.lines[this.cur_y];
    if (!line) return;
    const cols = this.cols;
    let cur_x = (typeof this.cur_x === 'number' && Number.isFinite(this.cur_x)) ? Math.floor(this.cur_x) : 0;
    cur_x = Math.max(0, Math.min(cols, cur_x));
    if (cur_x > 0 && line[cur_x - 1] && line[cur_x - 1].isDBCSLead) ++cur_x;
    if (cur_x >= cols) return;
    if (cur_x + p >= cols) {
      for (let col = cur_x; col < cols; ++col) {
        if (line[col]) {
          line[col].copyFromNewChar();
          line[col].needUpdate = true;
        }
      }
    } else {
      while (--p >= 0) {
        const ch = line.pop();
        if (ch) {
          line.splice(cur_x, 0, ch);
          ch.copyFromNewChar();
        }
      }
      for (let col = cur_x; col < cols; ++col) {
        if (line[col]) line[col].needUpdate = true;
      }
    }
    this.changed = true;
    this.queueUpdate();
  }

  /**
   * @param {number} [param]
   */
  del(param) {
    let p = (typeof param === 'number' && Number.isFinite(param) && param > 0) ? Math.floor(param) : 1;
    if (this.cur_y < 0 || this.cur_y >= this.rows) return;
    const line = this.lines[this.cur_y];
    if (!line) return;
    const cols = this.cols;
    let cur_x = (typeof this.cur_x === 'number' && Number.isFinite(this.cur_x)) ? Math.floor(this.cur_x) : 0;
    cur_x = Math.max(0, Math.min(cols, cur_x));
    if (cur_x > 0 && line[cur_x - 1] && line[cur_x - 1].isDBCSLead) ++cur_x;
    if (cur_x >= cols) return;
    if (cur_x + p >= cols) {
      for (let col = cur_x; col < cols; ++col) {
        if (line[col]) {
          line[col].copyFromNewChar();
          line[col].needUpdate = true;
        }
      }
    } else {
      let n = cols - cur_x - p;
      while (--n >= 0) {
        const ch = line.pop();
        if (ch) line.splice(cur_x, 0, ch);
      }
      for (let col = cols - p; col < cols; ++col) {
        if (line[col]) line[col].copyFromNewChar();
      }
      for (let col = cur_x; col < cols; ++col) {
        if (line[col]) line[col].needUpdate = true;
      }
    }
    this.changed = true;
    this.queueUpdate();
  }

  /**
   * @param {number} [param]
   */
  eraseChar(param) {
    const p = (typeof param === 'number' && Number.isFinite(param) && param > 0) ? Math.floor(param) : 1;
    if (this.cur_y < 0 || this.cur_y >= this.rows) return;
    const line = this.lines[this.cur_y];
    if (!line) return;
    const cols = this.cols;
    let cur_x = (typeof this.cur_x === 'number' && Number.isFinite(this.cur_x)) ? Math.floor(this.cur_x) : 0;
    cur_x = Math.max(0, Math.min(cols, cur_x));
    if (cur_x > 0 && line[cur_x - 1] && line[cur_x - 1].isDBCSLead) ++cur_x;
    if (cur_x >= cols) return;
    const n = (cur_x + p > cols) ? cols : cur_x + p;
    for (let col = cur_x; col < n; ++col) {
      if (line[col]) {
        line[col].copyFromNewChar();
        line[col].needUpdate = true;
      }
    }
    this.changed = true;
    this.queueUpdate();
  }

  /**
   * @param {number} [param]
   */
  eraseLine(param) {
    if (this.cur_y < 0 || this.cur_y >= this.rows) return;
    const line = this.lines[this.cur_y];
    if (!line) return;
    const cols = this.cols;
    const mode = (typeof param === 'number' && Number.isFinite(param)) ? Math.floor(param) : 0;
    const cur_x = Math.max(0, Math.min(cols, (typeof this.cur_x === 'number' && Number.isFinite(this.cur_x)) ? Math.floor(this.cur_x) : 0));
    switch (mode) {
    case 0: // erase to right
      for (let col = cur_x; col < cols; ++col) {
        if (line[col]) {
          line[col].copyFromNewChar();
          line[col].needUpdate = true;
        }
      }
      break;
    case 1: { // erase to left
      for (let col = 0; col < cur_x; ++col) {
        if (line[col]) {
          line[col].copyFromNewChar();
          line[col].needUpdate = true;
        }
      }
      break;
    }
    case 2: // erase all
      for (let col = 0; col < cols; ++col) {
        if (line[col]) {
          line[col].copyFromNewChar();
          line[col].needUpdate = true;
        }
      }
      break;
    default:
      return;
    }
    this.changed = true;
    this.queueUpdate();
  }

  /**
   * @param {number} [param]
   */
  deleteLine(param) {
    const p = (typeof param === 'number' && Number.isFinite(param) && param > 0) ? Math.floor(param) : 1;
    const scrollStart = this.scrollStart;
    this.scrollStart = Math.max(0, Math.min(this.rows - 1, (typeof this.cur_y === 'number' && Number.isFinite(this.cur_y)) ? Math.floor(this.cur_y) : 0));
    this.scroll(false, p);
    this.scrollStart = scrollStart;
    this.changed = true;
    this.queueUpdate();
  }

  /**
   * @param {number} [param]
   */
  insertLine(param) {
    const p = (typeof param === 'number' && Number.isFinite(param) && param > 0) ? Math.floor(param) : 1;
    const scrollStart = this.scrollStart;
    if (this.cur_y < this.scrollEnd) {
      this.scrollStart = Math.max(0, Math.min(this.rows - 1, (typeof this.cur_y === 'number' && Number.isFinite(this.cur_y)) ? Math.floor(this.cur_y) : 0));
      this.scroll(true, p);
    }
    this.scrollStart = scrollStart;
    this.changed = true;
    this.queueUpdate();
  }

  /**
   * @param {boolean} up
   * @param {number} [n]
   */
  scroll(up, n) {
    let scrollStart = (typeof this.scrollStart === 'number' && Number.isFinite(this.scrollStart)) ? Math.floor(this.scrollStart) : 0;
    let scrollEnd = (typeof this.scrollEnd === 'number' && Number.isFinite(this.scrollEnd)) ? Math.floor(this.scrollEnd) : this.rows - 1;
    if (scrollEnd <= scrollStart) {
      scrollStart = 0;
      if (scrollEnd < 1) scrollEnd = this.rows - 1;
    }
    let count = (typeof n === 'number' && Number.isFinite(n) && n > 0) ? Math.floor(n) : 1;
    if (count >= this.rows) { // scroll more than 1 page = clear
      this.clear(2);
      return;
    } else if (count >= scrollEnd - scrollStart + 1) {
      const lines = this.lines;
      const cols = this.cols;
      for (let row = scrollStart; row <= scrollEnd; ++row) {
        if (lines[row]) {
          for (let col = 0; col < cols; ++col) {
            if (lines[row][col]) {
              lines[row][col].copyFromNewChar();
              lines[row][col].needUpdate = true;
            }
          }
        }
      }
    } else {
      const lines = this.lines;
      const rows = this.rows;
      const cols = this.cols;

      if (up) { // move lines down
        for (let i = 0; i < rows - 1 - scrollEnd; ++i)
          lines.unshift(lines.pop());
        while (--count >= 0) {
          const line = lines.pop();
          lines.splice(rows - 1 - scrollEnd + scrollStart, 0, line);
          for (let col = 0; col < cols; ++col)
            if (line[col]) line[col].copyFromNewChar();
        }
        for (let i = 0; i < rows - 1 - scrollEnd; ++i)
          lines.push(lines.shift());
      } else { // move lines up
        for (let i = 0; i < scrollStart; ++i)
          lines.push(lines.shift());
        while (--count >= 0) {
          const line = lines.shift();
          lines.splice(scrollEnd - scrollStart, 0, line);
          for (let col = 0; col < cols; ++col) // clear the line
            if (line[col]) line[col].copyFromNewChar();
        }
        for (let i = 0; i < scrollStart; ++i)
          lines.unshift(lines.pop());
      }

      // update the whole screen within scroll region
      for (let row = scrollStart; row <= scrollEnd; ++row) {
        const line = lines[row];
        if (line) {
          for (let col = 0; col < cols; ++col) {
            if (line[col]) line[col].needUpdate = true;
          }
        }
      }
    }
    this.changed = true;
    this.queueUpdate();
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  gotoPos(x, y) {
    const targetX = (typeof x === 'number' && Number.isFinite(x)) ? Math.floor(x) : 0;
    const targetY = (typeof y === 'number' && Number.isFinite(y)) ? Math.floor(y) : 0;
    this.cur_x = Math.max(0, Math.min(this.cols - 1, targetX));
    this.cur_y = Math.max(0, Math.min(this.rows - 1, targetY));
    this.posChanged = true;
    this.queueUpdate();
  }

  carriageReturn() {
    this.cur_x = 0;
    this.posChanged = true;
    this.queueUpdate();
  }

  lineFeed() {
    if (!Number.isFinite(this.cur_y) || this.cur_y < 0) this.cur_y = 0;
    if (this.cur_y < this.scrollEnd) {
      ++this.cur_y;
      this.posChanged = true;
      this.queueUpdate();
    } else { // at bottom of screen
      this.scroll(false, 1);
    }
  }

  queueUpdate(directupdate) {
    if (this.animFrameId !== null || this.timerUpdate !== null)
      return;

    const func = () => {
      this.animFrameId = null;
      this.timerUpdate = null;
      this.notify();
    };

    if (typeof requestAnimationFrame === 'function') {
      this.animFrameId = requestAnimationFrame(func);
    } else {
      this.timerUpdate = setTimeout(func, directupdate ? 1 : 16);
    }
  }

  notify(timer) {
    if (this.animFrameId !== null) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(this.animFrameId);
      }
      this.animFrameId = null;
    }
    if (this.timerUpdate !== null) {
      clearTimeout(this.timerUpdate);
      this.timerUpdate = null;
    }

    if (this.changed) { // content changed
      this.updateCharAttr();

      this.setPageState();
      if (this.useMouseBrowsing) {
        // clear highlight and reset cursor on page change
        // without the redraw being called here
        this.clearHighlight();
      }

      this.dispatchEvent(new CustomEvent('change'));

      this.view.update();
      this.changed = false;

      this.dispatchEvent(new CustomEvent('viewUpdate'));
    }

    if (this.posChanged) { // cursor pos changed
      this.view.updateCursorPos();
      this.posChanged=false;
    }

    if (this.view.blinkOn) {
      this.view.blinkOn = false;

      document.body.classList.toggle('blink--active');
      if (typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent('term-blink'));
      }
      this.view.onBlinkToggle();
    }
  }

  /**
   * @param {number} row
   * @param {number} colStart
   * @param {number} colEnd
   * @param {boolean} [color]
   * @param {boolean} [isutf8]
   * @param {boolean} [reset]
   * @param {TermChar[][]} [lines]
   * @returns {string}
   */
  getText(row, colStart, colEnd, color, isutf8, reset, lines) {
    if (typeof row !== 'number' || !Number.isFinite(row) || row < 0 || row >= this.rows) return '';
    const srcLines = Array.isArray(lines) ? lines : this.lines;
    const text = srcLines[row];
    if (!text) return '';

    let start = (typeof colStart === 'number' && Number.isFinite(colStart)) ? Math.floor(colStart) : 0;
    let end = (typeof colEnd === 'number' && Number.isFinite(colEnd)) ? Math.floor(colEnd) : this.cols;
    start = Math.max(0, Math.min(this.cols, start));
    end = Math.max(0, Math.min(this.cols, end));

    if (start === this.cols) return '';

    if (start > 0) {
      if (text[start] && (text[start].isDBCSTrail || text[start].ch === '') && text[start - 1] && text[start - 1].isDBCSLead) start--;
      else if (text[start] && !text[start].isDBCSLead && text[start - 1] && text[start - 1].isDBCSLead) start--;
    } else {
      start = 0;
    }

    if (end > 0 && end < this.cols) {
      if (text[end - 1] && text[end - 1].isDBCSLead) end++;
    } else if (end >= this.cols) {
      end = this.cols;
    }

    if (start >= end) return '';

    if (!this.view) return '';

    const charset = this.view.charset;

    // generate texts with ansi color
    if (color) {
      let output = this.ansiCmp(TermChar.newChar, text[start], reset);
      for (let col = start; col < end - 1; ++col) {
        if (!text[col] || !text[col + 1]) continue;
        if (text[col].isDBCSLead && this.ansiCmp(text[col], text[col + 1]))
          output += this.ansiCmp(text[col], text[col + 1]).replace(/m$/g, ';50m') + text[col].ch;
        else
          output += text[col].ch + this.ansiCmp(text[col], text[col + 1]);
      }
      if (text[end - 1]) output += text[end - 1].ch + this.ansiCmp(text[end - 1], TermChar.newChar);
      return output;
    }

    const sliced = text.slice(start, end);
    return sliced.map((c) => {
      if (!c) return ' ';
      if (c.isDBCSTrail || c.ch === '') {
        return '';
      }
      return c.ch;
    }).join('');
  }

  /**
   * @param {number} row
   * @param {number} colStart
   * @param {number} colEnd
   * @param {TermChar[][]} [lines]
   * @returns {string}
   */
  getRowText(row, colStart, colEnd, lines) {
    if (typeof row !== 'number' || !Number.isFinite(row) || row < 0 || row >= this.rows) return '';
    const srcLines = Array.isArray(lines) ? lines : this.lines;
    const text = srcLines[row];
    if (!text) return '';

    let start = (typeof colStart === 'number' && Number.isFinite(colStart)) ? Math.floor(colStart) : 0;
    let end = (typeof colEnd === 'number' && Number.isFinite(colEnd)) ? Math.floor(colEnd) : this.cols;
    start = Math.max(0, Math.min(this.cols, start));
    end = Math.max(0, Math.min(this.cols, end));

    if (start > 0) {
      if (text[start] && (text[start].isDBCSTrail || text[start].ch === '') && text[start - 1] && text[start - 1].isDBCSLead) start--;
      else if (text[start] && !text[start].isDBCSLead && text[start - 1] && text[start - 1].isDBCSLead) start--;
    } else {
      start = 0;
    }

    if (end < this.cols) {
      if (text[end] && (text[end].isDBCSTrail || text[end].ch === '') && text[end - 1] && text[end - 1].isDBCSLead) end++;
    } else {
      end = this.cols;
    }

    if (start >= end) return '';

    const sliced = text.slice(start, end);
    return sliced.map((c) => {
      if (!c) return ' ';
      if (c.isDBCSTrail || c.ch === '') {
        return '';
      }
      return c.ch;
    }).join('');
  }

  /**
   * @param {TermChar} preChar
   * @param {TermChar} thisChar
   * @param {boolean} [forceReset]
   * @returns {string}
   */
  ansiCmp(preChar, thisChar, forceReset) {
    if (!preChar || !thisChar) return '';
    let text = '';
    let reset = forceReset;
    if ((preChar.bright && !thisChar.bright) ||
        (preChar.underLine && !thisChar.underLine) ||
        (preChar.blink && !thisChar.blink) ||
        (preChar.invert && !thisChar.invert)) reset = true;
    if (reset) text = ';';
    if ((reset || !preChar.bright) && thisChar.bright) text += '1;';
    if ((reset || !preChar.underLine) && thisChar.underLine) text += '4;';
    if ((reset || !preChar.blink) && thisChar.blink) text += '5;';
    if ((reset || !preChar.invert) && thisChar.invert) text += '7;';
    const DeFg = TermChar.defaultFg;
    const DeBg = TermChar.defaultBg;
    const thisFg = (thisChar.fg == -1) ? DeFg : thisChar.fg;
    const preFg = (preChar.fg == -1) ? DeFg : preChar.fg;
    const thisBg = (thisChar.bg == -1) ? DeBg : thisChar.bg;
    const preBg = (preChar.bg == -1) ? DeBg : preChar.bg;
    if (reset ? (thisFg != DeFg) : (preFg != thisFg))
      text += '3' + thisFg + ';';
    if (reset ? (thisBg != DeBg) : (preBg != thisBg))
      text += '4' + thisBg + ';';
    if (!text) return '';
    else return ('\x1b[' + text.slice(0, -1) + 'm');
  }

  /**
   * @param {string} str
   * @returns {boolean}
   */
  isFullWidth(str) {
    if (typeof str !== 'string' || str.length === 0) return false;
    const code = str.charCodeAt(0);
    if (code <= 0x7f) return false;
    if ((code >= 0x1100 && code <= 0x115f) || 
        (code >= 0x2329 && code <= 0x232a) || 
        (code >= 0x2000 && code <= 0x243f) || // General punctuation, arrows, math, enclosed alphanumerics
        (code >= 0x2500 && code <= 0x27bf) || // Box drawing, blocks, geometric shapes, misc symbols
        (code >= 0x2e80 && code <= 0xa4cf) || // CJK radicals, CJK symbols/punctuation, ideographs
        (code >= 0xac00 && code <= 0xd7a3) || // Hangul
        (code >= 0xe000 && code <= 0xf8ff) || // UAO Private Use Area
        (code >= 0xf900 && code <= 0xfaff) || // CJK Compatibility
        (code >= 0xfe10 && code <= 0xfe6f) || // CJK compatibility forms
        (code >= 0xff00 && code <= 0xff60) || // Fullwidth Forms
        (code >= 0xffe0 && code <= 0xffe6) || // Fullwidth signs
        (code >= 0x0370 && code <= 0x04ff) || // Greek, Cyrillic
        (code >= 0x3000 && code <= 0x303f) || // CJK symbols and punctuation
        isForceWidthCode(code) ||
        (u2bTable && u2bTable[code] > 0)) {
      return true;
    }
    if ((this.view && this.view.charset !== 'UTF-8') || this.forceFullWidth) {
      return true;
    }
    return false;
  }

  /**
   * @param {number} row
   * @returns {boolean}
   */
  isTextWrappedRow(row) {
    if (typeof row !== 'number' || !Number.isFinite(row) || row < 0 || row >= this.rows) return false;
    const line = this.lines[row];
    if (!line) return false;
    for (const col of [78, 77]) {
      const ch = line[col];
      if (ch && ch.ch === '\\' && ch.fg == 7 && ch.bg === 0 && ch.bright) {
        return true;
      }
    }
    return false;
  }

  setPageState() {
    const site = this.site;
    if (!site) return;
    let lastRowNum = site.getLastRowNum(this);
    let cols = this.cols;
    const lastRowText = this.getRowText(lastRowNum, 0, cols);
    if (site.isEditingScreen(this)) {
      this.pageState = 6;
      return;
    }

    if (site.parseReadingStatus(lastRowText, this)) {
      this.pageState = 3; // READING
      return;
    }

    if (site.isMenuScreen(this)) {
      this.pageState = 1; // MENU
      return;
    }

    if (site.isListScreen(this)) {
      this.pageState = 2; // LIST
      return;
    }

    if (lastRowText.trim()) {
      console.debug('[setPageState] site=' + site.name + ', state=' + this.pageState + ', lastRow=' + JSON.stringify(lastRowText));
    }

    if (site.isPassScreen(this)) {
      //console.log('pageState = 5 (PASS)');
      this.pageState = 5; // some ansi drawing screen to pass
      return;
    }
    if (this.pageState != 1 && this.isLineEmpty(lastRowNum)) {
      //console.log('pageState = 0 (NORMAL)');
      this.pageState = 0;
    }
  }

  /**
   * @param {number} lineindex
   * @param {number} start
   * @param {number} end
   * @returns {boolean}
   */
  isUnicolor(lineindex, start, end) {
    if (typeof lineindex !== 'number' || !Number.isFinite(lineindex) || lineindex < 0 || lineindex >= this.rows) return false;
    const lines = this.lines;
    const line = lines[lineindex];
    if (!line) return false;
    const s = Math.max(0, Math.min(this.cols, (typeof start === 'number' && Number.isFinite(start)) ? Math.floor(start) : 0));
    const e = Math.max(0, Math.min(this.cols, (typeof end === 'number' && Number.isFinite(end)) ? Math.floor(end) : this.cols));
    if (s >= e || !line[s]) return false;
    const clr = line[s].getBg();

    // a dirty hacking, because of the difference between maple and firebird bbs.
    for (let i = s; i < e; i++) {
      if (!line[i]) return false;
      const clr1 = line[i].getBg();
      if (clr1 != clr || clr1 === 0)
        return false;
    }
    return true;
  }

  /**
   * @param {number} iLine
   * @returns {boolean}
   */
  isLineEmpty(iLine) {
    if (typeof iLine !== 'number' || !Number.isFinite(iLine) || iLine < 0 || iLine >= this.rows) return true;
    const lines = this.lines;
    const line = lines[iLine];
    if (!line) return true;

    for (let col = 0; col < this.cols; col++) {
      const ch = line[col];
      if (ch && (ch.ch != ' ' || ch.getBg()))
        return false;
    }
    return true;
  }

  /**
   * @param {number} trow
   * @param {number} tcol
   * @param {number} lastRowNum
   * @param {number} cols
   */
  _calcListRowMouseCursor(trow, tcol, lastRowNum, cols) {
    if ( tcol <= 6 ) {
      this.clearHighlight();
      this.mouseCursor = 1;
    } else if ( tcol >= cols-16 ) {
      this.clearHighlight();
      if ( trow > (lastRowNum + 1) / 2 )
        this.mouseCursor = 3;
      else
        this.mouseCursor = 2;
    } else {
      if (!this.isLineEmpty(trow)) {
        this.mouseCursor = 6;
        this.nowHighlight = trow;
      } else {
        this.mouseCursor = 11;
      }
    }
  }

  /**
   * @param {number} tcol
   * @param {number} trow
   * @param {boolean} [doRefresh]
   */
  onMouse_move(tcol, trow, doRefresh) {
    tcol = (typeof tcol === 'number' && Number.isFinite(tcol)) ? Math.floor(tcol) : 0;
    trow = (typeof trow === 'number' && Number.isFinite(trow)) ? Math.floor(trow) : 0;
    this.tempMouseCol = tcol;
    this.tempMouseRow = trow;

    if (this.nowHighlight != trow || doRefresh) {
      this.clearHighlight();
    }

    let lastRowNum = this.site
      ? this.site.getLastRowNum(this)
      : this.rows - 1;
    let cols = this.cols;

    switch( this.pageState ) {
    case 0: //NORMAL
      //SetCursor(m_ArrowCursor);
      //m_CursorState = 0;
      this.mouseCursor = 0;
      break;

    case 4: //LIST
      if (trow>1 && trow < lastRowNum-1) {              //m_pTermData->m_RowsPerPage-1
        this._calcListRowMouseCursor(trow, tcol, lastRowNum, cols);
      } else if ( trow == 1 || trow == 2 ) {
        this.mouseCursor = 2;
      } else if ( trow === 0 ) {
        this.mouseCursor = 4;
      } else { // trow == lastRowNum
        this.mouseCursor = 5;
      }
      break;

    case 2: //LIST
      if (trow > 2 && trow < lastRowNum) {              //m_pTermData->m_RowsPerPage-1
        this._calcListRowMouseCursor(trow, tcol, lastRowNum, cols);
      } else if ( trow == 1 || trow == 2 ) {
        if ( tcol < 2 )//[
          this.mouseCursor = 8;
        else if ( tcol > cols-5 )//]
          this.mouseCursor = 9;
        else
          this.mouseCursor = 2;
      } else if ( trow === 0 ) {
        if ( tcol < 2 )//=
          this.mouseCursor = 10;
        else if ( tcol > cols-5 )//]
          this.mouseCursor = 9;
        else
          this.mouseCursor = 4;
      } else { // trow == lastRowNum
        if ( tcol < 2 )
          this.mouseCursor = 12;
        else if ( tcol > cols-5 )
          this.mouseCursor = 13;
        else
          this.mouseCursor = 5;
      }
      break;

    case 3: //READING
      if ( trow == lastRowNum) {
        if ( tcol < 2 )//]
          this.mouseCursor = 12;
        else if ( tcol > cols-5 )
          this.mouseCursor = 14;
        else
          this.mouseCursor = 5;
      } else if ( trow === 0 || trow == 1 || trow == 2 ) {
        if (tcol < 2)
          this.mouseCursor = trow === 0 ? 10 : 8;
        else if ( tcol > cols-5 )//]
          this.mouseCursor = 9;
        else if ( tcol < 7 )
          this.mouseCursor = 1;
        else
          this.mouseCursor = 2;
      } else if ( tcol < 7 )
        this.mouseCursor = 1;
      else if ( trow < (lastRowNum + 1) / 2 )
        this.mouseCursor = 2;
      else
        this.mouseCursor = 3;
      break;

    case 1: //MENU
      if ( trow>0 && trow < lastRowNum ) {
        if (tcol > 7)
          this.mouseCursor = 7;
        else
          this.mouseCursor = 1;
      } else {
        this.mouseCursor = 0;
        //SetCursor(m_ArrowCursor);m_CursorState=0;
      }
      break;

    default:
      this.mouseCursor = 0;
      break;
    }

    if (this.BBSWin && this.BBSWin.style) {
      this.BBSWin.style.cursor = mouseCursorMap[this.mouseCursor];
    }
  }

  resetMousePos() {
    if (this.useMouseBrowsing) {
      this.onMouse_move(this.tempMouseCol, this.tempMouseRow, true);
    }
  }

  /**
   * @param {number} row
   */
  setHighlight(row) {
    const validRow = (typeof row === 'number' && Number.isFinite(row)) ? Math.floor(row) : -1;
    this._nowHighlight = validRow;
    if (this.view && typeof this.view.setHighlightedRow === 'function') {
      this.view.setHighlightedRow(validRow);
    }
  }

  clearHighlight() {
    this.nowHighlight = -1;
    this.mouseCursor = 0;
  }

  /**
   * @param {{ site?: string, conn?: string }} [part]
   */
  setTitle(part) {
    if (part && typeof part === 'object') {
      if (typeof part.site === 'string') {
        this.titleSite = part.site;
      }
      if (typeof part.conn === 'string') {
        this.titleConn = part.conn;
      }
    }
    let title = typeof this.titleBase === 'string' ? this.titleBase : 'PTT Chrome';
    if (this.dynamicTitle) {
      if (this.titleSite) {
        title += ' - ' + this.titleSite;
      }
      if (this.titleConn) {
        title += ' - ' + this.titleConn;
      }
    }
    this.title = title;
    if (typeof document !== 'undefined') {
      document.title = title;
    }
  }

}
