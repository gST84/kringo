// Small DOM / data helpers shared by every module.

/** Donation page (Kringo is free; donating is optional). */
export const DONATE_URL = 'https://ko-fi.com/gst84';

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
