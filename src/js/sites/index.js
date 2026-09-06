import { PttSite } from './ptt';
import { Maple3Site } from './maple3';
import { AutoSite } from './auto';

export { BaseSite } from './base';
export { PttSite } from './ptt';
export { Maple3Site } from './maple3';
export { AutoSite } from './auto';

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

