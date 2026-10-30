// Shared shell of both apps (Kringo Gebouw and Kringo Besturing): top bar, sheet editor, toolbars,
// side panels, start-up. Each app (src/apps/*.js) calls boot() with its own config:
//   kind ('building' | 'schematic'), name, newText / fileText (start screen), symbols (extra built-in
//   symbols), demos, initialProject(lib), menu(ctx) and sheetTools(ctx) (extra buttons),
//   pageOptions(ctx) (contents of the page selector) and setup(ctx) (app-only panels and events).
import { App } from './app.js';
import { Library } from './symbols/library.js';
import { SchematicEditor } from './schematic/editor.js';
import { libraryPanel, pagesPanel, propertiesPanel } from './ui/panels.js';
import { openSymbolEditor } from './ui/symbolEditor.js';
import { setupPwa } from './pwa.js';
import { exportProjectFile, importProjectFile, openProjectFile, openDialog, printDialog, projectDialog, createProject } from './ui/project.js';
import { startNewProject, startScreen } from './ui/start.js';
import { prompt, toast } from './ui/dialogs.js';
import { lastProjectId, listProjects, loadProject, rememberProject, saveProject } from './storage.js';
import { locate, normalizeProject } from './model.js';
import { APPS, appKind, appUrl, cursorIcon, DONATE_URL, h, icon, MANUAL_URL, ROOT } from './util.js';
import { LANGS, lang, setLang, startAutoTranslate, t } from './i18n.js';
import { initSplitters } from './ui/splitters.js';
import { checkExpectedVersion, versionButton } from './version.js';

export async function boot(cfg) {
startAutoTranslate();
const lib = new Library(cfg.symbols || []);
await lib.init();
const app = new App(lib);
app.cfg = cfg;
window.kringo = app; // handy for debugging in the console
try { localStorage.setItem('kringo.app', APPS[cfg.kind].key); } catch { /* private mode */ }

// a project of the other kind (file, import) opens in the other app
const setProject = app.setProject.bind(app);
app.setProject = (p) => {
  normalizeProject(p);
  if (appKind(p.kind) === cfg.kind) return setProject(p);
  const target = APPS[appKind(p.kind)];
  toast(t('Dit project hoort bij {app} – het wordt daar geopend.', { app: target.name }));
  saveProject(p).then(() => { rememberProject(p.id, p.kind); setTimeout(() => location.assign(appUrl(p.kind)), 600); });
};

// ---------- layout ----------
const $ = (s) => document.querySelector(s);
const center = $('#canvas');
const editor = new SchematicEditor(app, center);
app.editor = editor;
/** Editors per mode: 'schematic' (sheets) and, in the building app, 'building' (floor plans). */
const views = { schematic: editor };
const view = () => views[app.mode] || editor;
document.body.dataset.mode = 'schematic';
document.body.dataset.kind = cfg.kind;
document.body.dataset.app = APPS[cfg.kind].key;

const ctx = { app, lib, editor, views, $, center };
const btn = (label, title, onclick, cls = '') => h('button', { title, 'aria-label': title, onclick, class: cls }, typeof label === 'function' ? label() : label);
ctx.btn = btn;

const saveEl = h('span', { class: 'savestate' });
const nameEl = h('button', { class: 'projname', title: 'Projectgegevens', onclick: () => projectDialog(app) });
const undoBtn = btn('↶', 'Ongedaan maken (Ctrl+Z)', () => app.undo());
const redoBtn = btn('↷', 'Opnieuw (Ctrl+Y)', () => app.redo());

$('#top').append(
  h('a', { class: 'brand', href: ROOT + '?kies', title: t('Andere Kringo-app kiezen') }, h('img', { class: 'logo', src: ROOT + 'icons/icon.svg', alt: '' }), 'Kringo', h('span', { class: 'appname' }, t(APPS[cfg.kind].short))),
  h('button', { class: 'menutoggle', onclick: () => document.body.classList.toggle('show-menu') }, 'Menu ▾'),
  nameEl,
  h('div', { class: 'menu' },
    btn(() => icon('new'), 'Nieuw project', () => startNewProject(app), 'iconbtn'),
    btn(() => icon('open'), 'Project openen (uit de browser of een bestand)', async () => { await app.save(); openDialog(app); }, 'iconbtn'),
    btn(() => icon('save'), 'Project opslaan als .kringo-bestand', () => exportProjectFile(app), 'iconbtn'),
    btn(() => icon('import'), '.kringo-bestand of QElectroTech-project (.qet) openen', async () => { await app.save(); importProjectFile(app); }, 'iconbtn'),
    btn(() => icon('print'), 'Afdrukken of PDF', () => printDialog(app), 'iconbtn'),
    btn(() => icon('help'), 'Handleiding met voorbeelden', () => window.open(MANUAL_URL, '_blank', 'noopener'), 'iconbtn'),
    h('span', { class: 'sep' }),
    btn('Gegevens', 'Projectgegevens, bedrijf, logo', () => projectDialog(app)),
    ...(cfg.menu?.(ctx) || []),
    h('span', { class: 'sep' }),
    undoBtn, redoBtn, saveEl),
  setupPwa({ name: cfg.name, onFile: async (f) => { await app.save(); openProjectFile(app, f); } }),
  h('select', { class: 'langsel', title: 'Taal', onchange: (e) => setLang(e.target.value) },
    Object.entries(LANGS).map(([k, name]) => h('option', { value: k, selected: k === lang }, `🌐 ${k.toUpperCase()} – ${name}`))),
  btn('♥ Steun', 'Kringo is gratis – steun de ontwikkeling via Ko-fi', () => window.open(DONATE_URL, '_blank', 'noopener'), 'donatebtn'),
  versionButton(app));

// tools bar
const tools = [
  ['select', cursorIcon, 'Selecteren (V)'], ['wire', '╱', 'Draad tekenen (W)'], ['text', 'T', 'Tekst (T)'],
  ['box', '▭', 'Kader / toestelgrens (B)'], ['pan', '✋', 'Pannen (H)'],
];
const toolBtns = new Map();
const gridSel = h('select', { title: 'Raster', onchange: (e) => { editor.grid = +e.target.value; } },
  [5, 2.5, 1].map((g) => h('option', { value: g, selected: g === 5 }, t('raster {g}', { g }))));
/** Page choice: 'f:<i>' = floor plan, 'p:<i>' = sheet (switches between plan and sheets in the building app). */
const goTo = (v) => {
  const [kind, i] = v.split(':');
  if (kind === 'f') { app.setMode('building'); app.setFloor(+i); } else { app.setMode('schematic'); app.setPage(+i); }
};
const pageLbl = h('select', { class: 'pagesel', title: 'Pagina kiezen', onchange: (e) => goTo(e.target.value) });
const panelBtn = (side, label, title) => h('button', {
  class: 'paneltoggle', title,
  onclick: () => { document.body.classList.toggle('show-' + side); document.body.classList.remove('show-' + (side === 'left' ? 'right' : 'left')); },
}, label);
$('#toolbar').append(panelBtn('left', '☰', 'Symbolen / bladen tonen'));
const schemTools = h('span', { class: 'tgroup view-sheet' });
$('#toolbar').append(schemTools);
schemTools.append(
  ...tools.map(([k, icon, title]) => {
    const b = btn(icon, title, () => editor.setTool(k), 'tool');
    toolBtns.set(k, b);
    return b;
  }),
  h('span', { class: 'sep' }),
  btn('⟳', 'Draaien (R)', () => editor.rotate()),
  btn('⇋', 'Spiegelen (M)', () => editor.mirror()),
  h('span', { class: 'sep' }),
  btn('−', 'Uitzoomen', () => editor.zoomBy(1.25)),
  btn('+', 'Inzoomen', () => editor.zoomBy(0.8)),
  btn('⤢', 'Passend (F)', () => editor.fit()),
  h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: true, onchange: (e) => { editor.showGrid = e.target.checked; editor.render(); } }), 'raster'),
  gridSel,
  ...(cfg.sheetTools?.(ctx) || []),
  h('span', { class: 'grow' }),
  btn('◀', 'Vorige pagina (PgUp)', () => app.setPage(app.pageIdx - 1)),
  pageLbl,
  btn('▶', 'Volgende pagina (PgDn)', () => app.setPage(app.pageIdx + 1)));

const statusEl = $('#status');
const cursorEl = h('span');
const hintEl = h('span', { class: 'hint' });
statusEl.append(cursorEl, hintEl);
const HINTS = {
  select: 'Klik = selecteren · Shift = toevoegen · slepen = verplaatsen (draden rekken mee) · dubbelklik = eigenschappen',
  wire: 'Klik om te starten, klik voor knikpunten · eindigt automatisch op een pin / draad / voedingslijn · dubbelklik of rechtermuisknop = einde · Esc',
  place: 'Klik om te plaatsen (blijft actief) · R draaien · M spiegelen · Esc / rechtermuisknop = stoppen',
  text: 'Klik waar de tekst moet komen',
  box: 'Sleep een kader (bv. toestelgrens / kast)',
  pan: 'Sleep om te verschuiven',
};
// panels
initSplitters();
Object.assign(ctx, { btn, goTo, pageLbl, statusEl, cursorEl, hintEl, HINTS, toast, prompt });
const extra = cfg.setup?.(ctx) || {};
const leftTabs = $('#left-tabs');
const pagesEl = $('#pages');
const libEl = $('#library');
const showTab = (t) => {
  pagesEl.hidden = t !== 'pages';
  libEl.hidden = t !== 'library';
  for (const b of leftTabs.children) b.classList.toggle('active', b.dataset.tab === t);
};
leftTabs.append(
  h('button', { 'data-tab': 'library', onclick: () => showTab('library') }, 'Symbolen'),
  h('button', { 'data-tab': 'pages', onclick: () => showTab('pages') }, "Pagina's"));
showTab('library');

pagesPanel(app, pagesEl);
libraryPanel(app, libEl, { editor, openSymbolEditor: (def) => openSymbolEditor(app, def) });
propertiesPanel(app, $('#props'), { editor, building: extra.props });
$('#toolbar').append(panelBtn('right', 'ⓘ', 'Eigenschappen tonen'));

// ---------- events ----------
app.on('change', () => {
  view().render();
  const pages = app.project.pages;
  const pageOpts = (after) => pages.map((pg, i) => h('option', { value: 'p:' + i, selected: app.mode === 'schematic' && i === app.pageIdx },
    after ? `${pg.title} (${i + 1}/${pages.length})` : `${i + 1} / ${pages.length}  ${pg.title}`));
  pageLbl.replaceChildren(...(cfg.pageOptions?.(ctx, pageOpts) || pageOpts()));
  undoBtn.disabled = !app.undoStack.length;
  redoBtn.disabled = !app.redoStack.length;
  nameEl.textContent = app.project.name;
  document.title = `${app.project.name} – ${cfg.name}`;
});
app.on('selection', () => view().render());
app.on('mode', (m) => {
  document.body.dataset.mode = m;
  if (m === 'schematic') hintEl.textContent = HINTS[editor.tool];
  requestAnimationFrame(() => view().applyView());
});
setTimeout(() => checkExpectedVersion(toast), 800);
app.on('page', () => editor.render());
app.on('tool', (t) => {
  for (const [k, b] of toolBtns) b.classList.toggle('active', k === t);
  if (app.mode === 'schematic') hintEl.textContent = HINTS[t] || '';
});
app.on('cursor', ([x, y]) => {
  if (!app.project?.pages.length) return;
  const l = locate(app.project, x, y, app.page);
  cursorEl.textContent = t('x {x}  y {y}  ·  kolom {col}', { x, y, col: l.col + l.row });
});
app.on('saved', () => {
  saveEl.textContent = { saved: '✓ opgeslagen', saving: '… opslaan', dirty: '● gewijzigd', error: '⚠ opslaan mislukt' }[app.saveState];
  saveEl.className = 'savestate ' + app.saveState;
});
app.on('requestText', async (p) => {
  const t = await prompt('Tekst', '', { multiline: true });
  if (t) editor.addText(p, t);
});
app.on('editText', async (id) => {
  const t = app.page.texts.find((x) => x.id === id);
  if (!t) return;
  const v = await prompt('Tekst bewerken', t.text, { multiline: true });
  if (v !== null) app.mutate(() => { t.text = v; });
});
document.querySelector('#top .menu').addEventListener('click', (e) => { if (e.target.closest('button')) document.body.classList.remove('show-menu'); });
window.addEventListener('beforeunload', () => { app.save(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) app.save(); });

// ---------- start ----------
// open this app's last project behind the start screen, so closing the screen just continues
const mine = (p) => p && appKind(p.kind) === cfg.kind;
let project = null;
const last = lastProjectId(cfg.kind);
if (last) project = await loadProject(last);
if (!mine(project)) {
  project = null;
  const all = (await listProjects()).filter((it) => appKind(it.kind) === cfg.kind);
  if (all.length) project = await loadProject(all[0].id);
}
app.setProject(project || (await cfg.initialProject?.(lib)) || createProject(t('Nieuw project'), cfg.kind));
await app.save();
editor.setTool('select');
extra.started?.();
app.emit('saved');
startScreen(app);
return app;
}
