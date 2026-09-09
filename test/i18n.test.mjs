import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  _,
  getMessage,
  setupI18n,
  getLang,
  setLocale,
  getActiveLocale,
  getLocalePreference,
  SUPPORTED_LOCALES,
} from '../src/js/i18n.js';
import en_US from '../src/_locales/en/messages.json' with { type: 'json' };
import zh_TW from '../src/_locales/zh_TW/messages.json' with { type: 'json' };

function setMockNavigator(navObj) {
  const originalDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    value: navObj,
    configurable: true,
    writable: true,
  });
  return () => {
    if (originalDesc) {
      Object.defineProperty(globalThis, 'navigator', originalDesc);
    } else {
      delete globalThis.navigator;
    }
  };
}

test('getLang negotiates supported languages with fallback to en_us', () => {
  // 1. zh-TW in languages
  let restore = setMockNavigator({ languages: ['zh-TW', 'en-US'] });
  assert.equal(getLang(), 'zh_tw');
  restore();

  // 2. en-US in languages
  restore = setMockNavigator({ languages: ['en-US', 'zh-TW'] });
  assert.equal(getLang(), 'en_us');
  restore();

  // 3. Unsupported language falls back to en_us
  restore = setMockNavigator({ languages: ['ja-JP', 'fr-FR'] });
  assert.equal(getLang(), 'en_us');
  restore();

  // 4. Single language property
  restore = setMockNavigator({ language: 'zh-TW' });
  assert.equal(getLang(), 'zh_tw');
  restore();

  // 5. Empty navigator
  restore = setMockNavigator({});
  assert.equal(getLang(), 'en_us');
  restore();

  // 6. Explicit preferred language parameter overrides navigator
  restore = setMockNavigator({ languages: ['en-US'] });
  assert.equal(getLang('zh_tw'), 'zh_tw');
  assert.equal(getLang('zh-TW'), 'zh_tw');
  assert.equal(getLang('en_us'), 'en_us');
  assert.equal(getLang('auto'), 'en_us');
  restore();

  restore = setMockNavigator({ languages: ['zh-TW'] });
  assert.equal(getLang('en_us'), 'en_us');
  assert.equal(getLang('auto'), 'zh_tw');
  restore();
});

test('setupI18n and getMessage / _ resolve translations for current locale', () => {
  // Test zh_tw
  let restore = setMockNavigator({ languages: ['zh-TW'] });
  setupI18n();
  assert.equal(_('appName'), 'PTT Term');
  assert.equal(_('options_mouse'), '滑鼠');
  assert.equal(getMessage('options_mouse'), '滑鼠');
  restore();

  // Test en_us
  restore = setMockNavigator({ languages: ['en-US'] });
  setupI18n();
  assert.equal(_('options_mouse'), 'Mouse');
  assert.equal(getMessage('options_mouse'), 'Mouse');
  restore();

  // Missing key returns empty string (matching Chrome getMessage)
  assert.equal(_('nonexistent_key_xyz'), '');

  // Test explicit setupI18n language argument overriding navigator
  restore = setMockNavigator({ languages: ['en-US'] });
  setupI18n('zh_tw');
  assert.equal(_('options_uiLocale'), '介面語言');
  setupI18n('en_us');
  assert.equal(_('options_uiLocale'), 'UI Language');
  restore();
  assert.equal(getMessage('nonexistent_key_xyz'), '');
});

test('setLocale dynamically switches locale and updates active translations', () => {
  // 1. Explicitly switch to zh_tw
  let restore = setMockNavigator({ languages: ['en-US'] });
  setLocale('zh_tw');
  assert.equal(getActiveLocale(), 'zh_tw');
  assert.equal(getLocalePreference(), 'zh_tw');
  assert.equal(_('options_uiLocale'), '介面語言');
  assert.equal(_('options_mouse'), '滑鼠');

  // 2. Explicitly switch to en_us
  setLocale('en_us');
  assert.equal(getActiveLocale(), 'en_us');
  assert.equal(getLocalePreference(), 'en_us');
  assert.equal(_('options_uiLocale'), 'UI Language');
  assert.equal(_('options_mouse'), 'Mouse');

  // 3. Switch to auto reverts to negotiated language
  setLocale('auto');
  assert.equal(getLocalePreference(), 'auto');
  assert.equal(getActiveLocale(), 'en_us');
  restore();

  restore = setMockNavigator({ languages: ['zh-TW'] });
  setLocale('auto');
  assert.equal(getLocalePreference(), 'auto');
  assert.equal(getActiveLocale(), 'zh_tw');
  assert.equal(_('options_mouse'), '滑鼠');
  restore();

  // 4. Normalization of locale strings (e.g. ZH-TW, EN-US)
  setLocale('ZH-TW');
  assert.equal(getActiveLocale(), 'zh_tw');
  assert.equal(getLocalePreference(), 'zh_tw');
  setLocale('EN_US');
  assert.equal(getActiveLocale(), 'en_us');
  assert.equal(getLocalePreference(), 'en_us');

  // 5. setupI18n with explicit locale
  setupI18n('zh_tw');
  assert.equal(getActiveLocale(), 'zh_tw');
  assert.equal(_('options_mouse'), '滑鼠');
});

test('SUPPORTED_LOCALES lists auto, zh_tw, and en_us', () => {
  assert.ok(Array.isArray(SUPPORTED_LOCALES));
  const values = SUPPORTED_LOCALES.map((l) => l.value);
  assert.deepEqual(values, ['auto', 'zh_tw', 'en_us']);
});

test('getMessage and _ support substitutions with [args] or single arg ($1, $2, ...)', () => {
  assert.equal(_, getMessage, '_ must be an alias of getMessage');

  en_US['__test_sub__'] = { message: 'Hello $1, welcome to $2!' };
  let restore = setMockNavigator({ languages: ['en-US'] });
  setupI18n();

  // Array of arguments: $1, $2
  assert.equal(
    _('__test_sub__', ['Alice', 'Wonderland']),
    'Hello Alice, welcome to Wonderland!'
  );
  assert.equal(
    getMessage('__test_sub__', ['Alice', 'Wonderland']),
    'Hello Alice, welcome to Wonderland!'
  );

  // Single string argument replaces $1
  assert.equal(
    _('__test_sub__', 'Bob'),
    'Hello Bob, welcome to $2!'
  );

  // Missing substitutions returns raw template
  assert.equal(_('__test_sub__'), 'Hello $1, welcome to $2!');

  delete en_US['__test_sub__'];
  restore();
});

test('en_US and zh_TW have identical translation keys', () => {
  const enKeys = Object.keys(en_US).sort();
  const zhKeys = Object.keys(zh_TW).sort();
  assert.deepEqual(enKeys, zhKeys, 'en_US and zh_TW keys must match exactly');
});

test('i18n message dictionaries maintain 100% key parity between en_US and zh_TW', () => {
  const enKeys = Object.keys(en_US).sort();
  const zhKeys = Object.keys(zh_TW).sort();

  const missingInZh = enKeys.filter((k) => !zhKeys.includes(k));
  const missingInEn = zhKeys.filter((k) => !enKeys.includes(k));

  assert.deepEqual(
    missingInZh,
    [],
    `Keys present in en_US but missing in zh_TW: ${missingInZh.join(', ')}`
  );
  assert.deepEqual(
    missingInEn,
    [],
    `Keys present in zh_TW but missing in en_US: ${missingInEn.join(', ')}`
  );

  // Validate every entry is an object and has a non-empty string or array message
  for (const key of enKeys) {
    assert.equal(typeof en_US[key], 'object', `en_US.${key} must be an object`);
    assert.equal(typeof zh_TW[key], 'object', `zh_TW.${key} must be an object`);
    assert.ok(en_US[key] !== null, `en_US.${key} must not be null`);
    assert.ok(zh_TW[key] !== null, `zh_TW.${key} must not be null`);
    assert.ok(!Array.isArray(en_US[key]), `en_US.${key} must not be an array`);
    assert.ok(!Array.isArray(zh_TW[key]), `zh_TW.${key} must not be an array`);
    assert.ok(Object.hasOwn(en_US[key], 'message'), `en_US.${key} must contain a "message" property`);
    assert.ok(Object.hasOwn(zh_TW[key], 'message'), `zh_TW.${key} must contain a "message" property`);

    const enMsg = en_US[key].message;
    const zhMsg = zh_TW[key].message;

    const isEnValid = typeof enMsg === 'string' ? enMsg.length > 0 : Array.isArray(enMsg) && enMsg.length > 0;
    const isZhValid = typeof zhMsg === 'string' ? zhMsg.length > 0 : Array.isArray(zhMsg) && zhMsg.length > 0;

    assert.ok(isEnValid, `en_US.${key} is empty`);
    assert.ok(isZhValid, `zh_TW.${key} is empty`);
    assert.equal(Array.isArray(enMsg), Array.isArray(zhMsg), `Mismatched message type for ${key}`);
  }
});

test('every key in locale JSONs maps to an object containing a "message" property', () => {
  for (const [localeName, dict] of Object.entries({ en_US, zh_TW })) {
    for (const [key, entry] of Object.entries(dict)) {
      assert.equal(
        typeof entry,
        'object',
        `${localeName}.${key} must be an object`
      );
      assert.notEqual(entry, null, `${localeName}.${key} must not be null`);
      assert.ok(
        !Array.isArray(entry),
        `${localeName}.${key} must be an object, not an array`
      );
      assert.ok(
        Object.hasOwn(entry, 'message'),
        `${localeName}.${key} must contain a "message" property`
      );
      assert.ok(
        typeof entry.message === 'string' || Array.isArray(entry.message),
        `${localeName}.${key}.message must be a string or string array`
      );
    }
  }
});

