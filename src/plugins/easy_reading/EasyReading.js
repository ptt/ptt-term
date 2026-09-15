import { PluginBase } from '../PluginBase.js';
import { _ } from '../../js/i18n.js';
import { PAGE_STATE } from '../../js/sites/index.js';
import {
  isDiscreteMouseWheelEvent,
  isHorizontalWheelEvent,
} from '../../js/mouse_controller.js';
import { getAsciiLetterSpacingEm, wrapAsciiHtml } from '../../js/font_util.js';

export const INFLIGHT_WATCHDOG_MS = 1500;
export const MAX_INFLIGHT_RETRIES = 2;

export class EasyReading extends PluginBase {
  static id = 'easy_reading';
  static name = 'easy_reading';
  static prefKey = 'enableEasyReading';
  static group = 'bbs';
  static icon = 'book';
  static defaultPrefs = {
    enableEasyReading: false,
  };

  static get title() {
    return _('plugin_easy_reading_title');
  }

  static get description() {
    return _('plugin_easy_reading_desc');
  }

  get site() {
    return this.app?.site;
  }

  constructor(app, options = {}) {
    super(app, options);

    this._uiInitialized = false;

    this.started = false;
    this.showReplyText = false;
    this.showPushInitText = false;
    this.pageLines = [];
    this.pageWrappedLines = [];

    this.lastWheelTime = 0;
    this.lastHideTime = 0;
    this.suppressWheelUntil = 0;
    this.suppressWheelStartedAt = 0;
    this.lastWheelEventTime = 0;
    this._keyDownKeyCode = 0;
    this._keyDownIsComposing = false;

    this._overlay = null;
    this._content = null;
    this._footer = null;
    this._lastRowDiv = null;
    this._replyRowDiv = null;
    this.lastRowDivContent = '';
    this.replyRowDivContent = '';
    this._temporarilyHidden = false;

    this.actualRowIndex = 0;
    this._lastEasyReadingPageIndex = null;
    this._easyReadingAppendedEnd = false;

    this._customTurnPageLines = 0;

    this.easyReadingReachedPageEnd = false;
    this.sendCommandAfterUpdate = '';
    this.ignoreOneUpdate = false;
    this._reenteringArticle = false;
    this._pageDownInFlight = false;
    this._lastRequestedPageIndex = null;
    this._lastRequestedRowIndexStart = null;
    this._inFlightTimer = null;
    this._inFlightRetries = 0;
    this._changeHandled = false;
    this._needsRefreshAfterPushOrReply = false;
    this._lastPageBeginIndex = 0;
    this._lastPageRowCount = 0;
    this._articleEnterTime = 0;
    this._lastWheelGestureTime = 0;
    this._lastWheelDirection = null;
    this._gestureHasScrolled = false;
    this._gestureBlockedAtBoundary = false;
    this._boundaryDeltaAccum = 0;

    this._onBufChanged = (e) => {
      if (this._changeHandled) {
        this._changeHandled = false;
        return;
      }
      const wasReentering = this._reenteringArticle;
      this._onChanged(e);
      if (wasReentering && !this._reenteringArticle && this.enabled) {
        this.updatePage();
      }
    };
    this._onBufViewUpdated = (e) => this._onViewUpdated(e);
    this._onBufCursorMove = () => this._onCursorMove();
  }

  onInit() {
    this.registerInputInterceptor(this);
    this.listenApp('term:easy-reading:switch', (e) => {
      const doSwitch = e?.doSwitch !== undefined ? e.doSwitch : e?.detail?.doSwitch;
      if (Boolean(doSwitch) !== this.enabled) {
        this._handlingSwitchEvent = true;
        try {
          this.setEnabled(Boolean(doSwitch), false);
        } finally {
          this._handlingSwitchEvent = false;
        }
      }
    });
    this.listenAppWhileEnabled('term:screen-update', (e) => {
      const changedLineHtmlStrs = e?.changedLineHtmlStrs !== undefined ? e.changedLineHtmlStrs : e?.detail?.changedLineHtmlStrs;
      const force = Boolean(e?.force ?? e?.detail?.force);
      this.onScreenUpdate(changedLineHtmlStrs, force);
    });
    this.listenAppWhileEnabled('term:font-update', (e) => {
      this.onFontUpdate(e?.detail || e);
    });

    this._onBufResize = () => {
      this._updateOverlayPadding();
    };
    const buf = this.buf || this.app?.buf;
    if (buf) {
      this.buf = buf;
      this.listenWhileEnabled(buf, 'change', this._onBufChanged);
      this.listenWhileEnabled(buf, 'viewUpdate', this._onBufViewUpdated);
      this.listenWhileEnabled(buf, 'cursor-move', this._onBufCursorMove);
      this.listenWhileEnabled(buf, 'resize', this._onBufResize);
    }
    if (typeof window !== 'undefined') {
      this.listenWhileEnabled(window, 'resize', this._onBufResize);
    }

    if (this.enabled && typeof document !== 'undefined' && !this._uiInitialized) {
      const container = this.view?.termWin || document.getElementById('TermWindow');
      if (container) {
        this._initUI(container);
      }
    }
  }

  _enterEasyReadingIfReading() {
    this.leaveCurrentPost();
    this.clearRows();
    this.ignoreOneUpdate = false;
    this.sendCommandAfterUpdate = '';
    if (!this._initializing && this.site?.pageState === PAGE_STATE.READING && this.app?.send) {
      const cmd = this.site.getReenterArticleCommand?.(this.buf);
      if (cmd) {
        this._reenteringArticle = true;
        this.app.send(cmd);
      }
    }
  }

  onEnable() {
    this.ignoreOneUpdate = false;
    this._changeHandled = false;
    if (typeof document !== 'undefined' && !this._uiInitialized) {
      const container = this.view?.termWin || document.getElementById('TermWindow');
      if (container) {
        this._initUI(container);
      }
    }
    if (this._overlay && this.view) {
      this.onFontUpdate({
        fontFace: this.view.fontFace,
        fontSize: this.view.mainDisplay?.style?.fontSize,
        lineHeight: this.view.mainDisplay?.style?.lineHeight,
        asciiLetterSpacing: this.view.asciiLetterSpacing,
      });
    }
    if (!this._initializing) {
      if (!this._handlingSwitchEvent) {
        this.app?.emit?.('term:easy-reading:switch', {
          doSwitch: true,
          detail: { doSwitch: true },
        });
      }
      this._enterEasyReadingIfReading();
    }
  }

  onDisable() {
    if (!this._initializing && !this._handlingSwitchEvent) {
      this.app?.emit?.('term:easy-reading:switch', {
        doSwitch: false,
        detail: { doSwitch: false },
      });
    }
    this.leaveCurrentPost();
    this.ignoreOneUpdate = false;
    this.sendCommandAfterUpdate = '';
    this._reenteringArticle = false;
    this._changeHandled = false;
    this._resetInFlight();
    this.hide();
  }

  onDestroy() {
    this.hide();
    this._resetInFlight();
    if (this._overlay && this._overlay.parentNode) {
      this._overlay.parentNode.removeChild(this._overlay);
    }
    this._overlay = null;
    this._content = null;
    this._footer = null;
    this._lastRowDiv = null;
    this._replyRowDiv = null;
    this._uiInitialized = false;
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
    return this._overlay;
  }

  get content() {
    return this._content;
  }

  get footer() {
    return this._footer;
  }

  get lastRowDiv() {
    return this._lastRowDiv;
  }

  get replyRowDiv() {
    return this._replyRowDiv;
  }

  initUI(container) {
    this._initUI(container);
  }

  _updateOverlayPadding() {
    if (!this._overlay || !this.view) return;
    const termWinHeight =
      this.view.innerBounds?.height || this._overlay.clientHeight || 0;
    const termWinWidth =
      this.view.innerBounds?.width || this._overlay.clientWidth || 0;
    const cols = this.buf?.cols || 80;
    const rows = this.buf?.rows || 24;
    this._overlay.style?.setProperty?.('--term-cols', `${cols}`);
    this._overlay.style?.setProperty?.('--term-rows', `${rows}`);
    const baseChw = this.view.chw || 13;
    const baseFontSize = this.view.fontSizePx || baseChw * 2;
    const baseChh = this.view.chh || baseFontSize;

    let effectiveChw = baseChw;
    if (this.view.scaleX && this.view.scaleX < 1) {
      effectiveChw = baseChw * this.view.scaleX;
    } else if (termWinWidth > 16 && termWinWidth < baseChw * cols + 16) {
      effectiveChw = (termWinWidth - 16) / cols;
    }

    let effectiveChh = baseChh;
    if (effectiveChw < baseChw) {
      const ratio = effectiveChw / baseChw;
      effectiveChh = Math.round(baseChh * ratio);
      const effFontSize = `${(baseFontSize * ratio).toFixed(2)}px`;
      const effLineHeight = `${effectiveChh}px`;
      this._overlay.style?.setProperty?.('--term-chw', `${effectiveChw.toFixed(2)}px`);
      this._overlay.style?.setProperty?.('--term-chh', effLineHeight);
      this._overlay.style.fontSize = effFontSize;
      this._overlay.style.lineHeight = effLineHeight;
    } else {
      this._overlay.style?.setProperty?.('--term-chw', `${baseChw}px`);
      this._overlay.style?.setProperty?.('--term-chh', `${baseChh}px`);
    }

    const rowsHeight = effectiveChh * rows;
    const padTop = Math.max(0, Math.floor((termWinHeight - rowsHeight) / 2));
    this._overlay.style?.setProperty?.('--easy-reading-pad-top', `${padTop}px`);
  }

  _initUI(container) {
    if (this._overlay && this._overlay.parentNode) return;
    if (!container && typeof document !== 'undefined') {
      container = this.view?.termWin || document.getElementById('TermWindow');
    }
    if (!container || typeof document === 'undefined') return;

    if (this._overlay) {
      if (this._onOverlayMouseDown) this.unlisten(this._overlay, 'mousedown', this._onOverlayMouseDown);
      if (this._onOverlayWheel) this.unlisten(this._overlay, 'wheel', this._onOverlayWheel);
    }
    if (this._content && this._onContentScroll) {
      this.unlisten(this._content, 'scroll', this._onContentScroll);
    }
    if (this._content && this._onContentLoad) {
      this.unlisten(this._content, 'load', this._onContentLoad);
    }

    const existing =
      container.querySelector?.('#easyReadingOverlay') ||
      (typeof document !== 'undefined' ? document.getElementById('easyReadingOverlay') : null);
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }

    const easyReadingOverlay = document.createElement('div');
    easyReadingOverlay.setAttribute('id', 'easyReadingOverlay');
    easyReadingOverlay.style.display = 'none';
    this._onOverlayMouseDown = (e) => {
      const cmdEl = e.target?.closest?.('[data-er-cmd]');
      if (cmdEl) {
        const cmd = cmdEl.getAttribute('data-er-cmd');
        const leaveToTermCmds = this.site?.getLeaveToTerminalCommands?.() || [];
        if (leaveToTermCmds.includes(cmd)) {
          this.leaveToTerminal();
          this.send(cmd);
        } else if (cmd === 'Escape') {
          this.leaveToTerminal();
        } else if (cmd === 'q') {
          this.stopEasyReading();
          this.leaveCurrentPost();
          this.send('\x1b[D');
        }
        e.preventDefault();
        e.stopPropagation();
        if (this.app?.setInputAreaFocus) {
          this.app.setInputAreaFocus();
        }
        return;
      }
      if (e.target && e.target.tagName !== 'A' && this.app?.setInputAreaFocus) {
        this.app.setInputAreaFocus();
      }
    };
    this.listenWhileEnabled(easyReadingOverlay, 'mousedown', this._onOverlayMouseDown);
    this._onOverlayWheel = (e) => {
      const cont = this.content;
      if (cont && e.target !== cont && !cont.contains(e.target)) {
        cont.scrollTop += e.deltaY;
      }
    };
    this.listenWhileEnabled(easyReadingOverlay, 'wheel', this._onOverlayWheel, { passive: true });
    container.appendChild(easyReadingOverlay);
    this._overlay = easyReadingOverlay;

    const easyReadingContent = document.createElement('div');
    easyReadingContent.setAttribute('id', 'easyReadingContent');
    easyReadingOverlay.appendChild(easyReadingContent);
    this._content = easyReadingContent;
    this._onContentScroll = () => {
      this.updateProgress();
    };
    this.listenWhileEnabled(easyReadingContent, 'scroll', this._onContentScroll);
    this._onContentLoad = (e) => {
      if (e?.target?.tagName === 'IMG') {
        this.updateProgress();
      }
    };
    this.listenWhileEnabled(easyReadingContent, 'load', this._onContentLoad, { capture: true });

    const easyReadingFooter = document.createElement('div');
    easyReadingFooter.setAttribute('id', 'easyReadingFooter');
    easyReadingOverlay.appendChild(easyReadingFooter);
    this._footer = easyReadingFooter;

    const lastRowDiv = document.createElement('div');
    lastRowDiv.setAttribute('id', 'easyReadingLastRow');
    const spaces = ' ';
    this.lastRowDivContent = wrapAsciiHtml('<span align="left"><span class="q0 b7">' + spaces + '瀏覽 </span><span class="q1 b7">(100%)</span><span class="q1 b7"> [好讀模式]</span><span class="q0 b7"> 滾輪/上下鍵捲動，</span><span class="q1 b7">(Esc)</span><span class="q0 b7">回到終端機 </span><span class="q1 b7">(←/q)</span><span class="q0 b7">離開</span></span>');
    lastRowDiv.innerHTML = this.lastRowDivContent;
    this._lastRowDiv = lastRowDiv;
    easyReadingFooter.appendChild(lastRowDiv);

    const replyRowDiv = document.createElement('div');
    replyRowDiv.setAttribute('id', 'easyReadingReplyRow');
    this.replyRowDivContent = '<span align="left"></span>';
    replyRowDiv.innerHTML = this.replyRowDivContent;
    this._replyRowDiv = replyRowDiv;
    easyReadingFooter.appendChild(replyRowDiv);

    this.onFontUpdate({
      fontFace: this.view?.fontFace,
      fontSize: this.view?.mainDisplay?.style?.fontSize,
      lineHeight: this.view?.mainDisplay?.style?.lineHeight,
      asciiLetterSpacing: this.view?.asciiLetterSpacing,
    });
    this._uiInitialized = true;
  }

  isActive() {
    return !!(this.overlay && this.overlay.style.display !== 'none');
  }

  _cancelPendingHide() {
    if (this._deferredHideRaf) {
      if (
        typeof window !== 'undefined' &&
        typeof window.cancelAnimationFrame === 'function'
      ) {
        window.cancelAnimationFrame(this._deferredHideRaf);
      } else {
        this.clearTimeout(this._deferredHideRaf);
      }
      this._deferredHideRaf = null;
    }
    if (this._exitFallbackTimer) {
      this.clearTimeout(this._exitFallbackTimer);
      this._exitFallbackTimer = null;
    }
  }

  scheduleHide() {
    if (!this.isActive()) return;
    if (
      typeof window === 'undefined' ||
      typeof window.requestAnimationFrame !== 'function'
    ) {
      this.hide();
      return;
    }
    if (this._deferredHideRaf) return;
    this._deferredHideRaf = window.requestAnimationFrame(() => {
      this._deferredHideRaf = window.requestAnimationFrame(() => {
        this._deferredHideRaf = null;
        if (this.site?.pageState !== PAGE_STATE.READING) {
          this.hide();
        }
      });
    });
  }

  show() {
    this._cancelPendingHide();
    if (!this._overlay && typeof document !== 'undefined') {
      const container = this.view?.termWin || document.getElementById('TermWindow');
      if (container) {
        this._initUI(container);
        this._uiInitialized = true;
      }
    }
    this._temporarilyHidden = false;
    if (this.overlay && this.view) {
      this.onFontUpdate({
        fontFace: this.view.fontFace,
        fontSize: this.view.mainDisplay?.style?.fontSize,
        lineHeight: this.view.mainDisplay?.style?.lineHeight,
        asciiLetterSpacing: this.view.asciiLetterSpacing,
      });
    } else {
      this._updateOverlayPadding();
    }
    if (this.overlay) {
      this.overlay.style.display = 'block';
    }
    this.lastWheelTime = 0;
    this.lastHideTime = 0;
    this.view?.updateCursorPos?.();
  }

  hide() {
    this._cancelPendingHide();
    this._resetInFlight();
    this._temporarilyHidden = false;
    if (this.overlay) {
      this.overlay.style.display = 'none';
    }
    this.lastHideTime = Date.now();
    this.suppressInertialWheel(600);
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
    this.view?.updateCursorPos?.();
  }

  leaveToTerminal() {
    this._cancelPendingHide();
    this._resetInFlight();
    this.sendCommandAfterUpdate = '';
    this._temporarilyHidden = true;
    this._needsRefreshAfterPushOrReply = true;
    this.showReplyText = false;
    this.showPushInitText = false;
    if (this.overlay) {
      this.overlay.style.display = 'none';
    }
    if (this.lastRowDiv) {
      this.lastRowDiv.style.display = 'none';
    }
    if (this.replyRowDiv) {
      this.replyRowDiv.style.display = 'none';
    }
    this.view?.updateCursorPos?.();
  }

  clearRows() {
    if (this.content) {
      this.content.innerHTML = '';
    }
    this.pageLines = [];
    this.pageWrappedLines = [];
  }

  setRowRenderer(fn) {
    this._rowRenderer = fn;
  }

  renderRow(line, row, chh, showsLinkPreview, el) {
    if (this._rowRenderer) {
      return this._rowRenderer(line, row, chh, showsLinkPreview, el);
    }
    return this.view?.renderRow?.(line, row, chh, showsLinkPreview, el) ?? null;
  }

  appendRows(lines, showsLinkPreview) {
    if (!this.content) return;
    const forceWidth =
      this.view?.fontSizePx ||
      (this.view?.chw ? this.view.chw * 2 : this.view?.chh || 16);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const rowIdx = this.content.childNodes.length;
      const el = document.createElement('span');
      el.setAttribute('type', 'termrow');
      el.setAttribute('srow', String(rowIdx));
      this.content.appendChild(el);
      this.renderRow(
        line,
        rowIdx,
        forceWidth,
        showsLinkPreview,
        el
      );
    }
    this.updateProgress();
  }

  renderSingleRow(target, row) {
    if (this.view?.renderSingleRow) {
      return this.view.renderSingleRow(target, row);
    }
    const el = document.createElement('span');
    el.setAttribute('type', 'termrow');
    el.setAttribute('srow', '0');
    target.appendChild(el);
    const forceWidth =
      this.view?.fontSizePx ||
      (this.view?.chw ? this.view.chw * 2 : this.view?.chh || 16);
    return this.renderRow(row, 0, forceWidth, false, el);
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
    const site = this.site;
    if (site) {
      this.lastRowDiv.innerHTML = site.getEasyReadingPrompt(' ', percent);
    }
  }

  updateReplyRow(row) {
    if (!this.replyRowDiv) return;
    const el = document.createElement('span');
    el.style = "background-color:black;";
    this.renderSingleRow(el, row);
    this.setSingleChild(this.replyRowDiv.childNodes[0] || this.replyRowDiv, el);
    this.replyRowDiv.style.display = 'block';
    this.view?.updateCursorPos?.();
  }

  updatePushInitRow(row) {
    if (!this.lastRowDiv) return;
    const el = document.createElement('span');
    el.style = "background-color:var(--term-bg, var(--term-color-0, black));";
    this.renderSingleRow(el, row);
    this.setSingleChild(this.lastRowDiv.childNodes[0] || this.lastRowDiv, el);
    this.lastRowDiv.style.backgroundColor = 'var(--term-bg, var(--term-color-0, black))';
    this.lastRowDiv.style.display = 'block';
    this.view?.updateCursorPos?.();
  }

  _restoreReadingFooter() {
    if (this.replyRowDiv) {
      this.replyRowDiv.style.display = 'none';
    }
    if (this.lastRowDiv) {
      this.lastRowDiv.style.backgroundColor = '';
      this.lastRowDiv.style.display = 'block';
    }
    this.updateProgress();
    this.view?.updateCursorPos?.();
  }

  populatePage() {
    const site = this.site;
    if (!site) return;
    const isPreviewEnabled =
      typeof this.view?.isHyperlinkPreviewEnabled === 'function'
        ? this.view.isHyperlinkPreviewEnabled()
        : this.view?.enableLinkHoverPreview !== false && this.view?.resolveHyperlinkPreview;
    const showsLinkPreview = isPreviewEnabled
      ? (href, key) => {
          if (typeof this.view.renderInlineHyperlinkPreview === 'function') {
            return this.view.renderInlineHyperlinkPreview(href, key);
          }
          if (typeof this.view.resolveInlineHyperlinkPreview === 'function') {
            return this.view.resolveInlineHyperlinkPreview(href, key);
          }
          return this.view.resolveHyperlinkPreview(href);
        }
      : false;
    let lastRowNum = site.getLastRowNum(this.buf);
    if (site.pageState === PAGE_STATE.READING && this._temporarilyHidden) {
      site.prevPageState = PAGE_STATE.READING;
      return;
    }
    if (site.pageState === PAGE_STATE.READING && !this.started) {
      return;
    }
    const isFrameReady =
      typeof this.buf?.isFrameReady === 'function'
        ? this.buf.isFrameReady()
        : this.buf?.cur_x !== undefined && typeof site.isCursorParked === 'function'
          ? site.isCursorParked(this.buf)
          : true;
    if (site.pageState === PAGE_STATE.READING && !isFrameReady) {
      return;
    }
    if (site.pageState === PAGE_STATE.READING && site.prevPageState === PAGE_STATE.READING) {
      this.show();
      const lastRowText = this.buf.getRowText(lastRowNum, 0, this.buf.cols);
      const result = site.parseReadingStatus(lastRowText, this.buf);
      if (result) {
        const isEnd = result.isEnd || site.isArticleEnd(lastRowText, this.buf, result);
        if (this._needsRefreshAfterPushOrReply) {
          this._needsRefreshAfterPushOrReply = false;
          if (result.pageIndex === 1 && this._lastEasyReadingPageIndex === 1) {
            this.clearRows();
            this.appendRows(this.buf.lines.slice(0, lastRowNum), showsLinkPreview);
            this.pageLines = JSON.parse(JSON.stringify(this.buf.lines.slice(0, lastRowNum)));
            this._lastPageBeginIndex = 0;
            this._lastPageRowCount = lastRowNum;
            if (isEnd) {
              this._easyReadingAppendedEnd = true;
            }
            this._restoreReadingFooter();
            return;
          }
          const overlap = site.findContentOverlap(this.buf, lastRowNum, this.pageLines);
          if (overlap === 0 && this._lastPageRowCount > 0 && this.content) {
            for (let r = 0; r < this._lastPageRowCount && this.content.lastChild; r++) {
              this.content.removeChild(this.content.lastChild);
            }
            if (this.pageLines && this.pageLines.length >= this._lastPageRowCount) {
              this.pageLines.splice(this.pageLines.length - this._lastPageRowCount, this._lastPageRowCount);
            }
            const beginIndex = this._lastPageBeginIndex || 0;
            this.appendRows(this.buf.lines.slice(beginIndex, lastRowNum), showsLinkPreview);
            this.pageLines = (this.pageLines || []).concat(
              JSON.parse(JSON.stringify(this.buf.lines.slice(beginIndex, lastRowNum)))
            );
            this._lastPageRowCount = lastRowNum - beginIndex;
            if (isEnd) {
              this._easyReadingAppendedEnd = true;
            }
            this._restoreReadingFooter();
            return;
          }
        }
        if (result.pageIndex && result.pageIndex === this._lastEasyReadingPageIndex && !isEnd) {
          this._restoreReadingFooter();
          return;
        }
        if (isEnd && this._easyReadingAppendedEnd) {
          this._restoreReadingFooter();
          return;
        }
        if (isEnd) {
          this._easyReadingAppendedEnd = true;
        }
        if (result.pageIndex) {
          this._lastEasyReadingPageIndex = result.pageIndex;
        }

        const wrappedCount = this.pageWrappedLines[this.actualRowIndex] || 0;
        const paging = site.getPagingSlice(
          this.buf,
          result,
          this.actualRowIndex,
          this.pageLines,
          wrappedCount
        );
        let beginIndex = paging.beginIndex;
        const atLastPage = paging.atLastPage;

        for (let i = beginIndex; i < lastRowNum; ++i) {
          if (site.isLineContinuation(this.buf, i, false)) {
            this.pageWrappedLines[this.actualRowIndex] = (this.pageWrappedLines[this.actualRowIndex] || 0) + 1;
            // if the second row is the wrapped line from first row 
            if (!atLastPage && i == beginIndex) {
              beginIndex++;
            }
          } else {
            this.pageWrappedLines[++this.actualRowIndex] = 1;
          }
        }
        if (beginIndex < lastRowNum) {
          this.appendRows(this.buf.lines.slice(beginIndex, lastRowNum), showsLinkPreview);
          // deep clone lines for selection (getRowText and get ansi color)
          this.pageLines = (this.pageLines || []).concat(
            JSON.parse(JSON.stringify(this.buf.lines.slice(beginIndex, lastRowNum)))
          );
          this._lastPageBeginIndex = beginIndex;
          this._lastPageRowCount = lastRowNum - beginIndex;
        }
        this._restoreReadingFooter();
      }
      site.prevPageState = PAGE_STATE.READING;
    } else {
      this.actualRowIndex = 0;
      this.pageWrappedLines = [];
      this._lastEasyReadingPageIndex = 1;
      this._easyReadingAppendedEnd = false;
      this._temporarilyHidden = false;
      this._needsRefreshAfterPushOrReply = false;
      this._articleEnterTime = Date.now();
      this._gestureHasScrolled = false;
      this._gestureBlockedAtBoundary = false;
      this._boundaryDeltaAccum = 0;
      if (site.pageState === PAGE_STATE.READING) {
        const lastRowText = this.buf.getRowText(lastRowNum, 0, this.buf.cols);
        const statusResult = site.parseReadingStatus(lastRowText, this.buf);
        const isEnd = site.isArticleEnd(lastRowText, this.buf, statusResult);
        for (let i = 0; i < lastRowNum; ++i) {
          if (site.isLineContinuation(this.buf, i, true)) {
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
        this.appendRows(this.buf.lines.slice(0, lastRowNum), showsLinkPreview);
        this._lastPageBeginIndex = 0;
        this._lastPageRowCount = lastRowNum;
        if (isEnd) {
          this._easyReadingAppendedEnd = true;
        }
        this._restoreReadingFooter();
        // deep clone lines for selection (getRowText and get ansi color)
        this.pageLines = JSON.parse(JSON.stringify(this.buf.lines.slice(0, lastRowNum)));
      } else if (site.pageState === PAGE_STATE.LIST || site.pageState === PAGE_STATE.MENU) {
        this.scheduleHide();
      } else {
        this.hide();
      }
      site.prevPageState = site.pageState;
    }
  }

  updatePage(changedLineHtmlStrs) {
    if (this.enabled) {
      this.populatePage();
    } else if (this.isActive()) {
      this.hide();
    }
  }

  get _turnPageLines() {
    if (this._customTurnPageLines > 0) return this._customTurnPageLines;
    const cont = this.content;
    const chh = this.view?.chh || 16;
    if (cont && chh) {
      let lines = Math.floor(cont.clientHeight / chh) - 1;
      if (lines > 0) return lines;
    }
    return Math.max(1, (this.buf?.rows || 24) - 2);
  }

  set _turnPageLines(val) {
    this._customTurnPageLines = val;
  }

  _onCursorMove() {
    if (!this.enabled || !this.started || this._temporarilyHidden || !this.site || !this.buf) return;
    if (this.buf.inSyncUpdate) return;
    if (this.site.isReplyPrompt(this.buf) || this.site.isPushPrompt(this.buf)) {
      this.leaveToTerminal();
    }
  }

  _onChanged(e) {
    const liveUpdate = this.app?.getPlugin?.('live_update');
    if (liveUpdate?.active) {
      if (!this._temporarilyHidden) {
        this.leaveToTerminal();
      }
      return;
    }
    const site = this.site;
    if (this._reenteringArticle && site?.pageState === PAGE_STATE.READING) {
      this._reenteringArticle = false;
      site.prevPageState = PAGE_STATE.NORMAL;
    }
    console.debug("page state: " + site?.prevPageState + "->" + site?.pageState);
    const isEnteringReading =
      site?.prevPageState !== PAGE_STATE.READING &&
      site?.pageState === PAGE_STATE.READING;
    if (isEnteringReading) {
      this._resetInFlight();
      this._temporarilyHidden = false;
    }

    if (
      !this.enabled ||
      !site ||
      !this.buf ||
      typeof this.buf.getRowText !== 'function' ||
      site.easyReadingSupported === false ||
      this.app?.connectedUrl?.easyReadingSupported === false
    )
      return;

    if (this.buf?.inSyncUpdate) {
      return;
    }

    let lastRowNum = site.getLastRowNum(this.buf);
    const lastRowText = this.buf.getRowText(lastRowNum, 0, this.buf.cols);
    if (site.pageState === PAGE_STATE.READING) {
      this.started = true;
    } else {
      this.showReplyText = false;
      this.showPushInitText = false;
      this.started = false;
      this._temporarilyHidden = false;
      this.ignoreOneUpdate = false;
      this.sendCommandAfterUpdate = '';
      this._resetInFlight();
    }

    if (this.started) {
      if (
        !this._temporarilyHidden &&
        (site.isReplyPrompt(this.buf) || site.isPushPrompt(this.buf))
      ) {
        this.leaveToTerminal();
        return;
      }
      if (this._temporarilyHidden) {
        this._resetInFlight();
        this.sendCommandAfterUpdate = '';
        return;
      }

      const isParked = this.buf.isFrameReady
        ? this.buf.isFrameReady()
        : site.isCursorParked(this.buf);

      if (isParked) {
        const result = site.parseReadingStatus(lastRowText, this.buf);
        if (this.ignoreOneUpdate) {
          this.ignoreOneUpdate = false;
          const isFirstPage =
            result &&
            result.pageIndex === 1 &&
            (result.rowIndexStart == null || result.rowIndexStart === 1);
          if (!isFirstPage) {
            if (site) {
              site.pageState = PAGE_STATE.NORMAL;
            }
            this.started = false;
            return;
          }
        }
        if (result) {
          const isEnd = site.isArticleEnd(lastRowText, this.buf, result);

          if (this._pageDownInFlight) {
            const pageAdvanced =
              (result.pageIndex != null && result.pageIndex !== this._lastRequestedPageIndex) ||
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
        } else if (site.isArticleEnd(lastRowText, this.buf, null)) {
          this.easyReadingReachedPageEnd = true;
          this._resetInFlight();
        } else {
          if (site) {
            site.pageState = PAGE_STATE.PASS;
          }
          this.started = false;
          this._resetInFlight();
        }
      }
    }
  }

  _armInFlightWatchdog() {
    this._clearInFlightWatchdog();
    this._inFlightTimer = this.setTimeout(() => {
      this._onInFlightTimeout();
    }, INFLIGHT_WATCHDOG_MS);
  }

  _clearInFlightWatchdog() {
    if (this._inFlightTimer !== null) {
      this.clearTimeout(this._inFlightTimer);
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
    this._changeHandled = false;
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

  suppressInertialWheel(durationMs = 300) {
    const now = Date.now();
    this.suppressWheelUntil = Math.max(
      this.suppressWheelUntil || 0,
      now + durationMs
    );
    this.suppressWheelStartedAt = now;
    this.app?.suppressInertialWheel?.(durationMs);
  }

  leaveCurrentPost() {
    console.debug('leave current post');
    const wasInFlight = this._pageDownInFlight;
    this._resetInFlight();
    if (this.sendCommandAfterUpdate !== 'skipOne') {
      this.sendCommandAfterUpdate = '';
    }
    this._temporarilyHidden = false;
    const now = Date.now();
    const duration = (this.lastWheelTime && (now - this.lastWheelTime < 1000)) ? 1200 : 300;
    this.suppressInertialWheel(duration);
    if (this.started && wasInFlight && !this.easyReadingReachedPageEnd) {
      this.ignoreOneUpdate = true;
    } else if (!wasInFlight && this.sendCommandAfterUpdate !== 'skipOne') {
      this.ignoreOneUpdate = false;
    }
    if (this.site) {
      this.site.prevPageState = PAGE_STATE.NORMAL;
    }
    if (
      typeof window !== 'undefined' &&
      typeof window.requestAnimationFrame === 'function'
    ) {
      if (this._exitFallbackTimer) {
        this.clearTimeout(this._exitFallbackTimer);
      }
      this._exitFallbackTimer = this.setTimeout(() => {
        this._exitFallbackTimer = null;
        if (this.site?.pageState !== PAGE_STATE.READING) {
          this.hide();
        }
      }, 300);
    }
  }

  stopEasyReading() {
    console.debug('stop easy reading');
    if (this.started && this._pageDownInFlight && !this.easyReadingReachedPageEnd) {
      this.ignoreOneUpdate = true;
    }
    this.sendCommandAfterUpdate = 'skipOne';
    this._resetInFlight();
    const now = Date.now();
    const duration = (this.lastWheelTime && (now - this.lastWheelTime < 1000)) ? 1200 : 300;
    this.suppressInertialWheel(duration);
  }

  _send(data) {
    this.app?.send?.(data);
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

    const site = this.site;
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
    const chh = this.view?.chh || 16;
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
    const site = this.site;
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
          stop = this._scrollBy(this._turnPageLines);
          if (!stop) {
            if (!this.easyReadingReachedPageEnd) {
              stop = true;
            } else {
              this.leaveCurrentPost();
            }
          }
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
          this.leaveToTerminal();
          stop = true;
          break;
        case 'ArrowLeft':
          this.stopEasyReading();
          this.leaveCurrentPost();
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
          this._scrollBy(-1);
          stop = true;
          break;
        case 'j':
          this._scrollBy(1);
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
          if (e.key === 'End' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
            const liveUpdate = this.app?.getPlugin?.('live_update');
            if (liveUpdate?.enabled && liveUpdate?.endTurnsOn) {
              liveUpdate.toggle();
              liveUpdate.showModal(true);
              e.preventDefault();
              return;
            }
          }
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
    const mb = this.app?.pluginManager?.getPlugin?.('mouse_browsing');
    if (mb?.enabled) {
      return;
    }
    let stop = false;
    const mouseCursor = this.buf?.mouseCursor ?? -1;
    switch (mouseCursor) {
      case 1: // Arrow Left
        this.stopEasyReading();
        this.leaveCurrentPost();
        this._send('\x1b[D');
        stop = true;
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
      case 8: // [
      case 9: // ]
      case 10: // =
      case 12: // Refresh post / pushed texts
      case 13: // Last post with the same title (LIST)
      case 14: // Last post with the same title (READING)
        this.leaveCurrentPost();
        break;
      default: // Do nothing (never close on normal left click)
        break;
    }
    if (stop)
      e.preventDefault();
  }

  _shouldAllowBoundaryNavJump(context) {
    if (context?.source === 'wheel') {
      const now = Date.now();
      const justEntered = Boolean(
        this._articleEnterTime && now - this._articleEnterTime < 400
      );
      if (context.isContinuous || justEntered) {
        return false;
      }
    }
    return true;
  }

  handleNavCmd(cmd, context) {
    if (!this.isActive()) return false;
    switch (cmd) {
      case "doLeft":
        this.stopEasyReading();
        this.leaveCurrentPost();
        this._send('\x1b[D');
        return true;
      case "doHome":
        this._scrollTop();
        return true;
      case "doEnd":
        this._scrollEnd();
        return true;
      case "doArrowUp":
        if (!this._scrollBy(-1)) {
          if (this._shouldAllowBoundaryNavJump(context)) {
            this._articleEnterTime = Date.now();
            this.leaveCurrentPost();
            this._send('\x1b[D\x1b[A\x1b[C');
          }
        }
        return true;
      case "doArrowDown":
        if (!this._scrollBy(1)) {
          if (
            this.easyReadingReachedPageEnd &&
            this._shouldAllowBoundaryNavJump(context)
          ) {
            this._articleEnterTime = Date.now();
            this.leaveCurrentPost();
            this._send('\x1b[B');
          }
        }
        return true;
      case "doPageUp":
        if (!this._scrollBy(-this._turnPageLines)) {
          if (this._shouldAllowBoundaryNavJump(context)) {
            this._articleEnterTime = Date.now();
            this.leaveCurrentPost();
            this._send('\x1b[D\x1b[A\x1b[C');
          }
        }
        return true;
      case "doPageDown":
        if (!this._scrollBy(this._turnPageLines)) {
          if (
            this.easyReadingReachedPageEnd &&
            this._shouldAllowBoundaryNavJump(context)
          ) {
            this._articleEnterTime = Date.now();
            this.leaveCurrentPost();
            this._send('\x1b[B');
          }
        }
        return true;
      case "previousThread": {
        const tCmd = this.site?.getThreadCommand?.("prevThread");
        if (tCmd) {
          this.leaveCurrentPost();
          this._send(tCmd);
        }
        return true;
      }
      case "nextThread": {
        const tCmd = this.site?.getThreadCommand?.("nextThread");
        if (tCmd) {
          this.leaveCurrentPost();
          this._send(tCmd);
        }
        return true;
      }
      case "firstThread":
      case "lastThreadList":
      case "lastThreadReading":
      case "refreshPost": {
        const tCmd = this.site?.getThreadCommand?.(cmd);
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
    if (isHorizontalWheelEvent(e)) {
      return false;
    }
    const now = Date.now();
    const trackpadMode = Boolean(this.app?.mouseWheelTrackpadMode);
    const isTrackpad =
      trackpadMode &&
      (this.app?.mouse?.isTrackpadEvent
        ? this.app.mouse.isTrackpadEvent(e)
        : !isDiscreteMouseWheelEvent(e));

    if (this.app?.contextMenuShown && this.app?.mouse) {
      this.app.mouse.rightButtonDown = false;
    }

    if (this.isActive()) {
      const isRightButton =
        this.app?.mouse?.rightButtonDown || Boolean(e?.buttons & 2);
      const isLeftButton =
        !isRightButton &&
        (this.app?.mouse?.leftButtonDown || Boolean(e?.buttons & 1));
      if (isRightButton || isLeftButton) {
        const actionPref = isRightButton
          ? this.app?.mouseWheelRightAction || 'page'
          : this.app?.mouseWheelLeftAction || 'none';
        if (actionPref !== 'none') {
          return false;
        }
      }

      const deltaY = e?.deltaY || 0;
      const direction = deltaY < 0 ? 'up' : deltaY > 0 ? 'down' : null;
      if (direction) {
        const isNewGesture =
          !this._lastWheelGestureTime ||
          now - this._lastWheelGestureTime >= 350 ||
          this._lastWheelDirection !== direction;
        if (isNewGesture) {
          this._gestureHasScrolled = false;
          this._gestureBlockedAtBoundary = false;
          this._boundaryDeltaAccum = 0;
        }
        this._lastWheelGestureTime = now;
        this._lastWheelDirection = direction;

        const cont = this.content;
        const atTop = cont ? cont.scrollTop <= 0 : false;
        const atBottom = cont
          ? Boolean(
              this.easyReadingReachedPageEnd &&
                cont.scrollTop >= cont.scrollHeight - cont.clientHeight - 2
            )
          : false;
        const justEntered = Boolean(
          this._articleEnterTime && now - this._articleEnterTime < 400
        );

        if ((direction === 'up' && atTop) || (direction === 'down' && atBottom)) {
          if (
            this._gestureHasScrolled ||
            this._gestureBlockedAtBoundary ||
            justEntered
          ) {
            this._gestureBlockedAtBoundary = true;
            this.lastWheelTime = now;
            this.lastWheelEventTime = now;
            this._wasTrackpadInActive = isTrackpad;
            e?.stopPropagation?.();
            e?.preventDefault?.();
            return true;
          }

          this._boundaryDeltaAccum += Math.abs(deltaY);
          if (
            isDiscreteMouseWheelEvent(e) ||
            this._boundaryDeltaAccum >= 20
          ) {
            this._articleEnterTime = now;
            this._gestureHasScrolled = true;
            this._gestureBlockedAtBoundary = true;
            this.lastWheelTime = now;
            this.lastWheelEventTime = now;
            this._wasTrackpadInActive = isTrackpad;
            this.leaveCurrentPost();
            this._send(direction === 'up' ? '\x1b[D\x1b[A\x1b[C' : '\x1b[B');
            e?.stopPropagation?.();
            e?.preventDefault?.();
            return true;
          }

          this.lastWheelTime = now;
          this.lastWheelEventTime = now;
          this._wasTrackpadInActive = isTrackpad;
          e?.stopPropagation?.();
          e?.preventDefault?.();
          return true;
        }

        this._gestureHasScrolled = true;
        this._gestureBlockedAtBoundary = false;
      }

      this.lastWheelTime = now;
      this.lastWheelEventTime = now;
      this._wasTrackpadInActive = isTrackpad;
      return true;
    }

    // When trackpad mode is off or event is from a physical mouse wheel, never suppress
    if (!trackpadMode || (!isTrackpad && !this._wasTrackpadInActive)) {
      return false;
    }

    const wasScrollingAtExit =
      this.lastWheelTime &&
      this.lastHideTime &&
      this.lastHideTime - this.lastWheelTime <= 120;
    const isContinuousInertialStream =
      wasScrollingAtExit &&
      now - this.lastHideTime < 350 &&
      this.lastWheelEventTime &&
      now - this.lastWheelEventTime < 80;

    if (isContinuousInertialStream) {
      this.lastWheelEventTime = now;
      e?.stopPropagation?.();
      e?.preventDefault?.();
      return 'suppress';
    }

    this._wasTrackpadInActive = false;
    this.suppressWheelUntil = 0;
    this.suppressWheelStartedAt = 0;
    return false;
  }

  handleMouseClick(e) {
    if (!this.isActive() || !this.started)
      return false;
    this._onMouseClick(e);
    return !!e.defaultPrevented;
  }

  handleKeyDown(e) {
    if (this._temporarilyHidden && this.started && this.enabled) {
      const isInPrompt =
        this.site?.isReplyPrompt?.(this.buf) ||
        this.site?.isPushPrompt?.(this.buf);
      if (e.key === 'Escape' && !isInPrompt) {
        this.show();
        if (this.site?.pageState === PAGE_STATE.READING) {
          this.populatePage();
        }
        e.preventDefault();
        return true;
      }
      const leavePostCmds = this.site?.getLeaveCurrentPostCommands?.() || [];
      if (
        !e.ctrlKey &&
        !e.altKey &&
        leavePostCmds.includes(e.key) &&
        !isInPrompt
      ) {
        this.leaveCurrentPost();
      }
      return false;
    }
    if (!this.isActive() || !this.started)
      return false;
    this._keyDownKeyCode = e.keyCode;
    this._keyDownIsComposing = !!(e.isComposing || e.key === 'Process' || e.keyCode === 229);
    this._onKeyDown(e);
    return !!e.defaultPrevented;
  }

  handleTextInput(e) {
    if (!this.isActive() || !this.started)
      return false;
    const leaveToTermCmds = this.site?.getLeaveToTerminalCommands?.() || [];
    if (
      (this._keyDownIsComposing || this._keyDownKeyCode === 229) &&
      e?.target &&
      !leaveToTermCmds.includes(e.target.value)
    ) {
      e.target.value = '';
      return true;
    }
    return false;
  }

  getClientToPos(cX, cY) {
    if (!this.isActive() || !this.started || !this.view || !this.overlay) return undefined;
    const origin = this.view._getGridOrigin ? this.view._getGridOrigin() : [0, 0];
    const chw = (this.view.chw || 8) * (this.view.scaleX || 1);
    const chh = (this.view.chh || 16) * (this.view.scaleY || 1);
    const cols = this.buf?.cols || 80;
    const rows = this.buf?.rows || 24;

    const termWinOffset = this.view.getTermWinOffset ? this.view.getTermWinOffset() : { left: 0, top: 0 };
    let col = Math.floor((cX - termWinOffset.left - origin[0]) / chw);
    if (col < 0) col = 0;
    else if (col >= cols) col = cols - 1;

    const rect = this.overlay.getBoundingClientRect?.() || { top: 0, height: rows * chh };
    const relY = cY - rect.top;
    const height = rect.height || rows * chh;
    const footerHeight = this.footer?.offsetHeight || chh;

    let row;
    if (relY >= height - footerHeight) {
      row = rows - 1;
    } else {
      const padTop =
        parseFloat(this.overlay.style?.getPropertyValue?.('--easy-reading-pad-top')) || 0;
      const contentY = relY - padTop;
      if (contentY < chh * 3) {
        row = Math.max(0, Math.floor(contentY / chh));
      } else {
        const midY = padTop + (height - footerHeight - padTop) / 2;
        row = relY < midY ? Math.floor(rows / 4) : Math.floor((rows * 3) / 4);
      }
    }
    return { col, row };
  }

  getCursorPos(col, row) {
    if (!this.isActive() || !this.started) return undefined;
    return 'hide';
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
    if (
      typeof window === 'undefined' ||
      !window.getSelection ||
      window.getSelection().isCollapsed ||
      window.getSelection().rangeCount === 0 ||
      !this.view?.countCol
    ) {
      return null;
    }
    const r = window.getSelection().getRangeAt(0);
    return {
      start: this.view.countCol(r.startContainer, r.startOffset),
      end: this.view.countCol(r.endContainer, r.endOffset),
      lines: this.pageLines,
    };
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

  onScreenUpdate(changedLineHtmlStrs, force = false) {
    if (this.enabled) {
      if (force) {
        if (this._reenteringArticle) {
          return false;
        }
        if (this.isActive()) {
          this._updateOverlayPadding();
          this.updateProgress();
          return true;
        }
        return false;
      }
      this._onChanged();
      this._changeHandled = true;
      this.updatePage(changedLineHtmlStrs);
      return true;
    } else if (this.isActive()) {
      this.hide();
      return true;
    }
    return false;
  }

  onFontUpdate({ fontFace, fontSize, lineHeight, asciiLetterSpacing } = {}) {
    if (this.overlay) {
      if (fontFace) {
        this.overlay.style.setProperty('--font-face', fontFace);
        this.overlay.style.setProperty('font-family', fontFace, 'important');
      }
      const effectiveFontFace = fontFace || this.view?.fontFace;
      let ls = asciiLetterSpacing ?? this.view?.asciiLetterSpacing;
      if (ls === undefined && effectiveFontFace) {
        const em = getAsciiLetterSpacingEm(effectiveFontFace);
        ls = em ? `${em}em` : '0px';
      }
      if (ls !== undefined) {
        this.overlay.style.setProperty('--term-ascii-ls', ls);
      }
      if (fontSize) {
        this.overlay.style.fontSize = fontSize;
        this.overlay.style.lineHeight = lineHeight || this.view?.mainDisplay?.style?.lineHeight || fontSize;
      } else if (lineHeight) {
        this.overlay.style.lineHeight = lineHeight;
      }
      this._updateOverlayPadding();
    }
  }
}

export { EasyReading as EasyReadingPlugin };

