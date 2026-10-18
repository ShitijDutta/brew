import './styles.css';
import './sync/install.js';
import './app.js';
import { initSettings } from './settings.js';

initSettings();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
