import { readValuesWithDefault, updatePref } from "../../js/pref.js";
import { _ } from "../../js/i18n.js";

export const MOUSE_CURSOR_MAP = [
  "auto",
  "w-resize",
  "n-resize",
  "s-resize",
  "nw-resize",
  "sw-resize",
  "pointer",
  "pointer",
  "w-resize",
  "e-resize",
  "w-resize",
  "default",
  "w-resize",
  "e-resize",
  "e-resize",
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
    };
  }

  init({ app, view, buf } = {}) {
    if (app) this.app = app;
    if (view) this.view = view;
    if (buf) this.buf = buf;
    if (this.buf) {
      this.buf.useMouseBrowsing = this.enabled;
    }
  }

  destroy() {
    if (this.buf) {
      this.buf.useMouseBrowsing = false;
      this.buf.clearHighlight();
    }
  }

  setEnabled(val) {
    this.enabled = !!val;
    if (this.buf) {
      this.buf.useMouseBrowsing = this.enabled;
      if (!this.enabled) {
        this.buf.clearHighlight();
        this.buf.mouseCursor = 0;
        this.buf.resetMousePos();
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

  handleMouseClick(e) {
    if (!this.enabled) return false;
    const app = this.app;
    const buf = this.buf || app?.buf;
    if (!app || !app.conn || !app.conn.isConnected || !buf) {
      return false;
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
}
