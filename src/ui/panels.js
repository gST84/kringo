// Side panels: pages, symbol library and properties.
import { h, natCmp, pickFiles } from '../util.js';
import { newPage, newRail, PAGE_TEMPLATES, RAIL_PRESETS, WIRE_COLORS, wireColor } from '../model.js';
import { symbolPreviewSvg } from '../schematic/render.js';
import { refText } from '../schematic/analyze.js';
import { autoTag, needsTag, numberContact, nextTerminal } from '../schematic/tags.js';
import { confirmDlg, field, modal, prompt, toast } from './dialogs.js';
import { USER_ROOT } from '../symbols/library.js';
import { geometry } from '../symbols/geom.js';

// ---------- small input helpers ----------

/** Text / number input that commits on change (blur or Enter). */
function inp(value, commit, { type = 'text', key, placeholder, list } = {}) {
  const el = h('input', { type, value: value ?? '', 'data-key': key, placeholder, list });
  el.addEventListener('change', () => commit(type === 'number' ? parseFloat(String(el.value).replace(',', '.')) : el.value));
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.blur(); });
  return el;
}

function sel(value, options, commit, key) {
  const el = h('select', { 'data-key': key }, options.map(([v, l]) => h('option', { value: v, selected: String(v) === String(value ?? '') }, l)));
  el.addEventListener('change', () => commit(el.value));
  return el;
}

const chk = (value, commit, label) => {
  const el = h('input', { type: 'checkbox', checked: !!value });
  el.addEventListener('change', () => commit(el.checked));
  return h('label', { class: 'check' }, el, label);
};

/** Rebuilds a panel while keeping keyboard focus on the same logical field. */
function rebuild(container, build) {
  const focused = document.activeElement;
  const fk = container.contains(focused) ? focused?.dataset?.key : null;
  const scroll = container.scrollTop;
  container.replaceChildren(...[build()].flat().filter(Boolean));
  container.scrollTop = scroll;
  if (fk) container.querySelector(`[data-key="${CSS.escape(fk)}"]`)?.focus();
}

/**
 * Wire colour picker: IEC colour chips, a free colour picker and "automatic" (no own colour:
 * the wire takes the colour of its supply rail).
 */
function wireColorPicker(value, pick, autoColor) {
  const cur = String(value || '').toUpperCase();
  const free = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(value || '') ? value : wireColor(value) || '#1a1a1a', title: 'Vrije kleur kiezen' });
  free.addEventListener('change', () => pick(free.value));
  return h('div', { class: 'colorpick' },
    h('div', { class: 'chips colors' },
      h('button', {
        class: 'cchip auto' + (!value ? ' active' : ''), title: 'Automatisch: kleur van de voedingslijn',
        style: autoColor ? { background: autoColor } : null, onclick: () => pick(''),
      }, 'A'),
      Object.entries(WIRE_COLORS).map(([code, [name, hex]]) => h('button', {
        class: 'cchip' + (cur === code ? ' active' : '') + (code === 'GNYE' ? ' gnye' : ''),
        title: `${name} (${code})`, style: { background: hex }, onclick: () => pick(code),
      })),
      free),
    h('small', { class: 'hint' }, value ? `Kleur: ${WIRE_COLORS[cur]?.[0] || value}${WIRE_COLORS[cur] ? ` (${cur})` : ''}` : 'Automatisch' + (autoColor ? ' – kleur van de voedingslijn' : ' – zwart')));
}

// ---------- pages ----------

export function pagesPanel(app, el) {
  const render = () => rebuild(el, () => {
    const p = app.project;
    const list = h('ol', { class: 'pagelist' }, p.pages.map((pg, i) =>
      h('li', {
        class: i === app.pageIdx ? 'active' : '',
        onclick: () => app.setPage(i),
        ondblclick: async () => {
          const t = await prompt('Paginatitel', pg.title);
          if (t !== null) app.mutate(() => { pg.title = t; });
        },
      }, h('span', { class: 'no' }, i + 1), h('span', { class: 'ttl' }, pg.title || '—'))));
    const move = (d) => {
      const i = app.pageIdx, j = i + d;
      if (j < 0 || j >= p.pages.length) return;
      app.mutate(() => { const [pg] = p.pages.splice(i, 1); p.pages.splice(j, 0, pg); });
      app.pageIdx = j;
      app.emit('change');
    };
    return [
      h('div', { class: 'panel-tools' },
        h('button', { title: 'Nieuwe pagina', onclick: () => addPageDialog(app) }, '＋ Pagina'),
        h('button', { title: 'Pagina dupliceren', onclick: () => duplicatePage(app) }, '⧉'),
        h('button', { title: 'Omhoog', onclick: () => move(-1) }, '↑'),
        h('button', { title: 'Omlaag', onclick: () => move(1) }, '↓'),
        h('button', {
          title: 'Pagina verwijderen', class: 'danger',
          onclick: async () => {
            if (p.pages.length < 2) return toast('Een project heeft minstens één pagina.');
            if (!(await confirmDlg('Pagina verwijderen', `Pagina ${app.pageIdx + 1} "${app.page.title}" verwijderen?`, 'Verwijderen', true))) return;
            app.mutate(() => {
              const removed = new Set(app.page.comps.map((c) => c.id));
              p.pages.splice(app.pageIdx, 1);
              for (const pg of p.pages) for (const c of pg.comps) if (removed.has(c.link)) delete c.link;
            });
            app.pageIdx = Math.min(app.pageIdx, p.pages.length - 1);
            app.sel.clear();
            app.emit('change');
          },
        }, '🗑')),
      list,
      h('p', { class: 'hint' }, 'Dubbelklik om te hernoemen · PgUp / PgDn wisselt pagina'),
    ];
  });
  app.on('change', render);
  return render;
}

async function addPageDialog(app) {
  const title = h('input', { type: 'text', value: 'Nieuwe pagina' });
  const tpl = h('select', null, Object.entries(PAGE_TEMPLATES).map(([k, t]) => h('option', { value: k }, t.label)));
  const ok = await modal({
    title: 'Nieuwe pagina',
    body: h('div', { class: 'form' }, field('Titel', title), field('Sjabloon (voedingslijnen)', tpl)),
    buttons: [{ label: 'Annuleren', value: false }, { label: 'Toevoegen', value: true, primary: true }],
  });
  if (!ok) return;
  const pg = newPage(title.value, tpl.value);
  app.mutate((p) => p.pages.splice(app.pageIdx + 1, 0, pg));
  app.setPage(app.pageIdx + 1);
}

function duplicatePage(app) {
  const src = JSON.parse(JSON.stringify(app.page));
  const idMap = new Map();
  src.id = 'p' + Math.random().toString(36).slice(2, 9);
  src.title += ' (kopie)';
  for (const c of src.comps) { const n = 'c' + Math.random().toString(36).slice(2, 10); idMap.set(c.id, n); c.id = n; }
  for (const c of src.comps) if (c.link && idMap.has(c.link)) c.link = idMap.get(c.link);
  for (const list of [src.wires, src.texts, src.boxes, src.rails]) for (const o of list) o.id = o.id[0] + Math.random().toString(36).slice(2, 10);
  for (const w of src.wires) delete w.label;
  app.mutate((p) => {
    p.pages.splice(app.pageIdx + 1, 0, src);
    const pi = app.pageIdx + 1;
    for (const c of src.comps) {
      const def = app.lib.get(c.sym);
      if (def?.role === 'terminal') { c.props.number = ''; c.props.number = nextTerminal(p, app.lib, c.props.strip || '-X1'); }
      else if (!c.link && needsTag(def) && c.autoTag !== false) c.tag = autoTag(p, app.lib, c, pi);
    }
  });
  app.setPage(app.pageIdx + 1);
}

// ---------- library ----------

export function libraryPanel(app, el, { editor, openSymbolEditor }) {
  const lib = app.lib;
  const open = new Set(['Standaard', USER_ROOT]);
  let filter = '';
  const search = h('input', { type: 'search', placeholder: 'Zoek symbool…', class: 'search' });
  search.addEventListener('input', () => { filter = search.value; renderTree(); });
  const treeEl = h('div', { class: 'tree' });
  const statusEl = h('div', { class: 'libstatus' });

  const itemMenu = (def, ev) => {
    ev.stopPropagation();
    const items = [];
    if (lib.isEditable(def)) items.push(['Bewerken', () => openSymbolEditor(def)]);
    items.push(['Kopie bewerken', () => {
      const g = geometry(def, { props: def.props || {} });
      const copy = JSON.parse(JSON.stringify({ ...def, graphics: g.graphics, pins: g.pins, build: undefined }));
      delete copy.id; delete copy.source; delete copy._file;
      copy.name = def.name + ' (kopie)';
      copy.folder = lib.dir && lib.dirState === 'linked' ? lib.dir.name : USER_ROOT;
      openSymbolEditor(copy);
    }]);
    items.push(['Exporteren (.ksym)', () => lib.exportSymbol(def)]);
    if (lib.isEditable(def)) items.push(['Verwijderen', async () => {
      if (await confirmDlg('Symbool verwijderen', `"${def.name}" verwijderen uit de bibliotheek?`, 'Verwijderen', true)) await lib.remove(def);
    }]);
    popupMenu(ev.clientX, ev.clientY, items);
  };

  const node = (n, depth) => {
    const out = [];
    for (const f of [...n.folders.values()].sort((a, b) => natCmp(a.name, b.name))) {
      const isOpen = filter || open.has(f.path);
      out.push(h('div', {
        class: 'folder' + (isOpen ? ' open' : ''), style: { paddingLeft: depth * 12 + 4 + 'px' },
        onclick: () => { open.has(f.path) ? open.delete(f.path) : open.add(f.path); renderTree(); },
      }, h('span', { class: 'caret' }, isOpen ? '▾' : '▸'), ' ', f.name));
      if (isOpen) out.push(...node(f, depth + 1));
    }
    if (n.symbols.length) {
      out.push(h('div', { class: 'symgrid', style: { paddingLeft: depth * 12 + 4 + 'px' } },
        n.symbols.sort((a, b) => natCmp(a.name, b.name)).map((d) => {
          const item = h('div', {
            class: 'sym' + (editor.placing?.sym === d.id ? ' active' : ''), title: `${d.name}${d.prefix ? ' (' + d.prefix + ')' : ''}\nKlik: plaatsen · sleep naar blad`,
            draggable: 'true',
            onclick: () => { editor.setTool('place', { sym: d.id }); renderTree(); },
            oncontextmenu: (e) => { e.preventDefault(); itemMenu(d, e); },
            ondragstart: (e) => e.dataTransfer.setData('text/x-kringo-symbol', d.id),
          });
          item.innerHTML = symbolPreviewSvg(d, 34);
          item.append(h('span', null, d.name), h('button', { class: 'more', title: 'Meer', onclick: (e) => itemMenu(d, e) }, '⋯'));
          return item;
        })));
    }
    return out;
  };

  const renderTree = () => {
    treeEl.replaceChildren(...node(lib.tree(filter), 0));
    statusEl.replaceChildren(...folderStatus());
  };

  const folderStatus = () => {
    if (!lib.folderSupported) return [h('small', null, 'Mapkoppeling vereist Chrome of Edge; gebruik import / export.')];
    if (lib.dirState === 'linked') return [
      h('small', null, `📁 Gekoppeld: ${lib.dir.name}`), ' ',
      h('button', { class: 'link', onclick: () => lib.readFolder() }, 'herladen'), ' ',
      h('button', { class: 'link', onclick: () => lib.unlinkFolder() }, 'ontkoppelen'),
    ];
    if (lib.dirState === 'needs-permission') return [
      h('small', null, `📁 ${lib.dir.name}: `), h('button', { class: 'link', onclick: () => lib.reconnect() }, 'toegang geven'),
    ];
    return [h('button', { class: 'link', onclick: () => lib.linkFolder().catch(() => {}) }, '📁 Symbolenmap koppelen…')];
  };

  el.replaceChildren(
    h('div', { class: 'panel-tools' },
      h('button', { onclick: () => openSymbolEditor(null), title: 'Nieuw symbool tekenen' }, '＋ Symbool'),
      h('button', {
        title: 'Symbolen importeren (.ksym / bibliotheek .json)',
        onclick: async () => {
          const files = await pickFiles({ accept: '.ksym,.elsym,.json', multiple: true });
          if (files.length) toast(`${await lib.importFiles(files)} symbool/symbolen geïmporteerd`);
        },
      }, 'Import'),
      h('button', {
        title: 'Een map met symbolen importeren (submappen worden mappen in de bibliotheek)',
        onclick: async () => {
          const files = await pickFiles({ directory: true });
          if (files.length) toast(`${await lib.importFiles(files.filter((f) => /\.(ksym|elsym|json)$/i.test(f.name)))} symbool/symbolen geïmporteerd`);
        },
      }, 'Map…'),
      h('button', { title: 'Eigen symbolen exporteren als bibliotheek', onclick: () => lib.exportLibrary() }, 'Export')),
    search, statusEl, treeEl);
  lib.onChange(renderTree);
  app.on('tool', renderTree);
  app.on('project', renderTree);
  renderTree();
}

export function popupMenu(x, y, items) {
  document.querySelector('.popup')?.remove();
  const m = h('div', { class: 'popup', style: { left: x + 'px', top: y + 'px' } },
    items.map(([label, fn]) => h('button', { onclick: () => { m.remove(); fn(); } }, label)));
  document.body.append(m);
  const close = (e) => { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', close, true); } };
  setTimeout(() => document.addEventListener('mousedown', close, true));
  const r = m.getBoundingClientRect();
  if (r.bottom > innerHeight) m.style.top = Math.max(0, innerHeight - r.height - 4) + 'px';
  if (r.right > innerWidth) m.style.left = Math.max(0, innerWidth - r.width - 4) + 'px';
}

// ---------- properties ----------

export function propertiesPanel(app, el, { editor, building }) {
  const render = () => rebuild(el, () => {
    if (app.mode === 'building' && building) return building();
    const keys = [...app.sel];
    if (!keys.length) return pageProps(app);
    if (keys.length > 1) return multiProps(app, editor, keys);
    const [t, id] = keys[0].split(':');
    const pg = app.page;
    if (t === 'c') return compProps(app, editor, pg.comps.find((c) => c.id === id));
    if (t === 'w') return wireProps(app, pg.wires.find((w) => w.id === id));
    if (t === 't') return textProps(app, pg.texts.find((x) => x.id === id));
    if (t === 'b') return boxProps(app, pg.boxes.find((x) => x.id === id));
    if (t === 'r') return railProps(app, pg.rails.find((x) => x.id === id));
    return [];
  });
  app.on('change', render);
  app.on('selection', render);
  app.on('focusProps', () => { render(); el.querySelector('input,select')?.focus(); });
  return render;
}

const section = (title, ...children) => h('div', { class: 'psec' }, h('h3', null, title), ...children);

function pageProps(app) {
  const pg = app.page;
  const set = (fn) => app.mutate(fn);
  return [
    section(`Pagina ${app.pageIdx + 1}`,
      field('Titel', inp(pg.title, (v) => set(() => { pg.title = v; }), { key: 'ptitle' }))),
    section('Voedingslijnen',
      ...pg.rails.map((r) => h('div', { class: 'railrow' },
        inp(r.color, (v) => set(() => { r.color = v; }), { type: 'color', key: 'rc' + r.id }),
        inp(r.name, (v) => set(() => { r.name = v; if (RAIL_PRESETS[v]) r.color = RAIL_PRESETS[v]; }), { key: 'rn' + r.id }),
        inp(r.y, (v) => set(() => { r.y = v; }), { type: 'number', key: 'ry' + r.id }),
        h('button', { class: 'icon danger', title: 'Verwijderen', onclick: () => set(() => { pg.rails = pg.rails.filter((x) => x !== r); }) }, '✕'))),
      h('div', { class: 'chips' }, ['L', 'N', 'L1', 'L2', 'L3', 'PE', '+24V', '0V'].map((n) =>
        h('button', {
          onclick: () => set(() => {
            const ys = pg.rails.map((r) => r.y);
            let y = n === 'N' || n === '0V' || n === 'PE' ? 245 : 25;
            while (ys.includes(y)) y += n === 'N' || n === '0V' ? -5 : 5;
            pg.rails.push(newRail(n, y));
          }),
        }, '+ ' + n))),
      h('p', { class: 'hint' }, 'Y in mm (raster 5). Een lijn selecteren en verslepen kan ook op het blad.'),
      chk(app.project.settings.colorWires !== false, (v) => set((p) => { p.settings.colorWires = v; }), 'Draden krijgen de kleur van hun voedingslijn')),
    section('Sneltoetsen', h('p', { class: 'hint keys' },
      'V selecteren · W draad · T tekst · B kader · R draaien · M spiegelen · Del verwijderen · Ctrl+C / V / D · Ctrl+Z / Y · F passend · spatie+slepen of middelste knop: pannen · Alt: zonder raster')),
  ];
}

function multiProps(app, editor, keys) {
  const wires = app.page.wires.filter((w) => app.sel.has('w:' + w.id));
  const colorSec = wires.length ? section(`Kleur van ${wires.length} draad/draden`,
    wireColorPicker(wires.every((w) => w.color === wires[0].color) ? wires[0].color : '', (v) => app.mutate(() => {
      for (const w of wires) { if (v) w.color = v; else delete w.color; }
    }))) : null;
  return [colorSec, section(`${keys.length} elementen geselecteerd`,
    h('div', { class: 'btnrow' },
      h('button', { onclick: () => editor.rotate() }, '⟳ Draaien'),
      h('button', { onclick: () => editor.mirror() }, '⇋ Spiegelen'),
      h('button', { class: 'danger', onclick: () => editor.deleteSelection() }, 'Verwijderen')))];
}

function compProps(app, editor, c) {
  if (!c) return [];
  const an = app.analysis();
  const info = an.comps.get(c.id);
  const def = info.def;
  const role = def?.role;
  const set = (fn) => app.mutate(fn);
  const setProp = (k) => (v) => set(() => { c.props[k] = v; });
  const out = [];
  const head = h('div', { class: 'comphead' });
  if (def) head.innerHTML = symbolPreviewSvg(def, 40);
  head.append(h('div', null, h('b', null, def?.name || 'Onbekend symbool'), h('small', null, `${def?.folder || ''} · ${info.loc.page}.${info.loc.col}${info.loc.row}`)));
  out.push(head);

  const s = [];
  if (needsTag(def)) {
    if (info.master) {
      s.push(field('Toestel', h('div', { class: 'ro' }, info.tag || '—', ' ',
        h('button', { class: 'link', onclick: () => goTo(app, info.master.comp.id) }, `→ /${refText(info.master.loc)}`))));
    } else {
      s.push(field('Toestel (tag)', inp(c.tag, (v) => set(() => { c.tag = v; c.autoTag = false; }), { key: 'tag' })));
      s.push(chk(c.autoTag !== false, (v) => set((p) => {
        c.autoTag = v;
        if (v) c.tag = autoTag(p, app.lib, c, app.pageIdx);
      }), 'Automatisch nummeren (pagina / kolom)'));
      if (an.duplicates.has(c.tag)) s.push(h('p', { class: 'warn' }, '⚠ Deze tag bestaat al in het project.'));
    }
    // link to a main device
    const cands = [];
    for (const i2 of an.comps.values()) {
      if (i2.comp.id === c.id || i2.master || !needsTag(i2.def) || !i2.comp.tag) continue;
      cands.push(i2);
    }
    cands.sort((a, b) => (b.def?.role === 'main') - (a.def?.role === 'main') || natCmp(a.comp.tag, b.comp.tag));
    if (!info.linked.length) {
      s.push(field('Koppelen aan toestel', sel(c.link || '', [['', '— niet gekoppeld —'], ...cands.map((i2) =>
        [i2.comp.id, `${i2.comp.tag}  ${i2.def?.name || ''}${i2.comp.props?.desc ? ' – ' + i2.comp.props.desc : ''}  /${refText(i2.loc)}`])],
      (v) => set((p) => {
        if (v) { c.link = v; numberContact(p, app.lib, c); } else { delete c.link; if (c.autoTag !== false) c.tag = autoTag(p, app.lib, c, app.pageIdx); }
      }), 'link'), 'Contacten, PLC-punten … van hetzelfde toestel delen de tag.'));
    }
    s.push(field('Functietekst', inp(c.props.desc, setProp('desc'), { key: 'desc' })));
  }
  if (role === 'terminal') {
    s.push(field('Klemmenstrook', inp(c.props.strip, setProp('strip'), { key: 'strip', list: 'strips' })));
    s.push(field('Klemnummer', inp(c.props.number, setProp('number'), { key: 'number' })));
    s.push(field('Functietekst', inp(c.props.desc, setProp('desc'), { key: 'desc' })));
    const strips = new Set();
    for (const i2 of an.comps.values()) if (i2.def?.role === 'terminal') strips.add(i2.comp.props?.strip || '');
    s.push(h('datalist', { id: 'strips' }, [...strips].map((x) => h('option', { value: x }))));
  }
  if (role === 'link') {
    s.push(field('Naam (zelfde naam = zelfde potentiaal)', inp(c.props.name, setProp('name'), { key: 'name' })));
    if (info.refs?.length) s.push(h('div', { class: 'reflist' }, 'Ook op: ', info.refs.map((l) => `/${refText(l)}`).join(', ')));
  }
  if ('addr' in (def?.props || {})) s.push(field('PLC-adres', inp(c.props.addr, setProp('addr'), { key: 'addr' })));
  if (def?.build) {
    s.push(field('Aantal kanalen', inp(c.props.channels, setProp('channels'), { type: 'number', key: 'channels' })));
    s.push(field('Startadres', inp(c.props.start, setProp('start'), { key: 'start' })));
  }
  if (needsTag(def)) {
    s.push(field('Fabrikant', inp(c.props.maker, setProp('maker'), { key: 'maker' })));
    s.push(field('Artikelnummer', inp(c.props.article, setProp('article'), { key: 'article' })));
  }
  out.push(section('Eigenschappen', ...s));

  const geom = info.geom;
  if (geom.pins?.length && role !== 'terminal' && role !== 'link' && !def?.build) {
    out.push(section('Aansluitingen', h('div', { class: 'pingrid' }, geom.pins.map((p) =>
      h('label', null, h('span', null, p.id),
        inp(c.pinNames?.[p.id] ?? p.name, (v) => set(() => { c.pinNames = { ...(c.pinNames || {}), [p.id]: v }; }), { key: 'pin' + p.id }))))));
  }
  if (info.linked.length) {
    out.push(section('Gekoppelde onderdelen', h('ul', { class: 'linked' }, info.linked.map((l) =>
      h('li', null, h('button', { class: 'link', onclick: () => goTo(app, l.comp.id) }, `/${refText(l.loc)}`), ' ',
        l.def?.name || '', ' ', h('small', null, l.pins.map((p) => p.name).join('-')))))));
  }
  out.push(section('Plaatsing', h('div', { class: 'btnrow' },
    h('button', { onclick: () => editor.rotate() }, '⟳ Draaien (R)'),
    h('button', { onclick: () => editor.mirror() }, '⇋ Spiegelen (M)'),
    h('button', { class: 'danger', onclick: () => editor.deleteSelection() }, 'Verwijderen'))));
  return out;
}

export function goTo(app, compId) {
  const f = app.findComp(compId);
  if (!f) return;
  if (f.pageIdx !== app.pageIdx) app.setPage(f.pageIdx);
  app.select(['c:' + compId]);
}

function wireProps(app, w) {
  if (!w) return [];
  const an = app.analysis();
  const net = an.wireNet.get(w.id);
  const set = (fn) => app.mutate(fn);
  const pins = (net?.pins || []).map((p) => (p.info.def?.role === 'terminal' ? `${p.info.tag}:${p.info.comp.props?.number}` : `${p.info.tag || '?'}:${p.pin.name}`));
  return [section('Draad',
    field('Draadnummer', inp(w.label || '', (v) => set(() => { w.label = v; }), { key: 'wlabel', placeholder: net?.label || '' }),
      'Leeg = automatisch. Geldt voor de hele verbinding (potentiaal).'),
    field('Kleur', wireColorPicker(w.color, (v) => set(() => { if (v) w.color = v; else delete w.color; }),
      app.project.settings.colorWires !== false ? net?.railColor : null)),
    h('div', { class: 'btnrow' }, h('button', {
      title: 'Zelfde kleur voor alle draden van deze verbinding (potentiaal), op alle pagina\'s',
      onclick: () => set(() => { for (const x of net?.wires || []) { if (w.color) x.wire.color = w.color; else delete x.wire.color; } }),
    }, 'Kleur op hele verbinding toepassen')),
    field('Doorsnede (mm²)', inp(w.section || '', (v) => set(() => { w.section = v; }), { key: 'wsec', list: 'sections' })),
    h('datalist', { id: 'sections' }, ['0.5', '0.75', '1', '1.5', '2.5', '4', '6', '10', '16'].map((x) => h('option', { value: x }))),
    h('div', { class: 'reflist' }, h('b', null, 'Verbonden: '), pins.length ? pins.join(', ') : '—'),
    h('div', { class: 'btnrow' }, h('button', { class: 'danger', onclick: () => { app.mutate(() => { app.page.wires = app.page.wires.filter((x) => x !== w); }); app.select([]); } }, 'Verwijderen')))];
}

function textProps(app, t) {
  if (!t) return [];
  const set = (fn) => app.mutate(fn);
  const ta = h('textarea', { rows: 3, value: t.text, 'data-key': 'ttext' });
  ta.addEventListener('change', () => set(() => { t.text = ta.value; }));
  return [section('Tekst',
    field('Inhoud', ta),
    field('Grootte (mm)', inp(t.size, (v) => set(() => { t.size = v || 3; }), { type: 'number', key: 'tsize' })),
    field('Uitlijning', sel(t.anchor || 'start', [['start', 'Links'], ['middle', 'Midden'], ['end', 'Rechts']], (v) => set(() => { t.anchor = v; }), 'tanchor')),
    chk(t.bold, (v) => set(() => { t.bold = v; }), 'Vet'))];
}

function boxProps(app, b) {
  if (!b) return [];
  const set = (fn) => app.mutate(fn);
  return [section('Kader',
    field('Label', inp(b.label, (v) => set(() => { b.label = v; }), { key: 'blabel' })),
    field('Lijnstijl', sel(b.style, [['dashdot', 'Streep-punt (toestelgrens)'], ['solid', 'Doorlopend']], (v) => set(() => { b.style = v; }), 'bstyle')),
    h('div', { class: 'grid2' },
      field('Breedte', inp(b.w, (v) => set(() => { b.w = v; }), { type: 'number', key: 'bw' })),
      field('Hoogte', inp(b.h, (v) => set(() => { b.h = v; }), { type: 'number', key: 'bh' }))))];
}

function railProps(app, r) {
  if (!r) return [];
  const set = (fn) => app.mutate(fn);
  return [section('Voedingslijn',
    field('Naam / potentiaal', inp(r.name, (v) => set(() => { r.name = v; if (RAIL_PRESETS[v]) r.color = RAIL_PRESETS[v]; }), { key: 'rname' })),
    field('Kleur', inp(r.color, (v) => set(() => { r.color = v; }), { type: 'color', key: 'rcolor' })),
    h('div', { class: 'grid3' },
      field('Y', inp(r.y, (v) => set(() => { r.y = v; }), { type: 'number', key: 'ry' })),
      field('X van', inp(r.x0, (v) => set(() => { r.x0 = v; }), { type: 'number', key: 'rx0' })),
      field('X tot', inp(r.x1, (v) => set(() => { r.x1 = v; }), { type: 'number', key: 'rx1' }))),
    h('p', { class: 'hint' }, 'Lijnen met dezelfde naam zijn op alle pagina\'s hetzelfde potentiaal; het draadnummer wordt de naam. Draden zonder eigen kleur nemen de kleur van de lijn over.'))];
}
