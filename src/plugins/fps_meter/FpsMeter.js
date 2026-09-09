import { readValuesWithDefault } from "../../js/pref.js";
import { _ } from "../../js/i18n.js";

export class FpsMeter {
  static id = "fps_meter";
  static name = "fps_meter";
  static prefKey = "showFps";
  static group = "debug";

  static getMetadata() {
    return {
      id: "fps_meter",
      name: "fps_meter",
      title: _("plugin_fps_meter_title"),
      description: _("plugin_fps_meter_desc"),
      prefKey: "showFps",
      icon: "speed",
      group: "debug",
    };
  }

  constructor(appOrOptions = {}, maybeOptions = {}) {
    let app = null;
    let options = {};
    if (
      appOrOptions &&
      (appOrOptions.view ||
        appOrOptions.buf ||
        appOrOptions.conn ||
        appOrOptions.onPrefChange ||
        appOrOptions.getPlugin ||
        appOrOptions.registerPlugin ||
        appOrOptions.addEventListener)
    ) {
      app = appOrOptions;
      options = maybeOptions || {};
    } else {
      options = appOrOptions || {};
    }

    this.app = app;
    this.enabled = false;
    this.element = null;
    this.textSpan = null;
    this.canvasBtn = null;
    this.smoothAnsiBtn = null;
    this.touchDbgBtn = null;
    this.lastFrameTime = 0;
    this.lastRenderTime = 0;
    this.lastUiUpdateTime = 0;
    this.recentDeltas = [];
    this.recentDurations = [];
    this.isCanvas = !!options.isCanvas;
    this.idleTimer = null;
    this.smoothAnsiArt =
      options.smoothAnsiArt !== undefined ? !!options.smoothAnsiArt : true;
    this.onToggleCanvas = options.onToggleCanvas || null;
    this.onToggleSmoothAnsi = options.onToggleSmoothAnsi || null;
    this.onToggleTouchDebug = options.onToggleTouchDebug || null;
    this.touchDebugChangeHandler = null;

    if (this.app) {
      this.init({ app: this.app, view: this.app.view, buf: this.app.buf });
    }
  }

  get id() {
    return "fps_meter";
  }

  get name() {
    return "fps_meter";
  }

  get prefKey() {
    return "showFps";
  }

  get group() {
    return "debug";
  }

  get title() {
    return _("plugin_fps_meter_title");
  }

  get description() {
    return _("plugin_fps_meter_desc");
  }

  get icon() {
    return "speed";
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
      app.fpsMeter = this;
      this._onPrefChangeBound = (e) => {
        const key = e.detail?.key;
        const val = e.detail?.value;
        if (key === "showFps") {
          this.setEnabled(Boolean(val));
        } else if (key === "useCanvasEngine") {
          this.setIsCanvas(Boolean(val));
        } else if (key === "smoothAnsi" || key === "smoothAnsiArt") {
          this.setSmoothAnsiArt(Boolean(val));
        }
      };
      app.addEventListener?.("term:pref-change", this._onPrefChangeBound);
      this._onRenderFrameBound = (e) => {
        if (!this.enabled) return;
        const durationMs = e.detail?.durationMs ?? 0;
        const isCanvas = e.detail?.isCanvas ?? this.isCanvas;
        this.recordFrame(durationMs, isCanvas);
      };
      app.addEventListener?.("term:render-frame", this._onRenderFrameBound);
      if (!this.onToggleCanvas) {
        this.onToggleCanvas = (isCanvas) => {
          if (this.app?.onPrefChange) {
            this.app.onPrefChange("useCanvasEngine", isCanvas);
          }
        };
      }
      if (!this.onToggleSmoothAnsi) {
        this.onToggleSmoothAnsi = (smooth) => {
          if (this.app?.onPrefChange) {
            this.app.onPrefChange("smoothAnsiArt", smooth);
          }
        };
      }
    }
    if (view) {
      this.view = view;
      if (typeof view.useCanvasEngine === "boolean") {
        this.isCanvas = view.useCanvasEngine;
      }
      if (typeof view.smoothAnsiArt === "boolean") {
        this.smoothAnsiArt = view.smoothAnsiArt;
      }
      if (this._onRenderFrameBound) {
        view.addEventListener?.("term:render-frame", this._onRenderFrameBound);
      }
    }
    if (buf) this.buf = buf;
    this.syncFromPrefs();
  }

  syncFromPrefs() {
    try {
      const prefs = readValuesWithDefault();
      if (prefs && prefs.showFps !== undefined) {
        this.setEnabled(Boolean(prefs.showFps));
      }
    } catch (e) {}
  }

  destroy() {
    this.setEnabled(false);
    if (this.app) {
      this.app.removeEventListener?.("term:pref-change", this._onPrefChangeBound);
      this.app.removeEventListener?.("term:render-frame", this._onRenderFrameBound);
    }
    if (this.view) {
      this.view.removeEventListener?.("term:render-frame", this._onRenderFrameBound);
    }
  }

  ensureElement() {
    if (!this.element && typeof document !== "undefined") {
      this.element = document.getElementById("fpsOverlay");
      if (!this.element) {
        this.element = document.createElement("div");
        this.element.id = "fpsOverlay";
        document.body.appendChild(this.element);
      }
    }
    if (this.element && !this.textSpan && typeof document !== "undefined") {
      this.element.innerHTML = "";
      this.textSpan = document.createElement("span");
      this.textSpan.className = "fps-text";
      this.element.appendChild(this.textSpan);

      const space1 = document.createTextNode(" ");
      this.element.appendChild(space1);

      this.canvasBtn = document.createElement("span");
      this.canvasBtn.className = "fps-canvas nomouse_command";
      this.canvasBtn.style.cursor = "pointer";
      this.canvasBtn.style.pointerEvents = "auto";
      this.canvasBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.toggleCanvas();
      });
      this.canvasBtn.addEventListener("mousedown", (e) => {
        e.stopPropagation();
      });
      this.element.appendChild(this.canvasBtn);

      this.smoothAnsiBtn = document.createElement("span");
      this.smoothAnsiBtn.className = "fps-smooth-ansi nomouse_command";
      this.smoothAnsiBtn.style.cursor = "pointer";
      this.smoothAnsiBtn.style.pointerEvents = "auto";
      this.smoothAnsiBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.toggleSmoothAnsi();
      });
      this.smoothAnsiBtn.addEventListener("mousedown", (e) => {
        e.stopPropagation();
      });
      this.element.appendChild(this.smoothAnsiBtn);

      this.touchDbgBtn = document.createElement("span");
      this.touchDbgBtn.className = "fps-touch-dbg nomouse_command";
      this.touchDbgBtn.style.cursor = "pointer";
      this.touchDbgBtn.style.pointerEvents = "auto";
      this.touchDbgBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.toggleTouchDebug();
      });
      this.touchDbgBtn.addEventListener("mousedown", (e) => {
        e.stopPropagation();
      });
      this.element.appendChild(this.touchDbgBtn);
    }
    return this.element;
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
    const el = this.ensureElement();
    if (!el) return;

    if (this.enabled) {
      el.style.display = "block";
      this.reset();
      this.updateDisplay(
        typeof performance !== "undefined" ? performance.now() : Date.now(),
        true
      );
      this.startIdleChecker();
      if (typeof window !== "undefined" && !this.touchDebugChangeHandler) {
        this.touchDebugChangeHandler = () => {
          const now =
            typeof performance !== "undefined"
              ? performance.now()
              : Date.now();
          this.updateDisplay(now, false);
        };
        window.addEventListener(
          "term:touch-debug-changed",
          this.touchDebugChangeHandler
        );
        window.addEventListener(
          "touch-debug:changed",
          this.touchDebugChangeHandler
        );
      }
    } else {
      el.style.display = "none";
      this.stopIdleChecker();
      this.reset();
      if (typeof window !== "undefined" && this.touchDebugChangeHandler) {
        window.removeEventListener(
          "term:touch-debug-changed",
          this.touchDebugChangeHandler
        );
        window.removeEventListener(
          "touch-debug:changed",
          this.touchDebugChangeHandler
        );
        this.touchDebugChangeHandler = null;
      }
    }
  }

  reset() {
    this.lastFrameTime = 0;
    this.lastRenderTime = 0;
    this.lastUiUpdateTime = 0;
    this.recentDeltas = [];
    this.recentDurations = [];
  }

  startIdleChecker() {
    this.stopIdleChecker();
    this.idleTimer = setInterval(() => {
      if (!this.enabled) return;
      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      if (this.lastRenderTime > 0 && now - this.lastRenderTime > 800) {
        this.recentDeltas = [];
        this.updateDisplay(now, false);
      }
    }, 400);
    if (this.idleTimer && this.idleTimer.unref) {
      this.idleTimer.unref();
    }
  }

  stopIdleChecker() {
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
  }

  recordFrame(renderDurationMs, isCanvas) {
    if (!this.enabled) return;

    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    this.isCanvas = !!isCanvas;
    this.lastRenderTime = now;

    if (typeof renderDurationMs === "number" && renderDurationMs >= 0) {
      this.recentDurations.push(renderDurationMs);
      if (this.recentDurations.length > 20) {
        this.recentDurations.shift();
      }
    }

    if (this.lastFrameTime > 0) {
      const delta = now - this.lastFrameTime;
      // Only treat frames within 1 second as continuous rendering
      if (delta > 0 && delta < 1000) {
        this.recentDeltas.push(delta);
        if (this.recentDeltas.length > 20) {
          this.recentDeltas.shift();
        }
      } else {
        // Gap too large: reset rolling deltas for a fresh burst
        this.recentDeltas = [];
      }
    }
    this.lastFrameTime = now;

    // Throttle UI update to avoid DOM overhead affecting FPS
    if (now - this.lastUiUpdateTime >= 200) {
      this.updateDisplay(now, false);
    }
  }

  updateDisplay(now, forceIdle) {
    if (!this.enabled || !this.element) return;

    let fpsText = "--";
    if (
      !forceIdle &&
      this.recentDeltas.length > 0 &&
      now - this.lastRenderTime <= 800
    ) {
      const avgDelta =
        this.recentDeltas.reduce((a, b) => a + b, 0) / this.recentDeltas.length;
      const fps = avgDelta > 0 ? 1000 / avgDelta : 0;
      fpsText = fps.toFixed(1);
    } else if (this.lastRenderTime > 0) {
      fpsText = "0.0";
    }

    let durationText = "--";
    if (this.recentDurations.length > 0) {
      const avgDuration =
        this.recentDurations.reduce((a, b) => a + b, 0) /
        this.recentDurations.length;
      durationText = avgDuration.toFixed(1);
    }

    const engine = this.isCanvas ? "Canvas" : "DOM";
    const mainText = `FPS: ${fpsText} (${durationText} ms)`;
    const canvasText = `[${engine}]`;
    const ansiText = this.smoothAnsiArt ? "[SmoothANSI]" : "[OriginalANSI]";
    const hud = this.app?.getPlugin?.("touch_debug_hud") || this.app?.touchDebugHUD;
    const isTouchDbgOn = hud
      ? hud.isActive()
      : typeof window !== "undefined" && window.isTouchDebugHUDActive
      ? window.isTouchDebugHUDActive()
      : false;
    const touchDbgText = "[TouchDbg]";

    if (
      this.textSpan &&
      this.canvasBtn &&
      this.smoothAnsiBtn &&
      this.touchDbgBtn
    ) {
      this.textSpan.textContent = mainText;
      this.canvasBtn.textContent = canvasText;
      this.smoothAnsiBtn.textContent = ansiText;
      this.touchDbgBtn.textContent = touchDbgText;
      if (isTouchDbgOn) {
        if (this.touchDbgBtn.classList && this.touchDbgBtn.classList.add) {
          this.touchDbgBtn.classList.add("active");
        } else {
          this.touchDbgBtn.className = "fps-touch-dbg nomouse_command active";
        }
      } else {
        if (this.touchDbgBtn.classList && this.touchDbgBtn.classList.remove) {
          this.touchDbgBtn.classList.remove("active");
        } else {
          this.touchDbgBtn.className = "fps-touch-dbg nomouse_command";
        }
      }
    } else {
      this.element.textContent = `${mainText} ${canvasText}${ansiText}${touchDbgText}`;
    }
    this.lastUiUpdateTime = now;
  }

  toggleCanvas() {
    this.isCanvas = !this.isCanvas;
    if (this.onToggleCanvas) {
      this.onToggleCanvas(this.isCanvas);
    }
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    this.updateDisplay(now, false);
  }

  setIsCanvas(isCanvas) {
    this.isCanvas = !!isCanvas;
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    this.updateDisplay(now, false);
  }

  toggleSmoothAnsi() {
    this.smoothAnsiArt = !this.smoothAnsiArt;
    if (this.onToggleSmoothAnsi) {
      this.onToggleSmoothAnsi(this.smoothAnsiArt);
    }
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    this.updateDisplay(now, false);
  }

  setSmoothAnsiArt(enabled) {
    this.smoothAnsiArt = !!enabled;
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    this.updateDisplay(now, false);
  }

  toggleTouchDebug() {
    const hud = this.app?.getPlugin?.("touch_debug_hud") || this.app?.touchDebugHUD;
    if (this.onToggleTouchDebug) {
      this.onToggleTouchDebug();
    } else if (hud) {
      hud.toggle();
    } else if (typeof window !== "undefined") {
      if (window.toggleTouchDebugHUD) {
        window.toggleTouchDebugHUD();
      } else {
        window.dispatchEvent(new CustomEvent("term:toggle-touch-debug"));
      }
    }
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    this.updateDisplay(now, false);
  }
}

export default FpsMeter;
