import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  VirtualKeyboardPlugin,
  VirtualKeyboard,
  TouchKeyboardPlugin,
  TouchUIPlugin,
} from '../src/plugins/virtual_keyboard/index.js';

import {
  BUILTIN_PLUGINS,
  PLUGIN_GROUP_MAP,
  PLUGIN_GROUPS,
  getAvailablePlugins,
} from '../src/plugins/index.js';

import {
  DEFAULT_PREFS,
  getDefaultVirtualKeyboard,
  isMobileEnvironment,
} from '../src/js/pref.js';

test('VirtualKeyboard plugin exports, metadata, and registration', () => {
  // 1. Exports & aliases
  assert.strictEqual(typeof VirtualKeyboardPlugin, 'function');
  assert.strictEqual(VirtualKeyboard, VirtualKeyboardPlugin);
  assert.strictEqual(TouchKeyboardPlugin, VirtualKeyboardPlugin);
  assert.strictEqual(TouchUIPlugin, VirtualKeyboardPlugin);

  // 2. Static properties
  assert.strictEqual(VirtualKeyboardPlugin.id, 'virtual_keyboard');
  assert.strictEqual(VirtualKeyboardPlugin.name, 'virtual_keyboard');
  assert.strictEqual(VirtualKeyboardPlugin.prefKey, 'enableVirtualKeyboard');
  assert.strictEqual(VirtualKeyboardPlugin.group, 'ui');

  // 3. Metadata
  const meta = VirtualKeyboardPlugin.getMetadata();
  assert.strictEqual(meta.id, 'virtual_keyboard');
  assert.strictEqual(meta.prefKey, 'enableVirtualKeyboard');
  assert.strictEqual(meta.group, 'ui');
  assert.strictEqual(meta.icon, 'keyboard');
  assert.ok(meta.title, 'Metadata must have a title');
  assert.ok(meta.description, 'Metadata must have a description');

  // 4. Registration in BUILTIN_PLUGINS and PLUGIN_GROUPS
  assert.ok(
    BUILTIN_PLUGINS.includes(VirtualKeyboardPlugin),
    'BUILTIN_PLUGINS must include VirtualKeyboardPlugin'
  );
  assert.strictEqual(
    PLUGIN_GROUP_MAP.virtual_keyboard,
    'ui',
    'PLUGIN_GROUP_MAP must map virtual_keyboard to ui group'
  );
  assert.strictEqual(
    PLUGIN_GROUP_MAP.touch_keyboard,
    'ui',
    'PLUGIN_GROUP_MAP must alias touch_keyboard to ui group'
  );

  const uiGroup = PLUGIN_GROUPS.find((g) => g.id === 'ui');
  assert.ok(uiGroup, 'ui group must exist');
  assert.ok(
    uiGroup.pluginIds.includes('virtual_keyboard'),
    'ui group must include virtual_keyboard'
  );
  assert.ok(
    uiGroup.pluginIds.indexOf('virtual_keyboard') > uiGroup.pluginIds.indexOf('input_helper'),
    'virtual_keyboard must be placed after input_helper in ui group'
  );

  // 5. Default prefs
  assert.strictEqual(
    DEFAULT_PREFS.enableVirtualKeyboard,
    false,
    'DEFAULT_PREFS must default enableVirtualKeyboard to false for desktop'
  );
});

test('VirtualKeyboard runtime default: desktop disabled, mobile enabled', () => {
  const origWindow = globalThis.window;
  const origUA = Object.getOwnPropertyDescriptor(globalThis.navigator, 'userAgent');
  const origTouch = Object.getOwnPropertyDescriptor(globalThis.navigator, 'maxTouchPoints');

  try {
    // 1. In Node / desktop environment: defaults to false
    assert.strictEqual(getDefaultVirtualKeyboard(), false, 'Desktop environment should default to false');

    // 2. In simulated Mobile environment (iPhone): defaults to true
    globalThis.window = {};
    Object.defineProperty(globalThis.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      configurable: true,
    });
    Object.defineProperty(globalThis.navigator, 'maxTouchPoints', {
      value: 5,
      configurable: true,
    });
    assert.strictEqual(isMobileEnvironment(), true);
    assert.strictEqual(getDefaultVirtualKeyboard(), true, 'Mobile environment should default to true');
  } finally {
    globalThis.window = origWindow;
    if (origUA) {
      Object.defineProperty(globalThis.navigator, 'userAgent', origUA);
    }
    if (origTouch) {
      Object.defineProperty(globalThis.navigator, 'maxTouchPoints', origTouch);
    }
  }
});

test('VirtualKeyboard lifecycle, preference sync, and renderOverlay', () => {
  let overlayUpdated = false;
  const mockApp = {
    virtualKeyboard: null,
    addEventListener(evt, fn) {
      if (evt === 'term:pref-change') this._prefHandler = fn;
    },
    removeEventListener(evt, fn) {
      if (evt === 'term:pref-change') this._prefHandler = null;
    },
    dispatchEvent(event) {
      if (event.type === 'term:overlay:update') {
        overlayUpdated = true;
      }
    },
  };

  const plugin = new VirtualKeyboardPlugin(mockApp);
  assert.strictEqual(plugin.enabled, false);

  plugin.init({ app: mockApp });
  assert.strictEqual(mockApp.virtualKeyboard, plugin);
  assert.strictEqual(plugin.enabled, false);

  // setEnabled
  overlayUpdated = false;
  plugin.setEnabled(true);
  assert.strictEqual(plugin.enabled, true);
  assert.strictEqual(overlayUpdated, true);

  // toggle
  overlayUpdated = false;
  const toggled = plugin.toggle();
  assert.strictEqual(toggled, false);
  assert.strictEqual(plugin.enabled, false);
  assert.strictEqual(overlayUpdated, true);

  // renderOverlay when enabled
  plugin.setEnabled(true);
  const rendered = plugin.renderOverlay({ app: mockApp });
  assert.ok(rendered, 'renderOverlay must return an element when enabled');

  // renderOverlay when disabled
  plugin.setEnabled(false);
  assert.strictEqual(plugin.renderOverlay({ app: mockApp }), null);

  // Destroy
  plugin.destroy();
  assert.strictEqual(plugin.enabled, false);
  assert.strictEqual(mockApp.virtualKeyboard, null);
  assert.strictEqual(mockApp._prefHandler, null);
});

test('TouchUI and src/touch re-exports VirtualKeyboard seamlessly', () => {
  const touchIndexSource = fs.readFileSync(
    path.resolve('src/touch/index.js'),
    'utf-8'
  );
  const touchUiSource = fs.readFileSync(
    path.resolve('src/touch/TouchUI.js'),
    'utf-8'
  );

  assert.ok(
    touchIndexSource.includes('VirtualKeyboard'),
    'src/touch/index.js must export VirtualKeyboard'
  );
  assert.ok(
    touchUiSource.includes('VirtualKeyboard'),
    'src/touch/TouchUI.js must export VirtualKeyboard'
  );
});

test('ContextMenu cleanly decouples TouchKeyboard and delegates floating menu toggle', () => {
  const contextMenuSource = fs.readFileSync(
    path.resolve('src/components/ContextMenu/index.js'),
    'utf-8'
  );
  const touchKbSource = fs.readFileSync(
    path.resolve('src/touch/TouchKeyboard.js'),
    'utf-8'
  );

  // ContextMenu no longer directly imports or renders TouchKeyboard
  assert.ok(
    !contextMenuSource.includes('<TouchKeyboard'),
    'ContextMenu must not directly embed <TouchKeyboard />'
  );
  assert.ok(
    !contextMenuSource.includes('from "../../touch/TouchKeyboard"'),
    'ContextMenu must not import TouchKeyboard'
  );

  // ContextMenu binds app.handleFloatingMenuToggle
  assert.ok(
    contextMenuSource.includes('app.handleFloatingMenuToggle = this.handleFloatingMenuToggle'),
    'ContextMenu must expose app.handleFloatingMenuToggle'
  );

  // TouchKeyboard delegates to app.handleFloatingMenuToggle
  assert.ok(
    touchKbSource.includes('this.props.app?.handleFloatingMenuToggle'),
    'TouchKeyboard must delegate to app.handleFloatingMenuToggle'
  );
});
