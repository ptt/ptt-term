import { readValuesWithDefault, updatePref } from "../../js/pref.js";
import { _ } from "../../js/i18n.js";
import { isBrowser } from "../../js/util.js";

if (isBrowser()) {
  import('./ConnectionLog.css');
}

export function bytesToHex(bytes) {
  if (!bytes || bytes.length === 0) return "";
  const hex = [];
  for (let i = 0; i < bytes.length; i++) {
    const b = (bytes[i] & 0xff).toString(16).toUpperCase();
    hex.push(b.length === 1 ? "0" + b : b);
  }
  return hex.join(" ");
}

export class ConnectionLog {
  static id = "conn_log";
  static name = "conn_log";
  static prefKey = "captureConnectionLog";
  static group = "debug";

  static getMetadata() {
    return {
      id: "conn_log",
      name: "conn_log",
      title: _("plugin_conn_log_title"),
      description: _("plugin_conn_log_desc"),
      prefKey: "captureConnectionLog",
      icon: "terminal",
      group: "debug",
    };
  }

  constructor(app) {
    this.app = app || null;
    this.enabled = false;
    this.collapsed = false;
    this.overlay = null;
    this.contentEl = null;
    this.toggleBtn = null;
    this.currentSocket = null;
    this._onRecvBound = (e) => this._onRecv(e);
    this._onSendBound = (e) => this._onSend(e);

    this.syncFromPrefs();
  }

  get id() {
    return "conn_log";
  }

  get name() {
    return "conn_log";
  }

  get prefKey() {
    return "captureConnectionLog";
  }

  get group() {
    return "debug";
  }

  get title() {
    return _("plugin_conn_log_title");
  }

  get description() {
    return _("plugin_conn_log_desc");
  }

  get icon() {
    return "terminal";
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
      group: this.group,
    };
  }

  init({ app, view, buf } = {}) {
    if (app) {
      this.app = app;
      app.connLog = this;
      this._onPrefChangeBound = (e) => {
        if (e.detail?.key === "captureConnectionLog") {
          this.setEnabled(Boolean(e.detail.value));
        }
      };
      this._onSocketBound = (e) => {
        if (e.detail?.socket) {
          this.attachSocket(e.detail.socket);
        }
      };
      app.addEventListener?.("term:pref-change", this._onPrefChangeBound);
      app.addEventListener?.("term:socket", this._onSocketBound);
      if (app.conn?.rawSocket) {
        this.attachSocket(app.conn.rawSocket);
      }
    }
    this.syncFromPrefs();
  }

  destroy() {
    this.setEnabled(false);
    this.attachSocket(null);
    if (this.app) {
      this.app.removeEventListener?.("term:pref-change", this._onPrefChangeBound);
      this.app.removeEventListener?.("term:socket", this._onSocketBound);
    }
  }

  syncFromPrefs() {
    try {
      const prefs = readValuesWithDefault();
      if (prefs && prefs.captureConnectionLog) {
        this.setEnabled(true);
      }
    } catch (e) {}
  }

  ensureElement() {
    if (this.overlay && this.contentEl) return this.overlay;
    if (typeof document === "undefined") return null;

    let overlay = document.getElementById("connLogOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "connLogOverlay";
      overlay.className = "nomouse_command";
      overlay.style.display = "none";
      document.body.appendChild(overlay);
    }

    if (!overlay.querySelector || !overlay.querySelector("#connLogContent")) {
      overlay.innerHTML = `
        <div id="connLogHeader" class="nomouse_command">
          <div class="conn-log-header-left nomouse_command">
            <span class="conn-log-title nomouse_command">Connection Log</span>
            <span class="conn-log-legend nomouse_command">
              <span class="conn-log-legend-recv nomouse_command">■ Recv</span>
              <span class="conn-log-legend-send nomouse_command">■ Send</span>
            </span>
          </div>
          <div class="conn-log-header-right nomouse_command">
            <button type="button" class="conn-log-btn nomouse_command" id="connLogClearBtn" title="Clear">Clear</button>
            <button type="button" class="conn-log-btn nomouse_command" id="connLogToggleBtn" title="Collapse / Expand">▼</button>
            <button type="button" class="conn-log-btn nomouse_command" id="connLogCloseBtn" title="Close">✕</button>
          </div>
        </div>
        <div id="connLogContent" class="nomouse_command"></div>
      `;
    }

    this.overlay = overlay;
    this.contentEl = overlay.querySelector("#connLogContent");
    this.toggleBtn = overlay.querySelector("#connLogToggleBtn");

    const clearBtn = overlay.querySelector("#connLogClearBtn");
    if (clearBtn) {
      clearBtn.onclick = (e) => {
        e.stopPropagation();
        this.clear();
      };
    }

    if (this.toggleBtn) {
      this.toggleBtn.onclick = (e) => {
        e.stopPropagation();
        this.toggleCollapse();
      };
    }

    const header = overlay.querySelector("#connLogHeader");
    if (header) {
      header.onclick = (e) => {
        if (e.target && e.target.tagName !== "BUTTON") {
          this.toggleCollapse();
        }
      };
    }

    const closeBtn = overlay.querySelector("#connLogCloseBtn");
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        this.close();
      };
    }

    return this.overlay;
  }

  attachSocket(socket) {
    if (this.currentSocket) {
      this.currentSocket.removeEventListener("rawRecv", this._onRecvBound);
      this.currentSocket.removeEventListener("rawSend", this._onSendBound);
    }
    this.currentSocket = socket;
    if (socket) {
      socket.addEventListener("rawRecv", this._onRecvBound);
      socket.addEventListener("rawSend", this._onSendBound);
    }
  }

  _onRecv(e) {
    if (!this.enabled) return;
    this.log("recv", e.detail.data);
  }

  _onSend(e) {
    if (!this.enabled) return;
    this.log("send", e.detail.data);
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
    this.ensureElement();
    if (!this.overlay) return;

    if (this.enabled) {
      this.overlay.style.display = "flex";
      if (this.contentEl) {
        this.contentEl.scrollTop = this.contentEl.scrollHeight;
      }
    } else {
      this.overlay.style.display = "none";
    }
  }

  toggleCollapse() {
    this.collapsed = !this.collapsed;
    if (this.overlay) {
      if (this.collapsed) {
        this.overlay.classList.add("collapsed");
      } else {
        this.overlay.classList.remove("collapsed");
      }
    }
    if (this.toggleBtn) {
      this.toggleBtn.textContent = this.collapsed ? "▲" : "▼";
    }
  }

  close() {
    this.setEnabled(false);
    this.app.onPrefChange("captureConnectionLog", false);
    updatePref("captureConnectionLog", false);
  }

  clear() {
    if (this.contentEl) {
      this.contentEl.innerHTML = "";
    }
  }

  contains(target) {
    if (!this.overlay || !target) return false;
    return this.overlay === target || this.overlay.contains(target);
  }

  onAttachSocket(socket) {
    this.attachSocket(socket);
  }

  getSelectedText() {
    if (this.hasSelection()) {
      return window.getSelection().toString();
    }
    return null;
  }

  hasSelection() {
    if (!this.overlay || typeof window === "undefined") return false;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return false;
    if (sel.anchorNode && this.overlay.contains(sel.anchorNode)) return true;
    if (sel.focusNode && this.overlay.contains(sel.focusNode)) return true;
    return false;
  }

  log(direction, data) {
    if (!this.enabled) return;
    this.ensureElement();
    if (!this.contentEl) return;

    let bytes = data;
    if (typeof data === "string") {
      bytes = new Uint8Array(data.length);
      for (let i = 0; i < data.length; i++) {
        bytes[i] = data.charCodeAt(i) & 0xff;
      }
    } else if (data instanceof ArrayBuffer) {
      bytes = new Uint8Array(data);
    }

    if (!bytes || bytes.length === 0) return;

    const hexStr = bytesToHex(bytes);
    if (!hexStr) return;

    const item = document.createElement("div");
    item.className = "conn-log-item conn-log-" + direction + " nomouse_command";
    item.textContent = hexStr;

    const isAtBottom =
      this.contentEl.scrollHeight -
        this.contentEl.scrollTop -
        this.contentEl.clientHeight <
      40;

    // Cap maximum log entries in DOM
    const MAX_ENTRIES = 2000;
    while (this.contentEl.childNodes.length >= MAX_ENTRIES) {
      this.contentEl.removeChild(this.contentEl.firstChild);
    }

    this.contentEl.appendChild(item);

    if (isAtBottom) {
      this.contentEl.scrollTop = this.contentEl.scrollHeight;
    }
  }
}
