import React from "preact/compat";
import { readValuesWithDefault } from "../../js/pref.js";
import { _ } from "../../js/i18n.js";
import { wrapText } from "../../js/string_util.js";

export class AutoWrap {
  static id = "auto_wrap";
  static name = "auto_wrap";
  static prefKey = "enableAutoWrap";
  static group = "bbs";

  static renderOptions({ values = {}, handleNumberInputChange }) {
    return React.createElement(
      "div",
      { className: "PrefModal__MacSubOptionRow" },
      React.createElement(
        "span",
        { className: "PrefModal__MacSubLabel" },
        _("options_lineWrap")
      ),
      React.createElement(
        "div",
        { className: "PrefModal__MacSubInlineInput" },
        React.createElement("input", {
          className: "form-control",
          type: "number",
          name: "lineWrap",
          min: "1",
          value: values.lineWrap || 78,
          onChange: handleNumberInputChange,
        }),
        React.createElement(
          "span",
          { className: "PrefModal__MacSubUnit" },
          _("options_lineWrap_unit")
        )
      )
    );
  }

  renderOptions(props) {
    return AutoWrap.renderOptions(props);
  }

  static getMetadata() {
    return {
      id: "auto_wrap",
      name: "auto_wrap",
      title: _("plugin_auto_wrap_title"),
      description: _("plugin_auto_wrap_desc"),
      prefKey: "enableAutoWrap",
      icon: "wrap_text",
      group: "bbs",
      renderOptions: AutoWrap.renderOptions,
    };
  }

  constructor(app, options = {}) {
    this.app = app || null;
    this.view = options.view || null;
    this.buf = options.buf || null;
    this.lineWrap = options.lineWrap ?? 78;
    this.enabled = options.enabled ?? true;
    if (app) {
      this.init({ app, view: this.view, buf: this.buf, lineWrap: this.lineWrap, enabled: this.enabled });
    }
  }

  get id() {
    return "auto_wrap";
  }

  get name() {
    return "auto_wrap";
  }

  get prefKey() {
    return "enableAutoWrap";
  }

  get group() {
    return "bbs";
  }

  get title() {
    return _("plugin_auto_wrap_title");
  }

  get description() {
    return _("plugin_auto_wrap_desc");
  }

  get icon() {
    return "wrap_text";
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
      renderOptions: AutoWrap.renderOptions,
    };
  }

  init(options = {}) {
    const { app, core, view, buf, lineWrap, enabled } = options || {};
    const targetApp = app || core;
    if (targetApp) {
      if (this.app && this._onPrefChangeBound && this.app !== targetApp) {
        this.destroy();
      }
      this.app = targetApp;
      if (!this._onPrefChangeBound) {
        this._onPrefChangeBound = (e) => {
          const { key, value } = e.detail || {};
          if (key === "lineWrap") {
            this.setLineWrap(value);
          } else if (key === "enableAutoWrap") {
            this.enabled = Boolean(value);
            this.syncView();
          }
        };
        this.app.addEventListener?.("term:pref-change", this._onPrefChangeBound);
      }
      if (!this._onPasteBound) {
        this._onPasteBound = (e) => {
          if (!this.enabled || !this.lineWrap || this.lineWrap <= 0) {
            return;
          }
          const text = e.data ?? e.detail?.data ?? e.detail?.text;
          if (typeof text === "string") {
            const wrapped = this.wrap(text);
            if (e.detail) {
              e.detail.data = wrapped;
              e.detail.text = wrapped;
            }
            e.data = wrapped;
          }
        };
        this.app.addEventListener?.("term:paste", this._onPasteBound);
      }
    }
    if (view) this.view = view;
    if (buf) this.buf = buf;
    this.syncFromPrefs();
    if (lineWrap !== undefined) {
      this.setLineWrap(lineWrap);
    }
    if (enabled !== undefined) {
      this.enabled = Boolean(enabled);
    }
  }

  syncFromPrefs() {
    const prefs = readValuesWithDefault();
    const wrapCols = Number(prefs.lineWrap);
    this.lineWrap = wrapCols > 0 ? wrapCols : 78;
    this.enabled = Boolean(prefs.enableAutoWrap ?? (wrapCols > 0));
    this.syncView();
  }

  setLineWrap(cols) {
    const num = Math.max(0, Number(cols) || 0);
    this.lineWrap = num > 0 ? num : 78;
    this.syncView();
  }

  syncView() {
    if (this.view && "lineWrap" in this.view) {
      this.view.lineWrap = (this.enabled && this.lineWrap > 0) ? this.lineWrap : 0;
    }
  }

  wrap(text, enterChar = "\r") {
    if (!this.enabled || !this.lineWrap || this.lineWrap <= 0) {
      return text;
    }
    if (typeof text !== "string" || text.indexOf("\x1b") >= 0) {
      return text;
    }
    return wrapText(text, this.lineWrap, enterChar);
  }

  transformPaste(text, enterChar = "\r") {
    return this.wrap(text, enterChar);
  }

  destroy() {
    if (this.app) {
      if (this._onPrefChangeBound) {
        this.app.removeEventListener?.("term:pref-change", this._onPrefChangeBound);
        this._onPrefChangeBound = null;
      }
      if (this._onPasteBound) {
        this.app.removeEventListener?.("term:paste", this._onPasteBound);
        this._onPasteBound = null;
      }
    }
  }
}

export const AutoWrapPlugin = AutoWrap;
export default AutoWrap;
