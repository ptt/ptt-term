import { BaseSite } from './base';

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
      // console.log('[Maple3Profile] Matched article end reading status:', rowText);
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

  getPagingSlice(termBuf, statusResult, actualRowIndex) {
    let lastRowNum = this.getLastRowNum(termBuf);
    let pageLines = termBuf.pageLines || [];
    let isEnd = this.isArticleEnd(termBuf.getRowText(lastRowNum, 0, termBuf.cols), termBuf, statusResult);
    let beginIndex = 0;

    if (pageLines.length > 0) {
      if (!isEnd) {
        // In the middle of an article, Maple 3 space scroll always advances by PAGE_SCROLL (22 lines),
        // leaving exactly 1 line of overlap at row 0.
        beginIndex = 1;
      } else {
        // At the end of an article, Maple 3 hits EOF and may have scrolled fewer than PAGE_SCROLL lines.
        // Find the maximum overlap k between screen[0 .. k-1] and pageLines[N - k .. N - 1].
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
            beginIndex = k;
            break;
          }
        }
      }
    }

    return {
      beginIndex: beginIndex,
      atLastPage: isEnd,
    };
  }

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

  getEasyReadingPrompt(spaces = '', percent = 100) {
    const pctStr = (percent >= 100) ? '100%' : (percent < 10 ? '  ' + percent + '%' : ' ' + percent + '%');
    const cls = (percent >= 100) ? 'q1' : 'q2';
    return '<span align="left"><span class="q1 b7">' + spaces + '[好讀模式] </span>' +
           '<span class="' + cls + ' b7">(' + pctStr + ') </span>' +
           '<span class="q0 b7"> 滾輪/上下鍵捲動，</span>' +
           '<span class="q1 b7">(y)</span><span class="q0 b7">回文 </span>' +
           '<span class="q1 b7">(Esc)</span><span class="q0 b7">回到終端機 </span>' +
           '<span class="q1 b7">(←/q)</span><span class="q0 b7">離開</span></span>';
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
}
