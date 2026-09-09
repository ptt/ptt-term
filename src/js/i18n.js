import en_US from '../_locales/en/messages.json' with { type: 'json' };
import zh_TW from '../_locales/zh_TW/messages.json' with { type: 'json' };

const locale = {
  'en_us': en_US,
  'zh_tw': zh_TW,
};

let i18n_val = {},
  alt = en_US;

export function i18n(str) {
  if (i18n_val && i18n_val[str]) {
    return i18n_val[str].message;
  } else {
    console.log('missing i18n:', str);
  }
}

export function getI18nMessage(str) {
  if (i18n_val && i18n_val[str]) {
    return i18n_val[str].message ?? i18n_val[str];
  }
  if (alt && alt[str]) {
    return alt[str].message ?? alt[str];
  }
  return str;
}

export const _ = getI18nMessage;

export function setupI18n(callback) {
  i18n_val = locale[getLang()] || en_US;
  alt = i18n_val === en_US ? zh_TW : en_US;
  if (typeof callback === 'function') {
    callback();
  }
}

export function getLang() {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const langs = nav?.languages || [nav?.language || ''];
  for (let lang of langs) {
    lang = lang.toLowerCase().replace('-', '_');
    if (lang in locale) {
      return lang;
    }
  }
  return 'en_us';
}

setupI18n();


