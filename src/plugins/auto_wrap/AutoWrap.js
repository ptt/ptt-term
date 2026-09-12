import React from "preact/compat";
import { PluginBase } from "../PluginBase.js";
import { readValuesWithDefault } from "../../js/pref.js";
import { _ } from "../../js/i18n.js";
import { wrapText } from "../../js/string_util.js";

export class AutoWrap extends PluginBase {
  static id = "auto_wrap";
  static name = "auto_wrap";
  static prefKey = "enableAutoWrap";
  static group = "bbs";
  static icon = "wrap_text";

  static get title() {
    return _("plugin_auto_wrap_title");
  }

  static get description() {
    return _("plugin_auto_wrap_desc");
  }

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

  constructor(app, options = {}) {
    super(app, options);
    if (this.lineWrap === undefined) {
      this.lineWrap = options.lineWrap ?? 78;
    }
  }

  onInit(options = {}) {
    this.listenApp("term:pref-change", (e) => {
      const key = e?.key ?? e?.detail?.key;
      const value = e?.value !== undefined ? e.value : e?.detail?.value;
      if (key === "lineWrap") {
        this.setLineWrap(value);
      }
    });

    this.listenAppWhileEnabled("term:paste", (e) => {
      if (!this.lineWrap || this.lineWrap <= 0) {
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
    });

    if (options?.lineWrap !== undefined) {
      this.setLineWrap(options.lineWrap);
    }
  }

  syncFromPrefs() {
    super.syncFromPrefs();
    if (this.options?.lineWrap !== undefined) {
      this.lineWrap = this.options.lineWrap;
      return;
    }
    const appPrefs = this.app?.prefValues;
    let prefs = null;
    if (!appPrefs || appPrefs.lineWrap === undefined) {
      try {
        prefs = readValuesWithDefault();
      } catch {
        prefs = null;
      }
    }
    const rawLineWrap = appPrefs?.lineWrap ?? prefs?.lineWrap;
    const wrapCols = Number(rawLineWrap);
    this.lineWrap = wrapCols > 0 ? wrapCols : 78;
  }

  setLineWrap(cols) {
    if (cols === 0 || cols === "0") {
      this.lineWrap = 0;
      return;
    }
    const num = Math.max(0, Number(cols) || 0);
    this.lineWrap = num > 0 ? num : 78;
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
}

export const AutoWrapPlugin = AutoWrap;
export default AutoWrap;
