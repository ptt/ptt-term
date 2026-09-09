import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { COLOR_SCHEMES, applyColorScheme } from '../src/js/color_schemes.js';
import { termColors } from '../src/js/color_schemes.js';
import { DEFAULT_PREFS, readValuesWithDefault } from '../src/js/pref.js';

test('COLOR_SCHEMES defines all standard terminal color palettes with 16 colors each', () => {
  const expectedSchemes = [
    'default',
    'solarized-dark',
    'nord',
    'monokai',
    'dracula',
    'retro-amber',
    'retro-green',
  ];

  for (const name of expectedSchemes) {
    const scheme = COLOR_SCHEMES[name];
    assert.ok(scheme, `Scheme ${name} should be defined`);
    assert.equal(scheme.colors.length, 16, `Scheme ${name} must have 16 colors`);
    for (let i = 0; i < 16; i++) {
      assert.match(scheme.colors[i], /^#[0-9a-fA-F]{6}$/, `Color ${i} in ${name} must be hex`);
    }
  }
});

test('applyColorScheme updates termColors in-place and sets CSS variables', () => {
  const originalDoc = globalThis.document;
  try {
    const cssVars = {};
    const mockElement = {
      style: {
        setProperty: (k, v) => {
          cssVars[k] = v;
        },
        backgroundColor: '',
      },
    };
    globalThis.document = {
      documentElement: mockElement,
      body: mockElement,
      getElementById: (id) => (id === 'TermWindow' ? mockElement : null),
    };

    // 1. Apply solarized-dark
    applyColorScheme('solarized-dark');
    assert.equal(termColors[0], '#002b36');
    assert.equal(cssVars['--term-color-0'], '#002b36');
    assert.equal(cssVars['--term-bg'], '#002b36');
    assert.equal(mockElement.style.backgroundColor, '#002b36');

    // 2. Apply nord
    applyColorScheme('nord');
    assert.equal(termColors[0], '#2e3440');
    assert.equal(cssVars['--term-color-0'], '#2e3440');

    // 3. Restore default
    applyColorScheme('default');
    assert.equal(termColors[0], '#000000');
    assert.equal(termColors[15], '#ffffff');
    assert.equal(cssVars['--term-color-0'], '#000000');
  } finally {
    globalThis.document = originalDoc;
  }
});

test('DEFAULT_PREFS includes new terminal settings with sensible defaults', () => {
  assert.equal(DEFAULT_PREFS.warnBeforeClose, true);
  assert.equal(DEFAULT_PREFS.colorScheme, 'default');
  assert.equal(DEFAULT_PREFS.trimTrailingSpaces, true);
  assert.equal(DEFAULT_PREFS.rightClickAction, 'menu');
});

test('PrefModal source code includes Mouse tab, colorScheme selector, and notes', () => {
  const prefModalSrc = fs.readFileSync(
    path.resolve('src/components/ContextMenu/PrefModal.js'),
    'utf-8'
  );

  // 1. Nav list includes mouse tab
  assert.ok(
    prefModalSrc.includes('handleNavSelect("mouse")'),
    'PrefModal nav must include mouse tab'
  );

  // 2. Mouse tab fieldset renders rightClickAction, copyOnSelect, trimTrailingSpaces, supportMouseReporting
  assert.ok(
    prefModalSrc.includes('navActiveKey === "mouse"'),
    'PrefModal must contain mouse tab panel'
  );
  assert.ok(
    prefModalSrc.includes('name="rightClickAction"'),
    'Mouse tab must contain rightClickAction selector'
  );
  assert.ok(
    prefModalSrc.includes('name="trimTrailingSpaces"'),
    'Mouse tab must contain trimTrailingSpaces checkbox'
  );
  assert.ok(
    prefModalSrc.includes('name="supportMouseReporting"'),
    'Mouse tab must contain supportMouseReporting checkbox'
  );
  assert.ok(
    prefModalSrc.includes('options_supportMouseReporting_desc'),
    'Mouse tab must contain supportMouseReporting description note'
  );

  // 3. General tab contains warnBeforeClose
  assert.ok(
    prefModalSrc.includes('name="warnBeforeClose"'),
    'General tab must contain warnBeforeClose checkbox'
  );

  // 4. Appearance tab contains colorScheme selector and preview
  assert.ok(
    prefModalSrc.includes('name="colorScheme"'),
    'Appearance tab must contain colorScheme selector'
  );
  assert.ok(
    prefModalSrc.includes('PrefModal__ColorSchemePreview'),
    'Appearance tab must render colorScheme preview bar'
  );
  const prefModalCss = fs.readFileSync(
    path.resolve('src/components/ContextMenu/PrefModal.css'),
    'utf-8'
  );
  assert.ok(
    prefModalCss.includes('grid-template-columns: repeat(8, 1fr)'),
    'ColorSchemePreview must display 8 colors per row in 2 rows'
  );
});

test('ContextMenu handles rightClickAction paste and Shift override', () => {
  const contextMenuSrc = fs.readFileSync(
    path.resolve('src/components/ContextMenu/index.js'),
    'utf-8'
  );

  assert.ok(
    contextMenuSrc.includes('app.rightClickAction === "paste"'),
    'ContextMenu must check app.rightClickAction === "paste"'
  );
  assert.ok(
    contextMenuSrc.includes('!event.shiftKey'),
    'ContextMenu right-click paste must allow Shift key to open context menu'
  );
  assert.ok(
    contextMenuSrc.includes('app.doPaste()'),
    'ContextMenu right-click paste must call app.doPaste()'
  );
});

test('i18n files define all required translations for new settings', () => {
  const zhTW = fs.readFileSync(path.resolve('src/js/zh_TW_messages.js'), 'utf-8');
  const enUS = fs.readFileSync(path.resolve('src/js/en_US_messages.js'), 'utf-8');

  const requiredKeys = [
    'options_warnBeforeClose',
    'options_colorScheme',
    'options_colorScheme_default',
    'options_colorScheme_solarizedDark',
    'options_colorScheme_nord',
    'options_colorScheme_monokai',
    'options_colorScheme_dracula',
    'options_colorScheme_retroAmber',
    'options_colorScheme_retroGreen',
    'options_trimTrailingSpaces',
    'options_rightClickAction',
    'options_rightClickAction_menu',
    'options_rightClickAction_paste',
    'options_supportMouseReporting_desc',
  ];

  for (const key of requiredKeys) {
    assert.ok(zhTW.includes(key), `zh_TW must include ${key}`);
    assert.ok(enUS.includes(key), `en_US must include ${key}`);
  }

  // Exact note requested by user
  assert.ok(
    zhTW.includes('終端機只能送出滑鼠資訊，此功能仍需要伺服器端軟體支援，多數站台可能無反應。'),
    'zh_TW note text must match user request exactly'
  );
});
