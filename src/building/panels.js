// Panels and dialogs of the building mode: floors, AREI symbol library, properties, circuits.
import { clone, h, natCmp } from '../util.js';
import { field, confirmDlg, modal, prompt, toast } from '../ui/dialogs.js';
import { symbolPreviewSvg } from '../schematic/render.js';
import { circuitSymbols, newBoard, newCircuit, newFloor, nextCircuitName, nextNumber, wallFrame } from './model.js';
import { checkCircuits, MAX_IN } from './rules.js';
import { generateEendraad, cableText } from './eendraad.js';
import { OPENING_TYPES } from './editor.js';
import { uid } from '../util.js';

const inp = (value, commit, { type = 'text', key, placeholder, list, step } = {}) => {
  const el = h('input', { type, value: value ?? '', 'data-key': key, placeholder, list, step });
  el.addEventListener('change', () => commit(type === 'number' ? parseFloat(String(el.value).replace(',', '.')) : el.value));
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.blur(); });
  return el;
};
const sel = (value, options, commit, key) => {
  const el = h('select', { 'data-key': key }, options.map(([v, l]) => h('option', { value: v, selected: String(v) === String(value ?? '') }, l)));
  el.addEventListener('change', () => commit(el.value));
  return el;
};
const section = (title, ...children) => h('div', { class: 'psec' }, h('h3', null, title), ...children);

export const circuitOptions = (b, withNone = true) => [
  ...(withNone ? [['', '— geen kring —']] : []),
  ...[...b.circuits].sort((a, c) => natCmp(a.name, c.name)).map((c) => [c.id, `${c.name}${c.desc ? ' – ' + c.desc : ''}`]),
];

// ---------- left panel: AREI symbols + floors ----------

export function buildingLeftPanel(app, el, { plan }) {
  let tab = 'symbols';
  let filter = '';
  const open = new Set(['AREI', 'AREI/Verlichting', 'AREI/Stopcontacten', 'AREI/Schakelaars']);
  const render = () => {
    const tabs = h('div', { class: 'tabs inner' },
      h('button', { class: tab === 'symbols' ? 'active' : '', onclick: () => { tab = 'symbols'; render(); } }, 'Symbolen'),
      h('button', { class: tab === 'floors' ? 'active' : '', onclick: () => { tab = 'floors'; render(); } }, 'Verdiepingen'));
    el.replaceChildren(tabs, tab === 'symbols' ? symbolsTab() : floorsTab());
  };

  const symbolsTab = () => {
    const search = h('input', { type: 'search', placeholder: 'Zoek symbool…', class: 'search', value: filter });
    search.addEventListener('input', () => { filter = search.value; tree.replaceChildren(...treeNodes()); });
    const tree = h('div', { class: 'tree' }, ...treeNodes());
    return h('div', { class: 'panel' }, search, tree);
  };
  const treeNodes = () => {
    const root = app.lib.tree(filter).folders.get('AREI');
    if (!root) return [h('p', { class: 'hint' }, 'Geen symbolen gevonden.')];
    const out = [];
    for (const f of [...root.folders.values()]) {
      if (f.name === 'Eendraad') continue;
      const isOpen = filter || open.has(f.path);
      out.push(h('div', { class: 'folder' + (isOpen ? ' open' : ''), onclick: () => { open.has(f.path) ? open.delete(f.path) : open.add(f.path); render(); } },
        h('span', { class: 'caret' }, isOpen ? '▾' : '▸'), ' ', f.name));
      if (!isOpen) continue;
      out.push(h('div', { class: 'symgrid' }, f.symbols.map((d) => {
        const item = h('div', {
          class: 'sym' + (plan.placing?.sym === d.id ? ' active' : ''), title: `${d.name}\nKlik: plaatsen · sleep naar plan`, draggable: 'true',
          onclick: () => { plan.setTool('place', { sym: d.id }); render(); },
          ondragstart: (e) => e.dataTransfer.setData('text/x-kringo-symbol', d.id),
        });
        item.innerHTML = symbolPreviewSvg(d, 34);
        item.append(h('span', null, d.name));
        return item;
      })));
    }
    return out;
  };

  const floorsTab = () => {
    const b = app.project.building;
    const move = (d) => {
      const i = app.floorIdx, j = i + d;
      if (j < 0 || j >= b.floors.length) return;
      app.mutate(() => { const [f] = b.floors.splice(i, 1); b.floors.splice(j, 0, f); });
      app.floorIdx = j;
      app.emit('change');
    };
    return h('div', { class: 'panel' },
      h('div', { class: 'panel-tools' },
        h('button', {
          onclick: async () => {
            const name = await prompt('Nieuwe verdieping', ['Gelijkvloers', 'Verdieping 1', 'Verdieping 2', 'Zolder', 'Kelder'][b.floors.length] || `Verdieping ${b.floors.length}`);
            if (name === null) return;
            app.mutate(() => b.floors.push(newFloor(name)));
            app.setFloor(b.floors.length - 1);
          },
        }, '＋ Verdieping'),
        h('button', { title: 'Omhoog', onclick: () => move(-1) }, '↑'),
        h('button', { title: 'Omlaag', onclick: () => move(1) }, '↓'),
        h('button', {
          class: 'danger', title: 'Verdieping verwijderen',
          onclick: async () => {
            if (b.floors.length < 2) return toast('Er moet minstens één verdieping zijn.');
            if (!(await confirmDlg('Verdieping verwijderen', `"${app.floor.name}" met alle muren en symbolen verwijderen?`, 'Verwijderen', true))) return;
            app.mutate(() => b.floors.splice(app.floorIdx, 1));
            app.floorIdx = Math.max(0, app.floorIdx - 1);
            app.sel.clear();
            app.emit('change');
          },
        }, '🗑')),
      h('ol', { class: 'pagelist' }, b.floors.map((f, i) => h('li', {
        class: i === app.floorIdx ? 'active' : '', onclick: () => app.setFloor(i),
        ondblclick: async () => { const n = await prompt('Naam verdieping', f.name); if (n !== null) app.mutate(() => { f.name = n; }); },
      }, h('span', { class: 'no' }, i + 1), h('span', { class: 'ttl' }, f.name),
      h('small', { class: 'hint' }, ` ${f.symbols.length} symb.`)))),
      h('p', { class: 'hint' }, 'Dubbelklik om te hernoemen.'));
  };
  app.on('change', () => { if (app.mode === 'building' && tab === 'floors') render(); });
  app.on('planTool', render);
  app.on('project', render);
  render();
}

// ---------- properties ----------

export function buildingProps(app, plan) {
  const b = app.project.building;
  const f = app.floor;
  const keys = [...app.sel];
  const set = (fn) => app.mutate(fn);
  if (!keys.length) return floorProps(app, plan);
  if (keys.length > 1) {
    const syms = f.symbols.filter((s) => app.sel.has('A:' + s.id));
    return [section(`${keys.length} elementen geselecteerd`,
      syms.length ? field(`Kring voor ${syms.length} symbool/symbolen`, sel('', [['', '— kies —'], ...circuitOptions(b, false)], (v) => set(() => {
        for (const s of syms) { s.circuit = v; s.n = nextNumber(b, v); }
      }), 'mcirc')) : null,
      h('div', { class: 'btnrow' },
        h('button', { onclick: () => plan.rotate() }, '⟳ Draaien (R)'),
        h('button', { class: 'danger', onclick: () => plan.deleteSelection() }, 'Verwijderen')))];
  }
  const [t, id] = keys[0].split(':');
  if (t === 'W') {
    const w = f.walls.find((x) => x.id === id);
    if (!w) return [];
    const { len, u } = wallFrame(w);
    return [section('Muur',
      field('Soort', sel(w.kind || 'outer', [['outer', 'Buitenmuur'], ['inner', 'Binnenmuur']], (v) => set(() => { w.kind = v; }), 'wkind')),
      field('Dikte (cm)', inp(w.t, (v) => set(() => { w.t = Math.max(1, v || 10); }), { type: 'number', key: 'wt' })),
      field('Lengte (cm)', inp(Math.round(len * 10) / 10, (v) => set(() => {
        if (!(v > 0)) return;
        w.x2 = Math.round((w.x1 + u[0] * v) * 100) / 100; w.y2 = Math.round((w.y1 + u[1] * v) * 100) / 100;
      }), { type: 'number', key: 'wlen' }), 'Verlengt / verkort vanaf het beginpunt.'),
      h('div', { class: 'btnrow' }, h('button', { class: 'danger', onclick: () => plan.deleteSelection() }, 'Verwijderen')))];
  }
  if (t === 'O') {
    const o = f.openings.find((x) => x.id === id);
    if (!o) return [];
    return [section(OPENING_TYPES[o.type]?.label || 'Opening',
      field('Type', sel(o.type, Object.entries(OPENING_TYPES).map(([k, v]) => [k, v.label]), (v) => set(() => { o.type = v; }), 'otype')),
      h('div', { class: 'grid2' },
        field('Breedte (cm)', inp(o.width, (v) => set(() => { o.width = Math.max(10, v || 80); }), { type: 'number', key: 'ow' })),
        field('Hoogte (cm)', inp(o.height, (v) => set(() => { o.height = v; }), { type: 'number', key: 'oh' }))),
      h('div', { class: 'btnrow' },
        h('button', { onclick: () => set(() => { o.side = o.side === -1 ? 1 : -1; }) }, '⇅ Draairichting'),
        h('button', { onclick: () => set(() => { o.hinge = o.hinge === 'r' ? 'l' : 'r'; }) }, '⇆ Scharnierzijde'),
        h('button', { class: 'danger', onclick: () => plan.deleteSelection() }, 'Verwijderen')),
      h('p', { class: 'hint' }, 'Verslepen schuift de opening langs de muur.'))];
  }
  if (t === 'S') {
    const st = f.stairs.find((x) => x.id === id);
    if (!st) return [];
    return [section('Trap',
      h('div', { class: 'grid2' },
        field('Breedte (cm)', inp(st.w, (v) => set(() => { st.w = v; }), { type: 'number', key: 'sw' })),
        field('Lengte (cm)', inp(st.h, (v) => set(() => { st.h = v; }), { type: 'number', key: 'sh' })),
        field('Treden', inp(st.steps, (v) => set(() => { st.steps = Math.round(v); }), { type: 'number', key: 'ss' })),
        field('Rotatie (°)', inp(st.rot || 0, (v) => set(() => { st.rot = v; }), { type: 'number', key: 'sr' }))),
      h('div', { class: 'btnrow' }, h('button', { class: 'danger', onclick: () => plan.deleteSelection() }, 'Verwijderen')))];
  }
  if (t === 'T') {
    const tx = f.texts.find((x) => x.id === id);
    if (!tx) return [];
    return [section('Ruimte / tekst',
      field('Naam', inp(tx.text, (v) => set(() => { tx.text = v; }), { key: 'tt' })),
      field('Extra regel (bv. oppervlakte)', inp(tx.area, (v) => set(() => { tx.area = v; }), { key: 'ta', placeholder: 'bv. 24 m²' })),
      field('Grootte (mm)', inp(tx.size || 3, (v) => set(() => { tx.size = v || 3; }), { type: 'number', key: 'ts' })),
      h('div', { class: 'btnrow' }, h('button', { class: 'danger', onclick: () => plan.deleteSelection() }, 'Verwijderen')))];
  }
  if (t === 'L') {
    return [section('Koppeling', h('p', { class: 'hint' }, 'Stippellijn tussen bediening en toestel.'),
      h('button', { class: 'danger', onclick: () => plan.deleteSelection() }, 'Koppeling verwijderen'))];
  }
  if (t === 'A') return symbolProps(app, plan, f.symbols.find((x) => x.id === id));
  return [];
}

function symbolProps(app, plan, s) {
  if (!s) return [];
  const b = app.project.building;
  const f = app.floor;
  const def = app.lib.get(s.sym);
  const set = (fn) => app.mutate(fn);
  const setProp = (k) => (v) => set(() => { s.props[k] = v; });
  const head = h('div', { class: 'comphead' });
  if (def) head.innerHTML = symbolPreviewSvg(def, 40);
  head.append(h('div', null, h('b', null, def?.name || 'Symbool'), h('small', null, (def?.folder || '').replace('AREI/', 'AREI · '))));
  const extra = [];
  const kind = def?.kind;
  if (kind === 'light' || kind === 'appliance' || kind === 'other') extra.push(field('Vermogen (W)', inp(s.props.power, setProp('power'), { type: 'number', key: 'pw' })));
  if (kind === 'pv') extra.push(field('Piekvermogen (Wp)', inp(s.props.wp, setProp('wp'), { type: 'number', key: 'wp' })), field('Aantal panelen', inp(s.props.count, setProp('count'), { type: 'number', key: 'pc' })));
  if (kind === 'inverter') extra.push(field('Vermogen (kW)', inp(s.props.kw, setProp('kw'), { type: 'number', key: 'kw' })));
  if (kind === 'battery') extra.push(field('Capaciteit (kWh)', inp(s.props.kwh, setProp('kwh'), { type: 'number', key: 'kwh' })));
  if (kind === 'dom-in' || kind === 'dom-out') extra.push(field('Domotica-adres / kanaal', inp(s.props.addr, setProp('addr'), { key: 'da', placeholder: 'bv. module 2 – kanaal 4' })));
  const symById = new Map(f.symbols.map((x) => [x.id, x]));
  const links = f.links.filter((l) => l.a === s.id || l.b === s.id);
  const label = (o) => {
    const c = b.circuits.find((x) => x.id === o.circuit);
    return `${app.lib.get(o.sym)?.name || '?'}${c ? ` (${c.name}${o.n ?? ''})` : ''}`;
  };
  return [
    head,
    section('Kring',
      field('Kring', sel(s.circuit || '', [...circuitOptions(b), ['__new', '＋ nieuwe kring…']], (v) => set(() => {
        if (v === '__new') {
          const c = newCircuit(nextCircuitName(b), b.boards[0]?.id);
          if (kind === 'light') { c.In = 16; c.section = 1.5; c.desc = 'Verlichting'; }
          b.circuits.push(c);
          v = c.id;
        }
        s.circuit = v;
        s.n = v ? nextNumber(b, v) : undefined;
        plan.activeCircuit = v;
        app.emit('planCircuits');
      }), 'circ')),
      s.circuit ? field('Volgnummer in de kring', inp(s.n, (v) => set(() => { s.n = Math.round(v) || 1; }), { type: 'number', key: 'n' })) : null),
    section('Gegevens',
      field('Ruimte / plaats', inp(s.props.room, setProp('room'), { key: 'room', placeholder: 'bv. Keuken' })),
      field('Omschrijving', inp(s.props.desc, setProp('desc'), { key: 'desc' })),
      field('Montagehoogte (cm)', inp(s.props.height, setProp('height'), { type: 'number', key: 'h' })),
      ...extra),
    section('Koppelingen',
      links.length ? h('ul', { class: 'linked' }, links.map((l) => {
        const o = symById.get(l.a === s.id ? l.b : l.a);
        return h('li', null, o ? label(o) : '?', ' ', h('button', { class: 'link', onclick: () => set(() => { f.links = f.links.filter((x) => x !== l); }) }, 'ontkoppelen'));
      })) : h('p', { class: 'hint' }, 'Nog geen koppelingen.'),
      h('button', {
        onclick: () => { plan.setTool('link'); plan.linkFrom = s.id; plan.render(); },
        title: 'Klik daarna op de symbolen die je wil koppelen (bv. lichtpunten bij een schakelaar). Esc = stoppen.',
      }, '🔗 Koppelen…')),
    section('Plaatsing', h('div', { class: 'btnrow' },
      h('button', { onclick: () => plan.rotate() }, '⟳ Draaien (R)'),
      h('button', { class: 'danger', onclick: () => plan.deleteSelection() }, 'Verwijderen'))),
  ];
}

function floorProps(app, plan) {
  const b = app.project.building;
  const f = app.floor;
  const set = (fn) => app.mutate(fn);
  const checks = checkCircuits(b, app.lib);
  const errors = checks.filter((c) => c.level === 'error').length;
  return [
    section(f.name,
      field('Naam', inp(f.name, (v) => set(() => { f.name = v; }), { key: 'fname' })),
      h('div', { class: 'grid2' },
        field('Schaal 1:', sel(b.scale, [[20, '20'], [50, '50'], [75, '75'], [100, '100']], (v) => set(() => { b.scale = +v; }), 'scale')),
        field('Raster (cm)', sel(b.grid, [[1, '1'], [5, '5'], [10, '10'], [25, '25']], (v) => set(() => { b.grid = +v; }), 'grid')))),
    section('Kringen',
      h('p', null, `${b.circuits.length} kring(en), ${b.boards.length} verdeelbord(en).`),
      checks.length ? h('p', { class: errors ? 'warn' : 'hint' }, `${errors ? '⚠ ' : ''}${checks.length} opmerking(en) bij de AREI-controle.`) : h('p', { class: 'hint' }, '✓ Geen opmerkingen.'),
      h('div', { class: 'btnrow' },
        h('button', { onclick: () => circuitsDialog(app) }, 'Kringen & borden…'),
        h('button', { class: 'primary', onclick: () => generateDialog(app) }, 'Eendraadschema'))),
    section('Sneltoetsen', h('p', { class: 'hint keys' },
      'W muur (cijfers + Enter = lengte in cm) · D deur · N raam · T ruimtenaam · L koppelen · R draaien · Del verwijderen · Ctrl+D dupliceren · Ctrl+Z / Y · F passend · Alt: zonder raster / niet tegen muur')),
  ];
}

// ---------- circuits dialog ----------

export async function circuitsDialog(app) {
  const b = app.project.building;
  const draft = { boards: clone(b.boards), circuits: clone(b.circuits) };
  const body = h('div', { class: 'circuits' });
  const temp = () => ({ ...b, boards: draft.boards, circuits: draft.circuits });
  const render = () => {
    const checks = checkCircuits(temp(), app.lib);
    const byCircuit = new Map();
    for (const c of checks) if (c.circuit) { if (!byCircuit.has(c.circuit)) byCircuit.set(c.circuit, []); byCircuit.get(c.circuit).push(c); }
    const boardsEl = h('div', { class: 'boards' }, draft.boards.map((bd) => h('div', { class: 'board' },
      h('div', { class: 'grid3' },
        field('Verdeelbord', inp(bd.name, (v) => { bd.name = v; render(); })),
        field('Hoofdschakelaar (A)', inp(bd.main.In, (v) => { bd.main.In = v; render(); }, { type: 'number' })),
        field('Algemene diff. (mA, 0 = geen)', inp(bd.main.rcd, (v) => { bd.main.rcd = v || 0; render(); }, { type: 'number' }))),
      h('div', { class: 'grid3' },
        field('Polen', sel(bd.main.poles || 2, [[2, '2P'], [4, '4P']], (v) => { bd.main.poles = +v; })),
        field('Voedingskabel', inp(bd.main.cable, (v) => { bd.main.cable = v; }, { placeholder: 'bv. XVB 4x10' }))),
      h('table', { class: 'list rcds' },
        h('thead', null, h('tr', null, h('th', null, 'Differentieel'), h('th', null, 'mA'), h('th', null, 'A'), h('th', null, 'Type'), h('th', null, ''))),
        h('tbody', null, bd.rcds.map((r) => h('tr', null,
          h('td', null, inp(r.name, (v) => { r.name = v; })),
          h('td', null, inp(r.sens, (v) => { r.sens = v; }, { type: 'number' })),
          h('td', null, inp(r.In, (v) => { r.In = v; }, { type: 'number' })),
          h('td', null, sel(r.type, [['AC', 'AC'], ['A', 'A'], ['F', 'F'], ['B', 'B']], (v) => { r.type = v; })),
          h('td', null, h('button', { class: 'icon danger', onclick: () => { bd.rcds = bd.rcds.filter((x) => x !== r); for (const c of draft.circuits) if (c.rcd === r.id) c.rcd = ''; render(); } }, '✕')))))),
      h('div', { class: 'btnrow' },
        h('button', { onclick: () => { bd.rcds.push({ id: uid('rc'), name: `Differentieel ${bd.rcds.length + 1}`, sens: 30, In: 40, type: 'A' }); render(); } }, '＋ Differentieel'),
        draft.boards.length > 1 ? h('button', { class: 'danger', onclick: () => { draft.boards = draft.boards.filter((x) => x !== bd); render(); } }, 'Bord verwijderen') : null))));
    const boardOpts = draft.boards.map((bd) => [bd.id, bd.name]);
    const rcdOpts = (c) => [['', '— (rechtstreeks)'], ...(draft.boards.find((bd) => bd.id === c.board)?.rcds || []).map((r) => [r.id, `${r.name} (${r.sens} mA)`])];
    const count = (c) => circuitSymbols(temp(), c.id).length;
    const table = h('table', { class: 'list circ' },
      h('thead', null, h('tr', null, ['Kring', 'Omschrijving', 'Bord', 'Differentieel', 'Curve', 'A', 'Polen', 'kA', 'Kabel', 'Aders', 'mm²', 'Punten', ''].map((x) => h('th', null, x)))),
      h('tbody', null, draft.circuits.map((c, ci) => {
        const warns = byCircuit.get(c.id) || [];
        return [
          h('tr', { class: warns.some((w) => w.level === 'error') ? 'err' : '' },
            h('td', null, inp(c.name, (v) => { c.name = v; render(); })),
            h('td', null, inp(c.desc, (v) => { c.desc = v; })),
            h('td', null, sel(c.board, boardOpts, (v) => { c.board = v; c.rcd = ''; render(); })),
            h('td', null, sel(c.rcd, rcdOpts(c), (v) => { c.rcd = v; render(); })),
            h('td', null, sel(c.curve, [['B', 'B'], ['C', 'C'], ['D', 'D']], (v) => { c.curve = v; })),
            h('td', null, sel(c.In, [6, 10, 16, 20, 25, 32, 40, 50, 63].map((x) => [x, x]), (v) => { c.In = +v; render(); })),
            h('td', null, sel(c.poles, [[1, '1P'], [2, '2P'], [3, '3P'], [4, '4P']], (v) => { c.poles = +v; })),
            h('td', null, sel(c.kA || 3, [[3, '3'], [4.5, '4,5'], [6, '6'], [10, '10']], (v) => { c.kA = +v; })),
            h('td', null, inp(c.cable, (v) => { c.cable = v; }, { list: 'cables' })),
            h('td', null, sel(c.cores, [['3G', '3G'], ['5G', '5G'], ['2x', '2x'], ['4G', '4G']], (v) => { c.cores = v; })),
            h('td', null, sel(c.section, Object.keys(MAX_IN).map(Number).sort((x, y) => x - y).map((x) => [x, String(x).replace('.', ',')]), (v) => { c.section = +v; render(); })),
            h('td', { class: 'num' }, count(c)),
            h('td', { class: 'nowrap' },
              h('button', { class: 'icon', title: 'Naar links in het eendraadschema', disabled: ci === 0, onclick: () => { draft.circuits.splice(ci - 1, 0, draft.circuits.splice(ci, 1)[0]); render(); } }, '↑'),
              h('button', { class: 'icon', title: 'Naar rechts in het eendraadschema', disabled: ci === draft.circuits.length - 1, onclick: () => { draft.circuits.splice(ci + 1, 0, draft.circuits.splice(ci, 1)[0]); render(); } }, '↓'),
              h('button', {
                class: 'icon danger', title: 'Kring verwijderen',
                onclick: () => { draft.circuits = draft.circuits.filter((x) => x !== c); render(); },
              }, '✕'))),
          warns.length ? h('tr', { class: 'warnrow' }, h('td', { colspan: 13 }, warns.map((w) => h('div', { class: 'chk ' + w.level }, (w.level === 'error' ? '⚠ ' : 'ℹ ') + w.text)))) : null,
        ];
      }).flat().filter(Boolean)));
    const general = checks.filter((c) => !c.circuit);
    body.replaceChildren(...[
      h('h3', null, 'Verdeelborden'), boardsEl,
      h('div', { class: 'btnrow' }, h('button', { onclick: () => { draft.boards.push(newBoard(`Onderverdeelbord ${draft.boards.length}`)); render(); } }, '＋ Verdeelbord')),
      h('h3', null, 'Kringen'),
      h('datalist', { id: 'cables' }, ['XVB', 'XGB', 'VOB', 'EXVB', 'XFVB'].map((x) => h('option', { value: x }))),
      h('div', { class: 'tablewrap' }, table),
      h('div', { class: 'btnrow' },
        h('button', { onclick: () => { draft.circuits.push(newCircuit(nextCircuitName(temp()), draft.boards[0].id)); render(); } }, '＋ Kring'),
        h('button', { onclick: () => { const c = newCircuit(nextCircuitName(temp()), draft.boards[0].id); c.In = 16; c.section = 1.5; c.desc = 'Verlichting'; draft.circuits.push(c); render(); } }, '＋ Verlichtingskring')),
      general.length ? h('div', null, general.map((w) => h('div', { class: 'chk ' + w.level }, 'ℹ ' + w.text))) : null,
    ].filter(Boolean));
  };
  render();
  const ok = await modal({
    title: 'Kringen & verdeelborden', wide: true, body,
    buttons: [{ label: 'Annuleren', value: false }, { label: 'Opslaan', value: true, primary: true }],
  });
  if (!ok) return;
  app.mutate(() => {
    b.boards = draft.boards;
    b.circuits = draft.circuits;
    const ids = new Set(b.circuits.map((c) => c.id));
    for (const f of b.floors) for (const s of f.symbols) if (s.circuit && !ids.has(s.circuit)) { s.circuit = ''; delete s.n; }
  });
  app.emit('planCircuits');
}

export async function generateDialog(app) {
  const b = app.project.building;
  const checks = checkCircuits(b, app.lib).filter((c) => c.level === 'error');
  const has = app.project.pages.some((p) => p.gen === 'eendraad');
  const ok = await modal({
    title: 'Eendraadschema genereren',
    body: h('div', null,
      h('p', null, `Per verdeelbord wordt een eendraadschema gemaakt als schemapagina('s) in de modus Stuurkasten: voeding, kWh-meter, hoofdschakelaar, differentiëlen, automaten en per kring de toestellen in volgorde (${b.circuits.length} kringen).`),
      has ? h('p', { class: 'warn' }, 'Eerder gegenereerde eendraadschema-pagina\'s worden vervangen (handmatige wijzigingen daarop gaan verloren).') : null,
      checks.length ? h('div', null, h('p', { class: 'warn' }, `⚠ ${checks.length} AREI-fout(en):`), checks.slice(0, 8).map((c) => h('div', { class: 'chk error' }, `${c.name ? 'Kring ' + c.name + ': ' : ''}${c.text}`))) : null),
    buttons: [{ label: 'Annuleren', value: false }, { label: 'Genereren', value: true, primary: true }],
  });
  if (!ok) return;
  let first = 0;
  app.mutate((p) => { first = generateEendraad(p, app.lib); });
  app.setMode('schematic');
  app.pageIdx = -1;
  app.setPage(first);
  toast('Eendraadschema gegenereerd');
}

export { cableText };
