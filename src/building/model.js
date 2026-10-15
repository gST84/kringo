// Building data model: floors (plans in centimetres), boards with residual current devices and circuits.
import { uid } from '../util.js';

export function newFloor(name = 'Gelijkvloers') {
  return { id: uid('f'), name, walls: [], openings: [], stairs: [], texts: [], symbols: [], links: [] };
}

export function newBoard(name = 'Hoofdverdeelbord') {
  return {
    id: uid('bd'), name,
    main: { In: 40, poles: 2, rcd: 300, type: 'A', kA: 3, cable: 'XVB Cca 3G10²', meter: true }, // general residual current device (mA, 0 = none)
    rcds: [{ id: uid('rc'), name: 'Differentieel 30 mA', sens: 30, In: 40, type: 'A', kA: 3, poles: 2 }],
  };
}

export function newCircuit(name, boardId) {
  return { id: uid('k'), name, desc: '', board: boardId, rcd: '', In: 20, poles: 2, curve: 'C', kA: 3, cable: 'VOB', fire: 'Eca', cores: '3G', section: 2.5 };
}

export function newBuilding() {
  const board = newBoard();
  return {
    scale: 50, // 1:50
    grid: 5, // cm
    floors: [newFloor('Gelijkvloers')],
    boards: [board],
    circuits: [newCircuit('A', board.id)],
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
  for (const bd of b.boards) { bd.main ||= { In: 40, poles: 2, rcd: 300 }; bd.rcds ||= []; }
  b.circuits ||= [];
  return b;
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
