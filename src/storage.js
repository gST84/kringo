// IndexedDB persistence: projects, user symbols and small key/value settings.

const DB_NAME = 'elecad'; // historic name, kept so existing projects stay available
const DB_VERSION = 1;
let dbp;

function open() {
  dbp ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('symbols')) db.createObjectStore('symbols', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const idb = {
  get: (store, key) => run(store, 'readonly', (s) => s.get(key)),
  all: (store) => run(store, 'readonly', (s) => s.getAll()),
  put: (store, value, key) => run(store, 'readwrite', (s) => (key === undefined ? s.put(value) : s.put(value, key))),
  del: (store, key) => run(store, 'readwrite', (s) => s.delete(key)),
};

export async function listProjects() {
  const all = (await idb.all('projects')) || [];
  return all
    .map((p) => ({ id: p.id, name: p.name, kind: p.kind, updated: p.updated, pages: p.pages?.length || 0, customer: p.meta?.customer }))
    .sort((a, b) => b.updated - a.updated);
}

export const loadProject = (id) => idb.get('projects', id);
export const saveProject = (p) => idb.put('projects', JSON.parse(JSON.stringify(p)));
export const deleteProject = (id) => idb.del('projects', id);
export const kvGet = (k) => idb.get('kv', k);
export const kvSet = (k, v) => idb.put('kv', v, k);
