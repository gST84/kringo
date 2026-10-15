// Single-line diagram (eendraadschema) per distribution board, generated as ordinary schematic
// pages so it can be edited afterwards. Layout: supply + meter + main switch on the left, a busbar,
// residual current devices with their circuits, every circuit a vertical line with its devices.
import { newPage } from '../model.js';
import { uid } from '../util.js';
import { circuitSymbols } from './model.js';

const MAX_ROWS = 11; // devices per column
const ROW = 9; // mm between devices
const COL = 38; // mm per circuit column
const X_START = 70, X_END = 405;
const Y_BUS = 85, Y_RCD = 90, Y_SUB = 114, Y_MCB = 118, Y_DEV = 152;

const fmtSection = (s) => String(s).replace('.', ',');
export const cableText = (c) => `${c.cable || ''} ${c.cores || ''}${fmtSection(c.section || '')}`.trim();

function builder(project, lib, board, title) {
  const pages = [];
  let page, x;
  const comp = (sym, px, py, rot = 0, texts = [], props = {}) => {
    const def = lib.get(sym);
    const c = { id: uid('c'), sym, x: px, y: py, rot, mirror: false, props: { ...(def?.props || {}), ...props }, autoTag: false, tag: '', texts, gen: true };
    page.comps.push(c);
    return c;
  };
  const wire = (...points) => page.wires.push({ id: uid('w'), points });
  const text = (px, py, t, size = 2.5, extra = {}) => page.texts.push({ id: uid('t'), x: px, y: py, text: t, size, anchor: 'start', ...extra });
  const newSheet = (first) => {
    page = newPage(`${title}${pages.length ? ` (${pages.length + 1})` : ''}`);
    page.gen = 'eendraad';
    page.board = board.id;
    pages.push(page);
    text(20, 22, `Eendraadschema – ${board.name}${pages.length > 1 ? ' (vervolg)' : ''}`, 4, { bold: true });
    x = X_START;
    if (first) {
      // supply → meter → main switch / general residual current device → busbar
      text(22, 32, 'Net 230 V', 2.5);
      wire([30, 35], [30, 38]);
      comp('arei/kwh', 30, 38);
      const m = board.main || {};
      const mainSym = m.rcd > 0 ? 'arei/rcd' : 'arei/mainswitch';
      wire([30, 58], [30, 60]);
      comp(mainSym, 30, 60, 0, [
        { x: 3, y: 6, text: `${m.poles || 2}P ${m.In || 40} A`, size: 2 },
        ...(m.rcd > 0 ? [{ x: 3, y: 9, text: `${m.rcd} mA`, size: 2 }] : []),
      ]);
      wire([30, 80], [30, Y_BUS]);
    } else {
      text(22, Y_BUS - 3, '← vervolg', 2.2);
    }
    page.busStart = first ? 30 : 20;
  };
  const closeBus = () => {
    if (page && x > X_START) wire([page.busStart, Y_BUS], [x - COL + 10, Y_BUS]);
  };
  return {
    pages,
    start() { newSheet(true); },
    group(rcd, circuits) {
      // width of every circuit (long circuits take more columns)
      const widths = circuits.map((c) => COL * Math.max(1, Math.ceil(circuitSymbols(project.building, c.id).length / MAX_ROWS)));
      const total = widths.reduce((a, b) => a + b, 0);
      if (x + total - COL > X_END && x > X_START) { closeBus(); newSheet(false); }
      let groupStart = x;
      const startGroup = () => {
        groupStart = x;
        if (rcd) {
          wire([x, Y_BUS], [x, Y_RCD]);
          comp('arei/rcd', x, Y_RCD, 0, [
            { x: 3, y: 5, text: `${rcd.In || 40} A`, size: 2 },
            { x: 3, y: 8, text: `${rcd.sens || 30} mA type ${rcd.type || 'A'}`, size: 2 },
          ]);
          wire([x, Y_RCD + 20], [x, Y_SUB]);
        }
      };
      const endGroup = (lastX) => { if (rcd && lastX > groupStart) wire([groupStart, Y_SUB], [lastX, Y_SUB]); };
      startGroup();
      circuits.forEach((c, i) => {
        if (x + widths[i] - COL > X_END && x > X_START) {
          endGroup(x - COL);
          closeBus();
          newSheet(false);
          startGroup();
        }
        const top = rcd ? Y_SUB : Y_BUS;
        wire([x, top], [x, Y_MCB]);
        comp('arei/mcb', x, Y_MCB, 0, [
          { x: 3, y: 6, text: `${c.curve || 'C'}${c.In} A`, size: 2 },
          { x: 3, y: 9, text: `${c.poles || 2}P`, size: 2 },
        ]);
        text(x - 2, Y_MCB + 24, `Kring ${c.name}`, 2.6, { bold: true, anchor: 'end' });
        if (c.desc) text(x - 2, Y_MCB + 27.5, c.desc, 2, { anchor: 'end' });
        const devs = circuitSymbols(project.building, c.id);
        const cols = Math.max(1, Math.ceil(devs.length / MAX_ROWS));
        if (devs.length) {
          const rows = Math.min(devs.length, MAX_ROWS);
          wire([x, Y_MCB + 20], [x, Y_DEV + (rows - 1) * ROW]);
          page.texts.push({ id: uid('t'), x: x - 1.5, y: Y_DEV + 4 + ((rows - 1) * ROW) / 2, text: cableText(c), size: 1.8, anchor: 'middle', rot: -90 });
          devs.forEach(({ s, floor }, j) => {
            const col = Math.floor(j / MAX_ROWS);
            const row = j % MAX_ROWS;
            const lx = x + col * COL;
            const y = Y_DEV + row * ROW;
            if (col > 0 && row === 0) wire([x, Y_DEV + (MAX_ROWS - 1) * ROW], [x, Y_DEV + (MAX_ROWS - 1) * ROW + 3], [lx, Y_DEV + (MAX_ROWS - 1) * ROW + 3], [lx, Y_DEV]);
            else if (col > 0) wire([lx, y - ROW], [lx, y]);
            const def = lib.get(s.sym);
            const pinY = def?.pins?.[0]?.y ?? 2.5;
            wire([lx, y], [lx + 5, y]);
            const label = `${c.name}${s.n ?? ''}  ${s.props?.room || floor.name}`;
            comp(s.sym, lx + 5 + pinY, y, 90, [{ x: 0, y: -(pinY + 5), text: label, size: 1.9, keep: true }]);
          });
        }
        x += widths[i];
      });
      endGroup(x - COL);
    },
    finish() { closeBus(); for (const p of pages) delete p.busStart; return pages; },
  };
}

/** (Re)generates the single-line pages of every board. Returns the index of the first generated page. */
export function generateEendraad(project, lib) {
  const b = project.building;
  let firstIdx = -1;
  for (const board of b.boards) {
    const circuits = b.circuits.filter((c) => c.board === board.id);
    const bld = builder(project, lib, board, `Eendraadschema ${board.name}`);
    bld.start();
    const direct = circuits.filter((c) => !board.rcds.some((r) => r.id === c.rcd));
    if (direct.length) bld.group(null, direct);
    for (const rcd of board.rcds) {
      const list = circuits.filter((c) => c.rcd === rcd.id);
      if (list.length) bld.group(rcd, list);
    }
    const pages = bld.finish();
    // replace the previously generated pages of this board
    const old = project.pages.map((p, i) => (p.gen === 'eendraad' && p.board === board.id ? i : -1)).filter((i) => i >= 0);
    let at = old.length ? old[0] : project.pages.length;
    for (const i of old.reverse()) project.pages.splice(i, 1);
    if (!project.pages.length) at = 0;
    project.pages.splice(at, 0, ...pages);
    if (firstIdx < 0) firstIdx = at;
  }
  return firstIdx;
}
