import React from "preact/compat";
import { PluginBase } from '../PluginBase.js';
import { readValuesWithDefault, updatePref } from '../../js/pref.js';
import { _ } from '../../js/i18n.js';
import { isBrowser } from '../../js/util.js';
import { PAGE_STATE } from '../../js/sites/index.js';

let _LiveHelperModal = null;

class LiveUpdateOverlay extends React.Component {
  constructor(props) {
    super(props);
    this.state = { Component: _LiveHelperModal };
  }

  componentDidMount() {
    this._unmounted = false;
    if (!this.state.Component && isBrowser()) {
      import("./LiveHelperModal.js")
        .then((mod) => {
          _LiveHelperModal = mod.default || mod.LiveHelperModal;
          if (!this._unmounted) {
            this.setState({ Component: _LiveHelperModal });
          }
        })
        .catch(() => {});
    }
  }

  componentWillUnmount() {
    this._unmounted = true;
  }

  render() {
    const Component = this.state.Component || _LiveHelperModal;
    if (!Component) return null;
    return React.createElement(Component, this.props);
  }
}

export class LiveUpdate extends PluginBase {
  static id = 'live_update';
  static name = 'live_update';
  static prefKey = 'enableLiveUpdate';
  static group = 'bbs';
  static icon = 'sync';

  static get title() {
    return _('plugin_live_update_title');
  }

  static get description() {
    return _('plugin_live_update_desc');
  }

  static renderOptions({ values = {}, handleCheckboxChange, handleNumberInputChange }) {
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        "div",
        { className: "checkbox PrefModal__MacSubCheckbox" },
        React.createElement(
          "label",
          null,
          React.createElement("input", {
            type: "checkbox",
            name: "endTurnsOnLiveUpdate",
            checked: Boolean(values.endTurnsOnLiveUpdate !== false),
            onChange: handleCheckboxChange,
          }),
          React.createElement(
            "span",
            null,
            _("options_endTurnsOnLiveUpdate")
          )
        )
      ),
      React.createElement(
        "div",
        { className: "checkbox PrefModal__MacSubCheckbox" },
        React.createElement(
          "label",
          null,
          React.createElement("input", {
            type: "checkbox",
            name: "showLiveUpdateToolbar",
            checked: Boolean(values.showLiveUpdateToolbar !== false),
            onChange: handleCheckboxChange,
          }),
          React.createElement(
            "span",
            null,
            _("options_showLiveUpdateToolbar")
          )
        )
      ),
      React.createElement(
        "div",
        { className: "PrefModal__MacSubOptionRow" },
        React.createElement(
          "span",
          { className: "PrefModal__MacSubLabel" },
          _("options_liveUpdateInterval")
        ),
        React.createElement(
          "div",
          { className: "PrefModal__MacSubInlineInput" },
          React.createElement("input", {
            className: "form-control",
            type: "number",
            name: "liveUpdateInterval",
            min: "1",
            value: values.liveUpdateInterval || 1,
            onChange: handleNumberInputChange,
          }),
          React.createElement(
            "span",
            { className: "PrefModal__MacSubUnit" },
            _("options_liveUpdateIntervalSec")
          )
        )
      )
    );
  }

  constructor(app, options = {}) {
    super(app, options);
    if (this.endTurnsOn === undefined) this.endTurnsOn = options.endTurnsOn ?? true;
    if (this.intervalSec === undefined) this.intervalSec = options.intervalSec ?? 1;
    if (this.showToolbar === undefined) this.showToolbar = options.showToolbar ?? true;
    if (this.active === undefined) this.active = false;
    if (this.showsModal === undefined) this.showsModal = Boolean(this.enabled && this.showToolbar);
    if (this.timer === undefined) this.timer = null;
  }

  getContextMenuItems() {
    return [
      {
        id: 'live_update',
        order: 20,
        label: () => _('cmenu_showLiveArticleHelper'),
        visible: (app, { normalEnabled } = {}) =>
          Boolean(normalEnabled !== false && this.enabled),
        onClick: () => {
          this.showModal(true);
        },
      },
    ];
  }

  onInit() {
    if (isBrowser() && !_LiveHelperModal) {
      import("./LiveHelperModal.js")
        .then((mod) => {
          _LiveHelperModal = mod.default || mod.LiveHelperModal;
        })
        .catch(() => {});
    }
    this.listenApp('term:pref-change', (e) => {
      const key = e?.key ?? e?.detail?.key;
      const value = e?.value !== undefined ? e.value : e?.detail?.value;
      switch (key) {
        case 'endTurnsOnLiveUpdate':
          this.setEndTurnsOn(Boolean(value));
          break;
        case 'liveUpdateInterval':
          this.setIntervalSec(value);
          break;
        case 'showLiveUpdateToolbar':
          this.setShowToolbar(Boolean(value));
          break;
      }
    });
    this.listenAppWhileEnabled('term:screen-update', () => {
      if (!this.active) return;
      const pageState = this.app?.site?.pageState;
      if (pageState !== PAGE_STATE.LIST && pageState !== PAGE_STATE.READING) {
        this.stop();
      }
    });
    this.listenAppWhileEnabled('term:disconnect', () => {
      if (this.active) {
        this.stop();
      }
    });
    this.listenAppWhileEnabled('term:easy-reading:switch', (e) => {
      const doSwitch = e?.doSwitch ?? e?.detail?.doSwitch;
      if (doSwitch && this.active) {
        this.stop();
      }
    });
    this.listenAppWhileEnabled('term:click', () => {
      if (this.active) {
        this.stop();
      }
    });
    this.registerInputInterceptorWhileEnabled(this);
  }

  syncFromPrefs() {
    super.syncFromPrefs();
    let prefs = null;
    try {
      prefs = this.app?.prefValues || readValuesWithDefault();
    } catch {
      prefs = null;
    }

    if (this.options?.endTurnsOn !== undefined) {
      this.endTurnsOn = Boolean(this.options.endTurnsOn);
    } else {
      this.endTurnsOn =
        prefs?.endTurnsOnLiveUpdate !== undefined
          ? Boolean(prefs.endTurnsOnLiveUpdate)
          : true;
    }

    if (this.options?.intervalSec !== undefined) {
      this.intervalSec = Math.max(1, parseInt(this.options.intervalSec, 10) || 1);
    } else {
      this.intervalSec = Math.max(1, parseInt(prefs?.liveUpdateInterval, 10) || 1);
    }

    if (this.options?.showToolbar !== undefined) {
      this.showToolbar = Boolean(this.options.showToolbar);
    } else {
      this.showToolbar =
        prefs?.showLiveUpdateToolbar !== undefined
          ? Boolean(prefs.showLiveUpdateToolbar)
          : true;
    }

    this.showsModal = Boolean(this.enabled && this.showToolbar);
    if (this._initialized) {
      this.renderUI();
    }
  }

  onEnable() {
    if (this.showToolbar) {
      this.showsModal = true;
    }
  }

  onDisable() {
    this.stopTimer();
    this.active = false;
    this.showsModal = false;
  }

  onDestroy() {
    this.stopTimer();
    this.active = false;
    this.showsModal = false;
  }

  renderUI() {
    this.app?.emit('term:overlay:update');
  }

  renderOverlay({ app } = {}) {
    if (!this.enabled || !this.showsModal) return null;
    return React.createElement(LiveUpdateOverlay, {
      show: this.showsModal,
      active: this.active,
      intervalSec: this.intervalSec,
      onToggle: () => this.toggle(),
      onIntervalChange: (sec) => this.setIntervalSec(sec, true),
      onClose: () => this.hideModal(true),
    });
  }

  setShowToolbar(show, savePref = false) {
    this.showToolbar = !!show;
    if (this.showToolbar && this.enabled) {
      this.showModal(savePref);
    } else {
      this.hideModal(savePref);
    }
  }

  setEndTurnsOn(val, savePref = false) {
    this.endTurnsOn = !!val;
    if (savePref) {
      if (this.app?.prefValues) {
        this.app.prefValues.endTurnsOnLiveUpdate = this.endTurnsOn;
      }
      updatePref('endTurnsOnLiveUpdate', this.endTurnsOn);
    }
  }

  setIntervalSec(sec, savePref = false) {
    const parsed = parseInt(sec, 10);
    const nextSec = parsed > 1 ? parsed : 1;
    const changed = this.intervalSec !== nextSec;
    this.intervalSec = nextSec;
    if (savePref) {
      if (this.app?.prefValues) {
        this.app.prefValues.liveUpdateInterval = this.intervalSec;
      }
      updatePref('liveUpdateInterval', this.intervalSec);
    }
    if (!this.enabled) return;
    if (this.active) {
      this.start();
    } else if (changed || savePref) {
      this.renderUI();
    }
  }

  start() {
    this.stopTimer();
    this.active = true;
    const intervalMs = (this.intervalSec || 1) * 1000;
    this.timer = this.setInterval(() => {
      const site = this.app?.site;
      const pageState = site?.pageState;
      if (pageState === PAGE_STATE.READING || pageState === PAGE_STATE.LIST) {
        const cmd = site?.getRefreshLiveThreadCommand
          ? site.getRefreshLiveThreadCommand(this.buf || this.app?.buf)
          : 'r';
        this.app?.send(cmd);
      }
    }, intervalMs);
    this.renderUI();
  }

  stopTimer() {
    if (this.timer) {
      this.clearInterval(this.timer);
      this.timer = null;
    }
  }

  stop() {
    this.stopTimer();
    if (this.active) {
      this.active = false;
      this.renderUI();
    }
  }

  toggle() {
    if (this.active) {
      this.stop();
    } else {
      this.start();
    }
  }

  showModal(savePref = false) {
    const changed = !this.showsModal || !this.showToolbar;
    this.showsModal = true;
    this.showToolbar = true;
    if (savePref) {
      if (this.app?.prefValues) {
        this.app.prefValues.showLiveUpdateToolbar = true;
      }
      updatePref('showLiveUpdateToolbar', true);
    }
    if (changed) {
      this.renderUI();
    }
  }

  hideModal(savePref = false) {
    const changed = this.showsModal || (savePref && this.showToolbar);
    this.showsModal = false;
    if (savePref) {
      this.showToolbar = false;
      if (this.app?.prefValues) {
        this.app.prefValues.showLiveUpdateToolbar = false;
      }
      updatePref('showLiveUpdateToolbar', false);
    }
    if (changed) {
      this.renderUI();
    }
  }

  toggleModal() {
    this.showsModal = !this.showsModal;
    this.showToolbar = this.showsModal;
    this.renderUI();
  }

  handleKeyDown(e) {
    if (!this.enabled) {
      return false;
    }

    const site = this.app?.site;
    const pageState = site?.pageState;

    // Toggle on 'End' key when in article reading mode (PAGE_STATE.LIST or PAGE_STATE.READING)
    if (!e.ctrlKey && !e.altKey && (e.key === 'End' || e.keyCode === 35)) {
      if (this.endTurnsOn && (pageState === PAGE_STATE.LIST || pageState === PAGE_STATE.READING)) {
        this.toggle();
        this.showModal(true);
        e.preventDefault?.();
        e.stopPropagation?.();
        return true;
      }
    }

    // Toggle on 'Alt + r'
    if (!e.ctrlKey && e.altKey && (e.key === 'r' || e.key === 'R' || e.keyCode === 82)) {
      if (pageState === PAGE_STATE.LIST || pageState === PAGE_STATE.READING) {
        this.toggle();
        this.showModal(true);
        e.preventDefault?.();
        e.stopPropagation?.();
        return true;
      }
    }

    // Auto-disable auto-refresh if any regular command key is pressed without Alt
    if (!e.altKey && !e.metaKey && this.active) {
      if (
        e.key !== 'Shift' &&
        e.key !== 'Control' &&
        e.key !== 'Alt' &&
        e.key !== 'Meta' &&
        e.key !== 'CapsLock' &&
        !(e.keyCode > 15 && e.keyCode < 19)
      ) {
        this.stop();
      }
    }

    return false;
  }
}

export default LiveUpdate;
