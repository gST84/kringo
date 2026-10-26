// Entry point: builds the UI and wires everything together.
import { App } from './app.js';
import { Library } from './symbols/library.js';
import { SchematicEditor } from './schematic/editor.js';
import { PlanEditor } from './building/editor.js';
import { buildingLeftPanel, buildingProps, cablesDialog, circuitOptions, circuitsDialog, domoticsDialog, generateDialog, influencesDialog } from './building/panels.js';
import { libraryPanel, pagesPanel, propertiesPanel } from './ui/panels.js';
import { listsDialog } from './ui/lists.js';
import { openSymbolEditor } from './ui/symbolEditor.js';
import { setupPwa } from './pwa.js';
import {
  exportProjectFile, importProjectFile, openProjectFile, openDialog, printDialog, projectDialog, renumberDialog, settingsDialog,
} from './ui/project.js';
import { startNewProject, startScreen } from './ui/start.js';
import { prompt, toast } from './ui/dialogs.js';
import { guessPreset, newRoom, presetInfl, presetOf, syncPresets } from './building/rooms.js';
import { lastProjectId, listProjects, loadProject } from './storage.js';
import { demoProject } from './demo.js';
import { locate } from './model.js';
import { cursorIcon, DONATE_URL, h, icon, MANUAL_URL } from './util.js';

import { LANGS, lang, setLang, startAutoTranslate, t } from './i18n.js';
import { initSplitters } from './ui/splitters.js';
import { versionButton } from './version.js';
startAutoTranslate();
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
document.body.dataset.kind = 'schematic';

const btn = (label, title, onclick, cls = '') => h('button', { title, 'aria-label': title, onclick, class: cls }, typeof label === 'function' ? label() : label);

const saveEl = h('span', { class: 'savestate' });
const kindEl = h('span', { class: 'kindbadge', title: 'Soort project' });
const nameEl = h('button', { class: 'projname', title: 'Projectgegevens', onclick: () => projectDialog(app) });
const undoBtn = btn('↶', 'Ongedaan maken (Ctrl+Z)', () => app.undo());
const redoBtn = btn('↷', 'Opnieuw (Ctrl+Y)', () => app.redo());

$('#top').append(
  h('div', { class: 'brand' }, h('img', { class: 'logo', src: 'icons/icon.svg', alt: '' }), 'Kringo'),
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
    btn('Instellingen', 'Nummering en bladindeling', () => settingsDialog(app), 'kind-schematic'),
    btn('Hernummeren', 'Toestellen / klemmen hernummeren', () => renumberDialog(app), 'kind-schematic'),
    btn('Lijsten', 'Toestellen-, klemmen-, draad- en PLC-lijst', () => listsDialog(app), 'kind-schematic'),
    btn('Kringen', 'Kringen, verdeelborden en differentiëlen (AREI)', () => circuitsDialog(app), 'kind-building'),
    btn('Domotica', 'Domotica-modules en hun kanalen', () => domoticsDialog(app), 'kind-building'),
    btn('Invloeden', 'Uitwendige invloeden per ruimte: tabel, CSV en blad', () => influencesDialog(app), 'kind-building'),
    btn('Kabels', 'Kabeltrace op het grondplan en kabellengtes per type', () => cablesDialog(app), 'kind-building'),
    btn('Eendraadschema', 'Eendraadschema genereren uit de plattegronden', () => generateDialog(app), 'kind-building'),
    h('span', { class: 'sep' }),
    undoBtn, redoBtn, saveEl),
  setupPwa({ onFile: async (f) => { await app.save(); openProjectFile(app, f); } }),
  kindEl,
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
/** Page choice: 'f:<i>' = floor plan, 'p:<i>' = sheet (switches between plan and sheets in building projects). */
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
  h('span', { class: 'grow' }),
  btn('◀', 'Vorige pagina (PgUp)', () => app.setPage(app.pageIdx - 1)),
  pageLbl,
  btn('▶', 'Volgende pagina (PgDn)', () => app.setPage(app.pageIdx + 1)));

// plan toolbar (building mode)
// the drawing tools themselves are in the left panel ('Grondplan')
const planTools = [['select', cursorIcon, 'Selecteren (V)'], ['pan', '✋', 'Pannen (H)']];
const planBtns = new Map();
const wallSel = h('select', { title: 'Muurtype voor nieuwe muren', onchange: (e) => { const [k, t] = e.target.value.split(':'); plan.wallKind = k; plan.wallT = +t; } },
  [['outer:30', 'Buitenmuur 30'], ['outer:40', 'Buitenmuur 40'], ['inner:14', 'Binnenmuur 14'], ['inner:10', 'Binnenmuur 10'], ['inner:7', 'Scheidingswand 7']]
    .map(([v, l]) => h('option', { value: v }, l)));
const circSel = h('select', { title: 'Actieve kring: nieuwe symbolen komen in deze kring', onchange: (e) => { plan.activeCircuit = e.target.value; } });
const fillCircuits = () => {
  if (!app.project) return;
  circSel.replaceChildren(...[['', 'Kring: —'], ...circuitOptions(app.project.building, false).map(([v, l]) => [v, t('Kring') + ' ' + l])]
    .map(([v, l]) => h('option', { value: v, selected: v === plan.activeCircuit }, l)));
};
const traceBox = h('input', { type: 'checkbox', onchange: (e) => { app.mutate(() => { app.project.building.traceShow = e.target.checked; }); app.emit('change'); } });
const traceChk = h('label', { class: 'check small', title: 'Kabeltrace tonen (genereren via Kabels)' }, traceBox, 'kabels');
const syncTrace = () => {
  const b = app.project?.building;
  traceChk.hidden = !b?.traces;
  traceBox.checked = !!b?.traceShow;
};
const floorLbl = h('select', { class: 'pagesel', title: 'Pagina kiezen', onchange: (e) => goTo(e.target.value) });
$('#toolbar').append(h('span', { class: 'tgroup view-plan' },
  ...planTools.map(([k, icon, title, tool, o]) => {
    const b = btn(icon, title, () => plan.setTool(tool || k, { ...(o || {}), key: k }), 'tool');
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
  traceChk,
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
  stair: 'Sleep een rechthoek voor de trap · klik = standaardmaat',
  spiral: 'Sleep van het midden naar buiten voor de wenteltrap · klik = straal 100 cm',
  arcwall: 'Klik het beginpunt, dan het eindpunt, dan een punt op de boog · Esc = stoppen',
  dim: 'Klik twee meetpunten (vangt muurhoeken), dan de plaats van de maatlijn · Alt = vrij',
  area: 'Klik de hoekpunten van het vlak · klik het eerste punt, dubbelklik of Enter = sluiten · Backspace = punt terug · Esc',
  line: 'Klik de punten van de lijn · dubbelklik, Enter of rechtermuisknop = einde · Backspace = punt terug · Esc',
  calib: 'Klik twee punten op de achtergrond waarvan je de werkelijke afstand kent',
  strip: 'LED-strip: klik de punten van de strip (het eerste punt is de voeding) · dubbelklik, Enter of rechtermuisknop = einde · Backspace = punt terug · Esc',
  room: 'Klik in een ruimte: de omtrek wordt tussen de muren gezocht en volgt de muren als je ze verplaatst',
  roomPoly: 'Klik de hoeken van de ruimte (hoeken op een muurhoek volgen de muur) · eerste punt, dubbelklik of Enter = sluiten · Backspace = punt terug · Esc',
  callout: 'Tekstballon: klik het punt waarnaar hij wijst, dan de plaats van de ballon · tekstvak: klik de plaats · Esc',
  text: 'Klik in een ruimte om een naam te plaatsen',
  place: 'Klik om te plaatsen (tegen de dichtstbijzijnde muur) · R draaien · Alt = vrij plaatsen · Esc = stoppen',
  link: 'Klik de symbolen na elkaar: 1 → 2 → 3 … (bv. schakelaar → lamp → lamp) · opnieuw klikken op een gekoppeld paar = ontkoppelen · Esc = stoppen',
  pan: 'Sleep om te verschuiven',
};

// panels
initSplitters();
const buildingLeft = h('div', { id: 'building-left', class: 'kind-building' });
$('#left').append(buildingLeft);
buildingLeftPanel(app, buildingLeft, { plan, editor });
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
$('#toolbar').append(panelBtn('right', 'ⓘ', 'Eigenschappen tonen'));

// ---------- events ----------
app.on('change', () => {
  syncTrace();
  if (app.mode === 'building') plan.render(); else editor.render();
  const floors = app.project.building.floors;
  const onPlan = app.mode === 'building';
  const floorOpts = () => floors.map((f, i) => h('option', { value: 'f:' + i, selected: onPlan && i === app.floorIdx }, `${f.name} (${i + 1}/${floors.length})`));
  const pages = app.project.pages;
  const pageOpts = (after) => pages.map((pg, i) => h('option', { value: 'p:' + i, selected: !onPlan && i === app.pageIdx },
    after ? `${pg.title} (${i + 1}/${pages.length})` : `${i + 1} / ${pages.length}  ${pg.title}`));
  if (app.project.kind === 'building') {
    // floor plans and single-line sheets in one list, grouped
    const grouped = () => [
      h('optgroup', { label: t('Plattegronden') }, floorOpts()),
      pages.length ? h('optgroup', { label: t('Bladen') }, pageOpts(true)) : null,
    ];
    floorLbl.replaceChildren(...grouped());
    pageLbl.replaceChildren(...grouped());
  } else {
    pageLbl.replaceChildren(...pageOpts());
  }
  kindEl.textContent = app.project.kind === 'building' ? '🏠 Gebouw' : '🗄 Stuurkast';
  document.body.dataset.kind = app.project.kind;
  undoBtn.disabled = !app.undoStack.length;
  redoBtn.disabled = !app.redoStack.length;
  nameEl.textContent = app.project.name;
  document.title = `${app.project.name} – Kringo`;
});
app.on('selection', () => { if (app.mode === 'building') plan.render(); else editor.render(); });
app.on('mode', (m) => {
  document.body.dataset.mode = m;
  document.body.dataset.kind = app.project.kind;
  hintEl.textContent = m === 'building' ? PLAN_HINTS[plan.tool] : HINTS[editor.tool];
  requestAnimationFrame(() => { (m === 'building' ? plan : editor).applyView(); });
  fillCircuits();
});
app.on('planTool', (t) => {
  for (const [k, b] of planBtns) b.classList.toggle('active', k === plan.toolKey);
  if (app.mode === 'building') hintEl.textContent = PLAN_HINTS[t] || '';
});
app.on('planToast', (msg) => toast(msg));
app.on('planRequestRoom', async (data) => {
  const name = await prompt('Naam van de ruimte', '', { label: 'bv. Keuken, Badkamer, Slaapkamer 1 – het sjabloon voor de uitwendige invloeden wordt uit de naam afgeleid' });
  if (name === null) return;
  const preset = guessPreset(name);
  plan.addRoom(newRoom({ ...data, name, preset, infl: presetInfl(preset), pub: !!presetOf(preset)?.pub }));
});
app.on('planRequestCallout', async (pts) => {
  const v = await prompt('Tekst', '', { multiline: true });
  if (v) plan.addCallout(pts, v);
});
app.on('planEditCallout', async (id) => {
  const sh = app.floor.shapes.find((x) => x.id === id);
  if (!sh) return;
  const v = await prompt('Tekst bewerken', sh.text, { multiline: true });
  if (v !== null) app.mutate(() => { sh.text = v; });
});
app.on('planCalibrate', async ({ a, b, len }) => {
  const v = await prompt('Werkelijke afstand (cm)', '', { label: t('Gemeten op de achtergrond: {n} cm. Geef de echte afstand tussen beide punten.', { n: Math.round(len * 10) / 10 }) });
  const real = parseFloat(String(v || '').replace(',', '.'));
  if (real > 0) { plan.calibrate(a, b, real); toast(t('Schaal ingesteld.')); }
});
app.on('planCursor', ([x, y]) => { cursorEl.textContent = `x ${Math.round(x)} cm  y ${Math.round(y)} cm`; });
app.on('planCircuits', fillCircuits);
app.on('project', fillCircuits);
app.on('project', () => syncPresets(app.project.building));
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
  if (app.mode !== 'building') hintEl.textContent = HINTS[t] || '';
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
// open the last project behind the start screen, so closing the screen just continues
let project = null;
const last = lastProjectId();
if (last) project = await loadProject(last);
if (!project) {
  const all = await listProjects();
  if (all.length) project = await loadProject(all[0].id);
}
app.setProject(project || demoProject(lib));
await app.save();
editor.setTool('select');
plan.setTool('select');
app.emit('saved');
startScreen(app);
