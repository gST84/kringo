// Floor plan editor: walls, openings, stairs, room names, installation symbols and links.
import { SHEET } from '../model.js';
import { clone, r2, snap, uid } from '../util.js';
import { geometry } from '../symbols/geom.js';
import { shapeSvg, textSvg } from '../schematic/render.js';
import { planSvg, planK, PLAN_ORIGIN, wallPolygon } from './render.js';
import { nearestWall, nextNumber, projectOnWall, wallFrame } from './model.js';

const NS = 'http://www.w3.org/2000/svg';
const near = (a, b, tol = 0.5) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol;

export const OPENING_TYPES = {
  door: { label: 'Deur', width: 83 },
  door2: { label: 'Dubbele deur', width: 150 },
  window: { label: 'Raam', width: 120 },
  slide: { label: 'Schuifraam / -deur', width: 240 },
};

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
    this.wallT = 30;
    this.wallKind = 'outer';
    this.openingType = 'door';
    this.activeCircuit = '';
    this.mouse = [0, 0]; // plan cm
    this.raw = [0, 0];
    this.chain = null; // wall drawing: last point
    this.typed = '';
    this.placing = null;
    this.linkFrom = null;
    this.drag = null;
    this.space = false;
    this.showGrid = true;
    this.bind();
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

  // ---------- snapping ----------
  snapPoint(p, e, from) {
    if (e?.altKey) return p.map(r2);
    const tol = this.px(10);
    for (const w of this.floor.walls) for (const q of [[w.x1, w.y1], [w.x2, w.y2]]) if (near(p, q, tol)) return [...q];
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

  // ---------- tools ----------
  setTool(tool, opts = {}) {
    this.tool = tool;
    this.chain = null;
    this.typed = '';
    this.linkFrom = null;
    this.placing = tool === 'place' ? { sym: opts.sym, rot: 0 } : null;
    if (tool === 'opening' && opts.type) this.openingType = opts.type;
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
    this.layer.innerHTML = planSvg(this.app.project, this.app.floorIdx, this.app.lib, { selection: sel, grid: this.showGrid, showRooms: true });
    if (this.app.sel.size === 1) {
      const [t, id] = [...this.app.sel][0].split(':');
      const w = t === 'W' && this.floor.walls.find((x) => x.id === id);
      if (w) {
        const sz = this.px(5);
        let hs = `<g transform="translate(${PLAN_ORIGIN[0]} ${PLAN_ORIGIN[1]}) scale(${k})">`;
        for (const [i, x, y] of [[1, w.x1, w.y1], [2, w.x2, w.y2]]) hs += `<rect class="handle" data-k="WH:${w.id}:${i}" x="${x - sz}" y="${y - sz}" width="${sz * 2}" height="${sz * 2}" style="stroke-width:${this.px(1)}"/>`;
        this.layer.insertAdjacentHTML('beforeend', hs + '</g>');
      }
    }
    this.renderOverlay();
  }

  renderOverlay() {
    if (!this.active()) return;
    const k = this.k;
    const m = this.mouse;
    let s = `<g transform="translate(${PLAN_ORIGIN[0]} ${PLAN_ORIGIN[1]}) scale(${k})">`;
    const sw = this.px(1.5);
    if (this.tool === 'wall') {
      if (this.chain) {
        const end = this.typedPoint() || m;
        const w = { x1: this.chain[0], y1: this.chain[1], x2: end[0], y2: end[1], t: this.wallT };
        if (!near(this.chain, end, 0.01)) s += `<polygon class="ghostwall" points="${wallPolygon(w).map((p) => p.join(',')).join(' ')}"/>`;
        const len = Math.hypot(end[0] - this.chain[0], end[1] - this.chain[1]);
        s += `<g transform="translate(${end[0]} ${end[1]}) scale(${1 / k})">${textSvg(3, -3, (this.typed ? this.typed + '▏' : r2(len)) + ' cm', 2.6, 'start', 'tx measure')}</g>`;
      }
      s += `<circle class="cursor" cx="${m[0]}" cy="${m[1]}" r="${this.px(4)}" style="stroke-width:${sw}"/>`;
    }
    if (this.tool === 'opening' && this.hoverOpening) {
      const { wall, pos, width } = this.hoverOpening;
      const { u, n } = wallFrame(wall);
      const t = (wall.t || 20) / 2 + 2;
      const c = [wall.x1 + u[0] * pos, wall.y1 + u[1] * pos];
      const P = (a, b) => [c[0] + u[0] * a + n[0] * b, c[1] + u[1] * a + n[1] * b];
      s += `<polygon class="ghostopen" points="${[P(-width / 2, t), P(width / 2, t), P(width / 2, -t), P(-width / 2, -t)].map((p) => p.join(',')).join(' ')}"/>`;
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
    this.overlay.innerHTML = s + '</g>';
  }

  /** Position / rotation for a symbol: against the nearest wall for wall-mounted symbols. */
  placement(def, p, e) {
    const rot = this.placing?.rot || 0;
    const q = this.snapPoint(p, { altKey: e?.altKey });
    if (!def.wall || e?.altKey) return { x: q[0], y: q[1], rot };
    const nw = nearestWall(this.floor, p[0], p[1], 60);
    if (!nw) return { x: q[0], y: q[1], rot };
    const { n } = wallFrame(nw.wall);
    const side = nw.d >= 0 ? 1 : -1;
    const nn = [n[0] * side, n[1] * side]; // wall → symbol
    const face = (nw.wall.t || 20) / 2;
    const off = face + 3 / this.k; // symbol centre 3 mm (paper) in front of the wall face
    const g = this.b.grid || 5;
    const t = Math.max(0, Math.min(nw.len, snap(nw.t, g)));
    const { u } = wallFrame(nw.wall);
    const x = nw.wall.x1 + u[0] * t + nn[0] * off, y = nw.wall.y1 + u[1] * t + nn[1] * off;
    const ang = (Math.atan2(nn[0], -nn[1]) * 180) / Math.PI;
    return { x: r2(x), y: r2(y), rot: Math.round(((ang % 360) + 360) % 360) };
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

  hitKey(t) { return t.closest?.('[data-k]')?.dataset.k || null; }

  onDown(e) {
    const app = this.app;
    const raw = this.toPlan(e);
    this.raw = raw;
    if (e.button === 1 || (e.button === 0 && (this.space || this.tool === 'pan'))) {
      this.drag = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: this.view.x, vy: this.view.y };
      this.svg.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button === 2) {
      if (this.tool === 'wall' && this.chain) { this.chain = null; this.typed = ''; this.renderOverlay(); }
      else if (this.tool !== 'select') this.setTool('select');
      return;
    }
    if (e.button !== 0) return;
    this.svg.setPointerCapture(e.pointerId);
    switch (this.tool) {
      case 'wall': return this.wallClick(this.snapPoint(raw, e, this.chain), e);
      case 'opening': return this.addOpening();
      case 'stair': { const p = this.snapPoint(raw, e); this.drag = { type: 'stair', start: p, cur: p }; return; }
      case 'text': return app.emit('planRequestText', this.snapPoint(raw, e));
      case 'place': return this.addSymbol(this.placing.sym, raw, e);
      case 'link': return this.linkClick(this.hitKey(e.target));
    }
    // select
    const key = this.hitKey(e.target);
    if (key?.startsWith('WH:')) {
      const [, id, which] = key.split(':');
      const w = this.floor.walls.find((x) => x.id === id);
      const pt = which === '1' ? [w.x1, w.y1] : [w.x2, w.y2];
      this.drag = { type: 'endpoint', moved: false, ends: this.endsAt(pt), start: pt };
      return;
    }
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
    this.mouse = this.tool === 'wall' ? this.snapPoint(raw, e, this.chain) : this.snapPoint(raw, e);
    this.app.emit('planCursor', this.mouse);
    if (this.tool === 'opening') this.updateHoverOpening(raw);
    if (!d) { if (this.tool !== 'select') this.renderOverlay(); return; }
    if (d.type === 'band') { d.cur = raw; this.renderOverlay(); return; }
    if (d.type === 'stair') { d.cur = this.mouse; this.renderOverlay(); return; }
    if (d.type === 'endpoint') {
      const p = this.snapPoint(raw, e);
      if (!d.moved) { if (near(p, d.start, 0.01)) return; this.app.checkpoint(); d.moved = true; }
      for (const [w, i] of d.ends) { if (i === 1) { w.x1 = p[0]; w.y1 = p[1]; } else { w.x2 = p[0]; w.y2 = p[1]; } }
      this.app.touched();
      return;
    }
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
      }
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
        ], d.add);
      }
      this.renderOverlay();
    } else if (d.type === 'stair') {
      const x0 = Math.min(d.start[0], d.cur[0]), y0 = Math.min(d.start[1], d.cur[1]);
      const w = Math.abs(d.cur[0] - d.start[0]), h = Math.abs(d.cur[1] - d.start[1]);
      if (w >= 20 && h >= 20) {
        const st = { id: uid('st'), x: x0, y: y0, w, h, rot: 0, steps: Math.max(3, Math.round(Math.max(w, h) / 25)) };
        if (w > h) { st.rot = 90; st.x = x0 + w; st.w = h; st.h = w; }
        this.app.mutate(() => this.floor.stairs.push(st));
        this.app.select(['S:' + st.id]);
        this.setTool('select');
      }
      this.renderOverlay();
    }
  }

  onDbl(e) {
    if (this.tool === 'wall') { this.chain = null; this.typed = ''; this.renderOverlay(); return; }
    if (this.tool !== 'select') return;
    const key = this.hitKey(e.target);
    if (key?.startsWith('T:')) this.app.emit('planEditText', key.slice(2));
    else if (key) this.app.emit('focusProps', key);
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
    if (k === 'escape') {
      if (this.tool === 'wall' && this.chain) { this.chain = null; this.typed = ''; this.renderOverlay(); }
      else if (this.tool === 'link' && this.linkFrom) { this.linkFrom = null; this.render(); }
      else if (this.tool !== 'select') this.setTool('select');
      else app.select([]);
    } else if (k === 'delete' || k === 'backspace') { e.preventDefault(); this.deleteSelection(); }
    else if (k === 'r') this.rotate();
    else if (k === 'w') this.setTool('wall');
    else if (k === 'd') this.setTool('opening', { type: 'door' });
    else if (k === 'n') this.setTool('opening', { type: 'window' });
    else if (k === 'l') this.setTool('link');
    else if (k === 't') this.setTool('text');
    else if (k === 'v' || k === 's') this.setTool('select');
    else if (k === 'h') this.setTool('pan');
    else if (k === 'f') this.fit();
    else if (k === '+' || k === '=') this.zoomBy(0.8);
    else if (k === '-') this.zoomBy(1.25);
  }

  // ---------- operations ----------
  wallClick(p) {
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
    const o = { id: uid('o'), wall: h.wall.id, pos: h.pos, width: h.width, type: this.openingType, side: h.side, hinge: 'l', height: this.openingType.startsWith('door') ? 210 : 140 };
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
    const a = this.linkFrom;
    this.app.mutate(() => {
      const f = this.floor;
      const i = f.links.findIndex((l) => (l.a === a && l.b === id) || (l.a === id && l.b === a));
      if (i >= 0) f.links.splice(i, 1);
      else f.links.push({ id: uid('l'), a, b: id });
    });
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
    const walls = f.walls.filter((w) => sel.has('W:' + w.id));
    const wset = new Set(walls);
    const attached = [];
    for (const w of walls) for (const pt of [[w.x1, w.y1], [w.x2, w.y2]]) {
      for (const [o, i] of this.endsAt(pt, wset)) attached.push([o, i, i === 1 ? o.x1 : o.x2, i === 1 ? o.y1 : o.y2]);
    }
    return {
      type: 'move', start, items, attached, moved: false, dx: 0, dy: 0,
      walls: walls.map((w) => ({ o: w, x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 })),
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
      for (const s of stairs) s.rot = ((s.rot || 0) + 90) % 360;
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
