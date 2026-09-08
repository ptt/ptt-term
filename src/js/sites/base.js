export function parseWaterballRow(rowText) {
  if (typeof rowText !== 'string') return null;
  const text = rowText.trim();
  if (!text) return null;

  if (text.startsWith('★')) {
    const starMatch = /^★\s*([A-Za-z0-9_]{1,12})?\s*[:：]?\s*(.*)$/.exec(text);
    if (starMatch) {
      const userId = starMatch[1];
      const message = starMatch[2].trim();
      if (userId) {
        return { userId, message };
      }
      if (message) {
        return { message };
      }
    }
    return null;
  }

  const pagerMatch = /^([\[【]呼叫(?:器)?[\]】]\s*[:：]?\s*.+)$/.exec(text);
  if (pagerMatch) {
    return { message: pagerMatch[1].trim() };
  }

  return null;
}

import { CHARSETS } from '../conv.js';
export { CHARSETS };

export class BaseSite {
  constructor(name = 'base', charset = CHARSETS.BIG5) {
    this.name = name;
    this.charset = charset;
    this.fixed_last_row = null;
    this.max_rows = null;
    this.max_cols = null;
  }

  set charset(val) {
    if (typeof val === 'string') {
      const lower = val.toLowerCase();
      if (lower === 'utf-8' || lower === 'utf8') {
        this._charset = CHARSETS.UTF8;
        return;
      }
      if (lower === 'big5') {
        this._charset = CHARSETS.BIG5;
        return;
      }
    }
    this._charset = val || CHARSETS.BIG5;
  }

  get charset() {
    return this._charset || CHARSETS.BIG5;
  }

  get isUtf8() {
    return this.charset === CHARSETS.UTF8;
  }

  /**
   * Clamp terminal size to site limits if specified.
   * @param {number} cols 
   * @param {number} rows 
   * @returns {{ cols: number, rows: number }}
   */
  clampTermSize(cols, rows) {
    let clampedCols = cols;
    let clampedRows = rows;
    if (this.max_rows !== null && this.max_rows !== undefined && rows > this.max_rows) {
      clampedRows = this.max_rows;
    }
    if (this.max_cols !== null && this.max_cols !== undefined && cols > this.max_cols) {
      clampedCols = this.max_cols;
    }
    if (clampedCols !== cols || clampedRows !== rows) {
      console.log(`[Site:${this.name}] Clamped terminal size from ${cols}x${rows} to ${clampedCols}x${clampedRows}`);
    }
    return { cols: clampedCols, rows: clampedRows };
  }

  /**
   * Get the effective status/last row number for this site.
   * @param {TermBuf} termBuf 
   * @returns {number} 0-based row index
   */
  getLastRowNum(termBuf) {
    if (this.fixed_last_row !== null && this.fixed_last_row !== undefined) {
      return Math.min(this.fixed_last_row, termBuf.rows - 1);
    }
    return termBuf.rows - 1;
  }

  /**
   * Determine if current terminal screen represents a board/article list (pageState = 2).
   * @param {TermBuf} termBuf 
   * @returns {boolean}
   */
  isListScreen(termBuf) {
    return false;
  }

  /**
   * Determine if current terminal screen represents a menu screen (pageState = 1).
   * @param {TermBuf} termBuf 
   * @returns {boolean}
   */
  isMenuScreen(termBuf) {
    return false;
  }

  /**
   * Determine if current terminal screen represents a pass/prompt screen (pageState = 5).
   * @param {TermBuf} termBuf 
   * @returns {boolean}
   */
  isPassScreen(termBuf) {
    let lastRowNum = this.getLastRowNum(termBuf);
    let cols = termBuf ? termBuf.cols : 80;
    let lastRowText = termBuf ? termBuf.getRowText(lastRowNum, 0, cols) : '';
    const regex = /(?:請\s*)?按\s*(?:任\s*意\s*鍵|空\s*白\s*鍵|[([]?Space(?:\/Return)?[)\]]?)\s*繼續/i;
    if (regex.test(lastRowText)) return true;
    if (termBuf && termBuf.rows > 24) {
      let row23Text = termBuf.getRowText(23, 0, cols);
      if (regex.test(row23Text)) return true;
    }
    return false;
  }

  /**
   * Check if current terminal screen is waiting for any key to continue.
   * @param {TermBuf} termBuf 
   * @returns {boolean}
   */
  isWaitingForAnyKey(termBuf) {
    return this.isPassScreen(termBuf);
  }

  /**
   * Handle mouse click when waiting for any key.
   * @param {TermBuf} termBuf 
   * @param {object} conn 
   * @returns {boolean} True if handled.
   */
  handlePassScreenClick(termBuf, conn) {
    if (this.isPassScreen(termBuf)) {
      if (conn) {
        conn.send(' ');
      }
      return true;
    }
    return false;
  }

  /**
   * Determine and update the terminal pageState based on screen content.
   * @param {TermBuf} termBuf
   * @returns {number}
   */
  setPageState(termBuf) {
    if (!termBuf) return 0;
    let lastRowNum = this.getLastRowNum(termBuf);
    let cols = termBuf.cols;
    const lastRowText = termBuf.getRowText(lastRowNum, 0, cols);
    if (this.isEditingScreen(termBuf)) {
      termBuf.pageState = 6;
      return 6;
    }

    if (this.parseReadingStatus(lastRowText, termBuf)) {
      termBuf.pageState = 3; // READING
      return 3;
    }

    if (this.isMenuScreen(termBuf)) {
      termBuf.pageState = 1; // MENU
      return 1;
    }

    if (this.isListScreen(termBuf)) {
      termBuf.pageState = 2; // LIST
      return 2;
    }

    if (lastRowText && lastRowText.trim()) {
      console.debug('[setPageState] site=' + this.name + ', state=' + termBuf.pageState + ', lastRow=' + JSON.stringify(lastRowText));
    }

    if (this.isPassScreen(termBuf)) {
      termBuf.pageState = 5; // PASS
      return 5;
    }
    if (termBuf.pageState != 1 && termBuf.isLineEmpty(lastRowNum)) {
      termBuf.pageState = 0; // NORMAL
      return 0;
    }
    return termBuf.pageState;
  }

  /**
   * Determine if current terminal screen represents an article editing screen (pageState = 6).
   * @param {TermBuf} termBuf 
   * @returns {boolean}
   */
  isEditingScreen(termBuf) {
    return false;
  }

  /**
   * Parse reading status row (usually the bottom row of an article).
   * @param {string} rowText 
   * @param {TermBuf} termBuf 
   * @returns {object|null} { pageIndex, pageTotal, pagePercent, rowIndexStart, rowIndexEnd }
   */
  parseReadingStatus(rowText, termBuf) {
    return null;
  }

  /**
   * Check if the article reading has reached the end.
   * @param {string} lastRowText 
   * @param {TermBuf} termBuf 
   * @param {object|null} statusResult 
   * @returns {boolean}
   */
  isArticleEnd(lastRowText, termBuf, statusResult) {
    if (statusResult && statusResult.pageIndex && statusResult.pageTotal) {
      return statusResult.pageIndex === statusResult.pageTotal && statusResult.pagePercent === 100;
    }
    return statusResult && statusResult.pagePercent === 100;
  }

  /**
   * Check if cursor is parked at the expected position waiting for page turn.
   * @param {TermBuf} termBuf 
   * @returns {boolean}
   */
  isCursorParked(termBuf) {
    let lastRowNum = this.getLastRowNum(termBuf);
    return termBuf.cur_y === lastRowNum;
  }

  /**
   * Calculate deduplication row offsets when populating pages in easy reading.
   * @param {TermBuf} termBuf 
   * @param {object|null} statusResult 
   * @param {number} actualRowIndex
   * @returns {object} { beginIndex, atLastPage, numRows }
   */
  getPagingSlice(termBuf, statusResult, actualRowIndex) {
    return {
      beginIndex: 0,
      atLastPage: false,
    };
  }

  /**
   * Find the maximum overlap between the top of termBuf.lines and the bottom of pageLines.
   * @param {TermBuf} termBuf 
   * @param {number} lastRowNum 
   * @param {Array} pageLines 
   * @returns {number} Number of overlapping rows at top of screen (0 to lastRowNum)
   */
  findContentOverlap(termBuf, lastRowNum, pageLines) {
    if (!pageLines || pageLines.length === 0 || !termBuf || !termBuf.lines) {
      return 0;
    }
    let maxK = Math.min(lastRowNum, pageLines.length);
    for (let k = maxK; k >= 1; --k) {
      let match = true;
      for (let j = 0; j < k; ++j) {
        let screenRow = termBuf.lines[k - 1 - j];
        let pageRow = pageLines[pageLines.length - 1 - j];
        if (!this._isLineContentEqual(screenRow, pageRow)) {
          match = false;
          break;
        }
      }
      if (match) {
        return k;
      }
    }
    return 0;
  }

  /**
   * Compare text content of two lines (arrays of char objects).
   * @param {Array} lineA 
   * @param {Array} lineB 
   * @returns {boolean}
   */
  _isLineContentEqual(lineA, lineB) {
    if (!lineA || !lineB) return false;
    let textA = '';
    for (let i = 0; i < lineA.length; ++i) {
      textA += (lineA[i] && lineA[i].ch) ? lineA[i].ch : ' ';
    }
    let textB = '';
    for (let i = 0; i < lineB.length; ++i) {
      textB += (lineB[i] && lineB[i].ch) ? lineB[i].ch : ' ';
    }
    return textA.trimEnd() === textB.trimEnd();
  }

  /**
   * Handle site-specific keydown event in easy reading mode.
   * @param {EasyReading} easyReading 
   * @param {KeyboardEvent} e 
   * @returns {boolean} True if handled and should stop event propagation.
   */
  handleEasyReadingKeyDown(easyReading, e) {
    if (!e.ctrlKey && !e.altKey) {
      switch (e.key) {
        case 'q':
        case 'Q':
          easyReading.stopEasyReading();
          easyReading.hide();
          easyReading.send('\x1b[D');
          return true;
      }
    }
    return false;
  }

  /**
   * Navigate to the previous post from within an article.
   * @param {EasyReading} easyReading 
   * @returns {boolean}
   */
  navigatePrevPost(easyReading) {
    return false;
  }

  /**
   * Navigate to the next post from within an article.
   * @param {EasyReading} easyReading 
   * @returns {boolean}
   */
  navigateNextPost(easyReading) {
    return false;
  }

  /**
   * Get command string to re-enter/reload current article for easy reading.
   * @param {TermBuf} termBuf
   * @returns {string}
   */
  getReenterArticleCommand(termBuf) {
    return '\x1b[D\x1b[C';
  }

  /**
   * Get command string to refresh live thread (re-enter article and scroll to bottom).
   * @param {TermBuf} [termBuf]
   * @returns {string}
   */
  getRefreshLiveThreadCommand(termBuf) {
    return '\x1b[D\x1b[C\x1b[4~';
  }

  /**
   * Refresh live thread.
   * @param {object} conn
   * @param {TermBuf} [termBuf]
   */
  refreshLiveThread(conn, termBuf) {
    const cmd = this.getRefreshLiveThreadCommand(termBuf);
    if (cmd && conn) {
      conn.send(cmd);
    }
  }

  /**
   * Determine if a row is a continuation (wrapped line) of the previous row in easy reading.
   * @param {TermBuf} termBuf
   * @param {number} rowIndex
   * @param {boolean} [isInitialPage=false]
   * @returns {boolean}
   */
  isLineContinuation(termBuf, rowIndex, isInitialPage = false) {
    return false;
  }

  /**
   * Get command string for same-thread navigation / refresh.
   * @param {'prevThread'|'nextThread'|'firstThread'|'refreshPost'|'lastThreadList'|'lastThreadReading'} action
   * @returns {string|null}
   */
  getThreadCommand(action) {
    switch (action) {
      case 'prevThread':
        return '[';
      case 'nextThread':
        return ']';
      case 'firstThread':
        return '=';
      case 'refreshPost':
        return '\x1b[D\r\x1b[4~\x1b[4~';
      case 'lastThreadList':
        return '\x1b[D\r\x1b[4~\x1b[4~[]';
      case 'lastThreadReading':
        return '\x1b[D\x1b[4~[]\r';
      default:
        return null;
    }
  }

  /**
   * Get list of site-specific easy reading commands.
   * @returns {Array<[string, string]>} Array of [key, description] pairs
   */
  getEasyReadingCommands() {
    return [];
  }

  /**
   * Get basic bottom prompt HTML for easy reading mode with optional extra commands.
   * @param {string|Array<[string, string]>} [extra_cmds]
   * @param {string} [spaces='']
   * @param {number} [percent=100]
   * @returns {string} HTML string
   */
  getBasicPrompt(extra_cmds = this.getEasyReadingCommands(), spaces = '', percent = 100) {
    const pctStr = (percent >= 100) ? '100%' : (percent < 10 ? '  ' + percent + '%' : ' ' + percent + '%');
    const cls = (percent >= 100) ? 'q1' : 'q2';
    let cmdsStr = '';
    if (typeof extra_cmds === 'string') {
      cmdsStr = extra_cmds;
    } else if (Array.isArray(extra_cmds)) {
      cmdsStr = extra_cmds
        .map(cmd => {
          if (Array.isArray(cmd)) {
            return '<span class="q1 b7">(' + cmd[0] + ')</span><span class="q0 b7">' + cmd[1] + ' </span>';
          }
          if (typeof cmd === 'object' && cmd !== null) {
            return '<span class="q1 b7">(' + cmd.key + ')</span><span class="q0 b7">' + cmd.label + ' </span>';
          }
          return cmd;
        })
        .join('');
    }
    return '<span align="left">' +
           '<span class="q1 b7">' + spaces + '[好讀模式] </span>' +
           '<span class="' + cls + ' b7">(' + pctStr + ') </span>' +
           '<span class="q0 b7"> 滾輪/上下鍵捲動，</span>' +
           cmdsStr +
           '<span class="q1 b7">(Esc)</span><span class="q0 b7">回到終端機 </span>' +
           '<span class="q1 b7">(←/q)</span><span class="q0 b7">離開</span>' +
           '</span>';
  }

  /**
   * Get bottom prompt HTML for easy reading mode.
   * @param {string} spaces
   * @param {number} percent
   * @returns {string} HTML string
   */
  getEasyReadingPrompt(spaces = '', percent = 100) {
    return this.getBasicPrompt(this.getEasyReadingCommands(), spaces, percent);
  }

  /**
   * Check if current screen is a reply prompt.
   * @param {TermBuf} termBuf
   * @returns {boolean}
   */
  isReplyPrompt(termBuf) {
    return false;
  }

  /**
   * Check if current screen is a push prompt or post-restriction notice.
   * @param {TermBuf} termBuf
   * @returns {boolean}
   */
  isPushPrompt(termBuf) {
    return false;
  }

  /**
   * Get escape character for article editor ANSI sequences (e.g. '\x15' / Ctrl-U for PTT).
   * @returns {string}
   */
  getEditorEscapeChar() {
    return '\x15';
  }

  /**
   * Get reset command for article editor ANSI coloring (e.g. '\x15[m' for PTT).
   * @returns {string}
   */
  getEditorColorResetCommand() {
    return this.getEditorEscapeChar() + '[m';
  }

  /**
   * Get color command for article editor.
   * @param {{fg: number, bg: number, isBlink: boolean}} color
   * @param {'foreground'|'background'|'both'} [type]
   * @returns {string}
   */
  getEditorColorCommand({ fg, bg, isBlink }, type) {
    let lightColor = "0;";
    if (fg > 7) {
      fg %= 8;
      lightColor = "1;";
    }
    fg += 30;
    bg += 40;
    let blink = "";
    if (isBlink) {
      blink = "5;";
    }
    let cmd = this.getEditorEscapeChar() + "[";
    if (type === "foreground") {
      cmd += lightColor + blink + fg + "m";
    } else if (type === "background") {
      cmd += bg + "m";
    } else {
      cmd += lightColor + blink + fg + ";" + bg + "m";
    }
    return cmd;
  }

  /**
   * Send anti-idle signal or string across the connection.
   * @param {TelnetConnection} conn
   */
  sendAntiIdle(conn) {
    conn.send('\x1b\x1b');
  }

  /**
   * Called when a Telnet negotiation option is received from the server.
   * @param {string} cmd 'WILL', 'DO', 'WONT', 'DONT'
   * @param {string} opt Option byte
   * @param {TermBuf} termBuf
   */
  onTelopt(cmd, opt, termBuf) {}

  /**
   * Called when display data is dispatched to the terminal parser.
   * @param {string} data Raw data chunk
   * @param {TermBuf} termBuf
   */
  onData(data, termBuf) {}

  /**
   * Parse notification (e.g. waterball or site message).
   * @param {TermBuf|string} bufOrData
   * @param {TermBuf} [termBuf]
   * @returns {{ userId?: string, message: string } | null}
   */
  parseNotification(bufOrData, termBuf) {
    const buf = (bufOrData && bufOrData.getRowText)
      ? bufOrData
      : (termBuf && termBuf.getRowText ? termBuf : null);
    if (buf) {
      const lastRowNum = this.getLastRowNum(buf);
      const rowText = buf.getRowText(lastRowNum);
      return parseWaterballRow(rowText);
    }

    if (typeof bufOrData === 'string') {
      return parseWaterballRow(bufOrData);
    }

    return null;
  }

  /**
   * Detect site-specific custom links in a text row.
   * @param {string} lineText
   * @param {TermChar[]} lineChars
   * @param {TermBuf} [termBuf]
   * @returns {Array<{ start: number, end: number, url: string }>}
   */
  detectCustomLinks(lineText, lineChars, termBuf) {
    return [];
  }

  /**
   * Resolve or transform a URL if needed (e.g. pid://, custom schemes).
   * @param {string} url
   * @returns {string}
   */
  resolveUrl(url) {
    if (typeof url === "string" && url.toLowerCase().startsWith("pid://")) {
      return "https://www.pixiv.net/artworks/" + url.slice(6);
    }
    return url;
  }

  /**
   * Handle custom link clicks if needed.
   * @param {string} url
   * @param {object} app
   * @returns {boolean} True if handled internally and should preventDefault.
   */
  handleCustomLink(url, app) {
    return false;
  }
}
