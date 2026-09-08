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

  static getMetadata() {
    return {
      id: "media_previewer",
      name: "media_previewer",
      title: _("plugin_media_previewer_title"),
      description: _("plugin_media_previewer_desc"),
      prefKey: "enablePicPreview",
      icon: "image",
      badge: _("plugin_builtin"),
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

  get title() {
    return _("plugin_media_previewer_title");
  }

  get description() {
    return _("plugin_media_previewer_desc");
  }

  get icon() {
    return "image";
  }

  get badge() {
    return _("plugin_builtin");
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
      badge: this.badge,
    };
  }

  init({ app, view, buf } = {}) {
    if (app) this.app = app;
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

  destroy() {}
}
