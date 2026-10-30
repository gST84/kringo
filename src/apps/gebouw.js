// Kringo Gebouw: house and building installations (AREI) – floor plans, circuits, single-line diagram.
import { boot } from '../shell.js';
import { AREI } from '../building/arei.js';
import { PlanEditor } from '../building/editor.js';
import { buildingLeftPanel, buildingProps, cablesDialog, circuitOptions, circuitsDialog, domoticsDialog, generateDialog, influencesDialog } from '../building/panels.js';
import { guessPreset, newRoom, presetInfl, presetOf, syncPresets } from '../building/rooms.js';
import { toast } from '../ui/dialogs.js';
import { t } from '../i18n.js';
import { cursorIcon, h, ROOT, uid } from '../util.js';

/** The example house (a project file next to the app; cached by the service worker). */
async function houseDemo() {
  try {
    const r = await fetch(ROOT + 'demos/gebouw.kringo', { cache: 'no-cache' });
    const p = await r.json();
    p.id = uid('prj');
    p.updated = Date.now();
    return p;
  } catch {
    toast(t('Het voorbeeldproject kon niet geladen worden.'));
    return null;
  }
}

boot({
  kind: 'building',
  name: 'Kringo Gebouw',
  newText: 'Woning of gebouw volgens AREI: plattegronden, stopcontacten, verlichting, kringen en het eendraadschema.',
  fileText: '.kringo of .elecad',
  symbols: AREI,
  demos: [{ icon: '🏠', name: 'Woning', text: 'Woning met verlichting, stopcontacten, zonnepanelen, domotica, data, ruimtes, kabeltrace en eendraadschema', make: houseDemo }],
  initialProject: houseDemo,
  menu: ({ app, btn }) => [
    btn('Kringen', 'Kringen, verdeelborden en differentiëlen (AREI)', () => circuitsDialog(app)),
    btn('Domotica', 'Domotica-modules en hun kanalen', () => domoticsDialog(app)),
    btn('Invloeden', 'Uitwendige invloeden per ruimte: tabel, CSV en blad', () => influencesDialog(app)),
    btn('Kabels', 'Kabeltrace op het grondplan en kabellengtes per type', () => cablesDialog(app)),
    btn('Eendraadschema', 'Eendraadschema genereren uit de plattegronden', () => generateDialog(app)),
  ],
  // floor plans and single-line sheets in one list, grouped
  // (both in the sheet toolbar and in the floor plan toolbar)
  pageOptions: ({ app, floorLbl }, pageOpts) => {
    const floors = app.project.building.floors;
    const onPlan = app.mode === 'building';
    const grouped = () => [
      h('optgroup', { label: t('Plattegronden') }, floors.map((f, i) => h('option', { value: 'f:' + i, selected: onPlan && i === app.floorIdx }, `${f.name} (${i + 1}/${floors.length})`))),
      app.project.pages.length ? h('optgroup', { label: t('Bladen') }, pageOpts(true)) : null,
    ].filter(Boolean);
    floorLbl.replaceChildren(...grouped());
    return grouped();
  },
  setup(ctx) {
    const { app, editor, $, center, btn, goTo, cursorEl, hintEl, prompt } = ctx;
    const plan = new PlanEditor(app, center);
    app.plan = plan;
    ctx.views.building = plan;

    // plan toolbar
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

    // left panel: drawing tools, floors, symbols
    const left = h('div', { id: 'building-left', class: 'kind-building' });
    $('#left').append(left);
    buildingLeftPanel(app, left, { plan, editor });

    ctx.floorLbl = floorLbl;
    app.on('change', syncTrace);
    app.on('mode', (m) => {
      if (m === 'building') hintEl.textContent = PLAN_HINTS[plan.tool] || '';
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
    return { props: () => buildingProps(app, plan), started: () => plan.setTool('select') };
  },
});
