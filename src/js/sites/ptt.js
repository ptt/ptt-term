import { BaseSite, parseWaterballRow } from './base.js';

export { parseWaterballRow };

export function parseReplyText(it) {
  return (it.indexOf('▲ 回應至 (F)看板 (M)作者信箱 (B)二者皆是 (Q)取消？[F] ') === 0 ||
      it.indexOf('▲ 無法回應至看板。 改回應至 (M)作者信箱 (Q)取消？[Q]') === 0 ||
      it.indexOf('把這篇文章收入到暫存檔？[y/N]') === 0 ||
      it.indexOf('請選擇暫存檔 (0-9)[0]:') === 0);
}

export function parsePushInitText(it) {
  return (it.indexOf('您覺得這篇文章 ') === 0 || 
      it.search(/→ \w+ *: +/) === 0 ||
      it.indexOf('很抱歉, 本板不開放回覆文章，要改回信給作者嗎？ [y/N]:') === 0);
}

export function parseReqNotMetText(it) {
  return (it.indexOf(' ◆ 未達看板發文限制:') === 0);
}

export function parseStatusRow(str) {
  const regex = /  瀏覽 第 (\d{1,3})(?:\/(\d{1,3}))? 頁 *\( *(\d{1,3})%\)  目前顯示: 第 0*(\d+)~0*(\d+) 行 *(?:\(y\)回應)?(?:\(X\/?%\)推文)?(?:\(h\)說明)? *\(←\/?q?\)離開 /g;
  const result = regex.exec(str);

  if (result && result.length === 6) {
    const pagePercent = parseInt(result[3]);
    return {
      pageIndex:     parseInt(result[1]),
      pageTotal:     parseInt(result[2]),
      pagePercent:   pagePercent,
      rowIndexStart: parseInt(result[4]),
      rowIndexEnd:   parseInt(result[5]),
      isEnd:         pagePercent === 100
    };
  }

  return null;
}

export function parseListRow(str) {
  const regex = /\[\d{1,2}\/\d{1,2} +星期. +\d{1,2}:\d{1,2}\] .+ 線上\d+人, 我是\w+ +\[呼叫器\](?:關閉|打開) /g;
  return regex.test(str);
}

export function parseWaterball(str, lastRowNum = 23) {
  let regex = /\x1b\[1;33;46m\u2605(\w+)\x1b\[0;1;37;45m (.+) \x1b\[m\x1b\[K/g;
  let result = regex.exec(str);
  if (result && result.length == 3) {
    return { userId: result[1], message: result[2] };
  } else {
    const row1Based = lastRowNum + 1;
    const rowPattern = row1Based !== 24 ? `(?:${row1Based}|24)` : '24';
    regex = new RegExp(`\\x1b\\[${rowPattern};\\d{2}H\\x1b\\[1;37;45m([^\\x1b]+)(?:\\x1b\\[${rowPattern};18H)?\\x1b\\[m`, 'g');
    result = regex.exec(str);
    if (result && result.length == 2) {
      return { message: result[1] };
    }
  }

  return null;
}

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

  sendAntiIdle(conn) {
    conn.sendNop();
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

  isLineContinuation(termBuf, rowIndex, isInitialPage = false) {
    if (isInitialPage && rowIndex === 4) {
      return true;
    }
    return super.isLineContinuation(termBuf, rowIndex, isInitialPage);
  }

  getEasyReadingCommands() {
    return [
      ['y', '回應'],
      ['X%', '推文'],
    ];
  }

  getEasyReadingPrompt(spaces = '', percent = 100) {
    return this.getBasicPrompt(this.getEasyReadingCommands(), spaces, percent);
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

  parseNotification(bufOrData, termBuf) {
    const res = super.parseNotification(bufOrData, termBuf);
    if (res) return res;

    if (typeof bufOrData === 'string') {
      const lastRowNum = termBuf ? this.getLastRowNum(termBuf) : 23;
      return parseWaterball(bufOrData, lastRowNum);
    }

    return null;
  }
}
