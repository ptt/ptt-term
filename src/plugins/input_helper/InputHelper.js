import React from "preact/compat";
import { readValuesWithDefault, updatePref } from "../../js/pref.js";
import { _ } from "../../js/i18n.js";

let _InputHelperModal = null;

class InputHelperOverlay extends (React?.Component || class {}) {
  constructor(props) {
    super(props);
    this.state = { Component: _InputHelperModal };
  }

  componentDidMount() {
    if (
      !this.state.Component &&
      typeof window !== "undefined" &&
      typeof document !== "undefined" &&
      !process?.versions?.node
    ) {
      import("./InputHelperModal.js")
        .then((mod) => {
          _InputHelperModal = mod.default || mod.InputHelperModal;
          this.setState({ Component: _InputHelperModal });
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

export class InputHelper {
  static id = "input_helper";
  static name = "input_helper";
  static prefKey = "enableInputHelper";
  static group = "ui";

  static getMetadata() {
    return {
      id: "input_helper",
      name: "input_helper",
      title: _("plugin_input_helper_title"),
      description: _("plugin_input_helper_desc"),
      prefKey: "enableInputHelper",
      icon: "palette",
      group: "ui",
    };
  }

  constructor(app, options = {}) {
    this.app = app || null;
    this.view = options.view || null;
    this.buf = options.buf || null;
    this.enabled = options.enabled ?? true;
    this.showsModal = false;
  }

  get id() {
    return "input_helper";
  }

  get name() {
    return "input_helper";
  }

  get prefKey() {
    return "enableInputHelper";
  }

  get group() {
    return "ui";
  }

  get title() {
    return _("plugin_input_helper_title");
  }

  get description() {
    return _("plugin_input_helper_desc");
  }

  get icon() {
    return "palette";
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
        id: "input_helper",
        order: 10,
        label: () => _("cmenu_showInputHelper"),
        visible: (app, { normalEnabled }) => normalEnabled && Boolean(this.enabled),
        onClick: () => {
          this.show();
        },
      },
    ];
  }

  init({ app, view, buf } = {}) {
    if (app) {
      this.app = app;
      this._onPrefChangeBound = (e) => {
        if (e.detail?.key === "enableInputHelper") {
          this.enabled = Boolean(e.detail.value);
        }
      };
      app.addEventListener?.("term:pref-change", this._onPrefChangeBound);
      app.registerContextMenuItem?.(this.getContextMenuItems()[0]);
    }
    if (view) this.view = view;
    if (buf) this.buf = buf;
    const prefs = readValuesWithDefault();
    this.enabled =
      prefs.enableInputHelper !== undefined
        ? Boolean(prefs.enableInputHelper)
        : true;

    if (
      typeof window !== "undefined" &&
      typeof document !== "undefined" &&
      !process?.versions?.node
    ) {
      import("./InputHelperModal.js")
        .then((mod) => {
          _InputHelperModal = mod.default || mod.InputHelperModal;
        })
        .catch(() => {});
    }
  }

  destroy() {
    this.showsModal = false;
    if (this.app) {
      this.app.removeEventListener?.("term:pref-change", this._onPrefChangeBound);
      this.app.unregisterContextMenuItem?.("input_helper");
    }
  }

  show() {
    this.showsModal = true;
    this.app?.dispatchEvent?.(new CustomEvent("term:overlay:update"));
  }

  hide() {
    this.showsModal = false;
    this.app?.dispatchEvent?.(new CustomEvent("term:overlay:update"));
  }

  toggle() {
    this.showsModal = !this.showsModal;
    this.app?.dispatchEvent?.(new CustomEvent("term:overlay:update"));
    return this.showsModal;
  }

  handleReset = () => {
    const resetCmd = this.app?.site?.getEditorColorResetCommand?.();
    if (resetCmd) {
      this.app?.send?.(resetCmd);
    }
  };

  handleCmdSend = (cmd) => {
    const app = this.app;
    if (!app) return;
    const sel = app.view?.getSelectionColRow?.();
    if (sel && app.buf?.pageState == 6) {
      const resetCmd = app.site?.getEditorColorResetCommand?.() || "";
      let y = app.buf.cur_y;
      let selCmd = "\x1b[H";
      if (y > sel.end.row) {
        selCmd += "\x1b[A".repeat(y - sel.end.row);
      } else if (y < sel.end.row) {
        selCmd += "\x1b[B".repeat(sel.end.row - y);
      }
      let x = app.buf.cur_x;
      if (x > sel.end.col) {
        selCmd += "\x1b[D".repeat(x - sel.end.col);
      } else if (x < sel.end.col) {
        selCmd += "\x1b[C".repeat(sel.end.col - x);
      }
      app.send(cmd + resetCmd + selCmd);
    } else {
      app.send(cmd);
    }
  };

  handleConvSend = (str) => {
    this.app?.send?.(str);
  };

  renderOverlay({ app } = {}) {
    if (!this.showsModal && !_InputHelperModal) return null;
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
