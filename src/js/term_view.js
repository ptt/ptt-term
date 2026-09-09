// Terminal View

import { Event } from './event.js';
import { TermKeyboard } from './term_keyboard';
import { termColors, termInvColors } from './term_buf';
import { renderRowHtml, renderScreen } from './term_ui';
import { i18n } from './i18n';
import { setTimer } from './util';
import { wrapText, u2b } from './string_util';
import { FpsMeter } from './fps_meter';
import { updatePref } from './pref.js';
import icon128 from 'Icon/icon_128.png';

const ENTER_CHAR = '\r';
const DEFINE_INPUT_BUFFER_SIZE = 12;

export class TermView extends Event {
  constructor() {
    super();
    //new pref - start
  this.termWidth = 0;
  this.termHeight = 0;
  this.dbcsDetect = true;
  this.highlightBG = 2;
  this._charset = 'big5';
  this.middleButtonFunction = 0;
  this.leftButtonFunction = false;
  this.mouseWheelFunction1 = 1;
  this.mouseWheelFunction2 = 2;
  this.mouseWheelFunction3 = 3;
  //this.highlightFG = 7;
  this.fontFitWindowWidth = false;
  this.useCanvasEngine = true;
  this.showFps = false;
  this.smoothAnsiArt = true;
  this.fpsMeter = new FpsMeter({
    isCanvas: this.useCanvasEngine,
    smoothAnsiArt: this.smoothAnsiArt,
    onToggleCanvas: (isCanvas) => {
      this.useCanvasEngine = isCanvas;
      updatePref('useCanvasEngine', isCanvas);
      this.redraw(true);
    },
    onToggleSmoothAnsi: (enabled) => {
      this.smoothAnsiArt = enabled;
      updatePref('smoothAnsiArt', enabled);
      this.redraw(true);
    }
  });
  //new pref - end

  this.viewMargin = 0;

  this.buf = null;
  this.app = null;
  this.page = null;

  // Cursor
  this.cursorX = 0;
  this.cursorY = 0;

  // TODO Move this into easy_reading.js
  this._useEasyReadingMode = false;
  this._easyReadingKeyDownKeyCode = 0;
  this._easyReadingKeyDownIsComposing = false;

  this.curRow = 0;
  this.curCol = 0;

  this.actualRowIndex = 0;

  this.lineWrap = 78;

  //this.DBDetection = false;
  this.blinkOn = false;

  // React
  this.componentScreen = {
    setCurrentHighlighted() {},
    onBlink() {},
    getSelectedText() { return ''; },
    getSelectionColRow() { return null; },
    selectAll() {},
  };

  this.selection = null;
  this.input = document.getElementById('t');
  this.cursor = document.getElementById('cursor');
  this.termWin = document.getElementById('TermWindow');
  this.cursorStyle = 'blink';
  this.enablePicPreview = true;
  this.picPreviewWhitelistOnly = true;
  this.scaleX = 1;
  this.scaleY = 1;

  this.updateHighlightColor();

  // for cpu efficiency
  this.innerBounds = { width: 0, height: 0 };
  this.firstGridOffset = { top: 0, left: 0 };
  this.panX = 0;
  this.panY = 0;

  // for notifications
  this.enableNotifications = true;
  this.titleTimer = null;
  this.notif = null;


  const mainDisplay = document.createElement('div');
  mainDisplay.setAttribute('class', 'main');
  this.termWin.appendChild(mainDisplay);
  this.mainDisplay = mainDisplay;

  const screenContainer = document.createElement('div');
  screenContainer.setAttribute('id', 'screenContainer');
  mainDisplay.appendChild(screenContainer);
  this.screenContainer = screenContainer;

  this.mainDisplay.style.border = '0px';
  this.setFontFace('MingLiu,monospace');

  this._keyboard = new TermKeyboard(
    (data) => this._send(data),
    (detail) => {
      const termDetail = { ...detail, term: this, view: this, buf: this.buf };
      const customEvent = typeof CustomEvent !== 'undefined'
        ? new CustomEvent('term:key', { detail: termDetail })
        : { type: 'term:key', detail: termDetail };
      this.dispatchEvent(customEvent);
      this.buf?.dispatchEvent?.(customEvent);
    }
  );

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

    // TODO: Since the app is almost useless on mobile devices, we might want
    // to revisit if we want this code.

    // iOS sends the keydown that starts composition as key code 0 or Unidentified. Ignore it.
    if (e.key === 'Unidentified' || e.keyCode == 0)
      return false;

    // iOS sends backspace when composing. Disallow any non-control keys during it.
    if (this.isComposition && !e.ctrlKey && !e.altKey)
      return false;

    // Don't process meta keys, like Mac's command key.
    if (e.metaKey)
      return false;

    return true;
  };

  addEventListener('keydown', (e) => {
    if (!shouldAcceptInput() || !keyEventFilter(e))
      return;

    if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || (e.keyCode > 15 && e.keyCode < 19))
      return; // Shift Ctrl Alt
    this.onKeyDown(e);
  }, false);

  addEventListener('keyup', (e) => {
    // We don't need to handle code 229 here, as it should be already composing.

    if (!shouldAcceptInput())
      return;
    if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || (e.keyCode > 15 && e.keyCode < 19))
      return; // Shift Ctrl Alt
    // set input area focus whenever key down even if there is selection
    this.app.setInputAreaFocus();
  }, false);

  this.input.addEventListener('input', (e) => {
    this.onInput(e);
  }, false);
  }

  get mainContainer() {
    return document.getElementById('mainContainer');
  }


  onBlink() {
    this.blinkOn=true;
    //   if(this.buf && this.buf.changed)
    this.buf.queueUpdate(true);
    //   else this.update();
  }

  onBlinkToggle() {
    if (this.useCanvasEngine && this.componentScreen) {
      this.componentScreen.onBlink();
    }
  }

  setBuf(buf) {
    this.buf=buf;
  }

  setCore(core) {
    this.app=core;
  }

  get conn() {
    return this.app?.conn || null;
  }

  get charset() {
    return this.app?.stream?.charset || this.app?.site?.charset || this._charset || 'big5';
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
    this.app?.stream?.send(data);
  }

  sendKey(key) {
    return this._keyboard ? this._keyboard.sendKey(key) : false;
  }

  _convSend(data) {
    this.app?.stream?.send(data);
  }

  setFontFace(fontFace) {
    this.fontFace = fontFace;
    this.input.style.setProperty('font-family', this.fontFace, 'important');
    this.app?.dispatchFontUpdate?.({ fontFace: this.fontFace });
    if (this.easyReadingOverlay) {
      this.easyReadingOverlay.style.setProperty('--font-face', this.fontFace);
    }
  }

  setShowFps(show) {
    this.showFps = !!show;
    this.fpsMeter.setIsCanvas(this.useCanvasEngine);
    this.fpsMeter.setSmoothAnsiArt(this.smoothAnsiArt);
    this.fpsMeter.setEnabled(this.showFps);
  }

  setUseCanvasEngine(enabled) {
    this.useCanvasEngine = !!enabled;
    this.fpsMeter.setIsCanvas(this.useCanvasEngine);
    this.redraw(true);
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
      const t0 = (this.showFps && this.fpsMeter.enabled && typeof performance !== 'undefined')
        ? performance.now()
        : 0;
      const screenInst = renderScreen(
        /* For Screen#componentDidUpdate */lines.slice(),
        this.chh,
        /* showsLinkPreview */false,
        this.enablePicPreview,
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
          fontFace: this.fontFace,
          highlightBG: this.highlightBG,
          nowHighlight: this.buf.nowHighlight,
          buf: this.buf,
          charset: this.charset,
          copyOnSelect: this.app.copyOnSelect,
          doCopy: this.app.doCopy.bind(this.app),
          setInputAreaFocus: this.app.setInputAreaFocus.bind(this.app),
          fpsMeter: this.fpsMeter,
          smoothAnsiArt: this.smoothAnsiArt,
          changedRows: changedRows,
          picPreviewWhitelistOnly: this.picPreviewWhitelistOnly !== false,
        }
      );
      if (screenInst) {
        this.componentScreen = screenInst;
      }
      this.setHighlightedRow(this.buf.nowHighlight);
      if (t0 > 0 && !this.useCanvasEngine) {
        this.fpsMeter.recordFrame(performance.now() - t0, false);
      }

      if (this.app?.dispatchScreenUpdate?.(changedLineHtmlStrs)) {
        // Handled by plugin
      } else if (this.app?.easyReading) {
        this.app.easyReading.updatePage(changedLineHtmlStrs);
      } else if (this.useEasyReadingMode) {
        if (this.buf.startedEasyReading && this.buf.easyReadingShowReplyText) {
          this.updateEasyReadingReplyRow(changedLineHtmlStrs[changedLineHtmlStrs.length-1]);
        } else if (this.buf.startedEasyReading && this.buf.easyReadingShowPushInitText) {
          this.updateEasyReadingPushInitRow(changedLineHtmlStrs[changedLineHtmlStrs.length-1]);
        } else {
          this.populateEasyReadingPage();
        }
      } else if (this.isEasyReadingActive()) {
        this.hideEasyReading();
      }

      if (this.buf.prevPageState !== this.buf.pageState && (this.panX > 0 || this.panY > 0)) {
        this.resetPan();
      }
      this.buf.prevPageState = this.buf.pageState;
    }
  }

  setHighlightedRow(row) {
    console.debug(`setHighlightedRow: ${row}, this.buf.highlightCursor:${ this.buf.highlightCursor}`);
    if (this.buf.highlightCursor && this.componentScreen) {
      this.componentScreen.setCurrentHighlighted(row);
    }
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

    if (this.app?.dispatchTextInput?.(e)) {
      return;
    }
    if (e.target.value) {
      this.onTextInput(e.target.value);
    }
    e.target.value='';
  }

  onTextInput(text, isPasting) {
    if (isPasting) {
      text = text.replace(/\r\n/g, '\r');
      text = text.replace(/\n/g, '\r');
      text = text.replace(/\r/g, ENTER_CHAR);

      if(text.indexOf('\x1b') < 0 && this.lineWrap > 0) {
        text = wrapText(text, this.lineWrap, ENTER_CHAR);
      }

      //FIXME: stop user from pasting DBCS words with 2-color
      const escChar = this.buf.site.getEditorEscapeChar();
      text = text.replace(/\x1b/g, escChar);
    }
    this._convSend(text);
  }

  onKeyDown(e) {
    if (this.app?.dispatchKeyDown?.(e)) {
      return;
    }

    // TODO: Move this. Make a key event mapper.
    let stop = false;
    if (e.ctrlKey && !e.altKey && !e.shiftKey) {
      switch (e.key.toLowerCase()) {
        case 'c': {
          const selectedText = this.getSelectedText();
          if (selectedText) { //^C , do copy
            this.app.doCopy(selectedText);
            stop = true;
          }
          break;
        }
        case 'a':
          this.app.doSelectAll();
          stop = true;
          break;
      }
    } else if (e.ctrlKey && !e.altKey && e.shiftKey) {
      switch (e.key.toLowerCase()) {
        case 'V':
          this.app.doPaste();
          stop = true;
          break;
      }
    }
    if (stop) {
      e.preventDefault();
      return;
    }

    this._keyboard.onKeyDown(e);
    if (e.defaultPrevented)
      return;
  }

  setTermFontSize(cw, ch) {
    const innerBounds = this.innerBounds;
    this.chw = cw;
    this.chh = ch;
    const fontSize = this.chh + 'px';
    const mainWidth = (this.chw * this.buf.cols + 10) + 'px';
    if (this.termWin && this.termWin.style) {
      this.termWin.style.setProperty('--term-font-size', fontSize);
      this.termWin.style.setProperty('--term-chw', this.chw + 'px');
      this.termWin.style.setProperty('--term-chh', this.chh + 'px');
    }
    this.mainDisplay.style.fontSize = fontSize;
    this.mainDisplay.style.lineHeight = fontSize;
    this.app?.dispatchFontUpdate?.({ fontSize });
    if (this.easyReadingOverlay) {
      this.easyReadingOverlay.style.fontSize = fontSize;
      this.easyReadingOverlay.style.lineHeight = fontSize;
    }
    this.cursor.style.fontSize = fontSize;
    this.cursor.style.lineHeight = fontSize;
    this.applyCursorStyle();
    this.mainDisplay.style.overflowX = 'hidden';
    this.mainDisplay.style.overflowY = 'hidden';
    this.mainDisplay.style.textAlign = 'left';
    this.mainDisplay.style.width = mainWidth;
    this.mainDisplay.style.height = (this.chh * this.buf.rows + 10) + 'px';

    this.updateMainDisplayMargin();
    if (this.fontFitWindowWidth) {
      this.scaleX = Math.floor(innerBounds.width / (this.chw*this.buf.cols+10) * 100)/100;
      this.scaleY = Math.floor(innerBounds.height / (this.chh*this.buf.rows) * 100)/100;
    } else {
      this.scaleX = 1;
      this.scaleY = 1;
    }

    let scaleCss = 'none';
    if (this.scaleX != 1 || this.scaleY != 1) {
      scaleCss = 'scale(' + this.scaleX + ',' + this.scaleY + ')';
      this.mainDisplay.style.transformOrigin = 'center top';
    }
    this.mainDisplay.style.transform = scaleCss;

    this.firstGridOffset = this.app.getFirstGridOffsets();

    this.updateReverseScaleCss();
    this.updateCursorPos();

    if (this.panX > 0 || this.panY > 0) {
      this.setPan(this.panX, this.panY);
    }
  }


  getAvailableScrollWidth() {
    const cols = this.buf ? this.buf.cols : 80;
    const totalWidth = this.chw * cols + 10;
    const viewportWidth =
      (this.innerBounds && this.innerBounds.width) ||
      (typeof window !== 'undefined' ? window.innerWidth : 0);
    return Math.max(0, totalWidth - viewportWidth);
  }

  getAvailableScrollHeight() {
    const rows = this.buf ? this.buf.rows : 24;
    const totalHeight = this.chh * rows + 10;
    const viewportHeight =
      (this.innerBounds && this.innerBounds.height) ||
      (typeof window !== 'undefined' ? window.innerHeight : 0);
    return Math.max(0, totalHeight - viewportHeight);
  }

  updateMainDisplayMargin() {
    if (!this.mainDisplay) return;
    const innerBounds = this.innerBounds || { width: 0, height: 0 };
    const totalHeight = this.chh * (this.buf ? this.buf.rows : 24);
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
    if (this.app) {
      this.firstGridOffset = this.app.getFirstGridOffsets();
    }
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
      const revScaleX = Math.floor((1 / this.scaleX) * 100) / 100;
      const revScaleY = Math.floor((1 / this.scaleY) * 100) / 100;
      this.termWin.style.setProperty('--preview-scale-x', revScaleX);
      this.termWin.style.setProperty('--preview-scale-y', revScaleY);
    }
  }

  convertMN2XYEx(cx, cy) {
    let origin;
    const w = this.innerBounds.width;
    const h = this.innerBounds.height;
    if(this.scaleX!=1 || this.scaleY!=1)
      origin = [((w - (this.chw*this.buf.cols+10)*this.scaleX)/2) + this.viewMargin, ((h - (this.chh*this.buf.rows)*this.scaleY)/2) + this.viewMargin];
    else
      origin = [this.firstGridOffset.left, this.firstGridOffset.top];
    const realX = origin[0] + (cx) * this.chw * this.scaleX;
    const realY = origin[1] + (cy) * this.chh * this.scaleY;
    return [realX, realY];
  }

  checkLeftDBCS() {
    if (!this.dbcsDetect || !this.buf) return false;
    return this.buf.checkLeftDBCS();
  }

  checkCurrentDBCS() {
    if (!this.dbcsDetect || !this.buf) return false;
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
    if (!this.cursor) return;
    const pos = this.convertMN2XYEx(this.buf.cur_x, this.buf.cur_y);
    // if you want to set cursor color by now background, use this.
    if (this.buf.cur_y >= this.buf.rows || this.buf.cur_x >= this.buf.cols)
      return; //sometimes, the value of this.buf.cur_x is 80 :(

    const lines = this.buf.lines;
    const line = lines[this.buf.cur_y];
    const ch = line ? line[this.buf.cur_x] : null;
    const bg = ch ? ch.getBg() : 0;

    if (this.scaleX == 1 && this.scaleY == 1) {
      this.cursor.style.transform = 'none';
    } else {
      const scaleCss = 'scale('+this.scaleX+','+this.scaleY+')';
      this.mainDisplay.style.transform = scaleCss;
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
    if (this.input.getAttribute('bshow') == '1') {
      const pos = this.convertMN2XYEx(this.buf.cur_x, this.buf.cur_y);
      {
        this.input.style.opacity = '1';
        this.input.style.border = 'double';
        {
          //this.input.style.width  = (this.chh-4)*10 + 'px';
          this.input.style.fontSize = this.chh-4 + 'px';
          //this.input.style.lineHeight = this.chh+4 + 'px';
          this.input.style.height = this.chh + 'px';
        }
      }
      const innerBounds = this.innerBounds;
      const termwinheight = innerBounds.height;
      const termwinwidth = innerBounds.width;
      if(termwinheight < pos[1] + parseFloat(this.input.style.height) + this.chh)
        this.input.style.top = (pos[1] - parseFloat(this.input.style.height) - this.chh)+ 4 +'px';
      else
        this.input.style.top = (pos[1] + this.chh) +'px';

      if(termwinwidth < pos[0] + parseFloat(this.input.style.width))
        this.input.style.left = termwinwidth - parseFloat(this.input.style.width)- 10 +'px';
      else
        this.input.style.left = pos[0] +'px';

      //this.input.style.left = pos[0] +'px';
    }
  }

  updateInputBufferWidth() {
    // change width according to input
    const wordCounts = u2b(this.input.value).length;
    // chh / 2 - 2 because border of 1
    const oneWordWidth = (this.chh/2-2);
    const width = oneWordWidth*wordCounts;
    this.input.style.width  = width + 'px';
    const bounds = this.innerBounds;
    if (parseInt(this.input.style.left) + width + oneWordWidth*2 >= bounds.width) {
      this.input.style.left = bounds.width - width - oneWordWidth*2 + 'px';
    }
  }

  onCompositionStart(e) {
    //this.input.disabled="";
    this.input.setAttribute('bshow', '1');
    this.input.style.pointerEvents = 'auto';
    this.updateInputBufferPos();
    this.isComposition = true;
  }

  onCompositionEnd(e) {
    //this.input.disabled="";
    this.input.setAttribute('bshow', '0');
    this.input.style.border = 'none';
    this.input.style.width =  '1px';
    this.input.style.height = '1px';
    this.input.style.left =  '0px';
    this.input.style.top = '0px';
    this.input.style.opacity = '0';
    this.input.style.pointerEvents = 'none';
    this.isComposition = false;
  }

  fontResize() {
    const cols = this.buf ? this.buf.cols : 80;
    const rows = this.buf ? this.buf.rows : 24;

    {
      let width = this.termWidth ? this.termWidth : this.innerBounds.width;
      let height = this.termHeight ? this.termHeight : this.innerBounds.height;
      if (width === 0 || height === 0) return; // errors for openning in a new window
      width -= 10; // for scroll bar

      let o_h, o_w, i = 4;
      let nowchh = this.chh;
      let nowchw = this.chw;
      do {
        ++i;
        nowchh = i*2;
        nowchw = i;
        o_h = (nowchh) * rows;
        o_w = nowchw * cols;
      } while (o_h <= height && o_w <= width);
      --i;
      nowchh = i*2;
      nowchw = i;
      this.fixedResize(nowchh);
    }
  }

  fixedResize(fontSizePx) {
    let chw = fontSizePx / 2;
    let chh = fontSizePx;

    this.setTermFontSize(chw, chh);
  }

  calcTermSizeFromFont(fontSizePx) {
    fontSizePx = Math.floor((fontSizePx + 1) / 2) * 2;
    let width = this.termWidth ? this.termWidth : this.innerBounds.width;
    let height = this.termHeight ? this.termHeight : this.innerBounds.height;
    let cols = Math.max(80, Math.min(200, Math.floor(2 * (width - 10) / fontSizePx)));
    let rows = Math.max(24, Math.min(100, Math.floor(height / fontSizePx)));
    return this.buf.site.clampTermSize(cols, rows);
  }

  calcFontSizeFromTerm(termCols, termRows) {
    termCols = Math.max(80, Math.min(200, termCols));
    termRows = Math.max(24, Math.min(100, termRows));
    let width = this.termWidth ? this.termWidth : this.innerBounds.width;
    let height = this.termHeight ? this.termHeight : this.innerBounds.height;
    let sizeX = Math.floor(2 * (width - 10) / termCols);
    let sizeY = Math.floor(height / termRows);
    return Math.min(sizeX, sizeY);
  }

  getRowLineElement(node) {
    for (let r = node; r && r != r.parentNode; r = r.parentNode) {
      if (r instanceof Element &&
        r.getAttribute('data-type') == 'termline') {
        return r;
      }
    }
    return null;
  }

  countCol(node, pos) {
    let rowNode = this.getRowLineElement(node);
    if (!rowNode) {
      return { row: 0, col: 0 };
    }

    let col = 0;
    let doCount = function(cur) {
      if (cur == node) {
        col += u2b(cur.textContent.substring(0, pos)).length;
        return false;
      }
      if (cur.nodeName == '#text') {
        col += u2b(cur.textContent).length;
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
    if (this.app?.connLog?.hasSelection?.()) {
      if (!window.getSelection().isCollapsed) {
        return window.getSelection().toString();
      }
    }
    const interceptorText = this.app?.getInterceptorSelectedText?.();
    if (interceptorText !== null && interceptorText !== undefined) {
      return interceptorText;
    }
    if (this.useCanvasEngine) {
      if (this.componentScreen) {
        return this.componentScreen.getSelectedText();
      }
      return '';
    }
    if (!window.getSelection().isCollapsed) {
      return window.getSelection().toString().replace(/\u00a0/g, " ");
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
    if (this.componentScreen) {
      this.componentScreen.clearSelection();
    } else if (typeof window !== 'undefined' && window.getSelection) {
      const sel = window.getSelection();
      if (sel && sel.removeAllRanges) {
        sel.removeAllRanges();
      }
    }
  }

  getSelectionColRow() {
    const interceptorColRow = this.app?.getInterceptorSelectionColRow?.();
    if (interceptorColRow !== undefined) {
      return interceptorColRow;
    }
    if (this.useCanvasEngine) {
      if (this.componentScreen) {
        const sel = this.componentScreen.getSelectionColRow();
        if (sel)
          return sel;
      }
    }
    if (window.getSelection().isCollapsed || window.getSelection().rangeCount === 0)
      return null;
    let r = window.getSelection().getRangeAt(0);
    return {
      start: this.countCol(r.startContainer, r.startOffset),
      end: this.countCol(r.endContainer, r.endOffset)
    };
  }

  selectAll() {
    if (this.app?.dispatchSelectAll?.()) {
      return;
    }
    if (this.useCanvasEngine) {
      if (this.componentScreen) {
        this.componentScreen.selectAll();
      }
      return;
    }
    window.getSelection().selectAllChildren(this.screenContainer || this.mainDisplay);
  }

  showWaterballNotification() {
    if (!this.enableNotifications) {
      return;
    }
    const app = this.app;
    //console.log('message from ' + this.waterball.userId + ': ' + this.waterball.message); 
    const title = app.waterball.userId + ' ' + i18n('notification_said');
    if (this.titleTimer) {
      this.titleTimer.cancel();
      this.titleTimer = null;
    }
    this.titleTimer = setTimer(true, () => {
      if (document.title == this.buf.title) {
        document.title = title + ' ' + app.waterball.message;
      } else {
        document.title = this.buf.title;
      }
    }, 1500);
    const postNotification = async () => {
      const options = {
        icon: icon128,
        body: app.waterball.message,
        tag: app.waterball.userId
      };

      try {
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg && reg.showNotification) {
            await reg.showNotification(title, options);
            return;
          }
        }
      } catch (err) {}

      try {
        if (typeof Notification !== 'undefined') {
          this.notif = new Notification(title, options);
          this.notif.onclick = () => {
            window.focus();
          };
        }
      } catch (err) {}
    };

    if (typeof Notification !== 'undefined') {
      if (Notification.permission === 'granted') {
        postNotification();
      } else if (Notification.permission !== 'denied' && Notification.requestPermission) {
        Notification.requestPermission().then((perm) => {
          if (perm === 'granted') {
            postNotification();
          }
        }).catch(() => {});
      }
    }
  }

  get useEasyReadingMode() {
    return this.app?.easyReading ? this.app.easyReading.enabled : (this._easyReading ? this._easyReading.enabled : this._useEasyReadingMode);
  }
  set useEasyReadingMode(val) {
    if (this.app?.easyReading) {
      this.app.easyReading.enabled = val;
    } else if (this._easyReading) {
      this._easyReading.enabled = val;
    }
    this._useEasyReadingMode = val;
  }

  get easyReadingKeyDownKeyCode() {
    return this.app?.easyReading?._keyDownKeyCode ?? this._easyReadingKeyDownKeyCode ?? 0;
  }
  set easyReadingKeyDownKeyCode(val) {
    if (this.app?.easyReading) this.app.easyReading._keyDownKeyCode = val;
    this._easyReadingKeyDownKeyCode = val;
  }

  get easyReadingKeyDownIsComposing() {
    return this.app?.easyReading?._keyDownIsComposing ?? this._easyReadingKeyDownIsComposing ?? false;
  }
  set easyReadingKeyDownIsComposing(val) {
    if (this.app?.easyReading) this.app.easyReading._keyDownIsComposing = val;
    this._easyReadingKeyDownIsComposing = val;
  }

  get easyReadingOverlay() {
    return this.app?.easyReading?.overlay || this._easyReadingOverlay || null;
  }
  set easyReadingOverlay(val) {
    this._easyReadingOverlay = val;
  }

  get easyReadingContent() {
    return this.app?.easyReading?.content || this._easyReadingContent || null;
  }
  set easyReadingContent(val) {
    this._easyReadingContent = val;
  }

  get easyReadingFooter() {
    return this.app?.easyReading?.footer || this._easyReadingFooter || null;
  }
  set easyReadingFooter(val) {
    this._easyReadingFooter = val;
  }

  get lastRowDiv() {
    return this.app?.easyReading?.lastRowDiv || this._lastRowDiv || null;
  }
  set lastRowDiv(val) {
    this._lastRowDiv = val;
  }

  get replyRowDiv() {
    return this.app?.easyReading?.replyRowDiv || this._replyRowDiv || null;
  }
  set replyRowDiv(val) {
    this._replyRowDiv = val;
  }

  get actualRowIndex() {
    return this.app?.easyReading?.actualRowIndex ?? this._actualRowIndex ?? 0;
  }
  set actualRowIndex(val) {
    if (this.app?.easyReading) {
      this.app.easyReading.actualRowIndex = val;
    }
    this._actualRowIndex = val;
  }

  isEasyReadingActive() {
    if (this.app?.easyReading) {
      return this.app.easyReading.isActive();
    }
    return !!(this.easyReadingOverlay && this.easyReadingOverlay.style.display !== 'none');
  }

  showEasyReading() {
    if (this.app?.easyReading) {
      this.app.easyReading.show();
      return;
    }
    if (this.easyReadingOverlay) {
      this.easyReadingOverlay.style.display = 'block';
    }
    if (this.app) {
      this.app.lastEasyReadingWheelTime = 0;
      this.app.lastEasyReadingHideTime = 0;
    }
  }

  populateEasyReadingPage() {
    if (this.app?.easyReading) {
      this.app.easyReading.populatePage();
    }
  }

  updateEasyReadingProgress() {
    if (this.app?.easyReading) {
      this.app.easyReading.updateProgress();
    }
  }

  clearRows() {
    if (this.app?.easyReading) {
      this.app.easyReading.clearRows();
      return;
    }
    if (this.easyReadingContent) {
      this.easyReadingContent.innerHTML = '';
    }
  }

  appendRows(lines, showsLinkPreview) {
    if (this.app?.easyReading) {
      this.app.easyReading.appendRows(lines, showsLinkPreview);
      return;
    }
  }

  renderRow(line, row, chh, showsLinkPreview, el) {
    return renderRowHtml(line, row, chh, showsLinkPreview, el);
  }

  renderSingleRow(target, row) {
    const el = document.createElement('span');
    el.setAttribute('type', 'termrow');
    el.setAttribute('srow', '0');
    target.appendChild(el);
    return renderRowHtml(row, 0, this.chh, false, el);
  }

  hideEasyReading() {
    if (this.app?.easyReading) {
      this.app.easyReading.hide();
      return;
    }
    if (this.easyReadingOverlay) {
      this.easyReadingOverlay.style.display = 'none';
    }
    if (this.app) {
      this.app.lastEasyReadingHideTime = Date.now();
      this.app.suppressInertialWheel?.();
    }
    this.clearRows();
    if (this.lastRowDiv) {
      this.lastRowDiv.style.backgroundColor = '';
      this.lastRowDiv.style.display = 'none';
    }
    if (this.replyRowDiv) {
      this.replyRowDiv.style.display = 'none';
    }
    if (this.buf) {
      this.buf.pageLines = [];
    }
  }

  updateEasyReadingReplyRow(row) {
    if (this.app?.easyReading) {
      this.app.easyReading.updateReplyRow(row);
      return;
    }
  }

  updateEasyReadingPushInitRow(row) {
    if (this.app?.easyReading) {
      this.app.easyReading.updatePushInitRow(row);
      return;
    }
  }

  setSingleChild(par, child) {
    while (par.childNodes.length > 0)
      par.removeChild(par.lastChild);
    par.appendChild(child);
  }
}
