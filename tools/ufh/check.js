// Measures a generated floor heating plan (cold spots, crossing pipes) and draws it as SVG.
import { inPoly, crossings as findCrossings } from '../../src/building/ufh.js';

const segDist = (x, y, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy || 1;
  const k = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l));
  return Math.hypot(x - a[0] - dx * k, y - a[1] - dy * k);
};

/**
 * { rooms: [{ name, max (cm to the nearest pipe), cold (% of the floor beyond `limit`) }], cold: [[x, y]],
 *   crossings: [[x, y]], worst, coldPct } – limit defaults to 1.25 × the pipe spacing.
 */
export function check(input, res, step = 5) {
  const B = 40, grid = new Map();
  const segs = [];
  res.loops.forEach((l, li) => { for (let i = 0; i + 1 < l.pts.length; i++) segs.push({ a: l.pts[i], b: l.pts[i + 1], li, i }); });
  for (const s of segs) {
    const x0 = Math.floor(Math.min(s.a[0], s.b[0]) / B), x1 = Math.floor(Math.max(s.a[0], s.b[0]) / B);
    const y0 = Math.floor(Math.min(s.a[1], s.b[1]) / B), y1 = Math.floor(Math.max(s.a[1], s.b[1]) / B);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const k = x + ',' + y; let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(s); }
  }
  const near = (x, y) => {
    let m = B;
    const gx = Math.floor(x / B), gy = Math.floor(y / B);
    for (let i = gx - 1; i <= gx + 1; i++) for (let j = gy - 1; j <= gy + 1; j++) for (const s of grid.get(i + ',' + j) || []) { const d = segDist(x, y, s.a, s.b); if (d < m) m = d; }
    return m;
  };
  const rooms = [], cold = [];
  let worst = 0, tot = 0, bad = 0;
  for (const r of input.rooms) {
    if (r.heat === false) continue;
    const limit = 1.25 * (r.spacing || input.spacing || 15);
    const xs = r.poly.map((p) => p[0]), ys = r.poly.map((p) => p[1]);
    let n = 0, c = 0, max = 0;
    for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step) for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step) {
      if (!inPoly(x, y, r.poly)) continue;
      if ((input.blocked || []).some(([x0, y0, x1, y1]) => x > x0 && x < x1 && y > y0 && y < y1)) continue;
      n++;
      const d = near(x, y);
      if (d > max) max = d;
      if (d > limit) { c++; cold.push([x, y]); }
    }
    rooms.push({ name: r.name, max: Math.round(max * 10) / 10, cold: Math.round((1000 * c) / (n || 1)) / 10 });
    worst = Math.max(worst, max); tot += n; bad += c;
  }
  const crossings = res.crossings || findCrossings(res.loops);
  return { rooms, cold, crossings, worst: Math.round(worst * 10) / 10, coldPct: Math.round((1000 * bad) / (tot || 1)) / 10 };
}

const COLORS = ['#e03131', '#1c3fd8', '#2f9e44', '#e8590c', '#7048e8', '#0c8599', '#c2255c', '#5c940d'];

/** Path with rounded corners through points. */
export function rounded(P, rad) {
  let d = `M ${P[0][0]} ${P[0][1]}`;
  for (let i = 1; i + 1 < P.length; i++) {
    const [ax, ay] = P[i - 1], [bx, by] = P[i], [cx, cy] = P[i + 1];
    const l1 = Math.hypot(bx - ax, by - ay), l2 = Math.hypot(cx - bx, cy - by);
    const r = Math.min(rad, l1 / 2, l2 / 2);
    if (r < 0.5) { d += ` L ${bx} ${by}`; continue; }
    const f = (v) => Math.round(v * 10) / 10;
    d += ` L ${f(bx - ((bx - ax) / l1) * r)} ${f(by - ((by - ay) / l1) * r)} Q ${bx} ${by} ${f(bx + ((cx - bx) / l2) * r)} ${f(by + ((cy - by) / l2) * r)}`;
  }
  const e = P[P.length - 1];
  return d + ` L ${e[0]} ${e[1]}`;
}

export function svg(input, res, chk, opts = {}) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of input.rooms) for (const [x, y] of r.poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  x0 -= 30; y0 -= 30; x1 += 30; y1 += 30;
  const w = opts.width || 1800;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${Math.round((w * (y1 - y0)) / (x1 - x0))}" viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" font-family="Helvetica, Arial, sans-serif">`;
  s += `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="#9a9a9a"/>`;
  for (const r of input.rooms) s += `<polygon points="${r.poly.map((p) => p.join(',')).join(' ')}" fill="${r.heat === false ? '#d8d8d8' : '#eef3ff'}" stroke="#555" stroke-width="1"/>`;
  for (const d of input.doors || []) s += `<line x1="${d.a[0]}" y1="${d.a[1]}" x2="${d.b[0]}" y2="${d.b[1]}" stroke="#eef3ff" stroke-width="16"/>`;
  if (opts.cells) for (const c of res.cells) s += `<rect x="${c.x0}" y="${c.y0}" width="${c.x1 - c.x0}" height="${c.y1 - c.y0}" fill="none" stroke="#bbb" stroke-width="0.4"/>`;
  for (const [x, y] of chk?.cold || []) s += `<rect x="${x - 2.5}" y="${y - 2.5}" width="5" height="5" fill="#ff9800"/>`;
  res.loops.forEach((l, i) => { s += `<path d="${rounded(l.pts, opts.radius ?? 6)}" fill="none" stroke="${COLORS[i % COLORS.length]}" stroke-width="1.6" stroke-linejoin="round"/>`; });
  for (const [x, y] of chk?.crossings || []) s += `<circle cx="${x}" cy="${y}" r="7" fill="none" stroke="#000" stroke-width="2"/>`;
  for (const r of input.rooms) { const cx = r.poly.reduce((a, p) => a + p[0], 0) / r.poly.length, cy = r.poly.reduce((a, p) => a + p[1], 0) / r.poly.length; s += `<text x="${cx}" y="${cy}" font-size="13" font-weight="bold" text-anchor="middle" fill="#000" stroke="#fff" stroke-width="3" paint-order="stroke">${r.name}</text>`; }
  res.loops.forEach((l, i) => { const [x, y] = l.label; s += `<text x="${x}" y="${y + 3}" font-size="9" text-anchor="middle" fill="${COLORS[i % COLORS.length]}" stroke="#fff" stroke-width="3" paint-order="stroke">${l.name} · ${l.length} m</text>`; });
  if (input.collector) s += `<rect x="${input.collector.x - 30}" y="${input.collector.y - 4}" width="60" height="8" fill="#fff" stroke="#000"/>`;
  return s + '</svg>';
}
