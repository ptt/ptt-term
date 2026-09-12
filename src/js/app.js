// Main Program
import React from 'react';
import { render } from 'preact';
import { AnsiParser, AnsiFilter } from './ansi_parser';
import { TermView } from './term_view';
import { TermBuf } from './term_buf';
import { TelnetConnection, TelnetFilter } from './telnet';
import { Stream } from './stream';
import { Websocket } from './websocket';
import { BUILTIN_PLUGINS } from '../plugins/index.js';
import { TouchController } from './touch_controller';
import { _, setupI18n } from './i18n';
import { unescapeStr } from './string_util';
import { setTimer, parseConnectUrl } from './util';
import { hasWebKitImeQuirk, shouldPreserveDomSelection } from './quirks';
import { setTerminalBellEnabled, setWindowFocused } from './bell.js';
import { readValuesWithDefault, writeValues, updatePref } from './pref.js';
import { applyColorScheme } from './color_schemes.js';
import AppOverlay from '../components/AppOverlay';
import { getSite, PAGE_STATE } from './sites';
import { EventEmitter } from './event';
import { InputInterceptors } from './input_interceptors.js';
import iconLogo from 'Icon/logo.png';
import iconLogoConnect from 'Icon/logo_connect.png';
import iconLogoDisconnect from 'Icon/logo_disconnect.png';

function noop() {}

export class App extends EventEmitter {
  constructor() {
    super();

  this._useMouseBrowsing = true;
  this.preventContextMenuOnMouseUp = false;
  this.skipMouseClick = false;

  // Browser quirks handling: WebKit IME composition, Gecko DOM selection preservation
  this.hasWebKitImeQuirk = hasWebKitImeQuirk();
  this.preserveDomSelection = shouldPreserveDomSelection();
  this.view = new TermView({
    hasWebKitImeQuirk: this.hasWebKitImeQuirk,
    preserveDomSelection: this.preserveDomSelection,
  });
  this.buf = new TermBuf(80, 24);
  this.buf.app = this;
  this.enableVisualBell = false;
  this.backspaceKey = 'control-h';
  this.deleteKey = 'escape-sequence';
  this.lineHeight = 1.0;
  this.buf.on('bell', () => {
    if (this.enableVisualBell) {
      this.view.triggerVisualBell();
    }
  });
  this.site = getSite(process.env.SITE_TYPE || 'auto');
  this.buf.site = this.site;
  this.buf.setView(this.view);
  //this.buf.severNotifyStr=this.getLM('messageNotify');
  //this.buf.PTTZSTR1=this.getLM('PTTZArea1');
  //this.buf.PTTZSTR2=this.getLM('PTTZArea2');
  this.view.setBuf(this.buf);
  this.view.setCore(this);
  this.stream = new Stream(null, { charset: this.site ? this.site.charset : 'big5' });
  this.stream.app = this;
  this.telnetFilter = new TelnetFilter();
  this.ansiFilter = new AnsiFilter(this.buf, { stream: this.stream });
  this.stream.registerFilter(this.telnetFilter);
  this.stream.registerFilter(this.ansiFilter);
  this.parser = this.ansiFilter;
  this.inputArea = typeof document !== 'undefined' ? document.getElementById('t') : null;
  this.termWin = typeof document !== 'undefined' ? document.getElementById('TermWindow') : null;

  // horizontally center term window
  if (this.termWin) {
    this.termWin.setAttribute("align", "center");
  }
  if (this.view?.mainDisplay) {
    this.view.mainDisplay.style.transformOrigin = 'center';
  }

  this.plugins = [];
  this.inputInterceptors = new InputInterceptors(this);
  this.overlays = [];
  this.contextMenuItems = [];
  this.on('term:anti-idle', () => this.sendAntiIdle());
  this.initPlugins(BUILTIN_PLUGINS);
  this.suppressWheelUntil = 0;
  this.suppressWheelContinuous = false;
  this.suppressWheelStartedAt = 0;
  this.wheelDeltaYAccum = 0;
  this.lastWheelEventTime = 0;
  this.lastWheelCmdTime = 0;

  this.mouseLeftButtonDown = false;
  this.mouseRightButtonDown = false;

  this.inputAreaFocusTimer = null;
  this.modalShown = false;
  this.activeAlert = null;
  this.onAlertChange = null;

  this.lastSelection = null;

  this.appFocused = true;

  this.copyOnSelect = false;
  this.warnBeforeClose = true;
  this.colorScheme = 'default';
  this.trimTrailingSpaces = true;
  this.rightClickAction = 'menu';

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
    setWindowFocused(true);
  }, false);

  window.addEventListener('blur', (e) => {
    this.appFocused = false;
    setWindowFocused(false);
  }, false);

  this.strToCopy = null;
  document.addEventListener('copy', (e) => {
    this.onDOMCopy(e);
  });
  this.inputArea.addEventListener('paste', (e) => {
    this.onDOMPaste(e);
  });
  this.inputArea.addEventListener('blur', () => {
    if (this.isMobileDevice()) {
      this.inputArea.setAttribute('inputmode', 'none');
    }
  });

  this.view.innerBounds = this.getWindowInnerBounds();
  this.view.firstGridOffset = this.getFirstGridOffsets();
  window.onresize = () => {
    this.onWindowResize();
  };

  window.addEventListener('beforeunload', (e) => {
    if (this.warnBeforeClose && this.conn && this.conn.isConnected) {
      e.preventDefault();
      e.returnValue = 'You are currently connected. Are you sure?';
      return e.returnValue;
    }
  });

  this.dblclickTimer=null;
  this.mbTimer=null;
  this.timerEverySec=null;
  this.prefValues = null;
  this.onWindowResize();
  this.setupOverlay();
  this.contextMenuShown = false;

  // init touch controller if device supports touch
  const hasTouch = typeof window !== 'undefined' &&
    (('ontouchstart' in window) || (navigator.maxTouchPoints > 0));
  if (hasTouch) {
    this.touch = new TouchController(this);
  }
  if (this.inputArea && this.isMobileDevice()) {
    this.inputArea.setAttribute('inputmode', 'none');
    this.inputArea.setAttribute('virtualkeyboardpolicy', 'manual');
  } else if (this.inputArea && !this.isMobileDevice()) {
    // Workaround for Safari / Desktop: index.html defines inputmode="none" for mobile touch devices.
    // On desktop browsers (especially Safari & Chrome), inputmode="none" suppresses native IME composition.
    this.inputArea.removeAttribute('inputmode');
    this.inputArea.removeAttribute('virtualkeyboardpolicy');
  }
  }

  registerPlugin(plugin) {
    if (!plugin || this.plugins.includes(plugin)) return;
    this.plugins.push(plugin);
    if (plugin.init) {
      plugin.init({ app: this, core: this, view: this.view, buf: this.buf });
    }
    if (plugin.getContextMenuItems) {
      const items = plugin.getContextMenuItems();
      if (Array.isArray(items)) {
        for (const item of items) {
          this.registerContextMenuItem(item);
        }
      }
    } else if (Array.isArray(plugin.contextMenuItems)) {
      for (const item of plugin.contextMenuItems) {
        this.registerContextMenuItem(item);
      }
    }
  }

  unregisterPlugin(plugin) {
    const idx = this.plugins.indexOf(plugin);
    if (idx !== -1) {
      this.plugins.splice(idx, 1);
      if (plugin.getContextMenuItems) {
        const items = plugin.getContextMenuItems();
        if (Array.isArray(items)) {
          for (const item of items) {
            this.unregisterContextMenuItem(item.id);
          }
        }
      } else if (Array.isArray(plugin.contextMenuItems)) {
        for (const item of plugin.contextMenuItems) {
          this.unregisterContextMenuItem(item.id);
        }
      } else if (plugin.id) {
        this.unregisterContextMenuItem(plugin.id);
      }
      if (plugin.id) {
        this.unregisterOverlay(plugin.id);
      }
      plugin.destroy?.();
    }
  }

  registerOverlay(overlay) {
    if (!overlay || !overlay.id) return;
    const idx = this.overlays.findIndex((o) => o.id === overlay.id);
    if (idx !== -1) {
      this.overlays[idx] = overlay;
    } else {
      this.overlays.push(overlay);
    }
    this.emit('term:overlay:update', { overlay, detail: { overlay } });
  }

  unregisterOverlay(idOrOverlay) {
    const id = typeof idOrOverlay === 'string' ? idOrOverlay : idOrOverlay?.id;
    const idx = this.overlays.findIndex((o) => o.id === id);
    if (idx !== -1) {
      const [removed] = this.overlays.splice(idx, 1);
      this.emit('term:overlay:update', { removed, detail: { removed } });
    }
  }

  getOverlays() {
    return [...this.overlays];
  }

  registerContextMenuItem(item) {
    if (!item || !item.id) return;
    const idx = this.contextMenuItems.findIndex((i) => i.id === item.id);
    if (idx !== -1) {
      this.contextMenuItems[idx] = item;
    } else {
      this.contextMenuItems.push(item);
    }
    this.emit('term:context-menu:update', { item, detail: { item } });
  }

  unregisterContextMenuItem(idOrItem) {
    const id = typeof idOrItem === 'string' ? idOrItem : idOrItem?.id;
    const idx = this.contextMenuItems.findIndex((i) => i.id === id);
    if (idx !== -1) {
      const [removed] = this.contextMenuItems.splice(idx, 1);
      this.emit('term:context-menu:update', { removed, detail: { removed } });
    }
  }

  getContextMenuItems() {
    return [...this.contextMenuItems];
  }

  initPlugins(pluginClasses = BUILTIN_PLUGINS) {
    if (!Array.isArray(pluginClasses)) return;
    for (const PluginClass of pluginClasses) {
      if (typeof PluginClass === 'function') {
        const instance = new PluginClass(this, { view: this.view, buf: this.buf, core: this });
        this.registerPlugin(instance);
      } else if (PluginClass && typeof PluginClass === 'object') {
        this.registerPlugin(PluginClass);
      }
    }
  }

  getPlugin(name) {
    return this.plugins.find(
      (p) => p.id === name || p.name === name || p.constructor?.name === name
    );
  }

  getPluginList() {
    return this.plugins.map((p) => {
      let meta;
      if (p.getMetadata) {
        meta = p.getMetadata();
      } else {
        meta = {
          id: p.id || p.name || p.constructor?.name,
          name: p.name || p.constructor?.name,
          title: p.title || p.name,
          description: p.description || '',
          prefKey: p.prefKey,
          enabled: p.enabled,
          icon: p.icon || 'extension',
          group: p.group || p.constructor?.group,
        };
      }
      if (!meta.group) {
        meta.group = p.group || p.constructor?.group;
      }
      if ((p.renderOptions || p.constructor?.renderOptions) && !meta.renderOptions) {
        meta.renderOptions = (p.renderOptions || p.constructor?.renderOptions).bind(p);
      }
      return meta;
    });
  }

  dispatchScreenUpdate(changedLineHtmlStrs) {
    for (const plugin of this.plugins) {
      if (plugin.onScreenUpdate?.(changedLineHtmlStrs)) {
        return true;
      }
    }
    return false;
  }

  dispatchFontUpdate(fontInfo) {
    for (const plugin of this.plugins) {
      plugin.onFontUpdate?.(fontInfo);
    }
  }

  get useMouseBrowsing() {
    return this._useMouseBrowsing ?? true;
  }

  set useMouseBrowsing(val) {
    this._useMouseBrowsing = Boolean(val);
  }

  dispatchNavCmd(cmd) {
    return this.inputInterceptors.dispatchNavCmd(cmd);
  }

  dispatchWheel(e) {
    return this.inputInterceptors.dispatchWheel(e);
  }

  dispatchMouseClick(e) {
    return this.inputInterceptors.dispatchMouseClick(e);
  }

  dispatchKeyDown(e) {
    return this.inputInterceptors.dispatchKeyDown(e);
  }

  dispatchTextInput(e) {
    return this.inputInterceptors.dispatchTextInput(e);
  }

  getInterceptorSelectedText() {
    return this.inputInterceptors.getSelectedText();
  }

  getInterceptorSelectionColRow() {
    return this.inputInterceptors.getSelectionColRow();
  }

  dispatchSelectAll() {
    return this.inputInterceptors.dispatchSelectAll();
  }

  hasActiveInputInterceptor() {
    return this.inputInterceptors.hasActive();
  }

  isConnected() {
    return this.connectState == 1 && !!this.conn;
  }

  connect(url, siteType) {
  this.dismissAlert('connection');
  this.connectState = 0;
  console.log('connect: ' + url + ', siteType: ' + siteType);

  const parsed = parseConnectUrl(url);
  if (!parsed) {
    console.log('failed to parse connect url: ' + url);
    return;
  }
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

  this._setupWebsocketConn(parsed.url);
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

  _setupWebsocketConn(url) {
    const wsConn = new Websocket(url);
    this.emit('term:socket', { socket: wsConn, detail: { socket: wsConn } });
    for (const plugin of this.plugins) {
      plugin.onAttachSocket?.(wsConn);
    }
    this._attachConn(wsConn);
  }

  _attachConn(conn) {
    this.conn = conn;
    this.conn.site = this.site;
    this.stream.attach(conn);
    this.stream.charset = this.site ? this.site.charset : 'big5';
    if (!conn.sendNaws) conn.sendNaws = (cols, rows) => this.stream.sendNaws(cols, rows);
    if (!conn.sendWillNaws) conn.sendWillNaws = (cols, rows) => this.stream.sendWillNaws(cols, rows);
    if (!conn.sendNop) conn.sendNop = () => this.stream.sendNop();
    if (!conn.convSend) conn.convSend = (str) => this.stream.send(str);
    this.conn.addEventListener('open', () => this.onConnect());
    this.conn.addEventListener('close', () => this.onClose());
    const onTelopt = (e) => {
      if (this.site?.onTelopt) {
        this.site.onTelopt(e.cmd, e.opt, this.buf);
      }
    };
    this.stream.addEventListener('telopt', onTelopt);
    this.conn.addEventListener('telopt', onTelopt);
    this.stream.addEventListener('doNaws', (e) => {
      this.stream.sendWillNaws(this.buf.cols, this.buf.rows);
      this.stream.sendNaws(this.buf.cols, this.buf.rows);
    });
    this.conn.addEventListener('doNaws', (e) => {
      this.stream.sendWillNaws(this.buf.cols, this.buf.rows);
      this.stream.sendNaws(this.buf.cols, this.buf.rows);
    });
    this.conn.addEventListener('data', (e) => {
      this.site.onData(e.data, this.buf);
    });
  }

  onConnect() {
    this.conn.isConnected = true;
    if (this.stream) {
      this.stream.charset = this.site ? this.site.charset : 'big5';
    }
    this.site?.resetLoginPrompt?.();
    console.info("app onConnect");
    this.connectState = 1;
    this.updateTabIcon('connect');
    this.view.buf.setTitle({conn: this.connectedUrl.hostname});
    this.emit('term:connect');
    this.timerEverySec = setTimer(true, () => {
      this.emit('term:tick', { intervalMs: 1000, detail: { intervalMs: 1000 } });
      this.view.onBlink();
    }, 1000);
  }

  onData(data) {
    if (this.stream) {
      if (!this.stream.conn) {
        this.stream.feed(data);
      }
    } else if (this.parser) {
      this.parser.feed(data);
    }
  }

  onClose() {
    console.info("app onClose");
    if (this.timerEverySec) {
      this.timerEverySec.cancel();
    }
    this.conn.isConnected = false;
    this.site?.resetLoginPrompt?.();

    this.cancelMbTimer();

    this.connectState = 2;
    this.emit('term:disconnect');

    this.showAlert('connection', {
      onDismiss: () => {
        this.connect(this.connectedUrl.url);
      }
    });
    this.updateTabIcon('disconnect');
  }

  send(data) {
    this.emit('term:send', { data, detail: { data } });
    this.stream.send(data);
  }

  sendKey(key) {
    return this.view ? this.view.sendKey(key) : false;
  }

  sendData(str) {
    this.emit('term:send', { data: str, detail: { data: str } });
    if (this.connectState == 1) {
      this.stream.send(str);
    }
  }

  sendAntiIdle() {
    const conn = this.stream || this.conn;
    if (!conn || this.connectState !== 1) return false;
    if (this.site?.sendAntiIdle) {
      this.site.sendAntiIdle(conn);
      return true;
    }
    return false;
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

  get debugEmitter() {
    if (!this._debugEmitter) {
      this._debugEmitter = new EventEmitter();
    }
    return this._debugEmitter;
  }

  registerDebugHandler(type, handler) {
    return this.debugEmitter.subscribe(type, handler);
  }

  unregisterDebugHandler(type, handler) {
    this._debugEmitter?.off(type, handler);
  }

  sendDebugEvent(type, event) {
    this._debugEmitter?.emit(type, event, type);
  }

  _debugTouchLog(msg) {
    this.sendDebugEvent('touch', msg);
  }

  setInputAreaFocus(force = false) {
    if (!this.inputArea) return;
    if (this.modalShown || this.contextMenuShown) {
      this._debugTouchLog('setInputAreaFocus blocked: modal or context menu active');
      return;
    }
    if (this.preserveDomSelection && !force && !this.isSelectionCollapsed()) {
      this._debugTouchLog('setInputAreaFocus blocked: preserving text selection');
      return;
    }
    if (this.isMobileDevice() && !force) {
      this._debugTouchLog('setInputAreaFocus blocked: mobile device and not force');
      return;
    }
    if (this.isMobileLayout() && !force) {
      this._debugTouchLog('setInputAreaFocus blocked: mobile layout and not force');
      return;
    }
    if (this.touch && (this.touch.touchStarted || (Date.now() - (this.touch.lastTouchTime || 0) < 500)) && !force) {
      this._debugTouchLog('setInputAreaFocus blocked: recent touch (<500ms) and not force');
      return;
    }
    if (this.view?.isComposition && document.activeElement === this.inputArea) {
      this._debugTouchLog('setInputAreaFocus no-op: active IME composition');
      return;
    }
    if (document.activeElement === this.inputArea && !force) {
      this._debugTouchLog('setInputAreaFocus no-op: inputArea already activeElement');
      return;
    }
    if (force && document.activeElement === this.inputArea) {
      this.inputArea.blur();
    }
    try {
      this.inputArea.focus({ preventScroll: true });
    } catch (e) {
      this.inputArea.focus();
    }
    if (typeof window !== "undefined") {
      window.scrollTo(0, 0);
    }
  }

  isSelectionCollapsed() {
    if (this.hasActiveInputInterceptor()) {
      return typeof window !== 'undefined' && window.getSelection ? window.getSelection().isCollapsed : true;
    }
    if (this.view && this.view.useCanvasEngine) {
      return !this.view.getSelectionColRow();
    }
    if (this.preserveDomSelection && this.view?._domSelectedText) {
      return false;
    }
    return typeof window !== 'undefined' && window.getSelection ? window.getSelection().isCollapsed : true;
  }

  switchToEasyReadingMode(doSwitch) {
    this.emit('term:easy-reading:switch', { doSwitch, detail: { doSwitch } });
  }

  async doCopy(str) {
    if (typeof str !== 'string') return;
    if (this.trimTrailingSpaces !== false) {
      if (str.indexOf('\x1b') < 0) {
        str = str
          .split(/\r\n|\r|\n/)
          .map((line) => line.replace(/[ \t]+$/, ''))
          .join('\r')
          .replace(/[ \t\r]+$/, '');
      }
    } else if (str.indexOf('\x1b') < 0) {
      str = str.replace(/\r\n/g, '\r');
      str = str.replace(/\n/g, '\r');
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
    let textarea = null;
    try {
      if (typeof document !== 'undefined' && document.body) {
        textarea = document.createElement('textarea');
        textarea.value = str;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.top = '-9999px';
        textarea.style.left = '-9999px';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, str.length);
      }
      document.execCommand('copy');
    } catch (err) {}
    if (textarea && textarea.parentNode) {
      textarea.parentNode.removeChild(textarea);
    }
    this.strToCopy = null;
  }

  doCopyAnsi() {
    if (!this.lastSelection)
      return;

    const selection = this.lastSelection;
    let ansiText = '';
    if (selection.start.row == selection.end.row) {
      ansiText += this.buf.getText(selection.start.row, selection.start.col, selection.end.col, true, true, false);
    } else {
      for (let i = selection.start.row; i <= selection.end.row; ++i) {
        let scol = 0;
        let ecol = this.buf.cols - 1;
        if (i == selection.start.row) {
          scol = selection.start.col;
        } else if (i == selection.end.row) {
          ecol = selection.end.col;
        }
        ansiText += this.buf.getText(i, scol, ecol, true, true, false);
        if (i != selection.end.row) {
          ansiText += '\r';
        }
      }
    }

    this.doCopy(ansiText);
  }

  onDOMCopy(e) {
    this.emit('term:user-activity', { type: 'copy', detail: { type: 'copy' } });
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

  dispatchPaste(content, originalEvent = null) {
    if (typeof content !== 'string') {
      return false;
    }

    const detail = {
      data: content,
      text: content,
      originalEvent,
    };
    let event;
    if (typeof CustomEvent !== 'undefined') {
      event = new CustomEvent('term:paste', {
        detail,
        cancelable: true,
      });
    } else {
      event = {
        type: 'term:paste',
        detail,
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
      };
    }
    Object.defineProperty(event, 'data', {
      get() {
        return detail.data;
      },
      set(val) {
        detail.data = val;
        detail.text = val;
      },
      configurable: true,
    });

    this.dispatchEvent(event);
    if (event.defaultPrevented) {
      return false;
    }

    const result = detail.data ?? detail.text;
    if (typeof result !== 'string') {
      return false;
    }

    if (this.view?.paste) {
      this.view.paste(result);
    } else if (this.view?.onTextInput) {
      this.view.onTextInput(result, true);
    }
    return true;
  }

  onPasteDone(content, originalEvent = null) {
    this.dispatchPaste(content, originalEvent);
  }

  onDOMPaste(e) {
    let str = e.clipboardData ? e.clipboardData.getData('text') : '';
    if (str) {
      e.preventDefault();
      this.dispatchPaste(str, e);
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
    this.lastSelection = this.view.getSelectionColRow();
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

  onWindowResize() {
  this.view.innerBounds = this.getWindowInnerBounds();

  if (this.resizeTimeout) {
    clearTimeout(this.resizeTimeout);
  }
  if (this.resizer) {
    this.resizeTimeout = setTimeout(() => {
      this.resizeTimeout = null;
      if (this.prefValues) {
        this.applyTermSizeMode(this.prefValues);
      } else if (this.resizer) {
        this.resizer();
      } else {
        this.view.fontResize();
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
  this.stream.sendNaws(cols, rows);
  }

  switchMouseBrowsing() {
    this.useMouseBrowsing = !this.useMouseBrowsing;
    updatePref('useMouseBrowsing', this.useMouseBrowsing);
    this.emit('term:pref-change', {
      key: 'useMouseBrowsing',
      value: this.useMouseBrowsing,
      detail: { key: 'useMouseBrowsing', value: this.useMouseBrowsing },
    });
    return this.useMouseBrowsing;
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
  const width = document.documentElement.clientWidth - (this.view.viewMargin || 0) * 2;
  const height = document.documentElement.clientHeight - (this.view.viewMargin || 0) * 2;
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

  onMouse_click(e) {
    if (!this.conn || !this.conn.isConnected)
      return;

    this.emit('term:click', { event: e, detail: { event: e } });
    this.dispatchMouseClick(e);
  }

  onMouse_move(cX, cY) {
    const pos = this.clientToPos(cX, cY);
    this.emit('term:mouse-move', {
      col: pos.col,
      row: pos.row,
      clientX: cX,
      clientY: cY,
      refresh: false,
      detail: { col: pos.col, row: pos.row, clientX: cX, clientY: cY, refresh: false }
    });
  }

  resetMouseCursor(cX, cY) {
    this.emit('term:reset-mouse-cursor', {
      clientX: cX,
      clientY: cY,
      detail: { clientX: cX, clientY: cY }
    });
  }

  isMobileLayout() {
    if (typeof window === 'undefined') return false;
    const hasTouch = ('ontouchstart' in window) || (navigator && navigator.maxTouchPoints > 0);
    if (!hasTouch) return false;
    const isNarrow = window.innerWidth <= 768;
    const isCompactLandscape = window.innerHeight <= 500 && window.innerWidth <= 1024;
    return isNarrow || isCompactLandscape;
  }

  isMobileDevice() {
    if (typeof window === 'undefined') return false;
    const hasTouch = ('ontouchstart' in window) || (navigator && navigator.maxTouchPoints > 0);
    if (!hasTouch) return false;
    const isMobileUA = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test((navigator && navigator.userAgent) || '');
    const hasCoarseOnly = window.matchMedia && window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches;
    return isMobileUA || hasCoarseOnly || this.isMobileLayout();
  }

  applyTermSizeMode(values) {
    if (!values) return;
    this.resizer = null;
    const isMobile = this.isMobileLayout();
    const effectiveMode = isMobile ? 'fixed-font-size' : values.termSizeMode;

    switch (effectiveMode) {
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
  }

  onValuesPrefChange(values) {
  this.prefValues = values;
  if (values && values.colorScheme !== undefined) {
    this.colorScheme = values.colorScheme;
  }
  for (const name in values) {
    this.onPrefChange(name, values[name]);
  }

  // These prefs have to be processed as a whole.
  try {
    this.applyTermSizeMode(values);
  } catch (e) {}
  }

  onPrefChange(name, value) {
  try {
    this.emit('term:pref-change', { key: name, value, detail: { key: name, value } });
    switch (name) {
    case 'uiLocale':
      setupI18n(value);
      this.emit('term:i18n:change', { lang: value, detail: { lang: value } });
      this.emit('term:overlay:update');
      break;
    case 'useMouseBrowsing': {
      const useMouseBrowsing = !!value;
      this.useMouseBrowsing = useMouseBrowsing;
      if (!useMouseBrowsing) {
        if (this.buf?.termWin) this.buf.termWin.style.cursor = 'auto';
        this.buf?.clearHighlight?.();
      }
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
    case 'trimTrailingSpaces':
      this.trimTrailingSpaces = !!value;
      break;
    case 'rightClickAction':
      this.rightClickAction = value;
      break;
    case 'warnBeforeClose':
      this.warnBeforeClose = !!value;
      break;
    case 'colorScheme':
      this.colorScheme = value;
      applyColorScheme(
        value,
        this.prefValues?.customColors,
        this.prefValues?.customDefaultBg,
        this.prefValues?.customDefaultFg,
        this.prefValues?.customDefaultLink,
        this.prefValues?.customForcePlainText,
        this.prefValues?.minimumContrast
      );
      if (this.view) {
        this.view.updateHighlightColor();
        this.view.redraw(true);
      }
      break;
    case 'customColors':
    case 'customDefaultBg':
    case 'customDefaultFg':
    case 'customDefaultLink':
    case 'customForcePlainText':
    case 'minimumContrast':
      applyColorScheme(
        this.colorScheme,
        this.prefValues?.customColors,
        this.prefValues?.customDefaultBg,
        this.prefValues?.customDefaultFg,
        this.prefValues?.customDefaultLink,
        this.prefValues?.customForcePlainText,
        this.prefValues?.minimumContrast
      );
      if (this.view) {
        this.view.updateHighlightColor();
        this.view.redraw(true);
      }
      break;
    case 'enablePicPreview':
      // TODO: move this to ImagePreview.
      this.view.enablePicPreview = value;
      break;
    case 'enableBell':
      setTerminalBellEnabled(value);
      break;
    case 'enableVisualBell':
      this.enableVisualBell = !!value;
      break;
    case 'backspaceKey':
      this.backspaceKey = value;
      if (this.view && this.view._keyboard) {
        this.view._keyboard.backspaceKey = value;
      }
      break;
    case 'deleteKey':
      this.deleteKey = value;
      if (this.view && this.view._keyboard) {
        this.view._keyboard.deleteKey = value;
      }
      break;
    case 'lineHeight':
      this.lineHeight = parseFloat(value) || 1.0;
      if (this.view) {
        this.view.lineHeight = this.lineHeight;
      }
      try {
        this.applyTermSizeMode(this.prefValues);
      } catch (e) {}
      if (this.view) {
        this.view.redraw(true);
      }
      break;
    case 'dbcsDetect':
      this.view.dbcsDetect = value;
      break;
    case 'lineWrap':
    case 'enableAutoWrap':
      break;
    case 'fontFace': {
      let fontFace = value;
      if (!fontFace) 
        fontFace='monospace';
      this.view.setFontFace(fontFace);
      break;
    }
    case 'termMargin': {
      const margin = value;
      this.view.viewMargin = margin;
      this.onWindowResize();
      break;
    }
    case 'cursorStyle':
      this.view.setCursorStyle(value);
      break;
    case 'useCanvasEngine':
      this.view.useCanvasEngine = !!value;
      this.view.redraw(true);
      break;
    case 'showFps':
      this.view.setShowFps(!!value);
      break;
    case 'smoothAnsi':
    case 'smoothAnsiArt':
      this.view.smoothAnsiArt = !!value;
      this.view.redraw(true);
      break;
    case 'supportMouseReporting':
      if (this.buf?.locator) {
        this.buf.locator.enabled = !!value;
      }
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
    if (!cn) return false;
    const str = typeof cn === 'string' ? cn : (typeof cn.baseVal === 'string' ? cn.baseVal : '');
    return str.indexOf('nomouse_command') >= 0 || str.indexOf('conn-log') >= 0;
  }

  isDialogOrExcludedTarget(e) {
    if (!e || !e.target) return false;
    if (typeof e.target.closest === 'function') {
      if (
        e.target.closest('dialog') ||
        e.target.closest('.nomouse_command') ||
        e.target.closest('.modal-dialog') ||
        e.target.closest('.modal-content')
      ) {
        return true;
      }
    }
    return false;
  }

  mouse_click(e) {
  if (this.modalShown || this.contextMenuShown || this.isDialogOrExcludedTarget(e))
    return;
  const skipMouseClick = this.skipMouseClick;
  this.skipMouseClick = false;

  if (e.button == 2) { //right button
  } else if (e.button === 0) { //left button
    if (this.preserveDomSelection && this.view?._domSelectedText) {
      const sel = typeof window !== 'undefined' && window.getSelection ? window.getSelection() : null;
      if (!sel || sel.isCollapsed) {
        this.view._domSelectedText = '';
        this.view._domSelectionColRow = null;
        this.lastSelection = null;
      }
    }
    const a = e.target && e.target.closest('a');
    if (a) {
      if (this.site.handleCustomLink(a.href, this)) {
        e.preventDefault();
      }
      return;
    }
    if (this.isSelectionCollapsed() && !skipMouseClick) { //no anything be select
      const forceFocus = Boolean(this.view?.useCanvasEngine);
      if (this.site.handlePassScreenClick(this.buf, this.conn)) {
        e.preventDefault();
        this.setInputAreaFocus(forceFocus);
        return;
      }
      if (this.useMouseBrowsing) {
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
          this.emit('term:mouse-move', {
            col: pos.col,
            row: pos.row,
            clientX: e.clientX,
            clientY: e.clientY,
            refresh: true,
            detail: { col: pos.col, row: pos.row, clientX: e.clientX, clientY: e.clientY, refresh: true }
          });
        }
        if (doMouseCommand) {
          this.onMouse_click(e);
          this.setDblclickTimer();
          e.preventDefault();
          this.setInputAreaFocus(forceFocus);
        }
      } else if (this.buf?.locator?.isActive?.()) {
        const pos = this.clientToPos(e.clientX, e.clientY);
        const report = this.buf.locator.handleMouseClick(e, pos);
        if (report) {
          this.send(report);
          e.preventDefault();
          this.setInputAreaFocus(forceFocus);
        }
      } else if (this.view.leftButtonFunction) {
        if (this.view.leftButtonFunction == 1) {
          this.setNavCmd('doEnter');
          e.preventDefault();
          this.setInputAreaFocus(forceFocus);
        } else if (this.view.leftButtonFunction == 2) {
          this.setNavCmd('doRight');
          e.preventDefault();
          this.setInputAreaFocus(forceFocus);
        }
      }
    }
  } else if (e.button == 1) { //middle button
  } else {
  }
  }

  middleMouse_down(e) {
  if (this.modalShown || this.contextMenuShown || this.isDialogOrExcludedTarget(e))
    return;
  if (e.button == 1) {
    if (e.target && e.target.closest('a')) {
      return;
    }
    if (this.view.middleButtonFunction == 1) {
      this.send('\r');
      return false;
    } else if (this.view.middleButtonFunction == 2) {
      this.send('\x1b[D');
      return false;
    } else if (this.view.middleButtonFunction == 3) {
      this.doPaste();
      return false;
    }
  }
  }

  mouse_down(e) {
  if (this.modalShown || this.contextMenuShown || this.isDialogOrExcludedTarget(e))
    return;
  //0=left button, 1=middle button, 2=right button
  if (e.button === 0) {
    if (this.useMouseBrowsing) {
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
  } else if(e.button == 2) {
    this.mouseRightButtonDown = true;
    if (this.preserveDomSelection && this.view && !this.view.useCanvasEngine) {
      const selText = this.view.getSelectedText();
      if (selText) {
        this.view._domSelectedText = selText;
        const colRow = this.view.getSelectionColRow();
        if (colRow) {
          this.view._domSelectionColRow = colRow;
          this.lastSelection = colRow;
        }
      }
    }
  }
  }

  mouse_up(e) {
  if (this.modalShown || this.contextMenuShown || this.isDialogOrExcludedTarget(e))
    return;
  //0=left button, 1=middle button, 2=right button
  if (e.button === 0) {
    this.setMbTimer();
    this.mouseLeftButtonDown = false;
  } else if (e.button == 2) {
    this.mouseRightButtonDown = false;
  }

  if (e.button === 0) { //left button
    const forceFocus = Boolean(this.view?.useCanvasEngine);
    if (this.isSelectionCollapsed()) { //no anything be select
      if (this.useMouseBrowsing)
        this.onMouse_move(e.clientX, e.clientY);

      this.setInputAreaFocus(forceFocus);
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
      if (this.copyOnSelect && (this.hasActiveInputInterceptor() || !this.view || !this.view.useCanvasEngine)) {
        this.doCopy(this.view ? this.view.getSelectedText() : (typeof window !== 'undefined' && window.getSelection ? window.getSelection().toString().replace(/\u00a0/g, " ") : ""));
      }
    }
    this.inputAreaFocusTimer = setTimer(false, () => {
      if (this.inputAreaFocusTimer) {
        this.inputAreaFocusTimer.cancel();
        this.inputAreaFocusTimer = null;
      }
      if (!this.contextMenuShown && this.isSelectionCollapsed())
        this.setInputAreaFocus(forceFocus);
    }, 10);
  } else if (e.button == 2) {
    // right button: opens context menu, do not steal focus or set focus timer
  } else {
    this.setInputAreaFocus();
    e.preventDefault();
  }
  }

  mouse_move(e) {
  if (this.modalShown || this.contextMenuShown || this.isDialogOrExcludedTarget(e))
    return;
  if (this.useMouseBrowsing) {
    if (this.isSelectionCollapsed()) {
      if(!this.mouseLeftButtonDown)
        this.onMouse_move(e.clientX, e.clientY);
    } else
      this.resetMouseCursor();
  }

  }

  mouse_over(e) {
  if (this.modalShown || this.contextMenuShown || this.isDialogOrExcludedTarget(e))
    return;

  if (this.isSelectionCollapsed() && !this.mouseLeftButtonDown)
    this.setInputAreaFocus();
  }

  suppressInertialWheel(durationMs) {
    const now = Date.now();
    const duration = durationMs || 300;
    this.suppressWheelUntil = Math.max(this.suppressWheelUntil || 0, now + duration);
    this.suppressWheelContinuous = true;
    this.suppressWheelStartedAt = now;
    this.wheelDeltaYAccum = 0;
  }

  mouse_scroll(e) {
    if (this.modalShown || this.isDialogOrExcludedTarget(e)) 
      return;

    const interceptorHandled = this.dispatchWheel(e);
    if (interceptorHandled === true) {
      return;
    }

    const now = Date.now();
    const isSuppressed = (interceptorHandled === 'suppress') ||
                       (this.suppressWheelUntil && now < this.suppressWheelUntil);

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

  // 4. Normal Terminal Wheel Handling with Pixel Accumulation & Throttling
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

  // Threshold in pixels before triggering 1 terminal step
  const threshold = Math.max(35, this.view.chh || 35);

  if (Math.abs(this.wheelDeltaYAccum) < threshold) {
    e.stopPropagation();
    e.preventDefault();
    return;
  }

  // Rate limit terminal commands: at least 60ms between commands to avoid telnet buffer queueing
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
      this.setNavCmd(action);
    } else if (this.mouseLeftButtonDown) {
      const action = mouseWheelActionsUp[this.view.mouseWheelFunction3];
      this.setNavCmd(action);
    } else {
      const action = mouseWheelActionsUp[this.view.mouseWheelFunction1];
      this.setNavCmd(action);
    }
  } else {
    if (this.mouseRightButtonDown) {
      const action = mouseWheelActionsDown[this.view.mouseWheelFunction2];
      this.setNavCmd(action);
    } else if (this.mouseLeftButtonDown) {
      const action = mouseWheelActionsDown[this.view.mouseWheelFunction3];
      this.setNavCmd(action);
    } else {
      const action = mouseWheelActionsDown[this.view.mouseWheelFunction1];
      this.setNavCmd(action);
    }
  }

  e.stopPropagation();
  e.preventDefault();

  if (this.mouseRightButtonDown) //prevent context menu popup
    this.preventContextMenuOnMouseUp = true;
  if (this.mouseLeftButtonDown) {
    if (this.useMouseBrowsing) {
      this.skipMouseClick = true;
    }
  }
  }

  setNavCmd(cmd) {
    if (this.dispatchNavCmd(cmd)) {
      return;
    }
    switch (cmd) {
      case "doArrowUp":
        this.send('\x1b[A');
        break;
      case "doArrowDown":
        this.send('\x1b[B');
        break;
      case "doPageUp":
        this.send('\x1b[5~');
        break;
      case "doPageDown":
        this.send('\x1b[6~');
        break;
      case "previousThread": {
        const cmd = this.site?.getThreadCommand("prevThread");
        const pageState = this.site?.pageState;
        if (cmd && (pageState === PAGE_STATE.LIST || pageState === PAGE_STATE.READING || pageState === PAGE_STATE.MAPLE_LIST)) {
          this.send(cmd);
        }
        break;
      }
      case "nextThread": {
        const cmd = this.site?.getThreadCommand("nextThread");
        const pageState = this.site?.pageState;
        if (cmd && (pageState === PAGE_STATE.LIST || pageState === PAGE_STATE.READING || pageState === PAGE_STATE.MAPLE_LIST)) {
          this.send(cmd);
        }
        break;
      }
      case "doEnter":
        this.send('\r');
        break;
      case "doRight":
        this.send('\x1b[C');
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

  zoomFont(delta) {
    if (!this.view) return;
    const currentSize = this.view.chh || 24;
    const newSize = Math.max(12, Math.min(60, currentSize + delta * 2));
    if (newSize === currentSize) return;

    const currentPrefs = readValuesWithDefault();
    const nextPrefs = {
      ...currentPrefs,
      fontSize: newSize
    };
    writeValues(nextPrefs);
    this.onValuesPrefChange(nextPrefs);
    if (this.view.redraw) {
      this.view.redraw(true);
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
}
