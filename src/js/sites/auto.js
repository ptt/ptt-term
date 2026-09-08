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
      if (termBuf && termBuf.rows > 24) {
        console.log(`[AutoSite] Clamping terminal rows from ${termBuf.rows} to 24`);
        const app = termBuf.view?.app;
        if (app?.resizer) {
          app.resizer();
        } else if (termBuf.resize) {
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
      this.name = 'ptt';
      this.charset = this.pttSite.charset;
      this.isLocked = true;
    }

    if (termBuf) {
      termBuf.site = this.detectedSite;
      const app = termBuf.view?.app;
      if (app) {
        app.site = this.detectedSite;
        if (app.conn) {
          app.conn.site = this.detectedSite;
        }
        if (app.stream) {
          app.stream.charset = this.detectedSite.charset;
        }
      }
    }
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
}

