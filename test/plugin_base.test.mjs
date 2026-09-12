import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PluginBase } from '../src/plugins/PluginBase.js';
import { EventEmitter } from '../src/js/event.js';

class MockApp extends EventEmitter {
  constructor() {
    super();
    this.contextMenuItems = [];
    this.overlays = [];
    this.inputInterceptors = [];
  }

  registerContextMenuItem(item) {
    this.contextMenuItems.push(item);
  }

  unregisterContextMenuItem(id) {
    this.contextMenuItems = this.contextMenuItems.filter(
      (it) => (it.id || it) !== id
    );
  }

  registerOverlay(overlay) {
    this.overlays.push(overlay);
  }

  unregisterOverlay(id) {
    this.overlays = this.overlays.filter(
      (o) => (o.id || o) !== id
    );
  }

  registerInputInterceptor(interceptor) {
    this.inputInterceptors.push(interceptor);
  }

  unregisterInputInterceptor(interceptor) {
    this.inputInterceptors = this.inputInterceptors.filter(
      (it) => it !== interceptor
    );
  }
}

test('PluginBase exposes metadata getters with sensible defaults', () => {
  class TestPlugin extends PluginBase {
    static id = 'test_plugin';
    static name = 'test_plugin';
    static prefKey = 'enableTestPlugin';
    static group = 'bbs';
    static icon = 'extension';
    static title = 'Test Plugin Title';
    static description = 'Test Description';
  }

  const plugin = new TestPlugin();
  assert.equal(plugin.id, 'test_plugin');
  assert.equal(plugin.name, 'test_plugin');
  assert.equal(plugin.prefKey, 'enableTestPlugin');
  assert.equal(plugin.group, 'bbs');
  assert.equal(plugin.icon, 'extension');
  assert.equal(plugin.title, 'Test Plugin Title');
  assert.equal(plugin.description, 'Test Description');

  const meta = plugin.getMetadata();
  assert.equal(meta.id, 'test_plugin');
  assert.equal(meta.name, 'test_plugin');
  assert.equal(meta.prefKey, 'enableTestPlugin');
  assert.equal(meta.enabled, false);

  const staticMeta = TestPlugin.getMetadata();
  assert.equal(staticMeta.id, 'test_plugin');
  assert.equal(staticMeta.prefKey, 'enableTestPlugin');
});

test('PluginBase manages lifecycle: init, enable, disable, and destroy', () => {
  let initCalled = false;
  let enableCalled = false;
  let disableCalled = false;
  let destroyCalled = false;

  class LifecyclePlugin extends PluginBase {
    static id = 'lifecycle_plugin';
    static prefKey = 'enableLifecycle';

    onInit() {
      initCalled = true;
    }

    onEnable() {
      enableCalled = true;
    }

    onDisable() {
      disableCalled = true;
    }

    onDestroy() {
      destroyCalled = true;
    }
  }

  const app = new MockApp();
  const plugin = new LifecyclePlugin(app, { enabled: false });
  plugin.init({ app });

  assert.ok(initCalled, 'onInit should be called during init');
  assert.equal(plugin.enabled, false);
  assert.equal(enableCalled, false);

  // Enable
  plugin.enable();
  assert.equal(plugin.enabled, true);
  assert.ok(enableCalled, 'onEnable should be called on enable()');

  // Duplicate enable should be a no-op
  enableCalled = false;
  plugin.enable();
  assert.equal(enableCalled, false);

  // Disable
  plugin.disable();
  assert.equal(plugin.enabled, false);
  assert.ok(disableCalled, 'onDisable should be called on disable()');

  // Duplicate disable should be a no-op
  disableCalled = false;
  plugin.disable();
  assert.equal(disableCalled, false);

  // Destroy
  plugin.destroy();
  assert.ok(destroyCalled, 'onDestroy should be called on destroy()');
});

test('PluginBase auto-syncs state when prefKey changes via term:pref-change', () => {
  class PrefPlugin extends PluginBase {
    static id = 'pref_plugin';
    static prefKey = 'enablePrefPlugin';
  }

  const app = new MockApp();
  const plugin = new PrefPlugin(app, { enabled: false });
  plugin.init({ app });

  assert.equal(plugin.enabled, false);

  // Toggle on via app pref change event
  app.emit('term:pref-change', { key: 'enablePrefPlugin', value: true });
  assert.equal(plugin.enabled, true);

  // Toggle off
  app.emit('term:pref-change', { key: 'enablePrefPlugin', value: false });
  assert.equal(plugin.enabled, false);
});

test('PluginBase listen() tracks listeners and unlistens on demand or destroy', () => {
  const app = new MockApp();
  const plugin = new PluginBase(app);
  plugin.init({ app });

  let count = 0;
  const unlisten = plugin.listenApp('test:event', () => {
    count++;
  });

  app.emit('test:event');
  assert.equal(count, 1);

  // Unlisten explicitly
  unlisten();
  app.emit('test:event');
  assert.equal(count, 1, 'Event should not fire after unlisten()');

  // Register another listener and test destroy()
  let count2 = 0;
  plugin.listenApp('test:event2', () => {
    count2++;
  });
  app.emit('test:event2');
  assert.equal(count2, 1);

  plugin.destroy();
  app.emit('test:event2');
  assert.equal(count2, 1, 'Event should not fire after destroy()');
});

test('PluginBase listenWhileEnabled only receives events while enabled', () => {
  const app = new MockApp();
  const plugin = new PluginBase(app, { enabled: false });
  plugin.init({ app });

  let tickCount = 0;
  plugin.listenAppWhileEnabled('term:tick', () => {
    tickCount++;
  });

  // Currently disabled: event should NOT be received
  app.emit('term:tick');
  assert.equal(tickCount, 0, 'Disabled plugin must not receive events');

  // Enable plugin: listener becomes active
  plugin.enable();
  app.emit('term:tick');
  assert.equal(tickCount, 1, 'Enabled plugin must receive events');

  // Disable plugin: listener is detached
  plugin.disable();
  app.emit('term:tick');
  assert.equal(tickCount, 1, 'Disabled plugin must not receive events after disable()');

  // Re-enable: listener is re-attached
  plugin.enable();
  app.emit('term:tick');
  assert.equal(tickCount, 2, 'Re-enabled plugin must receive events again');

  // Destroy clears everything
  plugin.destroy();
  app.emit('term:tick');
  assert.equal(tickCount, 2, 'Destroyed plugin must not receive events');
});

test('PluginBase managed timers are canceled on disable and destroy', (t, done) => {
  const app = new MockApp();
  const plugin = new PluginBase(app, { enabled: true });
  plugin.init({ app });

  let timerFired = false;
  plugin.setTimeout(() => {
    timerFired = true;
  }, 50);

  // Disable immediately before timer fires
  plugin.disable();

  setTimeout(() => {
    assert.equal(timerFired, false, 'Timer should have been cleared on disable()');
    done();
  }, 100);
});

test('PluginBase registers and automatically cleans up context menu, overlay, and interceptors', () => {
  const app = new MockApp();
  const plugin = new PluginBase(app);
  plugin.init({ app });

  const menuItem = { id: 'test_item', label: 'Test Item' };
  plugin.registerContextMenuItem(menuItem);
  assert.equal(app.contextMenuItems.length, 1);

  const overlay = { id: 'test_overlay', render: () => null };
  plugin.registerOverlay(overlay);
  assert.equal(app.overlays.length, 1);

  const interceptor = { id: 'test_interceptor' };
  plugin.registerInputInterceptor(interceptor);
  assert.equal(app.inputInterceptors.length, 1);

  // Destroy should clean up all 3
  plugin.destroy();
  assert.equal(app.contextMenuItems.length, 0);
  assert.equal(app.overlays.length, 0);
  assert.equal(app.inputInterceptors.length, 0);
});

test('PluginBase registerInputInterceptorWhileEnabled only attaches while enabled', () => {
  const app = new MockApp();
  const plugin = new PluginBase(app, { enabled: false });
  plugin.init({ app });

  const interceptor = { id: 'test_interceptor_conditional' };
  plugin.registerInputInterceptorWhileEnabled(interceptor);
  assert.equal(app.inputInterceptors.length, 0, 'Should not attach when disabled');

  // Enable
  plugin.enable();
  assert.equal(app.inputInterceptors.length, 1, 'Should attach on enable()');
  assert.equal(app.inputInterceptors[0], interceptor);

  // Disable
  plugin.disable();
  assert.equal(app.inputInterceptors.length, 0, 'Should detach on disable()');

  // Re-enable
  plugin.enable();
  assert.equal(app.inputInterceptors.length, 1, 'Should re-attach on enable()');

  // Explicit unregister
  plugin.unregisterInputInterceptor(interceptor);
  assert.equal(app.inputInterceptors.length, 0, 'Should detach on unregisterInputInterceptor()');

  // Re-enable should not re-attach unregistered interceptor
  plugin.disable();
  plugin.enable();
  assert.equal(app.inputInterceptors.length, 0, 'Unregistered interceptor should not re-attach');

  // Destroy
  plugin.destroy();
  assert.equal(app.inputInterceptors.length, 0, 'Should detach on destroy()');
});

test('PluginBase init() is idempotent and does not duplicate listeners or callbacks', () => {
  let initCount = 0;
  let enableCount = 0;
  let eventCount = 0;

  class IdempotentPlugin extends PluginBase {
    static id = 'idempotent_plugin';
    static prefKey = 'enableIdempotent';

    onInit() {
      initCount++;
      this.listenApp('test:action', () => {
        eventCount++;
      });
    }

    onEnable() {
      enableCount++;
    }
  }

  const app = new MockApp();
  const plugin = new IdempotentPlugin(app, { enabled: true });
  plugin.init({ app });
  plugin.init({ app }); // Second call should be a no-op

  assert.equal(initCount, 1, 'onInit should only run once');
  assert.equal(enableCount, 1, 'onEnable should only run once');

  app.emit('test:action');
  assert.equal(eventCount, 1, 'Event listener should not be duplicated');
});

test('PluginBase destroy() allows clean re-initialization and resets pref listener', () => {
  class ReinitPlugin extends PluginBase {
    static id = 'reinit_plugin';
    static prefKey = 'enableReinit';
  }

  const app = new MockApp();
  const plugin = new ReinitPlugin(app, { enabled: false });
  plugin.init({ app });

  app.emit('term:pref-change', { key: 'enableReinit', value: true });
  assert.equal(plugin.enabled, true);

  plugin.destroy();
  assert.equal(plugin.enabled, false);

  // Re-initialize after destroy
  plugin.init({ app });
  app.emit('term:pref-change', { key: 'enableReinit', value: true });
  assert.equal(plugin.enabled, true, 'Pref listener must be re-registered after reinit');
});

test('All builtin plugins extend PluginBase and provide consistent metadata and lifecycle', async () => {
  const { BUILTIN_PLUGINS } = await import('../src/plugins/index.js');
  assert.ok(BUILTIN_PLUGINS.length >= 13);
  for (const PluginClass of BUILTIN_PLUGINS) {
    assert.ok(
      PluginClass.prototype instanceof PluginBase,
      `${PluginClass.name} must inherit from PluginBase`
    );
    const meta = PluginClass.getMetadata();
    assert.ok(meta.id, `${PluginClass.name} must have metadata id`);
    assert.ok(meta.name, `${PluginClass.name} must have metadata name`);
    assert.ok(meta.title, `${PluginClass.name} must have metadata title`);
    assert.ok(meta.group, `${PluginClass.name} must have metadata group`);
    assert.ok(meta.icon, `${PluginClass.name} must have metadata icon`);

    const app = new MockApp();
    const instance = new PluginClass(app, { enabled: false });
    assert.ok(instance instanceof PluginBase);
    assert.equal(typeof instance.init, 'function');
    assert.equal(typeof instance.destroy, 'function');
    assert.equal(typeof instance.setEnabled, 'function');
    assert.equal(typeof instance.syncFromPrefs, 'function');
    assert.equal(typeof instance.getMetadata, 'function');

    const instMeta = instance.getMetadata();
    assert.equal(instMeta.id, meta.id);
  }
});

test('PluginBase auto-registers getContextMenuItems() on init and clears on destroy', () => {
  class MenuPlugin extends PluginBase {
    static id = 'menu_plugin';
    getContextMenuItems() {
      return [
        { id: 'item_1', label: 'Item 1' },
        { id: 'item_2', label: 'Item 2' },
      ];
    }
  }

  const app = new MockApp();
  const plugin = new MenuPlugin(app);
  plugin.init({ app });

  assert.equal(app.contextMenuItems.length, 2);
  assert.equal(app.contextMenuItems[0].id, 'item_1');
  assert.equal(app.contextMenuItems[1].id, 'item_2');

  plugin.destroy();
  assert.equal(app.contextMenuItems.length, 0);
});

test('PluginBase setEnabled synchronizes app.prefValues and triggers onValuesPrefChange', () => {
  class SyncedPrefPlugin extends PluginBase {
    static id = 'synced_plugin';
    static prefKey = 'enableSynced';
  }

  let prefChanged = false;
  const app = new MockApp();
  app.prefValues = { enableSynced: false };
  app.onValuesPrefChange = () => {
    prefChanged = true;
  };

  const plugin = new SyncedPrefPlugin(app);
  plugin.init({ app });

  assert.equal(app.prefValues.enableSynced, false);

  plugin.setEnabled(true);
  assert.equal(plugin.enabled, true);
  assert.equal(app.prefValues.enableSynced, true);
  assert.equal(prefChanged, true);

  prefChanged = false;
  plugin.setEnabled(false);
  assert.equal(plugin.enabled, false);
  assert.equal(app.prefValues.enableSynced, false);
  assert.equal(prefChanged, true);
});

test('PluginBase registers and unregisters with InputInterceptors instance', async () => {
  const { InputInterceptors } = await import('../src/js/input_interceptors.js');
  const app = new MockApp();
  app.inputInterceptors = new InputInterceptors(app);
  app.registerInputInterceptor = (it) => app.inputInterceptors.registerInterceptor(it);
  app.unregisterInputInterceptor = (it) => app.inputInterceptors.unregisterInterceptor(it);

  class InterceptorPlugin extends PluginBase {
    static id = 'interceptor_plugin';
    handleNavCmd(cmd) {
      return cmd === 'testCmd';
    }
  }

  const plugin = new InterceptorPlugin(app);
  plugin.init({ app });
  plugin.registerInputInterceptor(plugin);

  assert.equal(app.inputInterceptors.dispatchNavCmd('testCmd'), true);
  assert.equal(app.inputInterceptors.dispatchNavCmd('otherCmd'), false);

  plugin.destroy();
  assert.equal(app.inputInterceptors.dispatchNavCmd('testCmd'), false);
});

test('PluginBase setInterval is cleared on disable and destroy', (t, done) => {
  const app = new MockApp();
  const plugin = new PluginBase(app, { enabled: true });
  plugin.init({ app });

  let intervalTick = 0;
  plugin.setInterval(() => {
    intervalTick++;
  }, 20);

  setTimeout(() => {
    assert.ok(intervalTick >= 1, 'Interval should fire while enabled');
    plugin.disable();
    const countAfterDisable = intervalTick;

    setTimeout(() => {
      assert.equal(intervalTick, countAfterDisable, 'Interval should stop after disable()');
      done();
    }, 60);
  }, 50);
});

test('PluginBase init() with different app destroys old app listeners and binds to new', () => {
  class SwitchAppPlugin extends PluginBase {
    static id = 'switch_app_plugin';
    static prefKey = 'enableSwitch';
  }

  const app1 = new MockApp();
  const app2 = new MockApp();

  const plugin = new SwitchAppPlugin(app1);
  plugin.init({ app: app1 });

  app1.emit('term:pref-change', { key: 'enableSwitch', value: true });
  assert.equal(plugin.enabled, true);

  // Switch to app2
  plugin.init({ app: app2 });
  assert.equal(plugin.app, app2);
  plugin.setEnabled(true);

  // app1 events should no longer affect plugin
  app1.emit('term:pref-change', { key: 'enableSwitch', value: false });
  assert.equal(plugin.enabled, true);

  // app2 events should now control plugin
  app2.emit('term:pref-change', { key: 'enableSwitch', value: false });
  assert.equal(plugin.enabled, false);
});

test('VirtualKeyboard and TouchDebugHUD destroy() does not alter app.prefValues or persist false', async () => {
  const { VirtualKeyboardPlugin } = await import('../src/plugins/virtual_keyboard/VirtualKeyboard.js');
  const { TouchDebugHUDPlugin } = await import('../src/plugins/touch_debug_hud/TouchDebugHUD.js');

  const app = new MockApp();
  app.prefValues = {
    enableVirtualKeyboard: true,
    enableTouchDebugHUD: true,
  };

  const vk = new VirtualKeyboardPlugin(app, { enabled: true });
  vk.init({ app });
  assert.equal(vk.enabled, true);
  assert.equal(app.prefValues.enableVirtualKeyboard, true);

  vk.destroy();
  // destroy() disables the instance in memory, but MUST NOT overwrite saved user prefs
  assert.equal(vk.enabled, false);
  assert.equal(app.prefValues.enableVirtualKeyboard, true);

  const hud = new TouchDebugHUDPlugin(app, { enabled: true });
  hud.init({ app });
  assert.equal(hud.enabled, true);
  assert.equal(app.prefValues.enableTouchDebugHUD, true);

  hud.destroy();
  assert.equal(hud.enabled, false);
  assert.equal(app.prefValues.enableTouchDebugHUD, true);
});

test('AutoWrap and FpsMeter follow standard PluginBase lifecycle and defer init()', async () => {
  const { AutoWrap } = await import('../src/plugins/auto_wrap/AutoWrap.js');
  const { FpsMeter } = await import('../src/plugins/fps_meter/FpsMeter.js');

  const app = new MockApp();

  const autoWrap = new AutoWrap(app);
  assert.equal(autoWrap._initialized, false, 'AutoWrap should defer init until init() is called');
  autoWrap.init({ app });
  assert.equal(autoWrap._initialized, true);

  const fpsMeter = new FpsMeter(app);
  assert.equal(fpsMeter._initialized, false, 'FpsMeter should defer init until init() is called');
  fpsMeter.init({ app });
  assert.equal(fpsMeter._initialized, true);
});

test('PluginBase destroy() cleans up registered overlays, context menu items, and interceptors', () => {
  const app = new MockApp();
  const plugin = new PluginBase(app);
  plugin.init({ app });

  plugin.registerOverlay({ id: 'test-ov', render: () => null });
  plugin.registerContextMenuItem({ id: 'test-cm', label: 'Test' });
  const interceptor = { onKeyDown: () => true };
  plugin.registerInputInterceptor(interceptor);

  assert.equal(app.overlays.length, 1);
  assert.equal(app.contextMenuItems.length, 1);
  assert.equal(app.inputInterceptors.length, 1);

  plugin.destroy();

  assert.equal(app.overlays.length, 0);
  assert.equal(app.contextMenuItems.length, 0);
  assert.equal(app.inputInterceptors.length, 0);
});

test('PluginBase setEnabled prioritizes onPrefChange over onValuesPrefChange for efficient updates', () => {
  class FastPrefPlugin extends PluginBase {
    static id = 'fast_pref_plugin';
    static prefKey = 'enableFastPref';
  }

  let onPrefChangeCalled = false;
  let onValuesPrefChangeCalled = false;
  const app = new MockApp();
  app.prefValues = { enableFastPref: false };
  app.onPrefChange = (key, val) => {
    onPrefChangeCalled = true;
    assert.equal(key, 'enableFastPref');
    assert.equal(val, true);
  };
  app.onValuesPrefChange = () => {
    onValuesPrefChangeCalled = true;
  };

  const plugin = new FastPrefPlugin(app);
  plugin.init({ app });

  plugin.setEnabled(true);
  assert.equal(onPrefChangeCalled, true, 'onPrefChange should be called for single-key updates');
  assert.equal(onValuesPrefChangeCalled, false, 'onValuesPrefChange should not be called when onPrefChange exists');
});

test('PluginBase registerContextMenuItem defaults visible to requiring plugin.enabled', () => {
  class MenuItemPlugin extends PluginBase {
    static id = 'menu_item_plugin';
    getContextMenuItems() {
      return [
        {
          id: 'bare_item',
          label: 'Bare Item',
        },
        {
          id: 'custom_item',
          label: 'Custom Item',
          visible: () => true,
        },
      ];
    }
  }

  const app = new MockApp();
  const plugin = new MenuItemPlugin(app, { enabled: false });
  plugin.init({ app });

  assert.equal(app.contextMenuItems.length, 2);
  const bareItem = app.contextMenuItems.find((i) => i.id === 'bare_item');
  const customItem = app.contextMenuItems.find((i) => i.id === 'custom_item');

  assert.equal(typeof bareItem.visible, 'function');
  assert.equal(bareItem.visible(app, { normalEnabled: true }), false, 'Bare item should be hidden when disabled');

  plugin.enable();
  assert.equal(bareItem.visible(app, { normalEnabled: true }), true, 'Bare item should be visible when enabled');

  // Custom visible should remain unchanged
  assert.equal(customItem.visible(), true);
});

test('AutoLogin defines standard onClick and visible in getContextMenuItems, and handles term:screen-update safely', async () => {
  const { AutoLogin } = await import('../src/plugins/auto_login/AutoLogin.js');
  const app = new MockApp();
  const plugin = new AutoLogin(app, { enabled: true });
  plugin.init({ app });

  const items = plugin.getContextMenuItems();
  assert.equal(items.length, 1);
  assert.equal(typeof items[0].onClick, 'function', 'ContextMenu item must define onClick');
  assert.equal(typeof items[0].visible, 'function', 'ContextMenu item must define visible');
  assert.equal(items[0].visible(app, { normalEnabled: true }), true);

  // term:screen-update must not throw (onScreenUpdate undefined bug fix)
  assert.doesNotThrow(() => {
    app.emit('term:screen-update', { changedLineHtmlStrs: ['<div>test</div>'] });
  });

  plugin.disable();
  assert.equal(items[0].visible(app, { normalEnabled: true }), false);
});

test('EasyReading handles term:screen-update and term:font-update purely via event bus while enabled', async () => {
  const { EasyReading } = await import('../src/plugins/easy_reading/EasyReading.js');
  const app = new MockApp();
  const plugin = new EasyReading(app, { enabled: true });
  plugin.init({ app });

  let updateCount = 0;
  plugin.updatePage = () => {
    updateCount++;
  };

  app.emit('term:screen-update', { changedLineHtmlStrs: ['<div>line 1</div>'] });
  assert.equal(updateCount, 1);

  // When disabled, listenAppWhileEnabled detaches so updatePage is not called
  plugin.disable();
  app.emit('term:screen-update', { changedLineHtmlStrs: ['<div>line 2</div>'] });
  assert.equal(updateCount, 1, 'Disabled plugin should not receive term:screen-update');
});

test('PluginBase deduplicates listen() calls and strips internal whenEnabled option', () => {
  class ListenerPlugin extends PluginBase {
    static id = 'listener_plugin';
  }
  const app = new MockApp();
  const plugin = new ListenerPlugin(app, { enabled: true });
  plugin.init({ app });

  let calls = 0;
  let receivedOptions = null;
  const mockDomTarget = {
    listeners: [],
    addEventListener(event, handler, options) {
      receivedOptions = options;
      this.listeners.push({ event, handler, options });
    },
    removeEventListener(event, handler) {
      this.listeners = this.listeners.filter(
        (l) => !(l.event === event && l.handler === handler)
      );
    },
  };

  const handler = () => {
    calls++;
  };
  plugin.listenWhileEnabled(mockDomTarget, 'custom:evt', handler);
  plugin.listenWhileEnabled(mockDomTarget, 'custom:evt', handler);

  assert.equal(mockDomTarget.listeners.length, 1, 'Duplicate listen calls should be deduplicated');
  assert.equal(typeof receivedOptions === 'object' && 'whenEnabled' in receivedOptions, false, 'whenEnabled option should not be forwarded to DOM addEventListener');

  plugin.destroy();
  assert.equal(mockDomTarget.listeners.length, 0, 'All listeners must be removed on destroy');
});

test('AutoLogin disable/hide does not clobber app.modalShown when modal was not open', async () => {
  const { AutoLogin } = await import('../src/plugins/auto_login/AutoLogin.js');
  const app = new MockApp();
  app.modalShown = true; // e.g., PrefModal is open
  const plugin = new AutoLogin(app, { enabled: true });
  plugin.init({ app });

  assert.equal(plugin.showsModal, false);
  plugin.disable();
  assert.equal(app.modalShown, true, 'Disabling AutoLogin when its modal is closed must not clobber app.modalShown');

  plugin.enable();
  plugin.show();
  assert.equal(plugin.showsModal, true);
  assert.equal(app.modalShown, true);
  plugin.hide();
  assert.equal(app.modalShown, false, 'Hiding open AutoLogin modal resets app.modalShown');
});

test('PwaPrompt dismissModal cleans up timer from PluginBase._timers', async () => {
  const { PwaPromptPlugin } = await import('../src/plugins/pwa_prompt/index.js');
  const app = new MockApp();
  const plugin = new PwaPromptPlugin(app, { enabled: true });
  plugin.init({ app });

  plugin.checkAutoPrompt();
  assert.equal(plugin._timers.size, 1, 'Auto-prompt timer should be tracked in PluginBase._timers');

  plugin.dismissModal();
  assert.equal(plugin._timers.size, 0, 'dismissModal must remove auto-prompt timer from PluginBase._timers');
  plugin.destroy();
});

test('PacketDump attaches directly to app.conn and handles both detail.data and direct data payloads', async () => {
  const { PacketDump } = await import('../src/plugins/packet_dump/packet_dump.js');
  const app = new MockApp();
  const mockConn = new EventEmitter();
  app.conn = mockConn;

  const plugin = new PacketDump(app, { enabled: true });
  plugin.init({ app });

  assert.equal(plugin.currentSocket, mockConn, 'PacketDump should attach to app.conn when rawSocket is absent');

  const logged = [];
  plugin.log = (dir, data) => logged.push({ dir, data });

  mockConn.emit('rawRecv', { data: new Uint8Array([65, 66]) });
  mockConn.emit('rawSend', { detail: { data: new Uint8Array([67]) } });

  assert.equal(logged.length, 2);
  assert.equal(logged[0].dir, 'recv');
  assert.equal(logged[1].dir, 'send');
  plugin.destroy();
});

test('ImagePreviewer and LinkSegmentBuilder resolve string requests and decouple inline previews', () => {
  const imagePreviewerSrc = fs.readFileSync(
    path.resolve('src/plugins/media_previewer/ImagePreviewer.js'),
    'utf-8'
  );
  assert.ok(
    imagePreviewerSrc.includes('getCachedImageRequest(value)'),
    'ImagePreviewer.loadRequest must resolve string requests via getCachedImageRequest for OnHover'
  );
  assert.ok(
    imagePreviewerSrc.includes('typeof value === "string" ? value : value?.src'),
    'ImagePreviewer.OnHover must safely extract src from string or object value'
  );

  const linkBuilderSrc = fs.readFileSync(
    path.resolve('src/components/Row/LinkSegmentBuilder.js'),
    'utf-8'
  );
  assert.ok(
    linkBuilderSrc.includes('enableLinkInlinePreview(this.href'),
    'LinkSegmentBuilder must delegate hyperlink preview resolution to enableLinkInlinePreview when provided'
  );
});

test('PluginBase registerOverlayWhileEnabled, unregisterOverlay, unregisterContextMenuItem, and unlistenApp work properly', () => {
  const app = new MockApp();
  const plugin = new PluginBase(app, { enabled: false });
  plugin.init({ app });

  const overlay = { id: 'cond_overlay', render: () => null };
  plugin.registerOverlayWhileEnabled(overlay);
  assert.equal(app.overlays.length, 0, 'Overlay should not be registered while disabled');

  plugin.enable();
  assert.equal(app.overlays.length, 1, 'Overlay should be registered when enabled');
  assert.equal(app.overlays[0], overlay);

  plugin.disable();
  assert.equal(app.overlays.length, 0, 'Overlay should be unregistered when disabled');

  plugin.enable();
  assert.equal(app.overlays.length, 1, 'Overlay should re-register on enable');

  plugin.unregisterOverlay(overlay);
  assert.equal(app.overlays.length, 0, 'Explicit unregisterOverlay removes overlay');

  const menuItem = { id: 'custom_menu', label: 'Menu' };
  plugin.registerContextMenuItem(menuItem);
  assert.equal(app.contextMenuItems.length, 1);
  plugin.unregisterContextMenuItem('custom_menu');
  assert.equal(app.contextMenuItems.length, 0, 'Explicit unregisterContextMenuItem removes item');

  let eventCount = 0;
  const handler = () => { eventCount++; };
  plugin.listenApp('test:unlisten-app', handler);
  app.emit('test:unlisten-app');
  assert.equal(eventCount, 1);
  plugin.unlistenApp('test:unlisten-app', handler);
  app.emit('test:unlisten-app');
  assert.equal(eventCount, 1, 'unlistenApp should detach handler from app');

  plugin.destroy();
});

test('PluginBase init() updates view and buf when switching app instances', () => {
  const app1 = new MockApp();
  app1.view = { id: 'view1' };
  app1.buf = { id: 'buf1' };

  const app2 = new MockApp();
  app2.view = { id: 'view2' };
  app2.buf = { id: 'buf2' };

  const plugin = new PluginBase(app1);
  plugin.init({ app: app1 });
  assert.equal(plugin.view.id, 'view1');
  assert.equal(plugin.buf.id, 'buf1');

  plugin.init({ app: app2 });
  assert.equal(plugin.app, app2);
  assert.equal(plugin.view.id, 'view2', 'Plugin view should update when app changes');
  assert.equal(plugin.buf.id, 'buf2', 'Plugin buf should update when app changes');
  plugin.destroy();
});

test('AntiIdle setIdleInterval does not force-enable when enableAntiIdle is explicitly false', async () => {
  const { AntiIdle } = await import('../src/plugins/anti_idle/AntiIdle.js');
  const app = new MockApp();
  app.prefValues = { enableAntiIdle: false, antiIdleTime: 60 };

  const plugin = new AntiIdle(app, { enabled: false });
  plugin.init({ app });
  assert.equal(plugin.enabled, false);

  // Simulating app.onValuesPrefChange emitting antiIdleTime after enableAntiIdle: false
  app.emit('term:pref-change', { key: 'antiIdleTime', value: 120 });
  assert.equal(plugin.interval, 120000);
  assert.equal(plugin.enabled, false, 'setIdleInterval must not re-enable AntiIdle when enableAntiIdle is false');
  plugin.destroy();
});

test('PacketDump registers as input interceptor while enabled and exposes selection methods', async () => {
  const { PacketDump } = await import('../src/plugins/packet_dump/packet_dump.js');
  const app = new MockApp();
  const plugin = new PacketDump(app, { enabled: false });
  plugin.init({ app });

  assert.equal(app.inputInterceptors.includes(plugin), false, 'Should not intercept while disabled');
  plugin.enable();
  assert.equal(app.inputInterceptors.includes(plugin), true, 'Should register as input interceptor when enabled');
  assert.equal(typeof plugin.isActive, 'function');
  assert.equal(typeof plugin.getSelectedText, 'function');
  assert.equal(typeof plugin.getSelectionColRow, 'function');
  assert.equal(plugin.isActive(), false);

  plugin.disable();
  assert.equal(app.inputInterceptors.includes(plugin), false, 'Should unregister input interceptor when disabled');
  plugin.destroy();
});

test('PwaPromptPlugin manages app.modalShown and restores focus on dismiss/disable', async () => {
  const { PwaPromptPlugin } = await import('../src/plugins/pwa_prompt/PwaPrompt.js');
  const app = new MockApp();
  let focusCalled = 0;
  app.setInputAreaFocus = () => { focusCalled++; };
  app.modalShown = false;

  const plugin = new PwaPromptPlugin(app, { enabled: true });
  plugin.init({ app });

  plugin.showModal();
  assert.equal(plugin.showsModal, true);
  assert.equal(app.modalShown, true, 'Showing PwaPrompt modal must set app.modalShown = true');

  plugin.dismissModal();
  assert.equal(plugin.showsModal, false);
  assert.equal(app.modalShown, false, 'Dismissing PwaPrompt modal must set app.modalShown = false');
  assert.equal(focusCalled, 1, 'Dismissing PwaPrompt modal must restore terminal input focus');

  plugin.showModal();
  assert.equal(app.modalShown, true);
  plugin.disable();
  assert.equal(app.modalShown, false, 'Disabling PwaPrompt plugin must clear app.modalShown');
  assert.equal(focusCalled, 2, 'Disabling PwaPrompt plugin while modal open must restore focus');
  plugin.destroy();
});

test('PluginBase setEnabled does not re-entrantly invoke setEnabled on term:pref-change echo', () => {
  const app = new MockApp();
  app.prefValues = { enableTest: false };
  app.onPrefChange = (key, value) => {
    app.emit('term:pref-change', { key, value });
  };

  class TestPlugin extends PluginBase {
    static id = 'test_reentrant';
    static prefKey = 'enableTest';
  }

  const plugin = new TestPlugin(app, { enabled: false });
  plugin.init({ app });

  let setEnabledCalls = 0;
  const origSetEnabled = plugin.setEnabled.bind(plugin);
  plugin.setEnabled = (enabled, persist) => {
    setEnabledCalls++;
    return origSetEnabled(enabled, persist);
  };

  plugin.setEnabled(true, true);
  assert.equal(setEnabledCalls, 1, 'setEnabled(true, true) should not re-enter setEnabled when pref-change echoes back');
  plugin.destroy();
});

test('BaseSite attach receives term:connect and term:disconnect from term.app and fireLoginPrompt emits once', async () => {
  const { BaseSite } = await import('../src/js/sites/base.js');
  const site = new BaseSite();
  const mockBuf = new EventEmitter();
  mockBuf.app = new EventEmitter();

  site.attach(mockBuf);
  site._loginPromptFired = true;

  mockBuf.app.emit('term:connect');
  assert.equal(site._loginPromptFired, false, 'BaseSite should reset _loginPromptFired when term.app emits term:connect');

  let loginEvents = 0;
  mockBuf.app.on('term:login-prompt', () => { loginEvents++; });
  site.on('term:login-prompt', () => { loginEvents++; });

  site.fireLoginPrompt(mockBuf);
  assert.equal(loginEvents, 1, 'fireLoginPrompt must emit term:login-prompt only once (on target app)');
  site.detach();
});

test('App onValuesPrefChange only triggers onPrefChange for keys whose values changed after initial load', () => {
  const appSource = fs.readFileSync(path.resolve('src/js/app.js'), 'utf-8');
  assert.ok(
    appSource.includes('this._prefsInitialized'),
    'App.onValuesPrefChange must track _prefsInitialized and diff against previous prefValues'
  );
});


test('Plugin constructors preserve syncFromPrefs values from app.prefValues instead of overwriting with defaults', async () => {
  const { AntiIdle } = await import('../src/plugins/anti_idle/AntiIdle.js');
  const { AutoWrap } = await import('../src/plugins/auto_wrap/AutoWrap.js');
  const { LiveUpdate } = await import('../src/plugins/live_update/LiveUpdate.js');
  const { MediaPreviewer } = await import('../src/plugins/media_previewer/MediaPreviewer.js');

  const app = new MockApp();
  app.prefValues = {
    enableAntiIdle: true,
    antiIdleTime: 120,
    enableAutoWrap: true,
    lineWrap: 64,
    enableLiveUpdate: true,
    endTurnsOnLiveUpdate: false,
    liveUpdateInterval: 5,
    showLiveUpdateToolbar: false,
    enableMediaPreviewer: true,
    picPreviewWhitelistOnly: false,
  };

  const antiIdle = new AntiIdle(app);
  assert.equal(antiIdle.interval, 120000, 'AntiIdle constructor must not overwrite interval from app.prefValues');

  const autoWrap = new AutoWrap(app);
  assert.equal(autoWrap.lineWrap, 64, 'AutoWrap constructor must not overwrite lineWrap from app.prefValues');

  const liveUpdate = new LiveUpdate(app);
  assert.equal(liveUpdate.endTurnsOn, false, 'LiveUpdate constructor must not overwrite endTurnsOn');
  assert.equal(liveUpdate.intervalSec, 5, 'LiveUpdate constructor must not overwrite intervalSec');
  assert.equal(liveUpdate.showToolbar, false, 'LiveUpdate constructor must not overwrite showToolbar');
  assert.equal(liveUpdate.showsModal, false, 'LiveUpdate showsModal must reflect showToolbar=false');

  const mediaPreviewer = new MediaPreviewer(app);
  assert.equal(mediaPreviewer.whitelistOnly, false, 'MediaPreviewer constructor must not overwrite whitelistOnly');
});

test('PluginBase init() handles onInit() calling disable() or enable() without duplicate onEnable or premature onDisable', () => {
  let enableCalls = 0;
  let disableCalls = 0;
  let eventFired = 0;

  class SelfDisablingPlugin extends PluginBase {
    static id = 'self_disabling';
    onInit() {
      this.listenAppWhileEnabled('test:evt', () => { eventFired++; });
      this.disable();
    }
    onEnable() { enableCalls++; }
    onDisable() { disableCalls++; }
  }

  const app = new MockApp();
  const plugin1 = new SelfDisablingPlugin(app, { enabled: true });
  plugin1.init({ app });

  assert.equal(plugin1.enabled, false);
  assert.equal(enableCalls, 0, 'onEnable should not run when onInit disables plugin');
  assert.equal(disableCalls, 0, 'onDisable should not run before onEnable ever ran');
  app.emit('test:evt');
  assert.equal(eventFired, 0, 'listenAppWhileEnabled registered before disable() in onInit must not remain active');

  let enableCalls2 = 0;
  class SelfEnablingPlugin extends PluginBase {
    static id = 'self_enabling';
    onInit() {
      this.enable();
    }
    onEnable() { enableCalls2++; }
  }

  const plugin2 = new SelfEnablingPlugin(app, { enabled: true });
  plugin2.init({ app });
  assert.equal(enableCalls2, 1, 'onEnable must only be called once even if onInit calls enable()');
});

test('All plugins getContextMenuItems visible callbacks safely handle missing options object', async () => {
  const { BUILTIN_PLUGINS } = await import('../src/plugins/index.js');
  const app = new MockApp();

  for (const PluginClass of BUILTIN_PLUGINS) {
    const instance = new PluginClass(app, { enabled: true });
    instance.init({ app });
    const items = instance.getContextMenuItems();
    for (const item of items) {
      if (typeof item.visible === 'function') {
        assert.doesNotThrow(() => {
          const res = item.visible(app);
          assert.equal(typeof res, 'boolean', `${PluginClass.name} menu item visible(app) should return boolean`);
        });
      }
    }
    instance.destroy();
  }
});

test('TelnetConnection and TelnetFilter emit telopt with detail property and without duplicates', async () => {
  const { TelnetConnection } = await import('../src/js/telnet.js');
  const mockSocket = new EventEmitter();
  mockSocket.send = () => {};

  const conn = new TelnetConnection(mockSocket);
  const telopts = [];
  let doNawsCount = 0;
  conn.on('telopt', (e) => telopts.push(e));
  conn.on('doNaws', () => { doNawsCount++; });

  // Send IAC DO NAWS (255, 253, 31)
  mockSocket.emit('data', new Uint8Array([255, 253, 31]));

  assert.equal(telopts.length, 1, 'telopt should be emitted exactly once per command');
  assert.equal(telopts[0].cmd, 'DO');
  assert.equal(telopts[0].opt, 31);
  assert.equal(telopts[0].detail?.cmd, 'DO', 'telopt event must include .detail.cmd for app.js compatibility');
  assert.equal(telopts[0].detail?.opt, 31);
  assert.equal(doNawsCount, 1, 'doNaws should be emitted exactly once');
});

test('PluginBase setEnabled clears stale options.enabled so syncFromPrefs reflects latest state', () => {
  class OptPlugin extends PluginBase {
    static id = 'opt_plugin';
    static prefKey = 'enableOptPlugin';
  }
  const app = new MockApp();
  app.prefValues = { enableOptPlugin: false };
  const plugin = new OptPlugin(app, { enabled: true });
  plugin.init({ app });
  assert.equal(plugin.enabled, true);

  plugin.setEnabled(false, false);
  assert.equal(plugin.enabled, false);

  // Subsequent syncFromPrefs should read app.prefValues (false), not stale options.enabled (true)
  plugin.syncFromPrefs();
  assert.equal(plugin.enabled, false);
});

test('PluginOverlay does not call renderOverlay a second time when registered overlay returns null', async () => {
  const { PluginOverlay } = await import('../src/components/PluginOverlay.js');
  let renderCount = 0;

  const mockPlugin = {
    id: 'null_overlay_plugin',
    enabled: true,
    renderOverlay() {
      renderCount++;
      return null;
    },
  };

  const mockApp = {
    plugins: [mockPlugin],
    getOverlays() {
      return [
        {
          id: 'null_overlay_plugin',
          render: () => mockPlugin.renderOverlay(),
        },
      ];
    },
    on() {},
    off() {},
  };

  const overlayComp = new PluginOverlay({ app: mockApp });
  overlayComp.render();
  assert.equal(renderCount, 1, 'renderOverlay should only be invoked once per render pass even when returning null');
});

test('EasyReading Ctrl+H scroll sets stop and onFontUpdate preserves lineHeight', async () => {
  const { EasyReading } = await import('../src/plugins/easy_reading/EasyReading.js');
  const app = new MockApp();
  const plugin = new EasyReading(app, { enabled: true });
  plugin.init({ app });

  // Mock overlay and scroll state
  plugin._overlay = {
    style: { fontSize: '16px', lineHeight: '1.2' },
  };
  plugin.onFontUpdate({ fontSize: '20px', lineHeight: '1.5' });
  assert.equal(plugin._overlay.style.fontSize, '20px');
  assert.equal(plugin._overlay.style.lineHeight, '1.5');

  // Verify Ctrl+H when scrolling up returns true (scrolled) does not trigger leaveCurrentPost
  let leftPost = false;
  plugin.started = true;
  plugin._scrollBy = () => true;
  plugin.leaveCurrentPost = () => { leftPost = true; };

  const event = {
    key: 'h',
    ctrlKey: true,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    preventDefault() {},
    stopPropagation() {},
  };
  plugin._onKeyDownProcessUI(event);
  assert.equal(leftPost, false, 'Ctrl+H mid-article scroll must not leave current post');
});

test('App dispatches wheel and motion reports to active locator even when MouseBrowsing is disabled', async () => {
  const { MouseBrowsing } = await import('../src/plugins/mouse_browsing/MouseBrowsing.js');
  const appSrc = fs.readFileSync(path.resolve('src/js/app.js'), 'utf-8');
  const extractMethod = (name) => {
    const startIdx = appSrc.indexOf(`  ${name}(`);
    let depth = 0;
    let bodyStart = -1;
    for (let i = startIdx; i < appSrc.length; i++) {
      if (appSrc[i] === '{') {
        if (depth === 0) bodyStart = i + 1;
        depth++;
      } else if (appSrc[i] === '}') {
        depth--;
        if (depth === 0) {
          const header = appSrc.slice(startIdx, bodyStart - 1);
          const argsMatch = header.match(/\(([^)]*)\)/);
          const args = argsMatch
            ? argsMatch[1].split(',').map((s) => s.trim().split('=')[0].trim()).filter(Boolean)
            : [];
          return new Function(...args, appSrc.slice(bodyStart, i));
        }
      }
    }
  };
  const mouse_scroll = extractMethod('mouse_scroll');
  const mouse_move = extractMethod('mouse_move');

  const sent = [];
  const app = new MockApp();
  app.modalShown = false;
  app.contextMenuShown = false;
  app.isDialogOrExcludedTarget = () => false;
  app.termWin = { style: { cursor: 'pointer' } };
  app.send = (str) => sent.push(str);
  app.clientToPos = () => ({ col: 5, row: 10 });
  app.buf = {
    locator: {
      isActive: () => true,
      requiresMotionReports: () => true,
      handleWheel: () => '\x1b[<64;6;11M',
      handleMouseMove: () => '\x1b[<35;6;11M',
    },
    clearHighlight() {},
  };

  const plugin = new MouseBrowsing(app, { enabled: false });
  plugin.init({ app });
  assert.equal(plugin.enabled, false);

  let stopped = false;
  let prevented = false;
  mouse_scroll.call(app, {
    clientX: 50,
    clientY: 100,
    stopPropagation() { stopped = true; },
    preventDefault() { prevented = true; },
  });
  assert.equal(stopped, true);
  assert.equal(prevented, true);
  assert.deepEqual(sent, ['\x1b[<64;6;11M']);

  mouse_move.call(app, { clientX: 50, clientY: 100 });
  assert.equal(app.termWin.style.cursor, 'default');
  assert.deepEqual(sent, ['\x1b[<64;6;11M', '\x1b[<35;6;11M']);
});

test('App dispatches mouse click reports to active locator even when MouseBrowsing is disabled', async () => {
  const { MouseBrowsing } = await import('../src/plugins/mouse_browsing/MouseBrowsing.js');
  const appSrc = fs.readFileSync(path.resolve('src/js/app.js'), 'utf-8');
  const startIdx = appSrc.indexOf('  mouse_click(');
  let depth = 0;
  let bodyStart = -1;
  let mouse_click = null;
  for (let i = startIdx; i < appSrc.length; i++) {
    if (appSrc[i] === '{') {
      if (depth === 0) bodyStart = i + 1;
      depth++;
    } else if (appSrc[i] === '}') {
      depth--;
      if (depth === 0) {
        mouse_click = new Function('e', appSrc.slice(bodyStart, i));
        break;
      }
    }
  }

  const sent = [];
  const app = new MockApp();
  app.modalShown = false;
  app.contextMenuShown = false;
  app.isDialogOrExcludedTarget = () => false;
  app.isSelectionCollapsed = () => true;
  app.view = { useCanvasEngine: false };
  app.site = {
    handleCustomLink: () => false,
    handlePassScreenClick: () => false,
  };
  app.setInputAreaFocus = () => {};
  app.send = (str) => sent.push(str);
  app.clientToPos = () => ({ col: 5, row: 10 });
  app.buf = {
    locator: {
      isActive: () => true,
      handleMouseClick: () => '\x1b[<0;6;11M',
    },
    clearHighlight() {},
  };

  const plugin = new MouseBrowsing(app, { enabled: false });
  plugin.init({ app });
  assert.equal(plugin.enabled, false);

  let prevented = false;
  mouse_click.call(app, {
    clientX: 50,
    clientY: 100,
    button: 0,
    target: { closest: () => null },
    preventDefault() { prevented = true; },
  });
  assert.equal(prevented, true);
  assert.deepEqual(sent, ['\x1b[<0;6;11M']);
});

test('PluginBase.getMetadata() only returns renderOptions when defined on subclass', async () => {
  const { AutoLogin } = await import('../src/plugins/auto_login/AutoLogin.js');
  const { AntiIdle } = await import('../src/plugins/anti_idle/AntiIdle.js');
  const app = new MockApp();

  const autoLogin = new AutoLogin(app);
  const autoLoginMeta = autoLogin.getMetadata();
  assert.equal(autoLoginMeta.renderOptions, undefined, 'AutoLogin without custom renderOptions should return undefined');

  const antiIdle = new AntiIdle(app);
  const antiIdleMeta = antiIdle.getMetadata();
  assert.equal(typeof antiIdleMeta.renderOptions, 'function', 'AntiIdle with static renderOptions should return function');
});

test('InputInterceptors short-circuits subsequent interceptors when an earlier interceptor handles or prevents event', async () => {
  const { InputInterceptors } = await import('../src/js/input_interceptors.js');
  const interceptors = new InputInterceptors();

  let secondClickCalled = false;
  let secondKeyCalled = false;
  let secondWheelCalled = false;

  const firstPlugin = {
    handleMouseClick(e) {
      e.preventDefault();
      return true;
    },
    handleKeyDown(e) {
      e.preventDefault();
      return true;
    },
    handleWheel(e) {
      return true;
    },
  };

  const secondPlugin = {
    handleMouseClick() {
      secondClickCalled = true;
      return true;
    },
    handleKeyDown() {
      secondKeyCalled = true;
      return true;
    },
    handleWheel() {
      secondWheelCalled = true;
      return true;
    },
  };

  interceptors.registerInterceptor(firstPlugin);
  interceptors.registerInterceptor(secondPlugin);

  const clickEvent = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  assert.equal(interceptors.dispatchMouseClick(clickEvent), true);
  assert.equal(secondClickCalled, false, 'Second mouseClick interceptor must not run after first handled it');

  const keyEvent = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  assert.equal(interceptors.dispatchKeyDown(keyEvent), true);
  assert.equal(secondKeyCalled, false, 'Second keyDown interceptor must not run after first handled it');

  const wheelEvent = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  assert.equal(interceptors.dispatchWheel(wheelEvent), true);
  assert.equal(secondWheelCalled, false, 'Second wheel interceptor must not run after first handled it');
});

test('EasyReading.handleMouseClick ignores clicks when overlay is temporarily hidden (Escape key)', async () => {
  const { EasyReading } = await import('../src/plugins/easy_reading/EasyReading.js');
  const app = new MockApp();
  const plugin = new EasyReading(app, { enabled: true });
  plugin.init({ app });
  plugin.started = true;
  // Overlay hidden via Escape key -> style.display === 'none'
  plugin._overlay = { style: { display: 'none' } };
  assert.equal(plugin.isActive(), false);

  const handled = plugin.handleMouseClick({
    clientX: 100,
    clientY: 100,
    button: 0,
    preventDefault() {},
  });
  assert.equal(handled, false, 'Hidden EasyReading overlay should not intercept mouse clicks');
});

test('TouchDebugHUD.setHudEnabled avoids re-entrant double execution of startTimer and attachListeners', async () => {
  const { TouchDebugHUDPlugin, TouchDebugHUD } = await import('../src/plugins/touch_debug_hud/TouchDebugHUD.js');
  const app = new MockApp();
  const plugin = new TouchDebugHUDPlugin(app, { enabled: false });
  plugin.init({ app });

  const hud = new TouchDebugHUD({ app, plugin });
  plugin.component = hud;

  let attachCount = 0;
  hud.attachListeners = () => { attachCount++; };
  hud.startTimer = () => {};

  hud.setHudEnabled(true, false);
  assert.equal(attachCount, 1, 'attachListeners should be called exactly once without re-entrant duplication');
  assert.equal(plugin.enabled, true);
});

test('TermView setHyperlinkPreviewProvider decouples MediaPreviewer and EasyReading from enableMediaPreviewer', async () => {
  const { MediaPreviewer } = await import('../src/plugins/media_previewer/MediaPreviewer.js');
  const app = new MockApp();
  let providerSet = null;
  app.view = {
    enableLinkHoverPreview: false,
    renderHyperlinkPreview: false,
    renderInlineHyperlinkPreview: null,
    resolveHyperlinkPreview: (href) => href,
    isHyperlinkPreviewEnabled() {
      return Boolean(this.enableLinkHoverPreview && this.resolveHyperlinkPreview);
    },
    setHyperlinkPreviewProvider(provider) {
      providerSet = provider;
      if (!provider) {
        this.enableLinkHoverPreview = false;
        this.renderHyperlinkPreview = false;
        this.renderInlineHyperlinkPreview = null;
      } else {
        this.enableLinkHoverPreview = Boolean(provider.enabled !== false);
        this.renderHyperlinkPreview = provider.renderHover || false;
        this.renderInlineHyperlinkPreview = provider.renderInline || null;
      }
    },
  };

  const mp = new MediaPreviewer(app, { enabled: true });
  mp.init({ app, view: app.view });
  assert.ok(providerSet, 'MediaPreviewer should register hyperlink preview provider on init');
  assert.equal(app.view.enableLinkHoverPreview, true);
  assert.equal(app.view.isHyperlinkPreviewEnabled(), true);

  mp.disable();
  assert.equal(providerSet, null, 'Disabling MediaPreviewer should clear hyperlink preview provider');
  assert.equal(app.view.enableLinkHoverPreview, false);
  assert.equal(app.view.isHyperlinkPreviewEnabled(), false);

  mp.enable();
  assert.equal(app.view.enableLinkHoverPreview, true);
  mp.destroy();
  assert.equal(app.view.enableLinkHoverPreview, false);
});

test('Plugins declare defaultPrefs and onTogglePref hooks, decoupling PrefModal from hardcoded plugin names', async () => {
  const { BUILTIN_PLUGINS, LiveUpdate, AntiIdle, AutoWrap } = await import('../src/plugins/index.js');

  for (const PluginClass of BUILTIN_PLUGINS) {
    const meta = PluginClass.getMetadata();
    assert.equal(typeof meta.defaultPrefs, 'object', `${PluginClass.name} must expose defaultPrefs in metadata`);
    assert.ok(meta.prefKey in meta.defaultPrefs, `${PluginClass.name}.defaultPrefs must include its prefKey (${meta.prefKey})`);
  }

  // LiveUpdate onTogglePref
  const liveUpdated = LiveUpdate.onTogglePref(true, {});
  assert.equal(liveUpdated.endTurnsOnLiveUpdate, true);
  assert.equal(liveUpdated.showLiveUpdateToolbar, true);
  assert.equal(liveUpdated.liveUpdateInterval, 1);

  // AntiIdle onTogglePref
  const antiIdleUpdated = AntiIdle.onTogglePref(true, { antiIdleTime: 0 });
  assert.equal(antiIdleUpdated.antiIdleTime, 180);

  // AutoWrap onTogglePref
  const autoWrapUpdated = AutoWrap.onTogglePref(true, { lineWrap: 0 });
  assert.equal(autoWrapUpdated.lineWrap, 78);

  // Verify PrefModal source does not hardcode enableLiveUpdate/enableAntiIdle/enableAutoWrap in handleCheckboxChange
  const prefModalSrc = fs.readFileSync(path.resolve('src/components/Settings/PrefModal.js'), 'utf-8');
  assert.ok(
    prefModalSrc.includes('matchedPlugin.onTogglePref'),
    'PrefModal.handleCheckboxChange must delegate to matchedPlugin.onTogglePref'
  );
  assert.ok(
    !prefModalSrc.includes('if (name === "enableLiveUpdate"'),
    'PrefModal must not hardcode enableLiveUpdate check in handleCheckboxChange'
  );
});




