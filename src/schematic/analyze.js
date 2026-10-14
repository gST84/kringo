// Project analysis: component info, tags, cross references, electrical nets, wire numbers,
// junction dots and unconnected pins. Pure function of (project, library).
import { geometry, xf } from '../symbols/geom.js';
import { locate } from '../model.js';
import { natCmp, r2 } from '../util.js';

const EPS = 0.01;

class DSU {
  constructor() { this.p = new Map(); }
  find(a) {
    let p = this.p.get(a);
    if (p === undefined) { this.p.set(a, a); return a; }
    if (p === a) return a;
    p = this.find(p);
    this.p.set(a, p);
    return p;
  }
  union(a, b) {
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.p.set(ra, rb);
  }
}

export const pointKey = (pageId, x, y) => `${pageId}@${r2(x)},${r2(y)}`;

/** True when (x,y) lies on segment a-b (inclusive). Returns 'end', 'mid' or false. */
export function onSegment(x, y, a, b) {
  const [ax, ay] = a, [bx, by] = b;
  if (Math.abs(ax - bx) < EPS) {
    if (Math.abs(x - ax) > EPS) return false;
    if (y < Math.min(ay, by) - EPS || y > Math.max(ay, by) + EPS) return false;
  } else if (Math.abs(ay - by) < EPS) {
    if (Math.abs(y - ay) > EPS) return false;
    if (x < Math.min(ax, bx) - EPS || x > Math.max(ax, bx) + EPS) return false;
  } else {
    const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    const len = Math.hypot(bx - ax, by - ay);
    if (Math.abs(cross) / len > EPS) return false;
    const t = ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / (len * len);
    if (t < -EPS || t > 1 + EPS) return false;
  }
  const atEnd = (Math.abs(x - ax) < EPS && Math.abs(y - ay) < EPS) || (Math.abs(x - bx) < EPS && Math.abs(y - by) < EPS);
  return atEnd ? 'end' : 'mid';
}

export const onRail = (x, y, rail) =>
  Math.abs(y - rail.y) < EPS && x >= Math.min(rail.x0, rail.x1) - EPS && x <= Math.max(rail.x0, rail.x1) + EPS;

/** Text for a reference to a location: "3.4". */
export const refText = (loc) => `${loc.page}.${loc.col}`;

export function analyze(project, lib, opts = {}) {
  const comps = new Map(); // id -> info
  const dsu = new DSU();
  const pointInfo = new Map(); // pageId -> Map(pointKey -> {x,y,pins,wireEnds,wireThrough,rail})
  const wiresById = new Map();

  // ---------- components ----------
  project.pages.forEach((page, pi) => {
    const pts = new Map();
    pointInfo.set(page.id, pts);
    const pt = (x, y) => {
      const k = pointKey(page.id, x, y);
      let e = pts.get(k);
      if (!e) pts.set(k, (e = { k, x: r2(x), y: r2(y), pins: [], wireEnds: 0, wireThrough: 0, rail: 0 }));
      return e;
    };
    for (const c of page.comps) {
      const def = lib.get(c.sym);
      const geom = geometry(def, c);
      const loc = { page: pi + 1, pageId: page.id, ...locate(project, c.x, c.y, page) };
      const pins = (geom.pins || []).map((p) => {
        const [x, y] = xf(c, p.x, p.y);
        return { id: p.id, name: c.pinNames?.[p.id] ?? p.name ?? p.id, x: r2(x), y: r2(y) };
      });
      const info = { comp: c, page, pageIdx: pi, def, geom, loc, pins, linked: [], master: null, tag: '' };
      comps.set(c.id, info);
      for (const p of pins) {
        const key = `P:${c.id}:${p.id}`;
        const e = pt(p.x, p.y);
        e.pins.push({ compId: c.id, pinId: p.id });
        dsu.union(key, e.k);
      }
      if (opts.bridges !== false) for (const [a, b] of geom.bridges || []) dsu.union(`P:${c.id}:${a}`, `P:${c.id}:${b}`);
      if (def?.role === 'link' && pins[0]) dsu.union(`P:${c.id}:${pins[0].id}`, 'POT:' + (c.props?.name ?? ''));
    }
    // ---------- wires ----------
    for (const w of page.wires) {
      wiresById.set(w.id, { wire: w, page, pageIdx: pi });
      const wk = 'W:' + w.id;
      dsu.find(wk);
      const n = w.points.length;
      if (n < 2) continue;
      for (const i of [0, n - 1]) {
        const e = pt(...w.points[i]);
        e.wireEnds++;
        dsu.union(wk, e.k);
      }
    }
    // points lying on wire segments (T-junctions, bends) and on rails
    for (const e of pts.values()) {
      for (const w of page.wires) {
        const ptsW = w.points;
        let hit = false;
        let interior = false;
        for (let i = 0; i + 1 < ptsW.length; i++) {
          const r = onSegment(e.x, e.y, ptsW[i], ptsW[i + 1]);
          if (r) {
            hit = true;
            const isEndOfWire = (i === 0 && near(e, ptsW[0])) || (i + 1 === ptsW.length - 1 && near(e, ptsW[ptsW.length - 1]));
            if (!isEndOfWire) interior = true;
          }
        }
        if (hit) {
          dsu.union('W:' + w.id, e.k);
          if (interior) e.wireThrough++;
        }
      }
      for (const rail of page.rails) {
        if (onRail(e.x, e.y, rail)) {
          dsu.union(e.k, 'RAIL:' + (rail.name || rail.id));
          e.rail++;
        }
      }
    }
  });

  // ---------- devices: links, tags ----------
  for (const info of comps.values()) {
    const m = info.comp.link && comps.get(info.comp.link);
    if (m && m !== info) {
      info.master = m;
      m.linked.push(info);
    }
  }
  for (const info of comps.values()) {
    const c = info.comp;
    const role = info.def?.role;
    if (role === 'terminal') info.tag = c.qet ? c.props?.strip || '' : c.props?.strip || '-X?';
    else if (role === 'link') info.tag = c.props?.name ?? '';
    else if (role === 'graphic') info.tag = '';
    else info.tag = info.master ? info.master.comp.tag || '' : c.tag || '';
  }
  // potential references: other occurrences of the same name
  const linkGroups = new Map();
  for (const info of comps.values()) {
    if (info.def?.role !== 'link') continue;
    const n = info.comp.props?.name ?? '';
    if (!linkGroups.has(n)) linkGroups.set(n, []);
    linkGroups.get(n).push(info);
  }
  for (const group of linkGroups.values()) for (const info of group) info.refs = group.filter((o) => o !== info).map((o) => o.loc);

  // ---------- nets ----------
  const nets = new Map(); // root -> net
  const netOf = (key) => {
    const r = dsu.find(key);
    let n = nets.get(r);
    if (!n) nets.set(r, (n = { id: r, pins: [], wires: [], rails: new Set(), pots: new Set(), label: '' }));
    return n;
  };
  const pinNet = new Map();
  for (const info of comps.values()) for (const p of info.pins) {
    const net = netOf(`P:${info.comp.id}:${p.id}`);
    net.pins.push({ info, pin: p });
    pinNet.set(`${info.comp.id}:${p.id}`, net);
  }
  const wireNet = new Map();
  for (const { wire, page, pageIdx } of wiresById.values()) {
    const net = netOf('W:' + wire.id);
    net.wires.push({ wire, page, pageIdx });
    wireNet.set(wire.id, net);
  }
  for (const page of project.pages) for (const rail of page.rails) {
    const k = 'RAIL:' + (rail.name || rail.id);
    if (!dsu.p.has(k)) continue;
    const n = netOf(k);
    n.rails.add(rail.name || '');
    n.railColor ||= rail.color;
  }
  for (const n of linkGroups.keys()) if (dsu.p.has('POT:' + n)) netOf('POT:' + n).pots.add(n);

  // ---------- wire numbers ----------
  const fmt = project.settings.wireFormat ?? '{n}'; // '' = no automatic wire numbers
  const numbered = [...nets.values()].filter((n) => n.wires.length);
  const firstPos = (n) => {
    let best = null;
    for (const { wire, pageIdx } of n.wires) for (const [x, y] of wire.points) {
      const cand = [pageIdx, x, y];
      if (!best || cand[0] < best[0] || (cand[0] === best[0] && (cand[1] < best[1] || (cand[1] === best[1] && cand[2] < best[2])))) best = cand;
    }
    return best;
  };
  for (const n of numbered) n.pos = firstPos(n);
  numbered.sort((a, b) => a.pos[0] - b.pos[0] || a.pos[1] - b.pos[1] || a.pos[2] - b.pos[2]);
  const counters = new Map();
  const used = new Set();
  for (const n of numbered) {
    const manual = n.wires.map((w) => w.wire.label).find((l) => l);
    if (manual) { n.label = manual; continue; }
    if (n.rails.size) { n.label = [...n.rails].sort(natCmp)[0]; continue; }
  }
  for (const n of numbered) if (n.label) used.add(n.label);
  for (const n of numbered) {
    if (n.label || !fmt) continue;
    const loc = locate(project, n.pos[1], n.pos[2], project.pages[n.pos[0]]);
    const base = fmt.replace('{page}', n.pos[0] + 1).replace('{col}', loc.col).replace('{row}', loc.row);
    let label;
    if (base.includes('{n}')) {
      let k = counters.get(base) || 0;
      do { k++; label = base.replace('{n}', k); } while (used.has(label));
      counters.set(base, k);
    } else {
      label = base;
      let k = 1;
      while (used.has(label)) label = `${base}.${++k}`;
    }
    used.add(label);
    n.label = label;
  }

  // ---------- junctions and unconnected pins ----------
  const junctions = new Map();
  const openPins = new Set();
  for (const [pageId, pts] of pointInfo) {
    const list = [];
    for (const e of pts.values()) {
      const wires = e.wireEnds + e.wireThrough;
      const count = e.pins.length + e.wireEnds + 2 * e.wireThrough + 2 * e.rail;
      if (wires > 0 && count >= 3) list.push([e.x, e.y]);
      else if (!wires && e.rail && e.pins.length) list.push([e.x, e.y]);
      if (e.pins.length === 1 && wires === 0 && e.rail === 0) openPins.add(`${e.pins[0].compId}:${e.pins[0].pinId}`);
    }
    junctions.set(pageId, list);
  }

  // ---------- duplicate tags ----------
  const tagCount = new Map();
  for (const info of comps.values()) {
    if (info.master || !info.tag || ['terminal', 'link', 'graphic'].includes(info.def?.role)) continue;
    tagCount.set(info.tag, (tagCount.get(info.tag) || 0) + 1);
  }
  const duplicates = new Set([...tagCount].filter(([, n]) => n > 1).map(([t]) => t));

  return { comps, nets, pinNet, wireNet, junctions, openPins, duplicates };
}

const near = (e, p) => Math.abs(e.x - p[0]) < EPS && Math.abs(e.y - p[1]) < EPS;

/** Pins in the same net as the given pin, excluding the pin itself (for terminal / wire lists). */
export function partners(an, compId, pinId) {
  const net = an.pinNet.get(`${compId}:${pinId}`);
  if (!net) return [];
  return net.pins.filter((p) => !(p.info.comp.id === compId && p.pin.id === pinId));
}

export const pinLabel = (p) => {
  const role = p.info.def?.role;
  if (role === 'terminal') return `${p.info.tag}:${p.info.comp.props?.number ?? '?'}`;
  if (role === 'link') return `→${p.info.tag}`;
  return `${p.info.tag || '?'}:${p.pin.name}`;
};
