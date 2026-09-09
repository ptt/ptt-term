import { readValuesWithDefault, updatePref } from "../../js/pref.js";
import { _ } from "../../js/i18n.js";

export class AntiIdle {
  static id = "anti_idle";
  static name = "anti_idle";
  static prefKey = "enableAntiIdle";

  static getMetadata() {
    return {
      id: "anti_idle",
      name: "anti_idle",
      title: _("plugin_anti_idle_title"),
      description: _("plugin_anti_idle_desc"),
      prefKey: "enableAntiIdle",
      icon: "timer",
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
    };
  }

  init({ app, view, buf } = {}) {
    if (app) {
      this.app = app;
      this._onTickBound = (e) => this.tick(e.detail?.intervalMs || 1000);
      this._onActivityBound = () => this.resetIdle();
      this._onPrefChangeBound = (e) => {
        const { key, value } = e.detail || {};
        if (key === "antiIdleTime") {
          this.setInterval(value);
        } else if (key === "enableAntiIdle") {
          this.enabled = Boolean(value);
        }
      };
      app.addEventListener?.("term:tick", this._onTickBound);
      app.addEventListener?.("term:send", this._onActivityBound);
      app.addEventListener?.("term:user-activity", this._onActivityBound);
      app.addEventListener?.("term:connect", this._onActivityBound);
      app.addEventListener?.("term:pref-change", this._onPrefChangeBound);
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
    const conn = this.app.stream || this.app.conn;
    if (!conn || this.app.connectState !== 1) return;

    this.idleTime += deltaMs;
    if (this.interval > 0 && this.idleTime >= this.interval) {
      if (this.app.site) {
        this.app.site.sendAntiIdle(conn);
      }
      this.idleTime = 0;
    }
  }

  destroy() {
    this.idleTime = 0;
    if (this.app) {
      this.app.removeEventListener?.("term:tick", this._onTickBound);
      this.app.removeEventListener?.("term:send", this._onActivityBound);
      this.app.removeEventListener?.("term:user-activity", this._onActivityBound);
      this.app.removeEventListener?.("term:connect", this._onActivityBound);
      this.app.removeEventListener?.("term:pref-change", this._onPrefChangeBound);
    }
  }
}
