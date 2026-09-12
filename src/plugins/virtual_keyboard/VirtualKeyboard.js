import React from "preact/compat";
import { PluginBase } from "../PluginBase.js";
import { _ } from "../../js/i18n.js";
import { isBrowser } from "../../js/util.js";

let _TouchKeyboard = null;

export class VirtualKeyboardOverlay extends React.Component {
  constructor(props) {
    super(props);
    this.state = { Component: _TouchKeyboard };
  }

  componentDidMount() {
    this._unmounted = false;
    if (!this.state.Component && isBrowser()) {
      import("../../touch/TouchKeyboard.js")
        .then((mod) => {
          _TouchKeyboard = mod.TouchKeyboard || mod.default;
          if (!this._unmounted) {
            this.setState({ Component: _TouchKeyboard });
          }
        })
        .catch(() => {});
    }
  }

  componentWillUnmount() {
    this._unmounted = true;
  }

  render() {
    const Component = this.state.Component || _TouchKeyboard;
    if (!Component) return null;
    return React.createElement(Component, this.props);
  }
}

export class VirtualKeyboardPlugin extends PluginBase {
  static id = "virtual_keyboard";
  static name = "virtual_keyboard";
  static prefKey = "enableVirtualKeyboard";
  static group = "ui";
  static icon = "keyboard";
  static defaultPrefs = {
    enableVirtualKeyboard: false,
  };

  static getDefaultPrefs() {
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      return { enableVirtualKeyboard: false };
    }
    const ua = navigator.userAgent || "";
    const platform = navigator.platform || "";
    const maxTouchPoints = navigator.maxTouchPoints || 0;
    const isIPadOS = platform === "MacIntel" && maxTouchPoints > 1 && !/Chrome\//.test(ua);
    const isMobile = /iPad|iPhone|iPod|Android|Mobile/i.test(ua) || isIPadOS;
    return { enableVirtualKeyboard: isMobile };
  }

  static get title() {
    return _("plugin_virtual_keyboard_title");
  }

  static get description() {
    return _("plugin_virtual_keyboard_desc");
  }

  constructor(app, options = {}) {
    super(app, options);
  }

  onInit() {
    if (isBrowser() && !_TouchKeyboard) {
      import("../../touch/TouchKeyboard.js")
        .then((mod) => {
          _TouchKeyboard = mod.TouchKeyboard || mod.default;
        })
        .catch(() => {});
    }
  }

  _clearKeyboardOffset() {
    if (typeof document !== "undefined") {
      document.documentElement?.style?.removeProperty("--keyboard-offset");
      const termWin = document.getElementById("TermWindow");
      if (termWin?.style) {
        termWin.style.removeProperty("--keyboard-offset");
      }
    }
  }

  onDisable() {
    this._clearKeyboardOffset();
  }

  onDestroy() {
    this._clearKeyboardOffset();
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
}

export const VirtualKeyboard = VirtualKeyboardPlugin;
export const TouchKeyboardPlugin = VirtualKeyboardPlugin;
export const TouchUIPlugin = VirtualKeyboardPlugin;
export default VirtualKeyboardPlugin;
