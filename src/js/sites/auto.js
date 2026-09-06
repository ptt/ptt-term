import { BaseSite } from './base';
import { PttSite } from './ptt';
import { Maple3Site } from './maple3';

export class AutoSite extends BaseSite {
  constructor() {
    super('auto');
    this.pttSite = new PttSite();
    this.maple3Site = new Maple3Site();
    this.detectedSite = null;
    this.isLocked = false;
    this.hasTelnet = false;
  }

  getActiveSite() {
    return this.detectedSite || this.pttSite;
  }

  lockSite(siteName, termBuf) {
    if (this.isLocked) {
      return;
    }
    if (siteName === 'maple3') {
      console.log('[AutoSite] Confirmed and locked Maple 3 site');
      this.detectedSite = this.maple3Site;
      this.isLocked = true;
      if (termBuf && termBuf.rows > 24) {
        console.log(`[AutoSite] Clamping terminal rows from ${termBuf.rows} to 24`);
        if (termBuf.view && termBuf.view.bbscore && termBuf.view.bbscore.resizer) {
          termBuf.view.bbscore.resizer();
        } else {
          termBuf.resize(termBuf.cols, 24);
          if (termBuf.view) {
            termBuf.view.fontResize();
            termBuf.view.redraw(true);
          }
        }
      }
    } else if (siteName === 'ptt') {
      console.log('[AutoSite] Confirmed and locked PTT site');
      this.detectedSite = this.pttSite;
      this.isLocked = true;
    }
  }

  onTelopt(cmd, opt, termBuf) {
    if (this.isLocked) {
      return;
    }
    this.hasTelnet = true;
    // TELOPT_BINARY = '\x00' (RFC 856). PTT BBS always sends WILL BINARY and DO BINARY during handshake.
    if (opt === '\x00') {
      console.log(`[AutoSite] Detected TELOPT_BINARY (${cmd}) -> PTT`);
      this.lockSite('ptt', termBuf);
    }
  }

  onData(data, termBuf) {
    if (this.isLocked) {
      return;
    }
    // If Telnet options were negotiated (e.g. TTYPE, ECHO, SGA)
    // but screen data starts arriving and no TELOPT_BINARY was received,
    // this is a non-PTTCurrent BBS (e.g. classic Maple 2.x or very old PTT).
    if (this.hasTelnet) {
      console.log('[AutoSite] Screen data received after Telnet negotiation without TELOPT_BINARY -> Maple or legacy');
      this.lockSite('maple3', termBuf);
    }
  }

  detect(termBuf) {
    if (this.isLocked) {
      return;
    }
    let cols = termBuf.cols;
    let lastRowNum = this.getLastRowNum(termBuf);
    let row1Text = termBuf.getRowText(1, 0, cols);
    let lastRowText = termBuf.getRowText(lastRowNum, 0, cols);
    let row23Text = termBuf.rows > 23 ? termBuf.getRowText(23, 0, cols) : lastRowText;

    // Check Maple 3 signatures
    if (/\[←\]離開\s*\[→\]閱讀/.test(row1Text) ||
        /瀏覽\s*P\.\d+/.test(lastRowText) || /瀏覽\s*P\.\d+/.test(row23Text) ||
        /文章選讀/.test(lastRowText) || /文章選讀/.test(row23Text)) {
      this.lockSite('maple3', termBuf);
      return;
    }

    // Check PTT signatures (strong signatures)
    let row0Text = termBuf.getRowText(0, 0, cols);
    if (/批踢踢實業坊/.test(row0Text) ||
        this.pttSite.parseReadingStatus(lastRowText, termBuf)) {
      this.lockSite('ptt', termBuf);
    }
  }

  clampTermSize(cols, rows) {
    return this.getActiveSite().clampTermSize(cols, rows);
  }

  getLastRowNum(termBuf) {
    return this.getActiveSite().getLastRowNum(termBuf);
  }

  isListScreen(termBuf) {
    this.detect(termBuf);
    return this.getActiveSite().isListScreen(termBuf);
  }

  isMenuScreen(termBuf) {
    this.detect(termBuf);
    return this.getActiveSite().isMenuScreen(termBuf);
  }

  isPassScreen(termBuf) {
    this.detect(termBuf);
    return this.getActiveSite().isPassScreen(termBuf);
  }

  isEditingScreen(termBuf) {
    this.detect(termBuf);
    return this.getActiveSite().isEditingScreen(termBuf);
  }

  parseReadingStatus(rowText, termBuf) {
    this.detect(termBuf);
    return this.getActiveSite().parseReadingStatus(rowText, termBuf);
  }

  isArticleEnd(lastRowText, termBuf, statusResult) {
    return this.getActiveSite().isArticleEnd(lastRowText, termBuf, statusResult);
  }

  isCursorParked(termBuf) {
    return this.getActiveSite().isCursorParked(termBuf);
  }

  getPagingSlice(termBuf, statusResult, actualRowIndex) {
    return this.getActiveSite().getPagingSlice(termBuf, statusResult, actualRowIndex);
  }

  getEasyReadingPrompt(spaces = '', percent = 100) {
    return this.getActiveSite().getEasyReadingPrompt(spaces, percent);
  }

  handleEasyReadingKeyDown(easyReading, e) {
    return this.getActiveSite().handleEasyReadingKeyDown(easyReading, e);
  }

  navigatePrevPost(easyReading) {
    return this.getActiveSite().navigatePrevPost(easyReading);
  }

  navigateNextPost(easyReading) {
    return this.getActiveSite().navigateNextPost(easyReading);
  }

  parseNotification(data, termBuf) {
    return this.getActiveSite().parseNotification(data, termBuf);
  }

  getReenterArticleCommand(termBuf) {
    return this.getActiveSite().getReenterArticleCommand(termBuf);
  }

  getThreadCommand(action) {
    return this.getActiveSite().getThreadCommand(action);
  }

  isReplyPrompt(termBuf) {
    return this.getActiveSite().isReplyPrompt(termBuf);
  }

  isPushPrompt(termBuf) {
    return this.getActiveSite().isPushPrompt(termBuf);
  }

  getEditorEscapeChar() {
    return this.getActiveSite().getEditorEscapeChar();
  }

  getEditorColorResetCommand() {
    return this.getActiveSite().getEditorColorResetCommand();
  }

  getEditorColorCommand(color, type) {
    return this.getActiveSite().getEditorColorCommand(color, type);
  }

  getAntiIdleString() {
    return this.getActiveSite().getAntiIdleString();
  }
}
