// Underfloor heating on the floor heating plan: a pipe is a polyline (shape of type 'pipe'). Pipes are drawn by hand –
// they snap to a grid per room (the room's pipe spacing, starting at the wall distance) – or generated for
// a whole floor (generateFloorHeating; the algorithm itself is in ufh.js). This module holds the settings,
// the room grid, the lengths and the link between the building model and the generator.
import { t } from '../i18n.js';
import { uid } from '../util.js';
import { pathLength } from './render.js';
import { roomPolygon } from './rooms.js';
import { isDivider, wallGeom } from './model.js';
import { passable } from './traces.js';
import { generate } from './ufh.js';

export const HEAT_DEFAULTS = {
  spacing: 15, // cm between pipes (grid of a room)
  maxLen: 100, // m per loop
  margin: 10, // cm from the wall to the first pipe
};
export const heatCfg = (b) => ({ ...HEAT_DEFAULTS, ...(b.heatCfg || {}) });
/** Settings of a room (its own values over the project defaults); `on`: the generator lays pipes in it. */
export const roomHeat = (b, r) => {
  const c = heatCfg(b), u = r?.ufh || {};
  return { on: u.on !== false, spacing: +u.spacing || c.spacing, maxLen: +u.maxLen || c.maxLen };
};

/** Colours for loops (a new pipe takes the next one). */
export const PIPE_COLORS = ['#e03131', '#1c3fd8', '#2f9e44', '#e8590c', '#7048e8', '#0c8599', '#c2255c', '#5c940d'];

const inPoly = (x, y, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/** The room (with its outline) at a point of a floor, the smallest when rooms overlap. */
export function roomAt(floor, x, y) {
  let best = null;
  for (const r of floor.rooms || []) {
    const poly = roomPolygon(floor, r);
    if (!poly || !inPoly(x, y, poly)) continue;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [px, py] of poly) { x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); }
    const area = (x1 - x0) * (y1 - y0);
    if (!best || area < best.area) best = { room: r, poly, x0, y0, x1, y1, area };
  }
  return best;
}

/**
 * Grid of a room for drawing pipes: points every `spacing` cm, the first row / column at the wall
 * distance from the room's outline. {room, poly, ox, oy, s, snap(p), points(): [[x, y]] inside the room}.
 */
export function roomGrid(b, floor, x, y) {
  const hit = roomAt(floor, x, y);
  if (!hit) return null;
  const { spacing: s } = roomHeat(b, hit.room);
  const m = heatCfg(b).margin;
  const ox = hit.x0 + m, oy = hit.y0 + m;
  const r1 = (v) => Math.round(v * 10) / 10;
  return {
    ...hit, s, ox, oy,
    snap: ([px, py]) => [r1(ox + Math.round((px - ox) / s) * s), r1(oy + Math.round((py - oy) / s) * s)],
    points() {
      const out = [];
      for (let gy = oy; gy <= hit.y1 - m + 0.01; gy += s) for (let gx = ox; gx <= hit.x1 - m + 0.01; gx += s) if (inPoly(gx, gy, hit.poly)) out.push([gx, gy]);
      return out;
    },
  };
}

/** The room where most of a pipe lies ({room, poly …} as roomAt, or null). */
export function pipeRoom(floor, sh) {
  const len = new Map();
  let best = null, bestLen = 0;
  for (let i = 1; i < sh.pts.length; i++) {
    const [ax, ay] = sh.pts[i - 1], [bx, by] = sh.pts[i];
    const l = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.ceil(l / 25));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const hit = roomAt(floor, ax + (bx - ax) * t, ay + (by - ay) * t);
      if (!hit) continue;
      const v = (len.get(hit.room.id) || 0) + l / n;
      len.set(hit.room.id, v);
      if (v > bestLen) { bestLen = v; best = hit; }
    }
  }
  return best;
}

/** Length of a drawn pipe in metres (one decimal). */
export const pipeLength = (sh) => Math.round(pathLength(sh.pts) / 10) / 10;

/** All drawn pipes of the building: [{sh, floor}]. */
export function allPipes(b) {
  const out = [];
  for (const f of b.floors) for (const sh of f.shapes || []) if (sh.type === 'pipe') out.push({ sh, floor: f });
  return out;
}

/** Name of a manifold on the plan: its description, or VV1, VV2 … in plan order. */
export function collectorNames(b, lib) {
  const m = new Map();
  let n = 0;
  for (const f of b.floors) for (const s of f.symbols) if (lib.get(s.sym)?.hvac === 'collector') m.set(s.id, s.props?.desc || `VV${++n}`);
  return m;
}

/** The manifold nearest to a point on a floor (or null). */
export function nearestCollector(floor, lib, [x, y]) {
  let best = null;
  for (const s of floor.symbols) {
    if (lib.get(s.sym)?.hvac !== 'collector') continue;
    const d = Math.hypot(s.x - x, s.y - y);
    if (!best || d < best.d) best = { s, d };
  }
  return best?.s || null;
}

/** Name for a new loop of a manifold: VV1.1, VV1.2 … (the next free number). */
export function nextLoopName(b, lib, collectorId) {
  const name = collectorNames(b, lib).get(collectorId) || 'K';
  const used = new Set(allPipes(b).map(({ sh }) => sh.name));
  let n = 1;
  while (used.has(`${name}.${n}`)) n++;
  return `${name}.${n}`;
}

/** The manifolds on a floor. */
export const floorCollectors = (floor, lib) => floor.symbols.filter((s) => lib.get(s.sym)?.hvac === 'collector');

/**
 * Rectangles [x0, y0, x1, y1] (cm) the generator keeps free for a stair or cabinet: the box itself,
 * the two legs of a quarter-turn stair, three overlapping boxes around a spiral stair.
 */
export function stairBlocks(st) {
  if (st.kind === 'spiral') {
    const r = st.r || 100;
    return [[1, 0.45], [0.45, 1], [0.78, 0.78]].map(([a, c]) => [st.x - a * r, st.y - c * r, st.x + a * r, st.y + c * r]);
  }
  const W = st.w, H = st.h;
  let parts = [[0, 0, W, H]];
  if (st.kind === 'quarter') {
    const b = Math.min(st.b || 90, W - 10, H - 10);
    parts = st.mirror ? [[0, 0, W, b], [W - b, 0, W, H]] : [[0, 0, W, b], [0, 0, b, H]];
  }
  const a = ((st.rot || 0) * Math.PI) / 180, c = Math.cos(a), si = Math.sin(a);
  const P = (lx, ly) => [st.x + lx * c - ly * si, st.y + lx * si + ly * c];
  return parts.map(([x0, y0, x1, y1]) => {
    const q = [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  });
}

/**
 * Generates the loops of a floor: every room with underfloor heating is covered completely, from the
 * manifold on that floor (with several manifolds: the one chosen for the room, else the nearest). Pipes
 * pass walls through doors, wall passages for CV and room dividers. Earlier generated pipes of the floor
 * are replaced, pipes drawn by hand stay. `planId`: the floor heating plan the pipes belong to.
 * Returns { loops (number), length (m), warnings: [text] }; call inside app.mutate.
 */
export function generateFloorHeating(b, floor, lib, planId) {
  const warnings = [];
  const cfg = heatCfg(b);
  const cols = floorCollectors(floor, lib);
  if (!cols.length) return { loops: 0, length: 0, warnings: [t('Geen collector op deze verdieping: plaats een collector (Technieken › CV).')] };
  const names = collectorNames(b, lib);
  const centre = (poly) => poly.reduce((a, p) => [a[0] + p[0] / poly.length, a[1] + p[1] / poly.length], [0, 0]);

  // rooms, each heated room with its manifold
  const rooms = [];
  for (const r of floor.rooms || []) {
    const rh = roomHeat(b, r);
    const poly = roomPolygon(floor, r);
    if (!poly || poly.length < 3) { if (rh.on) warnings.push(t('{r}: de ruimte is niet gesloten.', { r: r.name || '?' })); continue; }
    let col = cols.find((c) => c.id === r.ufh?.collector);
    if (!col) { const [cx, cy] = centre(poly); col = [...cols].sort((p, q) => Math.hypot(p.x - cx, p.y - cy) - Math.hypot(q.x - cx, q.y - cy))[0]; }
    rooms.push({ r, rh, poly, col });
  }
  if (!rooms.some((x) => x.rh.on)) return { loops: 0, length: 0, warnings: [...warnings, t('Geen ruimtes met vloerverwarming op deze verdieping (duid eerst de ruimtes aan op de plattegrond).')] };

  // doors, wall passages for CV and room dividers: where pipes get from one room to the next
  const doors = [];
  const byId = new Map(floor.walls.map((w) => [w.id, w]));
  for (const o of floor.openings || []) {
    const w = byId.get(o.wall);
    if (!w || isDivider(w) || !passable(o, 'cv')) continue;
    const g = wallGeom(w);
    const p = g.at(Math.max(0, o.pos - o.width / 2)), q = g.at(Math.min(g.len, o.pos + o.width / 2));
    doors.push({ a: [p.x, p.y], b: [q.x, q.y] });
  }
  for (const w of floor.walls) if (isDivider(w)) doors.push({ a: [w.x1, w.y1], b: [w.x2, w.y2] });

  // stairs, fitted cabinets and counters: no pipes underneath (unless ticked)
  const blocked = (floor.stairs || []).filter((st) => !st.heat).flatMap(stairBlocks);

  // out with the pipes generated before
  floor.shapes = (floor.shapes || []).filter((sh) => !(sh.type === 'pipe' && sh.gen));
  const used = new Set(allPipes(b).map(({ sh }) => sh.name));
  let count = floor.shapes.filter((x) => x.type === 'pipe').length, total = 0, made = 0;

  for (const col of cols) {
    const mine = rooms.filter((x) => x.rh.on && x.col === col);
    if (!mine.length) continue;
    const cname = names.get(col.id) || 'VV';
    const here = roomAt(floor, col.x, col.y);
    if (here && !mine.some((x) => x.r === here.room)) warnings.push(t('{c} staat in een ruimte zonder vloerverwarming ({r}): de kringen vertrekken in de dichtste verwarmde ruimte.', { c: cname, r: here.room.name || '?' }));
    const res = generate({
      spacing: cfg.spacing, maxLen: cfg.maxLen, margin: cfg.margin, t,
      rooms: rooms.map((x) => ({ id: x.r.id, name: x.r.name || '?', poly: x.poly, heat: x.rh.on && x.col === col, spacing: x.rh.spacing, maxLen: x.rh.maxLen })),
      doors, blocked, collector: { x: col.x, y: col.y, name: cname },
    });
    let n = 1;
    for (const l of res.loops) {
      while (used.has(`${cname}.${n}`)) n++;
      const name = `${cname}.${n}`;
      used.add(name);
      floor.shapes.push({
        id: uid('sh'), type: 'pipe', gen: true, pts: l.pts, plan: planId || undefined, collector: col.id, name,
        color: PIPE_COLORS[count++ % PIPE_COLORS.length], r: mine.find((x) => x.r.id === l.roomId)?.rh.spacing || cfg.spacing, label: l.label,
      });
      total += l.length; made++;
    }
    warnings.push(...res.warnings);
    const outlets = +col.props?.outlets || 0;
    if (outlets && res.loops.length > outlets) warnings.push(t('{c}: {n} kringen maar slechts {m} uitgangen.', { c: cname, n: res.loops.length, m: outlets }));
  }
  return { loops: made, length: Math.round(total * 10) / 10, warnings };
}

/** Removes the generated pipes of a floor (pipes drawn by hand stay). Returns how many. */
export function clearGenerated(floor) {
  const n = (floor.shapes || []).filter((sh) => sh.type === 'pipe' && sh.gen).length;
  if (n) floor.shapes = floor.shapes.filter((sh) => !(sh.type === 'pipe' && sh.gen));
  return n;
}
