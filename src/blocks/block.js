// Building blocks (sub-schematics): a sheet marked as block (`page.block`) becomes a symbol that can be
// placed on other sheets. The block's content (components, wires, texts, frames) is stored relative to its
// origin; the analysis (src/schematic/analyze.js) expands every placed block into virtual components and
// wires, so the simulation, nets, tags and cross references work on the content as if it was drawn there.
// Ports (symbol `blk/port`) on the block sheet are the block's connection points.
import { geometry, svgTransform, worldBox, xf } from '../symbols/geom.js';
import { shapeSvg } from '../schematic/render.js';
import { onRail } from '../schematic/analyze.js';
import { clone, r2 } from '../util.js';

export const PORT = 'blk/port';
export const BLOCK_FOLDER = 'Bouwblokken';
export const PORT_FOLDER = 'Bouwblok';
export const blockId = (page) => 'blk/' + page.id;

/** Connection point of a building block (on the block sheet). */
export const PORT_DEF = {
  id: PORT, name: 'Aansluitpunt van het bouwblok', folder: PORT_FOLDER, role: 'graphic', pinText: false,
  graphics: [
    { t: 'path', d: 'M -1.5 -1.5 L 1.5 -1.5 L 1.5 1.5 L -1.5 1.5 Z', fill: 'white' }, { t: 'line', x1: -1.5, y1: -1.5, x2: 1.5, y2: 1.5, w: 0.2 },
    { t: 'text', x: 0, y: -3.2, text: '{name}', size: 2.2, anchor: 'middle' },
  ],
  pins: [{ id: '1', x: 0, y: 0, name: '' }],
  props: { name: '1' },
  fields: [{ k: 'name', label: 'Naam van de aansluiting (bv. P, A, L1, 13)' }],
};

const norm = (s) => String(s || '').trim().replace(/^-+/, '').toUpperCase();
const snapDown = (v) => Math.floor(v / 5) * 5;
const ceil5 = (v) => Math.ceil(v / 5) * 5;
const VIEW_FIELD = { k: 'view', label: 'Weergave', options: [['full', 'Volledige inhoud'], ['compact', 'Compact kader (alleen aansluitingen)']] };

/**
 * Symbol definition of a block sheet. `look(sym)` finds the definitions of the symbols used on it.
 * The result is serialisable (it can be stored in the user library and embedded in projects).
 */
export function makeBlockDef(page, look) {
  const cfg = page.block || {};
  const comps = page.comps || [], wires = page.wires || [];
  // content box (rails do not count: only where wires and pins meet them)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  const geoms = new Map();
  for (const c of comps) {
    const g = geometry(look(c.sym), c);
    geoms.set(c.id, g);
    const b = worldBox(c, g);
    add(b.x0, b.y0); add(b.x1, b.y1);
  }
  for (const w of wires) for (const [x, y] of w.points) add(x, y);
  for (const tx of page.texts || []) { const w = String(tx.text).length * tx.size * 0.55; add(tx.anchor === 'end' ? tx.x - w : tx.anchor === 'middle' ? tx.x - w / 2 : tx.x, tx.y - tx.size); add(tx.anchor === 'end' ? tx.x : tx.x + w, tx.y + tx.size); }
  for (const b of page.boxes || []) { add(b.x, b.y); add(b.x + b.w, b.y + b.h); }
  if (x0 === Infinity) { x0 = 20; y0 = 20; x1 = 60; y1 = 40; }
  const ox = snapDown(x0 - 3), oy = snapDown(y0 - 3);
  const F = { x0: r2(x0 - 3 - ox), y0: r2(y0 - 3 - oy), x1: r2(x1 + 3 - ox), y1: r2(y1 + 3 - oy) };
  const rel = (x, y) => [r2(x - ox), r2(y - oy)];

  const block = {
    comps: comps.map((c) => { const o = clone(c); [o.x, o.y] = rel(c.x, c.y); return o; }),
    wires: wires.map((w) => ({ ...clone(w), points: w.points.map(([x, y]) => rel(x, y)) })),
    texts: (page.texts || []).map((tx) => { const o = clone(tx); [o.x, o.y] = rel(tx.x, tx.y); return o; }),
    boxes: (page.boxes || []).map((b) => { const o = clone(b); [o.x, o.y] = rel(b.x, b.y); return o; }),
    rails: (page.rails || []).map((r) => ({ ...clone(r), y: r2(r.y - oy), x0: r2(r.x0 - ox), x1: r2(r.x1 - ox) })),
    taps: [], // points where the content meets a supply rail: [x, y, rail name]
    type: page.type || 'electric',
    symbols: {}, // definitions of non-builtin symbols used inside (for other projects)
  };
  const pts = [];
  for (const c of comps) for (const p of geoms.get(c.id).pins || []) pts.push(xf(c, p.x, p.y));
  for (const w of wires) if (w.points.length > 1) pts.push(w.points[0], w.points[w.points.length - 1]);
  const railsUsed = new Set();
  for (const [x, y] of pts) for (const r of page.rails || []) if (onRail(x, y, r)) {
    block.taps.push([...rel(x, y), r.name || r.id]);
    railsUsed.add(r);
  }
  for (const c of comps) {
    const d = look(c.sym);
    if (d && d.source !== 'builtin') { const copy = clone(d); delete copy.source; delete copy._file; block.symbols[c.sym] = copy; Object.assign(block.symbols, d.block?.symbols || {}); }
  }

  // ports, ordered top-left to bottom-right
  const ports = comps.filter((c) => c.sym === PORT).map((c) => {
    const [x, y] = rel(c.x, c.y);
    return { id: c.id, name: String(c.props?.name ?? ''), x, y };
  }).sort((a, b) => a.y - b.y || a.x - b.x);

  // full view: frame around the content, the rails it uses, the static content for previews
  const style = cfg.frame === 'solid' ? { w: 0.35 } : cfg.frame === 'none' ? null : { dashdot: true, w: 0.25 };
  const full = [];
  if (style) full.push({ t: 'path', d: `M ${F.x0} ${F.y0} L ${F.x1} ${F.y0} L ${F.x1} ${F.y1} L ${F.x0} ${F.y1} Z`, ...style });
  for (const r of railsUsed) {
    const y = r2(r.y - oy);
    full.push({ t: 'line', x1: F.x0, y1: y, x2: F.x1, y2: y, w: 0.5, color: r.color || '#444' }, { t: 'text', x: F.x0 + 1, y: y - 1.2, text: r.name || '', size: 2.2, anchor: 'start' });
  }
  if (cfg.title !== false) full.push({ t: 'text', x: F.x1, y: F.y0 - 1.8, text: page.title || '', size: 2.2, anchor: 'end' });
  let raw = '';
  for (const c of block.comps) {
    const d = look(c.sym);
    const g = geometry(d, c);
    raw += `<g transform="${svgTransform(c)}">${(g.graphics || []).filter((s) => s.t !== 'text').map((s) => shapeSvg(s)).join('')}</g>`;
  }
  for (const w of block.wires) raw += `<polyline points="${w.points.map((p) => p.join(',')).join(' ')}"/>`;
  for (const b of block.boxes) raw += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" stroke-dasharray="${b.style === 'solid' ? 'none' : '4 1 1 1'}"/>`;
  full.push({ t: 'raw', svg: raw });
  const fullView = { graphics: full, pins: ports.map((p) => ({ id: p.id, x: p.x, y: p.y, name: p.name })), tagAt: { x: F.x0, y: F.y0 - 4, anchor: 'start' } };

  // compact view: a box with the ports on the side they are nearest to in the full drawing
  const sides = { l: [], r: [], t: [], b: [] };
  for (const p of ports) {
    const d = [['l', p.x - F.x0], ['r', F.x1 - p.x], ['t', p.y - F.y0], ['b', F.y1 - p.y]].sort((a, b) => a[1] - b[1]);
    sides[d[0][0]].push(p);
  }
  sides.l.sort((a, b) => a.y - b.y); sides.r.sort((a, b) => a.y - b.y); sides.t.sort((a, b) => a.x - b.x); sides.b.sort((a, b) => a.x - b.x);
  const longest = (list) => Math.max(0, ...list.map((p) => p.name.length));
  const W = Math.max(30, (Math.max(sides.t.length, sides.b.length) + 1) * 5, ceil5((page.title || '').length * 1.5 + (longest(sides.l) + longest(sides.r)) * 1.3 + 8));
  const H = Math.max(15, (Math.max(sides.l.length, sides.r.length) + 1) * 5);
  const cg = [{ t: 'path', d: `M 0 0 L ${W} 0 L ${W} ${H} L 0 ${H} Z`, w: 0.35 }, { t: 'text', x: W / 2, y: H / 2, text: page.title || '', size: 2.4, anchor: 'middle' }];
  const cpins = [];
  const put = (p, x, y, sx, sy, lx, ly, anchor) => {
    cg.push({ t: 'line', x1: x, y1: y, x2: x + sx, y2: y + sy }, { t: 'text', x: lx, y: ly, text: p.name, size: 1.9, anchor });
    cpins.push({ id: p.id, x, y, name: p.name });
  };
  sides.l.forEach((p, k) => put(p, -5, 5 * (k + 1), 5, 0, 1.2, 5 * (k + 1), 'start'));
  sides.r.forEach((p, k) => put(p, W + 5, 5 * (k + 1), -5, 0, W - 1.2, 5 * (k + 1), 'end'));
  sides.t.forEach((p, k) => put(p, 5 * (k + 1), -5, 0, 5, 5 * (k + 1), 2.4, 'middle'));
  sides.b.forEach((p, k) => put(p, 5 * (k + 1), H + 5, 0, -5, 5 * (k + 1), H - 2.4, 'middle'));
  const compactView = { graphics: cg, pins: cpins, tagAt: { x: 0, y: sides.t.length ? -8 : -3.5, anchor: 'start' } };

  return {
    id: blockId(page), name: page.title || 'Bouwblok', folder: BLOCK_FOLDER, prefix: cfg.prefix || 'A', role: 'device', pinText: false,
    graphics: full, pins: fullView.pins, tagAt: fullView.tagAt,
    props: { view: cfg.view === 'compact' ? 'compact' : 'full' }, fields: [VIEW_FIELD],
    block, views: { full: fullView, compact: compactView },
  };
}

/**
 * Virtual content of a placed block `inst` (definition `def`): components and wires in sheet coordinates,
 * rail taps and the ports ([instance pin id, virtual port id]). Tags are prefixed with the block's tag;
 * properties naming a device of the block (e.g. the coil of a valve) follow that prefix.
 */
export function instantiate(inst, def) {
  const B = def.block;
  const tagOf = (t) => (!t ? '' : !inst.tag ? t : /^[-+=.]/.test(t) ? inst.tag + t : `${inst.tag}.${t}`);
  const local = new Map(B.comps.filter((c) => c.tag).map((c) => [norm(c.tag), tagOf(c.tag)]));
  const over = inst.childProps || {};
  const m = !!inst.mirror;
  const comps = B.comps.map((ch) => {
    const own = over[ch.id] || {};
    const props = { ...(ch.props || {}) };
    for (const [k, v] of Object.entries(props)) if (typeof v === 'string' && v) {
      if (local.has(norm(v))) props[k] = local.get(norm(v));
      else if (v.includes('{tag}')) props[k] = v.split('{tag}').join(inst.tag || '');
    }
    Object.assign(props, own);
    const [x, y] = xf(inst, ch.x, ch.y);
    const rot = ((((m ? -(ch.rot || 0) : ch.rot || 0) + (inst.rot || 0)) % 360) + 360) % 360;
    const v = { ...ch, id: `${inst.id}/${ch.id}`, x: r2(x), y: r2(y), rot, mirror: !!ch.mirror !== m, tag: tagOf(ch.tag), autoTag: false, props };
    const k = (ch.scale || 1) * (inst.scale || 1);
    if (k !== 1) v.scale = k; else delete v.scale;
    if (ch.link) v.link = `${inst.id}/${ch.link}`;
    return v;
  });
  const wires = B.wires.map((w) => ({ ...w, id: `${inst.id}/${w.id}`, points: w.points.map(([x, y]) => xf(inst, x, y).map(r2)) }));
  const taps = (B.taps || []).map(([x, y, name]) => [...xf(inst, x, y).map(r2), name]);
  const ports = B.comps.filter((c) => c.sym === PORT).map((c) => [c.id, `${inst.id}/${c.id}`]);
  return { comps, wires, taps, ports };
}

/** Definition lookup inside a block: the library, then the symbols the block carries along. */
export const blockLook = (look, def) => (sym) => look(sym) || def?.block?.symbols?.[sym] || null;
