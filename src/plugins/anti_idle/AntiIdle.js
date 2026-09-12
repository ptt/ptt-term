import React from "preact/compat";
import { PluginBase } from "../PluginBase.js";
import { readValuesWithDefault } from "../../js/pref.js";
import { _ } from "../../js/i18n.js";

export class AntiIdle extends PluginBase {
  static id = "anti_idle";
  static name = "anti_idle";
  static prefKey = "enableAntiIdle";
  static group = "bbs";
  static icon = "timer";
  static DEFAULT_INTERVAL_SEC = 180;
  static defaultPrefs = {
    enableAntiIdle: false,
    antiIdleTime: 180,
  };

  static onTogglePref(checked, nextValues) {
    if (checked && (!nextValues.antiIdleTime || nextValues.antiIdleTime <= 0)) {
      return { ...nextValues, antiIdleTime: AntiIdle.DEFAULT_INTERVAL_SEC };
    }
    return nextValues;
  }

  static get title() {
    return _("plugin_anti_idle_title");
  }

  static get description() {
    return _("plugin_anti_idle_desc");
  }

  static renderOptions({ values = {}, handleNumberInputChange }) {
    return React.createElement(
      "div",
      { className: "PrefModal__MacSubOptionRow" },
      React.createElement(
        "span",
        { className: "PrefModal__MacSubLabel" },
        _("options_antiIdleTime")
      ),
      React.createElement(
        "div",
        { className: "PrefModal__MacSubInlineInput" },
        React.createElement("input", {
          className: "form-control",
          type: "number",
          name: "antiIdleTime",
          min: "1",
          value: values.antiIdleTime || AntiIdle.DEFAULT_INTERVAL_SEC,
          onChange: handleNumberInputChange,
        }),
        React.createElement(
          "span",
          { className: "PrefModal__MacSubUnit" },
          _("options_liveUpdateIntervalSec")
        )
      )
    );
  }

  constructor(app, options = {}) {
    super(app, options);
    this.idleTime = 0;
    if (this.interval === undefined) {
      this.interval = options.interval ?? AntiIdle.DEFAULT_INTERVAL_SEC * 1000;
    }
  }

  onInit() {
    this.listenApp("term:pref-change", (e) => {
      const key = e?.key ?? e?.detail?.key;
      const value = e?.value !== undefined ? e.value : e?.detail?.value;
      if (key === "antiIdleTime") {
        this.setIdleInterval(value);
      }
    });

    this.listenAppWhileEnabled("term:tick", (e) => {
      this.tick(e?.intervalMs ?? e?.detail?.intervalMs ?? 1000);
    });
    this.listenAppWhileEnabled("term:send", () => this.resetIdle());
    this.listenAppWhileEnabled("term:user-activity", () => this.resetIdle());
    this.listenAppWhileEnabled("term:connect", () => this.resetIdle());
  }

  syncFromPrefs() {
    super.syncFromPrefs();
    const appPrefs = this.app?.prefValues;
    let prefs = null;
    if ((!appPrefs || appPrefs.antiIdleTime === undefined) && this.options?.interval === undefined) {
      try {
        prefs = readValuesWithDefault();
      } catch {
        prefs = null;
      }
    }
    const rawAntiIdleTime = appPrefs?.antiIdleTime ?? prefs?.antiIdleTime;
    const timeSec = Number(rawAntiIdleTime) || 0;

    if (this.options?.interval !== undefined) {
      this.interval = this.options.interval;
    } else {
      this.interval = (timeSec > 0 ? timeSec : AntiIdle.DEFAULT_INTERVAL_SEC) * 1000;
    }
  }

  setIdleInterval(seconds) {
    const sec = Number(seconds);
    const validSec = sec > 0 ? sec : AntiIdle.DEFAULT_INTERVAL_SEC;
    this.interval = validSec * 1000;
    this.resetIdle();
  }

  resetIdle() {
    this.idleTime = 0;
  }

  onEnable() {
    this.resetIdle();
  }

  onDisable() {
    this.resetIdle();
  }

  tick(deltaMs = 1000) {
    if (!this.enabled || !this.app) return;
    if (this.app.connectState !== 1) return;

    this.idleTime += deltaMs;
    if (this.interval > 0 && this.idleTime >= this.interval) {
      this.app.emit("term:anti-idle");
      this.idleTime = 0;
    }
  }

  onDestroy() {
    this.resetIdle();
  }
}
