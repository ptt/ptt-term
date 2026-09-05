import { BaseProfile } from './base_profile';

export class Maple3Profile extends BaseProfile {
  constructor() {
    super('maple3');
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
    // 瀏覽 P.1(59%)  (h)求助 [PgUp][PgDn][0][$]移動 (/n)搜尋 (C)暫存 ←(q)結束
    // 瀏覽 P.1/3(59%) ...
    let match = rowText.match(/ 瀏覽 P\.(\d{1,3})(?:\/(\d{1,3}))?\( *(\d{1,3})%\).*?←\(q\)結束/);
    if (!match) {
      return null;
    }
    return {
      pageIndex: parseInt(match[1], 10),
      pageTotal: match[2] ? parseInt(match[2], 10) : undefined,
      pagePercent: parseInt(match[3], 10),
      rowIndexStart: null,
      rowIndexEnd: null,
    };
  }

  isArticleEnd(lastRowText, termBuf, statusResult) {
    // e.g. 文章選讀  (y)回應 (=\[]<>-+;'`)相關主題 (/?)搜尋標題 (aA)搜尋作者 q)結束
    if (/ 文章選讀\s+.*?q\)結束/.test(lastRowText)) {
      return true;
    }
    if (statusResult && statusResult.pageIndex && statusResult.pageTotal) {
      return statusResult.pageIndex == statusResult.pageTotal && statusResult.pagePercent == 100;
    }
    return !!(statusResult && statusResult.pagePercent == 100);
  }

  isCursorParked(termBuf) {
    let lastRowNum = termBuf.rows - 1;
    // Maple 3 parks cursor on row 23 after rendering bottom prompt
    return termBuf.cur_y == lastRowNum;
  }

  getPagingSlice(termBuf, statusResult, actualRowIndex) {
    // In Maple 3, each page turn displays the next full screen of rows without line repetition.
    return {
      beginIndex: 0,
      atLastPage: false,
    };
  }
}
