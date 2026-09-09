import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { AutoLogin, AutoLoginPlugin } from '../src/plugins/auto_login/index.js';
import { BUILTIN_PLUGINS, PLUGIN_GROUP_MAP, getAvailablePlugins } from '../src/plugins/index.js';
import { DEFAULT_PREFS } from '../src/js/pref.js';

test('AutoLogin plugin exports, metadata, and registration', () => {
  // 1. Exports
  assert.strictEqual(typeof AutoLogin, 'function');
  assert.strictEqual(AutoLogin, AutoLoginPlugin);

  // 2. Static properties
  assert.strictEqual(AutoLogin.id, 'auto_login');
  assert.strictEqual(AutoLogin.name, 'auto_login');
  assert.strictEqual(AutoLogin.prefKey, 'enableAutoLogin');
  assert.strictEqual(AutoLogin.group, 'bbs');

  // 3. Metadata
  const meta = AutoLogin.getMetadata();
  assert.strictEqual(meta.id, 'auto_login');
  assert.strictEqual(meta.prefKey, 'enableAutoLogin');
  assert.strictEqual(meta.group, 'bbs');
  assert.strictEqual(meta.icon, 'key');

  // 4. Registration in BUILTIN_PLUGINS and PLUGIN_GROUP_MAP
  assert.ok(BUILTIN_PLUGINS.includes(AutoLogin), 'BUILTIN_PLUGINS must include AutoLogin');
  assert.strictEqual(PLUGIN_GROUP_MAP.auto_login, 'bbs', 'PLUGIN_GROUP_MAP must map auto_login to bbs');

  // 5. DEFAULT_PREFS includes enableAutoLogin: true
  assert.strictEqual(DEFAULT_PREFS.enableAutoLogin, true, 'DEFAULT_PREFS must default enableAutoLogin to true');
});

test('AutoLogin lifecycle, context menu, and modal toggle', () => {
  const dispatchedEvents = [];
  const registeredMenuItems = [];
  const unregisteredMenuItemIds = [];

  const mockApp = {
    modalShown: false,
    inputAreaFocused: false,
    listeners: {},
    addEventListener(type, fn) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(fn);
    },
    removeEventListener(type, fn) {
      if (!this.listeners[type]) return;
      this.listeners[type] = this.listeners[type].filter(f => f !== fn);
    },
    dispatchEvent(evt) {
      dispatchedEvents.push(evt.type);
      const fns = this.listeners[evt.type] || [];
      fns.forEach(fn => fn(evt));
    },
    registerContextMenuItem(item) {
      registeredMenuItems.push(item);
    },
    unregisterContextMenuItem(id) {
      unregisteredMenuItemIds.push(id);
    },
    setInputAreaFocus() {
      this.inputAreaFocused = true;
    },
  };

  const plugin = new AutoLogin(mockApp);
  assert.strictEqual(plugin.enabled, true);
  assert.strictEqual(plugin.showsModal, false);

  // Init registers menu item
  plugin.init({ app: mockApp });
  assert.strictEqual(registeredMenuItems.length, 1);
  assert.strictEqual(registeredMenuItems[0].id, 'auto_login');
  assert.strictEqual(registeredMenuItems[0].order, 5);

  // Show modal
  plugin.show();
  assert.strictEqual(plugin.showsModal, true);
  assert.strictEqual(mockApp.modalShown, true);
  assert.ok(dispatchedEvents.includes('term:overlay:update'));

  // Hide modal
  plugin.hide();
  assert.strictEqual(plugin.showsModal, false);
  assert.strictEqual(mockApp.modalShown, false);
  assert.strictEqual(mockApp.inputAreaFocused, true);

  // Toggle modal
  plugin.toggle();
  assert.strictEqual(plugin.showsModal, true);
  plugin.toggle();
  assert.strictEqual(plugin.showsModal, false);

  // Destroy cleans up
  plugin.destroy();
  assert.ok(unregisteredMenuItemIds.includes('auto_login'));
});

test('AutoLogin handleLogin sends ID and password with CR and short typeahead interval', async () => {
  const sentData = [];
  const mockApp = {
    modalShown: true,
    send(data) {
      sentData.push(data);
    },
    dispatchEvent() {},
    setInputAreaFocus() {},
  };

  const plugin = new AutoLogin(mockApp);
  plugin.showsModal = true;

  plugin.handleLogin({ username: 'testuser', password: 'secretpassword' });

  // Username should be sent immediately
  assert.strictEqual(sentData.length, 1);
  assert.strictEqual(sentData[0], 'testuser\r');

  // Password should be sent after a short delay
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.strictEqual(sentData.length, 2);
  assert.strictEqual(sentData[1], 'secretpassword\r');

  // Modal should be hidden after form submit cooldown
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.strictEqual(plugin.showsModal, false);
  assert.strictEqual(mockApp.modalShown, false);
});

test('LoginModal structure adheres to browser password manager conventions', () => {
  const modalSource = fs.readFileSync(
    path.resolve('src/plugins/auto_login/LoginModal.js'),
    'utf-8'
  );
  const modalCss = fs.readFileSync(
    path.resolve('src/plugins/auto_login/LoginModal.css'),
    'utf-8'
  );

  // Must have standard HTML form semantics for browser autofill
  assert.ok(modalSource.includes('<form'), 'Must render standard form');
  assert.ok(modalSource.includes('autoComplete="username"'), 'Username input must specify autoComplete="username"');
  assert.ok(modalSource.includes('autoComplete="current-password"'), 'Password input must specify autoComplete="current-password"');
  assert.ok(modalSource.includes('type="password"'), 'Password input must be type="password"');
  assert.ok(modalSource.includes('type="submit"'), 'Must have type="submit" button');
  assert.ok(modalSource.includes('autoCapitalize="none"'), 'Must disable autoCapitalize on mobile touch keyboard');

  // iOS Safari font-size 16px to prevent zoom
  assert.ok(modalCss.includes('font-size: 16px'), 'Input must have 16px font size to prevent iOS auto-zoom');

  // SPA Credential Management API
  assert.ok(modalSource.includes('PasswordCredential'), 'Must leverage PasswordCredential API for SPAs');
  assert.ok(modalSource.includes('navigator?.credentials?.store'), 'Must call navigator.credentials.store');
  assert.ok(modalSource.includes('attemptAutoRetrieve'), 'Must implement attemptAutoRetrieve for auto-fill');
  assert.ok(modalSource.includes("mediation: \"silent\""), 'Must request credentials with silent mediation');
  assert.ok(modalSource.includes("mediation: \"optional\""), 'Must request credentials with optional mediation on user gesture');
  assert.ok(modalSource.includes('focusAppropriateField'), 'Must focus appropriate field when credentials retrieved');
  assert.ok(modalSource.includes('submitBtnRef'), 'Must reference submit button for focus management');
});

test('ContextMenu and DropdownMenu integration passes pluginItems', () => {
  const contextMenuSource = fs.readFileSync(
    path.resolve('src/components/ContextMenu/index.js'),
    'utf-8'
  );
  assert.ok(
    contextMenuSource.includes('pluginItems={pluginItems}'),
    'ContextMenu must pass pluginItems prop to DropdownMenu'
  );
  assert.ok(
    contextMenuSource.includes('app?.modalShown'),
    'ContextMenu must recognize app.modalShown for anyModalShown'
  );
});

test('AutoLogin triggers modal on login prompt events', async () => {
  const listeners = {};
  const mockApp = {
    modalShown: false,
    addEventListener(type, fn) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(fn);
    },
    removeEventListener(type, fn) {
      if (!listeners[type]) return;
      listeners[type] = listeners[type].filter(f => f !== fn);
    },
    dispatchEvent(evt) {
      const fns = listeners[evt.type] || [];
      fns.forEach(fn => fn(evt));
    },
    registerContextMenuItem() {},
  };

  const plugin = new AutoLogin(mockApp);
  plugin.init({ app: mockApp });
  assert.strictEqual(plugin.showsModal, false);

  // 1. Firing login event automatically triggers modal
  mockApp.dispatchEvent(new CustomEvent('login'));
  assert.strictEqual(plugin.showsModal, true);
  assert.strictEqual(mockApp.modalShown, true);

  plugin.hide();
  assert.strictEqual(plugin.showsModal, false);

  // 2. Firing term:login-prompt event also triggers modal
  mockApp.dispatchEvent(new CustomEvent('term:login-prompt'));
  assert.strictEqual(plugin.showsModal, true);

  plugin.hide();

  // 3. When disabled, login event does NOT trigger modal
  plugin.enabled = false;
  mockApp.dispatchEvent(new CustomEvent('login'));
  assert.strictEqual(plugin.showsModal, false);
});

test('Site onData with PTT and Maple login strings triggers AutoLogin plugin modal', async () => {
  const { PttSite } = await import('../src/js/sites/ptt.js');
  const { Maple3Site } = await import('../src/js/sites/maple3.js');
  const { u2b } = await import('../src/js/string_util.js');

  const createMockEnvironment = () => {
    const listeners = {};
    const app = {
      modalShown: false,
      addEventListener(type, fn) {
        if (!listeners[type]) listeners[type] = [];
        listeners[type].push(fn);
      },
      removeEventListener(type, fn) {
        if (!listeners[type]) return;
        listeners[type] = listeners[type].filter(f => f !== fn);
      },
      dispatchEvent(evt) {
        const fns = listeners[evt.type] || [];
        fns.forEach(fn => fn(evt));
      },
      registerContextMenuItem() {},
    };
    const buf = {
      app,
      rows: 24,
      cols: 80,
      dispatchEvent(evt) {
        app.dispatchEvent(evt);
      },
      getRowText: () => '',
    };
    return { app, buf };
  };

  // 1. PTT site onData triggers AutoLogin
  const env1 = createMockEnvironment();
  const plugin1 = new AutoLogin(env1.app);
  plugin1.init({ app: env1.app, buf: env1.buf });

  const pttSite = new PttSite();
  const pttData = Uint8Array.from(
    u2b('\x1b[0;37;40m\x1b[21;1H\x1b[K請輸入代號，或以 guest 參觀，或以 new 註冊: '),
    c => c.charCodeAt(0)
  );
  pttSite.onData(pttData, env1.buf);
  assert.strictEqual(plugin1.showsModal, true, 'PTT onData must trigger AutoLogin modal');

  // 2. Maple site onData triggers AutoLogin
  const env2 = createMockEnvironment();
  const plugin2 = new AutoLogin(env2.app);
  plugin2.init({ app: env2.app, buf: env2.buf });

  const mapleSite = new Maple3Site();
  const mapleData = Uint8Array.from(
    u2b('\x1b[22;1H   [您的帳號] '),
    c => c.charCodeAt(0)
  );
  mapleSite.onData(mapleData, env2.buf);
  assert.strictEqual(plugin2.showsModal, true, 'Maple onData must trigger AutoLogin modal');

  // 3. Split chunk buffering across TCP packets
  const env3 = createMockEnvironment();
  const plugin3 = new AutoLogin(env3.app);
  plugin3.init({ app: env3.app, buf: env3.buf });

  const pttSiteSplit = new PttSite();
  const fullBytes = Uint8Array.from(
    u2b('請輸入代號: '),
    c => c.charCodeAt(0)
  );
  // Split across middle of Chinese word
  const chunkA = fullBytes.slice(0, 5);
  const chunkB = fullBytes.slice(5);

  pttSiteSplit.onData(chunkA, env3.buf);
  assert.strictEqual(plugin3.showsModal, false, 'Modal should not show before full prompt is assembled');

  pttSiteSplit.onData(chunkB, env3.buf);
  assert.strictEqual(plugin3.showsModal, true, 'Modal should trigger when split chunks assemble prompt');
});

test('Approach A: Site onData detects login prompt, fires login event, AutoLogin sets flag and ignores subsequent prompts until reconnect', async () => {
  const { BaseSite } = await import('../src/js/sites/base.js');
  const { u2b } = await import('../src/js/string_util.js');

  const listeners = {};
  const mockApp = {
    modalShown: false,
    addEventListener(type, fn) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(fn);
    },
    removeEventListener(type, fn) {
      if (!listeners[type]) return;
      listeners[type] = listeners[type].filter(f => f !== fn);
    },
    dispatchEvent(evt) {
      const fns = listeners[evt.type] || [];
      fns.forEach(fn => fn(evt));
    },
    registerContextMenuItem() {},
  };

  const mockBuf = {
    app: mockApp,
    rows: 24,
    cols: 80,
    dispatchEvent(evt) {
      mockApp.dispatchEvent(evt);
    },
    getRowText: () => '',
  };

  const site = new BaseSite();
  const plugin = new AutoLogin(mockApp);
  plugin.init({ app: mockApp, buf: mockBuf });

  assert.strictEqual(plugin.loginPromptDetected, false);
  assert.strictEqual(site._loginPromptFired, false);

  // 1. Send BBS login prompt in Big5
  const loginBytes = Uint8Array.from(
    u2b('\x1b[1;33m請輸入代號，或以 guest 參觀: \x1b[m'),
    c => c.charCodeAt(0)
  );

  site.onData(loginBytes, mockBuf);
  assert.strictEqual(site._loginPromptFired, true, 'BaseSite must mark login prompt fired');
  assert.strictEqual(plugin.loginPromptDetected, true, 'AutoLogin must set loginPromptDetected to true');
  assert.strictEqual(plugin.showsModal, true, 'AutoLogin modal must be shown');

  // User logs in and closes modal
  plugin.hide();
  assert.strictEqual(plugin.showsModal, false);
  assert.strictEqual(plugin.loginPromptDetected, true);

  // 2. Subsequent packets during browsing (even if containing "請輸入代號") are ignored at line 1
  const articleBytes = Uint8Array.from(
    u2b('文章內容討論請輸入代號'),
    c => c.charCodeAt(0)
  );
  site.onData(articleBytes, mockBuf);
  assert.strictEqual(plugin.showsModal, false, 'Subsequent data must not re-trigger modal');

  // 3. On disconnect and reconnect, both site and plugin reset
  site.resetLoginPrompt();
  mockApp.dispatchEvent(new CustomEvent('term:disconnect'));
  assert.strictEqual(site._loginPromptFired, false, 'BaseSite _loginPromptFired must reset on disconnect');
  assert.strictEqual(plugin.loginPromptDetected, false, 'AutoLogin loginPromptDetected must reset on disconnect');

  mockApp.dispatchEvent(new CustomEvent('term:connect'));
  assert.strictEqual(plugin.loginPromptDetected, false, 'AutoLogin loginPromptDetected ready for next session');
});

test('AutoLogin and LoginModal handle Credential Management API auto-retrieval flow', async () => {
  const calls = [];
  const fakeCred = { id: 'testuser', password: 'secretpassword' };

  let currentHandler = async (opts) => {
    calls.push(opts);
    if (opts.mediation === 'silent') return fakeCred;
    return null;
  };

  const fakeNavigator = {
    credentials: {
      get: (opts) => currentHandler(opts),
    },
  };

  // 1. Silent retrieval succeeds when 1 credential is saved
  const cred1 = await fakeNavigator.credentials.get({ password: true, mediation: 'silent' });
  assert.strictEqual(cred1.id, 'testuser');
  assert.strictEqual(cred1.password, 'secretpassword');
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].mediation, 'silent');

  // 2. Silent returns null, user gesture falls back to optional
  currentHandler = async (opts) => {
    calls.push(opts);
    if (opts.mediation === 'silent') return null;
    if (opts.mediation === 'optional') return fakeCred;
    return null;
  };

  const silentResult = await fakeNavigator.credentials.get({ password: true, mediation: 'silent' });
  assert.strictEqual(silentResult, null);
  const optionalResult = await fakeNavigator.credentials.get({ password: true, mediation: 'optional' });
  assert.strictEqual(optionalResult.id, 'testuser');
});



