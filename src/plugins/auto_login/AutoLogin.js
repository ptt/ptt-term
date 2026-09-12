import React from "preact/compat";
import { readValuesWithDefault, updatePref } from "../../js/pref.js";
import { _ } from "../../js/i18n.js";
import { isBrowser } from "../../js/util.js";

let _LoginModal = null;

class AutoLoginOverlay extends (React?.Component || class {}) {
  constructor(props) {
    super(props);
    this.state = { Component: _LoginModal };
  }

  componentDidMount() {
    if (!this.state.Component && isBrowser()) {
      import("./LoginModal.js")
        .then((mod) => {
          _LoginModal = mod.default || mod.LoginModal;
          this.setState({ Component: _LoginModal });
        })
        .catch(() => {});
    }
  }

  render() {
    const Component = this.state.Component || _LoginModal;
    if (!Component) return null;
    return React.createElement(Component, this.props);
  }
}

export class AutoLogin {
  static id = "auto_login";
  static name = "auto_login";
  static prefKey = "enableAutoLogin";
  static group = "bbs";

  static getMetadata() {
    return {
      id: "auto_login",
      name: "auto_login",
      title: _("plugin_auto_login_title"),
      description: _("plugin_auto_login_desc"),
      prefKey: "enableAutoLogin",
      icon: "key",
      group: "bbs",
    };
  }

  constructor(app, options = {}) {
    this.app = app || null;
    this.view = options.view || null;
    this.buf = options.buf || null;
    this.enabled = options.enabled ?? true;
    this.submitCooldownMs = options.submitCooldownMs ?? 1200;
    this.showsModal = false;
    this.loginPromptDetected = false;
  }

  get id() {
    return "auto_login";
  }

  get name() {
    return "auto_login";
  }

  get prefKey() {
    return "enableAutoLogin";
  }

  get group() {
    return "bbs";
  }

  get title() {
    return _("plugin_auto_login_title");
  }

  get description() {
    return _("plugin_auto_login_desc");
  }

  get icon() {
    return "key";
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

  getContextMenuItems() {
    return [
      {
        id: "auto_login",
        order: 5,
        label: () => _("cmenu_auto_login"),
        visible: (app, { normalEnabled } = {}) =>
          Boolean(normalEnabled !== false && this.enabled),
        onClick: () => {
          this.show();
        },
      },
    ];
  }

  init({ app, view, buf } = {}) {
    this._onLoginPromptBound = (e) => {
      if (this.enabled && !this.showsModal) {
        this.loginPromptDetected = true;
        this.show();
      }
    };

    this._onResetBound = () => {
      this.loginPromptDetected = false;
    };

    if (app) {
      this.app = app;
      this._onPrefChangeBound = (e) => {
        const key = e?.key ?? e?.detail?.key;
        const value = e?.value !== undefined ? e.value : e?.detail?.value;
        if (key === "enableAutoLogin") {
          this.enabled = Boolean(value);
        }
      };
      app.on("term:pref-change", this._onPrefChangeBound);
      app.on("term:login-prompt", this._onLoginPromptBound);
      app.on("term:connect", this._onResetBound);
      app.on("term:disconnect", this._onResetBound);
      app.registerContextMenuItem?.(this.getContextMenuItems()[0]);
    } else if (buf) {
      this.buf = buf;
      buf.on("term:login-prompt", this._onLoginPromptBound);
      buf.on("term:connect", this._onResetBound);
      buf.on("term:disconnect", this._onResetBound);
    }
    if (view) this.view = view;
    if (buf) this.buf = buf;
    const prefs = readValuesWithDefault();
    this.enabled =
      prefs.enableAutoLogin !== undefined
        ? Boolean(prefs.enableAutoLogin)
        : true;

    if (isBrowser()) {
      import("./LoginModal.js")
        .then((mod) => {
          _LoginModal = mod.default || mod.LoginModal;
        })
        .catch(() => {});
    }
  }

  destroy() {
    this.showsModal = false;
    this.loginPromptDetected = false;
    if (this.app) {
      this.app.off("term:pref-change", this._onPrefChangeBound);
      this.app.off("term:login-prompt", this._onLoginPromptBound);
      this.app.off("term:connect", this._onResetBound);
      this.app.off("term:disconnect", this._onResetBound);
      this.app.unregisterContextMenuItem?.("auto_login");
      if (this.app.modalShown) {
        this.app.modalShown = false;
      }
    } else if (this.buf) {
      this.buf.off("term:login-prompt", this._onLoginPromptBound);
      this.buf.off("term:connect", this._onResetBound);
      this.buf.off("term:disconnect", this._onResetBound);
    }
  }

  show() {
    this.showsModal = true;
    if (this.app) {
      this.app.modalShown = true;
    }
    this.app?.emit("term:overlay:update");
  }

  hide() {
    this.showsModal = false;
    if (this.app) {
      this.app.modalShown = false;
    }
    this.app?.emit("term:overlay:update");
    this.app?.setInputAreaFocus?.(true);
    setTimeout(() => {
      if (!this.showsModal && !this.app?.modalShown) {
        this.app?.setInputAreaFocus?.(true);
      }
    }, 0);
  }

  toggle() {
    if (this.showsModal) {
      this.hide();
    } else {
      this.show();
    }
    return this.showsModal;
  }

  disable() {
    this.enabled = false;
    this.hide();
    updatePref("enableAutoLogin", false);
    if (this.app) {
      if (
        typeof this.app.onValuesPrefChange === "function" &&
        this.app.prefValues
      ) {
        this.app.onValuesPrefChange({
          ...this.app.prefValues,
          enableAutoLogin: false,
        });
      } else {
        this.app.emit?.("term:pref-change", {
          key: "enableAutoLogin",
          value: false,
          detail: { key: "enableAutoLogin", value: false },
        });
      }
    }
  }

  handleLogin = ({ username, password }) => {
    const app = this.app;
    if (!app) return;
    const id = (username || "").trim();
    const pw = password || "";
    if (!id) return;

    // Send username followed by CR
    app.send?.(`${id}\r`);

    // Send password with a short 80ms delay for BBS typeahead / prompt processing
    setTimeout(() => {
      app.send?.(`${pw}\r`);
    }, 80);

    // Keep dialog open so browser password manager (especially iOS Safari WebKit)
    // has ample time to process the form submission and display the credential save prompt
    const cooldownMs = this.submitCooldownMs ?? 1200;
    setTimeout(() => {
      this.hide();
    }, cooldownMs);
  };

  renderOverlay({ app } = {}) {
    if (!this.showsModal && !_LoginModal) return null;
    const targetApp = app || this.app;
    return React.createElement(AutoLoginOverlay, {
      show: this.showsModal,
      app: targetApp,
      onHide: () => this.hide(),
      onDisable: () => this.disable(),
      onLogin: this.handleLogin,
    });
  }
}

export const AutoLoginPlugin = AutoLogin;
export default AutoLogin;
