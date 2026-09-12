import { PluginBase } from "../PluginBase.js";
import { _ } from "../../js/i18n.js";
import { isBrowser } from "../../js/util.js";

if (isBrowser()) {
  import('./packet_dump.css');
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

export class PacketDump extends PluginBase {
  static id = "packet_dump";
  static name = "packet_dump";
  static prefKey = "enablePacketDump";
  static group = "debug";
  static icon = "terminal";

  static get title() {
    return _("plugin_packet_dump_title");
  }

  static get description() {
    return _("plugin_packet_dump_desc");
  }

  constructor(app, options = {}) {
    super(app, options);
    this.collapsed = false;
    this.overlay = null;
    this._createdOverlay = false;
    this.contentEl = null;
    this.toggleBtn = null;
    this.currentSocket = null;
    this._onRecvBound = (e) => this._onRecv(e);
    this._onSendBound = (e) => this._onSend(e);
    this._onClearClickBound = (e) => {
      e.stopPropagation();
      this.clear();
    };
    this._onToggleClickBound = (e) => {
      e.stopPropagation();
      this.toggleCollapse();
    };
    this._onHeaderClickBound = (e) => {
      if (e.target && e.target.tagName !== "BUTTON") {
        this.toggleCollapse();
      }
    };
    this._onCloseClickBound = (e) => {
      e.stopPropagation();
      this.close();
    };
  }

  onInit() {
    this.registerInputInterceptorWhileEnabled(this);
    this.listenApp("term:socket", (e) => {
      const socket = e?.socket ?? e?.detail?.socket;
      if (socket) {
        this.attachSocket(socket);
      }
    });
    const sock = this.app?.conn?.rawSocket || this.app?.conn;
    if (sock) {
      this.attachSocket(sock);
    }
  }

  scrollBottom() {
    if (this.contentEl) {
      this.contentEl.scrollTop = this.contentEl.scrollHeight;
    }
  }

  onEnable() {
    if (!this.currentSocket) {
      const sock = this.app?.conn?.rawSocket || this.app?.conn;
      if (sock) {
        this.attachSocket(sock);
      }
    }
    const overlay = this.ensureElement();
    if (overlay) {
      overlay.style.display = "flex";
      this.scrollBottom();
    }
  }

  onDisable() {
    const el = this.overlay || (typeof document !== "undefined" ? document.getElementById("packetDumpOverlay") : null);
    if (el) {
      el.style.display = "none";
    }
  }

  onDestroy() {
    this.attachSocket(null);
    if (this.overlay) {
      if (this._createdOverlay && this.overlay.parentNode) {
        this.overlay.parentNode.removeChild(this.overlay);
      } else {
        this.overlay.classList?.remove("collapsed");
        this.overlay.style.display = "none";
        this.overlay.innerHTML = "";
      }
    }
    this.collapsed = false;
    this.overlay = null;
    this._createdOverlay = false;
    this.contentEl = null;
    this.toggleBtn = null;
  }

  ensureElement() {
    if (this.overlay && this.contentEl) return this.overlay;
    if (typeof document === "undefined") return null;

    let overlay = document.getElementById("packetDumpOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "packetDumpOverlay";
      overlay.className = "nomouse_command";
      overlay.style.display = "none";
      document.body.appendChild(overlay);
      this._createdOverlay = true;
    } else if (overlay.classList) {
      if (!overlay.classList.contains("nomouse_command")) {
        overlay.classList.add("nomouse_command");
      }
    } else if (!String(overlay.className || "").includes("nomouse_command")) {
      overlay.className = `${overlay.className || ""} nomouse_command`.trim();
    }

    if (!overlay.querySelector || !overlay.querySelector("#packetDumpContent")) {
      overlay.innerHTML = `
        <div id="packetDumpHeader" class="nomouse_command">
          <div class="packet-dump-header-left nomouse_command">
            <span class="packet-dump-title nomouse_command">Packet Dump</span>
            <span class="packet-dump-legend nomouse_command">
              <span class="packet-dump-legend-recv nomouse_command">■ Recv</span>
              <span class="packet-dump-legend-send nomouse_command">■ Send</span>
            </span>
          </div>
          <div class="packet-dump-header-right nomouse_command">
            <button type="button" class="packet-dump-btn nomouse_command" id="packetDumpClearBtn" title="Clear">Clear</button>
            <button type="button" class="packet-dump-btn nomouse_command" id="packetDumpToggleBtn" title="Collapse / Expand">▼</button>
            <button type="button" class="packet-dump-btn nomouse_command" id="packetDumpCloseBtn" title="Close">✕</button>
          </div>
        </div>
        <div id="packetDumpContent" class="nomouse_command"></div>
      `;
    }

    this.overlay = overlay;
    this.contentEl = overlay.querySelector("#packetDumpContent");
    this.toggleBtn = overlay.querySelector("#packetDumpToggleBtn");

    const clearBtn = overlay.querySelector("#packetDumpClearBtn");
    if (clearBtn) {
      this.listenWhileEnabled(clearBtn, "click", this._onClearClickBound);
    }

    if (this.toggleBtn) {
      this.listenWhileEnabled(this.toggleBtn, "click", this._onToggleClickBound);
    }

    const header = overlay.querySelector("#packetDumpHeader");
    if (header) {
      this.listenWhileEnabled(header, "click", this._onHeaderClickBound);
    }

    const closeBtn = overlay.querySelector("#packetDumpCloseBtn");
    if (closeBtn) {
      this.listenWhileEnabled(closeBtn, "click", this._onCloseClickBound);
    }

    return this.overlay;
  }

  attachSocket(socket) {
    if (this.currentSocket === socket) {
      return;
    }
    if (this.currentSocket) {
      this.unlisten(this.currentSocket, "rawRecv", this._onRecvBound);
      this.unlisten(this.currentSocket, "rawSend", this._onSendBound);
    }
    this.currentSocket = socket;
    if (this.currentSocket) {
      this.listenWhileEnabled(this.currentSocket, "rawRecv", this._onRecvBound);
      this.listenWhileEnabled(this.currentSocket, "rawSend", this._onSendBound);
    }
  }

  _onRecv(e) {
    if (!this.enabled) return;
    const data = e?.detail?.data ?? e?.data;
    if (data !== undefined) {
      this.log("recv", data);
    }
  }

  _onSend(e) {
    if (!this.enabled) return;
    const data = e?.detail?.data ?? e?.data;
    if (data !== undefined) {
      this.log("send", data);
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

  isActive() {
    return this.hasSelection();
  }

  getSelectionColRow() {
    return this.hasSelection() ? null : undefined;
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
    item.className = "packet-dump-item packet-dump-" + direction + " nomouse_command";
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

export default PacketDump;
