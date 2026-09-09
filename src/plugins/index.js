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

export const PLUGIN_GROUPS = [
  {
    id: 'ui',
    titleKey: 'plugin_group_ui',
    title: 'User Interface',
    color: '#007aff',
    pluginIds: ['media_previewer', 'input_helper'],
  },
  {
    id: 'bbs',
    titleKey: 'plugin_group_bbs',
    title: 'Taiwan BBS',
    color: '#34c759',
    pluginIds: ['easy_reading', 'anti_idle', 'mouse_browsing', 'live_update'],
  },
  {
    id: 'debug',
    titleKey: 'plugin_group_debug',
    title: 'Debug & Development',
    color: '#af52de',
    pluginIds: ['fps_meter', 'touch_debug_hud', 'conn_log'],
  },
];

export const PLUGIN_GROUP_MAP = {
  media_previewer: 'ui',
  input_helper: 'ui',
  easy_reading: 'bbs',
  anti_idle: 'bbs',
  mouse_browsing: 'bbs',
  live_update: 'bbs',
  fps_meter: 'debug',
  touch_debug_hud: 'debug',
  conn_log: 'debug',
};

export function groupPlugins(plugins = []) {
  const groupsMap = new Map();
  for (const group of PLUGIN_GROUPS) {
    groupsMap.set(group.id, {
      ...group,
      plugins: [],
    });
  }

  const otherGroup = {
    id: 'other',
    titleKey: 'plugin_group_other',
    title: 'Other',
    color: '#8e8e93',
    plugins: [],
  };

  for (const plugin of plugins) {
    const pluginId = plugin.id || plugin.name;
    const groupId = plugin.group || PLUGIN_GROUP_MAP[pluginId] || 'other';
    const targetGroup = groupsMap.get(groupId) || otherGroup;
    targetGroup.plugins.push({
      ...plugin,
      group: groupId,
    });
  }

  const result = [];
  for (const group of groupsMap.values()) {
    if (group.plugins.length > 0) {
      if (group.pluginIds) {
        group.plugins.sort((a, b) => {
          const aId = a.id || a.name;
          const bId = b.id || b.name;
          const aIdx = group.pluginIds.indexOf(aId);
          const bIdx = group.pluginIds.indexOf(bId);
          if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
          if (aIdx !== -1) return -1;
          if (bIdx !== -1) return 1;
          return 0;
        });
      }
      result.push(group);
    }
  }

  if (otherGroup.plugins.length > 0) {
    result.push(otherGroup);
  }

  return result;
}

export const BUILTIN_PLUGINS = [
  MediaPreviewer,
  InputHelper,
  EasyReading,
  AntiIdle,
  MouseBrowsing,
  LiveUpdate,
  FpsMeter,
  TouchDebugHUDPlugin,
  ConnectionLog,
];

export function getAvailablePlugins(app) {
  let list = [];
  if (app && app.getPluginList) {
    const appList = app.getPluginList();
    if (appList && appList.length > 0) {
      list = appList;
    }
  }
  if (list.length === 0) {
    list = BUILTIN_PLUGINS.map((PluginClass) => {
      let meta;
      if (PluginClass.getMetadata) {
        meta = { ...PluginClass.getMetadata() };
        if (PluginClass.renderOptions && !meta.renderOptions) {
          meta.renderOptions = PluginClass.renderOptions;
        }
      } else {
        const instance = new PluginClass();
        meta = instance.getMetadata
          ? { ...instance.getMetadata() }
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
      }
      return meta;
    });
  }
  return list.map((meta) => {
    const pluginId = meta.id || meta.name;
    const group = meta.group || PLUGIN_GROUP_MAP[pluginId] || 'other';
    return {
      ...meta,
      group,
    };
  });
}
