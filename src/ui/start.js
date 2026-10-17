// Start screen and the "new project" dialog.
import { h } from '../util.js';
import { modal } from './dialogs.js';
import { createProject, importProjectFile } from './project.js';
import { listProjects, loadProject } from '../storage.js';
import { demoProject } from '../demo.js';

/** Asks for name and kind (building / control cabinet). */
async function newProjectDialog() {
  const name = h('input', { type: 'text', value: 'Nieuw project' });
  let kind = 'building';
  const cards = h('div', { class: 'kinds' });
  const renderCards = () => cards.replaceChildren(
    ...[['building', '🏠', 'Gebouw', 'Woning / gebouw volgens AREI: plattegronden, stopcontacten, verlichting, kringen en het eendraadschema.'],
      ['schematic', '🗄', 'Stuurkast', 'Industriële schema\'s: stuurstroom, vermogen, PLC, klemmen, kruisverwijzingen en lijsten.']]
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
    h('div', { class: 'startbig' },
      h('button', { class: 'primary', onclick: choose(() => startNewProject(app)) }, h('span', { class: 'kicon' }, '＋'), h('b', null, 'Nieuw project'), h('small', null, 'Gebouw (AREI) of stuurkast')),
      h('button', { onclick: choose(() => importProjectFile(app)) }, h('span', { class: 'kicon' }, '📂'), h('b', null, 'Bestand openen'), h('small', null, '.kringo, .elecad of QElectroTech (.qet)'))),
    h('h3', null, 'Recente projecten'),
    recent.length ? h('div', { class: 'recent' }, recent.map((it) => h('button', {
      class: 'recentitem',
      onclick: choose(async () => { const p = await loadProject(it.id); if (p) app.setProject(p); }),
    }, h('span', { class: 'kicon' }, it.kind === 'building' ? '🏠' : '🗄'), h('span', { class: 'rname' }, it.name),
    h('small', null, new Date(it.updated).toLocaleDateString())))) : h('p', { class: 'hint' }, 'Nog geen projecten in deze browser.'),
    h('p', { class: 'hint' }, h('button', { class: 'link', onclick: choose(async () => { app.setProject(demoProject(app.lib)); await app.save(); }) }, 'Demoproject (stuurkast) openen')));
  const action = await modal({ title: 'Welkom bij Kringo', body, buttons: [], cls: 'start', bind: (c) => { close = c; } });
  if (typeof action === 'function') await action();
}
