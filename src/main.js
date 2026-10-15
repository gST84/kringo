// Entry point: builds the UI and wires everything together.
import { App } from './app.js';
import { Library } from './symbols/library.js';
import { SchematicEditor } from './schematic/editor.js';
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
app.editor = editor;

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
    btn('Instellingen', 'Nummering en bladindeling', () => settingsDialog(app)),
    btn('Hernummeren', 'Toestellen / klemmen hernummeren', () => renumberDialog(app)),
    btn('Lijsten', 'Toestellen-, klemmen-, draad- en PLC-lijst', () => listsDialog(app)),
    btn('Afdrukken', 'Afdrukken of PDF', () => printDialog(app)),
    h('span', { class: 'sep' }),
    undoBtn, redoBtn, saveEl),
  setupPwa({ onFile: async (f) => { await app.save(); openProjectFile(app, f); } }),
  h('div', { class: 'modes' },
    h('button', { class: 'active', title: 'Stuurkasten / industriële schema\'s' }, 'Stuurkasten'),
    h('button', { title: 'Gebouwen (AREI) – in ontwikkeling', onclick: buildingInfo }, 'Gebouwen')));

function buildingInfo() {
  modal({
    title: 'Modus Gebouwen',
    body: h('div', null,
      h('p', null, 'Deze modus is de volgende fase. Gepland:'),
      h('ul', null,
        h('li', null, 'Grondplan tekenen: muren, deuren, ramen, trappen'),
        h('li', null, 'AREI-symbolen: stopcontacten, schakelaars, lichtpunten, domotica in-/uitgangen en dimmers, zonnepanelen, omvormers, batterijen'),
        h('li', null, 'Symbolen koppelen aan kringen, extra info, onderlinge verbindingen'),
        h('li', null, 'Automatisch ééndraadschema volgens AREI, of zelf tekenen'))),
  });
}

// tools bar
const tools = [
  ['select', '⬚', 'Selecteren (V)'], ['wire', '╱', 'Draad tekenen (W)'], ['text', 'T', 'Tekst (T)'],
  ['box', '▭', 'Kader / toestelgrens (B)'], ['pan', '✋', 'Pannen (H)'],
];
const toolBtns = new Map();
const gridSel = h('select', { title: 'Raster', onchange: (e) => { editor.grid = +e.target.value; } },
  [5, 2.5, 1].map((g) => h('option', { value: g, selected: g === 5 }, `raster ${g}`)));
const pageLbl = h('span', { class: 'pagelbl' });
$('#toolbar').append(
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
propertiesPanel(app, $('#props'), { editor });

// ---------- events ----------
app.on('change', () => {
  editor.render();
  pageLbl.textContent = `${app.pageIdx + 1} / ${app.project.pages.length}  ${app.page.title}`;
  undoBtn.disabled = !app.undoStack.length;
  redoBtn.disabled = !app.redoStack.length;
  nameEl.textContent = app.project.name;
  document.title = `${app.project.name} – Kringo`;
});
app.on('selection', () => editor.render());
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
app.emit('saved');
