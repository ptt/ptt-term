import { readValuesWithDefault, updatePref } from "../../js/pref.js";
import { _ } from "../../js/i18n.js";

export class InputHelper {
  static id = "input_helper";
  static name = "input_helper";
  static prefKey = "enableInputHelper";

  static getMetadata() {
    return {
      id: "input_helper",
      name: "input_helper",
      title: _("cmenu_showInputHelper"),
      description: _("plugin_input_helper_desc"),
      prefKey: "enableInputHelper",
      icon: "palette",
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

  get title() {
    return _("cmenu_showInputHelper");
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
    };
  }

  init({ app, view, buf } = {}) {
    if (app) this.app = app;
    if (view) this.view = view;
    if (buf) this.buf = buf;
    const prefs = readValuesWithDefault();
    this.enabled =
      prefs.enableInputHelper !== undefined
        ? Boolean(prefs.enableInputHelper)
        : true;
  }

  destroy() {
    this.showsModal = false;
  }

  show() {
    this.showsModal = true;
  }

  hide() {
    this.showsModal = false;
  }

  toggle() {
    this.showsModal = !this.showsModal;
    return this.showsModal;
  }
}
