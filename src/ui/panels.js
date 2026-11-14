// Side panels: pages, symbol library and properties.
import { t } from '../i18n.js';
import { h, natCmp, pickFiles, uid } from '../util.js';
import { frameOf, isProcessPage, newPage, newRail, PAGE_TEMPLATES, pageGroup, pageType, SHEET_SIZES, sortPages, RAIL_PRESETS, WIRE_COLORS, wireColor } from '../model.js';
import { BLOCK_FOLDER, blockId, PORT, PORT_FOLDER } from '../blocks/block.js';
import { symbolPreviewSvg } from '../schematic/render.js';
import { refText } from '../schematic/analyze.js';
import { autoTag, needsTag, numberContact, nextTerminal } from '../schematic/tags.js';
import { confirmDlg, field, modal, prompt, toast } from './dialogs.js';
import { USER_ROOT } from '../symbols/library.js';
import { geometry } from '../symbols/geom.js';
import { parseMarks } from '../fluid/marks.js';

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
        title: `${t(name)} (${code})`, style: { background: hex }, onclick: () => pick(code),
      })),
      free),
    h('small', { class: 'hint' }, value ? `${t('Kleur')}: ${WIRE_COLORS[cur] ? t(WIRE_COLORS[cur][0]) : value}${WIRE_COLORS[cur] ? ` (${cur})` : ''}` : t(autoColor ? 'Automatisch – kleur van de voedingslijn' : 'Automatisch – zwart')));
}

/** Accordion: opening a folder closes every other folder except its parents. */
export function toggleFolder(open, path) {
  if (open.has(path)) {
    for (const q of [...open]) if (q === path || q.startsWith(path + '/')) open.delete(q);
    return;
  }
  for (const q of [...open]) if (!path.startsWith(q + '/')) open.delete(q);
  open.add(path);
}

// ---------- pages ----------

/** Sheet groups in control projects (in this order). */
export const PAGE_GROUPS = [
  { type: 'electric', label: '⚡ Elektrisch', add: 'Nieuw elektrisch blad', empty: 'Nog geen elektrische bladen.' },
  { type: 'pneu', label: '💨 Pneumatica', add: 'Nieuw pneumatisch blad', empty: 'Nog geen bladen – klik ＋ voor een pneumatisch schema.' },
  { type: 'hydr', label: '💧 Hydraulica', add: 'Nieuw hydraulisch blad', empty: 'Nog geen bladen – klik ＋ voor een hydraulisch schema.' },
  { type: 'cool', label: '❄ Koeling', add: 'Nieuw blad voor een koelcircuit', empty: 'Nog geen bladen – klik ＋ voor een koelcircuit (koelwater of koelmiddel).' },
  { type: 'block', label: '🧩 Bouwblokken', add: 'Nieuw bouwblok', empty: 'Nog geen bouwblokken – klik ＋ om een stuk schema te tekenen dat je als één symbool hergebruikt.' },
];

/** Page list. Control projects group the sheets: electrical, pneumatic / hydraulic, cooling. */
export function pagesPanel(app, el) {
  const render = () => rebuild(el, () => {
    const p = app.project;
    const item = (pg, i) => h('li', {
      class: i === app.pageIdx ? 'active' : '',
      onclick: () => app.setPage(i),
      ondblclick: async () => {
        const t = await prompt('Paginatitel', pg.title);
        if (t !== null) app.mutate(() => { pg.title = t; });
      },
    }, h('span', { class: 'no' }, i + 1), h('span', { class: 'ttl' }, pg.title || '—'));
    const grouped = p.kind !== 'building';
    const group = (g) => {
      const items = p.pages.map((pg, i) => [pg, i]).filter(([pg]) => pageGroup(pg) === g.type);
      return h('div', { class: 'pagegroup ' + g.type },
        h('div', { class: 'pagegrouphead' }, h('span', null, t(g.label)),
          h('button', { title: g.add, onclick: () => addPageDialog(app, g.type) }, '＋')),
        items.length ? h('ol', { class: 'pagelist' }, items.map(([pg, i]) => item(pg, i))) : h('p', { class: 'hint' }, g.empty));
    };
    const move = (d) => {
      const i = app.pageIdx, j = i + d;
      if (j < 0 || j >= p.pages.length || pageGroup(p.pages[i]) !== pageGroup(p.pages[j])) return;
      app.mutate(() => { const [pg] = p.pages.splice(i, 1); p.pages.splice(j, 0, pg); });
      app.pageIdx = j;
      app.emit('change');
    };
    return [
      h('div', { class: 'panel-tools' },
        h('button', { title: 'Nieuwe pagina van hetzelfde soort', onclick: () => addPageDialog(app, pageGroup(app.page)) }, '＋ Pagina'),
        h('button', { title: 'Pagina dupliceren', onclick: () => duplicatePage(app) }, '⧉'),
        h('button', { title: 'Omhoog', onclick: () => move(-1) }, '↑'),
        h('button', { title: 'Omlaag', onclick: () => move(1) }, '↓'),
        h('button', {
          title: 'Pagina verwijderen', class: 'danger',
          onclick: async () => {
            if (p.pages.length < 2) return toast('Een project heeft minstens één pagina.');
            const uses = app.page.block ? blockUses(p, app.page) : 0;
            const msg = t('Pagina {n} "{title}" verwijderen?', { n: app.pageIdx + 1, title: app.page.title }) + (uses ? ' ' + t('Dit bouwblok is {n} keer geplaatst; die blokken verdwijnen mee.', { n: uses }) : '');
            if (!(await confirmDlg('Pagina verwijderen', msg, 'Verwijderen', true))) return;
            app.mutate(() => {
              const removed = new Set(app.page.comps.map((c) => c.id));
              const blk = app.page.block ? blockId(app.page) : null;
              p.pages.splice(app.pageIdx, 1);
              if (blk) for (const pg of p.pages) pg.comps = pg.comps.filter((c) => c.sym !== blk);
              for (const pg of p.pages) for (const c of pg.comps) if (removed.has(c.link)) delete c.link;
            });
            app.pageIdx = Math.min(app.pageIdx, p.pages.length - 1);
            app.sel.clear();
            app.emit('page');
            app.emit('change');
          },
        }, '🗑')),
      ...(grouped ? PAGE_GROUPS.map(group)
        : [h('ol', { class: 'pagelist' }, p.pages.map(item))]),
      h('p', { class: 'hint' }, 'Dubbelklik om te hernoemen · PgUp / PgDn wisselt pagina'),
    ];
  });
  app.on('change', render);
  return render;
}

/** New sheet of a type ('electric', 'pneu', 'hydr' or 'cool'; process sheets have no supply rails). */
async function addPageDialog(app, type = 'electric') {
  if (type === 'block') return addBlockDialog(app);
  const fluid = type !== 'electric';
  const title = h('input', { type: 'text', value: t({ pneu: 'Pneumatisch schema', hydr: 'Hydraulisch schema', cool: 'Koelcircuit' }[type] || 'Nieuwe pagina') });
  const tpl = h('select', null, Object.entries(PAGE_TEMPLATES).map(([k, t]) => h('option', { value: k }, t.label)));
  const size = h('select', null, sheetOptions().map(([k, l]) => h('option', { value: k, selected: k === (app.page?.sheet || 'A3') && pageType(app.page) === type }, l)));
  const ok = await modal({
    title: PAGE_GROUPS.find((g) => g.type === type && g.type !== 'electric')?.add || 'Nieuwe pagina',
    body: h('div', { class: 'form' }, field('Titel', title), fluid ? null : field('Sjabloon (voedingslijnen)', tpl), app.project.kind === 'building' ? null : field('Bladformaat', size)),
    buttons: [{ label: 'Annuleren', value: false }, { label: 'Toevoegen', value: true, primary: true }],
  });
  if (!ok) return;
  const pg = newPage(title.value, fluid ? 'empty' : tpl.value, type);
  if (size.value !== 'A3') setSheet(pg, size.value);
  // template rails at the bottom follow a larger sheet
  if (pg.sheet) for (const r of pg.rails) if (r.y > 200) r.y += frameOf(pg).area.y1 - 255;
  // after the current sheet when it is of the same type, otherwise at the end of that group
  const pages = app.project.pages;
  const order = (x) => PAGE_GROUPS.findIndex((g) => g.type === pageType(x));
  const at = pageType(app.page) === type ? app.pageIdx + 1 : pages.filter((x) => order(x) <= order(pg)).length;
  app.mutate((p) => p.pages.splice(at, 0, pg));
  app.setPage(at);
}

/** Number of placed instances of a block sheet. */
const blockUses = (p, pg) => p.pages.reduce((n, x) => n + x.comps.filter((c) => c.sym === blockId(pg)).length, 0);

/** New building block: a sheet of a chosen kind whose content becomes one reusable symbol. */
async function addBlockDialog(app) {
  const title = h('input', { type: 'text', value: t('Nieuw bouwblok') });
  const kinds = [['electric', 'Elektrisch'], ['pneu', 'Pneumatica'], ['hydr', 'Hydraulica'], ['cool', 'Koeling']];
  const kind = h('select', null, kinds.map(([k, l]) => h('option', { value: k, selected: k === pageType(app.page) }, t(l))));
  const prefix = h('input', { type: 'text', value: 'A' });
  const ok = await modal({
    title: 'Nieuw bouwblok',
    body: h('div', { class: 'form' }, field('Naam', title), field('Soort (bepaalt de symbolen in de bibliotheek)', kind), field('Letter van de tag (bv. A, U, V)', prefix),
      h('p', { class: 'hint' }, 'Teken het bouwblok met de gewone symbolen en draden. Zet een Aansluitpunt (map Bouwblok) waar het blok met de rest van het schema verbindt. Daarna staat het blok in de bibliotheek onder Bouwblokken.')),
    buttons: [{ label: 'Annuleren', value: false }, { label: 'Toevoegen', value: true, primary: true }],
  });
  if (!ok) return;
  const pg = newPage(title.value || t('Bouwblok'), 'empty', kind.value);
  pg.block = { prefix: prefix.value.trim() || 'A', view: 'full' };
  app.mutate((p) => { p.pages.push(pg); });
  app.setPage(app.project.pages.length - 1);
}

function duplicatePage(app) {
  const src = JSON.parse(JSON.stringify(app.page));
  const idMap = new Map();
  src.id = uid('p');
  src.title += ' (kopie)';
  for (const c of src.comps) { const n = uid('c'); idMap.set(c.id, n); c.id = n; }
  for (const c of src.comps) if (c.link && idMap.has(c.link)) c.link = idMap.get(c.link);
  for (const list of [src.wires, src.texts, src.boxes, src.rails]) for (const o of list) o.id = uid(o.id[0]);
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
  const open = new Set(['Standaard']);
  let filter = '';
  const search = h('input', { type: 'search', placeholder: 'Zoek symbool…', class: 'search' });
  search.addEventListener('input', () => { filter = search.value; renderTree(); });
  const treeEl = h('div', { class: 'tree' });
  const statusEl = h('div', { class: 'libstatus' });

  const itemMenu = (def, ev) => {
    ev.stopPropagation();
    const items = [];
    if (def.block) {
      // building blocks are edited as a sheet
      const pi = app.project?.pages.findIndex((pg) => blockId(pg) === def.id);
      if (pi >= 0) items.push(['Blad van het bouwblok openen', () => app.setPage(pi)]);
      else if (app.project?.kind !== 'building') items.push(['Als bouwblok in dit project bewerken', () => openBlockAsSheet(app, def)]);
      if (lib.isEditable(def)) items.push(['Verwijderen', async () => {
        if (await confirmDlg('Symbool verwijderen', t('"{name}" verwijderen uit de bibliotheek?', { name: t(def.name) }), 'Verwijderen', true)) await lib.remove(def);
      }]);
      return popupMenu(ev.clientX, ev.clientY, items);
    }
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
      if (await confirmDlg('Symbool verwijderen', t('"{name}" verwijderen uit de bibliotheek?', { name: t(def.name) }), 'Verwijderen', true)) await lib.remove(def);
    }]);
    popupMenu(ev.clientX, ev.clientY, items);
  };

  // each sheet type shows its own main folders: electrical (Standaard, AREI), fluid (Pneumatica,
  // Hydraulica) or cooling (Koeling); buildings and their single-line sheets are 'electric'
  const MAIN = { electric: ['Standaard', 'AREI'], pneu: ['Pneumatica'], hydr: ['Hydraulica'], cool: ['Koeling'] };
  const sheetType = () => (app.project && app.project.kind !== 'building' && app.mode === 'schematic' ? pageType(app.page) : 'electric');
  const hidden = () => {
    const own = MAIN[sheetType()] || [];
    const out = new Set(Object.values(MAIN).flat().filter((x) => !own.includes(x)));
    // ports only on block sheets; building blocks only in control projects
    if (!(app.project && app.page?.block)) out.add(PORT_FOLDER);
    if (app.project?.kind === 'building') out.add(BLOCK_FOLDER);
    return out;
  };
  const node = (n, depth) => {
    const out = [];
    const hide = depth === 0 ? hidden() : new Set();
    for (const f of [...n.folders.values()].filter((x) => !hide.has(x.name)).sort((a, b) => natCmp(a.name, b.name))) {
      const isOpen = filter || open.has(f.path);
      out.push(h('div', {
        class: 'folder' + (isOpen ? ' open' : ''), style: { paddingLeft: depth * 12 + 4 + 'px' },
        onclick: () => { toggleFolder(open, f.path); renderTree(); },
      }, h('span', { class: 'caret' }, isOpen ? '▾' : '▸'), ' ', f.name));
      if (isOpen) out.push(...node(f, depth + 1));
    }
    if (n.symbols.length) {
      out.push(h('div', { class: 'symgrid', style: { paddingLeft: depth * 12 + 4 + 'px' } },
        n.symbols.sort((a, b) => natCmp(a.name, b.name)).map((d) => {
          const item = h('div', {
            class: 'sym' + (editor.placing?.sym === d.id ? ' active' : ''), title: t('{name}\nKlik: plaatsen · sleep naar het blad', { name: t(d.name) + (d.prefix ? ' (' + d.prefix + ')' : '') }),
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
          if (files.length) toast(t('{n} symbool/symbolen geïmporteerd', { n: await lib.importFiles(files) }));
        },
      }, 'Import'),
      h('button', {
        title: 'Een map met symbolen importeren (submappen worden mappen in de bibliotheek)',
        onclick: async () => {
          const files = await pickFiles({ directory: true });
          if (files.length) toast(t('{n} symbool/symbolen geïmporteerd', { n: await lib.importFiles(files.filter((f) => /\.(ksym|elsym|json)$/i.test(f.name))) }));
        },
      }, 'Map…'),
      h('button', { title: 'Eigen symbolen exporteren als bibliotheek', onclick: () => lib.exportLibrary() }, 'Export')),
    search, statusEl, treeEl);
  lib.onChange(renderTree);
  app.on('tool', renderTree);
  // switching between electrical and fluid sheets opens the matching main folder
  let shown = null;
  const sync = () => {
    const f = sheetType();
    if (f !== shown) { shown = f; open.clear(); open.add(MAIN[f][0]); }
    renderTree();
  };
  app.on('project', () => { shown = null; sync(); });
  app.on('page', sync);
  app.on('mode', sync);
  renderTree();
}

/** A building block from the library as a block sheet of the current project (to change and save it again). */
function openBlockAsSheet(app, def) {
  const B = def.block;
  const pg = newPage(def.name, 'empty', B.type || 'electric');
  const dx = 20, dy = 20;
  const sh = (o) => ({ ...JSON.parse(JSON.stringify(o)), x: o.x + dx, y: o.y + dy });
  pg.comps = B.comps.map(sh);
  pg.wires = B.wires.map((w) => ({ ...JSON.parse(JSON.stringify(w)), points: w.points.map(([x, y]) => [x + dx, y + dy]) }));
  pg.texts = (B.texts || []).map(sh);
  pg.boxes = (B.boxes || []).map(sh);
  pg.rails = (B.rails || []).map((r) => ({ ...r, y: r.y + dy, x0: r.x0 + dx, x1: r.x1 + dx }));
  pg.block = { prefix: def.prefix || 'A', view: def.props?.view || 'full', libId: def.id };
  app.mutate((p) => {
    p.pages.push(pg);
    // symbols the block brought along stay available in this project
    for (const [id, d] of Object.entries(B.symbols || {})) if (!app.lib.get(id)) p.symbols[id] = d;
  });
  app.setPage(app.project.pages.length - 1);
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
    if (!app.page) return [];
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

/** Sheet size choice (landscape), e.g. for large hydraulic diagrams. */
const sheetOptions = () => Object.entries(SHEET_SIZES).map(([k, [w, h]]) => [k, `${k} ${t('liggend')} (${w} × ${h} mm)`]);

/** Changes the sheet size of a page; supply rails that ran to the right edge follow it. */
export function setSheet(pg, size) {
  const old = frameOf(pg).area.x1;
  if (size === 'A3') delete pg.sheet; else pg.sheet = size;
  const nx = frameOf(pg).area.x1;
  for (const r of pg.rails) if (Math.abs(r.x1 - old) < 0.01) r.x1 = nx;
}

/** Turns a sheet into a building block (or back into a normal sheet). */
async function toggleBlock(app, pg, on) {
  const uses = blockUses(app.project, pg);
  if (!on && uses && !(await confirmDlg('Bouwblok opheffen', t('Dit bouwblok is {n} keer geplaatst; die blokken verdwijnen mee.', { n: uses }), 'Opheffen', true))) return app.emit('change');
  app.mutate((p) => {
    if (on) pg.block = { prefix: 'A', view: 'full' };
    else {
      delete pg.block;
      for (const x of p.pages) x.comps = x.comps.filter((c) => c.sym !== blockId(pg));
    }
    sortPages(p);
  });
  app.setPage(app.project.pages.indexOf(pg));
}

/** Settings of a block sheet: tag letter, standard view, frame, saving to the own library. */
function blockSection(app, pg) {
  const b = pg.block;
  const set = (fn) => app.mutate(fn);
  const ports = pg.comps.filter((c) => c.sym === PORT);
  const uses = blockUses(app.project, pg);
  const save = async () => {
    const def = app.lib.get(blockId(pg));
    if (!def) return;
    const copy = JSON.parse(JSON.stringify({ ...def, source: undefined }));
    copy.id = b.libId || undefined;
    copy.folder = USER_ROOT + '/' + BLOCK_FOLDER;
    const id = await app.lib.save(copy);
    if (b.libId !== id) set(() => { b.libId = id; });
    toast(t('"{name}" bewaard in Mijn symbolen / Bouwblokken.', { name: def.name }));
  };
  return section('Bouwblok',
    field('Letter van de tag', inp(b.prefix, (v) => set(() => { b.prefix = v.trim() || 'A'; }), { key: 'bprefix' }), 'Een geplaatst blok krijgt bv. de tag -A1; de toestellen erin worden -A1-K1, -A1-Y1 …'),
    field('Standaard weergave', sel(b.view || 'full', [['full', 'Volledige inhoud'], ['compact', 'Compact kader (alleen aansluitingen)']], (v) => set(() => { b.view = v; }), 'bview'), 'Per geplaatst blok aan te passen.'),
    field('Kader rond de inhoud', sel(b.frame || 'dashdot', [['dashdot', 'Streep-punt (toestelgrens)'], ['solid', 'Doorlopend'], ['none', 'Geen']], (v) => set(() => { b.frame = v; }), 'bframe')),
    h('p', { class: ports.length ? 'hint' : 'warn' }, ports.length
      ? t('Aansluitpunten: {list}', { list: ports.map((c) => c.props?.name || '?').join(', ') })
      : t('Nog geen aansluitpunten: plaats een Aansluitpunt (map Bouwblok) waar het blok verbindt.')),
    h('p', { class: 'hint' }, uses ? t('{n} keer geplaatst. Wijzigingen op dit blad gelden voor elk geplaatst blok.', { n: uses }) : t('Plaats het blok vanuit de bibliotheek (map Bouwblokken) op een ander blad.')),
    h('div', { class: 'btnrow' }, h('button', { onclick: save, title: 'Ook in andere projecten gebruiken' }, b.libId ? 'Bijwerken in Mijn symbolen' : 'Bewaren in Mijn symbolen')));
}

function pageProps(app) {
  const pg = app.page;
  const set = (fn) => app.mutate(fn);
  return [
    section(t('Pagina {n}', { n: app.pageIdx + 1 }),
      field('Titel', inp(pg.title, (v) => set(() => { pg.title = v; }), { key: 'ptitle' })),
      pg.gen ? null : field('Bladformaat', sel(pg.sheet || 'A3', sheetOptions(), (v) => set(() => setSheet(pg, v)), 'psheet'), t('Groter blad voor uitgebreide schema\'s; kolommen en rijen groeien mee.')),
      pageType(pg) === 'pneu' || pageType(pg) === 'hydr' ? h('p', { class: 'hint' }, pageType(pg) === 'pneu'
        ? 'Pneumatisch blad: de bibliotheek toont de symbolen voor pneumatica. Ventielen met een elektromagneet volgen de spoel met dezelfde naam op een elektrisch blad.'
        : 'Hydraulisch blad: de bibliotheek toont de symbolen voor hydraulica. Ventielen met een elektromagneet volgen de spoel met dezelfde naam op een elektrisch blad.') : null,
      pageType(pg) === 'cool' ? h('p', { class: 'hint' }, 'Koelcircuit: de bibliotheek toont koelwater, koelmiddel en instrumenten. Pompen, compressoren en ventilatoren volgen de spoel (contactor) die je opgeeft; contacten op een elektrisch blad koppel je aan een thermostaat, debiet- of drukschakelaar.') : null,
      app.project.kind === 'building' || pg.gen ? null : chk(!!pg.block, (v) => toggleBlock(app, pg, v), 'Dit blad is een bouwblok')),
    pg.block ? blockSection(app, pg) : null,
    // single-line sheets and process sheets have no supply rails to manage
    pg.gen || (isProcessPage(pg) && !pg.rails.length) ? null : section('Voedingslijnen',
      ...pg.rails.map((r) => h('div', { class: 'railrow' },
        inp(r.color, (v) => set(() => { r.color = v; }), { type: 'color', key: 'rc' + r.id }),
        inp(r.name, (v) => set(() => { r.name = v; if (RAIL_PRESETS[v]) r.color = RAIL_PRESETS[v]; }), { key: 'rn' + r.id }),
        inp(r.y, (v) => set(() => { r.y = v; }), { type: 'number', key: 'ry' + r.id }),
        h('button', { class: 'icon danger', title: 'Verwijderen', onclick: () => set(() => { pg.rails = pg.rails.filter((x) => x !== r); }) }, '✕'))),
      h('div', { class: 'chips' }, ['L', 'N', 'L1', 'L2', 'L3', 'PE', '+24V', '0V'].map((n) =>
        h('button', {
          onclick: () => set(() => {
            const ys = pg.rails.map((r) => r.y);
            let y = n === 'N' || n === '0V' || n === 'PE' ? frameOf(pg).area.y1 - 10 : 25;
            while (ys.includes(y)) y += n === 'N' || n === '0V' ? -5 : 5;
            pg.rails.push(newRail(n, y, pg));
          }),
        }, '+ ' + n))),
      h('p', { class: 'hint' }, 'Y in mm (raster 5). Een lijn selecteren en verslepen kan ook op het blad.'),
      chk(app.project.settings.colorWires !== false, (v) => set((p) => { p.settings.colorWires = v; }), 'Draden krijgen de kleur van hun voedingslijn')),
    section('Sneltoetsen', h('p', { class: 'hint keys' },
      'V selecteren · W draad · T tekst · B kader · R draaien · M spiegelen · Del verwijderen · Ctrl+C / X / V / D · rechtsklik = menu · Ctrl+Z / Y · F passend · spatie+slepen of middelste knop: pannen · Alt: zonder raster')),
  ];
}

function multiProps(app, editor, keys) {
  const wires = app.page.wires.filter((w) => app.sel.has('w:' + w.id));
  const colorSec = wires.length ? section(t('Kleur van {n} draad/draden', { n: wires.length }),
    wireColorPicker(wires.every((w) => w.color === wires[0].color) ? wires[0].color : '', (v) => app.mutate(() => {
      for (const w of wires) { if (v) w.color = v; else delete w.color; }
    }))) : null;
  return [colorSec, section(t('{n} elementen geselecteerd', { n: keys.length }),
    h('div', { class: 'btnrow' },
      h('button', { onclick: () => editor.rotate() }, '⟳ Draaien'),
      h('button', { onclick: () => editor.mirror() }, '⇋ Spiegelen'),
      h('button', { class: 'danger', onclick: () => editor.deleteSelection() }, 'Verwijderen')))];
}

/** Cylinder marks in the project (for limit switches and roller valves). */
function marksList(an) {
  const names = new Set();
  for (const i of an.comps.values()) if (i.def?.fluid?.kind === 'cylinder') for (const m of parseMarks({ ...i.def.props, ...i.comp.props }.marks)) names.add(m.name);
  return h('datalist', { id: 'marks' }, [...names].map((x) => h('option', { value: x })));
}

/** Fields declared by a symbol (fluid power valves, cylinders …). */
function symbolFields(app, an, def, c, setProp) {
  const val = (k) => c.props[k] ?? def.props?.[k] ?? '';
  const p = { ...(def.props || {}), ...c.props };
  const three = String(p.type).endsWith('/3');
  const out = [];
  for (const f of def.fields) {
    if (f.k === 'centre' && !three) continue;
    if (f.k === 'solL' && p.left !== 'solenoid') continue;
    if (f.k === 'solR' && p.right !== 'solenoid') continue;
    if (f.k === 'mark' && p.left !== 'roller' && p.right !== 'roller') continue;
    const key = 'f_' + f.k;
    const input = f.options
      ? sel(val(f.k), f.options.map(([v, l]) => [v, t(l)]), setProp(f.k), key)
      : inp(val(f.k), setProp(f.k), { type: f.type || 'text', key, list: f.list });
    out.push(field(f.label, input));
  }
  if (def.fields.some((f) => f.list === 'coils')) {
    const tags = new Set();
    for (const i of an.comps.values()) if (/^std\/(valve|coil)/.test(i.def?.id) && i.tag) tags.add(i.tag);
    out.push(h('datalist', { id: 'coils' }, [...tags].map((x) => h('option', { value: x }))));
  }
  if (def.fields.some((f) => f.list === 'marks')) out.push(marksList(an));
  if (def.fluid?.kind === 'valve') out.push(h('p', { class: 'hint' }, 'Simulatie: klik links of rechts op het ventiel om die kant te bedienen (hand, drukknop, hendel of spoel); Shift = vasthouden. Gestuurde ventielen schakelen op druk, rolventielen op een cilindermarkering.'));
  const ck = def.cool?.kind;
  if (ck === 'pump' || ck === 'comp') out.push(h('p', { class: 'hint' }, 'Simulatie: draait als de opgegeven spoel (contactor) bekrachtigd is; klik om met de hand te starten of te stoppen.'));
  if (['tempsw', 'flowsw', 'levelsw', 'hp', 'lp'].includes(ck)) out.push(h('p', { class: 'hint' }, 'Koppel een contact (maak of verbreek) op een elektrisch blad aan dit toestel (Koppelen aan toestel). Het contact volgt de schakelaar met een korte vertraging.'));
  if (ck === 'load') out.push(h('p', { class: 'hint' }, 'Simulatie: warmt het koelwater op zolang er debiet is (rood = geen debiet). Klik om de machine stil te zetten.'));
  if (ck === 'levelsw') out.push(h('p', { class: 'hint' }, 'Simulatie: klik om een te laag niveau na te bootsen.'));
  if (def.fluid?.kind === 'cylinder') out.push(h('p', { class: 'hint' }, 'Rolventielen en eindschakelaars met dezelfde naam als een markering worden bediend als de zuigerstang daar staat.'));
  return out;
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
  head.append(h('div', null, h('b', null, def?.name || 'Onbekend symbool'), h('small', null, `${(def?.folder || '').split('/').map((x) => t(x)).join(' / ')} · ${info.loc.page}.${info.loc.col}${info.loc.row}`)));
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
        [i2.comp.id, `${i2.comp.tag}  ${t(i2.def?.name || '')}${i2.comp.props?.desc ? ' – ' + i2.comp.props.desc : ''}  /${refText(i2.loc)}`])],
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
  if (def?.fields) s.push(...symbolFields(app, an, def, c, setProp));
  else if (def?.build) {
    s.push(field('Aantal kanalen', inp(c.props.channels, setProp('channels'), { type: 'number', key: 'channels' })));
    s.push(field('Startadres', inp(c.props.start, setProp('start'), { key: 'start' })));
  }
  if (/^std\/coil-(on|off)$/.test(def?.id)) s.push(field('Vertraging (s)', inp(c.props.t ?? 1, (v) => set(() => { c.props.t = v > 0 ? v : 1; }), { type: 'number', key: 't' }), 'Wordt gebruikt in de simulatie.'));
  if (/^std\/limit/.test(def?.id)) {
    s.push(field('Bediend door cilindermarkering (simulatie)', inp(c.props.mark, setProp('mark'), { key: 'mark', list: 'marks', placeholder: c.tag || 'bv. 1S2' }),
      'Leeg = de tag van de eindschakelaar. De markeringen staan bij de cilinder (bv. 1S1=0; 1S2=100).'));
    s.push(marksList(an));
  }
  if (needsTag(def)) {
    s.push(field('Fabrikant', inp(c.props.maker, setProp('maker'), { key: 'maker' })));
    s.push(field('Artikelnummer', inp(c.props.article, setProp('article'), { key: 'article' })));
  }
  out.push(section('Eigenschappen', ...s));
  if (def?.block) out.push(blockContent(app, info));

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

/** Parts inside a placed building block: their settings for this block only (e.g. other coil names). */
function blockContent(app, info) {
  const c = info.comp;
  const pi = app.project.pages.findIndex((pg) => blockId(pg) === info.def.id);
  const rows = (info.kids || []).filter((k) => needsTag(k.def)).map((k) => {
    const id = k.comp.id.slice(c.id.length + 1);
    const own = c.childProps?.[id] || {};
    const setChild = (key) => (v) => app.mutate(() => {
      const all = (c.childProps ||= {});
      const o = (all[id] ||= {});
      if (v === '' || v == null || Number.isNaN(v)) delete o[key]; else o[key] = v;
      if (!Object.keys(o).length) delete all[id];
      if (!Object.keys(all).length) delete c.childProps;
    });
    const fields = [{ k: 'desc', label: 'Functietekst' }, ...(k.def.fields || []).filter((f) => !f.options && f.k !== 'view')];
    return h('details', { class: 'blockpart' }, h('summary', null, h('b', null, k.tag || '—'), ' ', t(k.def.name || '')),
      fields.map((f) => field(f.label, inp(own[f.k] ?? '', setChild(f.k), { type: f.type || 'text', key: `bp_${id}_${f.k}`, placeholder: String(k.comp.props?.[f.k] ?? k.def.props?.[f.k] ?? ''), list: f.list }))));
  });
  return section('Inhoud van het bouwblok',
    h('p', { class: 'hint' }, 'De toestellen krijgen de tag van het blok vooraan. Leeg = zoals op het blad van het bouwblok; een waarde geldt alleen voor dit blok.'),
    ...rows,
    pi >= 0 ? h('div', { class: 'btnrow' }, h('button', { onclick: () => app.setPage(pi) }, 'Bouwblok bewerken')) : null);
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
