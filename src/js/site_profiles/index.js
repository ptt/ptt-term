import { PttProfile } from './ptt_profile';
import { Maple3Profile } from './maple3_profile';
import { AutoProfile } from './auto_profile';

export { BaseProfile } from './base_profile';
export { PttProfile } from './ptt_profile';
export { Maple3Profile } from './maple3_profile';
export { AutoProfile } from './auto_profile';

const profiles = {
  ptt: () => new PttProfile(),
  maple3: () => new Maple3Profile(),
  auto: () => new AutoProfile(),
};

export function getSiteProfile(name) {
  let key = (name || '').toLowerCase();
  if (profiles[key]) {
    return profiles[key]();
  }
  return profiles.auto();
}
