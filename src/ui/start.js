// Start screen and the "new project" dialog. Each app only shows and creates its own kind of project.
import { APPS, appKind, appUrl, DONATE_URL, h } from '../util.js';
import { LANGS, lang, setLang, t } from '../i18n.js';
import { field, modal } from './dialogs.js';
import { createProject, importProjectFile } from './project.js';
import { listProjects, loadProject } from '../storage.js';
import { demoCards } from './demos.js';

/** The other app, for a link on the start screen. */
const otherApp = (kind) => (kind === 'building' ? 'schematic' : 'building');

async function newProjectDialog(app) {
  const name = h('input', { type: 'text', value: t('Nieuw project') });
  const ok = await modal({
    title: 'Nieuw project',
    body: h('div', { class: 'form' }, field('Projectnaam', name), h('p', { class: 'hint' }, app.cfg.newText)),
    buttons: [{ label: 'Annuleren', value: false }, { label: 'Aanmaken', value: true, primary: true }],
  });
  return ok ? name.value.trim() : null;
}

export async function startNewProject(app) {
  const name = await newProjectDialog(app);
  if (name === null) return;
  await app.save();
  app.setProject(createProject(name || t('Nieuw project'), app.cfg.kind));
  await app.save();
}

/** Start screen: new project, open a file, demos or one of the recent projects. Closing keeps the current project. */
export async function startScreen(app) {
  const cfg = app.cfg;
  const recent = (await listProjects()).filter((it) => appKind(it.kind) === cfg.kind).slice(0, 12);
  const other = APPS[otherApp(cfg.kind)];
  let close;
  const choose = (fn) => () => close(fn);
  const body = h('div', { class: 'startscreen' },
    h('div', { class: 'langs' }, Object.entries(LANGS).map(([k, label]) =>
      h('button', { class: k === lang ? 'active' : '', onclick: () => { if (k !== lang) setLang(k); } }, label))),
    h('div', { class: 'startbig' },
      h('button', { class: 'primary', onclick: choose(() => startNewProject(app)) }, h('span', { class: 'kicon' }, '＋'), h('b', null, 'Nieuw project'), h('small', null, cfg.newText)),
      h('button', { onclick: choose(() => importProjectFile(app)) }, h('span', { class: 'kicon' }, '📂'), h('b', null, 'Bestand openen'), h('small', null, cfg.fileText))),
    ...demoCards(app, choose),
    h('h3', null, 'Recente projecten'),
    recent.length ? h('div', { class: 'recent' }, recent.map((it) => h('button', {
      class: 'recentitem',
      onclick: choose(async () => { const p = await loadProject(it.id); if (p) app.setProject(p); }),
    }, h('span', { class: 'kicon' }, APPS[cfg.kind].icon), h('span', { class: 'rname' }, it.name),
    h('small', null, new Date(it.updated).toLocaleDateString())))) : h('p', { class: 'hint' }, 'Nog geen projecten in deze browser.'),
    h('a', { class: 'otherapp', href: appUrl(otherApp(cfg.kind)) },
      h('span', { class: 'kicon' }, other.icon),
      h('span', null, h('b', null, other.name), h('small', null, t(otherApp(cfg.kind) === 'building'
        ? 'Woningen en gebouwen volgens AREI: plattegronden, kringen, eendraadschema'
        : 'Stuurkasten, hydraulica, pneumatica en koeling – met simulatie'))),
      h('span', { class: 'arrow' }, '→')),
    h('p', { class: 'donate' }, 'Kringo is gratis. Wil je de verdere ontwikkeling steunen? ',
      h('a', { href: DONATE_URL, target: '_blank', rel: 'noopener' }, '♥ Doneer via Ko-fi')));
  const action = await modal({ title: t('Welkom bij {name}', { name: cfg.name }), body, buttons: [], cls: 'start', bind: (c) => { close = c; } });
  if (typeof action === 'function') await action();
}
