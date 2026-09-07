export const DEFAULT_PREFS = {
  enablePicPreview: true,
  picPreviewWhitelistOnly: true,
  enableNotifications: true,
  enableBell: true,
  enableEasyReading: false,
  endTurnsOnLiveUpdate: false,
  copyOnSelect: false,
  antiIdleTime: 0,
  lineWrap: 78,
  useCanvasEngine: true,
  showFps: false,
  smoothAnsiArt: true,
  captureConnectionLog: false,

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
  cursorStyle: 'blink',
  fontFitWindowWidth: false,
  fontFace: "MingLiu,SymMingLiu,'Noto Sans Mono CJK TC','PingFang TC',monospace",
  fontSize: 24,
  maxFontSize: 999,
  termSize: { cols: 80, rows: 24 },
  termSizeMode: "max-font-size",
  bbsMargin: 0,
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
    if (
      saved &&
      saved.smoothAnsi !== undefined &&
      saved.smoothAnsiArt === undefined
    ) {
      prefs.smoothAnsiArt = saved.smoothAnsi;
    }
    if (saved) {
      if (saved.maxFontSize === undefined) {
        prefs.maxFontSize =
          saved.termSizeMode === "max-font-size" && saved.fontSize
            ? saved.fontSize
            : DEFAULT_PREFS.maxFontSize;
      }
      if (saved.fontSize === 999 || saved.fontSize === undefined) {
        prefs.fontSize = DEFAULT_PREFS.fontSize;
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
