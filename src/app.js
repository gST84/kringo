// Application state: current project, page, selection, undo / redo, autosave.
import { analyze } from './schematic/analyze.js';
import { normalizeProject } from './model.js';
import { rememberProject, saveProject } from './storage.js';
import { debounce } from './util.js';

const UNDO_LIMIT = 150;

export class App {
  constructor(lib) {
    this.lib = lib;
    this.project = null;
    this.pageIdx = 0;
    this.floorIdx = 0;
    this.layerId = null; // building: the installation plan (overlay) shown on the floor, null = the floor plan itself
    this.mode = 'schematic'; // 'schematic' | 'building'
    this.sel = new Set();
    this.undoStack = [];
    this.redoStack = [];
    this.version = 0;
    this.handlers = new Map();
    this.saveState = 'saved';
    this.scheduleSave = debounce(() => this.save(), 700);
    lib.onChange(() => { this.version++; this.emit('library'); this.emit('change'); });
  }

  /** Change counter; building block symbols are rebuilt from their sheets when it changes. */
  get version() { return this._version; }
  set version(v) { this._version = v; this.lib.blockVersion = v; }

  on(evt, fn) {
    if (!this.handlers.has(evt)) this.handlers.set(evt, new Set());
    this.handlers.get(evt).add(fn);
  }
  emit(evt, arg) { for (const fn of this.handlers.get(evt) || []) fn(arg); }

  get page() { return this.project.pages[this.pageIdx]; }
  get floor() { return this.project.building.floors[this.floorIdx]; }
  /** The installation plan that is open (null: the floor plan itself, where the building is drawn). */
  get layer() { return (this.layerId && this.project?.building?.plans?.find((p) => p.id === this.layerId)) || null; }
  /** Installation type of the open plan ('elec', 'cv' …) or null on the floor plan. */
  get disc() { return this.layer?.disc || null; }

  /** Building projects switch between plan view ('building') and their single-line sheets ('schematic'). */
  setMode(mode) {
    if (mode === this.mode) return;
    if (mode === 'schematic' && !this.project.pages.length) return;
    this.mode = mode;
    this.sel.clear();
    this.emit('mode', mode);
    this.emit('change');
  }

  /** Shows floor i: its floor plan (layerId null) or one of its installation plans. */
  setFloor(i, layerId = null) {
    if (i < 0 || i >= this.project.building.floors.length || (i === this.floorIdx && layerId === this.layerId)) return;
    this.floorIdx = i;
    this.layerId = layerId;
    this.sel.clear();
    this.emit('layer');
    this.emit('change');
  }

  /** Shows an installation plan (overlay). */
  setLayer(id) {
    const b = this.project.building;
    const pl = b.plans.find((p) => p.id === id);
    if (!pl) return;
    this.setFloor(b.floors.findIndex((f) => f.id === pl.floor), pl.id);
  }

  analysis() {
    if (this._anVersion !== this.version) {
      this._an = analyze(this.project, this.lib);
      this._anVersion = this.version;
    }
    return this._an;
  }

  setProject(p) {
    if (this.sim) { this.sim = null; this.emit('sim'); }
    this.project = normalizeProject(p);
    this.lib.project = this.project;
    this.pageIdx = 0;
    this.floorIdx = 0;
    this.layerId = null;
    this.mode = this.project.kind === 'building' ? 'building' : 'schematic';
    // a building opens on its first installation plan (electricity), when there is one
    const b = this.project.building;
    const first = this.project.kind === 'building' && (b.plans.find((p) => p.disc === 'elec' && p.floor === b.floors[0]?.id) || b.plans[0]);
    if (first) { this.layerId = first.id; this.floorIdx = Math.max(0, b.floors.findIndex((f) => f.id === first.floor)); }
    this.sel.clear();
    this.undoStack = [];
    this.redoStack = [];
    this.version++;
    rememberProject(this.project.id, this.project.kind);
    this.emit('project');
    this.emit('mode', this.mode);
    this.emit('change');
  }

  /** Records an undo point. Call once before a (possibly multi-step) modification. */
  checkpoint() {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  /** Marks the project as modified (after direct edits following a checkpoint). */
  touched() {
    if (this.sim) { this.sim = null; this.emit('sim'); } // editing ends a running simulation
    this.version++;
    this.project.updated = Date.now();
    this.saveState = 'dirty';
    this.scheduleSave();
    this.emit('change');
  }

  mutate(fn) {
    this.checkpoint();
    const r = fn(this.project);
    this.touched();
    return r;
  }

  /** Project as JSON without the (large, never undone) background images. */
  snapshot() {
    const p = this.project;
    return JSON.stringify(p, function (k, v) { return this === p && k === 'images' ? undefined : v; });
  }

  restore(json) {
    const images = this.project.images;
    this.project = JSON.parse(json);
    this.project.images = images;
    this.lib.project = this.project;
    this.pageIdx = Math.max(0, Math.min(this.pageIdx, this.project.pages.length - 1));
    this.floorIdx = Math.min(this.floorIdx, this.project.building.floors.length - 1);
    if (this.layerId && !this.layer) { this.layerId = null; this.emit('layer'); }
    // undoing the generation of the only single-line sheets: back to the floor plan
    if (this.mode === 'schematic' && !this.project.pages.length) { this.mode = 'building'; this.emit('mode', this.mode); }
    this.pruneSelection();
    this.touched();
  }

  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(this.snapshot());
    this.restore(this.undoStack.pop());
  }

  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(this.snapshot());
    this.restore(this.redoStack.pop());
  }

  setPage(i) {
    if (i < 0 || i >= this.project.pages.length || i === this.pageIdx) return;
    this.pageIdx = i;
    this.sel.clear();
    this.emit('page');
    this.emit('change');
  }

  select(keys, add = false) {
    if (!add) this.sel.clear();
    for (const k of keys) this.sel.add(k);
    this.emit('selection');
  }

  pruneSelection() {
    if (this.mode === 'building') {
      const f = this.floor;
      const lists = { W: f.walls, O: f.openings, S: f.stairs, T: f.texts, A: f.symbols, L: f.links, D: f.dims, P: f.shapes, R: f.rooms, B: f.bg ? [{ id: 'bg' }] : [] };
      for (const k of [...this.sel]) { const [t, id] = k.split(':'); if (!lists[t]?.some((o) => o.id === id)) this.sel.delete(k); }
      return;
    }
    const pg = this.page;
    if (!pg) { this.sel.clear(); return; }
    const exists = (k) => {
      const [t, id] = k.split(':');
      const list = { c: pg.comps, w: pg.wires, t: pg.texts, b: pg.boxes, r: pg.rails }[t];
      return list?.some((o) => o.id === id);
    };
    for (const k of [...this.sel]) if (!exists(k)) this.sel.delete(k);
  }

  /** Finds a component anywhere in the project. */
  findComp(id) {
    for (let i = 0; i < this.project.pages.length; i++) {
      const c = this.project.pages[i].comps.find((x) => x.id === id);
      if (c) return { comp: c, pageIdx: i };
    }
    return null;
  }

  async save() {
    if (!this.project) return;
    this.saveState = 'saving';
    this.emit('saved');
    try {
      this.project.symbols = this.lib.embedFor(this.project);
      await saveProject(this.project);
      this.saveState = 'saved';
    } catch (e) {
      console.error(e);
      this.saveState = 'error';
    }
    this.emit('saved');
  }
}
