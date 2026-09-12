import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { COLOR_SCHEMES, applyColorScheme, getContrastColor } from '../src/js/color_schemes.js';
import { termColors } from '../src/js/color_schemes.js';
import { DEFAULT_PREFS, readValuesWithDefault, parseOptionText } from '../src/js/pref.js';
import { TermKeyboard } from '../src/js/term_keyboard.js';
import { getAvailablePlugins, groupPlugins, PLUGIN_GROUPS } from '../src/plugins/index.js';
import {
  detectSite,
  detectClientType,
  detectClientMode,
  detectOS,
  detectOSVersion,
  detectBrowser,
  detectBrowserVersion,
  detectExtraSettings,
  buildBugReportUrl,
} from '../src/js/bug_report.js';

const PREF_MODAL_JS_PATH = fs.existsSync(path.resolve('src/components/Settings/PrefModal.js'))
  ? path.resolve('src/components/Settings/PrefModal.js')
  : path.resolve('src/components/ContextMenu/PrefModal.js');
const PREF_MODAL_CSS_PATH = fs.existsSync(path.resolve('src/components/Settings/PrefModal.css'))
  ? path.resolve('src/components/Settings/PrefModal.css')
  : path.resolve('src/components/ContextMenu/PrefModal.css');

test('COLOR_SCHEMES defines all standard terminal color palettes with 16 colors each', () => {
  const expectedSchemes = [
    'default',
    'pure-bw',
    'solarized-dark',
    'nord',
    'monokai',
    'dracula',
    'retro-amber',
    'retro-green',
    'custom',
  ];

  for (const name of expectedSchemes) {
    const scheme = COLOR_SCHEMES[name];
    assert.ok(scheme, `Scheme ${name} should be defined`);
    assert.equal(scheme.colors.length, 16, `Scheme ${name} must have 16 colors`);
    assert.match(scheme.defaultBg, /^#[0-9a-fA-F]{6}$/, `defaultBg in ${name} must be hex`);
    assert.match(scheme.defaultFg, /^#[0-9a-fA-F]{6}$/, `defaultFg in ${name} must be hex`);
    assert.match(scheme.defaultLink, /^#[0-9a-fA-F]{6}$/, `defaultLink in ${name} must be hex`);
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
    assert.equal(cssVars['--term-fg'], '#839496');
    assert.equal(cssVars['--term-link'], '#cb4b16');
    assert.equal(mockElement.style.backgroundColor, '#002b36');

    // 2. Apply nord
    applyColorScheme('nord');
    assert.equal(termColors[0], '#2e3440');
    assert.equal(cssVars['--term-color-0'], '#2e3440');
    assert.equal(cssVars['--term-bg'], '#2e3440');
    assert.equal(cssVars['--term-fg'], '#d8dee9');
    assert.equal(cssVars['--term-link'], '#d08770');

    // 3. Apply pure-bw (forcePlainText)
    let toggledClass = null;
    mockElement.classList = {
      toggle: (cls, state) => {
        toggledClass = { cls, state };
      },
    };
    applyColorScheme('pure-bw');
    assert.equal(termColors.forcePlainText, true);
    assert.equal(termColors[0], '#000000');
    assert.equal(cssVars['--term-fg-0'], '#c0c0c0');
    for (let i = 1; i < 16; i++) {
      assert.equal(termColors[i], '#c0c0c0');
      assert.equal(cssVars[`--term-fg-${i}`], '#c0c0c0');
    }
    assert.deepEqual(toggledClass, { cls: 'scheme-pure-bw', state: true });

    // 4. Restore default
    applyColorScheme('default');
    assert.equal(termColors.forcePlainText, false);
    assert.equal(termColors[0], '#000000');
    assert.equal(termColors[15], '#ffffff');
    assert.equal(cssVars['--term-color-0'], '#000000');
    assert.equal(cssVars['--term-bg'], '#000000');
    assert.equal(cssVars['--term-fg'], '#c0c0c0');
    assert.equal(cssVars['--term-link'], '#ff6600');
  } finally {
    globalThis.document = originalDoc;
  }
});

test('color.css scheme-pure-bw targets specific terminal background classes without clobbering .btn UI elements', () => {
  const colorCss = fs.readFileSync(
    path.resolve('src/css/color.css'),
    'utf-8'
  );
  assert.ok(
    !colorCss.includes('[class^="b"]') && !colorCss.includes('[class*=" b"]'),
    'color.css must not use broad [class^="b"] or [class*=" b"] selectors that clobber .btn background colors'
  );
  for (let i = 1; i <= 15; i++) {
    assert.ok(
      colorCss.includes(`.scheme-pure-bw .b${i}`) &&
        colorCss.includes(`.scheme-pure-bw .b${i}::before`) &&
        colorCss.includes(`.scheme-pure-bw .rb${i}::after`),
      `color.css must explicitly reset .b${i}, .b${i}::before, and .rb${i}::after in .scheme-pure-bw`
    );
  }
});

test('applyColorScheme supports custom scheme with customColors array', () => {
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

    const myCustomColors = [
      '#111111', '#222222', '#333333', '#444444', '#555555', '#666666', '#777777', '#888888',
      '#999999', '#aaaaaa', '#bbbbbb', '#cccccc', '#dddddd', '#eeeeee', '#f5f5f5', '#ffffff'
    ];

    applyColorScheme('custom', myCustomColors, '#050505', '#e0e0e0', '#123456', false, 50);
    assert.equal(termColors[0], '#111111');
    assert.equal(termColors[7], '#888888');
    assert.equal(termColors[15], '#ffffff');
    assert.equal(termColors.minimumContrast, 50);
    assert.equal(cssVars['--term-color-0'], '#111111');
    assert.equal(cssVars['--term-color-7'], '#888888');
    assert.equal(cssVars['--term-bg'], '#050505');
    assert.equal(cssVars['--term-fg'], '#e0e0e0');
    assert.equal(cssVars['--term-link'], '#123456');
    // Dark colors on dark bg (#050505) should be brightened in --term-fg-*
    assert.notEqual(cssVars['--term-fg-0'], '#111111');
  } finally {
    globalThis.document = originalDoc;
    applyColorScheme('default');
  }
});

test('getContrastColor adjusts foreground brightness to meet iTerm2-style minimum contrast', () => {
  // 0% contrast does nothing
  assert.equal(getContrastColor('#000080', '#000000', 0), '#000080');
  // High contrast already met does nothing
  assert.equal(getContrastColor('#ffffff', '#000000', 50), '#ffffff');
  // Dark blue (#000080) on black (#000000) with 45% contrast should brighten
  const brightenedBlue = getContrastColor('#000080', '#000000', 45);
  assert.notEqual(brightenedBlue, '#000080');
  assert.match(brightenedBlue, /^#[0-9a-f]{6}$/);
  // Yellow (#ffff00) on light gray (#c0c0c0) with 45% contrast should darken
  const darkenedYellow = getContrastColor('#ffff00', '#c0c0c0', 45);
  assert.notEqual(darkenedYellow, '#ffff00');
  assert.match(darkenedYellow, /^#[0-9a-f]{6}$/);
});

test('DEFAULT_PREFS includes new terminal settings with sensible defaults', () => {
  assert.equal(DEFAULT_PREFS.uiLocale, 'auto');
  assert.equal(DEFAULT_PREFS.warnBeforeClose, true);
  assert.equal(DEFAULT_PREFS.colorScheme, 'default');
  assert.equal(DEFAULT_PREFS.customDefaultBg, '#000000');
  assert.equal(DEFAULT_PREFS.customDefaultFg, '#c0c0c0');
  assert.equal(DEFAULT_PREFS.customDefaultLink, '#ff6600');
  assert.equal(DEFAULT_PREFS.minimumContrast, 0);
  assert.ok(Array.isArray(DEFAULT_PREFS.customColors));
  assert.equal(DEFAULT_PREFS.customColors.length, 16);
  assert.equal(DEFAULT_PREFS.trimTrailingSpaces, true);
  assert.equal(DEFAULT_PREFS.rightClickAction, 'menu');
  assert.equal(DEFAULT_PREFS.enableVisualBell, false);
  assert.equal(DEFAULT_PREFS.backspaceKey, 'control-h');
  assert.equal(DEFAULT_PREFS.deleteKey, 'escape-sequence');
  assert.equal(DEFAULT_PREFS.lineHeight, 1.0);
});

test('TermKeyboard maps Backspace and Delete keys dynamically based on settings', () => {
  const sent = [];
  const sender = (data) => sent.push(data);

  // 1. Default settings (backspace: control-h -> \b, delete: escape-sequence -> \x1b[3~)
  const kbDefault = new TermKeyboard(sender);
  assert.equal(kbDefault.getMappedKey('Backspace'), '\b');
  assert.equal(kbDefault.getMappedKey('Delete'), '\x1b[3~');

  kbDefault.sendKey('Backspace');
  assert.equal(sent.pop(), '\b');
  kbDefault.sendKey('Delete');
  assert.equal(sent.pop(), '\x1b[3~');

  // 2. Control-? (127 / \x7f) for Backspace
  const kbCtrlQuestion = new TermKeyboard(sender, null, {
    backspaceKey: 'control-?',
    deleteKey: 'control-?',
  });
  assert.equal(kbCtrlQuestion.getMappedKey('Backspace'), '\x7f');
  assert.equal(kbCtrlQuestion.getMappedKey('Delete'), '\x7f');

  kbCtrlQuestion.sendKey('Backspace');
  assert.equal(sent.pop(), '\x7f');
  kbCtrlQuestion.sendKey('Delete');
  assert.equal(sent.pop(), '\x7f');

  // 3. Control-H for Delete
  const kbCtrlHDelete = new TermKeyboard(sender, null, {
    deleteKey: 'control-h',
  });
  assert.equal(kbCtrlHDelete.getMappedKey('Delete'), '\b');
  kbCtrlHDelete.sendKey('Delete');
  assert.equal(sent.pop(), '\b');
});

test('PrefModal source code includes Mouse tab, colorScheme, visualBell, lineHeight, and key mappings', () => {
  const prefModalSrc = fs.readFileSync(
    PREF_MODAL_JS_PATH,
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

  // 3. General tab contains warnBeforeClose and enableVisualBell
  assert.ok(
    prefModalSrc.includes('name="warnBeforeClose"'),
    'General tab must contain warnBeforeClose checkbox'
  );
  assert.ok(
    prefModalSrc.includes('name="enableVisualBell"'),
    'General tab must contain enableVisualBell checkbox'
  );

  // 4. Appearance tab contains colorScheme and lineHeight
  assert.ok(
    prefModalSrc.includes('name="colorScheme"'),
    'Appearance tab must contain colorScheme selector'
  );
  assert.ok(
    prefModalSrc.includes('PrefModal__ColorSchemePreview'),
    'Appearance tab must render colorScheme preview bar'
  );
  assert.ok(
    prefModalSrc.includes('PrefModal__ColorDefaults'),
    'Appearance tab must render default background and foreground pickers'
  );
  const prefModalCss = fs.readFileSync(
    PREF_MODAL_CSS_PATH,
    'utf-8'
  );
  assert.ok(
    prefModalCss.includes('grid-template-columns: repeat(8, 1fr)'),
    'ColorSchemePreview must display 8 colors per row in 2 rows'
  );
  assert.ok(
    prefModalCss.indexOf('.PrefModal__ColorDefaultSwatch') >
      prefModalCss.indexOf('.PrefModal__ColorSwatch {'),
    '.PrefModal__ColorDefaultSwatch must be defined after .PrefModal__ColorSwatch so height: 22px overrides height: 100%'
  );
  assert.ok(
    prefModalSrc.includes('name="lineHeight"'),
    'Appearance tab must contain lineHeight selector'
  );

  // 5. Advanced tab contains uiLocale, backspaceKey and deleteKey selectors
  assert.ok(
    prefModalSrc.includes('name="uiLocale"'),
    'Advanced tab must contain uiLocale selector'
  );
  assert.ok(
    prefModalSrc.includes('name="backspaceKey"'),
    'Advanced tab must contain backspaceKey selector'
  );
  assert.ok(
    prefModalSrc.includes('name="deleteKey"'),
    'Advanced tab must contain deleteKey selector'
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

test('CSS contains visual bell animation on screenContainer and row line height support', () => {
  const mainCss = fs.readFileSync(path.resolve('src/css/main.css'), 'utf-8');
  assert.ok(mainCss.includes('@keyframes visual-bell-flash'), 'main.css must define visual-bell-flash animation');
  assert.ok(mainCss.includes('.visual-bell'), 'main.css must define visual-bell class');
  assert.ok(mainCss.includes('filter: invert(1)'), 'visual-bell must invert colors');
  assert.ok(mainCss.includes('line-height: var(--term-chh'), 'main.css rows must use --term-chh line-height');
});

test('i18n files define all required translations for new settings', () => {
  const zhTW = fs.readFileSync(path.resolve('src/_locales/zh_TW/messages.json'), 'utf-8');
  const enUS = fs.readFileSync(path.resolve('src/_locales/en/messages.json'), 'utf-8');

  const requiredKeys = [
    'options_warnBeforeClose',
    'options_colorScheme',
    'options_colorScheme_default',
    'options_colorScheme_pureBw',
    'options_colorScheme_solarizedDark',
    'options_colorScheme_nord',
    'options_colorScheme_monokai',
    'options_colorScheme_dracula',
    'options_colorScheme_retroAmber',
    'options_colorScheme_retroGreen',
    'options_colorScheme_defaultColors',
    'options_colorScheme_defaultBg',
    'options_colorScheme_defaultFg',
    'options_colorScheme_defaultLink',
    'options_minimumContrast',
    'options_minimumContrast_desc',
    'options_minimumContrast_off',
    'options_trimTrailingSpaces',
    'options_rightClickAction',
    'options_rightClickAction_menu',
    'options_rightClickAction_paste',
    'options_supportMouseReporting_desc',
    'options_enableVisualBell',
    'options_lineHeight',
    'options_backspaceKey',
    'options_deleteKey',
    'options_keyControlH',
    'options_keyControlQuestion',
    'options_keyEscapeSequence',
    'options_uiLocale',
    'options_locale_auto',
    'options_locale_zhTW',
    'options_locale_enUS',
    'plugin_group_ui',
    'plugin_group_bbs',
    'plugin_group_debug',
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

test('parseOptionText extracts option label and description from parentheses', () => {
  assert.deepEqual(parseOptionText('僅在背景時播放 (視窗不在前景)'), {
    label: '僅在背景時播放',
    desc: '視窗不在前景',
  });
  assert.deepEqual(parseOptionText('關閉 (靜音)'), {
    label: '關閉',
    desc: '靜音',
  });
  assert.deepEqual(parseOptionText('總是播放'), {
    label: '總是播放',
    desc: '',
  });
  assert.deepEqual(parseOptionText('1.0 (預設)'), {
    label: '1.0',
    desc: '預設',
  });
  assert.deepEqual(parseOptionText('Control-H (將送出 ^H (ASCII 8))'), {
    label: 'Control-H',
    desc: '將送出 ^H (ASCII 8)',
  });
  assert.deepEqual(parseOptionText('Control-? (將送出 ^? (ASCII 127))'), {
    label: 'Control-?',
    desc: '將送出 ^? (ASCII 127)',
  });
  assert.deepEqual(parseOptionText('標準跳脫字元序列 (將送出 ^[[3~ (ESC [ 3 ~))'), {
    label: '標準跳脫字元序列',
    desc: '將送出 ^[[3~ (ESC [ 3 ~)',
  });
  assert.deepEqual(parseOptionText('Control-H (Will send out ^H (ASCII 8))'), {
    label: 'Control-H',
    desc: 'Will send out ^H (ASCII 8)',
  });
  assert.deepEqual(parseOptionText('Control-? (Will send out ^? (ASCII 127))'), {
    label: 'Control-?',
    desc: 'Will send out ^? (ASCII 127)',
  });
  assert.deepEqual(parseOptionText('標準跳脫字元序列 (Will send out ^[[3~ (ESC [ 3 ~))'), {
    label: '標準跳脫字元序列',
    desc: 'Will send out ^[[3~ (ESC [ 3 ~)',
  });
  assert.deepEqual(parseOptionText('Standard ESC sequence (Will send out ^[[3~ (ESC [ 3 ~))'), {
    label: 'Standard ESC sequence',
    desc: 'Will send out ^[[3~ (ESC [ 3 ~)',
  });
  assert.deepEqual(parseOptionText('Control-H (^H, 8)'), {
    label: 'Control-H',
    desc: '^H, 8',
  });
  assert.deepEqual(parseOptionText('標準跳脫字元序列 (^[3~)'), {
    label: '標準跳脫字元序列',
    desc: '^[3~',
  });
  assert.deepEqual(parseOptionText('全形括號測試 （說明內容）'), {
    label: '全形括號測試',
    desc: '說明內容',
  });
  assert.deepEqual(parseOptionText(null), {
    label: null,
    desc: '',
  });
});

test('PrefModal source renders option descriptions beneath comboboxes and places supportMouseReporting note below checkbox', () => {
  const prefModalSrc = fs.readFileSync(
    PREF_MODAL_JS_PATH,
    'utf-8'
  );

  // supportMouseReporting note must NOT be inside .checkbox div
  const checkboxMatch = prefModalSrc.match(/<div className="checkbox">[\s\S]*?name="supportMouseReporting"[\s\S]*?<\/div>/);
  assert.ok(checkboxMatch, 'Must find supportMouseReporting checkbox div');
  assert.ok(
    !checkboxMatch[0].includes('options_supportMouseReporting_desc'),
    'options_supportMouseReporting_desc must NOT be inside checkbox div'
  );

  // PrefModal must use parseOptionText and renderOptionDesc
  assert.ok(
    prefModalSrc.includes('renderOptionDesc'),
    'PrefModal must use renderOptionDesc to render option notes beneath comboboxes'
  );
  assert.ok(
    prefModalSrc.includes('parseOptionText'),
    'PrefModal must use parseOptionText to strip parentheses from combo options'
  );
});

test('Extension list supports groups with colored Bands for categories (User Interface, Taiwan BBS, Debug & Development)', () => {
  const plugins = getAvailablePlugins();
  const groups = groupPlugins(plugins);

  assert.equal(groups.length, 3, 'Must have 3 groups');

  // Group 1: User Interface (image pre-reviewer, input helper)
  const uiGroup = groups.find((g) => g.id === 'ui');
  assert.ok(uiGroup, 'User Interface group must exist');
  assert.equal(uiGroup.title, 'User Interface');
  assert.equal(uiGroup.titleKey, 'plugin_group_ui');
  const uiPluginIds = uiGroup.plugins.map((p) => p.id);
  assert.deepEqual(uiPluginIds, ['media_previewer', 'input_helper', 'virtual_keyboard', 'pwa_prompt']);

  // Group 2: Taiwan BBS (easy reading, anti-idle, auto wrap, mouse browsing, live article helper)
  const bbsGroup = groups.find((g) => g.id === 'bbs');
  assert.ok(bbsGroup, 'Taiwan BBS group must exist');
  assert.equal(bbsGroup.title, 'Taiwan BBS');
  assert.equal(bbsGroup.titleKey, 'plugin_group_bbs');
  const bbsPluginIds = bbsGroup.plugins.map((p) => p.id);
  assert.deepEqual(bbsPluginIds, ['easy_reading', 'auto_login', 'auto_wrap', 'anti_idle', 'mouse_browsing', 'live_update']);

  // Group 3: Debug & Development (fps meter, debug hud, packet logger)
  const debugGroup = groups.find((g) => g.id === 'debug');
  assert.ok(debugGroup, 'Debug & Development group must exist');
  assert.equal(debugGroup.title, 'Debug & Development');
  assert.equal(debugGroup.titleKey, 'plugin_group_debug');
  const debugPluginIds = debugGroup.plugins.map((p) => p.id);
  assert.deepEqual(debugPluginIds, ['fps_meter', 'touch_debug_hud', 'conn_log']);

  // Verify all plugins have their group attribute defined
  assert.equal(plugins.length, 13);
  for (const p of plugins) {
    assert.ok(p.group, `Plugin ${p.id} must define a group`);
  }
});

test('PrefModal and PrefModal.css implement category bands with distinct colors and cohesive item accents', () => {
  const prefModalSrc = fs.readFileSync(
    PREF_MODAL_JS_PATH,
    'utf-8'
  );
  const prefModalCss = fs.readFileSync(
    PREF_MODAL_CSS_PATH,
    'utf-8'
  );

  // Band HTML and rendering
  assert.ok(prefModalSrc.includes('PrefModal__MacListBand'), 'PrefModal must render MacListBand');
  assert.ok(prefModalSrc.includes('groupPlugins(plugins)'), 'PrefModal must group plugins via groupPlugins');
  assert.ok(prefModalSrc.includes('PrefModal__MacListBandTitle'), 'PrefModal must render Band title');
  assert.ok(prefModalSrc.includes('PrefModal__MacListBandCount'), 'PrefModal must render item count badge');
  assert.ok(prefModalSrc.includes('renderGroupIcon'), 'PrefModal must render group icon');

  // CSS for bands and color variations
  assert.ok(prefModalCss.includes('.PrefModal__MacListBand'), 'PrefModal.css must style .PrefModal__MacListBand');
  assert.ok(prefModalCss.includes('.PrefModal__MacListBand--ui'), 'PrefModal.css must define UI band color variation');
  assert.ok(prefModalCss.includes('.PrefModal__MacListBand--bbs'), 'PrefModal.css must define BBS band color variation');
  assert.ok(prefModalCss.includes('.PrefModal__MacListBand--debug'), 'PrefModal.css must define Debug band color variation');

  // Item category accents
  assert.ok(prefModalCss.includes('.PrefModal__MacListItem--ui'), 'PrefModal.css must define UI item accent');
  assert.ok(prefModalCss.includes('.PrefModal__MacListItem--bbs'), 'PrefModal.css must define BBS item accent');
  assert.ok(prefModalCss.includes('.PrefModal__MacListItem--debug'), 'PrefModal.css must define Debug item accent');
});

test('PrefModal category bands can be clicked to collapse and expand extension groups', () => {
  const prefModalSrc = fs.readFileSync(PREF_MODAL_JS_PATH, 'utf-8');
  const prefModalCss = fs.readFileSync(PREF_MODAL_CSS_PATH, 'utf-8');

  // State and toggle handler
  assert.ok(
    prefModalSrc.includes('collapsedGroupIds: {}'),
    'PrefModal state must track collapsedGroupIds'
  );
  assert.ok(
    prefModalSrc.includes('handleToggleGroupCollapse'),
    'PrefModal must provide handleToggleGroupCollapse method'
  );

  // Band click and accessibility attributes
  assert.ok(
    prefModalSrc.includes('onClick={this.handleToggleGroupCollapse(group.id)}'),
    'PrefModal band must attach click handler to toggle collapse'
  );
  assert.ok(
    prefModalSrc.includes('aria-expanded={!isGroupCollapsed}'),
    'PrefModal band must set aria-expanded attribute'
  );
  assert.ok(
    prefModalSrc.includes('PrefModal__MacListBandChevron'),
    'PrefModal band must render disclosure chevron'
  );
  assert.ok(
    prefModalSrc.includes('PrefModal__MacListBand--collapsed'),
    'PrefModal band must apply collapsed class name when group is collapsed'
  );

  // CSS pointer, transitions and collapsed chevron rotation
  assert.ok(
    prefModalCss.includes('cursor: pointer;'),
    'PrefModal.css must set cursor: pointer on band'
  );
  assert.ok(
    prefModalCss.includes('.PrefModal__MacListBandChevron'),
    'PrefModal.css must style .PrefModal__MacListBandChevron'
  );
  assert.ok(
    prefModalCss.includes('.PrefModal__MacListBand--collapsed .PrefModal__MacListBandChevron'),
    'PrefModal.css must rotate chevron when band is collapsed'
  );
});

test('PrefModal pins tab legend header with close button and provides independently scrollable tab body', () => {
  const prefModalSrc = fs.readFileSync(PREF_MODAL_JS_PATH, 'utf-8');
  const prefModalCss = fs.readFileSync(PREF_MODAL_CSS_PATH, 'utf-8');

  // 1. Structure: TabLegend has className TabLegend and wraps tab header
  assert.ok(
    prefModalSrc.includes('className="TabLegend"'),
    'TabLegend must have TabLegend class'
  );

  // 2. All tabs render TabLegend followed by PrefModal__TabBody
  const tabBodyMatches = prefModalSrc.match(/className="PrefModal__TabBody"/g);
  assert.ok(
    tabBodyMatches && tabBodyMatches.length >= 7,
    'All settings tabs must wrap scrollable content inside PrefModal__TabBody'
  );

  // 3. CSS: Right column has overflow: hidden and flex column layout to keep header fixed
  assert.ok(
    prefModalCss.includes('.PrefModal__Grid__Col--right {') &&
      prefModalCss.includes('overflow: hidden;') &&
      prefModalCss.includes('flex-direction: column;'),
    'PrefModal__Grid__Col--right must be flex column with overflow hidden'
  );

  // 4. CSS: TabLegend header is pinned with flex-shrink: 0 and separator line
  assert.ok(
    prefModalCss.includes('flex-shrink: 0;') &&
      prefModalCss.includes('border-bottom: 1px solid'),
    'TabLegend header must be pinned with flex-shrink: 0 and separator line'
  );

  // 5. CSS: PrefModal__TabBody has overflow-y: auto and flex-grow: 1 so only content scrolls
  assert.ok(
    prefModalCss.includes('.PrefModal__TabBody {') &&
      prefModalCss.includes('overflow-y: auto;') &&
      prefModalCss.includes('flex-grow: 1;'),
    'PrefModal__TabBody must have flex-grow: 1 and overflow-y: auto'
  );
});

test('PrefModal and FontManager constrain widths with min-width: 0 and prevent subtitle scroll clipping', () => {
  const prefModalCss = fs.readFileSync(PREF_MODAL_CSS_PATH, 'utf-8');
  const fontManagerCss = fs.readFileSync(
    path.resolve('src/components/Settings/FontManager.css'),
    'utf-8'
  );

  // 1. fieldset and PrefModal__TabBody must have min-width: 0 to prevent browser default min-content expansion
  assert.ok(
    prefModalCss.includes('.PrefModal__Grid__Col--right fieldset') &&
      prefModalCss.includes('min-width: 0;'),
    'fieldset must have min-width: 0 to prevent browser min-content horizontal expansion'
  );
  assert.ok(
    prefModalCss.includes('.PrefModal__TabBody {') &&
      prefModalCss.includes('min-width: 0;'),
    'PrefModal__TabBody must have min-width: 0'
  );

  // 2. TabSubtitle must have non-negative margin-top so it is not clipped at top of scroll container
  assert.ok(
    prefModalCss.includes('.PrefModal__TabSubtitle {') &&
      prefModalCss.includes('margin: 0 0 14px;'),
    'PrefModal__TabSubtitle must not use negative margin-top to avoid being clipped on scroll to top'
  );

  // 3. FontManager enforces boundary constraints
  assert.ok(
    fontManagerCss.includes('.FontManager {') &&
      fontManagerCss.includes('min-width: 0;') &&
      fontManagerCss.includes('max-width: 100%;'),
    'FontManager must specify min-width: 0 and max-width: 100%'
  );
});

test('PrefModal supports landscape and short viewport mode with visible close button and dvh constraints', () => {
  const prefModalCss = fs.readFileSync(PREF_MODAL_CSS_PATH, 'utf-8');
  const prefModalSrc = fs.readFileSync(PREF_MODAL_JS_PATH, 'utf-8');

  // TabLegend is rendered as a div (not native legend) for reliable WebKit flex alignment
  assert.ok(
    prefModalSrc.includes('<div className="TabLegend">'),
    'TabLegend must render as div for cross-browser flex layout'
  );

  // PrefModal.css includes landscape / short-screen media query
  assert.ok(
    prefModalCss.includes('orientation: landscape') &&
      prefModalCss.includes('max-height: 600px'),
    'PrefModal.css must include orientation: landscape and max-height query'
  );

  // Uses dynamic viewport height (100dvh)
  assert.ok(
    prefModalCss.includes('100dvh'),
    'PrefModal.css must use 100dvh to prevent off-screen clipping on mobile Safari'
  );

  // Close button has circular touch target and distinct styling
  assert.ok(
    prefModalCss.includes('.TabLegend .close') &&
      prefModalCss.includes('border-radius: 50%'),
    'TabLegend close button must have circular touch target'
  );
});

test('PrefModal About tab renders Version & Source Code with distinct version line and repository links', () => {
  const prefModalSrc = fs.readFileSync(PREF_MODAL_JS_PATH, 'utf-8');
  const prefModalCss = fs.readFileSync(PREF_MODAL_CSS_PATH, 'utf-8');
  const zhTW = JSON.parse(fs.readFileSync(path.resolve('src/_locales/zh_TW/messages.json'), 'utf-8'));
  const enUS = JSON.parse(fs.readFileSync(path.resolve('src/_locales/en/messages.json'), 'utf-8'));

  // 1. Version & Source Code legend does not contain app name/version
  assert.ok(
    prefModalSrc.includes('<legend>{_("about_version_title")}</legend>'),
    'about_version_title must be in its own legend tag without app version'
  );

  // 2. App name and version are rendered on their own line with dedicated class
  assert.ok(
    prefModalSrc.includes('className="PrefModal__About__Version"'),
    'App version must have dedicated PrefModal__About__Version class'
  );
  assert.ok(
    prefModalSrc.includes('{APP.NAME} v{APP.VERSION}'),
    'App version line must render {APP.NAME} v{APP.VERSION}'
  );

  // 3. CSS styles .PrefModal__About__Version with normal bold text
  assert.ok(
    prefModalCss.includes('.PrefModal__About__Version {') &&
      prefModalCss.includes('font-size: 13px;') &&
      prefModalCss.includes('font-weight: 600;'),
    'PrefModal.css must style .PrefModal__About__Version with 13px bold text'
  );

  // 4. i18n strings for Plan A (Repositories)
  assert.strictEqual(zhTW.about_version_title.message, '版本與原始碼');
  assert.strictEqual(enUS.about_version_title.message, 'Version & Source Code');

  assert.ok(zhTW.about_version_content.message[0].includes('目前專案庫：'));
  assert.ok(zhTW.about_version_content.message[1].includes('前代專案庫：'));
  assert.ok(zhTW.about_version_content.message[2].includes('創始專案庫：'));
  assert.ok(zhTW.about_version_content.message[2].includes('(webapp12 2015/06)'));

  assert.ok(enUS.about_version_content.message[0].includes('Current repository:'));
  assert.ok(enUS.about_version_content.message[1].includes('Previous fork:'));
  assert.ok(enUS.about_version_content.message[2].includes('Original repository:'));
  assert.ok(enUS.about_version_content.message[2].includes('(webapp12 2015/06)'));

  assert.ok(zhTW.about_version_content.message[0].includes('link_current_repo'));
  assert.ok(enUS.about_version_content.message[0].includes('link_current_repo'));
  assert.ok(zhTW.about_version_upstream.message.includes('分支來源：'));
  assert.ok(enUS.about_version_upstream.message.includes('Forked from:'));
  assert.ok(prefModalSrc.includes('renderVersionList'), 'PrefModal.js must define renderVersionList');
  assert.ok(prefModalSrc.includes('link_current_repo'), 'PrefModal.js must define link_current_repo');

  // 5. Commit hash and build date support
  const viteConfigSrc = fs.readFileSync(path.resolve('vite.config.js'), 'utf-8');
  assert.ok(viteConfigSrc.includes("'APP.COMMIT_HASH'"), 'vite.config.js must define APP.COMMIT_HASH');
  assert.ok(viteConfigSrc.includes("'APP.BUILD_DATE'"), 'vite.config.js must define APP.BUILD_DATE');
  assert.ok(prefModalSrc.includes('PrefModal__About__Build'), 'PrefModal.js must render commit hash and build date');

  // 6. Bug report issue template uses Build Info instead of version
  const bugReportTemplate = fs.readFileSync(
    path.resolve('.github/ISSUE_TEMPLATE/bug_report.yml'),
    'utf-8'
  );
  assert.ok(bugReportTemplate.includes('id: build-info'), 'bug_report.yml must ask for build-info');
  assert.ok(
    bugReportTemplate.includes('Build: xxxxxxxx YYYY-MM-DD'),
    'bug_report.yml must instruct how to find build info'
  );
  const bugReportSrc = fs.readFileSync(
    path.resolve('src/js/bug_report.js'),
    'utf-8'
  );
  assert.ok(
    prefModalSrc.includes('buildBugReportUrl') && bugReportSrc.includes('bug_report.yml'),
    'PrefModal About tab must link to bug report template'
  );
  assert.ok(
    bugReportSrc.includes('occurrence-date') &&
      bugReportSrc.includes('build-info') &&
      bugReportSrc.includes('os-version') &&
      bugReportSrc.includes('browser-version') &&
      bugReportSrc.includes('env-info'),
    'PrefModal must prefill occurrence-date, build-info, os-version, browser-version, and env-info in bug report url'
  );
  assert.ok(
    bugReportSrc.includes('navigator.userAgent') || bugReportSrc.includes('nav.userAgent'),
    'PrefModal must include User Agent in environment diagnostics'
  );
  assert.ok(
    bugReportSrc.includes('Terminal Size:'),
    'PrefModal must include Terminal Size diagnostics in env-info'
  );
  assert.ok(
    bugReportTemplate.includes('id: env-info'),
    'bug_report.yml must provide env-info textarea'
  );
  assert.ok(
    bugReportTemplate.includes('id: render-engine-type'),
    'bug_report.yml must provide render-engine-type dropdown'
  );
  assert.ok(
    bugReportTemplate.includes('id: term-size-mode'),
    'bug_report.yml must provide term-size-mode dropdown'
  );
  assert.ok(
    bugReportTemplate.includes('fontFitWindowWidth'),
    'bug_report.yml must include fontFitWindowWidth in options'
  );
  assert.ok(
    prefModalSrc.includes('<select') &&
      prefModalSrc.includes('name="useCanvasEngine"'),
    'PrefModal must render useCanvasEngine as a select dropdown'
  );
  assert.ok(
    prefModalSrc.indexOf('id="useCanvasEngine"') < prefModalSrc.indexOf('id="uiLocale"'),
    'Render engine option must appear before UI language option'
  );
  assert.ok(
    zhTW.options_renderEngine?.message &&
      zhTW.options_renderEngineCanvas?.message &&
      zhTW.options_renderEngineDOM?.message,
    'zh_TW must have render engine translations'
  );
  assert.ok(
    enUS.options_renderEngine?.message &&
      enUS.options_renderEngineCanvas?.message &&
      enUS.options_renderEngineDOM?.message,
    'en must have render engine translations'
  );
  assert.ok(
    prefModalSrc.includes('PrefModal__About__BugReportBtn'),
    'PrefModal About tab must render bug report link as a button'
  );
  assert.strictEqual(zhTW.about_bug_report.message, '問題回報');
  assert.strictEqual(enUS.about_bug_report.message, 'Bug Report');
});

test('NativeDialog captures Escape keydown to prevent unhandled alert beeps', () => {
  const nativeDialogSrc = fs.readFileSync(
    path.resolve('src/components/NativeDialog.js'),
    'utf-8'
  );
  assert.ok(
    nativeDialogSrc.includes('handleGlobalKeyDown'),
    'NativeDialog must define handleGlobalKeyDown'
  );
  assert.ok(
    nativeDialogSrc.includes('attachGlobalEscape') &&
      nativeDialogSrc.includes('detachGlobalEscape'),
    'NativeDialog must attach and detach global escape listeners'
  );
  assert.ok(
    nativeDialogSrc.includes('addEventListener("keydown", this.handleGlobalKeyDown, true)'),
    'NativeDialog must listen to keydown in capture phase'
  );
  assert.ok(
    nativeDialogSrc.includes('e.stopPropagation()') &&
      nativeDialogSrc.includes('e.preventDefault()'),
    'NativeDialog must preventDefault and stopPropagation on Escape keydown'
  );
});

test('ContextMenu and App do not send ^L on settings close and only switch EasyReading if changed', () => {
  const appSrc = fs.readFileSync(
    path.resolve('src/js/app.js'),
    'utf-8'
  );
  const contextMenuSrc = fs.readFileSync(
    path.resolve('src/components/ContextMenu/index.js'),
    'utf-8'
  );

  // App.switchToEasyReadingMode must not send ^L
  const switchFnMatch = appSrc.match(/switchToEasyReadingMode\([^)]*\)\s*\{([^}]+)\}/);
  assert.ok(switchFnMatch, 'App must define switchToEasyReadingMode');
  assert.ok(
    !switchFnMatch[1].includes("send(unescapeStr('^L'))") &&
      !switchFnMatch[1].includes("send('^L')"),
    'switchToEasyReadingMode must not send ^L'
  );

  // ContextMenu onPrefSaveImpl checks whether enableEasyReading changed
  assert.ok(
    contextMenuSrc.includes('prevEnableEasyReading !== nextEnableEasyReading'),
    'ContextMenu must only switch easy reading mode if enableEasyReading changed'
  );
});

test('Bug report helper detects site, client, OS, browser, settings, and builds URL with individual form fields', () => {
  // 1. Site detection
  assert.equal(detectSite({ connectedUrl: { hostname: 'ws.ptt.cc' } }), 'term.ptt.cc (PTT)');
  assert.equal(detectSite({ connectedUrl: { hostname: 'ws.ptt2.cc' } }), 'term.ptt2.cc (PTT2)');
  assert.equal(detectSite({ site: { name: 'ptt2' } }), 'term.ptt2.cc (PTT2)');
  assert.equal(detectSite(null, { location: { hostname: 'term.ptt.cc' } }), 'term.ptt.cc (PTT)');
  assert.equal(detectSite(null, { location: { hostname: 'term.ptt2.cc' } }), 'term.ptt2.cc (PTT2)');
  assert.equal(detectSite(null, { location: { hostname: 'localhost' } }), '本機開發測試 (localhost / 自架)');
  assert.equal(detectSite(null, { location: { hostname: '127.0.0.1' } }), '本機開發測試 (localhost / 自架)');
  assert.equal(detectSite(null, { location: { hostname: 'hungte.c.googlers.com' } }), '本機開發測試 (localhost / 自架)');
  assert.equal(detectSite(null, { location: { hostname: 'custom-bbs.example.com' } }), '其他（請在補充資訊說明）');

  // 2. Client type detection
  assert.equal(
    detectClientType({ matchMedia: (query) => ({ matches: query.includes('standalone') }) }),
    'PWA（已安裝成獨立 App 或桌面/手機「加入主畫面」）'
  );
  assert.equal(
    detectClientType({ navigator: { standalone: true } }),
    'PWA（已安裝成獨立 App 或桌面/手機「加入主畫面」）'
  );
  assert.equal(
    detectClientType({}),
    'Web（一般瀏覽器分頁內使用）'
  );

  // 3. Client mode detection
  assert.equal(detectClientMode(null, true), 'Mobile mode（行動版模式 / 觸控介面）');
  assert.equal(detectClientMode({ isMobileLayout: () => true }, false), 'Mobile mode（行動版模式 / 觸控介面）');
  assert.equal(detectClientMode({ isMobileDevice: () => true }, false), 'Mobile mode（行動版模式 / 觸控介面）');
  assert.equal(detectClientMode({ isMobileLayout: () => false, isMobileDevice: () => false }, false), 'Desktop mode（電腦版模式）');

  // 4. OS and OS version detection
  const macNav = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15' };
  assert.equal(detectOS(macNav), 'macOS');
  assert.equal(detectOSVersion(macNav), 'macOS 14.5');

  const winNav = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
  assert.equal(detectOS(winNav), 'Windows');
  assert.equal(detectOSVersion(winNav), 'Windows 10 / 11 (NT 10.0)');

  const androidNav = { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36' };
  assert.equal(detectOS(androidNav), 'Android');
  assert.equal(detectOSVersion(androidNav), 'Android 14');

  const iosNav = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15' };
  assert.equal(detectOS(iosNav), 'iOS');
  assert.equal(detectOSVersion(iosNav), 'iOS 17.5');

  const ipadNav = {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
    maxTouchPoints: 5,
  };
  assert.equal(detectOS(ipadNav), 'iPadOS');

  const crosNav = { userAgent: 'Mozilla/5.0 (X11; CrOS x86_64 15886.44.0) AppleWebKit/537.36' };
  assert.equal(detectOS(crosNav), 'ChromeOS');
  assert.equal(detectOSVersion(crosNav), 'ChromeOS 15886.44.0');

  const linuxNav = { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' };
  assert.equal(detectOS(linuxNav), 'Linux');

  // 5. Browser and browser version detection
  const chromeNav = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0.6613.119 Safari/537.36' };
  assert.equal(detectBrowser(chromeNav), 'Google Chrome');
  assert.equal(detectBrowserVersion(chromeNav), 'Chrome 128.0.6613.119');

  const edgeNav = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36 Edg/128.0.2792.79' };
  assert.equal(detectBrowser(edgeNav), 'Microsoft Edge');
  assert.equal(detectBrowserVersion(edgeNav), 'Edge 128.0.2792.79');

  const safariNav = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15' };
  assert.equal(detectBrowser(safariNav), 'Apple Safari');
  assert.equal(detectBrowserVersion(safariNav), 'Safari 17.5');

  const firefoxNav = { userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0' };
  assert.equal(detectBrowser(firefoxNav), 'Mozilla Firefox');
  assert.equal(detectBrowserVersion(firefoxNav), 'Firefox 130.0');

  const braveNav = { userAgent: 'Mozilla/5.0 Chrome/128.0.0.0 Safari/537.36', brave: {} };
  assert.equal(detectBrowser(braveNav), 'Brave');
  assert.equal(detectBrowserVersion(braveNav), 'Brave (Chromium 128.0.0.0)');

  const kiwiNav = { userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/124.0.0.0 Kiwi/124.0.0.0' };
  assert.equal(detectBrowser(kiwiNav), 'Kiwi Browser');
  assert.equal(detectBrowserVersion(kiwiNav), 'Kiwi 124.0.0.0');

  // 6. Extra settings checkboxes indices
  assert.deepEqual(detectExtraSettings({
    termSizeMode: 'max-font-size',
    fontFitWindowWidth: false,
    cursorStyle: 'blink',
    smoothAnsiArt: false,
    fontFamily: '',
    colorScheme: 'default',
    enableVirtualKeyboard: false,
  }), []);

  assert.deepEqual(detectExtraSettings({
    termSizeMode: 'fixed-term-size',
    fontFitWindowWidth: true,
    cursorStyle: 'block',
    smoothAnsiArt: true,
    fontFamily: 'Noto Sans Mono',
    colorScheme: 'nord',
    enableVirtualKeyboard: true,
  }), [0, 1, 2, 3, 4, 5, 6]);

  // 7. buildBugReportUrl integration
  const url = buildBugReportUrl({
    app: { connectedUrl: { hostname: 'ws.ptt.cc' } },
    isTouch: false,
    values: {
      useCanvasEngine: true,
      termSizeMode: 'fixed-term-size',
      fontFitWindowWidth: true,
      cursorStyle: 'underline',
      smoothAnsiArt: true,
      colorScheme: 'monokai',
      fontFamily: 'monospace',
      enableVirtualKeyboard: true,
      termSize: { cols: 80, rows: 24 },
    },
    win: {
      location: { origin: 'https://term.ptt.cc', hostname: 'term.ptt.cc' },
      innerWidth: 1920,
      innerHeight: 1080,
      devicePixelRatio: 2,
      screen: { width: 1920, height: 1080 },
    },
    nav: chromeNav,
    appInfo: {
      COMMIT_HASH: 'abcdef12',
      BUILD_DATE: '2026-09-11',
      GITHUB_REPOSITORY: 'ptt/ptt-term',
    },
  });

  const parsedUrl = new URL(url);
  assert.equal(parsedUrl.searchParams.get('template'), 'bug_report.yml');
  assert.equal(parsedUrl.searchParams.get('build-info'), 'Build: abcdef12 2026-09-11');
  assert.equal(parsedUrl.searchParams.get('os-version'), 'macOS 10.15.7');
  assert.equal(parsedUrl.searchParams.get('browser-version'), 'Chrome 128.0.6613.119');
  // Dropdowns and checkboxes are not passed as query parameters because GitHub Issue Forms
  // web frontend does not prefill them; their diagnostics are in env-info instead.
  assert.equal(parsedUrl.searchParams.has('site'), false);
  assert.equal(parsedUrl.searchParams.has('client-type'), false);
  assert.equal(parsedUrl.searchParams.has('client-mode'), false);
  assert.equal(parsedUrl.searchParams.has('os'), false);
  assert.equal(parsedUrl.searchParams.has('browser'), false);
  assert.equal(parsedUrl.searchParams.has('render-engine-type'), false);
  assert.equal(parsedUrl.searchParams.has('term-size-mode'), false);
  assert.equal(parsedUrl.searchParams.has('extra-settings'), false);
  assert.ok(parsedUrl.searchParams.get('env-info').includes('Site: https://term.ptt.cc'));
  assert.ok(parsedUrl.searchParams.get('env-info').includes('Render Engine Type: Canvas Engine'));
  assert.ok(parsedUrl.searchParams.get('env-info').includes('fontFitWindowWidth=true'));
});

test('applyColorScheme updates .main element and meta theme-color', () => {
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
    const mainElement = {
      style: {
        backgroundColor: '',
      },
    };
    let metaThemeContent = '';
    const mockMeta = {
      setAttribute: (name, val) => {
        if (name === 'content') metaThemeContent = val;
      },
    };

    globalThis.document = {
      documentElement: mockElement,
      body: mockElement,
      getElementById: (id) => (id === 'TermWindow' ? mockElement : null),
      querySelectorAll: (sel) => (sel === '.main' ? [mainElement] : []),
      querySelector: (sel) => (sel === 'meta[name="theme-color"]' ? mockMeta : null),
    };

    applyColorScheme('dracula');
    assert.equal(mockElement.style.backgroundColor, '#282a36');
    assert.equal(mainElement.style.backgroundColor, '#282a36');
    assert.equal(metaThemeContent, '#282a36');
  } finally {
    globalThis.document = originalDoc;
    applyColorScheme('default');
  }
});

test('main.css and easy reading use dynamic default background variables', () => {
  const mainCss = fs.readFileSync(path.resolve('src/css/main.css'), 'utf-8');
  assert.ok(
    mainCss.includes('.main {\n  font-family:\n    MingLiu, SymMingLiu, "Noto Sans Mono CJK TC", "PingFang TC", monospace;\n  font-size: 26px;\n  line-height: 100%;\n  margin-top: 0px;\n  margin-left: 0px;\n  margin-right: 0px;\n  margin-bottom: 0px;\n  user-select: text;\n  background-color: var(--term-bg, var(--term-color-0, black));'),
    '.main must use var(--term-bg, var(--term-color-0, black))'
  );
  assert.ok(
    mainCss.includes('#easyReadingReplyRow {\n  position: absolute;\n  bottom: 0;\n  left: 0;\n  right: 0;\n  height: 1.2em;\n  display: none;\n  overflow: hidden;\n  user-select: none;\n  background-color: var(--term-bg, var(--term-color-0, black));'),
    '#easyReadingReplyRow must use var(--term-bg, var(--term-color-0, black))'
  );
  assert.ok(
    mainCss.includes('body {\n  width: 100%;\n  height: 100%;\n  color: white;\n  /* background-color: #101010; */\n  background-color: var(--term-bg, var(--term-color-0, black));'),
    'body must use var(--term-bg, var(--term-color-0, black))'
  );

  const canvasScreenSrc = fs.readFileSync(
    path.resolve('src/components/Canvas/CanvasScreen.js'),
    'utf-8'
  );
  assert.ok(
    canvasScreenSrc.includes('this.props.colorScheme !== prevProps.colorScheme'),
    'CanvasScreen layoutOrStyleChanged must check colorScheme'
  );
  assert.ok(
    canvasScreenSrc.includes('this.props.defaultBg !== prevProps.defaultBg'),
    'CanvasScreen layoutOrStyleChanged must check defaultBg'
  );

  const termViewSrc = fs.readFileSync(
    path.resolve('src/js/term_view.js'),
    'utf-8'
  );
  assert.ok(
    termViewSrc.includes('defaultBg: termColors.defaultBg || termDefaultBg'),
    'TermView must pass defaultBg to renderScreen'
  );
});
