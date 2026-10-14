// Application state: current project, page, selection, undo / redo, autosave.
import { analyze } from './schematic/analyze.js';
import { normalizeProject } from './model.js';
import { saveProject } from './storage.js';
import { debounce } from './util.js';

const UNDO_LIMIT = 150;

export class App {
  constructor(lib) {
    this.lib = lib;
    this.project = null;
    this.pageIdx = 0;
    this.sel = new Set();
    this.undoStack = [];
    this.redoStack = [];
    this.version = 0;
    this.handlers = new Map();
    this.saveState = 'saved';
    this.scheduleSave = debounce(() => this.save(), 700);
    lib.onChange(() => { this.version++; this.emit('library'); this.emit('change'); });
  }

  on(evt, fn) {
    if (!this.handlers.has(evt)) this.handlers.set(evt, new Set());
    this.handlers.get(evt).add(fn);
  }
  emit(evt, arg) { for (const fn of this.handlers.get(evt) || []) fn(arg); }

  get page() { return this.project.pages[this.pageIdx]; }

  analysis() {
    if (this._anVersion !== this.version) {
      this._an = analyze(this.project, this.lib);
      this._anVersion = this.version;
    }
    return this._an;
  }

  setProject(p) {
    this.project = normalizeProject(p);
    this.lib.project = this.project;
    this.pageIdx = 0;
    this.sel.clear();
    this.undoStack = [];
    this.redoStack = [];
    this.version++;
    this.emit('project');
    this.emit('change');
  }

  /** Records an undo point. Call once before a (possibly multi-step) modification. */
  checkpoint() {
    this.undoStack.push(JSON.stringify(this.project));
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  /** Marks the project as modified (after direct edits following a checkpoint). */
  touched() {
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

  restore(json) {
    this.project = JSON.parse(json);
    this.lib.project = this.project;
    this.pageIdx = Math.min(this.pageIdx, this.project.pages.length - 1);
    this.pruneSelection();
    this.touched();
  }

  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(JSON.stringify(this.project));
    this.restore(this.undoStack.pop());
  }

  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(JSON.stringify(this.project));
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
    const pg = this.page;
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
