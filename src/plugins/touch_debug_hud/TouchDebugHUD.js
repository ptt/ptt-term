import React from "preact/compat";
import { PluginBase } from "../PluginBase.js";
import { getQueryVariable } from "../../js/util.js";
import { readValuesWithDefault, updatePref } from "../../js/pref.js";
import { _ } from "../../js/i18n.js";

export class TouchDebugHUDPlugin extends PluginBase {
  static id = "touch_debug_hud";
  static name = "touch_debug_hud";
  static prefKey = "enableTouchDebugHUD";
  static group = "debug";
  static icon = "debug";

  static get title() {
    return _("plugin_touch_debug_hud_title");
  }

  static get description() {
    return _("plugin_touch_debug_hud_desc");
  }

  constructor(app, options = {}) {
    super(app, options);
    this.component = null;
  }

  onInit() {
    this._onToggleBound = () => this.toggle();
    this.listenApp("term:toggle-touch-debug", this._onToggleBound);
    if (typeof window !== "undefined") {
      this.listen(window, "term:toggle-touch-debug", this._onToggleBound);
    }
  }

  syncFromPrefs() {
    super.syncFromPrefs();
    if (!this.enabled && this.options?.enabled === undefined) {
      try {
        if (Boolean(getQueryVariable("debug"))) {
          this.enabled = true;
        }
      } catch {}
    }
  }

  onEnable() {
    this._notifyState(true);
  }

  onDisable() {
    this._notifyState(false);
  }

  _notifyState(isEnabled) {
    this.app?.emit("term:touch-debug-changed", { enabled: isEnabled });
    if (this.component) {
      this.component.setHudEnabled(isEnabled, false);
    }
  }

  renderOverlay({ app } = {}) {
    if (!this.enabled) return null;
    const targetApp = app || this.app;
    return React.createElement(TouchDebugHUD, { app: targetApp, plugin: this });
  }

  toggle() {
    if (this.component) {
      return this.component.toggleHud();
    }
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  isActive() {
    if (this.component) {
      if (typeof this.component._enabled === "boolean") {
        return Boolean(this.component._enabled);
      }
      if (typeof this.component.state?.enabled === "boolean") {
        return Boolean(this.component.state.enabled);
      }
    }
    return this.enabled;
  }

  onDestroy() {
    this.component = null;
  }
}

/**
 * TouchDebugHUD provides an on-screen diagnostic interface on mobile devices
 * when ?debug=1 or ?debug=touch is present in the URL,
 * or when enableTouchDebugHUD is enabled via preferences/plugins.
 */
export class TouchDebugHUD extends React.Component {
  constructor(props) {
    super(props);
    const isDebugUrl = Boolean(getQueryVariable("debug"));
    const prefs = props.app?.prefValues || readValuesWithDefault();
    const isEnabled = props.plugin
      ? Boolean(props.plugin.enabled)
      : Boolean(prefs?.enableTouchDebugHUD || isDebugUrl);

    this._enabled = isEnabled;
    this.state = {
      enabled: isEnabled,
      collapsed: true,
      events: [],
      copied: false,
      now: Date.now(),
    };
    this.eventListeners = [];
    this.copyTimer = null;
  }

  getPlugin() {
    return this.props.plugin || this.props.app?.getPlugin?.("touch_debug_hud");
  }

  componentDidMount() {
    const isEnabled = this._enabled !== undefined ? this._enabled : Boolean(this.state?.enabled);
    const plugin = this.getPlugin();
    if (plugin) {
      plugin.component = this;
      if (plugin.enabled !== isEnabled) {
        this.setHudEnabled(plugin.enabled, false);
      }
    }

    if (typeof window !== "undefined" && !plugin) {
      this.handleToggleEvent = () => {
        this.toggleHud();
      };
      window.addEventListener("term:toggle-touch-debug", this.handleToggleEvent);
    }

    if (isEnabled) {
      this.startTimer();
      this.attachListeners();
    }
    if (!plugin && this.props.app?.on) {
      this.prefListener = (e) => {
        const key = e?.key ?? e?.detail?.key;
        const value = e?.value !== undefined ? e.value : e?.detail?.value;
        if (key === "enableTouchDebugHUD") {
          this.setHudEnabled(Boolean(value), false);
        }
      };
      this.props.app.on("term:pref-change", this.prefListener);
    }
  }

  componentDidUpdate(prevProps) {
    if (prevProps.app !== this.props.app) {
      if (prevProps.app?.unregisterDebugHandler && this._onDebugTouch) {
        prevProps.app.unregisterDebugHandler("touch", this._onDebugTouch);
        this._onDebugTouch = null;
      }
      if (this.prefListener && prevProps.app?.off) {
        prevProps.app.off("term:pref-change", this.prefListener);
        this.prefListener = null;
      }
      const plugin = this.getPlugin?.();
      if (!plugin && this.props.app?.on) {
        this.prefListener = (e) => {
          const key = e?.key ?? e?.detail?.key;
          const value = e?.value !== undefined ? e.value : e?.detail?.value;
          if (key === "enableTouchDebugHUD") {
            this.setHudEnabled(Boolean(value), false);
          }
        };
        this.props.app.on("term:pref-change", this.prefListener);
      }
      const isEnabled = this._enabled !== undefined ? this._enabled : Boolean(this.state?.enabled);
      if (isEnabled) {
        this.attachListeners();
      }
    }
  }

  componentWillUnmount() {
    const plugin = this.getPlugin();
    if (plugin && plugin.component === this) {
      plugin.component = null;
    }
    if (this.copyTimer) {
      clearTimeout(this.copyTimer);
      this.copyTimer = null;
    }
    this.stopTimer();
    this.detachListeners();
    if (typeof window !== "undefined" && this.handleToggleEvent) {
      window.removeEventListener(
        "term:toggle-touch-debug",
        this.handleToggleEvent
      );
      this.handleToggleEvent = null;
    }
    if (this.prefListener && this.props.app?.off) {
      this.props.app.off("term:pref-change", this.prefListener);
      this.prefListener = null;
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

  setHudEnabled(enabled, persist = true) {
    const isEnabled = Boolean(enabled);
    const currentEnabled = this._enabled !== undefined ? this._enabled : Boolean(this.state?.enabled);
    if (currentEnabled === isEnabled) return;
    this._enabled = isEnabled;

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

    const plugin = this.getPlugin();
    if (plugin) {
      if (plugin.enabled !== isEnabled) {
        plugin.setEnabled(isEnabled, persist);
      }
      return;
    }

    if (persist) {
      updatePref("enableTouchDebugHUD", isEnabled);
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("term:touch-debug-changed", {
          detail: { enabled: isEnabled },
        })
      );
    }
  }

  toggleHud() {
    const currentEnabled = this._enabled !== undefined ? this._enabled : Boolean(this.state?.enabled);
    const nextState = !currentEnabled;
    this.setHudEnabled(nextState);
    return nextState;
  }

  attachListeners() {
    if (typeof window === "undefined") return;
    this.detachListeners();

    // Register debug event handler on App
    const app = this.props.app || (typeof window !== "undefined" ? window.app : null);
    if (app && typeof app.registerDebugHandler === "function") {
      if (this._onDebugTouch) {
        app.unregisterDebugHandler("touch", this._onDebugTouch);
      }
      this._onDebugTouch = (event) => {
        const msg = typeof event === "string" ? event : (event?.message || String(event));
        this.addEventLog(`[APP] ${msg}`);
      };
      app.registerDebugHandler("touch", this._onDebugTouch);
    }

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

    const app = this.props.app || (typeof window !== "undefined" ? window.app : null);
    if (app && typeof app.unregisterDebugHandler === "function" && this._onDebugTouch) {
      app.unregisterDebugHandler("touch", this._onDebugTouch);
      this._onDebugTouch = null;
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
      "=== MOBILE TOUCH & KEYBOARD DIAGNOSTICS ===",
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

    const setCopiedFeedback = () => {
      this.setState({ copied: true });
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => {
        this.copyTimer = null;
        this.setState({ copied: false });
      }, 2000);
    };

    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(report).then(() => {
        setCopiedFeedback();
      });
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = report;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopiedFeedback();
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
          className: "nomouse_command",
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
        className: "nomouse_command",
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
