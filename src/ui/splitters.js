// Draggable edges on the side panels: drag to change their width, double-click for the default.
// The widths are kept per browser.
import { t } from '../i18n.js';

const KEY = 'kringo-panels';
const DEFAULT = { left: 250, right: 280 };
const MIN = 180;

export function initSplitters() {
  const root = document.documentElement;
  let w = { ...DEFAULT };
  try { Object.assign(w, JSON.parse(localStorage.getItem(KEY)) || {}); } catch { /* private mode */ }
  const max = () => Math.max(MIN, Math.floor(window.innerWidth * 0.45));
  const apply = () => {
    for (const side of ['left', 'right']) root.style.setProperty(`--${side}-w`, `${Math.min(Math.max(w[side], MIN), max())}px`);
  };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(w)); } catch { /* private mode */ } };
  apply();
  window.addEventListener('resize', apply);
  for (const side of ['left', 'right']) {
    const aside = document.getElementById(side);
    const grip = document.createElement('div');
    grip.className = `splitter ${side}`;
    grip.title = t('Sleep om de breedte aan te passen · dubbelklik = standaard');
    grip.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      try { grip.setPointerCapture(e.pointerId); } catch { /* synthetic event */ }
      const x0 = e.clientX, w0 = aside.getBoundingClientRect().width;
      document.body.classList.add('resizing');
      const move = (ev) => {
        const dx = ev.clientX - x0;
        w[side] = Math.min(Math.max(w0 + (side === 'left' ? dx : -dx), MIN), max());
        apply();
      };
      const up = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        grip.removeEventListener('pointercancel', up);
        document.body.classList.remove('resizing');
        save();
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
      grip.addEventListener('pointercancel', up);
    });
    grip.addEventListener('dblclick', () => { w[side] = DEFAULT[side]; apply(); save(); });
    aside.append(grip);
  }
}
