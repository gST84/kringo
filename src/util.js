// Small DOM / data helpers shared by every module.

/** Donation page (Kringo is free; donating is optional). */
export const MANUAL_URL = 'https://github.com/gST84/kringo/blob/main/docs/HANDLEIDING.md';
export const DONATE_URL = 'https://ko-fi.com/gst84';

/** Site root (the folder with sw.js, icons/, demos/), whichever app page loaded the code. */
export const ROOT = new URL('../', import.meta.url).href;

/** The two apps; projects of a kind always open in their own app. */
export const APPS = {
  building: { key: 'gebouw', name: 'Kringo Gebouw', short: 'Gebouw', icon: '🏠', path: 'gebouw/' },
  schematic: { key: 'besturing', name: 'Kringo Besturing', short: 'Besturing', icon: '⚙️', path: 'besturing/' },
};
/** Project kind as an app key: former 'fluid' projects belong to the control app. */
export const appKind = (kind) => (kind === 'building' ? 'building' : 'schematic');
export const appUrl = (kind) => ROOT + APPS[appKind(kind)].path;

export const uid = (p = '') =>
  p + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

export const clone = (o) => (o === undefined ? o : JSON.parse(JSON.stringify(o)));

export const r2 = (v) => Math.round(v * 100) / 100;

export const snap = (v, g) => (g > 0 ? Math.round(v / g) * g : v);

/** Escape text for use inside SVG / HTML markup strings. */
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Hyperscript for HTML elements. Attributes starting with "on" become listeners. */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  applyAttrs(el, attrs);
  append(el, children);
  return el;
}

const ICONS = {
  new: '<path d="M4 1.5h5.5L13 5v9.5H4z"/><path d="M9.5 1.5V5H13"/><path d="M8.5 8v5M6 10.5h5"/>',
  open: '<path d="M1.5 4V13h11.5l1.8-6.5H4.2L2.5 13"/><path d="M1.5 4V2.5h4.5l1.5 1.5h5V6.5"/>',
  save: '<path d="M2 2h9.5L14 4.5V14H2z"/><path d="M5 2v4h5.5V2M4.5 14V9.5h7V14"/>',
  import: '<path d="M4 1.5h5.5L13 5v9.5H4z"/><path d="M9.5 1.5V5H13"/><path d="M8.5 13V8M6.3 10.2 8.5 8l2.2 2.2"/>',
  help: '<circle cx="8" cy="8" r="6.5"/><path d="M6.1 6.2a2 2 0 1 1 2.6 1.9c-.5.2-.7.6-.7 1.1v.6"/><circle cx="8" cy="11.6" r=".4" fill="currentColor"/>',
  print: '<path d="M4.5 6V1.5h7V6"/><rect x="1.5" y="6" width="13" height="6" rx="1.2"/><path d="M4.5 10h7v4.5h-7z" fill="var(--panel, #fff)"/><circle cx="12.3" cy="8" r=".5" fill="currentColor"/>',
};

/** Line icon (16 × 16, current text colour) as a new element per call: new, open, save, import, print. */
export function icon(name) {
  const span = document.createElement('span');
  span.className = 'icon';
  span.innerHTML = `<svg viewBox="0 0 16 16" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  return span;
}

/** Mouse pointer icon for the select tools (a new element per call). */
export function cursorIcon() {
  const span = document.createElement('span');
  span.className = 'icon';
  span.innerHTML = '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M3.5 1.8v11.6l3-2.9 1.9 4.4 2-.9-1.9-4.3h4.2z" fill="currentColor" stroke="currentColor" stroke-width=".6" stroke-linejoin="round"/></svg>';
  return span;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

function applyAttrs(el, attrs) {
  if (!attrs) return;
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
}

export function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

export function download(name, data, mime = 'application/json') {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

/** Opens a file picker and resolves with the chosen files (empty array on cancel). */
export function pickFiles({ accept = '', multiple = false, directory = false } = {}) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, multiple, style: { display: 'none' } });
    if (directory) input.webkitdirectory = true;
    input.addEventListener('change', () => {
      resolve([...input.files]);
      input.remove();
    });
    input.addEventListener('cancel', () => {
      resolve([]);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}

export function readDataURL(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}

/** Downscales an image data URL so logos stay small inside project files. */
export function shrinkImage(dataUrl, max = 400) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      if (k === 1 && dataUrl.length < 200000) return res(dataUrl);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL('image/png'));
    };
    img.onerror = () => res(dataUrl);
    img.src = dataUrl;
  });
}

export const safeName = (s) => String(s || 'naamloos').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'naamloos';

/** Natural compare: "X2" < "X10". */
export const natCmp = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });

export function toCsv(rows) {
  return rows
    .map((r) => r.map((c) => {
      const s = String(c ?? '');
      return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(';'))
    .join('\r\n');
}
