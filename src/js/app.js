// Main Program
import React from 'react';
import { render } from 'preact';
import { AnsiParser } from './ansi_parser';
import { TermView } from './term_view';
import { TermBuf } from './term_buf';
import { TelnetConnection } from './telnet';
import { Websocket } from './websocket';
import { EasyReading } from './easy_reading';
import { ConnectionLog } from './conn_log';
import { TouchController } from './touch_controller';
import { i18n } from './i18n';
import { unescapeStr } from './string_util';
import { setTimer } from './util';
import AppOverlay from '../components/AppOverlay';
import { getSite } from './sites';
import iconLogo from 'Icon/logo.png';
import iconLogoConnect from 'Icon/logo_connect.png';
import iconLogoDisconnect from 'Icon/logo_disconnect.png';

function noop() {}

export class App {
  constructor() {

  this.useMouseBrowsing = true;
  this.preventContextMenuOnMouseUp = false;
  this.skipMouseClick = false;

  this.view = new TermView();
  this.buf = new TermBuf(80, 24);
  this.site = getSite(process.env.SITE_TYPE || 'auto');
  this.buf.site = this.site;
  this.buf.setView(this.view);
  //this.buf.severNotifyStr=this.getLM('messageNotify');
  //this.buf.PTTZSTR1=this.getLM('PTTZArea1');
  //this.buf.PTTZSTR2=this.getLM('PTTZArea2');
  this.view.setBuf(this.buf);
  this.view.setCore(this);
  this.parser = new AnsiParser(this.buf);
  this.easyReading = new EasyReading(this, this.view, this.buf);
  this.connLog = new ConnectionLog(this);
  this.lastEasyReadingWheelTime = 0;
  this.lastEasyReadingHideTime = 0;
  this.suppressWheelUntil = 0;
  this.suppressWheelContinuous = false;
  this.suppressWheelStartedAt = 0;
  this.wheelDeltaYAccum = 0;
  this.lastWheelEventTime = 0;
  this.lastWheelCmdTime = 0;

  //new pref - start
  this.antiIdleTime = 0;
  this.idleTime = 0;
  //new pref - end

  this.inputArea = document.getElementById('t');
  this.BBSWin = document.getElementById('BBSWindow');

  // horizontally center bbs window
  this.BBSWin.setAttribute("align", "center");
  this.view.mainDisplay.style.transformOrigin = 'center';

  this.mouseLeftButtonDown = false;
  this.mouseRightButtonDown = false;

  this.inputAreaFocusTimer = null;
  this.modalShown = false;
  this.activeAlert = null;
  this.onAlertChange = null;

  this.lastSelection = null;

  this.waterball = { userId: '', message: '' };
  this.appFocused = true;

  this.endTurnsOnLiveUpdate = false;
  this.copyOnSelect = false;

  window.addEventListener('click', (e) => {
    this.mouse_click(e);
  }, false);

  window.addEventListener('mousedown', (e) => {
    this.mouse_down(e);
    const ret = this.middleMouse_down(e);
    if (ret === false) {
      e.preventDefault();
    }
  }, false);

  window.addEventListener('mouseup', (e) => {
    this.mouse_up(e);
  }, false);

  document.addEventListener('mousemove', (e) => {
    this.mouse_move(e);
  }, false);

  document.addEventListener('mouseover', (e) => {
    this.mouse_over(e);
  }, false);

  window.addEventListener('wheel', (e) => {
    this.mouse_scroll(e);
  }, { capture: true, passive: false });

  window.addEventListener('focus', (e) => {
    this.appFocused = true;
    if (this.view.titleTimer) {
      this.view.titleTimer.cancel();
      this.view.titleTimer = null;
      this.view.buf.setTitle();
      this.view.notif.close();
    }
  }, false);

  window.addEventListener('blur', (e) => {
    this.appFocused = false;
  }, false);

  this.strToCopy = null;
  document.addEventListener('copy', (e) => {
    this.onDOMCopy(e);
  });
  this.inputArea.addEventListener('paste', (e) => {
    this.onDOMPaste(e);
  });

  this.view.innerBounds = this.getWindowInnerBounds();
  this.view.firstGridOffset = this.getFirstGridOffsets();
  window.onresize = () => {
    this.onWindowResize();
  };

  window.addEventListener('beforeunload', (e) => {
    if (this.conn && this.conn.isConnected && this.buf.pageState != 0) {
      e.returnValue = 'You are currently connected. Are you sure?';
      return e.returnValue;
    }
  });

  this.dblclickTimer=null;
  this.mbTimer=null;
  this.timerEverySec=null;
  this.pushthreadAutoUpdateCount = 0;
  this.maxPushthreadAutoUpdateCount = -1;
  this.onWindowResize();
  this.setupContextMenus();
  this.contextMenuShown = false;

  // init touch controller if device supports touch
  const hasTouch = typeof window !== 'undefined' &&
    (('ontouchstart' in window) || (navigator.maxTouchPoints > 0));
  if (hasTouch) {
    this.touch = new TouchController(this);
  }
  }

  isConnected() {
    return this.connectState == 1 && !!this.conn;
  }

  connect(url, siteType) {
  this.dismissAlert('connection');
  this.connectState = 0;
  console.log('connect: ' + url + ', siteType: ' + siteType);

  const parsed = this._parseURLSimple(url);
  if (!parsed) {
    console.log('failed to parse connect url: ' + url);
    return;
  }
  // TODO(hungte): Should we handle the 'port'?
  const ws_url = parsed.protocol + '://' + parsed.host + parsed.path;
  switch (parsed.protocol) {
  case 'ws':
  case 'wss':
      break;
  default:
      console.log('unsupport connect url protocol: ' + parsed.protocol);
      return;
  }

  this.site = getSite(siteType || process.env.SITE_TYPE || 'auto');
  this.buf.site = this.site;

  this._setupWebsocketConn(ws_url);
  this.connectedUrl = {
    url: url,
    hostname: parsed.hostname,
    host: parsed.host,
    port: parsed.port,
    type: this.site.name,
    siteType: this.site.name,
    easyReadingSupported: true
  };
  }

  _parseURLSimple(url) {
  const tokens = url.split(/:\/\//, 2);
  if (tokens.length != 2)
    return null;
  let protocol = tokens[0];
  // Convert proprietary protocol names.
  switch (protocol) {
  case 'wstelnet':
      protocol = 'ws';
      break;
  case 'wsstelnet':
      protocol = 'wss';
      break;
  }

  const hostAndPath = tokens[1].split(/\//, 2);
  const host = hostAndPath[0];
  const hostport = host.split(/:/);
  if (hostport.length > 2)
    return null;
  const hostname = hostport[0];
  const port = hostport.length > 1 ? parseInt(hostport[1], 10) : {
    'ws': 80,
    'wss': 443,
    'telnet': 23,
    'ssh': 22
  }[protocol];
  return {
    protocol,
    host,
    hostname,
    port,
    path: '/' + (hostAndPath.length > 1 ? hostAndPath[1] : '')
  };
  }

  _setupWebsocketConn(url) {
  const wsConn = new Websocket(url);
  this.connLog.attachSocket(wsConn);
  this._attachConn(new TelnetConnection(wsConn));
  }

  _attachConn(conn) {
  this.conn = conn;
  this.conn.addEventListener('open', () => this.onConnect());
  this.conn.addEventListener('close', () => this.onClose());
  this.conn.addEventListener('telopt', (e) => {
    this.site.onTelopt(e.detail.cmd, e.detail.opt, this.buf);
  });
  this.conn.addEventListener('data', (e) => {
    this.site.onData(e.detail.data, this.buf);
    this.onData(e.detail.data);
  });
  this.conn.addEventListener('doNaws', (e) => {
    conn.sendWillNaws();
    conn.sendNaws(this.buf.cols, this.buf.rows);
  });
  }

  onConnect() {
  this.conn.isConnected = true;
  this.view.setConn(this.conn);
  console.info("app onConnect");
  this.connectState = 1;
  this.updateTabIcon('connect');
  this.view.buf.setTitle({conn: this.connectedUrl.hostname});
  this.idleTime = 0;
  this.timerEverySec = setTimer(true, () => {
    this.antiIdle();
    this.view.onBlink();
    this.incrementCountToUpdatePushthread();
  }, 1000);
  }

  onData(data) {
  this.parser.feed(data);

  if (this.buf.bellOccurred) {
    this.buf.bellOccurred = false;
    if (!this.appFocused && this.view.enableNotifications) {
      // parse notification (e.g. waterball) delegated to site strategy
      const wb = this.site.parseNotification(this.buf);
      if (wb) {
        if ('userId' in wb && wb.userId) {
          this.waterball.userId = wb.userId;
        }
        if ('message' in wb && wb.message) {
          this.waterball.message = wb.message;
        }
        this.view.showWaterballNotification();
      }
    }
  }
  }

  onClose() {
  console.info("app onClose");
  if (this.timerEverySec) {
    this.timerEverySec.cancel();
  }
  this.conn.isConnected = false;

  this.cancelMbTimer();

  this.connectState = 2;
  this.idleTime = 0;

  this.showAlert('connection', {
    onDismiss: () => {
      this.connect(this.connectedUrl.url);
    }
  });
  this.updateTabIcon('disconnect');
  }

  sendData(str) {
  if (this.connectState == 1)
    this.conn.convSend(str);
  }

  cancelMbTimer() {
  if (this.mbTimer) {
    this.mbTimer.cancel();
    this.mbTimer = null;
  }
  }

  setMbTimer() {
  this.cancelMbTimer();
  this.mbTimer = setTimer(false, () => {
    this.mbTimer.cancel();
    this.mbTimer = null;
    this.skipMouseClick = false;
  }, 100);
  }

  cancelDblclickTimer() {
  if (this.dblclickTimer) {
    this.dblclickTimer.cancel();
    this.dblclickTimer = null;
  }
  }

  setDblclickTimer() {
  this.cancelDblclickTimer();
  this.dblclickTimer = setTimer(false, () => {
    this.dblclickTimer.cancel();
    this.dblclickTimer = null;
  }, 350);
  }

  setInputAreaFocus() {
  if (this.modalShown || this.contextMenuShown || (this.touch && this.touch.touchStarted))
    return;
  if (document.activeElement === this.inputArea)
    return;
  //this.DocInputArea.disabled="";
  this.inputArea.focus();
  }

  isSelectionCollapsed() {
  if (this.view.useCanvasEngine && !this.view.isEasyReadingActive()) {
    return !this.view.getSelectionColRow();
  }
  return window.getSelection().isCollapsed;
  }

// FIXME: Injected when enabled. See: src/components/ContextMenu/index.js
  onToggleLiveHelperModalState() {}
// FIXME: Injected when enabled. See: src/components/ContextMenu/index.js
  onDisableLiveHelperModalState() {}

  switchToEasyReadingMode(doSwitch) {
  this.easyReading.leaveCurrentPost();
  if (doSwitch) {
    this.onDisableLiveHelperModalState();
    // clear the deep cloned copy of lines
    this.buf.pageLines = [];
    if (this.buf.pageState == 3 && this.conn) {
      const cmd = this.site.getReenterArticleCommand(this.buf);
      this.conn.send(cmd);
    }
  } else {
    this.view.hideEasyReading();
  }
  // request the full screen
  if (this.conn)
    this.conn.send(unescapeStr('^L'));
  }

  async doCopy(str) {
    if (typeof str !== 'string') return;
    if (str.indexOf('\x1b') < 0) {
      str = str.replace(/\r\n/g, '\r');
      str = str.replace(/\n/g, '\r');
      str = str.replace(/ +\r/g, '\r');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(str);
        return;
      } catch (err) {
        // Fall back to execCommand if permission denied or unsupported context
      }
    }
    this.strToCopy = str;
    try {
      document.execCommand('copy');
    } catch (err) {}
    this.strToCopy = null;
  }

  doCopyAnsi() {
  if (!this.lastSelection)
    return;

  const selection = this.lastSelection;
  let pageLines = null;
  if (this.view.isEasyReadingActive() && this.buf.pageState == 3) {
    pageLines = this.buf.pageLines;
  }

  let ansiText = '';
  if (selection.start.row == selection.end.row) {
    ansiText += this.buf.getText(selection.start.row, selection.start.col, selection.end.col, true, true, false, pageLines);
  } else {
    for (let i = selection.start.row; i <= selection.end.row; ++i) {
      let scol = 0;
      let ecol = this.buf.cols-1;
      if (i == selection.start.row) {
        scol = selection.start.col;
      } else if (i == selection.end.row) {
        ecol = selection.end.col;
      }
      ansiText += this.buf.getText(i, scol, ecol, true, true, false, pageLines);
      if (i != selection.end.row ) {
        ansiText += '\r';
      }
    }
  }

  this.doCopy(ansiText);
  }

  onDOMCopy(e) {
  if (this.strToCopy) {
    e.clipboardData.setData('text', this.strToCopy);
    e.preventDefault();
    console.log('copied: ', this.strToCopy);
  } else {
    let text = this.view.getSelectedText();
    if (text) {
      if (text.indexOf('\x1b') < 0) {
        text = text.replace(/\r\n/g, '\r').replace(/\n/g, '\r').replace(/ +\r/g, '\r');
      }
      e.clipboardData.setData('text', text);
      e.preventDefault();
    }
  }
  }

  async doPaste() {
    if (navigator.clipboard && navigator.clipboard.readText) {
      try {
        const text = await navigator.clipboard.readText();
        this.onPasteDone(text);
      } catch {
        this.showPasteUnimplemented();
      }
    } else {
      this.showPasteUnimplemented();
    }
  }

  showPasteUnimplemented() {
    this.modalShown = true;
    this.showAlert('pasteShortcut', {
      onDismiss: () => {
        this.modalShown = false;
      }
    });
  }

  onPasteDone(content) {
  //this.conn.convSend(content);
  this.view.onTextInput(content, true);
  }

  onDOMPaste(e) {
  let str = e.clipboardData.getData('text');
  if (str) {
    e.preventDefault();
    this.onPasteDone(str);
  }
  }

  onSymFont(content) {
  console.log("using " + (content ? "extension" : "system") + " font");
  const font_src = content ? 'src: url('+content.data+');' : '';
  const css = '@font-face { font-family: MingLiUNoGlyph; '+font_src+' }';
  const style = document.createElement('style');
  style.type = 'text/css';
  style.innerHTML = css;
  document.getElementsByTagName('head')[0].appendChild(style);
  }

  doSelectAll() {
  this.view.selectAll();
  }

  doSearchGoogle(searchTerm) {
    if (!searchTerm) return;
    window.open('https://www.google.com/search?q=' + encodeURIComponent(searchTerm), '_blank', 'noopener,noreferrer');
  }

  doOpenUrlNewTab(a) {
    if (!a) return;
    const url = a.href || (typeof a === 'string' ? a : null);
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  incrementCountToUpdatePushthread(interval) {
  if (this.maxPushthreadAutoUpdateCount == -1) {
    this.pushthreadAutoUpdateCount = 0;
    return;
  }

  if (++this.pushthreadAutoUpdateCount >= this.maxPushthreadAutoUpdateCount) {
    this.pushthreadAutoUpdateCount = 0;
    if ((this.buf.pageState == 3 || this.buf.pageState == 2) && this.conn) {
      this.site.refreshLiveThread(this.conn, this.buf);
    }
  }
  }
  setAutoPushthreadUpdate(seconds) {
  this.maxPushthreadAutoUpdateCount = seconds;
  }

  onWindowResize() {
  this.view.innerBounds = this.getWindowInnerBounds();

  if (this.resizeTimeout) {
    clearTimeout(this.resizeTimeout);
  }
  if (this.resizer) {
    this.resizeTimeout = setTimeout(() => {
      this.resizeTimeout = null;
      if (this.resizer) {
        this.resizer();
      }
    }, 500);
  } else {
    this.view.fontResize();
  }
  }

  setTermSize(cols, rows) {
  const requestedCols = cols;
  const requestedRows = rows;
  const clamped = this.site.clampTermSize(cols, rows);
  cols = clamped.cols;
  rows = clamped.rows;

  console.debug(`[setTermSize] decided size: ${cols}x${rows} (requested: ${requestedCols}x${requestedRows}, current: ${this.buf.cols}x${this.buf.rows}, site: ${this.site.name})`);

  if (this.buf.cols == cols && this.buf.rows == rows) {
    return;
  }

  this.buf.resize(cols, rows);
  if (this.conn) {
    this.conn.sendNaws(cols, rows);
  }
  }

  switchMouseBrowsing() {
    this.useMouseBrowsing = !this.useMouseBrowsing;
    this.buf.useMouseBrowsing = this.useMouseBrowsing;

  if (!this.buf.useMouseBrowsing) {
    this.buf.BBSWin.style.cursor = 'auto';
    this.buf.clearHighlight();
    this.buf.mouseCursor=0;
    this.buf.nowHighlight=-1;
    this.buf.tempMouseCol=0;
    this.buf.tempMouseRow=0;
  } else {
    this.buf.resetMousePos();
    this.view.redraw(true);
    this.view.updateCursorPos();
  }
  }

  antiIdle() {
    if (this.antiIdleTime && this.idleTime > this.antiIdleTime) {
      if (this.connectState == 1) {
        this.site.sendAntiIdle(this.conn);
        this.idleTime = 0;
      }
    } else {
      if (this.connectState == 1)
        this.idleTime += 1000;
    }
  }

  updateTabIcon(aStatus) {
  let icon = iconLogo;
  switch (aStatus) {
    case 'connect':
      icon = iconLogoConnect;
      this.setInputAreaFocus();
      break;
    case 'disconnect':
      icon = iconLogoDisconnect;
      break;
    default:
      break;
  }

  const link = document.querySelector("link[rel~='icon']");
  if (!link) {
    const newLink = document.createElement("link");
    newLink.setAttribute("rel", "icon");
    newLink.setAttribute("href", icon);
    document.head.appendChild(newLink);
  } else {
    link.setAttribute("href", icon);
  }
  }

// use this method to get better window size in case of page zoom != 100%
  getWindowInnerBounds() {
  const width = document.documentElement.clientWidth - this.view.bbsViewMargin * 2;
  const height = document.documentElement.clientHeight - this.view.bbsViewMargin * 2;
  const bounds = {
    width: width,
    height: height
  };
  return bounds;
  }

  getFirstGridOffsets() {
  const container = document.querySelector(".main");
  return {
    top: container ? container.offsetTop : 0,
    left: container ? container.offsetLeft : 0
  };
  }

  clientToPos(cX, cY) {
  let x;
  let y;
  const w = this.view.innerBounds.width;
  const h = this.view.innerBounds.height;
  if (this.view.scaleX != 1 || this.view.scaleY != 1) {
    x = cX - ((w - (this.view.chw * this.buf.cols) * this.view.scaleX) / 2);
    y = cY - ((h - (this.view.chh * this.buf.rows) * this.view.scaleY) / 2);
  } else {
    x = cX - parseFloat(this.view.firstGridOffset.left);
    y = cY - parseFloat(this.view.firstGridOffset.top);
  }
  let col = Math.floor(x / (this.view.chw * this.view.scaleX));
  let row = Math.floor(y / (this.view.chh * this.view.scaleY));

  if (row < 0)
    row = 0;
  else if (row >= this.buf.rows-1)
    row = this.buf.rows-1;

  if (col < 0)
    col = 0;
  else if (col >= this.buf.cols-1)
    col = this.buf.cols-1;

  return {col: col, row: row};
  }

  _navigateRowAndEnter(targetRow) {
  const diff = this.buf.cur_y - targetRow;
  const sendstr =
    (diff > 0 ? '\x1b[A'.repeat(diff) : '\x1b[B'.repeat(-diff)) + '\r';
  this.conn.send(sendstr);
  }

  onMouse_click(e) {
  const cX = e.clientX, cY = e.clientY;
  if (!this.conn || !this.conn.isConnected)
    return;

  // disable auto update pushthread if any command is issued;
  this.onDisableLiveHelperModalState();

  // TODO make a responder stack.
  this.easyReading._onMouseClick(e);
  if (e.defaultPrevented)
    return;

  // TODO Move this to mouse browsing module.
  switch (this.buf.mouseCursor) {
    case 1:
      this.conn.send('\x1b[D');  //Arrow Left
      break;
    case 2:
      this.conn.send('\x1b[5~'); //Page Up
      break;
    case 3:
      this.conn.send('\x1b[6~'); //Page Down
      break;
    case 4:
      this.conn.send('\x1b[1~'); //Home
      break;
    case 5:
      this.conn.send('\x1b[4~'); //End
      break;
    case 6:
      if (this.buf.nowHighlight != -1) {
        this._navigateRowAndEnter(this.buf.nowHighlight);
      }
      break;
    case 7: {
      const pos = this.clientToPos(cX, cY);
      this._navigateRowAndEnter(pos.row);
      break;
    }
    case 0:
      this.conn.send('\x1b[D'); //Arrow Left
      break;
    case 8: {
      const cmd = this.site.getThreadCommand('prevThread');
      if (cmd) this.conn.send(cmd);
      break;
    }
    case 9: {
      const cmd = this.site.getThreadCommand('nextThread');
      if (cmd) this.conn.send(cmd);
      break;
    }
    case 10: {
      const cmd = this.site.getThreadCommand('firstThread');
      if (cmd) this.conn.send(cmd);
      break;
    }
    case 12: {
      const cmd = this.site.getThreadCommand('refreshPost');
      if (cmd) this.conn.send(cmd);
      break;
    }
    case 13: {
      const cmd = this.site.getThreadCommand('lastThreadList');
      if (cmd) this.conn.send(cmd);
      break;
    }
    case 14: {
      const cmd = this.site.getThreadCommand('lastThreadReading');
      if (cmd) this.conn.send(cmd);
      break;
    }
    default:
      //do nothing
      break;
  }
  }

  onMouse_move(cX, cY) {
  const pos = this.clientToPos(cX, cY);
  this.buf.onMouse_move(pos.col, pos.row, false);
  }

  resetMouseCursor(cX, cY) {
  this.buf.BBSWin.style.cursor = 'auto';
  this.buf.mouseCursor = 11;
  }

  onValuesPrefChange(values) {
  for (const name in values) {
    this.onPrefChange(name, values[name]);
  }

  // These prefs have to be processed as a whole.
  try {
    this.resizer = null;

    switch (values.termSizeMode) {
      case 'fixed-term-size':
        this.view.fontFitWindowWidth = values.fontFitWindowWidth;

        let size = values.termSize;
        this.setTermSize(size.cols, size.rows);
        this.view.fontResize();
        this.view.redraw(true);
        break;

      case 'fixed-font-size':
        this.view.fontFitWindowWidth = false;

        let fontSize = values.fontSize || 24;
        this.resizer = () => {
          let size = this.view.calcTermSizeFromFont(fontSize);
          this.setTermSize(size.cols, size.rows);
          this.view.fixedResize(fontSize);
          this.view.redraw(true);
        };
        // Immediately recalc once.
        this.resizer();
        break;

      case 'max-font-size':
        this.view.fontFitWindowWidth = false;

        let maxFontSize =
          values.maxFontSize !== undefined
            ? values.maxFontSize
            : values.fontSize || 999;
        let minSize = {cols: 80, rows: 24};
        this.resizer = () => {
          let scaledFontSize = this.view.calcFontSizeFromTerm(minSize.cols, minSize.rows);
          let fontSize = Math.min(scaledFontSize, maxFontSize);
          let size = this.view.calcTermSizeFromFont(fontSize);
          this.setTermSize(size.cols, size.rows);
          this.view.fixedResize(fontSize);
          this.view.redraw(true);
        };
        // Immediately recalc once.
        this.resizer();
        break;
    }

    const mainEl = document.querySelector('.main');
    if (mainEl) {
      mainEl.classList.toggle('trans-fix', !!this.view.fontFitWindowWidth);
    }
  } catch (e) {}
  }

  onPrefChange(name, value) {
  try {
    switch (name) {
    case 'useMouseBrowsing': {
      const useMouseBrowsing = !!value;
      this.useMouseBrowsing = useMouseBrowsing;
      this.buf.useMouseBrowsing = useMouseBrowsing;

      if (!this.buf.useMouseBrowsing) {
        this.buf.BBSWin.style.cursor = 'auto';
        this.buf.clearHighlight();
        this.buf.mouseCursor = 0;
        this.buf.nowHighlight = -1;
        this.buf.tempMouseCol = 0;
        this.buf.tempMouseRow = 0;
      }
      this.buf.resetMousePos();
      this.view.redraw(true);
      this.view.updateCursorPos();
      break;
    }
    case 'mouseBrowsingHighlight':
      this.buf.highlightCursor = value;
      this.view.redraw(true);
      this.view.updateCursorPos();
      break;
    case 'mouseBrowsingHighlightColor':
      this.view.highlightBG = value;
      this.view.updateHighlightColor();
      this.view.updateCursorPos();
      break;
    case 'mouseLeftFunction':
      this.view.leftButtonFunction = value;
      if (typeof(this.view.leftButtonFunction) == 'boolean') {
        this.view.leftButtonFunction = this.view.leftButtonFunction ? 1:0;
      }
      break;
    case 'mouseMiddleFunction':
      this.view.middleButtonFunction = value;
      break;
    case 'mouseWheelFunction1':
      this.view.mouseWheelFunction1 = value;
      break;
    case 'mouseWheelFunction2':
      this.view.mouseWheelFunction2 = value;
      break;
    case 'mouseWheelFunction3':
      this.view.mouseWheelFunction3 = value;
      break;
    case 'copyOnSelect':
      this.copyOnSelect = value;
      break;
    case 'endTurnsOnLiveUpdate':
      this.endTurnsOnLiveUpdate = value;
      break;
    case 'enablePicPreview':
      // TODO: move this to ImagePreview.
      this.view.enablePicPreview = value;
      break;
    case 'picPreviewWhitelistOnly':
      this.view.picPreviewWhitelistOnly = value;
      break;
    case 'enableNotifications':
      this.view.enableNotifications = value;
      if (value && typeof Notification !== 'undefined' && Notification.requestPermission && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
      break;
    case 'enableEasyReading':
      /*if (this.connectedUrl.hostname == 'ptt.cc') {
        this.view.useEasyReadingMode = value;
      } else {
        this.view.useEasyReadingMode = false;
      }*/
      break;
    case 'antiIdleTime':
      this.antiIdleTime = value * 1000;
      break;
    case 'dbcsDetect':
      this.view.dbcsDetect = value;
      break;
    case 'lineWrap':
      this.conn.lineWrap = value;
      break;
    case 'fontFace': {
      let fontFace = value;
      if (!fontFace) 
        fontFace='monospace';
      this.view.setFontFace(fontFace);
      break;
    }
    case 'bbsMargin': {
      const margin = value;
      this.view.bbsViewMargin = margin;
      this.onWindowResize();
      break;
    }
    case 'cursorStyle':
      this.view.setCursorStyle(value);
      break;
    case 'useCanvasEngine':
      this.view.useCanvasEngine = !!value;
      if (this.view.fpsMeter) {
        this.view.fpsMeter.setIsCanvas(this.view.useCanvasEngine);
      }
      this.view.redraw(true);
      break;
    case 'showFps':
      this.view.setShowFps(!!value);
      break;
    case 'smoothAnsi':
    case 'smoothAnsiArt':
      this.view.smoothAnsiArt = !!value;
      if (this.view.fpsMeter) {
        this.view.fpsMeter.setSmoothAnsiArt(this.view.smoothAnsiArt);
      }
      this.view.redraw(true);
      break;
    case 'captureConnectionLog':
      this.connLog.setEnabled(!!value);
      break;
    default:
      break;
    }
  } catch(e) {
    // eats all errors
    return;
  }
  }

  checkClass(cn) {
    return cn.indexOf("nomouse_command") >= 0 || cn.indexOf("conn-log") >= 0;
  }

  mouse_click(e) {
  if (this.modalShown || this.contextMenuShown)
    return;
  if (this.connLog && this.connLog.contains(e.target))
    return;
  const skipMouseClick = this.skipMouseClick;
  this.skipMouseClick = false;

  if (e.button == 2) { //right button
  } else if (e.button === 0) { //left button
    if (e.target && e.target.closest('a')) {
      return;
    }
    if (this.isSelectionCollapsed()) { //no anything be select
      if (this.buf.useMouseBrowsing) {
        let doMouseCommand = true;
        if (e.target.className)
          if (this.checkClass(e.target.className))
            doMouseCommand = false;
        if (e.target.tagName)
          if(e.target.tagName.indexOf("menuitem") >= 0 )
            doMouseCommand = false;
        if (skipMouseClick) {
          doMouseCommand = false;
          const pos = this.clientToPos(e.clientX, e.clientY);
          this.buf.onMouse_move(pos.col, pos.row, true);
        }
        if (doMouseCommand) {
          this.onMouse_click(e);
          this.setDblclickTimer();
          e.preventDefault();
          this.setInputAreaFocus();
        }
      } else if (this.view.leftButtonFunction) {
        if (this.view.leftButtonFunction == 1) {
          this.setBBSCmd('doEnter');
          e.preventDefault();
          this.setInputAreaFocus();
        } else if (this.view.leftButtonFunction == 2) {
          this.setBBSCmd('doRight');
          e.preventDefault();
          this.setInputAreaFocus();
        }
      }
    }
  } else if (e.button == 1) { //middle button
  } else {
  }
  }

  middleMouse_down(e) {
  if (this.connLog && this.connLog.contains(e.target))
    return;
  if (e.button == 1) {
    if (e.target && e.target.closest('a')) {
      return;
    }
    if (this.view.middleButtonFunction == 1) {
      this.conn.send('\r');
      return false;
    } else if (this.view.middleButtonFunction == 2) {
      this.conn.send('\x1b[D');
      return false;
    } else if (this.view.middleButtonFunction == 3) {
      this.doPaste();
      return false;
    }
  }
  }

  mouse_down(e) {
  if (this.modalShown || this.contextMenuShown)
    return;
  if (this.connLog && this.connLog.contains(e.target))
    return;
  //0=left button, 1=middle button, 2=right button
  if (e.button === 0) {
    if (this.buf.useMouseBrowsing) {
      if (this.dblclickTimer) { //skip
        e.preventDefault();
        e.stopPropagation();
        e.cancelBubble = true;
      }
      this.setDblclickTimer();
    }
    this.mouseLeftButtonDown = true;
    //this.setInputAreaFocus();
    if (!this.isSelectionCollapsed())
      this.skipMouseClick = true;

    let onbbsarea = true;
    if (e.target.className)
      if (this.checkClass(e.target.className))
        onbbsarea = false;
    if (e.target.tagName)
      if (e.target.tagName.indexOf("menuitem") >= 0 )
        onbbsarea = false;
  } else if(e.button == 2) {
    this.mouseRightButtonDown = true;
  }
  }

  mouse_up(e) {
  if (this.modalShown || this.contextMenuShown)
    return;
  if (this.connLog && this.connLog.contains(e.target))
    return;
  //0=left button, 1=middle button, 2=right button
  if (e.button === 0) {
    this.setMbTimer();
    this.mouseLeftButtonDown = false;
  } else if (e.button == 2) {
    this.mouseRightButtonDown = false;
  }

  if (e.button === 0) { //left button
    if (this.isSelectionCollapsed()) { //no anything be select
      if (this.buf.useMouseBrowsing)
        this.onMouse_move(e.clientX, e.clientY);

      this.setInputAreaFocus();
      let preventDefault = true;
      if (e.target.className)
        if (this.checkClass(e.target.className))
          preventDefault = false;
      if (e.target.tagName)
        if (e.target.tagName.indexOf("menuitem") >= 0 )
          preventDefault = false;
      if (preventDefault)
        e.preventDefault();
    } else { //something has be select
      if (this.copyOnSelect && (!this.view || !this.view.useCanvasEngine || this.view.isEasyReadingActive())) {
        this.doCopy(this.view ? this.view.getSelectedText() : window.getSelection().toString().replace(/\u00a0/g, " "));
      }
    }
    this.inputAreaFocusTimer = setTimer(false, () => {
      if (this.inputAreaFocusTimer) {
        this.inputAreaFocusTimer.cancel();
        this.inputAreaFocusTimer = null;
      }
      if (!this.contextMenuShown && this.isSelectionCollapsed())
        this.setInputAreaFocus();
    }, 10);
  } else if (e.button == 2) {
    // right button: opens context menu, do not steal focus or set focus timer
  } else {
    this.setInputAreaFocus();
    e.preventDefault();
  }
  }

  mouse_move(e) {
  if (this.connLog && this.connLog.contains(e.target))
    return;
  if (this.buf.useMouseBrowsing) {
    if (this.isSelectionCollapsed()) {
      if(!this.mouseLeftButtonDown)
        this.onMouse_move(e.clientX, e.clientY);
    } else
      this.resetMouseCursor();
  }

  }

  mouse_over(e) {
  if (this.modalShown || this.contextMenuShown)
    return;
  if (this.connLog && this.connLog.contains(e.target))
    return;

  if (this.isSelectionCollapsed() && !this.mouseLeftButtonDown)
    this.setInputAreaFocus();
  }

  suppressInertialWheel(durationMs) {
  const now = Date.now();
  const duration = durationMs || ((this.lastEasyReadingWheelTime && (now - this.lastEasyReadingWheelTime < 1000)) ? 1200 : 300);
  this.suppressWheelUntil = Math.max(this.suppressWheelUntil || 0, now + duration);
  this.suppressWheelContinuous = true;
  this.suppressWheelStartedAt = now;
  this.wheelDeltaYAccum = 0;
  }

  mouse_scroll(e) {
  if (this.modalShown) 
    return;
  if (this.connLog && this.connLog.contains(e.target))
    return;

  const now = Date.now();

  // 1. If currently in Easy Reading, allow native browser scrolling within overlay
  if (this.view.isEasyReadingActive()) {
    this.lastEasyReadingWheelTime = now;
    return;
  }

  // 2. Target check: if event target is still the easyReadingOverlay (e.g. while fading/hiding)
  const isOverlayTarget = !!(this.view.easyReadingOverlay && e.target &&
    (e.target === this.view.easyReadingOverlay || this.view.easyReadingOverlay.contains(e.target)));

  // 3. Suppression check (after exiting easy reading or explicit suppression)
  // Trackpad inertia can coast for 1-2 seconds after swiping.
  const recentlyScrolledInEasyReading = this.lastEasyReadingWheelTime && (now - this.lastEasyReadingWheelTime < 1000);
  const recentlyExited = this.lastEasyReadingHideTime && (now - this.lastEasyReadingHideTime < 600);
  const isSuppressed = isOverlayTarget ||
                     (this.suppressWheelUntil && now < this.suppressWheelUntil) ||
                     recentlyScrolledInEasyReading ||
                     recentlyExited;

  if (isSuppressed) {
    // If events are continuing continuously (< 200ms between events),
    // inertia is still coasting. Extend suppression window (capped at 2500ms total).
    if (this.lastWheelEventTime && (now - this.lastWheelEventTime < 200)) {
      if (!this.suppressWheelStartedAt) {
        this.suppressWheelStartedAt = now;
      }
      if (now - this.suppressWheelStartedAt < 2500) {
        this.suppressWheelUntil = Math.max(this.suppressWheelUntil || 0, now + 350);
      }
    }
    this.lastWheelEventTime = now;
    this.wheelDeltaYAccum = 0;
    e.stopPropagation();
    e.preventDefault();
    return;
  }

  // Suppression period ended
  this.suppressWheelUntil = 0;
  this.suppressWheelContinuous = false;
  this.suppressWheelStartedAt = 0;
  this.lastEasyReadingWheelTime = 0;

  // 4. Normal BBS Terminal Wheel Handling with Pixel Accumulation & Throttling
  let deltaY = e.deltaY;
  if (e.deltaMode === 1) { // DOM_DELTA_LINE
    deltaY *= 30;
  } else if (e.deltaMode === 2) { // DOM_DELTA_PAGE
    deltaY *= 300;
  }

  // Reset accumulation if scrolling paused > 200ms or reversed direction
  if (this.lastWheelEventTime && (now - this.lastWheelEventTime > 200)) {
    this.wheelDeltaYAccum = 0;
  }
  if ((this.wheelDeltaYAccum > 0 && deltaY < 0) || (this.wheelDeltaYAccum < 0 && deltaY > 0)) {
    this.wheelDeltaYAccum = 0;
  }

  this.lastWheelEventTime = now;
  this.wheelDeltaYAccum = (this.wheelDeltaYAccum || 0) + deltaY;

  // Threshold in pixels before triggering 1 BBS step
  const threshold = Math.max(35, this.view.chh || 35);

  if (Math.abs(this.wheelDeltaYAccum) < threshold) {
    e.stopPropagation();
    e.preventDefault();
    return;
  }

  // Rate limit BBS commands: at least 60ms between commands to avoid telnet buffer queueing
  if (this.lastWheelCmdTime && (now - this.lastWheelCmdTime < 60)) {
    e.stopPropagation();
    e.preventDefault();
    return;
  }

  const isScrollUp = this.wheelDeltaYAccum < 0;

  // Reset accumulation for discrete mouse clicks (|deltaY| >= 100), or consume threshold
  if (Math.abs(deltaY) >= 100) {
    this.wheelDeltaYAccum = 0;
  } else {
    this.wheelDeltaYAccum -= (isScrollUp ? -threshold : threshold);
  }
  this.lastWheelCmdTime = now;

  // scroll = up/down
  // hold right mouse key + scroll = page up/down
  // hold left mouse key + scroll = thread prev/next
  const mouseWheelActionsUp = [ 'none', 'doArrowUp', 'doPageUp', 'previousThread' ];
  const mouseWheelActionsDown = [ 'none', 'doArrowDown', 'doPageDown', 'nextThread' ];

  if (isScrollUp) {
    if (this.mouseRightButtonDown) {
      const action = mouseWheelActionsUp[this.view.mouseWheelFunction2];
      this.setBBSCmd(action);
    } else if (this.mouseLeftButtonDown) {
      const action = mouseWheelActionsUp[this.view.mouseWheelFunction3];
      this.setBBSCmd(action);
    } else {
      const action = mouseWheelActionsUp[this.view.mouseWheelFunction1];
      this.setBBSCmd(action);
    }
  } else {
    if (this.mouseRightButtonDown) {
      const action = mouseWheelActionsDown[this.view.mouseWheelFunction2];
      this.setBBSCmd(action);
    } else if (this.mouseLeftButtonDown) {
      const action = mouseWheelActionsDown[this.view.mouseWheelFunction3];
      this.setBBSCmd(action);
    } else {
      const action = mouseWheelActionsDown[this.view.mouseWheelFunction1];
      this.setBBSCmd(action);
    }
  }

  e.stopPropagation();
  e.preventDefault();

  if (this.mouseRightButtonDown) //prevent context menu popup
    this.preventContextMenuOnMouseUp = true;
  if (this.mouseLeftButtonDown) {
    if (this.buf.useMouseBrowsing) {
      this.skipMouseClick = true;
    }
  }
  }

  setBBSCmd(cmd) {
  switch (cmd) {
    case "doArrowUp":
      if (this.view.isEasyReadingActive()) {
        if (!this.easyReading._scrollBy(-1)) {
          this.easyReading.leaveCurrentPost();
          this.conn.send('\x1b[D\x1b[A\x1b[C');
        }
      } else {
        this.conn.send('\x1b[A');
      }
      break;
    case "doArrowDown":
      if (this.view.isEasyReadingActive()) {
        if (!this.easyReading._scrollBy(1)) {
          this.easyReading.leaveCurrentPost();
          this.conn.send('\x1b[B');
        }
      } else {
        this.conn.send('\x1b[B');
      }
      break;
    case "doPageUp":
      if (this.view.isEasyReadingActive()) {
        this.easyReading._scrollBy(-this.easyReading._turnPageLines);
      } else {
        this.conn.send('\x1b[5~');
      }
      break;
    case "doPageDown":
      if (this.view.isEasyReadingActive()) {
        this.easyReading._scrollBy(this.easyReading._turnPageLines);
      } else {
        this.conn.send('\x1b[6~');
      }
      break;
    case "previousThread": {
      const cmd = this.site.getThreadCommand("prevThread");
      if (cmd) {
        if (this.view.isEasyReadingActive()) {
          this.easyReading.leaveCurrentPost();
          this.conn.send(cmd);
        } else if (this.buf && (this.buf.pageState == 2 || this.buf.pageState == 3 || this.buf.pageState == 4)) {
          this.conn.send(cmd);
        }
      }
      break;
    }
    case "nextThread": {
      const cmd = this.site.getThreadCommand("nextThread");
      if (cmd) {
        if (this.view.isEasyReadingActive()) {
          this.easyReading.leaveCurrentPost();
          this.conn.send(cmd);
        } else if (this.buf && (this.buf.pageState == 2 || this.buf.pageState == 3 || this.buf.pageState == 4)) {
          this.conn.send(cmd);
        }
      }
      break;
    }
    case "doEnter":
      if (this.view.isEasyReadingActive()) {
        if (!this.easyReading._scrollBy(1)) {
          this.easyReading.leaveCurrentPost();
          this.conn.send('\r');
        }
      } else {
        this.conn.send('\r');
      }
      break;
    case "doRight":
      if (this.view.isEasyReadingActive()) {
        if (!this.easyReading._scrollBy(this.easyReading._turnPageLines)) {
          this.easyReading.leaveCurrentPost();
          this.conn.send('\x1b[C');
        }
      } else {
        this.conn.send('\x1b[C');
      }
      break;
    default:
      break;
  }
  }

  showAlert(type, options = {}) {
    const { onDismiss, ...props } = options;
    this.activeAlert = { type, onDismiss, props };
    if (this.onAlertChange) {
      this.onAlertChange(this.activeAlert);
    }
  }

  dismissAlert(type) {
    if (!this.activeAlert) return;
    if (type && this.activeAlert.type !== type) return;
    this.activeAlert = null;
    if (this.onAlertChange) {
      this.onAlertChange(null);
    }
  }

  setupOverlay() {
    render(
      <AppOverlay
        app={this}
      />,
      document.getElementById('cmenuReact')
    );
  }

  setupContextMenus() {
    this.setupOverlay();
  }
}
