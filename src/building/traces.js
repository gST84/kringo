// Cable traces on the floor plans: per circuit a route from the distribution board to the first point,
// then from point to point in circuit order. Routes may only pass walls through doors / openings.
// The lengths (horizontal route + vertical drops to the boxes) are summed per cable type.
import { t } from '../i18n.js';
import { boardOf, circuitSymbols, wallGeom, wallPath } from './model.js';
import { wallPolygon } from './render.js';
import { cableText } from './eendraad.js';

export const TRACE_DEFAULTS = {
  ceiling: 260, // cm, ceiling height (ceiling lights, routes to the ceiling)
  storey: 290, // cm, floor to floor (riser between floors)
  board: 160, // cm, centre of the board
  socket: 30,
  switch: 110,
  wallLight: 200,
  appliance: 60,
  other: 110,
  box: 20, // cm extra per connection (into the box)
  reserve: 10, // %
};

/** Heights (cm) that can be set in the dialog, in order. */
export const TRACE_FIELDS = [
  ['board', 'Verdeelbord'], ['socket', 'Stopcontacten'], ['switch', 'Schakelaars / drukknoppen'], ['wallLight', 'Wandverlichting'],
  ['appliance', 'Toestellen'], ['other', 'Overige'], ['ceiling', 'Plafond (plafondverlichting)'], ['storey', 'Verdiepingshoogte (vloer tot vloer)'],
];

export const traceCfg = (b) => ({ ...TRACE_DEFAULTS, ...(b.traceCfg || {}) });

const PASSABLE = new Set(['door', 'door2', 'slide', 'garage']);
const CELL = 10; // cm
const DC_KINDS = new Set(['pv', 'mppt', 'dcbus', 'battery']);

/** Mounting height of a symbol in cm (its own height when set). */
export function symbolHeight(s, def, cfg) {
  if (s.props?.h != null && s.props.h !== '' && Number.isFinite(Number(s.props.h))) return Number(s.props.h);
  const kind = def?.kind;
  if (kind === 'board') return cfg.board;
  if (kind === 'socket') return cfg.socket;
  if (!def?.wall && ['light', 'switch', 'dom-in', 'other', 'push'].includes(kind)) return cfg.ceiling; // ceiling light / sensor
  if (kind === 'light') return cfg.wallLight;
  if (kind === 'switch' || kind === 'push' || kind === 'dom-in') return cfg.switch;
  if (kind === 'appliance') return cfg.appliance;
  return cfg.other;
}

// ---------- raster of a floor ----------

const inPoly = (x, y, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

function fillPoly(grid, R, poly, value, only = -1) {
  let px0 = Infinity, py0 = Infinity, px1 = -Infinity, py1 = -Infinity;
  for (const [x, y] of poly) { px0 = Math.min(px0, x); py0 = Math.min(py0, y); px1 = Math.max(px1, x); py1 = Math.max(py1, y); }
  const i0 = Math.max(0, Math.floor((px0 - R.x0) / CELL)), i1 = Math.min(R.W - 1, Math.ceil((px1 - R.x0) / CELL));
  const j0 = Math.max(0, Math.floor((py0 - R.y0) / CELL)), j1 = Math.min(R.H - 1, Math.ceil((py1 - R.y0) / CELL));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    if ((only < 0 || grid[j * R.W + i] === only) && inPoly(R.x0 + (i + 0.5) * CELL, R.y0 + (j + 0.5) * CELL, poly)) grid[j * R.W + i] = value;
  }
}

/** Raster of a floor: 0 = free, 1 = wall, 2 = outside the building. */
function raster(floor, extra) {
  const polys = floor.walls.map((w) => wallPolygon(w, floor.walls));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of [...polys.flat(), ...extra]) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  if (!Number.isFinite(x0)) return null;
  x0 -= 100; y0 -= 100; x1 += 100; y1 += 100;
  const R = { x0, y0, W: Math.ceil((x1 - x0) / CELL), H: Math.ceil((y1 - y0) / CELL) };
  if (R.W * R.H > 3e6) return null;
  const grid = new Uint8Array(R.W * R.H);
  for (const p of polys) fillPoly(grid, R, p, 1);
  R.grid = grid;
  // outside: flood fill from the border; when that reaches everything the building is not closed
  const out = new Uint8Array(R.W * R.H);
  const stack = [];
  const push = (c) => { if (!grid[c] && !out[c]) { out[c] = 1; stack.push(c); } };
  for (let i = 0; i < R.W; i++) { push(i); push((R.H - 1) * R.W + i); }
  for (let j = 0; j < R.H; j++) { push(j * R.W); push(j * R.W + R.W - 1); }
  while (stack.length) {
    const c = stack.pop();
    const i = c % R.W;
    if (i > 0) push(c - 1);
    if (i < R.W - 1) push(c + 1);
    if (c >= R.W) push(c - R.W);
    if (c < R.W * (R.H - 1)) push(c + R.W);
  }
  let free = 0, outside = 0;
  for (let c = 0; c < grid.length; c++) if (!grid[c]) { free++; if (out[c]) outside++; }
  R.closed = outside < free; // something is inside
  if (R.closed) for (let c = 0; c < grid.length; c++) if (out[c]) grid[c] = 2;
  // doors and openings: cut through the wall (a bit wider than the wall, so the cut is complete)
  const byId = new Map(floor.walls.map((w) => [w.id, w]));
  for (const o of floor.openings || []) {
    const w = byId.get(o.wall);
    if (!w || !PASSABLE.has(o.type)) continue;
    const g = wallGeom(w);
    const half = (w.t || 20) / 2 + CELL;
    const a = Math.max(0, o.pos - o.width / 2 + 5), b = Math.min(g.len, o.pos + o.width / 2 - 5);
    if (b <= a) continue;
    fillPoly(grid, R, [...wallPath(w, a, b, half, g), ...wallPath(w, b, a, -half, g)], 0, 1); // wall cells only, not outside
  }
  return R;
}

const cellOf = (R, x, y) => {
  const i = Math.min(R.W - 1, Math.max(0, Math.floor((x - R.x0) / CELL)));
  const j = Math.min(R.H - 1, Math.max(0, Math.floor((y - R.y0) / CELL)));
  return j * R.W + i;
};
const centre = (R, c) => [R.x0 + ((c % R.W) + 0.5) * CELL, R.y0 + (Math.floor(c / R.W) + 0.5) * CELL];

/** Nearest free cell inside the building (symbols sit against or in a wall). */
function snap(R, x, y) {
  const c0 = cellOf(R, x, y);
  if (!R.grid[c0]) return c0;
  let best = -1, bd = Infinity;
  const r = 12; // cells
  const i0 = c0 % R.W, j0 = Math.floor(c0 / R.W);
  for (let j = Math.max(0, j0 - r); j <= Math.min(R.H - 1, j0 + r); j++) {
    for (let i = Math.max(0, i0 - r); i <= Math.min(R.W - 1, i0 + r); i++) {
      const c = j * R.W + i;
      if (R.grid[c]) continue;
      const [cx, cy] = centre(R, c);
      const d = Math.hypot(cx - x, cy - y);
      if (d < bd) { bd = d; best = c; }
    }
  }
  return best;
}

/** A* over the raster (8 directions, no corner cutting); returns cell indices or null. */
function astar(R, from, to) {
  const { W, H, grid } = R;
  const g = new Float64Array(W * H).fill(Infinity);
  const prev = new Int32Array(W * H).fill(-1);
  const closed = new Uint8Array(W * H);
  const ti = to % W, tj = Math.floor(to / W);
  const hcost = (c) => {
    const dx = Math.abs((c % W) - ti), dy = Math.abs(Math.floor(c / W) - tj);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  // binary heap of [f, cell]
  const heap = [];
  const pushH = (f, c) => {
    heap.push([f, c]);
    let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
  };
  const popH = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
      }
    }
    return top;
  };
  g[from] = 0;
  pushH(hcost(from), from);
  const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  while (heap.length) {
    const [, c] = popH();
    if (closed[c]) continue;
    if (c === to) break;
    closed[c] = 1;
    const i = c % W, j = Math.floor(c / W);
    for (const [di, dj, cost] of DIRS) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const n = nj * W + ni;
      if (grid[n] || closed[n]) continue;
      if (di && dj && (grid[j * W + ni] || grid[nj * W + i])) continue; // no corner cutting
      const ng = g[c] + cost;
      if (ng < g[n]) { g[n] = ng; prev[n] = c; pushH(ng + hcost(n), n); }
    }
  }
  if (from !== to && prev[to] < 0) return null;
  const path = [to];
  while (path[path.length - 1] !== from) path.push(prev[path[path.length - 1]]);
  return path.reverse();
}

/** True when the straight line between two points only crosses free cells. */
function clear(R, [ax, ay], [bx, by]) {
  const n = Math.ceil(Math.hypot(bx - ax, by - ay) / (CELL / 3));
  for (let k = 1; k < n; k++) {
    const x = ax + ((bx - ax) * k) / n, y = ay + ((by - ay) * k) / n;
    const i = Math.floor((x - R.x0) / CELL), j = Math.floor((y - R.y0) / CELL);
    if (i < 0 || j < 0 || i >= R.W || j >= R.H || R.grid[j * R.W + i]) return false;
  }
  return true;
}

/** Route between two plan points on one floor: [[x, y] …] or null. */
function route(R, a, b) {
  const ca = snap(R, a[0], a[1]), cb = snap(R, b[0], b[1]);
  if (ca < 0 || cb < 0) return null;
  const cells = astar(R, ca, cb);
  if (!cells) return null;
  const pts = cells.map((c) => centre(R, c));
  // string pulling: keep only the corners that are needed
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !clear(R, pts[i], pts[j])) j--;
    out.push(pts[j]);
    i = j;
  }
  return [a, ...out, b];
}

const plen = (pts) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);

// ---------- generation ----------

/** Board symbol that feeds a circuit (the one set to its board, or the only / first one). */
function boardSymbolFor(b, lib, circuitId, boards) {
  if (!boards.length) return null;
  const board = boardOf(b, circuitId);
  return boards.find((x) => x.s.props?.board === board?.id)
    || (boards.length === 1 ? boards[0] : null)
    || boards.find((x) => !x.s.props?.board && board && !board.parent)
    || boards[0];
}

/** Fingerprint of everything a trace depends on (to see that it is out of date). */
export function traceKey(b) {
  const parts = [JSON.stringify(b.traceCfg || {})];
  for (const f of b.floors) {
    parts.push(f.id, f.walls.map((w) => `${w.x1},${w.y1},${w.x2},${w.y2},${w.t},${w.cx ?? ''},${w.cy ?? ''}`).join(';'));
    parts.push((f.openings || []).map((o) => `${o.wall},${o.type},${o.pos},${o.width}`).join(';'));
    parts.push(f.symbols.map((s) => `${s.id},${s.x},${s.y},${s.circuit || ''},${s.n || ''},${s.dom || ''},${s.props?.h ?? ''},${s.props?.board ?? ''}`).join(';'));
  }
  parts.push(b.circuits.map((c) => `${c.id},${c.parent},${cableText(c)}`).join(';'));
  let hsh = 0;
  const str = parts.join('|');
  for (let i = 0; i < str.length; i++) hsh = (hsh * 31 + str.charCodeAt(i)) | 0;
  return String(hsh);
}

/**
 * Computes all traces and lengths; stores them in building.traces:
 * { key, floors: {floorId: [{c, pts, home}]}, rows: [{circuit, cable, points, horiz, vert, total}], warnings }.
 */
export function generateTraces(b, lib) {
  const cfg = traceCfg(b);
  const floorIdx = new Map(b.floors.map((f, i) => [f.id, i]));
  const boards = [];
  for (const f of b.floors) for (const s of f.symbols) if (lib.get(s.sym)?.kind === 'board' && !s.circuit) boards.push({ s, floor: f });
  // rasters per floor (including the board position, which is also the riser on every floor)
  const rasters = new Map();
  const rasterOf = (f) => {
    if (!rasters.has(f.id)) rasters.set(f.id, raster(f, [...f.symbols.map((s) => [s.x, s.y]), ...boards.map((x) => [x.s.x, x.s.y])]));
    return rasters.get(f.id);
  };
  const floors = {};
  const rows = [];
  const warnings = [];
  const add = (f, c, pts, home) => (floors[f.id] ||= []).push({ c, pts: pts.map(([x, y]) => [Math.round(x), Math.round(y)]), home });

  for (const c of b.circuits) {
    // DC side of a PV installation (panels, MPPT, busbar, battery) is not on the AC circuit cable
    const syms = circuitSymbols(b, c.id).filter((x) => lib.get(x.s.sym) && !DC_KINDS.has(lib.get(x.s.sym).kind));
    if (!syms.length) continue;
    // order: by number; within one number switches first (switch → lights)
    const rank = (x) => (['switch', 'push'].includes(lib.get(x.s.sym)?.kind) ? 0 : 1);
    syms.sort((p, q) => (p.s.n || 0) - (q.s.n || 0) || rank(p) - rank(q));
    const bs = boardSymbolFor(b, lib, c.id, boards);
    if (!bs) warnings.push(t('Kring {c}: geen verdeelbord op het plan – de kabel start bij het eerste punt.', { c: c.name }));
    let horiz = 0, vert = 0, failed = 0;
    const H = (x) => symbolHeight(x.s, lib.get(x.s.sym), cfg);
    // vertical part of a run between heights ha and hb: via the ceiling when one end is a ceiling point
    const drop = (ha, hb) => {
      const ceil = Math.max(ha, hb) >= cfg.ceiling - 1;
      return ceil ? (cfg.ceiling - Math.min(ha, cfg.ceiling)) + (cfg.ceiling - Math.min(hb, cfg.ceiling)) : ha + hb;
    };
    // one run from A to B (possibly over several floors, via the riser at the board)
    const run = (A, B, home) => {
      const fa = floorIdx.get(A.floor.id), fb = floorIdx.get(B.floor.id);
      const pa = [A.s.x, A.s.y], pb = [B.s.x, B.s.y];
      if (fa === fb) {
        const R = rasterOf(A.floor);
        const pts = R && route(R, pa, pb);
        if (pts) { horiz += plen(pts); add(A.floor, c.id, pts, home); } else { failed++; horiz += Math.hypot(pb[0] - pa[0], pb[1] - pa[1]); }
        vert += drop(H(A), H(B)) + 2 * cfg.box;
        return;
      }
      const riser = bs ? [bs.s.x, bs.s.y] : pa;
      const Ra = rasterOf(A.floor), Rb = rasterOf(B.floor);
      const p1 = Ra && route(Ra, pa, riser), p2 = Rb && route(Rb, riser, pb);
      if (p1) { horiz += plen(p1); add(A.floor, c.id, p1, home); } else failed++;
      if (p2) { horiz += plen(p2); add(B.floor, c.id, p2, home); } else failed++;
      // riser: from A's height to B's height over the floors in between
      vert += Math.abs(fb - fa) * cfg.storey + Math.abs(H(B) - H(A)) + 2 * cfg.box;
    };
    // a chain board → 1 → 2 → …; every domotics output channel gets its own cable from the board
    const chains = [syms.filter((x) => !x.s.dom)];
    const byDom = new Map();
    for (const x of syms) if (x.s.dom) { if (!byDom.has(x.s.dom)) byDom.set(x.s.dom, []); byDom.get(x.s.dom).push(x); }
    chains.push(...byDom.values());
    for (const list of chains) {
      let prev = bs;
      for (const x of list) { if (prev) run(prev, x, prev === bs); prev = x; }
    }
    if (failed) warnings.push(t('Kring {c}: {n} stuk(ken) zonder doorgang (deur / opening) – rechte lijn gerekend.', { c: c.name, n: failed }));
    const total = Math.ceil(((horiz + vert) / 100) * (1 + cfg.reserve / 100));
    rows.push({ circuit: c.id, name: c.name, desc: c.desc || '', cable: cableText(c), points: syms.length, horiz: horiz / 100, vert: vert / 100, total });
  }
  const closedFloors = b.floors.filter((f) => rasters.has(f.id) && rasters.get(f.id) && !rasters.get(f.id).closed);
  for (const f of closedFloors) warnings.push(t('{f}: de buitenmuren zijn niet gesloten – kabels kunnen buitenom lopen.', { f: f.name }));
  b.traces = { key: traceKey(b), floors, rows, warnings };
  return b.traces;
}

/** Total length per cable type: [[cable, metres, circuits]]. */
export function cableTotals(rows) {
  const m = new Map();
  for (const r of rows) {
    const e = m.get(r.cable) || [r.cable, 0, []];
    e[1] += r.total; e[2].push(r.name);
    m.set(r.cable, e);
  }
  return [...m.values()].sort((a, c) => a[0].localeCompare(c[0]));
}
