import React from 'preact/compat';
import { readValuesWithDefault, updatePref } from '../../js/pref.js';
import { _ } from '../../js/i18n.js';
import { isBrowser } from '../../js/util.js';

let globalDeferredPrompt = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    globalDeferredPrompt = e;
    window.dispatchEvent(new CustomEvent('term:pwa:installable'));
  });

  window.addEventListener('appinstalled', () => {
    globalDeferredPrompt = null;
    window.dispatchEvent(new CustomEvent('term:pwa:installed'));
  });
}

export function getPlatform() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'desktop';
  }
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const maxTouchPoints = navigator.maxTouchPoints || 0;

  // iOS / iPadOS (iPad on iOS 13+ reports MacIntel with touch points, but desktop Chrome UA has 'Chrome/')
  const isIPadOS = platform === 'MacIntel' && maxTouchPoints > 1 && !/Chrome\//.test(ua);
  if (/iPad|iPhone|iPod/.test(ua) || isIPadOS) {
    return 'ios';
  }

  // Android
  if (/Android/i.test(ua)) {
    return 'android';
  }

  return 'desktop';
}

export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.navigator?.standalone === true ||
      (typeof window.matchMedia === 'function' &&
        (window.matchMedia('(display-mode: standalone)').matches ||
          window.matchMedia('(display-mode: fullscreen)').matches ||
          window.matchMedia('(display-mode: window-controls-overlay)').matches))
  );
}

export function isInAppBrowser() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Line|FBAN|FBAV|Instagram|MicroMessenger/i.test(ua);
}

export function isMac() {
  if (typeof navigator === 'undefined') return false;
  return /Mac/i.test(navigator.platform || '') && (navigator.maxTouchPoints || 0) <= 1;
}

export function isIOSChrome() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /CriOS/i.test(ua);
}

let _PwaPromptModal = null;

export class PwaPromptOverlay extends (React?.Component || class {}) {
  constructor(props) {
    super(props);
    this.state = { Component: _PwaPromptModal };
  }

  componentDidMount() {
    if (!this.state.Component && isBrowser()) {
      import('./PwaPromptModal.js')
        .then((mod) => {
          _PwaPromptModal = mod.default || mod.PwaPromptModal;
          this.setState({ Component: _PwaPromptModal });
        })
        .catch(() => {});
    }
  }

  render() {
    const Component = this.state.Component || _PwaPromptModal;
    if (!Component) {
      if (typeof React?.createElement === 'function') {
        return React.createElement('div', { className: 'PwaPrompt-placeholder' });
      }
      return null;
    }
    return React.createElement(Component, this.props);
  }
}

export class PwaPromptPlugin {
  static id = 'pwa_prompt';
  static name = 'pwa_prompt';
  static prefKey = 'enablePwaPrompt';
  static group = 'ui';

  static getMetadata() {
    return {
      id: 'pwa_prompt',
      name: 'pwa_prompt',
      title: _('plugin_pwa_prompt_title'),
      description: _('plugin_pwa_prompt_desc'),
      prefKey: 'enablePwaPrompt',
      icon: 'smartphone',
      group: 'ui',
    };
  }

  constructor(app, options = {}) {
    this.app = app || null;
    this.enabled = options.enabled ?? false;
    this.showsModal = false;
    this.isInstalled = false;
    this._autoPromptTimer = null;

    this._onInstallable = () => {
      this.notifyUpdate();
    };
    this._onInstalled = () => {
      this.isInstalled = true;
      this.disablePlugin();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('term:pwa:installable', this._onInstallable);
      window.addEventListener('term:pwa:installed', this._onInstalled);
    }
  }

  get id() {
    return PwaPromptPlugin.id;
  }
  get name() {
    return PwaPromptPlugin.name;
  }
  get prefKey() {
    return PwaPromptPlugin.prefKey;
  }
  get group() {
    return PwaPromptPlugin.group;
  }
  get title() {
    return PwaPromptPlugin.getMetadata().title;
  }
  get description() {
    return PwaPromptPlugin.getMetadata().description;
  }

  getContextMenuItems() {
    return [
      {
        id: 'pwa_prompt_menu',
        order: 95,
        label: () => {
          const platform = getPlatform();
          const isMobile = platform === 'ios' || platform === 'android';
          return isMobile
            ? _('cmenu_pwa_install_mobile')
            : _('cmenu_pwa_install_desktop');
        },
        visible: () => Boolean(this.enabled && !this.isStandalone() && !this.isInstalled),
        onClick: () => {
          this.showModal();
        },
      },
    ];
  }

  init({ app } = {}) {
    if (app) {
      this.app = app;
      this._onPrefChangeBound = (e) => {
        const key = e?.key ?? e?.detail?.key;
        const value = e?.value !== undefined ? e.value : e?.detail?.value;
        if (key === PwaPromptPlugin.prefKey) {
          this.enabled = Boolean(value);
          if (!this.enabled && this.showsModal) {
            this.showsModal = false;
          }
          this.notifyUpdate();
        }
      };
      if (typeof app.on === 'function') {
        app.on('term:pref-change', this._onPrefChangeBound);
      } else {
        app.addEventListener?.('term:pref-change', this._onPrefChangeBound);
      }
    }

    // If already running as PWA standalone, turn off the plugin immediately!
    if (this.isStandalone()) {
      this.disablePlugin();
      return;
    }

    this.syncFromPrefs();

    if (this.enabled) {
      this.checkAutoPrompt();
    }
  }

  syncFromPrefs() {
    try {
      const prefs = readValuesWithDefault();
      this.enabled = Boolean(prefs?.enablePwaPrompt);
    } catch (e) {
      this.enabled = false;
    }
  }

  isStandalone() {
    return isStandalone();
  }

  hasNativePrompt() {
    return Boolean(globalDeferredPrompt);
  }

  disablePlugin() {
    this.enabled = false;
    this.showsModal = false;
    if (this._autoPromptTimer) {
      clearTimeout(this._autoPromptTimer);
      this._autoPromptTimer = null;
    }
    updatePref(PwaPromptPlugin.prefKey, false);
    if (this.app) {
      if (typeof this.app.onValuesPrefChange === 'function' && this.app.prefValues) {
        this.app.onValuesPrefChange({
          ...this.app.prefValues,
          [PwaPromptPlugin.prefKey]: false,
        });
      }
    }
    this.notifyUpdate();
  }

  async promptNativeInstall() {
    if (!globalDeferredPrompt) return false;
    try {
      const promptEvent = globalDeferredPrompt;
      globalDeferredPrompt = null;
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice && choice.outcome === 'accepted') {
        this.isInstalled = true;
      }
      this.disablePlugin();
      return true;
    } catch (err) {
      console.debug('PWA native prompt failed:', err);
      this.disablePlugin();
      return false;
    }
  }

  checkAutoPrompt() {
    if (!this.enabled || this.isStandalone() || this.isInstalled) return;

    const platform = getPlatform();
    const delay = platform === 'desktop' ? 3000 : 2500;

    if (this._autoPromptTimer) {
      clearTimeout(this._autoPromptTimer);
    }
    this._autoPromptTimer = setTimeout(() => {
      if (this.enabled && !this.isStandalone() && !this.isInstalled) {
        this.showModal();
      }
    }, delay);
  }

  showModal() {
    this.showsModal = true;
    this.notifyUpdate();
  }

  dismissModal() {
    this.showsModal = false;
    if (this._autoPromptTimer) {
      clearTimeout(this._autoPromptTimer);
      this._autoPromptTimer = null;
    }
    this.notifyUpdate();
  }

  hideModal() {
    this.disablePlugin();
  }

  destroy() {
    this.showsModal = false;
    this.enabled = false;
    if (this._autoPromptTimer) {
      clearTimeout(this._autoPromptTimer);
      this._autoPromptTimer = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('term:pwa:installable', this._onInstallable);
      window.removeEventListener('term:pwa:installed', this._onInstalled);
    }
    if (this.app && this._onPrefChangeBound) {
      if (typeof this.app.off === 'function') {
        this.app.off('term:pref-change', this._onPrefChangeBound);
      } else {
        this.app.removeEventListener?.('term:pref-change', this._onPrefChangeBound);
      }
      this._onPrefChangeBound = null;
    }
    this.notifyUpdate();
  }

  notifyUpdate() {
    this.app?.emit?.('term:overlay:update');
  }

  renderOverlay({ app } = {}) {
    if (!this.showsModal || !this.enabled || this.isStandalone() || this.isInstalled) {
      return null;
    }
    return React.createElement(PwaPromptOverlay, {
      plugin: this,
      platform: getPlatform(),
      isMac: isMac(),
      isIOSChrome: isIOSChrome(),
      inApp: isInAppBrowser(),
      hasNativePrompt: this.hasNativePrompt(),
      onInstallClick: () => this.promptNativeInstall(),
      onClose: () => this.disablePlugin(),
      onRemindLater: () => this.dismissModal(),
    });
  }
}

export default PwaPromptPlugin;
