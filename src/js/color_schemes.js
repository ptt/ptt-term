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

export const COLOR_SCHEMES = {
  'default': {
    name: 'default',
    titleI18n: 'options_colorScheme_default',
    colors: [
      '#000000', '#800000', '#008000', '#808000', '#000080', '#800080', '#008080', '#c0c0c0',
      '#808080', '#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#ffffff'
    ]
  },
  'solarized-dark': {
    name: 'solarized-dark',
    titleI18n: 'options_colorScheme_solarizedDark',
    colors: [
      '#002b36', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5',
      '#073642', '#cb4b16', '#586e75', '#657b83', '#839496', '#6c71c4', '#93a1a1', '#fdf6e3'
    ]
  },
  'nord': {
    name: 'nord',
    titleI18n: 'options_colorScheme_nord',
    colors: [
      '#2e3440', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#88c0d0', '#e5e9f0',
      '#4c566a', '#d08770', '#a3be8c', '#ebcb8b', '#5e81ac', '#b48ead', '#8fbcbb', '#eceff4'
    ]
  },
  'monokai': {
    name: 'monokai',
    titleI18n: 'options_colorScheme_monokai',
    colors: [
      '#272822', '#f92672', '#a6e22e', '#f4bf75', '#66d9ef', '#ae81ff', '#a1efe4', '#f8f8f2',
      '#75715e', '#f92672', '#a6e22e', '#e6db74', '#66d9ef', '#ae81ff', '#a1efe4', '#f9f8f5'
    ]
  },
  'dracula': {
    name: 'dracula',
    titleI18n: 'options_colorScheme_dracula',
    colors: [
      '#282a36', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#f8f8f2',
      '#6272a4', '#ff6e6e', '#69ff94', '#ffffa5', '#d6acff', '#ff92df', '#a4ffff', '#ffffff'
    ]
  },
  'retro-amber': {
    name: 'retro-amber',
    titleI18n: 'options_colorScheme_retroAmber',
    colors: [
      '#120c02', '#994d00', '#cc6600', '#ff9900', '#804000', '#b35900', '#e67300', '#ffb347',
      '#592d00', '#ff8000', '#ff9933', '#ffb366', '#cc6600', '#e67300', '#ffaa33', '#ffc87a'
    ]
  },
  'retro-green': {
    name: 'retro-green',
    titleI18n: 'options_colorScheme_retroGreen',
    colors: [
      '#081409', '#186620', '#269930', '#39cc47', '#134d18', '#20802a', '#30b33c', '#47e657',
      '#103314', '#33ff44', '#40ff52', '#59ff6b', '#269930', '#30b33c', '#40ff52', '#8cff99'
    ]
  },
};

export function applyColorScheme(schemeName) {
  const scheme = COLOR_SCHEMES[schemeName] || COLOR_SCHEMES['default'];
  const colors = scheme.colors;
  for (let i = 0; i < 16; i++) {
    termColors[i] = colors[i];
  }
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    if (root && root.style) {
      for (let i = 0; i < 16; i++) {
        root.style.setProperty(`--term-color-${i}`, colors[i]);
      }
      root.style.setProperty('--term-bg', colors[0]);
      root.style.setProperty('--term-fg', colors[15]);
    }
    if (document.body && document.body.style) {
      document.body.style.backgroundColor = colors[0];
    }
    const termWin = document.getElementById('TermWindow');
    if (termWin && termWin.style) {
      termWin.style.backgroundColor = colors[0];
    }
  }
}
