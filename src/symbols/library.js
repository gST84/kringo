// Symbol library: built-in symbols, user symbols (IndexedDB) and an optional linked folder
// on disk (File System Access API, Chrome / Edge). Symbol files: *.ksym (JSON; *.elsym from earlier versions).
import { BUILTIN } from './builtin.js';
import { AREI } from '../building/arei.js';
import { FLUID } from '../fluid/symbols.js';
import { idb, kvGet, kvSet } from '../storage.js';
import { uid, safeName, download, clone } from '../util.js';

export const SYMBOL_FORMAT = 'kringo-symbol';
export const LIBRARY_FORMAT = 'kringo-library';
const isSymbolFile = (f) => f === SYMBOL_FORMAT || f === 'elecad-symbol';
const isLibraryFile = (f) => f === LIBRARY_FORMAT || f === 'elecad-library';
export const USER_ROOT = 'Mijn symbolen';

export class Library {
  constructor() {
    this.builtin = new Map([...BUILTIN, ...AREI, ...FLUID].map((d) => [d.id, { ...d, source: 'builtin' }]));
    this.user = new Map();
    this.folder = new Map();
    this.dir = null; // FileSystemDirectoryHandle
    this.dirState = 'none'; // none | linked | needs-permission
    this.project = null; // project-embedded fallback definitions
    this.listeners = new Set();
  }

  onChange(fn) { this.listeners.add(fn); }
  emit() { for (const fn of this.listeners) fn(); }

  async init() {
    for (const d of (await idb.all('symbols')) || []) this.user.set(d.id, { ...d, source: 'user' });
    try {
      const handle = await kvGet('symbolDir');
      if (handle) {
        this.dir = handle;
        if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') await this.readFolder();
        else this.dirState = 'needs-permission';
      }
    } catch {
      this.dir = null;
    }
  }

  get(id) {
    return this.folder.get(id) || this.user.get(id) || this.builtin.get(id) || this.project?.symbols?.[id] || null;
  }

  all() {
    const m = new Map([...this.builtin, ...this.user, ...this.folder]);
    if (this.project?.symbols) for (const [id, d] of Object.entries(this.project.symbols)) if (!m.has(id)) m.set(id, { ...d, source: 'project', folder: d.folder || 'Uit project' });
    return [...m.values()];
  }

  isEditable(def) { return def && (def.source === 'user' || def.source === 'folder'); }

  /** Folder tree: {name, path, folders: Map, symbols: []}. */
  tree(filter = '') {
    const root = { name: '', path: '', folders: new Map(), symbols: [] };
    const f = filter.trim().toLowerCase();
    for (const d of this.all()) {
      if (d.hidden) continue;
      if (f && !(`${d.name} ${d.folder} ${d.prefix || ''}`.toLowerCase().includes(f))) continue;
      let node = root;
      const parts = String(d.folder || USER_ROOT).split('/').filter(Boolean);
      let path = '';
      for (const part of parts) {
        path = path ? path + '/' + part : part;
        if (!node.folders.has(part)) node.folders.set(part, { name: part, path, folders: new Map(), symbols: [] });
        node = node.folders.get(part);
      }
      node.symbols.push(d);
    }
    return root;
  }

  async save(def) {
    const d = clone({ ...def, source: undefined, _file: undefined });
    delete d.build;
    d.id ||= 'user/' + uid();
    d.updated = Date.now();
    if (this.dir && this.dirState === 'linked' && (def.source === 'folder' || !def.source || def.source === 'new-folder')) {
      await this.writeFolderSymbol(d, def._file);
    } else {
      await idb.put('symbols', d);
      this.user.set(d.id, { ...d, source: 'user' });
    }
    this.emit();
    return d.id;
  }

  async remove(def) {
    if (def.source === 'user') {
      await idb.del('symbols', def.id);
      this.user.delete(def.id);
    } else if (def.source === 'folder' && def._file) {
      const { dir, name } = await this.fileDir(def._file, false);
      await dir.removeEntry(name);
      this.folder.delete(def.id);
    }
    this.emit();
  }

  // ---------- import / export ----------

  /** Parses .ksym / .elsym / library files and stores the symbols as user (or folder) symbols. */
  async importFiles(files) {
    let n = 0;
    for (const file of files) {
      let data;
      try { data = JSON.parse(await file.text()); } catch { continue; }
      const defs = isLibraryFile(data.format) ? data.symbols : isSymbolFile(data.format) ? [data.symbol] : [];
      const rel = (file.webkitRelativePath || '').split('/').slice(0, -1).join('/');
      for (const s of defs || []) {
        if (!s?.graphics) continue;
        const def = { ...s, source: undefined };
        if (rel) def.folder = USER_ROOT + '/' + rel;
        else if (!def.folder || def.folder.startsWith('Standaard')) def.folder = USER_ROOT + '/Geïmporteerd';
        if (this.builtin.has(def.id)) def.id = 'user/' + uid();
        await idb.put('symbols', { ...def, updated: Date.now() });
        this.user.set(def.id, { ...def, source: 'user' });
        n++;
      }
    }
    this.emit();
    return n;
  }

  exportLibrary(defs = [...this.user.values(), ...this.folder.values()]) {
    const symbols = defs.map((d) => { const c = clone(d); delete c.source; delete c._file; return c; });
    download('kringo-symbolen.json', JSON.stringify({ format: LIBRARY_FORMAT, version: 1, symbols }, null, 1));
  }

  exportSymbol(def) {
    const c = clone(def);
    delete c.source; delete c._file; delete c.build;
    download(safeName(def.name) + '.ksym', JSON.stringify({ format: SYMBOL_FORMAT, version: 1, symbol: c }, null, 1));
  }

  // ---------- linked folder ----------

  get folderSupported() { return 'showDirectoryPicker' in window; }

  async linkFolder() {
    const handle = await window.showDirectoryPicker({ id: 'kringo-symbols', mode: 'readwrite' });
    this.dir = handle;
    await kvSet('symbolDir', handle);
    await this.readFolder();
  }

  async unlinkFolder() {
    this.dir = null;
    this.folder.clear();
    this.dirState = 'none';
    await kvSet('symbolDir', null);
    this.emit();
  }

  async reconnect() {
    if (!this.dir) return;
    if ((await this.dir.requestPermission({ mode: 'readwrite' })) === 'granted') await this.readFolder();
  }

  async readFolder() {
    this.folder.clear();
    const rootName = this.dir.name;
    const walk = async (dir, rel) => {
      for await (const entry of dir.values()) {
        if (entry.kind === 'directory') await walk(entry, rel ? rel + '/' + entry.name : entry.name);
        else if (/\.(ksym|elsym|json)$/i.test(entry.name)) {
          try {
            const data = JSON.parse(await (await entry.getFile()).text());
            const list = isSymbolFile(data.format) ? [data.symbol] : isLibraryFile(data.format) ? data.symbols : [];
            for (const s of list) {
              if (!s?.graphics) continue;
              const id = s.id || 'folder/' + (rel ? rel + '/' : '') + entry.name;
              this.folder.set(id, {
                ...s, id, source: 'folder',
                folder: rootName + (rel ? '/' + rel : ''),
                _file: (rel ? rel + '/' : '') + entry.name,
              });
            }
          } catch { /* ignore unreadable files */ }
        }
      }
    };
    await walk(this.dir, '');
    this.dirState = 'linked';
    this.emit();
  }

  /** Resolves (and creates) the directory of a file path relative to the linked folder. */
  async fileDir(path, create = true) {
    const parts = path.split('/').filter(Boolean);
    const name = parts.pop();
    let dir = this.dir;
    for (const p of parts) dir = await dir.getDirectoryHandle(p, { create });
    return { dir, name };
  }

  async writeFolderSymbol(def, existingFile) {
    const rootName = this.dir.name;
    // Folder inside the linked directory follows the symbol's folder path.
    let rel = String(def.folder || '').split('/').filter(Boolean);
    if (rel[0] === rootName) rel = rel.slice(1);
    else if (rel[0] === USER_ROOT) rel = rel.slice(1);
    const path = existingFile && existingFile.split('/').slice(0, -1).join('/') === rel.join('/')
      ? existingFile
      : [...rel, safeName(def.name) + '.ksym'].join('/');
    if (existingFile && existingFile !== path) {
      try { const old = await this.fileDir(existingFile, false); await old.dir.removeEntry(old.name); } catch { /* moved */ }
    }
    const { dir, name } = await this.fileDir(path, true);
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify({ format: SYMBOL_FORMAT, version: 1, symbol: def }, null, 1));
    await w.close();
    this.folder.set(def.id, { ...def, source: 'folder', folder: [rootName, ...rel].join('/'), _file: path });
  }

  /** Copies of all non-builtin definitions used in a project (stored inside the project file). */
  embedFor(project) {
    const out = {};
    for (const pg of project.pages) for (const c of pg.comps) {
      const d = this.get(c.sym);
      if (d && d.source !== 'builtin' && !this.builtin.has(c.sym)) {
        const copy = clone(d);
        delete copy.source; delete copy._file;
        out[c.sym] = copy;
      }
    }
    return out;
  }
}
