import { BaseSite } from './base.js';

export class Maple3Site extends BaseSite {
  constructor() {
    super('maple3');
    this.fixed_last_row = 23;
    this.max_rows = 24;
  }

  isListScreen(termBuf) {
    let cols = termBuf.cols;
    let row1Text = termBuf.getRowText(1, 0, cols);
    // e.g. [←]離開 [→]閱讀 [^P]發表 [b]備忘錄 [d]刪除 [V]投票 [TAB]精華區 [h]elp
    return /\[←\]離開\s*\[→\]閱讀/.test(row1Text);
  }

  isMenuScreen(termBuf) {
    return false;
  }

  parseReadingStatus(rowText, termBuf) {
    // e.g.
    //  瀏覽 P.1(59%)  (h)求助 [PgUp][PgDn][0][$]移動 (/n)搜尋 (C)暫存 ←(q)結束
    //  瀏覽 P.1/3(59%) ...
    // Robust match: look for 瀏覽 P.<page>(<percent>%) anywhere on the line
    let match = rowText.match(/瀏覽\s*P\.(\d{1,3})(?:\/(\d{1,3}))?\s*\(\s*(\d{1,3})%\)/);
    if (match) {
      let pageIndex = parseInt(match[1], 10);
      let pageTotal = match[2] ? parseInt(match[2], 10) : undefined;
      let pagePercent = parseInt(match[3], 10);
      return {
        pageIndex: pageIndex,
        pageTotal: pageTotal,
        pagePercent: pagePercent,
        rowIndexStart: null,
        rowIndexEnd: null,
        isEnd: pagePercent === 100 || (pageTotal !== undefined && pageIndex === pageTotal),
      };
    }

    // Article end prompt: e.g. 文章選讀  (y)回應 (=\[]<>-+;'`)相關主題 (/?)搜尋標題 (aA)搜尋作者
    if (/文章選讀/.test(rowText)) {
      // console.log('[Maple3Site] Matched article end reading status:', rowText);
      return {
        pageIndex: 999,
        pageTotal: 999,
        pagePercent: 100,
        rowIndexStart: null,
        rowIndexEnd: null,
        isEnd: true,
      };
    }

    return null;
  }

  isArticleEnd(lastRowText, termBuf, statusResult) {
    if (statusResult && statusResult.isEnd) {
      return true;
    }
    if (/文章選讀/.test(lastRowText)) {
      return true;
    }
    return super.isArticleEnd(lastRowText, termBuf, statusResult);
  }

  sendAntiIdle(conn) {
    conn.send('\x00');
  }

  getPagingSlice(termBuf, statusResult, actualRowIndex, pageLines = termBuf?.pageLines || []) {
    let lastRowNum = this.getLastRowNum(termBuf);
    let isEnd = this.isArticleEnd(termBuf.getRowText(lastRowNum, 0, termBuf.cols), termBuf, statusResult);
    let beginIndex = 0;

    if (pageLines.length > 0) {
      if (!isEnd) {
        // In the middle of an article, Maple 3 space scroll always advances by PAGE_SCROLL (22 lines),
        // leaving exactly 1 line of overlap at row 0.
        beginIndex = 1;
      } else {
        // At the end of an article, Maple 3 hits EOF and may have scrolled fewer than PAGE_SCROLL lines.
        beginIndex = this.findContentOverlap(termBuf, lastRowNum, pageLines);
      }
    }

    return {
      beginIndex: beginIndex,
      atLastPage: isEnd,
    };
  }

  getEasyReadingCommands() {
    return [
      ['y', '回文'],
    ];
  }

  getEasyReadingPrompt(spaces = '', percent = 100) {
    return this.getBasicPrompt(this.getEasyReadingCommands(), spaces, percent);
  }

  handleEasyReadingKeyDown(easyReading, e) {
    if (!e.ctrlKey && !e.altKey) {
      switch (e.key) {
        case 'y':
        case 'Y':
          easyReading.hide();
          easyReading.send('y');
          return true;
        case 'q':
        case 'Q':
          easyReading.stopEasyReading();
          easyReading.hide();
          easyReading.send('q');
          return true;
      }
    }
    return false;
  }

  getReenterArticleCommand(termBuf) {
    return 'qr';
  }

  getRefreshLiveThreadCommand(termBuf) {
    return 'qrG';
  }

  getThreadCommand(action) {
    switch (action) {
      case 'prevThread':
        return '-';
      case 'nextThread':
        return '+';
      case 'firstThread':
        return '=';
      default:
        return null;
    }
  }

  getEditorEscapeChar() {
    return '\x03';
  }
}
