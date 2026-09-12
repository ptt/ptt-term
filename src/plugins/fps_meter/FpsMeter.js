import { PluginBase } from "../PluginBase.js";
import { _ } from "../../js/i18n.js";
import { updatePref } from "../../js/pref.js";

export class FpsMeter extends PluginBase {
  static id = "fps_meter";
  static name = "fps_meter";
  static prefKey = "enableFpsMeter";
  static group = "debug";
  static icon = "speed";
  static defaultPrefs = {
    enableFpsMeter: false,
  };

  static get title() {
    return _("plugin_fps_meter_title");
  }

  static get description() {
    return _("plugin_fps_meter_desc");
  }

  constructor(app, options = {}) {
    super(app, options);

    this.element = options.element || null;
    this._createdElement = false;
    this.textSpan = null;
    this.canvasBtn = null;
    this.smoothAnsiBtn = null;
    this.lastFrameTime = 0;
    this.lastRenderTime = 0;
    this.lastUiUpdateTime = 0;
    this.recentDeltas = [];
    this.recentDurations = [];
    this.isCanvas = !!this.options.isCanvas;
    this.idleTimer = null;
    this.smoothAnsiArt =
      this.options.smoothAnsiArt !== undefined ? !!this.options.smoothAnsiArt : true;
    this.onToggleCanvas = this.options.onToggleCanvas || null;
    this.onToggleSmoothAnsi = this.options.onToggleSmoothAnsi || null;
  }

  onInit() {
    this.listenApp("term:pref-change", (e) => {
      const key = e?.key ?? e?.detail?.key;
      const val = e?.value !== undefined ? e.value : e?.detail?.value;
      if (key === "useCanvasEngine") {
        this.setIsCanvas(Boolean(val));
      } else if (key === "smoothAnsiArt") {
        this.setSmoothAnsiArt(Boolean(val));
      }
    });

    this.listenAppWhileEnabled("term:render-frame", (e) => {
      const durationMs = e?.durationMs ?? e?.detail?.durationMs ?? 0;
      const isCanvas = e?.isCanvas ?? e?.detail?.isCanvas ?? this.isCanvas;
      this.recordFrame(durationMs, isCanvas);
    });

    if (!this.onToggleCanvas) {
      this.onToggleCanvas = (isCanvas) => {
        if (this.app?.prefValues) {
          this.app.prefValues.useCanvasEngine = isCanvas;
        }
        updatePref("useCanvasEngine", isCanvas);
        if (this.app?.onPrefChange) {
          this.app.onPrefChange("useCanvasEngine", isCanvas);
        }
      };
    }
    if (!this.onToggleSmoothAnsi) {
      this.onToggleSmoothAnsi = (smooth) => {
        if (this.app?.prefValues) {
          this.app.prefValues.smoothAnsiArt = smooth;
        }
        updatePref("smoothAnsiArt", smooth);
        if (this.app?.onPrefChange) {
          this.app.onPrefChange("smoothAnsiArt", smooth);
        }
      };
    }

    if (this.view) {
      if (typeof this.view.useCanvasEngine === "boolean") {
        this.isCanvas = this.view.useCanvasEngine;
      }
      if (typeof this.view.smoothAnsiArt === "boolean") {
        this.smoothAnsiArt = this.view.smoothAnsiArt;
      }
    }
  }

  onEnable() {
    const el = this.ensureElement();
    if (el) el.style.display = "block";
    this.reset();
    this.updateDisplay(
      typeof performance !== "undefined" ? performance.now() : Date.now(),
      true
    );
    this.startIdleChecker();
  }

  onDisable() {
    const el = this.element || (typeof document !== "undefined" ? document.getElementById("fpsOverlay") : null);
    if (el) el.style.display = "none";
    this.stopIdleChecker();
    this.reset();
  }

  onDestroy() {
    this.stopIdleChecker();
    this.reset();
    if (this.element) {
      if (this._createdElement && this.element.parentNode) {
        this.element.parentNode.removeChild(this.element);
      } else {
        this.element.style.display = "none";
        this.element.innerHTML = "";
      }
    }
    this.element = null;
    this._createdElement = false;
    this.textSpan = null;
    this.canvasBtn = null;
    this.smoothAnsiBtn = null;
  }

  ensureElement() {
    if (!this.element && typeof document !== "undefined") {
      this.element = document.getElementById("fpsOverlay");
      if (!this.element) {
        this.element = document.createElement("div");
        this.element.id = "fpsOverlay";
        document.body.appendChild(this.element);
        this._createdElement = true;
      }
    }
    if (this.element) {
      if (this.element.classList) {
        if (!this.element.classList.contains("nomouse_command")) {
          this.element.classList.add("nomouse_command");
        }
      } else if (!String(this.element.className || "").includes("nomouse_command")) {
        this.element.className = `${this.element.className || ""} nomouse_command`.trim();
      }
    }
    if (this.element && !this.textSpan && typeof document !== "undefined") {
      this.element.innerHTML = "";
      this.textSpan = document.createElement("span");
      this.textSpan.className = "fps-text nomouse_command";
      this.element.appendChild(this.textSpan);

      const space1 = document.createTextNode(" ");
      this.element.appendChild(space1);

      this.canvasBtn = document.createElement("span");
      this.canvasBtn.className = "fps-canvas nomouse_command";
      this.canvasBtn.style.cursor = "pointer";
      this.canvasBtn.style.pointerEvents = "auto";
      this.listenWhileEnabled(this.canvasBtn, "click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.toggleCanvas();
      });
      this.listenWhileEnabled(this.canvasBtn, "mousedown", (e) => {
        e.stopPropagation();
      });
      this.element.appendChild(this.canvasBtn);

      this.smoothAnsiBtn = document.createElement("span");
      this.smoothAnsiBtn.className = "fps-smooth-ansi nomouse_command";
      this.smoothAnsiBtn.style.cursor = "pointer";
      this.smoothAnsiBtn.style.pointerEvents = "auto";
      this.listenWhileEnabled(this.smoothAnsiBtn, "click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.toggleSmoothAnsi();
      });
      this.listenWhileEnabled(this.smoothAnsiBtn, "mousedown", (e) => {
        e.stopPropagation();
      });
      this.element.appendChild(this.smoothAnsiBtn);
    }
    return this.element;
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
    this.idleTimer = this.setInterval(() => {
      if (!this.enabled) return;
      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      if (this.lastRenderTime > 0 && now - this.lastRenderTime > 800) {
        this.recentDeltas = [];
        this.updateDisplay(now, false);
      }
    }, 400);
  }

  stopIdleChecker() {
    if (this.idleTimer) {
      this.clearInterval(this.idleTimer);
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
    if (this.textSpan && this.canvasBtn && this.smoothAnsiBtn) {
      this.textSpan.textContent = mainText;
      this.canvasBtn.textContent = canvasText;
      this.smoothAnsiBtn.textContent = ansiText;
    } else {
      this.element.textContent = `${mainText} ${canvasText}${ansiText}`;
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
}

export default FpsMeter;
