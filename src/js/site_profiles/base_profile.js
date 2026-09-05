export class BaseProfile {
  constructor(name = 'base') {
    this.name = name;
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
    return termBuf.cur_y === termBuf.rows - 1;
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
}
