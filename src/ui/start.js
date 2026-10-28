// Start screen and the "new project" dialog.
import { DONATE_URL, h } from '../util.js';
import { LANGS, lang, setLang, t } from '../i18n.js';
import { modal } from './dialogs.js';
import { createProject, importProjectFile } from './project.js';
import { listProjects, loadProject } from '../storage.js';
import { demoProject } from '../demo.js';
import { fluidDemoProject } from '../fluid/demo.js';

const KIND_ICON = { building: '🏠', schematic: '🗄', fluid: '💧' };

/** Asks for name and kind (building / control cabinet / fluid power). */
async function newProjectDialog() {
  const name = h('input', { type: 'text', value: t('Nieuw project') });
  let kind = 'building';
  const cards = h('div', { class: 'kinds' });
  const renderCards = () => cards.replaceChildren(
    ...[['building', '🏠', 'Gebouw', 'Woning / gebouw volgens AREI: plattegronden, stopcontacten, verlichting, kringen en het eendraadschema.'],
      ['schematic', '🗄', 'Stuurkast', 'Industriële schema\'s: stuurstroom, vermogen, PLC, klemmen, kruisverwijzingen en lijsten.'],
      ['fluid', '💧', 'Hydraulica / pneumatica', 'Pneumatische en hydraulische schema\'s (ISO 1219) tekenen en simuleren.']]
      .map(([k, icon, title, text]) => h('button', { class: 'kind' + (kind === k ? ' active' : ''), onclick: () => { kind = k; renderCards(); } },
        h('span', { class: 'kicon' }, icon), h('b', null, title), h('small', null, text))));
  renderCards();
  const ok = await modal({
    title: 'Nieuw project',
    body: h('div', { class: 'form' }, h('label', { class: 'field' }, h('span', null, 'Projectnaam'), name), h('span', { class: 'hint' }, 'Soort project (kan nadien niet gewijzigd worden):'), cards),
    buttons: [{ label: 'Annuleren', value: false }, { label: 'Aanmaken', value: true, primary: true }],
  });
  return ok ? { name: name.value.trim(), kind } : null;
}

export async function startNewProject(app) {
  const r = await newProjectDialog();
  if (!r) return;
  await app.save();
  app.setProject(createProject(r.name || 'Nieuw project', r.kind));
  await app.save();
}

/** Start screen: new project, open a file, or one of the recent projects. Closing keeps the current project. */
export async function startScreen(app) {
  const recent = (await listProjects()).slice(0, 12);
  let close;
  const choose = (fn) => () => close(fn);
  const body = h('div', { class: 'startscreen' },
    h('div', { class: 'langs' }, Object.entries(LANGS).map(([k, label]) =>
      h('button', { class: k === lang ? 'active' : '', onclick: () => { if (k !== lang) setLang(k); } }, label))),
    h('div', { class: 'startbig' },
      h('button', { class: 'primary', onclick: choose(() => startNewProject(app)) }, h('span', { class: 'kicon' }, '＋'), h('b', null, 'Nieuw project'), h('small', null, 'Gebouw (AREI), stuurkast of hydraulica / pneumatica')),
      h('button', { onclick: choose(() => importProjectFile(app)) }, h('span', { class: 'kicon' }, '📂'), h('b', null, 'Bestand openen'), h('small', null, '.kringo, .elecad of QElectroTech (.qet)'))),
    h('h3', null, 'Recente projecten'),
    recent.length ? h('div', { class: 'recent' }, recent.map((it) => h('button', {
      class: 'recentitem',
      onclick: choose(async () => { const p = await loadProject(it.id); if (p) app.setProject(p); }),
    }, h('span', { class: 'kicon' }, KIND_ICON[it.kind] || '🗄'), h('span', { class: 'rname' }, it.name),
    h('small', null, new Date(it.updated).toLocaleDateString())))) : h('p', { class: 'hint' }, 'Nog geen projecten in deze browser.'),
    h('p', { class: 'hint' }, h('button', { class: 'link', onclick: choose(async () => { app.setProject(demoProject(app.lib)); await app.save(); }) }, 'Demoproject (stuurkast) openen'),
      ' · ', h('button', { class: 'link', onclick: choose(async () => { app.setProject(fluidDemoProject(app.lib)); await app.save(); }) }, 'Demoproject (pneumatica) openen')),
    h('p', { class: 'donate' }, 'Kringo is gratis. Wil je de verdere ontwikkeling steunen? ',
      h('a', { href: DONATE_URL, target: '_blank', rel: 'noopener' }, '♥ Doneer via Ko-fi')));
  const action = await modal({ title: 'Welkom bij Kringo', body, buttons: [], cls: 'start', bind: (c) => { close = c; } });
  if (typeof action === 'function') await action();
}
