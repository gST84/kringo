// Building data model: floors (plans in centimetres), boards with residual current devices and circuits.
import { uid } from '../util.js';
import { t } from '../i18n.js';

export function newFloor(name = t('Gelijkvloers')) {
  return { id: uid('f'), name, walls: [], openings: [], stairs: [], texts: [], symbols: [], links: [], dims: [], shapes: [], bg: null };
}

// ---------- distribution tree ----------
// Boards, residual current devices and circuits form a tree through `parent`:
//   board (root: parent null) → rcd / circuit / sub-board
//   rcd → rcd / circuit / sub-board
//   circuit → sub-board (the circuit's breaker feeds that board)
// `pos` orders the children of one parent.

export function newBoard(name = t('Hoofdverdeelbord'), parent = null) {
  return {
    id: uid('bd'), name, parent, pos: 0,
    main: { In: 40, poles: 2, rcd: parent ? 0 : 300, type: 'A', kA: 3, cable: parent ? '' : 'XVB Cca 3G10²', meter: !parent },
  };
}

export function newRcd(parent, name = t('Differentieel 30 mA')) {
  return { id: uid('rc'), name, parent, pos: 0, sens: 30, In: 40, type: 'A', kA: 3, poles: 2 };
}

export function newCircuit(name, parent) {
  return { id: uid('k'), name, desc: '', parent, pos: 0, In: 20, poles: 2, curve: 'C', kA: 3, cable: 'VOB', fire: 'Eca', cores: '3G', section: 2.5, install: 'tube-wall' };
}

export function newBuilding() {
  const board = newBoard();
  const rcd = newRcd(board.id);
  return {
    scale: 50, // 1:50
    grid: 5, // cm
    floors: [newFloor()],
    boards: [board],
    rcds: [rcd],
    circuits: [newCircuit('A', rcd.id)],
  };
}

export function normalizeBuilding(b) {
  const d = newBuilding();
  if (!b) return d;
  b.scale ||= 50;
  b.grid ||= 5;
  b.floors ||= [];
  if (!b.floors.length) b.floors.push(newFloor());
  for (const f of b.floors) { f.walls ||= []; f.openings ||= []; f.stairs ||= []; f.texts ||= []; f.symbols ||= []; f.links ||= []; f.dims ||= []; f.shapes ||= []; f.bg ||= null; }
  b.boards ||= d.boards;
  if (!b.boards.length) b.boards.push(newBoard());
  b.rcds ||= [];
  b.circuits ||= [];
  // migrate the flat structure (board.rcds, circuit.board / circuit.rcd) to the tree
  for (const bd of b.boards) {
    bd.main ||= { In: 40, poles: 2, rcd: 300 };
    if (bd.parent === undefined) bd.parent = null;
    for (const r of bd.rcds || []) b.rcds.push({ ...r, parent: bd.id });
    delete bd.rcds;
  }
  b.circuits.forEach((c, i) => {
    if (c.parent === undefined) c.parent = (c.rcd && b.rcds.some((r) => r.id === c.rcd)) ? c.rcd : c.board || b.boards[0].id;
    delete c.rcd; delete c.board;
    if (c.pos === undefined) c.pos = 100 + i;
    if (c.install === undefined) c.install = b.cableMarks === false ? 'none' : 'tube-wall';
  });
  b.rcds.forEach((r, i) => { if (r.pos === undefined) r.pos = 500 + i; });
  b.boards.forEach((bd, i) => { if (bd.pos === undefined) bd.pos = 900 + i; });
  return b;
}

/** Any node of the tree: {type: 'board' | 'rcd' | 'circuit', node}. */
export function treeNode(b, id) {
  let n = b.boards.find((x) => x.id === id);
  if (n) return { type: 'board', node: n };
  n = b.rcds.find((x) => x.id === id);
  if (n) return { type: 'rcd', node: n };
  n = b.circuits.find((x) => x.id === id);
  if (n) return { type: 'circuit', node: n };
  return null;
}

/** Children of a node, in order. */
export function treeChildren(b, id) {
  return [
    ...b.rcds.filter((r) => r.parent === id).map((node) => ({ type: 'rcd', node })),
    ...b.circuits.filter((c) => c.parent === id).map((node) => ({ type: 'circuit', node })),
    ...b.boards.filter((x) => x.parent === id).map((node) => ({ type: 'board', node })),
  ].sort((x, y) => (x.node.pos ?? 0) - (y.node.pos ?? 0));
}

/** Ancestors of a node, nearest first. */
export function treeAncestors(b, id) {
  const out = [];
  let cur = treeNode(b, id);
  const seen = new Set();
  while (cur && cur.node.parent && !seen.has(cur.node.parent)) {
    seen.add(cur.node.parent);
    cur = treeNode(b, cur.node.parent);
    if (cur) out.push(cur);
  }
  return out;
}

/** The board a node belongs to (itself for a board). */
export function boardOf(b, id) {
  const t = treeNode(b, id);
  if (t?.type === 'board') return t.node;
  return treeAncestors(b, id).find((a) => a.type === 'board')?.node || null;
}

/** Root boards (not fed from another board). */
export const rootBoards = (b) => b.boards.filter((x) => !x.parent || !treeNode(b, x.parent));

/** Next sibling position under a parent. */
export const nextPos = (b, parent) => Math.max(0, ...treeChildren(b, parent).map((c) => (c.node.pos ?? 0) + 1));

/** Removes a node and everything below it; symbols of removed circuits lose their circuit. */
export function removeNode(b, id) {
  for (const c of treeChildren(b, id)) removeNode(b, c.node.id);
  b.boards = b.boards.filter((x) => x.id !== id);
  b.rcds = b.rcds.filter((x) => x.id !== id);
  b.circuits = b.circuits.filter((x) => x.id !== id);
}

/** Next free circuit letter: A … Z, AA … */
export function nextCircuitName(b) {
  const used = new Set(b.circuits.map((c) => c.name));
  for (let i = 0; i < 702; i++) {
    const n = i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26));
    if (!used.has(n)) return n;
  }
  return 'K' + b.circuits.length;
}

/** All symbols of a circuit over all floors, in circuit order. */
export function circuitSymbols(b, circuitId) {
  const out = [];
  for (const f of b.floors) for (const s of f.symbols) if (s.circuit === circuitId) out.push({ s, floor: f });
  return out.sort((a, b2) => (a.s.n || 0) - (b2.s.n || 0));
}

/**
 * Symbols connected through links on a floor (a switch and the lights it controls …). Domotics links
 * are left out: push buttons and outputs of a domotics system are on different circuits.
 */
export function linkGroup(floor, id, lib) {
  const byId = new Map(floor.symbols.map((x) => [x.id, x]));
  const dom = (s) => ['dom-in', 'dom-out'].includes(lib?.get(s?.sym)?.kind);
  const seen = new Set([id]);
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift();
    for (const l of floor.links) {
      const other = l.a === cur ? l.b : l.b === cur ? l.a : null;
      if (!other || seen.has(other) || !byId.has(other)) continue;
      if (dom(byId.get(cur)) || dom(byId.get(other))) continue;
      seen.add(other);
      queue.push(other);
    }
  }
  return [...seen].map((x) => byId.get(x)).filter(Boolean);
}

/** Gives a symbol and everything linked to it the same circuit and number (a new number when n is not given). */
export function setGroupCircuit(b, floor, id, circuit, n, lib) {
  const group = linkGroup(floor, id, lib);
  const ids = new Set(group.map((s) => s.id));
  if (circuit && !(n > 0)) {
    // next free number, not counting the group itself
    let max = 0;
    for (const { s } of circuitSymbols(b, circuit)) if (!ids.has(s.id)) max = Math.max(max, s.n || 0);
    n = max + 1;
  }
  for (const s of group) {
    s.circuit = circuit || '';
    if (circuit) s.n = n; else delete s.n;
  }
  return group;
}

export function nextNumber(b, circuitId) {
  let max = 0;
  for (const { s } of circuitSymbols(b, circuitId)) max = Math.max(max, s.n || 0);
  return max + 1;
}

/** Wall geometry helpers (centimetres). */
export function wallFrame(w) {
  const dx = w.x2 - w.x1, dy = w.y2 - w.y1;
  const len = Math.hypot(dx, dy) || 1;
  const u = [dx / len, dy / len];
  return { len, u, n: [-u[1], u[0]] };
}

const TAU = Math.PI * 2;
const norm = (a) => ((a % TAU) + TAU) % TAU;

/**
 * Geometry of a wall: a straight wall, or an arc through (cx, cy) when the wall has one.
 * `at(t)` gives the point t cm along the wall's centre line with its tangent u and normal n.
 */
export function wallGeom(w) {
  if (w.cx != null && w.cy != null) {
    const [ax, ay, bx, by, cx, cy] = [w.x1, w.y1, w.cx, w.cy, w.x2, w.y2];
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(d) > 1e-6) {
      const A = ax * ax + ay * ay, B = bx * bx + by * by, C = cx * cx + cy * cy;
      const ox = (A * (by - cy) + B * (cy - ay) + C * (ay - by)) / d;
      const oy = (A * (cx - bx) + B * (ax - cx) + C * (bx - ax)) / d;
      const r = Math.hypot(ax - ox, ay - oy);
      const a1 = Math.atan2(ay - oy, ax - ox);
      const s = norm(Math.atan2(cy - oy, cx - ox) - a1);
      const sm = norm(Math.atan2(by - oy, bx - ox) - a1);
      const dir = sm < s ? 1 : -1;
      const sweep = dir === 1 ? s : TAU - s;
      if (r < 1e6 && sweep > 1e-4) {
        const len = r * sweep;
        const at = (t) => {
          const a = a1 + (dir * t) / r;
          const u = [-Math.sin(a) * dir, Math.cos(a) * dir];
          return { x: ox + r * Math.cos(a), y: oy + r * Math.sin(a), u, n: [-u[1], u[0]] };
        };
        return { arc: true, len, at, ox, oy, r, a1, dir, sweep };
      }
    }
  }
  const { len, u, n } = wallFrame(w);
  return { arc: false, len, u, n, at: (t) => ({ x: w.x1 + u[0] * t, y: w.y1 + u[1] * t, u, n }) };
}

/** Closest point on a wall to (x, y): {t (cm from start), d (signed distance, + = normal side), x, y}. */
export function projectOnWall(w, x, y) {
  const g = wallGeom(w);
  let t;
  if (g.arc) {
    const delta = norm((Math.atan2(y - g.oy, x - g.ox) - g.a1) * g.dir);
    t = delta <= g.sweep ? delta * g.r : (delta - g.sweep < TAU - delta ? g.len : 0);
  } else {
    t = Math.max(0, Math.min(g.len, (x - w.x1) * g.u[0] + (y - w.y1) * g.u[1]));
  }
  const p = g.at(t);
  const d = (x - p.x) * p.n[0] + (y - p.y) * p.n[1];
  return { t, d, x: p.x, y: p.y, len: g.len };
}

/** Points along a wall from t0 to t1 at a distance `off` from its centre line (polyline for arcs). */
export function wallPath(w, t0, t1, off, g = wallGeom(w)) {
  const steps = g.arc ? Math.max(1, Math.ceil((Math.abs(t1 - t0) / g.r) / (Math.PI / 48))) : 1;
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const p = g.at(t0 + ((t1 - t0) * i) / steps);
    out.push([p.x + p.n[0] * off, p.y + p.n[1] * off]);
  }
  return out;
}

/** Sets a stair's rotation (degrees, clockwise); rectangular stairs turn around their centre. */
export function rotateStair(st, deg) {
  deg = ((Math.round(deg) % 360) + 360) % 360;
  if (st.kind !== 'spiral') {
    const R = (a, lx, ly) => [lx * Math.cos(a) - ly * Math.sin(a), lx * Math.sin(a) + ly * Math.cos(a)];
    const [cx, cy] = R(((st.rot || 0) * Math.PI) / 180, st.w / 2, st.h / 2);
    const [nx, ny] = R((deg * Math.PI) / 180, st.w / 2, st.h / 2);
    st.x = Math.round((st.x + cx - nx) * 100) / 100;
    st.y = Math.round((st.y + cy - ny) * 100) / 100;
  }
  st.rot = deg;
}

/** Area of a polygon (cm²). */
export function polygonArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

export function nearestWall(floor, x, y, maxDist) {
  let best = null;
  for (const w of floor.walls) {
    const p = projectOnWall(w, x, y);
    const dist = Math.abs(p.d) - (w.t || 20) / 2;
    if (dist <= maxDist && (!best || dist < best.dist)) best = { wall: w, ...p, dist };
  }
  return best;
}
