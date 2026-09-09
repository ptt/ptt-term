import React from "preact/compat";
import { getQueryVariable } from "../../js/util.js";
import { readValuesWithDefault, updatePref } from "../../js/pref.js";
import { _ } from "../../js/i18n.js";

export class TouchDebugHUDPlugin {
  static id = "touch_debug_hud";
  static name = "touch_debug_hud";
  static prefKey = "enableTouchDebugHUD";
  static group = "debug";

  static getMetadata() {
    return {
      id: "touch_debug_hud",
      name: "touch_debug_hud",
      title: _("plugin_touch_debug_hud_title"),
      description: _("plugin_touch_debug_hud_desc"),
      prefKey: "enableTouchDebugHUD",
      icon: "debug",
      group: "debug",
    };
  }

  constructor(app, options = {}) {
    this.app = app || null;
    this.view = options.view || null;
    this.buf = options.buf || null;
    this.enabled = options.enabled ?? false;
    this.component = null;

    this._onChanged = (e) => {
      if (e?.detail && typeof e.detail.enabled === "boolean") {
        this.enabled = e.detail.enabled;
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("term:touch-debug-changed", this._onChanged);
      window.addEventListener("touch-debug:changed", this._onChanged);
    }
  }

  get id() {
    return "touch_debug_hud";
  }

  get name() {
    return "touch_debug_hud";
  }

  get prefKey() {
    return "enableTouchDebugHUD";
  }

  get group() {
    return "debug";
  }

  get title() {
    return _("plugin_touch_debug_hud_title");
  }

  get description() {
    return _("plugin_touch_debug_hud_desc");
  }

  get icon() {
    return "debug";
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
      app.touchDebugHUD = this;
      this._onPrefChangeBound = (e) => {
        if (e.detail?.key === "enableTouchDebugHUD") {
          this.setEnabled(Boolean(e.detail.value));
        }
      };
      this._onToggleBound = () => this.toggle();
      app.addEventListener?.("term:toggle-touch-debug", this._onToggleBound);
      app.addEventListener?.("term:pref-change", this._onPrefChangeBound);
      if (typeof window !== "undefined") {
        window.addEventListener?.("term:toggle-touch-debug", this._onToggleBound);
      }
    }
    if (view) this.view = view;
    if (buf) this.buf = buf;
    this.syncFromPrefs();
  }

  syncFromPrefs() {
    try {
      const prefs = readValuesWithDefault();
      const isDebugUrl = Boolean(
        getQueryVariable("debug") ||
          (typeof window !== "undefined" &&
            window.localStorage &&
            window.localStorage.getItem("ptt_debug") === "1")
      );
      const isEnabled = Boolean(prefs?.enableTouchDebugHUD || isDebugUrl);
      this.setEnabled(isEnabled);
    } catch (e) {}
  }

  setEnabled(enabled) {
    const isEnabled = Boolean(enabled);
    this.enabled = isEnabled;
    this.app?.dispatchEvent?.(new CustomEvent("term:overlay:update"));
    this.app?.dispatchEvent?.(
      new CustomEvent("term:touch-debug-changed", {
        detail: { enabled: isEnabled },
      })
    );
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("term:touch-debug-changed", {
          detail: { enabled: isEnabled },
        })
      );
    }
    if (this.component) {
      this.component.setHudEnabled(isEnabled);
    } else if (typeof window !== "undefined") {
      if (isEnabled && window.enableTouchDebugHUD) {
        window.enableTouchDebugHUD();
      } else if (!isEnabled && window.disableTouchDebugHUD) {
        window.disableTouchDebugHUD();
      } else {
        window.dispatchEvent(
          new CustomEvent("touch-debug:changed", {
            detail: { enabled: isEnabled },
          })
        );
      }
    }
  }

  renderOverlay({ app } = {}) {
    const targetApp = app || this.app;
    return React.createElement(TouchDebugHUD, { app: targetApp });
  }

  toggle() {
    if (this.component) {
      return this.component.toggleHud();
    }
    if (typeof window !== "undefined" && window.toggleTouchDebugHUD) {
      return window.toggleTouchDebugHUD();
    }
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  isActive() {
    if (this.component && typeof this.component.state?.enabled === "boolean") {
      return Boolean(this.component.state.enabled);
    }
    if (typeof window !== "undefined" && window.isTouchDebugHUDActive) {
      return window.isTouchDebugHUDActive();
    }
    return this.enabled;
  }

  destroy() {
    this.setEnabled(false);
    if (this.app) {
      this.app.removeEventListener?.("term:toggle-touch-debug", this._onToggleBound);
      this.app.removeEventListener?.("term:pref-change", this._onPrefChangeBound);
    }
    if (typeof window !== "undefined") {
      window.removeEventListener?.("term:toggle-touch-debug", this._onToggleBound);
      if (this._onChanged) {
        window.removeEventListener("term:touch-debug-changed", this._onChanged);
        window.removeEventListener("touch-debug:changed", this._onChanged);
      }
    }
  }
}

/**
 * TouchDebugHUD provides an on-screen diagnostic interface on mobile devices
 * when ?debug=1 or ?debug=touch is present in the URL, or ptt_debug=1 in localStorage,
 * or when enableTouchDebugHUD is enabled via preferences/plugins.
 */
export class TouchDebugHUD extends React.Component {
  constructor(props) {
    super(props);
    const isDebugUrl = Boolean(
      getQueryVariable("debug") ||
        (typeof window !== "undefined" &&
          window.localStorage &&
          window.localStorage.getItem("ptt_debug") === "1")
    );
    const prefs = readValuesWithDefault();
    const isEnabled = Boolean(prefs?.enableTouchDebugHUD || isDebugUrl);

    this.state = {
      enabled: isEnabled,
      collapsed: true,
      events: [],
      copied: false,
      now: Date.now(),
    };
    this.eventListeners = [];
  }

  componentDidMount() {
    const plugin =
      this.props.app?.touchDebugHUD ||
      this.props.app?.getPlugin?.("touch_debug_hud");
    if (plugin) {
      plugin.component = this;
      if (plugin.enabled !== this.state.enabled) {
        this.setHudEnabled(plugin.enabled);
      }
    }

    if (typeof window !== "undefined") {
      window.enableTouchDebugHUD = () => this.setHudEnabled(true);
      window.disableTouchDebugHUD = () => this.setHudEnabled(false);
      window.toggleTouchDebugHUD = () => this.toggleHud();
      window.isTouchDebugHUDActive = () => Boolean(this.state.enabled);

      this.handleToggleEvent = () => {
        this.toggleHud();
      };
      window.addEventListener("term:toggle-touch-debug", this.handleToggleEvent);
      window.addEventListener("touch-debug:toggle", this.handleToggleEvent);
    }

    if (this.state.enabled) {
      this.startTimer();
      this.attachListeners();
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("term:touch-debug-changed", {
            detail: { enabled: true },
          })
        );
        window.dispatchEvent(
          new CustomEvent("touch-debug:changed", {
            detail: { enabled: true },
          })
        );
      }
    }
  }

  componentWillUnmount() {
    const plugin =
      this.props.app?.touchDebugHUD ||
      this.props.app?.getPlugin?.("touch_debug_hud");
    if (plugin && plugin.component === this) {
      plugin.component = null;
    }

    this.stopTimer();
    this.detachListeners();
    if (typeof window !== "undefined") {
      if (this.handleToggleEvent) {
        window.removeEventListener(
          "term:toggle-touch-debug",
          this.handleToggleEvent
        );
        window.removeEventListener(
          "touch-debug:toggle",
          this.handleToggleEvent
        );
        this.handleToggleEvent = null;
      }
      if (window.enableTouchDebugHUD) delete window.enableTouchDebugHUD;
      if (window.disableTouchDebugHUD) delete window.disableTouchDebugHUD;
      if (window.toggleTouchDebugHUD) delete window.toggleTouchDebugHUD;
      if (window.isTouchDebugHUDActive) delete window.isTouchDebugHUDActive;
    }
  }

  startTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.setState({ now: Date.now() });
    }, 1000);
  }

  stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  setHudEnabled(enabled) {
    const isEnabled = Boolean(enabled);
    if (this.state.enabled === isEnabled) return;

    this.setState({
      enabled: isEnabled,
      collapsed: isEnabled ? false : this.state.collapsed,
    });
    if (isEnabled) {
      this.startTimer();
      this.attachListeners();
    } else {
      this.stopTimer();
      this.detachListeners();
    }

    const plugin =
      this.props.app?.touchDebugHUD ||
      this.props.app?.getPlugin?.("touch_debug_hud");
    if (plugin) {
      plugin.enabled = isEnabled;
    }
    updatePref("enableTouchDebugHUD", isEnabled);

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("term:touch-debug-changed", {
          detail: { enabled: isEnabled },
        })
      );
      window.dispatchEvent(
        new CustomEvent("touch-debug:changed", {
          detail: { enabled: isEnabled },
        })
      );
    }
  }

  toggleHud() {
    const nextState = !this.state.enabled;
    this.setHudEnabled(nextState);
    return nextState;
  }

  attachListeners() {
    if (typeof window === "undefined") return;

    // Global debug logger for App and touch components
    window.__PTT_DEBUG_LOG = (msg) => {
      this.addEventLog(`[APP] ${msg}`);
    };

    const recordDomEvent = (e) => {
      const target = e.target;
      const desc = target
        ? `${target.tagName.toLowerCase()}${target.id ? `#${target.id}` : ""}${
            target.className && typeof target.className === "string"
              ? `.${target.className.split(" ")[0]}`
              : ""
          }`
        : "unknown";
      const coords =
        e.clientX !== undefined
          ? `(${Math.round(e.clientX)}, ${Math.round(e.clientY)})`
          : "";
      this.addEventLog(`${e.type} on ${desc} ${coords}`.trim());
    };

    const eventsToTrack = [
      "pointerdown",
      "pointerup",
      "touchstart",
      "touchend",
      "click",
      "focusin",
      "focusout",
    ];

    eventsToTrack.forEach((evt) => {
      const handler = (e) => recordDomEvent(e);
      window.addEventListener(evt, handler, { passive: true, capture: true });
      this.eventListeners.push({ evt, handler });
    });
  }

  detachListeners() {
    if (typeof window === "undefined") return;
    this.eventListeners.forEach(({ evt, handler }) => {
      window.removeEventListener(evt, handler, { capture: true });
    });
    this.eventListeners = [];
    if (window.__PTT_DEBUG_LOG) {
      delete window.__PTT_DEBUG_LOG;
    }
  }

  addEventLog(text) {
    const d = new Date();
    const ts = `${d.toTimeString().split(" ")[0]}.${String(
      d.getMilliseconds()
    ).padStart(3, "0")}`;
    this.setState((prev) => ({
      events: [{ ts, text }, ...prev.events.slice(0, 49)],
    }));
  }

  getDiagnosticsSummary() {
    const { app } = this.props;
    const input = app ? app.inputArea : document.getElementById("t");
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    const active =
      typeof document !== "undefined" ? document.activeElement : null;

    return {
      time: new Date().toISOString(),
      screen:
        typeof window !== "undefined"
          ? `${window.innerWidth}x${window.innerHeight} (dpr ${window.devicePixelRatio})`
          : "N/A",
      viewport: vv
        ? `${Math.round(vv.width)}x${Math.round(vv.height)} (top: ${Math.round(
            vv.offsetTop
          )})`
        : "N/A",
      isMobileDevice: app && app.isMobileDevice ? app.isMobileDevice() : "N/A",
      isMobileLayout: app && app.isMobileLayout ? app.isMobileLayout() : "N/A",
      maxTouchPoints:
        typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0,
      activeElement: active
        ? `${active.tagName.toLowerCase()}${active.id ? `#${active.id}` : ""}`
        : "none",
      inputMode: input ? input.getAttribute("inputmode") || "(none)" : "N/A",
      virtualKeyboardPolicy: input
        ? input.getAttribute("virtualkeyboardpolicy") || "(none)"
        : "N/A",
      inputStyle: input
        ? `left:${input.style.left}; top:${input.style.top}; w:${input.style.width}; h:${input.style.height}; op:${input.style.opacity}`
        : "N/A",
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "N/A",
    };
  }

  handleCopyReport = () => {
    const diag = this.getDiagnosticsSummary();
    const eventLines = this.state.events
      .map((e) => `  [${e.ts}] ${e.text}`)
      .join("\n");

    const report = [
      "=== PTT-TERM MOBILE TOUCH & KEYBOARD DIAGNOSTICS ===",
      `Timestamp: ${diag.time}`,
      `User Agent: ${diag.userAgent}`,
      `Screen: ${diag.screen}`,
      `Visual Viewport: ${diag.viewport}`,
      `Device Detection: MobileDevice=${diag.isMobileDevice}, MobileLayout=${diag.isMobileLayout}, TouchPoints=${diag.maxTouchPoints}`,
      `Active Element: ${diag.activeElement}`,
      `Input #t: inputmode=${diag.inputMode}, policy=${diag.virtualKeyboardPolicy}`,
      `Input Position: ${diag.inputStyle}`,
      "----------------------------------------------------",
      "Recent Events (newest first):",
      eventLines || "  (no events recorded)",
      "====================================================",
    ].join("\n");

    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(report).then(() => {
        this.setState({ copied: true });
        setTimeout(() => this.setState({ copied: false }), 2000);
      });
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = report;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    }
  };

  handleTestOpenKeyboard = () => {
    const { app } = this.props;
    if (!app || !app.inputArea) return;
    app.inputArea.style.left = "0px";
    app.inputArea.style.top = "0px";
    app.inputArea.setAttribute("inputmode", "text");
    app.inputArea.setAttribute("virtualkeyboardpolicy", "auto");
    if (app.setInputAreaFocus) {
      app.setInputAreaFocus(true);
    } else {
      app.inputArea.focus();
    }
    if (
      typeof navigator !== "undefined" &&
      navigator.virtualKeyboard &&
      navigator.virtualKeyboard.show
    ) {
      try {
        navigator.virtualKeyboard.show();
      } catch (e) {}
    }
  };

  handleTestCloseKeyboard = () => {
    const { app } = this.props;
    if (!app || !app.inputArea) return;
    app.inputArea.setAttribute("inputmode", "none");
    app.inputArea.setAttribute("virtualkeyboardpolicy", "manual");
    if (
      typeof navigator !== "undefined" &&
      navigator.virtualKeyboard &&
      navigator.virtualKeyboard.hide
    ) {
      try {
        navigator.virtualKeyboard.hide();
      } catch (e) {}
    }
    app.inputArea.blur();
  };

  handleClearEvents = () => {
    this.setState({ events: [] });
  };

  render() {
    if (!this.state.enabled) return null;

    const diag = this.getDiagnosticsSummary();
    const { collapsed, events, copied } = this.state;
    const h = React.createElement;

    if (collapsed) {
      return h(
        "div",
        {
          style: {
            position: "fixed",
            top: "8px",
            right: "8px",
            zIndex: 10000,
            background: "rgba(0, 0, 0, 0.8)",
            color: "#00ffcc",
            border: "1px solid #00ffcc",
            borderRadius: "6px",
            padding: "4px 8px",
            fontSize: "11px",
            fontFamily: "monospace",
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
          },
          onClick: () => this.setState({ collapsed: false }),
        },
        `🛠️ Debug (${events.length}) | ${diag.activeElement}`
      );
    }

    return h(
      "div",
      {
        style: {
          position: "fixed",
          top: "8px",
          right: "8px",
          maxWidth: "320px",
          width: "calc(100vw - 16px)",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          zIndex: 10000,
          background: "rgba(18, 18, 20, 0.95)",
          color: "#e0e0e0",
          border: "1px solid #00ffcc",
          borderRadius: "8px",
          padding: "8px",
          fontSize: "11px",
          fontFamily: "monospace",
          boxShadow: "0 4px 16px rgba(0,0,0,0.8)",
          boxSizing: "border-box",
        },
      },
      h(
        "div",
        {
          style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid #333",
            paddingBottom: "4px",
            marginBottom: "6px",
          },
        },
        h(
          "span",
          { style: { fontWeight: "bold", color: "#00ffcc" } },
          "🛠️ Touch / Keyboard HUD"
        ),
        h(
          "div",
          null,
          h(
            "button",
            {
              onClick: () => this.setState({ collapsed: true }),
              style: {
                background: "#333",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                padding: "2px 6px",
                fontSize: "10px",
                cursor: "pointer",
                marginRight: "4px",
              },
            },
            "Collapse"
          ),
          h(
            "button",
            {
              onClick: () => this.setHudEnabled(false),
              style: {
                background: "#551111",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                padding: "2px 6px",
                fontSize: "10px",
                cursor: "pointer",
              },
            },
            "✕"
          )
        )
      ),
      h(
        "div",
        { style: { lineHeight: "1.35", marginBottom: "6px" } },
        h(
          "div",
          null,
          h("span", { style: { color: "#888" } }, "Screen:"),
          " ",
          diag.screen
        ),
        h(
          "div",
          null,
          h("span", { style: { color: "#888" } }, "Viewport:"),
          " ",
          diag.viewport
        ),
        h(
          "div",
          null,
          h("span", { style: { color: "#888" } }, "Device:"),
          " MobileDev=",
          h(
            "span",
            { style: { color: diag.isMobileDevice ? "#00ff00" : "#ff4444" } },
            String(diag.isMobileDevice)
          ),
          " Layout=",
          h(
            "span",
            { style: { color: diag.isMobileLayout ? "#00ff00" : "#ff4444" } },
            String(diag.isMobileLayout)
          )
        ),
        h(
          "div",
          null,
          h("span", { style: { color: "#888" } }, "Active:"),
          " ",
          h(
            "span",
            {
              style: {
                color: diag.activeElement.includes("input")
                  ? "#00ffcc"
                  : "#ffaa00",
                fontWeight: "bold",
              },
            },
            diag.activeElement
          )
        ),
        h(
          "div",
          null,
          h("span", { style: { color: "#888" } }, "InputMode:"),
          " ",
          diag.inputMode,
          " | ",
          h("span", { style: { color: "#888" } }, "Policy:"),
          " ",
          diag.virtualKeyboardPolicy
        ),
        h(
          "div",
          {
            style: {
              fontSize: "10px",
              color: "#aaa",
              wordBreak: "break-all",
            },
          },
          diag.inputStyle
        )
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            gap: "4px",
            marginBottom: "6px",
            flexWrap: "wrap",
          },
        },
        h(
          "button",
          {
            onClick: this.handleCopyReport,
            style: {
              background: copied ? "#00aa55" : "#1e90ff",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              padding: "4px 8px",
              fontSize: "11px",
              fontWeight: "bold",
              cursor: "pointer",
              flex: "1 1 100%",
            },
          },
          copied ? "✓ Copied Log to Clipboard!" : "📋 Copy Log"
        ),
        h(
          "button",
          {
            onClick: this.handleTestOpenKeyboard,
            style: {
              background: "#28a745",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              padding: "3px 6px",
              fontSize: "10px",
              cursor: "pointer",
              flex: "1 1 auto",
            },
          },
          "Open Kbd"
        ),
        h(
          "button",
          {
            onClick: this.handleTestCloseKeyboard,
            style: {
              background: "#dc3545",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              padding: "3px 6px",
              fontSize: "10px",
              cursor: "pointer",
              flex: "1 1 auto",
            },
          },
          "Close Kbd"
        ),
        h(
          "button",
          {
            onClick: this.handleClearEvents,
            style: {
              background: "#444",
              color: "#ccc",
              border: "none",
              borderRadius: "4px",
              padding: "3px 6px",
              fontSize: "10px",
              cursor: "pointer",
              flex: "1 1 auto",
            },
          },
          "Clear"
        )
      ),
      h(
        "div",
        {
          style: {
            fontWeight: "bold",
            color: "#888",
            marginBottom: "2px",
          },
        },
        `Recent Events (${events.length}):`
      ),
      h(
        "div",
        {
          style: {
            overflowY: "auto",
            flex: 1,
            maxHeight: "150px",
            background: "rgba(0,0,0,0.5)",
            padding: "4px",
            borderRadius: "4px",
            fontSize: "10px",
            lineHeight: "1.3",
          },
        },
        events.length === 0
          ? h(
              "div",
              { style: { color: "#666" } },
              "No events yet. Touch screen to test."
            )
          : events.map((e, idx) =>
              h(
                "div",
                { key: idx, style: { borderBottom: "1px solid #222" } },
                h("span", { style: { color: "#888" } }, `[${e.ts}]`),
                " ",
                h(
                  "span",
                  {
                    style: {
                      color: e.text.includes("[APP]")
                        ? "#ffcc00"
                        : e.text.includes("pointerdown")
                        ? "#00ffcc"
                        : "#ffffff",
                    },
                  },
                  e.text
                )
              )
            )
      )
    );
  }
}

export default TouchDebugHUD;
