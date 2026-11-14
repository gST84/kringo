// Right-click menu for the drawing canvases: a small list of actions at the pointer.
import { h } from '../util.js';

const MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
/** Shortcut text for the menu: "Ctrl+C" or "⌘C". */
export const keyHint = (k) => (MAC ? '⌘' + k : 'Ctrl+' + k);

let open = null;
export function closeContextMenu() {
  open?.remove();
  open = null;
}

/**
 * Shows a menu at (x, y) (client pixels). items: { label, hint?, run, disabled?, danger? } or '-' for a
 * separator. Closes on a choice, Escape, a click elsewhere, scrolling or resizing.
 */
export function contextMenu(x, y, items) {
  closeContextMenu();
  const list = items.filter((it, i, a) => it !== '-' || (i > 0 && a[i - 1] !== '-' && i < a.length - 1));
  const menu = h('div', { class: 'ctxmenu', role: 'menu' }, list.map((it) => it === '-' ? h('div', { class: 'sep' })
    : h('button', {
      class: it.danger ? 'danger' : '', role: 'menuitem', disabled: it.disabled || null,
      onclick: (e) => { e.stopPropagation(); closeContextMenu(); it.run(); },
    }, h('span', null, it.label), it.hint ? h('kbd', null, it.hint) : null)));
  document.body.append(menu);
  open = menu;
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 4)) + 'px';
  menu.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + 'px';
  menu.querySelector('button:not([disabled])')?.focus({ preventScroll: true });
}

const away = (e) => { if (open && !open.contains(e.target)) closeContextMenu(); };
addEventListener('pointerdown', away, true);
addEventListener('keydown', (e) => {
  if (!open) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeContextMenu(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const btns = [...open.querySelectorAll('button:not([disabled])')];
    const i = btns.indexOf(document.activeElement);
    btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length]?.focus();
  }
}, true);
addEventListener('resize', closeContextMenu);
addEventListener('blur', closeContextMenu);
