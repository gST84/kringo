// Panels and dialogs of the building mode: floors, AREI symbol library, properties, circuits.
import { t } from '../i18n.js';
import { clone, download, h, natCmp, safeName, toCsv } from '../util.js';
import { field, confirmDlg, modal, prompt, toast } from '../ui/dialogs.js';
import { symbolPreviewSvg } from '../schematic/render.js';
import { toggleFolder } from '../ui/panels.js';
import { channelUsers, circuitSymbols, clearModule, COLOR_NAMES, colorChannels, domAddress, LED_TYPES, MAX_CHANNELS, MODULE_TYPES, newBoard, newModule, newCircuit, newFloor, newRcd, nextCircuitName, nextPos, polygonArea, removeNode, rotateStair, rootBoards, linkGroup, setGroupCircuit, treeChildren, wallGeom } from './model.js';
import { checkCircuits, MAX_IN } from './rules.js';
import { generateEendraad, INSTALL } from './eendraad.js';
import { PLAN_PALETTE } from './editor.js';
import { dimGeom, hasLeaf, OPENING_TYPES, pathLength, traceColor } from './render.js';
import { loadBackground } from './background.js';
import { allPresets, deleteRoomPreset, INFLUENCES, isCustomPreset, NORMAL, presetInfl, presetOf, roomArea, roomPolygon, saveRoomPreset } from './rooms.js';
import { generateInfluences, influenceRows } from './influences.js';
import { cableTotals, generateTraces, symbolHeight, traceCfg, TRACE_FIELDS, traceKey } from './traces.js';

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
const chk = (value, commit, label, key) => {
  const el = h('input', { type: 'checkbox', checked: !!value, 'data-key': key });
  el.addEventListener('change', () => commit(el.checked));
  return h('label', { class: 'check' }, el, label);
};
const section = (title, ...children) => h('div', { class: 'psec' }, h('h3', null, title), ...children);

export const circuitOptions = (b, withNone = true) => [
  ...(withNone ? [['', '— geen kring —']] : []),
  ...[...b.circuits].sort((a, c) => natCmp(a.name, c.name)).map((c) => [c.id, `${c.name}${c.desc ? ' – ' + c.desc : ''}`]),
];

// ---------- left panel: AREI symbols + floors ----------

export function buildingLeftPanel(app, el, { plan, editor }) {
  let tab = 'symbols';
  let filter = '';
  const open = new Set(['Grondplan', 'Aantekeningen', 'AREI', 'AREI/Verlichting']);
  const render = () => {
    const tabs = h('div', { class: 'tabs inner' },
      h('button', { class: tab === 'symbols' ? 'active' : '', onclick: () => { tab = 'symbols'; render(); } }, 'Symbolen'),
      h('button', { class: tab === 'floors' ? 'active' : '', onclick: () => { tab = 'floors'; render(); } }, 'Bladen'));
    el.replaceChildren(tabs, tab === 'symbols' ? symbolsTab() : floorsTab());
  };

  const symbolsTab = () => {
    const search = h('input', { type: 'search', placeholder: 'Zoek symbool…', class: 'search', value: filter });
    search.addEventListener('input', () => { filter = search.value; tree.replaceChildren(...treeNodes()); });
    const tree = h('div', { class: 'tree' }, ...treeNodes());
    return h('div', { class: 'panel' }, search, tree);
  };
  const paletteNodes = () => {
    const q = filter.trim().toLowerCase();
    const out = [];
    for (const group of ['Grondplan', 'Aantekeningen']) {
      const items = PLAN_PALETTE.filter((p) => (p.group || 'Grondplan') === group && (!q || t(p.label).toLowerCase().includes(q) || p.label.toLowerCase().includes(q)));
      if (!items.length) continue;
      const isOpen = q || open.has(group);
      out.push(h('div', { class: 'folder' + (isOpen ? ' open' : ''), onclick: () => { toggleFolder(open, group); render(); } },
        h('span', { class: 'caret' }, isOpen ? '▾' : '▸'), ' ', group));
      if (isOpen) out.push(h('div', { class: 'symgrid tools' }, items.map((p) => {
        const item = h('div', {
          class: 'sym' + (app.mode === 'building' && !p.action && plan.tool !== 'place' && plan.toolKey === p.key ? ' active' : ''),
          title: p.label,
          onclick: () => {
            if (app.mode !== 'building') app.setMode('building');
            if (p.action === 'background') loadBackground(app);
            else plan.setTool(p.tool, { ...(p.opts || {}), key: p.key });
          },
        });
        item.innerHTML = p.icon;
        item.append(h('span', null, p.label));
        return item;
      })));
    }
    return out;
  };
  const treeNodes = () => {
    const root = app.lib.tree(filter).folders.get('AREI');
    const out = app.project?.kind === 'building' ? paletteNodes() : [];
    if (!root) return out.length ? out : [h('p', { class: 'hint' }, 'Geen symbolen gevonden.')];
    for (const f of [...root.folders.values()]) {
      if (f.name === 'Eendraad' && app.mode === 'building') continue;
      const isOpen = filter || open.has(f.path);
      out.push(h('div', { class: 'folder' + (isOpen ? ' open' : ''), onclick: () => { toggleFolder(open, f.path); render(); } },
        h('span', { class: 'caret' }, isOpen ? '▾' : '▸'), ' ', f.name));
      if (!isOpen) continue;
      out.push(h('div', { class: 'symgrid' }, f.symbols.map((d) => {
        const item = h('div', {
          class: 'sym' + ((app.mode === 'building' ? (plan.tool === 'strip' ? plan.stripSym : plan.placing?.sym) : editor.placing?.sym) === d.id ? ' active' : ''),
          title: t('{name}\nKlik: plaatsen · sleep naar het blad', { name: t(d.name) }), draggable: 'true',
          onclick: () => {
            if (d.strip && app.mode === 'building') plan.setTool('strip', { sym: d.id, key: 'strip' });
            else (app.mode === 'building' ? plan : editor).setTool('place', { sym: d.id });
            render();
          },
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
            const name = await prompt('Nieuwe verdieping', ['Gelijkvloers', 'Verdieping 1', 'Verdieping 2', 'Zolder', 'Kelder'].map((x) => t(x))[b.floors.length] || t('Verdieping {n}', { n: b.floors.length }));
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
            if (!(await confirmDlg('Verdieping verwijderen', t('"{name}" met alle muren en symbolen verwijderen?', { name: app.floor.name }), 'Verwijderen', true))) return;
            app.mutate(() => b.floors.splice(app.floorIdx, 1));
            app.floorIdx = Math.max(0, app.floorIdx - 1);
            app.sel.clear();
            app.emit('change');
          },
        }, '🗑')),
      h('ol', { class: 'pagelist' }, h('h4', null, 'Plattegronden'), b.floors.map((f, i) => h('li', {
        class: app.mode === 'building' && i === app.floorIdx ? 'active' : '', onclick: () => { app.setMode('building'); app.setFloor(i); },
        ondblclick: async () => { const n = await prompt('Naam verdieping', f.name); if (n !== null) app.mutate(() => { f.name = n; }); },
      }, h('span', { class: 'no' }, i + 1), h('span', { class: 'ttl' }, f.name),
      h('small', { class: 'hint' }, ` ${f.symbols.length} symb.`))),
      h('h4', null, 'Eendraadschema'),
      app.project.pages.length ? app.project.pages.map((pg, i) => h('li', {
        class: app.mode === 'schematic' && i === app.pageIdx ? 'active' : '', onclick: () => { app.setMode('schematic'); app.setPage(i); },
        ondblclick: async () => { const n = await prompt('Titel van het blad', pg.title); if (n !== null) app.mutate(() => { pg.title = n; }); },
      }, h('span', { class: 'no' }, i + 1), h('span', { class: 'ttl' }, pg.title))) : h('li', { class: 'hint', onclick: () => generateDialog(app) }, 'Nog niet gegenereerd – klik om te genereren')),
      h('p', { class: 'hint' }, 'Dubbelklik om te hernoemen.'));
  };
  app.on('change', () => { if (tab === 'floors') render(); });
  app.on('mode', render);
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
    return [section(t('{n} elementen geselecteerd', { n: keys.length }),
      syms.length ? field(t('Kring voor {n} symbool/symbolen', { n: syms.length }), sel('', [['', '— kies —'], ...circuitOptions(b, false)], (v) => set(() => {
        // one number per group of linked symbols
        const done = new Set();
        for (const s of syms) {
          if (done.has(s.id)) continue;
          for (const g of setGroupCircuit(b, f, s.id, v, undefined, app.lib)) done.add(g.id);
        }
      }), 'mcirc')) : null,
      h('div', { class: 'btnrow' },
        h('button', { onclick: () => plan.rotate() }, '⟳ Draaien (R)'),
        h('button', { class: 'danger', onclick: () => plan.deleteSelection() }, 'Verwijderen')))];
  }
  const [kind, id] = keys[0].split(':');
  if (kind === 'W') {
    const w = f.walls.find((x) => x.id === id);
    if (!w) return [];
    const g = wallGeom(w);
    const del = h('button', { class: 'danger', onclick: () => plan.deleteSelection() }, 'Verwijderen');
    return [section(g.arc ? 'Gebogen muur' : 'Muur',
      field('Soort', sel(w.kind || 'outer', [['outer', 'Buitenmuur'], ['inner', 'Binnenmuur']], (v) => set(() => { w.kind = v; }), 'wkind')),
      field('Dikte (cm)', inp(w.t, (v) => set(() => { w.t = Math.max(1, v || 10); }), { type: 'number', key: 'wt' })),
      g.arc
        ? h('p', null, t('Lengte (cm)'), ': ', h('b', null, String(Math.round(g.len * 10) / 10)), ' · ', t('straal {r} cm', { r: Math.round(g.r) }))
        : field('Lengte (cm)', inp(Math.round(g.len * 10) / 10, (v) => set(() => {
          if (!(v > 0)) return;
          w.x2 = Math.round((w.x1 + g.u[0] * v) * 100) / 100; w.y2 = Math.round((w.y1 + g.u[1] * v) * 100) / 100;
        }), { type: 'number', key: 'wlen' }), 'Verlengt / verkort vanaf het beginpunt.'),
      h('div', { class: 'btnrow' },
        g.arc
          ? h('button', { onclick: () => set(() => { delete w.cx; delete w.cy; }) }, '▬ Recht maken')
          : h('button', {
            title: 'Of sleep het ronde middelpunt van de geselecteerde muur',
            onclick: () => set(() => { w.cx = Math.round(((w.x1 + w.x2) / 2 + g.n[0] * g.len / 4) * 10) / 10; w.cy = Math.round(((w.y1 + w.y2) / 2 + g.n[1] * g.len / 4) * 10) / 10; }),
          }, '◠ Buigen'),
        del),
      h('p', { class: 'hint' }, w.cx != null ? 'Sleep de hoekpunten om te verlengen, het ronde middelpunt om te buigen.' : 'Sleep de hoekpunten om te verlengen, het middelpunt om de muur evenwijdig te verschuiven (blijft recht).'))];
  }
  if (kind === 'O') {
    const o = f.openings.find((x) => x.id === id);
    if (!o) return [];
    const door = o.type === 'door' || o.type === 'door2';
    const leaf = hasLeaf(o);
    return [section(door && !leaf ? 'Deuropening' : OPENING_TYPES[o.type]?.label || 'Opening',
      field('Type', sel(o.type, Object.entries(OPENING_TYPES).map(([k, v]) => [k, v.label]), (v) => set(() => { o.type = v; }), 'otype')),
      door ? chk(o.leaf === false, (v) => set(() => { if (v) o.leaf = false; else delete o.leaf; }), 'Zonder deurblad (enkel deuropening)', 'oleaf') : null,
      h('div', { class: 'grid2' },
        field('Breedte (cm)', inp(o.width, (v) => set(() => { o.width = Math.max(10, v || 80); }), { type: 'number', key: 'ow' })),
        field('Hoogte (cm)', inp(o.height, (v) => set(() => { o.height = v; }), { type: 'number', key: 'oh' }))),
      h('div', { class: 'btnrow' },
        leaf || o.type === 'garage' ? h('button', { onclick: () => set(() => { o.side = o.side === -1 ? 1 : -1; }) }, leaf ? '⇅ Draairichting' : '⇅ Binnenkant') : null,
        leaf && o.type === 'door' ? h('button', { onclick: () => set(() => { o.hinge = o.hinge === 'r' ? 'l' : 'r'; }) }, '⇆ Scharnierzijde') : null,
        h('button', { class: 'danger', onclick: () => plan.deleteSelection() }, 'Verwijderen')),
      h('p', { class: 'hint' }, 'Verslepen schuift de opening langs de muur; sleep de blokjes aan de uiteinden om de breedte te wijzigen.'))];
  }
  if (kind === 'S') {
    const st = f.stairs.find((x) => x.id === id);
    if (!st) return [];
    const num = (label, k, key, round) => field(label, inp(st[k], (v) => set(() => { if (v > 0 || v === 0) st[k] = round ? Math.round(v) : v; }), { type: 'number', key }));
    const del = h('button', { class: 'danger', onclick: () => plan.deleteSelection() }, 'Verwijderen');
    if (st.kind === 'spiral') {
      return [section('Wenteltrap',
        h('div', { class: 'grid2' },
          num('Straal (cm)', 'r', 'sr2'), num('Treden', 'steps', 'ss', true),
          num('Draaihoek (°)', 'turn', 'sturn', true)),
        rotationDial(app, plan, st.rot || 0, (deg) => rotateStair(st, deg)),
        h('div', { class: 'btnrow' },
          h('button', { onclick: () => set(() => { st.dir = st.dir === -1 ? 1 : -1; }) }, '↻ Draairichting'),
          h('button', { onclick: () => plan.rotate() }, '⟳ 90° (R)'), del),
        h('p', { class: 'hint' }, 'Sleep het ronde blokje om de straal te wijzigen.'))];
    }
    return [section(st.kind === 'quarter' ? 'Kwartdraaitrap' : 'Trap',
      field('Soort', sel(st.kind || 'straight', [['straight', 'Rechte trap'], ['quarter', 'Kwartdraaitrap']], (v) => set(() => {
        if (v === 'quarter') { st.kind = 'quarter'; st.b ||= Math.min(90, Math.round(Math.min(st.w, st.h) / 2)); } else delete st.kind;
      }), 'skind')),
      h('div', { class: 'grid2' },
        num('Breedte (cm)', 'w', 'sw'), num('Lengte (cm)', 'h', 'sh'),
        st.kind === 'quarter' ? num('Trapbreedte (cm)', 'b', 'sb') : null,
        num('Treden', 'steps', 'ss', true)),
      rotationDial(app, plan, st.rot || 0, (deg) => rotateStair(st, deg)),
      h('div', { class: 'btnrow' },
        st.kind === 'quarter' ? h('button', { onclick: () => set(() => { st.mirror = !st.mirror; }) }, '⇋ Spiegelen') : null,
        h('button', { onclick: () => plan.rotate() }, '⟳ 90° (R)'), del),
      h('p', { class: 'hint' }, 'Sleep de blokjes om de trap groter of kleiner te maken.'))];
  }
  if (kind === 'D') {
    const d = f.dims.find((x) => x.id === id);
    if (!d) return [];
    const { len } = dimGeom(d);
    return [section('Maatlijn',
      h('p', null, t('Gemeten lengte'), ': ', h('b', null, `${Math.round(len * 10) / 10} cm`)),
      field('Tekst', inp(d.text, (v) => set(() => { if (v) d.text = v; else delete d.text; }), { key: 'dtext', placeholder: String(Math.round(len)) }), 'Leeg = gemeten lengte in cm.'),
      h('div', { class: 'grid2' },
        field('Afstand (cm)', inp(d.off || 0, (v) => set(() => { d.off = v || 0; }), { type: 'number', key: 'doff' })),
        field('Tekstgrootte (mm)', inp(d.size || 2.5, (v) => set(() => { d.size = v || 2.5; }), { type: 'number', key: 'dsize' }))),
      h('div', { class: 'btnrow' }, h('button', { class: 'danger', onclick: () => plan.deleteSelection() }, 'Verwijderen')),
      h('p', { class: 'hint' }, 'Sleep de eindpunten of het ronde blokje in het midden.'))];
  }
  if (kind === 'P') {
    const sh = f.shapes.find((x) => x.id === id);
    if (!sh) return [];
    if (sh.type === 'callout') return calloutProps(app, plan, sh);
    const area = sh.type === 'area';
    const style = (k, v) => set(() => {
      sh[k] = v;
      plan.lastStyle ||= {};
      plan.lastStyle[sh.type] = { ...(plan.lastStyle[sh.type] || {}), [k]: v };
    });
    const cur = sh.color || (area ? '#93c5fd' : '#dc2626');
    const PALETTE = ['#93c5fd', '#86efac', '#fde68a', '#fca5a5', '#d8b4fe', '#fdba74', '#cbd5e1', '#dc2626', '#2563eb', '#16a34a', '#000000'];
    const free = h('input', { type: 'color', value: cur, title: 'Vrije kleur kiezen' });
    free.addEventListener('change', () => style('color', free.value));
    return [section(area ? 'Gekleurd vlak' : sh.arrow ? 'Pijl' : 'Lijn',
      area ? h('p', null, t('Oppervlakte'), ': ', h('b', null, `${(polygonArea(sh.pts) / 10000).toFixed(2).replace('.', ',')} m²`)) : null,
      field('Kleur', h('div', { class: 'chips colors' }, PALETTE.map((c) => h('button', {
        class: 'cchip' + (c === cur ? ' active' : ''), style: { background: c }, title: c, onclick: () => style('color', c),
      })), free)),
      area ? field('Dekking (%)', inp(Math.round((sh.opacity ?? 0.35) * 100), (v) => style('opacity', Math.max(0, Math.min(100, v || 0)) / 100), { type: 'number', key: 'pop' })) : null,
      field(area ? 'Randdikte (mm)' : 'Lijndikte (mm)', inp(sh.width || (area ? 0.18 : 0.5), (v) => style('width', Math.max(0.05, v || 0.25)), { type: 'number', key: 'pw', step: 0.05 })),
      area ? null : field('Pijlpunten', sel(sh.arrow || '', [['', 'Geen'], ['end', 'Op het einde'], ['start', 'Aan het begin'], ['both', 'Aan beide kanten']], (v) => set(() => { if (v) sh.arrow = v; else delete sh.arrow; }), 'parrow')),
      chk(sh.dash, (v) => style('dash', v), 'Gestreept', 'pdash'),
      area ? chk(sh.stroke !== false, (v) => style('stroke', v), 'Rand tonen', 'pstroke') : null,
      h('div', { class: 'btnrow' }, h('button', { class: 'danger', onclick: () => plan.deleteSelection() }, 'Verwijderen')),
      h('p', { class: 'hint' }, 'Sleep de hoekpunten om de vorm aan te passen.'))];
  }
  if (kind === 'B') return backgroundSection(app, plan);
  if (kind === 'R') return roomProps(app, plan, f.rooms.find((x) => x.id === id));
  if (kind === 'T') {
    const tx = f.texts.find((x) => x.id === id);
    if (!tx) return [];
    return [section('Ruimte / tekst',
      field('Naam', inp(tx.text, (v) => set(() => { tx.text = v; }), { key: 'tt' })),
      field('Extra regel (bv. oppervlakte)', inp(tx.area, (v) => set(() => { tx.area = v; }), { key: 'ta', placeholder: 'bv. 24 m²' })),
      field('Grootte (mm)', inp(tx.size || 3, (v) => set(() => { tx.size = v || 3; }), { type: 'number', key: 'ts' })),
      h('div', { class: 'btnrow' }, h('button', { class: 'danger', onclick: () => plan.deleteSelection() }, 'Verwijderen')))];
  }
  if (kind === 'L') {
    const l = f.links.find((x) => x.id === id);
    return [section('Koppeling', h('p', { class: 'hint' }, 'Stippellijn tussen bediening en toestel.'),
      l ? field('Kabel (solar / DC)', cableInput(l, set), 'Komt in het eendraadschema bij het toestel.') : null,
      h('button', { class: 'danger', onclick: () => plan.deleteSelection() }, 'Koppeling verwijderen'))];
  }
  if (kind === 'A') return symbolProps(app, plan, f.symbols.find((x) => x.id === id));
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
  const strip = def?.strip && s.pts;
  if (strip) {
    const len = pathLength(s.pts) / 100;
    const total = (wpm) => Math.round((wpm || 0) * len * 10) / 10;
    extra.push(
      h('p', null, t('Lengte'), ': ', h('b', null, `${len.toFixed(2).replace('.', ',')} m`), ' · ', t('Vermogen'), ': ', h('b', null, `${String(total(s.props.wpm)).replace('.', ',')} W`)),
      field('Vermogen per meter (W/m)', inp(s.props.wpm, (v) => set(() => { s.props.wpm = v; s.props.power = total(v); }), { type: 'number', key: 'wpm' })),
      h('div', { class: 'grid2' },
        field('Type', sel(s.props.ledType || '', Object.entries(LED_TYPES).map(([k, v]) => [k, v]), setProp('ledType'), 'ledtype')),
        field('Spanning', sel(s.props.volt || '24', [['24', '24 V DC'], ['12', '12 V DC'], ['230', '230 V AC']], setProp('volt'), 'volt'))));
  } else if (kind === 'light' || kind === 'appliance' || kind === 'other') extra.push(field('Vermogen (W)', inp(s.props.power, setProp('power'), { type: 'number', key: 'pw' })));
  if (kind === 'socket' || kind === 'appliance') extra.push(field('Aantal dozen op dit punt', inp(s.props.qty || 1, setProp('qty'), { type: 'number', key: 'qty' }), 'In het eendraadschema herhaald op dezelfde aftakking.'));
  if (PV_KINDS.includes(kind)) extra.push(
    field('Type / model', inp(s.props.model, setProp('model'), { key: 'model', placeholder: 'bv. SMA Sunny Tripower 5.0' })),
    field('Serienummer', inp(s.props.serial, setProp('serial'), { key: 'serial' })));
  if (kind === 'pv') extra.push(field('Piekvermogen (Wp)', inp(s.props.wp, setProp('wp'), { type: 'number', key: 'wp' })), field('Aantal panelen', inp(s.props.count, setProp('count'), { type: 'number', key: 'pc' })));
  if (kind === 'inverter') extra.push(field('Vermogen (kW)', inp(s.props.kw, setProp('kw'), { type: 'number', key: 'kw' })));
  if (kind === 'mppt') extra.push(h('div', { class: 'grid2' },
    field('Vermogen (W)', inp(s.props.power, setProp('power'), { type: 'number', key: 'mw' })),
    field('Max. laadstroom (A)', inp(s.props.amp, setProp('amp'), { type: 'number', key: 'ma' }))));
  if (kind === 'battery') extra.push(h('div', { class: 'grid2' },
    field('Capaciteit (kWh)', inp(s.props.kwh, setProp('kwh'), { type: 'number', key: 'kwh' })),
    field('Vermogen (kW)', inp(s.props.kw, setProp('kw'), { type: 'number', key: 'bkw' }))));
  if (kind === 'board' && b.boards.length > 1) extra.push(field('Welk verdeelbord', sel(s.props.board || '', [['', '— automatisch —'], ...b.boards.map((x) => [x.id, x.name])], setProp('board'), 'pbd'), 'Voor de kabeltrace: kringen van dit bord vertrekken hier.'));
  if (!strip && def) extra.push(field('Hoogte (cm)', inp(s.props.h ?? '', setProp('h'), { type: 'number', key: 'hgt', placeholder: String(symbolHeight({ ...s, props: {} }, def, traceCfg(b))) }), 'Voor de kabellengte; leeg = standaard (zie Kabels).'));
  if (kind === 'dom-out') extra.push(field('Domotica-adres / kanaal', inp(s.props.addr, setProp('addr'), { key: 'da', placeholder: 'bv. module 2 – kanaal 4' })));
  const domSel = domChannelSelect(app, s);
  if (domSel) extra.push(domSel);
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
          const c = newCircuit(nextCircuitName(b), rootBoards(b)[0]?.id);
          c.pos = nextPos(b, c.parent);
          if (kind === 'light') { c.In = 16; c.section = 1.5; c.desc = 'Verlichting'; }
          b.circuits.push(c);
          v = c.id;
        }
        setGroupCircuit(b, f, s.id, v, undefined, app.lib);
        plan.activeCircuit = v;
        app.emit('planCircuits');
      }), 'circ')),
      s.circuit ? field('Volgnummer in de kring', inp(s.n, (v) => set(() => { setGroupCircuit(b, f, s.id, s.circuit, Math.round(v) || 1, app.lib); }), { type: 'number', key: 'n' }),
        linkGroup(f, s.id, app.lib).length > 1 ? 'Geldt voor alle gekoppelde symbolen.' : undefined) : null),
    section('Gegevens',
      field('Ruimte / plaats', inp(s.props.room, setProp('room'), { key: 'room', placeholder: 'bv. Keuken' })),
      field('Omschrijving', inp(s.props.desc, setProp('desc'), { key: 'desc' })),
      field('Montagehoogte (cm)', inp(s.props.height, setProp('height'), { type: 'number', key: 'h' })),
      ...extra),
    section('Koppelingen',
      links.length ? h('ul', { class: 'linked' }, links.map((l) => {
        const o = symById.get(l.a === s.id ? l.b : l.a);
        const dc = PV_KINDS.includes(kind) || PV_KINDS.includes(app.lib.get(o?.sym)?.kind);
        return h('li', null, o ? label(o) : '?', ' ', h('button', { class: 'link', onclick: () => set(() => { f.links = f.links.filter((x) => x !== l); }) }, 'ontkoppelen'),
          dc ? cableInput(l, set) : null);
      })) : h('p', { class: 'hint' }, 'Nog geen koppelingen.'),
      h('button', {
        onclick: () => { plan.setTool('link'); plan.linkFrom = s.id; plan.render(); },
        title: 'Klik daarna de volgende symbolen na elkaar aan: dit symbool → 2 → 3 … (bv. schakelaar → lamp → lamp). Esc = stoppen.',
      }, '🔗 Koppelen…')),
    strip ? section('Plaatsing',
      h('p', { class: 'hint' }, 'Sleep de punten om de strip aan te passen; het eerste punt (donker) is de voeding.'),
      h('div', { class: 'btnrow' }, h('button', { class: 'danger', onclick: () => plan.deleteSelection() }, 'Verwijderen')))
      : section('Plaatsing',
        rotationDial(app, plan, s.rot || 0, (deg) => { s.rot = deg; }),
        h('div', { class: 'btnrow' },
          h('button', { onclick: () => plan.rotate() }, '⟳ 90° (R)'),
          h('button', { class: 'danger', onclick: () => plan.deleteSelection() }, 'Verwijderen'))),
  ];
}

/**
 * Rotation dial: 24 dots every 15°, 0° at the top, clockwise. Click a dot, or drag the hand:
 * the element turns along live (steps of 15°, Shift / Alt = per degree). One drag = one undo step.
 */
function rotationDial(app, plan, rot, apply) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-50 -50 100 100');
  svg.classList.add('dial');
  const pt = (deg, r) => [Math.sin((deg * Math.PI) / 180) * r, -Math.cos((deg * Math.PI) / 180) * r];
  let s = `<circle cx="0" cy="0" r="38" class="ring"/><line x1="0" y1="0" x2="0" y2="-30" class="hand"/><circle class="knob" cx="0" cy="-30" r="5"/><circle cx="0" cy="0" r="3" class="hub"/>`;
  for (let deg = 0; deg < 360; deg += 15) {
    const [x, y] = pt(deg, 38);
    s += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${deg % 90 === 0 ? 4.2 : 3}" class="dot" data-deg="${deg}"><title>${deg}°</title></circle>`;
  }
  s += `<text x="0" y="16" text-anchor="middle" class="deg"></text>`;
  svg.innerHTML = s;
  const hand = svg.querySelector('.hand'), knob = svg.querySelector('.knob'), label = svg.querySelector('.deg');
  const show = (deg) => {
    const [x, y] = pt(deg, 30);
    hand.setAttribute('x2', x.toFixed(2)); hand.setAttribute('y2', y.toFixed(2));
    knob.setAttribute('cx', x.toFixed(2)); knob.setAttribute('cy', y.toFixed(2));
    label.textContent = `${deg}°`;
    for (const d of svg.querySelectorAll('.dot')) d.classList.toggle('on', +d.dataset.deg === deg);
  };
  let cur = ((Math.round(rot) % 360) + 360) % 360;
  show(cur);
  const angleAt = (e) => {
    const r = svg.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const raw = (Math.atan2(dx, -dy) * 180) / Math.PI;
    const step = e.shiftKey || e.altKey ? 1 : 15;
    return ((Math.round(raw / step) * step) % 360 + 360) % 360;
  };
  let drag = null;
  const turn = (deg) => {
    if (deg === cur) return;
    if (!drag.moved) app.checkpoint();
    cur = deg;
    show(deg);
    apply(deg);
    plan.render(); // live, without rebuilding this panel
    drag.moved = true;
  };
  svg.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    svg.setPointerCapture(e.pointerId);
    drag = { moved: false };
    const d = e.target.closest?.('[data-deg]')?.dataset.deg;
    turn(d !== undefined ? +d : angleAt(e));
  });
  svg.addEventListener('pointermove', (e) => { if (drag) turn(angleAt(e)); });
  const end = () => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    if (moved) app.touched();
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  return h('div', { class: 'dialwrap', title: 'Sleep de wijzer of klik op een bolletje om te draaien (per 15°, Shift = per graad)' }, svg);
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
      h('p', null, t('{c} kring(en), {b} verdeelbord(en).', { c: b.circuits.length, b: b.boards.length })),
      checks.length ? h('p', { class: errors ? 'warn' : 'hint' }, (errors ? '⚠ ' : '') + t('{n} opmerking(en) bij de AREI-controle.', { n: checks.length })) : h('p', { class: 'hint' }, '✓ Geen opmerkingen.'),
      h('div', { class: 'btnrow' },
        h('button', { onclick: () => circuitsDialog(app) }, 'Kringen & borden…'),
        h('button', { class: 'primary', onclick: () => generateDialog(app) }, 'Eendraadschema'))),
    ...backgroundSection(app, plan),
    section('Sneltoetsen', h('p', { class: 'hint keys' },
      'W muur (cijfers + Enter = lengte in cm) · A gebogen muur · D deur · N raam · M maatlijn · T ruimtenaam · L koppelen · R draaien · Del verwijderen · Ctrl+D dupliceren · Ctrl+Z / Y · F passend · Alt: zonder raster / niet tegen muur')),
  ];
}

// ---------- rooms and external influences ----------

/** The code that is unfolded in the room panel (only one at a time; kept while the panel re-renders). */
let openInfl = null;

/** Room: name, template, public access and the classes of every external influence (several allowed). */
function roomProps(app, plan, r) {
  if (!r) return [];
  const f = app.floor;
  const set = (fn) => app.mutate(fn);
  const poly = roomPolygon(f, r);
  const rows = INFLUENCES.map(([code, name, classes]) => {
    const cur = r.infl?.[code] || NORMAL[code];
    const differs = cur.join(',') !== NORMAL[code].join(',');
    return h('details', { class: 'inflrow' + (differs ? ' differs' : ''), open: openInfl === code },
      h('summary', {
        title: t(name),
        onclick: (e) => {
          // accordion: one code open at a time
          e.preventDefault();
          openInfl = openInfl === code ? null : code;
          for (const d of e.currentTarget.closest('.infl').children) d.open = d === e.currentTarget.parentElement && openInfl === code;
        },
      },
        h('span', { class: 'inflcode' }, code),
        h('span', { class: 'inflname' }, t(name)),
        h('span', { class: 'inflval' }, cur.map((n) => h('span', { class: 'inflchip on' }, String(n))))),
      h('div', { class: 'inflopts' }, classes.map((desc, i) => {
        const n = i + 1;
        const toggle = () => set(() => {
          r.infl ||= presetInfl(r.preset);
          const v = new Set(r.infl[code] || NORMAL[code]);
          if (v.has(n)) v.delete(n); else v.add(n);
          r.infl[code] = v.size ? [...v].sort((a, b) => a - b) : [n];
        });
        return h('div', { class: 'inflopt', onclick: toggle },
          h('button', { class: 'inflchip' + (cur.includes(n) ? ' on' : ''), title: `${code}${n}` }, String(n)),
          h('span', null, t(desc)));
      })));
  });
  return [
    section('Ruimte',
      field('Naam', inp(r.name, (v) => set(() => { r.name = v; }), { key: 'rname', placeholder: 'bv. Keuken' })),
      field('Sjabloon', sel(r.preset || 'normal', [...allPresets().map(([k, v]) => [k, isCustomPreset(k) ? `★ ${v.label}` : t(v.label)]), ...(presetOf(r.preset) ? [] : [[r.preset, '—']])],
        (v) => set(() => { r.preset = v; r.infl = presetInfl(v); const pr = presetOf(v); if (isCustomPreset(v)) r.pub = !!pr.pub; }), 'rpreset'),
        'Vult de uitwendige invloeden in; je kan ze daarna aanpassen. ★ = eigen sjabloon.'),
      poly ? h('p', null, t('Oppervlakte'), ': ', h('b', null, `${roomArea(poly).toFixed(2).replace('.', ',')} m²`))
        : h('p', { class: 'warn' }, 'Deze ruimte is niet gesloten door muren. Teken ze opnieuw met "Ruimte (hoeken)".'),
      chk(r.pub, (v) => set(() => { r.pub = v; }), 'Publiek toegankelijke ruimte', 'rpub'),
      h('p', { class: 'hint' }, r.seed ? 'De omtrek volgt de muren automatisch. Sleep het label om het te verplaatsen.' : 'Hoeken op een muurhoek volgen de muur; sleep de blauwe bolletjes om de vorm aan te passen.')),
    section('Uitwendige invloeden',
      h('p', { class: 'hint' }, 'Klap een code open en klik de klassen aan (meerdere mogelijk). Afwijkend van een normaal lokaal = gemarkeerd; die codes staan ook op het plan.'),
      h('div', { class: 'infl' }, rows),
      h('div', { class: 'btnrow' },
        h('button', { onclick: () => set(() => { r.infl = presetInfl(r.preset); }) }, '↺ Waarden van het sjabloon'),
        h('button', {
          onclick: async () => {
            const cur = presetOf(r.preset);
            const label = await prompt('Opslaan als sjabloon', isCustomPreset(r.preset) ? cur.label : r.name || '', { label: t('Naam van het sjabloon') });
            if (!label?.trim()) return;
            set((p) => { r.preset = saveRoomPreset(p.building, label, r); });
            toast(t('Sjabloon "{n}" opgeslagen', { n: label.trim() }));
          },
        }, '★ Opslaan als sjabloon…'),
        isCustomPreset(r.preset) ? h('button', {
          class: 'danger',
          onclick: async () => {
            const label = presetOf(r.preset).label;
            if (!(await confirmDlg('Sjabloon verwijderen', t('Het eigen sjabloon "{n}" verwijderen? Ruimtes behouden hun waarden.', { n: label }), 'Verwijderen', true))) return;
            set((p) => { deleteRoomPreset(p.building, r.preset); });
          },
        }, 'Sjabloon verwijderen') : null),
      h('div', { class: 'btnrow' },
        h('button', { onclick: () => influencesDialog(app) }, '▦ Tabel…'),
        h('button', { class: 'danger', onclick: () => plan.deleteSelection() }, 'Ruimte verwijderen'))),
  ];
}

/** All rooms with their external influences: table, CSV, and the sheet in the project. */
export function influencesDialog(app) {
  const b = app.project.building;
  b.inflMeta ||= {};
  const meta = b.inflMeta;
  const rows = influenceRows(b);
  const codes = INFLUENCES.map(([c]) => c);
  const metaField = (label, key, fallback) => {
    const el = h('input', { type: 'text', value: meta[key] ?? fallback ?? '' });
    el.addEventListener('change', () => app.mutate(() => { meta[key] = el.value; }));
    return h('label', { class: 'tf' }, h('span', null, label), el);
  };
  const table = h('div', { class: 'tablewrap' }, h('table', { class: 'list infltable' },
    h('thead', null, h('tr', null, h('th', null, 'Ruimte'), codes.map((c) => h('th', { title: t(INFLUENCES.find((x) => x[0] === c)[1]) }, c)), h('th', null, 'PUB'))),
    h('tbody', null, rows.length ? rows.map((row) => h('tr', {
      title: 'Klik om naar de ruimte te gaan',
      onclick: () => { app.setMode('building'); app.setFloor(b.floors.indexOf(row.floor)); app.select(['R:' + row.room.id]); },
    }, h('td', null, row.name), codes.map((c) => h('td', { class: row.values[c] !== NORMAL[c].join(',') ? 'differs' : '' }, row.values[c])), h('td', null, row.pub)))
      : h('tr', null, h('td', { colspan: codes.length + 2, class: 'empty' }, 'Nog geen ruimtes: gebruik "Ruimte" onder Grondplan.')))));
  const csv = () => {
    const head = ['Ruimte', ...codes, 'PUB'];
    const data = rows.map((row) => [row.name, ...codes.map((c) => row.values[c]), row.pub]);
    download(`${safeName(app.project.name)} - ${t('Uitwendige invloeden')}.csv`, '\ufeff' + toCsv([head.map((x) => t(x)), ...data]), 'text/csv;charset=utf-8');
  };
  return modal({
    title: 'Uitwendige invloeden', wide: true,
    body: h('div', null,
      h('div', { class: 'inflmeta' }, metaField(t('Referentie'), 'ref', app.project.name), metaField(t('Datum'), 'date', app.project.meta?.date), metaField(t('Adres'), 'address', app.project.meta?.address)),
      table,
      h('p', { class: 'hint' }, 'Gemarkeerde waarden wijken af van een normaal lokaal. Het blad komt bij de bladen van het project (vervangt een eerder blad).')),
    buttons: [{ label: 'CSV exporteren', value: 'csv' }, { label: 'Sluiten', value: false }, { label: 'Blad genereren', value: 'sheet', primary: true }],
    onButton: (v) => {
      if (v === 'csv') { csv(); return false; }
      if (v === 'sheet') {
        let first = 0;
        app.mutate((p) => { first = generateInfluences(p); });
        app.setMode('schematic');
        app.pageIdx = -1;
        app.setPage(first);
        app.emit('change');
        toast(t('Blad met uitwendige invloeden gegenereerd'));
      }
      return true;
    },
  });
}

// ---------- PV / DC ----------

const PV_KINDS = ['pv', 'inverter', 'mppt', 'battery', 'dcbus'];
const DC_CABLES = [
  ...[4, 6, 10].map((n) => `Solarkabel ${n} mm²`),
  ...[6, 10, 16, 25, 35, 50].map((n) => `DC-kabel ${n} mm²`),
  ...[16, 25, 35, 50, 70, 95].map((n) => `Accukabel ${n} mm²`),
];

/** Cable type of a link (solar cable between panels and MPPT, DC cable to the busbar …). */
function cableInput(l, set) {
  if (!document.getElementById('dccables')) document.body.append(h('datalist', { id: 'dccables' }, DC_CABLES.map((c) => h('option', { value: c }))));
  const el = h('input', { type: 'text', value: l.cable || '', list: 'dccables', class: 'cablein', placeholder: t('kabeltype'), 'data-key': 'cable' + l.id });
  el.addEventListener('change', () => set(() => { if (el.value) l.cable = el.value; else delete l.cable; }));
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.blur(); });
  return el;
}

// ---------- domotics ----------

/** Loads that can hang on an output channel, and controls that sit on an input channel. */
const isLoad = (def) => ['light', 'socket', 'appliance', 'other'].includes(def?.kind);
const isInput = (def) => def?.kind === 'dom-in';

/** Short description of a plan symbol: "A3 Lichtpunt – Keuken (Gelijkvloers)". */
function symLabel(app, s, floor) {
  const b = app.project.building;
  const c = b.circuits.find((x) => x.id === s.circuit);
  const def = app.lib.get(s.sym);
  const room = s.props?.room ? ` – ${s.props.room}` : '';
  const addr = isInput(def) ? domAddress(b, s) : '';
  return `${c ? c.name + (s.n ?? '') + ' ' : ''}${addr ? addr + ' ' : ''}${t(def?.name || '?')}${room}${floor && b.floors.length > 1 ? ` (${floor.name})` : ''}`;
}

/** Channel choice in the symbol properties: output channels for loads, input channels for push buttons. */
function domChannelSelect(app, s) {
  const b = app.project.building;
  const def = app.lib.get(s.sym);
  const input = isInput(def);
  if (!input && !isLoad(def)) return null;
  const mods = b.domotics.modules.filter((m) => !!MODULE_TYPES[m.type]?.out !== input);
  if (!mods.length) {
    return field(input ? 'Domotica-ingang' : 'Gestuurd door domotica', h('button', { onclick: () => domoticsDialog(app) }, '＋ Domotica-module toevoegen…'));
  }
  /** Channel list of the given modules; `current` is selected, `color` = the colour of a strip being edited. */
  const select = (list, current, key, color) => h('select', { 'data-key': key },
    h('option', { value: '' }, '— geen —'),
    list.map((m) => h('optgroup', { label: `${m.name} – ${t(MODULE_TYPES[m.type].label)}${m.desc ? ' – ' + m.desc : ''}` },
      Array.from({ length: m.channels }, (_, i) => {
        const k = `${m.id}:${i + 1}`;
        const users = channelUsers(b, m.id, i + 1).filter((u) => u.s !== s || u.color !== color);
        return h('option', { value: k, selected: current === k },
          `${m.name}.${i + 1}${users.length ? ' · ' + users.map((u) => symLabel(app, u.s) + (u.color ? ` (${t(COLOR_NAMES[u.color])})` : '')).join(', ') : current === k ? '' : ' ' + t('(vrij)')}`);
      }))));
  const colors = colorChannels(s);
  if (colors) {
    // one dimmer channel per colour; choosing red fills the other colours with the next free channels
    const dims = mods.filter((m) => m.type === 'dimmer');
    const list = dims.length ? dims : mods;
    const free = (m, ch) => ch <= m.channels && !channelUsers(b, m.id, ch).some((u) => u.s !== s);
    const fields = colors.map((c, i) => {
      const el = select(list, s.domColors?.[c] || '', 'dom-' + c, c);
      el.addEventListener('change', () => app.mutate(() => {
        s.domColors ||= {};
        if (el.value) s.domColors[c] = el.value; else delete s.domColors[c];
        if (i === 0 && el.value && colors.slice(1).every((o) => !s.domColors[o])) {
          const [mid, ch] = el.value.split(':');
          const m = b.domotics.modules.find((x) => x.id === mid);
          let next = +ch + 1;
          for (const o of colors.slice(1)) {
            while (next <= m.channels && !free(m, next)) next++;
            if (next <= m.channels) s.domColors[o] = `${m.id}:${next++}`;
          }
        }
      }));
      return field(t('Kanaal {color}', { color: t(COLOR_NAMES[c]).toLowerCase() }), el);
    });
    return h('div', null, h('h4', { class: 'subhead' }, 'Gestuurd door domotica (dimmer per kleur)'), h('div', { class: 'grid2' }, fields),
      h('p', { class: 'hint' }, 'Kies het kanaal voor rood: de andere kleuren krijgen de volgende vrije kanalen.'));
  }
  const el = select(mods, s.dom || '', 'dom');
  el.addEventListener('change', () => app.mutate(() => { if (el.value) s.dom = el.value; else delete s.dom; }));
  return field(input ? 'Domotica-ingang' : 'Gestuurd door domotica', el, input ? 'Kanaal van een ingangsmodule.' : 'Het relaiscontact komt in de aftakking van het eendraadschema.');
}

/** Domotics: modules in the boards and what every channel drives. Changes apply directly (undo works). */
export function domoticsDialog(app) {
  const body = h('div', { class: 'domotics' });
  const collapsed = new Set();
  const render = () => {
    const b = app.project.building;
    const mods = b.domotics.modules;
    const set = (fn) => { app.mutate(fn); render(); };
    const allSyms = b.floors.flatMap((f) => f.symbols.map((s) => ({ s, floor: f })));
    const linkedButtons = (users) => {
      const ids = new Set(users.map(({ s }) => s.id));
      const out = [];
      for (const f of b.floors) for (const l of f.links) {
        for (const [x, y] of [[l.a, l.b], [l.b, l.a]]) {
          if (!ids.has(x)) continue;
          const o = f.symbols.find((q) => q.id === y);
          if (o && isInput(app.lib.get(o.sym)) && !out.some((q) => q.s === o)) out.push({ s: o, floor: f });
        }
      }
      return out;
    };
    const add = h('div', { class: 'btnrow' }, Object.entries(MODULE_TYPES).map(([type, mt]) =>
      h('button', { onclick: () => set(() => { mods.push(newModule(b, type)); }) }, '＋ ' + t(mt.label))));
    const blocks = mods.map((m) => {
      const mt = MODULE_TYPES[m.type] || MODULE_TYPES.switch;
      const num = h('input', { type: 'number', min: 1, max: MAX_CHANNELS, value: m.channels, class: 'tnum' });
      num.addEventListener('change', () => set(() => { m.channels = Math.max(1, Math.min(MAX_CHANNELS, parseInt(num.value, 10) || 1)); }));
      const txt = (value, commit, cls, ph) => {
        const el = h('input', { type: 'text', value: value || '', class: cls, placeholder: ph });
        el.addEventListener('change', () => set(() => commit(el.value)));
        return el;
      };
      const pick = (value, options, commit) => {
        const el = h('select', null, options.map(([v, l]) => h('option', { value: v, selected: String(v) === String(value ?? '') }, l)));
        el.addEventListener('change', () => set(() => commit(el.value)));
        return el;
      };
      const open = !collapsed.has(m.id);
      const head = h('div', { class: 'dmhead' },
        h('button', { class: 'icon caretbtn', title: open ? 'Inklappen' : 'Uitklappen', onclick: () => { if (open) collapsed.add(m.id); else collapsed.delete(m.id); render(); } }, open ? '▾' : '▸'),
        txt(m.name, (v) => { m.name = v || m.name; }, 'tname'),
        pick(m.type, Object.entries(MODULE_TYPES).map(([k, v]) => [k, t(v.label)]), (v) => { m.type = v; }),
        h('label', { class: 'tf' }, h('span', null, 'Kanalen'), num),
        h('label', { class: 'tf' }, h('span', null, 'Bord'), pick(m.board, b.boards.map((x) => [x.id, x.name]), (v) => { m.board = v; })),
        h('label', { class: 'tf' }, h('span', null, 'Voeding'), pick(m.circuit, [['', '—'], ...circuitOptions(b, false)], (v) => { m.circuit = v; })),
        txt(m.desc, (v) => { m.desc = v; }, 'tdesc', t('Omschrijving')),
        h('button', {
          class: 'icon danger', title: 'Module verwijderen',
          onclick: async () => {
            if (!(await confirmDlg('Module verwijderen', t('{name} verwijderen? De toegewezen symbolen worden losgekoppeld.', { name: m.name }), 'Verwijderen', true))) return;
            set(() => {
              b.domotics.modules = b.domotics.modules.filter((x) => x !== m);
              clearModule(b, m.id);
            });
          },
        }, '🗑'));
      if (!open) return h('div', { class: 'dmod' }, head);
      // what can still be assigned: free loads / inputs, and the colours of colour strips without a channel
      const candidates = [];
      for (const { s, floor } of allSyms) {
        const colors = colorChannels(s);
        if (colors && mt.out) { for (const c of colors) if (!s.domColors?.[c]) candidates.push({ s, floor, color: c }); continue; }
        if (!s.dom && (mt.out ? isLoad(app.lib.get(s.sym)) : isInput(app.lib.get(s.sym)))) candidates.push({ s, floor });
      }
      const label = (x) => symLabel(app, x.s, x.floor) + (x.color ? ` (${t(COLOR_NAMES[x.color])})` : '');
      const rows = Array.from({ length: m.channels }, (_, i) => {
        const ch = i + 1;
        const users = channelUsers(b, m.id, ch);
        const assign = h('select', { class: 'dmassign' },
          h('option', { value: '' }, '＋ toewijzen…'),
          candidates.map((x, i) => h('option', { value: i }, label(x))));
        assign.addEventListener('change', () => {
          const hit = candidates[+assign.value];
          if (!hit) return;
          set(() => {
            if (hit.color) { hit.s.domColors ||= {}; hit.s.domColors[hit.color] = `${m.id}:${ch}`; } else hit.s.dom = `${m.id}:${ch}`;
          });
        });
        const buttons = mt.out ? linkedButtons(users) : [];
        return h('tr', null,
          h('td', { class: 'dmaddr' }, `${m.name}.${ch}`),
          h('td', null, users.length ? users.map((u) => h('span', { class: 'dmchip' }, label(u),
            h('button', { class: 'link', title: 'Loskoppelen', onclick: () => set(() => { if (u.color) delete u.s.domColors[u.color]; else delete u.s.dom; }) }, '✕'))) : h('span', { class: 'hint' }, 'vrij')),
          mt.out ? h('td', { class: 'hint' }, buttons.map(({ s, floor }) => symLabel(app, s, floor)).join(', ')) : null,
          h('td', null, candidates.length ? assign : null));
      });
      const keys = ({ s }) => [s.dom, ...Object.values(s.domColors || {})].filter(Boolean);
      const beyond = allSyms.filter((x) => keys(x).some((k) => k.startsWith(m.id + ':') && +k.split(':')[1] > m.channels)).length;
      return h('div', { class: 'dmod' }, head,
        h('table', { class: 'list dmtable' },
          h('thead', null, h('tr', null, h('th', null, 'Kanaal'), h('th', null, mt.out ? 'Stuurt' : 'Ingang'), mt.out ? h('th', null, 'Bediening') : null, h('th', null, ''))),
          h('tbody', null, rows)),
        beyond ? h('p', { class: 'warn' }, t('{n} symbool/symbolen op een kanaal boven {max}: verhoog het aantal kanalen of wijs ze opnieuw toe.', { n: beyond, max: m.channels })) : null);
    });
    body.replaceChildren(
      h('p', { class: 'hint' }, 'Modules zitten in het verdeelbord. Wijs per kanaal toe wat het stuurt, hier of bij het symbool zelf (eigenschappen). Koppel op het plan drukknoppen aan lampen om de bediening te tonen.'),
      add,
      ...(blocks.length ? blocks : [h('p', { class: 'hint' }, 'Nog geen modules.')]));
  };
  render();
  const csv = () => {
    const b = app.project.building;
    const rows = [['Adres', 'Module', 'Type', 'Bord', 'Stuurt / ingang', 'Kring', 'Ruimte']];
    for (const m of b.domotics.modules) for (let ch = 1; ch <= m.channels; ch++) {
      const users = channelUsers(b, m.id, ch);
      const board = b.boards.find((x) => x.id === m.board)?.name || '';
      if (!users.length) rows.push([`${m.name}.${ch}`, m.desc || m.name, t(MODULE_TYPES[m.type]?.label || ''), board, '', '', '']);
      for (const { s, floor, color } of users) {
        const c = b.circuits.find((x) => x.id === s.circuit);
        rows.push([`${m.name}.${ch}`, m.desc || m.name, t(MODULE_TYPES[m.type]?.label || ''), board, t(app.lib.get(s.sym)?.name || '') + (color ? ` (${t(COLOR_NAMES[color])})` : ''), c ? c.name + (s.n ?? '') : '', [s.props?.room, floor.name].filter(Boolean).join(' – ')]);
      }
    }
    download(`${safeName(app.project.name)} - ${t('Domotica')}.csv`, '\ufeff' + toCsv(rows.map((r) => r.map((x) => t(x)))), 'text/csv;charset=utf-8');
  };
  return modal({
    title: 'Domotica', wide: true, body,
    buttons: [{ label: 'CSV exporteren', value: 'csv' }, { label: 'Sluiten', value: true, primary: true }],
    onButton: (v) => { if (v === 'csv') { csv(); return false; } return true; },
  });
}

const NOTE_COLORS = ['#1f2937', '#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed'];

/** Text balloon / text box: text, size, shape, colour, leader. */
function calloutProps(app, plan, sh) {
  const set = (fn) => app.mutate(fn);
  const style = (k, v) => set(() => {
    sh[k] = v;
    plan.lastStyle ||= {};
    plan.lastStyle.callout = { ...(plan.lastStyle.callout || {}), [k]: v };
  });
  const cur = sh.color || '#1f2937';
  const ta = h('textarea', { rows: 3, 'data-key': 'ctext' }, sh.text || '');
  ta.addEventListener('change', () => set(() => { sh.text = ta.value; }));
  const free = h('input', { type: 'color', value: cur, title: 'Vrije kleur kiezen' });
  free.addEventListener('change', () => style('color', free.value));
  const leader = sh.pts.length > 1;
  return [section(leader ? 'Tekstballon' : 'Tekstvak',
    field('Tekst', ta),
    h('div', { class: 'grid2' },
      field('Tekstgrootte (mm)', inp(sh.size || 3, (v) => style('size', Math.max(1, v || 3)), { type: 'number', key: 'csize' })),
      field('Vorm', sel(sh.shape || 'round', [['round', 'Afgerond'], ['rect', 'Rechthoek'], ['ellipse', 'Ovaal']], (v) => style('shape', v), 'cshape'))),
    field('Kleur', h('div', { class: 'chips colors' }, NOTE_COLORS.map((c) => h('button', {
      class: 'cchip' + (c === cur ? ' active' : ''), style: { background: c }, title: c, onclick: () => style('color', c),
    })), free)),
    chk(sh.border !== false, (v) => style('border', v), 'Kader tonen', 'cborder'),
    chk(sh.fill !== false, (v) => style('fill', v), 'Witte achtergrond', 'cfill'),
    chk(leader, (v) => set(() => {
      const B = sh.pts[sh.pts.length - 1];
      sh.pts = v ? [[B[0] - 100, B[1] + 100], B] : [B];
    }), 'Met aanwijspijl', 'cleader'),
    h('div', { class: 'btnrow' }, h('button', { class: 'danger', onclick: () => plan.deleteSelection() }, 'Verwijderen')),
    h('p', { class: 'hint' }, 'Sleep de punten om de ballon of de pijlpunt te verplaatsen · dubbelklik = tekst bewerken.'))];
}

/** Background drawing of the floor: load, scale, opacity, lock, print. */
function backgroundSection(app, plan) {
  const f = app.floor;
  const bg = f.bg;
  const set = (fn) => app.mutate(fn);
  if (!bg) {
    return [section('Achtergrond',
      h('p', { class: 'hint' }, 'Een afbeelding of PDF van een bestaand plan als onderlegger om over te tekenen.'),
      h('button', { onclick: () => loadBackground(app) }, '🖼 Afbeelding / PDF laden…'))];
  }
  return [section('Achtergrond',
    bg.name ? h('p', { class: 'hint' }, bg.name) : null,
    h('div', { class: 'grid2' },
      field('Breedte (cm)', inp(bg.w, (v) => set(() => { if (v > 0) { bg.h = Math.round((bg.h * v / bg.w) * 10) / 10; bg.w = v; } }), { type: 'number', key: 'bgw' })),
      field('Dekking (%)', inp(Math.round((bg.opacity ?? 0.5) * 100), (v) => set(() => { bg.opacity = Math.max(5, Math.min(100, v || 50)) / 100; }), { type: 'number', key: 'bgo' }))),
    chk(bg.show !== false, (v) => set(() => { bg.show = v; }), 'Tonen', 'bgshow'),
    chk(bg.locked, (v) => set(() => { bg.locked = v; if (v) app.sel.delete('B:bg'); }), 'Vergrendelen (niet verschuiven / selecteren)', 'bglock'),
    chk(bg.print, (v) => set(() => { bg.print = v; }), 'Mee afdrukken', 'bgprint'),
    h('div', { class: 'btnrow' },
      h('button', { class: 'primary', onclick: () => plan.setTool('calib', { key: 'calib' }), title: 'Klik twee punten op de achtergrond waarvan je de afstand kent' }, '📏 Schaal bepalen'),
      h('button', { onclick: () => loadBackground(app) }, 'Vervangen…'),
      h('button', { class: 'danger', onclick: () => { set(() => { f.bg = null; }); app.sel.delete('B:bg'); } }, 'Verwijderen')),
    h('p', { class: 'hint' }, bg.locked ? 'Ontgrendel de achtergrond om hem te verschuiven.' : 'Sleep de achtergrond om hem te verschuiven.'))];
}

// ---------- circuits dialog: distribution tree ----------

const ICON = { board: '🗄', rcd: 'Δ', circuit: '⚡' };

export async function circuitsDialog(app) {
  const b = app.project.building;
  const draft = clone({ boards: b.boards, rcds: b.rcds, circuits: b.circuits });
  const temp = () => ({ ...b, ...draft });
  const body = h('div', { class: 'circuits tree' });
  const collapsed = new Set();

  const f = (label, el) => h('label', { class: 'tf' }, h('span', null, label), el);
  const add = (type, parent) => {
    const tmp = temp();
    let n;
    if (type === 'rcd') { n = newRcd(parent, t('Differentieel {n}', { n: draft.rcds.length + 1 })); draft.rcds.push(n); }
    else if (type === 'board') { n = newBoard(t('Verdeelbord {n}', { n: draft.boards.length + 1 }), parent); draft.boards.push(n); }
    else { n = newCircuit(nextCircuitName(tmp), parent); draft.circuits.push(n); }
    n.pos = nextPos(temp(), parent);
    if (type === 'circuit' && n.parent) collapsed.delete(parent);
    render();
  };
  const move = (node, dir) => {
    const sib = treeChildren(temp(), node.parent);
    const i = sib.findIndex((x) => x.node === node);
    const j = i + dir;
    if (j < 0 || j >= sib.length) return;
    sib.forEach((x, k) => { x.node.pos = k; });
    [sib[i].node.pos, sib[j].node.pos] = [sib[j].node.pos, sib[i].node.pos];
    render();
  };
  /** Possible parents for a node: boards and rcds (and circuits for a board), not itself or below it. */
  const parentOptions = (type, node) => {
    const below = new Set();
    const walk = (id) => { below.add(id); for (const c of treeChildren(temp(), id)) walk(c.node.id); };
    walk(node.id);
    const out = [];
    const visit = (id, depth) => {
      for (const c of treeChildren(temp(), id)) {
        if (below.has(c.node.id)) continue;
        if (c.type !== 'circuit' || type === 'board') out.push([c.node.id, `${'  '.repeat(depth)}${ICON[c.type]} ${c.node.name}`]);
        visit(c.node.id, depth + 1);
      }
    };
    for (const r of rootBoards(temp())) {
      if (below.has(r.id)) continue;
      out.push([r.id, `${ICON.board} ${r.name}`]);
      visit(r.id, 1);
    }
    return out;
  };

  const render = () => {
    const checks = checkCircuits(temp(), app.lib);
    const byCircuit = new Map();
    for (const c of checks) if (c.circuit) { if (!byCircuit.has(c.circuit)) byCircuit.set(c.circuit, []); byCircuit.get(c.circuit).push(c); }
    const rows = [];
    // every residual current device gets its own colour; everything below it is tinted with it
    const HUES = [212, 145, 28, 280, 175, 340, 50, 250];
    const rcdHue = new Map();
    const assign = (id) => { for (const c of treeChildren(temp(), id)) { if (c.type === 'rcd') rcdHue.set(c.node.id, HUES[rcdHue.size % HUES.length]); assign(c.node.id); } };
    for (const r of rootBoards(temp())) assign(r.id);
    const row = (type, node, depth, hue = null) => {
      if (type === 'rcd') hue = rcdHue.get(node.id);
      const kids = treeChildren(temp(), node.id);
      const isRoot = type === 'board' && !node.parent;
      const fields = [];
      if (type === 'board') {
        const m = node.main;
        fields.push(
          f('Hoofdschakelaar A', inp(m.In, (v) => { m.In = v; })),
          f('Polen', sel(m.poles || 2, [[2, '2P'], [4, '4P']], (v) => { m.poles = +v; })),
          f('Diff. mA (0 = geen)', inp(m.rcd, (v) => { m.rcd = v || 0; render(); }, { type: 'number' })),
          f('Type', sel(m.type || 'A', [['AC', 'AC'], ['A', 'A'], ['F', 'F'], ['B', 'B']], (v) => { m.type = v; })),
          f('Icn', sel(m.kA || 3, [[3, '3000'], [4.5, '4500'], [6, '6000'], [10, '10000']], (v) => { m.kA = +v; })),
          f('Voedingskabel', inp(m.cable, (v) => { m.cable = v; }, { placeholder: 'XVB Cca 4x10²' })));
        if (isRoot) fields.push(h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: m.meter !== false, onchange: (e) => { m.meter = e.target.checked; } }), 'kWh-meter'));
      } else if (type === 'rcd') {
        fields.push(
          f('mA', sel(node.sens, [[10, '10'], [30, '30'], [100, '100'], [300, '300'], [500, '500']], (v) => { node.sens = +v; render(); })),
          f('A', sel(node.In, [25, 40, 63, 80, 100].map((x) => [x, x]), (v) => { node.In = +v; })),
          f('Type', sel(node.type, [['AC', 'AC'], ['A', 'A'], ['F', 'F'], ['B', 'B']], (v) => { node.type = v; })),
          f('Polen', sel(node.poles || 2, [[2, '2P'], [4, '4P']], (v) => { node.poles = +v; })),
          f('Icn', sel(node.kA || 3, [[3, '3000'], [4.5, '4500'], [6, '6000'], [10, '10000']], (v) => { node.kA = +v; })));
      } else {
        fields.push(
          f('Omschrijving', h('input', { type: 'text', value: node.desc || '', class: 'tdesc', onchange: (e) => { node.desc = e.target.value; } })),
          f('Curve', sel(node.curve, [['B', 'B'], ['C', 'C'], ['D', 'D'], ['gG', 'gG (smelt)']], (v) => { node.curve = v; })),
          f('A', sel(node.In, [6, 10, 16, 20, 25, 32, 40, 50, 63].map((x) => [x, x]), (v) => { node.In = +v; render(); })),
          f('Polen', sel(node.poles, [[1, '1P'], [2, '2P'], [3, '3P'], [4, '4P']], (v) => { node.poles = +v; })),
          f('Icn', sel(node.kA || 3, [[3, '3000'], [4.5, '4500'], [6, '6000'], [10, '10000']], (v) => { node.kA = +v; })),
          f('Kabel', h('input', { type: 'text', value: node.cable || '', list: 'cables', class: 'tcable', onchange: (e) => { node.cable = e.target.value; } })),
          f('Brandkl.', sel(node.fire || '', [['', '—'], ['Eca', 'Eca'], ['Dca', 'Dca'], ['Cca', 'Cca'], ['B2ca', 'B2ca']], (v) => { node.fire = v; })),
          f('Plaatsing', sel(node.install || 'tube-wall', Object.entries(INSTALL).map(([k, [l]]) => [k, l]), (v) => { node.install = v; })),
          f('Geleiders', sel(node.showConductors === false ? 'no' : 'yes', [['yes', 'tonen'], ['no', 'niet tonen']], (v) => { node.showConductors = v === 'yes'; })),
          f('Aders', sel(node.cores, [['3G', '3G'], ['5G', '5G'], ['2x', '2x'], ['4G', '4G']], (v) => { node.cores = v; })),
          f('mm²', sel(node.section, Object.keys(MAX_IN).map(Number).sort((x, y) => x - y).map((x) => [x, String(x).replace('.', ',')]), (v) => { node.section = +v; render(); }))
        );
      }
      const actions = h('div', { class: 'tact' },
        type !== 'circuit' ? h('button', { title: 'Differentieel toevoegen', onclick: () => add('rcd', node.id) }, '+Δ') : null,
        type !== 'circuit' ? h('button', { title: 'Kring toevoegen', onclick: () => add('circuit', node.id) }, '+ Kring') : null,
        h('button', { title: type === 'circuit' ? 'Onderverdeelbord gevoed door deze kring' : 'Onderverdeelbord toevoegen', onclick: () => add('board', node.id) }, '+ Bord'),
        !isRoot ? sel('', [['', 'Verplaats naar…'], ...parentOptions(type, node)], (v) => { if (v) { node.parent = v; node.pos = nextPos(temp(), v); render(); } }) : null,
        h('button', { class: 'icon', title: 'Omhoog', onclick: () => move(node, -1) }, '↑'),
        h('button', { class: 'icon', title: 'Omlaag', onclick: () => move(node, 1) }, '↓'),
        h('button', {
          class: 'icon danger', title: 'Verwijderen (met alles eronder)',
          onclick: () => {
            if (isRoot && rootBoards(temp()).length < 2) return toast('Er moet minstens één verdeelbord zijn.');
            removeNode(draft, node.id); render();
          },
        }, '✕'),
        type === 'circuit' ? h('span', { class: 'pts', title: 'Punten op de plattegronden' }, t('{n} punten', { n: circuitSymbols(temp(), node.id).length })) : null);
      const warns = byCircuit.get(node.id) || [];
      const tint = hue === null ? {} : {
        background: `hsla(${hue}, 75%, 55%, ${type === 'rcd' ? 0.2 : 0.09})`,
        boxShadow: `inset 4px 0 0 hsl(${hue}, 65%, 50%)`,
      };
      rows.push(h('div', { class: `trow t-${type}${warns.some((w) => w.level === 'error') ? ' err' : ''}`, style: { paddingLeft: depth * 22 + 'px', ...tint } },
        h('div', { class: 'thead' },
          kids.length ? h('button', { class: 'icon caretbtn', title: collapsed.has(node.id) ? 'Uitklappen' : 'Inklappen', onclick: () => { collapsed.has(node.id) ? collapsed.delete(node.id) : collapsed.add(node.id); render(); } }, collapsed.has(node.id) ? '▸' : '▾') : h('span', { class: 'caretbtn' }),
          h('span', { class: 'ticon', style: hue === null ? null : { color: `hsl(${hue}, 65%, 42%)` } }, ICON[type]),
          f(type === 'circuit' ? 'Kring' : type === 'rcd' ? 'Differentieel' : 'Verdeelbord',
            h('input', { type: 'text', value: node.name, class: 'tname t-' + type, onchange: (e) => { node.name = e.target.value; render(); } })),
          ...fields),
        actions,
        warns.length ? h('div', { class: 'twarn' }, warns.map((w) => h('div', { class: 'chk ' + w.level }, (w.level === 'error' ? '⚠ ' : 'ℹ ') + w.text))) : null));
      if (!collapsed.has(node.id)) for (const k of kids) row(k.type, k.node, depth + 1, hue);
    };
    for (const r of rootBoards(temp())) row('board', r, 0);
    const general = checks.filter((c) => !c.circuit);
    body.replaceChildren(...[
      h('p', { class: 'hint' }, 'Bouw de verdeling als boom: verdeelbord → differentieel → kringen, differentiëlen in differentiëlen, onderverdeelborden gevoed door een kring of differentieel. De volgorde (↑ ↓) is die van het eendraadschema.'),
      h('datalist', { id: 'cables' }, ['XVB', 'XGB', 'VOB', 'EXVB', 'XFVB'].map((x) => h('option', { value: x }))),
      ...rows,
      h('div', { class: 'btnrow' }, h('button', { onclick: () => { const n = newBoard(t('Verdeelbord {n}', { n: draft.boards.length + 1 })); n.pos = draft.boards.length; draft.boards.push(n); render(); } }, '＋ Apart verdeelbord')),
      general.length ? h('div', null, general.map((w) => h('div', { class: 'chk ' + w.level }, 'ℹ ' + w.text))) : null,
    ].filter(Boolean));
  };
  render();
  const ok = await modal({
    title: 'Kringen & verdeelborden', wide: true, full: false, body,
    buttons: [{ label: 'Annuleren', value: false }, { label: 'Opslaan', value: true, primary: true }],
  });
  if (!ok) return;
  app.mutate(() => {
    b.boards = draft.boards;
    b.rcds = draft.rcds;
    b.circuits = draft.circuits;
    const ids = new Set(b.circuits.map((c) => c.id));
    for (const fl of b.floors) for (const sy of fl.symbols) if (sy.circuit && !ids.has(sy.circuit)) { sy.circuit = ''; delete sy.n; }
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
      h('p', null, t('Per verdeelbord wordt een eendraadschema gemaakt (bladen onder "Bladen"): voeding, differentiëlen met hun rail, automaten en per kring de aftakkingen – schakelaars met hun lichtpunten (×n), stopcontactdozen en toestellen ({n} kringen). Nadien kan je de bladen nog aanpassen.', { n: b.circuits.length })),
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
  app.emit('change');
  toast('Eendraadschema gegenereerd');
}


/** Cable traces on the plan and the cable lengths per type. */
export function cablesDialog(app) {
  const b = app.project.building;
  const body = h('div', { class: 'cables' });
  const m1 = (v) => `${(Math.round(v * 10) / 10).toFixed(1).replace('.', ',')} m`;
  const render = () => {
    const cfg = traceCfg(b);
    const tr = b.traces;
    const stale = tr && tr.key !== traceKey(b);
    const num = (key) => {
      const el = h('input', { type: 'number', value: cfg[key], min: 0, step: 1 });
      el.addEventListener('change', () => {
        const v = Number(String(el.value).replace(',', '.'));
        if (!Number.isFinite(v)) return;
        app.mutate(() => { (b.traceCfg ||= {})[key] = v; });
        render();
      });
      return el;
    };
    const settings = h('details', { class: 'cablecfg' },
      h('summary', null, t('Hoogtes en reserve')),
      h('div', { class: 'cablegrid' },
        TRACE_FIELDS.map(([key, label]) => h('label', { class: 'tf' }, h('span', null, `${t(label)} (cm)`), num(key))),
        h('label', { class: 'tf' }, h('span', null, t('Extra per aansluiting (cm)')), num('box')),
        h('label', { class: 'tf' }, h('span', null, t('Reserve (%)')), num('reserve'))),
      h('p', { class: 'hint' }, 'Een punt kan een eigen hoogte krijgen in zijn eigenschappen. Plafondpunten worden via het plafond bereikt, de andere via de vloer.'));
    const show = h('input', { type: 'checkbox', checked: !!b.traceShow, disabled: !tr });
    show.addEventListener('change', () => { app.mutate(() => { b.traceShow = show.checked; }); app.emit('change'); });
    const parts = [
      h('p', { class: 'hint' }, 'Per kring een route van het verdeelbord naar het eerste punt en daarna van punt naar punt (in volgorde van de nummers). Kabels gaan enkel door deuren en openingen, niet door muren of ramen.'),
      settings,
      h('div', { class: 'btnrow' },
        h('button', {
          class: 'primary',
          onclick: () => {
            app.mutate(() => { generateTraces(b, app.lib); b.traceShow = true; });
            app.setMode('building');
            app.emit('change');
            render();
          },
        }, tr ? '⟳ Kabeltrace opnieuw genereren' : '⟳ Kabeltrace genereren'),
        h('label', { class: 'check' }, show, t('Toon op het grondplan'))),
    ];
    if (stale) parts.push(h('p', { class: 'warn' }, 'Het plan of de kringen zijn gewijzigd sinds de laatste berekening – genereer opnieuw.'));
    if (tr) {
      for (const w of tr.warnings) parts.push(h('p', { class: 'warn' }, w));
      const totals = cableTotals(tr.rows);
      parts.push(
        h('h4', null, t('Nodig per kabeltype')),
        h('div', { class: 'tablewrap' }, h('table', { class: 'list cabletable' },
          h('thead', null, h('tr', null, h('th', null, 'Kabel'), h('th', null, 'Lengte'), h('th', null, 'Kringen'))),
          h('tbody', null, totals.length ? totals.map(([cable, len, names]) => h('tr', null, h('td', null, h('b', null, cable)), h('td', { class: 'num' }, h('b', null, `${len} m`)), h('td', null, names.join(', '))))
            : h('tr', null, h('td', { colspan: 3, class: 'empty' }, 'Geen kringen met punten op het plan.'))))),
        h('h4', null, t('Per kring')),
        h('div', { class: 'tablewrap' }, h('table', { class: 'list cabletable' },
          h('thead', null, h('tr', null, h('th', null, 'Kring'), h('th', null, 'Kabel'), h('th', null, 'Punten'), h('th', null, 'Horizontaal'), h('th', null, 'Verticaal'), h('th', null, 'Totaal incl. reserve'))),
          h('tbody', null, tr.rows.map((r) => h('tr', null,
            h('td', null, h('span', { class: 'cabledot', style: { background: traceColor(b, r.circuit) } }), ` ${r.name}${r.desc ? ` – ${r.desc}` : ''}`),
            h('td', null, r.cable), h('td', { class: 'num' }, String(r.points)), h('td', { class: 'num' }, m1(r.horiz)), h('td', { class: 'num' }, m1(r.vert)), h('td', { class: 'num' }, h('b', null, `${r.total} m`))))))));
    }
    body.replaceChildren(...parts);
  };
  render();
  const csv = () => {
    const tr = b.traces;
    if (!tr) return;
    const rows = [[t('Kabel'), t('Lengte (m)'), t('Kringen')], ...cableTotals(tr.rows).map(([c, l, n]) => [c, l, n.join(' ')]), [],
      [t('Kring'), t('Kabel'), t('Punten'), t('Horizontaal (m)'), t('Verticaal (m)'), t('Totaal incl. reserve (m)')],
      ...tr.rows.map((r) => [r.name, r.cable, r.points, r.horiz.toFixed(1).replace('.', ','), r.vert.toFixed(1).replace('.', ','), r.total])];
    download(`${safeName(app.project.name)} - ${t('Kabels')}.csv`, '﻿' + toCsv(rows), 'text/csv;charset=utf-8');
  };
  return modal({
    title: 'Kabels', wide: true, body,
    buttons: [{ label: 'CSV exporteren', value: 'csv' }, { label: 'Sluiten', value: false, primary: true }],
    onButton: (v) => { if (v === 'csv') { csv(); return false; } return true; },
  });
}
