// SVG markup for symbols and complete schematic pages (screen and print).
import { t } from '../i18n.js';
import { esc, r2 } from '../util.js';
import { FRAME, SHEET, pageGrid, wireColor } from '../model.js';
import { bbox, geometry, placeAnchor, svgTransform, worldBox, xf } from '../symbols/geom.js';
import { refText } from './analyze.js';

// ---------- symbol shapes ----------

const fillAttr = (g) => (g.fill === 'ink' ? ' class="fi"' : g.fill === 'white' ? ' class="fw"' : '');
const dashAttr = (g) => (g.dash ? ' stroke-dasharray="1.6 1"' : '');
const widthAttr = (g) => (g.w ? ` stroke-width="${g.w}"` : '');
const colorAttr = (g) => {
  const st = (g.color ? `stroke:${g.color};` : '') + (g.fillColor ? `fill:${g.fillColor};` : '') + (g.noStroke ? 'stroke:none;' : '');
  return st ? ` style="${esc(st)}"` : '';
};

export function shapeSvg(g, extra = '') {
  const a = fillAttr(g) + dashAttr(g) + widthAttr(g) + colorAttr(g) + extra;
  switch (g.t) {
    case 'line': return `<line x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}"${a}/>`;
    case 'rect': return `<rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}"${a}/>`;
    case 'circle': return `<circle cx="${g.cx}" cy="${g.cy}" r="${Math.abs(g.r)}"${a}/>`;
    case 'path': return `<path d="${esc(g.d)}"${a}/>`;
    default: return '';
  }
}

export const textSvg = (x, y, text, size, anchor = 'start', cls = 'tx', extra = '') =>
  `<text x="${r2(x)}" y="${r2(y)}" font-size="${size}" text-anchor="${anchor}" class="${cls}"${extra}>${esc(text)}</text>`;

/**
 * Text attached to a component in local symbol coordinates (imported drawings):
 * {x, y, text, size, rot, keep (rotation independent of the component), base: 'hanging' | 'alphabetic', anchor}.
 */
export function freeTextSvg(c, t, text = t.text, cls = 'tx') {
  const k = c.scale || 1;
  const [x, y] = xf(c, t.x, t.y);
  const rot = ((t.keep ? 0 : c.rot || 0) + (t.rot || 0)) % 360;
  const style = t.base ? ` style="dominant-baseline:${t.base}"` : '';
  const tr = rot ? ` transform="rotate(${rot} ${r2(x)} ${r2(y)})"` : '';
  return String(text ?? '').split('\n').map((line, i) =>
    textSvg(x, y + i * t.size * k * 1.2, line, r2(t.size * k), t.anchor || 'start', cls, style + tr)).join('');
}

const fillTemplate = (s, vals) => String(s).replace(/\{(\w+)\}/g, (_, k) => vals[k] ?? '');

/** Standalone preview of a symbol definition (library list, symbol editor). */
export function symbolPreviewSvg(def, size = 40) {
  const geom = geometry(def, { props: def.props || {} });
  const b = bbox(geom);
  const pad = 2;
  const w = Math.max(b.x1 - b.x0, 4) + pad * 2;
  const hh = Math.max(b.y1 - b.y0, 4) + pad * 2;
  const vals = { ...(def.props || {}), number: '1', name: def.props?.name ?? '', addr: def.props?.addr ?? '' };
  let body = '';
  for (const g of geom.graphics || []) {
    body += g.t === 'text' ? textSvg(g.x, g.y, fillTemplate(g.text, vals), g.size, g.anchor) : shapeSvg(g);
  }
  return `<svg class="symsvg" viewBox="${b.x0 - pad} ${b.y0 - pad} ${w} ${hh}" width="${size}" height="${size}"><g class="ink">${body}</g></svg>`;
}

// ---------- components ----------

function compSvg(info, an, opts) {
  const { comp: c, def } = info;
  let { geom } = info;
  const sel = opts.selection?.has('c:' + c.id);
  // simulation: state shown through extra properties (valve position, piston …) and a class
  const st = opts.sim?.compState(c.id);
  if (st?.props) geom = geometry(def, { ...c, props: { ...c.props, ...st.props } });
  const vals = {
    ...(def?.props || {}), ...(c.props || {}), ...(st?.props || {}),
    tag: info.tag, desc: c.props?.desc ?? '', strip: c.props?.strip ?? '', number: c.props?.number ?? '',
    name: c.props?.name ?? '', addr: c.props?.addr ?? '',
  };
  let out = `<g class="comp${sel ? ' sel' : ''}${st?.cls ? ' ' + st.cls : ''}" data-k="c:${c.id}">`;
  let shapes = '';
  for (const g of geom.graphics || []) if (g.t !== 'text') shapes += shapeSvg(g);
  out += `<g transform="${svgTransform(c)}">${shapes}</g>`;
  for (const g of geom.graphics || []) {
    if (g.t !== 'text') continue;
    if (def?.qet) { out += freeTextSvg(c, g, fillTemplate(g.text, vals)); continue; }
    const [x, y] = xf(c, g.x, g.y);
    out += textSvg(x, y, fillTemplate(g.text, vals), g.size, placeAnchor(c, g.anchor));
  }
  for (const t of c.texts || []) out += freeTextSvg(c, t);
  // pin names
  if (def?.pinText) {
    const b = bbox(geom);
    const cy = (b.y0 + b.y1) / 2;
    for (const p of geom.pins) {
      const name = c.pinNames?.[p.id] ?? p.name;
      if (!name) continue;
      const top = p.y <= cy;
      const [x, y] = xf(c, p.x + 1.2, p.y + (top ? 2.4 : -2.4));
      out += textSvg(x, y, name, 1.8, placeAnchor(c, 'start'), 'tx pin');
    }
  }
  // tag, description, cross reference
  const role = def?.role;
  const lines = [];
  if (role === 'terminal') {
    // strip name only on the first terminal of a row of adjacent terminals
    const prev = info.page.comps.some((o) => o !== c && an.comps.get(o.id)?.def?.role === 'terminal' && (o.rot || 0) === (c.rot || 0)
      && (o.props?.strip || '') === (c.props?.strip || '') && Math.abs(o.y - c.y) < 0.01 && o.x < c.x && c.x - o.x <= 20);
    if (info.tag && !prev) lines.push([info.tag, 2.2, 'tx tag']);
  }
  else if (role !== 'link' && role !== 'graphic') {
    if (info.tag) lines.push([info.tag, 2.5, 'tx tag' + (an.duplicates.has(info.tag) && !info.master ? ' dup' : '')]);
    if (info.master) lines.push(['/' + refText(info.master.loc), 2, 'tx xref']);
    if (c.props?.desc && !c.qet && !String(JSON.stringify(geom.graphics)).includes('{desc}')) lines.push([c.props.desc, 2, 'tx desc']);
  }
  if (lines.length && c.tagAt) {
    // imported drawings keep their own label position
    lines.forEach(([t, , cls], i) => {
      const ta = { ...c.tagAt, y: c.tagAt.y + i * c.tagAt.size * 1.2, size: i ? c.tagAt.size * 0.8 : c.tagAt.size };
      out += freeTextSvg(c, ta, t, cls);
    });
  } else if (lines.length) {
    const ta = geom.tagAt || def?.tagAt || { x: -7, y: 10, anchor: 'end' };
    const [x, y] = xf(c, ta.x, ta.y);
    const anchor = placeAnchor(c, ta.anchor);
    const rot = (((c.rot || 0) % 360) + 360) % 360;
    const total = lines.length * 2.8;
    let yy = rot === 90 || rot === 270 ? y - 4 - total : y - total / 2 + 1.4;
    for (const [t, s, cls] of lines) {
      out += textSvg(x, yy, t, s, anchor, cls);
      yy += 2.8;
    }
  }
  if (role === 'link' && info.refs?.length && def.showRefs !== false) {
    const [x, y] = xf(c, 0, 13);
    out += textSvg(x, y, info.refs.map((l) => '/' + refText(l)).join(' '), 2, 'middle', 'tx xref');
  }
  // contact mirror below main devices
  if (def?.mirror && info.linked.length) {
    const wb = worldBox(c, geom);
    let yy = wb.y1 + 3.5;
    const x = (wb.x0 + wb.x1) / 2;
    const sorted = [...info.linked].sort((a, b) => a.loc.page - b.loc.page || a.loc.col - b.loc.col);
    for (const l of sorted) {
      const kind = l.def?.contact || l.def?.plc || '';
      const names = l.pins.map((p) => p.name).filter(Boolean);
      const pins = names.length > 3
        ? names.reduce((acc, n, i) => acc + (i % 2 ? '-' : i ? ' ' : '') + n, '')
        : names.join('-');
      out += textSvg(x, yy, `${kind} ${pins}  /${refText(l.loc)}`, 1.8, 'middle', 'tx mirror');
      yy += 2.6;
    }
  }
  if (!opts.print) {
    if (!opts.page?.gen) for (const p of info.pins) if (an.openPins.has(`${c.id}:${p.id}`)) out += `<circle cx="${p.x}" cy="${p.y}" r="0.6" class="openpin"/>`;
    const wb = worldBox(c, geom);
    out += `<rect class="hit" x="${wb.x0 - 1}" y="${wb.y0 - 1}" width="${wb.x1 - wb.x0 + 2}" height="${wb.y1 - wb.y0 + 2}"/>`;
  }
  return out + '</g>';
}

// ---------- wires ----------

function wireLabelPos(points) {
  let best = null;
  let bestLen = -1;
  for (let i = 0; i + 1 < points.length; i++) {
    const [ax, ay] = points[i], [bx, by] = points[i + 1];
    const len = Math.hypot(bx - ax, by - ay);
    if (len > bestLen) { bestLen = len; best = { ax, ay, bx, by, vertical: Math.abs(ax - bx) < 0.01 }; }
  }
  if (!best || bestLen < 6) return null;
  return { x: (best.ax + best.bx) / 2, y: (best.ay + best.by) / 2, vertical: best.vertical };
}

function wireSvg(w, an, opts) {
  const sel = opts.selection?.has('w:' + w.id);
  const pts = w.points.map((p) => p.join(',')).join(' ');
  const net = an.wireNet.get(w.id);
  const own = wireColor(w.color);
  const sim = opts.sim?.wireState(w.id);
  // simulation colours: pressure side red, return side blue, live control wires green
  // cooling lines keep their normal look: the temperature colour goes to the flow dots and the label
  const SIMC = sim && typeof sim === 'object' ? null : { p: ['#ef4444', '#f87171'], v: ['#2563eb', '#60a5fa'], e: ['#22c55e', '#4ade80'] }[sim];
  const color = SIMC ? SIMC[0] : own || (opts.project.settings.colorWires !== false ? net?.railColor : null);
  const st = (color ? `stroke:${color};` : '') + (SIMC ? 'stroke-width:0.55;' : w.w ? `stroke-width:${w.w};` : '');
  // simulation: active lines glow green (a wide, pulsing halo under the line)
  let out = `<g class="wire${sel ? ' sel' : ''}" data-k="w:${w.id}">${SIMC ? `<polyline class="simglow" points="${pts}" style="stroke:${SIMC[1]}"/>` : ''}<polyline class="wl" points="${pts}"${st ? ` style="${esc(st)}"` : ''}/>`;
  if (String(w.color).toUpperCase() === 'GNYE') out += `<polyline class="wl gnye" points="${pts}" style="stroke:#e0c000" stroke-dasharray="2 2"/>`;
  if (sim?.dots) {
    // flow dots (simulation): per piece of wire a dotted line in the flow direction, shifted with the
    // distance travelled (pieces split at junctions, so branches have their own speed)
    for (const d of sim.dots.list) {
      const dp = d.pts.map((p) => p.join(',')).join(' ');
      const da = `stroke-dasharray:0 ${sim.dots.gap};stroke-dashoffset:${r2(d.off)}`;
      out += `<polyline class="simdots edge" points="${dp}" style="${da}"/><polyline class="simdots" points="${dp}" style="stroke:${sim.c};${da}"/>`;
    }
  }
  if (sim?.label) {
    const pos = wireLabelPos(w.points);
    if (pos) {
      const st2 = ` style="fill:${sim.c}"`;
      out += pos.vertical
        ? textSvg(pos.x - 1.2, pos.y, sim.label, 2.2, 'middle', 'tx simtemp', ` transform="rotate(-90 ${r2(pos.x - 1.2)} ${r2(pos.y)})"${st2}`)
        : textSvg(pos.x, pos.y - 1.5, sim.label, 2.2, 'middle', 'tx simtemp', st2);
    }
  }
  const label = net?.label;
  if (label && opts.project.settings.showWireNumbers !== false && !opts.page?.gen) {
    const pos = wireLabelPos(w.points);
    if (pos) {
      out += pos.vertical
        ? textSvg(pos.x - 1, pos.y, label, 2, 'middle', 'tx wno', ` transform="rotate(-90 ${r2(pos.x - 1)} ${r2(pos.y)})"`)
        : textSvg(pos.x, pos.y - 1.3, label, 2, 'middle', 'tx wno');
    }
  }
  if (!opts.print) {
    out += `<polyline class="hit" points="${pts}"/>`;
    if (sel && opts.selection.size === 1) w.points.forEach(([x, y], i) => {
      out += `<rect class="handle" data-k="wv:${w.id}:${i}" x="${x - 0.9}" y="${y - 0.9}" width="1.8" height="1.8"/>`;
    });
  }
  return out + '</g>';
}

// ---------- frame and title block ----------

export function frameSvg(project, page, pageIdx, total = project.pages.length) {
  const { x0, y0, x1, y1, band, tbY, area } = FRAME;
  const { cols, rows, cw, rh } = pageGrid(project, page);
  let s = `<g class="frame">`;
  s += `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" class="fr-outer"/>`;
  s += `<line x1="${x0}" y1="${y0 + band}" x2="${x1}" y2="${y0 + band}"/>`;
  s += `<line x1="${x0 + band}" y1="${y0}" x2="${x0 + band}" y2="${tbY}"/>`;
  for (let i = 0; i < cols; i++) {
    const x = area.x0 + i * cw;
    if (i) s += `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y0 + band}"/>`;
    s += textSvg(x + cw / 2, y0 + band / 2, String(i + 1), 2.8, 'middle', 'tx fr');
  }
  for (let i = 0; i < rows; i++) {
    const y = area.y0 + i * rh;
    if (i) s += `<line x1="${x0}" y1="${y}" x2="${x0 + band}" y2="${y}"/>`;
    s += textSvg(x0 + band / 2, y + rh / 2, String.fromCharCode(65 + i), 2.8, 'middle', 'tx fr');
  }
  if (area.x0 + cols * cw < x1 - 0.5) s += `<line x1="${area.x0 + cols * cw}" y1="${y0}" x2="${area.x0 + cols * cw}" y2="${y0 + band}"/>`;
  if (area.y0 + rows * rh < tbY - 0.5) s += `<line x1="${x0}" y1="${area.y0 + rows * rh}" x2="${x0 + band}" y2="${area.y0 + rows * rh}"/>`;
  s += `<line x1="${x0}" y1="${tbY}" x2="${x1}" y2="${tbY}" class="fr-outer"/>`;
  // title block cells
  const m = project.meta || {};
  const cells = [x0, 60, 140, 240, 300, 385, x1];
  for (const x of cells.slice(1, -1)) s += `<line x1="${x}" y1="${tbY}" x2="${x}" y2="${y1}"/>`;
  const ty = tbY;
  if (m.logo) s += `<image href="${esc(m.logo)}" x="${x0 + 2}" y="${ty + 2}" width="${60 - x0 - 4}" height="${y1 - ty - 4}" preserveAspectRatio="xMidYMid meet"/>`;
  s += textSvg(62, ty + 5, m.company || '', 3.5, 'start', 'tx tb-b');
  (m.address || '').split('\n').slice(0, 4).forEach((l, i) => (s += textSvg(62, ty + 11 + i * 4, l, 2.4, 'start', 'tx')));
  s += textSvg(142, ty + 3.2, t('Project'), 1.8, 'start', 'tx tb-l');
  s += textSvg(142, ty + 8, project.name || '', 3.5, 'start', 'tx tb-b');
  (m.description || '').split('\n').slice(0, 2).forEach((l, i) => (s += textSvg(142, ty + 14 + i * 4, l, 2.4, 'start', 'tx')));
  if (m.customer) s += textSvg(142, ty + 26.5, t('Klant: {name}', { name: m.customer }), 2.4, 'start', 'tx');
  const kv = [[t('Getekend'), m.drawer], [t('Datum'), m.date], [t('Revisie'), m.revision]];
  kv.forEach(([k, v], i) => {
    s += textSvg(242, ty + 5 + i * 9, k, 1.8, 'start', 'tx tb-l');
    s += textSvg(242, ty + 9 + i * 9, v || '', 2.6, 'start', 'tx');
  });
  s += textSvg(302, ty + 3.2, t('Paginatitel'), 1.8, 'start', 'tx tb-l');
  s += textSvg(302, ty + 12, page.title || '', 4, 'start', 'tx tb-b');
  s += textSvg(400, ty + 3.2, t('Blad'), 1.8, 'middle', 'tx tb-l');
  s += textSvg(400, ty + 13, String(pageIdx + 1), 6, 'middle', 'tx tb-b');
  s += textSvg(400, ty + 24, t("van {n}", { n: total }), 2.4, 'middle', 'tx');
  return s + '</g>';
}

// ---------- page ----------

export function pageSvg(project, page, pageIdx, an, opts = {}) {
  const o = { ...opts, project, page };
  let s = `<rect class="sheet" x="0" y="0" width="${SHEET.w}" height="${SHEET.h}"/>`;
  if (opts.grid) s += `<rect class="gridfill" x="${FRAME.area.x0}" y="${FRAME.area.y0}" width="${FRAME.area.x1 - FRAME.area.x0}" height="${FRAME.area.y1 - FRAME.area.y0}"/>`;
  s += frameSvg(project, page, pageIdx);
  s += '<g class="ink">';
  for (const b of page.boxes) {
    const sel = opts.selection?.has('b:' + b.id);
    s += `<g class="box${sel ? ' sel' : ''}" data-k="b:${b.id}"><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" stroke-dasharray="${b.style === 'solid' ? 'none' : '4 1 1 1'}"/>`;
    if (b.label) s += textSvg(b.x + 1.5, b.y + 3, b.label, 2.5, 'start');
    if (!opts.print) s += `<rect class="hit edge" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"/>`;
    s += '</g>';
  }
  for (const r of page.rails) {
    const sel = opts.selection?.has('r:' + r.id);
    s += `<g class="rail${sel ? ' sel' : ''}" data-k="r:${r.id}"><line x1="${r.x0}" y1="${r.y}" x2="${r.x1}" y2="${r.y}" style="stroke:${esc(r.color || '#000')}" class="rl"/>`;
    s += textSvg(r.x0 + 1, r.y - 1.2, r.name, 2.5, 'start', 'tx rail-l');
    s += textSvg(r.x1 - 1, r.y - 1.2, r.name, 2.5, 'end', 'tx rail-l');
    if (!opts.print) s += `<line class="hit" x1="${r.x0}" y1="${r.y}" x2="${r.x1}" y2="${r.y}"/>`;
    s += '</g>';
  }
  for (const w of page.wires) s += wireSvg(w, an, o);
  for (const c of page.comps) {
    const info = an.comps.get(c.id);
    if (info) s += compSvg(info, an, o);
  }
  for (const t of page.texts) {
    const sel = opts.selection?.has('t:' + t.id);
    s += `<g class="text${sel ? ' sel' : ''}" data-k="t:${t.id}">`;
    const ls = String(t.text).split('\n');
    const extra = (t.base ? ` style="dominant-baseline:${t.base}"` : '') + (t.rot ? ` transform="rotate(${t.rot} ${t.x} ${t.y})"` : '');
    ls.forEach((l, i) => (s += textSvg(t.x, t.y + i * t.size * 1.25, l, t.size, t.anchor || 'start', 'tx' + (t.bold ? ' tb-b' : ''), extra)));
    if (t.box) {
      // framed value (e.g. breaking capacity "3000")
      const w = Math.max(...ls.map((l) => l.length)) * t.size * 0.58 + 1;
      const x0 = t.anchor === 'middle' ? t.x - w / 2 : t.anchor === 'end' ? t.x - w : t.x - 0.5;
      s += `<rect class="tbox" x="${r2(x0)}" y="${r2(t.y - t.size * 0.65)}" width="${r2(w)}" height="${r2(t.size * 1.3)}"${t.rot ? ` transform="rotate(${t.rot} ${t.x} ${t.y})"` : ''}/>`;
    }
    if (!opts.print) {
      const w = Math.max(...ls.map((l) => l.length)) * t.size * 0.55 + 1;
      const x = t.anchor === 'middle' ? t.x - w / 2 : t.anchor === 'end' ? t.x - w : t.x;
      s += `<rect class="hit" x="${x - 0.5}" y="${t.y - t.size * 0.7}" width="${w}" height="${ls.length * t.size * 1.25 + 0.4}"/>`;
    }
    s += '</g>';
  }
  if (!page.noDots) for (const [x, y] of an.junctions.get(page.id) || []) s += `<circle cx="${x}" cy="${y}" r="0.75" class="fi"/>`;
  s += '</g>';
  return s;
}

/** CSS embedded in exported / printed SVG files. */
export const SVG_STYLE = `
.sheet{fill:#fff}.frame line,.frame rect{stroke:#000;stroke-width:.25;fill:none}.fr-outer{stroke-width:.5!important}
.ink line,.ink rect,.ink circle,.ink path,.ink polyline{stroke:#000;stroke-width:.3;fill:none;stroke-linecap:round;stroke-linejoin:round}
.ink .fi,.frame .fi{fill:#000}.ink .fw{fill:#fff}.ink circle.fi{stroke:none}
text{font-family:Arial,Helvetica,sans-serif;dominant-baseline:central;fill:#000;stroke:none}
.tb-b{font-weight:bold}.tb-l{fill:#555}.tag{font-weight:bold}.xref,.mirror{fill:#333}.wno{fill:#333}
.rail .rl{stroke-width:.5}.wire .gnye{stroke-width:.3}.ink rect.tbox{stroke-width:.2}.rail-l{font-weight:bold}.wire .wl{stroke-width:.3}
`;

/** Complete standalone SVG for one page (export / print). */
export function standalonePageSvg(project, page, pageIdx, an) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SHEET.w} ${SHEET.h}" width="${SHEET.w}mm" height="${SHEET.h}mm"><style>${SVG_STYLE}</style>${pageSvg(project, page, pageIdx, an, { print: true })}</svg>`;
}
