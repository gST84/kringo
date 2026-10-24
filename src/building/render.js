// SVG of floor plans: walls, openings, stairs, room names, installation symbols and their links.
// Plans are stored in centimetres and drawn to scale (default 1:50) on the A3 sheet; symbols and
// texts keep a fixed paper size.
import { t } from '../i18n.js';
import { esc, r2 } from '../util.js';
import { FRAME, SHEET } from '../model.js';
import { frameSvg, shapeSvg, textSvg, SVG_STYLE } from '../schematic/render.js';
import { geometry } from '../symbols/geom.js';
import { wallGeom, wallPath } from './model.js';

/** Sheet millimetres per plan centimetre. */
export const planK = (b) => 10 / (b.scale || 50);
/** Sheet position of plan coordinate (0, 0). */
export const PLAN_ORIGIN = [FRAME.area.x0 + 10, FRAME.area.y0 + 10];

export const LINK_COLORS = { switch: '#d97706', dom: '#7c3aed', pv: '#059669', other: '#64748b' };

/**
 * End of a wall at a corner: the two face points (+n and −n side of the wall). Where exactly two
 * walls meet, the faces are mitred (cut at their intersection), so the walls join cleanly, also
 * between straight and curved walls. A free end stops at its point; a joint of three or more walls
 * keeps the old square extension.
 */
function wallEnd(w, g, end, walls) {
  const t = (w.t || 20) / 2;
  const p = g.at(end ? g.len : 0);
  const P = [p.x, p.y];
  const a = end ? [-p.u[0], -p.u[1]] : p.u; // from the joint into this wall
  const face = (side) => [P[0] + p.n[0] * t * side, P[1] + p.n[1] * t * side];
  const others = [];
  for (const o of walls || []) {
    if (o === w || (o.id && o.id === w.id)) continue;
    for (const oe of [0, 1]) {
      const q = oe ? [o.x2, o.y2] : [o.x1, o.y1];
      if (Math.abs(q[0] - P[0]) <= 0.01 && Math.abs(q[1] - P[1]) <= 0.01) others.push([o, oe]);
    }
  }
  if (others.length > 1) {
    const ext = (side) => [P[0] - a[0] * t + p.n[0] * t * side, P[1] - a[1] * t + p.n[1] * t * side];
    return { plus: ext(1), minus: ext(-1) };
  }
  if (!others.length) return { plus: face(1), minus: face(-1) };
  const [o, oe] = others[0];
  const og = wallGeom(o);
  const q = og.at(oe ? og.len : 0);
  const b = oe ? [-q.u[0], -q.u[1]] : q.u;
  const tb = (o.t || 20) / 2;
  const cross = a[0] * b[1] - a[1] * b[0];
  if (Math.abs(cross) < 0.02) return { plus: face(1), minus: face(-1) }; // (almost) in line
  const la = [-a[1], a[0]], lb = [-b[1], b[0]];
  // left face of this wall meets the right face of the other one, and the other way round
  const meet = (oa, ob) => {
    const A = [P[0] + la[0] * oa, P[1] + la[1] * oa], B = [P[0] - lb[0] * ob, P[1] - lb[1] * ob];
    const s = ((B[0] - A[0]) * b[1] - (B[1] - A[1]) * b[0]) / cross;
    return [A[0] + a[0] * s, A[1] + a[1] * s];
  };
  let left = meet(t, tb), right = meet(-t, -tb);
  const lim = 4 * Math.max(t, tb); // very sharp corners: no long spikes
  const far = (m) => Math.hypot(m[0] - P[0], m[1] - P[1]) > lim;
  if (far(left) || far(right)) return { plus: face(1), minus: face(-1) };
  // left of `a` is the +n side at the start of the wall and the −n side at its end
  return end ? { plus: right, minus: left } : { plus: left, minus: right };
}

export function wallPolygon(w, walls) {
  const g = wallGeom(w);
  const t = (w.t || 20) / 2;
  const s0 = wallEnd(w, g, 0, walls), s1 = wallEnd(w, g, 1, walls);
  if (!g.arc) return [s0.plus, s1.plus, s1.minus, s0.minus];
  const top = wallPath(w, 0, g.len, t, g), bottom = wallPath(w, g.len, 0, -t, g);
  top[0] = s0.plus; top[top.length - 1] = s1.plus;
  bottom[0] = s1.minus; bottom[bottom.length - 1] = s0.minus;
  return [...top, ...bottom];
}

const pts = (list) => list.map(([x, y]) => `${r2(x)},${r2(y)}`).join(' ');
const line = (A, B, sw, extra = '') => `<line x1="${r2(A[0])}" y1="${r2(A[1])}" x2="${r2(B[0])}" y2="${r2(B[1])}" style="stroke-width:${sw}"${extra}/>`;
const pline = (list, sw, extra = '') => `<polyline points="${pts(list)}" style="fill:none;stroke-width:${sw}"${extra}/>`;

/** Opening types: label, default width and height (cm). */
export const OPENING_TYPES = {
  door: { label: 'Deur', width: 83, height: 210 },
  door2: { label: 'Dubbele deur', width: 150, height: 210 },
  window: { label: 'Raam', width: 120, height: 140 },
  slide: { label: 'Schuifraam / -deur', width: 240, height: 210 },
  garage: { label: 'Garagepoort', width: 250, height: 215 },
};
export const hasLeaf = (o) => (o.type === 'door' || o.type === 'door2') && o.leaf !== false;

function openingSvg(o, w, sw, sel) {
  const g = wallGeom(w);
  const t = (w.t || 20) / 2;
  const hw = o.width / 2;
  const t0 = o.pos - hw, t1 = o.pos + hw;
  const A = g.at(t0), B = g.at(t1);
  const side = o.side === -1 ? -1 : 1;
  const off = (p, d) => [p.x + p.n[0] * d, p.y + p.n[1] * d];
  let s = `<g class="opening${sel ? ' sel' : ''}" data-k="O:${o.id}">`;
  const gt = t + sw * 1.5; // also covers the wall outline
  s += `<polygon class="gap" points="${pts([...wallPath(w, t0, t1, gt, g), ...wallPath(w, t1, t0, -gt, g)])}"/>`;
  s += line(off(A, t), off(A, -t), sw) + line(off(B, t), off(B, -t), sw);
  if (hasLeaf(o)) {
    const leaves = o.type === 'door2' ? [[-1, hw], [1, hw]] : [[o.hinge === 'r' ? 1 : -1, o.width]];
    for (const [h, len] of leaves) {
      const P = h < 0 ? A : B;
      const H = off(P, side * t);
      const E = [H[0] + P.n[0] * side * len, H[1] + P.n[1] * side * len];
      const J = [H[0] - P.u[0] * h * len, H[1] - P.u[1] * h * len];
      const sweep = (h * side > 0) ? 1 : 0;
      s += line(H, E, sw * 1.5);
      s += `<path d="M ${r2(E[0])} ${r2(E[1])} A ${len} ${len} 0 0 ${sweep} ${r2(J[0])} ${r2(J[1])}" style="stroke-width:${sw * 0.7}" stroke-dasharray="${sw * 4} ${sw * 3}"/>`;
    }
  } else if (o.type === 'slide') {
    s += pline(wallPath(w, t0, o.pos + hw * 0.2, t * 0.3, g), sw * 1.5);
    s += pline(wallPath(w, o.pos - hw * 0.2, t1, -t * 0.3, g), sw * 1.5);
  } else if (o.type === 'window') {
    for (const a of [-0.25, 0.25]) s += pline(wallPath(w, t0, t1, t * a, g), sw);
    s += pline(wallPath(w, t0, t1, t, g), sw * 0.6);
  } else if (o.type === 'garage') {
    // door panel in the wall, overhead rails dashed on the inside
    s += pline(wallPath(w, t0, t1, 0, g), sw * 2);
    const depth = Math.min(60, o.width * 0.25);
    s += `<polygon class="ol" points="${pts([...wallPath(w, t0, t1, side * t, g), ...wallPath(w, t1, t0, side * (t + depth), g)])}" style="fill:none;stroke-width:${sw * 0.7}" stroke-dasharray="${sw * 5} ${sw * 3}"/>`;
  }
  return s + '</g>';
}

const arrowHead = (tip, dir, size, sw) => {
  const [dx, dy] = dir, px = -dy, py = dx;
  const a = [tip[0] - dx * size + px * size * 0.5, tip[1] - dy * size + py * size * 0.5];
  const b = [tip[0] - dx * size - px * size * 0.5, tip[1] - dy * size - py * size * 0.5];
  return pline([a, tip, b], sw);
};

function stairSvg(st, sw, sel) {
  const n = Math.max(2, st.steps || 14);
  if (st.kind === 'spiral') {
    const r = st.r || 100, r0 = Math.max(6, r * 0.12);
    const turn = st.turn || 360, dir = st.dir === -1 ? -1 : 1;
    const a0 = ((st.rot || 0) - 90) * Math.PI / 180;
    const P = (a, rr) => [Math.cos(a) * rr, Math.sin(a) * rr];
    let s = `<g class="stair${sel ? ' sel' : ''}" data-k="S:${st.id}" transform="translate(${st.x} ${st.y})">`;
    s += `<circle cx="0" cy="0" r="${r}" class="stairbox" style="stroke-width:${sw}"/><circle cx="0" cy="0" r="${r0}" style="fill:none;stroke-width:${sw}"/>`;
    for (let i = 0; i <= n; i++) {
      const a = a0 + dir * (turn * Math.PI / 180) * (i / n);
      if (i === n && turn >= 360) break;
      s += line(P(a, r0), P(a, r), sw * (i === 0 ? 1 : 0.7));
    }
    const ra = (r + r0) / 2;
    const arc = [];
    const end = turn * 0.92;
    for (let i = 0; i <= 48; i++) arc.push(P(a0 + dir * (end * Math.PI / 180) * (i / 48) + dir * 0.15, ra));
    s += pline(arc, sw);
    const ae = a0 + dir * (end * Math.PI / 180) + dir * 0.15;
    s += arrowHead(P(ae, ra), [-Math.sin(ae) * dir, Math.cos(ae) * dir], Math.min(15, r * 0.15), sw);
    return s + `<circle class="hit" cx="0" cy="0" r="${r}"/></g>`;
  }
  let s = `<g class="stair${sel ? ' sel' : ''}" data-k="S:${st.id}" transform="translate(${st.x} ${st.y}) rotate(${st.rot || 0})">`;
  if (st.kind === 'quarter') {
    const W = st.w, H = st.h;
    const b = Math.min(st.b || 90, W - 10, H - 10);
    s += `<g${st.mirror ? ` transform="translate(${W} 0) scale(-1 1)"` : ''}>`;
    s += `<polygon class="stairbox ol" points="${pts([[0, 0], [W, 0], [W, b], [b, b], [b, H], [0, H]])}" style="stroke-width:${sw}"/>`;
    const nw = n >= 8 ? 3 : 1;
    const L1 = H - b, L2 = W - b;
    const n1 = Math.max(1, Math.round(((n - nw) * L1) / (L1 + L2))), n2 = Math.max(1, n - nw - n1);
    for (let i = 1; i <= n1; i++) s += line([0, H - (L1 * i) / n1], [b, H - (L1 * i) / n1], sw * 0.7);
    for (let i = 1; i < nw; i++) {
      const phi = (Math.PI / 2) * (i / nw);
      const dx = -Math.cos(phi), dy = -Math.sin(phi);
      const k = b / Math.max(Math.abs(dx), Math.abs(dy));
      s += line([b, b], [b + dx * k, b + dy * k], sw * 0.7);
    }
    for (let i = 0; i < n2; i++) s += line([b + (L2 * i) / n2, 0], [b + (L2 * i) / n2, b], sw * 0.7);
    s += pline([[b / 2, H - L1 * 0.1], [b / 2, b / 2], [W - L2 * 0.08, b / 2]], sw);
    s += arrowHead([W - L2 * 0.08, b / 2], [1, 0], Math.min(15, b * 0.2), sw);
    s += '</g>';
    return s + `<rect class="hit" x="0" y="0" width="${W}" height="${H}"/></g>`;
  }
  s += `<rect x="0" y="0" width="${st.w}" height="${st.h}" class="stairbox" style="stroke-width:${sw}"/>`;
  for (let i = 1; i < n; i++) s += `<line x1="0" y1="${r2((st.h * i) / n)}" x2="${st.w}" y2="${r2((st.h * i) / n)}" style="stroke-width:${sw * 0.7}"/>`;
  const cx = st.w / 2;
  s += `<path d="M ${cx} ${st.h * 0.9} L ${cx} ${st.h * 0.1} M ${cx - st.w * 0.12} ${st.h * 0.1 + st.w * 0.15} L ${cx} ${st.h * 0.1} L ${cx + st.w * 0.12} ${st.h * 0.1 + st.w * 0.15}" style="stroke-width:${sw}"/>`;
  return s + `<rect class="hit" x="0" y="0" width="${st.w}" height="${st.h}"/></g>`;
}

/** Geometry of a dimension line: measured points, dimension line points, unit vectors. */
export function dimGeom(d) {
  const dx = d.x2 - d.x1, dy = d.y2 - d.y1;
  const len = Math.hypot(dx, dy) || 1;
  const u = [dx / len, dy / len], n = [-u[1], u[0]];
  const off = d.off || 0;
  return { len, u, n, q1: [d.x1 + n[0] * off, d.y1 + n[1] * off], q2: [d.x2 + n[0] * off, d.y2 + n[1] * off] };
}

export function dimSvg(d, k, sw, sel, opts = {}) {
  const { len, u, n, q1, q2 } = dimGeom(d);
  const mm = 1 / k; // one paper millimetre in plan centimetres
  const sgn = (d.off || 0) >= 0 ? 1 : -1;
  const ext = (p, q) => line([p[0] + n[0] * sgn * mm, p[1] + n[1] * sgn * mm], [q[0] + n[0] * sgn * 1.5 * mm, q[1] + n[1] * sgn * 1.5 * mm], sw * 0.6);
  let s = `<g class="pdim${sel ? ' sel' : ''}" data-k="D:${d.id}">`;
  if (Math.abs(d.off || 0) > mm) s += ext([d.x1, d.y1], q1) + ext([d.x2, d.y2], q2);
  s += line(q1, q2, sw * 0.8);
  const tk = [(u[0] + n[0]) * mm * 1.1, (u[1] + n[1]) * mm * 1.1];
  for (const q of [q1, q2]) s += line([q[0] - tk[0], q[1] - tk[1]], [q[0] + tk[0], q[1] + tk[1]], sw * 1.6);
  let ang = (Math.atan2(u[1], u[0]) * 180) / Math.PI;
  if (ang > 90.01 || ang <= -89.99) ang += 180;
  const mid = [(q1[0] + q2[0]) / 2, (q1[1] + q2[1]) / 2];
  const label = d.text || String(Math.round(len));
  s += `<g transform="translate(${r2(mid[0])} ${r2(mid[1])}) scale(${mm}) rotate(${r2(ang)})">${textSvg(0, -0.9, label, d.size || 2.5, 'middle', 'tx dimtx')}</g>`;
  if (!opts.print) s += `<polyline class="hit" points="${pts([[d.x1, d.y1], q1, q2, [d.x2, d.y2]])}" style="fill:none;stroke-width:${mm * 3}"/>`;
  return s + '</g>';
}

/** Coloured area (polygon) or line (polyline). */
export function planShapeSvg(sh, k, sel, opts = {}) {
  const color = sh.color || (sh.type === 'area' ? '#93c5fd' : '#dc2626');
  const wmm = sh.width || (sh.type === 'area' ? 0.18 : 0.5);
  const sw = wmm / k;
  const dash = sh.dash ? ` stroke-dasharray="${r2(sw * 5)} ${r2(sw * 3)}"` : '';
  const cls = `pshape${sel ? ' sel' : ''}`;
  if (sh.type === 'area') {
    return `<polygon class="${cls} parea" data-k="P:${sh.id}" points="${pts(sh.pts)}" style="fill:${color};fill-opacity:${sh.opacity ?? 0.35};stroke:${sh.stroke === false ? 'none' : color};stroke-width:${sw}"${dash}/>`;
  }
  if (sh.type === 'callout') return calloutSvg(sh, k, cls, opts);
  let s = `<g class="${cls}" data-k="P:${sh.id}"><polyline class="pline" points="${pts(sh.pts)}" style="fill:none;stroke:${color};stroke-width:${sw};stroke-linecap:round;stroke-linejoin:round"${dash}/>`;
  const n = sh.pts.length;
  const size = Math.max(2.2, wmm * 4) / k;
  if (n >= 2 && (sh.arrow === 'end' || sh.arrow === 'both')) s += arrowTip(sh.pts[n - 1], sh.pts[n - 2], size, color);
  if (n >= 2 && (sh.arrow === 'start' || sh.arrow === 'both')) s += arrowTip(sh.pts[0], sh.pts[1], size, color);
  if (!opts.print) s += `<polyline class="hit" points="${pts(sh.pts)}" style="fill:none;stroke-width:${Math.max(sw, 3 / k)}"/>`;
  return s + '</g>';
}

/** Filled arrow head at `tip`, pointing away from `from`. */
function arrowTip(tip, from, size, color) {
  const d = Math.hypot(tip[0] - from[0], tip[1] - from[1]) || 1;
  const ux = (tip[0] - from[0]) / d, uy = (tip[1] - from[1]) / d;
  const b = [tip[0] - ux * size, tip[1] - uy * size];
  const w = size * 0.38;
  return `<polygon class="ahead" points="${pts([tip, [b[0] - uy * w, b[1] + ux * w], [b[0] + uy * w, b[1] - ux * w]])}" style="fill:${color};stroke:none"/>`;
}

/** Text balloon (with a leader to the point it explains) or text box, at paper size. */
function calloutSvg(sh, k, cls, opts) {
  const color = sh.color || '#1f2937';
  const size = sh.size || 3; // mm on paper
  const lines = String(sh.text || '').split('\n');
  const lh = size * 1.25, pad = size * 0.55;
  const w = Math.max(size * 2, Math.max(...lines.map((l) => l.length)) * size * 0.56) + pad * 2;
  const h = lines.length * lh + pad * 1.2;
  const shape = sh.shape || 'round';
  const ex = shape === 'ellipse' ? 1.3 : 1, ey = shape === 'ellipse' ? 1.45 : 1;
  const B = sh.pts[sh.pts.length - 1];
  const mm = 1 / k;
  const swmm = sh.width || 0.25;
  let s = `<g class="${cls}" data-k="P:${sh.id}">`;
  if (sh.pts.length > 1) {
    const T = sh.pts[0];
    const dx = T[0] - B[0], dy = T[1] - B[1];
    const hw = (w * ex * mm) / 2, hh = (h * ey * mm) / 2;
    const f = shape === 'ellipse' ? 1 / Math.hypot(dx / hw, dy / hh) : Math.min(hw / Math.abs(dx || 1e-9), hh / Math.abs(dy || 1e-9));
    if (f < 1) {
      const E = [B[0] + dx * f, B[1] + dy * f];
      s += `<line class="pline" x1="${r2(E[0])}" y1="${r2(E[1])}" x2="${r2(T[0])}" y2="${r2(T[1])}" style="stroke:${color};stroke-width:${swmm * mm}"/>`;
      s += arrowTip(T, E, 2.2 * mm, color);
      if (!opts.print) s += `<polyline class="hit" points="${pts([E, T])}" style="fill:none;stroke-width:${3 * mm}"/>`;
    }
  }
  s += `<g transform="translate(${r2(B[0])} ${r2(B[1])}) scale(${r2(mm)})">`;
  const fill = sh.fill === false ? 'none' : '#fff';
  const box = `style="fill:${fill};fill-opacity:.92;stroke:${sh.border === false ? 'none' : color};stroke-width:${swmm}"`;
  if (shape === 'ellipse') s += `<ellipse class="cbox" cx="0" cy="0" rx="${r2((w * ex) / 2)}" ry="${r2((h * ey) / 2)}" ${box}/>`;
  else s += `<rect class="cbox" x="${r2(-w / 2)}" y="${r2(-h / 2)}" width="${r2(w)}" height="${r2(h)}" rx="${shape === 'rect' ? 0 : r2(size * 0.6)}" ${box}/>`;
  lines.forEach((l, i) => {
    s += `<text x="0" y="${r2(-((lines.length - 1) * lh) / 2 + i * lh)}" font-size="${size}" text-anchor="middle" class="tx ctext" style="fill:${color}">${esc(l)}</text>`;
  });
  if (!opts.print) s += `<rect class="hit" x="${r2((-w * ex) / 2)}" y="${r2((-h * ey) / 2)}" width="${r2(w * ex)}" height="${r2(h * ey)}"/>`;
  return s + '</g></g>';
}

export function linkKind(defA, defB) {
  const kinds = [defA?.kind, defB?.kind];
  if (kinds.includes('switch') || kinds.includes('push')) return 'switch';
  if (kinds.includes('dom-in') || kinds.includes('dom-out')) return 'dom';
  if (kinds.includes('pv') || kinds.includes('inverter') || kinds.includes('battery')) return 'pv';
  return 'other';
}

/** One installation symbol at plan position, drawn at paper size. */
function symbolSvg(sym, def, k, building, sel, opts) {
  const inv = 1 / k;
  const geom = geometry(def, sym);
  let shapes = '';
  for (const g of geom.graphics || []) shapes += g.t === 'text' ? textSvg(g.x, g.y, g.text, g.size, g.anchor) : shapeSvg(g);
  let s = `<g class="psym${sel ? ' sel' : ''}" data-k="A:${sym.id}" transform="translate(${r2(sym.x)} ${r2(sym.y)}) scale(${inv})">`;
  s += `<g transform="rotate(${sym.rot || 0})">${shapes}</g>`;
  const c = building.circuits.find((x) => x.id === sym.circuit);
  const label = c ? `${c.name}${sym.n ?? ''}` : '';
  if (label) s += textSvg(3.6, -3.2, label, 2, 'start', 'tx clabel');
  if (opts.showRooms && sym.props?.room) s += textSvg(3.6, -0.8, sym.props.room, 1.5, 'start', 'tx croom');
  if (!opts.print) s += `<circle class="hit" cx="0" cy="0" r="4.5"/>`;
  return s + '</g>';
}

export function planSvg(project, floorIdx, lib, opts = {}) {
  const b = project.building;
  const floor = b.floors[floorIdx];
  const k = planK(b);
  const sw = 0.25 / k; // 0.25 mm on paper
  const sel = opts.selection || new Set();
  const [ox, oy] = PLAN_ORIGIN;
  let s = `<rect class="sheet" x="0" y="0" width="${SHEET.w}" height="${SHEET.h}"/>`;
  if (opts.grid) s += `<rect class="plangrid" x="${FRAME.area.x0}" y="${FRAME.area.y0}" width="${FRAME.area.x1 - FRAME.area.x0}" height="${FRAME.area.y1 - FRAME.area.y0}"/>`;
  s += frameSvg(project, { title: floor.name }, floorIdx, b.floors.length);
  // scale note
  s += textSvg(FRAME.area.x1 - 3, FRAME.area.y1 - 4, t('Schaal 1:{n}', { n: b.scale }), 2.5, 'end', 'tx');
  s += `<g class="plan ink" transform="translate(${ox} ${oy}) scale(${k})">`;
  // background image (traced drawing)
  const bg = floor.bg;
  const bgUrl = bg && (opts.imageUrl ? opts.imageUrl(bg.img) : project.images?.[bg.img]);
  if (bgUrl && !(opts.print && !bg.print) && bg.show !== false) {
    s += `<image class="pbg${bg.locked ? ' locked' : ''}${sel.has('B:bg') ? ' sel' : ''}"${bg.locked || opts.print ? '' : ' data-k="B:bg"'} href="${bgUrl}" x="${r2(bg.x)}" y="${r2(bg.y)}" width="${r2(bg.w)}" height="${r2(bg.h)}" preserveAspectRatio="none" opacity="${bg.opacity ?? 0.5}"/>`;
    if (sel.has('B:bg')) s += `<rect class="bgsel" x="${r2(bg.x)}" y="${r2(bg.y)}" width="${r2(bg.w)}" height="${r2(bg.h)}" style="stroke-width:${sw * 2}"/>`;
  }
  for (const sh of floor.shapes || []) if (sh.type === 'area') s += planShapeSvg(sh, k, sel.has('P:' + sh.id), opts);
  // walls
  // walls: first every wall with a black outline, then every wall filled on top of that, so the
  // outlines disappear where walls meet and the walls read as one whole
  // inner walls first, so outer walls cover them where they meet
  const polys = [...floor.walls].sort((a, c) => (a.kind === 'inner' ? 0 : 1) - (c.kind === 'inner' ? 0 : 1)).map((w) => [w, pts(wallPolygon(w, floor.walls))]);
  s += `<g class="walloutline" style="stroke-width:${sw * 2}">`;
  for (const [, p] of polys) s += `<polygon points="${p}"/>`;
  s += '</g><g class="walls">';
  for (const [w, p] of polys) {
    s += `<polygon class="wall${w.kind === 'inner' ? ' inner' : ''}${sel.has('W:' + w.id) ? ' sel' : ''}" data-k="W:${w.id}" points="${p}"/>`;
  }
  s += '</g>';
  const wallsById = new Map(floor.walls.map((w) => [w.id, w]));
  for (const o of floor.openings) {
    const w = wallsById.get(o.wall);
    if (w) s += openingSvg(o, w, sw, sel.has('O:' + o.id));
  }
  for (const st of floor.stairs) s += stairSvg(st, sw, sel.has('S:' + st.id));
  for (const sh of floor.shapes || []) if (sh.type === 'line') s += planShapeSvg(sh, k, sel.has('P:' + sh.id), opts);
  for (const d of floor.dims || []) s += dimSvg(d, k, sw, sel.has('D:' + d.id), opts);
  // room names
  for (const t of floor.texts) {
    s += `<g class="ptext${sel.has('T:' + t.id) ? ' sel' : ''}" data-k="T:${t.id}" transform="translate(${r2(t.x)} ${r2(t.y)}) scale(${1 / k})">`;
    s += textSvg(0, 0, t.text, t.size || 3, 'middle', 'tx room');
    if (t.area) s += textSvg(0, (t.size || 3) * 1.1, t.area, (t.size || 3) * 0.7, 'middle', 'tx');
    if (!opts.print) s += `<rect class="hit" x="${-(t.text.length * (t.size || 3) * 0.3) - 1}" y="${-(t.size || 3) * 0.7}" width="${t.text.length * (t.size || 3) * 0.6 + 2}" height="${(t.size || 3) * 1.4}"/>`;
    s += '</g>';
  }
  // links (switch → lights, domotics, PV)
  const symById = new Map(floor.symbols.map((x) => [x.id, x]));
  if (opts.showLinks !== false) for (const l of floor.links) {
    const a = symById.get(l.a), c = symById.get(l.b);
    if (!a || !c) continue;
    const kind = linkKind(lib.get(a.sym), lib.get(c.sym));
    const mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2;
    const dx = c.x - a.x, dy = c.y - a.y;
    const bend = 0.18;
    const qx = mx - dy * bend, qy = my + dx * bend;
    s += `<path class="plink${sel.has('L:' + l.id) ? ' sel' : ''}" data-k="L:${l.id}" d="M ${r2(a.x)} ${r2(a.y)} Q ${r2(qx)} ${r2(qy)} ${r2(c.x)} ${r2(c.y)}" style="stroke:${LINK_COLORS[kind]};stroke-width:${sw * 1.2}" stroke-dasharray="${sw * 6} ${sw * 4}"/>`;
    if (!opts.print) s += `<path class="hit" data-k="L:${l.id}" d="M ${r2(a.x)} ${r2(a.y)} Q ${r2(qx)} ${r2(qy)} ${r2(c.x)} ${r2(c.y)}" style="stroke-width:${sw * 10}"/>`;
  }
  for (const sym of floor.symbols) {
    const def = lib.get(sym.sym);
    if (def) s += symbolSvg(sym, def, k, b, sel.has('A:' + sym.id), opts);
  }
  for (const sh of floor.shapes || []) if (sh.type === 'callout') s += planShapeSvg(sh, k, sel.has('P:' + sh.id), opts);
  s += '</g>';
  return s;
}

export const PLAN_STYLE = `
.plan .walloutline polygon{fill:#000;stroke:#000;stroke-linejoin:miter}.plan .wall{fill:#9b9b9b;stroke:none}.plan .wall.inner{fill:#bdbdbd}
.plan .gap{fill:#fff;stroke:none}.plan .stairbox{fill:#fff}
.plan .plink{fill:none}.plan polyline{fill:none}.plan polygon.ol{stroke:#000}.room{font-weight:bold}.clabel{font-weight:bold;fill:#c2410c}.croom{fill:#555}
`;

export function standalonePlanSvg(project, floorIdx, lib) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SHEET.w} ${SHEET.h}" width="${SHEET.w}mm" height="${SHEET.h}mm"><style>${SVG_STYLE}${PLAN_STYLE}</style>${planSvg(project, floorIdx, lib, { print: true })}</svg>`;
}

