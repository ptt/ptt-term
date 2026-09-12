import { BaseSite } from './base.js';
import { PttSite } from './ptt.js';
import { Maple3Site } from './maple3.js';

export class AutoSite extends BaseSite {
  constructor() {
    super('auto');
    this.pttSite = new PttSite();
    this.maple3Site = new Maple3Site();
    this.detectedSite = null;
    this.isLocked = false;
    this.hasTelnet = false;

    return new Proxy(this, {
      get(target, prop, receiver) {
        if (
          Object.prototype.hasOwnProperty.call(target, prop) ||
          Object.prototype.hasOwnProperty.call(AutoSite.prototype, prop)
        ) {
          return Reflect.get(target, prop, receiver);
        }
        const active = target.getActiveSite();
        const val = Reflect.get(active, prop, active);
        if (typeof val === 'function') {
          return function (...args) {
            if (!target.isLocked) {
              const termBuf = args.find((a) => a && a.getRowText);
              if (termBuf) {
                target.detect(termBuf);
              }
            }
            return val.apply(target.getActiveSite(), args);
          };
        }
        return val;
      },
      set(target, prop, value, receiver) {
        if (
          Object.prototype.hasOwnProperty.call(target, prop) ||
          Object.prototype.hasOwnProperty.call(AutoSite.prototype, prop)
        ) {
          return Reflect.set(target, prop, value, receiver);
        }
        return Reflect.set(
          target.getActiveSite(),
          prop,
          value,
          target.getActiveSite()
        );
      },
      has(target, prop) {
        if (
          Object.prototype.hasOwnProperty.call(target, prop) ||
          Object.prototype.hasOwnProperty.call(AutoSite.prototype, prop)
        ) {
          return true;
        }
        return prop in target.getActiveSite();
      },
    });
  }

  getActiveSite() {
    return this.detectedSite || this.pttSite;
  }

  attach(term) {
    if (this.pttSite) this.pttSite._attachedTerm = term;
    if (this.maple3Site) this.maple3Site._attachedTerm = term;
    super.attach(term);
  }

  detach() {
    if (this.pttSite) this.pttSite._attachedTerm = null;
    if (this.maple3Site) this.maple3Site._attachedTerm = null;
    super.detach();
  }

  onKey(e) {
    return this.getActiveSite().onKey(e);
  }

  lockSite(siteName, termBuf) {
    if (this.isLocked) {
      return;
    }
    if (siteName === 'maple3') {
      console.log('[AutoSite] Confirmed and locked Maple 3 site');
      this.detectedSite = this.maple3Site;
      this.name = 'maple3';
      this.charset = this.maple3Site.charset;
      this.isLocked = true;
    } else if (siteName === 'ptt') {
      console.log('[AutoSite] Confirmed and locked PTT site');
      this.detectedSite = this.pttSite;
      this.name = 'ptt';
      this.charset = this.pttSite.charset;
      this.isLocked = true;
    }

    if (termBuf) {
      termBuf.site = this.detectedSite;
      const clampRows = siteName === 'maple3' ? 24 : null;
      if (clampRows && termBuf.rows > clampRows && termBuf.resize) {
        termBuf.resize(termBuf.cols, clampRows);
      }
      termBuf.emit?.('site-change', {
        site: this.detectedSite,
        siteName,
        clampRows,
      });
      const app = termBuf.app || termBuf.view?.app;
      if (app) {
        app.site = this.detectedSite;
        if (app.stream) {
          app.stream.charset = this.detectedSite.charset;
        }
        if (clampRows && app.resizer) {
          app.resizer();
        }
      }
    }
  }

  resetLoginPrompt() {
    super.resetLoginPrompt();
    this.pttSite?.resetLoginPrompt?.();
    this.maple3Site?.resetLoginPrompt?.();
  }

  checkLoginPrompt(text, termBuf) {
    return this.getActiveSite().checkLoginPrompt(text, termBuf);
  }

  onTelopt(cmd, opt, termBuf) {
    if (this.isLocked) {
      return;
    }
    this.hasTelnet = true;
    // TELOPT_BINARY = 0x00 / '\x00' (RFC 856). PTT BBS always sends WILL BINARY and DO BINARY during handshake.
    if (opt === 0 || opt === '\x00') {
      console.log(`[AutoSite] Detected TELOPT_BINARY (${cmd}) -> PTT`);
      this.lockSite('ptt', termBuf);
    }
  }

  onData(data, termBuf) {
    if (!this.isLocked) {
      // If Telnet options were negotiated (e.g. TTYPE, ECHO, SGA)
      // but screen data starts arriving and no TELOPT_BINARY was received,
      // this is a non-PTTCurrent BBS (e.g. classic Maple 2.x or very old PTT).
      if (this.hasTelnet) {
        console.log('[AutoSite] Screen data received after Telnet negotiation without TELOPT_BINARY -> Maple or legacy');
        this.lockSite('maple3', termBuf);
      }
    }

    const text = this._decodeIncoming(data);
    if (!this.isLocked && text) {
      if (text.includes('[您的帳號]')) {
        console.log('[AutoSite] Detected Maple BBS login prompt [您的帳號] -> Maple');
        this.lockSite('maple3', termBuf);
      }
    }

    if (!this._loginPromptFired) {
      const active = this.getActiveSite();
      if (active.checkLoginPrompt(text, termBuf) || this.checkLoginPrompt(text, termBuf)) {
        this._loginPromptFired = true;
        active._loginPromptFired = true;
        this.fireLoginPrompt(termBuf);
      }
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

    // Check Maple 3 login signature [您的帳號]
    const startRow = Math.max(1, (termBuf.rows || 24) - 6);
    const endRow = termBuf.rows || 24;
    for (let r = startRow; r <= endRow; r++) {
      const rowStr = termBuf.getRowText(r, 0, cols);
      if (rowStr && rowStr.includes('[您的帳號]')) {
        this.lockSite('maple3', termBuf);
        return;
      }
    }

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
}

