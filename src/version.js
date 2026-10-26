// Version shown in the top bar. Keep equal to VERSION in sw.js (tools/check.py checks it).
import { t } from './i18n.js';
import { h } from './util.js';
import { modal } from './ui/dialogs.js';

export const APP_VERSION = '0.61';

/** Compares versions like '0.61' and '0.102' part by part. */
const newer = (a, b) => {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};

/** Latest version on the server (null when offline). */
async function onlineVersion() {
  try {
    const res = await fetch(`src/version.js?t=${Date.now()}`, { cache: 'no-store' });
    const m = (await res.text()).match(/APP_VERSION\s*=\s*'([\d.]+)'/);
    return m ? m[1] : null;
  } catch { return null; }
}

/** Throws away the service worker, its caches and the browser's copy of the app files, then reloads. */
export async function hardReload() {
  try {
    for (const reg of (await navigator.serviceWorker?.getRegistrations?.()) || []) await reg.unregister();
    for (const k of (await caches?.keys?.()) || []) await caches.delete(k);
    const own = performance.getEntriesByType('resource').map((e) => e.name).filter((u) => u.startsWith(location.origin));
    await Promise.all([location.href.split('#')[0], ...own].map((u) => fetch(u, { cache: 'reload' }).catch(() => {})));
  } catch { /* reload anyway */ }
  location.reload();
}

/** Version button for the top bar: click → dialog to reload the newest version. */
export function versionButton(app) {
  return h('button', {
    class: 'versionbtn', title: t('Versie – klik om de nieuwste versie te laden'),
    onclick: async () => {
      const latest = h('span', null, '…');
      onlineVersion().then((v) => {
        latest.textContent = v == null ? t('niet bereikbaar (offline?)') : newer(v, APP_VERSION) ? t('v{n} – nieuwer!', { n: v }) : t('v{n} – je bent up-to-date', { n: v });
      });
      const ok = await modal({
        title: 'Pagina vernieuwen',
        body: h('div', null,
          h('p', null, t('Deze versie'), ': ', h('b', null, `v${APP_VERSION}`)),
          h('p', null, t('Online'), ': ', latest),
          h('p', null, t('De pagina wordt volledig herladen (zonder cache), zodat je zeker de laatste versie krijgt. Je project blijft bewaard.'))),
        buttons: [{ label: 'Annuleren', value: false }, { label: 'Vernieuwen', value: true, primary: true }],
      });
      if (!ok) return;
      await app.save();
      hardReload();
    },
  }, `v${APP_VERSION}`);
}
