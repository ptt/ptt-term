import { BUILTIN_PLUGINS, PluginBase } from '../plugins/index.js';
import { registerPluginPrefs } from './pref.js';

export class PluginManager {
  constructor(app) {
    this.app = app;
    this.plugins = [];
    this.overlays = [];
    this.contextMenuItems = [];
  }

  registerPlugin(plugin) {
    if (!plugin || this.plugins.includes(plugin)) return;
    registerPluginPrefs([plugin.constructor || plugin]);
    this.plugins.push(plugin);
    if (typeof plugin.init === 'function') {
      plugin.init({ app: this.app });
    }
  }

  unregisterPlugin(pluginOrId) {
    if (!pluginOrId) return false;
    const idx = this.plugins.findIndex(
      (p) =>
        p === pluginOrId ||
        p.id === pluginOrId ||
        p.name === pluginOrId ||
        p.constructor?.name === pluginOrId
    );
    if (idx === -1) return false;
    const [removed] = this.plugins.splice(idx, 1);
    if (typeof removed?.destroy === 'function') {
      removed.destroy();
    }
    return true;
  }

  destroyPlugins() {
    for (const plugin of [...this.plugins]) {
      if (typeof plugin?.destroy === 'function') {
        plugin.destroy();
      }
    }
    this.plugins = [];
  }

  destroy() {
    this.destroyPlugins();
    this.overlays = [];
    this.contextMenuItems = [];
  }

  initPlugins(pluginClasses = BUILTIN_PLUGINS) {
    if (!Array.isArray(pluginClasses)) return;
    for (const PluginClass of pluginClasses) {
      if (typeof PluginClass === 'function') {
        const instance = new PluginClass(this.app);
        this.registerPlugin(instance);
      } else if (PluginClass && typeof PluginClass === 'object') {
        this.registerPlugin(PluginClass);
      }
    }
  }

  getPlugin(name) {
    return this.plugins.find(
      (p) => p.id === name || p.name === name || p.constructor?.name === name
    );
  }

  getPluginList() {
    return this.plugins.map((p) => {
      const meta = p.getMetadata
        ? { ...p.getMetadata() }
        : {
            id: p.id || p.name || p.constructor?.name,
            name: p.name || p.constructor?.name,
            title: p.title || p.name,
            description: p.description || '',
            prefKey: p.prefKey,
            enabled: p.enabled,
            icon: p.icon || 'extension',
            group: p.group || p.constructor?.group,
          };
      if (!meta.group) {
        meta.group = p.group || p.constructor?.group;
      }
      const hasCustomRenderOptions =
        typeof p.constructor?.renderOptions === 'function' ||
        (typeof p.renderOptions === 'function' &&
          p.renderOptions !== PluginBase.prototype.renderOptions);
      if (hasCustomRenderOptions && !meta.renderOptions) {
        meta.renderOptions = (
          p.constructor?.renderOptions || p.renderOptions
        ).bind(p);
      }
      const hasCustomOnTogglePref =
        typeof p.constructor?.onTogglePref === 'function' ||
        (typeof p.onTogglePref === 'function' &&
          p.onTogglePref !== PluginBase.prototype.onTogglePref);
      if (hasCustomOnTogglePref && !meta.onTogglePref) {
        meta.onTogglePref = (
          p.constructor?.onTogglePref || p.onTogglePref
        ).bind(p.constructor?.onTogglePref ? p.constructor : p);
      }
      return meta;
    });
  }

  registerOverlay(overlay) {
    if (!overlay || !overlay.id) return;
    const idx = this.overlays.findIndex((o) => o.id === overlay.id);
    if (idx !== -1) {
      this.overlays[idx] = overlay;
    } else {
      this.overlays.push(overlay);
    }
    this.app.emit('term:overlay:update', { overlay });
  }

  unregisterOverlay(idOrOverlay) {
    const id = typeof idOrOverlay === 'string' ? idOrOverlay : idOrOverlay?.id;
    const idx = this.overlays.findIndex((o) => o.id === id);
    if (idx !== -1) {
      const [removed] = this.overlays.splice(idx, 1);
      this.app.emit('term:overlay:update', { removed });
    }
  }

  getOverlays() {
    return [...this.overlays];
  }

  registerContextMenuItem(item) {
    if (!item || !item.id) return;
    const idx = this.contextMenuItems.findIndex((i) => i.id === item.id);
    if (idx !== -1) {
      this.contextMenuItems[idx] = item;
    } else {
      this.contextMenuItems.push(item);
    }
    this.app.emit('term:context-menu:update', { item });
  }

  unregisterContextMenuItem(idOrItem) {
    const id = typeof idOrItem === 'string' ? idOrItem : idOrItem?.id;
    const idx = this.contextMenuItems.findIndex((i) => i.id === id);
    if (idx !== -1) {
      const [removed] = this.contextMenuItems.splice(idx, 1);
      this.app.emit('term:context-menu:update', { removed });
    }
  }

  getContextMenuItems() {
    return [...this.contextMenuItems];
  }
}
