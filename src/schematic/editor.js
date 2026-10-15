// Schematic canvas: view (zoom / pan), tools and mouse / keyboard interaction.
import { SHEET } from '../model.js';
import { pageSvg } from './render.js';
import { onRail, onSegment } from './analyze.js';
import { geometry, svgTransform, worldBox, xf } from '../symbols/geom.js';
import { shapeSvg } from './render.js';
import { autoTag, nextTerminal, needsTag } from './tags.js';
import { clone, r2, snap, uid } from '../util.js';

const NS = 'http://www.w3.org/2000/svg';
const same = (a, b) => Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01;

export class SchematicEditor {
  constructor(app, host) {
    this.app = app;
    this.host = host;
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.classList.add('canvas');
    this.svg.innerHTML = `<defs><pattern id="gp" width="5" height="5" x="-2.5" y="-2.5" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="0.22" fill="#b9c0cc"/></pattern></defs><g class="pagelayer"></g><g class="overlay"></g>`;
    this.layer = this.svg.querySelector('.pagelayer');
    this.overlay = this.svg.querySelector('.overlay');
    host.append(this.svg);

    this.view = { x: 0, y: 0, s: 1 }; // s = mm per screen pixel
    this.grid = 5;
    this.showGrid = true;
    this.tool = 'select';
    this.placing = null; // {sym, rot, mirror}
    this.wirePts = null;
    this.mouse = [0, 0];
    this.drag = null;
    this.space = false;
    this.clipboard = null;

    this.bind();
    new ResizeObserver(() => this.applyView()).observe(host);
    requestAnimationFrame(() => this.fit());
  }

  // ---------- view ----------

  applyView() {
    const w = this.host.clientWidth || 800;
    const h = this.host.clientHeight || 600;
    this.svg.setAttribute('viewBox', `${this.view.x} ${this.view.y} ${w * this.view.s} ${h * this.view.s}`);
    this.app.emit('view');
  }

  fit() {
    const w = this.host.clientWidth || 800;
    const h = this.host.clientHeight || 600;
    const s = Math.max((SHEET.w + 16) / w, (SHEET.h + 16) / h);
    this.view = { s, x: SHEET.w / 2 - (w * s) / 2, y: SHEET.h / 2 - (h * s) / 2 };
    this.applyView();
  }

  zoomAt(factor, sx, sy) {
    const r = this.svg.getBoundingClientRect();
    const px = sx - r.left, py = sy - r.top;
    const wx = this.view.x + px * this.view.s, wy = this.view.y + py * this.view.s;
    const s = Math.min(2, Math.max(0.01, this.view.s * factor));
    this.view = { s, x: wx - px * s, y: wy - py * s };
    this.applyView();
  }

  zoomBy(f) {
    const r = this.svg.getBoundingClientRect();
    this.zoomAt(f, r.left + r.width / 2, r.top + r.height / 2);
  }

  toWorld(e) {
    const r = this.svg.getBoundingClientRect();
    return [this.view.x + (e.clientX - r.left) * this.view.s, this.view.y + (e.clientY - r.top) * this.view.s];
  }

  snapPt(p, e) {
    const g = e?.altKey ? 0 : this.grid;
    return [r2(snap(p[0], g)), r2(snap(p[1], g))];
  }

  // ---------- tools ----------

  setTool(tool, opts = {}) {
    this.tool = tool;
    this.wirePts = null;
    this.placing = tool === 'place' ? { sym: opts.sym, rot: 0, mirror: false } : null;
    this.svg.dataset.tool = tool;
    this.app.emit('tool', tool);
    this.renderOverlay();
  }

  // ---------- rendering ----------

  render() {
    const app = this.app;
    const an = app.analysis();
    this.layer.innerHTML = pageSvg(app.project, app.page, app.pageIdx, an, { selection: app.sel, grid: this.showGrid });
    this.renderOverlay();
  }

  renderOverlay() {
    let s = '';
    const m = this.mouse;
    if (this.tool === 'place' && this.placing) {
      const def = this.app.lib.get(this.placing.sym);
      if (def) {
        const comp = { x: m[0], y: m[1], rot: this.placing.rot, mirror: this.placing.mirror, props: def.props || {} };
        const g = geometry(def, comp);
        s += `<g class="ghost" transform="${svgTransform(comp)}">${(g.graphics || []).filter((x) => x.t !== 'text').map((x) => shapeSvg(x)).join('')}</g>`;
      }
    }
    if (this.tool === 'wire') {
      if (this.wirePts) {
        const pts = [...this.wirePts, ...this.route(this.wirePts, m)];
        s += `<polyline class="ghostwire" points="${pts.map((p) => p.join(',')).join(' ')}"/>`;
      }
      s += `<circle class="cursor" cx="${m[0]}" cy="${m[1]}" r="0.9"/>`;
    }
    if (this.drag?.type === 'band' || this.drag?.type === 'box') {
      const { x0, y0, x1, y1 } = this.dragRect();
      s += `<rect class="${this.drag.type === 'band' ? 'band' : 'ghostbox'}" x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}"/>`;
    }
    this.overlay.innerHTML = s;
  }

  dragRect() {
    const [ax, ay] = this.drag.start, [bx, by] = this.drag.cur;
    return { x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by) };
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
      if (e.ctrlKey || e.metaKey || e.deltaMode === 1 || Math.abs(e.deltaY) >= 50 && Math.abs(e.deltaX) < 1) {
        this.zoomAt(Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY);
      } else {
        this.view.x += e.deltaX * this.view.s;
        this.view.y += e.deltaY * this.view.s;
        this.applyView();
      }
    }, { passive: false });
    svg.addEventListener('dragover', (e) => { e.preventDefault(); this.mouse = this.snapPt(this.toWorld(e), e); });
    svg.addEventListener('drop', (e) => {
      e.preventDefault();
      const sym = e.dataTransfer.getData('text/x-kringo-symbol');
      if (sym) this.placeSymbol(sym, this.snapPt(this.toWorld(e), e), 0, false);
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('keyup', (e) => { if (e.code === 'Space') this.space = false; });
  }

  hitKey(target) {
    const el = target.closest?.('[data-k]');
    return el ? el.dataset.k : null;
  }

  onDown(e) {
    const app = this.app;
    const raw = this.toWorld(e);
    const p = this.snapPt(raw, e);
    this.mouse = p;
    if (e.button === 1 || (e.button === 0 && (this.space || this.tool === 'pan'))) {
      this.drag = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: this.view.x, vy: this.view.y };
      this.svg.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button === 2) {
      if (this.tool === 'wire' && this.wirePts) this.finishWire();
      else if (this.tool !== 'select') this.setTool('select');
      return;
    }
    if (e.button !== 0) return;
    this.svg.setPointerCapture(e.pointerId);

    if (this.tool === 'place') return this.placeSymbol(this.placing.sym, p, this.placing.rot, this.placing.mirror);
    if (this.tool === 'wire') return this.wireClick(p);
    if (this.tool === 'text') return this.app.emit('requestText', p);
    if (this.tool === 'box') { this.drag = { type: 'box', start: p, cur: p }; return; }

    // select tool
    const key = this.hitKey(e.target);
    if (key?.startsWith('wv:')) {
      const [, wid, idx] = key.split(':');
      const w = app.page.wires.find((x) => x.id === wid);
      this.drag = { type: 'vertex', wire: w, idx: +idx, orig: clone(w.points), start: p, moved: false };
      return;
    }
    if (key) {
      if (e.shiftKey) {
        if (app.sel.has(key)) { app.sel.delete(key); app.emit('selection'); return; }
        app.select([key], true);
      } else if (!app.sel.has(key)) app.select([key]);
      this.startMove(p, key);
    } else {
      if (!e.shiftKey && app.sel.size) app.select([]);
      this.drag = { type: 'band', start: raw, cur: raw, add: e.shiftKey };
    }
  }

  onMove(e) {
    const raw = this.toWorld(e);
    const p = this.snapPt(raw, e);
    const changed = !same(p, this.mouse);
    this.mouse = p;
    this.app.emit('cursor', p);
    const d = this.drag;
    if (!d) {
      if (changed && (this.tool === 'place' || this.tool === 'wire')) this.renderOverlay();
      return;
    }
    if (d.type === 'pan') {
      this.view.x = d.vx - (e.clientX - d.sx) * this.view.s;
      this.view.y = d.vy - (e.clientY - d.sy) * this.view.s;
      this.applyView();
    } else if (d.type === 'band' || d.type === 'box') {
      d.cur = d.type === 'box' ? p : raw;
      this.renderOverlay();
    } else if (d.type === 'move') {
      const dx = r2(p[0] - d.start[0]), dy = r2(p[1] - d.start[1]);
      if (dx === d.dx && dy === d.dy) return;
      if (!d.moved) { this.app.checkpoint(); d.moved = true; }
      d.dx = dx; d.dy = dy;
      this.applyMove(d);
      this.app.touched();
    } else if (d.type === 'vertex') {
      if (same(p, d.orig[d.idx]) && !d.moved) return;
      if (!d.moved) { this.app.checkpoint(); d.moved = true; }
      const pts = clone(d.orig);
      const n = pts.length;
      const o = d.orig[d.idx];
      pts[d.idx] = [p[0], p[1]];
      for (const j of [d.idx - 1, d.idx + 1]) {
        if (j <= 0 || j >= n - 1) continue; // never drag attached endpoints along
        if (Math.abs(d.orig[j][0] - o[0]) < 0.01) pts[j][0] = p[0];
        else if (Math.abs(d.orig[j][1] - o[1]) < 0.01) pts[j][1] = p[1];
      }
      d.wire.points = pts;
      this.app.touched();
    }
  }

  onUp(e) {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    const app = this.app;
    if (d.type === 'band') {
      const r = { x0: Math.min(d.start[0], d.cur[0]), y0: Math.min(d.start[1], d.cur[1]), x1: Math.max(d.start[0], d.cur[0]), y1: Math.max(d.start[1], d.cur[1]) };
      if (r.x1 - r.x0 > 0.5 || r.y1 - r.y0 > 0.5) app.select(this.itemsIn(r), d.add);
      this.renderOverlay();
    } else if (d.type === 'box') {
      const { x0, y0, x1, y1 } = this.dragRect.call({ drag: d });
      if (x1 - x0 >= 2 && y1 - y0 >= 2) {
        const b = { id: uid('b'), x: x0, y: y0, w: r2(x1 - x0), h: r2(y1 - y0), style: 'dashdot', label: '' };
        app.mutate(() => app.page.boxes.push(b));
        app.select(['b:' + b.id]);
        this.setTool('select');
      }
      this.renderOverlay();
    } else if (d.type === 'move') {
      if (d.moved) {
        this.cleanWires(app.page);
        app.touched();
      } else if (!e.shiftKey && d.key && app.sel.size > 1) app.select([d.key]);
    } else if (d.type === 'vertex' && d.moved) {
      this.cleanWires(app.page);
      app.touched();
    }
  }

  onDbl(e) {
    if (this.tool === 'wire') { this.finishWire(); return; }
    if (this.tool !== 'select') return;
    const key = this.hitKey(e.target);
    if (!key) return;
    if (key.startsWith('t:')) this.app.emit('editText', key.slice(2));
    else this.app.emit('focusProps', key);
  }

  onKey(e) {
    if (this.app.mode !== 'schematic') return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (document.querySelector('.modal-back')) return;
    const app = this.app;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (e.code === 'Space') { this.space = true; e.preventDefault(); return; }
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? app.redo() : app.undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); app.redo(); return; }
    if (mod && k === 'c') { this.copy(); return; }
    if (mod && k === 'x') { this.copy(); this.deleteSelection(); return; }
    if (mod && k === 'v') { e.preventDefault(); this.paste(); return; }
    if (mod && k === 'd') { e.preventDefault(); this.copy(); this.paste(true); return; }
    if (mod && k === 'a') { e.preventDefault(); this.selectAll(); return; }
    if (mod) return;
    if (k === 'escape') {
      if (this.tool === 'wire' && this.wirePts) { this.wirePts = null; this.renderOverlay(); }
      else if (this.tool !== 'select') this.setTool('select');
      else app.select([]);
    } else if (k === 'delete' || k === 'backspace') { e.preventDefault(); this.deleteSelection(); }
    else if (k === 'r') this.rotate();
    else if (k === 'm') this.mirror();
    else if (k === 'w') this.setTool('wire');
    else if (k === 'v' || k === 's') this.setTool('select');
    else if (k === 't') this.setTool('text');
    else if (k === 'b') this.setTool('box');
    else if (k === 'h') this.setTool('pan');
    else if (k === 'f') this.fit();
    else if (k === '+' || k === '=') this.zoomBy(0.8);
    else if (k === '-') this.zoomBy(1.25);
    else if (k === 'pageup') app.setPage(app.pageIdx - 1);
    else if (k === 'pagedown') app.setPage(app.pageIdx + 1);
    else if (k.startsWith('arrow') && app.sel.size) {
      e.preventDefault();
      const g = e.shiftKey ? this.grid * 4 : this.grid;
      const [dx, dy] = { arrowleft: [-g, 0], arrowright: [g, 0], arrowup: [0, -g], arrowdown: [0, g] }[k];
      app.checkpoint();
      const d = this.makeMove([0, 0], null);
      d.dx = dx; d.dy = dy;
      this.applyMove(d);
      this.cleanWires(app.page);
      app.touched();
    }
  }

  // ---------- selection / moving ----------

  itemsIn(r) {
    const pg = this.app.page;
    const an = this.app.analysis();
    const inR = (x, y) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
    const keys = [];
    for (const c of pg.comps) {
      const info = an.comps.get(c.id);
      const b = worldBox(c, info.geom);
      if (inR(b.x0, b.y0) && inR(b.x1, b.y1)) keys.push('c:' + c.id);
    }
    for (const w of pg.wires) if (w.points.every(([x, y]) => inR(x, y))) keys.push('w:' + w.id);
    for (const t of pg.texts) if (inR(t.x, t.y)) keys.push('t:' + t.id);
    for (const b of pg.boxes) if (inR(b.x, b.y) && inR(b.x + b.w, b.y + b.h)) keys.push('b:' + b.id);
    return keys;
  }

  selectAll() {
    const pg = this.app.page;
    this.app.select([
      ...pg.comps.map((c) => 'c:' + c.id), ...pg.wires.map((w) => 'w:' + w.id),
      ...pg.texts.map((t) => 't:' + t.id), ...pg.boxes.map((b) => 'b:' + b.id),
    ]);
  }

  startMove(p, key) {
    this.drag = this.makeMove(p, key);
  }

  /** Captures original positions of the selection and the wire ends attached to it. */
  makeMove(start, key) {
    const app = this.app;
    const pg = app.page;
    const an = app.analysis();
    const sel = app.sel;
    const items = [];
    const movingPts = [];
    const rails = [];
    for (const c of pg.comps) if (sel.has('c:' + c.id)) {
      items.push({ o: c, x: c.x, y: c.y });
      for (const p of an.comps.get(c.id)?.pins || []) movingPts.push([p.x, p.y]);
    }
    for (const t of pg.texts) if (sel.has('t:' + t.id)) items.push({ o: t, x: t.x, y: t.y });
    for (const b of pg.boxes) if (sel.has('b:' + b.id)) items.push({ o: b, x: b.x, y: b.y });
    for (const r of pg.rails) if (sel.has('r:' + r.id)) rails.push({ o: r, y: r.y });
    const wires = [];
    const attached = [];
    for (const w of pg.wires) {
      if (sel.has('w:' + w.id)) { wires.push({ o: w, pts: clone(w.points) }); continue; }
      const n = w.points.length;
      const ends = [];
      for (const idx of [0, n - 1]) {
        const pt = w.points[idx];
        if (movingPts.some((m) => same(m, pt))) ends.push({ idx, kind: 'pin' });
        else if (rails.some((r) => onRail(pt[0], pt[1], r.o))) ends.push({ idx, kind: 'rail' });
      }
      if (ends.length === 2 && ends.every((x) => x.kind === 'pin')) wires.push({ o: w, pts: clone(w.points) });
      else if (ends.length) attached.push({ o: w, pts: clone(w.points), ends });
    }
    return { type: 'move', start, key, items, rails, wires, attached, dx: 0, dy: 0, moved: false };
  }

  applyMove(d) {
    const { dx, dy } = d;
    for (const it of d.items) { it.o.x = r2(it.x + dx); it.o.y = r2(it.y + dy); }
    for (const r of d.rails) r.o.y = r2(r.y + dy);
    for (const w of d.wires) w.o.points = w.pts.map(([x, y]) => [r2(x + dx), r2(y + dy)]);
    for (const a of d.attached) {
      let pts = clone(a.pts);
      const n = pts.length;
      for (const { idx, kind } of a.ends) {
        const o = a.pts[idx];
        const np = kind === 'rail' ? [o[0], r2(o[1] + dy)] : [r2(o[0] + dx), r2(o[1] + dy)];
        pts[idx] = np;
        const j = idx === 0 ? 1 : n - 2;
        if (n >= 3 && j > 0 && j < n - 1) {
          if (Math.abs(a.pts[j][0] - o[0]) < 0.01) pts[j][0] = np[0];
          else if (Math.abs(a.pts[j][1] - o[1]) < 0.01) pts[j][1] = np[1];
        }
      }
      if (n === 2 && Math.abs(pts[0][0] - pts[1][0]) > 0.01 && Math.abs(pts[0][1] - pts[1][1]) > 0.01) {
        const [p0, p1] = pts;
        const wasVertical = Math.abs(a.pts[0][0] - a.pts[1][0]) < 0.01;
        if (wasVertical) {
          const my = r2(snap((p0[1] + p1[1]) / 2, this.grid));
          pts = [p0, [p0[0], my], [p1[0], my], p1];
        } else {
          const mx = r2(snap((p0[0] + p1[0]) / 2, this.grid));
          pts = [p0, [mx, p0[1]], [mx, p1[1]], p1];
        }
      }
      a.o.points = pts;
    }
  }

  /** Removes duplicate / collinear points and zero-length wires. */
  cleanWires(page) {
    page.wires = page.wires.filter((w) => {
      const pts = [];
      for (const p of w.points) if (!pts.length || !same(pts[pts.length - 1], p)) pts.push(p);
      for (let i = 1; i + 1 < pts.length;) {
        const [a, b, c] = [pts[i - 1], pts[i], pts[i + 1]];
        const col = (Math.abs(a[0] - b[0]) < 0.01 && Math.abs(b[0] - c[0]) < 0.01) || (Math.abs(a[1] - b[1]) < 0.01 && Math.abs(b[1] - c[1]) < 0.01);
        const back = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) < 0;
        if (col && !back) pts.splice(i, 1);
        else i++;
      }
      w.points = pts;
      return pts.length >= 2;
    });
  }

  // ---------- operations ----------

  placeSymbol(sym, p, rot = 0, mirror = false) {
    const app = this.app;
    const def = app.lib.get(sym);
    if (!def) return;
    const comp = { id: uid('c'), sym, x: p[0], y: p[1], rot, mirror, props: clone(def.props || {}), autoTag: true, tag: '' };
    app.mutate((project) => {
      if (def.role === 'terminal') comp.props.number = nextTerminal(project, app.lib, comp.props.strip || '-X1');
      app.page.comps.push(comp);
      if (needsTag(def)) comp.tag = autoTag(project, app.lib, comp, app.pageIdx);
    });
    app.select(['c:' + comp.id]);
  }

  /** Orthogonal route from the last wire point to p (one bend at most). */
  route(pts, p) {
    const last = pts[pts.length - 1];
    if (same(last, p)) return [];
    if (Math.abs(last[0] - p[0]) < 0.01 || Math.abs(last[1] - p[1]) < 0.01) return [p];
    let horizontalFirst;
    if (pts.length >= 2) {
      const prev = pts[pts.length - 2];
      horizontalFirst = Math.abs(prev[0] - last[0]) < 0.01; // previous vertical → go horizontal
    } else horizontalFirst = Math.abs(p[0] - last[0]) >= Math.abs(p[1] - last[1]);
    return [horizontalFirst ? [p[0], last[1]] : [last[0], p[1]], p];
  }

  isConnectionPoint(p, ignoreWire) {
    const app = this.app;
    const an = app.analysis();
    const pg = app.page;
    for (const c of pg.comps) for (const pin of an.comps.get(c.id)?.pins || []) if (same([pin.x, pin.y], p)) return true;
    if (pg.rails.some((r) => onRail(p[0], p[1], r))) return true;
    for (const w of pg.wires) {
      if (w === ignoreWire) continue;
      for (let i = 0; i + 1 < w.points.length; i++) if (onSegment(p[0], p[1], w.points[i], w.points[i + 1])) return true;
    }
    return false;
  }

  wireClick(p) {
    if (!this.wirePts) {
      this.wirePts = [p];
      this.renderOverlay();
      return;
    }
    const added = this.route(this.wirePts, p);
    if (!added.length) { this.finishWire(); return; }
    for (const q of added) {
      this.wirePts.push(q);
      // stop at the first pin / wire / rail reached, also when that is the bend point
      if (this.isConnectionPoint(q)) { this.finishWire(); return; }
    }
    this.renderOverlay();
  }

  finishWire() {
    const pts = this.wirePts;
    this.wirePts = null;
    if (pts && pts.length >= 2) {
      const w = { id: uid('w'), points: pts };
      this.app.mutate(() => {
        this.app.page.wires.push(w);
        this.cleanWires(this.app.page);
      });
    }
    this.renderOverlay();
  }

  rotate() {
    if (this.tool === 'place' && this.placing) {
      this.placing.rot = (this.placing.rot + 90) % 360;
      this.renderOverlay();
      return;
    }
    const app = this.app;
    const comps = app.page.comps.filter((c) => app.sel.has('c:' + c.id));
    if (!comps.length) return;
    this.transformComps(comps, (c) => { c.rot = ((c.rot || 0) + 90) % 360; });
  }

  mirror() {
    if (this.tool === 'place' && this.placing) {
      this.placing.mirror = !this.placing.mirror;
      this.renderOverlay();
      return;
    }
    const app = this.app;
    const comps = app.page.comps.filter((c) => app.sel.has('c:' + c.id));
    if (!comps.length) return;
    this.transformComps(comps, (c) => { c.mirror = !c.mirror; });
  }

  /** Rotates / mirrors components in place, dragging attached wire ends to the new pin positions. */
  transformComps(comps, fn) {
    const app = this.app;
    const an = app.analysis();
    app.checkpoint();
    for (const c of comps) {
      const info = an.comps.get(c.id);
      const before = info.pins.map((p) => [p.x, p.y]);
      fn(c);
      const geom = geometry(info.def, c);
      const after = geom.pins.map((p) => xf(c, p.x, p.y).map(r2));
      for (const w of app.page.wires) {
        const n = w.points.length;
        for (const idx of [0, n - 1]) {
          const k = before.findIndex((b) => same(b, w.points[idx]));
          if (k >= 0 && after[k]) w.points[idx] = after[k];
        }
      }
    }
    this.cleanWires(app.page);
    app.touched();
  }

  deleteSelection() {
    const app = this.app;
    if (!app.sel.size) return;
    const sel = app.sel;
    app.mutate((project) => {
      const pg = app.page;
      const removed = new Set(pg.comps.filter((c) => sel.has('c:' + c.id)).map((c) => c.id));
      pg.comps = pg.comps.filter((c) => !removed.has(c.id));
      pg.wires = pg.wires.filter((w) => !sel.has('w:' + w.id));
      pg.texts = pg.texts.filter((t) => !sel.has('t:' + t.id));
      pg.boxes = pg.boxes.filter((b) => !sel.has('b:' + b.id));
      pg.rails = pg.rails.filter((r) => !sel.has('r:' + r.id));
      for (const p of project.pages) for (const c of p.comps) if (removed.has(c.link)) delete c.link;
    });
    app.select([]);
  }

  copy() {
    const app = this.app;
    const pg = app.page;
    const sel = app.sel;
    if (!sel.size) return;
    this.clipboard = clone({
      comps: pg.comps.filter((c) => sel.has('c:' + c.id)),
      wires: pg.wires.filter((w) => sel.has('w:' + w.id)),
      texts: pg.texts.filter((t) => sel.has('t:' + t.id)),
      boxes: pg.boxes.filter((b) => sel.has('b:' + b.id)),
    });
  }

  paste(inPlace = false) {
    const app = this.app;
    const cb = this.clipboard;
    if (!cb) return;
    const data = clone(cb);
    const xs = [], ys = [];
    for (const c of data.comps) { xs.push(c.x); ys.push(c.y); }
    for (const w of data.wires) for (const [x, y] of w.points) { xs.push(x); ys.push(y); }
    for (const t of data.texts) { xs.push(t.x); ys.push(t.y); }
    for (const b of data.boxes) { xs.push(b.x); ys.push(b.y); }
    if (!xs.length) return;
    const [mx, my] = inPlace ? [Math.min(...xs) + this.grid * 2, Math.min(...ys) + this.grid * 2] : this.mouse;
    const dx = r2(snap(mx - Math.min(...xs), this.grid)), dy = r2(snap(my - Math.min(...ys), this.grid));
    const idMap = new Map();
    for (const c of data.comps) idMap.set(c.id, uid('c'));
    const keys = [];
    app.mutate((project) => {
      const pg = app.page;
      for (const c of data.comps) {
        c.id = idMap.get(c.id);
        c.x = r2(c.x + dx); c.y = r2(c.y + dy);
        if (c.link && idMap.has(c.link)) c.link = idMap.get(c.link);
        pg.comps.push(c);
        keys.push('c:' + c.id);
      }
      for (const c of data.comps) {
        const def = app.lib.get(c.sym);
        if (def?.role === 'terminal') c.props.number = nextTerminal(project, app.lib, c.props.strip || '-X1');
        else if (!c.link && needsTag(def) && c.autoTag !== false) c.tag = autoTag(project, app.lib, c, app.pageIdx);
      }
      for (const w of data.wires) {
        w.id = uid('w');
        w.points = w.points.map(([x, y]) => [r2(x + dx), r2(y + dy)]);
        delete w.label;
        pg.wires.push(w);
        keys.push('w:' + w.id);
      }
      for (const t of data.texts) { t.id = uid('t'); t.x += dx; t.y += dy; pg.texts.push(t); keys.push('t:' + t.id); }
      for (const b of data.boxes) { b.id = uid('b'); b.x += dx; b.y += dy; pg.boxes.push(b); keys.push('b:' + b.id); }
    });
    app.select(keys);
  }

  addText(p, text) {
    if (!text) return;
    const t = { id: uid('t'), x: p[0], y: p[1], text, size: 3, anchor: 'start' };
    this.app.mutate(() => this.app.page.texts.push(t));
    this.app.select(['t:' + t.id]);
  }
}
