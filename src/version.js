// Version shown in the top bar. Keep equal to VERSION in sw.js (tools/check.py checks it).
import { t } from './i18n.js';
import { h } from './util.js';
import { modal } from './ui/dialogs.js';

export const APP_VERSION = '0.72';

/** Compares versions like '0.67' and '0.102' part by part. */
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

const EXPECT = 'kringo-expect-version';

/**
 * Loads the newest version: updates the service worker (which fetches every file past the browser
 * and CDN caches), empties the offline copies and the browser's HTTP cache entries, then reloads.
 */
export async function hardReload(expected) {
  try {
    if (expected) sessionStorage.setItem(EXPECT, expected);
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg) {
      await reg.update().catch(() => {});
      const sw = reg.installing || reg.waiting;
      if (sw) {
        await new Promise((resolve) => {
          const done = () => sw.state === 'activated' || sw.state === 'redundant';
          if (done()) return resolve();
          sw.addEventListener('statechange', () => done() && resolve());
          setTimeout(resolve, 8000);
        });
      }
    }
    for (const k of (await caches?.keys?.()) || []) await caches.delete(k);
    // the browser's own copies (used when no service worker is active)
    const own = performance.getEntriesByType('resource').map((e) => e.name.split('#')[0]).filter((u) => u.startsWith(location.origin));
    await Promise.all([location.href.split('#')[0], ...new Set(own)].map((u) => fetch(u, { cache: 'reload' }).catch(() => {})));
  } catch { /* reload anyway */ }
  location.reload();
}

/** After a reload: tell when the server still served an older version (GitHub publishes with a delay). */
export function checkExpectedVersion(toast) {
  let want = null;
  try { want = sessionStorage.getItem(EXPECT); sessionStorage.removeItem(EXPECT); } catch { return; }
  if (want && newer(want, APP_VERSION)) {
    toast(t('Versie v{n} is nog niet overal beschikbaar (GitHub publiceert met wat vertraging). Probeer over een minuut opnieuw.', { n: want }));
  } else if (want) toast(t('Bijgewerkt naar v{n}', { n: APP_VERSION }));
}

/** Version button for the top bar: click → dialog to reload the newest version. */
export function versionButton(app) {
  return h('button', {
    class: 'versionbtn', title: t('Versie – klik om de nieuwste versie te laden'),
    onclick: async () => {
      const latest = h('span', null, '…');
      let latestVersion = null;
      onlineVersion().then((v) => {
        latestVersion = v;
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
      hardReload(latestVersion);
    },
  }, `v${APP_VERSION}`);
}
