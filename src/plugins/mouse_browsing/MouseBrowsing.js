import React from "preact/compat";
import { PluginBase } from "../PluginBase.js";
import { parseOptionText } from "../../js/pref.js";
import { _ } from "../../js/i18n.js";
import { setTimer } from "../../js/util.js";
import { PAGE_STATE } from "../../js/sites/index.js";
const cursorBack = new URL("../../cursor/back.png", import.meta.url).href;
const cursorPageup = new URL("../../cursor/pageup.png", import.meta.url).href;
const cursorPagedown = new URL("../../cursor/pagedown.png", import.meta.url).href;
const cursorHome = new URL("../../cursor/home.png", import.meta.url).href;
const cursorEnd = new URL("../../cursor/end.png", import.meta.url).href;
const cursorPrevous = new URL("../../cursor/prevous.png", import.meta.url).href;
const cursorNext = new URL("../../cursor/next.png", import.meta.url).href;
const cursorFirst = new URL("../../cursor/first.png", import.meta.url).href;
const cursorRefresh = new URL("../../cursor/refresh.png", import.meta.url).href;
const cursorLast = new URL("../../cursor/last.png", import.meta.url).href;

export const MOUSE_CURSOR_MAP = [
  "auto", // 0
  `url(${cursorBack}) 0 6,auto`, // 1
  `url(${cursorPageup}) 6 0,auto`, // 2
  `url(${cursorPagedown}) 6 21,auto`, // 3
  `url(${cursorHome}) 0 0,auto`, // 4
  `url(${cursorEnd}) 0 0,auto`, // 5
  "pointer", // 6
  "default", // 7
  `url(${cursorPrevous}) 6 0,auto`, // 8
  `url(${cursorNext}) 6 0,auto`, // 9
  `url(${cursorFirst}) 0 0,auto`, // 10
  "auto", // 11
  `url(${cursorRefresh}) 0 0,auto`, // 12
  `url(${cursorLast}) 0 0,auto`, // 13
  `url(${cursorLast}) 0 0,auto`, // 14
];

const MOUSE_LEFT_OPTIONS = [
  "options_none",
  "options_enterKey",
  "options_rightKey",
];

const MOUSE_MIDDLE_OPTIONS = [
  "options_none",
  "options_enterKey",
  "options_leftKey",
  "options_doPaste",
];

const MOUSE_WHEEL_OPTIONS = [
  "options_none",
  "options_upDown",
  "options_pageUpDown",
  "options_threadLastNext",
];

const MOUSE_WHEEL_ACTIONS_UP = [
  "none",
  "doArrowUp",
  "doPageUp",
  "previousThread",
];

const MOUSE_WHEEL_ACTIONS_DOWN = [
  "none",
  "doArrowDown",
  "doPageDown",
  "nextThread",
];

function renderOptionDesc(rawText) {
  const { desc } = parseOptionText(rawText);
  if (!desc) return null;
  return React.createElement(
    "span",
    {
      className: "help-block",
      style: {
        fontSize: "12px",
        opacity: 0.7,
        marginTop: "4px",
        display: "block",
      },
    },
    desc
  );
}

function renderSelectOptionGroup({
  controlId,
  label,
  name,
  value,
  options,
  onChange,
}) {
  const currentKey = options[value];
  const currentText = currentKey ? _(currentKey) : "";
  return React.createElement(
    "div",
    { className: "form-group", id: controlId },
    React.createElement("label", { className: "control-label" }, label),
    React.createElement(
      "select",
      {
        className: "form-control",
        name,
        value,
        onChange,
      },
      options.map((key, index) =>
        React.createElement(
          "option",
          { key, value: index },
          parseOptionText(_(key)).label
        )
      )
    ),
    renderOptionDesc(currentText)
  );
}

export class MouseBrowsing extends PluginBase {
  static id = "mouse_browsing";
  static name = "mouse_browsing";
  static prefKey = "enableMouseBrowsing";
  static group = "bbs";
  static icon = "mouse";
  static defaultPrefs = {
    enableMouseBrowsing: false,
    mouseBrowsingHighlight: true,
    mouseBrowsingHighlightColor: 2,
    mouseLeftFunction: 0,
    mouseMiddleFunction: 0,
    mouseWheelFunction1: 1,
    mouseWheelFunction2: 2,
    mouseWheelFunction3: 3,
  };

  static get title() {
    return _("plugin_mouse_browsing_title");
  }

  static get description() {
    return _("plugin_mouse_browsing_desc");
  }

  static renderOptions({ values = {}, handleCheckboxChange, handleNumberInputChange }) {
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        "div",
        { className: "checkbox PrefModal__MacSubCheckbox" },
        React.createElement(
          "label",
          null,
          React.createElement("input", {
            type: "checkbox",
            name: "mouseBrowsingHighlight",
            checked: values.mouseBrowsingHighlight,
            onChange: handleCheckboxChange,
          }),
          React.createElement(
            "span",
            null,
            _("options_mouseBrowsingHighlight")
          )
        )
      ),
      React.createElement(
        "div",
        { className: "PrefModal__Grid__Col--right__MouseBrowsingHighlightColor" },
        _("options_highlightColor"),
        React.createElement(
          "select",
          {
            className: `form-control b${values.mouseBrowsingHighlightColor}`,
            name: "mouseBrowsingHighlightColor",
            value: values.mouseBrowsingHighlightColor,
            onChange: handleNumberInputChange,
          },
          Array(16)
            .fill(0)
            .map((_, i) =>
              React.createElement("option", {
                key: i,
                value: i,
                className: `b${i}`,
              })
            )
        )
      ),
      renderSelectOptionGroup({
        controlId: "mouseLeftFunction",
        label: _("options_mouseLeftFunction"),
        name: "mouseLeftFunction",
        value: values.mouseLeftFunction,
        options: MOUSE_LEFT_OPTIONS,
        onChange: handleNumberInputChange,
      }),
      renderSelectOptionGroup({
        controlId: "mouseMiddleFunction",
        label: _("options_mouseMiddleFunction"),
        name: "mouseMiddleFunction",
        value: values.mouseMiddleFunction,
        options: MOUSE_MIDDLE_OPTIONS,
        onChange: handleNumberInputChange,
      }),
      renderSelectOptionGroup({
        controlId: "mouseWheelFunction1",
        label: _("options_mouseWheelFunction1"),
        name: "mouseWheelFunction1",
        value: values.mouseWheelFunction1,
        options: MOUSE_WHEEL_OPTIONS,
        onChange: handleNumberInputChange,
      }),
      renderSelectOptionGroup({
        controlId: "mouseWheelFunction2",
        label: _("options_mouseWheelFunction2"),
        name: "mouseWheelFunction2",
        value: values.mouseWheelFunction2,
        options: MOUSE_WHEEL_OPTIONS,
        onChange: handleNumberInputChange,
      }),
      renderSelectOptionGroup({
        controlId: "mouseWheelFunction3",
        label: _("options_mouseWheelFunction3"),
        name: "mouseWheelFunction3",
        value: values.mouseWheelFunction3,
        options: MOUSE_WHEEL_OPTIONS,
        onChange: handleNumberInputChange,
      })
    );
  }

  constructor(app, options = {}) {
    super(app, options);
    this.tempMouseCol = 0;
    this.tempMouseRow = 0;
    this.mouseCursor = 0;
    this.nowHighlight = -1;
    this.highlightCursor = true;
    this._dblclickTimer = null;
    this._mbTimer = null;
    this.mouseLeftButtonDown = false;
    this.mouseRightButtonDown = false;
    this.wheelDeltaYAccum = 0;
    this.lastWheelEventTime = 0;
    this.lastWheelCmdTime = 0;
    this.mouseLeftFunction = 0;
    this.mouseMiddleFunction = 0;
    this.mouseWheelFunction1 = 1;
    this.mouseWheelFunction2 = 2;
    this.mouseWheelFunction3 = 3;
  }

  getContextMenuItems() {
    return [
      {
        id: "mouse_browsing",
        order: 5,
        label: () => _("cmenu_mouseBrowsing"),
        checked: () => Boolean(this.enabled),
        visible: (app, { normalEnabled } = {}) => Boolean(normalEnabled !== false),
        onClick: () => {
          this.switchMouseBrowsing();
        },
      },
    ];
  }

  _syncPrefs(prefs) {
    if (!prefs) return;
    if (prefs.mouseBrowsingHighlight !== undefined) {
      this.highlightCursor = Boolean(prefs.mouseBrowsingHighlight);
      if (this.nowHighlight !== -1) {
        this.setHighlight(this.nowHighlight);
      }
    }
    if (prefs.mouseBrowsingHighlightColor !== undefined) {
      const view = this.view || this.app?.view;
      if (view) {
        view.highlightBG = prefs.mouseBrowsingHighlightColor;
        view.updateHighlightColor?.();
      }
    }
    if (prefs.mouseLeftFunction !== undefined) {
      this.mouseLeftFunction =
        typeof prefs.mouseLeftFunction === "boolean"
          ? prefs.mouseLeftFunction
            ? 1
            : 0
          : Number(prefs.mouseLeftFunction) || 0;
    }
    if (prefs.mouseMiddleFunction !== undefined) {
      this.mouseMiddleFunction = Number(prefs.mouseMiddleFunction) || 0;
    }
    if (prefs.mouseWheelFunction1 !== undefined) {
      this.mouseWheelFunction1 = Number(prefs.mouseWheelFunction1) ?? 1;
    }
    if (prefs.mouseWheelFunction2 !== undefined) {
      this.mouseWheelFunction2 = Number(prefs.mouseWheelFunction2) ?? 2;
    }
    if (prefs.mouseWheelFunction3 !== undefined) {
      this.mouseWheelFunction3 = Number(prefs.mouseWheelFunction3) ?? 3;
    }
  }

  _clearTimers() {
    if (this._dblclickTimer) {
      this._dblclickTimer.cancel();
      this._dblclickTimer = null;
    }
    if (this._mbTimer) {
      this._mbTimer.cancel();
      this._mbTimer = null;
    }
  }

  onInit() {
    this._syncPrefs(this.app?.prefValues);
    this.registerInputInterceptorWhileEnabled(this);
    this.listenApp("term:pref-change", (e) => {
      const key = e?.key ?? e?.detail?.key;
      const value = e?.value !== undefined ? e.value : e?.detail?.value;
      this._syncPrefs({ [key]: value });
      if (
        key === "mouseBrowsingHighlight" ||
        key === "mouseBrowsingHighlightColor"
      ) {
        this.view?.redraw?.(true);
        this.view?.updateCursorPos?.();
      }
    });
    this.listenAppWhileEnabled("term:mouse-move", (e) => {
      const col = e?.col ?? e?.detail?.col;
      const row = e?.row ?? e?.detail?.row;
      const refresh = e?.refresh ?? e?.detail?.refresh;
      const force = e?.force ?? e?.detail?.force;
      this.onMouseMove(col, row, !!refresh, !!force);
    });
    this.listenApp("term:mouse-move:force", (e) => {
      const col = e?.col ?? e?.detail?.col;
      const row = e?.row ?? e?.detail?.row;
      const refresh = e?.refresh ?? e?.detail?.refresh;
      const highlight = e?.highlight ?? e?.detail?.highlight;
      this.onMouseMove(col, row, !!refresh, true, { highlight });
    });
    this.listenApp("term:clear-highlight", () => {
      this.clearHighlight();
    });
    const buf = this.buf || this.app?.buf;
    if (buf) {
      this.listen(buf, "change", () => {
        this.clearHighlight();
      });
    }
    this.listenApp("term:click", (evt) => {
      if (!this.enabled && (evt?.force || evt?.event?.force)) {
        if (this.handleMouseClick(evt.event, true)) {
          evt.handled = true;
        }
      }
    });
    this.listenApp("term:disconnect", () => {
      this._clearTimers();
      this.mouseLeftButtonDown = false;
      this.mouseRightButtonDown = false;
      this.wheelDeltaYAccum = 0;
    });
  }

  onEnable() {
    this.resetMousePos();
    if (!this._initializing) {
      this.view?.redraw?.(true);
      this.view?.updateCursorPos?.();
    }
  }

  onDisable() {
    this._clearTimers();
    this.mouseLeftButtonDown = false;
    this.mouseRightButtonDown = false;
    this.wheelDeltaYAccum = 0;
    const buf = this.buf || this.app?.buf;
    const termWin = this.app?.termWin || buf?.termWin;
    if (termWin && termWin.style) termWin.style.cursor = "auto";
    this.clearHighlight();
    this.setMouseCursor(0);
    this.tempMouseCol = 0;
    this.tempMouseRow = 0;
    this.view?.redraw?.(true);
    this.view?.updateCursorPos?.();
  }

  onDestroy() {
    this._clearTimers();
    const buf = this.buf || this.app?.buf;
    const termWin = this.app?.termWin || buf?.termWin;
    if (termWin && termWin.style) termWin.style.cursor = "auto";
    this.clearHighlight();
  }

  handleMouseDown(e) {
    if (!this.enabled || !e) return false;
    if (e.button === 0) {
      this.mouseLeftButtonDown = true;
      if (this._dblclickTimer) {
        e.preventDefault?.();
        e.stopPropagation?.();
        e.cancelBubble = true;
        this._setDblclickTimer();
        return true;
      }
      this._setDblclickTimer();
      return false;
    }
    if (e.button === 1) {
      if (e.target && e.target.closest?.("a")) {
        return false;
      }
      if (this.mouseMiddleFunction === 1) {
        this.app?.send("\r");
        e.preventDefault?.();
        return true;
      }
      if (this.mouseMiddleFunction === 2) {
        this.app?.send("\x1b[D");
        e.preventDefault?.();
        return true;
      }
      if (this.mouseMiddleFunction === 3) {
        this.app?.doPaste?.();
        e.preventDefault?.();
        return true;
      }
      return false;
    }
    if (e.button === 2) {
      this.mouseRightButtonDown = true;
      return false;
    }
    return false;
  }

  handleMouseUp(e) {
    if (!this.enabled || !e) return false;
    if (e.button === 0) {
      if (this._mbTimer) {
        this._mbTimer.cancel();
      }
      this._mbTimer = setTimer(
        false,
        () => {
          this._mbTimer = null;
          if (this.app) this.app.skipMouseClick = false;
        },
        100
      );
      this.mouseLeftButtonDown = false;
      if (this.app?.isSelectionCollapsed?.()) {
        const pos = this.app.clientToPos?.(e.clientX, e.clientY);
        if (pos) this.onMouseMove(pos.col, pos.row);
      }
      return false;
    }
    if (e.button === 2) {
      this.mouseRightButtonDown = false;
      return false;
    }
    return false;
  }

  handleWheel(e) {
    if (!this.enabled || !this.app || !e) return false;
    const now = Date.now();
    let deltaY = e.deltaY;
    if (e.deltaMode === 1) {
      deltaY *= 30;
    } else if (e.deltaMode === 2) {
      deltaY *= 300;
    }

    if (this.lastWheelEventTime && now - this.lastWheelEventTime > 200) {
      this.wheelDeltaYAccum = 0;
    }
    if (
      (this.wheelDeltaYAccum > 0 && deltaY < 0) ||
      (this.wheelDeltaYAccum < 0 && deltaY > 0)
    ) {
      this.wheelDeltaYAccum = 0;
    }

    this.lastWheelEventTime = now;
    this.wheelDeltaYAccum = (this.wheelDeltaYAccum || 0) + deltaY;

    const threshold = Math.max(35, this.app.view?.chh || 35);
    if (Math.abs(this.wheelDeltaYAccum) < threshold) {
      e.stopPropagation?.();
      e.preventDefault?.();
      return true;
    }

    if (this.lastWheelCmdTime && now - this.lastWheelCmdTime < 60) {
      e.stopPropagation?.();
      e.preventDefault?.();
      return true;
    }

    const isScrollUp = this.wheelDeltaYAccum < 0;
    if (Math.abs(deltaY) >= 100) {
      this.wheelDeltaYAccum = 0;
    } else {
      this.wheelDeltaYAccum -= isScrollUp ? -threshold : threshold;
    }
    this.lastWheelCmdTime = now;

    const actions = isScrollUp
      ? MOUSE_WHEEL_ACTIONS_UP
      : MOUSE_WHEEL_ACTIONS_DOWN;
    const fnIdx = this.mouseRightButtonDown
      ? this.mouseWheelFunction2
      : this.mouseLeftButtonDown
        ? this.mouseWheelFunction3
        : this.mouseWheelFunction1;
    const action = actions[fnIdx];
    this.app.setNavCmd(action);

    if (this.mouseRightButtonDown) {
      this.app.preventContextMenuOnMouseUp = true;
    }
    if (this.mouseLeftButtonDown) {
      this.app.skipMouseClick = true;
    }

    e.stopPropagation?.();
    e.preventDefault?.();
    return true;
  }

  _setDblclickTimer() {
    if (this._dblclickTimer) {
      this._dblclickTimer.cancel();
    }
    this._dblclickTimer = setTimer(
      false,
      () => {
        this._dblclickTimer = null;
      },
      350
    );
  }

  switchMouseBrowsing() {
    this.setEnabled(!this.enabled, true);
    return this.enabled;
  }

  setMouseCursor(cursor) {
    this.mouseCursor = cursor;
  }

  setHighlight(row, visualOverride = undefined) {
    this.nowHighlight = row;
    const showVisual =
      visualOverride !== undefined ? Boolean(visualOverride) : this.highlightCursor;
    const view = this.view || this.app?.view;
    if (view?.setHighlightedRow) {
      view.setHighlightedRow(showVisual ? row : -1);
    }
  }

  clearHighlight() {
    this.nowHighlight = -1;
    const view = this.view || this.app?.view;
    if (view?.clearHighlight) {
      view.clearHighlight();
    }
  }

  navigateRowAndEnter(targetRow) {
    const buf = this.buf || this.app?.buf;
    if (!buf || !this.app) return;
    const diff = buf.cur_y - targetRow;
    const sendstr =
      (diff > 0 ? "\x1b[A".repeat(diff) : "\x1b[B".repeat(-diff)) + "\r";
    this.app.send(sendstr);
  }

  _calcListRowMouseCursor(trow, tcol, lastRowNum, cols, visualOverride = undefined) {
    const buf = this.buf || this.app?.buf;
    if (!buf) return;
    if (tcol <= 6) {
      this.clearHighlight();
      this.setMouseCursor(1);
    } else if (tcol >= cols - 16) {
      this.clearHighlight();
      if (trow > (lastRowNum + 1) / 2) this.setMouseCursor(3);
      else this.setMouseCursor(2);
    } else {
      if (!buf.isLineEmpty(trow)) {
        this.setMouseCursor(6);
        this.setHighlight(trow, visualOverride);
      } else {
        this.setMouseCursor(11);
      }
    }
  }

  onMouseMove(tcol, trow, doRefresh, force = false, options = {}) {
    const buf = this.buf || this.app?.buf;
    if (!buf) return;
    tcol =
      typeof tcol === "number" && Number.isFinite(tcol) ? Math.floor(tcol) : 0;
    trow =
      typeof trow === "number" && Number.isFinite(trow) ? Math.floor(trow) : 0;
    this.tempMouseCol = tcol;
    this.tempMouseRow = trow;

    if (!this.enabled && !force) return;

    if (!force && this.app) {
      if (
        typeof this.app.isSelectionCollapsed === "function" &&
        !this.app.isSelectionCollapsed()
      ) {
        this.resetMouseCursor();
        return;
      }
      if (this.mouseLeftButtonDown) {
        return;
      }
    }

    if (this.nowHighlight !== trow || doRefresh) {
      this.clearHighlight();
    }

    const site = this.app?.site;
    const lastRowNum = site?.getLastRowNum
      ? site.getLastRowNum(buf)
      : buf.rows - 1;
    const cols = buf.cols;

    switch (site?.pageState) {
      case PAGE_STATE.NORMAL:
        this.setMouseCursor(0);
        break;

      case PAGE_STATE.MAPLE_LIST:
        if (trow > 1 && trow < lastRowNum - 1) {
          this._calcListRowMouseCursor(trow, tcol, lastRowNum, cols, options?.highlight);
        } else if (trow == 1 || trow == 2) {
          this.setMouseCursor(2);
        } else if (trow === 0) {
          this.setMouseCursor(4);
        } else {
          this.setMouseCursor(5);
        }
        break;

      case PAGE_STATE.LIST:
        if (trow > 2 && trow < lastRowNum) {
          this._calcListRowMouseCursor(trow, tcol, lastRowNum, cols, options?.highlight);
        } else if (trow == 1 || trow == 2) {
          if (tcol < 2) this.setMouseCursor(8);
          else if (tcol > cols - 5) this.setMouseCursor(9);
          else this.setMouseCursor(2);
        } else if (trow === 0) {
          if (tcol < 2) this.setMouseCursor(10);
          else if (tcol > cols - 5) this.setMouseCursor(9);
          else this.setMouseCursor(4);
        } else {
          if (tcol < 2) this.setMouseCursor(12);
          else if (tcol > cols - 5) this.setMouseCursor(13);
          else this.setMouseCursor(5);
        }
        break;

      case PAGE_STATE.READING:
        if (trow == lastRowNum) {
          if (tcol < 2) this.setMouseCursor(12);
          else if (tcol > cols - 5) this.setMouseCursor(14);
          else this.setMouseCursor(5);
        } else if (trow === 0 || trow == 1 || trow == 2) {
          if (tcol < 2) this.setMouseCursor(trow === 0 ? 10 : 8);
          else if (tcol > cols - 5) this.setMouseCursor(9);
          else if (tcol < 7) this.setMouseCursor(1);
          else this.setMouseCursor(2);
        } else if (tcol < 7) this.setMouseCursor(1);
        else if (trow < (lastRowNum + 1) / 2) this.setMouseCursor(2);
        else this.setMouseCursor(3);
        break;

      case PAGE_STATE.MENU:
        if (trow > 0 && trow < lastRowNum) {
          if (tcol > 7) this.setMouseCursor(7);
          else this.setMouseCursor(1);
        } else {
          this.setMouseCursor(0);
        }
        break;

      default:
        this.setMouseCursor(0);
        break;
    }

    const termWin = this.app?.termWin || buf.termWin;
    if (termWin && termWin.style && this.enabled) {
      termWin.style.cursor = MOUSE_CURSOR_MAP[this.mouseCursor] || "auto";
    }
  }

  resetMouseCursor() {
    const buf = this.buf || this.app?.buf;
    const termWin = this.app?.termWin || buf?.termWin;
    if (termWin && termWin.style) termWin.style.cursor = "auto";
    this.setMouseCursor(11);
  }

  resetMousePos() {
    if (this.enabled) {
      const col = this.tempMouseCol ?? 0;
      const row = this.tempMouseRow ?? 0;
      this.onMouseMove(col, row, true);
    }
  }

  handleMouseClick(e, force = false) {
    const app = this.app;
    const buf = this.buf || app?.buf;
    if (!app || (app.conn && !app.conn.isConnected) || !buf) {
      return false;
    }

    const isForced = force || Boolean(e?.force || e?.forceMouseBrowsing);
    if (!this.enabled && !isForced) return false;

    const cX = e.clientX;
    const cY = e.clientY;
    const currentCursor = this.mouseCursor || 0;

    switch (currentCursor) {
      case 1:
        app.send("\x1b[D"); // Arrow Left
        return true;
      case 2:
        app.send("\x1b[5~"); // Page Up
        return true;
      case 3:
        app.send("\x1b[6~"); // Page Down
        return true;
      case 4:
        app.send("\x1b[1~"); // Home
        return true;
      case 5:
        app.send("\x1b[4~"); // End
        return true;
      case 6: {
        if (this.nowHighlight !== -1) {
          this.navigateRowAndEnter(this.nowHighlight);
          return true;
        }
        break;
      }
      case 7: {
        const pos = app.clientToPos ? app.clientToPos(cX, cY) : null;
        if (pos) {
          this.navigateRowAndEnter(pos.row);
          return true;
        }
        break;
      }
      case 0:
        if (this.mouseLeftFunction === 1) {
          app.setNavCmd("doEnter");
          return true;
        }
        if (this.mouseLeftFunction === 2) {
          app.setNavCmd("doRight");
          return true;
        }
        app.send("\x1b[D"); // Arrow Left
        return true;
      case 8: {
        const cmd = app.site?.getThreadCommand?.("prevThread");
        if (cmd) {
          app.send(cmd);
          return true;
        }
        break;
      }
      case 9: {
        const cmd = app.site?.getThreadCommand?.("nextThread");
        if (cmd) {
          app.send(cmd);
          return true;
        }
        break;
      }
      case 10: {
        const cmd = app.site?.getThreadCommand?.("firstThread");
        if (cmd) {
          app.send(cmd);
          return true;
        }
        break;
      }
      case 12: {
        const cmd = app.site?.getThreadCommand?.("refreshPost");
        if (cmd) {
          app.send(cmd);
          return true;
        }
        break;
      }
      case 13: {
        const cmd = app.site?.getThreadCommand?.("lastThreadList");
        if (cmd) {
          app.send(cmd);
          return true;
        }
        break;
      }
      case 14: {
        const cmd = app.site?.getThreadCommand?.("lastThreadReading");
        if (cmd) {
          app.send(cmd);
          return true;
        }
        break;
      }
      default:
        if (this.mouseLeftFunction === 1) {
          app.setNavCmd("doEnter");
          return true;
        }
        if (this.mouseLeftFunction === 2) {
          app.setNavCmd("doRight");
          return true;
        }
        break;
    }

    return true;
  }
}
