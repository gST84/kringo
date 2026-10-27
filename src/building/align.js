// Aligning and distributing selected symbols and texts on a floor plan (by their centre points).
import { r2 } from '../util.js';

const ico = (p) => `<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">${p}</svg>`;

/** [mode, title, icon] for the buttons. */
export const ALIGN_MODES = [
  ['left', 'Links uitlijnen', ico('<path d="M3 2v16"/><rect x="5" y="4" width="10" height="4" fill="currentColor" stroke="none"/><rect x="5" y="12" width="6" height="4" fill="currentColor" stroke="none"/>')],
  ['hcenter', 'Verticaal op één lijn (zelfde x)', ico('<path d="M10 2v16" stroke-dasharray="2 1.5"/><rect x="4" y="4" width="12" height="4" fill="currentColor" stroke="none"/><rect x="7" y="12" width="6" height="4" fill="currentColor" stroke="none"/>')],
  ['right', 'Rechts uitlijnen', ico('<path d="M17 2v16"/><rect x="5" y="4" width="10" height="4" fill="currentColor" stroke="none"/><rect x="9" y="12" width="6" height="4" fill="currentColor" stroke="none"/>')],
  ['top', 'Boven uitlijnen', ico('<path d="M2 3h16"/><rect x="4" y="5" width="4" height="10" fill="currentColor" stroke="none"/><rect x="12" y="5" width="4" height="6" fill="currentColor" stroke="none"/>')],
  ['vmiddle', 'Horizontaal op één lijn (zelfde y)', ico('<path d="M2 10h16" stroke-dasharray="2 1.5"/><rect x="4" y="4" width="4" height="12" fill="currentColor" stroke="none"/><rect x="12" y="7" width="4" height="6" fill="currentColor" stroke="none"/>')],
  ['bottom', 'Onder uitlijnen', ico('<path d="M2 17h16"/><rect x="4" y="5" width="4" height="10" fill="currentColor" stroke="none"/><rect x="12" y="9" width="4" height="6" fill="currentColor" stroke="none"/>')],
  ['distH', 'Horizontaal gelijk verdelen', ico('<path d="M2 3v14M18 3v14"/><rect x="4" y="7" width="3" height="6" fill="currentColor" stroke="none"/><rect x="8.5" y="7" width="3" height="6" fill="currentColor" stroke="none"/><rect x="13" y="7" width="3" height="6" fill="currentColor" stroke="none"/>')],
  ['distV', 'Verticaal gelijk verdelen', ico('<path d="M3 2h14M3 18h14"/><rect x="7" y="4" width="6" height="3" fill="currentColor" stroke="none"/><rect x="7" y="8.5" width="6" height="3" fill="currentColor" stroke="none"/><rect x="7" y="13" width="6" height="3" fill="currentColor" stroke="none"/>')],
];

/** Selected items that can be aligned: symbols (also LED strips) and texts. */
export function alignItems(floor, sel) {
  return [
    ...floor.symbols.filter((s) => sel.has('A:' + s.id)),
    ...floor.texts.filter((x) => sel.has('T:' + x.id)),
  ];
}

const moveTo = (it, x, y) => {
  const dx = x - it.x, dy = y - it.y;
  if (it.pts) it.pts = it.pts.map(([px, py]) => [r2(px + dx), r2(py + dy)]);
  it.x = r2(x); it.y = r2(y);
};

/** Aligns or distributes the items (in place). With `gap` (cm) the distribution uses that fixed spacing. */
export function alignSelection(items, mode, gap) {
  if (items.length < 2) return;
  const xs = items.map((i) => i.x), ys = items.map((i) => i.y);
  const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const set = { left: Math.min(...xs), hcenter: avg(xs), right: Math.max(...xs), top: Math.min(...ys), vmiddle: avg(ys), bottom: Math.max(...ys) };
  if (mode in set) {
    const v = set[mode];
    const horiz = mode === 'left' || mode === 'hcenter' || mode === 'right';
    for (const it of items) moveTo(it, horiz ? v : it.x, horiz ? it.y : v);
    return;
  }
  const k = mode === 'distH' ? 'x' : 'y';
  const list = [...items].sort((a, b) => a[k] - b[k]);
  const first = list[0][k];
  const step = gap > 0 ? gap : (list.at(-1)[k] - first) / (list.length - 1);
  list.forEach((it, i) => moveTo(it, k === 'x' ? first + step * i : it.x, k === 'y' ? first + step * i : it.y));
}
