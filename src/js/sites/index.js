import { PttSite } from './ptt.js';
import { Maple3Site } from './maple3.js';
import { AutoSite } from './auto.js';

export { BaseSite } from './base.js';
export { PttSite } from './ptt.js';
export { Maple3Site } from './maple3.js';
export { AutoSite } from './auto.js';

const sites = {
  ptt: () => new PttSite(),
  maple3: () => new Maple3Site(),
  auto: () => new AutoSite(),
};

export function getSite(name) {
  let key = (name || '').toLowerCase();
  if (sites[key]) {
    return sites[key]();
  }
  return sites.auto();
}

export const getSiteProfile = getSite;

