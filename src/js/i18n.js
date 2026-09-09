import en_US from '../_locales/en/messages.json' with { type: 'json' };
import zh_TW from '../_locales/zh_TW/messages.json' with { type: 'json' };
import { readValuesWithDefault } from './pref.js';

const locale = {
  'en_us': en_US,
  'zh_tw': zh_TW,
};

let i18n_val = {};
let localePreference = 'auto';
let resolvedLocale = 'en_us';

export const SUPPORTED_LOCALES = [
  { value: 'auto', labelKey: 'options_locale_auto' },
  { value: 'zh_tw', labelKey: 'options_locale_zhTW' },
  { value: 'en_us', labelKey: 'options_locale_enUS' },
];

export function i18n(str) {
  if (i18n_val && i18n_val[str]) {
    return i18n_val[str].message;
  }
  return undefined;
}

export function getMessage(key, substitutions) {
  let ret = i18n_val?.[key]?.message;
  if (!ret || !substitutions) return ret ?? '';
  [].concat(substitutions).forEach((arg, i) => {
    ret = ret.replace(`$${i + 1}`, arg);
  });
  return ret;
}

export const _ = getMessage;

export function getI18nMessage(key, fallback) {
  const msg = getMessage(key);
  if (msg && msg !== key) return msg;
  return fallback !== undefined ? fallback : msg;
}

export function getLocalePreference() {
  return localePreference;
}

export function getActiveLocale() {
  return resolvedLocale;
}

export function getCurrentLang() {
  return resolvedLocale;
}

export function getLang(preferredLang) {
  if (preferredLang && preferredLang !== 'auto') {
    const normalized = String(preferredLang).toLowerCase().replace('-', '_');
    if (normalized in locale) {
      return normalized;
    }
  }

  let langs =
    (typeof navigator !== 'undefined' &&
      (navigator.languages || [navigator.language || ''])) ||
    [];
  for (let lang of langs) {
    if (!lang) continue;
    lang = String(lang).toLowerCase().replace('-', '_');
    if (lang in locale) {
      return lang;
    }
  }
  return 'en_us';
}

export function setLocale(lang) {
  const normalized = String(lang || 'auto').toLowerCase().replace('-', '_');
  if (normalized in locale) {
    localePreference = normalized;
    resolvedLocale = normalized;
    i18n_val = locale[normalized];
  } else {
    localePreference = 'auto';
    resolvedLocale = getLang();
    i18n_val = locale[resolvedLocale] || locale['en_us'];
  }
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = resolvedLocale === 'zh_tw' ? 'zh-TW' : 'en';
  }
  return resolvedLocale;
}

export function setupI18n(localeOrPrefOrCallback, callback) {
  let resolved;
  if (typeof localeOrPrefOrCallback === 'string') {
    resolved = setLocale(localeOrPrefOrCallback);
  } else if (localeOrPrefOrCallback && typeof localeOrPrefOrCallback.uiLocale === 'string') {
    resolved = setLocale(localeOrPrefOrCallback.uiLocale);
  } else {
    try {
      const prefs = readValuesWithDefault();
      resolved = setLocale(prefs?.uiLocale);
    } catch (e) {
      resolved = setLocale('auto');
    }
  }
  const cb = typeof localeOrPrefOrCallback === 'function' ? localeOrPrefOrCallback : callback;
  if (typeof cb === 'function') {
    try {
      cb(resolved);
    } catch (e) {}
  }
  return resolved;
}

setupI18n();


