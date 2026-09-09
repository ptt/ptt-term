import {
  EasyReading,
  EasyReadingPlugin,
  INFLIGHT_WATCHDOG_MS,
  MAX_INFLIGHT_RETRIES,
} from './easy_reading/index.js';

export {
  EasyReading,
  EasyReadingPlugin,
  INFLIGHT_WATCHDOG_MS,
  MAX_INFLIGHT_RETRIES,
};

export const BUILTIN_PLUGINS = [
  EasyReading,
];

export function getAvailablePlugins(app) {
  if (app && app.getPluginList) {
    const list = app.getPluginList();
    if (list && list.length > 0) return list;
  }
  return BUILTIN_PLUGINS.map((PluginClass) => {
    if (PluginClass.getMetadata) {
      return PluginClass.getMetadata();
    }
    const instance = new PluginClass();
    return instance.getMetadata
      ? instance.getMetadata()
      : {
          id: PluginClass.name,
          name: PluginClass.name,
          title: PluginClass.name,
          description: '',
          prefKey: PluginClass.prefKey,
          icon: 'extension',
          badge: 'Built-in',
        };
  });
}
