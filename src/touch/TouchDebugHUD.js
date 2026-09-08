import React from "react";
import { getQueryVariable } from "../js/util.js";

/**
 * TouchDebugHUD provides an on-screen diagnostic interface on mobile devices
 * when ?debug=1 or ?debug=touch is present in the URL, or ptt_debug=1 in localStorage.
 * It tracks real-time focus, input attributes, viewport metrics, and recent events,
 * allowing instant clipboard copying of diagnostic reports.
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

    this.state = {
      enabled: isDebugUrl,
      collapsed: true,
      events: [],
      copied: false,
      now: Date.now(),
    };
    this.eventListeners = [];
  }

  componentDidMount() {
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
          new CustomEvent("term:touch-debug-changed", { detail: { enabled: true } })
        );
        window.dispatchEvent(
          new CustomEvent("touch-debug:changed", { detail: { enabled: true } })
        );
      }
    }
  }

  componentWillUnmount() {
    this.stopTimer();
    this.detachListeners();
    if (typeof window !== "undefined") {
      if (this.handleToggleEvent) {
        window.removeEventListener("term:toggle-touch-debug", this.handleToggleEvent);
        window.removeEventListener("touch-debug:toggle", this.handleToggleEvent);
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

    this.setState({ enabled: isEnabled, collapsed: isEnabled ? false : this.state.collapsed });
    if (isEnabled) {
      this.startTimer();
      this.attachListeners();
    } else {
      this.stopTimer();
      this.detachListeners();
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("term:touch-debug-changed", { detail: { enabled: isEnabled } })
      );
      window.dispatchEvent(
        new CustomEvent("touch-debug:changed", { detail: { enabled: isEnabled } })
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
    const active = typeof document !== "undefined" ? document.activeElement : null;

    return {
      time: new Date().toISOString(),
      screen: typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight} (dpr ${window.devicePixelRatio})` : "N/A",
      viewport: vv ? `${Math.round(vv.width)}x${Math.round(vv.height)} (top: ${Math.round(vv.offsetTop)})` : "N/A",
      isMobileDevice: app && app.isMobileDevice ? app.isMobileDevice() : "N/A",
      isMobileLayout: app && app.isMobileLayout ? app.isMobileLayout() : "N/A",
      maxTouchPoints: typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0,
      activeElement: active ? `${active.tagName.toLowerCase()}${active.id ? `#${active.id}` : ""}` : "none",
      inputMode: input ? input.getAttribute("inputmode") || "(none)" : "N/A",
      virtualKeyboardPolicy: input ? input.getAttribute("virtualkeyboardpolicy") || "(none)" : "N/A",
      inputStyle: input ? `left:${input.style.left}; top:${input.style.top}; w:${input.style.width}; h:${input.style.height}; op:${input.style.opacity}` : "N/A",
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
    if (typeof navigator !== "undefined" && navigator.virtualKeyboard && navigator.virtualKeyboard.show) {
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
    if (typeof navigator !== "undefined" && navigator.virtualKeyboard && navigator.virtualKeyboard.hide) {
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

    if (collapsed) {
      return (
        <div
          style={{
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
          }}
          onClick={() => this.setState({ collapsed: false })}
        >
          🛠️ Debug ({events.length}) | {diag.activeElement}
        </div>
      );
    }

    return (
      <div
        style={{
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
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid #333",
            paddingBottom: "4px",
            marginBottom: "6px",
          }}
        >
          <span style={{ fontWeight: "bold", color: "#00ffcc" }}>
            🛠️ Touch / Keyboard HUD
          </span>
          <div>
            <button
              onClick={() => this.setState({ collapsed: true })}
              style={{
                background: "#333",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                padding: "2px 6px",
                fontSize: "10px",
                cursor: "pointer",
                marginRight: "4px",
              }}
            >
              Collapse
            </button>
            <button
              onClick={() => this.setHudEnabled(false)}
              style={{
                background: "#551111",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                padding: "2px 6px",
                fontSize: "10px",
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>
        </div>

        <div style={{ lineHeight: "1.35", marginBottom: "6px" }}>
          <div>
            <span style={{ color: "#888" }}>Screen:</span> {diag.screen}
          </div>
          <div>
            <span style={{ color: "#888" }}>Viewport:</span> {diag.viewport}
          </div>
          <div>
            <span style={{ color: "#888" }}>Device:</span> MobileDev=
            <span style={{ color: diag.isMobileDevice ? "#00ff00" : "#ff4444" }}>
              {String(diag.isMobileDevice)}
            </span>{" "}
            Layout=
            <span style={{ color: diag.isMobileLayout ? "#00ff00" : "#ff4444" }}>
              {String(diag.isMobileLayout)}
            </span>
          </div>
          <div>
            <span style={{ color: "#888" }}>Active:</span>{" "}
            <span
              style={{
                color: diag.activeElement.includes("input")
                  ? "#00ffcc"
                  : "#ffaa00",
                fontWeight: "bold",
              }}
            >
              {diag.activeElement}
            </span>
          </div>
          <div>
            <span style={{ color: "#888" }}>InputMode:</span> {diag.inputMode} |{" "}
            <span style={{ color: "#888" }}>Policy:</span>{" "}
            {diag.virtualKeyboardPolicy}
          </div>
          <div style={{ fontSize: "10px", color: "#aaa", wordBreak: "break-all" }}>
            {diag.inputStyle}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: "4px",
            marginBottom: "6px",
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={this.handleCopyReport}
            style={{
              background: copied ? "#00aa55" : "#1e90ff",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              padding: "4px 8px",
              fontSize: "11px",
              fontWeight: "bold",
              cursor: "pointer",
              flex: "1 1 100%",
            }}
          >
            {copied ? "✓ Copied Log to Clipboard!" : "📋 Copy Log"}
          </button>
          <button
            onClick={this.handleTestOpenKeyboard}
            style={{
              background: "#28a745",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              padding: "3px 6px",
              fontSize: "10px",
              cursor: "pointer",
              flex: "1 1 auto",
            }}
          >
            Open Kbd
          </button>
          <button
            onClick={this.handleTestCloseKeyboard}
            style={{
              background: "#dc3545",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              padding: "3px 6px",
              fontSize: "10px",
              cursor: "pointer",
              flex: "1 1 auto",
            }}
          >
            Close Kbd
          </button>
          <button
            onClick={this.handleClearEvents}
            style={{
              background: "#444",
              color: "#ccc",
              border: "none",
              borderRadius: "4px",
              padding: "3px 6px",
              fontSize: "10px",
              cursor: "pointer",
              flex: "1 1 auto",
            }}
          >
            Clear
          </button>
        </div>

        <div style={{ fontWeight: "bold", color: "#888", marginBottom: "2px" }}>
          Recent Events ({events.length}):
        </div>
        <div
          style={{
            overflowY: "auto",
            flex: 1,
            maxHeight: "150px",
            background: "rgba(0,0,0,0.5)",
            padding: "4px",
            borderRadius: "4px",
            fontSize: "10px",
            lineHeight: "1.3",
          }}
        >
          {events.length === 0 ? (
            <div style={{ color: "#666" }}>No events yet. Touch screen to test.</div>
          ) : (
            events.map((e, idx) => (
              <div key={idx} style={{ borderBottom: "1px solid #222" }}>
                <span style={{ color: "#888" }}>[{e.ts}]</span>{" "}
                <span
                  style={{
                    color: e.text.includes("[APP]")
                      ? "#ffcc00"
                      : e.text.includes("pointerdown")
                      ? "#00ffcc"
                      : "#ffffff",
                  }}
                >
                  {e.text}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }
}

export default TouchDebugHUD;
