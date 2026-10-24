// Floor plan editor: walls (straight and curved), openings, stairs, room names, dimension lines,
// coloured areas / lines, a background drawing, installation symbols and links.
import { SHEET } from '../model.js';
import { clone, r2, snap, uid } from '../util.js';
import { geometry } from '../symbols/geom.js';
import { shapeSvg, textSvg } from '../schematic/render.js';
import { dimGeom, dimSvg, OPENING_TYPES, planSvg, planK, PLAN_ORIGIN, wallPolygon } from './render.js';
import { nearestWall, nextNumber, projectOnWall, rotateStair, wallGeom } from './model.js';
import { attachTouch } from '../touch.js';

const NS = 'http://www.w3.org/2000/svg';
const near = (a, b, tol = 0.5) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol;
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Tools that draw several points before they create something. */
const POINT_TOOLS = new Set(['arcwall', 'dim', 'area', 'line', 'calib']);

const ico = (inner) => `<svg viewBox="0 0 40 40" width="34" height="34" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

/** Drawing tools of the plan, shown as tiles in the left panel ('Grondplan'). */
export const PLAN_PALETTE = [
  { key: 'wall', label: 'Muur', tool: 'wall', icon: ico('<rect x="4" y="16" width="32" height="8" fill="currentColor" stroke="none"/>') },
  { key: 'arcwall', label: 'Gebogen muur', tool: 'arcwall', icon: ico('<path d="M5 32 A 20 20 0 0 1 35 32" stroke-width="7"/>') },
  { key: 'door', label: 'Deur', tool: 'opening', opts: { type: 'door' }, icon: ico('<path d="M4 30h6M30 30h6M10 30V8"/><path d="M10 8 A 22 22 0 0 1 30 30" stroke-dasharray="3 2" stroke-width="1.4"/>') },
  { key: 'doorway', label: 'Deuropening', tool: 'opening', opts: { type: 'door', leaf: false }, icon: ico('<path d="M2 26h10M28 26h10" stroke-width="7"/><path d="M12 22v8M28 22v8"/>') },
  { key: 'door2', label: 'Dubbele deur', tool: 'opening', opts: { type: 'door2' }, icon: ico('<path d="M3 30h4M33 30h4M7 30V14M33 30V14"/><path d="M7 14 A 13 13 0 0 1 20 30M33 14 A 13 13 0 0 0 20 30" stroke-dasharray="3 2" stroke-width="1.4"/>') },
  { key: 'window', label: 'Raam', tool: 'opening', opts: { type: 'window' }, icon: ico('<path d="M2 20h8M30 20h8" stroke-width="8"/><rect x="10" y="16" width="20" height="8" stroke-width="1.4"/><path d="M10 20h20" stroke-width="1.4"/>') },
  { key: 'slide', label: 'Schuifraam / -deur', tool: 'opening', opts: { type: 'slide' }, icon: ico('<path d="M2 20h6M32 20h6" stroke-width="8"/><path d="M8 17h16M16 23h16" stroke-width="2.4"/>') },
  { key: 'garage', label: 'Garagepoort', tool: 'opening', opts: { type: 'garage' }, icon: ico('<path d="M1 12h6M33 12h6" stroke-width="7"/><path d="M7 12h26" stroke-width="3"/><rect x="7" y="16" width="26" height="14" stroke-dasharray="3 2" stroke-width="1.4"/>') },
  { key: 'stair', label: 'Trap', tool: 'stair', opts: { stair: 'straight' }, icon: ico('<rect x="12" y="3" width="16" height="34" stroke-width="1.6"/><path d="M12 10h16M12 16h16M12 22h16M12 28h16" stroke-width="1"/><path d="M20 34V6M16 10l4-4 4 4" stroke-width="1.4"/>') },
  { key: 'quarter', label: 'Kwartdraaitrap', tool: 'stair', opts: { stair: 'quarter' }, icon: ico('<path d="M4 4h32v12H16v20H4z" stroke-width="1.6"/><path d="M4 28h12M4 22h12M16 16L4 4M22 4v12M29 4v12" stroke-width="1"/><path d="M10 34V10h24M30 7l4 3-4 3" stroke-width="1.4"/>') },
  { key: 'spiral', label: 'Wenteltrap', tool: 'spiral', icon: ico('<circle cx="20" cy="20" r="16" stroke-width="1.6"/><circle cx="20" cy="20" r="3" stroke-width="1.2"/><path d="M20 17V4M23 20h13M20 23v13M17 20H4M22 18l9-9M22 22l9 9M18 22l-9 9M18 18 9 9" stroke-width="1"/>') },
  { key: 'text', label: 'Ruimtenaam', tool: 'text', icon: ico('<path d="M10 10h20M20 10v22" stroke-width="3"/>') },
  { key: 'dim', label: 'Maatlijn', tool: 'dim', icon: ico('<path d="M5 26h30M5 20v12M35 20v12M2 29l6-6M32 29l6-6" stroke-width="1.6"/><text x="20" y="18" font-size="11" text-anchor="middle" fill="currentColor" stroke="none" font-family="sans-serif">385</text>') },
  { key: 'area', label: 'Gekleurd vlak', tool: 'area', icon: ico('<path d="M6 30 10 8l20 4 4 18z" fill="#93c5fd" fill-opacity=".7" stroke="#3b82f6"/>') },
  { key: 'line', label: 'Lijn', tool: 'line', icon: ico('<path d="M5 32 16 12l9 14 10-18" stroke="#dc2626" stroke-width="2.5"/>') },
  { key: 'link', label: 'Koppelen', tool: 'link', icon: ico('<circle cx="9" cy="28" r="4"/><circle cx="31" cy="12" r="4"/><path d="M12 25q4-14 16-11" stroke-dasharray="3 2"/>') },
  { key: 'bg', label: 'Achtergrond (afbeelding / PDF)', action: 'background', icon: ico('<rect x="4" y="7" width="32" height="26" rx="2" stroke-width="1.6"/><path d="m6 29 9-10 7 7 4-4 8 7" stroke-width="1.4"/><circle cx="27" cy="14" r="3" stroke-width="1.4"/>') },
  { key: 'calib', label: 'Schaal bepalen', tool: 'calib', icon: ico('<path d="M4 30 36 10" stroke-width="1.6"/><circle cx="4" cy="30" r="3"/><circle cx="36" cy="10" r="3"/><path d="M14 33l3-5M24 27l3-5" stroke-width="1.2"/>') },
];

export class PlanEditor {
  constructor(app, host) {
    this.app = app;
    this.host = host;
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.classList.add('canvas', 'plancanvas');
    this.svg.innerHTML = '<defs></defs><g class="pagelayer"></g><g class="overlay"></g>';
    this.defs = this.svg.querySelector('defs');
    this.layer = this.svg.querySelector('.pagelayer');
    this.overlay = this.svg.querySelector('.overlay');
    host.append(this.svg);
    this.view = { x: 0, y: 0, s: 1 };
    this.tool = 'select';
    this.toolKey = 'select';
    this.wallT = 30;
    this.wallKind = 'outer';
    this.openingType = 'door';
    this.openingLeaf = true;
    this.stairKind = 'straight';
    this.activeCircuit = '';
    this.mouse = [0, 0]; // plan cm
    this.raw = [0, 0];
    this.chain = null; // wall drawing: last point
    this.pts = []; // points of the arc wall / dimension / area / line / calibration being drawn
    this.typed = '';
    this.placing = null;
    this.linkFrom = null;
    this.drag = null;
    this.space = false;
    this.showGrid = true;
    this.blobUrls = new Map();
    this.bind();
    attachTouch(this.svg, this);
    new ResizeObserver(() => this.applyView()).observe(host);
    requestAnimationFrame(() => this.fit());
  }

  get b() { return this.app.project.building; }
  get floor() { return this.app.floor; }
  get k() { return planK(this.b); }
  active() { return this.app.mode === 'building'; }

  // ---------- view ----------
  applyView() {
    const w = this.host.clientWidth || 800, h = this.host.clientHeight || 600;
    this.svg.setAttribute('viewBox', `${this.view.x} ${this.view.y} ${w * this.view.s} ${h * this.view.s}`);
  }
  fit() {
    const w = this.host.clientWidth || 800, h = this.host.clientHeight || 600;
    const s = Math.max((SHEET.w + 16) / w, (SHEET.h + 16) / h);
    this.view = { s, x: SHEET.w / 2 - (w * s) / 2, y: SHEET.h / 2 - (h * s) / 2 };
    this.applyView();
  }
  zoomAt(f, cx, cy) {
    const r = this.svg.getBoundingClientRect();
    const px = cx - r.left, py = cy - r.top;
    const wx = this.view.x + px * this.view.s, wy = this.view.y + py * this.view.s;
    const s = Math.min(2, Math.max(0.005, this.view.s * f));
    this.view = { s, x: wx - px * s, y: wy - py * s };
    this.applyView();
  }
  zoomBy(f) { const r = this.svg.getBoundingClientRect(); this.zoomAt(f, r.left + r.width / 2, r.top + r.height / 2); }

  /** Pointer → plan centimetres. */
  toPlan(e) {
    const r = this.svg.getBoundingClientRect();
    const sx = this.view.x + (e.clientX - r.left) * this.view.s;
    const sy = this.view.y + (e.clientY - r.top) * this.view.s;
    return [(sx - PLAN_ORIGIN[0]) / this.k, (sy - PLAN_ORIGIN[1]) / this.k];
  }
  /** Screen pixels → plan centimetres. */
  px(n) { return (n * this.view.s) / this.k; }

  /** Short blob: URL for a background image (keeps the SVG markup small while editing). */
  imageUrl(id) {
    const data = this.app.project.images?.[id];
    if (!data) return null;
    const hit = this.blobUrls.get(id);
    if (hit?.data === data) return hit.url;
    if (hit) URL.revokeObjectURL(hit.url);
    try {
      const [head, b64] = data.split(',');
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: head.slice(5).split(';')[0] }));
      this.blobUrls.set(id, { data, url });
      return url;
    } catch { return data; }
  }

  // ---------- snapping ----------
  /** Outer corners of straight walls and the jambs of openings (for dimension lines). */
  corners() {
    const out = [];
    const f = this.floor;
    for (const w of f.walls) {
      const poly = wallPolygon(w);
      out.push(poly[0], poly[poly.length - 1]);
      const n = poly.length / 2;
      out.push(poly[n - 1], poly[n]);
    }
    const byId = new Map(f.walls.map((w) => [w.id, w]));
    for (const o of f.openings) {
      const w = byId.get(o.wall);
      if (!w) continue;
      const g = wallGeom(w), t = (w.t || 20) / 2;
      for (const tt of [o.pos - o.width / 2, o.pos + o.width / 2]) {
        const p = g.at(tt);
        out.push([p.x + p.n[0] * t, p.y + p.n[1] * t], [p.x - p.n[0] * t, p.y - p.n[1] * t]);
      }
    }
    return out;
  }

  snapPoint(p, e, from) {
    if (e?.altKey) return p.map(r2);
    const tol = this.px(10);
    if (this.tool === 'dim') {
      let best = null;
      for (const q of this.corners()) { const d = dist(p, q); if (d <= tol && (!best || d < best.d)) best = { q, d }; }
      if (best) return best.q.map(r2);
    }
    for (const w of this.floor.walls) for (const q of [[w.x1, w.y1], [w.x2, w.y2]]) if (near(p, q, tol)) return [...q];
    if (this.tool === 'area' || this.tool === 'line') {
      for (const sh of this.floor.shapes) for (const q of sh.pts) if (near(p, q, tol)) return [...q];
      if (this.pts.length && near(p, this.pts[0], tol)) return [...this.pts[0]];
    }
    const g = this.b.grid || 5;
    let q = [r2(snap(p[0], g)), r2(snap(p[1], g))];
    if (from) {
      const dx = q[0] - from[0], dy = q[1] - from[1];
      if (Math.abs(dx) < Math.abs(dy) * 0.14) q[0] = from[0];
      else if (Math.abs(dy) < Math.abs(dx) * 0.14) q[1] = from[1];
    }
    // onto an existing wall (T-junction)
    for (const w of this.floor.walls) {
      const pr = projectOnWall(w, q[0], q[1]);
      if (Math.abs(pr.d) < tol && pr.t > 0 && pr.t < pr.len) return [r2(pr.x), r2(pr.y)];
    }
    return q;
  }

  /** Cursor position for the current tool. */
  cursorPoint(raw, e) {
    switch (this.tool) {
      case 'wall': return this.snapPoint(raw, e, this.chain);
      case 'calib': return raw.map(r2);
      case 'arcwall': return this.snapPoint(raw, e, this.pts.length === 1 ? this.pts[0] : null);
      case 'dim': return this.pts.length === 2 ? raw.map(r2) : this.snapPoint(raw, e, this.pts[0]);
      case 'area': case 'line': return this.snapPoint(raw, e, this.pts[this.pts.length - 1]);
      default: return this.snapPoint(raw, e);
    }
  }

  // ---------- tools ----------
  setTool(tool, opts = {}) {
    this.tool = tool;
    this.toolKey = opts.key || (tool === 'opening' ? (opts.leaf === false ? 'doorway' : opts.type || this.openingType) : tool === 'stair' ? (opts.stair === 'quarter' ? 'quarter' : 'stair') : tool);
    this.chain = null;
    this.pts = [];
    this.typed = '';
    this.linkFrom = null;
    this.placing = tool === 'place' ? { sym: opts.sym, rot: 0 } : null;
    if (tool === 'opening') { this.openingType = opts.type || 'door'; this.openingLeaf = opts.leaf !== false; }
    if (tool === 'stair') this.stairKind = opts.stair || 'straight';
    this.svg.dataset.tool = tool;
    this.app.emit('planTool', tool);
    this.renderOverlay();
  }

  render() {
    if (!this.active()) return;
    const k = this.k;
    const g = 50 * k; // 50 cm grid on paper
    this.defs.innerHTML = `<pattern id="pgp" width="${g}" height="${g}" x="${PLAN_ORIGIN[0] - g / 2}" y="${PLAN_ORIGIN[1] - g / 2}" patternUnits="userSpaceOnUse"><circle cx="${g / 2}" cy="${g / 2}" r="0.25" fill="#b9c0cc"/></pattern>`;
    const sel = new Set(this.app.sel);
    if (this.linkFrom) sel.add('A:' + this.linkFrom);
    this.layer.innerHTML = planSvg(this.app.project, this.app.floorIdx, this.app.lib, { selection: sel, grid: this.showGrid, showRooms: true, imageUrl: (id) => this.imageUrl(id) });
    if (this.app.sel.size === 1) {
      const hs = this.handles([...this.app.sel][0]);
      if (hs) this.layer.insertAdjacentHTML('beforeend', `<g transform="translate(${PLAN_ORIGIN[0]} ${PLAN_ORIGIN[1]}) scale(${k})">${hs}</g>`);
    }
    this.renderOverlay();
  }

  /** Drag handles of the selected element. */
  handles(key) {
    const [type, id] = key.split(':');
    const f = this.floor;
    const sz = this.px(5);
    const sw = this.px(1);
    const sq = (x, y, k) => `<circle class="phandle" data-k="${k}" cx="${x}" cy="${y}" r="${sz * 1.15}" style="stroke-width:${sw * 1.2}"/>`;
    const dot = (x, y, k, title) => `<circle class="phandle alt" data-k="${k}" cx="${x}" cy="${y}" r="${sz * 1.15}" style="stroke-width:${sw * 1.2}"><title>${title}</title></circle>`;
    let s = '';
    if (type === 'W') {
      const w = f.walls.find((x) => x.id === id);
      if (!w) return '';
      s += sq(w.x1, w.y1, `WH:${id}:1`) + sq(w.x2, w.y2, `WH:${id}:2`);
      const m = w.cx != null ? [w.cx, w.cy] : [(w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2];
      s += dot(m[0], m[1], `WH:${id}:3`, 'Sleep om de muur te buigen');
    } else if (type === 'O') {
      const o = f.openings.find((x) => x.id === id);
      const w = o && f.walls.find((x) => x.id === o.wall);
      if (!w) return '';
      const g = wallGeom(w);
      for (const [i, tt] of [[1, o.pos - o.width / 2], [2, o.pos + o.width / 2]]) { const p = g.at(tt); s += sq(p.x, p.y, `OH:${id}:${i}`); }
    } else if (type === 'P') {
      const sh = f.shapes.find((x) => x.id === id);
      if (!sh) return '';
      sh.pts.forEach(([x, y], i) => { s += sq(x, y, `PH:${id}:${i}`); });
    } else if (type === 'D') {
      const d = f.dims.find((x) => x.id === id);
      if (!d) return '';
      const { q1, q2 } = dimGeom(d);
      s += sq(d.x1, d.y1, `DH:${id}:1`) + sq(d.x2, d.y2, `DH:${id}:2`);
      s += dot((q1[0] + q2[0]) / 2, (q1[1] + q2[1]) / 2, `DH:${id}:3`, 'Sleep om de maatlijn te verschuiven');
    } else if (type === 'S') {
      const st = f.stairs.find((x) => x.id === id);
      if (st?.kind === 'spiral') s += dot(st.x + (st.r || 100), st.y, `SH:${id}:r`, 'Sleep om de straal te wijzigen');
      else if (st) {
        // corner and edge handles in the stair's own (rotated) frame
        const a = ((st.rot || 0) * Math.PI) / 180, c = Math.cos(a), si = Math.sin(a);
        const P = (lx, ly) => [st.x + lx * c - ly * si, st.y + lx * si + ly * c];
        for (const [which, lx, ly] of [['wh', st.w, st.h], ['w', st.w, st.h / 2], ['h', st.w / 2, st.h]]) {
          const [x, y] = P(lx, ly);
          s += sq(x, y, `SH:${id}:${which}`);
        }
      }
    }
    return s;
  }

  renderOverlay() {
    if (!this.active()) return;
    const k = this.k;
    const m = this.mouse;
    let s = `<g transform="translate(${PLAN_ORIGIN[0]} ${PLAN_ORIGIN[1]}) scale(${k})">`;
    const sw = this.px(1.5);
    const label = (p, text) => `<g transform="translate(${p[0]} ${p[1]}) scale(${1 / k})">${textSvg(3, -3, text, 2.6, 'start', 'tx measure')}</g>`;
    const ghostWall = (w) => `<polygon class="ghostwall" points="${wallPolygon(w).map((p) => p.join(',')).join(' ')}"/>`;
    const cursor = () => `<circle class="cursor" cx="${m[0]}" cy="${m[1]}" r="${this.px(4)}" style="stroke-width:${sw}"/>`;
    if (this.tool === 'wall') {
      if (this.chain) {
        const end = this.typedPoint() || m;
        if (!near(this.chain, end, 0.01)) s += ghostWall({ x1: this.chain[0], y1: this.chain[1], x2: end[0], y2: end[1], t: this.wallT });
        s += label(end, (this.typed ? this.typed + '▏' : r2(dist(this.chain, end))) + ' cm');
      }
      s += cursor();
    }
    if (this.tool === 'arcwall') {
      const [a, b] = this.pts;
      if (a && !b && !near(a, m, 0.01)) { s += ghostWall({ x1: a[0], y1: a[1], x2: m[0], y2: m[1], t: this.wallT }); s += label(m, r2(dist(a, m)) + ' cm'); }
      if (a && b) {
        const w = { x1: a[0], y1: a[1], x2: b[0], y2: b[1], cx: m[0], cy: m[1], t: this.wallT };
        s += ghostWall(w) + label(m, r2(wallGeom(w).len) + ' cm');
      }
      s += cursor();
    }
    if (this.tool === 'dim') {
      const [a, b] = this.pts;
      if (a && !b) s += `<line class="ghostline" x1="${a[0]}" y1="${a[1]}" x2="${m[0]}" y2="${m[1]}" style="stroke-width:${sw}"/>` + label(m, r2(dist(a, m)) + ' cm');
      if (a && b) {
        const d = { x1: a[0], y1: a[1], x2: b[0], y2: b[1] };
        const { n } = dimGeom(d);
        d.off = r2((m[0] - a[0]) * n[0] + (m[1] - a[1]) * n[1]);
        s += `<g class="ghostdim">${dimSvg(d, k, 0.25 / k, false, { print: true })}</g>`;
      }
      s += cursor();
    }
    if ((this.tool === 'area' || this.tool === 'line') && this.pts.length) {
      const list = [...this.pts, m];
      s += this.tool === 'area'
        ? `<polygon class="ghostarea" points="${list.map((p) => p.join(',')).join(' ')}" style="stroke-width:${sw}"/>`
        : `<polyline class="ghostline" points="${list.map((p) => p.join(',')).join(' ')}" style="fill:none;stroke-width:${sw}"/>`;
      s += label(m, r2(dist(this.pts[this.pts.length - 1], m)) + ' cm');
    }
    if (this.tool === 'area' || this.tool === 'line') s += cursor();
    if (this.tool === 'calib') {
      const [a] = this.pts;
      if (a) s += `<line class="ghostline" x1="${a[0]}" y1="${a[1]}" x2="${m[0]}" y2="${m[1]}" style="stroke-width:${sw}"/>` + label(m, r2(dist(a, m)) + ' cm');
      s += `<path class="ghostline" d="M ${m[0] - this.px(8)} ${m[1]} h ${this.px(16)} M ${m[0]} ${m[1] - this.px(8)} v ${this.px(16)}" style="stroke-width:${sw}"/>`;
    }
    if (this.tool === 'opening' && this.hoverOpening) {
      const { wall, pos, width } = this.hoverOpening;
      const g = wallGeom(wall);
      const t = (wall.t || 20) / 2 + 2;
      const A = g.at(pos - width / 2), B = g.at(pos + width / 2);
      const P = (p, d) => [p.x + p.n[0] * d, p.y + p.n[1] * d];
      s += `<polygon class="ghostopen" points="${[P(A, t), P(B, t), P(B, -t), P(A, -t)].map((p) => p.join(',')).join(' ')}"/>`;
    }
    if (this.tool === 'place' && this.placing) {
      const def = this.app.lib.get(this.placing.sym);
      if (def) {
        const pl = this.placement(def, this.raw, null);
        const geom = geometry(def, {});
        let shapes = '';
        for (const g of geom.graphics || []) shapes += g.t === 'text' ? textSvg(g.x, g.y, g.text, g.size, g.anchor) : shapeSvg(g);
        s += `<g class="ghost" transform="translate(${pl.x} ${pl.y}) scale(${1 / k}) rotate(${pl.rot})">${shapes}</g>`;
      }
    }
    if (this.drag?.type === 'band' || this.drag?.type === 'stair') {
      const [ax, ay] = this.drag.start, [bx, by] = this.drag.cur;
      s += `<rect class="${this.drag.type === 'band' ? 'band' : 'ghostbox'}" x="${Math.min(ax, bx)}" y="${Math.min(ay, by)}" width="${Math.abs(bx - ax)}" height="${Math.abs(by - ay)}" style="stroke-width:${sw}"/>`;
    }
    if (this.drag?.type === 'spiral') {
      const r = dist(this.drag.start, this.drag.cur);
      s += `<circle class="ghostbox" cx="${this.drag.start[0]}" cy="${this.drag.start[1]}" r="${r}" style="stroke-width:${sw}"/>` + label(this.drag.cur, 'r ' + r2(r) + ' cm');
    }
    this.overlay.innerHTML = s + '</g>';
  }

  /** Position / rotation for a symbol: against the nearest wall for wall-mounted symbols. */
  placement(def, p, e) {
    const rot = this.placing?.rot || 0;
    const q = this.snapPoint(p, { altKey: e?.altKey });
    if (!def.wall || e?.altKey) return { x: q[0], y: q[1], rot };
    const nw = nearestWall(this.floor, p[0], p[1], 60);
    if (!nw) return { x: q[0], y: q[1], rot };
    const g = this.b.grid || 5;
    const t = Math.max(0, Math.min(nw.len, snap(nw.t, g)));
    const at = wallGeom(nw.wall).at(t);
    const side = nw.d >= 0 ? 1 : -1;
    const nn = [at.n[0] * side, at.n[1] * side]; // wall → symbol
    const off = (nw.wall.t || 20) / 2 + 3 / this.k; // symbol centre 3 mm (paper) in front of the wall face
    const ang = (Math.atan2(nn[0], -nn[1]) * 180) / Math.PI;
    return { x: r2(at.x + nn[0] * off), y: r2(at.y + nn[1] * off), rot: Math.round(((ang % 360) + 360) % 360) };
  }

  typedPoint() {
    if (!this.chain || !this.typed) return null;
    const len = parseFloat(this.typed.replace(',', '.'));
    if (!(len > 0)) return null;
    let dx = this.mouse[0] - this.chain[0], dy = this.mouse[1] - this.chain[1];
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    return [r2(this.chain[0] + dx * len), r2(this.chain[1] + dy * len)];
  }

  // ---------- events ----------
  bind() {
    const svg = this.svg;
    svg.addEventListener('pointerdown', (e) => this.onDown(e));
    svg.addEventListener('pointermove', (e) => this.onMove(e));
    svg.addEventListener('pointerup', (e) => this.onUp(e));
    svg.addEventListener('dblclick', (e) => this.onDbl(e));
    svg.addEventListener('contextmenu', (e) => e.preventDefault());
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey || e.deltaMode === 1 || (Math.abs(e.deltaY) >= 50 && Math.abs(e.deltaX) < 1)) {
        this.zoomAt(Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY);
      } else {
        this.view.x += e.deltaX * this.view.s;
        this.view.y += e.deltaY * this.view.s;
        this.applyView();
      }
    }, { passive: false });
    svg.addEventListener('dragover', (e) => e.preventDefault());
    svg.addEventListener('drop', (e) => {
      e.preventDefault();
      const sym = e.dataTransfer.getData('text/x-kringo-symbol');
      if (!sym) return;
      this.placing = { sym, rot: 0 };
      this.addSymbol(sym, this.toPlan(e), e);
      this.placing = null;
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('keyup', (e) => { if (e.code === 'Space') this.space = false; });
  }

  /** Aborts a press that turned into a two-finger gesture. */
  cancelInteraction() {
    if (this.drag?.moved) this.app.touched();
    this.drag = null;
    if (this.tool === 'wall' && this.chain && this.chainFresh) this.chain = null;
    if (this.ptsFresh) { this.pts.pop(); this.ptsFresh = false; }
    this.renderOverlay();
  }

  hitKey(t) { return t.closest?.('[data-k]')?.dataset.k || null; }

  onDown(e) {
    const app = this.app;
    const raw = this.toPlan(e);
    this.raw = raw;
    this.ptsFresh = false;
    if (e.button === 1 || (e.button === 0 && (this.space || this.tool === 'pan'))) {
      this.drag = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: this.view.x, vy: this.view.y };
      this.svg.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button === 2) {
      if (this.tool === 'wall' && this.chain) { this.chain = null; this.typed = ''; this.renderOverlay(); }
      else if ((this.tool === 'area' && this.pts.length >= 3) || (this.tool === 'line' && this.pts.length >= 2)) this.finishShape();
      else if (this.pts.length) { this.pts = []; this.renderOverlay(); }
      else if (this.tool !== 'select') this.setTool('select');
      return;
    }
    if (e.button !== 0) return;
    this.svg.setPointerCapture(e.pointerId);
    const p = this.cursorPoint(raw, e);
    switch (this.tool) {
      case 'wall': return this.wallClick(p, e);
      case 'arcwall': return this.arcClick(p);
      case 'dim': return this.dimClick(p);
      case 'area': case 'line': return this.shapeClick(p);
      case 'calib': return this.calibClick(p);
      case 'opening': return this.addOpening();
      case 'stair': this.drag = { type: 'stair', start: p, cur: p }; return;
      case 'spiral': this.drag = { type: 'spiral', start: p, cur: p }; return;
      case 'text': return app.emit('planRequestText', p);
      case 'place': return this.addSymbol(this.placing.sym, raw, e);
      case 'link': return this.linkClick(this.hitKey(e.target));
    }
    // select
    const key = this.hitKey(e.target);
    if (/^(WH|OH|PH|DH|SH):/.test(key || '')) { this.drag = { type: 'handle', key, moved: false, start: raw }; this.startHandle(this.drag); return; }
    if (key) {
      if (e.shiftKey) {
        if (app.sel.has(key)) { app.sel.delete(key); app.emit('selection'); return; }
        app.select([key], true);
      } else if (!app.sel.has(key)) app.select([key]);
      this.drag = this.makeMove(raw, key);
    } else {
      if (!e.shiftKey && app.sel.size) app.select([]);
      this.drag = { type: 'band', start: raw, cur: raw, add: e.shiftKey };
    }
  }

  onMove(e) {
    const raw = this.toPlan(e);
    this.raw = raw;
    const d = this.drag;
    if (d?.type === 'pan') {
      this.view.x = d.vx - (e.clientX - d.sx) * this.view.s;
      this.view.y = d.vy - (e.clientY - d.sy) * this.view.s;
      this.applyView();
      return;
    }
    this.mouse = this.cursorPoint(raw, e);
    this.app.emit('planCursor', this.mouse);
    if (this.tool === 'opening') this.updateHoverOpening(raw);
    if (!d) { if (this.tool !== 'select') this.renderOverlay(); return; }
    if (d.type === 'band') { d.cur = raw; this.renderOverlay(); return; }
    if (d.type === 'stair' || d.type === 'spiral') { d.cur = this.mouse; this.renderOverlay(); return; }
    if (d.type === 'handle') { this.moveHandle(d, raw, e); return; }
    if (d.type === 'move') {
      const g = e.altKey ? 0 : this.b.grid || 5;
      const dx = r2(snap(raw[0] - d.start[0], g)), dy = r2(snap(raw[1] - d.start[1], g));
      if (d.opening) {
        const o = d.opening;
        const w = this.floor.walls.find((x) => x.id === o.wall);
        if (!w) return;
        const pr = projectOnWall(w, raw[0], raw[1]);
        const pos = r2(Math.max(o.width / 2, Math.min(pr.len - o.width / 2, snap(pr.t, g || 1))));
        if (pos === o.pos) return;
        if (!d.moved) { this.app.checkpoint(); d.moved = true; }
        o.pos = pos;
        this.app.touched();
        return;
      }
      if (dx === d.dx && dy === d.dy) return;
      if (!d.moved) { this.app.checkpoint(); d.moved = true; }
      d.dx = dx; d.dy = dy;
      for (const it of d.items) { it.o.x = r2(it.x + dx); it.o.y = r2(it.y + dy); }
      for (const it of d.walls) {
        it.o.x1 = r2(it.x1 + dx); it.o.y1 = r2(it.y1 + dy); it.o.x2 = r2(it.x2 + dx); it.o.y2 = r2(it.y2 + dy);
        if (it.cx != null) { it.o.cx = r2(it.cx + dx); it.o.cy = r2(it.cy + dy); }
      }
      for (const it of d.dims) { it.o.x1 = r2(it.x1 + dx); it.o.y1 = r2(it.y1 + dy); it.o.x2 = r2(it.x2 + dx); it.o.y2 = r2(it.y2 + dy); }
      for (const it of d.shapes) it.o.pts = it.pts.map(([x, y]) => [r2(x + dx), r2(y + dy)]);
      for (const [w, i, x, y] of d.attached) { if (i === 1) { w.x1 = r2(x + dx); w.y1 = r2(y + dy); } else { w.x2 = r2(x + dx); w.y2 = r2(y + dy); } }
      this.app.touched();
    }
  }

  onUp() {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d.type === 'band') {
      const x0 = Math.min(d.start[0], d.cur[0]), x1 = Math.max(d.start[0], d.cur[0]);
      const y0 = Math.min(d.start[1], d.cur[1]), y1 = Math.max(d.start[1], d.cur[1]);
      const inR = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
      if (x1 - x0 > 1 || y1 - y0 > 1) {
        const f = this.floor;
        this.app.select([
          ...f.walls.filter((w) => inR(w.x1, w.y1) && inR(w.x2, w.y2)).map((w) => 'W:' + w.id),
          ...f.symbols.filter((s) => inR(s.x, s.y)).map((s) => 'A:' + s.id),
          ...f.texts.filter((t) => inR(t.x, t.y)).map((t) => 'T:' + t.id),
          ...f.stairs.filter((s) => inR(s.x, s.y)).map((s) => 'S:' + s.id),
          ...f.dims.filter((m) => inR(m.x1, m.y1) && inR(m.x2, m.y2)).map((m) => 'D:' + m.id),
          ...f.shapes.filter((sh) => sh.pts.every(([x, y]) => inR(x, y))).map((sh) => 'P:' + sh.id),
        ], d.add);
      }
      this.renderOverlay();
    } else if (d.type === 'stair') {
      let x0 = Math.min(d.start[0], d.cur[0]), y0 = Math.min(d.start[1], d.cur[1]);
      let w = Math.abs(d.cur[0] - d.start[0]), h = Math.abs(d.cur[1] - d.start[1]);
      const quarter = this.stairKind === 'quarter';
      if (w < 20 || h < 20) { // a click: default size
        [w, h] = quarter ? [250, 250] : [100, 300];
        [x0, y0] = d.start;
      }
      const st = { id: uid('st'), x: x0, y: y0, w, h, rot: 0, steps: Math.max(3, Math.round((quarter ? w + h : Math.max(w, h)) / 25)) };
      if (quarter) { st.kind = 'quarter'; st.b = Math.min(90, Math.round(Math.min(w, h) / 2)); }
      else if (w > h) { st.rot = 90; st.x = x0 + w; st.w = h; st.h = w; }
      this.app.mutate(() => this.floor.stairs.push(st));
      this.app.select(['S:' + st.id]);
      this.setTool('select');
    } else if (d.type === 'spiral') {
      let r = r2(dist(d.start, d.cur));
      if (r < 30) r = 100;
      const st = { id: uid('st'), kind: 'spiral', x: d.start[0], y: d.start[1], r, steps: 14, turn: 360, rot: 0, dir: 1 };
      this.app.mutate(() => this.floor.stairs.push(st));
      this.app.select(['S:' + st.id]);
      this.setTool('select');
    }
  }

  onDbl(e) {
    if (this.tool === 'wall') { this.chain = null; this.typed = ''; this.renderOverlay(); return; }
    if (this.tool === 'area' || this.tool === 'line') { this.finishShape(); return; }
    if (this.tool !== 'select') return;
    const key = this.hitKey(e.target);
    if (key?.startsWith('T:')) this.app.emit('planEditText', key.slice(2));
    else if (key && !key.includes('H:')) this.app.emit('focusProps', key);
  }

  onKey(e) {
    if (!this.active()) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (document.querySelector('.modal-back')) return;
    const app = this.app;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (e.code === 'Space') { this.space = true; e.preventDefault(); return; }
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? app.redo() : app.undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); app.redo(); return; }
    if (mod && k === 'd') { e.preventDefault(); this.duplicate(); return; }
    if (mod) return;
    if (this.tool === 'wall' && this.chain && /^[0-9.,]$/.test(e.key)) { this.typed += e.key; this.renderOverlay(); return; }
    if (this.tool === 'wall' && this.chain && k === 'backspace') { e.preventDefault(); this.typed = this.typed.slice(0, -1); this.renderOverlay(); return; }
    if (this.tool === 'wall' && this.chain && k === 'enter') {
      const p = this.typedPoint();
      if (p) this.wallClick(p);
      this.typed = '';
      this.renderOverlay();
      return;
    }
    if (POINT_TOOLS.has(this.tool) && this.pts.length) {
      if (k === 'backspace') { e.preventDefault(); this.pts.pop(); this.renderOverlay(); return; }
      if (k === 'enter' && (this.tool === 'area' || this.tool === 'line')) { this.finishShape(); return; }
      if (k === 'escape') { this.pts = []; this.renderOverlay(); return; }
    }
    if (k === 'escape') {
      if (this.tool === 'wall' && this.chain) { this.chain = null; this.typed = ''; this.renderOverlay(); }
      else if (this.tool === 'link' && this.linkFrom) { this.linkFrom = null; this.render(); }
      else if (this.tool !== 'select') this.setTool('select');
      else app.select([]);
    } else if (k === 'delete' || k === 'backspace') { e.preventDefault(); this.deleteSelection(); }
    else if (k === 'r') this.rotate();
    else if (k === 'w') this.setTool('wall');
    else if (k === 'a') this.setTool('arcwall');
    else if (k === 'd') this.setTool('opening', { type: 'door' });
    else if (k === 'n') this.setTool('opening', { type: 'window' });
    else if (k === 'm') this.setTool('dim');
    else if (k === 'l') this.setTool('link');
    else if (k === 't') this.setTool('text');
    else if (k === 'v' || k === 's') this.setTool('select');
    else if (k === 'h') this.setTool('pan');
    else if (k === 'f') this.fit();
    else if (k === '+' || k === '=') this.zoomBy(0.8);
    else if (k === '-') this.zoomBy(1.25);
  }

  // ---------- handles ----------
  startHandle(d) {
    const [type, id, which] = d.key.split(':');
    const f = this.floor;
    if (type === 'WH' && which !== '3') {
      const w = f.walls.find((x) => x.id === id);
      const pt = which === '1' ? [w.x1, w.y1] : [w.x2, w.y2];
      d.ends = this.endsAt(pt);
      d.anchor = pt;
    }
  }

  moveHandle(d, raw, e) {
    const [type, id, which] = d.key.split(':');
    const f = this.floor;
    const g = e.altKey ? 0 : this.b.grid || 5;
    const begin = () => { if (!d.moved) { this.app.checkpoint(); d.moved = true; } };
    if (type === 'WH') {
      const w = f.walls.find((x) => x.id === id);
      if (!w) return;
      const p = this.snapPoint(raw, e);
      if (which === '3') {
        if (w.cx === p[0] && w.cy === p[1]) return;
        begin();
        const pr = projectOnWall({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 }, p[0], p[1]);
        if (Math.abs(pr.d) < 1) { delete w.cx; delete w.cy; } else { w.cx = p[0]; w.cy = p[1]; }
      } else {
        if (!d.moved && near(p, d.anchor, 0.01)) return;
        begin();
        for (const [ww, i] of d.ends) { if (i === 1) { ww.x1 = p[0]; ww.y1 = p[1]; } else { ww.x2 = p[0]; ww.y2 = p[1]; } }
      }
    } else if (type === 'OH') {
      const o = f.openings.find((x) => x.id === id);
      const w = o && f.walls.find((x) => x.id === o.wall);
      if (!w) return;
      const pr = projectOnWall(w, raw[0], raw[1]);
      const tt = g ? snap(pr.t, g) : pr.t;
      let a = o.pos - o.width / 2, b = o.pos + o.width / 2;
      if (which === '1') a = Math.max(0, Math.min(b - 10, tt)); else b = Math.min(pr.len, Math.max(a + 10, tt));
      const width = r2(b - a), pos = r2((a + b) / 2);
      if (width === o.width && pos === o.pos) return;
      begin();
      o.width = width; o.pos = pos;
    } else if (type === 'PH') {
      const sh = f.shapes.find((x) => x.id === id);
      if (!sh) return;
      const p = this.snapPoint(raw, e);
      const i = +which;
      if (near(sh.pts[i], p, 0.01)) return;
      begin();
      sh.pts[i] = p;
    } else if (type === 'DH') {
      const dm = f.dims.find((x) => x.id === id);
      if (!dm) return;
      begin();
      if (which === '3') {
        const { n } = dimGeom(dm);
        dm.off = r2((raw[0] - dm.x1) * n[0] + (raw[1] - dm.y1) * n[1]);
      } else {
        const prev = this.tool;
        this.tool = 'dim'; // snap to wall corners
        const p = this.snapPoint(raw, e);
        this.tool = prev;
        if (which === '1') { dm.x1 = p[0]; dm.y1 = p[1]; } else { dm.x2 = p[0]; dm.y2 = p[1]; }
      }
    } else if (type === 'SH') {
      const st = f.stairs.find((x) => x.id === id);
      if (!st) return;
      if (which !== 'r') {
        const a = ((st.rot || 0) * Math.PI) / 180, c = Math.cos(a), si = Math.sin(a);
        const dx = raw[0] - st.x, dy = raw[1] - st.y;
        const lx = dx * c + dy * si, ly = -dx * si + dy * c; // pointer in the stair's frame
        const min = st.kind === 'quarter' ? (st.b || 90) + 20 : 30;
        const fit = (v) => r2(Math.max(min, g ? snap(v, g) : v));
        const w = which === 'h' ? st.w : fit(lx), h = which === 'w' ? st.h : fit(ly);
        if (w === st.w && h === st.h) return;
        begin();
        st.w = w; st.h = h;
        this.app.touched();
        return;
      }
      const r = r2(Math.max(30, g ? snap(dist([st.x, st.y], raw), g) : dist([st.x, st.y], raw)));
      if (r === st.r) return;
      begin();
      st.r = r;
    }
    this.app.touched();
  }

  // ---------- operations ----------
  wallClick(p) {
    this.chainFresh = !this.chain;
    if (!this.chain) { this.chain = p; this.renderOverlay(); return; }
    if (near(p, this.chain, 0.01)) { this.chain = null; this.renderOverlay(); return; }
    const w = { id: uid('w'), x1: this.chain[0], y1: this.chain[1], x2: p[0], y2: p[1], t: this.wallT, kind: this.wallKind };
    this.app.mutate(() => this.floor.walls.push(w));
    // closing a room ends the chain
    const closes = this.floor.walls.some((o) => o !== w && (near([o.x1, o.y1], p, 0.01) || near([o.x2, o.y2], p, 0.01)));
    this.chain = closes ? null : p;
    this.typed = '';
    this.renderOverlay();
  }

  /** Curved wall: start point, end point, then a point on the arc. */
  arcClick(p) {
    const n = this.pts.length;
    if (n < 2) {
      if (n === 1 && near(p, this.pts[0], 0.01)) return;
      this.pts.push(p);
      this.ptsFresh = true;
      this.renderOverlay();
      return;
    }
    const [a, b] = this.pts;
    const w = { id: uid('w'), x1: a[0], y1: a[1], x2: b[0], y2: b[1], t: this.wallT, kind: this.wallKind };
    if (Math.abs(projectOnWall(w, p[0], p[1]).d) >= 1) { w.cx = p[0]; w.cy = p[1]; }
    this.app.mutate(() => this.floor.walls.push(w));
    this.pts = [];
    this.renderOverlay();
  }

  /** Dimension line: two measured points, then the position of the line. */
  dimClick(p) {
    if (this.pts.length < 2) {
      if (this.pts.length === 1 && near(p, this.pts[0], 0.01)) return;
      this.pts.push(p);
      this.ptsFresh = true;
      this.renderOverlay();
      return;
    }
    const [a, b] = this.pts;
    const d = { id: uid('dm'), x1: a[0], y1: a[1], x2: b[0], y2: b[1] };
    const { n } = dimGeom(d);
    d.off = r2((p[0] - a[0]) * n[0] + (p[1] - a[1]) * n[1]);
    this.app.mutate(() => this.floor.dims.push(d));
    this.pts = [];
    this.renderOverlay();
  }

  shapeClick(p) {
    if (this.tool === 'area' && this.pts.length >= 3 && near(p, this.pts[0], 0.01)) { this.finishShape(); return; }
    const last = this.pts[this.pts.length - 1];
    if (last && near(p, last, 0.01)) return;
    this.pts.push(p);
    this.ptsFresh = this.pts.length === 1;
    this.renderOverlay();
  }

  finishShape() {
    const type = this.tool === 'area' ? 'area' : 'line';
    const list = this.pts.filter((p, i, a) => i === 0 || !near(p, a[i - 1], 0.01));
    if (type === 'area' && list.length > 3 && near(list[0], list[list.length - 1], 0.01)) list.pop();
    this.pts = [];
    if (list.length < (type === 'area' ? 3 : 2)) { this.renderOverlay(); return; }
    const last = this.lastStyle?.[type] || {};
    const sh = { id: uid('sh'), type, pts: list, ...last };
    this.app.mutate(() => this.floor.shapes.push(sh));
    this.app.select(['P:' + sh.id]);
    this.renderOverlay();
  }

  calibClick(p) {
    if (!this.floor.bg) { this.app.emit('planToast', 'Laad eerst een achtergrond (afbeelding of PDF).'); return; }
    if (!this.pts.length) { this.pts.push(p); this.ptsFresh = true; this.renderOverlay(); return; }
    const a = this.pts[0];
    this.pts = [];
    this.renderOverlay();
    if (dist(a, p) < 1) return;
    this.app.emit('planCalibrate', { a, b: p, len: dist(a, p) });
  }

  /** Scales the background so that the distance between a and b becomes `real` cm. */
  calibrate(a, b, real) {
    const bg = this.floor.bg;
    const f = real / dist(a, b);
    if (!bg || !(f > 0) || !isFinite(f)) return;
    this.app.mutate(() => {
      bg.x = r2(a[0] + (bg.x - a[0]) * f); bg.y = r2(a[1] + (bg.y - a[1]) * f);
      bg.w = r2(bg.w * f); bg.h = r2(bg.h * f);
    });
    this.setTool('select');
  }

  updateHoverOpening(raw) {
    const nw = nearestWall(this.floor, raw[0], raw[1], 50);
    if (!nw) { this.hoverOpening = null; this.renderOverlay(); return; }
    const width = Math.min(OPENING_TYPES[this.openingType].width, nw.len);
    const g = this.b.grid || 5;
    const pos = r2(Math.max(width / 2, Math.min(nw.len - width / 2, snap(nw.t, g))));
    this.hoverOpening = { wall: nw.wall, pos, width, side: nw.d >= 0 ? 1 : -1 };
    this.renderOverlay();
  }

  addOpening() {
    const h = this.hoverOpening;
    if (!h) return;
    const type = this.openingType;
    const o = { id: uid('o'), wall: h.wall.id, pos: h.pos, width: h.width, type, side: h.side, hinge: 'l', height: OPENING_TYPES[type].height };
    if (!this.openingLeaf) o.leaf = false;
    this.app.mutate(() => this.floor.openings.push(o));
    this.app.select(['O:' + o.id]);
  }

  addSymbol(sym, raw, e) {
    const def = this.app.lib.get(sym);
    if (!def) return;
    const pl = this.placement(def, raw, e);
    const s = { id: uid('a'), sym, x: pl.x, y: pl.y, rot: pl.rot, circuit: this.activeCircuit || '', props: {} };
    this.app.mutate(() => {
      if (s.circuit) s.n = nextNumber(this.b, s.circuit);
      this.floor.symbols.push(s);
    });
    this.app.select(['A:' + s.id]);
  }

  linkClick(key) {
    if (!key?.startsWith('A:')) { this.linkFrom = null; this.render(); return; }
    const id = key.slice(2);
    if (!this.linkFrom || this.linkFrom === id) { this.linkFrom = this.linkFrom === id ? null : id; this.render(); return; }
    // chain: 1 → 2 → 3 … (each click links to the previous symbol and continues from the new one)
    const a = this.linkFrom;
    this.app.mutate(() => {
      const f = this.floor;
      const i = f.links.findIndex((l) => (l.a === a && l.b === id) || (l.a === id && l.b === a));
      if (i >= 0) f.links.splice(i, 1);
      else f.links.push({ id: uid('l'), a, b: id });
    });
    this.linkFrom = id;
    this.render();
  }

  /** Wall ends at a point (for dragging shared corners). */
  endsAt(pt, exclude) {
    const out = [];
    for (const w of this.floor.walls) {
      if (exclude?.has(w)) continue;
      if (near([w.x1, w.y1], pt, 0.01)) out.push([w, 1]);
      if (near([w.x2, w.y2], pt, 0.01)) out.push([w, 2]);
    }
    return out;
  }

  makeMove(start, key) {
    const f = this.floor;
    const sel = this.app.sel;
    if (key.startsWith('O:') && sel.size === 1) {
      return { type: 'move', start, opening: f.openings.find((o) => 'O:' + o.id === key), moved: false };
    }
    const items = [];
    for (const s of f.symbols) if (sel.has('A:' + s.id)) items.push({ o: s, x: s.x, y: s.y });
    for (const t of f.texts) if (sel.has('T:' + t.id)) items.push({ o: t, x: t.x, y: t.y });
    for (const s of f.stairs) if (sel.has('S:' + s.id)) items.push({ o: s, x: s.x, y: s.y });
    if (f.bg && sel.has('B:bg') && !f.bg.locked) items.push({ o: f.bg, x: f.bg.x, y: f.bg.y });
    const walls = f.walls.filter((w) => sel.has('W:' + w.id));
    const wset = new Set(walls);
    const attached = [];
    for (const w of walls) for (const pt of [[w.x1, w.y1], [w.x2, w.y2]]) {
      for (const [o, i] of this.endsAt(pt, wset)) attached.push([o, i, i === 1 ? o.x1 : o.x2, i === 1 ? o.y1 : o.y2]);
    }
    return {
      type: 'move', start, items, attached, moved: false, dx: 0, dy: 0,
      walls: walls.map((w) => ({ o: w, x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, cx: w.cx, cy: w.cy })),
      dims: f.dims.filter((d) => sel.has('D:' + d.id)).map((d) => ({ o: d, x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2 })),
      shapes: f.shapes.filter((s) => sel.has('P:' + s.id)).map((s) => ({ o: s, pts: s.pts.map((p) => [...p]) })),
    };
  }

  rotate() {
    if (this.tool === 'place' && this.placing) { this.placing.rot = (this.placing.rot + 90) % 360; this.renderOverlay(); return; }
    const f = this.floor;
    const syms = f.symbols.filter((s) => this.app.sel.has('A:' + s.id));
    const stairs = f.stairs.filter((s) => this.app.sel.has('S:' + s.id));
    if (!syms.length && !stairs.length) return;
    this.app.mutate(() => {
      for (const s of syms) s.rot = ((s.rot || 0) + 90) % 360;
      for (const s of stairs) rotateStair(s, (s.rot || 0) + 90);
    });
  }

  deleteSelection() {
    const sel = this.app.sel;
    if (!sel.size) return;
    this.app.mutate(() => {
      const f = this.floor;
      const walls = new Set(f.walls.filter((w) => sel.has('W:' + w.id)).map((w) => w.id));
      const syms = new Set(f.symbols.filter((s) => sel.has('A:' + s.id)).map((s) => s.id));
      f.walls = f.walls.filter((w) => !walls.has(w.id));
      f.openings = f.openings.filter((o) => !walls.has(o.wall) && !sel.has('O:' + o.id));
      f.symbols = f.symbols.filter((s) => !syms.has(s.id));
      f.links = f.links.filter((l) => !syms.has(l.a) && !syms.has(l.b) && !sel.has('L:' + l.id));
      f.texts = f.texts.filter((t) => !sel.has('T:' + t.id));
      f.stairs = f.stairs.filter((s) => !sel.has('S:' + s.id));
      f.dims = f.dims.filter((d) => !sel.has('D:' + d.id));
      f.shapes = f.shapes.filter((s) => !sel.has('P:' + s.id));
      if (sel.has('B:bg')) f.bg = null;
    });
    this.app.select([]);
  }

  duplicate() {
    const f = this.floor;
    const sel = this.app.sel;
    const d = 50;
    const keys = [];
    this.app.mutate(() => {
      for (const s of f.symbols.filter((x) => sel.has('A:' + x.id))) {
        const c = { ...clone(s), id: uid('a'), x: s.x + d, y: s.y + d };
        if (c.circuit) c.n = nextNumber(this.b, c.circuit);
        f.symbols.push(c); keys.push('A:' + c.id);
      }
      for (const t of f.texts.filter((x) => sel.has('T:' + x.id))) { const c = { ...clone(t), id: uid('t'), x: t.x + d, y: t.y + d }; f.texts.push(c); keys.push('T:' + c.id); }
      for (const s of f.stairs.filter((x) => sel.has('S:' + x.id))) { const c = { ...clone(s), id: uid('st'), x: s.x + d, y: s.y + d }; f.stairs.push(c); keys.push('S:' + c.id); }
      for (const m of f.dims.filter((x) => sel.has('D:' + x.id))) { const c = { ...clone(m), id: uid('dm'), x1: m.x1 + d, y1: m.y1 + d, x2: m.x2 + d, y2: m.y2 + d }; f.dims.push(c); keys.push('D:' + c.id); }
      for (const s of f.shapes.filter((x) => sel.has('P:' + x.id))) { const c = { ...clone(s), id: uid('sh'), pts: s.pts.map(([x, y]) => [x + d, y + d]) }; f.shapes.push(c); keys.push('P:' + c.id); }
    });
    this.app.select(keys);
  }

  addText(p, text) {
    if (!text) return;
    const t = { id: uid('t'), x: p[0], y: p[1], text, size: 3 };
    this.app.mutate(() => this.floor.texts.push(t));
    this.app.select(['T:' + t.id]);
    this.setTool('select');
  }
}

