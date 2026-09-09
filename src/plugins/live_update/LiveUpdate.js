import React from "preact/compat";
import { readValuesWithDefault, updatePref } from '../../js/pref.js';
import { _ } from '../../js/i18n.js';
import { LiveHelperUI } from './LiveHelperUI.js';

export class LiveUpdate {
  static id = 'live_update';
  static name = 'live_update';
  static prefKey = 'enableLiveUpdate';

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

  renderOptions(props) {
    return LiveUpdate.renderOptions(props);
  }

  static getMetadata() {
    return {
      id: 'live_update',
      name: 'live_update',
      title: _('plugin_live_update_title'),
      description: _('plugin_live_update_desc'),
      prefKey: 'enableLiveUpdate',
      icon: 'sync',
      renderOptions: LiveUpdate.renderOptions,
    };
  }

  constructor(app, options = {}) {
    this.app = app || null;
    this.view = options.view || null;
    this.buf = options.buf || null;
    this.enabled = options.enabled ?? false;
    this.endTurnsOn = options.endTurnsOn ?? true;
    this.intervalSec = options.intervalSec ?? 1;
    this.showToolbar = options.showToolbar ?? true;
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

  getMetadata() {
    return {
      id: this.id,
      name: this.name,
      title: this.title,
      description: this.description,
      prefKey: this.prefKey,
      enabled: this.enabled,
      icon: this.icon,
      renderOptions: LiveUpdate.renderOptions,
    };
  }

  getContextMenuItems() {
    return [
      {
        id: 'live_update',
        order: 20,
        label: () => _('cmenu_showLiveArticleHelper'),
        visible: (app, { normalEnabled }) => normalEnabled && Boolean(this.enabled),
        onClick: () => {
          this.showModal(true);
        },
      },
    ];
  }

  init({ app, view, buf } = {}) {
    if (app) this.app = app;
    if (view) this.view = view;
    if (buf) this.buf = buf;

    if (this.app) {
      this._onPrefChangeBound = (e) => {
        const { key, value } = e.detail || {};
        switch (key) {
          case 'enableLiveUpdate':
            this.setEnabled(Boolean(value));
            break;
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
      };
      this._onStateChangeBound = (e) => {
        const state = e.detail?.state;
        if (state !== 2 && state !== 3 && this.active) {
          this.stop();
        }
      };
      this._onDisconnectBound = () => {
        if (this.active) {
          this.stop();
        }
      };
      this._onEasyReadingSwitchBound = (e) => {
        if (e.detail?.doSwitch && this.active) {
          this.stop();
        }
      };
      this._onClickBound = () => {
        if (this.active) {
          this.stop();
        }
      };
      this.app.addEventListener?.('term:pref-change', this._onPrefChangeBound);
      this.app.addEventListener?.('term:state-change', this._onStateChangeBound);
      this.app.addEventListener?.('term:disconnect', this._onDisconnectBound);
      this.app.addEventListener?.('term:easy-reading:switch', this._onEasyReadingSwitchBound);
      this.app.addEventListener?.('term:click', this._onClickBound);
      this.app.registerContextMenuItem?.(this.getContextMenuItems()[0]);
    }

    const prefs = readValuesWithDefault();
    this.enabled = Boolean(
      prefs.enableLiveUpdate !== undefined
        ? prefs.enableLiveUpdate
        : prefs.endTurnsOnLiveUpdate
    );
    this.endTurnsOn =
      prefs.endTurnsOnLiveUpdate !== undefined
        ? Boolean(prefs.endTurnsOnLiveUpdate)
        : true;
    this.intervalSec = Math.max(1, parseInt(prefs.liveUpdateInterval, 10) || 1);
    this.showToolbar =
      prefs.showLiveUpdateToolbar !== undefined
        ? Boolean(prefs.showLiveUpdateToolbar)
        : true;

    if (typeof document !== 'undefined') {
      this.ui = new LiveHelperUI(this);
      if (this.enabled && this.showToolbar) {
        this.showsModal = true;
        this.renderUI();
      }
    }
  }

  destroy() {
    this.stop();
    this.hideModal();
    if (this.app) {
      this.app.removeEventListener?.('term:pref-change', this._onPrefChangeBound);
      this.app.removeEventListener?.('term:state-change', this._onStateChangeBound);
      this.app.removeEventListener?.('term:disconnect', this._onDisconnectBound);
      this.app.removeEventListener?.('term:easy-reading:switch', this._onEasyReadingSwitchBound);
      this.app.removeEventListener?.('term:click', this._onClickBound);
      this.app.unregisterContextMenuItem?.('live_update');
    }
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

  setEnabled(enabled) {
    this.enabled = !!enabled;
    if (this.enabled) {
      if (this.showToolbar) {
        this.showModal();
      }
    } else {
      this.stop();
      this.hideModal();
    }
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
      updatePref('endTurnsOnLiveUpdate', this.endTurnsOn);
    }
  }

  setIntervalSec(sec, savePref = false) {
    const parsed = parseInt(sec, 10);
    this.intervalSec = parsed > 1 ? parsed : 1;
    if (savePref) {
      updatePref('liveUpdateInterval', this.intervalSec);
    }
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
      if (pageState === 3 || pageState === 2) {
        const site = this.app?.site || this.buf?.site;
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

  showModal(savePref = false) {
    this.showsModal = true;
    this.showToolbar = true;
    if (savePref) {
      updatePref('showLiveUpdateToolbar', true);
    }
    this.renderUI();
  }

  hideModal(savePref = false) {
    this.showsModal = false;
    if (savePref) {
      this.showToolbar = false;
      updatePref('showLiveUpdateToolbar', false);
    }
    this.renderUI();
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

    const pageState = this.buf ? this.buf.pageState : this.app?.buf?.pageState;

    // Toggle on 'End' key when in article reading mode (pageState 2 or 3)
    if (!e.ctrlKey && !e.altKey && (e.key === 'End' || e.keyCode === 35)) {
      if (this.endTurnsOn && (pageState === 2 || pageState === 3)) {
        this.toggle();
        this.showModal(true);
        e.preventDefault?.();
        e.stopPropagation?.();
        return true;
      }
    }

    // Toggle on 'Alt + r'
    if (!e.ctrlKey && e.altKey && (e.key === 'r' || e.key === 'R' || e.keyCode === 82)) {
      if (pageState === 2 || pageState === 3) {
        this.toggle();
        this.showModal(true);
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
