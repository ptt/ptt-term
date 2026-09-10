import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  PwaPromptPlugin,
  PwaPrompt,
  getPlatform,
  isStandalone,
  isInAppBrowser,
  isMac,
  isIOSChrome,
} from '../src/plugins/pwa_prompt/index.js';
import {
  BUILTIN_PLUGINS,
  PLUGIN_GROUP_MAP,
  PLUGIN_GROUPS,
  getAvailablePlugins,
} from '../src/plugins/index.js';
import {
  DEFAULT_PREFS,
  getDefaultPrefs,
  readValuesWithDefault,
  isMobileEnvironment,
  isStandaloneMode,
  getDefaultPwaPrompt,
} from '../src/js/pref.js';

test('PwaPrompt plugin exports, metadata, and registration', () => {
  // 1. Exports
  assert.strictEqual(typeof PwaPromptPlugin, 'function');
  assert.strictEqual(PwaPrompt, PwaPromptPlugin);
  assert.strictEqual(typeof getPlatform, 'function');
  assert.strictEqual(typeof isStandalone, 'function');
  assert.strictEqual(typeof isInAppBrowser, 'function');
  assert.strictEqual(typeof isMac, 'function');
  assert.strictEqual(typeof isIOSChrome, 'function');

  // 2. Static properties
  assert.strictEqual(PwaPromptPlugin.id, 'pwa_prompt');
  assert.strictEqual(PwaPromptPlugin.name, 'pwa_prompt');
  assert.strictEqual(PwaPromptPlugin.prefKey, 'enablePwaPrompt');
  assert.strictEqual(PwaPromptPlugin.group, 'ui');

  // 3. Metadata
  const meta = PwaPromptPlugin.getMetadata();
  assert.strictEqual(meta.id, 'pwa_prompt');
  assert.strictEqual(meta.prefKey, 'enablePwaPrompt');
  assert.strictEqual(meta.group, 'ui');
  assert.strictEqual(meta.icon, 'smartphone');
  assert.ok(meta.title, 'Metadata should have title');
  assert.ok(meta.description, 'Metadata should have description');

  // 4. Registration in BUILTIN_PLUGINS and PLUGIN_GROUP_MAP
  assert.ok(
    BUILTIN_PLUGINS.includes(PwaPromptPlugin),
    'BUILTIN_PLUGINS must include PwaPromptPlugin'
  );
  assert.strictEqual(
    PLUGIN_GROUP_MAP.pwa_prompt,
    'ui',
    'PLUGIN_GROUP_MAP must map pwa_prompt to ui'
  );

  // 5. DEFAULT_PREFS has enablePwaPrompt: false (desktop default is disabled)
  assert.strictEqual(
    DEFAULT_PREFS.enablePwaPrompt,
    false,
    'DEFAULT_PREFS must default enablePwaPrompt to false for desktop'
  );

  // 6. getAvailablePlugins includes pwa_prompt
  const available = getAvailablePlugins();
  const found = available.find((p) => p.id === 'pwa_prompt');
  assert.ok(found, 'getAvailablePlugins should list pwa_prompt');
  assert.strictEqual(found.group, 'ui');

  // 7. Order in ui group: pwa_prompt comes after virtual_keyboard
  const uiGroup = PLUGIN_GROUPS.find((g) => g.id === 'ui');
  assert.ok(uiGroup, 'ui group must exist');
  assert.ok(
    uiGroup.pluginIds.indexOf('pwa_prompt') > uiGroup.pluginIds.indexOf('virtual_keyboard'),
    'pwa_prompt must be placed after virtual_keyboard in ui group'
  );
});

test('PwaPrompt default behavior: desktop disabled, mobile enabled, standalone disabled', () => {
  const origWindow = globalThis.window;
  const origUA = Object.getOwnPropertyDescriptor(globalThis.navigator, 'userAgent');
  const origTouch = Object.getOwnPropertyDescriptor(globalThis.navigator, 'maxTouchPoints');

  try {
    // 1. In Node / desktop environment: defaults to false
    assert.strictEqual(getDefaultPwaPrompt(), false, 'Desktop environment should default to false');

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
    assert.strictEqual(getDefaultPwaPrompt(), true, 'Mobile environment should default to true');

    // 3. In Standalone mode: defaults to false even on mobile
    globalThis.window = { navigator: { standalone: true } };
    assert.strictEqual(isStandaloneMode(), true);
    assert.strictEqual(getDefaultPwaPrompt(), false, 'Standalone mode should force enablePwaPrompt to false');
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

test('PwaPrompt auto-disables on user dismiss or when running as PWA', () => {
  const dispatchedEvents = [];
  const registeredMenuItems = [];

  const mockApp = {
    prefValues: { enablePwaPrompt: true },
    onValuesPrefChange(values) {
      this.prefValues = values;
    },
    listeners: {},
    addEventListener(type, fn) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(fn);
    },
    removeEventListener(type, fn) {
      if (!this.listeners[type]) return;
      this.listeners[type] = this.listeners[type].filter((f) => f !== fn);
    },
    dispatchEvent(evt) {
      dispatchedEvents.push(evt.type);
      const fns = this.listeners[evt.type] || [];
      fns.forEach((fn) => fn(evt));
    },
    registerContextMenuItem(item) {
      registeredMenuItems.push(item);
    },
  };

  const plugin = new PwaPromptPlugin(mockApp, { enabled: true });
  plugin.enabled = true;

  // Open modal
  plugin.showModal();
  assert.strictEqual(plugin.showsModal, true);

  // User dismisses / later: plugin must immediately disable itself!
  plugin.hideModal();
  assert.strictEqual(plugin.showsModal, false);
  assert.strictEqual(plugin.enabled, false, 'Plugin should be disabled after dismiss');
  assert.strictEqual(mockApp.prefValues.enablePwaPrompt, false, 'Preference should be updated to false');

  // If initialized while isStandalone() is true, plugin should turn itself off immediately
  const standalonePlugin = new PwaPromptPlugin(mockApp, { enabled: true });
  standalonePlugin.isStandalone = () => true;
  standalonePlugin.init({ app: mockApp });
  assert.strictEqual(standalonePlugin.enabled, false, 'Plugin should turn off when running as PWA');
});

test('PwaPrompt dismissModal hides modal without disabling plugin', () => {
  let prefChanged = false;
  const mockApp = {
    prefValues: { enablePwaPrompt: true },
    onValuesPrefChange() {
      prefChanged = true;
    },
    dispatchEvent() {},
  };

  const plugin = new PwaPromptPlugin(mockApp, { enabled: true });
  plugin.enabled = true;

  plugin.showModal();
  assert.strictEqual(plugin.showsModal, true);

  // Remind later / dismissModal: closes modal, but keeps plugin enabled!
  plugin.dismissModal();
  assert.strictEqual(plugin.showsModal, false);
  assert.strictEqual(plugin.enabled, true, 'Plugin should remain enabled on dismissModal');
  assert.strictEqual(prefChanged, false, 'Preference should not be modified on dismissModal');
});

test('PwaPromptModal defines tap-outside / remind-later as soft dismiss and X / got-it / not-needed as permanent dismiss', () => {
  const modalSrc = fs.readFileSync(
    path.resolve('src/plugins/pwa_prompt/PwaPromptModal.js'),
    'utf-8'
  );

  // 1. Tapping outside (overlay backdrop) calls onRemindLater (soft dismiss)
  assert.ok(
    modalSrc.includes('if (e.target === e.currentTarget) {\n      onRemindLater?.();\n    }'),
    'Tapping outside overlay must call onRemindLater'
  );

  // 2. Escape key and close X button call onClose (permanent dismiss)
  assert.ok(
    modalSrc.includes("if (e.key === 'Escape' || e.code === 'Escape' || e.keyCode === 27) {\n        e.preventDefault();\n        e.stopPropagation();\n        onClose?.();\n      }"),
    'Escape key must call onClose'
  );
  assert.ok(
    modalSrc.includes('className="PwaPrompt-close"\n          aria-label="Close"\n          onClick={() => onClose?.()}'),
    'Close button must call onClose'
  );

  // 3. Educational / standard actions: left is "我知道了" (onClose), right is "下次提醒我" (onRemindLater)
  assert.ok(
    modalSrc.includes("pwa_prompt_btn_got_it') || '我知道了'"),
    'Standard actions must include got it button'
  );
  assert.ok(
    modalSrc.includes("pwa_prompt_btn_remind_later') || '下次提醒我'"),
    'Standard actions must include remind later button'
  );

  // 4. Native prompt actions: left is "立即安裝" (onInstallClick), right is "我不需要" (onClose)
  assert.ok(
    modalSrc.includes("pwa_prompt_btn_not_needed') || '我不需要'"),
    'Native prompt must include not needed button'
  );
  assert.ok(
    modalSrc.includes("onClick={() => onClose?.()}\n            >\n              {_('pwa_prompt_btn_not_needed')"),
    'Not needed button must trigger onClose'
  );
});

test('isIOSChrome detects CriOS User-Agent and PwaPromptModal adapts for Chrome on iOS', () => {
  const origUA = Object.getOwnPropertyDescriptor(globalThis.navigator, 'userAgent');
  try {
    // 1. Desktop / Default (no CriOS)
    assert.strictEqual(isIOSChrome(), false);

    // 2. iOS Safari (no CriOS)
    Object.defineProperty(globalThis.navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
      configurable: true,
    });
    assert.strictEqual(isIOSChrome(), false);

    // 3. iOS Chrome (CriOS)
    Object.defineProperty(globalThis.navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.88 Mobile/15E148 Safari/604.1',
      configurable: true,
    });
    assert.strictEqual(isIOSChrome(), true);

    // 4. Modal source includes Chrome-specific steps: 網址列, 檢視較多, and hides downward arrow
    const modalSrc = fs.readFileSync(
      path.resolve('src/plugins/pwa_prompt/PwaPromptModal.js'),
      'utf-8'
    );
    assert.ok(modalSrc.includes('isIOSChrome'), 'Modal should accept isIOSChrome prop');
    assert.ok(modalSrc.includes('檢視較多'), 'Modal should mention 檢視較多 for Chrome');
    assert.ok(
      modalSrc.includes('!isIOSChrome && <div className="PwaPrompt-arrow-down" />'),
      'Modal should hide downward arrow for Chrome on iOS'
    );
  } finally {
    if (origUA) {
      Object.defineProperty(globalThis.navigator, 'userAgent', origUA);
    }
  }
});

