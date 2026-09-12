import React from "preact/compat";
import { PluginBase } from "../PluginBase.js";
import { _ } from "../../js/i18n.js";
import { isBrowser } from "../../js/util.js";

let _LoginModal = null;

class AutoLoginOverlay extends React.Component {
  constructor(props) {
    super(props);
    this.state = { Component: _LoginModal };
  }

  componentDidMount() {
    this._unmounted = false;
    if (!this.state.Component && isBrowser()) {
      import("./LoginModal.js")
        .then((mod) => {
          _LoginModal = mod.default || mod.LoginModal;
          if (!this._unmounted) {
            this.setState({ Component: _LoginModal });
          }
        })
        .catch(() => {});
    }
  }

  componentWillUnmount() {
    this._unmounted = true;
  }

  render() {
    const Component = this.state.Component || _LoginModal;
    if (!Component) return null;
    return React.createElement(Component, this.props);
  }
}

export class AutoLogin extends PluginBase {
  static id = "auto_login";
  static name = "auto_login";
  static prefKey = "enableAutoLogin";
  static group = "bbs";
  static icon = "key";

  static get title() {
    return _("plugin_auto_login_title");
  }

  static get description() {
    return _("plugin_auto_login_desc");
  }

  constructor(app, options = {}) {
    super(app, options);
    this.submitCooldownMs = options.submitCooldownMs ?? 1200;
    this.showsModal = false;
    this.loginPromptDetected = false;
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

  onInit() {
    if (isBrowser() && !_LoginModal) {
      import("./LoginModal.js")
        .then((mod) => {
          _LoginModal = mod.default || mod.LoginModal;
        })
        .catch(() => {});
    }

    this._onLoginPromptBound = (e) => {
      if (this.enabled && !this.showsModal) {
        this.loginPromptDetected = true;
        this.show();
      }
    };

    this._onResetBound = () => {
      this.loginPromptDetected = false;
    };

    const target = this.app || this.buf;
    if (target) {
      this.listenWhileEnabled(target, "term:login-prompt", this._onLoginPromptBound);
      this.listen(target, "term:connect", this._onResetBound);
      this.listen(target, "term:disconnect", this._onResetBound);
    }
    if (this.buf && this.buf !== target) {
      this.listenWhileEnabled(this.buf, "term:login-prompt", this._onLoginPromptBound);
    }
  }

  onDisable() {
    if (this.showsModal) {
      this.showsModal = false;
      if (this.app) {
        this.app.modalShown = false;
      }
      this.app?.setInputAreaFocus?.();
    }
  }

  onDestroy() {
    const wasShowing = this.showsModal;
    this.showsModal = false;
    this.loginPromptDetected = false;
    if (wasShowing && this.app && this.app.modalShown) {
      this.app.modalShown = false;
    }
  }

  show() {
    if (this.showsModal) return;
    this.showsModal = true;
    if (this.app) {
      this.app.modalShown = true;
    }
    this.app?.emit("term:overlay:update");
  }

  hide() {
    if (!this.showsModal) return;
    this.showsModal = false;
    if (this.app) {
      this.app.modalShown = false;
    }
    this.app?.emit("term:overlay:update");
    this.app?.setInputAreaFocus?.(true);
    this.setTimeout(() => {
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

  handleLogin = ({ username, password }) => {
    const app = this.app;
    if (!app) return;
    const id = (username || "").trim();
    const pw = password || "";
    if (!id) return;

    // Send username followed by CR
    app.send?.(`${id}\r`);

    // Send password with a short 80ms delay for BBS typeahead / prompt processing
    this.setTimeout(() => {
      app.send?.(`${pw}\r`);
    }, 80);

    // Keep dialog open so browser password manager (especially iOS Safari WebKit)
    // has ample time to process the form submission and display the credential save prompt
    const cooldownMs = this.submitCooldownMs ?? 1200;
    this.setTimeout(() => {
      this.hide();
    }, cooldownMs);
  };

  renderOverlay({ app } = {}) {
    if (!this.enabled || !this.showsModal) return null;
    const targetApp = app || this.app;
    return React.createElement(AutoLoginOverlay, {
      show: this.showsModal,
      app: targetApp,
      onHide: () => this.hide(),
      onDisable: () => this.setEnabled(false, true),
      onLogin: this.handleLogin,
    });
  }
}

export const AutoLoginPlugin = AutoLogin;
export default AutoLogin;
