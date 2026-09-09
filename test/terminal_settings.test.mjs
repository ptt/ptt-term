import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { COLOR_SCHEMES, applyColorScheme } from '../src/js/color_schemes.js';
import { termColors } from '../src/js/color_schemes.js';
import { DEFAULT_PREFS, readValuesWithDefault, parseOptionText } from '../src/js/pref.js';
import { TermKeyboard } from '../src/js/term_keyboard.js';
import { getAvailablePlugins, groupPlugins, PLUGIN_GROUPS } from '../src/plugins/index.js';

const PREF_MODAL_JS_PATH = fs.existsSync(path.resolve('src/components/Settings/PrefModal.js'))
  ? path.resolve('src/components/Settings/PrefModal.js')
  : path.resolve('src/components/ContextMenu/PrefModal.js');
const PREF_MODAL_CSS_PATH = fs.existsSync(path.resolve('src/components/Settings/PrefModal.css'))
  ? path.resolve('src/components/Settings/PrefModal.css')
  : path.resolve('src/components/ContextMenu/PrefModal.css');

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
  const prefModalCss = fs.readFileSync(
    PREF_MODAL_CSS_PATH,
    'utf-8'
  );
  assert.ok(
    prefModalCss.includes('grid-template-columns: repeat(8, 1fr)'),
    'ColorSchemePreview must display 8 colors per row in 2 rows'
  );
  assert.ok(
    prefModalSrc.includes('name="lineHeight"'),
    'Appearance tab must contain lineHeight selector'
  );

  // 5. Advanced tab contains backspaceKey and deleteKey selectors
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
    'options_enableVisualBell',
    'options_lineHeight',
    'options_backspaceKey',
    'options_deleteKey',
    'options_keyControlH',
    'options_keyControlQuestion',
    'options_keyEscapeSequence',
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
  assert.deepEqual(uiPluginIds, ['media_previewer', 'input_helper']);

  // Group 2: Taiwan BBS (easy reading, anti-idle, mouse browsing, live article helper)
  const bbsGroup = groups.find((g) => g.id === 'bbs');
  assert.ok(bbsGroup, 'Taiwan BBS group must exist');
  assert.equal(bbsGroup.title, 'Taiwan BBS');
  assert.equal(bbsGroup.titleKey, 'plugin_group_bbs');
  const bbsPluginIds = bbsGroup.plugins.map((p) => p.id);
  assert.deepEqual(bbsPluginIds, ['easy_reading', 'anti_idle', 'mouse_browsing', 'live_update']);

  // Group 3: Debug & Development (fps meter, debug hud, packet logger)
  const debugGroup = groups.find((g) => g.id === 'debug');
  assert.ok(debugGroup, 'Debug & Development group must exist');
  assert.equal(debugGroup.title, 'Debug & Development');
  assert.equal(debugGroup.titleKey, 'plugin_group_debug');
  const debugPluginIds = debugGroup.plugins.map((p) => p.id);
  assert.deepEqual(debugPluginIds, ['fps_meter', 'touch_debug_hud', 'conn_log']);

  // Verify all 9 plugins have their group attribute defined
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



