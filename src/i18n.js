// Translations: Dutch is the source language (and the key); French and English come from
// i18n-dict.js. `t()` translates strings built in code (with {placeholders}); everything that ends
// up as text in the interface is also translated automatically when it appears in the DOM, so
// panels and dialogs do not need to call t() for fixed texts. Drawings (SVG sheets) are not touched;
// their few fixed labels (title block, single-line diagram) use t() directly.
import { DICT } from './i18n-dict.js';

const KEY = 'kringo.lang';
export const LANGS = { nl: 'Nederlands', fr: 'Français', en: 'English' };

function initialLang() {
  try {
    const s = localStorage.getItem(KEY);
    if (s && LANGS[s]) return s;
  } catch { /* private mode */ }
  const nav = (navigator.language || 'nl').slice(0, 2).toLowerCase();
  return LANGS[nav] ? nav : 'nl';
}

export const lang = initialLang();
document.documentElement.lang = lang;

const table = new Map();
if (lang !== 'nl') for (const row of DICT) if (row[lang === 'fr' ? 1 : 2]) table.set(row[0], row[lang === 'fr' ? 1 : 2]);

/** Translates a Dutch text; {name} placeholders are filled from params. */
export function t(s, params) {
  let out = table.get(s) ?? s;
  if (params) out = out.replace(/\{(\w+)\}/g, (m, k) => (params[k] ?? m));
  return out;
}

/** Stores the language and reloads (the interface is built once, in the chosen language). */
export function setLang(l) {
  try { localStorage.setItem(KEY, l); } catch { /* private mode */ }
  location.reload();
}

// ---------- automatic translation of the interface ----------

const ATTRS = ['title', 'placeholder', 'aria-label'];

function translateText(node) {
  const raw = node.nodeValue;
  const s = raw.trim();
  if (!s) return;
  const tr = table.get(s);
  if (tr !== undefined && tr !== s) node.nodeValue = raw.replace(s, tr);
}

function translateTree(root) {
  if (root.nodeType === Node.TEXT_NODE) {
    if (!root.parentElement?.closest('svg, textarea')) translateText(root);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  if (root.closest('svg')) return; // drawings and symbol previews
  for (const a of ATTRS) {
    const v = root.getAttribute(a);
    if (v) {
      const tr = table.get(v.trim()) ?? table.get(v);
      if (tr !== undefined && tr !== v) root.setAttribute(a, tr);
    }
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => (n.nodeType === Node.ELEMENT_NODE && (n.tagName === 'svg' || n.tagName === 'TEXTAREA') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) translateText(n);
    else for (const a of ATTRS) {
      const v = n.getAttribute(a);
      if (v) {
        const tr = table.get(v.trim());
        if (tr !== undefined && tr !== v) n.setAttribute(a, tr);
      }
    }
  }
}

/** Translates the interface now and whenever new parts appear. */
export function startAutoTranslate() {
  if (lang === 'nl') return;
  translateTree(document.body);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'childList') for (const n of m.addedNodes) translateTree(n);
      else if (m.type === 'characterData') translateTree(m.target);
      else if (m.type === 'attributes') translateTree(m.target);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
