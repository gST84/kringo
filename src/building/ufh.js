// Underfloor heating generator – pure (no DOM, no imports), so it also runs from the command line (tools/ufh).
//
// Idea: every heated room is cut into cells of twice the pipe spacing. The loops are trees of cells
// rooted at the manifold, and the pipe of a loop is the outline around its tree (out along the left
// side, back along the right side). A tree that winds inwards gives the classic counter-flow spiral.
// As every cell belongs to exactly one tree, the whole floor is covered: the feed pipes on their way to
// a room are part of the loop and heat the floor they pass. Where there is no room for a cell per loop
// (doors, near the manifold) several loops share a cell and run side by side at a tighter pitch.
//
// generate(input) → { loops: [{ name, room, pts: [[x, y]], length (m), maxLen }], warnings, minPitch, cells }
// input: { spacing, maxLen, margin (cm / m / cm), rooms: [{ id, name, poly: [[x, y]], heat?, spacing?, maxLen? }],
//          doors: [{ a: [x, y], b: [x, y] }] (opening on the wall line; also open room borders and wall passages),
//          collector: { x, y, name? }, blocked: [[x0, y0, x1, y1]], t?: translate(text, args) } – all in cm.

export const DEFAULTS = { spacing: 15, maxLen: 100, margin: 10, minPitch: 3, portPitch: 5, minLoop: 6, feedPitch: 5, shareLow: 0.6, shareHigh: 2, openCost: 0.4 };

const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0]; // N E S W (y down)
const LEFT = (d) => (d + 3) & 3, RIGHT = (d) => (d + 1) & 3, BACK = (d) => (d + 2) & 3;
const ROOT = { root: true };
const plain = (s, a) => s.replace(/\{(\w+)\}/g, (m, k) => a?.[k] ?? m);

// ---------------------------------------------------------------- geometry helpers
export const inPoly = (x, y, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/** Polygon moved inwards by d (mitred corners; fine for the mostly right-angled outlines of rooms). */
function inset(poly, d) {
  if (d <= 0) return poly;
  const n = poly.length;
  const [ax, ay] = poly[0], [bx, by] = poly[1];
  const l0 = Math.hypot(bx - ax, by - ay) || 1;
  let sign = 1;
  if (!inPoly((ax + bx) / 2 + ((by - ay) / l0) * 0.5, (ay + by) / 2 - ((bx - ax) / l0) * 0.5, poly)) sign = -1;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % n];
    const l = Math.hypot(x2 - x1, y2 - y1) || 1;
    const nx = (sign * (y2 - y1)) / l, ny = (-sign * (x2 - x1)) / l;
    lines.push([x1 + nx * d, y1 + ny * d, x2 - x1, y2 - y1]);
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const [px, py, pdx, pdy] = lines[(i + n - 1) % n], [qx, qy, qdx, qdy] = lines[i];
    const den = pdx * qdy - pdy * qdx;
    if (Math.abs(den) < 1e-9) { out.push([qx, qy]); continue; }
    const t = ((qx - px) * qdy - (qy - py) * qdx) / den;
    out.push([px + pdx * t, py + pdy * t]);
  }
  return out;
}

/** Grid lines through the corners of an outline, the stretches in between cut into cells of about cw. */
function gridLines(vals, cw) {
  const u = [...vals].sort((a, b) => a - b).filter((v, i, a) => !i || v - a[i - 1] > 1);
  for (let k = 0; k + 1 < u.length;) { // a sliver between two corners joins its neighbour
    if (u[k + 1] - u[k] < 8 && u.length > 2) u.splice(k + 1 < u.length - 1 ? k + 1 : k, 1);
    else k++;
  }
  const out = [u[0]];
  for (let k = 0; k + 1 < u.length; k++) {
    const w = u[k + 1] - u[k];
    const n = Math.max(1, Math.ceil(w / (cw * 1.15) - 1e-9));
    for (let i = 1; i <= n; i++) out.push(u[k] + (w * i) / n);
  }
  return out;
}

// ---------------------------------------------------------------- grid
function buildGrid(input, cfg) {
  const cells = [];
  const rooms = input.rooms.map((r, ri) => ({ ...r, ri, cells: [], s: +r.spacing || cfg.spacing, max: +r.maxLen || cfg.maxLen }));
  for (const room of rooms) {
    if (room.heat === false) continue;
    const poly = inset(room.poly, Math.max(0, cfg.margin - room.s / 2));
    const xs = gridLines(poly.map((p) => p[0]), room.s * 2), ys = gridLines(poly.map((p) => p[1]), room.s * 2);
    const at = new Map();
    for (let j = 0; j + 1 < ys.length; j++) for (let i = 0; i + 1 < xs.length; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
      if (!inPoly(cx, cy, poly)) continue;
      // no cell where its pipe (half a spacing inside the cell edges) would run over a blocked area
      const m = room.s / 2 - 0.5;
      if ((input.blocked || []).some(([x0, y0, x1, y1]) => x0 < xs[i + 1] - m && x1 > xs[i] + m && y0 < ys[j + 1] - m && y1 > ys[j] + m)) continue;
      const c = { id: cells.length, room: room.ri, i, j, x0: xs[i], x1: xs[i + 1], y0: ys[j], y1: ys[j + 1], cx, cy, nb: [null, null, null, null], adj: [], nbe: [null, null, null, null] };
      c.len = (c.x1 - c.x0) + (c.y1 - c.y0); // pipe in the cell (cm)
      cells.push(c); room.cells.push(c); at.set(i + ',' + j, c);
    }
    for (const c of room.cells) for (let d = 0; d < 4; d++) {
      const o = at.get((c.i + DX[d]) + ',' + (c.j + DY[d]));
      if (!o) continue;
      c.nb[d] = o;
      const e = { from: c, to: o, dir: d, link: false, lo: d & 1 ? c.y0 : c.x0, hi: d & 1 ? c.y1 : c.x1 };
      c.adj.push(e); c.nbe[d] = e;
    }
  }
  // doors, open room borders and wall passages: links between the cells on both sides
  const TOL = 32, JAMB = 3, MINW = 10;
  for (const door of input.doors || []) {
    const vert = Math.abs(door.a[0] - door.b[0]) < Math.abs(door.a[1] - door.b[1]);
    const w = vert ? (door.a[0] + door.b[0]) / 2 : (door.a[1] + door.b[1]) / 2; // wall line
    const k = vert ? 1 : 0;
    let lo = Math.min(door.a[k], door.b[k]), hi = Math.max(door.a[k], door.b[k]);
    if (hi - lo > 2 * JAMB + MINW) { lo += JAMB; hi -= JAMB; }
    const side = (before) => {
      const d = vert ? (before ? 1 : 3) : (before ? 2 : 0); // direction from the cell towards the wall
      let best = [], bd = Infinity;
      for (const c of cells) {
        if (c.nb[d]) continue;
        const face = vert ? (before ? c.x1 : c.x0) : (before ? c.y1 : c.y0);
        const dist = before ? w - face : face - w;
        if (dist < -1 || dist > TOL) continue;
        const a = vert ? c.y0 : c.x0, b = vert ? c.y1 : c.x1;
        if (Math.min(b, hi) - Math.max(a, lo) < MINW) continue;
        best.push({ c, d, a, b, dist, room: c.room });
        bd = Math.min(bd, dist);
      }
      const room = best.find((x) => x.dist === bd)?.room;
      return best.filter((x) => x.room === room);
    };
    for (const A of side(true)) for (const B of side(false)) {
      const l = Math.max(A.a, B.a, lo), h = Math.min(A.b, B.b, hi);
      if (h - l < MINW || A.c.room === B.c.room) continue;
      A.c.adj.push({ from: A.c, to: B.c, dir: A.d, link: true, lo: l, hi: h });
      B.c.adj.push({ from: B.c, to: A.c, dir: B.d, link: true, lo: l, hi: h });
    }
  }
  return { cells, rooms };
}

// ---------------------------------------------------------------- small tools
class Heap {
  constructor() { this.a = []; }
  push(k, v) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { let m = i; const l = 2 * i + 1, r = l + 1; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top;
  }
  get size() { return this.a.length; }
}
const lenOf = (cells) => cells.reduce((s, c) => s + c.len, 0);

/** Connected groups of a set of cells (neighbours within a room). */
function components(cells) {
  const set = new Set(cells.map((c) => c.id)), seen = new Set(), out = [];
  for (const c of cells) {
    if (seen.has(c.id)) continue;
    const comp = [], q = [c];
    seen.add(c.id);
    while (q.length) { const u = q.pop(); comp.push(u); for (const v of u.nb) if (v && set.has(v.id) && !seen.has(v.id)) { seen.add(v.id); q.push(v); } }
    out.push(comp);
  }
  return out;
}

/** Cuts a group of cells into n zones of about the same size with straight cuts. */
function split(cells, n) {
  if (n <= 1 || cells.length < 2 * n) return [cells];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const c of cells) { x0 = Math.min(x0, c.x0); x1 = Math.max(x1, c.x1); y0 = Math.min(y0, c.y0); y1 = Math.max(y1, c.y1); }
  const key = x1 - x0 >= y1 - y0 ? 'x0' : 'y0';
  const n1 = n >> 1, total = lenOf(cells), want = (total * n1) / n;
  const cols = [...new Set(cells.map((c) => c[key]))].sort((a, b) => a - b);
  let cum = 0, cut = cols[1], bestErr = Infinity;
  for (let k = 0; k + 1 < cols.length; k++) {
    cum += lenOf(cells.filter((c) => c[key] === cols[k]));
    if (Math.abs(cum - want) < bestErr) { bestErr = Math.abs(cum - want); cut = cols[k + 1]; }
  }
  let A = cells.filter((c) => c[key] < cut), B = cells.filter((c) => c[key] >= cut);
  if (!A.length || !B.length) return [cells];
  const tidy = (P, Q) => { // loose bits of one side go to the other side
    const cs = components(P).sort((a, b) => b.length - a.length);
    for (const extra of cs.slice(1)) Q.push(...extra);
    return cs[0];
  };
  A = tidy(A, B); B = tidy(B, A);
  return [...split(A, n1), ...split(B, n - n1)];
}

// ---------------------------------------------------------------- planning
function plan(G, cfg, input, extra) {
  const { cells, rooms } = G;
  const N = cells.length;
  const S = {
    kind: new Uint8Array(N), // 0 free, 1 feed (can be shared), 2 owned by one loop
    occ: cells.map(() => []), tpar: new Array(N).fill(null), tkids: cells.map(() => []),
    owner: new Array(N).fill(null), eocc: new Map(), loops: [], warnings: [],
  };
  const tr = input.t || plain;
  const warn = (m, a) => S.warnings.push(tr(m, a));
  let unreach = 0;

  // --- manifold: the cells in front of it are where loops start
  const col = input.collector;
  let croom = rooms.find((r) => r.heat !== false && inPoly(col.x, col.y, r.poly));
  if (!croom) {
    let bd = Infinity;
    for (const c of cells) { const d = Math.hypot(c.cx - col.x, c.cy - col.y); if (d < bd) { bd = d; croom = rooms[c.room]; } }
  }
  if (!croom) return { loops: [], warnings: [tr('Geen verwarmde ruimte bij de collector.')], cells, minPitch: null, unreach: 0 };
  let heading = 0;
  { // away from the nearest wall of the room
    let bd = Infinity;
    const P = croom.poly;
    for (let i = 0; i < P.length; i++) {
      const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length];
      const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((col.x - x1) * (x2 - x1) + (col.y - y1) * (y2 - y1)) / l2));
      const d = Math.hypot(col.x - x1 - (x2 - x1) * t, col.y - y1 - (y2 - y1) * t);
      if (d >= bd) continue;
      bd = d;
      const horiz = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      heading = horiz ? (inPoly(mx, my + 2, P) ? 2 : 0) : (inPoly(mx + 2, my, P) ? 1 : 3);
    }
  }
  const lat = (c) => (heading & 1 ? c.cy : c.cx), dep = (c) => (heading & 1 ? c.cx : c.cy) * (heading === 0 || heading === 3 ? -1 : 1);
  const clat = heading & 1 ? col.y : col.x;
  const estLoops = Math.max(2, Math.round(lenOf(cells) / (cfg.maxLen * 85)));
  let front = croom.cells.filter((c) => !c.nb[BACK(heading)]);
  const d0 = Math.min(...front.filter((c) => Math.abs(lat(c) - clat) < 80).map(dep), Infinity);
  let roots = front.filter((c) => dep(c) - d0 < 20).sort((a, b) => Math.abs(lat(a) - clat) - Math.abs(lat(b) - clat)).slice(0, Math.max(3, Math.min(8, Math.ceil(estLoops / 2))));
  if (!roots.length) roots = [front.sort((a, b) => Math.hypot(a.cx - col.x, a.cy - col.y) - Math.hypot(b.cx - col.x, b.cy - col.y))[0] || croom.cells[0]];
  const leftFirst = heading === 0 || heading === 1 ? 1 : -1; // left to right, seen from the manifold
  roots.sort((a, b) => (lat(a) - lat(b)) * leftFirst);
  const isRoot = new Set(roots.map((c) => c.id));

  // --- distance from the manifold
  const dist = new Float64Array(N).fill(Infinity);
  {
    const h = new Heap();
    for (const r of roots) { dist[r.id] = 0; h.push(0, r); }
    while (h.size) {
      const [d, u] = h.pop();
      if (d > dist[u.id]) continue;
      for (const e of u.adj) { const nd = d + Math.hypot(e.to.cx - u.cx, e.to.cy - u.cy); if (nd < dist[e.to.id]) { dist[e.to.id] = nd; h.push(nd, e.to); } }
    }
  }

  // --- feed of a loop: along feeds that are there already (sharing their cells), then through free cells
  const solid = (c, d) => { const v = c.nb[d]; return !v || S.kind[v.id] !== 0; };
  function route(target) {
    const best = new Map(), h = new Heap();
    const visit = (cost, cell, dir, edge, prev) => {
      const k = cell.id * 4 + dir;
      if (best.has(k) && best.get(k) <= cost) return;
      best.set(k, cost);
      h.push(cost, { cell, dir, edge, prev, cost });
    };
    const share = (c, e) => {
      const k = S.occ[c.id].length;
      const w = e && e !== ROOT ? e.hi - e.lo : Math.min(c.x1 - c.x0, c.y1 - c.y0);
      const cap = Math.max(1, Math.floor(w / (2 * cfg.feedPitch))); // loops that fit side by side at the feed pitch
      return k < cap ? cfg.shareLow * k : cfg.shareHigh * (k - cap + 1) ** 2 + (w / (2 * (k + 1)) < cfg.minPitch ? 8 : 0);
    };
    for (const r of roots) {
      if (S.kind[r.id] === 0) visit(1, r, heading, ROOT, null);
      else if (S.kind[r.id] === 1 && S.tpar[r.id] === ROOT) visit(1 + share(r, ROOT), r, heading, ROOT, null);
    }
    while (h.size) {
      const [cost, st] = h.pop();
      const u = st.cell;
      if (best.get(u.id * 4 + st.dir) < cost) continue;
      if (target.has(u.id) && S.kind[u.id] === 0) {
        const path = [];
        for (let s = st; s; s = s.prev) path.unshift(s);
        return path;
      }
      const shared = S.kind[u.id] === 1;
      if (shared) for (const e of S.tkids[u.id]) {
        if (S.kind[e.to.id] !== 1) continue;
        const step = Math.hypot(e.to.cx - u.cx, e.to.cy - u.cy) / 30;
        visit(cost + step * (1 + share(e.to, e)) + (e.dir !== st.dir ? 0.7 : 0), e.to, e.dir, e, st);
      }
      for (const e of u.adj) {
        const v = e.to;
        if (S.kind[v.id] !== 0) continue;
        const step = Math.hypot(v.cx - u.cx, v.cy - u.cy) / 30;
        const open = !solid(v, LEFT(e.dir)) && !solid(v, RIGHT(e.dir));
        visit(cost + step + (e.dir !== st.dir ? 0.7 : 0) + (open ? cfg.openCost : 0) + (target.has(v.id) ? 0 : 0.05), v, e.dir, e, st);
      }
    }
    return null;
  }

  const kidsOf = (loop, c) => { let k = loop.kids.get(c.id); if (!k) loop.kids.set(c.id, k = []); return k; };
  const own = (loop, c) => { S.kind[c.id] = 2; S.owner[c.id] = loop; loop.own.push(c); };

  function newLoop(room, path) {
    const loop = { id: S.loops.length, room, kids: new Map(), own: [], trunk: [], root: path[0].cell, entry: null, entryDir: heading };
    S.loops.push(loop);
    path.forEach((st, i) => {
      const c = st.cell, last = i === path.length - 1;
      if (st.edge !== ROOT) {
        kidsOf(loop, st.prev.cell).push(st.edge);
        S.eocc.set(st.edge, (S.eocc.get(st.edge) || 0) + 1);
        loop.trunk.push(st.edge);
      }
      if (last) { own(loop, c); loop.entry = c; loop.entryDir = st.dir; return; }
      if (S.kind[c.id] === 0) {
        S.kind[c.id] = 1; S.tpar[c.id] = st.edge;
        if (st.edge !== ROOT && !S.tkids[st.prev.cell.id].includes(st.edge)) S.tkids[st.prev.cell.id].push(st.edge);
      }
      S.occ[c.id].push(loop);
    });
    return loop;
  }

  /** Tree over a set of cells that winds inwards from `start` (hugging one side), branching where it gets stuck. */
  function wind(start, dir0, set, hand) {
    const seen = new Set([start.id]), order = [start], edges = [];
    let cur = start, dir = dir0, restarts = 0;
    const turns = hand > 0 ? (d) => [LEFT(d), d, RIGHT(d)] : (d) => [RIGHT(d), d, LEFT(d)];
    while (seen.size < set.size) {
      let e = null;
      for (const d of turns(dir)) { const v = cur.nb[d]; if (v && set.has(v.id) && !seen.has(v.id)) { e = cur.nbe[d]; break; } }
      if (!e) {
        for (let k = order.length - 1; k >= 0 && !e; k--) for (const d of turns(dir)) { const v = order[k].nb[d]; if (v && set.has(v.id) && !seen.has(v.id)) { e = order[k].nbe[d]; break; } }
        if (!e) break;
        restarts++;
      }
      edges.push(e); seen.add(e.to.id); order.push(e.to); cur = e.to; dir = e.dir;
    }
    return { edges, restarts };
  }
  function crown(loop, start, dir, cellsOfZone) {
    const set = new Set(cellsOfZone.map((c) => c.id));
    set.add(start.id);
    const a = wind(start, dir, set, 1), b = wind(start, dir, set, -1);
    const w = b.restarts < a.restarts ? b : a;
    for (const e of w.edges) { kidsOf(loop, e.from).push(e); own(loop, e.to); }
  }
  const estLen = (loop) => lenOf(loop.own) + 2 * loop.trunk.reduce((s, e) => s + Math.hypot(e.to.cx - e.from.cx, e.to.cy - e.from.cy), 0);

  // --- rooms, the farthest first: their feeds cross the rooms nearer to the manifold before those are filled
  const order = rooms.filter((r) => r.cells?.length).map((r) => ({ r, d: Math.min(...r.cells.map((c) => dist[c.id])) })).sort((a, b) => b.d - a.d);
  for (const { r } of order) {
    const tried = new Set();
    for (let ci = 0; ci < 50; ci++) {
      // the largest free part of the room that has not had its turn (feeds of earlier parts may have cut it up)
      const comp = components(r.cells.filter((c) => S.kind[c.id] === 0 && !tried.has(c.id))).sort((a, b) => lenOf(b) - lenOf(a))[0];
      if (!comp) break;
      for (const c of comp) tried.add(c.id);
      const len = lenOf(comp);
      if (len < Math.max(cfg.minLoop, r.max * 0.25) * 100) break; // small leftovers join a neighbouring loop later
      const dmin = Math.min(...comp.map((c) => dist[c.id]));
      if (!isFinite(dmin)) { unreach++; warn('{r}: niet bereikbaar vanaf de collector (deur of muurdoorvoer CV nodig).', { r: r.name }); continue; }
      let avail = r.max * 100 - 2.2 * dmin - 200;
      if (avail < 1500) { avail = 1500; warn('{r}: ligt te ver van de collector voor {m} m per kring.', { r: r.name, m: r.max }); }
      const n = Math.ceil(len / avail) + (ci === 0 ? extra[r.id] || 0 : 0);
      const zones = split(comp, n).map((z) => ({ cells: z, d: Math.max(...z.map((c) => dist[c.id])) })).sort((a, b) => b.d - a.d);
      for (const z of zones) {
        const target = new Set(z.cells.filter((c) => S.kind[c.id] === 0).map((c) => c.id));
        const path = target.size ? route(target) : null;
        if (!path) continue;
        z.loop = newLoop(r, path);
      }
      // what the feeds left of each zone; loose bits go to a neighbouring zone
      const live = zones.filter((z) => z.loop);
      const loose = [];
      for (const z of zones) {
        const rest = z.cells.filter((c) => S.kind[c.id] === 0);
        if (!z.loop) { loose.push(...components(rest)); z.main = []; continue; }
        const cs = components([z.loop.entry, ...rest]);
        z.main = cs.find((c) => c.includes(z.loop.entry));
        loose.push(...cs.filter((c) => c !== z.main));
      }
      for (let again = true; again;) {
        again = false;
        for (const bit of [...loose]) {
          const ids = new Set(bit.map((c) => c.id));
          const near = live.filter((z) => z.main.some((c) => c.nb.some((v) => v && ids.has(v.id)))).sort((a, b) => lenOf(a.main) - lenOf(b.main))[0];
          if (!near) continue;
          near.main.push(...bit); loose.splice(loose.indexOf(bit), 1); again = true;
        }
      }
      for (const z of live) crown(z.loop, z.loop.entry, z.loop.entryDir, z.main);
    }
  }

  // --- leftovers: join a loop next to them (as a side branch), or get a loop of their own
  const dead = new Set();
  for (let guard = 0; guard < 500; guard++) {
    {
      const comp = components(cells.filter((c) => S.kind[c.id] === 0 && !dead.has(c.id))).sort((a, b) => lenOf(b) - lenOf(a))[0];
      if (!comp) break;
      const len = lenOf(comp);
      let best = null;
      for (const c of comp) for (const e of c.adj) {
        const v = e.to, k = S.kind[v.id];
        const loop = k === 2 ? S.owner[v.id] : k === 1 && S.occ[v.id].length === 1 ? S.occ[v.id][0] : null;
        if (!loop) continue;
        const back = v.adj.find((x) => x.to === c && x.lo === e.lo);
        const total = estLen(loop) + len;
        const score = (total > rooms[c.room].max * 100 ? 1e6 : 0) + total + (e.link ? 5e5 : 0) + (loop.room.ri !== c.room ? 2e5 : 0);
        if (!best || score < best.score) best = { score, loop, edge: back, v };
      }
      const room = rooms[comp[0].room];
      if (best && (best.score < 1e6 || len < cfg.minLoop * 100)) {
        const { loop, edge, v } = best;
        if (S.kind[v.id] === 1) { S.kind[v.id] = 2; S.owner[v.id] = loop; loop.own.push(v); } // its feed cell is its own from now on
        kidsOf(loop, v).push(edge);
        own(loop, edge.to);
        crown(loop, edge.to, edge.dir, comp);
        continue;
      }
      const path = route(new Set(comp.map((c) => c.id)));
      if (path) { const loop = newLoop(room, path); crown(loop, loop.entry, loop.entryDir, comp); continue; }
      if (best) { const { loop, edge, v } = best; if (S.kind[v.id] === 1) { S.kind[v.id] = 2; S.owner[v.id] = loop; loop.own.push(v); } kidsOf(loop, v).push(edge); own(loop, edge.to); crown(loop, edge.to, edge.dir, comp); continue; }
      for (const c of comp) dead.add(c.id);
      unreach++;
      warn('{r}: {a} m² niet bereikbaar vanaf de collector (deur of muurdoorvoer CV nodig).', { r: room.name, a: (comp.reduce((a, c) => a + (c.x1 - c.x0) * (c.y1 - c.y0), 0) / 1e4).toFixed(1).replace('.', ',') });
    }
  }

  // ---------------------------------------------------------------- geometry
  const headInto = (c) => (S.tpar[c.id] && S.tpar[c.id] !== ROOT ? S.tpar[c.id].dir : heading);
  const elem = (e, h) => (e.dir === LEFT(h) ? 0 : e.dir === h ? 1 : 2) * 1e6 + (e.dir < 2 ? e.lo : 1e5 - e.lo);
  for (const loop of S.loops) {
    loop.key = [roots.indexOf(loop.root)];
    let h = heading;
    for (const e of loop.trunk) { loop.key.push(elem(e, h)); h = e.dir; }
  }
  const cmp = (a, b) => { for (let i = 0; i < Math.max(a.key.length, b.key.length); i++) { const d = (a.key[i] ?? -1) - (b.key[i] ?? -1); if (d) return d; } return 0; };
  const ribbons = new Map(); // edge → loops, left to right
  for (const loop of S.loops) for (const e of loop.trunk) { let l = ribbons.get(e); if (!l) ribbons.set(e, l = []); l.push(loop); }
  for (const l of ribbons.values()) l.sort(cmp);
  const rootRib = new Map(roots.map((r) => [r.id, S.loops.filter((l) => l.root === r).sort(cmp)]));
  const rootEdge = new Map(roots.map((r) => [r.id, { root: true, from: null, to: r, dir: heading, link: false, lo: heading & 1 ? r.y0 : r.x0, hi: heading & 1 ? r.y1 : r.x1 }]));
  const even = (e, m) => Array.from({ length: 2 * m }, (_, j) => { const f = (j + 0.5) / (2 * m); return e.dir < 2 ? e.lo + f * (e.hi - e.lo) : e.hi - f * (e.hi - e.lo); });
  const posMemo = new Map();
  let minPitch = Infinity;
  const exits = (c) => new Set(S.occ[c.id].map((l) => l.kids.get(c.id)?.[0])).size;
  function pos(e) {
    let p = posMemo.get(e);
    if (p) return p;
    const rib = e.root ? rootRib.get(e.to.id) : ribbons.get(e);
    const m = rib?.length || 1;
    const u = e.from;
    if (u && !e.link && rib && S.occ[u.id].length > 1 && exits(u) > 1 && e.dir === headInto(u)) {
      // loops going straight on where others turn off keep their line
      const inE = S.tpar[u.id] === ROOT ? rootEdge.get(u.id) : S.tpar[u.id];
      const pin = pos(inE), ribIn = inE.root ? rootRib.get(u.id) : ribbons.get(inE);
      p = [];
      for (const l of rib) { const k = ribIn.indexOf(l); p.push(pin[2 * k], pin[2 * k + 1]); }
    } else p = even(e, m);
    if (m > 1) for (let i = 1; i < p.length; i++) minPitch = Math.min(minPitch, Math.abs(p[i] - p[i - 1]));
    posMemo.set(e, p);
    return p;
  }
  const edgePt = (e, coord, far) => {
    const c = far ? e.to : e.from, d = far ? BACK(e.dir) : e.dir;
    return d === 0 ? [coord, c.y0] : d === 1 ? [c.x1, coord] : d === 2 ? [coord, c.y1] : [c.x0, coord];
  };
  const corner = (a, b, h) => (h & 1 ? [b[0], a[1]] : [a[0], b[1]]);

  // a cell where loops split and the ones going straight on leave through a door (so they shift sideways):
  // straight lines from edge to edge there, those never cross
  const chordMemo = new Map();
  const chords = (u, h) => {
    if (!chordMemo.has(u.id)) {
      const out = new Set(S.occ[u.id].map((l) => l.kids.get(u.id)?.[0]));
      chordMemo.set(u.id, out.size > 1 && [...out].some((e) => e && e.dir === h && e.link));
    }
    return chordMemo.get(u.id);
  };
  function emit(loop, pts, u, h, inL, inR) {
    const ks = (loop.kids.get(u.id) || []).slice().sort((a, b) => elem(a, h) - elem(b, h));
    const cross = (e) => {
      const rib = ribbons.get(e), k = rib ? rib.indexOf(loop) : 0, P = pos(e);
      const aL = edgePt(e, P[2 * k], 0), bL = edgePt(e, P[2 * k], 1), aR = edgePt(e, P[2 * k + 1], 0), bR = edgePt(e, P[2 * k + 1], 1);
      return { aL, bL, aR, bR };
    };
    if (S.kind[u.id] === 1 && S.occ[u.id].length > 1) { // shared cell: just passing through
      const e = ks[0], x = cross(e);
      const chord = chords(u, h);
      if (e.dir !== h && !chord) pts.push(corner(inL, x.aL, h));
      pts.push(x.aL, x.bL);
      emit(loop, pts, e.to, e.dir, x.bL, x.bR);
      pts.push(x.bR, x.aR);
      if (e.dir !== h && !chord) pts.push(corner(inR, x.aR, h));
      return;
    }
    const qx = (u.x1 - u.x0) / 4, qy = (u.y1 - u.y0) / 4, l = LEFT(h);
    const Q = (a, b) => [u.cx + (a * DX[h] + b * DX[l]) * qx, u.cy + (a * DY[h] + b * DY[l]) * qy];
    const go = (d) => { for (const e of ks) if (e.dir === d) { const x = cross(e); pts.push(x.aL, x.bL); emit(loop, pts, e.to, e.dir, x.bL, x.bR); pts.push(x.bR, x.aR); } };
    pts.push(Q(-1, 1)); go(l);
    pts.push(Q(1, 1)); go(h);
    pts.push(Q(1, -1)); go(RIGHT(h));
    pts.push(Q(-1, -1));
  }

  const sorted = [...S.loops].sort(cmp);
  const W = sorted.length * cfg.portPitch;
  const cname = col.name || 'VV1';
  const out = sorted.map((loop, i) => {
    const port = (f) => { const v = (heading < 2 ? -1 : 1) * (W / 2 - f * cfg.portPitch) ; return heading & 1 ? [col.x, col.y + v] : [col.x + v, col.y]; };
    const re = rootEdge.get(loop.root.id), P = pos(re), k = rootRib.get(loop.root.id).indexOf(loop);
    const inL = edgePt(re, P[2 * k], 1), inR = edgePt(re, P[2 * k + 1], 1);
    const pts = [port(i + 0.25), inL];
    emit(loop, pts, loop.root, heading, inL, inR);
    pts.push(inR, port(i + 0.75));
    const clean = tidy(pts);
    let len = 0;
    for (let j = 1; j < clean.length; j++) len += Math.hypot(clean[j][0] - clean[j - 1][0], clean[j][1] - clean[j - 1][1]);
    const names = [...new Set([loop.room.ri, ...loop.own.map((c) => c.room)])].map((ri) => rooms[ri].name);
    return { name: `${cname}.${i + 1}`, room: names.join(' + '), roomId: loop.room.id, pts: clean, length: Math.round(len / 10) / 10, maxLen: loop.room.max, label: [loop.entry.cx, loop.entry.cy] };
  });
  if (minPitch < cfg.minPitch) warn('Leidingen liggen op {d} cm van elkaar bij de collector of in een deur.', { d: minPitch.toFixed(1).replace('.', ',') });
  return { loops: out, warnings: S.warnings, minPitch: isFinite(minPitch) ? minPitch : null, cells, state: S, unreach };
}

/** Drops double points and points on a straight line. */
function tidy(pts) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (q && Math.abs(q[0] - p[0]) < 0.01 && Math.abs(q[1] - p[1]) < 0.01) continue;
    const o = out[out.length - 2];
    if (o && Math.abs((q[0] - o[0]) * (p[1] - q[1]) - (q[1] - o[1]) * (p[0] - q[0])) < 1e-6 && (q[0] - o[0]) * (p[0] - q[0]) + (q[1] - o[1]) * (p[1] - q[1]) > 0) out.pop();
    out.push([Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]);
  }
  return out;
}

/** Points where pipes cross each other (there should be none). */
export function crossings(loops) {
  const B = 40, grid = new Map(), out = [], seen = new Set();
  loops.forEach((l, li) => {
    for (let i = 0; i + 1 < l.pts.length; i++) {
      const s = { a: l.pts[i], b: l.pts[i + 1], li, i };
      const x0 = Math.floor(Math.min(s.a[0], s.b[0]) / B), x1 = Math.floor(Math.max(s.a[0], s.b[0]) / B);
      const y0 = Math.floor(Math.min(s.a[1], s.b[1]) / B), y1 = Math.floor(Math.max(s.a[1], s.b[1]) / B);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const k = x + ',' + y; let g = grid.get(k); if (!g) grid.set(k, g = []); g.push(s); }
    }
  });
  const ccw = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (const list of grid.values()) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const s = list[i], t = list[j];
    if (s.li === t.li && Math.abs(s.i - t.i) <= 1) continue;
    const d1 = ccw(s.a, s.b, t.a), d2 = ccw(s.a, s.b, t.b), d3 = ccw(t.a, t.b, s.a), d4 = ccw(t.a, t.b, s.b);
    if (d1 * d2 < -1e-6 && d3 * d4 < -1e-6) {
      const k = s.li + ':' + s.i + '/' + t.li + ':' + t.i;
      if (seen.has(k)) continue;
      seen.add(k);
      const f = d1 / (d1 - d2);
      out.push([t.a[0] + (t.b[0] - t.a[0]) * f, t.a[1] + (t.b[1] - t.a[1]) * f]);
    }
  }
  return out;
}

// The feeds are laid one after the other, so how they share the narrow places depends on these weights.
// A handful of settings is tried and the best plan wins.
const VARIANTS = [
  { shareLow: 0.6, shareHigh: 2, openCost: 0.4 },
  { shareLow: 1.5, shareHigh: 2, openCost: 0.4 },
  { shareLow: 0.15, shareHigh: 2, openCost: 0.4 },
  { shareLow: 0.6, shareHigh: 4, openCost: 0.4 },
  { shareLow: 0.6, shareHigh: 2, openCost: 0 },
  { shareLow: 1.5, shareHigh: 8, openCost: 0 },
];

function planOnce(G, cfg, input) {
  const extra = {};
  let res = null;
  for (let it = 0; it < 6; it++) {
    res = plan(G, cfg, input, extra);
    const over = res.loops.filter((l) => l.length > l.maxLen + 0.05 && (extra[l.roomId] || 0) < 3);
    if (!over.length) break;
    for (const id of new Set(over.map((l) => l.roomId))) extra[id] = (extra[id] || 0) + 1;
  }
  const over = res.loops.filter((l) => l.length > l.maxLen + 0.05);
  for (const l of over) res.warnings.push((input.t || plain)('{l} ({r}) is {n} m, langer dan {m} m.', { l: l.name, r: l.room, n: String(l.length).replace('.', ','), m: l.maxLen }));
  res.crossings = crossings(res.loops);
  const pitch = res.minPitch ?? 99;
  res.score = res.crossings.length * 1000 + (res.unreach || 0) * 1000 + over.length * 300
    + res.loops.length * 10 + res.loops.filter((l) => l.length < 20).length * 15 + Math.max(0, 5 - pitch) * 25
    + res.loops.reduce((s, l) => s + l.length, 0) / 50;
  return res;
}

export function generate(input) {
  const base = { ...DEFAULTS, ...Object.fromEntries(Object.entries(input).filter(([k, v]) => k in DEFAULTS && v != null)) };
  const G = buildGrid(input, base);
  const fixed = ['shareLow', 'shareHigh', 'openCost'].some((k) => input[k] != null);
  let best = null;
  for (const v of fixed ? [{}] : VARIANTS) {
    const res = planOnce(G, { ...base, ...v }, input);
    if (!best || res.score < best.score) best = res;
  }
  return best;
}
