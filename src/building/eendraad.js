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
import { t } from '../i18n.js';
import { newPage } from '../model.js';
import { uid } from '../util.js';
import { circuitSymbols, domAddress, treeChildren, treeNode, rootBoards } from './model.js';

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
/** Installation of the cable (AREI symbols), drawn along the circuit line: [mark, offset above the breaker]. */
export const INSTALL = {
  none: ['Algemeen (geen aanduiding)', []],
  'tube-wall': ['In een buis in een wand', [['wall', -4], ['tube', -17], ['wall', -26]]],
  wall: ['In een wand', [['wall', -4], ['wall', -26]]],
  onwall: ['Op een wand', [['onwall', -4], ['onwall', -26]]],
  tube: ['In een buis', [['tube', -17]]],
  underground: ['Ondergronds', [['ground', -17]]],
  overhead: ['Luchtleiding', [['overhead', -17]]],
};
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
  // domotics push buttons / sensors are on the bus, not on the 230 V single-line diagram
  const isControl = (s) => ['switch', 'push'].includes(kindOf(s));
  const addr = (s) => domAddress(building, s);
  const branchOf = (s, def, relay) => {
    const kind = def?.kind;
    if (kind === 'socket' || (kind === 'appliance' && !def.box)) return { type: 'sockets', sym: s.sym, qty: Math.max(1, parseInt(s.props?.qty, 10) || 1), units: def.units || 1, relay };
    if (def?.box) return { type: 'box', sym: s.sym, relay };
    return { type: 'single', sym: s.sym, relay };
  };
  // PV / DC devices: type, power, serial numbers and the cable towards the previous device
  const linkObj = new Map();
  for (const f of building.floors) for (const l of f.links) { linkObj.set(l.a + '|' + l.b, l); linkObj.set(l.b + '|' + l.a, l); }
  const num = (v) => String(Math.round((parseFloat(v) || 0) * 100) / 100).replace('.', ',');
  /** Data of a PV / DC device for under its symbol (type, power, serial numbers) and the cable towards the previous device. */
  const deviceInfo = (it, prevIds) => {
    const first = symById.get(it.ids[0]);
    const kind = kindOf(first);
    const p = first?.props || {};
    const power = [];
    if (kind === 'pv' && p.wp) power.push(it.count > 1 ? `${it.count} × ${num(p.wp)} Wp = ${num((it.count * p.wp) / 1000)} kWp` : `${num(p.wp)} Wp`);
    if (kind === 'inverter' && p.kw) power.push(`${num(p.kw)} kW`);
    if (kind === 'mppt' && p.power) power.push(`${num(p.power)} W`);
    if (kind === 'mppt' && p.amp) power.push(`${num(p.amp)} A`);
    if (kind === 'battery' && p.kwh) power.push(`${num(p.kwh)} kWh`);
    if (kind === 'battery' && p.kw) power.push(`${num(p.kw)} kW`);
    const serials = it.ids.map((id) => symById.get(id)?.props?.serial).filter(Boolean);
    const lines = [];
    if (p.model || power.length || serials.length) {
      const name = { inverter: t('Omvormer'), mppt: 'MPPT', pv: 'PV', battery: t('Batterij') }[kind] || t(lib.get(it.sym)?.name || '');
      lines.push(p.model ? `${name}: ${p.model}` : name);
      if (power.length) lines.push(power.join(' · '));
      if (serials.length) lines.push('SN ' + (serials.length > 3 ? serials.slice(0, 3).join(', ') + ' …' : serials.join(', ')));
    }
    let cable = '';
    for (const a of it.ids) for (const b2 of prevIds) cable ||= linkObj.get(a + '|' + b2)?.cable || '';
    it.lines = lines;
    it.cable = cable;
  };
  const branches = [];
  // switches first, so the lights they control (which may share their number) end up in their chain;
  // the branches are put back in the order of the numbers afterwards
  const ordered = [...items.filter(({ s }) => isControl(s)), ...items.filter(({ s }) => !isControl(s))];
  for (const { s } of ordered) {
    if (used.has(s.id)) continue;
    const at = branches.length;
    const def = lib.get(s.sym);
    const kind = def?.kind;
    if (kind === 'dom-in' || kind === 'dom-out') { used.add(s.id); continue; }
    const relay = addr(s);
    if (relay && !isControl(s)) {
      // everything on this domotics channel in this circuit: the relay contact, then the loads
      const same = items.map(({ s: o }) => o).filter((o) => !used.has(o.id) && o.dom === s.dom);
      const groups = new Map();
      for (const o of same) {
        used.add(o.id);
        if (kindOf(o) === 'light') groups.set(o.sym, (groups.get(o.sym) || 0) + 1);
      }
      if (groups.size) branches.push({ type: 'chain', switches: [], relay, lights: [...groups].map(([sym, count]) => ({ sym, count })) });
      for (const o of same) if (kindOf(o) !== 'light') branches.push(branchOf(o, lib.get(o.sym), relay));
      for (let i = at; i < branches.length; i++) branches[i].n = s.n || 0;
      continue;
    }
    used.add(s.id);
    if (isControl(s)) {
      // everything reachable through the links (chains like switch → switch → light → light):
      // the lights this switch controls and the other switches of the same group (2-way / cross)
      const lights = [];
      const switches = new Set([s]);
      const seen = new Set([s.id]);
      const queue = [s.id];
      while (queue.length) {
        for (const id of linksOf.get(queue.shift()) || []) {
          const o = symById.get(id);
          if (!o || seen.has(id)) continue;
          seen.add(id);
          if (kindOf(o) === 'light' && !addr(o)) { lights.push(o); queue.push(id); }
          else if (isControl(o)) { switches.add(o); queue.push(id); }
        }
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
    } else {
      // devices linked to each other in this circuit (inverter → PV panels → battery …): one branch
      const inCircuit = new Set(items.map(({ s: o }) => o.id));
      const group = [s];
      const queue = [s.id];
      while (queue.length) {
        for (const id of linksOf.get(queue.shift()) || []) {
          const o = symById.get(id);
          if (!o || used.has(id) || !inCircuit.has(id) || isControl(o) || ['light', 'dom-in', 'dom-out'].includes(kindOf(o)) || addr(o)) continue;
          used.add(id);
          group.push(o);
          queue.push(id);
        }
      }
      const rank = (o) => ({ inverter: 0, board: 0, mppt: 1, pv: 2, battery: 3 })[kindOf(o)] ?? 4;
      // equal devices together: {sym, count, ids}; a PV symbol can stand for several panels
      const countItems = (list) => {
        const groups = new Map();
        for (const o of [...list].sort((x, y) => rank(x) - rank(y))) {
          const g = groups.get(o.sym) || { sym: o.sym, count: 0, ids: [] };
          g.count += kindOf(o) === 'pv' ? Math.max(1, parseInt(o.props?.count, 10) || 1) : 1;
          g.ids.push(o.id);
          groups.set(o.sym, g);
        }
        return [...groups.values()];
      };
      const bus = group.find((o) => kindOf(o) === 'dcbus');
      if (bus) {
        // inverter → DC busbar → one row per device on the bus (MPPT → its panels first, battery … below)
        const members = new Set(group.map((o) => o.id));
        const nb = (id) => (linksOf.get(id) || []).filter((x) => members.has(x)).map((x) => symById.get(x));
        const heads = nb(bus.id).filter((o) => kindOf(o) === 'inverter');
        const taken = new Set([bus.id, ...heads.map((o) => o.id)]);
        const rowOf = (o) => {
          const sub = [o];
          taken.add(o.id);
          for (let i = 0; i < sub.length; i++) {
            for (const p of nb(sub[i].id)) {
              if (taken.has(p.id) || kindOf(p) === 'dcbus') continue;
              taken.add(p.id);
              sub.push(p);
            }
          }
          return countItems(sub);
        };
        const rows = nb(bus.id).filter((o) => !taken.has(o.id) && kindOf(o) !== 'dcbus').map(rowOf);
        for (const o of group) if (!taken.has(o.id) && o !== bus) rows.push(rowOf(o));
        const hasPv = (row) => row.some((it) => kindOf({ sym: it.sym }) === 'pv');
        rows.sort((a, c) => hasPv(c) - hasPv(a));
        const head = countItems(heads);
        head.forEach((it) => deviceInfo(it, [bus.id]));
        rows.forEach((row) => row.forEach((it, i) => deviceInfo(it, i ? row[i - 1].ids : [bus.id])));
        branches.push({ type: 'dc', head, rows: rows.length ? rows : [[]] });
      } else if (group.length > 1) {
        const items = countItems(group);
        items.forEach((it, i) => deviceInfo(it, i ? items[i - 1].ids : []));
        branches.push({ type: 'group', items });
      } else {
        const { relay: _, ...br } = branchOf(s, def, '');
        branches.push(br);
      }
    }
    if (branches.length > at) branches[at].n = s.n || 0;
  }
  // a circuit feeding domotics modules: the modules as an appliance box, first
  const mods = (building.domotics?.modules || []).filter((m) => m.circuit === circuit.id);
  if (mods.length) branches.push({ type: 'box', sym: 'arei/dom-module', label: mods.map((m) => m.name).join(', '), n: -1 });
  return branches.sort((x, y) => x.n - y.n).map(({ n, ...br }) => br);
}

const socketLen = (units) => 5 + (units - 1) * 4.5;
const RELAY_W = 7; // room for a domotics output contact at the start of a branch

// PV / DC branches: cable type above the line between two devices, device data under each symbol.
const CABLE_SZ = 2, INFO_SZ = 1.7, INFO_LH = 2.2;
const DC_ROW = 2 * ROW; // rows on a DC busbar
const textW = (str, size) => str.length * size * 0.56;
/** "Accukabel 25mm² CCA" → ["Accukabel", "25mm² CCA"]. */
const cableLines = (c) => {
  if (!c) return [];
  const i = c.indexOf(' ');
  return c.length <= 12 || i < 0 ? [c] : [c.slice(0, i), c.slice(i + 1)];
};
const halfOf = (lib, sym) => { const d = lib.get(sym); return d?.box ? d.half || 3.5 : d?.pins?.[0]?.y ?? 2.5; };
/** Positions of devices in a row starting at x0: the line from `from` to the symbol at `left`. */
function seqLayout(items, lib, x0, acFirst) {
  let x = x0, infoRight = -Infinity;
  const cells = items.map((it, i) => {
    const half = halfOf(lib, it.sym);
    const cl = i === 0 && acFirst ? [] : cableLines(it.cable);
    let seg = cl.length ? Math.max(10, ...cl.map((l) => textW(l, CABLE_SZ))) + 4 : i === 0 ? 4 : 6;
    if (x + seg < infoRight + 2) seg = infoRight + 2 - x; // keep the data under the symbols apart
    const left = x + seg;
    const cell = { it, from: x, left, half, cl };
    infoRight = left + Math.max(0, ...(it.lines || []).map((l) => textW(l, INFO_SZ)));
    x = left + 2 * half;
    return cell;
  });
  return { cells, end: x, right: Math.max(x, infoRight) };
}
/** DC branch: x of the busbar relative to the branch start. */
function busX(br, lib, x0) {
  const head = seqLayout(br.head, lib, x0, true);
  const cl = cableLines(br.head[0]?.cable);
  const seg = cl.length ? Math.max(10, ...cl.map((l) => textW(l, CABLE_SZ))) + 4 : 6;
  return { head, bx: Math.max(head.end + seg, head.right + 3), cl };
}
/** Rows above / below the line of a branch (branches are stacked in rows of ROW mm). */
const branchRows = (br) => (br.type === 'dc' ? { above: 1, below: 2 * (br.rows.length - 1) + 1 } : br.type === 'group' ? { above: 1, below: 1 } : { above: 0, below: 0 });

function branchLength(br, lib) {
  return (br.relay ? RELAY_W : 0) + (br.label ? br.label.length * 1.4 + 2 : 0) + branchBody(br, lib);
}
function branchBody(br, lib) {
  if (br.type === 'group') return seqLayout(br.items, lib, 0, true).right + 4;
  if (br.type === 'dc') {
    const { bx } = busX(br, lib, 0);
    return Math.max(bx, ...br.rows.map((row) => seqLayout(row, lib, bx, false).right)) + 4;
  }
  if (br.type === 'chain') return 4 + br.switches.length * SW + br.lights.length * 8 + 4 + br.lights.filter((l) => l.count > 1).length * 4 + 3;
  if (br.type === 'sockets') return 4 + br.qty * (socketLen(br.units) + 1.5);
  if (br.type === 'box') return 4 + 2 * 7;
  return 4 + 8;
}
const circuitWidth = (branches, lib) => Math.max(21, ...branches.map((br) => branchLength(br, lib) + 9));

function builder(project, lib, board, title) {
  const b = project.building;
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
    text(20, 22, t('Eendraadschema – {name}', { name: board.name }) + (pages.length > 1 ? t(' (vervolg)') : ''), 4, { bold: true });
    x = X_START;
    page.busFrom = 18;
    if (first) {
      const m = board.main || {};
      const feed = board.parent && treeNode(b, board.parent);
      if (feed) {
        const fb = feed.type === 'board' ? feed.node : null;
        text(20, MAIN_Y + 22, t('Voeding vanuit {name}', { name: feed.type === 'circuit' ? t('kring {name}', { name: feed.node.name }) : fb ? fb.name : feed.node.name }), 2.4, { bold: true });
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
      text(cx, sy + 4, m.rcd > 0 ? `Type ${m.type || 'A'} - Δ${m.rcd}mA` : t('Hoofdschakelaar'), 2.2, { anchor: 'middle' });
      text(cx, sy + 7.6, icn(m.kA), 2.2, { anchor: 'middle', box: true });
      text(cx, sy + 11.2, `${m.poles || 2}P - ${m.In || 40}A`, 2.2, { anchor: 'middle' });
      wire([rx + 12, sy], [rx + 22, sy], [rx + 22, MAIN_Y]);
      x = Math.max(X_START, rx + 8);
    } else {
      text(15, MAIN_Y - 2, t('← vervolg'), 2.2);
    }
  };
  const closePage = () => { if (page) bus(page.busFrom, Math.max(x - 4, page.busFrom + 10), MAIN_Y); };

  /** Breaker texts: vertical columns right of the breaker, centred on its middle. */
  const breakerTexts = (bx, by, lines) => lines.forEach((t, i) => vtext(bx + 2.6 + i * 3, by - MCB_H / 2, t.text, 2.1, { anchor: 'middle', ...(t.box ? { box: true } : {}) }));

  /** Draws a row laid out by seqLayout: lines with the cable above, symbols, counts and data below. */
  const drawSeq = (lay, y) => {
    for (const c of lay.cells) {
      const { it, from, left, half, cl } = c;
      wire([from, y], [left, y]);
      cl.forEach((l, k) => text((from + left) / 2, y - 1.4 - (cl.length - 1 - k) * 2.5, l, CABLE_SZ, { anchor: 'middle' }));
      const def = lib.get(it.sym);
      if (def?.box) comp(it.sym, left + half, y); else comp(it.sym, left + half, y, 90);
      if (it.count > 1) text(left + 2 * half - 1, y - (def?.box ? half : 4) - 1.8, `x${it.count}`, 2.2);
      (it.lines || []).forEach((l, k) => text(left, y + (def?.box ? half : 4) + 2.6 + k * INFO_LH, l, INFO_SZ));
    }
    return lay.end;
  };

  const drawBranch = (br, lx, y) => {
    let px = lx + 4;
    if (br.relay) {
      // domotics output contact with its address, then the loads
      comp('arei/dom-relay', px + 2.6, y);
      text(px + 2.6, y - 3.4, br.relay, 2, { anchor: 'middle' });
      px += RELAY_W;
      lx += RELAY_W;
      wire([lx - RELAY_W, y], [lx, y]);
    }
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
        cx = c + 5 + (l.count > 1 ? 4 : 0);
      }
      if (!br.lights.length) end = cx;
      wire([lx, y], [end, y]);
      for (const [sym, c, rot, count] of placed) {
        comp(sym, c, y, rot);
        // the count right of the light, so it cannot be mistaken for the branch above
        if (count > 1) text(c + (rot ? halfOf(lib, sym) : 2.5) + 0.8, y - 2.4, `x${count}`, 2.2);
      }
    } else if (br.type === 'sockets') {
      const pinY = lib.get(br.sym)?.pins?.[0]?.y ?? 2.5;
      const len = socketLen(br.units);
      const starts = [];
      for (let k = 0, bx = px; k < br.qty; k++, bx += len + 1.5) starts.push(bx);
      wire([lx, y], [starts[starts.length - 1], y]);
      for (const s of starts) comp(br.sym, s + pinY, y, 90);
    } else if (br.type === 'group') {
      drawSeq(seqLayout(br.items, lib, lx, true), y);
    } else if (br.type === 'dc') {
      // inverter on the circuit line, DC cable, a vertical busbar, then one row per DC device
      const { head, bx, cl } = busX(br, lib, lx);
      const end = drawSeq(head, y);
      wire([end, y], [bx, y]);
      cl.forEach((l, k) => text((end + bx) / 2, y - 1.4 - (cl.length - 1 - k) * 2.5, l, CABLE_SZ, { anchor: 'middle' }));
      const last = y + (br.rows.length - 1) * DC_ROW;
      page.wires.push({ id: uid('w'), points: [[bx, y - 3], [bx, last + 3]], w: 0.9 });
      text(bx, y - 5, 'DC', 1.8, { anchor: 'middle', bold: true });
      br.rows.forEach((row, r) => { if (row.length) drawSeq(seqLayout(row, lib, bx, false), y + r * DC_ROW); });
    } else if (br.type === 'box') {
      wire([lx, y], [px, y]);
      comp(br.sym, px + (lib.get(br.sym)?.half || 3.5), y);
      if (br.label) text(px + 2 * (lib.get(br.sym)?.half || 3.5) + 1.5, y, br.label, 2.2);
    } else {
      const pinY = lib.get(br.sym)?.pins?.[0]?.y ?? 2.5;
      wire([lx, y], [px, y]);
      comp(br.sym, px + pinY, y, 90);
    }
  };

  const installMarks = (c, top) => {
    for (const [m, dy] of (INSTALL[c.install] || INSTALL['tube-wall'])[1]) comp('arei/mark-' + m, x, top + dy);
    // number of conductors from the cores ("3G2,5" → 3)
    const n = parseInt(c.cores, 10);
    if (c.showConductors !== false && n > 0) {
      const y = top - 10;
      if (n <= 3) comp('arei/mark-cond' + n, x, y);
      else { comp('arei/mark-condn', x, y); text(x - 2, y - 1.6, String(n), 1.9, { anchor: 'end' }); }
    }
  };

  const circuit = (c, base) => {
    const branches = buildBranches(b, lib, c);
    const w = circuitWidth(branches, lib);
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
      vtext(x + 1, top - 10, fed.length ? `→ ${fed.join(', ')}` : label || t('Reserve'), 2.3, { bold: true });
      if (fed.length) { vtext(x + 2.6, top - 3, cableText(c), 2.1); installMarks(c, top); }
      return w;
    }
    vtext(x + 2.6, top - 3, cableText(c), 2.1);
    installMarks(c, top);
    // a single appliance (or a single socket) sits on top of the line
    const one = branches.length === 1 ? branches[0] : null;
    if (one && !one.relay && !one.label && (one.type === 'box' || (one.type === 'sockets' && one.qty === 1))) {
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
    // a DC branch takes one row per device on its busbar (below its own line)
    const colTop = []; // per column: row of the highest branch line
    let col = 0, filled = 0, topY = first;
    branches.forEach((br, j) => {
      const { above, below } = branchRows(br);
      const height = above + 1 + below;
      if (filled && filled + height > rows) { col++; filled = 0; }
      const row = filled + below;
      filled += height;
      colTop[col] = row;
      const lx = x + col * w;
      const y = first - row * ROW;
      topY = Math.min(topY, y);
      text(lx - 1.2, y, String(j + 1), 2.4, { anchor: 'end' });
      drawBranch(br, lx, y);
    });
    const cols = colTop.length;
    for (let c2 = 0; c2 < cols; c2++) {
      const lx = x + c2 * w;
      const yTop = first - colTop[c2] * ROW;
      if (c2 === 0) wire([x, top], [x, yTop]);
      else {
        const prevTop = first - colTop[c2 - 1] * ROW;
        wire([x + (c2 - 1) * w, prevTop], [x + (c2 - 1) * w, prevTop - 4], [lx, prevTop - 4], [lx, yTop]);
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
        ensureRoom(circuitWidth(buildBranches(b, lib, node), lib));
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
    const bld = builder(project, lib, board, t('Eendraadschema {name}', { name: board.name }));
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
