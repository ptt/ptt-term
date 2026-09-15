// Terminal View

import { EventEmitter } from './event.js';
import { TermBuf } from './term_buf.js';
import { TermKeyboard } from './term_keyboard';
import { termColors, termInvColors, termDefaultBg, termDefaultFg, termDefaultLink, getContrastColor } from './color_schemes.js';
import { renderRowHtml, renderScreen } from './term_ui';
import { _ } from './i18n';
import { setTimer } from './util';
import { hasWebKitImeQuirk, shouldPreserveDomSelection } from './quirks';
import { wcwidth, wcswidth, stringWidth } from './string_util';
import { DEFAULT_PREFS, getDefaultFontSize } from './pref.js';
import { getAsciiLetterSpacingEm, getAsciiWidthRatio } from './font_util.js';

const DEFINE_INPUT_BUFFER_SIZE = 12;

export class TermView extends EventEmitter {
  constructor(options = {}) {
    super();

    // Workaround for WebKit and Gecko engine quirks
    this.hasWebKitImeQuirk = typeof options?.hasWebKitImeQuirk === 'boolean'
      ? options.hasWebKitImeQuirk
      : hasWebKitImeQuirk();

    this.preserveDomSelection = typeof options?.preserveDomSelection === 'boolean'
      ? options.preserveDomSelection
      : shouldPreserveDomSelection();

    this._domSelectedText = '';
    this._domSelectionColRow = null;
    //new pref - start
  this.termWidth = 0;
  this.termHeight = 0;
  this.dbcsDetect = true;
  this.highlightedRow = -1;
  this.highlightBG = 2;
  this._charset = 'big5';
  //this.highlightFG = 7;
  this.fontFitWindowWidth = DEFAULT_PREFS.fontFitWindowWidth;
  this.useCanvasEngine = DEFAULT_PREFS.useCanvasEngine;
  this.smoothAnsiArt = DEFAULT_PREFS.smoothAnsiArt;
  //new pref - end

  this.viewMargin = DEFAULT_PREFS.termMargin;

  this.app = options.app || null;
  this.buf = options.buf || new TermBuf(DEFAULT_PREFS.termSize.cols, DEFAULT_PREFS.termSize.rows);
  this.buf.view = this;
  this.buf.on('change', () => this.update());
  this.buf.on('cursor-move', () => this.updateCursorPos());
  this.buf.on('blink', () => this.onBlinkToggle());

  this.blinkOn = false;

  // React
  this.componentScreen = {
    setCurrentHighlighted() {},
    onBlink() {},
    getSelectedText() { return ''; },
    getSelectionColRow() { return null; },
    selectAll() {},
    startSelection() {},
    updateSelection() {},
    endSelection() { return ''; },
    clearSelection() {},
  };

  this.input = document.getElementById('t');
  this.cursor = document.getElementById('cursor');
  this.termWin = document.getElementById('TermWindow');
  this.cursorStyle = DEFAULT_PREFS.cursorStyle;
  this.lineHeight = DEFAULT_PREFS.lineHeight;
  this.fontSizePx = getDefaultFontSize();
  this.chw = this.fontSizePx / 2;
  this.chh = Math.round(this.fontSizePx * (this.lineHeight || 1.0));
  this.enableLinkHoverPreview = true;
  this.renderHyperlinkPreview = null;
  this.scaleX = 1;
  this.scaleY = 1;

  this.updateHighlightColor();

  // for cpu efficiency
  this.innerBounds = { width: 0, height: 0 };
  this.firstGridOffset = { top: 0, left: 0 };
  this.panX = 0;
  this.panY = 0;



  if (this.termWin) {
    this.termWin.setAttribute('align', 'center');
  }

  const mainDisplay = document.createElement('div');
  mainDisplay.setAttribute('class', 'main');
  mainDisplay.style.transformOrigin = 'center';
  this.termWin.appendChild(mainDisplay);
  this.mainDisplay = mainDisplay;

  const screenContainer = document.createElement('div');
  screenContainer.setAttribute('id', 'screenContainer');
  mainDisplay.appendChild(screenContainer);
  this.screenContainer = screenContainer;

  this.mainDisplay.style.border = '0px';
  this.setFontFace(DEFAULT_PREFS.fontFace);
  this.fixedResize(this.fontSizePx);

  if (typeof document !== 'undefined' && document.fonts) {
    if (typeof document.fonts.load === 'function') {
      try {
        document.fonts.load('16px SymMingLiu').catch(() => {});
      } catch (e) {}
    }
    const handleFontsLoaded = () => {
      if (this.fontFace) {
        this.setFontFace(this.fontFace);
        if (!this.useCanvasEngine) {
          this.redraw(true);
        }
        this.updateCursorPos();
      }
    };
    if (document.fonts.ready && typeof document.fonts.ready.then === 'function') {
      document.fonts.ready.then(handleFontsLoaded).catch(() => {});
    }
    if (typeof document.fonts.addEventListener === 'function') {
      document.fonts.addEventListener('loadingdone', handleFontsLoaded);
    }
  }

  this._keyboard = new TermKeyboard((data) => this._send(data));
  this._keyboard.on('term:key', (detail) => {
    const termDetail = { ...detail, term: this, view: this, buf: this.buf };
    this.emit('term:key', termDetail);
    this.buf.emit('term:key', termDetail);
  });

  this.input.addEventListener('compositionstart', (e) => {
    this.onCompositionStart(e);
    this.app.setInputAreaFocus();
  }, false);

  this.input.addEventListener('compositionend', (e) => {
    this.onCompositionEnd(e);
    this.app.setInputAreaFocus();
    // Some browsers fire another input event after composition; some not.
    // The strategy here is to ignore the inputs during composition.
    // Instead, we pull all input text at composition end, and clear input text.
    // So if input event do fire after composition end, we'll get a empty string.
    this.onInput(e);
  }, false);

  let shouldAcceptInput = () => !this.app.modalShown && !this.app.contextMenuShown;
  let keyEventFilter = (e) => {
    // On both Mac and Windows, control/alt+key will be sent as original key
    // code even under IME.
    // Char inputs will be handler on input event.
    // We can safely ignore those IME keys here.
    if (e.isComposing || e.key === 'Process' || e.keyCode == 229)
      return false;

    // iOS sends the keydown that starts composition as key code 0 or Unidentified. Ignore it.
    if (e.key === 'Unidentified' || e.keyCode == 0)
      return false;

    // iOS sends backspace when composing. Disallow any non-control keys during it.
    if (this.isComposition && !e.ctrlKey && !e.altKey)
      return false;

    // Workaround for Safari: WebKit (Safari / DuckDuckGo on macOS & iOS) Bug 165004.
    // WebKit dispatches compositionend BEFORE firing the keydown event of the key that committed
    // the composition (e.g. Enter, Space, candidate digits 1-9, or arrow keys).
    // In that trailing keydown event, e.isComposing is false, keyCode is normal (13/32/etc.),
    // and this.isComposition has already become false.
    //
    // By using the 'Lock Delay' pattern:
    // When hasWebKitImeQuirk is enabled, we maintain an event-loop task lock (_isComposingSafe) cleared via setTimeout(0),
    // along with a fallback timestamp. Because the browser event loop processes queued
    // UI events in strict FIFO order before processing newly scheduled timer tasks,
    // the trailing keydown is guaranteed to run while the lock is active, completely immune
    // to system lag, GC pauses, or wall-clock jitter.
    if (this.hasWebKitImeQuirk) {
      const isTrailingCommitKey = Boolean(
        this._isComposingSafe ||
        (this._lastCompositionEndTime && (Date.now() - this._lastCompositionEndTime < 100))
      );
      if (isTrailingCommitKey) {
        if (
          e.key === 'Enter' ||
          e.key === ' ' ||
          e.key === 'ArrowDown' ||
          e.key === 'ArrowUp' ||
          e.key === 'ArrowLeft' ||
          e.key === 'ArrowRight' ||
          /^[1-9]$/.test(e.key) ||
          e.keyCode === 13 ||
          e.keyCode === 32
        ) {
          this._isComposingSafe = false;
          this._lastCompositionEndTime = 0;
          e.preventDefault();
          return false;
        }
        this._isComposingSafe = false;
        this._lastCompositionEndTime = 0;
      }
    }

    // Allow meta keys on macOS for shortcuts like Cmd+A, Cmd+C, Cmd+V
    if (e.metaKey) {
      const k = e.key ? e.key.toLowerCase() : '';
      if (k === 'a' || k === 'c' || k === 'v') {
        return true;
      }
      return false;
    }

    return true;
  };

  addEventListener('keydown', (e) => {
    if (!shouldAcceptInput())
      return;
    if (this.app && !this.app.isDialogOrExcludedTarget(e) && typeof document !== 'undefined' && document.activeElement !== this.input) {
      const isHoldSelectionModifier =
        e.key === 'Control' ||
        e.key === 'Meta' ||
        e.key === 'Alt' ||
        e.keyCode === 17 ||
        e.keyCode === 18 ||
        e.keyCode === 91 ||
        e.keyCode === 93;
      if (e.key === 'Shift' && !e.ctrlKey && !e.metaKey && !e.altKey && !this.isSelectionCollapsed()) {
        this.clearSelection();
        this.app.setInputAreaFocus(true);
      } else if (!isHoldSelectionModifier || this.isSelectionCollapsed()) {
        this.app.setInputAreaFocus();
      }
    }
    if (!keyEventFilter(e))
      return;

    if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || (e.keyCode > 15 && e.keyCode < 19))
      return; // Shift Ctrl Alt
    this.onKeyDown(e);
  }, false);

  addEventListener('keyup', (e) => {
    // We don't need to handle code 229 here, as it should be already composing.

    if (!shouldAcceptInput())
      return;
    if (e.key === 'Shift' && !e.ctrlKey && !e.metaKey && !e.altKey && !this.isSelectionCollapsed()) {
      this.clearSelection();
      this.app.setInputAreaFocus(true);
      return;
    }
    if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || (e.keyCode > 15 && e.keyCode < 19))
      return; // Shift Ctrl Alt
    if (
      (this.preserveDomSelection || this.isUsingDomSelection()) &&
      this.app &&
      !this.app.isSelectionCollapsed()
    ) {
      return;
    }
    // set input area focus whenever key down even if there is selection
    this.app.setInputAreaFocus();
  }, false);

  this.input.addEventListener('input', (e) => {
    this.onInput(e);
  }, false);

  this.input.addEventListener('paste', (e) => {
    this.app?.onDOMPaste(e);
  }, false);

  this.input.addEventListener('blur', () => {
    if (this.app?.isMobileDevice?.()) {
      this.input.setAttribute('inputmode', 'none');
    }
  }, false);

  if (typeof document !== 'undefined') {
    document.addEventListener('selectionchange', () => {
      if (!this.preserveDomSelection && !this.isUsingDomSelection()) return;
      if (typeof window === 'undefined' || !window.getSelection) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
        const text = sel.toString().replace(/\u00a0/g, " ");
        if (text) {
          this._domSelectedText = text;
          try {
            const r = sel.getRangeAt(0);
            this._domSelectionColRow = {
              start: this.countCol(r.startContainer, r.startOffset),
              end: this.countCol(r.endContainer, r.endOffset)
            };
            this.emit('term:selection-change', {
              selection: this._domSelectionColRow,
            });
          } catch (err) {
            this._domSelectionColRow = null;
          }
        }
      }
    });
  }
  }

  get mainContainer() {
    return document.getElementById('mainContainer');
  }


  onBlink() {
    this.blinkOn = true;
    this.buf.queueBlink();
  }

  onBlinkToggle() {
    this.blinkOn = false;
    if (typeof document !== 'undefined') {
      document.body?.classList?.toggle('blink--active');
      document.dispatchEvent(new CustomEvent('term-blink'));
    }
    if (this.useCanvasEngine && this.componentScreen) {
      this.componentScreen.onBlink();
    }
  }

  get conn() {
    return this.app?.conn || null;
  }

  get charset() {
    return this.app?.stream?.charset || this.app?.site?.charset || this._charset;
  }

  set charset(val) {
    this._charset = val;
    if (this.app?.stream) {
      this.app.stream.charset = val;
    }
    if (this.app?.site) {
      this.app.site.charset = val;
    }
  }

  _send(data) {
    this.app.send(data);
  }

  get keyboard() {
    return this._keyboard;
  }

  setKeyMapOptions({ backspaceKey, deleteKey } = {}) {
    if (this._keyboard) {
      if (backspaceKey !== undefined) this._keyboard.backspaceKey = backspaceKey;
      if (deleteKey !== undefined) this._keyboard.deleteKey = deleteKey;
    }
  }

  showTermWindow() {
    if (this.termWin && this.termWin.style) {
      this.termWin.style.display = '';
    }
    this.innerBounds = this.getWindowInnerBounds();
    this.firstGridOffset = this.getFirstGridOffsets();
  }

  setCursor(cursorStyle) {
    if (this.termWin && this.termWin.style) {
      this.termWin.style.cursor = cursorStyle;
    }
  }

  setTransFix(enabled) {
    if (this.mainDisplay && this.mainDisplay.classList) {
      this.mainDisplay.classList.toggle('trans-fix', !!enabled);
    }
  }

  configureInputMode(isMobile) {
    if (!this.input) return;
    if (isMobile) {
      this.input.setAttribute('inputmode', 'none');
      this.input.setAttribute('virtualkeyboardpolicy', 'manual');
    } else {
      // Workaround for Safari / Desktop: index.html defines inputmode="none" for mobile touch devices.
      // On desktop browsers (especially Safari & Chrome), inputmode="none" suppresses native IME composition.
      this.input.removeAttribute('inputmode');
      this.input.removeAttribute('virtualkeyboardpolicy');
    }
  }

  sendKey(key) {
    return this._keyboard ? this._keyboard.sendKey(key) : false;
  }

  triggerVisualBell() {
    const el = this.screenContainer || (typeof document !== 'undefined' ? document.getElementById('screenContainer') : null);
    if (!el || !el.classList) return;
    el.classList.remove('visual-bell');
    void el.offsetWidth;
    el.classList.add('visual-bell');
    const onEnd = () => {
      el.classList.remove('visual-bell');
      el.removeEventListener('animationend', onEnd);
    };
    el.addEventListener('animationend', onEnd);
    setTimeout(() => {
      if (el && el.classList) el.classList.remove('visual-bell');
    }, 200);
  }

  setFontFace(fontFace) {
    this.fontFace = fontFace;
    const asciiLsEm = getAsciiLetterSpacingEm(this.fontFace);
    this.asciiLetterSpacing = asciiLsEm ? `${asciiLsEm}em` : '0px';
    if (this.termWin?.style) {
      this.termWin.style.setProperty('--font-face', this.fontFace);
      this.termWin.style.setProperty('--term-ascii-ls', this.asciiLetterSpacing);
    }
    this.input?.style?.setProperty('font-family', this.fontFace, 'important');
    this.mainDisplay?.style?.setProperty('font-family', this.fontFace, 'important');
    this.cursor?.style?.setProperty('font-family', this.fontFace, 'important');
    this.app?.emit?.('term:font-update', {
      fontFace: this.fontFace,
      asciiLetterSpacing: this.asciiLetterSpacing,
    });
  }

  setUseCanvasEngine(enabled) {
    this.useCanvasEngine = !!enabled;
    if (this.chw && this.chh) {
      this.setTermFontSize(this.chw, this.chh, this.fontSizePx);
    }
    this.redraw(true);
  }

  handleRenderFrame(durationMs, isCanvas) {
    const detail = { durationMs, isCanvas: isCanvas ?? this.useCanvasEngine };
    this.app?.emit('term:render-frame', detail);
  }

  handleHyperlinkHover(event, href) {
    const detail = { event, href };
    this.app?.emit('term:hyperlink-hover', detail);
  }

  handleHyperlinkLeave(event) {
    const detail = { event };
    this.app?.emit('term:hyperlink-leave', detail);
  }

  handleHyperlinkMove(event) {
    const detail = { event };
    this.app?.emit('term:hyperlink-move', detail);
  }

  resolveHyperlinkPreview(href) {
    const detail = { href, request: null };
    this.app?.emit('term:hyperlink-preview', detail);
    return detail.request;
  }

  resolveInlineHyperlinkPreview(href, key) {
    if (typeof this.renderInlineHyperlinkPreview === 'function') {
      return this.renderInlineHyperlinkPreview(href, key);
    }
    const detail = { href, request: null, renderInline: null };
    this.app?.emit('term:hyperlink-preview', detail);
    if (typeof detail.renderInline === 'function') {
      return detail.renderInline(key);
    }
    return detail.request;
  }

  get enableMediaPreviewer() {
    return this.enableLinkHoverPreview;
  }

  set enableMediaPreviewer(val) {
    this.enableLinkHoverPreview = Boolean(val);
  }

  isHyperlinkPreviewEnabled() {
    return Boolean(this.enableLinkHoverPreview && this.resolveHyperlinkPreview);
  }

  setHyperlinkPreviewProvider(provider) {
    if (!provider) {
      this.enableLinkHoverPreview = false;
      this.renderHyperlinkPreview = false;
      this.renderInlineHyperlinkPreview = null;
    } else {
      this.enableLinkHoverPreview = Boolean(provider.enabled !== false);
      this.renderHyperlinkPreview = provider.renderHover || false;
      this.renderInlineHyperlinkPreview = provider.renderInline || null;
    }
  }

  update() {
    this.redraw(false);
  }

  redraw(force) {

    const cols = this.buf.cols;
    const rows = this.buf.rows;
    const lineChangeds = this.buf.lineChangeds;
    const changedLineHtmlStrs = [];
    const changedRows = [];

    const lines = this.buf.lines;
    for (let row = 0; row < rows; ++row) {
      if (lineChangeds[row] === false && !force)
        continue;

      changedLineHtmlStrs.push(lines[row]);
      changedRows.push(row);
      lineChangeds[row] = false;
    }
    if (changedLineHtmlStrs.length > 0) {
      const t0 = (typeof performance !== 'undefined')
        ? performance.now()
        : 0;
      const currentFontSize = this.fontSizePx || (this.chw ? this.chw * 2 : this.chh);
      const screenInst = renderScreen(
        /* For Screen#componentDidUpdate */lines.slice(),
        currentFontSize,
        /* showsLinkPreview */false,
        this.enableLinkHoverPreview,
        this.screenContainer,
        {
          ref: (inst) => {
            if (inst) {
              this.componentScreen = inst;
            }
          },
          useCanvas: this.useCanvasEngine,
          cols: this.buf.cols,
          rows: this.buf.rows,
          chw: this.chw,
          chh: this.chh,
          scaleX: this.scaleX,
          scaleY: this.scaleY,
          fontSize: currentFontSize,
          fontFace: this.fontFace,
          highlightBG: this.highlightBG,
          nowHighlight: this.highlightedRow,
          buf: this.buf,
          charset: this.charset,
          copyOnSelect: this.app.copyOnSelect,
          doCopy: this.app.doCopy.bind(this.app),
          setInputAreaFocus: this.app.setInputAreaFocus.bind(this.app),
          onRenderFrame: ({ durationMs, isCanvas }) => {
            this.handleRenderFrame(durationMs, isCanvas);
          },
          smoothAnsiArt: this.smoothAnsiArt,
          colorScheme: this.colorScheme || this.app?.colorScheme,
          defaultBg: termColors.defaultBg || termDefaultBg,
          defaultFg: termColors.defaultFg || termDefaultFg,
          defaultLink: termColors.defaultLink || termDefaultLink,
          forcePlainText: Boolean(termColors.forcePlainText),
          minimumContrast: Number(termColors.minimumContrast) || 0,
          changedRows: changedRows,
          createHyperlinkPreviewRequest: (href) => this.resolveHyperlinkPreview(href),
          renderHyperlinkPreview: this.renderHyperlinkPreview,
          onHyperlinkHover: (e, href) => this.handleHyperlinkHover(e, href),
          onHyperlinkLeave: (e) => this.handleHyperlinkLeave(e),
          onHyperlinkMove: (e) => this.handleHyperlinkMove(e),
        }
      );
      if (screenInst) {
        this.componentScreen = screenInst;
      }
      this.setHighlightedRow(this.highlightedRow);
      if (t0 > 0 && !this.useCanvasEngine) {
        this.handleRenderFrame(performance.now() - t0, false);
      }

      this.app?.emit('term:screen-update', { changedLineHtmlStrs, force: Boolean(force) });
    }
  }

  setHighlightedRow(row) {
    const validRow =
      typeof row === 'number' && Number.isFinite(row) ? Math.floor(row) : -1;
    this.highlightedRow = validRow;
    if (this.componentScreen) {
      this.componentScreen.setCurrentHighlighted(validRow);
    }
  }

  clearHighlight() {
    this.setHighlightedRow(-1);
  }

  updateHighlightColor() {
    if (this.termWin && this.termWin.style) {
      this.termWin.style.setProperty('--highlightBG', termColors[this.highlightBG]);
      //this.termWin.style.setProperty('--highlightFG', termColors[this.highlightFG]);
    }
  }

  onInput(e) {
    if (this.app.modalShown || this.app.contextMenuShown)
      return;
    if (this.isComposition) {
      // beginning chrome 55, we no longer can update input buffer width on compositionupdate
      // so we update it on input event
      this.updateInputBufferWidth();
      return;
    }

    if (this.app?.dispatchTextInput(e)) {
      return;
    }
    if (e.target.value) {
      this.onTextInput(e.target.value);
    }
    e.target.value='';
  }

  paste(text) {
    if (typeof text !== 'string') {
      return;
    }
    this._send(text);
  }

  onTextInput(text, isPasting) {
    if (isPasting) {
      this.paste(text);
      return;
    }

    this._send(text);
  }

  onKeyDown(e) {
    if (this.app?.dispatchKeyDown(e)) {
      return;
    }

    if (!this.isSelectionCollapsed()) {
      this.clearSelection();
      this.app?.setInputAreaFocus?.(true);
    }

    this._keyboard.onKeyDown(e);
    if (e.defaultPrevented)
      return;
  }

  setTermFontSize(cw, ch, fontSizePx) {
    const innerBounds = this.innerBounds;
    this.chw = cw;
    this.chh = ch;
    this.fontSizePx = fontSizePx || (cw * 2);
    const fontSize = this.fontSizePx + 'px';
    const lineHeight = this.chh + 'px';
    const mainWidth = (this.chw * this.buf.cols + 10) + 'px';
    if (this.termWin && this.termWin.style) {
      this.termWin.style.setProperty('--term-font-size', fontSize);
      this.termWin.style.setProperty('--term-chw', this.chw + 'px');
      this.termWin.style.setProperty('--term-chh', this.chh + 'px');
      this.termWin.style.setProperty('--term-line-height', lineHeight);
      this.termWin.style.setProperty('--term-cols', String(this.buf?.cols || 80));
      this.termWin.style.setProperty('--term-rows', String(this.buf?.rows || 24));
      if (this.asciiLetterSpacing !== undefined) {
        this.termWin.style.setProperty('--term-ascii-ls', this.asciiLetterSpacing);
      }
    }
    this.mainDisplay.style.fontSize = fontSize;
    this.mainDisplay.style.lineHeight = lineHeight;
    this.app?.emit?.('term:font-update', {
      fontSize,
      lineHeight,
      asciiLetterSpacing: this.asciiLetterSpacing,
    });
    this.cursor.style.fontSize = fontSize;
    this.cursor.style.lineHeight = lineHeight;
    this.applyCursorStyle();
    this.mainDisplay.style.overflowX = 'hidden';
    this.mainDisplay.style.overflowY = 'hidden';
    this.mainDisplay.style.textAlign = 'left';
    this.mainDisplay.style.width = mainWidth;
    this.mainDisplay.style.height = (this.chh * this.buf.rows) + 'px';

    if (this.fontFitWindowWidth) {
      this.scaleX = Math.floor(innerBounds.width / (this.chw*this.buf.cols+10) * 100)/100;
      this.scaleY = Math.floor(innerBounds.height / (this.chh*this.buf.rows) * 100)/100;
    } else {
      this.scaleX = 1;
      this.scaleY = 1;
    }

    if (this.useCanvasEngine && (this.scaleX != 1 || this.scaleY != 1)) {
      this.mainDisplay.style.width = ((this.chw * this.buf.cols + 10) * this.scaleX) + 'px';
      this.mainDisplay.style.height = (this.chh * this.buf.rows * this.scaleY) + 'px';
    }

    this.updateMainDisplayMargin();

    this.mainDisplay.style.transformOrigin = 'center';
    let scaleCss = 'none';
    if (!this.useCanvasEngine && (this.scaleX != 1 || this.scaleY != 1)) {
      scaleCss = 'scale(' + this.scaleX + ',' + this.scaleY + ')';
    }
    this.mainDisplay.style.transform = scaleCss;

    this.firstGridOffset = this.getFirstGridOffsets();

    this.updateReverseScaleCss();
    this.updateCursorPos();

    if (this.panX > 0 || this.panY > 0) {
      this.setPan(this.panX, this.panY);
    }
  }

  getTermWinOffset() {
    if (this.termWin) {
      if (typeof this.termWin.getBoundingClientRect === 'function') {
        const rect = this.termWin.getBoundingClientRect();
        if (rect && (rect.width > 0 || rect.height > 0 || rect.left > 0 || rect.top > 0)) {
          return { left: rect.left || 0, top: rect.top || 0 };
        }
      }
      if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
        try {
          const style = window.getComputedStyle(this.termWin);
          return {
            left: parseFloat(style?.left) || 0,
            top: parseFloat(style?.top) || 0,
          };
        } catch (e) {}
      }
    }
    return { left: 0, top: 0 };
  }

  getWindowInnerBounds() {
    const offset = this.getTermWinOffset ? this.getTermWinOffset() : { left: 0, top: 0 };
    const docEl = typeof document !== 'undefined' ? document.documentElement : null;
    const clientWidth =
      this.termWin && this.termWin.clientWidth > 0
        ? this.termWin.clientWidth
        : docEl
          ? Math.max(0, docEl.clientWidth - offset.left)
          : 0;
    const clientHeight =
      this.termWin && this.termWin.clientHeight > 0
        ? this.termWin.clientHeight
        : docEl
          ? Math.max(0, docEl.clientHeight - offset.top)
          : 0;
    if (clientWidth === 0 && clientHeight === 0 && !docEl) {
      return { width: 0, height: 0 };
    }
    const width = Math.max(0, clientWidth - (this.viewMargin || 0) * 2);
    const height = Math.max(0, clientHeight - (this.viewMargin || 0) * 2);
    return { width, height };
  }

  getFirstGridOffsets() {
    const container =
      this.mainDisplay ||
      (typeof document !== 'undefined' ? document.querySelector('.main') : null);
    return {
      top: container ? container.offsetTop : 0,
      left: container ? container.offsetLeft : 0,
    };
  }

  getAvailableScrollWidth() {
    const cols = this.buf.cols;
    const totalWidth = this.chw * cols + 10;
    const offset = this.getTermWinOffset ? this.getTermWinOffset() : { left: 0, top: 0 };
    const viewportWidth =
      (this.innerBounds && this.innerBounds.width) ||
      (typeof window !== 'undefined' ? Math.max(0, window.innerWidth - offset.left) : 0);
    return Math.max(0, totalWidth - viewportWidth);
  }

  getAvailableScrollHeight() {
    const rows = this.buf.rows;
    const totalHeight = this.chh * rows + 10;
    const viewportHeight =
      (this.innerBounds && this.innerBounds.height) ||
      (typeof window !== 'undefined' ? window.innerHeight : 0);
    return Math.max(0, totalHeight - viewportHeight);
  }

  updateMainDisplayMargin() {
    if (!this.mainDisplay) return;
    const innerBounds = this.innerBounds || { width: 0, height: 0 };
    const effectiveScaleY = this.useCanvasEngine ? (this.scaleY || 1) : 1;
    const totalHeight = this.chh * this.buf.rows * effectiveScaleY;
    let baseMarginTop = this.viewMargin || 0;
    if (totalHeight < innerBounds.height) {
      baseMarginTop =
        (innerBounds.height - totalHeight) / 2 + (this.viewMargin || 0);
    }
    const curPanY = this.panY || 0;
    this.mainDisplay.style.marginTop = `${baseMarginTop - curPanY}px`;

    const curPanX = this.panX || 0;
    this.mainDisplay.style.marginLeft = `-${curPanX}px`;
  }

  setPan(px, py) {
    const maxPanX = this.getAvailableScrollWidth();
    const maxPanY = this.getAvailableScrollHeight();
    this.panX = Math.max(
      0,
      Math.min(maxPanX, Math.round(px != null ? px : this.panX || 0))
    );
    this.panY = Math.max(
      0,
      Math.min(maxPanY, Math.round(py != null ? py : this.panY || 0))
    );
    this.updateMainDisplayMargin();
    this.firstGridOffset = this.getFirstGridOffsets();
    this.updateCursorPos();
  }

  panBy(deltaX = 0, deltaY = 0) {
    this.setPan((this.panX || 0) + deltaX, (this.panY || 0) + deltaY);
  }

  resetPan() {
    this.setPan(0, 0);
  }
  updateReverseScaleCss() {
    if (this.termWin && this.termWin.style) {
      const revScaleX = this.useCanvasEngine ? 1 : Math.floor((1 / this.scaleX) * 100) / 100;
      const revScaleY = this.useCanvasEngine ? 1 : Math.floor((1 / this.scaleY) * 100) / 100;
      this.termWin.style.setProperty('--preview-scale-x', revScaleX);
      this.termWin.style.setProperty('--preview-scale-y', revScaleY);
    }
  }

  _getGridOrigin() {
    const w = this.innerBounds.width;
    const h = this.innerBounds.height;
    const cols = this.buf.cols;
    const rows = this.buf.rows;
    if (this.scaleX != 1 || this.scaleY != 1) {
      return [
        (w - (this.chw * cols + 10) * this.scaleX) / 2 + (this.viewMargin || 0),
        (h - (this.chh * rows) * this.scaleY) / 2 + (this.viewMargin || 0),
      ];
    }
    return [
      parseFloat(this.firstGridOffset?.left) || 0,
      parseFloat(this.firstGridOffset?.top) || 0,
    ];
  }

  convertMN2XYEx(cx, cy) {
    const origin = this._getGridOrigin();
    const realX = origin[0] + cx * this.chw * this.scaleX;
    const realY = origin[1] + cy * this.chh * this.scaleY;
    return [realX, realY];
  }

  clientToPos(cX, cY) {
    const customPos = this.app?.inputInterceptors?.getClientToPos?.(cX, cY);
    if (customPos) {
      return customPos;
    }
    const origin = this._getGridOrigin();
    const termWinOffset = this.getTermWinOffset ? this.getTermWinOffset() : { left: 0, top: 0 };
    const x = cX - termWinOffset.left - origin[0];
    const y = cY - termWinOffset.top - origin[1];
    const cols = this.buf.cols;
    const rows = this.buf.rows;
    let col = Math.floor(x / (this.chw * this.scaleX));
    let row = Math.floor(y / (this.chh * this.scaleY));

    if (row < 0) row = 0;
    else if (row >= rows - 1) row = rows - 1;

    if (col < 0) col = 0;
    else if (col >= cols - 1) col = cols - 1;

    return { col, row };
  }

  checkLeftDBCS() {
    if (!this.dbcsDetect) return false;
    return this.buf.checkLeftDBCS();
  }

  checkCurrentDBCS() {
    if (!this.dbcsDetect) return false;
    return this.buf.checkCurrentDBCS();
  }

  // Cursor
  setCursorStyle(style) {
    this.cursorStyle = style || 'blink';
    this.applyCursorStyle();
    this.updateCursorPos();
  }

  applyCursorStyle() {
    if (!this.cursor) {
      this.cursor = (typeof document !== 'undefined') ? document.getElementById('cursor') : null;
    }
    if (!this.cursor) return;

    const style = this.cursorStyle || 'blink';
    this.cursor.classList.remove(
      'cursor--blink',
      'cursor--underline',
      'cursor--reverse',
      'cursor--blink-reverse',
      'cursor--block',
      'cursor--half-block',
      'cursor--ibeam'
    );

    const isBlink = style === 'blink' || style.startsWith('blink-') || style.endsWith('-blink');
    let shape = 'underline';
    if (style === 'ibeam' || style === 'blink-ibeam') {
      shape = 'ibeam';
    } else if (style === 'block' || style === 'blink-block') {
      shape = 'block';
    } else if (style === 'half-block' || style === 'blink-half-block' || style === 'reverse' || style === 'blink-reverse') {
      shape = 'half-block';
    } else {
      shape = 'underline';
    }

    if (isBlink) {
      this.cursor.classList.add('cursor--blink');
      if (shape === 'half-block') {
        this.cursor.classList.add('cursor--blink-reverse');
      }
    }

    if (shape === 'underline') {
      this.cursor.classList.add('cursor--underline');
      this.cursor.textContent = '_';
      this.cursor.style.width = '';
      this.cursor.style.height = '0px';
    } else if (shape === 'ibeam') {
      this.cursor.classList.add('cursor--ibeam');
      this.cursor.textContent = '';
      const ibeamWidth = Math.max(2, Math.round((this.chw || 12) / 8));
      if (this.chw) this.cursor.style.width = ibeamWidth + 'px';
      if (this.chh) this.cursor.style.height = this.chh + 'px';
    } else if (shape === 'block') {
      this.cursor.classList.add('cursor--block');
      this.cursor.textContent = '';
      if (this.chw) this.cursor.style.width = this.chw + 'px';
      if (this.chh) this.cursor.style.height = this.chh + 'px';
    } else {
      // half-block
      this.cursor.classList.add('cursor--half-block');
      if (!isBlink) {
        this.cursor.classList.add('cursor--reverse');
      }
      this.cursor.textContent = '';
      const blockHeight = Math.round(this.chh / 2);
      if (this.chw) this.cursor.style.width = this.chw + 'px';
      if (blockHeight) this.cursor.style.height = blockHeight + 'px';
    }
  }

  updateCursorPos() {
    if (!this.cursor) {
      this.updateInputBufferPos();
      return;
    }
    const customCursor = this.app?.inputInterceptors?.getCursorPos?.(
      this.buf.cur_x,
      this.buf.cur_y
    );
    if (customCursor === 'hide' || this.isComposition || this.input?.getAttribute('bshow') === '1') {
      this.cursor.style.display = 'none';
      this.updateInputBufferPos();
      return;
    }
    this.cursor.style.display = '';
    const pos = Array.isArray(customCursor)
      ? customCursor
      : this.convertMN2XYEx(this.buf.cur_x, this.buf.cur_y);
    // if you want to set cursor color by now background, use this.
    if (this.buf.cur_y >= this.buf.rows || this.buf.cur_x >= this.buf.cols) {
      this.updateInputBufferPos();
      return; //sometimes, the value of this.buf.cur_x is 80 :(
    }

    const lines = this.buf.lines;
    const line = lines[this.buf.cur_y];
    const ch = line ? line[this.buf.cur_x] : null;
    const bg = ch ? ch.getBg() : 0;

    if (this.scaleX == 1 && this.scaleY == 1) {
      this.cursor.style.transform = 'none';
    } else {
      const scaleCss = 'scale('+this.scaleX+','+this.scaleY+')';
      this.mainDisplay.style.transform = this.useCanvasEngine ? 'none' : scaleCss;
      this.cursor.style.transform = scaleCss;
      this.cursor.style.transformOrigin = 'left top';
    }

    const style = this.cursorStyle || 'blink';
    let shape = 'underline';
    if (style === 'ibeam' || style === 'blink-ibeam') {
      shape = 'ibeam';
    } else if (style === 'block' || style === 'blink-block') {
      shape = 'block';
    } else if (style === 'half-block' || style === 'blink-half-block' || style === 'reverse' || style === 'blink-reverse') {
      shape = 'half-block';
    } else {
      shape = 'underline';
    }

    if (shape === 'block') {
      this.cursor.style.left = pos[0] + 'px';
      this.cursor.style.top = pos[1] + 'px';
      if (this.chw) this.cursor.style.width = this.chw + 'px';
      if (this.chh) this.cursor.style.height = this.chh + 'px';
    } else if (shape === 'half-block') {
      const blockHeight = Math.round(this.chh / 2);
      const topOffset = (this.chh - blockHeight) * this.scaleY;
      this.cursor.style.left = pos[0] + 'px';
      this.cursor.style.top = (pos[1] + topOffset) + 'px';
      if (this.chw) this.cursor.style.width = this.chw + 'px';
      if (blockHeight) this.cursor.style.height = blockHeight + 'px';
    } else if (shape === 'ibeam') {
      const ibeamWidth = Math.max(2, Math.round((this.chw || 12) / 8));
      this.cursor.style.left = pos[0] + 'px';
      this.cursor.style.top = pos[1] + 'px';
      if (this.chw) this.cursor.style.width = ibeamWidth + 'px';
      if (this.chh) this.cursor.style.height = this.chh + 'px';
    } else {
      // underline
      const topOffset = -this.scaleY;
      this.cursor.style.left = pos[0] + 'px';
      this.cursor.style.top = (pos[1] + topOffset) + 'px';
      this.cursor.style.color = termInvColors[bg];
    }
    this.updateInputBufferPos();
  }

  updateInputBufferPos() {
    if (!this.input) return;
    const customCursor = this.app?.inputInterceptors?.getCursorPos?.(
      this.buf.cur_x,
      this.buf.cur_y
    );
    const pos = Array.isArray(customCursor)
      ? customCursor
      : this.convertMN2XYEx(this.buf.cur_x, this.buf.cur_y);
    if (this.input.getAttribute('bshow') == '1') {
      const lines = this.buf.lines;
      const line = lines ? lines[this.buf.cur_y] : null;
      const ch = line ? line[this.buf.cur_x] : null;
      const defaultBg = termColors.defaultBg || termDefaultBg || termColors[0] || '#000000';
      const defaultFg = termColors.defaultFg || termDefaultFg || termColors[7] || '#c0c0c0';
      const isPlain = Boolean(termColors.forcePlainText);
      const bgIdx = ch ? ch.getBg() : 0;
      const fgIdx = ch ? ch.getFg() : 7;
      const bgHex = (isPlain || bgIdx === 0) ? defaultBg : (termColors[bgIdx] || defaultBg);
      let fgHex = (isPlain || fgIdx === 7) ? defaultFg : (termColors[fgIdx] || defaultFg);
      if (fgIdx === bgIdx || fgHex.toLowerCase() === bgHex.toLowerCase()) {
        fgHex = (bgHex.toLowerCase() === defaultBg.toLowerCase()) ? defaultFg : (termInvColors[bgIdx] || defaultFg);
      }
      const minContrast = Math.max(isPlain ? 0 : (Number(termColors.minimumContrast) || 0), 50);
      fgHex = getContrastColor(fgHex, bgHex, minContrast);

      const borderSize = 3;
      const padX = 2;
      const imeBg = 'rgba(128, 128, 128, 0.3)';
      const effectiveChw = (this.chw || Math.max(8, this.chh / 2)) * (this.scaleX || 1);
      const effectiveChh = this.chh * (this.scaleY || 1);
      const cjkAdvance = effectiveChw * 2;
      const letterSpacing = cjkAdvance - effectiveChh;

      this.input.style.zIndex = '13';
      this.input.style.forcedColorAdjust = 'none';
      this.input.style.opacity = '1';
      this.input.style.border = `${borderSize}px double ${fgHex}`;
      this.input.style.outline = 'none';
      this.input.style.padding = `0 ${padX}px`;
      this.input.style.margin = '0px';
      this.input.style.boxSizing = 'content-box';
      // Workaround for Safari / All Browsers: Text inside input element #t is transparent by default.
      // Visible text, semi-transparent gray background, and caret colors derived from cursor cell attributes are required during IME composition.
      this.input.style.color = fgHex;
      this.input.style.background = imeBg;
      this.input.style.backgroundColor = imeBg;
      this.input.style.caretColor = fgHex;
      this.input.style.textShadow = `0 0 2px ${bgHex}`;
      this.input.style.fontSize = effectiveChh + 'px';
      this.input.style.letterSpacing = letterSpacing ? `${letterSpacing}px` : '0px';
      this.input.style.lineHeight = effectiveChh + 'px';
      this.input.style.height = effectiveChh + 'px';
      this.updateInputBufferWidth?.();

      const innerBounds = this.innerBounds;
      const termwinheight = innerBounds.height;
      const termwinwidth = innerBounds.width;
      const boxWidth = parseFloat(this.input.style.width) || effectiveChw;
      const totalHeight = effectiveChh + borderSize * 2;
      const totalWidth = boxWidth + (borderSize + padX) * 2;

      let topPos = pos[1] - borderSize;
      if (topPos + totalHeight > termwinheight) {
        topPos = Math.max(0, termwinheight - totalHeight);
      } else if (topPos < 0) {
        topPos = 0;
      }
      this.input.style.top = topPos + 'px';

      let leftPos = pos[0] - borderSize - padX;
      if (leftPos + totalWidth > termwinwidth) {
        leftPos = Math.max(0, termwinwidth - totalWidth);
      } else if (leftPos < 0) {
        leftPos = 0;
      }
      this.input.style.left = leftPos + 'px';
    } else if (this.app?.isMobileDevice?.()) {
      this.input.style.left = '0px';
      this.input.style.top = '0px';
    } else {
      // On desktop, keep #t anchored at cursor coordinates even when not composing (bshow="0"),
      // so OS IME candidate window queries (Windows TSF, macOS NSTextInputClient, Linux IBus/Fcitx)
      // find #t at the cursor rather than (0,0) on the first composition keystroke.
      this.input.style.left = pos[0] + 'px';
      this.input.style.top = pos[1] + 'px';
    }
  }

  updateInputBufferWidth() {
    if (!this.input) return;
    const val = this.input.value || '';
    const cols = wcswidth(val);
    const effectiveChw = (this.chw || Math.max(8, this.chh / 2)) * (this.scaleX || 1);
    const effectiveChh = (this.chh || 16) * (this.scaleY || 1);

    let charCount = 0;
    let naturalWidth = 0;
    const asciiRatio = getAsciiWidthRatio(this.fontFace);
    for (let i = 0; i < val.length; i++) {
      const code = val.codePointAt(i);
      const w = wcwidth(code);
      if (w > 0) {
        charCount++;
        naturalWidth += (w === 2) ? effectiveChh : (asciiRatio * effectiveChh);
      }
      if (code > 0xffff) i++;
    }

    if (val && typeof document !== 'undefined' && document.createElement) {
      if (!this._measureCtx) {
        const c = document.createElement('canvas');
        this._measureCtx = c && typeof c.getContext === 'function' ? c.getContext('2d') : null;
      }
      if (this._measureCtx) {
        this._measureCtx.font = `${effectiveChh}px ${this.fontFace || 'monospace'}`;
        const measured = this._measureCtx.measureText(val).width;
        if (measured > 0) {
          naturalWidth = measured;
        }
      }
    }

    const targetTextWidth = cols * effectiveChw;
    if (charCount > 0) {
      const ls = (targetTextWidth - naturalWidth) / charCount;
      this.input.style.letterSpacing = Math.abs(ls) > 0.01 ? `${Number(ls.toFixed(2))}px` : '0px';
    } else {
      const defaultLs = (effectiveChw * 2) - effectiveChh;
      this.input.style.letterSpacing = defaultLs ? `${defaultLs}px` : '0px';
    }

    const minWidth = effectiveChw;
    const width = Math.max(targetTextWidth, minWidth);
    this.input.style.width = width + 'px';
    const bounds = this.innerBounds;
    if (bounds) {
      const borderAndPad = 10; // 3px border * 2 + 2px padding * 2
      if (parseFloat(this.input.style.left) + width + borderAndPad > bounds.width) {
        this.input.style.left = Math.max(0, bounds.width - width - borderAndPad) + 'px';
      }
    }
  }

  onCompositionStart(e) {
    //this.input.disabled="";
    this.input.setAttribute('bshow', '1');
    this.input.style.pointerEvents = 'auto';
    const colWidth = (this.chw || Math.max(8, this.chh / 2)) * (this.scaleX || 1);
    this.input.style.minWidth = colWidth + 'px';
    // Workaround for WebKit IME: Lock Delay pattern for composition candidate window
    if (this.hasWebKitImeQuirk) {
      this._isComposingSafe = true;
      if (this._composingSafeTimer) {
        clearTimeout(this._composingSafeTimer);
        this._composingSafeTimer = null;
      }
    }
    this.isComposition = true;
    this.updateCursorPos();
  }

  onCompositionEnd(e) {
    //this.input.disabled="";
    this.input.setAttribute('bshow', '0');
    this.input.style.border = 'none';
    this.input.style.padding = '0px';
    this.input.style.width =  '1px';
    this.input.style.height = '1px';
    this.input.style.opacity = '0';
    this.input.style.pointerEvents = 'none';
    this.input.style.color = 'transparent';
    this.input.style.background = 'transparent';
    this.input.style.backgroundColor = 'transparent';
    this.input.style.caretColor = 'transparent';
    this.input.style.textShadow = 'none';
    this.input.style.letterSpacing = '';
    this.input.style.minWidth = '';
    // Workaround for WebKit IME: activate Lock Delay for trailing keydown
    if (this.hasWebKitImeQuirk) {
      this._lastCompositionEndTime = Date.now();
      this._isComposingSafe = true;
      if (this._composingSafeTimer) {
        clearTimeout(this._composingSafeTimer);
      }
      this._composingSafeTimer = setTimeout(() => {
        this._isComposingSafe = false;
        this._composingSafeTimer = null;
      }, 0);
    }
    this.isComposition = false;
    this.updateCursorPos();
  }

  applyTermSizeMode(values, { isMobile = false, onResizeTerm } = {}) {
    if (!values) return;
    this.innerBounds = this.getWindowInnerBounds();
    this.resizer = null;
    const rawMode =
      values.termSizeMode === 'max-font-size'
        ? DEFAULT_PREFS.termSizeMode
        : values.termSizeMode || DEFAULT_PREFS.termSizeMode;
    const effectiveMode = isMobile ? 'fixed-font-size' : rawMode;
    const resizeTerm =
      typeof onResizeTerm === 'function'
        ? onResizeTerm
        : (cols, rows) => this.app?.setTermSize?.(cols, rows);

    switch (effectiveMode) {
      case 'fixed-term-size': {
        this.fontFitWindowWidth = values.fontFitWindowWidth;
        const size = values.termSize || DEFAULT_PREFS.termSize;
        resizeTerm(size.cols, size.rows);
        this.fontResize();
        this.redraw(true);
        break;
      }
      case 'fixed-font-size': {
        this.fontFitWindowWidth = false;
        this.resizer = () => {
          this.innerBounds = this.getWindowInnerBounds();
          const isPortrait =
            this.innerBounds.width > 0 &&
            this.innerBounds.height > 0 &&
            this.innerBounds.width < this.innerBounds.height;
          const activeFontSize =
            (isPortrait && values.fontSizePortrait) ||
            values.fontSize ||
            DEFAULT_PREFS.fontSize;
          const size = this.calcTermSizeFromFont(activeFontSize);
          resizeTerm(size.cols, size.rows);
          this.fixedResize(activeFontSize);
          this.redraw(true);
        };
        this.resizer();
        break;
      }
    }

    this.setTransFix(this.fontFitWindowWidth);
  }

  fontResize() {
    const cols = this.buf.cols;
    const rows = this.buf.rows;

    let width = this.termWidth ? this.termWidth : this.innerBounds.width;
    let height = this.termHeight ? this.termHeight : this.innerBounds.height;
    if (width === 0 || height === 0) return; // errors for opening in a new window
    width -= 10; // for scroll bar

    let o_h,
      o_w,
      i = 4;
    let nowchh = this.chh;
    let nowchw = this.chw;
    do {
      ++i;
      nowchh = Math.round(i * 2 * (this.lineHeight || 1.0));
      nowchw = i;
      o_h = nowchh * rows;
      o_w = nowchw * cols;
    } while (o_h <= height && o_w <= width);
    --i;
    nowchw = i;
    this.fixedResize(i * 2);
  }

  fixedResize(fontSizePx) {
    let chw = fontSizePx / 2;
    let chh = Math.round(fontSizePx * (this.lineHeight || 1.0));

    this.setTermFontSize(chw, chh, fontSizePx);
  }

  calcTermSizeFromFont(fontSizePx) {
    fontSizePx = Math.floor((fontSizePx + 1) / 2) * 2;
    let width = this.termWidth ? this.termWidth : this.innerBounds.width;
    let height = this.termHeight ? this.termHeight : this.innerBounds.height;
    let cols = Math.max(80, Math.min(200, Math.floor(2 * (width - 10) / fontSizePx)));
    let rowHeight = Math.round(fontSizePx * (this.lineHeight || 1.0));
    let rows = Math.max(24, Math.min(100, Math.floor(height / rowHeight)));
    return this.buf.site.clampTermSize(cols, rows);
  }

  getRowLineElement(node) {
    for (let r = node; r && r != r.parentNode; r = r.parentNode) {
      if (r.getAttribute?.('data-type') === 'termline') {
        return r;
      }
    }
    return null;
  }

  countCol(node, pos) {
    let rowNode = this.getRowLineElement(node);
    if (!rowNode) {
      if (node && typeof node.querySelector === 'function') {
        if (node.getAttribute?.('type') === 'termrow' || node.hasAttribute?.('srow')) {
          const innerRow = node.querySelector('[data-type="termline"]');
          const rowIdx = innerRow
            ? parseInt(innerRow.getAttribute('data-row'), 10)
            : parseInt(node.getAttribute('srow'), 10);
          if (!Number.isNaN(rowIdx)) {
            const maxCol = innerRow
              ? stringWidth(innerRow.textContent)
              : this.buf?.cols || 80;
            return { row: rowIdx, col: pos > 0 ? maxCol : 0 };
          }
        }
        if (pos === 0) {
          const firstLine = node.querySelector('[data-type="termline"]');
          if (firstLine) {
            return { row: parseInt(firstLine.getAttribute('data-row'), 10) || 0, col: 0 };
          }
        } else if (pos > 0 && node.childNodes?.length > 0) {
          const idx = Math.min(pos - 1, node.childNodes.length - 1);
          const child = node.childNodes[idx];
          const lastLine =
            child?.getAttribute?.('data-type') === 'termline'
              ? child
              : child?.querySelector?.('[data-type="termline"]');
          if (lastLine) {
            const rowIdx = parseInt(lastLine.getAttribute('data-row'), 10) || 0;
            const maxCol = stringWidth(lastLine.textContent) || this.buf?.cols || 80;
            return { row: rowIdx, col: maxCol };
          }
        }
      }
      return { row: 0, col: 0 };
    }

    let col = 0;
    let doCount = function(cur) {
      if (cur == node) {
        if (cur.nodeName == '#text' || cur.nodeType === 3) {
          col += stringWidth(cur.textContent.substring(0, pos));
        } else if (cur.childNodes) {
          for (let i = 0; i < pos && i < cur.childNodes.length; i++) {
            col += stringWidth(cur.childNodes[i].textContent);
          }
        }
        return false;
      }
      if (cur.nodeName == '#text') {
        col += stringWidth(cur.textContent);
        return true;
      }
      for (let e of cur.childNodes) {
        if (!doCount(e)) {
          return false;
        }
      }
      return true;
    };
    doCount(rowNode);

    return {
      row: parseInt(rowNode.getAttribute('data-row')),
      col: col
    };
  }

  getSelectedText() {
    const interceptorText = this.app?.getInterceptorSelectedText();
    if (interceptorText !== null && interceptorText !== undefined) {
      return interceptorText;
    }
    if (this.useCanvasEngine) {
      if (this.componentScreen) {
        return this.componentScreen.getSelectedText();
      }
      return '';
    }
    if (typeof window !== 'undefined' && window.getSelection && !window.getSelection().isCollapsed) {
      return window.getSelection().toString().replace(/\u00a0/g, " ");
    }
    if (this.preserveDomSelection && this._domSelectedText) {
      return this._domSelectedText;
    }
    if (this.isUsingDomSelection() && this._domSelectedText) {
      return this._domSelectedText;
    }
    return '';
  }

  startSelection(coords) {
    if (this.componentScreen) {
      this.componentScreen.startSelection(coords);
    }
  }

  updateSelection(coords) {
    if (this.componentScreen) {
      this.componentScreen.updateSelection(coords);
    }
  }

  endSelection() {
    if (this.componentScreen) {
      return this.componentScreen.endSelection();
    }
    return this.getSelectedText();
  }

  clearSelection() {
    if (this.componentScreen && typeof this.componentScreen.clearSelection === 'function') {
      this.componentScreen.clearSelection();
    }
    if (typeof window !== 'undefined' && window.getSelection) {
      const sel = window.getSelection();
      if (sel && typeof sel.removeAllRanges === 'function') {
        sel.removeAllRanges();
      }
    }
    this._domSelectedText = '';
    this._domSelectionColRow = null;
    this.emit('term:selection-change', { selection: null });
  }

  hasDomSelectionFallback() {
    return Boolean((this.preserveDomSelection || this.isUsingDomSelection()) && this._domSelectedText);
  }

  isUsingDomSelection() {
    return Boolean(!this.useCanvasEngine || this.app?.hasActiveInputInterceptor?.());
  }

  isSelectionCollapsed() {
    if (!this.isUsingDomSelection()) {
      return !this.getSelectionColRow();
    }
    if (this.hasDomSelectionFallback()) {
      return false;
    }
    return typeof window !== 'undefined' && window.getSelection
      ? window.getSelection().isCollapsed
      : true;
  }

  snapshotDomSelection() {
    if (!this.preserveDomSelection && !this.isUsingDomSelection()) {
      return null;
    }
    const selText = this.getSelectedText();
    if (selText) {
      this._domSelectedText = selText;
      const colRow = this.getSelectionColRow();
      if (colRow) {
        this._domSelectionColRow = colRow;
        return colRow;
      }
    }
    return null;
  }

  clearDomSelectionIfCollapsed() {
    if ((!this.preserveDomSelection && !this.isUsingDomSelection()) || !this._domSelectedText) {
      return false;
    }
    const sel =
      typeof window !== 'undefined' && window.getSelection
        ? window.getSelection()
        : null;
    if (!sel || sel.isCollapsed) {
      this._domSelectedText = '';
      this._domSelectionColRow = null;
      return true;
    }
    return false;
  }

  getSelectionColRow() {
    const interceptorColRow = this.app?.getInterceptorSelectionColRow();
    if (interceptorColRow !== undefined) {
      return interceptorColRow;
    }
    if (this.useCanvasEngine) {
      if (this.componentScreen) {
        const sel = this.componentScreen.getSelectionColRow();
        if (sel)
          return sel;
      }
      return null;
    }
    if (typeof window === 'undefined' || !window.getSelection || window.getSelection().isCollapsed || window.getSelection().rangeCount === 0) {
      if (this.preserveDomSelection && this._domSelectionColRow) {
        return this._domSelectionColRow;
      }
      if (this.isUsingDomSelection() && this._domSelectionColRow) {
        return this._domSelectionColRow;
      }
      return null;
    }
    let r = window.getSelection().getRangeAt(0);
    return {
      start: this.countCol(r.startContainer, r.startOffset),
      end: this.countCol(r.endContainer, r.endOffset)
    };
  }

  selectAll() {
    if (this.app?.dispatchSelectAll()) {
      return;
    }
    if (this.useCanvasEngine) {
      if (!this.componentScreen?.implRef) {
        this.redraw(true);
      }
      if (this.componentScreen) {
        this.componentScreen.selectAll();
      }
      return;
    }
    window.getSelection().selectAllChildren(this.screenContainer || this.mainDisplay);
  }


  renderRow(line, row, chh, showsLinkPreview, el) {
    return renderRowHtml(line, row, chh, showsLinkPreview, el);
  }

  renderSingleRow(target, row) {
    const el = document.createElement('span');
    el.setAttribute('type', 'termrow');
    el.setAttribute('srow', '0');
    target.appendChild(el);
    const forceWidth = this.fontSizePx || (this.chw ? this.chw * 2 : this.chh);
    return renderRowHtml(row, 0, forceWidth, false, el);
  }
}
