// Service worker: makes Kringo installable and usable offline.
// Strategy: network first (always the newest version when online), cache as fallback.
// Bump VERSION when files are added or removed; add new source files to SHELL.
const VERSION = 'kringo-v32';
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
  'src/building/arei.js', 'src/building/background.js', 'src/building/editor.js', 'src/building/eendraad.js', 'src/building/model.js',
  'src/building/panels.js', 'src/building/render.js', 'src/building/rules.js',
  'src/app.js', 'src/demo.js', 'src/import/qet.js', 'src/i18n.js', 'src/i18n-dict.js', 'src/main.js', 'src/model.js', 'src/pwa.js', 'src/touch.js',
  'src/schematic/analyze.js', 'src/schematic/editor.js', 'src/schematic/render.js', 'src/schematic/tags.js',
  'src/storage.js', 'src/symbols/builtin.js', 'src/symbols/geom.js', 'src/symbols/library.js',
  'src/ui/dialogs.js', 'src/ui/lists.js', 'src/ui/panels.js', 'src/ui/project.js', 'src/ui/start.js', 'src/ui/symbolEditor.js', 'src/util.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const res = await Promise.race([
        fetch(req, { cache: 'no-store' }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
      ]);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
      return Response.error();
    }
  })());
});
