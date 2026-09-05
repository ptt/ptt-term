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

    // Check Maple 3 signatures
    if (/\[←\]離開\s*\[→\]閱讀/.test(row1Text) ||
        /瀏覽\s*P\.\d+/.test(lastRowText) ||
        /文章選讀/.test(lastRowText)) {
      console.log('[AutoProfile] Confirmed and locked Maple 3 profile');
      this.detectedProfile = this.maple3Profile;
      this.isLocked = true;
      return;
    }

    // Check PTT signatures (strong signatures)
    if (this.pttProfile.isMenuScreen(termBuf) ||
        this.pttProfile.parseReadingStatus(lastRowText, termBuf)) {
      console.log('[AutoProfile] Confirmed and locked PTT profile');
      this.detectedProfile = this.pttProfile;
      this.isLocked = true;
    }
  }

  isListScreen(termBuf) {
    this.detect(termBuf);
    return this.getActiveProfile().isListScreen(termBuf);
  }

  isMenuScreen(termBuf) {
    this.detect(termBuf);
    return this.getActiveProfile().isMenuScreen(termBuf);
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
