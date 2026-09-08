import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PREFS,
  PREF_STORAGE_KEY,
  getDefaultPrefs,
  readValuesWithDefault,
  writeValues,
  updatePrefs,
  updatePref,
} from '../src/js/pref.js';

class MockLocalStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

test('getDefaultPrefs returns default preferences with cloned termSize', () => {
  const prefs = getDefaultPrefs();
  assert.equal(prefs.enablePicPreview, true);
  assert.equal(prefs.fontSize, 24);
  assert.equal(prefs.smoothAnsiArt, true);
  assert.deepEqual(prefs.termSize, { cols: 80, rows: 24 });

  // Mutating the returned termSize must not mutate DEFAULT_PREFS
  prefs.termSize.cols = 132;
  assert.equal(DEFAULT_PREFS.termSize.cols, 80);
});

test('readValuesWithDefault returns defaults when localStorage is empty or unavailable', () => {
  const originalWindow = globalThis.window;
  try {
    // 1. window is undefined
    delete globalThis.window;
    assert.deepEqual(readValuesWithDefault(), getDefaultPrefs());

    // 2. window exists but localStorage is empty
    globalThis.window = { localStorage: new MockLocalStorage() };
    assert.deepEqual(readValuesWithDefault(), getDefaultPrefs());
  } finally {
    globalThis.window = originalWindow;
  }
});

test('readValuesWithDefault merges saved values with defaults', () => {
  const originalWindow = globalThis.window;
  try {
    const mockStorage = new MockLocalStorage();
    globalThis.window = { localStorage: mockStorage };

    mockStorage.setItem(
      PREF_STORAGE_KEY,
      JSON.stringify({
        values: {
          fontSize: 28,
          useMouseBrowsing: true,
          antiIdleTime: 60,
        },
      })
    );

    const prefs = readValuesWithDefault();
    assert.equal(prefs.fontSize, 28);
    assert.equal(prefs.useMouseBrowsing, true);
    assert.equal(prefs.antiIdleTime, 60);
    // Unchanged keys keep default values
    assert.equal(prefs.enablePicPreview, DEFAULT_PREFS.enablePicPreview);
    assert.deepEqual(prefs.termSize, DEFAULT_PREFS.termSize);
  } finally {
    globalThis.window = originalWindow;
  }
});

test('readValuesWithDefault preserves partial termSize configuration', () => {
  const originalWindow = globalThis.window;
  try {
    const mockStorage = new MockLocalStorage();
    globalThis.window = { localStorage: mockStorage };

    mockStorage.setItem(
      PREF_STORAGE_KEY,
      JSON.stringify({
        values: {
          termSize: { cols: 120 },
        },
      })
    );

    const prefs = readValuesWithDefault();
    assert.equal(prefs.termSize.cols, 120);
    assert.equal(prefs.termSize.rows, 24); // default preserved
  } finally {
    globalThis.window = originalWindow;
  }
});


test('readValuesWithDefault migrates legacy maxFontSize and resets invalid fontSize 999', () => {
  const originalWindow = globalThis.window;
  try {
    const mockStorage = new MockLocalStorage();
    globalThis.window = { localStorage: mockStorage };

    // Case 1: fontSize 999 reset to default
    mockStorage.setItem(
      PREF_STORAGE_KEY,
      JSON.stringify({
        values: {
          fontSize: 999,
          termSizeMode: 'max-font-size',
        },
      })
    );
    let prefs = readValuesWithDefault();
    assert.equal(prefs.fontSize, 24);

    // Case 2: max-font-size inherits custom fontSize when maxFontSize is undefined
    mockStorage.setItem(
      PREF_STORAGE_KEY,
      JSON.stringify({
        values: {
          fontSize: 36,
          termSizeMode: 'max-font-size',
        },
      })
    );
    prefs = readValuesWithDefault();
    assert.equal(prefs.fontSize, 36);
    assert.equal(prefs.maxFontSize, 36);
  } finally {
    globalThis.window = originalWindow;
  }
});

test('readValuesWithDefault gracefully recovers from corrupted JSON in localStorage', () => {
  const originalWindow = globalThis.window;
  try {
    const mockStorage = new MockLocalStorage();
    globalThis.window = { localStorage: mockStorage };

    mockStorage.setItem(PREF_STORAGE_KEY, 'invalid-json{{{');
    const prefs = readValuesWithDefault();
    assert.deepEqual(prefs, getDefaultPrefs());
  } finally {
    globalThis.window = originalWindow;
  }
});

test('writeValues serializes values object into localStorage', () => {
  const originalWindow = globalThis.window;
  try {
    const mockStorage = new MockLocalStorage();
    globalThis.window = { localStorage: mockStorage };

    const customValues = { fontSize: 30, lineWrap: 80 };
    const returned = writeValues(customValues);
    assert.equal(returned, customValues);

    const raw = mockStorage.getItem(PREF_STORAGE_KEY);
    assert.ok(raw);
    const parsed = JSON.parse(raw);
    assert.deepEqual(parsed.values, customValues);
  } finally {
    globalThis.window = originalWindow;
  }
});

test('updatePrefs patches existing preferences and preserves other keys', () => {
  const originalWindow = globalThis.window;
  try {
    const mockStorage = new MockLocalStorage();
    globalThis.window = { localStorage: mockStorage };

    writeValues({ fontSize: 20, showFps: false });

    const updated = updatePrefs({ showFps: true, copyOnSelect: true });
    assert.deepEqual(updated, {
      fontSize: 20,
      showFps: true,
      copyOnSelect: true,
    });

    const parsed = JSON.parse(mockStorage.getItem(PREF_STORAGE_KEY));
    assert.deepEqual(parsed.values, {
      fontSize: 20,
      showFps: true,
      copyOnSelect: true,
    });
  } finally {
    globalThis.window = originalWindow;
  }
});

test('updatePref patches a single preference key', () => {
  const originalWindow = globalThis.window;
  try {
    const mockStorage = new MockLocalStorage();
    globalThis.window = { localStorage: mockStorage };

    writeValues({ antiIdleTime: 0 });
    updatePref('antiIdleTime', 120);

    const parsed = JSON.parse(mockStorage.getItem(PREF_STORAGE_KEY));
    assert.equal(parsed.values.antiIdleTime, 120);
  } finally {
    globalThis.window = originalWindow;
  }
});

test('enableBell defaults to always and preserves string values', () => {
  const originalWindow = globalThis.window;
  try {
    const mockStorage = new MockLocalStorage();
    globalThis.window = { localStorage: mockStorage };

    // 1. Default value
    const defaultPrefs = readValuesWithDefault();
    assert.equal(defaultPrefs.enableBell, 'always');

    // 2. Explicit string values preserved
    mockStorage.setItem(
      PREF_STORAGE_KEY,
      JSON.stringify({ values: { enableBell: 'background' } })
    );
    assert.equal(readValuesWithDefault().enableBell, 'background');

    mockStorage.setItem(
      PREF_STORAGE_KEY,
      JSON.stringify({ values: { enableBell: 'off' } })
    );
    assert.equal(readValuesWithDefault().enableBell, 'off');
  } finally {
    globalThis.window = originalWindow;
  }
});
