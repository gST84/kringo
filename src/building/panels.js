// Panels and dialogs of the building mode: floors, AREI symbol library, properties, circuits.
import { t } from '../i18n.js';
import { clone, h, natCmp } from '../util.js';
import { field, confirmDlg, modal, prompt, toast } from '../ui/dialogs.js';
import { symbolPreviewSvg } from '../schematic/render.js';
import { toggleFolder } from '../ui/panels.js';
import { circuitSymbols, newBoard, newCircuit, newFloor, newRcd, nextCircuitName, nextNumber, nextPos, polygonArea, removeNode, rootBoards, treeChildren, wallGeom } from './model.js';
import { checkCircuits, MAX_IN } from './rules.js';
import { generateEendraad, INSTALL } from './eendraad.js';
import { PLAN_PALETTE } from './editor.js';
import { dimGeom, hasLeaf, OPENING_TYPES } from './render.js';
import { loadBackground } from './background.js';

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
  const open = new Set(['Grondplan', 'AREI', 'AREI/Verlichting']);
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
    const items = PLAN_PALETTE.filter((p) => !q || t(p.label).toLowerCase().includes(q) || p.label.toLowerCase().includes(q));
    if (!items.length) return [];
    const isOpen = q || open.has('Grondplan');
    const out = [h('div', { class: 'folder' + (isOpen ? ' open' : ''), onclick: () => { toggleFolder(open, 'Grondplan'); render(); } },
      h('span', { class: 'caret' }, isOpen ? '▾' : '▸'), ' ', 'Grondplan')];
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
          class: 'sym' + ((app.mode === 'building' ? plan.placing?.sym : editor.placing?.sym) === d.id ? ' active' : ''),
          title: t('{name}\nKlik: plaatsen · sleep naar het blad', { name: t(d.name) }), draggable: 'true',
          onclick: () => { (app.mode === 'building' ? plan : editor).setTool('place', { sym: d.id }); render(); },
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
        for (const s of syms) { s.circuit = v; s.n = nextNumber(b, v); }
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
      h('p', { class: 'hint' }, 'Sleep de hoekpunten om te verlengen, het ronde middelpunt om te buigen.'))];
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
          num('Draaihoek (°)', 'turn', 'sturn', true), num('Start (°)', 'rot', 'srot', true)),
        h('div', { class: 'btnrow' }, h('button', { onclick: () => set(() => { st.dir = st.dir === -1 ? 1 : -1; }) }, '↻ Draairichting'), del),
        h('p', { class: 'hint' }, 'Sleep het ronde blokje om de straal te wijzigen.'))];
    }
    return [section(st.kind === 'quarter' ? 'Kwartdraaitrap' : 'Trap',
      field('Soort', sel(st.kind || 'straight', [['straight', 'Rechte trap'], ['quarter', 'Kwartdraaitrap']], (v) => set(() => {
        if (v === 'quarter') { st.kind = 'quarter'; st.b ||= Math.min(90, Math.round(Math.min(st.w, st.h) / 2)); } else delete st.kind;
      }), 'skind')),
      h('div', { class: 'grid2' },
        num('Breedte (cm)', 'w', 'sw'), num('Lengte (cm)', 'h', 'sh'),
        st.kind === 'quarter' ? num('Trapbreedte (cm)', 'b', 'sb') : null,
        num('Treden', 'steps', 'ss', true), num('Rotatie (°)', 'rot', 'sr')),
      h('div', { class: 'btnrow' },
        st.kind === 'quarter' ? h('button', { onclick: () => set(() => { st.mirror = !st.mirror; }) }, '⇋ Spiegelen') : null,
        h('button', { onclick: () => plan.rotate() }, '⟳ 90° (R)'), del))];
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
    return [section(area ? 'Gekleurd vlak' : 'Lijn',
      area ? h('p', null, t('Oppervlakte'), ': ', h('b', null, `${(polygonArea(sh.pts) / 10000).toFixed(2).replace('.', ',')} m²`)) : null,
      field('Kleur', h('div', { class: 'chips colors' }, PALETTE.map((c) => h('button', {
        class: 'cchip' + (c === cur ? ' active' : ''), style: { background: c }, title: c, onclick: () => style('color', c),
      })), free)),
      area ? field('Dekking (%)', inp(Math.round((sh.opacity ?? 0.35) * 100), (v) => style('opacity', Math.max(0, Math.min(100, v || 0)) / 100), { type: 'number', key: 'pop' })) : null,
      field(area ? 'Randdikte (mm)' : 'Lijndikte (mm)', inp(sh.width || (area ? 0.18 : 0.5), (v) => style('width', Math.max(0.05, v || 0.25)), { type: 'number', key: 'pw', step: 0.05 })),
      chk(sh.dash, (v) => style('dash', v), 'Gestreept', 'pdash'),
      area ? chk(sh.stroke !== false, (v) => style('stroke', v), 'Rand tonen', 'pstroke') : null,
      h('div', { class: 'btnrow' }, h('button', { class: 'danger', onclick: () => plan.deleteSelection() }, 'Verwijderen')),
      h('p', { class: 'hint' }, 'Sleep de hoekpunten om de vorm aan te passen.'))];
  }
  if (kind === 'B') return backgroundSection(app, plan);
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
    return [section('Koppeling', h('p', { class: 'hint' }, 'Stippellijn tussen bediening en toestel.'),
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
  if (kind === 'light' || kind === 'appliance' || kind === 'other') extra.push(field('Vermogen (W)', inp(s.props.power, setProp('power'), { type: 'number', key: 'pw' })));
  if (kind === 'socket' || kind === 'appliance') extra.push(field('Aantal dozen op dit punt', inp(s.props.qty || 1, setProp('qty'), { type: 'number', key: 'qty' }), 'In het eendraadschema herhaald op dezelfde aftakking.'));
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
          const c = newCircuit(nextCircuitName(b), rootBoards(b)[0]?.id);
          c.pos = nextPos(b, c.parent);
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
        title: 'Klik daarna de volgende symbolen na elkaar aan: dit symbool → 2 → 3 … (bv. schakelaar → lamp → lamp). Esc = stoppen.',
      }, '🔗 Koppelen…')),
    section('Plaatsing',
      rotationDial(s.rot || 0, (deg) => set(() => { s.rot = deg; })),
      h('div', { class: 'btnrow' },
        h('button', { onclick: () => plan.rotate() }, '⟳ 90° (R)'),
        h('button', { class: 'danger', onclick: () => plan.deleteSelection() }, 'Verwijderen'))),
  ];
}

/** Rotation dial: 24 dots every 15°, 0° at the top, clockwise. Click a dot to rotate the symbol. */
function rotationDial(rot, pick) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-50 -50 100 100');
  svg.classList.add('dial');
  const cur = ((Math.round(rot / 15) * 15) % 360 + 360) % 360;
  const pt = (deg, r) => [Math.sin((deg * Math.PI) / 180) * r, -Math.cos((deg * Math.PI) / 180) * r];
  const [px, py] = pt(cur, 30);
  let s = `<circle cx="0" cy="0" r="38" class="ring"/><line x1="0" y1="0" x2="${px}" y2="${py}" class="hand"/><circle cx="0" cy="0" r="3" class="hub"/>`;
  for (let deg = 0; deg < 360; deg += 15) {
    const [x, y] = pt(deg, 38);
    s += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${deg % 90 === 0 ? 4.2 : 3}" class="dot${deg === cur ? ' on' : ''}" data-deg="${deg}"><title>${deg}°</title></circle>`;
  }
  s += `<text x="0" y="16" text-anchor="middle" class="deg">${cur}°</text>`;
  svg.innerHTML = s;
  svg.addEventListener('click', (e) => {
    const d = e.target.closest?.('[data-deg]')?.dataset.deg;
    if (d !== undefined) pick(+d);
  });
  return h('div', { class: 'dialwrap', title: 'Klik op een bolletje om het symbool te draaien (per 15°)' }, svg);
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

