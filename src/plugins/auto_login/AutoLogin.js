import React from "preact/compat";
import { readValuesWithDefault } from "../../js/pref.js";
import { _ } from "../../js/i18n.js";

let _LoginModal = null;

class AutoLoginOverlay extends (React?.Component || class {}) {
  constructor(props) {
    super(props);
    this.state = { Component: _LoginModal };
  }

  componentDidMount() {
    if (
      !this.state.Component &&
      typeof window !== "undefined" &&
      typeof document !== "undefined" &&
      !process?.versions?.node
    ) {
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
      title: _("plugin_auto_login_title") || "帳號登入 (BBS Login)",
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
    return _("plugin_auto_login_title") || "帳號登入 (BBS Login)";
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
        label: () => _("cmenu_auto_login") || "帳號登入 ...",
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
        if (e.detail?.key === "enableAutoLogin") {
          this.enabled = Boolean(e.detail.value);
        }
      };
      app.addEventListener?.("term:pref-change", this._onPrefChangeBound);
      app.addEventListener?.("login", this._onLoginPromptBound);
      app.addEventListener?.("term:login", this._onLoginPromptBound);
      app.addEventListener?.("term:login-prompt", this._onLoginPromptBound);
      app.addEventListener?.("term:connect", this._onResetBound);
      app.addEventListener?.("term:disconnect", this._onResetBound);
      app.registerContextMenuItem?.(this.getContextMenuItems()[0]);
    }
    if (view) this.view = view;
    if (buf) {
      this.buf = buf;
      if (buf !== this.app && buf.addEventListener) {
        buf.addEventListener?.("login", this._onLoginPromptBound);
        buf.addEventListener?.("term:login", this._onLoginPromptBound);
        buf.addEventListener?.("term:login-prompt", this._onLoginPromptBound);
        buf.addEventListener?.("term:connect", this._onResetBound);
        buf.addEventListener?.("term:disconnect", this._onResetBound);
      }
    }
    const prefs = readValuesWithDefault();
    this.enabled =
      prefs.enableAutoLogin !== undefined
        ? Boolean(prefs.enableAutoLogin)
        : true;

    if (
      typeof window !== "undefined" &&
      typeof document !== "undefined" &&
      !process?.versions?.node
    ) {
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
      this.app.removeEventListener?.("term:pref-change", this._onPrefChangeBound);
      this.app.removeEventListener?.("login", this._onLoginPromptBound);
      this.app.removeEventListener?.("term:login", this._onLoginPromptBound);
      this.app.removeEventListener?.("term:login-prompt", this._onLoginPromptBound);
      this.app.removeEventListener?.("term:connect", this._onResetBound);
      this.app.removeEventListener?.("term:disconnect", this._onResetBound);
      this.app.unregisterContextMenuItem?.("auto_login");
      if (this.app.modalShown) {
        this.app.modalShown = false;
      }
    }
    if (this.buf && this.buf !== this.app) {
      this.buf.removeEventListener?.("login", this._onLoginPromptBound);
      this.buf.removeEventListener?.("term:login", this._onLoginPromptBound);
      this.buf.removeEventListener?.("term:login-prompt", this._onLoginPromptBound);
      this.buf.removeEventListener?.("term:connect", this._onResetBound);
      this.buf.removeEventListener?.("term:disconnect", this._onResetBound);
    }
  }

  show() {
    this.showsModal = true;
    if (this.app) {
      this.app.modalShown = true;
    }
    this.app?.dispatchEvent?.(new CustomEvent("term:overlay:update"));
  }

  hide() {
    this.showsModal = false;
    if (this.app) {
      this.app.modalShown = false;
    }
    this.app?.dispatchEvent?.(new CustomEvent("term:overlay:update"));
    this.app?.setInputAreaFocus?.();
  }

  toggle() {
    if (this.showsModal) {
      this.hide();
    } else {
      this.show();
    }
    return this.showsModal;
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

    // Keep dialog open for 150ms so browser password manager intercepts the form submit event
    setTimeout(() => {
      this.hide();
    }, 150);
  };

  renderOverlay({ app } = {}) {
    if (!this.showsModal && !_LoginModal) return null;
    const targetApp = app || this.app;
    return React.createElement(AutoLoginOverlay, {
      show: this.showsModal,
      app: targetApp,
      onHide: () => this.hide(),
      onLogin: this.handleLogin,
    });
  }
}

export const AutoLoginPlugin = AutoLogin;
export default AutoLogin;
