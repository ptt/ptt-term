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
    this.currentBoard = null;
  }

  /**
   * PTT does not send double keystrokes for DBCS cursor movement.
   * @returns {boolean}
   */
  checkDBCursor(key, isLeftDB, isCurDB) {
    return false;
  }

  isMenuScreen(termBuf) {
    if (!termBuf) return false;
    if (this.isCursorParked(termBuf)) return false;

    let cols = termBuf.cols;
    let lastRowNum = this.getLastRowNum(termBuf);
    let firstRowText = termBuf.getRowText(0, 0, cols);
    let lastRowText = termBuf.getRowText(lastRowNum, 0, cols);

    const isMenuTitle =
      firstRowText.indexOf('【主功能表】') === 0 ||
      firstRowText.indexOf('【分類看板】') === 0 ||
      firstRowText.indexOf('【精華文章】') === 0;

    if (isMenuTitle) {
      return true;
    }

    if (firstRowText.indexOf('【') === 0 && parseListRow(lastRowText)) {
      if (!this.isListScreen(termBuf)) {
        return true;
      }
    }
    return false;
  }

  isListScreen(termBuf) {
    if (!termBuf) return false;
    if (this.isCursorParked(termBuf)) return false;

    let cols = termBuf.cols;
    let lastRowNum = this.getLastRowNum(termBuf);

    // In PTT mbbsd read.c / board.c, cursor is placed on active list item (cur_x < 19)
    // or on the bottom prompt line (cur_y === lastRowNum)
    if (termBuf.cur_x !== undefined && termBuf.cur_x >= 19 && termBuf.cur_y !== lastRowNum) {
      return false;
    }

    let row0Text = termBuf.getRowText(0, 0, cols);
    let row1Text = termBuf.getRowText(1, 0, cols);
    let row2Text = termBuf.getRowText(2, 0, cols);

    // PTT list screens always start row 0 with 【 (e.g. 【板主:...】 看板《...》, 【郵件選單】, etc.)
    if (!row0Text || row0Text.indexOf('【') !== 0) {
      return false;
    }

    // Row 1 has command shortcuts: [←]離開 and [→]閱讀 / [→]選擇
    const hasCommandRow =
      /\[←\]\s*離開/.test(row1Text) &&
      (/\[→\]\s*閱?讀/.test(row1Text) || /\[→\]\s*選擇/.test(row1Text));

    // Row 2 is the table column header containing 編號
    const hasHeaderRow = row2Text && row2Text.includes('編號');

    if (hasCommandRow || hasHeaderRow) {
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
    if (termBuf && termBuf.lines) {
      let lastRowNum = this.getLastRowNum(termBuf);
      let lastRowFirstCh = termBuf.lines[lastRowNum] && termBuf.lines[lastRowNum][0];
      if (lastRowFirstCh && lastRowFirstCh.getBg && lastRowFirstCh.getBg() == 4 && lastRowFirstCh.getFg && lastRowFirstCh.getFg() == 7) {
        return true;
      }
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
    let lastRowNum = this.getLastRowNum(termBuf);
    let pageLines = termBuf.pageLines || [];
    let beginIndex = this.findContentOverlap(termBuf, lastRowNum, pageLines);
    return {
      beginIndex,
      atLastPage: true,
    };
  }

  /**
   * Determine whether row is auto-wrapped by looking for the ending "\" (bright white on black).
   * Specific to PTT BBS.
   * @param {TermBuf} termBuf
   * @param {number} row
   * @returns {boolean}
   */
  isTextWrappedRow(termBuf, row) {
    if (!termBuf || typeof row !== 'number' || !Number.isFinite(row) || row < 0 || row >= termBuf.rows) return false;
    const line = termBuf.lines && termBuf.lines[row];
    if (!line) return false;
    for (const col of [78, 77]) {
      const ch = line[col];
      if (ch && ch.ch === '\\' && ch.fg == 7 && ch.bg === 0 && ch.bright) {
        return true;
      }
    }
    return false;
  }

  isLineContinuation(termBuf, rowIndex, isInitialPage = false) {
    if (isInitialPage && rowIndex === 4) {
      return true;
    }
    if (rowIndex > 0 && this.isTextWrappedRow(termBuf, rowIndex - 1)) {
      return true;
    }
    return false;
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

  /**
   * Extract current board name from terminal screen header if available.
   * Checks row 0..3 for board title patterns (e.g. 看板《Gossiping》, 看板 Gossiping, 看板: Gossiping).
   * @param {TermBuf} termBuf 
   * @returns {string|null}
   */
  extractBoardName(termBuf) {
    if (!termBuf || !termBuf.rows) return null;
    for (let r = 0; r < Math.min(4, termBuf.rows); ++r) {
      const rowText = termBuf.getRowText(r, 0, termBuf.cols);
      const m = /看板[：:\s《]+([0-9A-Za-z_.-]+)》?/.exec(rowText);
      if (m) {
        this.currentBoard = m[1];
        return m[1];
      }
    }
    return this.currentBoard || null;
  }

  /**
   * Detect PTT article code (AID) links in a row.
   * Format: #1gIeu-3A (Android) or #1gIeu-3A [Android] or #1gIeu-3A@Android or #1gIeu-3A
   * @param {string} lineText 
   * @param {TermChar[]} lineChars 
   * @param {TermBuf} [termBuf] 
   * @returns {Array<{ start: number, end: number, url: string, aid: string, board: string|null }>}
   */
  detectCustomLinks(lineText, lineChars, termBuf) {
    if (termBuf) {
      this.extractBoardName(termBuf);
    }
    if (!lineText) return [];
    const links = [];
    const crossPostMatch = /本文轉錄自\s+([0-9A-Za-z_.-]{2,})\s+看板/.exec(lineText);
    const crossPostBoard = crossPostMatch ? crossPostMatch[1] : null;
    const re = /(?<![0-9A-Za-z_#-])#([0-9A-Za-z_-]{8})(?![0-9A-Za-z_-])(?:\s*(?:\(([0-9A-Za-z_.-]+)\)|\[([0-9A-Za-z_.-]+)\]|@([0-9A-Za-z_.-]+)))?/g;
    let m;
    while ((m = re.exec(lineText)) !== null) {
      const aid = m[1];
      if (!isAidc(aid)) continue;
      const board = m[2] || m[3] || m[4] || crossPostBoard || this.extractBoardName(termBuf);
      let url;
      if (board) {
        const fn = aidToFn(aid);
        url = fn ? `https://www.ptt.cc/bbs/${board}/${fn}.html` : `https://www.ptt.cc/bbs/${board}/#${aid}`;
      } else {
        url = `#aid=${aid}`;
      }
      links.push({
        start: m.index,
        end: m.index + m[0].length,
        url,
        aid,
        board,
      });
    }
    return links;
  }

  /**
   * Handle custom link clicks.
   * If the URL is a boardless AID action (#aid=...), send keystrokes to terminal.
   * If it is a web URL (https://www.ptt.cc/...), return false to let browser open the page.
   * @param {string} url
   * @param {object} app
   * @returns {boolean}
   */
  handleCustomLink(url, app) {
    if (!url || !app || !app.conn) return false;
    const m = /#aid=([0-9A-Za-z_-]{8})/.exec(url);
    if (m) {
      const aid = m[1];
      app.conn.send(`#${aid}\r`);
      app.setInputAreaFocus();
      return true;
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// PTT Article ID (AID) Codec (RFC / pttbbs mbbsd/aids.c specification)
// ---------------------------------------------------------------------------
const AIDC_TABLE = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
const AIDC_LEN = 8;
const TYPE_SCALE = 17592186044416; // 2^44
const V1_SCALE = 4096;             // 2^12
const V2_MOD = 4096;
const V1_MOD = 4294967296;         // 2^32

export function isAidc(aid) {
  return typeof aid === 'string' && /^[0-9A-Za-z_-]{8}$/.test(aid);
}

/**
 * Convert filename (e.g. "M.1786265274.A.5E3") to 8-character AID (e.g. "1gU3wwNZ").
 * @param {string} fn 
 * @returns {string|null}
 */
export function fnToAid(fn) {
  if (typeof fn !== 'string') return null;
  const bare = fn.replace(/\.html$/i, '');
  const m = /^([MG])\.(\d{1,10})\.A(?:\.([0-9A-Fa-f]{1,3}))?$/.exec(bare);
  if (!m) return null;
  const v1 = parseInt(m[2], 10);
  if (!(v1 >= 0) || v1 >= V1_MOD) return null;
  const v2 = m[3] ? parseInt(m[3], 16) : 0;
  const type = m[1] === 'M' ? 0 : 1;
  let aidu = type * TYPE_SCALE + v1 * V1_SCALE + v2;
  let out = '';
  for (let i = 0; i < AIDC_LEN; ++i) {
    out = AIDC_TABLE.charAt(aidu % 64) + out;
    aidu = Math.floor(aidu / 64);
  }
  return out;
}

/**
 * Convert 8-character AID (e.g. "1gU3wwNZ") to filename (e.g. "M.1786265274.A.5E3").
 * @param {string} aid 
 * @returns {string|null}
 */
export function aidToFn(aid) {
  if (!isAidc(aid)) return null;
  let aidu = 0;
  for (let i = 0; i < aid.length; ++i) {
    const v = AIDC_TABLE.indexOf(aid.charAt(i));
    if (v < 0) return null;
    aidu = aidu * 64 + v;
  }
  const type = Math.floor(aidu / TYPE_SCALE) % 16;
  const v1 = Math.floor(aidu / V1_SCALE) % V1_MOD;
  const v2 = aidu % V2_MOD;
  const hex = v2.toString(16).toUpperCase().padStart(3, '0');
  return (type === 0 ? 'M' : 'G') + '.' + v1 + '.A.' + hex;
}

