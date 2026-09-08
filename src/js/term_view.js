// Terminal View

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

export class TermView {
  constructor() {
  //new pref - start
  this.bbsWidth = 0;
  this.bbsHeight = 0;
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

  this.bbsViewMargin = 0;

  this.buf = null;
  this.bbscore = null;
  this.page = null;

  // Cursor
  this.cursorX = 0;
  this.cursorY = 0;

  // TODO Move this into easy_reading.js
  this.useEasyReadingMode = false;
  this.easyReadingKeyDownKeyCode = 0;
  this.easyReadingKeyDownIsComposing = false;

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
  this.bbsCursor = document.getElementById('cursor');
  this.BBSWin = document.getElementById('BBSWindow');
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
  this.BBSWin.appendChild(mainDisplay);
  this.mainDisplay = mainDisplay;

  const screenContainer = document.createElement('div');
  screenContainer.setAttribute('id', 'screenContainer');
  mainDisplay.appendChild(screenContainer);
  this.screenContainer = screenContainer;

  this.mainDisplay.style.border = '0px';
  this.setFontFace('MingLiu,monospace');

  this._keyboard = new TermKeyboard(
    () => this.checkLeftDB(),
    () => this.checkCurDB(),
    (data) => this._send(data));

  this.input.addEventListener('compositionstart', (e) => {
    this.onCompositionStart(e);
    this.bbscore.setInputAreaFocus();
  }, false);

  this.input.addEventListener('compositionend', (e) => {
    this.onCompositionEnd(e);
    this.bbscore.setInputAreaFocus();
    // Some browsers fire another input event after composition; some not.
    // The strategy here is to ignore the inputs during composition.
    // Instead, we pull all input text at composition end, and clear input text.
    // So if input event do fire after composition end, we'll get a empty string.
    this.onInput(e);
  }, false);

  let shouldAcceptInput = () => !this.bbscore.modalShown && !this.bbscore.contextMenuShown;
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

    // disable auto update pushthread if any command is issued;
    if (!e.altKey) this.bbscore.onDisableLiveHelperModalState();

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
    this.bbscore.setInputAreaFocus();
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
    this.bbscore=core;
  }

  get conn() {
    return this.bbscore ? this.bbscore.conn : null;
  }

  get charset() {
    if (this.bbscore && this.bbscore.stream) {
      return this.bbscore.stream.charset;
    }
    return (this.bbscore && this.bbscore.site) ? this.bbscore.site.charset : (this._charset || 'big5');
  }

  set charset(val) {
    this._charset = val;
    if (this.bbscore && this.bbscore.stream) {
      this.bbscore.stream.charset = val;
    }
    if (this.bbscore && this.bbscore.site) {
      this.bbscore.site.charset = val;
    }
  }

  _send(data) {
    if (this.bbscore && this.bbscore.stream)
      this.bbscore.stream.send(data);
    else if (this.bbscore && this.bbscore.conn)
      this.bbscore.conn.send(data);
  }

  _convSend(data) {
    if (this.bbscore && this.bbscore.stream)
      this.bbscore.stream.send(data);
    else if (this.bbscore && this.bbscore.conn)
      this.bbscore.conn.convSend(data);
  }

  setFontFace(fontFace) {
    this.fontFace = fontFace;
    this.input.style.setProperty('font-family', this.fontFace, 'important');
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
          copyOnSelect: this.bbscore.copyOnSelect,
          doCopy: this.bbscore.doCopy.bind(this.bbscore),
          setInputAreaFocus: this.bbscore.setInputAreaFocus.bind(this.bbscore),
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

      if (this.bbscore?.easyReading) {
        this.bbscore.easyReading.updatePage(changedLineHtmlStrs);
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
    this.BBSWin.style.setProperty('--highlightBG', termColors[this.highlightBG]);
    //this.BBSWin.style.setProperty('--highlightFG', termColors[this.highlightFG]);
  }

  onInput(e) {
    if (this.bbscore.modalShown || this.bbscore.contextMenuShown)
      return;
    if (this.isComposition) {
      // beginning chrome 55, we no longer can update input buffer width on compositionupdate
      // so we update it on input event
      this.updateInputBufferWidth();
      return;
    }

    if (this.isEasyReadingActive() && 
        !this.buf.easyReadingShowReplyText && !this.buf.easyReadingShowPushInitText &&
        (this.easyReadingKeyDownIsComposing || this.easyReadingKeyDownKeyCode == 229) && e.target.value != 'X') { // only use on chinese IME
      e.target.value = '';
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
    if (this.isEasyReadingActive() && 
        !this.buf.easyReadingShowReplyText && !this.buf.easyReadingShowPushInitText) {
      this.easyReadingKeyDownKeyCode = e.keyCode;
      this.easyReadingKeyDownIsComposing = e.isComposing || e.key === 'Process' || e.keyCode === 229;
      this.bbscore.easyReading._onKeyDown(e);
      if (e.defaultPrevented)
        return;
    }

    // TODO: Move this. Make a key event mapper.
    let stop = false;
    if (!e.ctrlKey && !e.altKey) {
      switch (e.key) {
        case 'End': //End
          if ((this.bbscore.buf.pageState == 2 || this.bbscore.buf.pageState == 3) &&
            this.bbscore.endTurnsOnLiveUpdate) {
            this.bbscore.onToggleLiveHelperModalState();
            stop = true;
          }
          break;
      }
    } else if (e.ctrlKey && !e.altKey && !e.shiftKey) {
      switch (e.key.toLowerCase()) {
        case 'c': {
          const selectedText = this.getSelectedText();
          if (selectedText) { //^C , do copy
            this.bbscore.doCopy(selectedText);
            stop = true;
          }
          break;
        }
        case 'a':
          this.bbscore.doSelectAll();
          stop = true;
          break;
      }
    } else if (e.ctrlKey && !e.altKey && e.shiftKey) {
      switch (e.key.toLowerCase()) {
        case 'V':
          this.bbscore.doPaste();
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
    if (this.BBSWin && this.BBSWin.style) {
      this.BBSWin.style.setProperty('--term-font-size', fontSize);
      this.BBSWin.style.setProperty('--term-chw', this.chw + 'px');
      this.BBSWin.style.setProperty('--term-chh', this.chh + 'px');
    }
    this.mainDisplay.style.fontSize = fontSize;
    this.mainDisplay.style.lineHeight = fontSize;
    if (this.easyReadingOverlay) {
      this.easyReadingOverlay.style.fontSize = fontSize;
      this.easyReadingOverlay.style.lineHeight = fontSize;
    }
    this.bbsCursor.style.fontSize = fontSize;
    this.bbsCursor.style.lineHeight = fontSize;
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

    this.firstGridOffset = this.bbscore.getFirstGridOffsets();

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
    let baseMarginTop = this.bbsViewMargin || 0;
    if (totalHeight < innerBounds.height) {
      baseMarginTop =
        (innerBounds.height - totalHeight) / 2 + (this.bbsViewMargin || 0);
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
    if (this.bbscore) {
      this.firstGridOffset = this.bbscore.getFirstGridOffsets();
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
    if (this.BBSWin && this.BBSWin.style) {
      const revScaleX = Math.floor((1 / this.scaleX) * 100) / 100;
      const revScaleY = Math.floor((1 / this.scaleY) * 100) / 100;
      this.BBSWin.style.setProperty('--preview-scale-x', revScaleX);
      this.BBSWin.style.setProperty('--preview-scale-y', revScaleY);
    }
  }

  convertMN2XYEx(cx, cy) {
    let origin;
    const w = this.innerBounds.width;
    const h = this.innerBounds.height;
    if(this.scaleX!=1 || this.scaleY!=1)
      origin = [((w - (this.chw*this.buf.cols+10)*this.scaleX)/2) + this.bbsViewMargin, ((h - (this.chh*this.buf.rows)*this.scaleY)/2) + this.bbsViewMargin];
    else
      origin = [this.firstGridOffset.left, this.firstGridOffset.top];
    const realX = origin[0] + (cx) * this.chw * this.scaleX;
    const realY = origin[1] + (cy) * this.chh * this.scaleY;
    return [realX, realY];
  }

  checkLeftDB() {
    if (this.dbcsDetect && this.buf.cur_x>1) {
      const lines = this.buf.lines;
      const line = lines[this.buf.cur_y];
      const ch = line[this.buf.cur_x-2];
      if (ch.isDBCSLead)
        return true;
    }
    return false;
  }

  checkCurDB() {
    if (this.dbcsDetect) {// && this.buf.cur_x<this.buf.cols-2){
      const lines = this.buf.lines;
      const line = lines[this.buf.cur_y];
      const ch = line[this.buf.cur_x];
      if (ch.isDBCSLead)
        return true;
    }
    return false;
  }

  // Cursor
  setCursorStyle(style) {
    this.cursorStyle = style || 'blink';
    this.applyCursorStyle();
    this.updateCursorPos();
  }

  applyCursorStyle() {
    if (!this.bbsCursor) {
      this.bbsCursor = (typeof document !== 'undefined') ? document.getElementById('cursor') : null;
    }
    if (!this.bbsCursor) return;

    const style = this.cursorStyle || 'blink';
    this.bbsCursor.classList.remove(
      'cursor--blink',
      'cursor--underline',
      'cursor--reverse',
      'cursor--blink-reverse'
    );

    const isBlock = style === 'reverse' || style === 'blink-reverse';
    const blockHeight = isBlock ? Math.round(this.chh / 2) : 0;

    if (style === 'reverse') {
      this.bbsCursor.classList.add('cursor--reverse');
      this.bbsCursor.textContent = '';
      if (this.chw) this.bbsCursor.style.width = this.chw + 'px';
      if (blockHeight) this.bbsCursor.style.height = blockHeight + 'px';
    } else if (style === 'blink-reverse') {
      this.bbsCursor.classList.add('cursor--blink-reverse');
      this.bbsCursor.textContent = '';
      if (this.chw) this.bbsCursor.style.width = this.chw + 'px';
      if (blockHeight) this.bbsCursor.style.height = blockHeight + 'px';
    } else if (style === 'underline') {
      this.bbsCursor.classList.add('cursor--underline');
      this.bbsCursor.textContent = '_';
      this.bbsCursor.style.width = '';
      this.bbsCursor.style.height = '0px';
    } else {
      this.bbsCursor.classList.add('cursor--blink');
      this.bbsCursor.textContent = '_';
      this.bbsCursor.style.width = '';
      this.bbsCursor.style.height = '0px';
    }
  }

  updateCursorPos() {
    if (!this.bbsCursor) return;
    const pos = this.convertMN2XYEx(this.buf.cur_x, this.buf.cur_y);
    // if you want to set cursor color by now background, use this.
    if (this.buf.cur_y >= this.buf.rows || this.buf.cur_x >= this.buf.cols)
      return; //sometimes, the value of this.buf.cur_x is 80 :(

    const lines = this.buf.lines;
    const line = lines[this.buf.cur_y];
    const ch = line ? line[this.buf.cur_x] : null;
    const bg = ch ? ch.getBg() : 0;

    if (this.scaleX == 1 && this.scaleY == 1) {
      this.bbsCursor.style.transform = 'none';
    } else {
      const scaleCss = 'scale('+this.scaleX+','+this.scaleY+')';
      this.mainDisplay.style.transform = scaleCss;
      this.bbsCursor.style.transform = scaleCss;
      this.bbsCursor.style.transformOrigin = 'left top';
    }

    const isBlock = this.cursorStyle === 'reverse' || this.cursorStyle === 'blink-reverse';
    const blockHeight = isBlock ? Math.round(this.chh / 2) : 0;
    const topOffset = isBlock ? ((this.chh - blockHeight) * this.scaleY) : -this.scaleY;

    this.bbsCursor.style.left = pos[0] + 'px';
    this.bbsCursor.style.top = (pos[1] + topOffset) + 'px';
    if (isBlock) {
      if (this.chw) this.bbsCursor.style.width = this.chw + 'px';
      if (blockHeight) this.bbsCursor.style.height = blockHeight + 'px';
    } else {
      this.bbsCursor.style.color = termInvColors[bg];
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
      const bbswinheight = innerBounds.height;
      const bbswinwidth = innerBounds.width;
      if(bbswinheight < pos[1] + parseFloat(this.input.style.height) + this.chh)
        this.input.style.top = (pos[1] - parseFloat(this.input.style.height) - this.chh)+ 4 +'px';
      else
        this.input.style.top = (pos[1] + this.chh) +'px';

      if(bbswinwidth < pos[0] + parseFloat(this.input.style.width))
        this.input.style.left = bbswinwidth - parseFloat(this.input.style.width)- 10 +'px';
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
      let width = this.bbsWidth ? this.bbsWidth : this.innerBounds.width;
      let height = this.bbsHeight ? this.bbsHeight : this.innerBounds.height;
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
    let width = this.bbsWidth ? this.bbsWidth : this.innerBounds.width;
    let height = this.bbsHeight ? this.bbsHeight : this.innerBounds.height;
    let cols = Math.max(80, Math.min(200, Math.floor(2 * (width - 10) / fontSizePx)));
    let rows = Math.max(24, Math.min(100, Math.floor(height / fontSizePx)));
    return this.buf.site.clampTermSize(cols, rows);
  }

  calcFontSizeFromTerm(termCols, termRows) {
    termCols = Math.max(80, Math.min(200, termCols));
    termRows = Math.max(24, Math.min(100, termRows));
    let width = this.bbsWidth ? this.bbsWidth : this.innerBounds.width;
    let height = this.bbsHeight ? this.bbsHeight : this.innerBounds.height;
    let sizeX = Math.floor(2 * (width - 10) / termCols);
    let sizeY = Math.floor(height / termRows);
    return Math.min(sizeX, sizeY);
  }

  getRowLineElement(node) {
    for (let r = node; r && r != r.parentNode; r = r.parentNode) {
      if (r instanceof Element &&
        r.getAttribute('data-type') == 'bbsline') {
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
    if (this.bbscore.connLog.hasSelection()) {
      if (!window.getSelection().isCollapsed) {
        return window.getSelection().toString();
      }
    }
    if (this.isEasyReadingActive()) {
      if (!window.getSelection().isCollapsed) {
        return window.getSelection().toString().replace(/\u00a0/g, " ");
      }
      return '';
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
    if (this.isEasyReadingActive()) {
      return null;
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
    if (this.isEasyReadingActive()) {
      window.getSelection().selectAllChildren(this.easyReadingContent);
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
    const app = this.bbscore;
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

  get easyReadingOverlay() {
    return this.bbscore?.easyReading?.overlay || this._easyReadingOverlay || null;
  }
  set easyReadingOverlay(val) {
    this._easyReadingOverlay = val;
  }

  get easyReadingContent() {
    return this.bbscore?.easyReading?.content || this._easyReadingContent || null;
  }
  set easyReadingContent(val) {
    this._easyReadingContent = val;
  }

  get easyReadingFooter() {
    return this.bbscore?.easyReading?.footer || this._easyReadingFooter || null;
  }
  set easyReadingFooter(val) {
    this._easyReadingFooter = val;
  }

  get lastRowDiv() {
    return this.bbscore?.easyReading?.lastRowDiv || this._lastRowDiv || null;
  }
  set lastRowDiv(val) {
    this._lastRowDiv = val;
  }

  get replyRowDiv() {
    return this.bbscore?.easyReading?.replyRowDiv || this._replyRowDiv || null;
  }
  set replyRowDiv(val) {
    this._replyRowDiv = val;
  }

  get actualRowIndex() {
    return this.bbscore?.easyReading?.actualRowIndex ?? this._actualRowIndex ?? 0;
  }
  set actualRowIndex(val) {
    if (this.bbscore?.easyReading) {
      this.bbscore.easyReading.actualRowIndex = val;
    }
    this._actualRowIndex = val;
  }

  isEasyReadingActive() {
    if (this.bbscore?.easyReading) {
      return this.bbscore.easyReading.isActive();
    }
    return !!(this.easyReadingOverlay && this.easyReadingOverlay.style.display !== 'none');
  }

  showEasyReading() {
    if (this.bbscore?.easyReading) {
      this.bbscore.easyReading.show();
      return;
    }
    if (this.easyReadingOverlay) {
      this.easyReadingOverlay.style.display = 'block';
    }
    if (this.bbscore) {
      this.bbscore.lastEasyReadingWheelTime = 0;
      this.bbscore.lastEasyReadingHideTime = 0;
    }
  }

  populateEasyReadingPage() {
    if (this.bbscore?.easyReading) {
      this.bbscore.easyReading.populatePage();
    }
  }

  updateEasyReadingProgress() {
    if (this.bbscore?.easyReading) {
      this.bbscore.easyReading.updateProgress();
    }
  }

  clearRows() {
    if (this.bbscore?.easyReading) {
      this.bbscore.easyReading.clearRows();
      return;
    }
    if (this.easyReadingContent) {
      this.easyReadingContent.innerHTML = '';
    }
  }

  appendRows(lines, showsLinkPreview) {
    if (this.bbscore?.easyReading) {
      this.bbscore.easyReading.appendRows(lines, showsLinkPreview);
      return;
    }
  }

  renderRow(line, row, chh, showsLinkPreview, el) {
    return renderRowHtml(line, row, chh, showsLinkPreview, el);
  }

  renderSingleRow(target, row) {
    const el = document.createElement('span');
    el.setAttribute('type', 'bbsrow');
    el.setAttribute('srow', '0');
    target.appendChild(el);
    return renderRowHtml(row, 0, this.chh, false, el);
  }

  hideEasyReading() {
    if (this.bbscore?.easyReading) {
      this.bbscore.easyReading.hide();
      return;
    }
    if (this.easyReadingOverlay) {
      this.easyReadingOverlay.style.display = 'none';
    }
    if (this.bbscore) {
      this.bbscore.lastEasyReadingHideTime = Date.now();
      this.bbscore.suppressInertialWheel?.();
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
    if (this.bbscore?.easyReading) {
      this.bbscore.easyReading.updateReplyRow(row);
      return;
    }
  }

  updateEasyReadingPushInitRow(row) {
    if (this.bbscore?.easyReading) {
      this.bbscore.easyReading.updatePushInitRow(row);
      return;
    }
  }

  setSingleChild(par, child) {
    while (par.childNodes.length > 0)
      par.removeChild(par.lastChild);
    par.appendChild(child);
  }
}
