// Symbol editor: draw your own symbols (lines, rectangles, circles, arcs, polylines, text, pins).
import { t } from '../i18n.js';
import { h, clone, r2, snap } from '../util.js';
import { shapeSvg, textSvg } from '../schematic/render.js';
import { USER_ROOT } from '../symbols/library.js';
import { field, modal, prompt, toast } from './dialogs.js';

const NS = 'http://www.w3.org/2000/svg';
const TOOLS = [
  ['select', '⬚', 'Selecteren / verplaatsen'], ['line', '╱', 'Lijn'], ['poly', '⌇', 'Polylijn (dubbelklik = einde)'],
  ['rect', '▭', 'Rechthoek'], ['circle', '◯', 'Cirkel'], ['arc', '◠', 'Boog (begin, punt op boog, einde)'],
  ['text', 'T', 'Tekst ({tag}, {desc} … mogelijk)'], ['pin', '⊙', 'Aansluiting (pin)'], ['tag', '🏷', 'Positie van de tag'],
];

function arcPath(s, m, e) {
  const [ax, ay] = s, [bx, by] = m, [cx, cy] = e;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-9) return `M ${ax} ${ay} L ${cx} ${cy}`;
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  const r = Math.hypot(ax - ux, ay - uy);
  const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
  const sweep = cross > 0 ? 1 : 0;
  const a0 = Math.atan2(ay - uy, ax - ux), a2 = Math.atan2(cy - uy, cx - ux);
  const TAU = Math.PI * 2;
  let span = sweep ? a2 - a0 : a0 - a2;
  span = ((span % TAU) + TAU) % TAU;
  return `M ${r2(ax)} ${r2(ay)} A ${r2(r)} ${r2(r)} 0 ${span > Math.PI ? 1 : 0} ${sweep} ${r2(cx)} ${r2(cy)}`;
}

function moveGraphic(g, dx, dy) {
  if (g.t === 'line') { g.x1 += dx; g.y1 += dy; g.x2 += dx; g.y2 += dy; }
  else if (g.t === 'rect' || g.t === 'text') { g.x += dx; g.y += dy; }
  else if (g.t === 'circle') { g.cx += dx; g.cy += dy; }
  else if (g.t === 'path') {
    // shift absolute coordinates of M/L/A commands
    g.d = g.d.replace(/([MLA])([^MLAZ]*)/gi, (all, cmd, args) => {
      const n = args.trim().split(/[\s,]+/).filter(Boolean).map(Number);
      if (cmd.toUpperCase() === 'A') {
        for (let i = 0; i + 6 < n.length + 0; i += 7) { n[i + 5] = r2(n[i + 5] + dx); n[i + 6] = r2(n[i + 6] + dy); }
      } else for (let i = 0; i + 1 < n.length; i += 2) { n[i] = r2(n[i] + dx); n[i + 1] = r2(n[i + 1] + dy); }
      return `${cmd} ${n.join(' ')} `;
    }).trim();
  }
  for (const k of ['x1', 'y1', 'x2', 'y2', 'x', 'y', 'cx', 'cy']) if (k in g) g[k] = r2(g[k]);
}

export async function openSymbolEditor(app, source) {
  const lib = app.lib;
  const def = clone(source) || {
    name: 'Nieuw symbool',
    folder: lib.dir && lib.dirState === 'linked' ? lib.dir.name : USER_ROOT,
    prefix: 'K', role: 'device', pinText: true,
    graphics: [], pins: [], tagAt: { x: -7, y: 10, anchor: 'end' },
  };
  if (source) { def.source = source.source; def._file = source._file; def.id = source.id; }
  def.graphics ||= [];
  def.pins ||= [];
  def.tagAt ||= { x: -7, y: 10, anchor: 'end' };

  let tool = 'select';
  let grid = 1;
  let style = { dash: false, fill: '' };
  let pending = []; // clicked points of the current shape
  let mouse = [0, 0];
  let selected = null; // 'g:i' | 'p:i'
  let drag = null;
  const view = { x: -40, y: -25, w: 80, h: 60 };
  const undo = [];
  const pushUndo = () => { undo.push(JSON.stringify({ g: def.graphics, p: def.pins, t: def.tagAt })); if (undo.length > 100) undo.shift(); };

  const svg = document.createElementNS(NS, 'svg');
  svg.classList.add('symcanvas');
  const toolbar = h('div', { class: 'se-tools' });
  const propsEl = h('div', { class: 'se-props' });
  const elemEl = h('div', { class: 'se-elem' });

  const renderTools = () => toolbar.replaceChildren(
    ...TOOLS.map(([k, icon, title]) => h('button', { class: tool === k ? 'active' : '', title, onclick: () => { tool = k; pending = []; renderTools(); draw(); } }, icon)),
    h('hr'),
    h('label', { class: 'check small', title: 'Nieuwe lijnen gestreept' }, h('input', { type: 'checkbox', checked: style.dash, onchange: (e) => { style.dash = e.target.checked; } }), '- -'),
    h('select', { title: 'Vulling voor nieuwe vormen', onchange: (e) => { style.fill = e.target.value; } },
      [['', 'leeg'], ['ink', 'zwart'], ['white', 'wit']].map(([v, l]) => h('option', { value: v, selected: style.fill === v }, l))),
    h('select', { title: 'Raster (mm)', onchange: (e) => { grid = +e.target.value; draw(); } },
      [0.5, 1, 2.5, 5].map((g) => h('option', { value: g, selected: grid === g }, `${g} mm`))),
    h('button', { title: 'Ongedaan maken (Ctrl+Z)', onclick: doUndo }, '↶'));

  function doUndo() {
    const s = undo.pop();
    if (!s) return;
    const o = JSON.parse(s);
    def.graphics = o.g; def.pins = o.p; def.tagAt = o.t;
    selected = null;
    draw(); renderElem();
  }

  const applyView = () => {
    const r = svg.getBoundingClientRect();
    const aspect = r.width && r.height ? r.height / r.width : 0.75;
    view.h = view.w * aspect;
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
  };

  const toWorld = (e) => {
    const r = svg.getBoundingClientRect();
    return [view.x + ((e.clientX - r.left) / r.width) * view.w, view.y + ((e.clientY - r.top) / r.height) * view.h];
  };
  const snapP = (p, e) => (e?.altKey ? p.map(r2) : [r2(snap(p[0], grid)), r2(snap(p[1], grid))]);

  function draw() {
    applyView();
    let s = '';
    // grid
    const x0 = Math.floor(view.x / 5) * 5, y0 = Math.floor(view.y / 5) * 5;
    for (let x = x0; x <= view.x + view.w; x += 1) s += `<line x1="${x}" y1="${view.y}" x2="${x}" y2="${view.y + view.h}" class="${x % 5 === 0 ? 'g5' : 'g1'}"/>`;
    for (let y = y0; y <= view.y + view.h; y += 1) s += `<line x1="${view.x}" y1="${y}" x2="${view.x + view.w}" y2="${y}" class="${y % 5 === 0 ? 'g5' : 'g1'}"/>`;
    s += `<line x1="-3" y1="0" x2="3" y2="0" class="origin"/><line x1="0" y1="-3" x2="0" y2="3" class="origin"/>`;
    s += '<g class="ink">';
    def.graphics.forEach((g, i) => {
      const sel = selected === 'g:' + i;
      const body = g.t === 'text' ? textSvg(g.x, g.y, g.text, g.size, g.anchor) : shapeSvg(g);
      s += `<g data-i="g:${i}" class="${sel ? 'sel' : ''}">${body}`;
      if (g.t !== 'text') s += shapeSvg({ ...g, fill: '', dash: false }, ' class="hit"');
      else s += `<rect class="hit" x="${g.x - (g.anchor === 'middle' ? g.text.length * g.size * 0.28 : g.anchor === 'end' ? g.text.length * g.size * 0.55 : 0)}" y="${g.y - g.size / 2}" width="${g.text.length * g.size * 0.55 + 0.5}" height="${g.size}"/>`;
      s += '</g>';
    });
    s += '</g>';
    def.pins.forEach((p, i) => {
      s += `<g data-i="p:${i}" class="pinmark${selected === 'p:' + i ? ' sel' : ''}"><circle cx="${p.x}" cy="${p.y}" r="0.8"/>${textSvg(p.x + 1.2, p.y - 1.2, p.name || p.id, 1.8, 'start', 'pinlbl')}<circle class="hit" cx="${p.x}" cy="${p.y}" r="1.5"/></g>`;
    });
    s += `<g data-i="tag" class="tagmark">${textSvg(def.tagAt.x, def.tagAt.y, '-K1', 2.5, def.tagAt.anchor || 'end', 'taglbl')}</g>`;
    // preview
    const m = mouse;
    if (pending.length) {
      const a = pending[0];
      if (tool === 'line') s += `<line class="pv" x1="${a[0]}" y1="${a[1]}" x2="${m[0]}" y2="${m[1]}"/>`;
      if (tool === 'rect') s += `<rect class="pv" x="${Math.min(a[0], m[0])}" y="${Math.min(a[1], m[1])}" width="${Math.abs(m[0] - a[0])}" height="${Math.abs(m[1] - a[1])}"/>`;
      if (tool === 'circle') s += `<circle class="pv" cx="${a[0]}" cy="${a[1]}" r="${Math.hypot(m[0] - a[0], m[1] - a[1])}"/>`;
      if (tool === 'poly') s += `<polyline class="pv" points="${[...pending, m].map((p) => p.join(',')).join(' ')}"/>`;
      if (tool === 'arc') s += pending.length === 1 ? `<line class="pv" x1="${a[0]}" y1="${a[1]}" x2="${m[0]}" y2="${m[1]}"/>` : `<path class="pv" d="${arcPath(pending[0], pending[1], m)}"/>`;
    }
    s += `<circle class="cursor" cx="${m[0]}" cy="${m[1]}" r="0.35"/>`;
    svg.innerHTML = s;
    coords.textContent = `x ${m[0]}  y ${m[1]}`;
  }

  const add = (g) => {
    pushUndo();
    if (style.dash) g.dash = true;
    if (style.fill && g.t !== 'line') g.fill = style.fill;
    def.graphics.push(g);
    selected = 'g:' + (def.graphics.length - 1);
    renderElem();
  };

  async function click(p, e) {
    switch (tool) {
      case 'line':
        if (!pending.length) pending = [p];
        else { add({ t: 'line', x1: pending[0][0], y1: pending[0][1], x2: p[0], y2: p[1] }); pending = e.shiftKey ? [p] : []; }
        break;
      case 'rect':
        if (!pending.length) pending = [p];
        else {
          const [a] = pending;
          if (a[0] !== p[0] && a[1] !== p[1]) add({ t: 'rect', x: Math.min(a[0], p[0]), y: Math.min(a[1], p[1]), w: r2(Math.abs(p[0] - a[0])), h: r2(Math.abs(p[1] - a[1])) });
          pending = [];
        }
        break;
      case 'circle':
        if (!pending.length) pending = [p];
        else { const r = r2(Math.hypot(p[0] - pending[0][0], p[1] - pending[0][1])); if (r > 0) add({ t: 'circle', cx: pending[0][0], cy: pending[0][1], r }); pending = []; }
        break;
      case 'arc':
        pending.push(p);
        if (pending.length === 3) { add({ t: 'path', d: arcPath(...pending) }); pending = []; }
        break;
      case 'poly':
        pending.push(p);
        break;
      case 'text': {
        const t = await prompt('Tekst', '', { label: 'Gebruik {tag}, {desc}, {addr} … voor eigenschappen' });
        if (t) add({ t: 'text', x: p[0], y: p[1], text: t, size: 2.5, anchor: 'start' });
        break;
      }
      case 'pin': {
        let k = def.pins.length + 1;
        while (def.pins.some((x) => x.id === String(k))) k++;
        const name = await prompt('Naam van de aansluiting', String(k), { label: 'bv. A1, 13, L, + …' });
        if (name === null) break;
        pushUndo();
        def.pins.push({ id: String(k), x: p[0], y: p[1], name });
        selected = 'p:' + (def.pins.length - 1);
        renderElem();
        break;
      }
      case 'tag':
        pushUndo();
        def.tagAt = { ...def.tagAt, x: p[0], y: p[1] };
        break;
    }
    draw();
  }

  function finishPoly() {
    if (tool === 'poly' && pending.length >= 2) add({ t: 'path', d: 'M ' + pending.map((q) => q.join(' ')).join(' L ') });
    pending = [];
    draw();
  }

  svg.addEventListener('pointerdown', (e) => {
    const p = snapP(toWorld(e), e);
    if (e.button === 1) { drag = { pan: true, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; svg.setPointerCapture(e.pointerId); return; }
    if (e.button === 2) { if (tool === 'poly') finishPoly(); else { pending = []; draw(); } return; }
    if (tool !== 'select') return click(p, e);
    const hit = e.target.closest('[data-i]')?.dataset.i || null;
    selected = hit === 'tag' ? null : hit;
    if (hit) {
      drag = { hit, start: p, last: p, moved: false };
      svg.setPointerCapture(e.pointerId);
    }
    renderElem();
    draw();
  });
  svg.addEventListener('pointermove', (e) => {
    if (drag?.pan) {
      const r = svg.getBoundingClientRect();
      view.x = drag.vx - ((e.clientX - drag.sx) / r.width) * view.w;
      view.y = drag.vy - ((e.clientY - drag.sy) / r.height) * view.h;
      draw();
      return;
    }
    mouse = snapP(toWorld(e), e);
    if (drag) {
      const dx = r2(mouse[0] - drag.last[0]), dy = r2(mouse[1] - drag.last[1]);
      if (dx || dy) {
        if (!drag.moved) { pushUndo(); drag.moved = true; }
        drag.last = mouse;
        const [t, i] = drag.hit.split(':');
        if (t === 'g') moveGraphic(def.graphics[+i], dx, dy);
        else if (t === 'p') { def.pins[+i].x = r2(def.pins[+i].x + dx); def.pins[+i].y = r2(def.pins[+i].y + dy); }
        else if (drag.hit === 'tag') { def.tagAt.x = r2(def.tagAt.x + dx); def.tagAt.y = r2(def.tagAt.y + dy); }
      }
    }
    draw();
  });
  svg.addEventListener('pointerup', () => { if (drag?.moved) renderElem(); drag = null; });
  svg.addEventListener('dblclick', () => finishPoly());
  svg.addEventListener('contextmenu', (e) => e.preventDefault());
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [wx, wy] = toWorld(e);
    const f = Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.002));
    const nw = Math.min(300, Math.max(10, view.w * f));
    const k = nw / view.w;
    view.x = wx - (wx - view.x) * k;
    view.y = wy - (wy - view.y) * k;
    view.w = nw;
    draw();
  }, { passive: false });

  const onKey = (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
      e.preventDefault();
      pushUndo();
      const [t, i] = selected.split(':');
      if (t === 'g') def.graphics.splice(+i, 1); else def.pins.splice(+i, 1);
      selected = null;
      renderElem(); draw();
    }
    if (e.key === 'Enter') finishPoly();
  };
  document.addEventListener('keydown', onKey);

  // ---------- property panels ----------
  const num = (obj, k, label) => {
    const el = h('input', { type: 'number', step: 'any', value: obj[k] });
    el.addEventListener('change', () => { pushUndo(); obj[k] = r2(parseFloat(String(el.value).replace(',', '.')) || 0); draw(); });
    return field(label, el);
  };
  const txt = (obj, k, label) => {
    const el = h('input', { type: 'text', value: obj[k] ?? '' });
    el.addEventListener('change', () => { pushUndo(); obj[k] = el.value; draw(); });
    return field(label, el);
  };

  function renderElem() {
    if (!selected) {
      elemEl.replaceChildren(h('p', { class: 'hint' },
        'Teken het symbool rond het oorsprongskruis (= invoegpunt). Leg pinnen op een raster van 5 mm zodat draden aansluiten. ' +
        'Selecteer een element om het te bewerken; Delete verwijdert. Middelste muisknop = pannen, scrollwiel = zoomen.'));
      return;
    }
    const [t, i] = selected.split(':');
    if (t === 'p') {
      const p = def.pins[+i];
      elemEl.replaceChildren(h('h3', null, 'Aansluiting'), txt(p, 'name', 'Naam'), txt(p, 'id', 'Intern id (uniek)'), h('div', { class: 'grid2' }, num(p, 'x', 'X'), num(p, 'y', 'Y')));
      return;
    }
    const g = def.graphics[+i];
    if (!g) { selected = null; renderElem(); return; }
    const rows = [h('h3', null, { line: 'Lijn', rect: 'Rechthoek', circle: 'Cirkel', path: 'Pad / boog', text: 'Tekst' }[g.t])];
    if (g.t === 'line') rows.push(h('div', { class: 'grid2' }, num(g, 'x1', 'X1'), num(g, 'y1', 'Y1'), num(g, 'x2', 'X2'), num(g, 'y2', 'Y2')));
    if (g.t === 'rect') rows.push(h('div', { class: 'grid2' }, num(g, 'x', 'X'), num(g, 'y', 'Y'), num(g, 'w', 'Breedte'), num(g, 'h', 'Hoogte')));
    if (g.t === 'circle') rows.push(h('div', { class: 'grid2' }, num(g, 'cx', 'X'), num(g, 'cy', 'Y'), num(g, 'r', 'Straal')));
    if (g.t === 'path') rows.push(txt(g, 'd', 'SVG-pad'));
    if (g.t === 'text') {
      rows.push(txt(g, 'text', 'Tekst'), h('div', { class: 'grid2' }, num(g, 'x', 'X'), num(g, 'y', 'Y'), num(g, 'size', 'Grootte')));
      const a = h('select', null, [['start', 'Links'], ['middle', 'Midden'], ['end', 'Rechts']].map(([v, l]) => h('option', { value: v, selected: g.anchor === v }, l)));
      a.addEventListener('change', () => { pushUndo(); g.anchor = a.value; draw(); });
      rows.push(field('Uitlijning', a));
    } else {
      const d = h('input', { type: 'checkbox', checked: !!g.dash });
      d.addEventListener('change', () => { pushUndo(); g.dash = d.checked; draw(); });
      rows.push(h('label', { class: 'check' }, d, 'Gestreept'));
      if (g.t !== 'line') {
        const f = h('select', null, [['', 'Geen vulling'], ['ink', 'Zwart'], ['white', 'Wit']].map(([v, l]) => h('option', { value: v, selected: (g.fill || '') === v }, l)));
        f.addEventListener('change', () => { pushUndo(); g.fill = f.value || undefined; draw(); });
        rows.push(field('Vulling', f));
      }
    }
    elemEl.replaceChildren(...rows);
  }

  // symbol properties
  const folders = new Set(lib.all().filter((d) => d.source !== 'builtin').map((d) => d.folder).filter(Boolean));
  folders.add(USER_ROOT);
  if (lib.dir && lib.dirState === 'linked') folders.add(lib.dir.name);
  const f = {
    name: h('input', { value: def.name }),
    folder: h('input', { value: def.folder, list: 'se-folders' }),
    prefix: h('input', { value: def.prefix || '', maxlength: 4 }),
    role: h('select', null, [['device', 'Toestel'], ['main', 'Hoofdtoestel (spoel, kaart …)'], ['contact', 'Hulpcontact / deel van toestel'], ['terminal', 'Klem'], ['link', 'Onderbrekingspunt'], ['graphic', 'Grafisch (geen tag)']]
      .map(([v, l]) => h('option', { value: v, selected: def.role === v }, l))),
    contact: h('select', null, [['', '—'], ['NO', 'Maakcontact (NO)'], ['NC', 'Verbreekcontact (NC)'], ['CO', 'Wisselcontact (CO)']]
      .map(([v, l]) => h('option', { value: v, selected: (def.contact || '') === v }, l))),
    pinText: h('input', { type: 'checkbox', checked: def.pinText !== false }),
    mirror: h('input', { type: 'checkbox', checked: !!def.mirror }),
  };
  propsEl.replaceChildren(
    h('h3', null, 'Symbool'),
    field('Naam', f.name),
    field('Map', f.folder, 'Gebruik / voor submappen, bv. "Mijn symbolen/Kleppen"'),
    h('datalist', { id: 'se-folders' }, [...folders].map((x) => h('option', { value: x }))),
    field('Letter (IEC 81346)', f.prefix),
    field('Rol', f.role),
    field('Contacttype', f.contact),
    h('label', { class: 'check' }, f.pinText, 'Pinnamen tonen'),
    h('label', { class: 'check' }, f.mirror, 'Contactspiegel tonen (hoofdtoestel)'));

  const coords = h('span', { class: 'coords' });
  const body = h('div', { class: 'symeditor' },
    toolbar,
    h('div', { class: 'se-canvas' }, svg, coords),
    h('div', { class: 'se-side' }, propsEl, elemEl));

  renderTools();
  renderElem();
  const ro = new ResizeObserver(() => draw());
  ro.observe(svg);

  const result = await modal({
    title: source?.id ? t('Symbool bewerken – {name}', { name: t(source.name) }) : 'Nieuw symbool',
    body, full: true,
    buttons: [{ label: 'Annuleren', value: false }, { label: 'Opslaan', value: true, primary: true }],
    onButton: async (v) => {
      if (!v) return true;
      if (!f.name.value.trim()) { toast('Geef het symbool een naam.'); return false; }
      if (!def.graphics.length) { toast('Het symbool is nog leeg.'); return false; }
      Object.assign(def, {
        name: f.name.value.trim(), folder: f.folder.value.trim() || USER_ROOT, prefix: f.prefix.value.trim(),
        role: f.role.value, contact: f.contact.value || undefined, pinText: f.pinText.checked, mirror: f.mirror.checked,
      });
      if (def.role === 'terminal') { def.props = { strip: '-X1', ...(def.props || {}) }; if (!def.graphics.some((g) => g.text === '{number}')) toast('Tip: voeg een tekst {number} toe voor het klemnummer.'); }
      if (def.role === 'link') def.props = { name: 'A', ...(def.props || {}) };
      try {
        await lib.save(def);
        toast('Symbool opgeslagen');
      } catch (e) {
        toast(t('Opslaan mislukt: {msg}', { msg: e.message }));
        return false;
      }
      return true;
    },
    onClose: () => { document.removeEventListener('keydown', onKey); ro.disconnect(); },
  });
  return result;
}
