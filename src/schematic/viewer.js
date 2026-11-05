// Split view: a second, read-only sheet next to the editor (e.g. operate on one sheet and follow the
// simulation on another). Own page choice, zoom and pan; in the simulation its parts can be clicked too.
// "Follow" switches to the sheet where something changes (a coil, valve, cylinder …).
import { t } from '../i18n.js';
import { h } from '../util.js';
import { sheetOf } from '../model.js';
import { pageSvg } from './render.js';
import { worldBox } from '../symbols/geom.js';

const NS = 'http://www.w3.org/2000/svg';
const KEY = 'kringo.split';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const store = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ } };

export class SheetViewer {
  /** `wrap`: the element around the editor canvas; the viewer and a splitter are added to it. */
  constructor(app, wrap) {
    this.app = app;
    this.wrap = wrap;
    const st = load();
    this.width = st.width || 0.5; // share of the width (or height when stacked)
    this.follow = st.follow ?? true;
    this.pageId = null;
    this.view = { x: 0, y: 0, s: 1 };
    this.fitted = null;

    this.splitter = h('div', { class: 'splitbar', title: t('Sleep om de verdeling aan te passen') });
    this.pageSel = h('select', { class: 'pagesel', title: t('Blad in het tweede venster'), onchange: () => this.show(this.pageSel.value) });
    const followChk = h('input', { type: 'checkbox', checked: this.follow, onchange: () => { this.follow = followChk.checked; this.save(); } });
    this.bar = h('div', { class: 'viewbar' },
      this.pageSel,
      h('button', { title: t('Passend (hele blad)'), onclick: () => this.fit() }, '⤢'),
      h('label', { class: 'check small', title: t('In de simulatie: toon vanzelf het blad waar iets verandert') }, followChk, t('Volgen')),
      h('button', { title: t('Dit blad in de editor openen'), onclick: () => this.openInEditor() }, '✎'),
      h('span', { class: 'grow' }),
      h('button', { title: t('Tweede venster sluiten'), onclick: () => this.toggle(false) }, '✕'));
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.classList.add('canvas', 'viewcanvas');
    this.layer = document.createElementNS(NS, 'g');
    this.svg.append(this.layer);
    this.canvas = h('div', { class: 'viewhost' });
    this.canvas.append(this.svg);
    this.el = h('div', { class: 'viewpane' }, this.bar, this.canvas);
    wrap.append(this.splitter, this.el);
    this.open = false;
    this.el.hidden = this.splitter.hidden = true;

    this.bind();
    new ResizeObserver(() => this.applyView()).observe(this.canvas);
    app.on('rendered', () => { if (this.open) this.render(); });
    app.on('project', () => { this.pageId = null; this.sig = null; if (this.open) { this.pickPage(); this.fit(); } });
    app.on('change', () => { if (this.open) this.fillPages(); });
    app.on('sim', () => { this.sig = null; });
    if (st.open) requestAnimationFrame(() => this.toggle(true));
  }

  save() { store({ width: this.width, follow: this.follow, open: this.open }); }

  toggle(on = !this.open) {
    this.open = on;
    this.el.hidden = this.splitter.hidden = !on;
    document.body.classList.toggle('split', on);
    this.layout();
    this.save();
    this.app.emit('split', on);
    if (on) {
      if (!this.page()) this.pickPage();
      this.fillPages();
      requestAnimationFrame(() => { this.fit(); this.app.editor.fit(); });
    } else requestAnimationFrame(() => this.app.editor.fit());
  }

  layout() {
    const pct = Math.round(Math.max(0.2, Math.min(0.8, this.width)) * 1000) / 10;
    this.el.style.flexBasis = this.open ? pct + '%' : '';
  }

  page() { return this.app.project?.pages.find((p) => p.id === this.pageId) || null; }

  /** First sheet of another kind than the one in the editor (e.g. the hydraulics next to the control). */
  pickPage() {
    const pages = this.app.project?.pages || [];
    const cur = this.app.page;
    const other = pages.find((p) => p !== cur && !p.block && (p.type || 'electric') !== (cur?.type || 'electric'));
    this.pageId = (other || pages[this.app.pageIdx + 1] || pages.find((p) => p !== cur) || pages[0])?.id || null;
  }

  fillPages() {
    const pages = this.app.project?.pages || [];
    this.pageSel.replaceChildren(...pages.map((p, i) => h('option', { value: p.id, selected: p.id === this.pageId }, `${i + 1} / ${pages.length}  ${p.title}`)));
  }

  show(id) {
    this.pageId = id;
    this.fillPages();
    this.fit();
  }

  openInEditor() {
    const i = this.app.project.pages.findIndex((p) => p.id === this.pageId);
    if (i >= 0) this.app.setPage(i);
  }

  // ---------- view ----------

  applyView() {
    const w = this.canvas.clientWidth || 400, hh = this.canvas.clientHeight || 300;
    this.svg.setAttribute('viewBox', `${this.view.x} ${this.view.y} ${w * this.view.s} ${hh * this.view.s}`);
  }

  fit() {
    const w = this.canvas.clientWidth || 400, hh = this.canvas.clientHeight || 300;
    const sh = sheetOf(this.page());
    const s = Math.max((sh.w + 16) / w, (sh.h + 16) / hh);
    this.view = { s, x: sh.w / 2 - (w * s) / 2, y: sh.h / 2 - (hh * s) / 2 };
    this.fitted = this.page()?.sheet || 'A3';
    this.applyView();
    this.render();
  }

  zoomAt(f, cx, cy) {
    const r = this.svg.getBoundingClientRect();
    const px = cx - r.left, py = cy - r.top;
    const wx = this.view.x + px * this.view.s, wy = this.view.y + py * this.view.s;
    const s = Math.min(2, Math.max(0.01, this.view.s * f));
    this.view = { s, x: wx - px * s, y: wy - py * s };
    this.applyView();
  }

  toWorld(e) {
    const r = this.svg.getBoundingClientRect();
    return [this.view.x + (e.clientX - r.left) * this.view.s, this.view.y + (e.clientY - r.top) * this.view.s];
  }

  // ---------- rendering ----------

  render() {
    const app = this.app;
    const page = this.page();
    if (!page) { this.layer.innerHTML = ''; return; }
    if (app.sim && this.follow) this.followSim();
    const pg = this.page();
    const idx = app.project.pages.indexOf(pg);
    if ((pg.sheet || 'A3') !== (this.fitted || 'A3')) return this.fit();
    this.layer.innerHTML = pageSvg(app.project, pg, idx, app.analysis(), app.sim ? { sim: app.sim } : {});
  }

  /** Switches to the sheet (other than the editor's) where the simulation state changed. */
  followSim() {
    const app = this.app, sim = app.sim, an = app.analysis();
    const sig = new Map();
    for (const info of an.comps.values()) {
      if (info.template || info.pageIdx === app.pageIdx) continue;
      const st = sim.compState(info.comp.id);
      if (!st) continue;
      const v = JSON.stringify(st);
      sig.set(info.comp.id, [info.page.id, v]);
    }
    const prev = this.sig;
    this.sig = sig;
    if (!prev) return;
    const now = performance.now();
    if (this.lastJump && now - this.lastJump < 1500) return;
    for (const [id, [pageId, v]] of sig) {
      const old = prev.get(id);
      if ((old ? old[1] : 'null') !== v && pageId !== this.pageId) {
        this.lastJump = now;
        this.pageId = pageId;
        this.fillPages();
        return;
      }
    }
  }

  // ---------- events ----------

  bind() {
    const svg = this.svg;
    let drag = null;
    svg.addEventListener('pointerdown', (e) => {
      const app = this.app;
      svg.setPointerCapture(e.pointerId);
      const el = e.target.closest?.('[data-k]');
      const key = el?.dataset.k;
      if (app.sim && e.button === 0 && key?.startsWith('c:')) {
        // simulation: operate push buttons, valves (left / right half) …; Shift keeps it pressed
        const info = app.analysis().comps.get(key.slice(2));
        if (info) {
          const wb = worldBox(info.comp, info.geom);
          app.sim.press(info.comp.id, this.toWorld(e)[0] < (wb.x0 + wb.x1) / 2 ? 'L' : 'R', e.shiftKey);
          this.simPress = true;
          app.editor.render();
          return;
        }
      }
      drag = { sx: e.clientX, sy: e.clientY, vx: this.view.x, vy: this.view.y };
    });
    svg.addEventListener('pointermove', (e) => {
      if (!drag) return;
      this.view.x = drag.vx - (e.clientX - drag.sx) * this.view.s;
      this.view.y = drag.vy - (e.clientY - drag.sy) * this.view.s;
      this.applyView();
    });
    const up = () => {
      drag = null;
      if (this.simPress) { this.simPress = false; this.app.sim?.release(); this.app.editor.render(); }
    };
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
    svg.addEventListener('dblclick', () => { if (!this.app.sim) this.openInEditor(); });
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
    // splitter: drag to change the share of the second pane
    this.splitter.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.splitter.setPointerCapture(e.pointerId);
      document.body.classList.add('resizing');
      const r = this.wrap.getBoundingClientRect();
      const stacked = getComputedStyle(this.wrap).flexDirection === 'column';
      const move = (ev) => {
        this.width = stacked ? (r.bottom - ev.clientY) / r.height : (r.right - ev.clientX) / r.width;
        this.layout();
        this.applyView();
        this.app.editor.applyView();
      };
      const end = () => {
        this.splitter.removeEventListener('pointermove', move);
        this.splitter.removeEventListener('pointerup', end);
        document.body.classList.remove('resizing');
        this.save();
      };
      this.splitter.addEventListener('pointermove', move);
      this.splitter.addEventListener('pointerup', end);
    });
  }
}
