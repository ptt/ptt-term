export const DEFAULT_PREFS = {
  enablePicPreview: true,
  picPreviewWhitelistOnly: true,
  enableBell: "always",
  enableVisualBell: false,
  warnBeforeClose: true,
  enableEasyReading: false,
  enableLiveUpdate: false,
  endTurnsOnLiveUpdate: true,
  liveUpdateInterval: 1,
  showLiveUpdateToolbar: true,
  copyOnSelect: false,
  trimTrailingSpaces: true,
  rightClickAction: "menu",
  supportMouseReporting: true,
  enableAntiIdle: false,
  antiIdleTime: 0,
  lineWrap: 78,
  useCanvasEngine: true,
  showFps: false,
  smoothAnsiArt: true,
  captureConnectionLog: false,
  enableInputHelper: true,
  enableTouchDebugHUD: false,

  // keyboard
  backspaceKey: "control-h",
  deleteKey: "escape-sequence",

  // mouse browsing
  useMouseBrowsing: false,
  mouseBrowsingHighlight: true,
  mouseBrowsingHighlightColor: 2,
  mouseLeftFunction: 0,
  mouseMiddleFunction: 0,
  mouseWheelFunction1: 1,
  mouseWheelFunction2: 2,
  mouseWheelFunction3: 3,

  // displays
  colorScheme: 'default',
  lineHeight: 1.0,
  cursorStyle: 'blink',
  fontFitWindowWidth: false,
  fontFace: "MingLiu,SymMingLiu,'Noto Sans Mono CJK TC','PingFang TC',monospace",
  fontSize: 24,
  maxFontSize: 999,
  termSize: { cols: 80, rows: 24 },
  termSizeMode: "max-font-size",
  termMargin: 0,
};

export const PREF_STORAGE_KEY = "pttchrome.pref.v1";

export const getDefaultPrefs = () => ({
  ...DEFAULT_PREFS,
  termSize: { ...DEFAULT_PREFS.termSize },
});

export const readValuesWithDefault = () => {
  try {
    const raw =
      typeof window !== "undefined" && window.localStorage
        ? window.localStorage.getItem(PREF_STORAGE_KEY)
        : null;
    const saved = raw ? JSON.parse(raw).values : null;
    const prefs = {
      ...getDefaultPrefs(),
      ...saved,
      termSize: {
        ...DEFAULT_PREFS.termSize,
        ...(saved && saved.termSize),
      },
    };
    if (saved) {
      if (saved.enableAntiIdle === undefined && saved.antiIdleTime !== undefined) {
        prefs.enableAntiIdle = Boolean(saved.antiIdleTime > 0);
      }
      if (saved.enableLiveUpdate === undefined && saved.endTurnsOnLiveUpdate !== undefined) {
        prefs.enableLiveUpdate = Boolean(saved.endTurnsOnLiveUpdate);
      }
      if (saved.liveUpdateInterval !== undefined) {
        const parsedInterval = parseInt(saved.liveUpdateInterval, 10);
        prefs.liveUpdateInterval = parsedInterval > 0 ? parsedInterval : 1;
      }
      if (saved.showLiveUpdateToolbar !== undefined) {
        prefs.showLiveUpdateToolbar = Boolean(saved.showLiveUpdateToolbar);
      }
      if (saved.maxFontSize === undefined) {
        prefs.maxFontSize =
          saved.termSizeMode === "max-font-size" && saved.fontSize
            ? saved.fontSize
            : DEFAULT_PREFS.maxFontSize;
      }
      if (saved.fontSize === 999 || saved.fontSize === undefined) {
        prefs.fontSize = DEFAULT_PREFS.fontSize;
      }
      if (saved.lineHeight !== undefined) {
        const parsedLineHeight = parseFloat(saved.lineHeight);
        prefs.lineHeight = !isNaN(parsedLineHeight) && parsedLineHeight > 0 ? parsedLineHeight : 1.0;
      }
    }
    return prefs;
  } catch (e) {
    return getDefaultPrefs();
  }
};

export const writeValues = (values) => {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(
        PREF_STORAGE_KEY,
        JSON.stringify({
          values,
        })
      );
    }
  } catch (e) {}
  return values;
};

export const updatePrefs = (patch) => {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem(PREF_STORAGE_KEY);
      const obj = raw ? JSON.parse(raw) : { values: {} };
      if (!obj.values) {
        obj.values = {};
      }
      Object.assign(obj.values, patch);
      window.localStorage.setItem(PREF_STORAGE_KEY, JSON.stringify(obj));
      return obj.values;
    }
  } catch (e) {}
  return null;
};

export const updatePref = (key, value) => {
  return updatePrefs({ [key]: value });
};

export const CARET_SHAPES = {
  IBEAM: "ibeam",
  BLOCK: "block",
  HALF_BLOCK: "half-block",
  UNDERLINE: "underline",
};

/**
 * Parse a cursorStyle preference string into shape and blink boolean.
 * Backward compatible with legacy strings: 'blink', 'underline', 'reverse', 'blink-reverse'.
 * @param {string} style
 * @returns {{ shape: string, blink: boolean }}
 */
export function parseCaretStyle(style) {
  if (!style) {
    return { shape: CARET_SHAPES.UNDERLINE, blink: true };
  }
  const s = String(style).toLowerCase();
  const blink = s === "blink" || s.startsWith("blink-") || s.endsWith("-blink");
  let shape = CARET_SHAPES.UNDERLINE;
  if (s.includes("ibeam") || s.includes("i-beam") || s.includes("bar")) {
    shape = CARET_SHAPES.IBEAM;
  } else if (
    s.includes("half-block") ||
    s.includes("reverse") ||
    s.includes("half")
  ) {
    shape = CARET_SHAPES.HALF_BLOCK;
  } else if (s.includes("block")) {
    shape = CARET_SHAPES.BLOCK;
  } else if (s.includes("underline") || s === "blink") {
    shape = CARET_SHAPES.UNDERLINE;
  }
  return { shape, blink };
}

/**
 * Serialize caret shape and blink boolean into a single cursorStyle string.
 * @param {string} shape
 * @param {boolean} blink
 * @returns {string}
 */
export function serializeCaretStyle(shape, blink) {
  if (blink) {
    if (shape === CARET_SHAPES.UNDERLINE) return "blink";
    if (shape === CARET_SHAPES.HALF_BLOCK) return "blink-reverse";
    return `blink-${shape}`;
  }
  if (shape === CARET_SHAPES.HALF_BLOCK) return "reverse";
  return shape;
}
