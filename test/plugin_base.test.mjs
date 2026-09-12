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
  const plugin = new LifecyclePlugin(app, { enabled: true });

  plugin.init({ app });
  assert.equal(initCalled, true, 'onInit should be called on init()');
  assert.equal(enableCalled, true, 'onEnable should be called when enabled is true');
  assert.equal(plugin.enabled, true);

  plugin.disable();
  assert.equal(disableCalled, true, 'onDisable should be called on disable()');
  assert.equal(plugin.enabled, false);

  enableCalled = false;
  plugin.enable();
  assert.equal(enableCalled, true, 'onEnable should be called on enable()');
  assert.equal(plugin.enabled, true);

  disableCalled = false;
  plugin.destroy();
  assert.equal(disableCalled, true, 'destroy() should call disable() first if enabled');
  assert.equal(destroyCalled, true, 'onDestroy should be called on destroy()');
});

test('PluginBase manages event listeners automatically on enable, disable, and destroy', () => {
  const app = new MockApp();
  const target = new EventEmitter();

  let permanentCount = 0;
  let conditionalCount = 0;

  class EventPlugin extends PluginBase {
    static id = 'event_plugin';
    static prefKey = 'enableEvent';

    onInit() {
      // Permanent listener (stays attached until destroy)
      this.listen(target, 'permanent', () => {
        permanentCount++;
      });

      // Conditional listener (only active when enabled)
      this.listenWhileEnabled(target, 'conditional', () => {
        conditionalCount++;
      });
    }
  }

  const plugin = new EventPlugin(app, { enabled: false });
  plugin.init({ app });

  // While disabled: permanent fires, conditional does NOT
  target.emit('permanent');
  target.emit('conditional');
  assert.equal(permanentCount, 1);
  assert.equal(conditionalCount, 0);

  // Enable plugin: both fire
  plugin.enable();
  target.emit('permanent');
  target.emit('conditional');
  assert.equal(permanentCount, 2);
  assert.equal(conditionalCount, 1);

  // Disable plugin: permanent fires, conditional detaches
  plugin.disable();
  target.emit('permanent');
  target.emit('conditional');
  assert.equal(permanentCount, 3);
  assert.equal(conditionalCount, 1);

  // Destroy plugin: all listeners detached
  plugin.destroy();
  target.emit('permanent');
  target.emit('conditional');
  assert.equal(permanentCount, 3);
  assert.equal(conditionalCount, 1);
});

test('PluginBase automatically synchronizes enabled state via term:pref-change on app', () => {
  class PrefSyncPlugin extends PluginBase {
    static id = 'pref_sync';
    static prefKey = 'enablePrefSync';
  }

  const app = new MockApp();
  const plugin = new PrefSyncPlugin(app, { enabled: false });
  plugin.init({ app });

  assert.equal(plugin.enabled, false);

  // Simulate preference change event from App
  app.emit('term:pref-change', { key: 'enablePrefSync', value: true });
  assert.equal(plugin.enabled, true, 'Plugin should auto-enable on term:pref-change');

  app.emit('term:pref-change', { key: 'enablePrefSync', value: false });
  assert.equal(plugin.enabled, false, 'Plugin should auto-disable on term:pref-change');

  // Unrelated pref should be ignored
  app.emit('term:pref-change', { key: 'otherPref', value: true });
  assert.equal(plugin.enabled, false);
});

test('PluginBase manages timers and clears them automatically on disable/destroy', (t, done) => {
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

test('PluginBase registers and unregisters with InputInterceptors instance via App', async () => {
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

test('App source defines destroyPlugins() to clean up all registered plugins', () => {
  const appFile = fs.readFileSync(path.resolve('src/js/app.js'), 'utf-8');
  assert.ok(
    appFile.includes('destroyPlugins()'),
    'App must define destroyPlugins()'
  );
  assert.ok(
    appFile.includes('plugin.destroy'),
    'destroyPlugins must invoke plugin.destroy()'
  );
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

test('App onValuesPrefChange only triggers onPrefChange for keys whose values changed after initial load', () => {
  const appSource = fs.readFileSync(path.resolve('src/js/app.js'), 'utf-8');
  assert.ok(
    appSource.includes('this._prefsInitialized'),
    'App.onValuesPrefChange must track _prefsInitialized and diff against previous prefValues'
  );
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
