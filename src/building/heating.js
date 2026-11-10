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
  minArea: 1, // m², smaller pieces of a room stay unheated
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
 * The heated floor of a room as rectangles (cm): the room is rasterised (keeping `margin` from the walls
 * and from floor already claimed by other rooms) and the largest free rectangle is taken again and
 * again, so an L-shaped room gives two rectangles. The rectangles are marked in `claim`.
 */
export function floorRects(poly, margin, minSide, minArea, claim = null) {
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
    const q = { x0: x0 + best.i0 * RC, y0: y0 + best.j0 * RC, x1: x0 + best.i1 * RC, y1: y0 + best.j1 * RC };
    out.push(q);
    for (let j = best.j0; j < best.j1; j++) for (let i = best.i0; i < best.i1; i++) free[j * W + i] = 0;
    // the floor of other rooms keeps the wall distance from these loops too
    if (claim) for (let y = q.y0 - margin + RC / 2; y < q.y1 + margin; y += RC) for (let x = q.x0 - margin + RC / 2; x < q.x1 + margin; x += RC) {
      const c = claimIdx(claim, x, y);
      if (c >= 0) claim.grid[c] = 1;
    }
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
  // the middle only works out for some sizes: shrink the far sides a little (≤ 2 spacings) until it does
  const tries = [];
  for (let dw = 0; dw <= 2 * s; dw += 2.5) for (let dh = 0; dh <= 2 * s; dh += 2.5) tries.push([dw, dh]);
  tries.sort((a, b) => a[0] + a[1] - b[0] - b[1]);
  let first = null;
  for (const [dw, dh] of tries) {
    const sp = rawSpiral({ x0: q.x0, y0: q.y0, x1: q.x1 - dw, y1: q.y1 - dh }, s, corner, q);
    if (!sp) continue;
    first ||= sp;
    if (cleanLoop(sp, s)) return sp;
  }
  return first;
}

/** True when no two parallel pieces of the loop are closer than the pipe spacing and no piece is tiny. */
function cleanLoop(sp, s) {
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

/** The spiral itself in the rectangle {x0 … y1}; `frame` is the rectangle used for the mirroring (the full one). */
function rawSpiral({ x0, y0, x1, y1 }, s, corner, frame) {
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
  const tf = ([x, y]) => [Math.round((mx ? frame.x0 + frame.x1 - x : x) * 10) / 10, Math.round((my ? frame.y0 + frame.y1 - y : y) * 10) / 10];
  return { supply: A.map(tf), ret: B.map(tf) };
}

/** Splits a rectangle into n strips across its longer side, `s` apart (pipe spacing between loops). */
const splitRect = (q, n, s = 0) => {
  const out = [];
  const horiz = q.x1 - q.x0 >= q.y1 - q.y0;
  const g = n > 1 ? s / 2 : 0;
  for (let k = 0; k < n; k++) {
    const a = k ? g : 0, z = k < n - 1 ? g : 0;
    if (horiz) out.push({ ...q, x0: q.x0 + ((q.x1 - q.x0) * k) / n + a, x1: q.x0 + ((q.x1 - q.x0) * (k + 1)) / n - z });
    else out.push({ ...q, y0: q.y0 + ((q.y1 - q.y0) * k) / n + a, y1: q.y0 + ((q.y1 - q.y0) * (k + 1)) / n - z });
  }
  return out;
};
const corners = (q) => [[q.x0, q.y0], [q.x1, q.y0], [q.x1, q.y1], [q.x0, q.y1]];
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
    if (!rasters.has(key)) rasters.set(key, raster(f, f.symbols.map((s) => [s.x, s.y]), 'cv', cell));
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
    let res = layoutFloor(f, fjobs, fcols, null);
    const free = res.claimTemplate;
    if (free && res.feedCells.length) {
      const Rf = res.Rf;
      const keep = Math.max(...fjobs.map((j) => j.cfg.spacing)); // distance feed pipe ↔ loop
      for (const c of res.feedCells) {
        const [x, y] = centre(Rf, c);
        if (res.nearCol(x, y)) continue;
        for (let dy = -keep; dy <= keep; dy += RC) for (let dx = -keep; dx <= keep; dx += RC) {
          const k = claimIdx(free, x + dx, y + dy);
          if (k >= 0) free.grid[k] = 1;
        }
      }
      res = layoutFloor(f, fjobs, fcols, free);
      // a loop that came out too long (its feed pipes made a detour): one loop more in that piece of floor
      const bump = new Map();
      for (let i = 0; i < 3 && res.over.size; i++) {
        for (const k of res.over) bump.set(k, (bump.get(k) || 0) + 1);
        res = layoutFloor(f, fjobs, fcols, free, bump);
      }
    }
    for (const w of res.warnings) warnings.push(w);
    for (const it of res.draw) draw(f).push(it);
    loops.push(...res.loops);
    collectors.push(...res.collectors);
  }

  /** Loops of one floor: rectangles, spirals and the feed pipes (each in its own lane). */
  function layoutFloor(f, fjobs, fcols, preClaim, bump = new Map()) {
    const out = { warnings: [], draw: [], loops: [], collectors: [], feedCells: [], over: new Set() };
    const R = rasterOf(f, CELL), Rf = rasterOf(f, RC);
    out.Rf = Rf;
    if (!R || !Rf) return out;
    const claim = newClaim(fjobs.map((j) => j.poly));
    out.claimTemplate = claim && { ...claim, grid: new Uint8Array(claim.grid.length) };
    if (claim && preClaim) claim.grid.set(preClaim.grid);
    for (const j of fjobs) j.rects = floorRects(j.poly, hc.margin, 3 * j.cfg.spacing, hc.minArea, claim);
    // feed pipes avoid heated floor (except close to the walls); in pass 2 they may not cross it at all
    for (const RR of [R, Rf]) {
      RR.pen = new Float32Array(RR.W * RR.H).fill(1);
      RR.used.fill(0);
      const inset = preClaim ? 5 : 20;
      for (const j of fjobs) for (const q of j.rects) {
        const C = RR.cell;
        const i0 = Math.max(0, Math.ceil((q.x0 + inset - RR.x0) / C)), i1 = Math.min(RR.W - 1, Math.floor((q.x1 - inset - RR.x0) / C) - 1);
        const j0 = Math.max(0, Math.ceil((q.y0 + inset - RR.y0) / C)), j1 = Math.min(RR.H - 1, Math.floor((q.y1 - inset - RR.y0) / C) - 1);
        for (let jj = j0; jj <= j1; jj++) for (let ii = i0; ii <= i1; ii++) RR.pen[jj * RR.W + ii] = 12;
      }
    }
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
      for (const [blk, squeezed] of [[both, false], [rectMask, true], [null, true]]) {
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
          const entry = entryPoint(R, probe, poly) || cp;
          const coilEst = ((q.x1 - q.x0) * (q.y1 - q.y0)) / s / 100;
          const long = Math.max(q.x1 - q.x0, q.y1 - q.y0);
          const nMax = Math.max(1, Math.floor(long / (3 * s)));
          let n = Math.min(nMax, Math.max(1, Math.ceil(coilEst / Math.max(cfg.maxLen * 0.25, cfg.maxLen - 2 * feed))));
          // check the real lengths (spiral + feed to its corner and back) and split further when needed
          for (; n < nMax; n++) {
            const ok = splitRect(q, n, s).every((part) => {
              const sp = spiral(part, s, nearestCorner(part, entry));
              if (!sp) return true;
              const rt = route({ ...R, used: new Uint8Array(R.W * R.H) }, cp, sp.supply[0]);
              const fl = rt ? routeLen(R, rt) / 100 : feed;
              return (pathLength(sp.supply) + pathLength(sp.ret) + s) / 100 + 2 * fl + 0.5 <= cfg.maxLen;
            });
            if (ok) break;
          }
          n = Math.min(nMax, n + (bump.get(key) || 0));
          for (const part of splitRect(q, n, s)) pieces.push({ r, cfg, q: part, entry, feed, key });
        }
      }
      // closest pieces first: they get the low outlet numbers and the straightest feeds
      pieces.sort((p, q) => p.feed - q.feed);
      const routes = [];
      const squeezed = [];
      pieces.forEach((pc, idx) => {
        const { r, cfg, q } = pc;
        const s = cfg.spacing;
        const sp = spiral(q, s, nearestCorner(q, pc.entry));
        if (!sp) return;
        const n = idx + 1;
        const label = `${name}.${n}`;
        const coil = (pathLength(sp.supply) + pathLength(sp.ret) + s) / 100;
        const sup = routeLane(cp, sp.supply[0]);
        if (sup) takeLane(sup.cells);
        const ret = routeLane(sp.ret.at(-1), cp);
        if (ret) takeLane(ret.cells);
        for (const rt of [sup, ret]) if (rt) { routes.push({ ...rt, role: rt === sup ? 's' : 'r', n }); out.feedCells.push(...rt.cells); }
        const feed = ((sup ? routeLen(Rf, sup) : 0) + (ret ? routeLen(Rf, ret) : 0)) / 100;
        if (!sup || !ret) out.warnings.push(t('{l} ({r}): geen doorgang naar de collector (deur of muurdoorvoer CV).', { l: label, r: r.name || '?' }));
        else if (preClaim && (sup.squeezed || ret.squeezed)) squeezed.push(label);
        out.draw.push({ t: 'loop', role: 's', pts: sp.supply, n, s }, { t: 'loop', role: 'r', pts: [sp.supply.at(-1), ...sp.ret], n, s },
          { t: 'label', at: [(q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2], label });
        const total = Math.round((coil + feed) * 10) / 10;
        out.loops.push({ collector: col.s.id, name, n, room: r.name || '', floor: f.name, area: Math.round(((q.x1 - q.x0) * (q.y1 - q.y0)) / 1e3) / 10, spacing: s, coil: Math.round(coil * 10) / 10, feed: Math.round(feed * 10) / 10, total, max: cfg.maxLen });
        if (total > cfg.maxLen) out.over.add(pc.key);
        if (total > cfg.maxLen) out.warnings.push(t('{l} ({r}): {n} m is langer dan het maximum van {m} m.', { l: label, r: r.name || '?', n: String(total).replace('.', ','), m: cfg.maxLen }));
      });
      if (squeezed.length) out.warnings.push(t('{c}: te weinig plaats om alle aanvoerleidingen {g} cm uit elkaar te leggen ({l}); ze liggen daar dichter bij elkaar.', { c: name, g: hc.feedGap, l: squeezed.join(', ') }));
      const outlets = +col.s.props?.outlets || 0;
      out.collectors.push({ id: col.s.id, name, floor: f.name, loops: pieces.length, outlets });
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
      R.block = null;
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
