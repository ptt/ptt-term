import { readValuesWithDefault } from '../../js/pref.js';

export const INFLIGHT_WATCHDOG_MS = 1500;
export const MAX_INFLIGHT_RETRIES = 2;

export class EasyReading {
  static name = 'easy_reading';

  get name() {
    return 'easy_reading';
  }

  constructor(core, view, termBuf) {
    this._core = null;
    this._view = null;
    this._termBuf = null;
    this._initialized = false;
    this._bufListenersAttached = false;
    this._uiInitialized = false;

    this.enabled = false;
    this.started = false;
    this.showReplyText = false;
    this.showPushInitText = false;
    this.pageLines = [];
    this.pageWrappedLines = [];

    this.lastWheelTime = 0;
    this.lastHideTime = 0;
    this._keyDownKeyCode = 0;
    this._keyDownIsComposing = false;

    this._overlay = null;
    this._content = null;
    this._footer = null;
    this._lastRowDiv = null;
    this._replyRowDiv = null;
    this.lastRowDivContent = '';
    this.replyRowDivContent = '';

    this.actualRowIndex = 0;
    this._lastEasyReadingPageIndex = null;
    this._easyReadingAppendedEnd = false;

    this._customTurnPageLines = 0;

    this.easyReadingReachedPageEnd = false;
    this.sendCommandAfterUpdate = '';
    this.ignoreOneUpdate = false;
    this._pageDownInFlight = false;
    this._lastRequestedPageIndex = null;
    this._lastRequestedRowIndexStart = null;
    this._inFlightTimer = null;
    this._inFlightRetries = 0;

    this._onBufChanged = (e) => this._onChanged(e);
    this._onBufViewUpdated = (e) => this._onViewUpdated(e);

    if (core || view || termBuf) {
      this.init({ core, app: core, view, buf: termBuf });
    }
  }

  init({ core, app, view, buf } = {}) {
    const targetCore = core || app || this._core;
    const targetView = view || this._view;
    const targetBuf = buf || this._termBuf;

    this._core = targetCore;
    this._view = targetView;
    this._termBuf = targetBuf;

    if (targetCore) {
      if (!targetCore.easyReading) {
        targetCore.easyReading = this;
      }
      targetCore.registerInputInterceptor?.(this);
    }
    if (targetBuf) {
      targetBuf._easyReading = this;
      if (targetBuf.addEventListener && !this._bufListenersAttached) {
        targetBuf.addEventListener('change', this._onBufChanged);
        targetBuf.addEventListener('viewUpdate', this._onBufViewUpdated);
        this._bufListenersAttached = true;
      }
    }
    if (targetView) {
      targetView._easyReading = this;
      if ('useEasyReadingMode' in targetView) {
        this.enabled = !!targetView.useEasyReadingMode;
      }
    }

    if (typeof document !== 'undefined' && !this._uiInitialized) {
      const container = this._view?.termWin || document.getElementById('TermWindow');
      if (container) {
        this._initUI(container);
        this._uiInitialized = true;
      }
    }
    this._initialized = true;
    return this;
  }

  destroy() {
    this.hide();
    this._resetInFlight();
    if (this._termBuf && this._bufListenersAttached) {
      this._termBuf.removeEventListener?.('change', this._onBufChanged);
      this._termBuf.removeEventListener?.('viewUpdate', this._onBufViewUpdated);
      this._bufListenersAttached = false;
    }
    if (this._core) {
      this._core.unregisterInputInterceptor?.(this);
      if (this._core.easyReading === this) {
        this._core.easyReading = null;
      }
    }
    if (this._view?._easyReading === this) {
      this._view._easyReading = null;
    }
    if (this._termBuf?._easyReading === this) {
      this._termBuf._easyReading = null;
    }
    if (this._overlay && this._overlay.parentNode) {
      this._overlay.parentNode.removeChild(this._overlay);
    }
    this._overlay = null;
    this._content = null;
    this._footer = null;
    this._lastRowDiv = null;
    this._replyRowDiv = null;
    this._uiInitialized = false;
    this._initialized = false;
  }

  get _enabled() {
    return this.enabled;
  }
  set _enabled(val) {
    this.enabled = val;
    if (this._view && 'useEasyReadingMode' in this._view && typeof this._view.useEasyReadingMode === 'boolean') {
      this._view.useEasyReadingMode = val;
    }
  }

  get startedEasyReading() {
    return this.started;
  }
  set startedEasyReading(val) {
    this.started = val;
  }

  get easyReadingShowReplyText() {
    return this.showReplyText;
  }
  set easyReadingShowReplyText(val) {
    this.showReplyText = val;
  }

  get easyReadingShowPushInitText() {
    return this.showPushInitText;
  }
  set easyReadingShowPushInitText(val) {
    this.showPushInitText = val;
  }

  isStarted() {
    return this.started;
  }

  isPromptActive() {
    return this.showReplyText || this.showPushInitText;
  }

  isReplyActive() {
    return this.showReplyText;
  }

  isPushInitActive() {
    return this.showPushInitText;
  }

  get overlay() {
    return this._overlay || (this._view && this._view._easyReadingOverlay) || null;
  }

  get content() {
    return this._content || (this._view && this._view._easyReadingContent) || null;
  }

  get footer() {
    return this._footer || (this._view && this._view._easyReadingFooter) || null;
  }

  get lastRowDiv() {
    return this._lastRowDiv || (this._view && this._view._lastRowDiv) || null;
  }

  get replyRowDiv() {
    return this._replyRowDiv || (this._view && this._view._replyRowDiv) || null;
  }

  initUI(container) {
    this._initUI(container);
  }

  _initUI(container) {
    if (this._overlay && this._overlay.parentNode) return;
    if (!container && typeof document !== 'undefined') {
      container = this._view?.termWin || document.getElementById('TermWindow');
    }
    if (!container || typeof document === 'undefined') return;

    const easyReadingOverlay = document.createElement('div');
    easyReadingOverlay.setAttribute('id', 'easyReadingOverlay');
    easyReadingOverlay.style.display = 'none';
    easyReadingOverlay.addEventListener('mousedown', (e) => {
      if (e.target && e.target.tagName !== 'A' && this._core?.setInputAreaFocus) {
        this._core.setInputAreaFocus();
      }
    });
    easyReadingOverlay.addEventListener('wheel', (e) => {
      const cont = this.content;
      if (cont && e.target !== cont && !cont.contains(e.target)) {
        cont.scrollTop += e.deltaY;
      }
    }, { passive: true });
    container.appendChild(easyReadingOverlay);
    this._overlay = easyReadingOverlay;

    const easyReadingContent = document.createElement('div');
    easyReadingContent.setAttribute('id', 'easyReadingContent');
    easyReadingOverlay.appendChild(easyReadingContent);
    this._content = easyReadingContent;
    easyReadingContent.addEventListener('scroll', () => {
      this.updateProgress();
    });

    const easyReadingFooter = document.createElement('div');
    easyReadingFooter.setAttribute('id', 'easyReadingFooter');
    easyReadingOverlay.appendChild(easyReadingFooter);
    this._footer = easyReadingFooter;

    const lastRowDiv = document.createElement('div');
    lastRowDiv.setAttribute('id', 'easyReadingLastRow');
    const spaces = ' ';
    this.lastRowDivContent = '<span align="left"><span class="q0 b7">' + spaces + '瀏覽 </span><span class="q1 b7">(100%)</span><span class="q1 b7"> [好讀模式]</span><span class="q0 b7"> 滾輪/上下鍵捲動，</span><span class="q1 b7">(Esc)</span><span class="q0 b7">回到終端機 </span><span class="q1 b7">(←/q)</span><span class="q0 b7">離開</span></span>';
    lastRowDiv.innerHTML = this.lastRowDivContent;
    this._lastRowDiv = lastRowDiv;
    easyReadingFooter.appendChild(lastRowDiv);

    const replyRowDiv = document.createElement('div');
    replyRowDiv.setAttribute('id', 'easyReadingReplyRow');
    this.replyRowDivContent = '<span align="left"></span>';
    replyRowDiv.innerHTML = this.replyRowDivContent;
    this._replyRowDiv = replyRowDiv;
    easyReadingFooter.appendChild(replyRowDiv);

    if (this._view?.fontFace) {
      this._overlay.style.setProperty('--font-face', this._view.fontFace);
    }
    if (this._view?.mainDisplay?.style?.fontSize) {
      this._overlay.style.fontSize = this._view.mainDisplay.style.fontSize;
      this._overlay.style.lineHeight = this._view.mainDisplay.style.lineHeight;
    }
  }

  isActive() {
    return !!(this.overlay && this.overlay.style.display !== 'none');
  }

  isEasyReadingActive() {
    return this.isActive();
  }

  show() {
    if (this.overlay) {
      this.overlay.style.display = 'block';
    }
    this.lastWheelTime = 0;
    this.lastHideTime = 0;
    if (this._core) {
      this._core.lastEasyReadingWheelTime = 0;
      this._core.lastEasyReadingHideTime = 0;
    }
  }

  showEasyReading() {
    this.show();
  }

  hide() {
    if (this.overlay) {
      this.overlay.style.display = 'none';
    }
    this.lastHideTime = Date.now();
    if (this._core) {
      this._core.lastEasyReadingHideTime = this.lastHideTime;
      this._core.suppressInertialWheel?.(600);
    }
    this.clearRows();
    if (this.lastRowDiv) {
      this.lastRowDiv.style.backgroundColor = '';
      this.lastRowDiv.style.display = 'none';
    }
    if (this.replyRowDiv) {
      this.replyRowDiv.style.display = 'none';
    }
    this.pageLines = [];
    this.pageWrappedLines = [];
    if (this._termBuf) {
      this._termBuf.pageLines = [];
      this._termBuf.pageWrappedLines = [];
    }
  }

  hideEasyReading() {
    this.hide();
  }

  clearRows() {
    if (this.content) {
      this.content.innerHTML = '';
    }
  }

  setRowRenderer(fn) {
    this._rowRenderer = fn;
  }

  renderRow(line, row, chh, showsLinkPreview, el) {
    if (this._rowRenderer) {
      return this._rowRenderer(line, row, chh, showsLinkPreview, el);
    }
    if (this._view && typeof this._view.renderRow === 'function') {
      return this._view.renderRow(line, row, chh, showsLinkPreview, el);
    }
    return null;
  }

  appendRows(lines, showsLinkPreview) {
    if (!this.content) return;
    const chh = (this._view && this._view.chh) || 16;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const el = document.createElement('span');
      el.setAttribute('type', 'termrow');
      el.setAttribute('srow', this.content.childNodes.length);
      this.content.appendChild(el);
      this.renderRow(
        line, this.content.childNodes.length, chh,
        showsLinkPreview, el);
    }
    this.updateProgress();
  }

  renderSingleRow(target, row) {
    if (this._view && typeof this._view.renderSingleRow === 'function') {
      return this._view.renderSingleRow(target, row);
    }
    const el = document.createElement('span');
    el.setAttribute('type', 'termrow');
    el.setAttribute('srow', '0');
    target.appendChild(el);
    const chh = (this._view && this._view.chh) || 16;
    return this.renderRow(row, 0, chh, false, el);
  }

  setSingleChild(par, child) {
    while (par.childNodes.length > 0)
      par.removeChild(par.lastChild);
    par.appendChild(child);
  }

  updateProgress() {
    if (!this.content || !this.lastRowDiv) return;
    const cont = this.content;
    let percent = 100;
    if (cont.scrollHeight > cont.clientHeight) {
      const scrollBottom = cont.scrollTop + cont.clientHeight;
      percent = Math.min(100, Math.max(0, Math.round((scrollBottom / cont.scrollHeight) * 100)));
    }
    const site = this._termBuf?.site;
    if (site) {
      this.lastRowDiv.innerHTML = site.getEasyReadingPrompt(' ', percent);
    }
  }

  updateEasyReadingProgress() {
    this.updateProgress();
  }

  updateReplyRow(row) {
    if (!this.replyRowDiv) return;
    const el = document.createElement('span');
    el.style = "background-color:black;";
    this.renderSingleRow(el, row);
    this.setSingleChild(this.replyRowDiv.childNodes[0] || this.replyRowDiv, el);
    this.replyRowDiv.style.display = 'block';
  }

  updateEasyReadingReplyRow(row) {
    this.updateReplyRow(row);
  }

  updatePushInitRow(row) {
    if (!this.lastRowDiv) return;
    const el = document.createElement('span');
    el.style = "background-color:black;";
    this.renderSingleRow(el, row);
    this.setSingleChild(this.lastRowDiv.childNodes[0] || this.lastRowDiv, el);
    this.lastRowDiv.style.backgroundColor = 'black';
    this.lastRowDiv.style.display = 'block';
  }

  updateEasyReadingPushInitRow(row) {
    this.updatePushInitRow(row);
  }

  populatePage() {
    const site = this._termBuf?.site;
    if (!site) return;
    let lastRowNum = site.getLastRowNum(this._termBuf);
    if (this._termBuf.pageState == 3 && this._termBuf.prevPageState == 3) {
      this.show();
      const lastRowText = this._termBuf.getRowText(lastRowNum, 0, this._termBuf.cols);
      const result = site.parseReadingStatus(lastRowText, this._termBuf);
      if (result) {
        const isEnd = result.isEnd || site.isArticleEnd(lastRowText, this._termBuf, result);
        if (result.pageIndex && result.pageIndex === this._lastEasyReadingPageIndex && !isEnd) {
          return;
        }
        if (isEnd && this._easyReadingAppendedEnd) {
          return;
        }
        if (isEnd) {
          this._easyReadingAppendedEnd = true;
        }
        if (result.pageIndex) {
          this._lastEasyReadingPageIndex = result.pageIndex;
        }

        const paging = site.getPagingSlice(this._termBuf, result, this.actualRowIndex);
        let beginIndex = paging.beginIndex;
        const atLastPage = paging.atLastPage;

        for (let i = beginIndex; i < lastRowNum; ++i) {
          if (site.isLineContinuation(this._termBuf, i, false)) {
            this.pageWrappedLines[this.actualRowIndex] = (this.pageWrappedLines[this.actualRowIndex] || 0) + 1;
            // if the second row is the wrapped line from first row 
            if (!atLastPage && i == beginIndex) {
              beginIndex++;
            }
          } else {
            this.pageWrappedLines[++this.actualRowIndex] = 1;
          }
        }
        this.appendRows(this._termBuf.lines.slice(beginIndex, lastRowNum), true);
        // deep clone lines for selection (getRowText and get ansi color)
        this.pageLines = (this.pageLines || []).concat(JSON.parse(JSON.stringify(this._termBuf.lines.slice(beginIndex, lastRowNum))));
      }
      this._termBuf.prevPageState = 3;
    } else {
      this.actualRowIndex = 0;
      this.pageWrappedLines = [];
      this._lastEasyReadingPageIndex = 1;
      this._easyReadingAppendedEnd = false;
      if (this._termBuf.pageState == 3) {
        const lastRowText = this._termBuf.getRowText(lastRowNum, 0, this._termBuf.cols);
        const statusResult = site.parseReadingStatus(lastRowText, this._termBuf);
        const isEnd = site.isArticleEnd(lastRowText, this._termBuf, statusResult);
        for (let i = 0; i < lastRowNum; ++i) {
          if (site.isLineContinuation(this._termBuf, i, true)) {
            this.pageWrappedLines[this.actualRowIndex] = (this.pageWrappedLines[this.actualRowIndex] || 0) + 1;
          } else {
            this.pageWrappedLines[++this.actualRowIndex] = 1;
          }
        }
        this.clearRows();
        this.show();
        if (this.content) {
          this.content.scrollTop = 0;
        }
        this.appendRows(this._termBuf.lines.slice(0, lastRowNum), true);
        if (isEnd) {
          this._easyReadingAppendedEnd = true;
        }
        if (this.lastRowDiv) {
          this.lastRowDiv.style.backgroundColor = '';
          this.lastRowDiv.style.display = 'block';
        }
        this.updateProgress();
        if (this.replyRowDiv) {
          this.replyRowDiv.style.display = 'none';
        }
        // deep clone lines for selection (getRowText and get ansi color)
        this.pageLines = JSON.parse(JSON.stringify(this._termBuf.lines.slice(0, lastRowNum)));
      } else {
        this.hide();
      }
      this._termBuf.prevPageState = this._termBuf.pageState;
    }
  }

  populateEasyReadingPage() {
    this.populatePage();
  }

  updatePage(changedLineHtmlStrs) {
    if (this.enabled) {
      if (this.started && this.showReplyText) {
        this.updateReplyRow(changedLineHtmlStrs[changedLineHtmlStrs.length - 1]);
      } else if (this.started && this.showPushInitText) {
        this.updatePushInitRow(changedLineHtmlStrs[changedLineHtmlStrs.length - 1]);
      } else {
        this.populatePage();
      }
    } else if (this.isActive()) {
      this.hide();
    }
  }

  get _turnPageLines() {
    if (this._customTurnPageLines > 0) return this._customTurnPageLines;
    const cont = this.content;
    const chh = (this._view && this._view.chh) || 16;
    if (cont && chh) {
      let lines = Math.floor(cont.clientHeight / chh) - 1;
      if (lines > 0) return lines;
    }
    return Math.max(1, this._termBuf.rows - 2);
  }

  set _turnPageLines(val) {
    this._customTurnPageLines = val;
  }

  _onChanged(e) {
    console.debug("page state: " + this._termBuf.prevPageState + "->" + this._termBuf.pageState);
    const values = readValuesWithDefault()
    // make sure to come back to easy reading mode
    const isEnteringReading = (this._termBuf.prevPageState == 2 || this._termBuf.prevPageState == 0) &&
        this._termBuf.pageState == 3;
    if (isEnteringReading) {
      this._resetInFlight();
    }
    if (isEnteringReading &&
        !this.enabled && 
        values.enableEasyReading &&
        this._core.connectedUrl.easyReadingSupported)
    {
      this.enabled = true;
    } else if (!values.enableEasyReading) {
      this.enabled = false;
    }

    if (!this.enabled)
      return;

    const site = this._termBuf.site;
    let lastRowNum = site.getLastRowNum(this._termBuf);
    const lastRowText = this._termBuf.getRowText(lastRowNum, 0, this._termBuf.cols);
    // dealing with page state jump to 0 because last row wasn't updated fully 
    if (this._termBuf.pageState == 3) {
      this.started = true;
    } else if (this.started && site.isPushPrompt(this._termBuf)) {
      this.showPushInitText = true;
    } else {
      this.showReplyText = false;
      this.showPushInitText = false;
      this.started = false;
      this._resetInFlight();
    }
    if (this.started) {
      const isParked = this._termBuf.isFrameReady
        ? this._termBuf.isFrameReady()
        : site.isCursorParked(this._termBuf);

      if (isParked) {
        if (this.ignoreOneUpdate) {
          this.ignoreOneUpdate = false;
          return;
        }
        const result = site.parseReadingStatus(lastRowText, this._termBuf);
        if (result) {
          this.showPushInitText = false;
          this.showReplyText = false;
          const isEnd = site.isArticleEnd(lastRowText, this._termBuf, result);

          if (this._pageDownInFlight) {
            const pageAdvanced = (result.pageIndex != null && result.pageIndex !== this._lastRequestedPageIndex) ||
                                 (result.rowIndexStart != null && result.rowIndexStart !== this._lastRequestedRowIndexStart) ||
                                 isEnd;
            if (pageAdvanced) {
              this._pageDownInFlight = false;
              this._clearInFlightWatchdog();
              this._inFlightRetries = 0;
            }
          }

          if (isEnd) {
            this.easyReadingReachedPageEnd = true;
            this._resetInFlight();
          } else if (!this._pageDownInFlight) {
            this.easyReadingReachedPageEnd = false;
            if (!this.sendCommandAfterUpdate) {
              // send page down
              this.sendCommandAfterUpdate = '\x1b[6~';
              this._pageDownInFlight = true;
              this._lastRequestedPageIndex = result.pageIndex;
              this._lastRequestedRowIndexStart = result.rowIndexStart;
            }
          }
        } else if (site.isArticleEnd(lastRowText, this._termBuf, null)) {
          this.easyReadingReachedPageEnd = true;
          this._resetInFlight();
        } else if (!this.showPushInitText) { // only if not showing last row text
          this._termBuf.pageState = 5;
          this.started = false;
          this._resetInFlight();
        }
      } else if (site.isPushPrompt(this._termBuf)) {
        this.showPushInitText = true;
      } else if (site.isReplyPrompt(this._termBuf)) {
        this.showReplyText = true;
      } else {
        if (this._termBuf.cur_y === lastRowNum) {
          this.showPushInitText = false;
        } else if (this._termBuf.cur_y === lastRowNum - 1) {
          this.showReplyText = false;
        }
        // last line hasn't changed
        return;
      }
    }
  }

  _armInFlightWatchdog() {
    this._clearInFlightWatchdog();
    this._inFlightTimer = setTimeout(() => {
      this._onInFlightTimeout();
    }, INFLIGHT_WATCHDOG_MS);
  }

  _clearInFlightWatchdog() {
    if (this._inFlightTimer !== null) {
      clearTimeout(this._inFlightTimer);
      this._inFlightTimer = null;
    }
  }

  _resetInFlight() {
    this._pageDownInFlight = false;
    this._lastRequestedPageIndex = null;
    this._lastRequestedRowIndexStart = null;
    this._inFlightRetries = 0;
    this._clearInFlightWatchdog();
  }

  _onInFlightTimeout() {
    this._inFlightTimer = null;
    if (!this._pageDownInFlight || this.easyReadingReachedPageEnd || !this.started) {
      return;
    }
    if (this._inFlightRetries < MAX_INFLIGHT_RETRIES) {
      this._inFlightRetries++;
      console.warn(`[EasyReading] PageDown in-flight timeout, retrying (${this._inFlightRetries}/${MAX_INFLIGHT_RETRIES})`);
      this._send('\x1b[6~');
      this._armInFlightWatchdog();
    } else {
      console.warn('[EasyReading] PageDown in-flight max retries exceeded, resetting guard');
      this._resetInFlight();
    }
  }

  _onViewUpdated(e) {
    console.debug('view update');
    if (this.sendCommandAfterUpdate) {
      console.debug("send:" + this.sendCommandAfterUpdate);
      if (this.sendCommandAfterUpdate != 'skipOne') {
        this._send(this.sendCommandAfterUpdate);
        if (this._pageDownInFlight) {
          this._armInFlightWatchdog();
        }
      } else {
        this._resetInFlight();
      }
      this.sendCommandAfterUpdate = '';
    }
  }

  leaveCurrentPost() {
    console.debug('leave current post');
    this._resetInFlight();
    const now = Date.now();
    const duration = (this.lastWheelTime && (now - this.lastWheelTime < 1000)) ? 1200 : 300;
    this._core?.suppressInertialWheel?.(duration);
    if (!this.easyReadingReachedPageEnd) {
      this.ignoreOneUpdate = true;
    }
    this._termBuf.prevPageState = 0;
  }

  stopEasyReading() {
    console.debug('stop easy reading');
    this.sendCommandAfterUpdate = 'skipOne';
    this._resetInFlight();
    const now = Date.now();
    const duration = (this.lastWheelTime && (now - this.lastWheelTime < 1000)) ? 1200 : 300;
    this._core?.suppressInertialWheel?.(duration);
  }

  _send(data) {
    this._core?.send(data);
  }

  send(data) {
    this._send(data);
  }

  _onKeyDown(e) {
    if (!this.enabled || !this.started)
      return;

    this._onKeyDownProcessUI(e);
    if (e.defaultPrevented)
      return;

    const site = this._termBuf?.site;
    let stop = false;
    if (!e.ctrlKey && !e.altKey) {
      switch (e.key) {
        case 'Backspace':
        case 'ArrowUp':
          if (site?.navigatePrevPost?.(this))
            stop = true;
          break;
        case 'Enter':
        case 'ArrowDown':
          if (site?.navigateNextPost?.(this))
            stop = true;
          break;
      }
    } else if (e.ctrlKey && !e.altKey) {
      switch (e.key) {
        case 'h':
          if (site?.navigatePrevPost?.(this))
            stop = true;
          break;
      }
    }
    if (stop)
      e.preventDefault();
  }

  _scrollBy(lines) {
    const cont = this.content;
    if (!cont)
      return false;
    if (lines < 0 && cont.scrollTop <= 0)
      return false;
    if (lines > 0 && cont.scrollTop >= cont.scrollHeight - cont.clientHeight)
      return false;
    const chh = (this._view && this._view.chh) || 16;
    cont.scrollTop += chh * lines;
    return true;
  }

  _scrollEnd() {
    const cont = this.content;
    if (!cont)
      return false;
    cont.scrollTop = cont.scrollHeight;
    return true;
  }

  _scrollTop() {
    const cont = this.content;
    if (!cont)
      return false;
    cont.scrollTop = 0;
    return true;
  }

  _onKeyDownProcessUI(e) {
    const site = this._termBuf?.site;
    if (site?.handleEasyReadingKeyDown?.(this, e)) {
      e.preventDefault();
      return;
    }

    let stop = false;
    if (!e.ctrlKey && !e.altKey) {
      switch (e.key) {
        case 'Backspace':
          stop = this._scrollBy(-this._turnPageLines);
          if (!stop)
            this.leaveCurrentPost();
          break;
        case 'ArrowRight':
        case ' ':
        case 't':
          this._scrollBy(this._turnPageLines);
          stop = true;
          break;
        case 'PageUp':
          this._scrollBy(-this._turnPageLines);
          stop = true;
          break;
        case 'PageDown':
          this._scrollBy(this._turnPageLines);
          stop = true;
          break;
        case 'Escape':
          // Temporarily hide easy reading overlay to reveal the underlying terminal screen
          this.hide();
          stop = true;
          break;
        case 'ArrowLeft':
          this.stopEasyReading();
          this.hide();
          break;
        case 'ArrowUp':
          stop = this._scrollBy(-1);
          if (!stop)
            this.leaveCurrentPost();
          break;
        case 'Enter':
        case 'ArrowDown':
          stop = this._scrollBy(1);
          if (!stop) {
            if (!this.easyReadingReachedPageEnd) {
              stop = true;
            } else {
              this.leaveCurrentPost();
            }
          }
          break;
        case 'k':
          stop = this._scrollBy(-1);
          stop = true;
          break;
        case 'j':
          stop = this._scrollBy(1);
          stop = true;
          break;
        case 'Home':
        case '0':
        case 'g':
          this._scrollTop();
          stop = true;
          break;
        case 'End':
        case '$':
        case 'G':
          this._scrollEnd();
          stop = true;
          break;
        case 'Tab':
          stop = true;
          break;
      }
    } else if (e.ctrlKey && !e.altKey) {
      switch (e.key) {
        case 'f':
          this._scrollBy(this._turnPageLines);
          stop = true;
          break;
        case 'b':
          this._scrollBy(-this._turnPageLines);
          stop = true;
          break;
        case 'h':
          stop = this._scrollBy(-this._turnPageLines);
          if (!stop)
            this.leaveCurrentPost();
          break;
      }
    }
    if (stop)
      e.preventDefault();
  }

  _onMouseClick(e) {
    if (!this.enabled || !this.started)
      return;
    let stop = false;
    // XXX Should not use term buffer to track mouse cursor.
    switch (this._termBuf.mouseCursor) {
      case 0:
      case 1: // Arrow Left
        this.stopEasyReading();
        this.hide();
        break;
      case 2: // Page Up
        this._scrollBy(-this._turnPageLines);
        stop = true;
        break;
      case 3: // Page Down
        this._scrollBy(this._turnPageLines);
        stop = true;
        break;
      case 4: // Home
        this._scrollTop();
        stop = true;
        break;
      case 5: // End
        this._scrollEnd();
        stop = true;
        break;
      case 6:
      case 7:
        break;
      case 8: // [
      case 9: // ]
      case 10: // =
      case 12: // Refresh post / pushed texts
      case 13: // Last post with the same title (LIST)
      case 14: // Last post with the same title (READING)
        this.leaveCurrentPost();
        break;
      default: // Do nothing
        break;
    }
    if (stop)
      e.preventDefault();
  }

  // --- Input Interceptor Interface ---

  handleNavCmd(cmd) {
    if (!this.isActive()) return false;
    switch (cmd) {
      case "doArrowUp":
        if (!this._scrollBy(-1)) {
          this.leaveCurrentPost();
          this._send('\x1b[D\x1b[A\x1b[C');
        }
        return true;
      case "doArrowDown":
        if (!this._scrollBy(1)) {
          this.leaveCurrentPost();
          this._send('\x1b[B');
        }
        return true;
      case "doPageUp":
        this._scrollBy(-this._turnPageLines);
        return true;
      case "doPageDown":
        this._scrollBy(this._turnPageLines);
        return true;
      case "previousThread": {
        const tCmd = this._core?.site?.getThreadCommand?.("prevThread");
        if (tCmd) {
          this.leaveCurrentPost();
          this._send(tCmd);
        }
        return true;
      }
      case "nextThread": {
        const tCmd = this._core?.site?.getThreadCommand?.("nextThread");
        if (tCmd) {
          this.leaveCurrentPost();
          this._send(tCmd);
        }
        return true;
      }
      case "doEnter":
        if (!this._scrollBy(1)) {
          this.leaveCurrentPost();
          this._send('\r');
        }
        return true;
      case "doRight":
        if (!this._scrollBy(this._turnPageLines)) {
          this.leaveCurrentPost();
          this._send('\x1b[C');
        }
        return true;
      default:
        return false;
    }
  }

  handleWheel(e) {
    const now = Date.now();
    if (this.isActive()) {
      this.lastWheelTime = now;
      return true;
    }
    const isOverlayTarget = !!(this.overlay && e?.target &&
      (e.target === this.overlay || this.overlay.contains(e.target)));
    const recentlyScrolled = this.lastWheelTime && (now - this.lastWheelTime < 1000);
    const recentlyExited = this.lastHideTime && (now - this.lastHideTime < 600);
    if (isOverlayTarget || recentlyScrolled || recentlyExited) {
      return 'suppress';
    }
    return false;
  }

  handleMouseClick(e) {
    this._onMouseClick(e);
    return !!e.defaultPrevented;
  }

  handleKeyDown(e) {
    if (!this.isActive() || this.isPromptActive())
      return false;
    this._keyDownKeyCode = e.keyCode;
    this._keyDownIsComposing = !!(e.isComposing || e.key === 'Process' || e.keyCode === 229);
    this._onKeyDown(e);
    return !!e.defaultPrevented;
  }

  handleTextInput(e) {
    if (!this.isActive() || this.isPromptActive())
      return false;
    if ((this._keyDownIsComposing || this._keyDownKeyCode === 229) && e?.target && e.target.value !== 'X') {
      e.target.value = '';
      return true;
    }
    return false;
  }

  getSelectedText() {
    if (!this.isActive())
      return undefined;
    if (typeof window !== 'undefined' && window.getSelection && !window.getSelection().isCollapsed) {
      return window.getSelection().toString().replace(/\u00a0/g, " ");
    }
    return '';
  }

  getSelectionColRow() {
    if (!this.isActive())
      return undefined;
    return null;
  }

  selectAll() {
    if (!this.isActive())
      return false;
    if (typeof window !== 'undefined' && window.getSelection && this.content) {
      window.getSelection().selectAllChildren(this.content);
      return true;
    }
    return false;
  }

  // --- Plugin Update Hooks ---

  onScreenUpdate(changedLineHtmlStrs) {
    if (this.enabled) {
      this.updatePage(changedLineHtmlStrs);
      return true;
    } else if (this.isActive()) {
      this.hide();
      return true;
    }
    return false;
  }

  onFontUpdate({ fontFace, fontSize } = {}) {
    if (this.overlay) {
      if (fontFace) this.overlay.style.setProperty('--font-face', fontFace);
      if (fontSize) {
        this.overlay.style.fontSize = fontSize;
        this.overlay.style.lineHeight = fontSize;
      }
    }
  }
}

export { EasyReading as EasyReadingPlugin };

