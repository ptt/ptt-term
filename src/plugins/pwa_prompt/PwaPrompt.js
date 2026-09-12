import React from 'preact/compat';
import { PluginBase } from '../PluginBase.js';
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

export class PwaPromptOverlay extends React.Component {
  constructor(props) {
    super(props);
    this.state = { Component: _PwaPromptModal };
  }

  componentDidMount() {
    this._unmounted = false;
    if (!this.state.Component && isBrowser()) {
      import('./PwaPromptModal.js')
        .then((mod) => {
          _PwaPromptModal = mod.default || mod.PwaPromptModal;
          if (!this._unmounted) {
            this.setState({ Component: _PwaPromptModal });
          }
        })
        .catch(() => {});
    }
  }

  componentWillUnmount() {
    this._unmounted = true;
  }

  render() {
    const Component = this.state.Component || _PwaPromptModal;
    if (!Component) {
      return React.createElement('div', { className: 'PwaPrompt-placeholder' });
    }
    return React.createElement(Component, this.props);
  }
}

export class PwaPromptPlugin extends PluginBase {
  static id = 'pwa_prompt';
  static name = 'pwa_prompt';
  static prefKey = 'enablePwaPrompt';
  static group = 'ui';
  static icon = 'smartphone';
  static defaultPrefs = {
    enablePwaPrompt: false,
  };

  static getDefaultPrefs() {
    if (isStandalone()) return { enablePwaPrompt: false };
    const platform = getPlatform();
    return { enablePwaPrompt: platform === 'ios' || platform === 'android' };
  }

  static get title() {
    return _('plugin_pwa_prompt_title');
  }

  static get description() {
    return _('plugin_pwa_prompt_desc');
  }

  constructor(app, options = {}) {
    super(app, options);
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
        visible: (app, { normalEnabled } = {}) =>
          Boolean(
            normalEnabled !== false &&
              this.enabled &&
              !this.isStandalone() &&
              !this.isInstalled
          ),
        onClick: () => {
          this.showModal();
        },
      },
    ];
  }

  onInit() {
    if (typeof window !== 'undefined') {
      this.listenWhileEnabled(window, 'term:pwa:installable', this._onInstallable);
      this.listen(window, 'term:pwa:installed', this._onInstalled);
    }

    // If already running as PWA standalone, turn off the plugin immediately!
    if (this.isStandalone()) {
      this.disablePlugin();
    }
  }

  onEnable() {
    this.checkAutoPrompt();
  }

  _cleanupModal(restoreFocus = true) {
    const wasShowing = this.showsModal;
    this.showsModal = false;
    if (this._autoPromptTimer) {
      this.clearTimeout(this._autoPromptTimer);
      this._autoPromptTimer = null;
    }
    if (wasShowing && this.app) {
      this.app.modalShown = false;
      if (restoreFocus) {
        this.app.setInputAreaFocus?.();
      }
    }
    return wasShowing;
  }

  onDisable() {
    this._cleanupModal(true);
  }

  onDestroy() {
    this._cleanupModal(false);
  }

  isStandalone() {
    return isStandalone();
  }

  hasNativePrompt() {
    return Boolean(globalDeferredPrompt);
  }

  disablePlugin() {
    const wasShowing = this._cleanupModal(true);
    const wasEnabled = this.enabled || this._enabledActive;
    this.setEnabled(false);
    if (!wasEnabled && wasShowing) {
      this.notifyUpdate();
    }
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
      this.clearTimeout(this._autoPromptTimer);
    }
    this._autoPromptTimer = this.setTimeout(() => {
      if (this.enabled && !this.isStandalone() && !this.isInstalled) {
        this.showModal();
      }
    }, delay);
  }

  showModal() {
    if (this.showsModal) return;
    this.showsModal = true;
    if (this.app) {
      this.app.modalShown = true;
    }
    this.notifyUpdate();
  }

  dismissModal() {
    this._cleanupModal(true);
    this.notifyUpdate();
  }

  hideModal() {
    this.disablePlugin();
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
