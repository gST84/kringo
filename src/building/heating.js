// Underfloor heating generator. Per heated room the floor is filled with loops laid as a counter-flow
// spiral ("slakkenhuis"): the supply runs inward at twice the pipe spacing, turns in the middle and the
// return runs back out between it, so warm and cooler pipe alternate. A loop is never longer than the
// room's maximum (feed pipes to the manifold included); a larger room gets several loops.
// Main pipes run from the boiler to every manifold; all pipes only pass walls through doors and
// wall passages for CV ('passage' openings with media 'cv').
import { t } from '../i18n.js';
import { pathLength } from './render.js';
import { roomPolygon } from './rooms.js';
import { bundle, CELL, raster, route, routeLen } from './traces.js';

export const HEAT_DEFAULTS = {
  spacing: 15, // cm between pipes
  maxLen: 100, // m per loop, feed pipes included
  margin: 10, // cm from the wall to the first pipe
  minArea: 0.5, // m², smaller pieces of a room stay unheated
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

/**
 * The heated floor of a room as rectangles (cm): the room is rasterised (keeping `margin` from the walls)
 * and the largest free rectangle is taken again and again, so an L-shaped room gives two rectangles.
 */
export function floorRects(poly, margin, minSide, minArea) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const W = Math.ceil((x1 - x0) / RC), H = Math.ceil((y1 - y0) / RC);
  if (W <= 0 || H <= 0 || W * H > 4e5) return [];
  const free = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const cx = x0 + (i + 0.5) * RC, cy = y0 + (j + 0.5) * RC;
    if (!inPoly(cx, cy, poly)) continue;
    let d = Infinity;
    for (let k = 0; k < poly.length && d >= margin; k++) d = Math.min(d, segDist(cx, cy, poly[k], poly[(k + 1) % poly.length]));
    if (d >= margin - RC / 2) free[j * W + i] = 1;
  }
  const out = [];
  const hist = new Int32Array(W);
  for (let guard = 0; guard < 12; guard++) {
    // largest rectangle of free cells (histogram per row)
    hist.fill(0);
    let best = null;
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) hist[i] = free[j * W + i] ? hist[i] + 1 : 0;
      const stack = [];
      for (let i = 0; i <= W; i++) {
        const hh = i < W ? hist[i] : 0;
        let start = i;
        while (stack.length && stack.at(-1)[1] >= hh) {
          const [s, sh] = stack.pop();
          const area = sh * (i - s);
          if (sh && (!best || area > best.area)) best = { area, i0: s, i1: i, j0: j - sh + 1, j1: j + 1 };
          start = s;
        }
        stack.push([start, hh]);
      }
    }
    if (!best) break;
    const w = (best.i1 - best.i0) * RC, hgt = (best.j1 - best.j0) * RC;
    if ((w * hgt) / 1e4 < minArea || Math.min(w, hgt) < minSide) break;
    out.push({ x0: x0 + best.i0 * RC, y0: y0 + best.j0 * RC, x1: x0 + best.i1 * RC, y1: y0 + best.j1 * RC });
    for (let j = best.j0; j < best.j1; j++) for (let i = best.i0; i < best.i1; i++) free[j * W + i] = 0;
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
export function spiral({ x0, y0, x1, y1 }, s, corner = 0) {
  const p = 2 * s;
  let l = x0, top = y0, r = x1, b = y1;
  const A = [[l, top]];
  for (let dir = 0, guard = 0; guard < 500; guard++, dir = (dir + 1) % 4) {
    const [cx, cy] = A.at(-1);
    const nx = dir === 0 ? r : dir === 2 ? l : cx;
    const ny = dir === 1 ? b : dir === 3 ? top + p : cy;
    if (Math.abs(nx - cx) + Math.abs(ny - cy) < p + 0.5) break;
    A.push([nx, ny]);
    if (dir === 0) top += p; else if (dir === 1) r -= p; else if (dir === 2) b -= p; else l += p;
  }
  if (A.length < 2) return null;
  const B = offsetOrtho(A, s).reverse();
  const mx = corner === 1 || corner === 2, my = corner === 2 || corner === 3;
  const tf = ([x, y]) => [Math.round((mx ? x0 + x1 - x : x) * 10) / 10, Math.round((my ? y0 + y1 - y : y) * 10) / 10];
  return { supply: A.map(tf), ret: B.map(tf) };
}

/** Splits a rectangle into n strips across its longer side. */
const splitRect = (q, n) => {
  const out = [];
  const horiz = q.x1 - q.x0 >= q.y1 - q.y0;
  for (let k = 0; k < n; k++) {
    if (horiz) out.push({ ...q, x0: q.x0 + ((q.x1 - q.x0) * k) / n, x1: q.x0 + ((q.x1 - q.x0) * (k + 1)) / n });
    else out.push({ ...q, y0: q.y0 + ((q.y1 - q.y0) * k) / n, y1: q.y0 + ((q.y1 - q.y0) * (k + 1)) / n });
  }
  return out;
};
const corners = (q) => [[q.x0, q.y0], [q.x1, q.y0], [q.x1, q.y1], [q.x0, q.y1]];

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
  const all = [];
  for (const f of b.floors) for (const s of f.symbols) { const hv = lib.get(s.sym)?.hvac; if (hv) all.push({ s, floor: f, hv }); }
  const boilers = all.filter((x) => x.hv === 'boiler');
  const cols = all.filter((x) => x.hv === 'collector');
  const rasters = new Map();
  const rasterOf = (f) => {
    if (!rasters.has(f.id)) rasters.set(f.id, raster(f, f.symbols.map((s) => [s.x, s.y]), 'cv'));
    return rasters.get(f.id);
  };
  const draw = (f) => (floors[f.id] ||= []);

  if (!cols.length) warnings.push(t('Geen collector op het plan: plaats een collector (Technieken › CV en sanitair).'));

  // rooms with underfloor heating, each assigned to a manifold
  const jobs = new Map(cols.map((c) => [c.s.id, []]));
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
    jobs.get(col.s.id).push({ f, r, poly, cfg });
  }

  for (const col of cols) {
    const f = col.floor;
    const R = rasterOf(f);
    const name = names.get(col.s.id);
    const routes = []; // {cells, a, b, role, label}
    const pieces = [];
    const cp = [col.s.x, col.s.y];
    // feed length estimate per room: route to the middle of every rectangle
    for (const { r, poly, cfg } of jobs.get(col.s.id)) {
      const s = cfg.spacing;
      const rects = floorRects(poly, heatCfg(b).margin, 4 * s, heatCfg(b).minArea);
      if (!rects.length) { warnings.push(t('{r}: te klein voor vloerverwarming.', { r: r.name || '?' })); continue; }
      for (const q of rects) {
        // probe route (not marked as used) to find where the feed enters and how long it is
        const probe = R && route({ ...R, used: new Uint8Array(R.W * R.H) }, cp, [(q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2]);
        const feed = probe ? routeLen(R, probe) / 100 : (Math.abs(cp[0] - q.x0) + Math.abs(cp[1] - q.y0)) / 100;
        const coilEst = ((q.x1 - q.x0) * (q.y1 - q.y0)) / s / 100; // m
        let n = Math.max(1, Math.ceil(coilEst / Math.max(cfg.maxLen * 0.25, cfg.maxLen - 2 * feed)));
        // never narrower than 4 spacings
        const long = Math.max(q.x1 - q.x0, q.y1 - q.y0);
        n = Math.min(n, Math.max(1, Math.floor(long / (4 * s))));
        for (const part of splitRect(q, n)) pieces.push({ r, poly, cfg, q: part, probe, feed });
      }
    }
    // closest pieces first: they get the low outlet numbers and the straightest feeds
    pieces.sort((p, q) => p.feed - q.feed);
    pieces.forEach((pc, idx) => {
      const { r, cfg, q } = pc;
      const s = cfg.spacing;
      // entry corner: nearest to where the feed reaches the room (or to the manifold)
      let entry = cp;
      if (pc.probe && R) {
        const cells = pc.probe.cells;
        const inside = cells.find((c) => {
          const x = R.x0 + ((c % R.W) + 0.5) * CELL, y = R.y0 + (Math.floor(c / R.W) + 0.5) * CELL;
          return inPoly(x, y, pc.poly);
        });
        if (inside != null) entry = [R.x0 + ((inside % R.W) + 0.5) * CELL, R.y0 + (Math.floor(inside / R.W) + 0.5) * CELL];
      }
      const cs = corners(q);
      let corner = 0;
      cs.forEach((c, i) => { if (Math.hypot(c[0] - entry[0], c[1] - entry[1]) < Math.hypot(cs[corner][0] - entry[0], cs[corner][1] - entry[1])) corner = i; });
      const sp = spiral(q, s, corner);
      if (!sp) return;
      const n = idx + 1;
      const label = `${name}.${n}`;
      const coil = (pathLength(sp.supply) + pathLength(sp.ret) + s) / 100;
      const sup = R && route(R, cp, sp.supply[0]);
      const ret = R && route(R, sp.ret.at(-1), cp);
      if (sup) routes.push({ ...sup, role: 's', n });
      if (ret) routes.push({ ...ret, role: 'r', n });
      const feed = ((sup ? routeLen(R, sup) : 0) + (ret ? routeLen(R, ret) : 0)) / 100;
      if (!sup || !ret) warnings.push(t('{l} ({r}): geen doorgang naar de collector (deur of muurdoorvoer CV).', { l: label, r: r.name || '?' }));
      draw(f).push({ t: 'loop', role: 's', pts: sp.supply, n }, { t: 'loop', role: 'r', pts: [sp.supply.at(-1), ...sp.ret], n },
        { t: 'label', at: [(q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2], label });
      const total = Math.round((coil + feed) * 10) / 10;
      loops.push({ collector: col.s.id, name, n, room: r.name || '', floor: f.name, area: Math.round(((q.x1 - q.x0) * (q.y1 - q.y0)) / 1e3) / 10, spacing: s, coil: Math.round(coil * 10) / 10, feed: Math.round(feed * 10) / 10, total, max: cfg.maxLen });
      if (total > cfg.maxLen) warnings.push(t('{l} ({r}): {n} m is langer dan het maximum van {m} m.', { l: label, r: r.name || '?', n: String(total).replace('.', ','), m: cfg.maxLen }));
    });
    const outlets = +col.s.props?.outlets || 0;
    const used = pieces.length;
    collectors.push({ id: col.s.id, name, floor: f.name, loops: used, outlets });
    if (outlets && used > outlets) warnings.push(t('{c}: {n} kringen maar slechts {m} uitgangen.', { c: name, n: used, m: outlets }));
    // feed pipes of one manifold lie side by side
    if (R && routes.length) {
      const lines = bundle(R, routes, 5);
      routes.forEach((rt, i) => draw(f).push({ t: 'feed', role: rt.role, n: rt.n, pts: lines[i].map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]) }));
    }
  }

  // main pipes: boiler → every manifold (supply and return). On another floor: to the riser below the manifold.
  if (cols.length && !boilers.length) warnings.push(t('Geen CV-ketel op het plan: de hoofdleidingen worden niet getekend.'));
  if (boilers.length) {
    const byFloor = new Map();
    for (const col of cols) {
      const boiler = boilers.find((x) => x.floor === col.floor) || boilers[0];
      const f = boiler.floor;
      const R = rasterOf(f);
      if (!R) continue;
      const a = [boiler.s.x, boiler.s.y], z = [col.s.x, col.s.y];
      const sup = route(R, a, z), ret = route(R, z, a);
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
