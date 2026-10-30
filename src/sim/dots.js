// Flow dots of the simulation (cooling and fluid power lines): direction per wire, gradient colour and the
// wire that carries a line's value label.

const key = (x, y) => `${Math.round(x * 100)},${Math.round(y * 100)}`;

/**
 * Direction of the flow along the wires of a line (net) that lie on the way from the points where the flow
 * enters (`starts`) to the points where it leaves (`exits`); wires on side branches are left out (still).
 * Returns Map wireId -> true (flow along its points) / false (against them).
 */
export function flowDirections(net, starts, exits = []) {
  const out = new Map();
  if (!starts.length) return out;
  const adj = new Map();
  const link = (a, b, l) => { for (const [p, q] of [[a, b], [b, a]]) { if (!adj.has(p)) adj.set(p, []); adj.get(p).push([q, l]); } };
  for (const { wire } of net.wires) for (let k = 0; k + 1 < wire.points.length; k++) {
    const [[ax, ay], [bx, by]] = [wire.points[k], wire.points[k + 1]];
    link(key(ax, ay), key(bx, by), Math.hypot(bx - ax, by - ay));
    // entry and exit points in the middle of a segment are spliced in
    for (const [sx, sy] of [...starts, ...exits]) {
      const t = Math.abs(bx - ax) > Math.abs(by - ay) ? (sx - ax) / (bx - ax) : (sy - ay) / (by - ay);
      if (t > 0 && t < 1 && Math.hypot(ax + (bx - ax) * t - sx, ay + (by - ay) * t - sy) < 0.05) {
        link(key(sx, sy), key(ax, ay), Math.hypot(sx - ax, sy - ay));
        link(key(sx, sy), key(bx, by), Math.hypot(bx - sx, by - sy));
      }
    }
  }
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
  // per exit: distances back from it, to test whether a wire lies on a shortest way start → exit
  const back = exits.map(([x, y]) => [dijkstra([key(x, y)]), dist.get(key(x, y))]).filter(([, d]) => d != null);
  for (const { wire } of net.wires) {
    const p0 = key(...wire.points[0]), p1 = key(...wire.points[wire.points.length - 1]);
    const a = dist.get(p0), b = dist.get(p1);
    if (a == null && b == null) continue;
    const fwd = (a ?? Infinity) <= (b ?? Infinity);
    if (back.length) {
      const [u, v] = fwd ? [p0, p1] : [p1, p0];
      const len = wire.points.slice(1).reduce((s, p, k) => s + Math.hypot(p[0] - wire.points[k][0], p[1] - wire.points[k][1]), 0);
      if (!back.some(([d, total]) => Math.abs(dist.get(u) + len + (d.get(v) ?? Infinity) - total) < 0.05)) continue;
    }
    out.set(wire.id, fwd);
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
