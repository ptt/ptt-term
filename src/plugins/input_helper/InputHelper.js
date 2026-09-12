import React from "preact/compat";
import { PluginBase } from "../PluginBase.js";
import { _ } from "../../js/i18n.js";
import { isBrowser } from "../../js/util.js";

let _InputHelperModal = null;

class InputHelperOverlay extends React.Component {
  constructor(props) {
    super(props);
    this.state = { Component: _InputHelperModal };
  }

  componentDidMount() {
    this._unmounted = false;
    if (!this.state.Component && isBrowser()) {
      import("./InputHelperModal.js")
        .then((mod) => {
          _InputHelperModal = mod.default || mod.InputHelperModal;
          if (!this._unmounted) {
            this.setState({ Component: _InputHelperModal });
          }
        })
        .catch(() => {});
    }
  }

  componentWillUnmount() {
    this._unmounted = true;
  }

  render() {
    const Component = this.state.Component || _InputHelperModal;
    if (!Component) return null;
    return React.createElement(Component, this.props);
  }
}

export class InputHelper extends PluginBase {
  static id = "input_helper";
  static name = "input_helper";
  static prefKey = "enableInputHelper";
  static group = "ui";
  static icon = "palette";

  static get title() {
    return _("plugin_input_helper_title");
  }

  static get description() {
    return _("plugin_input_helper_desc");
  }

  constructor(app, options = {}) {
    super(app, options);
    this.showsModal = false;
  }

  getContextMenuItems() {
    return [
      {
        id: "input_helper",
        order: 10,
        label: () => _("cmenu_showInputHelper"),
        visible: (app, { normalEnabled } = {}) =>
          Boolean(normalEnabled !== false && this.enabled),
        onClick: () => {
          this.show();
        },
      },
    ];
  }

  onInit() {
    // Preference change ('term:pref-change') is handled by PluginBase for enableInputHelper
    if (isBrowser() && !_InputHelperModal) {
      import("./InputHelperModal.js")
        .then((mod) => {
          _InputHelperModal = mod.default || mod.InputHelperModal;
        })
        .catch(() => {});
    }
  }

  onDisable() {
    if (this.showsModal) {
      this.showsModal = false;
      this.app?.setInputAreaFocus?.();
    }
  }

  onDestroy() {
    this.showsModal = false;
  }

  show() {
    if (this.showsModal) return;
    this.showsModal = true;
    this.app?.emit('term:overlay:update');
  }

  hide() {
    if (!this.showsModal) return;
    this.showsModal = false;
    this.app?.emit('term:overlay:update');
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

  handleReset = () => {
    const resetCmd = this.app?.site?.getEditorColorResetCommand?.();
    if (resetCmd) {
      this.app?.send(resetCmd);
    }
  };

  handleCmdSend = (cmd) => {
    this.app?.send(cmd);
  };

  handleConvSend = (str) => {
    this.app?.send(str);
  };

  renderOverlay({ app } = {}) {
    if (!this.enabled || !this.showsModal) return null;
    const targetApp = app || this.app;
    return React.createElement(InputHelperOverlay, {
      show: this.showsModal,
      site: targetApp ? targetApp.site : null,
      onHide: () => this.hide(),
      onReset: this.handleReset,
      onCmdSend: this.handleCmdSend,
      onConvSend: this.handleConvSend,
    });
  }
}
