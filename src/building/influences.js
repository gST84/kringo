// The document of external influences (uitwendige invloeden): one row per room, as a table sheet in
// the project (like the Normec overview) and as rows for a list / CSV.
import { t } from '../i18n.js';
import { newPage } from '../model.js';
import { uid } from '../util.js';
import { INFLUENCES, NORMAL } from './rooms.js';

/** Rows: [{room, floor, name, values: {AA: '4,5,8', …}, pub}] over all floors. */
export function influenceRows(building) {
  const multi = building.floors.length > 1;
  const out = [];
  for (const floor of building.floors) for (const room of floor.rooms || []) {
    const values = {};
    for (const [code] of INFLUENCES) values[code] = (room.infl?.[code] || NORMAL[code]).join(',');
    out.push({ room, floor, name: `${room.name || t('Ruimte')}${multi ? ` (${floor.name})` : ''}`, values, pub: room.pub ? t('Ja') : t('Neen') });
  }
  return out;
}

const ROWS_PER_PAGE = 19;

/** (Re)generates the sheet(s) "Uitwendige invloeden"; returns the index of the first one. */
export function generateInfluences(project) {
  const b = project.building;
  const meta = b.inflMeta || {};
  const rows = influenceRows(b);
  const pages = [];
  const chunks = [];
  for (let i = 0; i < Math.max(1, rows.length); i += ROWS_PER_PAGE) chunks.push(rows.slice(i, i + ROWS_PER_PAGE));
  const X0 = 20, X1 = 410, NAME_W = 70;
  const cols = [...INFLUENCES.map(([code, name]) => [code, name]), ['PUB', 'Publiek toegankelijke ruimte (ja / neen)']];
  const cw = (X1 - X0 - NAME_W) / cols.length;
  const HEAD_TOP = 30, CODE_TOP = 72, BODY_TOP = 79, ROW = 7, FOOT_TOP = 222, FOOT_BOT = 252;
  chunks.forEach((chunk, pi) => {
    const page = newPage(t('Uitwendige invloeden') + (chunks.length > 1 ? ` (${pi + 1})` : ''));
    page.gen = 'invloeden';
    page.noDots = true;
    const text = (x, y, s, size = 2.2, o = {}) => page.texts.push({ id: uid('t'), x, y, text: s, size, anchor: 'start', ...o });
    const line = (x1, y1, x2, y2, w) => page.wires.push({ id: uid('w'), points: [[x1, y1], [x2, y2]], ...(w ? { w } : {}) });
    text(X0, 22, t('Uitwendige invloeden – document per ruimte (AREI Boek 1, 2.10)'), 4, { bold: true });
    const bottom = BODY_TOP + Math.max(chunk.length, 1) * ROW;
    // grid
    for (const y of [HEAD_TOP, CODE_TOP, BODY_TOP]) line(X0, y, X1, y, y === BODY_TOP ? 0.5 : 0);
    for (let r = 1; r <= Math.max(chunk.length, 1); r++) line(X0, BODY_TOP + r * ROW, X1, BODY_TOP + r * ROW);
    line(X0, HEAD_TOP, X0, bottom);
    for (let c = 0; c <= cols.length; c++) line(X0 + NAME_W + c * cw, HEAD_TOP, X0 + NAME_W + c * cw, bottom);
    // header: names written upwards, codes below
    text(X0 + 2, (HEAD_TOP + CODE_TOP) / 2, t('Uitwendige invloeden / ruimte'), 2.4, { bold: true });
    cols.forEach(([code, name], c) => {
      const cx = X0 + NAME_W + c * cw + cw / 2;
      const words = t(name).split(' ');
      const wrapped = [];
      for (const wd of words) {
        const cur = wrapped[wrapped.length - 1];
        if (cur && (cur + ' ' + wd).length <= 38) wrapped[wrapped.length - 1] = cur + ' ' + wd; else wrapped.push(wd);
      }
      wrapped.forEach((l, i) => text(cx + (i - (wrapped.length - 1) / 2) * 2.2, CODE_TOP - 1.5, l, 1.7, { rot: -90 }));
      text(cx, (CODE_TOP + BODY_TOP) / 2, code, 2.4, { bold: true, anchor: 'middle' });
    });
    chunk.forEach((row, r) => {
      const y = BODY_TOP + r * ROW + ROW / 2;
      text(X0 + 2, y, row.name, 2.4);
      cols.forEach(([code], c) => text(X0 + NAME_W + c * cw + cw / 2, y, code === 'PUB' ? row.pub : row.values[code], 2.2, { anchor: 'middle' }));
    });
    if (!chunk.length) text(X0 + 2, BODY_TOP + ROW / 2, t('Nog geen ruimtes: teken ruimtes op het grondplan.'), 2.4);
    // footer: reference, date, address, signatures
    line(X0, FOOT_TOP, X1, FOOT_TOP); line(X0, FOOT_BOT, X1, FOOT_BOT);
    line(X0, FOOT_TOP, X0, FOOT_BOT); line(X1, FOOT_TOP, X1, FOOT_BOT);
    const SIG = 250;
    line(SIG, FOOT_TOP, SIG, FOOT_BOT); line(SIG + 80, FOOT_TOP, SIG + 80, FOOT_BOT);
    [[t('Referentie'), meta.ref || project.name], [t('Datum'), meta.date || project.meta?.date || ''], [t('Adres'), meta.address || project.meta?.address || '']]
      .forEach(([label, value], i) => { text(X0 + 2, FOOT_TOP + 5 + i * 9, `${label}:`, 2.4, { bold: true }); text(X0 + 28, FOOT_TOP + 5 + i * 9, value, 2.4); });
    text(SIG + 2, FOOT_TOP + 4, t('Handtekening exploitant:'), 2.2, { bold: true });
    text(SIG + 82, FOOT_TOP + 4, t('Handtekening erkend organisme:'), 2.2, { bold: true });
    pages.push(page);
  });
  const old = project.pages.map((p, i) => (p.gen === 'invloeden' ? i : -1)).filter((i) => i >= 0);
  let at = old.length ? old[0] : project.pages.length;
  for (const i of old.reverse()) project.pages.splice(i, 1);
  at = Math.min(at, project.pages.length);
  project.pages.splice(at, 0, ...pages);
  return at;
}
