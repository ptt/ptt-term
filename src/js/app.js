// Main Program
import React from 'react';
import { render } from 'preact';
import { AnsiFilter } from './ansi_parser';
import { TermView } from './term_view';
import { TelnetFilter } from './telnet';
import { Stream } from './stream';
import { Websocket } from './websocket';
import { BUILTIN_PLUGINS } from '../plugins/index.js';
import { TouchController } from '../touch/TouchController.js';
import { setupI18n } from './i18n';
import { setTimer, parseConnectUrl } from './util';
import { hasWebKitImeQuirk, shouldPreserveDomSelection } from './quirks';
import { setTerminalBellEnabled, setWindowFocused, isWindowFocused, playTerminalBell } from './bell.js';
import { DEFAULT_PREFS, getDefaultFontSize, normalizeMouseButtonAction, readValuesWithDefault, writeValues } from './pref.js';
import { applyColorScheme } from './color_schemes.js';
import AppOverlay from '../components/AppOverlay';
import { getSite } from './sites';
import { EventEmitter } from './event';
import { InputInterceptors } from './input_interceptors.js';
import { ClipboardManager } from './clipboard.js';
import { MouseController } from './mouse_controller.js';
import { BackNavigationController } from './back_navigation.js';
import { PluginManager } from './plugin_manager.js';
import {
  DISCONNECT_CHECK_INTERVAL_MS,
  CONNECT_CHECK_INTERVAL_MS,
  initVersionChecker,
  canCheckVersion,
  checkVersionAndReloadIfNeeded,
} from './version_checker.js';
import iconLogo from 'Icon/logo.png';
import iconLogoConnect from 'Icon/logo_connect.png';
import iconLogoDisconnect from 'Icon/logo_disconnect.png';

export class App extends EventEmitter {
  constructor() {
    super();

    this._hasConnectedOnce = false;
    initVersionChecker();

    this.preventContextMenuOnMouseUp = false;
    this.skipMouseClick = false;

    // Browser quirks handling: WebKit IME composition, Gecko DOM selection preservation
    this.hasWebKitImeQuirk = hasWebKitImeQuirk();
    this.preserveDomSelection = shouldPreserveDomSelection();
    this.view = new TermView({
      app: this,
      hasWebKitImeQuirk: this.hasWebKitImeQuirk,
      preserveDomSelection: this.preserveDomSelection,
    });
    this.view.on('term:selection-change', ({ selection }) => {
      this.lastSelection = selection;
    });
    this.buf = this.view.buf;
    this.titleBase = process.env.APP_TITLE;
    this.titleSite = null;
    this.titleConn = null;
    this.dynamicTitle = process.env.DYNAMIC_TITLE !== false;
    this.title = this.titleBase;
    this.hasBellAlert = false;
    this._bellTitleBlinkState = false;
    this._bellTitleTimer = null;
    if (typeof document !== 'undefined') {
      document.title = this.title;
    }
    this.enableVisualBell = DEFAULT_PREFS.enableVisualBell;
    this.backspaceKey = DEFAULT_PREFS.backspaceKey;
    this.deleteKey = DEFAULT_PREFS.deleteKey;
    this.lineHeight = DEFAULT_PREFS.lineHeight;
    this.buf.on('bell', () => {
      playTerminalBell();
      if (this.enableVisualBell) {
        this.view.triggerVisualBell();
      }
      if (!isWindowFocused()) {
        this.triggerBellTabAlert();
      }
    });
    this.buf.on('title', (part) => {
      this.setTitle(part);
    });
    this.buf.on('term:login-prompt', (detail) => {
      this.emit('term:login-prompt', detail);
    });
    this.buf.on('site-change', ({ site, clampRows }) => {
      this.site = site;
      if (this.stream) {
        this.stream.charset = site.charset;
      }
      if (clampRows && this.buf.rows > clampRows) {
        if (this.resizer) {
          this.resizer();
        } else {
          this.setTermSize(this.buf.cols, clampRows);
          this.view.fontResize();
          this.view.redraw(true);
        }
      }
    });
    this.site = this.buf.site;
    this.telnetFilter = new TelnetFilter();
    this.ansiFilter = new AnsiFilter(this.buf);
    this.stream = new Stream({
      app: this,
      charset: this.site ? this.site.charset : 'big5',
      filters: [this.telnetFilter, this.ansiFilter],
    });
    this.stream.addEventListener('telopt', (e) => {
      this.site?.onTelopt?.(e.cmd, e.opt, this.buf);
    });
    this.stream.addEventListener('doNaws', () => {
      this.stream.sendWillNaws(this.buf.cols, this.buf.rows);
      this.stream.sendNaws(this.buf.cols, this.buf.rows);
    });

    this.pluginManager = new PluginManager(this);
    this.inputInterceptors = new InputInterceptors(this);
    this.on('term:anti-idle', () => this.sendAntiIdle());

    this.inputAreaFocusTimer = null;
    this.modalShown = false;
    this.activeAlert = null;
    this.onAlertChange = null;

    this.lastSelection = null;

    this.copyOnSelect = DEFAULT_PREFS.copyOnSelect;
    this.warnBeforeClose = DEFAULT_PREFS.warnBeforeClose;
    this.colorScheme = DEFAULT_PREFS.colorScheme;
    this.trimTrailingSpaces = DEFAULT_PREFS.trimTrailingSpaces;
    this.mouseLeftFunction = DEFAULT_PREFS.mouseLeftFunction;
    this.mouseMiddleFunction = DEFAULT_PREFS.mouseMiddleFunction;
    this.rightClickAction = DEFAULT_PREFS.rightClickAction;
    this.mouseWheelAction = DEFAULT_PREFS.mouseWheelAction;
    this.mouseWheelRightAction = DEFAULT_PREFS.mouseWheelRightAction;
    this.mouseWheelLeftAction = DEFAULT_PREFS.mouseWheelLeftAction;
    this.mouseWheelTrackpadMode = DEFAULT_PREFS.mouseWheelTrackpadMode;
    this.enableBackNavigation = DEFAULT_PREFS.enableBackNavigation;

    this.mouse = new MouseController(this);
    this.backNav = new BackNavigationController(this);

    window.addEventListener(
      'focus',
      () => {
        setWindowFocused(true);
        this.clearBellTabAlert();
      },
      false
    );

    if (typeof document !== 'undefined') {
      document.addEventListener(
        'visibilitychange',
        () => {
          if (!document.hidden) {
            setWindowFocused(true);
            this.clearBellTabAlert();
          }
        },
        false
      );
    }

    window.addEventListener(
      'blur',
      () => {
        setWindowFocused(false);
      },
      false
    );

    this.clipboard = new ClipboardManager();
    document.addEventListener('copy', (e) => {
      this.onDOMCopy(e);
    });
    document.addEventListener('paste', (e) => {
      this.onDOMPaste(e);
    });

    window.onresize = () => {
      this.onWindowResize();
    };
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('orientationchange', () => {
        setTimeout(() => this.onWindowResize(), 50);
      });
    }

    window.addEventListener('beforeunload', (e) => {
      if (
        this.warnBeforeClose &&
        this.conn &&
        this.conn.isConnected &&
        this.site?.isLoggedIn?.() !== false
      ) {
        e.preventDefault();
        e.returnValue = 'You are currently connected. Are you sure?';
        return e.returnValue;
      }
    });

    this.timerEverySec = null;
    try {
      this.prefValues = readValuesWithDefault();
    } catch {
      this.prefValues = null;
    }
    if (this.prefValues && this.buf.locator) {
      this.buf.locator.enabled = this.prefValues.supportMouseReporting ?? true;
    }
    if (typeof document !== 'undefined') {
      const cmenuEl = document.getElementById('cmenuReact');
      if (cmenuEl) {
        render(<AppOverlay app={this} />, cmenuEl);
      }
    }
    this.contextMenuShown = false;

    // init touch controller if device supports touch
    if (this.hasTouchSupport()) {
      this.touch = new TouchController(this);
    }
    // Workaround for Safari / Desktop: index.html defines inputmode="none" for mobile touch devices.
    // On desktop browsers (especially Safari & Chrome), inputmode="none" suppresses native IME composition.
    this.view.configureInputMode(this.isMobileDevice());

    this.initPlugins(BUILTIN_PLUGINS);
  }

  get inputArea() {
    return this._inputArea !== undefined
      ? this._inputArea
      : this.view
        ? this.view.input
        : null;
  }

  set inputArea(val) {
    this._inputArea = val;
  }

  get termWin() {
    return this._termWin !== undefined
      ? this._termWin
      : this.view
        ? this.view.termWin
        : null;
  }

  set termWin(val) {
    this._termWin = val;
  }

  showTermWindow() {
    this.view?.showTermWindow();
  }

  get plugins() {
    return this.pluginManager?.plugins ?? this._plugins ?? [];
  }

  set plugins(val) {
    if (this.pluginManager) {
      this.pluginManager.plugins = val;
    } else {
      this._plugins = val;
    }
  }

  get overlays() {
    return this.pluginManager?.overlays ?? this._overlays ?? [];
  }

  set overlays(val) {
    if (this.pluginManager) {
      this.pluginManager.overlays = val;
    } else {
      this._overlays = val;
    }
  }

  get contextMenuItems() {
    return this.pluginManager?.contextMenuItems ?? this._contextMenuItems ?? [];
  }

  set contextMenuItems(val) {
    if (this.pluginManager) {
      this.pluginManager.contextMenuItems = val;
    } else {
      this._contextMenuItems = val;
    }
  }

  registerPlugin(plugin) {
    return this.pluginManager.registerPlugin(plugin);
  }

  unregisterPlugin(pluginOrId) {
    return this.pluginManager.unregisterPlugin(pluginOrId);
  }

  destroyPlugins() {
    return this.pluginManager.destroyPlugins();
  }

  destroy() {
    this.clearBellTabAlert();
    if (this.timerEverySec) {
      this.timerEverySec.cancel();
      this.timerEverySec = null;
    }
    if (this.inputAreaFocusTimer) {
      this.inputAreaFocusTimer.cancel();
      this.inputAreaFocusTimer = null;
    }
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
      this.resizeTimeout = null;
    }
    this.pluginManager.destroy();
  }

  registerOverlay(overlay) {
    return this.pluginManager.registerOverlay(overlay);
  }

  unregisterOverlay(idOrOverlay) {
    return this.pluginManager.unregisterOverlay(idOrOverlay);
  }

  getOverlays() {
    return this.pluginManager.getOverlays();
  }

  registerContextMenuItem(item) {
    return this.pluginManager.registerContextMenuItem(item);
  }

  unregisterContextMenuItem(idOrItem) {
    return this.pluginManager.unregisterContextMenuItem(idOrItem);
  }

  getContextMenuItems() {
    return this.pluginManager.getContextMenuItems();
  }

  initPlugins(pluginClasses = BUILTIN_PLUGINS) {
    return this.pluginManager.initPlugins(pluginClasses);
  }

  getPlugin(name) {
    return this.pluginManager.getPlugin(name);
  }

  registerInputInterceptor(interceptor) {
    return this.inputInterceptors.registerInterceptor(interceptor);
  }

  unregisterInputInterceptor(interceptor) {
    return this.inputInterceptors.unregisterInterceptor(interceptor);
  }

  getPluginList() {
    return this.pluginManager.getPluginList();
  }

  dispatchKeyDown(e) {
    if (this.inputInterceptors.dispatchKeyDown(e)) {
      return true;
    }
    return this.handleShortcutKeyDown(e);
  }

  handleShortcutKeyDown(e) {
    if (!e || !e.key) return false;
    const isModifierOnly = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey;
    const isShiftModifier = (e.ctrlKey || e.metaKey) && !e.altKey && e.shiftKey;
    let stop = false;

    if (isModifierOnly) {
      switch (e.key.toLowerCase()) {
        case 'c':
        case 'insert': {
          const selectedText = this.view?.getSelectedText?.();
          if (selectedText) {
            this.doCopy(selectedText);
            this.view?.clearSelection?.();
            this.setInputAreaFocus(true);
            stop = true;
          }
          break;
        }
        case 'a':
          this.doSelectAll();
          stop = true;
          break;
        case 'v':
          if (e.metaKey) {
            this.doPaste();
            stop = true;
          }
          break;
      }
    } else if (isShiftModifier) {
      switch (e.key.toLowerCase()) {
        case 'c': {
          const selectedText = this.view?.getSelectedText?.();
          if (selectedText) {
            this.doCopy(selectedText);
            this.view?.clearSelection?.();
            this.setInputAreaFocus(true);
            stop = true;
          }
          break;
        }
        case 'v':
          this.doPaste();
          stop = true;
          break;
      }
    }

    if (stop) {
      e.preventDefault?.();
      return true;
    }
    return false;
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
    if (
      this._hasConnectedOnce &&
      canCheckVersion({ intervalMs: CONNECT_CHECK_INTERVAL_MS })
    ) {
      checkVersionAndReloadIfNeeded({
        intervalMs: CONNECT_CHECK_INTERVAL_MS,
      }).then((reloading) => {
        if (!reloading) {
          this._doConnect(url, siteType);
        }
      });
      return;
    }
    this._doConnect(url, siteType);
  }

  _doConnect(url, siteType) {
    this._hasConnectedOnce = true;
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

    const wsConn = new Websocket(parsed.url);
    this.emit('term:socket', { socket: wsConn });
    this.conn = wsConn;
    this.stream.attach(wsConn);
    this.stream.charset = this.site ? this.site.charset : 'big5';
    this.conn.addEventListener('open', () => this.onConnect());
    this.conn.addEventListener('close', () => this.onClose());
    this.conn.addEventListener('data', (e) => {
      this.site.onData(e.data, this.buf);
    });

    this.connectedUrl = {
      url: url,
      hostname: parsed.hostname,
      host: parsed.host,
      port: parsed.port,
      type: this.site.name,
      siteType: this.site.name,
    };
  }

  onConnect() {
    this.conn.isConnected = true;
    if (this.stream) {
      this.stream.charset = this.site ? this.site.charset : 'big5';
    }
    this.site?.resetLoginPrompt?.();
    console.info('app onConnect');
    this.connectState = 1;
    this.updateTabIcon('connect');
    this.setTitle({ conn: this.connectedUrl.hostname });
    this.emit('term:connect');
    this.buf.emit('term:connect');
    if (this.timerEverySec) {
      this.timerEverySec.cancel();
    }
    this.timerEverySec = setTimer(
      true,
      () => {
        this.emit('term:tick', { intervalMs: 1000 });
        this.view.onBlink();
      },
      1000
    );
  }

  onClose() {
    console.info('app onClose');
    this.clearBellTabAlert();
    if (this.timerEverySec) {
      this.timerEverySec.cancel();
      this.timerEverySec = null;
    }
    this.conn.isConnected = false;
    this.site?.resetLoginPrompt?.();

    this.connectState = 2;
    this.mouse?.resetButtonState?.();
    this.emit('term:disconnect');
    this.buf.emit('term:disconnect');

    this.showAlert('connection', {
      onDismiss: () => {
        this.connect(this.connectedUrl.url);
      },
    });
    this.updateTabIcon('disconnect');
    checkVersionAndReloadIfNeeded({
      intervalMs: DISCONNECT_CHECK_INTERVAL_MS,
    });
  }

  updateDocumentTitle() {
    if (typeof document === 'undefined') return;
    if (this.hasBellAlert && this._bellTitleBlinkState) {
      document.title = '🔔 ' + this.title;
    } else {
      document.title = this.title;
    }
  }

  triggerBellTabAlert() {
    this.hasBellAlert = true;
    this._bellTitleBlinkState = true;
    this.updateDocumentTitle();
    if (!this._bellTitleTimer) {
      this._bellTitleTimer = setTimer(
        true,
        () => {
          if (isWindowFocused()) {
            this.clearBellTabAlert();
            return;
          }
          this._bellTitleBlinkState = !this._bellTitleBlinkState;
          this.updateDocumentTitle();
        },
        1000
      );
    }
  }

  clearBellTabAlert() {
    if (this._bellTitleTimer) {
      this._bellTitleTimer.cancel();
      this._bellTitleTimer = null;
    }
    if (this.hasBellAlert || this._bellTitleBlinkState) {
      this.hasBellAlert = false;
      this._bellTitleBlinkState = false;
      this.updateDocumentTitle();
    }
  }

  setTitle(part) {
    if (part && typeof part === 'object') {
      if (typeof part.site === 'string') {
        this.titleSite = part.site;
      }
      if (typeof part.conn === 'string') {
        this.titleConn = part.conn;
      }
    }
    let title = this.titleBase;
    if (this.dynamicTitle) {
      if (this.titleSite) {
        title += ' - ' + this.titleSite;
      }
      if (this.titleConn) {
        title += ' - ' + this.titleConn;
      }
    }
    this.title = title;
    this.updateDocumentTitle();
  }

  send(data) {
    this.emit('term:send', { data });
    this.stream.send(data);
  }

  sendKey(key) {
    return this.view?.keyboard?.sendKey(key) ?? false;
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

  setInputAreaFocus(force = false) {
    if (!this.inputArea) return;
    if (this.modalShown || this.contextMenuShown) {
      this.emit(
        'debug:touch',
        'setInputAreaFocus blocked: modal or context menu active'
      );
      return;
    }
    if (this.preserveDomSelection && !force && !this.isSelectionCollapsed()) {
      this.emit(
        'debug:touch',
        'setInputAreaFocus blocked: preserving text selection'
      );
      return;
    }
    if (this.isMobileDevice() && !force) {
      this.emit(
        'debug:touch',
        'setInputAreaFocus blocked: mobile device and not force'
      );
      return;
    }
    if (this.isMobileLayout() && !force) {
      this.emit(
        'debug:touch',
        'setInputAreaFocus blocked: mobile layout and not force'
      );
      return;
    }
    if (
      this.touch &&
      (this.touch.touchStarted ||
        Date.now() - (this.touch.lastTouchTime || 0) < 500) &&
      !force
    ) {
      this.emit(
        'debug:touch',
        'setInputAreaFocus blocked: recent touch (<500ms) and not force'
      );
      return;
    }
    if (this.view?.isComposition && document.activeElement === this.inputArea) {
      this.emit(
        'debug:touch',
        'setInputAreaFocus no-op: active IME composition'
      );
      return;
    }
    if (document.activeElement === this.inputArea && !force) {
      this.emit(
        'debug:touch',
        'setInputAreaFocus no-op: inputArea already activeElement'
      );
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
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
    }
  }

  isSelectionCollapsed() {
    if (this.hasActiveInputInterceptor()) {
      return typeof window !== 'undefined' && window.getSelection
        ? window.getSelection().isCollapsed
        : true;
    }
    return this.view.isSelectionCollapsed();
  }

  async doCopy(str) {
    await this.clipboard.copyText(str, {
      trimTrailingSpaces: this.trimTrailingSpaces,
    });
  }

  doCopyAnsi() {
    if (!this.lastSelection) return;
    const ansiText = this.buf.getSelectionText(this.lastSelection, {
      color: true,
      lines: this.lastSelection.lines,
    });
    this.doCopy(ansiText);
    this.view?.clearSelection?.();
    this.setInputAreaFocus(true);
  }

  onDOMCopy(e) {
    this.emit('term:user-activity', { type: 'copy' });
    const hadStrToCopy = Boolean(this.clipboard.strToCopy);
    this.clipboard.handleDOMCopy(e, {
      getSelectedText: () => this.view?.getSelectedText(),
      trimTrailingSpaces: this.trimTrailingSpaces,
    });
    if (!hadStrToCopy && e?.defaultPrevented) {
      this.view?.clearSelection?.();
      this.setInputAreaFocus(true);
    }
  }

  async doPaste() {
    this.view?.clearSelection?.();
    this.setInputAreaFocus(true);
    try {
      const text = await this.clipboard.readText();
      this.dispatchPaste(text);
      return;
    } catch {}
    this.modalShown = true;
    this.showAlert('pasteShortcut', {
      onDismiss: () => {
        this.modalShown = false;
      },
    });
  }

  dispatchPaste(content, originalEvent = null) {
    const event = this.clipboard.createPasteEvent(content, originalEvent);
    if (!event) {
      return false;
    }
    this.emitStoppable('term:paste', event);
    return this.clipboard.completePaste(this.view, event);
  }

  onDOMPaste(e) {
    if (!e || e.defaultPrevented || this.modalShown || this.isDialogOrExcludedTarget(e)) {
      return;
    }
    if (
      e.target &&
      e.target !== this.inputArea &&
      (e.target.tagName === 'INPUT' ||
        e.target.tagName === 'TEXTAREA' ||
        e.target.isContentEditable)
    ) {
      return;
    }
    const str = this.clipboard.handleDOMPaste(e);
    if (str) {
      this.view?.clearSelection?.();
      this.setInputAreaFocus(true);
      this.dispatchPaste(str, e);
    }
  }

  doSelectAll() {
    this.view.selectAll();
    this.lastSelection = this.view.getSelectionColRow();
  }

  doSearchGoogle(searchTerm) {
    if (!searchTerm) return;
    window.open(
      'https://www.google.com/search?q=' + encodeURIComponent(searchTerm),
      '_blank',
      'noopener,noreferrer'
    );
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
    const isPortrait =
      this.view.innerBounds.width > 0 &&
      this.view.innerBounds.height > 0 &&
      this.view.innerBounds.width < this.view.innerBounds.height;
    const orientationChanged =
      this._lastIsPortrait !== undefined && this._lastIsPortrait !== isPortrait;
    this._lastIsPortrait = isPortrait;

    const safeAreaLeft = this.view.getTermWinOffset?.().left || 0;
    const safeAreaChanged =
      this._lastSafeAreaLeft !== undefined && this._lastSafeAreaLeft !== safeAreaLeft;
    this._lastSafeAreaLeft = safeAreaLeft;

    if (orientationChanged || safeAreaChanged) {
      if (this.resizeTimeout) {
        clearTimeout(this.resizeTimeout);
        this.resizeTimeout = null;
      }
      this.view.resetPan?.();
      if (this.prefValues) {
        this.applyTermSizeMode(this.prefValues);
      } else if (this.resizer) {
        this.resizer();
      } else {
        this.view.fontResize();
        this.view.redraw(true);
      }
      return;
    }

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
          this.view.redraw(true);
        }
      }, 500);
    } else {
      this.view.fontResize();
      this.view.redraw(true);
    }
  }

  setTermSize(cols, rows) {
    const requestedCols = cols;
    const requestedRows = rows;
    const clamped = this.site.clampTermSize(cols, rows);
    cols = clamped.cols;
    rows = clamped.rows;

    console.debug(
      `[setTermSize] decided size: ${cols}x${rows} (requested: ${requestedCols}x${requestedRows}, current: ${this.buf.cols}x${this.buf.rows}, site: ${this.site.name})`
    );

    if (this.buf.cols == cols && this.buf.rows == rows) {
      return;
    }

    this.buf.resize(cols, rows);
    this.stream.sendNaws(cols, rows);
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
      const newLink = document.createElement('link');
      newLink.setAttribute('rel', 'icon');
      newLink.setAttribute('href', icon);
      document.head.appendChild(newLink);
    } else {
      link.setAttribute('href', icon);
    }
  }

  // use this method to get better window size in case of page zoom != 100%
  getWindowInnerBounds() {
    return this.view.getWindowInnerBounds();
  }

  getFirstGridOffsets() {
    return this.view.getFirstGridOffsets();
  }

  clientToPos(cX, cY) {
    return this.view.clientToPos(cX, cY);
  }

  onMouse_click(e, force = false) {
    return this.mouse.dispatchClick(e, force);
  }

  onMouse_move(cX, cY, refresh = false, force = false, options = {}) {
    return this.mouse.dispatchMove(cX, cY, refresh, force, options);
  }

  hasTouchSupport() {
    if (typeof window === 'undefined') return false;
    return 'ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
  }

  isMobileLayout() {
    if (!this.hasTouchSupport()) return false;
    const isNarrow = window.innerWidth <= 768;
    const isCompactLandscape =
      window.innerHeight <= 500 && window.innerWidth <= 1024;
    return isNarrow || isCompactLandscape;
  }

  isMobileDevice() {
    if (!this.hasTouchSupport()) return false;
    const isMobileUA = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(
      (navigator && navigator.userAgent) || ''
    );
    const hasCoarseOnly =
      window.matchMedia &&
      window.matchMedia('(pointer: coarse)').matches &&
      !window.matchMedia('(pointer: fine)').matches;
    return isMobileUA || hasCoarseOnly || this.isMobileLayout();
  }

  get resizer() {
    return this.view.resizer;
  }

  set resizer(val) {
    this.view.resizer = val;
  }

  applyTermSizeMode(values) {
    if (!values) return;
    this.view.applyTermSizeMode(values, {
      isMobile: this.isMobileLayout(),
      onResizeTerm: (cols, rows) => this.setTermSize(cols, rows),
    });
  }

  _applyCurrentColorScheme() {
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
      if (!this._batchUpdatingPrefs) {
        this.view.redraw(true);
      }
    }
  }

  onValuesPrefChange(values) {
    const prevValues = this._prefsInitialized ? this.prefValues || {} : null;
    this._prefsInitialized = true;
    this.prefValues = { ...values };
    if (values && values.colorScheme !== undefined) {
      this.colorScheme = values.colorScheme;
    }
    this._batchUpdatingPrefs = true;
    this._pendingColorScheme = false;
    try {
      for (const name in values) {
        const prevVal = prevValues ? prevValues[name] : undefined;
        const nextVal = values[name];
        const changed =
          !prevValues ||
          prevVal !== nextVal ||
          (typeof nextVal === 'object' &&
            nextVal !== null &&
            JSON.stringify(prevVal) !== JSON.stringify(nextVal));
        if (changed) {
          this.onPrefChange(name, nextVal);
        }
      }
      if (this._pendingColorScheme) {
        this._applyCurrentColorScheme();
      }
      // These prefs have to be processed as a whole.
      this.applyTermSizeMode(values);
    } catch (e) {
    } finally {
      this._batchUpdatingPrefs = false;
      this._pendingColorScheme = false;
    }
  }

  onPrefChange(name, value) {
    try {
      this.emit('term:pref-change', {
        key: name,
        value,
      });
      switch (name) {
        case 'uiLocale':
          setupI18n(value);
          this.emit('term:i18n:change', {
            lang: value,
          });
          this.emit('term:overlay:update');
          break;
        case 'copyOnSelect':
          this.copyOnSelect = value;
          break;
        case 'trimTrailingSpaces':
          this.trimTrailingSpaces = !!value;
          break;
        case 'mouseLeftFunction':
          this.mouseLeftFunction = normalizeMouseButtonAction(value, 'left');
          break;
        case 'mouseMiddleFunction':
          this.mouseMiddleFunction = normalizeMouseButtonAction(value, 'middle');
          break;
        case 'rightClickAction':
          this.rightClickAction = normalizeMouseButtonAction(value, 'right');
          break;
        case 'mouseWheelAction':
          this.mouseWheelAction = value;
          break;
        case 'mouseWheelRightAction':
          this.mouseWheelRightAction = value;
          break;
        case 'mouseWheelLeftAction':
          this.mouseWheelLeftAction = value;
          break;
        case 'mouseWheelTrackpadMode':
          this.mouseWheelTrackpadMode = !!value;
          break;
        case 'enableBackNavigation':
          this.enableBackNavigation = !!value;
          this.backNav?.syncOverscrollStyle?.();
          break;
        case 'warnBeforeClose':
          this.warnBeforeClose = !!value;
          break;
        case 'colorScheme':
          this.colorScheme = value;
        // fallthrough
        case 'customColors':
        case 'customDefaultBg':
        case 'customDefaultFg':
        case 'customDefaultLink':
        case 'customForcePlainText':
        case 'minimumContrast':
          if (this._batchUpdatingPrefs) {
            this._pendingColorScheme = true;
          } else {
            this._applyCurrentColorScheme();
          }
          break;
        case 'enableBell':
          setTerminalBellEnabled(value);
          break;
        case 'enableVisualBell':
          this.enableVisualBell = !!value;
          break;
        case 'backspaceKey':
          this.backspaceKey = value;
          this.view?.setKeyMapOptions?.({ backspaceKey: value });
          break;
        case 'deleteKey':
          this.deleteKey = value;
          this.view?.setKeyMapOptions?.({ deleteKey: value });
          break;
        case 'lineHeight':
          this.lineHeight = parseFloat(value) || DEFAULT_PREFS.lineHeight;
          if (this.view) {
            this.view.lineHeight = this.lineHeight;
          }
          if (!this._batchUpdatingPrefs) {
            try {
              this.applyTermSizeMode(this.prefValues);
            } catch (e) {}
          }
          break;
        case 'dbcsDetect':
          this.view.dbcsDetect = value;
          break;
        case 'fontFace': {
          let fontFace = value;
          if (!fontFace) fontFace = 'monospace';
          this.view.setFontFace(fontFace);
          if (!this._batchUpdatingPrefs) {
            this.view.redraw(true);
          }
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
          if (this.view.chw && this.view.chh) {
            this.view.setTermFontSize(this.view.chw, this.view.chh, this.view.fontSizePx);
          }
          if (!this._batchUpdatingPrefs) {
            this.view.redraw(true);
          }
          break;
        case 'smoothAnsiArt':
          this.view.smoothAnsiArt = !!value;
          if (!this._batchUpdatingPrefs) {
            this.view.redraw(true);
          }
          break;
        case 'supportMouseReporting':
          if (this.buf.locator) {
            this.buf.locator.enabled = !!value;
          }
          break;

        default:
          break;
      }
    } catch (e) {
      // eats all errors
      return;
    }
  }

  isDialogOrExcludedTarget(e) {
    return this.mouse.isDialogOrExcludedTarget(e);
  }

  mouse_click(e) {
    return this.mouse.onClick(e);
  }

  mouse_down(e) {
    return this.mouse.onMouseDown(e);
  }

  mouse_up(e) {
    return this.mouse.onMouseUp(e);
  }

  mouse_move(e) {
    return this.mouse.onMouseMove(e);
  }

  mouse_scroll(e) {
    return this.mouse.onWheel(e);
  }

  setNavCmd(cmd) {
    const context = arguments[1];
    if (this.inputInterceptors?.dispatchNavCmd(cmd, context)) {
      return;
    }
    switch (cmd) {
      case 'doArrowUp':
        this.send('\x1b[A');
        break;
      case 'doArrowDown':
        this.send('\x1b[B');
        break;
      case 'doPageUp':
        this.send('\x1b[5~');
        break;
      case 'doPageDown':
        this.send('\x1b[6~');
        break;
      case 'doLeft':
        this.send('\x1b[D');
        break;
      case 'doRight':
        this.send('\x1b[C');
        break;
      case 'doEnter':
        this.send('\r');
        break;
      case 'doHome':
        this.send('\x1b[1~');
        break;
      case 'doEnd':
        this.send('\x1b[4~');
        break;
      case 'doEsc':
        this.send('\x1b');
        break;
      case 'previousThread':
      case 'nextThread':
      case 'firstThread':
      case 'lastThreadList':
      case 'lastThreadReading':
      case 'refreshPost': {
        let threadKey = cmd;
        if (cmd === 'previousThread') threadKey = 'prevThread';
        const threadCmd = this.site?.getThreadCommand(threadKey);
        if (threadCmd) {
          this.send(threadCmd);
        }
        break;
      }
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
    const bounds = this.getWindowInnerBounds();
    const isPortrait = bounds.width > 0 && bounds.height > 0 && bounds.width < bounds.height;
    const currentPrefs = readValuesWithDefault();
    const currentSize =
      this.view.fontSizePx ||
      this.view.chh ||
      (isPortrait ? currentPrefs.fontSizePortrait : currentPrefs.fontSize) ||
      getDefaultFontSize(isPortrait);
    const newSize = Math.max(8, Math.min(60, currentSize + delta * 2));
    if (newSize === currentSize) return;

    const nextPrefs = {
      ...currentPrefs,
      ...(isPortrait ? { fontSizePortrait: newSize } : { fontSize: newSize }),
    };
    writeValues(nextPrefs);
    this.onValuesPrefChange(nextPrefs);
  }
}
