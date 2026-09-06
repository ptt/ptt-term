// Terminal Screen Buffer, displayed by TermView

import { Event } from './event';
import { ColorState } from './term_ui';
import { u2b, b2u } from './string_util';
import { getSite } from './sites';

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
  `url(${require('../cursor/back.png')}) 0 6,auto`,      // 1
  `url(${require('../cursor/pageup.png')}) 6 0,auto`,    // 2
  `url(${require('../cursor/pagedown.png')}) 6 21,auto`, // 3
  `url(${require('../cursor/home.png')}) 0 0,auto`,      // 4
  `url(${require('../cursor/end.png')}) 0 0,auto`,       // 5
  'pointer',                                             // 6
  'default',                                             // 7
  `url(${require('../cursor/prevous.png')}) 6 0,auto`,   // 8
  `url(${require('../cursor/next.png')}) 6 0,auto`,      // 9
  `url(${require('../cursor/first.png')}) 0 0,auto`,     // 10
  'auto',                                                // 11
  `url(${require('../cursor/refresh.png')}) 0 0,auto`,   // 12
  `url(${require('../cursor/last.png')}) 0 0,auto`,      // 13
  `url(${require('../cursor/last.png')}) 0 0,auto`       // 14
];

export class TermChar {
  static defaultFg = 7;
  static defaultBg = 0;

  constructor(ch) {
    this.ch = ch;
    this.resetAttr();
    this.needUpdate = false;
    this.isLeadByte = false;
    this.startOfURL = false;
    this.endOfURL = false;
    this.partOfURL = false;
    this.partOfKeyWord = false;
    this.keyWordColor = '#ff0000';
    this.fullurl = '';
  }

  assignParams(params) {
    params.forEach(v => {    
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
    this.ch = TermChar.newChar.ch;
    this.isLeadByte = TermChar.newChar.isLeadByte;
    this.resetAttr();
  }

  copyAttr(attr) {
    this.fg = attr.fg;
    this.bg = attr.bg;
    this.bright = attr.bright;
    this.invert = attr.invert;
    this.blink = attr.blink;
    this.underLine = attr.underLine;
  }

  resetAttr() {
    this.fg = 7;
    this.bg = 0;
    this.bright = false;
    this.invert = false;
    this.blink = false;
    this.underLine = false;
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
  uriRegEx = /((ftp|http|https|telnet):\/\/([A-Za-z0-9_]+:{0,1}[A-Za-z0-9_]*@)?([A-Za-z0-9_#!:.?+=&%@!\-\/\$\^,;|*~'()]+)(:[0-9]+)?(\/|\/([A-Za-z0-9_#!:.?+=&%@!\-\/]))?)|(pid:\/\/(\d{1,10}))/ig;

  constructor(cols, rows) {
    super();
    this.cols = cols;
    this.rows = rows;
    this.view = null;
    this.cur_x = 0;
    this.cur_y = 0;
    this.cur_x_sav = -1;
    this.cur_y_sav = -1;
    this.scrollStart = 0;
    this.scrollEnd = rows-1;
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
    this.pageState = 0;
    this.forceFullWidth = false;

    this.startedEasyReading = false;
    this.easyReadingShowReplyText = false;
    this.easyReadingShowPushInitText = false;
    this.prevPageState = 0;
    this.site = getSite(process.env.SITE_TYPE || 'auto');

    this.lines = new Array(rows);

    this.pageLines = [];
    this.pageWrappedLines = [];

    this.lineChangeds = new Array(rows);

    this.viewBufferTimer = 30;

    let r = rows;
    while (--r >= 0) {
      const line = new Array(cols);
      let c = cols;
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


  resize(cols, rows) {
    if (this.site) {
      const clamped = this.site.clampTermSize(cols, rows);
      cols = clamped.cols;
      rows = clamped.rows;
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
  }



  setView(view) {
    this.view = view;
  }

  assignParamsToAttrs(params) {
    this.attr.assignParams(params)
  }

  puts(str) {
    if (!str)
      return;
    const cols = this.cols;
    const rows = this.rows;
    const lines = this.lines;
    const n = str.length;
    let line = lines[this.cur_y];
    for (let i = 0; i < n; ++i) {
      const ch = str[i];
      switch (ch) {
      case '\x07':
        // FIXME: beep (1)Sound (2)AlertNotification (3)change icon
        // should only play sound
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
        continue;
      case '\0':
          continue;
      }
      //if( ch < ' ')
      //    //dump('Unhandled invisible char' + ch.charCodeAt(0)+ '\n');

      if (this.cur_x >= cols) {
        // next line
        if(!this.disableLinefeed) this.lineFeed();
        this.cur_x=0;
        line = lines[this.cur_y];
        this.posChanged=true;
      }

      switch (ch) {
      case '\t':
        this.tab();
        break;
      default: {
        let ch2 = line[this.cur_x];
        ch2.ch=ch;
        ch2.copyAttr(this.attr);
        ch2.needUpdate=true;
        ++this.cur_x;
        if (ch2.isLeadByte && this.cur_x < cols) // previous state before this function
          line[this.cur_x].needUpdate=true;
        if (this.view.charset == 'UTF-8' && this.isFullWidth(ch) && this.cur_x < cols) {
          ch2 = line[this.cur_x];
          ch2.ch = '';
          ch2.copyAttr(this.attr);
          ch2.needUpdate = true;
          ++this.cur_x;
          // assume server will handle mouse moving on full-width char
        }
        this.changed = true;
        this.posChanged = true;
        break;
      }
      }
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
        // all chars > ASCII code are regarded as lead byte of DBCS.
        // FIXME: this is not correct, but works most of the times.
        if ( this.isFullWidth(ch.ch) && (col + 1) < cols ) {
          ch.isLeadByte = true;
          ++col;
          const ch0 = ch;
          ch = line[col];
          if (ch.needUpdate)
            needUpdate = true;
          // ensure simutaneous redraw of both bytes
          if ( ch0.needUpdate != ch.needUpdate ) {
            ch0.needUpdate = ch.needUpdate = true;
          }
        } else if (ch.isLeadByte && (col+1) < cols) {
          const ch2 = line[col+1];
          ch2.needUpdate = true;
        }
        ch.isLeadByte = false;
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
        for (let col = 0; col < cols; ++col)
            s += line[col].ch;
        if (this.view.charset != 'UTF-8')
          s = s.replace(/[^\x00-\x7f]./g,'\xab\xcd');
        else {
          let str = '';
          for (let i = 0; i < s.length; ++i) {
            str += s.charAt(i);
            if (this.isFullWidth(s.charAt(i)))
              str += s.charAt(i);
          }
          s = str;
        }
        let res;
        let uris = null;
        // pairs of URI start and end positions are stored in line.uri.
        while ( (res = this.uriRegEx.exec(s)) !== null ) {
          if (!uris)   uris = [];
          const uri = [res.index, res.index+res[0].length];
          uris.push(uri);
          // dump('found URI: ' + res[0] + '\n');
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
            let u;
            if (this.view.charset != 'UTF-8')
              u = urlTemp;//this.conv.convertStringToUTF8(urlTemp, this.view.charset,  true);
            else {
              let str = '';
              for (let i = 0; i < urlTemp.length; ++i) {
                str += urlTemp.charAt(i);
                if (this.isFullWidth(urlTemp.charAt(i)))
                  str += urlTemp.charAt(i);
              }
              u = str;
            }
            const urlTemp2 = urlTemp.toLowerCase();
            line[uri[0]].startOfURL = true;
            if (urlTemp2.substr(0,6) == 'pid://') {
              line[uri[0]].fullurl='http://www.pixiv.net/member_illust.php?mode=big&illust_id='+urlTemp2.substr(6,15);
            } else {
              line[uri[0]].fullurl = u;
            }
            line[uri[1]-1].endOfURL = true;
          }
        }
        //
      }
    }
  }

  clear(param) {
    let rows = this.rows;
    const cols = this.cols;
    const lines = this.lines;

    switch (param) {
    case 0: {
      const line = lines[this.cur_y];
      for (let col = this.cur_x; col < cols; ++col) {
        line[col].copyFromNewChar();
        line[col].needUpdate = true;
      }
      for (let row = this.cur_y; row < rows; ++row) {
        const curLine = lines[row];
        for (let col = 0; col < cols; ++col) {
          curLine[col].copyFromNewChar();
          curLine[col].needUpdate = true;
        }
      }
      break;
    }
    case 1: {
      for (let row = 0; row < this.cur_y; ++row) {
        const curLine = lines[row];
        for (let col = 0; col < cols; ++col) {
          curLine[col].copyFromNewChar();
          curLine[col].needUpdate = true;
        }
      }
      const line = lines[this.cur_y];
      for (let col = 0; col < this.cur_x; ++col) {
        line[col].copyFromNewChar();
        line[col].needUpdate = true;
      }
      break;
    }
    case 2:
      while (--rows >= 0) {
        let col = cols;
        const line = lines[rows];
        while (--col >= 0) {
          line[col].copyFromNewChar();
          line[col].needUpdate = true;
        }
      }
      break;
    }
    this.changed = true;
    this.gotoPos(0, 0);
    this.queueUpdate();
  }

  back() {
    if (this.cur_x > 0) {
      --this.cur_x;
      this.posChanged = true;
      this.queueUpdate();
    }
  }

  tab(param) {
    const mod = this.cur_x % 4;
    this.cur_x += 4 - mod;
    if (param > 1) this.cur_x += 4 * (param-1);
    if (this.cur_x >= this.cols)
      this.cur_x = this.cols-1;
    this.posChanged = true;
    this.queueUpdate();
  }

  backTab(param) {
    const mod = this.cur_x % 4;
    this.cur_x -= (mod > 0 ? mod : 4);
    if (param > 1) this.cur_x -= 4 * (param-1);
    if (this.cur_x < 0)
      this.cur_x = 0;
    this.posChanged = true;
    this.queueUpdate();
  }

  insert(param) {
    const line = this.lines[this.cur_y];
    const cols = this.cols;
    let cur_x = this.cur_x;
    if (cur_x > 0 && line[cur_x-1].isLeadByte) ++cur_x;
    if (cur_x == cols) return;
    if (cur_x + param >= cols) {
      for(let col = cur_x; col < cols; ++col) {
        line[col].copyFromNewChar();
        line[col].needUpdate = true;
      }
    } else {
      while (--param >= 0) {
        const ch = line.pop();
        line.splice(cur_x, 0, ch);
        ch.copyFromNewChar();
      }
      for (let col = cur_x; col < cols; ++col)
        line[col].needUpdate = true;
    }
    this.changed = true;
    this.queueUpdate();
  }

  del(param) {
    const line = this.lines[this.cur_y];
    const cols = this.cols;
    let cur_x = this.cur_x;
    if (cur_x > 0 && line[cur_x-1].isLeadByte) ++cur_x;
    if (cur_x == cols) return;
    if (cur_x + param >= cols) {
      for (let col = cur_x; col < cols; ++col) {
        line[col].copyFromNewChar();
        line[col].needUpdate = true;
      }
    } else {
      let n = cols - cur_x - param;
      while (--n >= 0)
        line.splice(cur_x, 0, line.pop());
      for (let col = cols - param; col < cols; ++col)
        line[col].copyFromNewChar();
      for (let col = cur_x; col < cols; ++col)
        line[col].needUpdate = true;
    }
    this.changed = true;
    this.queueUpdate();
  }

  eraseChar(param) {
    const line = this.lines[this.cur_y];
    const cols = this.cols;
    let cur_x = this.cur_x;
    if (cur_x > 0 && line[cur_x-1].isLeadByte) ++cur_x;
    if (cur_x == cols) return;
    const n = (cur_x + param > cols) ? cols : cur_x + param;
    for (let col = cur_x; col < n; ++col) {
      line[col].copyFromNewChar();
      line[col].needUpdate = true;
    }
    this.changed = true;
    this.queueUpdate();
  }

  eraseLine(param) {
    const line = this.lines[this.cur_y];
    const cols = this.cols;
    switch (param) {
    case 0: // erase to rigth
      for (let col = this.cur_x; col < cols; ++col) {
        line[col].copyFromNewChar();
        line[col].needUpdate = true;
      }
      break;
    case 1: { //erase to left
      const cur_x = this.cur_x;
      for (let col = 0; col < cur_x; ++col) {
        line[col].copyFromNewChar();
        line[col].needUpdate=true;
      }
      break;
    }
    case 2: //erase all
      for (let col = 0; col < cols; ++col) {
        line[col].copyFromNewChar();
        line[col].needUpdate = true;
      }
      break;
    default:
      return;
    }
    this.changed = true;
    this.queueUpdate();
  }

  deleteLine(param) {
    const scrollStart = this.scrollStart;
    this.scrollStart = this.cur_y;
    this.scroll(false, param);
    this.scrollStart = scrollStart;
    this.changed = true;
    this.queueUpdate();
  }

  insertLine(param) {
    const scrollStart = this.scrollStart;
    if (this.cur_y < this.scrollEnd) {
      this.scrollStart=this.cur_y;
      this.scroll(true, param);
    }
    this.scrollStart = scrollStart;
    this.changed = true;
    this.queueUpdate();
  }

  scroll(up, n) {
    let scrollStart = this.scrollStart;
    let scrollEnd = this.scrollEnd;
    if(scrollEnd<=scrollStart) {
      scrollStart=0;
      if(scrollEnd<1) scrollEnd=this.rows-1;
    }
    if(n>=this.rows) // scroll more than 1 page = clear
      this.clear(2);
    else if(n >= scrollEnd-scrollStart+1) {
      const lines = this.lines;
      const cols = this.cols;
      for(let row=scrollStart; row <= scrollEnd; ++row) {
        for(let col=0; col< cols; ++col) {
          lines[row][col].copyFromNewChar();
          lines[row][col].needUpdate=true;
        }
      }
    } else {
      const lines = this.lines;
      const rows = this.rows;
      const cols = this.cols;

      if (up) { // move lines down
        for (let i = 0; i < rows-1-scrollEnd; ++i)
          lines.unshift(lines.pop());
        while (--n >= 0) {
          const line = lines.pop();
          lines.splice(rows-1-scrollEnd+scrollStart, 0, line);
          for (let col = 0; col < cols; ++col)
            line[col].copyFromNewChar();
        }
        for (let i = 0; i < rows-1-scrollEnd; ++i)
          lines.push(lines.shift());
      } else { // move lines up
        for (let i = 0; i < scrollStart; ++i)
          lines.push(lines.shift());
        while (--n >= 0) {
          const line = lines.shift();
          lines.splice(scrollEnd-scrollStart, 0, line);
          for (let col = 0; col < cols; ++col) // clear the line
            line[col].copyFromNewChar();
        }
        for (let i = 0; i < scrollStart; ++i)
          lines.unshift(lines.pop());
      }

      // update the whole screen within scroll region
      for (let row = scrollStart; row <= scrollEnd; ++row) {
        const line = lines[row];
        for (let col = 0; col < cols; ++col) {
          line[col].needUpdate = true;
        }
      }
    }
    this.changed = true;
    this.queueUpdate();
  }

  gotoPos(x,y) {
    // dump('gotoPos: ' + x + ', ' + y + '\n');
    if (x >= this.cols) x = this.cols-1;
    if (y >= this.rows) y = this.rows-1;
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    this.cur_x = x;
    this.cur_y = y;
    this.posChanged = true;
    this.queueUpdate();
  }

  carriageReturn() {
    this.cur_x = 0;
    this.posChanged = true;
    this.queueUpdate();
  }

  lineFeed() {
    if (this.cur_y < this.scrollEnd) {
      ++this.cur_y;
      this.posChanged = true;
      this.queueUpdate();
    } else { // at bottom of screen
      this.scroll(false, 1);
    }
  }

  queueUpdate(directupdate) {
    if (this.timerUpdate)
      return;

    const func = () => {
      this.notify();
    };
    if (directupdate)
      this.timerUpdate = setTimeout(func, 1);
    else
      this.timerUpdate = setTimeout(func, 30);
  }

  notify(timer) {
    clearTimeout(this.timerUpdate);
    this.timerUpdate = null;

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

  getText(row, colStart, colEnd, color, isutf8, reset, lines) {
    let text = lines ? lines[row] : this.lines[row];
    // always start from leadByte, and end at second-byte of DBCS.
    // Note: this might change colStart and colEnd. But currently we don't return these changes.
    if (colStart == this.cols) return '';

    if ( colStart > 0 ) {
      if ( !text[colStart].isLeadByte && text[colStart-1].isLeadByte ) colStart--;
    } else colStart = 0;

    if ( colEnd > 0 ){
      if ( text[colEnd-1].isLeadByte ) colEnd++;
    } else colEnd = this.cols;

    if (colStart >= colEnd) return '';

    if (!this.view) return;

    const charset = this.view.charset;

    // generate texts with ansi color
    if (color) {
      let output = this.ansiCmp(TermChar.newChar, text[colStart], reset);
      for (let col = colStart; col < colEnd-1; ++col) {
        if (isutf8 && text[col].isLeadByte && this.ansiCmp(text[col], text[col+1]))
          output += this.ansiCmp(text[col], text[col+1]).replace(/m$/g, ';50m') + text[col].ch;
        else
          output += text[col].ch + this.ansiCmp(text[col], text[col+1]);
      }
      output += text[colEnd-1].ch + this.ansiCmp(text[colEnd-1], TermChar.newChar);
      return (isutf8 && charset != 'UTF-8' ? b2u(output) : output);
    }

    text = text.slice(colStart, colEnd);
    return text.map((c, col, line) => {
      if (!c.isLeadByte) {
        if (col >=1 && line[col-1].isLeadByte) { // second byte of DBCS char
          const prevC = line[col-1];
          const b5 = prevC.ch + c.ch;
          if (this.view.charset == 'UTF-8' || b5.length == 1)
            return b5;
          else
            return b2u(b5);
        } else
          return c.ch;
      }
    }).join('');
  }

  getRowText(row, colStart, colEnd, lines) {

    let text = lines ? lines[row] : this.lines[row];
    // always start from leadByte, and end at second-byte of DBCS.
    // Note: this might change colStart and colEnd. But currently we don't return these changes.
    if ( colStart > 0 ){
      if ( !text[colStart].isLeadByte && text[colStart-1].isLeadByte ) colStart--;
    } else colStart = 0;

    if ( colEnd < this.cols ){
      if ( text[colEnd].isLeadByte ) colEnd++;
    } else colEnd = this.cols;

    text = text.slice(colStart, colEnd);
    return text.map((c, col, line) => {
      if (!c.isLeadByte) {
        if (col >= 1 && line[col-1].isLeadByte) { // second byte of DBCS char
          const prevC = line[col-1];
          const b5 = prevC.ch + c.ch;
          if (this.view.charset == 'UTF-8' || b5.length == 1)
            return b5;
          else
            return b2u(b5);
        } else
          return c.ch;
      }
    }).join('');

  }

  ansiCmp(preChar, thisChar, forceReset) {
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
    else return ('\x1b[' + text.substr(0,text.length-1) + 'm');
  }

  isFullWidth(str) {
    const code = str.charCodeAt(0);
    if (this.view.charset != 'UTF-8' || this.forceFullWidth) { // PTT support
      if (code > 0x7f) return true;
      else return false;
    }
    if ((code >= 0x1100 && code <= 0x115f) || 
        (code >= 0x2329 && code <= 0x232a) || 
        (code >= 0x2e80 && code <= 0x303e) || 
        (code >= 0x3040 && code <= 0xa4cf) || 
        (code >= 0xac00 && code <= 0xd7a3) || 
        (code >= 0xf900 && code <= 0xfaff) || 
        (code >= 0xfe30 && code <= 0xfe6f) || 
        (code >= 0xff00 && code <= 0xff60) || 
        (code >= 0xffe0 && code <= 0xffe6)) {
      return true;
    } else {
      return false;
    }
  }

  isTextWrappedRow(row) {
    // determine whether it is wrapped by looking for the ending "\"
    const rowText = this.getRowText(row, 0, this.cols);
    const slashIndex = rowText.lastIndexOf('\\');
    if (slashIndex > 0 ) {
      const col = u2b(rowText.substr(0, slashIndex)).length;
      if (col != 77 && col != 78) return false;
      // check the color
      const ch = this.lines[row][col];
      if (ch.fg == 7 && ch.bg === 0 && ch.bright)
        return true;
    }
    return false;
  }

  setPageState() {
    const site = this.site;
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

  isUnicolor(lineindex, start, end) {
    const lines = this.lines;
    const line = lines[lineindex];
    const clr = line[start].getBg();

    // a dirty hacking, because of the difference between maple and firebird bbs.
    for (let i = start; i < end; i++) {
      const clr1 = line[i].getBg();
      if (clr1 != clr || clr1 === 0)
        return false;
    }
    return true;
  }

  isLineEmpty(iLine) {
    const lines = this.lines;
    const line = lines[iLine];

    for (let col = 0; col < this.cols; col++)
      if (line[col].ch != ' ' || line[col].getBg())
        return false;
    return true;
  }

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

  onMouse_move(tcol, trow, doRefresh) {
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

    this.BBSWin.style.cursor = mouseCursorMap[this.mouseCursor];
  }

  resetMousePos() {
    if (this.useMouseBrowsing) {
      this.onMouse_move(this.tempMouseCol, this.tempMouseRow, true);
    }
  }

  setHighlight(row) {
    this._nowHighlight = row;
    this.view.setHighlightedRow(row);
  }

  clearHighlight() {
    this.nowHighlight = -1;
    this.mouseCursor = 0;
  }

  setTitle(part) {
    if (part) {
      if (part.site !== undefined) {
        this.titleSite = part.site;
      }
      if (part.conn !== undefined) {
        this.titleConn = part.conn;
      }
    }
    let title = this.titleBase;
    if (this.dynamicTitle) {
      if (this.titleSite) {
        title += ' - ' + this.titleSite;
      }
      if (this.titleConn) {
        title += ' - ' + this.titleConn;
      }
    }
    document.title = this.title = title;
  }

}
