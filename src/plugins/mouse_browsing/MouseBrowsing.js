import { readValuesWithDefault, updatePref } from "../../js/pref.js";
import { _ } from "../../js/i18n.js";
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

export class MouseBrowsing {
  static id = "mouse_browsing";
  static name = "mouse_browsing";
  static prefKey = "useMouseBrowsing";

  static getMetadata() {
    return {
      id: "mouse_browsing",
      name: "mouse_browsing",
      title: _("cmenu_mouseBrowsing"),
      description: _("plugin_mouse_browsing_desc"),
      prefKey: "useMouseBrowsing",
      icon: "mouse",
    };
  }

  constructor(app, options = {}) {
    this.app = app || null;
    this.view = options.view || null;
    this.buf = options.buf || null;
    const prefs = readValuesWithDefault();
    this.enabled = options.enabled ?? (prefs.useMouseBrowsing ?? false);
    this.supportMouseReporting = options.supportMouseReporting ?? (prefs.supportMouseReporting ?? true);
    this.tempMouseCol = 0;
    this.tempMouseRow = 0;
    this.mouseCursor = 0;
  }

  get id() {
    return "mouse_browsing";
  }

  get name() {
    return "mouse_browsing";
  }

  get prefKey() {
    return "useMouseBrowsing";
  }

  get title() {
    return _("cmenu_mouseBrowsing");
  }

  get description() {
    return _("plugin_mouse_browsing_desc");
  }

  get icon() {
    return "mouse";
  }

  getMetadata() {
    return {
      id: this.id,
      name: this.name,
      title: this.title,
      description: this.description,
      prefKey: this.prefKey,
      enabled: this.enabled,
      icon: this.icon,
      supportMouseReporting: this.supportMouseReporting,
    };
  }

  getContextMenuItems() {
    return [
      {
        id: "mouse_browsing",
        order: 5,
        label: () => _("cmenu_mouseBrowsing"),
        checked: () => Boolean(this.enabled),
        visible: (app, { normalEnabled }) => normalEnabled,
        onClick: () => {
          this.switchMouseBrowsing();
        },
      },
    ];
  }

  init({ app, view, buf } = {}) {
    if (app) {
      this.app = app;
      this._onPrefChangeBound = (e) => {
        const { key, value } = e.detail || {};
        if (key === "useMouseBrowsing") {
          this.setEnabled(Boolean(value));
        } else if (key === "supportMouseReporting") {
          this.setSupportMouseReporting(Boolean(value));
        }
      };
      this._onMouseMoveBound = (e) => {
        const { col, row, refresh } = e.detail || {};
        this.onMouseMove(col, row, !!refresh);
      };
      this._onResetMouseCursorBound = () => {
        this.resetMouseCursor();
      };
      app.addEventListener?.("term:pref-change", this._onPrefChangeBound);
      app.addEventListener?.("term:mouse-move", this._onMouseMoveBound);
      app.addEventListener?.("term:reset-mouse-cursor", this._onResetMouseCursorBound);
      app.registerContextMenuItem?.(this.getContextMenuItems()[0]);
    }
    if (view) this.view = view;
    if (buf) this.buf = buf;
    if (this.buf) {
      this.buf.useMouseBrowsing = this.enabled;
      if (this.buf.locator) {
        this.buf.locator.enabled = this.supportMouseReporting;
      }
    }
  }

  setSupportMouseReporting(enabled) {
    this.supportMouseReporting = !!enabled;
    const buf = this.buf || this.app?.buf;
    if (buf?.locator) {
      buf.locator.enabled = this.supportMouseReporting;
    }
    updatePref("supportMouseReporting", this.supportMouseReporting);
  }

  destroy() {
    if (this.app) {
      this.app.removeEventListener?.("term:pref-change", this._onPrefChangeBound);
      this.app.removeEventListener?.("term:mouse-move", this._onMouseMoveBound);
      this.app.removeEventListener?.("term:reset-mouse-cursor", this._onResetMouseCursorBound);
      this.app.unregisterContextMenuItem?.("mouse_browsing");
    }
    if (this.buf) {
      this.buf.useMouseBrowsing = false;
      this.buf.clearHighlight();
    }
  }

  setEnabled(val) {
    this.enabled = !!val;
    const buf = this.buf || this.app?.buf;
    if (buf) {
      buf.useMouseBrowsing = this.enabled;
      if (!this.enabled) {
        const termWin = this.app?.termWin || buf.termWin;
        if (termWin && termWin.style) termWin.style.cursor = "auto";
        buf.clearHighlight();
        buf.mouseCursor = 0;
        buf.nowHighlight = -1;
        buf.tempMouseCol = 0;
        buf.tempMouseRow = 0;
      } else {
        this.resetMousePos();
        this.view?.redraw?.(true);
        this.view?.updateCursorPos?.();
      }
    }
    if (this.app) {
      this.app.useMouseBrowsing = this.enabled;
    }
    updatePref("useMouseBrowsing", this.enabled);
  }

  switchMouseBrowsing() {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  navigateRowAndEnter(targetRow) {
    if (!this.buf || !this.app) return;
    const diff = this.buf.cur_y - targetRow;
    const sendstr =
      (diff > 0 ? "\x1b[A".repeat(diff) : "\x1b[B".repeat(-diff)) + "\r";
    this.app.send(sendstr);
  }

  _calcListRowMouseCursor(trow, tcol, lastRowNum, cols) {
    const buf = this.buf || this.app?.buf;
    if (!buf) return;
    if (tcol <= 6) {
      buf.clearHighlight();
      buf.mouseCursor = 1;
    } else if (tcol >= cols - 16) {
      buf.clearHighlight();
      if (trow > (lastRowNum + 1) / 2) buf.mouseCursor = 3;
      else buf.mouseCursor = 2;
    } else {
      if (!buf.isLineEmpty(trow)) {
        buf.mouseCursor = 6;
        buf.nowHighlight = trow;
      } else {
        buf.mouseCursor = 11;
      }
    }
  }

  onMouseMove(tcol, trow, doRefresh) {
    if (!this.enabled) return;
    const buf = this.buf || this.app?.buf;
    if (!buf) return;
    tcol =
      typeof tcol === "number" && Number.isFinite(tcol) ? Math.floor(tcol) : 0;
    trow =
      typeof trow === "number" && Number.isFinite(trow) ? Math.floor(trow) : 0;
    this.tempMouseCol = tcol;
    this.tempMouseRow = trow;
    if (buf) {
      buf.tempMouseCol = tcol;
      buf.tempMouseRow = trow;
    }

    // If mouse reporting is active, suppress heuristic icon switches
    const locator = buf.locator;
    if (locator?.isActive?.()) {
      buf.clearHighlight();
      const termWin = this.app?.termWin || buf.termWin;
      if (termWin && termWin.style) {
        termWin.style.cursor = "default";
      }
      if (locator.requiresMotionReports?.()) {
        const report = locator.handleMouseMove(null, { col: tcol, row: trow });
        if (report && this.app?.send) {
          this.app.send(report);
        }
      }
      return;
    }

    if (buf.nowHighlight !== trow || doRefresh) {
      buf.clearHighlight();
    }

    const site = this.app?.site || buf.site;
    const lastRowNum = site?.getLastRowNum
      ? site.getLastRowNum(buf)
      : buf.rows - 1;
    const cols = buf.cols;

    switch (buf.pageState) {
      case 0: // NORMAL
        buf.mouseCursor = 0;
        break;

      case 4: // LIST
        if (trow > 1 && trow < lastRowNum - 1) {
          this._calcListRowMouseCursor(trow, tcol, lastRowNum, cols);
        } else if (trow == 1 || trow == 2) {
          buf.mouseCursor = 2;
        } else if (trow === 0) {
          buf.mouseCursor = 4;
        } else {
          buf.mouseCursor = 5;
        }
        break;

      case 2: // LIST
        if (trow > 2 && trow < lastRowNum) {
          this._calcListRowMouseCursor(trow, tcol, lastRowNum, cols);
        } else if (trow == 1 || trow == 2) {
          if (tcol < 2) buf.mouseCursor = 8;
          else if (tcol > cols - 5) buf.mouseCursor = 9;
          else buf.mouseCursor = 2;
        } else if (trow === 0) {
          if (tcol < 2) buf.mouseCursor = 10;
          else if (tcol > cols - 5) buf.mouseCursor = 9;
          else buf.mouseCursor = 4;
        } else {
          if (tcol < 2) buf.mouseCursor = 12;
          else if (tcol > cols - 5) buf.mouseCursor = 13;
          else buf.mouseCursor = 5;
        }
        break;

      case 3: // READING
        if (trow == lastRowNum) {
          if (tcol < 2) buf.mouseCursor = 12;
          else if (tcol > cols - 5) buf.mouseCursor = 14;
          else buf.mouseCursor = 5;
        } else if (trow === 0 || trow == 1 || trow == 2) {
          if (tcol < 2) buf.mouseCursor = trow === 0 ? 10 : 8;
          else if (tcol > cols - 5) buf.mouseCursor = 9;
          else if (tcol < 7) buf.mouseCursor = 1;
          else buf.mouseCursor = 2;
        } else if (tcol < 7) buf.mouseCursor = 1;
        else if (trow < (lastRowNum + 1) / 2) buf.mouseCursor = 2;
        else buf.mouseCursor = 3;
        break;

      case 1: // MENU
        if (trow > 0 && trow < lastRowNum) {
          if (tcol > 7) buf.mouseCursor = 7;
          else buf.mouseCursor = 1;
        } else {
          buf.mouseCursor = 0;
        }
        break;

      default:
        buf.mouseCursor = 0;
        break;
    }

    const termWin = this.app?.termWin || buf.termWin;
    if (termWin && termWin.style) {
      termWin.style.cursor = MOUSE_CURSOR_MAP[buf.mouseCursor] || "auto";
    }
  }

  resetMouseCursor() {
    const buf = this.buf || this.app?.buf;
    const termWin = this.app?.termWin || buf?.termWin;
    if (termWin && termWin.style) termWin.style.cursor = "auto";
    if (buf) buf.mouseCursor = 11;
  }

  resetMousePos() {
    if (this.enabled) {
      const col = this.tempMouseCol ?? this.buf?.tempMouseCol ?? 0;
      const row = this.tempMouseRow ?? this.buf?.tempMouseRow ?? 0;
      this.onMouseMove(col, row, true);
    }
  }

  handleMouseClick(e) {
    if (!this.enabled) return false;
    const app = this.app;
    const buf = this.buf || app?.buf;
    if (!app || !app.conn || !app.conn.isConnected || !buf) {
      return false;
    }

    const locator = buf.locator;
    if (locator?.isActive?.()) {
      const cX = e?.clientX ?? 0;
      const cY = e?.clientY ?? 0;
      const pos = app.clientToPos
        ? app.clientToPos(cX, cY)
        : { col: buf.tempMouseCol || 0, row: buf.tempMouseRow || 0 };
      const report = locator.handleMouseClick(e, pos);
      if (report) {
        app.send(report);
        return true;
      }
    }

    const cX = e.clientX;
    const cY = e.clientY;

    switch (buf.mouseCursor) {
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
      case 6:
        if (buf.nowHighlight !== -1) {
          this.navigateRowAndEnter(buf.nowHighlight);
          return true;
        }
        break;
      case 7: {
        const pos = app.clientToPos ? app.clientToPos(cX, cY) : null;
        if (pos) {
          this.navigateRowAndEnter(pos.row);
          return true;
        }
        break;
      }
      case 0:
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
        break;
    }

    return false;
  }

  handleWheel(e) {
    if (!this.enabled) return false;
    const buf = this.buf || this.app?.buf;
    const locator = buf?.locator;
    if (locator?.isActive?.()) {
      const pos = this.app?.clientToPos
        ? this.app.clientToPos(e?.clientX ?? 0, e?.clientY ?? 0)
        : { col: buf.tempMouseCol || 0, row: buf.tempMouseRow || 0 };
      const report = locator.handleWheel(e, pos);
      if (report && this.app?.send) {
        this.app.send(report);
        e?.preventDefault?.();
        return true;
      }
    }
    return false;
  }
}
