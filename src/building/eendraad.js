// Single-line diagram (eendraadschema) per distribution board in the usual Belgian layout,
// generated as schematic sheets of the building project (editable afterwards):
//  - main busbar at the bottom; supply bottom left: (kWh meter) → supply cable → general residual
//    current device → busbar; earth electrode with measuring clamp on the left end
//  - every 30 mA residual current device rises from the main busbar and feeds its own busbar,
//    from which its circuits rise
//  - circuit: letter bottom left, breaker with breaking capacity (framed, e.g. 3000) and rating
//    written vertically, cable along the line ("VOB Eca 3G2,5²")
//  - numbered branches to the right: switches in a row on the line followed by the light points
//    they control (×n), socket boxes, appliances; a circuit with a single appliance carries it on top
import { newPage } from '../model.js';
import { uid } from '../util.js';
import { circuitSymbols, treeChildren, treeNode, rootBoards } from './model.js';

const MAIN_Y = 222; // main busbar
const SUB_DY = 40; // main busbar → busbar of a residual current device
const MCB_H = 12;
const CABLE = 36; // breaker top → first branch
const ROW = 10; // mm between branches
const TOP_MIN = 38;
const SW = 6.5; // spacing of switches on a branch
const X_START = 40, X_END = 408;

const fmtSection = (s) => String(s ?? '').replace('.', ',');
export const cableText = (c) => [c.cable, c.fire, `${c.cores || ''}${fmtSection(c.section)}²`].filter(Boolean).join(' ');
const icn = (kA) => String(Math.round((kA || 3) * 1000));

/** Groups the devices of a circuit into numbered branches. */
export function buildBranches(building, lib, circuit) {
  const items = circuitSymbols(building, circuit.id);
  const used = new Set();
  const linksOf = new Map();
  for (const f of building.floors) for (const l of f.links) {
    for (const [a, c] of [[l.a, l.b], [l.b, l.a]]) { if (!linksOf.has(a)) linksOf.set(a, []); linksOf.get(a).push(c); }
  }
  const symById = new Map();
  for (const f of building.floors) for (const s of f.symbols) symById.set(s.id, s);
  const kindOf = (s) => lib.get(s.sym)?.kind;
  const isControl = (s) => ['switch', 'push', 'dom-in'].includes(kindOf(s));
  const branches = [];
  for (const { s } of items) {
    if (used.has(s.id)) continue;
    const def = lib.get(s.sym);
    const kind = def?.kind;
    used.add(s.id);
    if (isControl(s)) {
      // the lights this switch controls, and the other switches controlling the same lights (2-way / cross)
      const lights = (linksOf.get(s.id) || []).map((id) => symById.get(id)).filter((o) => o && kindOf(o) === 'light');
      const switches = new Set([s]);
      for (const lt of lights) for (const id of linksOf.get(lt.id) || []) {
        const o = symById.get(id);
        if (o && isControl(o)) switches.add(o);
      }
      const order = (o) => lib.get(o.sym)?.order ?? 0;
      const twoWay = [...switches].filter((o) => order(o) === 1);
      const middle = [...switches].filter((o) => order(o) !== 1);
      const chain = twoWay.length >= 2 ? [twoWay[0], ...middle, ...twoWay.slice(1)] : [...twoWay, ...middle];
      for (const o of chain) used.add(o.id);
      const groups = new Map();
      for (const lt of lights) {
        if (used.has(lt.id)) continue;
        used.add(lt.id);
        groups.set(lt.sym, (groups.get(lt.sym) || 0) + 1);
      }
      branches.push({ type: 'chain', switches: chain.map((o) => o.sym), lights: [...groups].map(([sym, count]) => ({ sym, count })) });
    } else if (kind === 'light') {
      branches.push({ type: 'chain', switches: [], lights: [{ sym: s.sym, count: 1 }] });
    } else if (kind === 'socket' || (kind === 'appliance' && !def.box)) {
      branches.push({ type: 'sockets', sym: s.sym, qty: Math.max(1, parseInt(s.props?.qty, 10) || 1), units: def.units || 1 });
    } else if (def?.box) {
      branches.push({ type: 'box', sym: s.sym });
    } else {
      branches.push({ type: 'single', sym: s.sym });
    }
  }
  return branches;
}

const socketLen = (units) => 5 + (units - 1) * 4.5;
function branchLength(br) {
  if (br.type === 'chain') return 4 + br.switches.length * SW + br.lights.length * 8 + 4;
  if (br.type === 'sockets') return 4 + br.qty * (socketLen(br.units) + 1.5);
  if (br.type === 'box') return 4 + 2 * 7;
  return 4 + 8;
}
const circuitWidth = (branches) => Math.max(21, ...branches.map((br) => branchLength(br) + 9));

function builder(project, lib, board, title) {
  const b = project.building;
  const marks = b.cableMarks !== false;
  const pages = [];
  let page, x;
  const comp = (sym, px, py, rot = 0) => {
    const def = lib.get(sym);
    const c = { id: uid('c'), sym, x: px, y: py, rot, mirror: false, props: { ...(def?.props || {}) }, autoTag: false, tag: '', gen: true };
    page.comps.push(c);
    return c;
  };
  const wire = (...points) => page.wires.push({ id: uid('w'), points });
  const bus = (x0, x1, y) => page.wires.push({ id: uid('w'), points: [[x0, y], [x1, y]], w: 0.9 });
  const text = (px, py, t, size = 2.5, extra = {}) => page.texts.push({ id: uid('t'), x: px, y: py, text: t, size, anchor: 'start', ...extra });
  const vtext = (px, py, t, size = 2.2, extra = {}) => text(px, py, t, size, { rot: -90, ...extra });

  const newSheet = (first) => {
    page = newPage(`${title}${pages.length ? ` (${pages.length + 1})` : ''}`);
    page.gen = 'eendraad';
    page.board = board.id;
    page.noDots = true;
    pages.push(page);
    text(20, 22, `Eendraadschema – ${board.name}${pages.length > 1 ? ' (vervolg)' : ''}`, 4, { bold: true });
    x = X_START;
    page.busFrom = 18;
    if (first) {
      const m = board.main || {};
      const feed = board.parent && treeNode(b, board.parent);
      if (feed) {
        const fb = feed.type === 'board' ? feed.node : null;
        text(20, MAIN_Y + 22, `Voeding vanuit ${feed.type === 'circuit' ? 'kring ' + feed.node.name : fb ? fb.name : feed.node.name}`, 2.4, { bold: true });
      }
      if (!feed) comp('arei/earth', 22, MAIN_Y);
      const sy = MAIN_Y + 15;
      let sx = 34;
      if (m.meter !== false && !feed) { comp('arei/kwh', sx + 20, sy, 90); sx += 20; }
      wire([sx, sy], [sx + 26, sy]);
      text(sx + 1, sy + 4, m.cable || (feed?.type === 'circuit' ? cableText(feed.node) : 'XVB Cca 4x10²'), 2.2);
      text(sx + 12, sy - 2.2, '○', 2.4, { anchor: 'middle' });
      const rx = sx + 26;
      comp('arei/mcb-v', rx, sy, 90);
      const cx = rx + 6;
      text(cx, sy + 4, m.rcd > 0 ? `Type ${m.type || 'A'} - Δ${m.rcd}mA` : 'Hoofdschakelaar', 2.2, { anchor: 'middle' });
      text(cx, sy + 7.6, icn(m.kA), 2.2, { anchor: 'middle', box: true });
      text(cx, sy + 11.2, `${m.poles || 2}P - ${m.In || 40}A`, 2.2, { anchor: 'middle' });
      wire([rx + 12, sy], [rx + 22, sy], [rx + 22, MAIN_Y]);
      x = Math.max(X_START, rx + 8);
    } else {
      text(15, MAIN_Y - 2, '← vervolg', 2.2);
    }
  };
  const closePage = () => { if (page) bus(page.busFrom, Math.max(x - 4, page.busFrom + 10), MAIN_Y); };

  /** Breaker texts: vertical columns right of the breaker, centred on its middle. */
  const breakerTexts = (bx, by, lines) => lines.forEach((t, i) => vtext(bx + 2.6 + i * 3, by - MCB_H / 2, t.text, 2.1, { anchor: 'middle', ...(t.box ? { box: true } : {}) }));

  const drawBranch = (br, lx, y) => {
    const px = lx + 4;
    if (br.type === 'chain') {
      const placed = [];
      let cx = px + 1.1;
      for (const sym of br.switches) { placed.push([sym, cx, 0, 1]); cx += SW; }
      let end = lx;
      cx -= 1.1;
      for (const l of br.lights) {
        const isCross = l.sym === 'arei/light';
        const c = cx + (isCross ? 2.5 : 3.6);
        placed.push([l.sym, c, isCross ? 0 : 90, l.count]);
        end = c;
        cx = c + 5;
      }
      if (!br.lights.length) end = cx;
      wire([lx, y], [end, y]);
      for (const [sym, c, rot, count] of placed) {
        comp(sym, c, y, rot);
        if (count > 1) text(c + 1.2, y - 4.8, `x${count}`, 2.2);
      }
    } else if (br.type === 'sockets') {
      const pinY = lib.get(br.sym)?.pins?.[0]?.y ?? 2.5;
      const len = socketLen(br.units);
      const starts = [];
      for (let k = 0, bx = px; k < br.qty; k++, bx += len + 1.5) starts.push(bx);
      wire([lx, y], [starts[starts.length - 1], y]);
      for (const s of starts) comp(br.sym, s + pinY, y, 90);
    } else if (br.type === 'box') {
      wire([lx, y], [px, y]);
      comp(br.sym, px + (lib.get(br.sym)?.half || 3.5), y);
    } else {
      const pinY = lib.get(br.sym)?.pins?.[0]?.y ?? 2.5;
      wire([lx, y], [px, y]);
      comp(br.sym, px + pinY, y, 90);
    }
  };

  const circuit = (c, base) => {
    const branches = buildBranches(b, lib, c);
    const w = circuitWidth(branches);
    const fuse = c.curve === 'gG';
    comp(fuse ? 'arei/fuse-v' : 'arei/mcb-v', x, base);
    text(x - 2.2, base - 2.5, c.name, 3.8, { bold: true, anchor: 'end' });
    breakerTexts(x, base, fuse
      ? [{ text: `${c.poles || 2}P - ${c.In}A gG` }]
      : [{ text: icn(c.kA), box: true }, { text: `${c.poles || 2}P - ${c.curve || 'C'} ${c.In}A` }]);
    const top = base - MCB_H;
    const first = top - CABLE;
    const label = c.desc || '';
    const fed = treeChildren(b, c.id).filter((t) => t.type === 'board').map((t) => t.node.name);
    if (!branches.length) {
      wire([x, top], [x, top - 8]);
      vtext(x + 1, top - 10, fed.length ? `→ ${fed.join(', ')}` : label || 'Reserve', 2.3, { bold: true });
      if (fed.length) vtext(x + 2.6, top - 3, cableText(c), 2.1);
      return w;
    }
    vtext(x + 2.6, top - 3, cableText(c), 2.1);
    if (marks) {
      text(x - 1.2, top - 4, 'E', 2.2, { anchor: 'end' });
      text(x - 1.2, top - 17, '○', 2.2, { anchor: 'end' });
      text(x - 1.2, top - 26, 'E', 2.2, { anchor: 'end' });
    }
    // a single appliance (or a single socket) sits on top of the line
    const one = branches.length === 1 ? branches[0] : null;
    if (one && (one.type === 'box' || (one.type === 'sockets' && one.qty === 1))) {
      wire([x, top], [x, first]);
      if (one.type === 'box') comp(one.sym, x, first - (lib.get(one.sym)?.pins?.[0]?.y ?? 3.5));
      else {
        comp(one.sym, x, first - (lib.get(one.sym)?.pins?.[0]?.y ?? 2.5));
        text(x - 3.5, first - 2, '1', 2.4, { anchor: 'end' });
      }
      if (label) vtext(x + 1, first - 12, label, 2.3, { bold: true });
      return w;
    }
    const rows = Math.max(1, Math.floor((first - TOP_MIN) / ROW) + 1);
    const cols = Math.ceil(branches.length / rows);
    let topY = first;
    branches.forEach((br, j) => {
      const col = Math.floor(j / rows), row = j % rows;
      const lx = x + col * w;
      const y = first - row * ROW;
      topY = Math.min(topY, y);
      text(lx - 1.2, y, String(j + 1), 2.4, { anchor: 'end' });
      drawBranch(br, lx, y);
    });
    for (let col = 0; col < cols; col++) {
      const lx = x + col * w;
      const n = Math.min(branches.length - col * rows, rows);
      if (col === 0) wire([x, top], [x, first - (n - 1) * ROW]);
      else {
        const prevTop = first - (rows - 1) * ROW;
        wire([x + (col - 1) * w, prevTop], [x + (col - 1) * w, prevTop - 4], [lx, prevTop - 4], [lx, first - (n - 1) * ROW]);
      }
    }
    if (label) vtext(x + 1, topY - 7, label, 2.3, { bold: true });
    return w * cols;
  };

  // ---------- tree ----------
  const stack = []; // open residual current devices: {rcd, parentBase, base, from, lastX}
  const openRcd = (e) => {
    const rx = x + 7;
    comp(e.rcd.curve === 'gG' ? 'arei/fuse-v' : 'arei/mcb-v', rx, e.parentBase);
    breakerTexts(rx, e.parentBase, [
      { text: `Type ${e.rcd.type || 'A'} - Δ${e.rcd.sens || 30}mA` }, { text: icn(e.rcd.kA), box: true }, { text: `${e.rcd.poles || 2}P - ${e.rcd.In || 40}A` },
    ]);
    wire([rx, e.parentBase - MCB_H], [rx, e.base]);
    e.from = x - 6;
    e.lastX = x;
    const parent = stack[stack.indexOf(e) - 1];
    if (parent) parent.lastX = Math.max(parent.lastX, rx - 6);
  };
  const closeRcd = (e) => bus(e.from, Math.max(e.lastX + 6, e.from + 14), e.base);
  const pageBreak = () => {
    for (let i = stack.length - 1; i >= 0; i--) closeRcd(stack[i]);
    closePage();
    newSheet(false);
    for (const e of stack) openRcd(e);
  };
  const ensureRoom = (w) => { if (x + w > X_END && x > X_START + 12 * (stack.length + 1)) pageBreak(); };

  const children = (parentId, base) => {
    for (const { type, node } of treeChildren(b, parentId)) {
      if (type === 'circuit') {
        ensureRoom(circuitWidth(buildBranches(b, lib, node)));
        if (stack.length) stack[stack.length - 1].lastX = x;
        x += circuit(node, base);
      } else if (type === 'rcd') {
        ensureRoom(40);
        const e = { rcd: node, parentBase: base, base: base - SUB_DY };
        stack.push(e);
        openRcd(e);
        children(node.id, e.base);
        closeRcd(e);
        stack.pop();
        x += 12;
      } else if (type === 'board') {
        // sub-board fed directly (no own breaker in this board): a line with its name
        ensureRoom(20);
        if (stack.length) stack[stack.length - 1].lastX = x;
        wire([x, base], [x, base - 24]);
        vtext(x + 1, base - 26, `→ ${node.name}`, 2.3, { bold: true });
        x += 20;
      }
    }
  };

  return {
    pages,
    start() { newSheet(true); },
    tree() { children(board.id, MAIN_Y); },
    finish() { closePage(); for (const p of pages) delete p.busFrom; return pages; },
  };
}

/** Boards in tree order: each root board followed by the boards it feeds. */
function boardsInOrder(b) {
  const out = [];
  const walk = (id) => {
    for (const { type, node } of treeChildren(b, id)) {
      if (type === 'board') { out.push(node); walk(node.id); } else walk(node.id);
    }
  };
  for (const r of rootBoards(b)) { out.push(r); walk(r.id); }
  return out;
}

/** (Re)generates the single-line sheets of every board. Returns the index of the first generated sheet. */
export function generateEendraad(project, lib) {
  const b = project.building;
  const all = [];
  for (const board of boardsInOrder(b)) {
    const bld = builder(project, lib, board, `Eendraadschema ${board.name}`);
    bld.start();
    bld.tree();
    all.push(...bld.finish());
  }
  const old = project.pages.map((p, i) => (p.gen === 'eendraad' ? i : -1)).filter((i) => i >= 0);
  let at = old.length ? old[0] : project.pages.length;
  for (const i of old.reverse()) project.pages.splice(i, 1);
  at = Math.min(at, project.pages.length);
  project.pages.splice(at, 0, ...all);
  return at;
}
