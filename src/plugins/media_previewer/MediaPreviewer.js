import React from "preact/compat";
import { PluginBase } from "../PluginBase.js";
import { readValuesWithDefault } from "../../js/pref.js";
import { _ } from "../../js/i18n.js";
import ImagePreviewer from "./ImagePreviewer.js";
import {
  isTrustedImageDomain,
  resolveImageUrl,
} from "./image_preview_util.js";

export class MediaPreviewer extends PluginBase {
  static id = "media_previewer";
  static name = "media_previewer";
  static prefKey = "enableMediaPreviewer";
  static group = "ui";
  static icon = "image";

  static get title() {
    return _("plugin_media_previewer_title");
  }

  static get description() {
    return _("plugin_media_previewer_desc");
  }

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

  constructor(app, options = {}) {
    super(app, options);
    if (this.whitelistOnly === undefined) {
      this.whitelistOnly = options.whitelistOnly ?? true;
    }
  }

  _createInlinePreview(href, key) {
    const resolved = this.resolveImageUrl(href, this.whitelistOnly);
    if (!resolved) return null;
    const request =
      typeof resolved === "string"
        ? Promise.resolve({ src: resolved })
        : Promise.resolve(resolved);
    return React.createElement(ImagePreviewer, {
      key,
      request,
      component: ImagePreviewer.Inline,
    });
  }

  onInit() {
    if (this.view) {
      this.view.enableMediaPreviewer = Boolean(this.enabled);
      this.view.renderHyperlinkPreview = this.enabled
        ? ImagePreviewer.HoverPreview
        : false;
      this.view.renderInlineHyperlinkPreview = this.enabled
        ? (href, key) => this._createInlinePreview(href, key)
        : null;
    }
    this.listenApp("term:pref-change", (e) => {
      const key = e?.key ?? e?.detail?.key;
      const value = e?.value !== undefined ? e.value : e?.detail?.value;
      if (key === "picPreviewWhitelistOnly") {
        this.whitelistOnly = Boolean(value);
        if (this.enabled) {
          this.view?.redraw?.(true);
        }
      }
    });
    this.listenAppWhileEnabled("term:hyperlink-preview", (detail) => {
      if (!detail) return;
      detail.request = this.resolveImageUrl(detail.href, this.whitelistOnly);
      detail.renderInline = (key) => this._createInlinePreview(detail.href, key);
    });
  }

  onEnable() {
    if (this.view) {
      this.view.enableMediaPreviewer = true;
      this.view.renderHyperlinkPreview = ImagePreviewer.HoverPreview;
      this.view.renderInlineHyperlinkPreview = (href, key) =>
        this._createInlinePreview(href, key);
      if (!this._initializing) {
        this.view.redraw?.(true);
      }
    }
  }

  onDisable() {
    if (this.view) {
      this.view.enableMediaPreviewer = false;
      this.view.renderHyperlinkPreview = false;
      this.view.renderInlineHyperlinkPreview = null;
      this.view.redraw?.(true);
    }
  }

  onDestroy() {
    if (this.view) {
      this.view.enableMediaPreviewer = false;
      this.view.renderHyperlinkPreview = false;
      this.view.renderInlineHyperlinkPreview = null;
    }
  }

  syncFromPrefs() {
    super.syncFromPrefs();
    const appPrefs = this.app?.prefValues;
    let prefs = null;
    if ((!appPrefs || appPrefs.picPreviewWhitelistOnly === undefined) && this.options?.whitelistOnly === undefined) {
      try {
        prefs = readValuesWithDefault();
      } catch {
        prefs = null;
      }
    }

    if (this.options?.whitelistOnly !== undefined) {
      this.whitelistOnly = Boolean(this.options.whitelistOnly);
    } else {
      const rawWhitelist = appPrefs?.picPreviewWhitelistOnly ?? prefs?.picPreviewWhitelistOnly;
      this.whitelistOnly = Boolean(rawWhitelist ?? true);
    }
  }

  resolveImageUrl(href, whitelistOnly = this.whitelistOnly) {
    if (!this.enabled) return null;
    return resolveImageUrl(href, whitelistOnly);
  }

  isTrustedDomain(hostname) {
    return isTrustedImageDomain(hostname);
  }
}

export default MediaPreviewer;
