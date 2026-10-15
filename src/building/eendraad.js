// Single-line diagram (eendraadschema) per distribution board, in the usual Belgian layout and
// generated as ordinary schematic pages (editable afterwards):
//  - busbar at the bottom, supply bottom left: kWh meter → supply cable → general residual
//    current device → busbar, earth electrode on the left end of the busbar
//  - every circuit rises from the busbar: letter left of the breaker, breaking capacity and rating
//    written vertically, cable vertically along the circuit line
//  - devices branch off to the right, numbered 1, 2, 3 … on the left; a circuit with a single
//    device carries the symbol on top of the line; the circuit description stands vertically on top
//  - circuits behind a 30 mA residual current device rise from their own busbar above the device
import { newPage } from '../model.js';
import { uid } from '../util.js';
import { circuitSymbols } from './model.js';

const BUS_Y = 228; // main busbar
const SUB_DY = 24; // residual current device height + gap to its busbar
const MCB_H = 12;
const ROW = 11; // mm between devices
const TOP_MIN = 40; // highest device position
const UNIT = 4.5; // width of one socket in a multiple socket box
const X_START = 62, X_END = 405;

const fmtSection = (s) => String(s ?? '').replace('.', ',');
export const cableText = (c) => `${c.cable || ''} ${c.cores || ''}${fmtSection(c.section)}`.trim();
const breakerText = (c) => `${c.poles || 2}P - ${c.curve || 'C'} ${c.In}A`;

/** Width needed by a circuit: branch + the widest symbol (multiple sockets are wider). */
function circuitWidth(devs, lib, rows) {
  if (devs.length <= 1) return 24;
  let units = 1;
  for (const { s } of devs) units = Math.max(units, lib.get(s.sym)?.units || 1.4);
  const cols = Math.ceil(devs.length / rows);
  return Math.max(24, 12 + units * UNIT + 4) * cols;
}

function builder(project, lib, board, title) {
  const pages = [];
  let page, x, busFrom;
  const comp = (sym, px, py, rot = 0, texts = []) => {
    const def = lib.get(sym);
    const c = { id: uid('c'), sym, x: px, y: py, rot, mirror: false, props: { ...(def?.props || {}) }, autoTag: false, tag: '', texts, gen: true };
    page.comps.push(c);
    return c;
  };
  const wire = (...points) => page.wires.push({ id: uid('w'), points });
  const text = (px, py, t, size = 2.5, extra = {}) => page.texts.push({ id: uid('t'), x: px, y: py, text: t, size, anchor: 'start', ...extra });
  const vtext = (px, py, t, size = 2.3, extra = {}) => text(px, py, t, size, { rot: -90, ...extra }); // reads upward from (px, py)

  const newSheet = (first) => {
    page = newPage(`${title}${pages.length ? ` (${pages.length + 1})` : ''}`);
    page.gen = 'eendraad';
    page.noDots = true; // Belgian single-line diagrams draw branches without junction dots
    page.board = board.id;
    pages.push(page);
    text(20, 22, `Eendraadschema – ${board.name}${pages.length > 1 ? ' (vervolg)' : ''}`, 4, { bold: true });
    x = X_START;
    busFrom = 22;
    if (first) {
      const m = board.main || {};
      // earth electrode with measuring clamp on the left end of the busbar
      comp('arei/earth', 22, BUS_Y);
      // supply: kWh meter → cable → main switch / general residual current device → busbar
      const sy = BUS_Y + 15;
      comp('arei/kwh', 50, sy, 90);
      wire([50, sy], [68, sy]);
      text(53, sy + 3.5, m.cable || 'XVB 3G10', 2.2);
      comp('arei/mcb-v', 68, sy, 90);
      text(70, sy + 3.5, m.rcd > 0 ? `Δ${m.rcd}mA` : 'Hoofdschakelaar', 2.2);
      text(70, sy + 6.5, `${m.poles || 2}P - ${m.In || 40}A`, 2.2);
      wire([80, sy], [86, sy], [86, BUS_Y]);
    } else {
      text(16, BUS_Y - 2, '← vervolg', 2.2);
      busFrom = 15;
    }
  };
  const closeBus = () => { if (page) page.wires.push({ id: uid('w'), points: [[busFrom, BUS_Y], [Math.max(x - 6, busFrom + 10), BUS_Y]], w: 0.9 }); };

  /** One circuit rising from `baseY` at the current x. */
  const circuit = (c, baseY) => {
    const devs = circuitSymbols(project.building, c.id);
    const top0 = baseY - MCB_H - 30; // first device
    const rows = Math.max(1, Math.floor((top0 - TOP_MIN) / ROW) + 1);
    const w = circuitWidth(devs, lib, rows);
    comp('arei/mcb-v', x, baseY);
    text(x - 3.5, baseY - 4, c.name, 4, { bold: true, anchor: 'end' });
    vtext(x + 2.6, baseY - 1, `${c.kA || 3}kA`, 2.1);
    vtext(x + 5.4, baseY - 1, breakerText(c), 2.1);
    const mcbTop = baseY - MCB_H;
    const label = c.desc || [...new Set(devs.map(({ s, floor }) => s.props?.room || floor.name))].join(', ');
    if (!devs.length) {
      wire([x, mcbTop], [x, mcbTop - 6]);
      vtext(x + 1, mcbTop - 8, label || 'Reserve', 2.4, { bold: true });
      return w;
    }
    vtext(x + 2.6, mcbTop - 3, cableText(c), 2.1);
    if (devs.length === 1) {
      // single device on top of the circuit line
      const { s } = devs[0];
      const def = lib.get(s.sym);
      const pinY = def?.pins?.[0]?.y ?? 2.5;
      wire([x, mcbTop], [x, top0]);
      comp(s.sym, x, top0 - pinY, 0);
      text(x - 4, top0 - pinY - 1, String(s.n ?? 1), 2.5, { anchor: 'end' });
      vtext(x + 1, top0 - pinY - 8, label, 2.4, { bold: true });
      return w;
    }
    const colW = w / Math.ceil(devs.length / rows);
    let topY = top0;
    devs.forEach(({ s }, j) => {
      const col = Math.floor(j / rows), row = j % rows;
      const lx = x + col * colW;
      const y = top0 - row * ROW;
      topY = Math.min(topY, y);
      const def = lib.get(s.sym);
      const pinY = def?.pins?.[0]?.y ?? 2.5;
      wire([lx, y], [lx + 6, y]);
      comp(s.sym, lx + 6 + pinY, y, 90);
      text(lx - 1.5, y, String(s.n ?? j + 1), 2.5, { anchor: 'end' });
    });
    const cols = Math.ceil(devs.length / rows);
    for (let col = 0; col < cols; col++) {
      const lx = x + col * colW;
      const last = Math.min(devs.length - col * rows, rows) - 1;
      if (col === 0) wire([x, mcbTop], [x, top0 - last * ROW]);
      else {
        // continue in the next column: over the top and down again
        const prevTop = top0 - (rows - 1) * ROW;
        wire([x + (col - 1) * colW, prevTop], [x + (col - 1) * colW, prevTop - 4], [lx, prevTop - 4], [lx, top0 - last * ROW]);
      }
    }
    vtext(x + 1, Math.min(topY, top0 - (rows - 1) * ROW * (cols > 1 ? 1 : 0)) - 6, label, 2.4, { bold: true });
    return w;
  };

  return {
    pages,
    start() { newSheet(true); },
    group(rcd, circuits) {
      const base = rcd ? BUS_Y - SUB_DY : BUS_Y;
      let rx = null, subFrom = 0, lastX = 0;
      const openRcd = () => {
        if (!rcd) return;
        // residual current device rising from the main busbar, feeding its own busbar
        rx = x;
        comp('arei/mcb-v', rx, BUS_Y);
        vtext(rx + 2.6, BUS_Y - 1, `Δ${rcd.sens || 30}mA`, 2.1);
        vtext(rx + 5.4, BUS_Y - 1, `${rcd.In || 40}A type ${rcd.type || 'A'}`, 2.1);
        wire([rx, BUS_Y - MCB_H], [rx, base]);
        x += 12;
        subFrom = rx;
      };
      const closeRcd = () => { if (rcd && rx !== null) page.wires.push({ id: uid('w'), points: [[subFrom, base], [Math.max(lastX, subFrom + 8), base]], w: 0.7 }); x += rcd ? 6 : 0; };
      openRcd();
      for (const c of circuits) {
        const devs = circuitSymbols(project.building, c.id);
        const rows = Math.max(1, Math.floor((base - MCB_H - 30 - TOP_MIN) / ROW) + 1);
        const w = circuitWidth(devs, lib, rows);
        if (x + w - 20 > X_END && x > X_START + (rcd ? 12 : 0)) {
          closeRcd();
          closeBus();
          newSheet(false);
          openRcd();
        }
        lastX = x;
        x += circuit(c, base);
      }
      closeRcd();
    },
    finish() { closeBus(); return pages; },
  };
}

/** (Re)generates the single-line pages of every board. Returns the index of the first generated page. */
export function generateEendraad(project, lib) {
  const b = project.building;
  let firstIdx = -1;
  for (const board of b.boards) {
    const circuits = b.circuits.filter((c) => c.board === board.id); // in the order of the circuit list
    const bld = builder(project, lib, board, `Eendraadschema ${board.name}`);
    bld.start();
    const direct = circuits.filter((c) => !board.rcds.some((r) => r.id === c.rcd));
    if (direct.length) bld.group(null, direct);
    for (const rcd of board.rcds) {
      const list = circuits.filter((c) => c.rcd === rcd.id);
      if (list.length) bld.group(rcd, list);
    }
    const pages = bld.finish();
    const old = project.pages.map((p, i) => (p.gen === 'eendraad' && p.board === board.id ? i : -1)).filter((i) => i >= 0);
    let at = old.length ? old[0] : project.pages.length;
    for (const i of old.reverse()) project.pages.splice(i, 1);
    at = Math.min(at, project.pages.length);
    project.pages.splice(at, 0, ...pages);
    if (firstIdx < 0) firstIdx = at;
  }
  return firstIdx;
}
