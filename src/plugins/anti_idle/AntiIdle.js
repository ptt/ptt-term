import React from "preact/compat";
import { readValuesWithDefault, updatePref } from "../../js/pref.js";
import { _ } from "../../js/i18n.js";

export class AntiIdle {
  static id = "anti_idle";
  static name = "anti_idle";
  static prefKey = "enableAntiIdle";
  static group = "bbs";

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
          value: values.antiIdleTime || 60,
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

  renderOptions(props) {
    return AntiIdle.renderOptions(props);
  }

  static getMetadata() {
    return {
      id: "anti_idle",
      name: "anti_idle",
      title: _("plugin_anti_idle_title"),
      description: _("plugin_anti_idle_desc"),
      prefKey: "enableAntiIdle",
      icon: "timer",
      group: "bbs",
      renderOptions: AntiIdle.renderOptions,
    };
  }

  constructor(app, options = {}) {
    this.app = app || null;
    this.view = options.view || null;
    this.buf = options.buf || null;
    this.idleTime = 0;
    this.interval = options.interval ?? 60000;
    this.enabled = options.enabled ?? false;
  }

  get id() {
    return "anti_idle";
  }

  get name() {
    return "anti_idle";
  }

  get prefKey() {
    return "enableAntiIdle";
  }

  get group() {
    return "bbs";
  }

  get title() {
    return _("plugin_anti_idle_title");
  }

  get description() {
    return _("plugin_anti_idle_desc");
  }

  get icon() {
    return "timer";
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
      renderOptions: AntiIdle.renderOptions,
    };
  }

  init({ app, view, buf } = {}) {
    if (app) {
      this.app = app;
      this._onTickBound = (e) =>
        this.tick(e?.intervalMs ?? e?.detail?.intervalMs ?? 1000);
      this._onActivityBound = () => this.resetIdle();
      this._onPrefChangeBound = (e) => {
        const key = e?.key ?? e?.detail?.key;
        const value = e?.value !== undefined ? e.value : e?.detail?.value;
        if (key === "antiIdleTime") {
          this.setInterval(value);
        } else if (key === "enableAntiIdle") {
          this.enabled = Boolean(value);
        }
      };
      this.app.on("term:tick", this._onTickBound);
      this.app.on("term:send", this._onActivityBound);
      this.app.on("term:user-activity", this._onActivityBound);
      this.app.on("term:connect", this._onActivityBound);
      this.app.on("term:pref-change", this._onPrefChangeBound);
    }
    if (view) this.view = view;
    if (buf) this.buf = buf;
    this.syncFromPrefs();
  }

  syncFromPrefs() {
    const prefs = readValuesWithDefault();
    const timeSec = Number(prefs.antiIdleTime) || 0;
    this.enabled = Boolean(prefs.enableAntiIdle ?? (timeSec > 0));
    this.interval = (timeSec > 0 ? timeSec : 60) * 1000;
  }

  setInterval(seconds) {
    const sec = Math.max(0, Number(seconds) || 0);
    this.interval = sec * 1000;
    if (sec > 0) {
      this.enabled = true;
    }
  }

  resetIdle() {
    this.idleTime = 0;
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

  destroy() {
    this.idleTime = 0;
    if (this.app) {
      this.app.off("term:tick", this._onTickBound);
      this.app.off("term:send", this._onActivityBound);
      this.app.off("term:user-activity", this._onActivityBound);
      this.app.off("term:connect", this._onActivityBound);
      this.app.off("term:pref-change", this._onPrefChangeBound);
    }
  }
}
