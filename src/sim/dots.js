// Flow dots of the simulation (cooling and fluid power lines): direction and share of the flow per piece of
// wire, gradient colour and the wire that carries a line's value label.

const key = (x, y) => `${Math.round(x * 100)},${Math.round(y * 100)}`;
const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05;

/**
 * Splits the wires of a line (net) at every junction and finds the flow in each piece.
 * `starts`: points where the flow enters the line; `exits`: points where it leaves.
 * Returns Map wireId -> [{pts (in flow direction), pairs: [[start, exit] …] whose shortest way runs through
 * this piece (empty = no flow, e.g. a side branch)}]. Without exits every reached piece gets `pairs: null`.
 */
export function flowPieces(net, starts, exits = []) {
  const out = new Map();
  if (!starts.length) return out;
  const wires = net.wires.map(({ wire }) => wire).filter((w) => w.points.length > 1);
  // junctions: wire ends (they may sit on another wire's segment), entry and exit points
  const special = [...wires.flatMap((w) => [w.points[0], w.points[w.points.length - 1]]), ...starts, ...exits];
  const pieces = []; // {wire, pts, a, b, len}
  for (const w of wires) {
    let cur = [w.points[0]];
    const cut = () => {
      if (cur.length > 1) {
        const len = cur.slice(1).reduce((s, p, k) => s + Math.hypot(p[0] - cur[k][0], p[1] - cur[k][1]), 0);
        pieces.push({ wire: w, pts: cur, a: key(...cur[0]), b: key(...cur[cur.length - 1]), len });
      }
      cur = [cur[cur.length - 1]];
    };
    for (let k = 0; k + 1 < w.points.length; k++) {
      const [ax, ay] = w.points[k], [bx, by] = w.points[k + 1];
      const horiz = Math.abs(bx - ax) > Math.abs(by - ay);
      const inner = special
        .map((p) => [p, horiz ? (p[0] - ax) / (bx - ax) : (p[1] - ay) / (by - ay)])
        .filter(([p, t]) => t > 1e-6 && t < 1 - 1e-6 && near([ax + (bx - ax) * t, ay + (by - ay) * t], p))
        .sort((x, y) => x[1] - y[1]);
      for (const [p] of inner) { if (!near(cur[cur.length - 1], p)) cur.push(p); cut(); }
      cur.push(w.points[k + 1]);
      if (k + 2 < w.points.length && special.some((p) => near(p, w.points[k + 1]))) cut();
    }
    cut();
  }
  const adj = new Map();
  for (const pc of pieces) for (const [p, q] of [[pc.a, pc.b], [pc.b, pc.a]]) { if (!adj.has(p)) adj.set(p, []); adj.get(p).push([q, pc.len]); }
  const dijkstra = (from) => {
    const dist = new Map(from.map((k) => [k, 0]));
    const todo = [...dist.keys()];
    while (todo.length) {
      todo.sort((a, b) => dist.get(b) - dist.get(a));
      const n = todo.pop();
      for (const [m, l] of adj.get(n) || []) {
        const d = dist.get(n) + l;
        if (d < (dist.get(m) ?? Infinity)) { dist.set(m, d); todo.push(m); }
      }
    }
    return dist;
  };
  const dist = dijkstra(starts.map(([x, y]) => key(x, y)));
  // distances from every start and back from every exit: a piece carries the flow of a pair start → exit
  // when it lies on the shortest way between them
  const dS = starts.map(([x, y]) => dijkstra([key(x, y)]));
  const dE = exits.map(([x, y]) => dijkstra([key(x, y)]));
  for (const pc of pieces) {
    const da = dist.get(pc.a), db = dist.get(pc.b);
    if (da == null && db == null) continue;
    let fwd = (da ?? Infinity) <= (db ?? Infinity);
    let pairs = null;
    if (exits.length) {
      pairs = [];
      let votes = 0;
      dS.forEach((s, i) => dE.forEach((e, j) => {
        const total = s.get(key(...exits[j]));
        if (total == null) return;
        for (const [u, v, dir] of [[pc.a, pc.b, 1], [pc.b, pc.a, -1]]) {
          if (Math.abs((s.get(u) ?? Infinity) + pc.len + (e.get(v) ?? Infinity) - total) < 0.05) { pairs.push([i, j]); votes += dir; break; }
        }
      }));
      if (votes) fwd = votes > 0;
    }
    if (!out.has(pc.wire.id)) out.set(pc.wire.id, []);
    out.get(pc.wire.id).push({ pts: fwd ? pc.pts : [...pc.pts].reverse(), pairs });
  }
  return out;
}

/** Colour from blue (f = 0) over magenta to red (f = 1). */
export const gradient = (f) => `hsl(${Math.round(240 + 120 * Math.max(0, Math.min(1, f))) % 360} 80% 47%)`;

const labelWires = new WeakMap();
/** The wire with the longest segment of a line (carries the value label). */
export function labelWire(net) {
  if (labelWires.has(net)) return labelWires.get(net);
  let best = null, len = -1;
  for (const { wire } of net.wires) for (let k = 0; k + 1 < wire.points.length; k++) {
    const [a, b] = [wire.points[k], wire.points[k + 1]];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > len) { len = l; best = wire.id; }
  }
  labelWires.set(net, best);
  return best;
}

/**
 * The moving dots of every piece of wire: speed (mm/s) per piece from the flows of the exits it feeds;
 * `advance(dt)` moves them, `state(wireId, gap)` gives the dot polylines to draw.
 */
export class DotPieces {
  constructor() { this.pieces = new Map(); this.travel = new Map(); }

  /** Splits the flowing lines: `lines` = [{net, starts, exits}]. */
  set(lines) {
    this.pieces = new Map();
    for (const { net, starts, exits } of lines) {
      for (const [w, list] of flowPieces(net, starts, exits)) this.pieces.set(w, list.map((p, k) => ({ ...p, net, id: `${w}:${k}`, v: 0 })));
    }
  }

  /**
   * Speeds per piece. `fn(net)` -> {inflow: [mm/s per start], outflow: [share or flow per exit]}: every
   * start's flow divides over the exits in proportion to their outflow; a piece moves with the sum of the
   * pairs that run through it (pieces of lines without exits move with the total inflow).
   */
  speeds(fn) {
    for (const list of this.pieces.values()) for (const p of list) {
      const { inflow = [], outflow = [] } = fn(p.net) || {};
      if (!p.pairs) { p.v = inflow.reduce((s, x) => s + x, 0); continue; }
      const out = outflow.reduce((s, x) => s + x, 0) || 1;
      p.v = p.pairs.reduce((s, [i, j]) => s + (inflow[i] || 0) * ((outflow[j] || 0) / out), 0);
    }
  }

  advance(dt) {
    for (const list of this.pieces.values()) for (const p of list) if (p.v) this.travel.set(p.id, ((this.travel.get(p.id) || 0) + p.v * dt) % 1000);
  }

  /** Dot polylines of a wire: [{pts, off}], or null when the wire is not part of a known flowing line. */
  state(wireId, gap) {
    const list = this.pieces.get(wireId);
    if (!list) return null;
    return list.map((p) => ({ pts: p.pts, off: p.v ? -((this.travel.get(p.id) || 0) % gap) : 0 }));
  }
}
