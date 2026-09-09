import { test } from 'node:test';
import assert from 'node:assert/strict';
import { i18n, setupI18n, getLang } from '../src/js/i18n.js';
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
});

test('setupI18n and i18n resolve translations for current locale', () => {
  // Test zh_tw
  let restore = setMockNavigator({ languages: ['zh-TW'] });
  setupI18n();
  assert.equal(i18n('appName'), 'PTT Term');
  assert.equal(i18n('options_mouse'), '滑鼠');
  restore();

  // Test en_us
  restore = setMockNavigator({ languages: ['en-US'] });
  setupI18n();
  assert.equal(i18n('options_mouse'), 'Mouse');
  restore();

  // Missing key
  assert.equal(i18n('nonexistent_key_xyz'), undefined);
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

  // Validate every entry has a non-empty string or array message
  for (const key of enKeys) {
    const enMsg = en_US[key].message;
    const zhMsg = zh_TW[key].message;

    const isEnValid = typeof enMsg === 'string' ? enMsg.length > 0 : Array.isArray(enMsg) && enMsg.length > 0;
    const isZhValid = typeof zhMsg === 'string' ? zhMsg.length > 0 : Array.isArray(zhMsg) && zhMsg.length > 0;

    assert.ok(isEnValid, `en_US.${key} is empty`);
    assert.ok(isZhValid, `zh_TW.${key} is empty`);
    assert.equal(Array.isArray(enMsg), Array.isArray(zhMsg), `Mismatched message type for ${key}`);
  }
});
