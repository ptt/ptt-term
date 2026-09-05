import { BaseProfile } from './base_profile';
import { PttProfile } from './ptt_profile';
import { Maple3Profile } from './maple3_profile';

export class AutoProfile extends BaseProfile {
  constructor() {
    super('auto');
    this.pttProfile = new PttProfile();
    this.maple3Profile = new Maple3Profile();
    this.detectedProfile = null;
    this.isLocked = false;
  }

  getActiveProfile() {
    return this.detectedProfile || this.pttProfile;
  }

  detect(termBuf) {
    if (this.isLocked) {
      return;
    }
    let cols = termBuf.cols;
    let lastRowNum = termBuf.rows - 1;
    let row1Text = termBuf.getRowText(1, 0, cols);
    let lastRowText = termBuf.getRowText(lastRowNum, 0, cols);
    let row23Text = termBuf.rows > 23 ? termBuf.getRowText(23, 0, cols) : lastRowText;

    // Check Maple 3 signatures
    if (/\[←\]離開\s*\[→\]閱讀/.test(row1Text) ||
        /瀏覽\s*P\.\d+/.test(lastRowText) || /瀏覽\s*P\.\d+/.test(row23Text) ||
        /文章選讀/.test(lastRowText) || /文章選讀/.test(row23Text)) {
      console.log('[AutoProfile] Confirmed and locked Maple 3 profile');
      this.detectedProfile = this.maple3Profile;
      this.isLocked = true;
      if (termBuf.rows > 24) {
        console.log(`[AutoProfile] Clamping terminal rows from ${termBuf.rows} to 24`);
        if (termBuf.view && termBuf.view.bbscore && termBuf.view.bbscore.resizer) {
          termBuf.view.bbscore.resizer();
        } else {
          termBuf.resize(termBuf.cols, 24);
        }
      }
      return;
    }

    // Check PTT signatures (strong signatures)
    let row0Text = termBuf.getRowText(0, 0, cols);
    if (/批踢踢實業坊/.test(row0Text) ||
        this.pttProfile.parseReadingStatus(lastRowText, termBuf)) {
      console.log('[AutoProfile] Confirmed and locked PTT profile');
      this.detectedProfile = this.pttProfile;
      this.isLocked = true;
    }
  }

  clampTermSize(cols, rows) {
    return this.getActiveProfile().clampTermSize(cols, rows);
  }

  getLastRowNum(termBuf) {
    return this.getActiveProfile().getLastRowNum(termBuf);
  }

  isListScreen(termBuf) {
    this.detect(termBuf);
    return this.getActiveProfile().isListScreen(termBuf);
  }

  isMenuScreen(termBuf) {
    this.detect(termBuf);
    return this.getActiveProfile().isMenuScreen(termBuf);
  }

  isPassScreen(termBuf) {
    this.detect(termBuf);
    return this.getActiveProfile().isPassScreen(termBuf);
  }

  isEditingScreen(termBuf) {
    this.detect(termBuf);
    return this.getActiveProfile().isEditingScreen(termBuf);
  }

  parseReadingStatus(rowText, termBuf) {
    this.detect(termBuf);
    return this.getActiveProfile().parseReadingStatus(rowText, termBuf);
  }

  isArticleEnd(lastRowText, termBuf, statusResult) {
    return this.getActiveProfile().isArticleEnd(lastRowText, termBuf, statusResult);
  }

  isCursorParked(termBuf) {
    return this.getActiveProfile().isCursorParked(termBuf);
  }

  getPagingSlice(termBuf, statusResult, actualRowIndex) {
    return this.getActiveProfile().getPagingSlice(termBuf, statusResult, actualRowIndex);
  }
}
