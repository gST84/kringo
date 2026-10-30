// Demo project cards on the start screen and in the "open project" dialog. Each app passes its own
// demos (`app.cfg.demos`: {icon, name, text, make(lib)}); `make` may be async and return null on failure.
import { h } from '../util.js';
import { t } from '../i18n.js';

/** Opens a fresh copy of a demo project. */
async function openDemo(app, make) {
  const p = await make(app.lib);
  if (!p) return;
  app.setProject(p);
  await app.save();
}

/** Heading + cards. `wrap(fn)` turns the open action into the click handler (e.g. close a modal first). */
export function demoCards(app, wrap = (fn) => fn) {
  const demos = app.cfg?.demos || [];
  if (!demos.length) return [];
  return [
    h('h3', null, demos.length > 1 ? 'Demoprojecten' : 'Demoproject'),
    h('div', { class: 'recent demos' + (demos.length === 1 ? ' one' : '') }, demos.map(({ icon, name, text, make }) =>
      h('button', { class: 'recentitem demo', title: t(text), onclick: wrap(() => openDemo(app, make)) },
        h('span', { class: 'kicon' }, icon), h('span', { class: 'rname' }, t(name)), h('small', null, t(text))))),
  ];
}
