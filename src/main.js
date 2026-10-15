// Entry point: builds the UI and wires everything together.
import { App } from './app.js';
import { Library } from './symbols/library.js';
import { SchematicEditor } from './schematic/editor.js';
import { PlanEditor, OPENING_TYPES } from './building/editor.js';
import { buildingLeftPanel, buildingProps, circuitOptions, circuitsDialog, generateDialog } from './building/panels.js';
import { libraryPanel, pagesPanel, propertiesPanel } from './ui/panels.js';
import { listsDialog } from './ui/lists.js';
import { openSymbolEditor } from './ui/symbolEditor.js';
import { setupPwa } from './pwa.js';
import {
  createProject, exportProjectFile, importProjectFile, openProjectFile, openDialog, printDialog, projectDialog, renumberDialog, settingsDialog,
} from './ui/project.js';
import { modal, prompt, toast } from './ui/dialogs.js';
import { listProjects, loadProject } from './storage.js';
import { demoProject } from './demo.js';
import { locate } from './model.js';
import { h } from './util.js';

const lib = new Library();
await lib.init();
const app = new App(lib);
window.kringo = app; // handy for debugging in the console

// ---------- layout ----------
const $ = (s) => document.querySelector(s);
const center = $('#canvas');
const editor = new SchematicEditor(app, center);
const plan = new PlanEditor(app, center);
app.editor = editor;
app.plan = plan;
document.body.dataset.mode = 'schematic';

const btn = (label, title, onclick, cls = '') => h('button', { title, onclick, class: cls }, label);

const saveEl = h('span', { class: 'savestate' });
const nameEl = h('button', { class: 'projname', title: 'Projectgegevens', onclick: () => projectDialog(app) });
const undoBtn = btn('↶', 'Ongedaan maken (Ctrl+Z)', () => app.undo());
const redoBtn = btn('↷', 'Opnieuw (Ctrl+Y)', () => app.redo());

$('#top').append(
  h('div', { class: 'brand' }, h('img', { class: 'logo', src: 'icons/icon.svg', alt: '' }), 'Kringo'),
  nameEl,
  h('div', { class: 'menu' },
    btn('Nieuw', 'Nieuw project', async () => {
      const name = await prompt('Nieuw project', 'Nieuw project', { label: 'Projectnaam' });
      if (name === null) return;
      await app.save();
      const p = createProject(name || 'Nieuw project');
      app.setProject(p);
      await app.save();
      localStorage.setItem('elecad.last', p.id);
    }),
    btn('Openen', 'Project openen (uit de browser of een bestand)', async () => { await app.save(); openDialog(app); }),
    btn('Bewaar bestand', 'Project opslaan als .kringo-bestand', () => exportProjectFile(app)),
    btn('Open bestand', '.kringo-bestand of QElectroTech-project (.qet) openen', async () => { await app.save(); importProjectFile(app); }),
    h('span', { class: 'sep' }),
    btn('Gegevens', 'Projectgegevens, bedrijf, logo', () => projectDialog(app)),
    btn('Instellingen', 'Nummering en bladindeling', () => settingsDialog(app), 'only-schematic'),
    btn('Hernummeren', 'Toestellen / klemmen hernummeren', () => renumberDialog(app), 'only-schematic'),
    btn('Lijsten', 'Toestellen-, klemmen-, draad- en PLC-lijst', () => listsDialog(app)),
    btn('Kringen', 'Kringen, verdeelborden en differentiëlen (AREI)', () => circuitsDialog(app), 'only-building'),
    btn('Eendraadschema', 'Eendraadschema genereren uit de plattegronden', () => generateDialog(app), 'only-building'),
    btn('Afdrukken', 'Afdrukken of PDF', () => printDialog(app)),
    h('span', { class: 'sep' }),
    undoBtn, redoBtn, saveEl),
  setupPwa({ onFile: async (f) => { await app.save(); openProjectFile(app, f); } }),
  h('div', { class: 'modes' },
    h('button', { 'data-mode': 'schematic', title: 'Stuurkasten / schema\'s (ook het eendraadschema)', onclick: () => app.setMode('schematic') }, 'Stuurkasten'),
    h('button', { 'data-mode': 'building', title: 'Gebouwen: plattegrond, AREI-symbolen, kringen', onclick: () => app.setMode('building') }, 'Gebouwen')));

// tools bar
const tools = [
  ['select', '⬚', 'Selecteren (V)'], ['wire', '╱', 'Draad tekenen (W)'], ['text', 'T', 'Tekst (T)'],
  ['box', '▭', 'Kader / toestelgrens (B)'], ['pan', '✋', 'Pannen (H)'],
];
const toolBtns = new Map();
const gridSel = h('select', { title: 'Raster', onchange: (e) => { editor.grid = +e.target.value; } },
  [5, 2.5, 1].map((g) => h('option', { value: g, selected: g === 5 }, `raster ${g}`)));
const pageLbl = h('span', { class: 'pagelbl' });
const schemTools = h('span', { class: 'tgroup only-schematic' });
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
  h('span', { class: 'grow' }),
  btn('◀', 'Vorige pagina (PgUp)', () => app.setPage(app.pageIdx - 1)),
  pageLbl,
  btn('▶', 'Volgende pagina (PgDn)', () => app.setPage(app.pageIdx + 1)));

// plan toolbar (building mode)
const planTools = [
  ['select', '⬚', 'Selecteren (V)'], ['wall', '▬', 'Muur tekenen (W) – typ een lengte + Enter'],
  ['door', '🚪', 'Deur (D)', { type: 'door' }], ['window', '⊟', 'Raam (N)', { type: 'window' }],
  ['slide', '⇆', 'Schuifraam / -deur', { type: 'slide' }], ['door2', '⇿', 'Dubbele deur', { type: 'door2' }],
  ['stair', '☰', 'Trap (sleep een rechthoek)'], ['text', 'T', 'Ruimtenaam (T)'], ['link', '🔗', 'Koppelen (L): klik bron, dan doelen'],
  ['pan', '✋', 'Pannen (H)'],
];
const planBtns = new Map();
const wallSel = h('select', { title: 'Muurtype voor nieuwe muren', onchange: (e) => { const [k, t] = e.target.value.split(':'); plan.wallKind = k; plan.wallT = +t; } },
  [['outer:30', 'Buitenmuur 30'], ['outer:40', 'Buitenmuur 40'], ['inner:14', 'Binnenmuur 14'], ['inner:10', 'Binnenmuur 10'], ['inner:7', 'Scheidingswand 7']]
    .map(([v, l]) => h('option', { value: v }, l)));
const circSel = h('select', { title: 'Actieve kring: nieuwe symbolen komen in deze kring', onchange: (e) => { plan.activeCircuit = e.target.value; } });
const fillCircuits = () => {
  if (!app.project) return;
  circSel.replaceChildren(...[['', 'Kring: —'], ...circuitOptions(app.project.building, false).map(([v, l]) => [v, 'Kring ' + l])]
    .map(([v, l]) => h('option', { value: v, selected: v === plan.activeCircuit }, l)));
};
const floorLbl = h('span', { class: 'pagelbl' });
$('#toolbar').append(h('span', { class: 'tgroup only-building' },
  ...planTools.map(([k, icon, title, o]) => {
    const b = btn(icon, title, () => plan.setTool(o ? 'opening' : k, o), 'tool');
    planBtns.set(k, b);
    return b;
  }),
  h('span', { class: 'sep' }), wallSel, circSel,
  h('span', { class: 'sep' }),
  btn('⟳', 'Draaien (R)', () => plan.rotate()),
  btn('−', 'Uitzoomen', () => plan.zoomBy(1.25)),
  btn('+', 'Inzoomen', () => plan.zoomBy(0.8)),
  btn('⤢', 'Passend (F)', () => plan.fit()),
  h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: true, onchange: (e) => { plan.showGrid = e.target.checked; plan.render(); } }), 'raster'),
  h('span', { class: 'grow' }),
  btn('◀', 'Vorige verdieping', () => app.setFloor(app.floorIdx - 1)),
  floorLbl,
  btn('▶', 'Volgende verdieping', () => app.setFloor(app.floorIdx + 1))));

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
const PLAN_HINTS = {
  select: 'Klik = selecteren · slepen = verplaatsen (muurhoeken schuiven mee, deuren / ramen langs de muur) · dubbelklik = eigenschappen',
  wall: 'Klik punten om muren te tekenen · typ een lengte in cm + Enter · klik op het beginpunt of dubbelklik / Esc = einde · Alt = vrij',
  opening: 'Klik op een muur om de opening te plaatsen · kant van de muis = draairichting',
  stair: 'Sleep een rechthoek voor de trap',
  text: 'Klik in een ruimte om een naam te plaatsen',
  place: 'Klik om te plaatsen (tegen de dichtstbijzijnde muur) · R draaien · Alt = vrij plaatsen · Esc = stoppen',
  link: 'Klik eerst de bediening (schakelaar / ingang / paneel), dan de toestellen die erbij horen · opnieuw klikken = ontkoppelen · Esc',
  pan: 'Sleep om te verschuiven',
};

// panels
const buildingLeft = h('div', { id: 'building-left', class: 'only-building' });
$('#left').append(buildingLeft);
buildingLeftPanel(app, buildingLeft, { plan });
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
propertiesPanel(app, $('#props'), { editor, building: () => buildingProps(app, plan) });

// ---------- events ----------
app.on('change', () => {
  if (app.mode === 'building') plan.render(); else editor.render();
  floorLbl.textContent = `${app.floor.name} (${app.floorIdx + 1}/${app.project.building.floors.length})`;
  pageLbl.textContent = `${app.pageIdx + 1} / ${app.project.pages.length}  ${app.page.title}`;
  undoBtn.disabled = !app.undoStack.length;
  redoBtn.disabled = !app.redoStack.length;
  nameEl.textContent = app.project.name;
  document.title = `${app.project.name} – Kringo`;
});
app.on('selection', () => { if (app.mode === 'building') plan.render(); else editor.render(); });
app.on('mode', (m) => {
  document.body.dataset.mode = m;
  for (const b of document.querySelectorAll('.modes button')) b.classList.toggle('active', b.dataset.mode === m);
  hintEl.textContent = m === 'building' ? PLAN_HINTS[plan.tool] : HINTS[editor.tool];
  requestAnimationFrame(() => { (m === 'building' ? plan : editor).applyView(); });
  fillCircuits();
});
app.on('planTool', (t) => {
  for (const [k, b] of planBtns) b.classList.toggle('active', t === 'opening' ? k === plan.openingType : k === t);
  hintEl.textContent = PLAN_HINTS[t] || '';
});
app.on('planCursor', ([x, y]) => { cursorEl.textContent = `x ${Math.round(x)} cm  y ${Math.round(y)} cm`; });
app.on('planCircuits', fillCircuits);
app.on('project', fillCircuits);
app.on('planRequestText', async (p) => {
  const t = await prompt('Naam van de ruimte', '', { label: 'bv. Keuken, Badkamer, Slaapkamer 1' });
  if (t) plan.addText(p, t);
});
app.on('planEditText', async (id) => {
  const t = app.floor.texts.find((x) => x.id === id);
  if (!t) return;
  const v = await prompt('Naam van de ruimte', t.text);
  if (v !== null) app.mutate(() => { t.text = v; });
});
app.on('page', () => editor.render());
app.on('tool', (t) => {
  for (const [k, b] of toolBtns) b.classList.toggle('active', k === t);
  hintEl.textContent = HINTS[t] || '';
});
app.on('cursor', ([x, y]) => {
  const l = locate(app.project, x, y, app.page);
  cursorEl.textContent = `x ${x}  y ${y}  ·  kolom ${l.col}${l.row}`;
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
window.addEventListener('beforeunload', () => { app.save(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) app.save(); });

// ---------- start ----------
let project = null;
const last = localStorage.getItem('elecad.last');
if (last) project = await loadProject(last);
if (!project) {
  const all = await listProjects();
  if (all.length) project = await loadProject(all[0].id);
}
if (!project) {
  project = demoProject(lib);
  toast('Demoproject geladen – maak een nieuw project via "Nieuw"');
}
app.setProject(project);
localStorage.setItem('elecad.last', project.id);
await app.save();
editor.setTool('select');
plan.setTool('select');
app.emit('mode', app.mode);
app.emit('saved');
