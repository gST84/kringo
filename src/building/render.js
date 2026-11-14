// SVG of floor plans: walls, openings, stairs, room names, installation symbols and their links.
// Plans are stored in centimetres and drawn to scale (default 1:50) on the A3 sheet; symbols and
// texts keep a fixed paper size.
import { t } from '../i18n.js';
import { esc, r2 } from '../util.js';
import { FRAME, SHEET } from '../model.js';
import { frameSvg, shapeSvg, textSvg, SVG_STYLE } from '../schematic/render.js';
import { geometry } from '../symbols/geom.js';
import { colorChannels, domAddress, domKey, isDivider, isFixture, isFloorPass, floorPassMedia, isFurniture, isRoof, MEDIA, planMedia, planTitle, projectOnWall, symDisc, wallGeom, wallPath } from './model.js';
import { consError, consLabel, hasCons } from './constraints.js';
import { deviations, roomArea, roomColor, roomLabelPos, roomPolygon } from './rooms.js';

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
    if (o === w || (o.id && o.id === w.id) || isDivider(o) !== isDivider(w)) continue;
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

/** The four corner points of a wall (s0 = start, s1 = end; plus / minus side), with the joints worked out. */
export function wallCorners(w, walls) {
  const g = wallGeom(w);
  return { s0: wallEnd(w, g, 0, walls), s1: wallEnd(w, g, 1, walls) };
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
  passage: { label: 'Muurdoorvoer (leidingen)', width: 20, height: 0 },
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
  if (o.type === 'passage') {
    // wall passage: the wall stays; a coloured band through it (the colour says which pipes may pass)
    const col = (MEDIA[o.media] || MEDIA.elec).color;
    s += `<polygon class="passage" points="${pts([...wallPath(w, t0, t1, t, g), ...wallPath(w, t1, t0, -t, g)])}" style="fill:${col};fill-opacity:.55;stroke:${col};stroke-width:${sw * 1.2}"/>`;
    const M = g.at(o.pos), P1 = off(M, t + sw * 6), P2 = off(M, -t - sw * 6);
    s += `<line x1="${r2(P1[0])}" y1="${r2(P1[1])}" x2="${r2(P2[0])}" y2="${r2(P2[1])}" style="stroke:${col};stroke-width:${sw};stroke-dasharray:${sw * 3} ${sw * 2}"/>`;
    return s + '</g>';
  }
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

/**
 * Stairs of the floor below that come up on this floor (shown dashed with the arrow reversed), unless the
 * same stair is drawn here too or its link is 'none' / 'down'. Cabinets stay on their own floor.
 */
/** Floor passages of the floor below: they come through this floor too (drawn dashed). */
export function floorPassesFromBelow(b, floorIdx) {
  const below = b.floors[floorIdx - 1];
  return below ? (below.stairs || []).filter(isFloorPass) : [];
}

export function stairsFromBelow(b, floorIdx) {
  const below = b.floors[floorIdx - 1], here = b.floors[floorIdx];
  if (!below || !here) return [];
  const centre = (st) => (st.kind === 'spiral' ? [st.x, st.y] : (() => {
    const a = ((st.rot || 0) * Math.PI) / 180;
    return [st.x + (st.w / 2) * Math.cos(a) - (st.h / 2) * Math.sin(a), st.y + (st.w / 2) * Math.sin(a) + (st.h / 2) * Math.cos(a)];
  })());
  return (below.stairs || []).filter((st) => !isFixture(st) && st.link !== 'none' && st.link !== 'down'
    && !(here.stairs || []).some((x) => !isFixture(x) && Math.hypot(centre(x)[0] - centre(st)[0], centre(x)[1] - centre(st)[1]) < 80));
}

/**
 * A stair; `ghost`: the stair of the floor below seen from the floor above (the stairwell): dashed outline,
 * no fill, arrow reversed (going down), not selectable.
 */
function stairSvg(st, sw, sel, ghost = false) {
  const n = Math.max(2, st.steps || 14);
  const head = ghost ? `<g class="stair ghoststair" style="pointer-events:none"` : `<g class="stair${sel ? ' sel' : ''}" data-k="S:${st.id}"`;
  const box = ghost ? `class="stairbox stairghost ol" style="fill:none;stroke-width:${sw};stroke-dasharray:${r2(sw * 8)} ${r2(sw * 5)}"` : `class="stairbox" style="stroke-width:${sw}"`;
  const hit = (shape) => (ghost ? '' : shape);
  if (st.kind === 'spiral') {
    const r = st.r || 100, r0 = Math.max(6, r * 0.12);
    const turn = st.turn || 360, dir = st.dir === -1 ? -1 : 1;
    const a0 = ((st.rot || 0) - 90) * Math.PI / 180;
    const P = (a, rr) => [Math.cos(a) * rr, Math.sin(a) * rr];
    let s = `${head} transform="translate(${st.x} ${st.y})">`;
    s += `<circle cx="0" cy="0" r="${r}" ${box}/><circle cx="0" cy="0" r="${r0}" style="fill:none;stroke-width:${sw}"/>`;
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
    const ae = a0 + dir * (end * Math.PI / 180) + dir * 0.15, as = a0 + dir * 0.15;
    s += ghost ? arrowHead(P(as, ra), [Math.sin(as) * dir, -Math.cos(as) * dir], Math.min(15, r * 0.15), sw)
      : arrowHead(P(ae, ra), [-Math.sin(ae) * dir, Math.cos(ae) * dir], Math.min(15, r * 0.15), sw);
    return s + hit(`<circle class="hit" cx="0" cy="0" r="${r}"/>`) + '</g>';
  }
  let s = `${head} transform="translate(${st.x} ${st.y}) rotate(${st.rot || 0})">`;
  if (isRoof(st)) return s + roofSvg(st, sw) + `<rect class="hit" x="0" y="0" width="${st.w}" height="${st.h}"/></g>`;
  if (isFurniture(st)) return s + furnSvg(st, sw) + `<rect class="hit" x="0" y="0" width="${st.w}" height="${st.h}"/></g>`;
  if (isFloorPass(st)) return s + floorPassSvg(st, sw, ghost) + hit(`<rect class="hit" x="0" y="0" width="${st.w}" height="${st.h}"/>`) + '</g>';
  if (st.kind === 'tall' || st.kind === 'counter') {
    // tall cabinet: box with a cross; counter: box with one diagonal and the worktop's front edge
    const W = st.w, H = st.h;
    s += `<rect x="0" y="0" width="${W}" height="${H}" class="stairbox" style="stroke-width:${sw}"/>`;
    if (st.kind === 'tall') s += line([0, 0], [W, H], sw * 0.7) + line([W, 0], [0, H], sw * 0.7);
    else s += line([0, H - Math.min(4, H * 0.1)], [W, H - Math.min(4, H * 0.1)], sw * 0.5) + line([0, 0], [W, H - Math.min(4, H * 0.1)], sw * 0.5);
    if (st.label) {
      const fs = r2(Math.max(4, Math.min(12, H * 0.3, (W * 1.6) / Math.max(1, st.label.length))));
      s += `<text x="${W / 2}" y="${H / 2}" font-size="${fs}" text-anchor="middle" dominant-baseline="central" style="font-family:sans-serif;fill:#333;stroke:#fff;stroke-width:${r2(fs / 5)};paint-order:stroke">${esc(st.label)}</text>`;
    }
    return s + `<rect class="hit" x="0" y="0" width="${W}" height="${H}"/></g>`;
  }
  if (st.kind === 'quarter') {
    const W = st.w, H = st.h;
    const b = Math.min(st.b || 90, W - 10, H - 10);
    s += `<g${st.mirror ? ` transform="translate(${W} 0) scale(-1 1)"` : ''}>`;
    s += ghost ? `<polygon points="${pts([[0, 0], [W, 0], [W, b], [b, b], [b, H], [0, H]])}" ${box}/>` : `<polygon class="stairbox ol" points="${pts([[0, 0], [W, 0], [W, b], [b, b], [b, H], [0, H]])}" style="stroke-width:${sw}"/>`;
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
    s += ghost ? arrowHead([b / 2, H - L1 * 0.1], [0, 1], Math.min(15, b * 0.2), sw) : arrowHead([W - L2 * 0.08, b / 2], [1, 0], Math.min(15, b * 0.2), sw);
    s += '</g>';
    return s + hit(`<rect class="hit" x="0" y="0" width="${W}" height="${H}"/>`) + '</g>';
  }
  s += `<rect x="0" y="0" width="${st.w}" height="${st.h}" ${box}/>`;
  for (let i = 1; i < n; i++) s += `<line x1="0" y1="${r2((st.h * i) / n)}" x2="${st.w}" y2="${r2((st.h * i) / n)}" style="stroke-width:${sw * 0.7}"/>`;
  const cx = st.w / 2;
  s += ghost
    ? `<path d="M ${cx} ${st.h * 0.1} L ${cx} ${st.h * 0.9} M ${cx - st.w * 0.12} ${st.h * 0.9 - st.w * 0.15} L ${cx} ${st.h * 0.9} L ${cx + st.w * 0.12} ${st.h * 0.9 - st.w * 0.15}" style="stroke-width:${sw}"/>`
    : `<path d="M ${cx} ${st.h * 0.9} L ${cx} ${st.h * 0.1} M ${cx - st.w * 0.12} ${st.h * 0.1 + st.w * 0.15} L ${cx} ${st.h * 0.1} L ${cx + st.w * 0.12} ${st.h * 0.1 + st.w * 0.15}" style="stroke-width:${sw}"/>`;
  return s + hit(`<rect class="hit" x="0" y="0" width="${st.w}" height="${st.h}"/>`) + '</g>';
}

/** Furniture / sanitary fitting in the box (0, 0) – (w, h); the front is the bottom edge. Thin grey lines. */
function furnSvg(st, sw) {
  const W = st.w, H = st.h, m = Math.min(W, H);
  const t1 = sw * 0.75, t2 = sw * 0.5;
  const R = (x, y, w, h, rx = 0, lw = t1, cls = 'furnbox') => `<rect class="${cls}" x="${r2(x)}" y="${r2(y)}" width="${r2(Math.max(0, w))}" height="${r2(Math.max(0, h))}" rx="${r2(rx)}" style="stroke-width:${lw}"/>`;
  const E = (cx, cy, rx, ry, lw = t2, cls = 'furnin') => `<ellipse class="${cls}" cx="${r2(cx)}" cy="${r2(cy)}" rx="${r2(rx)}" ry="${r2(ry)}" style="stroke-width:${lw}"/>`;
  const C = (cx, cy, r, lw = t2) => E(cx, cy, r, r, lw);
  const L = (a, b, lw = t2) => line(a, b, lw);
  const tx = (x, y, text, fs) => `<text class="furntx" x="${r2(x)}" y="${r2(y)}" font-size="${r2(fs)}" text-anchor="middle" dominant-baseline="central">${esc(text)}</text>`;
  let s = '<g class="furn">';
  switch (st.kind) {
    case 'bed1': case 'bed2': {
      s += R(0, 0, W, H) + L([0, H * 0.05], [W, H * 0.05], t1);
      const n = st.kind === 'bed2' ? 2 : 1, gap = Math.min(8, W * 0.06), pw = (W - gap * (n + 1)) / n;
      for (let i = 0; i < n; i++) s += R(gap + i * (pw + gap), H * 0.08, pw, H * 0.13, 5, t2, 'furnin');
      s += L([0, H * 0.3], [W, H * 0.3]) + L([0, H * 0.3], [W * 0.25, H * 0.36]);
      break;
    }
    case 'nightstand': s += R(0, 0, W, H) + C(W / 2, H / 2, m * 0.22); break;
    case 'sofa': case 'armchair': {
      const back = H * 0.27, arm = Math.min(W * 0.14, 18);
      s += R(0, 0, W, H, 4) + L([0, back], [W, back], t1) + L([arm, back], [arm, H], t1) + L([W - arm, back], [W - arm, H], t1);
      const k = Math.max(1, Math.round((W - 2 * arm) / 70));
      for (let i = 1; i < k; i++) { const x = arm + ((W - 2 * arm) * i) / k; s += L([x, back], [x, H]); }
      break;
    }
    case 'corner': {
      const D = Math.min(95, W * 0.45, H * 0.45), b = D * 0.28, arm = Math.min(18, D * 0.2);
      s += `<polygon class="furnbox" points="${pts([[0, 0], [W, 0], [W, D], [D, D], [D, H], [0, H]])}" style="stroke-width:${t1}"/>`;
      s += pline([[W, b], [b, b], [b, H]], t1) + L([W - arm, b], [W - arm, D], t1) + L([b, H - arm], [D, H - arm], t1);
      s += L([D, b], [D, D]) + L([b, D], [D, D]);
      break;
    }
    case 'table': {
      const c = Math.min(35, H * 0.22), ty = c + 5;
      const n = Math.max(1, Math.floor(W / 62)), cw = Math.min(45, W / n - 12);
      for (let i = 0; i < n; i++) {
        const x = (W / n) * (i + 0.5) - cw / 2;
        s += R(x, 0, cw, c, 4, t2) + R(x, H - c, cw, c, 4, t2);
      }
      s += R(0, ty, W, H - 2 * ty, 0, t1);
      break;
    }
    case 'roundtable': {
      const cx = W / 2, cy = H / 2, rt = Math.max(20, m / 2 - 34);
      const n = Math.max(3, Math.min(10, Math.round((2 * Math.PI * rt) / 55)));
      for (let i = 0; i < n; i++) s += `<g transform="translate(${r2(cx)} ${r2(cy)}) rotate(${r2((360 * i) / n)})">${R(-20, -(rt + 33), 40, 30, 4, t2)}</g>`;
      s += E(cx, cy, rt, rt, t1, 'furnbox');
      break;
    }
    case 'desk': {
      const dd = Math.min(H * 0.6, 75);
      s += R(0, 0, W, dd, 0, t1) + R(W / 2 - 23, dd + 6, 46, Math.max(10, H - dd - 6), 8, t2);
      break;
    }
    case 'tv': s += R(0, 0, W, H) + R(W * 0.15, H * 0.15, W * 0.7, Math.min(8, H * 0.25), 0, t2, 'furnin'); break;
    case 'shower':
      s += R(0, 0, W, H) + R(4, 4, W - 8, H - 8, 0, t2, 'furnin') + L([4, 4], [W - 4, H - 4]) + L([W - 4, 4], [4, H - 4]) + C(W / 2, H / 2, Math.max(2.5, m * 0.05));
      break;
    case 'bath': {
      s += R(0, 0, W, H) + R(6, 6, W - 12, H - 12, (m - 12) * 0.4, t2, 'furnin');
      s += W >= H ? C(6 + m * 0.25, H / 2, 2.5) : C(W / 2, 6 + m * 0.25, 2.5);
      break;
    }
    case 'wc': s += R(W * 0.04, 0, W * 0.92, H * 0.27, 2) + E(W / 2, H * 0.63, W * 0.42, H * 0.34, t1, 'furnbox'); break;
    case 'sink': s += R(0, 0, W, H) + E(W / 2, H * 0.57, W * 0.36, H * 0.3) + C(W / 2, H * 0.14, 2); break;
    case 'sink2': s += R(0, 0, W, H) + E(W * 0.25, H * 0.57, W * 0.18, H * 0.3) + E(W * 0.75, H * 0.57, W * 0.18, H * 0.3) + C(W * 0.25, H * 0.14, 2) + C(W * 0.75, H * 0.14, 2); break;
    case 'washer': case 'dryer':
      s += R(0, 0, W, H, 2) + C(W / 2, H * 0.56, m * 0.3, t1) + tx(W / 2, H * 0.12, st.kind === 'washer' ? 'WM' : 'DK', m * 0.15);
      if (st.kind === 'dryer') s += L([W / 2 - m * 0.18, H * 0.56], [W / 2 + m * 0.18, H * 0.56]);
      break;
    case 'hob': {
      s += R(0, 0, W, H, 2);
      for (const [x, y, r] of [[0.28, 0.3, 0.17], [0.72, 0.3, 0.13], [0.28, 0.72, 0.13], [0.72, 0.72, 0.17]]) s += C(W * x, H * y, m * r);
      break;
    }
    case 'car': {
      s += R(0, 0, W, H, W * 0.22) + R(W * 0.1, H * 0.27, W * 0.8, H * 0.5, W * 0.12, t2, 'furnin');
      s += L([W * 0.1, H * 0.37], [W * 0.9, H * 0.37]) + L([W * 0.1, H * 0.7], [W * 0.9, H * 0.7]);
      break;
    }
    default: s += R(0, 0, W, H);
  }
  if (st.label) {
    const fs = r2(Math.max(4, Math.min(14, m * 0.25, (W * 1.6) / Math.max(1, st.label.length))));
    s += `<text x="${W / 2}" y="${H / 2}" font-size="${fs}" text-anchor="middle" dominant-baseline="central" style="font-family:sans-serif;fill:#333;stroke:#fff;stroke-width:${r2(fs / 5)};paint-order:stroke">${esc(st.label)}</text>`;
  }
  return s + '</g>';
}

/** Floor passage: box with both diagonals and the media it carries; dashed on the floor above. */
function floorPassSvg(st, sw, ghost) {
  const W = st.w, H = st.h;
  const dash = ghost ? ` stroke-dasharray="${r2(sw * 6)} ${r2(sw * 4)}"` : '';
  let s = `<rect class="floorpass${ghost ? ' ghost' : ''}" x="0" y="0" width="${W}" height="${H}" style="stroke-width:${sw * 1.4}"${dash}/>`;
  s += line([0, 0], [W, H], sw * 0.8, dash) + line([W, 0], [0, H], sw * 0.8, dash);
  const tag = { elec: 'E', cv: 'CV', water: 'W', drain: 'A', vent: 'V' };
  const text = st.label || floorPassMedia(st).map((m) => tag[m] || m).join(' ');
  if (text) {
    const fs = r2(Math.max(4, Math.min(10, Math.min(W, H) * 0.3, (W * 1.6) / Math.max(1, text.length))));
    s += `<text x="${r2(W / 2)}" y="${r2(-fs * 0.7)}" font-size="${fs}" text-anchor="middle" style="font-family:sans-serif;fill:#333;stroke:#fff;stroke-width:${r2(fs / 5)};paint-order:stroke">${esc(text)}${ghost ? ' ↓' : ''}</text>`;
  }
  return s;
}

/**
 * Roof symbol in the box (0, 0) – (w, h); the front (eaves, where the water runs to) is the bottom edge.
 * Flat roof: thin hatching and an arrow for the fall. Pitched roof: ridge, hips, arrows down the slopes.
 */
function roofSvg(st, sw) {
  const W = st.w, H = st.h;
  let s = `<rect x="0" y="0" width="${W}" height="${H}" class="stairbox roofbox" style="stroke-width:${sw * 1.4}"/>`;
  const arrow = (a, b) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    const k = Math.min(14, L * 0.35);
    return line(a, b, sw * 0.8) + `<polygon class="roofarrow" points="${pts([b, [b[0] - u[0] * k - u[1] * k * 0.4, b[1] - u[1] * k + u[0] * k * 0.4], [b[0] - u[0] * k + u[1] * k * 0.4, b[1] - u[1] * k - u[0] * k * 0.4]])}"/>`;
  };
  const text = (x, y, t, fs) => `<text x="${r2(x)}" y="${r2(y)}" font-size="${r2(fs)}" text-anchor="middle" dominant-baseline="central" class="rooftx" style="stroke-width:${r2(fs / 5)}">${esc(t)}</text>`;
  const fs = Math.max(8, Math.min(24, H * 0.12, W * 0.08));
  if (st.kind === 'flat') {
    // hatching at 45°, every 30 cm
    const step = 30;
    for (let c = step; c < W + H; c += step) {
      const a = [Math.min(c, W), c - Math.min(c, W)], b = [c - Math.min(c, H), Math.min(c, H)];
      s += line(a, b, sw * 0.35);
    }
    const cx = W / 2;
    s += arrow([cx, H * 0.3], [cx, H * 0.85]);
    s += text(cx, H * 0.18, st.label || t('Plat dak'), fs);
    if (st.slope) s += text(cx + Math.min(W * 0.25, 60), H * 0.58, `${String(st.slope).replace('.', ',')} %`, fs * 0.8);
    return s;
  }
  const shape = st.roof || 'gable';
  const pitch = st.pitch != null ? `${String(st.pitch).replace('.', ',')}°` : '';
  if (shape === 'mono') {
    // single slope: from the back (top) down to the front
    s += arrow([W / 2, H * 0.15], [W / 2, H * 0.85]);
    s += text(W / 2 + Math.min(W * 0.25, 80), H / 2, [st.label, pitch].filter(Boolean).join(' · '), fs);
    return s;
  }
  // gable or hip: the ridge runs along the long side, in the middle
  const along = W >= H;
  const half = (along ? H : W) / 2;
  let r1, r2p;
  if (along) { r1 = [shape === 'hip' ? half : 0, H / 2]; r2p = [shape === 'hip' ? W - half : W, H / 2]; }
  else { r1 = [W / 2, shape === 'hip' ? half : 0]; r2p = [W / 2, shape === 'hip' ? H - half : H]; }
  s += line(r1, r2p, sw * 1.6);
  if (shape === 'hip') {
    const c = [[0, 0], [W, 0], [W, H], [0, H]];
    const L = (a, b) => line(a, b, sw * 0.9);
    if (along) s += L(c[0], r1) + L(c[3], r1) + L(c[1], r2p) + L(c[2], r2p);
    else s += L(c[0], r1) + L(c[1], r1) + L(c[3], r2p) + L(c[2], r2p);
  }
  // arrows from the ridge down to both eaves
  const m = [(r1[0] + r2p[0]) / 2, (r1[1] + r2p[1]) / 2];
  const g = half * 0.15;
  if (along) s += arrow([m[0], m[1] - g], [m[0], g * 1.2]) + arrow([m[0], m[1] + g], [m[0], H - g * 1.2]);
  else s += arrow([m[0] - g, m[1]], [g * 1.2, m[1]]) + arrow([m[0] + g, m[1]], [W - g * 1.2, m[1]]);
  const lab = [st.label, pitch].filter(Boolean).join(' · ');
  if (lab) s += along ? text(m[0] + Math.min(W * 0.22, 90), H * 0.25, lab, fs) : text(W * 0.25, m[1] + Math.min(H * 0.22, 90), lab, fs);
  return s;
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
  if (kinds.some((k) => ['pv', 'inverter', 'battery', 'mppt', 'dcbus'].includes(k))) return 'pv';
  return 'other';
}

/** Name, area and the influences that differ from a normal room, in the middle of the room. */
function roomLabelSvg(r, poly, k, on, opts) {
  const [x, y] = roomLabelPos(r, poly);
  const mm = 1 / k;
  const dev = deviations(r);
  let s = `<g class="proomlabel${on ? ' sel' : ''}" data-k="R:${r.id}" transform="translate(${r2(x)} ${r2(y)}) scale(${r2(mm)})">`;
  const lines = [];
  if (r.name) lines.push([r.name, 3, 'tx room']);
  lines.push([poly ? `${roomArea(poly).toFixed(1).replace('.', ',')} m²` : t('niet gesloten'), 2, 'tx rarea']);
  if (dev.length) lines.push([dev.join(' · '), 2, 'tx rinfl']);
  if (r.pub) lines.push([t('publiek toegankelijk'), 1.8, 'tx rinfl']);
  let yy = -((lines.length - 1) * 3.2) / 2;
  for (const [text, size, cls] of lines) { s += textSvg(0, yy, text, size, 'middle', cls); yy += 3.2; }
  if (!opts.print) s += `<rect class="hit" x="-12" y="${r2(-((lines.length) * 3.2) / 2)}" width="24" height="${r2(lines.length * 3.2)}"/>`;
  return s + '</g>';
}

/** Length of a polyline (cm). */
export const pathLength = (list) => list.reduce((sum, p, i) => (i ? sum + Math.hypot(p[0] - list[i - 1][0], p[1] - list[i - 1][1]) : 0), 0);

/** LED strip: a light grey profile along its path with warm yellow LEDs; the feed point is the first point. */
function stripSvg(sym, k, building, sel, opts) {
  const mm = 1 / k;
  const P = sym.pts;
  const d = pts(P);
  let s = `<g class="psym pstrip${sel ? ' sel' : ''}" data-k="A:${sym.id}">`;
  s += `<polyline points="${d}" class="strip-o" style="stroke-width:${r2(2 * mm)}"/>`;
  s += `<polyline points="${d}" class="strip-i" style="stroke-width:${r2(1.4 * mm)}"/>`;
  const step = 2.2 * mm; // one LED every 2.2 mm on paper
  let next = step / 2, acc = 0, dot = 0;
  // white strips warm yellow; RGB / RGBW strips red, green, blue (and white) in turn
  const colors = { r: '#ef4444', g: '#22c55e', b: '#3b82f6', w: '#f6b73c' };
  const cycle = (colorChannels(sym) || []).map((c) => colors[c]);
  for (let i = 1; i < P.length; i++) {
    const [ax, ay] = P[i - 1], [bx, by] = P[i];
    const len = Math.hypot(bx - ax, by - ay);
    for (; next <= acc + len; next += step) {
      const f = (next - acc) / len;
      const fill = cycle.length ? `;fill:${cycle[dot++ % cycle.length]};stroke:#6b7280` : '';
      s += `<circle class="strip-led" cx="${r2(ax + (bx - ax) * f)}" cy="${r2(ay + (by - ay) * f)}" r="${r2(0.42 * mm)}" style="stroke-width:${r2(0.12 * mm)}${fill}"/>`;
    }
    acc += len;
  }
  s += `<circle class="strip-feed" cx="${r2(P[0][0])}" cy="${r2(P[0][1])}" r="${r2(0.75 * mm)}"/>`;
  const c = building.circuits.find((x) => x.id === sym.circuit);
  const label = c ? `${c.name}${sym.n ?? ''}` : '';
  if (label || (opts.showRooms && sym.props?.room) || domKey(sym)) {
    s += `<g transform="translate(${r2(P[0][0])} ${r2(P[0][1])}) scale(${r2(mm)})">`;
    const parts = [];
    if (label) parts.push([label, traceColor(building, sym.circuit)]);
    const dom = domAddress(building, sym);
    if (dom) parts.push([dom, '#7c3aed']);
    s += labelBlock(parts, 1.8, -3);
    s += '</g>';
  }
  if (!opts.print) s += `<polyline class="hit" points="${d}" style="fill:none;stroke-width:${r2(4 * mm)}"/>`;
  return s + '</g>';
}

/** Labels of a symbol as small coloured blocks with white text (like the cable labels): [[text, colour]]. */
function labelBlock(parts, x, y) {
  let s = '';
  for (const [text, color] of parts) {
    const w = String(text).length * 1.3 + 1.4;
    s += `<rect x="${r2(x)}" y="${r2(y - 1.5)}" width="${r2(w)}" height="3" rx="0.6" style="fill:${color};stroke:none"/>`;
    s += textSvg(x + w / 2, y, text, 2, 'middle', 'tx plbltx', ' style="dominant-baseline:central;fill:#fff;font-weight:bold"');
    x += w + 0.6;
  }
  return s;
}

/** One installation symbol at plan position, drawn at paper size. */
function symbolSvg(sym, def, k, building, sel, opts) {
  if (def.strip && sym.pts?.length >= 2) return stripSvg(sym, k, building, sel, opts);
  const inv = 1 / k;
  const geom = geometry(def, sym);
  let shapes = '';
  for (const g of geom.graphics || []) shapes += g.t === 'text' ? textSvg(g.x, g.y, g.text, g.size, g.anchor) : shapeSvg(g);
  let s = `<g class="psym${sel ? ' sel' : ''}" data-k="A:${sym.id}" transform="translate(${r2(sym.x)} ${r2(sym.y)}) scale(${inv})">`;
  const c = building.circuits.find((x) => x.id === sym.circuit);
  const label = c ? `${c.name}${sym.n ?? ''}` : '';
  const parts = [];
  if (label) parts.push([label, traceColor(building, sym.circuit)]);
  const dom = domAddress(building, sym);
  if (dom) parts.push([dom, '#7c3aed']);
  s += labelBlock(parts, 3.4, -3.4);
  // the symbol on top of its label box
  s += `<g transform="rotate(${sym.rot || 0})">${shapes}</g>`;
  if (!opts.print) s += `<circle class="hit" cx="0" cy="0" r="4.5"/>`;
  return s + '</g>';
}

/**
 * Wall measurements on the floor plan, per wall section: from corner to corner, to the walls that end
 * against it (T-junction) and to the doors / windows, which get their own width (centre line, cm).
 */
function wallLensSvg(floor, k) {
  const mm = 1 / k;
  let s = '<g class="walllens">';
  const box = (w, t, len, cls) => {
    const path = wallPath(w, t - 0.5, t + 0.5, 0);
    const a = path[0], c = path[path.length - 1];
    const mid = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
    let ang = (Math.atan2(c[1] - a[1], c[0] - a[0]) * 180) / Math.PI;
    if (ang > 90.01 || ang <= -89.99) ang += 180;
    const label = String(Math.round(len));
    const fs = 2, bh = 3, bw = label.length * fs * 0.6 + 1.6;
    return `<g class="walllen${cls}" transform="translate(${r2(mid[0])} ${r2(mid[1])}) scale(${mm}) rotate(${r2(ang)})">`
      + `<rect class="walllenbox" x="${r2(-bw / 2)}" y="${-bh / 2}" width="${r2(bw)}" height="${bh}" rx="${bh * 0.35}"/>`
      + `<text class="tx walllentx" x="0" y="0" font-size="${fs}" text-anchor="middle" dominant-baseline="central">${label}</text></g>`;
  };
  for (const w of floor.walls) {
    if (isDivider(w)) continue;
    const len = wallGeom(w).len;
    if (len < 5) continue;
    const cls = w.kind === 'inner' ? ' inner' : '';
    // break points: the wall ends, walls ending against it, door / window edges
    const cuts = [0, len];
    for (const o of floor.walls) {
      if (o === w) continue;
      for (const q of [[o.x1, o.y1], [o.x2, o.y2]]) {
        const pr = projectOnWall(w, q[0], q[1]);
        if (Math.abs(pr.d) < 1 && pr.t > 0.5 && pr.t < len - 0.5) cuts.push(pr.t);
      }
    }
    const opens = floor.openings.filter((o) => o.wall === w.id && o.type !== 'passage')
      .map((o) => [Math.max(0, o.pos - o.width / 2), Math.min(len, o.pos + o.width / 2)]);
    for (const [a, c] of opens) cuts.push(a, c);
    const ts = [...new Set(cuts.map((x) => Math.round(x * 10) / 10))].sort((x, y) => x - y);
    for (let i = 0; i < ts.length - 1; i++) {
      const a = ts[i], c = ts[i + 1];
      if (c - a < 5) continue;
      const isOpen = opens.some(([oa, oc]) => a >= oa - 0.1 && c <= oc + 0.1);
      s += box(w, (a + c) / 2, c - a, isOpen ? ' open' : cls);
    }
  }
  return s + '</g>';
}

/**
 * Wall constraints (H, V, angle, length) as small purple badges beside the wall; red when the wall no
 * longer meets them. A click on a badge selects the wall.
 */
function consBadgesSvg(floor, k) {
  const mm = 1 / k;
  let s = '<g class="conbadges">';
  for (const w of floor.walls) {
    if (!hasCons(w)) continue;
    const label = consLabel(w);
    const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    if (len < 1) continue;
    const u = [(w.x2 - w.x1) / len, (w.y2 - w.y1) / len];
    // on the upper / left side of the wall, a quarter along it (the middle is for the measurements)
    let n = [-u[1], u[0]];
    if (n[1] > 0.01 || (Math.abs(n[1]) <= 0.01 && n[0] > 0)) n = [-n[0], -n[1]];
    const off = (w.t || 10) / 2 + (Math.abs(u[0]) > 0.7 ? 2.2 : 1.2 + label.length * 0.55) * mm;
    const t = Math.min(len / 4, 60 + len * 0.05);
    const p = [w.x1 + u[0] * t + n[0] * off, w.y1 + u[1] * t + n[1] * off];
    const fs = 1.8, bh = 2.8, bw = label.length * fs * 0.62 + 1.6;
    // always upright, so H and V read as letters
    s += `<g class="conbadge${consError(w) > 0.5 ? ' bad' : ''}" data-k="W:${w.id}" transform="translate(${r2(p[0])} ${r2(p[1])}) scale(${mm})">`
      + `<rect x="${r2(-bw / 2)}" y="${-bh / 2}" width="${r2(bw)}" height="${bh}" rx="${bh / 2}"/>`
      + `<text class="tx" x="0" y="0" font-size="${fs}" text-anchor="middle" dominant-baseline="central">${esc(label)}</text></g>`;
  }
  return s + '</g>';
}

export function planSvg(project, floorIdx, lib, opts = {}) {
  const b = project.building;
  const floor = b.floors[floorIdx];
  const k = planK(b);
  const sw = 0.25 / k; // 0.25 mm on paper
  const sel = opts.selection || new Set();
  const [ox, oy] = PLAN_ORIGIN;
  // installation plan (overlay): the floor drawing lighter, only the symbols / passages / notes of its type
  const layer = opts.layer || null;
  const disc = layer?.disc || null;
  const note = (x) => !x.plan || x.plan === layer?.id;
  const shown = (sym) => !!disc && symDisc(sym, lib.get(sym.sym)) === disc;
  let s = `<rect class="sheet" x="0" y="0" width="${SHEET.w}" height="${SHEET.h}"/>`;
  if (opts.grid) s += `<rect class="plangrid" x="${FRAME.area.x0}" y="${FRAME.area.y0}" width="${FRAME.area.x1 - FRAME.area.x0}" height="${FRAME.area.y1 - FRAME.area.y0}"/>`;
  s += frameSvg(project, { title: layer ? planTitle(b, layer) : floor.name }, floorIdx, b.floors.length);
  // scale note
  s += textSvg(FRAME.area.x1 - 3, FRAME.area.y1 - 4, t('Schaal 1:{n}', { n: b.scale }), 2.5, 'end', 'tx');
  s += `<g class="plan ink${disc ? ' under' : ''}" transform="translate(${ox} ${oy}) scale(${k})">`;
  // background image (traced drawing)
  const bg = floor.bg;
  const bgUrl = bg && (opts.imageUrl ? opts.imageUrl(bg.img) : project.images?.[bg.img]);
  if (bgUrl && !(opts.print && !bg.print) && bg.show !== false) {
    s += `<image class="pbg${bg.locked ? ' locked' : ''}${sel.has('B:bg') ? ' sel' : ''}"${bg.locked || opts.print ? '' : ' data-k="B:bg"'} href="${bgUrl}" x="${r2(bg.x)}" y="${r2(bg.y)}" width="${r2(bg.w)}" height="${r2(bg.h)}" preserveAspectRatio="none" opacity="${bg.opacity ?? 0.5}"/>`;
    if (sel.has('B:bg')) s += `<rect class="bgsel" x="${r2(bg.x)}" y="${r2(bg.y)}" width="${r2(bg.w)}" height="${r2(bg.h)}" style="stroke-width:${sw * 2}"/>`;
  }
  // rooms: a light colour under the walls; their labels come later, above everything
  const roomLabels = [];
  for (const r of floor.rooms || []) {
    const poly = roomPolygon(floor, r);
    const on = sel.has('R:' + r.id);
    if (poly) s += `<polygon class="proom${on ? ' sel' : ''}" data-k="R:${r.id}" points="${pts(poly)}" style="fill:${roomColor(r)};stroke-width:${sw * 2}"/>`;
    roomLabels.push([r, poly, on]);
  }
  for (const sh of floor.shapes || []) if (sh.type === 'area' && note(sh)) s += planShapeSvg(sh, k, sel.has('P:' + sh.id), opts);
  // walls
  // walls: first every wall with a black outline, then every wall filled on top of that, so the
  // outlines disappear where walls meet and the walls read as one whole
  // inner walls first, so outer walls cover them where they meet
  // room dividers: a dashed line under the walls (with a wide invisible stroke to pick them)
  for (const w of floor.walls) {
    if (!isDivider(w)) continue;
    const d = 'M' + wallPath(w, 0, wallGeom(w).len, 0).map((q) => q.map(r2).join(' ')).join('L');
    const on = sel.has('W:' + w.id);
    s += `<g class="divider${on ? ' sel' : ''}" data-k="W:${w.id}"><path class="divhit" d="${d}" style="stroke-width:${r2(3 / k)}"/>`
      + `<path d="${d}" style="stroke-width:${r2(sw * (on ? 3 : 2))};stroke-dasharray:${r2(3 / k)} ${r2(1.5 / k)}"/></g>`;
  }
  const polys = [...floor.walls].filter((w) => !isDivider(w)).sort((a, c) => (a.kind === 'inner' ? 0 : 1) - (c.kind === 'inner' ? 0 : 1)).map((w) => [w, pts(wallPolygon(w, floor.walls))]);
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
    if (o.type === 'passage' && (o.media || 'elec') !== planMedia(disc)) continue; // a wall passage only on the plan of its type
    if (w) s += openingSvg(o, w, sw, sel.has('O:' + o.id));
  }
  // underfloor heating pipes (floor heating plan): above the door gaps, under the stairs and symbols
  for (const sh of floor.shapes || []) if (sh.type === 'pipe' && note(sh)) s += pipeSvg(sh, k, sw, sel.has('P:' + sh.id), opts);
  for (const st of stairsFromBelow(b, floorIdx)) s += stairSvg(st, sw, false, true);
  for (const st of floorPassesFromBelow(b, floorIdx)) s += stairSvg(st, sw, false, true);
  for (const st of floor.stairs) if (!(b.hideFurn && isFurniture(st))) s += stairSvg(st, sw, sel.has('S:' + st.id));
  for (const sh of floor.shapes || []) if (sh.type === 'line' && note(sh)) s += planShapeSvg(sh, k, sel.has('P:' + sh.id), opts);
  for (const d of floor.dims || []) if (note(d)) s += dimSvg(d, k, sw, sel.has('D:' + d.id), opts);
  // floor plan (not the installation plans, not on paper): the length of every wall beside it
  if (!disc && !opts.print && b.wallLens !== false) s += wallLensSvg(floor, k);
  if (!disc && !opts.print && b.showCons !== false) s += consBadgesSvg(floor, k);
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
    if (!a || !c || !shown(a) || !shown(c)) continue;
    const kind = linkKind(lib.get(a.sym), lib.get(c.sym));
    const mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2;
    const dx = c.x - a.x, dy = c.y - a.y;
    const bend = 0.18;
    const qx = mx - dy * bend, qy = my + dx * bend;
    s += `<path class="plink${sel.has('L:' + l.id) ? ' sel' : ''}" data-k="L:${l.id}" d="M ${r2(a.x)} ${r2(a.y)} Q ${r2(qx)} ${r2(qy)} ${r2(c.x)} ${r2(c.y)}" style="stroke:${LINK_COLORS[kind]};stroke-width:${sw * 1.2}" stroke-dasharray="${sw * 6} ${sw * 4}"/>`;
    if (!opts.print) s += `<path class="hit" data-k="L:${l.id}" d="M ${r2(a.x)} ${r2(a.y)} Q ${r2(qx)} ${r2(qy)} ${r2(c.x)} ${r2(c.y)}" style="stroke-width:${sw * 10}"/>`;
  }
  if (disc === 'elec' && b.traceShow && b.traces?.floors?.[floor.id]) s += traceSvg(b, floor, k, sw);
  for (const sym of floor.symbols) {
    const def = lib.get(sym.sym);
    if (def && shown(sym)) s += symbolSvg(sym, def, k, b, sel.has('A:' + sym.id), opts);
  }
  for (const [r, poly, on] of roomLabels) s += roomLabelSvg(r, poly, k, on, opts);
  for (const sh of floor.shapes || []) if (sh.type === 'callout' && note(sh)) s += planShapeSvg(sh, k, sel.has('P:' + sh.id), opts);
  s += '</g>';
  return s;
}

export const TRACE_COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#c2255c', '#7048e8', '#0c8599', '#e67700', '#5c940d', '#ae3ec9', '#1864ab'];
const LOW_COLORS = { _data: '#0b7285', _bus: '#7c3aed' }; // data cable, bus cable
export const traceColor = (b, circuitId) => LOW_COLORS[circuitId] || TRACE_COLORS[Math.max(0, b.circuits.findIndex((c) => c.id === circuitId)) % TRACE_COLORS.length];

/** Cable traces: per circuit one colour; the run from the board is thicker and carries the circuit name. */
function traceSvg(b, floor, k, sw) {
  let s = '<g class="ptraces">';
  const names = new Map([...b.circuits.map((c) => [c.id, c.name]), ['_data', t('Data')], ['_bus', t('Bus')]]);
  const list = b.traces.floors[floor.id];
  for (const tr of list) {
    const col = traceColor(b, tr.c);
    const dash = tr.c === '_data' || tr.c === '_bus' ? `;stroke-dasharray:${r2(3 / k)} ${r2(1.2 / k)};stroke-linecap:butt` : '';
    s += `<polyline class="ptrace" points="${pts(tr.pts)}" style="stroke:${col};stroke-width:${sw * (tr.home ? 3.2 : 2)}${dash}"/>`;
  }
  // circuit name on every run from the board: on a long piece, away from the labels already placed
  const placed = [];
  const syms = floor.symbols.map((x) => [x.x, x.y]);
  for (const tr of list) {
    if (!tr.home || tr.pts.length < 2) continue;
    let best = null;
    for (let i = 1; i < tr.pts.length; i++) {
      const [ax, ay] = tr.pts[i - 1], [bx, by] = tr.pts[i];
      const len = Math.hypot(bx - ax, by - ay);
      if (len < 20) continue;
      for (const f of [0.25, 0.5, 0.75]) {
        const x = ax + (bx - ax) * f, y = ay + (by - ay) * f;
        const free = Math.min(300, ...placed.map(([px, py]) => Math.hypot(px - x, py - y)));
        const clearSym = Math.min(60, ...syms.map(([px, py]) => Math.hypot(px - x, py - y)));
        const score = free * 2 + Math.min(len, 300) * 0.3 + clearSym * 4;
        if (!best || score > best.score) best = { score, x, y };
      }
    }
    if (!best) continue;
    placed.push([best.x, best.y]);
    const name = names.get(tr.c) || '';
    const w = Math.max(5.2, name.length * 1.5 + 2);
    s += `<g transform="translate(${r2(best.x)} ${r2(best.y)}) scale(${1 / k})"><rect x="${r2(-w / 2)}" y="-1.7" width="${r2(w)}" height="3.4" rx="0.8" style="fill:${traceColor(b, tr.c)}"/>${textSvg(0, 0, name, 2.2, 'middle', 'tx ptracetx', ' style="dominant-baseline:central"')}</g>`;
  }
  return s + '</g>';
}

/** Path through the points with every corner rounded (radius at most half of the pieces beside it). */
export function roundedPath(P, rad) {
  const q = P.filter((p, i) => !i || Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]) > 0.01);
  if (q.length < 3) return 'M' + q.map((p) => p.map(r2).join(' ')).join('L');
  let d = `M${r2(q[0][0])} ${r2(q[0][1])}`;
  for (let i = 1; i < q.length - 1; i++) {
    const [ax, ay] = q[i - 1], [bx, by] = q[i], [cx, cy] = q[i + 1];
    const l1 = Math.hypot(bx - ax, by - ay), l2 = Math.hypot(cx - bx, cy - by);
    const r = Math.min(rad, l1 / 2, l2 / 2);
    const p1 = [bx - ((bx - ax) / l1) * r, by - ((by - ay) / l1) * r], p2 = [bx + ((cx - bx) / l2) * r, by + ((cy - by) / l2) * r];
    d += `L${r2(p1[0])} ${r2(p1[1])}Q${r2(bx)} ${r2(by)} ${r2(p2[0])} ${r2(p2[1])}`;
  }
  return d + `L${r2(q.at(-1)[0])} ${r2(q.at(-1)[1])}`;
}

/** A drawn underfloor heating pipe: rounded bends, the loop's colour, its name and length at the start. */
function pipeSvg(sh, k, sw, sel, opts) {
  const col = sh.color || '#e03131';
  const d = roundedPath(sh.pts, (sh.r || 15) / 2);
  let s = `<g class="ppipe${sel ? ' sel' : ''}" data-k="P:${sh.id}"><path class="ppipel" d="${d}" style="stroke:${col};stroke-width:${r2(sw * 1.6)}"/>`;
  if (!opts.print) s += `<path class="hit" d="${d}" style="fill:none;stroke-width:${r2(Math.max(sw * 2, 3 / k))}"/>`;
  if (sh.name && sh.pts.length) {
    const len = (Math.round(pathLength(sh.pts) / 10) / 10).toFixed(1).replace('.', ',');
    const text = `${sh.name} · ${len} m`;
    // on the middle of the longest straight piece (not on the manifold where all pipes start)
    let best = 0, at = sh.pts[0];
    for (let i = 1; i < sh.pts.length; i++) {
      const [ax, ay] = sh.pts[i - 1], [bx, by] = sh.pts[i];
      const l = Math.hypot(bx - ax, by - ay);
      if (l > best) { best = l; at = [(ax + bx) / 2, (ay + by) / 2]; }
    }
    const [x, y] = sh.label || at;
    const w = text.length * 1.3 + 2;
    s += `<g transform="translate(${r2(x)} ${r2(y)}) scale(${1 / k})"><rect x="${r2(-w / 2)}" y="-4.8" width="${r2(w)}" height="3.4" rx="0.8" class="pheatbox" style="stroke:${col}"/>${textSvg(0, -3.1, text, 2.1, 'middle', 'tx pheattx', ` style="fill:${col}"`)}</g>`;
  }
  return s + '</g>';
}

export const PLAN_STYLE = `
.plan .walloutline polygon{fill:#000;stroke:#000;stroke-linejoin:miter}.plan .wall{fill:#9b9b9b;stroke:none}.plan .wall.inner{fill:#bdbdbd}
.plan .gap{fill:#fff;stroke:none}.plan .stairbox{fill:#fff}.plan .roofarrow{fill:#222;stroke:none}.plan .floorpass{fill:#fff}.plan .floorpass.ghost{fill:none}.plan .furn line,.plan .furn rect,.plan .furn ellipse,.plan .furn polygon,.plan .furn polyline{stroke:#4b5563}.plan .furnbox{fill:#fff}.plan .furnin{fill:none}.plan .furntx{font-family:sans-serif;fill:#4b5563;stroke:none}.plan .rooftx{font-family:sans-serif;fill:#333;stroke:#fff;paint-order:stroke}
.plan .plink{fill:none}.plan polyline{fill:none}.plan polygon.ol{stroke:#000}.plan .strip-o{stroke:#8b939c;fill:none;stroke-linecap:round;stroke-linejoin:round}.plan .strip-i{stroke:#eceff3;fill:none;stroke-linecap:round;stroke-linejoin:round}.plan .strip-led{fill:#f6b73c;stroke:#c98a0b}.plan .strip-feed{fill:#374151;stroke:none}.room{font-weight:bold}.clabel{font-weight:bold;fill:#c2410c}.croom{fill:#555}.plan .proom{stroke:#94a3b8;stroke-dasharray:2 1}.rarea{fill:#475569}.rinfl{fill:#0f766e;font-weight:bold}.cdom{fill:#7c3aed;font-weight:bold}
.plan.under .walloutline polygon{fill:#9aa1aa;stroke:#9aa1aa}.plan.under .wall{fill:#d5d8dc}.plan.under .wall.inner{fill:#e2e4e7}.plan.under .proom{opacity:.45}.plan.under .stair,.plan.under .opening:not(:has(.passage)),.plan.under .divider{opacity:.55}
.plan .ppipel{fill:none;stroke-linecap:round;stroke-linejoin:round}.plan .ppipe.sel .ppipel{filter:drop-shadow(0 0 1.5px #1f6feb)}.plan .pheatbox{fill:#fff;stroke:#c92a2a;stroke-width:.3}.plan .pheattx{fill:#c92a2a;font-weight:bold;dominant-baseline:central}
.plan .ptraces{pointer-events:none}.plan .ptrace{fill:none;stroke-linecap:round;stroke-linejoin:round;opacity:.8}.plan .ptracetx{fill:#fff;font-weight:bold;dominant-baseline:central}
`;

/** A floor plan (layer null) or an installation plan as a complete SVG (print, export). */
export function standalonePlanSvg(project, floorIdx, lib, layer = null) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SHEET.w} ${SHEET.h}" width="${SHEET.w}mm" height="${SHEET.h}mm"><style>${SVG_STYLE}${PLAN_STYLE}</style>${planSvg(project, floorIdx, lib, { print: true, layer })}</svg>`;
}

