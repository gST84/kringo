// Building data model: floors (plans in centimetres), boards with residual current devices and circuits.
import { uid } from '../util.js';
import { t } from '../i18n.js';

export function newFloor(name = t('Gelijkvloers')) {
  return { id: uid('f'), name, walls: [], openings: [], stairs: [], texts: [], symbols: [], links: [] };
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
  for (const f of b.floors) { f.walls ||= []; f.openings ||= []; f.stairs ||= []; f.texts ||= []; f.symbols ||= []; f.links ||= []; }
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

/** Closest point on a wall to (x, y): {t (cm from start), d (signed distance, + = normal side), x, y}. */
export function projectOnWall(w, x, y) {
  const { len, u, n } = wallFrame(w);
  let t = (x - w.x1) * u[0] + (y - w.y1) * u[1];
  t = Math.max(0, Math.min(len, t));
  const px = w.x1 + u[0] * t, py = w.y1 + u[1] * t;
  const d = (x - px) * n[0] + (y - py) * n[1];
  return { t, d, x: px, y: py, len };
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
