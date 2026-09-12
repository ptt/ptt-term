/**
 * PluginBase
 *
 * Unified base class for all ptt-term plugins.
 * Provides:
 * - Standardized lifecycle management (init, enable, disable, destroy, syncFromPrefs)
 * - Automatic listener registration & unregistration (listen, unlisten, clearListeners)
 * - Conditional listeners that only run when enabled (listenWhileEnabled / whenEnabled option)
 * - Safe timer tracking (setTimeout, setInterval automatically cleared on disable/destroy)
 * - Managed context menu items, overlays, and input interceptors
 * - Standardized metadata extraction
 */

import { readValuesWithDefault, updatePref } from '../js/pref.js';

export class PluginBase {
  static id = '';
  static name = '';
  static prefKey = '';
  static group = 'other';
  static icon = 'extension';
  static defaultPrefs = {};

  static getMetadata() {
    return {
      id: this.id || this.name,
      name: this.name || this.id,
      title: typeof this.getTitle === 'function' ? this.getTitle() : this.title || this.name,
      description: typeof this.getDescription === 'function' ? this.getDescription() : this.description || '',
      prefKey: this.prefKey,
      defaultPrefs:
        typeof this.getDefaultPrefs === 'function'
          ? this.getDefaultPrefs()
          : (this.defaultPrefs || {}),
      icon: this.icon || 'extension',
      group: this.group || 'other',
      renderOptions: this.renderOptions,
      onTogglePref:
        typeof this.onTogglePref === 'function'
          ? this.onTogglePref.bind(this)
          : undefined,
    };
  }

  constructor(app, options = {}) {
    const isApp = app && (
      typeof app.on === 'function' ||
      typeof app.addEventListener === 'function' ||
      typeof app.emit === 'function' ||
      typeof app.dispatch === 'function' ||
      'prefValues' in app
    );
    const resolvedApp = isApp ? app : null;
    const resolvedOptions = isApp ? options : (app || options || {});

    this.app = resolvedApp;
    this.view = resolvedOptions.view || resolvedApp?.view || null;
    this.buf = resolvedOptions.buf || resolvedApp?.buf || null;
    this.options = resolvedOptions;

    // Internal trackers for managed resources
    this._listeners = []; // { target, event, handler, options, whenEnabled, active }
    this._timers = new Set();
    this._contextMenuItems = [];
    this._overlays = [];
    this._interceptors = [];
    this._hasPrefListener = false;
    this._initialized = false;
    this._initializing = false;
    this._enabledActive = false;

    this.enabled = false;
    this.syncFromPrefs();
    if (resolvedOptions.enabled !== undefined) {
      this.enabled = Boolean(resolvedOptions.enabled);
    }
  }

  // --- Metadata Getters ---
  get id() {
    return this.constructor.id || this.constructor.name || '';
  }

  get name() {
    return this.constructor.name || this.id;
  }

  get prefKey() {
    return this.constructor.prefKey || '';
  }

  get group() {
    return this.constructor.group || 'other';
  }

  get icon() {
    return this.constructor.icon || 'extension';
  }

  get title() {
    return typeof this.constructor.getTitle === 'function'
      ? this.constructor.getTitle()
      : this.constructor.title || this.name;
  }

  get description() {
    return typeof this.constructor.getDescription === 'function'
      ? this.constructor.getDescription()
      : this.constructor.description || '';
  }

  getMetadata() {
    const hasCustomRenderOptions =
      typeof this.constructor.renderOptions === 'function' ||
      (typeof this.renderOptions === 'function' &&
        this.renderOptions !== PluginBase.prototype.renderOptions);
    const hasCustomOnTogglePref =
      typeof this.constructor.onTogglePref === 'function' ||
      (typeof this.onTogglePref === 'function' &&
        this.onTogglePref !== PluginBase.prototype.onTogglePref);
    return {
      id: this.id,
      name: this.name,
      title: this.title,
      description: this.description,
      prefKey: this.prefKey,
      defaultPrefs:
        typeof this.constructor.getDefaultPrefs === 'function'
          ? this.constructor.getDefaultPrefs()
          : (this.constructor.defaultPrefs || {}),
      enabled: this.enabled,
      icon: this.icon,
      group: this.group,
      renderOptions:
        this.constructor.renderOptions ||
        (hasCustomRenderOptions ? this.renderOptions.bind(this) : undefined),
      onTogglePref:
        this.constructor.onTogglePref
          ? this.constructor.onTogglePref.bind(this.constructor)
          : (hasCustomOnTogglePref ? this.onTogglePref.bind(this) : undefined),
    };
  }

  onTogglePref(checked, nextValues) {
    if (typeof this.constructor.onTogglePref === 'function') {
      return this.constructor.onTogglePref(checked, nextValues);
    }
    return nextValues;
  }

  renderOptions(props) {
    if (typeof this.constructor.renderOptions === 'function') {
      return this.constructor.renderOptions(props);
    }
    return null;
  }

  // --- Lifecycle Methods ---
  init(initOptions = {}) {
    const { app, view, buf, enabled } = initOptions || {};
    const targetApp = app || this.app;
    if (targetApp && this.app && targetApp !== this.app) {
      this.destroy();
      this.view = null;
      this.buf = null;
    }
    if (targetApp) {
      this.app = targetApp;
    }
    this.view = view || this.view || this.app?.view || null;
    this.buf = buf || this.buf || this.app?.buf || null;

    if (this._initialized) {
      if (enabled !== undefined) {
        this.setEnabled(Boolean(enabled), false);
      }
      return;
    }
    this._initialized = true;

    this.syncFromPrefs();

    if (this.options?.enabled !== undefined) {
      this.enabled = Boolean(this.options.enabled);
    }
    if (enabled !== undefined) {
      this.enabled = Boolean(enabled);
    }

    this._initializing = true;
    try {
      // Auto-listen to term:pref-change on app to sync state when prefKey changes
      if (this.app && this.prefKey && !this._hasPrefListener) {
        this._hasPrefListener = true;
        this._prefChangeListener = (e) => {
          const key = e?.key ?? e?.detail?.key;
          const value = e?.value !== undefined ? e.value : e?.detail?.value;
          if (key === this.prefKey && Boolean(value) !== this.enabled) {
            this.setEnabled(Boolean(value), false);
          }
        };
        this.listenApp('term:pref-change', this._prefChangeListener);
      }

      // Auto-register context menu items if defined
      if (this.app && typeof this.getContextMenuItems === 'function') {
        const items = this.getContextMenuItems();
        if (Array.isArray(items)) {
          for (const item of items) {
            this.registerContextMenuItem(item);
          }
        }
      } else if (this.app && Array.isArray(this.contextMenuItems)) {
        for (const item of this.contextMenuItems) {
          this.registerContextMenuItem(item);
        }
      }

      // Auto-register overlay if renderOverlay is defined
      if (this.app && typeof this.renderOverlay === 'function') {
        this.registerOverlayWhileEnabled({
          id: this.id || this.name,
          render: (props) => this.renderOverlay(props),
        });
      }

      // Subclass hook for initialization
      this.onInit?.(initOptions);

      // If enabled initially, activate enabled listeners & hooks
      if (this.enabled && !this._enabledActive) {
        this.enable();
      }
    } finally {
      this._initializing = false;
    }
  }

  syncFromPrefs() {
    if (this.options?.enabled !== undefined) {
      this.enabled = Boolean(this.options.enabled);
      return;
    }
    if (!this.prefKey) return;
    if (this.app?.prefValues && this.app.prefValues[this.prefKey] !== undefined) {
      this.enabled = Boolean(this.app.prefValues[this.prefKey]);
      return;
    }
    try {
      const prefs = readValuesWithDefault();
      if (prefs && prefs[this.prefKey] !== undefined) {
        this.enabled = Boolean(prefs[this.prefKey]);
      }
    } catch {
      // Ignore preference read errors in non-browser or mock environments
    }
  }

  setEnabled(enabled, persist = true) {
    const next = Boolean(enabled);
    if (next) {
      this.enable();
    } else {
      this.disable();
    }
    if (this.options && 'enabled' in this.options) {
      if ((this.app?.prefValues && this.prefKey) || (persist && this.prefKey)) {
        delete this.options.enabled;
      } else {
        this.options.enabled = this.enabled;
      }
    }
    if (this.app?.prefValues && this.prefKey) {
      this.app.prefValues[this.prefKey] = this.enabled;
    }
    if (persist && this.prefKey) {
      try {
        updatePref(this.prefKey, this.enabled);
      } catch {}
      if (typeof this.app?.onPrefChange === 'function') {
        this.app.onPrefChange(this.prefKey, this.enabled);
      } else {
        if (typeof this.app?.onValuesPrefChange === 'function' && this.app?.prefValues) {
          this.app.onValuesPrefChange(this.app.prefValues);
        }
        this.app?.emit?.('term:pref-change', {
          key: this.prefKey,
          value: this.enabled,
          detail: { key: this.prefKey, value: this.enabled },
        });
      }
    }
  }

  enable() {
    if (this.enabled && this._enabledActive) return;
    this.enabled = true;
    this._enabledActive = true;
    this._activateEnabledListeners();
    this._activateEnabledInterceptors();
    this._activateEnabledOverlays();
    this.onEnable?.();
    if (!this.enabled) return;
    this.app?.emit?.('term:overlay:update');
    if (this._contextMenuItems.length > 0) {
      this.app?.emit?.('term:context-menu:update');
    }
  }

  disable() {
    if (!this.enabled && !this._enabledActive) return;
    const wasActive = this._enabledActive;
    this.enabled = false;
    this._enabledActive = false;
    if (wasActive) {
      this.onDisable?.();
    }
    this._deactivateEnabledListeners();
    this._deactivateEnabledInterceptors();
    this._deactivateEnabledOverlays();
    this.clearTimers();
    if (this.enabled) return;
    this.app?.emit?.('term:overlay:update');
    if (this._contextMenuItems.length > 0) {
      this.app?.emit?.('term:context-menu:update');
    }
  }

  destroy() {
    this.disable();
    this.clearListeners();
    this.clearTimers();
    this._clearContextMenuItems();
    this._clearOverlays();
    this._clearInterceptors();
    this._hasPrefListener = false;
    this._initialized = false;
    this._initializing = false;
    this._enabledActive = false;
    this.onDestroy?.();
  }

  // --- Managed Event Listeners ---
  listen(target, event, handler, options = {}) {
    if (!target || typeof handler !== 'function') return () => {};
    const whenEnabled = Boolean(options?.whenEnabled);
    let domOptions = options;
    if (typeof options === 'object' && options !== null && 'whenEnabled' in options) {
      const { whenEnabled: _we, ...rest } = options;
      domOptions = Object.keys(rest).length > 0 ? rest : false;
    }

    let entry = this._listeners.find(
      (l) => l.target === target && l.event === event && l.handler === handler
    );
    if (!entry) {
      entry = {
        target,
        event,
        handler,
        options: domOptions,
        whenEnabled,
        active: false,
      };
      this._listeners.push(entry);
    } else if (whenEnabled && !entry.whenEnabled) {
      entry.whenEnabled = true;
      if (!this._enabledActive && entry.active) {
        this._detachListener(entry);
      }
    }

    if (!entry.whenEnabled || this._enabledActive) {
      this._attachListener(entry);
    }

    return () => this.unlisten(target, event, handler);
  }

  listenApp(event, handler, options = {}) {
    return this.listen(this.app, event, handler, options);
  }

  listenWhileEnabled(target, event, handler, options = {}) {
    return this.listen(target, event, handler, { ...options, whenEnabled: true });
  }

  listenAppWhileEnabled(event, handler, options = {}) {
    return this.listen(this.app, event, handler, { ...options, whenEnabled: true });
  }

  unlisten(target, event, handler) {
    const idx = this._listeners.findIndex(
      (l) => l.target === target && l.event === event && l.handler === handler
    );
    if (idx !== -1) {
      const entry = this._listeners[idx];
      this._detachListener(entry);
      this._listeners.splice(idx, 1);
    }
  }

  unlistenApp(event, handler) {
    return this.unlisten(this.app, event, handler);
  }

  clearListeners() {
    for (const entry of this._listeners) {
      this._detachListener(entry);
    }
    this._listeners = [];
  }

  _attachListener(entry) {
    if (entry.active) return;
    const { target, event, handler, options } = entry;
    if (typeof target.on === 'function' && typeof target.off === 'function') {
      target.on(event, handler);
    } else if (typeof target.addEventListener === 'function') {
      target.addEventListener(event, handler, options);
    }
    entry.active = true;
  }

  _detachListener(entry) {
    if (!entry.active) return;
    const { target, event, handler, options } = entry;
    if (typeof target.off === 'function') {
      target.off(event, handler);
    } else if (typeof target.removeEventListener === 'function') {
      target.removeEventListener(event, handler, options);
    }
    entry.active = false;
  }

  _activateEnabledListeners() {
    for (const entry of this._listeners) {
      if (entry.whenEnabled && !entry.active) {
        this._attachListener(entry);
      }
    }
  }

  _deactivateEnabledListeners() {
    for (const entry of this._listeners) {
      if (entry.whenEnabled && entry.active) {
        this._detachListener(entry);
      }
    }
  }

  // --- Managed Timers ---
  setTimeout(fn, delay) {
    const id = setTimeout(() => {
      this._timers.delete(id);
      fn();
    }, delay);
    this._timers.add(id);
    return id;
  }

  clearTimeout(id) {
    clearTimeout(id);
    this._timers.delete(id);
  }

  setInterval(fn, delay) {
    const id = setInterval(fn, delay);
    this._timers.add(id);
    return id;
  }

  clearInterval(id) {
    clearInterval(id);
    this._timers.delete(id);
  }

  clearTimers() {
    for (const id of this._timers) {
      clearTimeout(id);
      clearInterval(id);
    }
    this._timers.clear();
  }

  // --- Managed Context Menu Items ---
  getContextMenuItems() {
    return [];
  }

  registerContextMenuItem(item) {
    if (!item) return;
    const itemId = item.id || item;
    const existingIdx = this._contextMenuItems.findIndex((i) => (i.id || i) === itemId);
    if (existingIdx !== -1) {
      this._contextMenuItems[existingIdx] = item;
    } else {
      this._contextMenuItems.push(item);
    }
    const resolvedItem =
      typeof item === 'object' && item !== null && item.visible === undefined
        ? {
            ...item,
            visible: (app, { normalEnabled } = {}) =>
              Boolean(normalEnabled !== false && this.enabled),
          }
        : item;
    this.app?.registerContextMenuItem?.(resolvedItem);
  }

  unregisterContextMenuItem(idOrItem) {
    if (!idOrItem) return;
    const itemId = idOrItem.id || idOrItem;
    const idx = this._contextMenuItems.findIndex((i) => (i.id || i) === itemId);
    if (idx !== -1) {
      this._contextMenuItems.splice(idx, 1);
    }
    this.app?.unregisterContextMenuItem?.(itemId);
  }

  _clearContextMenuItems() {
    for (const item of this._contextMenuItems) {
      const id = item.id || item;
      this.app?.unregisterContextMenuItem?.(id);
    }
    this._contextMenuItems = [];
  }

  // --- Managed Overlays ---
  registerOverlay(overlay, options = {}) {
    if (!overlay) return;
    const whenEnabled = Boolean(options?.whenEnabled);
    const overlayId = overlay.id || overlay;
    let entry = this._overlays.find(
      (o) => (o.overlay?.id || o.overlay || o.id || o) === overlayId
    );
    if (!entry) {
      entry = { overlay, whenEnabled, active: false };
      this._overlays.push(entry);
    } else {
      entry.overlay = overlay;
      if (whenEnabled && !entry.whenEnabled) {
        entry.whenEnabled = true;
        if (!this._enabledActive && entry.active) {
          this._detachOverlay(entry);
        }
      }
    }

    if (!entry.whenEnabled || this._enabledActive) {
      this._attachOverlay(entry);
    }
  }

  registerOverlayWhileEnabled(overlay, options = {}) {
    return this.registerOverlay(overlay, { ...options, whenEnabled: true });
  }

  unregisterOverlay(idOrOverlay) {
    if (!idOrOverlay) return;
    const overlayId = idOrOverlay.id || idOrOverlay;
    const idx = this._overlays.findIndex(
      (o) => (o.overlay?.id || o.overlay || o.id || o) === overlayId
    );
    if (idx !== -1) {
      const entry = this._overlays[idx];
      this._detachOverlay(entry);
      this._overlays.splice(idx, 1);
    } else {
      this.app?.unregisterOverlay?.(overlayId);
    }
  }

  _attachOverlay(entry) {
    if (entry.active) return;
    const overlay = entry.overlay || entry;
    this.app?.registerOverlay?.(overlay);
    entry.active = true;
  }

  _detachOverlay(entry) {
    if (!entry.active) return;
    const overlay = entry.overlay || entry;
    const id = overlay.id || overlay;
    this.app?.unregisterOverlay?.(id);
    entry.active = false;
  }

  _activateEnabledOverlays() {
    for (const entry of this._overlays) {
      if (entry.whenEnabled && !entry.active) {
        this._attachOverlay(entry);
      }
    }
  }

  _deactivateEnabledOverlays() {
    for (const entry of this._overlays) {
      if (entry.whenEnabled && entry.active) {
        this._detachOverlay(entry);
      }
    }
  }

  _clearOverlays() {
    for (const entry of this._overlays) {
      this._detachOverlay(entry);
    }
    this._overlays = [];
  }

  // --- Managed Input Interceptors ---
  registerInputInterceptor(interceptor, options = {}) {
    if (!interceptor) return;
    const whenEnabled = Boolean(options?.whenEnabled);
    let entry = this._interceptors.find((i) => (i.interceptor || i) === interceptor);
    if (!entry) {
      entry = { interceptor, whenEnabled, active: false };
      this._interceptors.push(entry);
    } else if (whenEnabled && !entry.whenEnabled) {
      entry.whenEnabled = true;
      if (!this._enabledActive && entry.active) {
        this._detachInterceptor(entry);
      }
    }

    if (!entry.whenEnabled || this._enabledActive) {
      this._attachInterceptor(entry);
    }
  }

  registerInputInterceptorWhileEnabled(interceptor, options = {}) {
    return this.registerInputInterceptor(interceptor, { ...options, whenEnabled: true });
  }

  unregisterInputInterceptor(interceptor) {
    if (!interceptor) return;
    const index = this._interceptors.findIndex(
      (i) => (i.interceptor || i) === interceptor || i === interceptor
    );
    if (index !== -1) {
      const entry = this._interceptors[index];
      this._detachInterceptor(entry);
      this._interceptors.splice(index, 1);
    }
  }

  _attachInterceptor(entry) {
    if (entry.active) return;
    const interceptor = entry.interceptor || entry;
    this.app?.registerInputInterceptor?.(interceptor);
    entry.active = true;
  }

  _detachInterceptor(entry) {
    if (!entry.active) return;
    const interceptor = entry.interceptor || entry;
    this.app?.unregisterInputInterceptor?.(interceptor);
    entry.active = false;
  }

  _activateEnabledInterceptors() {
    for (const entry of this._interceptors) {
      if (entry.whenEnabled && !entry.active) {
        this._attachInterceptor(entry);
      }
    }
  }

  _deactivateEnabledInterceptors() {
    for (const entry of this._interceptors) {
      if (entry.whenEnabled && entry.active) {
        this._detachInterceptor(entry);
      }
    }
  }

  _clearInterceptors() {
    for (const entry of this._interceptors) {
      this._detachInterceptor(entry);
    }
    this._interceptors = [];
  }
}
