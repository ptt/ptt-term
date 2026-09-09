import React from "preact/compat";
import { readValuesWithDefault } from "../../js/pref.js";
import { _ } from "../../js/i18n.js";
import { isBrowser } from "../../js/util.js";

let _TouchKeyboard = null;

export class VirtualKeyboardOverlay extends (React?.Component || class {}) {
  constructor(props) {
    super(props);
    this.state = { Component: _TouchKeyboard };
  }

  componentDidMount() {
    if (!this.state.Component && isBrowser()) {
      import("../../touch/TouchKeyboard.js")
        .then((mod) => {
          _TouchKeyboard = mod.TouchKeyboard || mod.default;
          this.setState({ Component: _TouchKeyboard });
        })
        .catch(() => {});
    }
  }

  render() {
    const Component = this.state.Component;
    if (!Component) return null;
    return React.createElement(Component, this.props);
  }
}

export class VirtualKeyboardPlugin {
  static id = "virtual_keyboard";
  static name = "virtual_keyboard";
  static prefKey = "enableVirtualKeyboard";
  static group = "ui";

  static getMetadata() {
    return {
      id: "virtual_keyboard",
      name: "virtual_keyboard",
      title: _("plugin_virtual_keyboard_title"),
      description: _("plugin_virtual_keyboard_desc"),
      prefKey: "enableVirtualKeyboard",
      icon: "keyboard",
      group: "ui",
    };
  }

  constructor(app, options = {}) {
    this.app = app || null;
    this.view = options.view || null;
    this.buf = options.buf || null;
    this.enabled = options.enabled ?? false;
    this._onPrefChangeBound = null;
  }

  get id() {
    return "virtual_keyboard";
  }

  get name() {
    return "virtual_keyboard";
  }

  get prefKey() {
    return "enableVirtualKeyboard";
  }

  get group() {
    return "ui";
  }

  get title() {
    return _("plugin_virtual_keyboard_title");
  }

  get description() {
    return _("plugin_virtual_keyboard_desc");
  }

  get icon() {
    return "keyboard";
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
      app.virtualKeyboard = this;
      this._onPrefChangeBound = (e) => {
        if (
          e.detail?.key === "enableVirtualKeyboard" ||
          e.detail?.key === "enableTouchKeyboard"
        ) {
          this.setEnabled(Boolean(e.detail.value));
        }
      };
      app.addEventListener?.("term:pref-change", this._onPrefChangeBound);
    }
    if (view) this.view = view;
    if (buf) this.buf = buf;
    this.syncFromPrefs();

    if (isBrowser() && !_TouchKeyboard) {
      import("../../touch/TouchKeyboard.js")
        .then((mod) => {
          _TouchKeyboard = mod.TouchKeyboard || mod.default;
        })
        .catch(() => {});
    }
  }

  syncFromPrefs() {
    try {
      const prefs = readValuesWithDefault();
      const val = prefs?.enableVirtualKeyboard ?? prefs?.enableTouchKeyboard;
      this.setEnabled(val !== undefined ? Boolean(val) : false);
    } catch (e) {}
  }

  setEnabled(enabled) {
    const isEnabled = Boolean(enabled);
    this.enabled = isEnabled;
    this.app?.dispatchEvent?.(new CustomEvent("term:overlay:update"));
  }

  toggle() {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  renderOverlay({ app } = {}) {
    if (!this.enabled) return null;
    const targetApp = app || this.app;
    return React.createElement(VirtualKeyboardOverlay, {
      app: targetApp,
      plugin: this,
    });
  }

  destroy() {
    this.setEnabled(false);
    if (this.app) {
      if (this._onPrefChangeBound) {
        this.app.removeEventListener?.("term:pref-change", this._onPrefChangeBound);
        this._onPrefChangeBound = null;
      }
      if (this.app.virtualKeyboard === this) {
        this.app.virtualKeyboard = null;
      }
    }
  }
}

export const VirtualKeyboard = VirtualKeyboardPlugin;
export const TouchKeyboardPlugin = VirtualKeyboardPlugin;
export const TouchUIPlugin = VirtualKeyboardPlugin;
export default VirtualKeyboardPlugin;
