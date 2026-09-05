import { BaseProfile } from './base_profile';
import { parseStatusRow, parseListRow } from '../string_util';

export class PttProfile extends BaseProfile {
  constructor() {
    super('ptt');
  }

  isMenuScreen(termBuf) {
    let cols = termBuf.cols;
    let lastRowNum = termBuf.rows - 1;
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
    let lastRowNum = termBuf.rows - 1;
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
    let lastRowNum = termBuf.rows - 1;
    if (termBuf.isUnicolor(lastRowNum, 28, 53) && termBuf.cur_y === lastRowNum && termBuf.cur_x === cols - 1) {
      return true;
    }
    return false;
  }

  isEditingScreen(termBuf) {
    let lastRowNum = this.getLastRowNum ? this.getLastRowNum(termBuf) : (termBuf.rows - 1);
    let cols = termBuf.cols;
    let lastRowText = termBuf.getRowText(lastRowNum, 0, cols);
    return lastRowText.indexOf(' 編輯文章  (^Z/F1)說明 (^P/^G)插入符號/範本 (^X/^Q)離開') === 0;
  }

  parseReadingStatus(rowText, termBuf) {
    return parseStatusRow(rowText);
  }

  isArticleEnd(lastRowText, termBuf, statusResult) {
    let lastRowNum = termBuf.rows - 1;
    let lastRowFirstCh = termBuf.lines[lastRowNum][0];
    if (lastRowFirstCh && lastRowFirstCh.getBg() == 4 && lastRowFirstCh.getFg() == 7) {
      return true;
    }
    if (statusResult && statusResult.pageIndex && statusResult.pageTotal) {
      return statusResult.pageIndex == statusResult.pageTotal && statusResult.pagePercent == 100;
    }
    return !!(statusResult && statusResult.pagePercent == 100);
  }

  isCursorParked(termBuf) {
    let lastColNum = termBuf.cols - 1;
    let lastRowNum = termBuf.rows - 1;
    return termBuf.cur_y == lastRowNum && termBuf.cur_x == lastColNum;
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
}
