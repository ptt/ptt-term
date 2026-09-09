import { en_US } from './en_US_messages.js';
import { zh_TW } from './zh_TW_messages.js';

const locale = {
  'en_us': en_US,
  'zh_tw': zh_TW
};

let i18n_val = {};

export function i18n(str) {
  if (i18n_val[str]) {
    return i18n_val[str].message;
  } else {
    console.log('missing i18n '+str);
  }
}

export function getI18nMessage(str) {
  if (i18n_val && i18n_val[str]) {
    return i18n_val[str].message ?? i18n_val[str];
  }
  if (en_US && en_US[str]) {
    return en_US[str].message ?? en_US[str];
  }
  if (zh_TW && zh_TW[str]) {
    return zh_TW[str].message ?? zh_TW[str];
  }
  return str;
}

export const _ = getI18nMessage;

export function setupI18n(callback) {
  i18n_val = locale[getLang()];
}

export function getLang() {
  let langs = navigator.languages || [navigator.language || ''];
  for (let lang of langs) {
    lang = lang.toLowerCase().replace('-', '_');
    if (lang in locale) {
      return lang;
    }
  }
  return 'en_us';
}
