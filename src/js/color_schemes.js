export const termColors = [
  // dark
  '#000000', // black
  '#800000', // red
  '#008000', // green
  '#808000', // yellow
  '#000080', // blue
  '#800080', // magenta
  '#008080', // cyan
  '#c0c0c0', // light gray
  // bright
  '#808080', // gray
  '#ff0000', // red
  '#00ff00', // green
  '#ffff00', // yellow
  '#0000ff', // blue
  '#ff00ff', // magenta
  '#00ffff', // cyan
  '#ffffff'  // white
];

export const termInvColors = [
  // dark
  '#FFFFFF', // black
  '#7FFFFF', // red
  '#FF7FFF', // green
  '#7F7FFF', // yellow
  '#FFFF7F', // blue
  '#7FFF7F', // magenta
  '#FF7F7F', // cyan
  '#3F3F3F', // light gray
  // bright
  '#7F7F7F', // gray
  '#00FFFF', // red
  '#FF00FF', // green
  '#0000FF', // yellow
  '#FFFF00', // blue
  '#00FF00', // magenta
  '#FF0000', // cyan
  '#000000'  // white
];

export let termDefaultBg = '#000000';
export let termDefaultFg = '#c0c0c0';

export const COLOR_SCHEMES = {
  'default': {
    name: 'default',
    titleI18n: 'options_colorScheme_default',
    defaultBg: '#000000',
    defaultFg: '#c0c0c0',
    colors: [
      '#000000', '#800000', '#008000', '#808000', '#000080', '#800080', '#008080', '#c0c0c0',
      '#808080', '#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#ffffff'
    ]
  },
  'solarized-dark': {
    name: 'solarized-dark',
    titleI18n: 'options_colorScheme_solarizedDark',
    defaultBg: '#002b36',
    defaultFg: '#839496',
    colors: [
      '#002b36', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5',
      '#073642', '#cb4b16', '#586e75', '#657b83', '#839496', '#6c71c4', '#93a1a1', '#fdf6e3'
    ]
  },
  'nord': {
    name: 'nord',
    titleI18n: 'options_colorScheme_nord',
    defaultBg: '#2e3440',
    defaultFg: '#d8dee9',
    colors: [
      '#2e3440', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#88c0d0', '#e5e9f0',
      '#4c566a', '#d08770', '#a3be8c', '#ebcb8b', '#5e81ac', '#b48ead', '#8fbcbb', '#eceff4'
    ]
  },
  'monokai': {
    name: 'monokai',
    titleI18n: 'options_colorScheme_monokai',
    defaultBg: '#272822',
    defaultFg: '#f8f8f2',
    colors: [
      '#272822', '#f92672', '#a6e22e', '#f4bf75', '#66d9ef', '#ae81ff', '#a1efe4', '#f8f8f2',
      '#75715e', '#f92672', '#a6e22e', '#e6db74', '#66d9ef', '#ae81ff', '#a1efe4', '#f9f8f5'
    ]
  },
  'dracula': {
    name: 'dracula',
    titleI18n: 'options_colorScheme_dracula',
    defaultBg: '#282a36',
    defaultFg: '#f8f8f2',
    colors: [
      '#282a36', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#f8f8f2',
      '#6272a4', '#ff6e6e', '#69ff94', '#ffffa5', '#d6acff', '#ff92df', '#a4ffff', '#ffffff'
    ]
  },
  'retro-amber': {
    name: 'retro-amber',
    titleI18n: 'options_colorScheme_retroAmber',
    defaultBg: '#120c02',
    defaultFg: '#ffb347',
    colors: [
      '#120c02', '#994d00', '#cc6600', '#ff9900', '#804000', '#b35900', '#e67300', '#ffb347',
      '#592d00', '#ff8000', '#ff9933', '#ffb366', '#cc6600', '#e67300', '#ffaa33', '#ffc87a'
    ]
  },
  'monochrome': {
    name: 'monochrome',
    titleI18n: 'options_colorScheme_monochrome',
    defaultBg: '#000000',
    defaultFg: '#ffffff',
    colors: [
      '#000000', '#444444', '#666666', '#888888', '#383838', '#555555', '#777777', '#b0b0b0',
      '#555555', '#888888', '#cccccc', '#eeeeee', '#808080', '#aaaaaa', '#dddddd', '#ffffff'
    ]
  },
  'retro-green': {
    name: 'retro-green',
    titleI18n: 'options_colorScheme_retroGreen',
    defaultBg: '#081409',
    defaultFg: '#47e657',
    colors: [
      '#081409', '#186620', '#269930', '#39cc47', '#134d18', '#20802a', '#30b33c', '#47e657',
      '#103314', '#33ff44', '#40ff52', '#59ff6b', '#269930', '#30b33c', '#40ff52', '#8cff99'
    ]
  },
  'custom': {
    name: 'custom',
    titleI18n: 'options_colorScheme_custom',
    defaultBg: '#000000',
    defaultFg: '#c0c0c0',
    colors: [
      '#000000', '#800000', '#008000', '#808000', '#000080', '#800080', '#008080', '#c0c0c0',
      '#808080', '#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#ffffff'
    ]
  },
};

export function applyColorScheme(schemeName, customColors, customDefaultBg, customDefaultFg) {
  let colors;
  let bg;
  let fg;
  if (schemeName === 'custom') {
    colors = (Array.isArray(customColors) && customColors.length === 16)
      ? customColors
      : COLOR_SCHEMES['custom'].colors;
    bg = (typeof customDefaultBg === 'string' && /^#[0-9a-fA-F]{6}$/.test(customDefaultBg))
      ? customDefaultBg
      : colors[0];
    fg = (typeof customDefaultFg === 'string' && /^#[0-9a-fA-F]{6}$/.test(customDefaultFg))
      ? customDefaultFg
      : colors[7];
  } else {
    const scheme = COLOR_SCHEMES[schemeName] || COLOR_SCHEMES['default'];
    colors = scheme.colors;
    bg = scheme.defaultBg || colors[0];
    fg = scheme.defaultFg || colors[7];
  }
  for (let i = 0; i < 16; i++) {
    termColors[i] = colors[i];
  }
  termDefaultBg = bg;
  termDefaultFg = fg;
  termColors.defaultBg = bg;
  termColors.defaultFg = fg;

  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    if (root && root.style) {
      for (let i = 0; i < 16; i++) {
        root.style.setProperty(`--term-color-${i}`, colors[i]);
      }
      root.style.setProperty('--term-bg', bg);
      root.style.setProperty('--term-fg', fg);
    }
    if (document.body && document.body.style) {
      document.body.style.backgroundColor = bg;
    }
    const termWin = document.getElementById('TermWindow');
    if (termWin && termWin.style) {
      termWin.style.backgroundColor = bg;
    }
    if (typeof document.querySelectorAll === 'function') {
      const mains = document.querySelectorAll('.main');
      mains.forEach((el) => {
        if (el && el.style) {
          el.style.backgroundColor = bg;
        }
      });
    } else if (typeof document.querySelector === 'function') {
      const mainEl = document.querySelector('.main');
      if (mainEl && mainEl.style) {
        mainEl.style.backgroundColor = bg;
      }
    }
    if (typeof document.querySelector === 'function') {
      const metaTheme = document.querySelector('meta[name="theme-color"]');
      if (metaTheme && typeof metaTheme.setAttribute === 'function') {
        metaTheme.setAttribute('content', bg);
      }
    }
  }
}
