import { readValuesWithDefault } from '../../js/pref.js';
import { _ } from '../../js/i18n.js';
import { LiveHelperUI } from './LiveHelperUI.js';

export class LiveUpdate {
  static id = 'live_update';
  static name = 'live_update';
  static prefKey = 'enableLiveUpdate';

  static getMetadata() {
    return {
      id: 'live_update',
      name: 'live_update',
      title: _('plugin_live_update_title'),
      description: _('plugin_live_update_desc'),
      prefKey: 'enableLiveUpdate',
      icon: 'sync',
      badge: _('plugin_builtin'),
    };
  }

  constructor(app, options = {}) {
    this.app = app || null;
    this.view = options.view || null;
    this.buf = options.buf || null;
    this.enabled = options.enabled ?? false;
    this.intervalSec = options.intervalSec ?? 1;
    this.active = false;
    this.showsModal = false;
    this.timer = null;
    this.ui = null;
  }

  get id() {
    return 'live_update';
  }

  get name() {
    return 'live_update';
  }

  get prefKey() {
    return 'enableLiveUpdate';
  }

  get title() {
    return _('plugin_live_update_title');
  }

  get description() {
    return _('plugin_live_update_desc');
  }

  get icon() {
    return 'sync';
  }

  get badge() {
    return _('plugin_builtin');
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

    const prefs = readValuesWithDefault();
    this.enabled = Boolean(
      prefs.enableLiveUpdate !== undefined
        ? prefs.enableLiveUpdate
        : prefs.endTurnsOnLiveUpdate
    );
    if (typeof document !== 'undefined') {
      this.ui = new LiveHelperUI(this);
    }
  }

  destroy() {
    this.stop();
    this.hideModal();
    if (this.ui) {
      this.ui.destroy();
      this.ui = null;
    }
  }

  renderUI() {
    if (this.ui) {
      this.ui.update();
    }
  }

  setIntervalSec(sec) {
    const parsed = parseInt(sec, 10);
    this.intervalSec = parsed > 1 ? parsed : 1;
    if (this.active) {
      this.start();
    } else {
      this.renderUI();
    }
  }

  start() {
    this.stopTimer();
    this.active = true;
    const intervalMs = (this.intervalSec || 1) * 1000;
    this.timer = setInterval(() => {
      const pageState = this.buf ? this.buf.pageState : this.app?.buf?.pageState;
      if (pageState === 3) {
        if (typeof this.app?.send === 'function') {
          this.app.send('r');
        } else if (typeof this.app?.conn?.send === 'function') {
          this.app.conn.send('r');
        }
      }
    }, intervalMs);
    this.renderUI();
  }

  stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  stop() {
    this.stopTimer();
    this.active = false;
    this.renderUI();
  }

  toggle() {
    if (this.active) {
      this.stop();
    } else {
      this.start();
    }
  }

  showModal() {
    this.showsModal = true;
    this.renderUI();
  }

  hideModal() {
    this.showsModal = false;
    this.renderUI();
  }

  toggleModal() {
    this.showsModal = !this.showsModal;
    this.renderUI();
  }

  handleKeyDown(e) {
    if (!this.enabled) {
      return false;
    }

    const pageState = this.buf ? this.buf.pageState : this.app?.buf?.pageState;

    // Toggle on 'End' key when in article reading mode (pageState 2 or 3)
    if (!e.ctrlKey && !e.altKey && (e.key === 'End' || e.keyCode === 35)) {
      if (pageState === 2 || pageState === 3) {
        this.toggle();
        this.showModal();
        e.preventDefault?.();
        e.stopPropagation?.();
        return true;
      }
    }

    // Toggle on 'Alt + r'
    if (!e.ctrlKey && e.altKey && (e.key === 'r' || e.key === 'R' || e.keyCode === 82)) {
      if (pageState === 2 || pageState === 3) {
        this.toggle();
        this.showModal();
        e.preventDefault?.();
        e.stopPropagation?.();
        return true;
      }
    }

    // Auto-disable auto-refresh if any regular command key is pressed without Alt
    if (!e.altKey && this.active) {
      if (
        e.key !== 'Shift' &&
        e.key !== 'Control' &&
        e.key !== 'Alt' &&
        !(e.keyCode > 15 && e.keyCode < 19)
      ) {
        this.stop();
      }
    }

    return false;
  }
}

export default LiveUpdate;
