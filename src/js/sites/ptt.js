import { BaseSite } from './base';
import {
  parseStatusRow,
  parseListRow,
  parseWaterball,
  parseReplyText,
  parsePushInitText,
  parseReqNotMetText
} from '../string_util';

export class PttSite extends BaseSite {
  constructor() {
    super('ptt');
  }

  isMenuScreen(termBuf) {
    let cols = termBuf.cols;
    let lastRowNum = this.getLastRowNum(termBuf);
    let firstRowText = termBuf.getRowText(0, 0, cols);
    let lastRowText = termBuf.getRowText(lastRowNum, 0, cols);

    if (termBuf.isUnicolor(0, 0, 29) && termBuf.isUnicolor(0, cols - 20, cols - 10)) {
      let main = firstRowText.indexOf('【主功能表】');
      let classList = firstRowText.indexOf('【分類看板】');
      let archiveList = firstRowText.indexOf('【精華文章】');
      if (main === 0 || classList === 0 || archiveList === 0 || parseListRow(lastRowText)) {
        return true;
      }
    }
    return false;
  }

  isListScreen(termBuf) {
    let cols = termBuf.cols;
    let lastRowNum = this.getLastRowNum(termBuf);
    if (termBuf.isUnicolor(0, 0, 29) && termBuf.isUnicolor(0, cols - 20, cols - 10)) {
      if (termBuf.isUnicolor(2, 0, cols - 10) && !termBuf.isLineEmpty(1) && (termBuf.cur_x < 19 || termBuf.cur_y == lastRowNum)) {
        return true;
      }
    }
    return false;
  }

  isPassScreen(termBuf) {
    if (super.isPassScreen(termBuf)) {
      return true;
    }
    let cols = termBuf.cols;
    let lastRowNum = this.getLastRowNum(termBuf);
    if (termBuf.isUnicolor(lastRowNum, 28, 53) && termBuf.cur_y === lastRowNum && termBuf.cur_x === cols - 1) {
      return true;
    }
    return false;
  }

  isEditingScreen(termBuf) {
    let lastRowNum = this.getLastRowNum(termBuf);
    let cols = termBuf.cols;
    let lastRowText = termBuf.getRowText(lastRowNum, 0, cols);
    return lastRowText.indexOf(' 編輯文章  (^Z/F1)說明 (^P/^G)插入符號/範本 (^X/^Q)離開') === 0;
  }

  parseReadingStatus(rowText, termBuf) {
    let result = parseStatusRow(rowText);
    if (result && this.isArticleEnd(rowText, termBuf, result)) {
      result.isEnd = true;
    }
    return result;
  }

  isArticleEnd(lastRowText, termBuf, statusResult) {
    let lastRowNum = this.getLastRowNum(termBuf);
    let lastRowFirstCh = termBuf.lines[lastRowNum][0];
    if (lastRowFirstCh && lastRowFirstCh.getBg() == 4 && lastRowFirstCh.getFg() == 7) {
      return true;
    }
    return super.isArticleEnd(lastRowText, termBuf, statusResult);
  }

  isCursorParked(termBuf) {
    let lastColNum = termBuf.cols - 1;
    let lastRowNum = this.getLastRowNum(termBuf);
    return termBuf.cur_y == lastRowNum && termBuf.cur_x == lastColNum;
  }

  getAntiIdleString() {
    // TELNET IAC NOP
    return '\xff\xf1';
  }

  getPagingSlice(termBuf, statusResult, actualRowIndex) {
    let beginIndex = 1;
    let atLastPage = false;
    if (!statusResult) {
      return { beginIndex: 1, atLastPage: false };
    }

    if ((statusResult.pageIndex == statusResult.pageTotal && statusResult.pagePercent == 100) ||
        statusResult.rowIndexStart != actualRowIndex) {
      atLastPage = statusResult.rowIndexStart != actualRowIndex;
      let numRows = 0;
      for (let i = statusResult.rowIndexStart; i < actualRowIndex + 1; ++i) {
        numRows += (termBuf.pageWrappedLines && termBuf.pageWrappedLines[i]) || 0;
      }
      beginIndex = numRows;
    }
    return { beginIndex, atLastPage };
  }

  getEasyReadingPrompt(spaces = '', percent = 100) {
    const pctStr = (percent >= 100) ? '100%' : (percent < 10 ? '  ' + percent + '%' : ' ' + percent + '%');
    const cls = (percent >= 100) ? 'q1' : 'q2';
    return '<span align="left"><span class="q1 b7">' + spaces + '[好讀模式] </span>' +
           '<span class="' + cls + ' b7">(' + pctStr + ') </span>' +
           '<span class="q0 b7"> 滾輪/上下鍵捲動，</span>' +
           '<span class="q1 b7">(y)</span><span class="q0 b7">回應 </span>' +
           '<span class="q1 b7">(X%)</span><span class="q0 b7">推文 </span>' +
           '<span class="q1 b7">(Esc)</span><span class="q0 b7">回到終端機 </span>' +
           '<span class="q1 b7">(←/q)</span><span class="q0 b7">離開</span></span>';
  }

  isReplyPrompt(termBuf) {
    const lastRowNum = this.getLastRowNum(termBuf);
    if (termBuf.cur_y === lastRowNum - 1) {
      const secondToLastRowText = termBuf.getRowText(lastRowNum - 1, 0, termBuf.cols);
      return Boolean(parseReplyText(secondToLastRowText));
    }
    return false;
  }

  isPushPrompt(termBuf) {
    const lastRowNum = this.getLastRowNum(termBuf);
    const lastRowText = termBuf.getRowText(lastRowNum, 0, termBuf.cols);
    if (parseReqNotMetText(lastRowText)) {
      return true;
    }
    if (termBuf.cur_y === lastRowNum && parsePushInitText(lastRowText)) {
      return true;
    }
    return false;
  }

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
      if ("abf=+-[]ABF".indexOf(e.key) >= 0) {
        easyReading.leaveCurrentPost();
        return false;
      }
      if ("123456789hops;,./\\H#OP:<>".indexOf(e.key) >= 0) {
        return true;
      }
    } else if (e.ctrlKey && !e.altKey) {
      if ("@^_?".indexOf(e.key) >= 0) {
        return true;
      }
    }
    return false;
  }

  navigatePrevPost(easyReading) {
    easyReading.send('\x1b[D\x1b[A\x1b[C');
    return true;
  }

  navigateNextPost(easyReading) {
    easyReading.send('\x1b[D\x1b[B\x1b[C');
    return true;
  }

  parseNotification(data, termBuf) {
    let lastRowNum = termBuf ? this.getLastRowNum(termBuf) : 23;
    return parseWaterball(data, lastRowNum);
  }
}
