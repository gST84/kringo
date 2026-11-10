// Underfloor heating generator. Per heated room the floor is filled with loops laid as a counter-flow
// spiral ("slakkenhuis"): the supply runs inward at twice the pipe spacing, turns in the middle and the
// return runs back out between it, so warm and cooler pipe alternate. A loop is never longer than the
// room's maximum (feed pipes to the manifold included); a larger room gets several loops.
// Main pipes run from the boiler to every manifold; all pipes only pass walls through doors and
// wall passages for CV ('passage' openings with media 'cv').
import { t } from '../i18n.js';
import { pathLength } from './render.js';
import { roomArea, roomPolygon } from './rooms.js';
import { bundle, CELL, centre, raster, route, routeLen } from './traces.js';

export const HEAT_DEFAULTS = {
  spacing: 15, // cm between pipes
  maxLen: 100, // m per loop, feed pipes included
  margin: 10, // cm from the wall to the first pipe
  feedGap: 10, // cm between feed pipes (each its own lane, except at the manifold)
  minArea: 0.5, // m², smaller pieces of a room stay unheated (bigger ones are covered by growing neighbours)
};
export const heatCfg = (b) => ({ ...HEAT_DEFAULTS, ...(b.heatCfg || {}) });
/** Settings of a room (its own values over the project defaults). */
export const roomHeat = (b, r) => {
  const c = heatCfg(b), u = r.ufh || {};
  return { on: !!u.on, spacing: +u.spacing || c.spacing, maxLen: +u.maxLen || c.maxLen, collector: u.collector || '' };
};

export const SUPPLY = '#e03131', RETURN = '#1971c2';
const RC = 5; // cm, raster of a room's floor

const inPoly = (x, y, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const segDist = (x, y, [ax, ay], [bx, by]) => {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  const k = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
  return Math.hypot(x - ax - dx * k, y - ay - dy * k);
};

/** Floor area already taken by the loops of other rooms (open plan: rooms that overlap). */
export function newClaim(polys, pad = 50) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of polys.flat()) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  x0 = Math.floor((x0 - pad) / RC) * RC; y0 = Math.floor((y0 - pad) / RC) * RC;
  const W = Math.ceil((x1 + pad - x0) / RC), H = Math.ceil((y1 + pad - y0) / RC);
  return W > 0 && H > 0 && W * H < 4e6 ? { x0, y0, W, H, grid: new Uint8Array(W * H) } : null;
}
const claimIdx = (C, x, y) => {
  const i = Math.floor((x - C.x0) / RC), j = Math.floor((y - C.y0) / RC);
  return i >= 0 && j >= 0 && i < C.W && j < C.H ? j * C.W + i : -1;
};

/**
 * The heated floor of a room as rectangles (cm) that together cover it: the room is rasterised (keeping
 * `margin` from the walls and from floor already claimed by other rooms), the largest free rectangle is
 * taken again and again, and every rectangle then grows into the floor left over beside it. The edges of
 * the rectangles are the outer pipes: neighbouring rectangles stay exactly `gap` (the pipe spacing)
 * apart, so the floor between them is heated too. The rectangles are marked in `claim`.
 */
export function floorRects(poly, margin, minSide, minArea, claim = null, gap = 15, seeds = null) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (claim) { x0 = claim.x0 + Math.floor((x0 - claim.x0) / RC) * RC; y0 = claim.y0 + Math.floor((y0 - claim.y0) / RC) * RC; }
  const W = Math.ceil((x1 - x0) / RC), H = Math.ceil((y1 - y0) / RC);
  if (W <= 0 || H <= 0 || W * H > 4e5) return [];
  const free = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const cx = x0 + (i + 0.5) * RC, cy = y0 + (j + 0.5) * RC;
    if (!inPoly(cx, cy, poly)) continue;
    if (claim) { const c = claimIdx(claim, cx, cy); if (c >= 0 && claim.grid[c]) continue; }
    let d = Infinity;
    for (let k = 0; k < poly.length && d >= margin; k++) d = Math.min(d, segDist(cx, cy, poly[k], poly[(k + 1) % poly.length]));
    if (d >= margin - RC / 2) free[j * W + i] = 1;
  }
  const g = Math.max(1, Math.ceil(gap / RC)); // cells between the edges of two rectangles
  const cover = new Uint8Array(W * H); // how many rectangles (with their gap) keep a cell
  const mark = (r, v) => {
    for (let j = Math.max(0, r.j0 - g); j < Math.min(H, r.j1 + g); j++) for (let i = Math.max(0, r.i0 - g); i < Math.min(W, r.i1 + g); i++) cover[j * W + i] += v;
  };
  const rects = [];
  const hist = new Int32Array(W);
  const minC = Math.ceil(minSide / RC);
  // existing rectangles (a later round): keep them and only let them grow
  if (seeds) for (const q of seeds) {
    const r = { i0: Math.round((q.x0 - x0) / RC), i1: Math.round((q.x1 - x0) / RC), j0: Math.round((q.y0 - y0) / RC), j1: Math.round((q.y1 - y0) / RC) };
    r.area = (r.i1 - r.i0) * (r.j1 - r.j0);
    rects.push(r);
    mark(r, 1);
  }
  for (let guard = seeds ? 40 : 0; guard < 40; guard++) {
    // largest rectangle of free cells (histogram per row)
    hist.fill(0);
    let best = null;
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) hist[i] = free[j * W + i] && !cover[j * W + i] ? hist[i] + 1 : 0;
      const stack = [];
      for (let i = 0; i <= W; i++) {
        const hh = i < W ? hist[i] : 0;
        let start = i;
        while (stack.length && stack.at(-1)[1] >= hh) {
          const [st, sh] = stack.pop();
          // only rectangles that can hold a loop: a slightly smaller but wider one beats a thin strip
          const w = i - st, area = Math.min(sh, w) >= minC ? sh * w : 0;
          if (area && (!best || area > best.area)) best = { area, i0: st, i1: i, j0: j - sh + 1, j1: j + 1 };
          start = st;
        }
        stack.push([start, hh]);
      }
    }
    if (!best || (best.area * RC * RC) / 1e4 < minArea) break;
    rects.push(best);
    mark(best, 1);
  }
  // grow every rectangle into the free floor beside it (strips too narrow for a loop of their own)
  const ok = (r, i0, i1, j0, j1) => {
    if (i0 < 0 || j0 < 0 || i1 > W || j1 > H || i1 <= i0 || j1 <= j0) return false;
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
      const c = j * W + i;
      const own = i >= r.i0 - g && i < r.i1 + g && j >= r.j0 - g && j < r.j1 + g ? 1 : 0;
      if (!free[c] || cover[c] - own > 0) return false;
    }
    return true;
  };
  for (let changed = true, guard = 0; changed && guard < 400; guard++) {
    changed = false;
    for (const r of rects) {
      const tries = [[r.i0 - 1, r.i0, r.j0, r.j1, 'i0', -1], [r.i1, r.i1 + 1, r.j0, r.j1, 'i1', 1], [r.i0, r.i1, r.j0 - 1, r.j0, 'j0', -1], [r.i0, r.i1, r.j1, r.j1 + 1, 'j1', 1]];
      for (const [a0, a1, b0, b1, k, d] of tries) {
        if (!ok(r, a0, a1, b0, b1)) continue;
        mark(r, -1); r[k] += d; mark(r, 1);
        changed = true;
      }
    }
  }
  const out = rects.map((r) => ({ x0: x0 + r.i0 * RC, y0: y0 + r.j0 * RC, x1: x0 + r.i1 * RC, y1: y0 + r.j1 * RC }));
  // the floor of other rooms keeps the pipe spacing from these loops too
  if (claim) for (const q of out) for (let y = q.y0 - gap + RC / 2; y < q.y1 + gap; y += RC) for (let x = q.x0 - gap + RC / 2; x < q.x1 + gap; x += RC) {
    const c = claimIdx(claim, x, y);
    if (c >= 0) claim.grid[c] = 1;
  }
  return out;
}

/** Offset of a right-angled polyline by d to the right of its direction (inward for a clockwise spiral). */
function offsetOrtho(A, d) {
  const n = (k) => {
    const dx = Math.sign(A[k + 1][0] - A[k][0]), dy = Math.sign(A[k + 1][1] - A[k][1]);
    return [-dy * d, dx * d];
  };
  const out = [];
  for (let k = 0; k < A.length; k++) {
    if (k === 0) { const m = n(0); out.push([A[0][0] + m[0], A[0][1] + m[1]]); continue; }
    if (k === A.length - 1) { const m = n(k - 1); out.push([A[k][0] + m[0], A[k][1] + m[1]]); continue; }
    const m1 = n(k - 1), m2 = n(k);
    out.push([A[k][0] + m1[0] + m2[0], A[k][1] + m1[1] + m2[1]]);
  }
  return out;
}

/**
 * Counter-flow spiral in a rectangle, entering at corner `corner` (0 top left, 1 top right,
 * 2 bottom right, 3 bottom left): {supply, ret} polylines; supply starts at the corner, ret ends
 * next to it (`s` further inside).
 */
export function spiral(q, s, corner = 0) {
  // the middle only works out for some sizes: first try a different spacing (−25 … +35 %), so the loop
  // still covers the whole rectangle without a cold strip; only then shrink the far sides a little
  const tries = [];
  const shrinks = [0, 2.5, 5, 7.5, 10, 15, 20, 30].filter((d) => d <= 2 * s);
  const spacings = [];
  for (let ds = -0.25 * s; ds <= 0.35 * s + 1e-9; ds += 0.5) spacings.push(Math.round(ds * 2) / 2);
  for (const dw of shrinks) for (const dh of shrinks) for (const ds of spacings) tries.push([dw, dh, ds]);
  // no shrink and the nominal spacing first; a narrow strip may need a clearly wider spacing to be covered
  tries.sort((a, b) => a[0] + a[1] - b[0] - b[1] || Math.abs(a[2]) - Math.abs(b[2]));
  let first = null;
  for (const [dw, dh, ds] of tries) {
    const sp = rawSpiral({ x0: q.x0, y0: q.y0, x1: q.x1 - dw, y1: q.y1 - dh }, s + ds, corner, q);
    if (!sp) continue;
    first ||= sp;
    if (cleanLoop(sp, s + ds, { x0: q.x0, y0: q.y0, x1: q.x1 - dw, y1: q.y1 - dh })) { sp.s = s + ds; return sp; }
  }
  if (first) first.s = s;
  return first;
}

/**
 * True when no two parallel pieces of the loop are closer than the pipe spacing, no piece is tiny, and
 * every point of the rectangle `q` lies within one spacing of a pipe (no cold strip inside the loop).
 */
function cleanLoop(sp, s, q = null) {
  if (q && !covers(sp, q, s)) return false;
  const L = [...sp.supply, ...sp.ret];
  const segs = [];
  for (let i = 0; i + 1 < L.length; i++) segs.push([L[i], L[i + 1]]);
  for (const [a, b] of segs) { const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > 0.01 && l < s * 0.5) return false; }
  for (let i = 0; i < segs.length; i++) for (let j = i + 2; j < segs.length; j++) {
    const [a, b] = segs[i], [c, d] = segs[j];
    const hi = a[1] === b[1], hj = c[1] === d[1];
    if (hi !== hj) continue;
    const k = hi ? 0 : 1, o = 1 - k;
    const ov = Math.min(Math.max(a[k], b[k]), Math.max(c[k], d[k])) - Math.max(Math.min(a[k], b[k]), Math.min(c[k], d[k]));
    if (ov > 1 && Math.abs(a[o] - c[o]) < s - 0.5) return false;
  }
  return true;
}

/** Is every point of rectangle q within about one spacing of the pipes of the loop? (5 cm raster, chessboard distance) */
function covers(sp, q, s) {
  const P = [...sp.supply, ...sp.ret];
  // measured in the loop's own box (a mirrored loop lies elsewhere in the full rectangle; same size as q)
  let ox = Infinity, oy = Infinity;
  for (const [x, y] of P) { ox = Math.min(ox, x); oy = Math.min(oy, y); }
  const C = 5, W = Math.max(1, Math.round((q.x1 - q.x0) / C)), H = Math.max(1, Math.round((q.y1 - q.y0) / C));
  const d = new Int16Array((W + 1) * (H + 1)).fill(-1);
  const queue = [];
  const put = (x, y) => {
    const i = Math.round((x - ox) / C), j = Math.round((y - oy) / C);
    if (i < 0 || j < 0 || i > W || j > H) return;
    const k = j * (W + 1) + i;
    if (d[k] < 0) { d[k] = 0; queue.push(k); }
  };
  for (let k = 0; k + 1 < P.length; k++) {
    const [ax, ay] = P[k], [cx, cy] = P[k + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(cx - ax, cy - ay) / C));
    for (let t = 0; t <= n; t++) put(ax + ((cx - ax) * t) / n, ay + ((cy - ay) * t) / n);
  }
  for (let h = 0; h < queue.length; h++) {
    const k = queue[h], i = k % (W + 1), j = (k - i) / (W + 1);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni > W || nj > H) continue;
      const nk = nj * (W + 1) + ni;
      if (d[nk] < 0) { d[nk] = d[k] + 1; queue.push(nk); }
    }
  }
  const lim = Math.max(1, Math.floor((s * 0.7) / C)); // a pipe within ~0.7 spacing of every point
  for (let k = 0; k < d.length; k++) if (d[k] > lim) return false;
  return true;
}

/** The spiral itself in the rectangle {x0 … y1}; `frame` is the rectangle used for the mirroring (the full one). */
function rawSpiral({ x0, y0, x1, y1 }, s, corner, frame) {
  const p = 2 * s;
  let l = x0, top = y0, r = x1, b = y1;
  const A = [[l, top]];
  for (let dir = 0, guard = 0; guard < 500; guard++, dir = (dir + 1) % 4) {
    const [cx, cy] = A.at(-1);
    const nx = dir === 0 ? r : dir === 2 ? l : cx;
    const ny = dir === 1 ? b : dir === 3 ? top : cy; // top was already moved in by one pitch
    const len = Math.abs(nx - cx) + Math.abs(ny - cy);
    // a last, shorter piece into the middle when it fits (else the middle stays empty)
    if (len < p + 0.5) { if (len >= 1.5 * s && A.length > 2) A.push([nx, ny]); break; }
    A.push([nx, ny]);
    if (dir === 0) top += p; else if (dir === 1) r -= p; else if (dir === 2) b -= p; else l += p;
  }
  if (A.length < 2) return null;
  const B = offsetOrtho(A, s).reverse();
  const mx = corner === 1 || corner === 2, my = corner === 2 || corner === 3;
  const tf = ([x, y]) => [Math.round((mx ? frame.x0 + frame.x1 - x : x) * 10) / 10, Math.round((my ? frame.y0 + frame.y1 - y : y) * 10) / 10];
  return { supply: A.map(tf), ret: B.map(tf) };
}

/** Splits a rectangle into n strips across its longer side (or along `axis` 'x' / 'y'), `s` apart (pipe spacing between loops). */
const splitRect = (q, n, s = 0, axis = null) => {
  const out = [];
  const horiz = axis ? axis === 'x' : q.x1 - q.x0 >= q.y1 - q.y0;
  const g = n > 1 ? s / 2 : 0;
  for (let k = 0; k < n; k++) {
    const a = k ? g : 0, z = k < n - 1 ? g : 0;
    if (horiz) out.push({ ...q, x0: q.x0 + ((q.x1 - q.x0) * k) / n + a, x1: q.x0 + ((q.x1 - q.x0) * (k + 1)) / n - z });
    else out.push({ ...q, y0: q.y0 + ((q.y1 - q.y0) * k) / n + a, y1: q.y0 + ((q.y1 - q.y0) * (k + 1)) / n - z });
  }
  return out;
};
const corners = (q) => [[q.x0, q.y0], [q.x1, q.y0], [q.x1, q.y1], [q.x0, q.y1]];
/** Does the segment a–b run through the inside of rectangle q (more than `m` cm from its edges)? */
function segInRect(a, b, q, m) {
  const x0 = q.x0 + m, y0 = q.y0 + m, x1 = q.x1 - m, y1 = q.y1 - m;
  if (x1 <= x0 || y1 <= y0) return false;
  // right-angled pieces: clip the box of the segment against the inner rectangle
  const sx0 = Math.min(a[0], b[0]), sx1 = Math.max(a[0], b[0]), sy0 = Math.min(a[1], b[1]), sy1 = Math.max(a[1], b[1]);
  return sx1 > x0 && sx0 < x1 && sy1 > y0 && sy0 < y1;
}
/** Corner of a rectangle (0 … 3) nearest to a point. */
const nearestCorner = (q, p) => {
  const cs = corners(q);
  let best = 0;
  cs.forEach((c, i) => { if (Math.hypot(c[0] - p[0], c[1] - p[1]) < Math.hypot(cs[best][0] - p[0], cs[best][1] - p[1])) best = i; });
  return best;
};
/** Where a probe route first reaches the room (its first raster cell inside the room polygon). */
function entryPoint(R, probe, poly) {
  if (!R || !probe) return null;
  for (const c of probe.cells) {
    const [x, y] = centre(R, c);
    if (inPoly(x, y, poly)) return [x, y];
  }
  return null;
}

/** Fingerprint of everything the heating plan depends on (to see that it is out of date). */
export function heatKey(b, lib) {
  const parts = [JSON.stringify(heatCfg(b))];
  for (const f of b.floors) {
    parts.push(f.id, f.walls.map((w) => `${w.x1},${w.y1},${w.x2},${w.y2},${w.t},${w.cx ?? ''},${w.cy ?? ''},${w.kind || ''}`).join(';'));
    parts.push((f.openings || []).map((o) => `${o.wall},${o.type},${o.pos},${o.width},${o.media || ''}`).join(';'));
    parts.push((f.rooms || []).map((r) => `${r.id},${JSON.stringify(r.ufh || {})},${JSON.stringify(r.pts || r.seed || '')}`).join(';'));
    parts.push(f.symbols.filter((s) => lib.get(s.sym)?.hvac).map((s) => `${s.id},${s.sym},${s.x},${s.y}`).join(';'));
  }
  let hsh = 0;
  const str = parts.join('|');
  for (let i = 0; i < str.length; i++) hsh = (hsh * 31 + str.charCodeAt(i)) | 0;
  return String(hsh);
}

/** Name of a manifold on the plan: its description, or VV1, VV2 … in plan order. */
export function collectorNames(b, lib) {
  const m = new Map();
  let n = 0;
  for (const f of b.floors) for (const s of f.symbols) if (lib.get(s.sym)?.hvac === 'collector') m.set(s.id, s.props?.desc || `VV${++n}`);
  return m;
}

/**
 * Generates the heating plan and stores it in building.heat:
 * { key, floors: {floorId: [{t: 'main' | 'feed' | 'loop', role: 's' | 'r', pts, label?}]},
 *   loops: [{collector, name, n, room, floor, area, spacing, coil, feed, total, max}], collectors: [...], warnings }.
 */
export function generateHeating(b, lib) {
  const warnings = [];
  const floors = {};
  const loops = [];
  const collectors = [];
  const names = collectorNames(b, lib);
  const hc = heatCfg(b);
  const all = [];
  for (const f of b.floors) for (const s of f.symbols) { const hv = lib.get(s.sym)?.hvac; if (hv) all.push({ s, floor: f, hv }); }
  const boilers = all.filter((x) => x.hv === 'boiler');
  const cols = all.filter((x) => x.hv === 'collector');
  // two rasters per floor: 10 cm for estimates and the main pipes, 5 cm for the feed pipes (own lane each)
  const rasters = new Map();
  const rasterOf = (f, cell = CELL) => {
    const key = f.id + ':' + cell;
    if (!rasters.has(key)) rasters.set(key, raster(f, f.symbols.map((s) => [s.x, s.y]), 'cv', cell, [0, 20])); // feed pipes hug the walls
    return rasters.get(key);
  };
  const draw = (f) => (floors[f.id] ||= []);

  if (!cols.length) warnings.push(t('Geen collector op het plan: plaats een collector (Technieken › CV en sanitair).'));

  // rooms with underfloor heating, each assigned to a manifold
  const jobs = [];
  for (const f of b.floors) for (const r of f.rooms || []) {
    const cfg = roomHeat(b, r);
    if (!cfg.on) continue;
    const poly = roomPolygon(f, r);
    if (!poly) { warnings.push(t('{r}: de ruimte is niet gesloten.', { r: r.name || '?' })); continue; }
    let col = cols.find((c) => c.s.id === cfg.collector);
    if (!col) {
      const here = cols.filter((c) => c.floor === f);
      const [cx, cy] = poly.reduce((a, p) => [a[0] + p[0] / poly.length, a[1] + p[1] / poly.length], [0, 0]);
      col = here.sort((p, q) => Math.hypot(p.s.x - cx, p.s.y - cy) - Math.hypot(q.s.x - cx, q.s.y - cy))[0];
    }
    if (!col) { warnings.push(t('{r}: geen collector op deze verdieping.', { r: r.name || '?' })); continue; }
    if (col.floor !== f) { warnings.push(t('{r}: de collector staat op een andere verdieping.', { r: r.name || '?' })); continue; }
    jobs.push({ f, r, poly, cfg, col });
  }

  for (const f of b.floors) {
    const fjobs = jobs.filter((j) => j.f === f).sort((p, q) => roomArea(p.poly) - roomArea(q.poly));
    const fcols = cols.filter((c) => c.floor === f);
    if (!fjobs.length || !fcols.length) continue;
    // pass 1: lay out and route; then keep strips free around the feed pipes and lay out again, so the
    // loops lie around the feed pipes instead of under them (the feed pipes heat those strips)
    // plan the feed pipes first: per room the way from its manifold to the room's entry, and about how
    // many loops it needs; around the pipes that pass through a room a strip stays free (the pipes heat
    // it), and in a room with several loops a strip along the wall of its entry for their feed pipes
    const plan = planCorridors(f, fjobs, fcols);
    let res = layoutFloor(f, fjobs, fcols, plan.claim, new Map(), plan.prefer);
    // a loop that came out too long (its feed pipes made a detour): one loop more in that piece of floor
    const bump = new Map();
    for (let i = 0; i < 3 && res.over.size; i++) {
      for (const k of res.over) bump.set(k, (bump.get(k) || 0) + 1);
      res = layoutFloor(f, fjobs, fcols, plan.claim, bump, plan.prefer);
    }
    // the reserved strips were an estimate: keep only what the feed pipes really take, let the loops grow
    // into the rest and lay the pipes again on (nearly) the same place
    if (plan.claim && res.feedCells.length) {
      const keep = Math.max(...fjobs.map((j) => j.cfg.spacing));
      const tight = { ...plan.claim, grid: new Uint8Array(plan.claim.grid.length) };
      for (const [x, y] of [...res.feedCells.map((c) => centre(res.Rf, c)), ...(plan.mainPts || []).map((p) => [...p, 'main'])]) {
        if (res.nearCol(x, y)) continue;
        for (let dy = -keep; dy <= keep; dy += RC) for (let dx = -keep; dx <= keep; dx += RC) {
          const k = claimIdx(tight, x + dx, y + dy);
          if (k >= 0) tight.grid[k] = 1;
        }
      }
      const seeds = new Map(fjobs.map((j) => [j, j.rects.map((q) => ({ ...q }))]));
      const tightLayout = (sd) => {
        let r2 = layoutFloor(f, fjobs, fcols, tight, bump, res.feedCells, 0.1, sd);
        const bump2 = new Map(bump);
        for (let i = 0; i < 3 && r2.over.size; i++) {
          for (const k of r2.over) bump2.set(k, (bump2.get(k) || 0) + 1);
          r2 = layoutFloor(f, fjobs, fcols, tight, bump2, res.feedCells, 0.1, sd);
        }
        return r2;
      };
      // two ways to use the freed floor: divide it again, or let the loops grow into it; keep the
      // layout with the least cold floor (real problems first; a few loops more than outlets is fine)
      const bad = (r) => r.over.size + r.warnings.length - (r.soft || 0);
      let best = res;
      res.cold = coldCells(res, fjobs);
      for (const cand of [tightLayout(null), tightLayout(seeds)]) {
        cand.cold = coldCells(cand, fjobs);
        if (bad(cand) < bad(best) || (bad(cand) === bad(best) && cand.cold < best.cold)) best = cand;
      }
      res = best;
    }
    for (const w of res.warnings) warnings.push(w);
    for (const it of res.draw) draw(f).push(it);
    loops.push(...res.loops);
    collectors.push(...res.collectors);
  }

  /** Heated floor (5 cm cells, away from the walls) farther than 15 cm from any pipe of a layout. */
  function coldCells(lay, fjobs) {
    const Rf = lay.Rf;
    if (!Rf) return 0;
    const d = new Int16Array(Rf.W * Rf.H).fill(-1);
    const queue = [];
    const put = (x, y) => {
      const i = Math.floor((x - Rf.x0) / RC), j = Math.floor((y - Rf.y0) / RC);
      if (i < 0 || j < 0 || i >= Rf.W || j >= Rf.H) return;
      const k = j * Rf.W + i;
      if (d[k] < 0) { d[k] = 0; queue.push(k); }
    };
    for (const it of lay.draw) {
      if (!it.pts) continue;
      for (let k = 0; k + 1 < it.pts.length; k++) {
        const [ax, ay] = it.pts[k], [bx, by] = it.pts[k + 1];
        const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / RC));
        for (let t = 0; t <= n; t++) put(ax + ((bx - ax) * t) / n, ay + ((by - ay) * t) / n);
      }
    }
    const lim = 3; // cells (15 cm)
    for (let h = 0; h < queue.length; h++) {
      const k = queue[h];
      if (d[k] >= lim + 1) continue;
      const i = k % Rf.W, j = (k - i) / Rf.W;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= Rf.W || nj >= Rf.H) continue;
        const nk = nj * Rf.W + ni;
        if (d[nk] < 0) { d[nk] = d[k] + 1; queue.push(nk); }
      }
    }
    let cold = 0;
    for (const j of fjobs) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of j.poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      for (let y = y0 + 15; y < y1 - 15; y += RC) for (let x = x0 + 15; x < x1 - 15; x += RC) {
        if (!inPoly(x, y, j.poly)) continue;
        const i = Math.floor((x - Rf.x0) / RC), jj = Math.floor((y - Rf.y0) / RC);
        const k = jj * Rf.W + i;
        if (d[k] < 0 || d[k] > lim) cold++;
      }
    }
    return cold;
  }

  /** Strips kept free for feed pipes on one floor: {claim (5 cm grid), prefer (cells of the 5 cm raster)}. */
  function planCorridors(f, fjobs, fcols) {
    const R = rasterOf(f, CELL), Rf = rasterOf(f, RC);
    const claim = newClaim(fjobs.map((j) => j.poly));
    if (!R || !Rf || !claim) return { claim, prefer: null };
    // walls are cheap for feed pipes, the middle of heated rooms is expensive
    R.pen = new Float32Array(R.W * R.H).fill(1);
    for (const j of fjobs) for (let c = 0; c < R.grid.length; c++) {
      if (R.nearWall[c] || R.pen[c] > 1) continue;
      const [x, y] = centre(R, c);
      if (inPoly(x, y, j.poly)) R.pen[c] = 12;
    }
    const pipes = new Float32Array(R.W * R.H); // feed pipes per raster cell
    const gapF = hc.feedGap || 10;
    for (const j of fjobs) {
      const cp = [j.col.s.x, j.col.s.y];
      const [lx, ly] = j.poly.reduce((a, p) => [a[0] + p[0] / j.poly.length, a[1] + p[1] / j.poly.length], [0, 0]);
      const probe = route({ ...R, used: new Uint8Array(R.W * R.H) }, cp, [lx, ly]);
      j.entry = entryPoint(R, probe, j.poly) || cp;
      const k = probe ? probe.cells.findIndex((c) => { const [x, y] = centre(R, c); return inPoly(x, y, j.poly); }) : -1;
      j.trunk = probe && k > 0 ? probe.cells.slice(0, k) : [];
      const feed = (j.trunk.length * CELL + Math.hypot(j.entry[0] - cp[0], j.entry[1] - cp[1]) * 0) / 100;
      const area = roomArea(j.poly);
      j.nEst = Math.max(1, Math.ceil((area * 100) / j.cfg.spacing / Math.max(j.cfg.maxLen * 0.3, j.cfg.maxLen * 0.92 - 2 * feed - 4)));
      for (const c of j.trunk) pipes[c] += 2 * j.nEst;
    }
    // the main pipes from a boiler on this floor to each manifold get their strip too
    const mainPts = [];
    for (const col of fcols) {
      const boiler = boilers.find((x) => x.floor === f);
      if (!boiler) continue;
      const rt = route({ ...R, used: new Uint8Array(R.W * R.H) }, [boiler.s.x, boiler.s.y], [col.s.x, col.s.y]);
      if (rt) for (const c of rt.cells) { pipes[c] += 3; mainPts.push(centre(R, c)); } // two pipes, thicker
    }
    const nearCol = (x, y) => fcols.some((c) => Math.hypot(x - c.s.x, y - c.s.y) < 60);
    const keep = Math.max(...fjobs.map((j) => j.cfg.spacing));
    const mark = (x, y) => { const c = claimIdx(claim, x, y); if (c >= 0) claim.grid[c] = 1; };
    // strips around the pipes on their way (as wide as the pipes need, plus one spacing to the loops)
    for (let c = 0; c < pipes.length; c++) {
      if (!pipes[c]) continue;
      const [x, y] = centre(R, c);
      if (nearCol(x, y)) continue;
      const rad = (pipes[c] * gapF) / 2 + keep;
      for (let dy = -rad; dy <= rad; dy += RC) for (let dx = -rad; dx <= rad; dx += RC) mark(x + dx, y + dy);
    }
    // a strip along the wall where a room with several loops is entered, for the feed pipes of the farther loops
    for (const j of fjobs) {
      j.side = null;
      if (j.nEst < 2) continue;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of j.poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      const [ex, ey] = j.entry;
      const d = { top: ey - y0, bottom: y1 - ey, left: ex - x0, right: x1 - ex };
      // the strips run across the longer side: the feed strip lies along a long wall
      const horiz = x1 - x0 >= y1 - y0;
      j.side = horiz ? (d.top <= d.bottom ? 'top' : 'bottom') : (d.left <= d.right ? 'left' : 'right');
      const w = 2 * (j.nEst - 1) * gapF + keep + hc.margin;
      for (let y = y0; y <= y1; y += RC) for (let x = x0; x <= x1; x += RC) {
        const inBand = j.side === 'top' ? y < y0 + w : j.side === 'bottom' ? y > y1 - w : j.side === 'left' ? x < x0 + w : x > x1 - w;
        if (inBand && inPoly(x, y, j.poly)) mark(x, y);
      }
    }
    // the feed pipes like to run in these strips
    const prefer = [];
    for (let c = 0; c < Rf.grid.length; c++) {
      if (Rf.grid[c]) continue;
      const [x, y] = centre(Rf, c);
      const k = claimIdx(claim, x, y);
      if (k >= 0 && claim.grid[k]) prefer.push(c);
    }
    return { claim, prefer, mainPts };
  }

  /** Loops of one floor: rectangles, spirals and the feed pipes (each in its own lane). */
  function layoutFloor(f, fjobs, fcols, preClaim, bump = new Map(), prevCells = null, prevCost = 0.3, seeds = null) {
    const out = { warnings: [], draw: [], loops: [], collectors: [], feedCells: [], over: new Set() };
    const R = rasterOf(f, CELL), Rf = rasterOf(f, RC);
    out.Rf = Rf;
    if (!R || !Rf) return out;
    const claim = preClaim ? { ...preClaim, grid: preClaim.grid.slice() } : newClaim(fjobs.map((j) => j.poly));
    for (const j of fjobs) j.rects = floorRects(j.poly, hc.margin, 2.4 * j.cfg.spacing, hc.minArea, claim, j.cfg.spacing, seeds?.get(j));
    // feed pipes run along the walls: heated floor away from the walls is expensive (in later rounds the
    // loops' floor is not allowed at all, see rectMask)
    for (const RR of [R, Rf]) {
      RR.pen = new Float32Array(RR.W * RR.H).fill(1);
      RR.used.fill(0);
      const C = RR.cell;
      for (const j of fjobs) for (const q of j.rects) {
        const i0 = Math.max(0, Math.floor((q.x0 - RR.x0) / C)), i1 = Math.min(RR.W - 1, Math.ceil((q.x1 - RR.x0) / C) - 1);
        const j0 = Math.max(0, Math.floor((q.y0 - RR.y0) / C)), j1 = Math.min(RR.H - 1, Math.ceil((q.y1 - RR.y0) / C) - 1);
        for (let jj = j0; jj <= j1; jj++) for (let ii = i0; ii <= i1; ii++) { const c = jj * RR.W + ii; if (!RR.nearWall[c]) RR.pen[c] = 12; }
      }
    }
    // the strips kept free for the feed pipes: follow them
    // (along the wall even more: the strip between the pipes and the wall would stay cold)
    if (prevCells) for (const c of prevCells) Rf.pen[c] = Math.min(Rf.pen[c], prevCost);
    // pipes come together at the manifold: no own lanes within 60 cm of it
    const nearCol = (x, y) => fcols.some((c) => Math.hypot(x - c.s.x, y - c.s.y) < 60);
    out.nearCol = nearCol;
    const lanes = new Uint8Array(Rf.W * Rf.H);
    // pass 2: the loops' floor is out of bounds for feed pipes of other loops
    let rectMask = null;
    if (preClaim) {
      rectMask = new Uint8Array(Rf.W * Rf.H);
      for (const j of fjobs) for (const q of j.rects) {
        const i0 = Math.max(0, Math.floor((q.x0 - Rf.x0) / RC)), i1 = Math.min(Rf.W - 1, Math.ceil((q.x1 - Rf.x0) / RC) - 1);
        const j0 = Math.max(0, Math.floor((q.y0 - Rf.y0) / RC)), j1 = Math.min(Rf.H - 1, Math.ceil((q.y1 - Rf.y0) / RC) - 1);
        for (let jj = j0; jj <= j1; jj++) for (let ii = i0; ii <= i1; ii++) rectMask[jj * Rf.W + ii] = 1;
      }
    }
    const lane = Math.max(0, Math.round((hc.feedGap || 10) / RC) - 1); // cells blocked beside a pipe
    const takeLane = (cells) => {
      for (const c of cells) {
        const [x, y] = centre(Rf, c);
        if (nearCol(x, y) || Rf.door[c]) continue; // at the manifold and in doors the pipes lie close together
        const i = c % Rf.W, jj = Math.floor(c / Rf.W);
        for (let dj = -lane; dj <= lane; dj++) for (let di = -lane; di <= lane; di++) {
          const ni = i + di, nj = jj + dj;
          const k = nj * Rf.W + ni;
          if (ni >= 0 && nj >= 0 && ni < Rf.W && nj < Rf.H && !Rf.door[k]) lanes[k] = 1;
        }
      }
    };
    // own lane and not over other loops; else closer together; else (no other way) across a loop
    const routeLane = (a, z) => {
      const both = rectMask ? lanes.map((v, i) => v | rectMask[i]) : lanes;
      for (const [blk, squeezed] of [[both, false], [rectMask, false], [null, true]]) {
        Rf.block = blk;
        const r = route(Rf, a, z);
        if (r) { r.squeezed = squeezed; Rf.block = null; return r; }
      }
      Rf.block = null;
      return null;
    };

    for (const col of fcols) {
      const name = names.get(col.s.id);
      const cp = [col.s.x, col.s.y];
      const pieces = [];
      for (const { r, poly, cfg, rects } of fjobs.filter((j) => j.col === col)) {
        const s = cfg.spacing;
        if (!rects?.length) { out.warnings.push(t('{r}: te klein voor vloerverwarming.', { r: r.name || '?' })); continue; }
        for (const [qi, q] of rects.entries()) {
          const key = `${r.id}:${qi}`;
          const probe = route({ ...R, used: new Uint8Array(R.W * R.H) }, cp, [(q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2]);
          const feed = probe ? routeLen(R, probe) / 100 : (Math.abs(cp[0] - q.x0) + Math.abs(cp[1] - q.y0)) / 100;
          const entry = fjobs.find((j) => j.r === r)?.entry || entryPoint(R, probe, poly) || cp;
          const coilEst = ((q.x1 - q.x0) * (q.y1 - q.y0)) / s / 100;
          const side = fjobs.find((j) => j.r === r)?.side;
          const axis = side === 'top' || side === 'bottom' ? 'x' : side ? 'y' : null;
          const long = side === 'top' || side === 'bottom' ? q.x1 - q.x0 : side ? q.y1 - q.y0 : Math.max(q.x1 - q.x0, q.y1 - q.y0);
          const nMax = Math.max(1, Math.floor((long + s) / (3.4 * s)));
          let n = Math.min(nMax, Math.max(1, Math.ceil(coilEst / Math.max(cfg.maxLen * 0.25, cfg.maxLen - 2 * feed))));
          // check the real lengths (spiral + feed to its corner and back) and split further when needed
          for (; n < nMax; n++) {
            const ok = splitRect(q, n, s, axis).every((part) => {
              const sp = spiral(part, s, nearestCorner(part, entry));
              if (!sp) return true;
              const rt = route({ ...R, used: new Uint8Array(R.W * R.H) }, cp, sp.supply[0]);
              const fl = rt ? routeLen(R, rt) / 100 : feed;
              return (pathLength(sp.supply) + pathLength(sp.ret) + s) / 100 + 2 * fl + 0.5 <= cfg.maxLen;
            });
            if (ok) break;
          }
          n = Math.min(nMax, n + (bump.get(key) || 0));
          for (const part of splitRect(q, n, s, axis)) pieces.push({ r, cfg, q: part, entry, feed, key });
        }
      }
      // small pieces (left-over strips) are no loop of their own: they are laid in series after the
      // spiral of a neighbouring loop (same room first), when the length allows it
      const areaOf = (q) => ((q.x1 - q.x0) * (q.y1 - q.y0)) / 1e4;
      const touch = (a, z, s) => {
        const gx = Math.max(a.x0, z.x0) - Math.min(a.x1, z.x1), gy = Math.max(a.y0, z.y0) - Math.min(a.y1, z.y1);
        // side by side (one gap of about the pipe spacing) with a common side of at least 2 spacings
        return (gx > 0 && gx <= s + RC + 1 && -gy >= 2 * s) || (gy > 0 && gy <= s + RC + 1 && -gx >= 2 * s);
      };
      for (const pc of pieces) pc.parts = [pc.q];
      const smallFirst = [...pieces].sort((p, q) => areaOf(p.q) - areaOf(q.q));
      for (const pc of smallFirst) {
        if (areaOf(pc.q) >= 2 || !pieces.includes(pc)) continue;
        const s = pc.cfg.spacing;
        const est = (x) => x.parts.reduce((a, q) => a + areaOf(q), 0) * 100 / s + 2 * x.feed;
        const cands = pieces.filter((o) => o !== pc && o.parts.some((q) => touch(q, pc.q, s)) && est(o) + areaOf(pc.q) * 100 / s + 3 <= o.cfg.maxLen * 0.97)
          .sort((a, z) => (z.r === pc.r) - (a.r === pc.r) || areaOf(a.q) - areaOf(z.q));
        const o = cands[0];
        if (!o) continue;
        o.parts.push(pc.q);
        pieces.splice(pieces.indexOf(pc), 1);
      }
      // closest pieces first: they get the low outlet numbers and the straightest feeds
      pieces.sort((p, q) => p.feed - q.feed);
      const routes = [];
      const squeezed = [];
      pieces.forEach((pc, idx) => {
        const { r, cfg } = pc;
        const s = cfg.spacing;
        // the spirals of the loop one after the other: the next one starts at the corner nearest to
        // where the previous one ends
        const sps = [];
        let at = pc.entry;
        for (const q of pc.parts) {
          const sp = spiral(q, s, nearestCorner(q, at));
          if (!sp) continue;
          sps.push(sp);
          at = sp.ret.at(-1);
        }
        if (!sps.length) return;
        const n = idx + 1;
        const label = `${name}.${n}`;
        const links = [];
        const crosses = (pts) => pc.parts.some((q) => pts.some((p, i) => i && segInRect(pts[i - 1], p, q, 3)));
        for (let k = 1; k < sps.length; k++) {
          const a = sps[k - 1].ret.at(-1), z = sps[k].supply[0];
          // straight or one bend when that stays clear of the loops, else around them through the gaps
          const cands = Math.abs(a[0] - z[0]) < 0.5 || Math.abs(a[1] - z[1]) < 0.5 ? [[a, z]] : [[a, [a[0], z[1]], z], [a, [z[0], a[1]], z]];
          let link = cands.find((l) => !crosses(l));
          if (!link) {
            const rt = routeLane(a, z);
            link = rt ? [a, ...rt.cells.map((c) => centre(Rf, c)), z] : cands[0];
          }
          links.push(link);
        }
        const coil = (sps.reduce((x, sp) => x + pathLength(sp.supply) + pathLength(sp.ret) + sp.s, 0) + links.reduce((x, l) => x + pathLength(l), 0)) / 100;
        const sup = routeLane(cp, sps[0].supply[0]);
        if (sup) takeLane(sup.cells);
        const ret = routeLane(sps.at(-1).ret.at(-1), cp);
        if (ret) takeLane(ret.cells);
        for (const rt of [sup, ret]) if (rt) { routes.push({ ...rt, role: rt === sup ? 's' : 'r', n }); out.feedCells.push(...rt.cells); }
        const feed = ((sup ? routeLen(Rf, sup) : 0) + (ret ? routeLen(Rf, ret) : 0)) / 100;
        if (!sup || !ret) out.warnings.push(t('{l} ({r}): geen doorgang naar de collector (deur of muurdoorvoer CV).', { l: label, r: r.name || '?' }));
        else if (preClaim && (sup.squeezed || ret.squeezed)) squeezed.push(label);
        for (const sp of sps) out.draw.push({ t: 'loop', role: 's', pts: sp.supply, n, s: sp.s }, { t: 'loop', role: 'r', pts: [sp.supply.at(-1), ...sp.ret], n, s: sp.s });
        for (const l of links) out.draw.push({ t: 'loop', role: 'r', pts: l, n, s: s });
        const big = pc.parts.reduce((m, q) => (areaOf(q) > areaOf(m) ? q : m));
        out.draw.push({ t: 'label', at: [(big.x0 + big.x1) / 2, (big.y0 + big.y1) / 2], label });
        const total = Math.round((coil + feed) * 10) / 10;
        const area = pc.parts.reduce((x, q) => x + areaOf(q), 0);
        out.loops.push({ collector: col.s.id, name, n, room: r.name || '', floor: f.name, area: Math.round(area * 10) / 10, spacing: Math.round(sps[0].s * 2) / 2, coil: Math.round(coil * 10) / 10, feed: Math.round(feed * 10) / 10, total, max: cfg.maxLen, parts: pc.parts.map((q) => [q.x0, q.y0, q.x1, q.y1].map(Math.round)) });
        if (total > cfg.maxLen) out.over.add(pc.key);
        if (total > cfg.maxLen) out.warnings.push(t('{l} ({r}): {n} m is langer dan het maximum van {m} m.', { l: label, r: r.name || '?', n: String(total).replace('.', ','), m: cfg.maxLen }));
      });
      if (squeezed.length) out.warnings.push(t('{c}: te weinig plaats – de aanvoerleidingen van {l} lopen over een andere kring.', { c: name, l: squeezed.join(', ') }));
      const outlets = +col.s.props?.outlets || 0;
      out.collectors.push({ id: col.s.id, name, floor: f.name, loops: pieces.length, outlets });
      if (outlets && pieces.length > outlets) out.soft = (out.soft || 0) + 1;
      if (outlets && pieces.length > outlets) out.warnings.push(t('{c}: {n} kringen maar slechts {m} uitgangen.', { c: name, n: pieces.length, m: outlets }));
      if (routes.length) {
        // own lanes: the pipes only share cells at the manifold, where they lie close together
        const lines = bundle(Rf, routes, 3);
        routes.forEach((rt, i) => out.draw.push({ t: 'feed', role: rt.role, n: rt.n, pts: lines[i].map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]) }));
      }
    }
    return out;
  }

  // main pipes: boiler → every manifold (supply and return). On another floor: to the riser below the manifold.
  if (cols.length && !boilers.length) warnings.push(t('Geen CV-ketel op het plan: de hoofdleidingen worden niet getekend.'));
  if (boilers.length) {
    const byFloor = new Map();
    for (const col of cols) {
      const boiler = boilers.find((x) => x.floor === col.floor) || boilers[0];
      const f = boiler.floor;
      const R = rasterOf(f, CELL);
      if (!R) continue;
      // around the loops of this floor (only across them when there is no other way)
      const mask = new Uint8Array(R.W * R.H);
      for (const l of loops) if (l.floor === f.name) for (const [x0, y0, x1, y1] of l.parts || []) {
        for (let j = Math.max(0, Math.floor((y0 - R.y0) / CELL)); j < Math.min(R.H, Math.ceil((y1 - R.y0) / CELL)); j++) {
          for (let i = Math.max(0, Math.floor((x0 - R.x0) / CELL)); i < Math.min(R.W, Math.ceil((x1 - R.x0) / CELL)); i++) mask[j * R.W + i] = 1;
        }
      }
      const a = [boiler.s.x, boiler.s.y], z = [col.s.x, col.s.y];
      const around = (p, q) => { R.block = mask; const r = route(R, p, q); R.block = null; return r || route(R, p, q); };
      const sup = around(a, z), ret = around(z, a);
      if (!sup || !ret) { warnings.push(t('{c}: geen doorgang van de CV-ketel naar de collector.', { c: names.get(col.s.id) })); continue; }
      if (!byFloor.has(f.id)) byFloor.set(f.id, { f, R, routes: [] });
      byFloor.get(f.id).routes.push({ ...sup, role: 's' }, { ...ret, role: 'r' });
      const len = (routeLen(R, sup) + routeLen(R, ret)) / 100;
      const c = collectors.find((x) => x.id === col.s.id);
      if (c) { c.main = Math.round(len * 10) / 10; c.riser = col.floor !== f; }
    }
    for (const { f, R, routes } of byFloor.values()) {
      const lines = bundle(R, routes, 6);
      routes.forEach((rt, i) => draw(f).push({ t: 'main', role: rt.role, pts: lines[i].map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]) }));
    }
  }
  b.heat = { key: heatKey(b, lib), floors, loops, collectors, warnings };
  return b.heat;
}
