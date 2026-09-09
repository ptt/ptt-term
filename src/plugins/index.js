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
import {
  ConnectionLog,
  ConnectionLogPlugin,
} from './conn_log/index.js';
import {
  FpsMeter,
  FpsMeterPlugin,
} from './fps_meter/index.js';
import {
  TouchDebugHUD,
  TouchDebugHUDPlugin,
} from './touch_debug_hud/index.js';

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
  ConnectionLog,
  ConnectionLogPlugin,
  FpsMeter,
  FpsMeterPlugin,
  TouchDebugHUD,
  TouchDebugHUDPlugin,
};

export const BUILTIN_PLUGINS = [
  EasyReading,
  LiveUpdate,
  MouseBrowsing,
  InputHelper,
  AntiIdle,
  MediaPreviewer,
  ConnectionLog,
  FpsMeter,
  TouchDebugHUDPlugin,
];

export function getAvailablePlugins(app) {
  if (app && app.getPluginList) {
    const list = app.getPluginList();
    if (list && list.length > 0) return list;
  }
  return BUILTIN_PLUGINS.map((PluginClass) => {
    if (PluginClass.getMetadata) {
      const meta = PluginClass.getMetadata();
      if (PluginClass.renderOptions && !meta.renderOptions) {
        meta.renderOptions = PluginClass.renderOptions;
      }
      return meta;
    }
    const instance = new PluginClass();
    const meta = instance.getMetadata
      ? instance.getMetadata()
      : {
          id: PluginClass.name,
          name: PluginClass.name,
          title: PluginClass.name,
          description: '',
          prefKey: PluginClass.prefKey,
          icon: 'extension',
        };
    if ((PluginClass.renderOptions || instance.renderOptions) && !meta.renderOptions) {
      meta.renderOptions = PluginClass.renderOptions || instance.renderOptions.bind(instance);
    }
    return meta;
  });
}
