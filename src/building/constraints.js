// Wall constraints, like in a CAD program: a straight wall can be locked horizontal, vertical or at a
// fixed angle (`w.cdir`: 'h' | 'v' | degrees, counter-clockwise on the screen) and to a fixed length
// (`w.clen`, cm). After an edit, solveWalls() moves the wall corners as little as possible until every
// constraint holds again; corners shared by walls stay shared and walls ending against another wall
// (T-junction) stay on it.

const r2 = (x) => Math.round(x * 100) / 100;
const end = (w, i) => (i === 1 ? [w.x1, w.y1] : [w.x2, w.y2]);
const put = (w, i, p) => { if (i === 1) { w.x1 = p[0]; w.y1 = p[1]; } else { w.x2 = p[0]; w.y2 = p[1]; } };
const straight = (w) => w.cx == null;

export const hasCons = (w) => straight(w) && (w.cdir != null || w.clen != null);
export const floorHasCons = (floor) => floor.walls.some(hasCons);

/** Angle of a wall in degrees, counter-clockwise on the screen, 0 … 180. */
export function wallAngle(w) {
  let a = (Math.atan2(-(w.y2 - w.y1), w.x2 - w.x1) * 180) / Math.PI;
  a = ((a % 180) + 180) % 180;
  return Math.round(a * 100) / 100 % 180;
}

/** Unit normal of the locked direction (the component of the wall along it must be 0). */
function dirNormal(cdir) {
  if (cdir === 'h') return [0, 1];
  if (cdir === 'v') return [1, 0];
  const a = (cdir * Math.PI) / 180;
  return [Math.sin(a), Math.cos(a)];
}

/** Text for the constraint badge on the plan. */
export function consLabel(w) {
  const parts = [];
  if (w.cdir === 'h') parts.push('H');
  else if (w.cdir === 'v') parts.push('V');
  else if (w.cdir != null) parts.push(`∠${String(Math.round(w.cdir * 10) / 10).replace('.', ',')}°`);
  if (w.clen != null) parts.push(`↔${String(Math.round(w.clen * 10) / 10).replace('.', ',')}`);
  return parts.join(' ');
}

/** How far a wall is off its own constraints (cm). */
export function consError(w) {
  if (!hasCons(w)) return 0;
  const d = [w.x2 - w.x1, w.y2 - w.y1];
  let e = 0;
  if (w.cdir != null) { const n = dirNormal(w.cdir); e = Math.max(e, Math.abs(d[0] * n[0] + d[1] * n[1])); }
  if (w.clen != null) e = Math.max(e, Math.abs(Math.hypot(d[0], d[1]) - w.clen));
  return e;
}

/**
 * How the walls hang together, taken before an edit: nodes (wall ends on the same point) and
 * T-junctions (a node lying on a straight wall between its ends).
 */
export function wallTopology(floor) {
  const nodes = [], endNode = new Map();
  for (const w of floor.walls) {
    const ids = [];
    for (const i of [1, 2]) {
      const p = end(w, i);
      let n = nodes.findIndex((nd) => Math.abs(nd.p[0] - p[0]) < 0.01 && Math.abs(nd.p[1] - p[1]) < 0.01);
      if (n < 0) { n = nodes.length; nodes.push({ p, ends: [] }); }
      nodes[n].ends.push([w, i]);
      ids.push(n);
    }
    endNode.set(w, ids);
  }
  const tees = [];
  for (const w of floor.walls) {
    if (!straight(w)) continue;
    const [a, b] = endNode.get(w);
    const A = nodes[a].p, B = nodes[b].p;
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (L < 1) continue;
    const u = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
    nodes.forEach((nd, k) => {
      if (k === a || k === b) return;
      const t = (nd.p[0] - A[0]) * u[0] + (nd.p[1] - A[1]) * u[1];
      const dist = Math.abs((nd.p[0] - A[0]) * u[1] - (nd.p[1] - A[1]) * u[0]);
      if (dist < 1 && t > 0.5 && t < L - 0.5) tees.push([k, w]);
    });
  }
  return { nodes, endNode, tees };
}

/** Copy of all wall coordinates, to undo a failed solve. */
export function snapWalls(floor) {
  return floor.walls.map((w) => [w, w.x1, w.y1, w.x2, w.y2]);
}
export function restoreWalls(snap) {
  for (const [w, x1, y1, x2, y2] of snap) { w.x1 = x1; w.y1 = y1; w.x2 = x2; w.y2 = y2; }
}

/**
 * Moves wall corners until all constraints hold. `topo` is taken before the edit; `pins` lists wall ends
 * ([wall, 1|2]) that the user placed and that must not move. Returns { ok, wall } – on failure (the
 * constraints cannot all hold) nothing is changed and `wall` is a wall whose constraint is in the way.
 */
export function solveWalls(floor, topo, pins = []) {
  const { nodes, endNode, tees } = topo;
  const live = new Set(floor.walls);
  // current node positions: a pinned end wins, otherwise the first end that still exists
  const P = nodes.map((nd) => {
    const e = nd.ends.find(([w]) => live.has(w));
    return e ? end(e[0], e[1]) : [...nd.p];
  });
  const inv = nodes.map(() => 1);
  for (const [w, i] of pins) {
    const k = endNode.get(w)?.[i - 1];
    if (k == null) continue;
    P[k] = end(w, i);
    inv[k] = 0;
  }
  const P0 = P.map((p) => [...p]);
  const cons = floor.walls.filter((w) => hasCons(w) && endNode.has(w)).map((w) => [w, ...endNode.get(w)]);
  const teeList = tees.filter(([, w]) => live.has(w));
  let worst = 0, worstWall = null;
  const sweep = () => {
    worst = 0; worstWall = null;
    for (const [w, a, b] of cons) {
      const ws = inv[a] + inv[b];
      if (w.cdir != null) {
        const n = dirNormal(w.cdir);
        const C = (P[b][0] - P[a][0]) * n[0] + (P[b][1] - P[a][1]) * n[1];
        if (Math.abs(C) > worst) { worst = Math.abs(C); worstWall = w; }
        if (ws) {
          const ka = (inv[a] / ws) * C, kb = (inv[b] / ws) * C;
          P[a][0] += ka * n[0]; P[a][1] += ka * n[1]; P[b][0] -= kb * n[0]; P[b][1] -= kb * n[1];
        }
      }
      if (w.clen != null) {
        const d = [P[b][0] - P[a][0], P[b][1] - P[a][1]];
        const cur = Math.hypot(d[0], d[1]);
        if (cur < 1e-6) continue;
        const C = cur - w.clen;
        if (Math.abs(C) > worst) { worst = Math.abs(C); worstWall = w; }
        if (ws) {
          const ka = (inv[a] / ws) * C / cur, kb = (inv[b] / ws) * C / cur;
          P[a][0] += ka * d[0]; P[a][1] += ka * d[1]; P[b][0] -= kb * d[0]; P[b][1] -= kb * d[1];
        }
      }
    }
    for (const [p, w] of teeList) {
      const [a, b] = endNode.get(w);
      const ab = [P[b][0] - P[a][0], P[b][1] - P[a][1]];
      const L = Math.hypot(ab[0], ab[1]);
      if (L < 1e-6) continue;
      const u = [ab[0] / L, ab[1] / L], n = [-u[1], u[0]];
      const t = Math.max(0, Math.min(1, ((P[p][0] - P[a][0]) * u[0] + (P[p][1] - P[a][1]) * u[1]) / L));
      const C = (P[p][0] - P[a][0]) * n[0] + (P[p][1] - P[a][1]) * n[1];
      if (Math.abs(C) > worst) { worst = Math.abs(C); worstWall = w; }
      const ws = inv[p] + inv[a] * (1 - t) ** 2 + inv[b] * t ** 2;
      if (!ws) continue;
      const l = C / ws;
      P[p][0] -= inv[p] * l * n[0]; P[p][1] -= inv[p] * l * n[1];
      P[a][0] += inv[a] * l * (1 - t) * n[0]; P[a][1] += inv[a] * l * (1 - t) * n[1];
      P[b][0] += inv[b] * l * t * n[0]; P[b][1] += inv[b] * l * t * n[1];
    }
  };
  for (let it = 0; it < 2000; it++) { sweep(); if (worst < 0.005) break; }
  sweep();
  if (worst > 0.5) return { ok: false, wall: worstWall };
  // exact horizontal / vertical: corners linked by H (V) walls get one common y (x), rounded once
  for (const [kind, ax] of [['h', 1], ['v', 0]]) {
    const parent = nodes.map((_, k) => k);
    const find = (k) => (parent[k] === k ? k : (parent[k] = find(parent[k])));
    for (const [w, a, b] of cons) if (w.cdir === kind) parent[find(a)] = find(b);
    const groups = new Map();
    for (const [w, a, b] of cons) if (w.cdir === kind) for (const k of [a, b]) {
      const r = find(k);
      if (!groups.has(r)) groups.set(r, new Set());
      groups.get(r).add(k);
    }
    for (const ks of groups.values()) {
      const list = [...ks];
      const pin = list.find((k) => inv[k] === 0);
      const v = pin != null ? P[pin][ax] : r2(list.reduce((t, k) => t + P[k][ax], 0) / list.length);
      for (const k of list) P[k][ax] = v;
    }
  }
  // a wall ending against an H / V wall: exactly on it
  for (const [p, w] of teeList) {
    if (inv[p] === 0) continue;
    const [a] = endNode.get(w);
    if (w.cdir === 'h') P[p][1] = P[a][1];
    else if (w.cdir === 'v') P[p][0] = P[a][0];
  }
  // write back the nodes that moved (and every end of a pinned node)
  nodes.forEach((nd, k) => {
    const moved = Math.abs(P[k][0] - P0[k][0]) > 1e-6 || Math.abs(P[k][1] - P0[k][1]) > 1e-6;
    const q = [r2(P[k][0]), r2(P[k][1])];
    for (const [w, i] of nd.ends) {
      if (!live.has(w)) continue;
      const cur = end(w, i);
      if (moved || cur[0] !== P[k][0] || cur[1] !== P[k][1]) put(w, i, moved ? q : [P[k][0], P[k][1]]);
    }
  });
  return { ok: true };
}

/**
 * Sets the direction constraint of a wall (null = free): turns the wall round its start point (keeping
 * its length), then lets the other walls follow. Returns false (and changes nothing) when that conflicts.
 */
export function setWallDir(floor, w, cdir) {
  const topo = wallTopology(floor), snap = snapWalls(floor);
  const old = w.cdir;
  if (cdir == null) { delete w.cdir; return true; }
  w.cdir = cdir;
  const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
  const a = cdir === 'h' ? 0 : cdir === 'v' ? 90 : cdir;
  // of the two directions along that angle, the one closest to the wall as it is
  const rad = (a * Math.PI) / 180;
  let u = [Math.cos(rad), -Math.sin(rad)];
  if (u[0] * (w.x2 - w.x1) + u[1] * (w.y2 - w.y1) < 0) u = [-u[0], -u[1]];
  const N = [r2(w.x1 + u[0] * len), r2(w.y1 + u[1] * len)];
  const k = topo.endNode.get(w)[1];
  for (const [o, i] of topo.nodes[k].ends) put(o, i, N);
  const res = solveWalls(floor, topo, [[w, 1], [w, 2]]);
  if (!res.ok) { restoreWalls(snap); if (old == null) delete w.cdir; else w.cdir = old; return false; }
  return true;
}

/** Locks every straight wall that is (nearly) horizontal or vertical; slightly crooked walls are straightened. */
export function lockStraightWalls(floor, tol = 1) {
  const topo = wallTopology(floor), snap = snapWalls(floor);
  const set = [];
  for (const w of floor.walls) {
    if (!straight(w) || w.cdir != null) continue;
    const a = wallAngle(w);
    const c = a < tol || a > 180 - tol ? 'h' : Math.abs(a - 90) < tol ? 'v' : null;
    if (c) { w.cdir = c; set.push(w); }
  }
  if (!set.length) return 0;
  const res = solveWalls(floor, topo, []);
  if (!res.ok) { restoreWalls(snap); for (const w of set) delete w.cdir; return -1; }
  return set.length;
}
