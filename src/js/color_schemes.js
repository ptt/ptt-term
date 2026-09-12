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
export let termDefaultLink = '#ff6600';

export const COLOR_SCHEMES = {
  // IBM VGA standard 16-color palette (1987); traditional Telnet BBS default used by PCMan/KKMan.
  'default': {
    name: 'default',
    titleI18n: 'options_colorScheme_default',
    defaultBg: '#000000',
    defaultFg: '#c0c0c0',
    defaultLink: '#ff6600',
    colors: [
      '#000000', '#800000', '#008000', '#808000', '#000080', '#800080', '#008080', '#c0c0c0',
      '#808080', '#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#ffffff'
    ]
  },
  // Solarized Dark by Ethan Schoonover (2011); precision CIELAB lightness-balanced palette.
  'solarized-dark': {
    name: 'solarized-dark',
    titleI18n: 'options_colorScheme_solarizedDark',
    defaultBg: '#002b36',
    defaultFg: '#839496',
    defaultLink: '#cb4b16',
    colors: [
      '#002b36', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5',
      '#073642', '#cb4b16', '#586e75', '#657b83', '#839496', '#6c71c4', '#93a1a1', '#fdf6e3'
    ]
  },
  // Nord by Arctic Ice Studio / Sven Greb (2016); arctic-inspired cool-toned pastel palette.
  'nord': {
    name: 'nord',
    titleI18n: 'options_colorScheme_nord',
    defaultBg: '#2e3440',
    defaultFg: '#d8dee9',
    defaultLink: '#d08770',
    colors: [
      '#2e3440', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#88c0d0', '#e5e9f0',
      '#4c566a', '#d08770', '#a3be8c', '#ebcb8b', '#5e81ac', '#b48ead', '#8fbcbb', '#eceff4'
    ]
  },
  // Monokai by Wimer Hazenberg (2006); originally created for TextMate and popularized by Sublime Text.
  'monokai': {
    name: 'monokai',
    titleI18n: 'options_colorScheme_monokai',
    defaultBg: '#272822',
    defaultFg: '#f8f8f2',
    defaultLink: '#fd971f',
    colors: [
      '#272822', '#f92672', '#a6e22e', '#f4bf75', '#66d9ef', '#ae81ff', '#a1efe4', '#f8f8f2',
      '#75715e', '#f92672', '#a6e22e', '#e6db74', '#66d9ef', '#ae81ff', '#a1efe4', '#f9f8f5'
    ]
  },
  // Dracula by Zeno Rocha (2013); high-contrast dark purple theme widely adopted across developer tools.
  'dracula': {
    name: 'dracula',
    titleI18n: 'options_colorScheme_dracula',
    defaultBg: '#282a36',
    defaultFg: '#f8f8f2',
    defaultLink: '#ffb86c',
    colors: [
      '#282a36', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#f8f8f2',
      '#6272a4', '#ff6e6e', '#69ff94', '#ffffa5', '#d6acff', '#ff92df', '#a4ffff', '#ffffff'
    ]
  },
  // Amber CRT (P3 phosphor ~590nm); emulates 1970s-80s monochrome amber cathode-ray tube terminals (e.g. DEC VT100 / IBM 3278).
  'retro-amber': {
    name: 'retro-amber',
    titleI18n: 'options_colorScheme_retroAmber',
    defaultBg: '#120c02',
    defaultFg: '#ffb347',
    defaultLink: '#ff9900',
    colors: [
      '#120c02', '#994d00', '#cc6600', '#ff9900', '#804000', '#b35900', '#e67300', '#ffb347',
      '#592d00', '#ff8000', '#ff9933', '#ffb366', '#cc6600', '#e67300', '#ffaa33', '#ffc87a'
    ]
  },
  // Green CRT (P1 phosphor ~525-555nm); emulates classic monochrome green phosphor monitors (e.g. IBM 5151 / Apple II).
  'retro-green': {
    name: 'retro-green',
    titleI18n: 'options_colorScheme_retroGreen',
    defaultBg: '#081409',
    defaultFg: '#47e657',
    defaultLink: '#33ff44',
    colors: [
      '#081409', '#186620', '#269930', '#39cc47', '#134d18', '#20802a', '#30b33c', '#47e657',
      '#103314', '#33ff44', '#40ff52', '#59ff6b', '#269930', '#30b33c', '#40ff52', '#8cff99'
    ]
  },
  // Pure Black & White accessibility monochrome mode; ignores all ANSI fg/bg colors.
  'pure-bw': {
    name: 'pure-bw',
    titleI18n: 'options_colorScheme_pureBw',
    defaultBg: '#000000',
    defaultFg: '#c0c0c0',
    defaultLink: '#808080',
    forcePlainText: true,
    colors: [
      '#000000', '#c0c0c0', '#c0c0c0', '#c0c0c0', '#c0c0c0', '#c0c0c0', '#c0c0c0', '#c0c0c0',
      '#c0c0c0', '#c0c0c0', '#c0c0c0', '#c0c0c0', '#c0c0c0', '#c0c0c0', '#c0c0c0', '#c0c0c0'
    ]
  },
  // User-defined custom palette; initialized with VGA defaults and editable via Preferences UI.
  'custom': {
    name: 'custom',
    titleI18n: 'options_colorScheme_custom',
    defaultBg: '#000000',
    defaultFg: '#c0c0c0',
    defaultLink: '#ff6600',
    colors: [
      '#000000', '#800000', '#008000', '#808000', '#000080', '#800080', '#008080', '#c0c0c0',
      '#808080', '#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#ffffff'
    ]
  },
};

const contrastCache = new Map();

function hexToRgb(hex) {
  if (typeof hex !== 'string' || hex.length < 7) return [0, 0, 0];
  const v = parseInt(hex.slice(1, 7), 16);
  if (Number.isNaN(v)) return [0, 0, 0];
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function rgbToHex(r, g, b) {
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  const hr = clamp(r).toString(16).padStart(2, '0');
  const hg = clamp(g).toString(16).padStart(2, '0');
  const hb = clamp(b).toString(16).padStart(2, '0');
  return `#${hr}${hg}${hb}`;
}

function perceivedBrightness(r, g, b) {
  // Rec. 601 perceived luminance (0.0 to 1.0), matching iTerm2's perceivedBrightness
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export function getContrastColor(fgHex, bgHex, minContrast = termColors.minimumContrast) {
  if (!minContrast || minContrast <= 0 || !fgHex || !bgHex) {
    return fgHex;
  }
  const key = `${fgHex}|${bgHex}|${minContrast}`;
  const cached = contrastCache.get(key);
  if (cached !== undefined) return cached;

  if (contrastCache.size > 2000) {
    contrastCache.clear();
  }

  const [fr, fg, fb] = hexToRgb(fgHex);
  const [br, bg, bb] = hexToRgb(bgHex);
  const yFg = perceivedBrightness(fr, fg, fb);
  const yBg = perceivedBrightness(br, bg, bb);
  const targetDiff = Math.min(1, Math.max(0, minContrast / 100));

  if (Math.abs(yFg - yBg) >= targetDiff) {
    contrastCache.set(key, fgHex);
    return fgHex;
  }

  const canBrighten = (yBg + targetDiff <= 1.0) || (1.0 - yBg >= yBg);
  const shouldBrighten = (yFg >= yBg)
    ? (yBg + targetDiff <= 1.0 || canBrighten)
    : (yBg - targetDiff < 0.0 && canBrighten);

  let resultHex = fgHex;
  if (shouldBrighten) {
    const targetY = Math.min(1.0, yBg + targetDiff);
    if (targetY > yFg && yFg < 1.0) {
      const t = Math.min(1.0, Math.max(0.0, (targetY - yFg) / (1.0 - yFg)));
      resultHex = rgbToHex(
        fr + t * (255 - fr),
        fg + t * (255 - fg),
        fb + t * (255 - fb)
      );
    }
  } else {
    const targetY = Math.max(0.0, yBg - targetDiff);
    if (targetY < yFg && yFg > 0.0) {
      const t = Math.min(1.0, Math.max(0.0, (yFg - targetY) / yFg));
      resultHex = rgbToHex(
        fr * (1.0 - t),
        fg * (1.0 - t),
        fb * (1.0 - t)
      );
    }
  }

  contrastCache.set(key, resultHex);
  return resultHex;
}

export function applyColorScheme(
  schemeName,
  customColors,
  customDefaultBg,
  customDefaultFg,
  customDefaultLink,
  customForcePlainText,
  minimumContrast = 0
) {
  contrastCache.clear();
  let colors;
  let bg;
  let fg;
  let linkColor;
  let forcePlainText = false;
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
    linkColor = (typeof customDefaultLink === 'string' && /^#[0-9a-fA-F]{6}$/.test(customDefaultLink))
      ? customDefaultLink
      : COLOR_SCHEMES['custom'].defaultLink;
    forcePlainText = Boolean(customForcePlainText);
  } else {
    const scheme = COLOR_SCHEMES[schemeName] || COLOR_SCHEMES['default'];
    colors = scheme.colors;
    bg = scheme.defaultBg || colors[0];
    fg = scheme.defaultFg || colors[7];
    linkColor = scheme.defaultLink || '#ff6600';
    forcePlainText = Boolean(scheme.forcePlainText);
  }
  const minContrastVal = forcePlainText ? 0 : Math.max(0, Math.min(100, Number(minimumContrast) || 0));
  for (let i = 0; i < 16; i++) {
    termColors[i] = forcePlainText ? (i === 0 ? bg : fg) : colors[i];
  }
  const adjustedDefaultFg = minContrastVal > 0 ? getContrastColor(fg, bg, minContrastVal) : fg;
  termDefaultBg = bg;
  termDefaultFg = adjustedDefaultFg;
  termDefaultLink = linkColor;
  termColors.defaultBg = bg;
  termColors.defaultFg = adjustedDefaultFg;
  termColors.defaultLink = linkColor;
  termColors.forcePlainText = forcePlainText;
  termColors.minimumContrast = minContrastVal;

  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    if (root && root.style) {
      for (let i = 0; i < 16; i++) {
        root.style.setProperty(`--term-color-${i}`, termColors[i]);
        const baseFgColor = forcePlainText ? fg : (i === 7 ? fg : termColors[i]);
        const fgColor = minContrastVal > 0 ? getContrastColor(baseFgColor, bg, minContrastVal) : baseFgColor;
        root.style.setProperty(`--term-fg-${i}`, fgColor);
      }
      root.style.setProperty('--term-bg', bg);
      root.style.setProperty('--term-fg', adjustedDefaultFg);
      root.style.setProperty('--term-link', linkColor);
      if (root.classList && typeof root.classList.toggle === 'function') {
        root.classList.toggle('scheme-pure-bw', forcePlainText);
      }
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
