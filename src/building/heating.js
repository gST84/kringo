// Underfloor heating, drawn by hand on the CV plan: a pipe is a polyline (shape of type 'pipe') that
// snaps to a grid per room – the room's pipe spacing, starting at the wall distance – so loops come out
// evenly spaced. This module holds the settings, the room grid and the lengths.
import { pathLength } from './render.js';
import { roomPolygon } from './rooms.js';

export const HEAT_DEFAULTS = {
  spacing: 15, // cm between pipes (grid of a room)
  maxLen: 100, // m per loop
  margin: 10, // cm from the wall to the first pipe
};
export const heatCfg = (b) => ({ ...HEAT_DEFAULTS, ...(b.heatCfg || {}) });
/** Settings of a room (its own values over the project defaults). */
export const roomHeat = (b, r) => {
  const c = heatCfg(b), u = r?.ufh || {};
  return { spacing: +u.spacing || c.spacing, maxLen: +u.maxLen || c.maxLen };
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
