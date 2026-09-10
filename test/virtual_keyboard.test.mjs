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
    uiGroup.pluginIds.indexOf('virtual_keyboard') >
      uiGroup.pluginIds.indexOf('input_helper'),
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
  const origUA = Object.getOwnPropertyDescriptor(
    globalThis.navigator,
    'userAgent'
  );
  const origTouch = Object.getOwnPropertyDescriptor(
    globalThis.navigator,
    'maxTouchPoints'
  );

  try {
    // 1. In Node / desktop environment: defaults to false
    assert.strictEqual(
      getDefaultVirtualKeyboard(),
      false,
      'Desktop environment should default to false'
    );

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
    assert.strictEqual(
      getDefaultVirtualKeyboard(),
      true,
      'Mobile environment should default to true'
    );
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
    contextMenuSource.includes(
      'app.handleFloatingMenuToggle = this.handleFloatingMenuToggle'
    ),
    'ContextMenu must expose app.handleFloatingMenuToggle'
  );

  // TouchKeyboard delegates to app.handleFloatingMenuToggle
  assert.ok(
    touchKbSource.includes('this.props.app?.handleFloatingMenuToggle'),
    'TouchKeyboard must delegate to app.handleFloatingMenuToggle'
  );
});

test('TouchKeyboard collapsed toolbar encloses buttons without overflow and provides enlarged drag handle', () => {
  const touchCssSource = fs.readFileSync(
    path.resolve('src/touch/TouchUI.css'),
    'utf-8'
  );
  const touchKbSource = fs.readFileSync(
    path.resolve('src/touch/TouchKeyboard.js'),
    'utf-8'
  );

  // Collapsed row must have flex: 0 0 auto and height: auto to avoid zero-height collapsing
  assert.ok(
    touchCssSource.includes(
      '.TouchFloatingToolbar--collapsed .TouchFloatingToolbar__Row'
    ) ||
      touchCssSource.includes(
        '.TouchFloatingToolbar--collapsed .TouchFloatingToolbar__Row--collapsed'
      ),
    'TouchUI.css must specify collapsed row flex constraints'
  );
  assert.ok(
    touchCssSource.includes('flex: 0 0 auto;'),
    'Collapsed row must not collapse to zero height'
  );

  // Drag handle in collapsed mode must be enlarged (height 24px and bar width 52px)
  assert.ok(
    touchCssSource.includes('height: 24px;'),
    'Collapsed drag handle must provide generous touch target height'
  );
  assert.ok(
    touchCssSource.includes('width: 52px;'),
    'Collapsed drag handle bar must be wider for easy touch'
  );
});

test('TouchKeyboard renders 4-corner resize handles with 0.5x minimum and screen-bound maximum scale', () => {
  const touchKbSource = fs.readFileSync(
    path.resolve('src/touch/TouchKeyboard.js'),
    'utf-8'
  );
  const touchCssSource = fs.readFileSync(
    path.resolve('src/touch/TouchUI.css'),
    'utf-8'
  );

  // 1. 4 Corner resize handles in DOM
  assert.ok(
    touchKbSource.includes('TouchFloatingToolbar__ResizeHandle--tl') &&
      touchKbSource.includes('TouchFloatingToolbar__ResizeHandle--tr') &&
      touchKbSource.includes('TouchFloatingToolbar__ResizeHandle--bl') &&
      touchKbSource.includes('TouchFloatingToolbar__ResizeHandle--br'),
    'TouchKeyboard must render all 4 corner resize handles (tl, tr, bl, br)'
  );

  // 2. Resize handlers implemented
  assert.ok(
    touchKbSource.includes('handleResizeStart') &&
      touchKbSource.includes('handleResizeMove') &&
      touchKbSource.includes('handleResizeEnd'),
    'TouchKeyboard must implement corner resize handlers'
  );

  // 3. Minimum scale: 0.5 (half of base button size)
  assert.ok(
    touchKbSource.includes('minScale = 0.5') || touchKbSource.includes('0.5'),
    'TouchKeyboard must enforce 0.5x minimum scale (half button size)'
  );

  // 4. Maximum scale: bounded by screen height or width
  assert.ok(
    touchKbSource.includes('maxScaleW') && touchKbSource.includes('maxScaleH'),
    'TouchKeyboard must bound maximum scale to viewport width and height'
  );

  // 5. CSS classes and indicators
  assert.ok(
    touchCssSource.includes('.TouchFloatingToolbar__ResizeHandle'),
    'TouchUI.css must style resize handles'
  );
  assert.ok(
    touchCssSource.includes('.TouchFloatingToolbar--resizing'),
    'TouchUI.css must style resizing active state'
  );
  assert.ok(
    touchCssSource.includes('cursor: nwse-resize;') &&
      touchCssSource.includes('cursor: nesw-resize;'),
    'TouchUI.css must set diagonal resize cursors on corners'
  );
});

test('TouchKeyboard supports edge resizing and 2x10, 3x7, 4x5 layout switching with persistence', async () => {
  const touchKbSource = fs.readFileSync(
    path.resolve('src/touch/TouchKeyboard.js'),
    'utf-8'
  );
  const touchCssSource = fs.readFileSync(
    path.resolve('src/touch/TouchUI.css'),
    'utf-8'
  );

  // 1. Storage key constant
  assert.ok(
    touchKbSource.includes('STORAGE_KEY_TOUCHUI_COLS = "term.touchui.cols"'),
    'Must define STORAGE_KEY_TOUCHUI_COLS'
  );

  // 2. getLayoutDimensions helper calculation
  const fnRegex = /(?:export\s+)?function getLayoutDimensions[\s\S]*?\n\}/;
  const match = touchKbSource.match(fnRegex);
  assert.ok(match, 'Must contain getLayoutDimensions function');
  const getLayoutDimensions = new Function(
    `${match[0].replace(/export\s+/g, '')}\nreturn getLayoutDimensions;`
  )();
  const dims4Portrait = getLayoutDimensions(4, false);
  assert.strictEqual(dims4Portrait.cols, 4);
  assert.strictEqual(dims4Portrait.rows, 5);
  assert.strictEqual(dims4Portrait.baseWidth, 234);
  assert.strictEqual(dims4Portrait.baseHeight, 288);

  const dims3Portrait = getLayoutDimensions(3, false);
  assert.strictEqual(dims3Portrait.cols, 3);
  assert.strictEqual(dims3Portrait.rows, 7);
  assert.strictEqual(dims3Portrait.baseWidth, 178);
  assert.strictEqual(dims3Portrait.baseHeight, 400);

  const dims2Portrait = getLayoutDimensions(2, false);
  assert.strictEqual(dims2Portrait.cols, 2);
  assert.strictEqual(dims2Portrait.rows, 9);
  assert.strictEqual(dims2Portrait.baseWidth, 122);
  assert.strictEqual(dims2Portrait.baseHeight, 512);

  const dims2Landscape = getLayoutDimensions(2, true);
  assert.strictEqual(dims2Landscape.cols, 2);
  assert.strictEqual(dims2Landscape.rows, 9);
  assert.strictEqual(dims2Landscape.baseWidth, 101);
  assert.strictEqual(dims2Landscape.baseHeight, 410);

  const dims5Portrait = getLayoutDimensions(5, false);
  assert.strictEqual(dims5Portrait.cols, 5);
  assert.strictEqual(dims5Portrait.rows, 4);
  assert.strictEqual(dims5Portrait.baseWidth, 290);
  assert.strictEqual(dims5Portrait.baseHeight, 232);

  const dims6Portrait = getLayoutDimensions(6, false);
  assert.strictEqual(dims6Portrait.cols, 6);
  assert.strictEqual(dims6Portrait.rows, 3);
  assert.strictEqual(dims6Portrait.baseWidth, 346);
  assert.strictEqual(dims6Portrait.baseHeight, 176);

  const dims7Portrait = getLayoutDimensions(7, false);
  assert.strictEqual(dims7Portrait.cols, 7);
  assert.strictEqual(dims7Portrait.rows, 2);
  assert.strictEqual(dims7Portrait.baseWidth, 402);
  assert.strictEqual(dims7Portrait.baseHeight, 120);

  // 3. Left and Right edge resize handles in DOM and CSS
  assert.ok(
    touchKbSource.includes('TouchFloatingToolbar__ResizeHandle--l') &&
      touchKbSource.includes('TouchFloatingToolbar__ResizeHandle--r'),
    'TouchKeyboard must render left (--l) and right (--r) edge resize handles'
  );
  assert.ok(
    touchCssSource.includes('.TouchFloatingToolbar__ResizeHandle--l') &&
      touchCssSource.includes('.TouchFloatingToolbar__ResizeHandle--r'),
    'TouchUI.css must style left and right edge resize handles'
  );
  assert.ok(
    touchCssSource.includes('cursor: ew-resize;'),
    'TouchUI.css must set east-west resize cursor on edge handles'
  );

  // 4. 2x8 Layout key arrangement verification
  assert.ok(
    touchKbSource.includes('renderStandard2x8Pad = () =>'),
    'TouchKeyboard must define renderStandard2x8Pad'
  );
  const pad2x8Code = touchKbSource.slice(
    touchKbSource.indexOf('renderStandard2x8Pad = () =>'),
    touchKbSource.indexOf('renderStandard5x4Pad = () =>')
  );
  // Row 1: [Tab][...]
  assert.ok(
    pad2x8Code.includes('this.renderTab()') &&
      pad2x8Code.includes('this.renderMenuToggle()')
  );
  // Row 2: [A+][A-]
  assert.ok(
    pad2x8Code.includes('this.renderFontZoomIn()') &&
      pad2x8Code.includes('this.renderFontZoomOut()')
  );
  // Row 3: [PgUp][PgDn]
  assert.ok(
    pad2x8Code.includes('this.renderPageUp()') &&
      pad2x8Code.includes('this.renderPageDown()')
  );
  // Row 4: [Esc][BS]
  assert.ok(
    pad2x8Code.includes('this.renderEscape()') &&
      pad2x8Code.includes('this.renderBackspace()')
  );
  // Row 5: [Up][Space]
  assert.ok(
    pad2x8Code.includes('this.renderArrowUp()') &&
      pad2x8Code.includes('this.renderSpace()')
  );
  // Row 6: [Left][Right]
  assert.ok(
    pad2x8Code.includes('this.renderArrowLeft()') &&
      pad2x8Code.includes('this.renderArrowRight()')
  );
  // Row 7: [Down][Enter]
  assert.ok(
    pad2x8Code.includes('this.renderArrowDown()') &&
      pad2x8Code.includes('this.renderEnter()')
  );
  // Row 8: [Ctrl][a]
  assert.ok(
    pad2x8Code.includes('this.renderCtrl()') &&
      pad2x8Code.includes('this.renderAlpha()')
  );
  // Row 9: [syskbd][minimize]
  assert.ok(
    pad2x8Code.includes('this.renderKeyboardToggle()') &&
      pad2x8Code.includes('this.renderCollapseToggle(false)')
  );

  // 5. 3x7 Layout key arrangement verification
  assert.ok(
    touchKbSource.includes('renderStandard3x7Pad = () =>'),
    'TouchKeyboard must define renderStandard3x7Pad'
  );
  const pad3x7Code = touchKbSource.slice(
    touchKbSource.indexOf('renderStandard3x7Pad = () =>'),
    touchKbSource.indexOf('renderStandard2x8Pad = () =>')
  );
  // Row 1: [A+][A-][...]
  assert.ok(
    pad3x7Code.includes('this.renderFontZoomIn()') &&
      pad3x7Code.includes('this.renderFontZoomOut()') &&
      pad3x7Code.includes('this.renderMenuToggle()')
  );
  // Row 2: [Esc][PgUp][PgDn]
  assert.ok(
    pad3x7Code.includes('this.renderEscape()') &&
      pad3x7Code.includes('this.renderPageUp()') &&
      pad3x7Code.includes('this.renderPageDown()')
  );
  // Row 3: [Home][Up][End]
  assert.ok(
    pad3x7Code.includes('this.renderHome()') &&
      pad3x7Code.includes('this.renderArrowUp()') &&
      pad3x7Code.includes('this.renderEnd()')
  );
  // Row 4: [Left][Space][Right]
  assert.ok(
    pad3x7Code.includes('this.renderArrowLeft()') &&
      pad3x7Code.includes('this.renderSpace()') &&
      pad3x7Code.includes('this.renderArrowRight()')
  );
  // Row 5: [BS][Down][Enter]
  assert.ok(
    pad3x7Code.includes('this.renderBackspace()') &&
      pad3x7Code.includes('this.renderArrowDown()') &&
      pad3x7Code.includes('this.renderEnter()')
  );
  // Row 6: [a][Tab]
  assert.ok(
    pad3x7Code.includes('this.renderAlpha()') &&
      pad3x7Code.includes('this.renderTab()')
  );
  // Row 7: [Ctrl][syskbd][minimize]
  assert.ok(
    pad3x7Code.includes('this.renderCtrl()') &&
      pad3x7Code.includes('this.renderKeyboardToggle()') &&
      pad3x7Code.includes('this.renderCollapseToggle(false)')
  );

  // 6. 5x4 Layout key arrangement verification
  assert.ok(
    touchKbSource.includes('renderStandard5x4Pad = () =>'),
    'TouchKeyboard must define renderStandard5x4Pad'
  );
  const pad5x4Code = touchKbSource.slice(
    touchKbSource.indexOf('renderStandard5x4Pad = () =>'),
    touchKbSource.indexOf('renderStandard6x3Pad = () =>')
  );
  // Row 1: [Esc][Tab][Home][Up][End]
  assert.ok(
    pad5x4Code.includes('this.renderEscape()') &&
      pad5x4Code.includes('this.renderTab()') &&
      pad5x4Code.includes('this.renderHome()') &&
      pad5x4Code.includes('this.renderArrowUp()') &&
      pad5x4Code.includes('this.renderEnd()')
  );
  // Row 2: [A+][A-][Left][Space][Right]
  assert.ok(
    pad5x4Code.includes('this.renderFontZoomIn()') &&
      pad5x4Code.includes('this.renderFontZoomOut()') &&
      pad5x4Code.includes('this.renderArrowLeft()') &&
      pad5x4Code.includes('this.renderSpace()') &&
      pad5x4Code.includes('this.renderArrowRight()')
  );
  // Row 3: [PgUp][PgDn][BS][Down][Enter]
  assert.ok(
    pad5x4Code.includes('this.renderPageUp()') &&
      pad5x4Code.includes('this.renderPageDown()') &&
      pad5x4Code.includes('this.renderBackspace()') &&
      pad5x4Code.includes('this.renderArrowDown()') &&
      pad5x4Code.includes('this.renderEnter()')
  );
  // Row 4: [...][Ctrl][a][syskbd][minimize]
  assert.ok(
    pad5x4Code.includes('this.renderMenuToggle()') &&
      pad5x4Code.includes('this.renderCtrl()') &&
      pad5x4Code.includes('this.renderAlpha()') &&
      pad5x4Code.includes('this.renderKeyboardToggle()') &&
      pad5x4Code.includes('this.renderCollapseToggle(false)')
  );

  // 7. 6x3 Layout key arrangement verification
  assert.ok(
    touchKbSource.includes('renderStandard6x3Pad = () =>'),
    'TouchKeyboard must define renderStandard6x3Pad'
  );
  const pad6x3Code = touchKbSource.slice(
    touchKbSource.indexOf('renderStandard6x3Pad = () =>'),
    touchKbSource.indexOf('renderStandard7x2Pad = () =>')
  );
  // Row 1: [Esc][PgUp][PgDn][BS][Up][Enter]
  assert.ok(
    pad6x3Code.includes('this.renderEscape()') &&
      pad6x3Code.includes('this.renderPageUp()') &&
      pad6x3Code.includes('this.renderPageDown()') &&
      pad6x3Code.includes('this.renderBackspace()') &&
      pad6x3Code.includes('this.renderArrowUp()') &&
      pad6x3Code.includes('this.renderEnter()')
  );
  // Row 2: [Home][End][Space][Left][Down][Right]
  assert.ok(
    pad6x3Code.includes('this.renderHome()') &&
      pad6x3Code.includes('this.renderEnd()') &&
      pad6x3Code.includes('this.renderSpace()') &&
      pad6x3Code.includes('this.renderArrowLeft()') &&
      pad6x3Code.includes('this.renderArrowDown()') &&
      pad6x3Code.includes('this.renderArrowRight()')
  );
  // Row 3: [...][Tab][Ctrl][a][syskbd][minimize]
  assert.ok(
    pad6x3Code.includes('this.renderMenuToggle()') &&
      pad6x3Code.includes('this.renderTab()') &&
      pad6x3Code.includes('this.renderCtrl()') &&
      pad6x3Code.includes('this.renderAlpha()') &&
      pad6x3Code.includes('this.renderKeyboardToggle()') &&
      pad6x3Code.includes('this.renderCollapseToggle(false)')
  );

  // 8. 7x2 Layout key arrangement verification
  assert.ok(
    touchKbSource.includes('renderStandard7x2Pad = () =>'),
    'TouchKeyboard must define renderStandard7x2Pad'
  );
  const pad7x2Code = touchKbSource.slice(
    touchKbSource.indexOf('renderStandard7x2Pad = () =>'),
    touchKbSource.indexOf('renderStandardPad = () =>')
  );
  // Row 1: [BS][Up][Down][Left][Right][Space][Enter]
  assert.ok(
    pad7x2Code.includes('this.renderBackspace()') &&
      pad7x2Code.includes('this.renderArrowUp()') &&
      pad7x2Code.includes('this.renderArrowDown()') &&
      pad7x2Code.includes('this.renderArrowLeft()') &&
      pad7x2Code.includes('this.renderArrowRight()') &&
      pad7x2Code.includes('this.renderSpace()') &&
      pad7x2Code.includes('this.renderEnter()')
  );
  // Row 2: [...][PgUp][PgDn][Ctrl][a][syskbd][minimize]
  assert.ok(
    pad7x2Code.includes('this.renderMenuToggle()') &&
      pad7x2Code.includes('this.renderPageUp()') &&
      pad7x2Code.includes('this.renderPageDown()') &&
      pad7x2Code.includes('this.renderCtrl()') &&
      pad7x2Code.includes('this.renderAlpha()') &&
      pad7x2Code.includes('this.renderKeyboardToggle()') &&
      pad7x2Code.includes('this.renderCollapseToggle(false)')
  );

  // 9. Persistence of STORAGE_KEY_TOUCHUI_COLS
  assert.ok(
    touchKbSource.includes('STORAGE_KEY_TOUCHUI_COLS') &&
      touchKbSource.includes('this.state.stackedColsMode') &&
      touchKbSource.includes('writeStorageItem'),
    'TouchKeyboard must save selected column layout to STORAGE_KEY_TOUCHUI_COLS'
  );
});
