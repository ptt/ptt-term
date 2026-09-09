import React from "preact/compat";
import { readValuesWithDefault, updatePref } from "../../js/pref.js";
import { _ } from "../../js/i18n.js";
import {
  TRUSTED_IMAGE_DOMAINS,
  isTrustedImageDomain,
  resolveImageUrl,
  getImageRenderedSize,
  getPopupPosition,
} from "./image_preview_util.js";

export class MediaPreviewer {
  static id = "media_previewer";
  static name = "media_previewer";
  static prefKey = "enablePicPreview";

  static renderOptions({ values = {}, handleCheckboxChange }) {
    return React.createElement(
      "div",
      { className: "checkbox PrefModal__MacSubCheckbox" },
      React.createElement(
        "label",
        null,
        React.createElement("input", {
          type: "checkbox",
          name: "picPreviewWhitelistOnly",
          checked: Boolean(values.picPreviewWhitelistOnly !== false),
          onChange: handleCheckboxChange,
        }),
        React.createElement(
          "span",
          null,
          _("options_picPreviewWhitelistOnly")
        )
      )
    );
  }

  renderOptions(props) {
    return MediaPreviewer.renderOptions(props);
  }

  static id = "media_previewer";
  static name = "media_previewer";
  static prefKey = "enablePicPreview";
  static group = "ui";

  static getMetadata() {
    return {
      id: "media_previewer",
      name: "media_previewer",
      title: _("plugin_media_previewer_title"),
      description: _("plugin_media_previewer_desc"),
      prefKey: "enablePicPreview",
      icon: "image",
      group: "ui",
      renderOptions: MediaPreviewer.renderOptions,
    };
  }

  constructor(app, options = {}) {
    this.app = app || null;
    this.view = options.view || null;
    this.buf = options.buf || null;
    this.enabled = options.enabled ?? true;
    this.whitelistOnly = options.whitelistOnly ?? true;
  }

  get id() {
    return "media_previewer";
  }

  get name() {
    return "media_previewer";
  }

  get prefKey() {
    return "enablePicPreview";
  }

  get group() {
    return "ui";
  }

  get title() {
    return _("plugin_media_previewer_title");
  }

  get description() {
    return _("plugin_media_previewer_desc");
  }

  get icon() {
    return "image";
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
      renderOptions: MediaPreviewer.renderOptions,
    };
  }

  init({ app, view, buf } = {}) {
    if (app) {
      this.app = app;
      this._onPrefChangeBound = (e) => {
        const { key, value } = e.detail || {};
        if (key === "enablePicPreview") {
          this.enabled = Boolean(value);
        } else if (key === "picPreviewWhitelistOnly") {
          this.whitelistOnly = Boolean(value);
        }
      };
      this.app.addEventListener?.("term:pref-change", this._onPrefChangeBound);
    }
    if (view) this.view = view;
    if (buf) this.buf = buf;
    this.syncFromPrefs();
  }

  syncFromPrefs() {
    const prefs = readValuesWithDefault();
    this.enabled = Boolean(prefs.enablePicPreview ?? true);
    this.whitelistOnly = Boolean(prefs.picPreviewWhitelistOnly ?? true);
  }

  resolveImageUrl(href, whitelistOnly = this.whitelistOnly) {
    if (!this.enabled) return null;
    return resolveImageUrl(href, whitelistOnly);
  }

  isTrustedDomain(hostname) {
    return isTrustedImageDomain(hostname);
  }

  destroy() {
    if (this.app) {
      this.app.removeEventListener?.("term:pref-change", this._onPrefChangeBound);
    }
  }
}
