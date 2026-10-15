// Installable web app: service worker, install button, persistent storage, opening files from the OS.
import { h } from './util.js';
import { modal } from './ui/dialogs.js';

export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches || navigator.standalone === true;

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * Registers the service worker and returns an "Installeren" button that is only shown when
 * installing is possible (Chrome / Edge / Android prompt, or instructions on iPad / iPhone).
 */
export function setupPwa({ onFile } = {}) {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker:', e));
  }
  // Ask the browser not to evict projects stored in IndexedDB.
  navigator.storage?.persist?.().catch(() => {});

  let deferred = null;
  const btn = h('button', { class: 'install', title: 'Kringo als app installeren', hidden: true }, '⤓ Installeren');
  btn.addEventListener('click', async () => {
    if (deferred) {
      deferred.prompt();
      await deferred.userChoice.catch(() => {});
      deferred = null;
      btn.hidden = true;
    } else if (isIos()) {
      modal({
        title: 'Kringo installeren op iPad / iPhone',
        body: h('ol', null,
          h('li', null, 'Open deze pagina in Safari.'),
          h('li', null, 'Tik op de deelknop (vierkant met pijl omhoog).'),
          h('li', null, 'Kies "Zet op beginscherm".'),
          h('li', null, 'Open Kringo daarna via het icoon: projecten blijven dan bewaard en de app werkt offline.')),
      });
    }
  });
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    btn.hidden = false;
  });
  window.addEventListener('appinstalled', () => { btn.hidden = true; });
  if (isIos() && !isStandalone()) btn.hidden = false;

  // Files opened with the installed app (double click on .kringo / .qet, Chrome / Edge desktop).
  if ('launchQueue' in window && onFile) {
    window.launchQueue.setConsumer(async (params) => {
      for (const handle of params.files || []) {
        onFile(await handle.getFile());
        break;
      }
    });
  }
  return btn;
}
