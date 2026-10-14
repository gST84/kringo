// Symbol geometry: parametric expansion, bounding boxes, placement transforms.

const buildCache = new Map();

/** Graphics + pins of a definition for a given component (expands parametric symbols). */
export function geometry(def, comp) {
  if (!def) return MISSING;
  if (!def.build) return def;
  const props = { ...(def.props || {}), ...(comp?.props || {}) };
  const key = def.id + JSON.stringify(props);
  let g = buildCache.get(key);
  if (!g) {
    g = { ...def, ...def.build(props) };
    if (buildCache.size > 500) buildCache.clear();
    buildCache.set(key, g);
  }
  return g;
}

const MISSING = {
  id: '?', name: 'Onbekend symbool', role: 'device',
  graphics: [{ t: 'rect', x: -5, y: 0, w: 10, h: 10 }, { t: 'text', x: 0, y: 5, text: '?', size: 4, anchor: 'middle' }],
  pins: [],
};

export function bbox(geom) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  };
  for (const g of geom.graphics || []) {
    if (g.t === 'line') { add(g.x1, g.y1); add(g.x2, g.y2); }
    else if (g.t === 'rect') { add(g.x, g.y); add(g.x + g.w, g.y + g.h); }
    else if (g.t === 'circle') { add(g.cx - g.r, g.cy - g.r); add(g.cx + g.r, g.cy + g.r); }
    else if (g.t === 'path') for (const [x, y] of pathPoints(g.d)) add(x, y);
    else if (g.t === 'text') {
      const w = (String(g.text).length * g.size * 0.55) || 1;
      const xs = g.anchor === 'middle' ? g.x - w / 2 : g.anchor === 'end' ? g.x - w : g.x;
      add(xs, g.y - g.size / 2); add(xs + w, g.y + g.size / 2);
    }
  }
  for (const p of geom.pins || []) add(p.x, p.y);
  if (x0 === Infinity) return { x0: -5, y0: -5, x1: 5, y1: 5 };
  return { x0, y0, x1, y1 };
}

/** Rough list of coordinates in a path (for bounding boxes only). */
function pathPoints(d) {
  const nums = String(d).match(/-?\d*\.?\d+(?:e-?\d+)?/gi)?.map(Number) || [];
  const out = [];
  const cmds = String(d).match(/[a-z][^a-z]*/gi) || [];
  for (const c of cmds) {
    const n = c.slice(1).match(/-?\d*\.?\d+(?:e-?\d+)?/gi)?.map(Number) || [];
    if (/a/i.test(c[0])) { for (let i = 0; i + 6 < n.length; i += 7) out.push([n[i + 5], n[i + 6]]); }
    else for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i], n[i + 1]]);
  }
  return out.length ? out : nums.length >= 2 ? [[nums[0], nums[1]]] : [];
}

/** Local symbol point → sheet coordinates for a placed component. */
export function xf(comp, x, y) {
  const k = comp.scale || 1;
  let px = (comp.mirror ? -x : x) * k;
  let py = y * k;
  switch ((((comp.rot || 0) % 360) + 360) % 360) {
    case 90: [px, py] = [-py, px]; break;
    case 180: [px, py] = [-px, -py]; break;
    case 270: [px, py] = [py, -px]; break;
  }
  return [comp.x + px, comp.y + py];
}

export const svgTransform = (comp) => {
  const k = comp.scale || 1;
  const sx = (comp.mirror ? -1 : 1) * k;
  return `translate(${comp.x} ${comp.y}) rotate(${comp.rot || 0})${sx !== 1 || k !== 1 ? ` scale(${sx} ${k})` : ''}`;
};

/** Bounding box of a placed component in sheet coordinates. */
export function worldBox(comp, geom) {
  const b = bbox(geom);
  const pts = [xf(comp, b.x0, b.y0), xf(comp, b.x1, b.y0), xf(comp, b.x0, b.y1), xf(comp, b.x1, b.y1)];
  return {
    x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])),
    x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])),
  };
}

/** Text anchor after rotation/mirroring so labels stay readable. */
export function placeAnchor(comp, anchor) {
  const rot = (((comp.rot || 0) % 360) + 360) % 360;
  let a = anchor || 'start';
  if (comp.mirror) a = a === 'start' ? 'end' : a === 'end' ? 'start' : a;
  if (rot === 180) a = a === 'start' ? 'end' : a === 'end' ? 'start' : a;
  if (rot === 90 || rot === 270) a = 'middle';
  return a;
}
