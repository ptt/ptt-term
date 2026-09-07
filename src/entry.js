
import './css/ui.css';
import './css/main.css';
import './css/color.css';
import './js/main';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.debug('ServiceWorker registration failed:', err);
    });
  });
}
