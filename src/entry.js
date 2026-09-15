
import './css/ui.css';
import './css/main.css';
import './css/color.css';
import './js/main';
import { triggerSafeReload } from './js/version_checker.js';

if (
  typeof window !== 'undefined' &&
  window.name !== 'site_auth_target_frame' &&
  window.name !== 'ptt_auth_target_frame' &&
  'serviceWorker' in navigator
) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !window.app?.isConnected?.()) {
      triggerSafeReload();
    }
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.debug('ServiceWorker registration failed:', err);
    });
  });
}
