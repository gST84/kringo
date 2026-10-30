// Demo projects (one per project kind), shown on the start screen and in the "open project" dialog.
import { h, uid } from '../util.js';
import { t } from '../i18n.js';
import { toast } from './dialogs.js';
import { demoProject } from '../demo.js';

export const KIND_ICON = { building: '🏠', schematic: '⚙️', fluid: '⚙️' };

/** The example house (a project file next to the app; cached by the service worker). */
async function buildingDemo() {
  try {
    const r = await fetch('demos/gebouw.kringo', { cache: 'no-cache' });
    const p = await r.json();
    p.id = uid('prj');
    p.updated = Date.now();
    return p;
  } catch {
    toast('Het voorbeeldproject kon niet geladen worden.');
    return null;
  }
}

/** Opens a fresh copy of a demo project. */
async function openDemo(app, make) {
  const p = await make();
  if (!p) return;
  app.setProject(p);
  await app.save();
}

/**
 * Heading + cards. `wrap(fn)` turns the open action into the click handler (e.g. close a modal first).
 */
export function demoCards(app, wrap = (fn) => fn) {
  return [
    h('h3', null, 'Demoprojecten'),
    h('div', { class: 'recent demos' }, [
      ['building', 'Gebouw', 'Woning met verlichting, stopcontacten, zonnepanelen, domotica, data, ruimtes, kabeltrace en eendraadschema', buildingDemo],
      ['schematic', 'Besturing', 'Motorstarter, tijdrelais, PLC, elektropneumatiek, terugloop, tweehandbediening, hydraulisch heffen en pendelbeweging – met simulatie', () => demoProject(app.lib)],
    ].map(([k, name, text, make]) => h('button', { class: 'recentitem demo', title: t(text), onclick: wrap(() => openDemo(app, make)) },
      h('span', { class: 'kicon' }, KIND_ICON[k]), h('span', { class: 'rname' }, t(name)), h('small', null, t(text))))),
  ];
}
