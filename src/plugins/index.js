import {
  EasyReading,
  EasyReadingPlugin,
  INFLIGHT_WATCHDOG_MS,
  MAX_INFLIGHT_RETRIES,
} from './easy_reading/index.js';
import {
  LiveUpdate,
  LiveUpdatePlugin,
} from './live_update/index.js';
import {
  MouseBrowsing,
} from './mouse_browsing/index.js';
import {
  InputHelper,
} from './input_helper/index.js';
import {
  AntiIdle,
} from './anti_idle/index.js';
import {
  MediaPreviewer,
  MediaPreviewerPlugin,
} from './media_previewer/index.js';

export {
  EasyReading,
  EasyReadingPlugin,
  INFLIGHT_WATCHDOG_MS,
  MAX_INFLIGHT_RETRIES,
  LiveUpdate,
  LiveUpdatePlugin,
  MouseBrowsing,
  InputHelper,
  AntiIdle,
  MediaPreviewer,
  MediaPreviewerPlugin,
};

export const BUILTIN_PLUGINS = [
  EasyReading,
  LiveUpdate,
  MouseBrowsing,
  InputHelper,
  AntiIdle,
  MediaPreviewer,
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
