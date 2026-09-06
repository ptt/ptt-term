export class BaseSite {
  constructor(name = 'base') {
    this.name = name;
    this.fixed_last_row = null;
    this.max_rows = null;
    this.max_cols = null;
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
   * Get the effective status/last row number for this BBS.
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
    let lastRowNum = this.getLastRowNum ? this.getLastRowNum(termBuf) : (termBuf.rows - 1);
    let cols = termBuf.cols;
    let lastRowText = termBuf.getRowText(lastRowNum, 0, cols);
    if (lastRowText.indexOf('請按任意鍵繼續') >= 0 || lastRowText.indexOf('請按 空白鍵 繼續') >= 0) {
      return true;
    }
    return false;
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
   * Get bottom prompt HTML for easy reading mode.
   * @param {string} spaces
   * @param {number} percent
   * @returns {string} HTML string
   */
  getEasyReadingPrompt(spaces = '', percent = 100) {
    const pctStr = (percent >= 100) ? '100%' : (percent < 10 ? '  ' + percent + '%' : ' ' + percent + '%');
    return '<span align="left"><span class="q0 b7">' + spaces + '瀏覽 </span><span class="q1 b7">(' + pctStr + ')</span><span class="q1 b7"> [好讀模式]</span><span class="q0 b7"> 滾輪/上下鍵捲動，</span><span class="q1 b7">(Esc)</span><span class="q0 b7">回到終端機 </span><span class="q1 b7">(←/q)</span><span class="q0 b7">離開</span></span>';
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
   * Parse notification (e.g. waterball or site message) from data string.
   * @param {string} data Raw or decoded data string
   * @param {TermBuf} termBuf
   * @returns {{ userId?: string, message: string } | null}
   */
  parseNotification(data, termBuf) {
    return null;
  }
}
