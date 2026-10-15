// SVG of floor plans: walls, openings, stairs, room names, installation symbols and their links.
// Plans are stored in centimetres and drawn to scale (default 1:50) on the A3 sheet; symbols and
// texts keep a fixed paper size.
import { esc, r2 } from '../util.js';
import { FRAME, SHEET } from '../model.js';
import { frameSvg, shapeSvg, textSvg, SVG_STYLE } from '../schematic/render.js';
import { geometry } from '../symbols/geom.js';
import { wallFrame } from './model.js';

/** Sheet millimetres per plan centimetre. */
export const planK = (b) => 10 / (b.scale || 50);
/** Sheet position of plan coordinate (0, 0). */
export const PLAN_ORIGIN = [FRAME.area.x0 + 10, FRAME.area.y0 + 10];

export const LINK_COLORS = { switch: '#d97706', dom: '#7c3aed', pv: '#059669', other: '#64748b' };

export function wallPolygon(w) {
  const { u, n } = wallFrame(w);
  const t = (w.t || 20) / 2;
  const ax = w.x1 - u[0] * t, ay = w.y1 - u[1] * t;
  const bx = w.x2 + u[0] * t, by = w.y2 + u[1] * t;
  return [[ax + n[0] * t, ay + n[1] * t], [bx + n[0] * t, by + n[1] * t], [bx - n[0] * t, by - n[1] * t], [ax - n[0] * t, ay - n[1] * t]];
}

const pts = (list) => list.map(([x, y]) => `${r2(x)},${r2(y)}`).join(' ');

function openingSvg(o, w, sw, sel) {
  const { u, n } = wallFrame(w);
  const t = (w.t || 20) / 2;
  const c = [w.x1 + u[0] * o.pos, w.y1 + u[1] * o.pos];
  const hw = o.width / 2;
  const P = (along, across) => [c[0] + u[0] * along + n[0] * across, c[1] + u[1] * along + n[1] * across];
  let s = `<g class="opening${sel ? ' sel' : ''}" data-k="O:${o.id}">`;
  s += `<polygon class="gap" points="${pts([P(-hw, t + 0.5), P(hw, t + 0.5), P(hw, -t - 0.5), P(-hw, -t - 0.5)])}"/>`;
  s += `<line x1="${r2(P(-hw, t)[0])}" y1="${r2(P(-hw, t)[1])}" x2="${r2(P(-hw, -t)[0])}" y2="${r2(P(-hw, -t)[1])}" style="stroke-width:${sw}"/>`;
  s += `<line x1="${r2(P(hw, t)[0])}" y1="${r2(P(hw, t)[1])}" x2="${r2(P(hw, -t)[0])}" y2="${r2(P(hw, -t)[1])}" style="stroke-width:${sw}"/>`;
  const side = o.side === -1 ? -1 : 1;
  const hinge = o.hinge === 'r' ? 1 : -1;
  if (o.type === 'door' || o.type === 'door2') {
    const leaves = o.type === 'door2' ? [[-1, hw], [1, hw]] : [[hinge, o.width]];
    for (const [h, len] of leaves) {
      const H = P(h * hw, side * t);
      const E = [H[0] + n[0] * side * len, H[1] + n[1] * side * len];
      const J = P(h * hw - h * len, side * t);
      const sweep = (h * side > 0) ? 0 : 1;
      s += `<line x1="${r2(H[0])}" y1="${r2(H[1])}" x2="${r2(E[0])}" y2="${r2(E[1])}" style="stroke-width:${sw * 1.5}"/>`;
      s += `<path d="M ${r2(E[0])} ${r2(E[1])} A ${len} ${len} 0 0 ${sweep} ${r2(J[0])} ${r2(J[1])}" style="stroke-width:${sw * 0.7}" stroke-dasharray="${sw * 4} ${sw * 3}"/>`;
    }
  } else if (o.type === 'slide') {
    s += `<line x1="${r2(P(-hw, t * 0.3)[0])}" y1="${r2(P(-hw, t * 0.3)[1])}" x2="${r2(P(hw * 0.2, t * 0.3)[0])}" y2="${r2(P(hw * 0.2, t * 0.3)[1])}" style="stroke-width:${sw * 1.5}"/>`;
    s += `<line x1="${r2(P(-hw * 0.2, -t * 0.3)[0])}" y1="${r2(P(-hw * 0.2, -t * 0.3)[1])}" x2="${r2(P(hw, -t * 0.3)[0])}" y2="${r2(P(hw, -t * 0.3)[1])}" style="stroke-width:${sw * 1.5}"/>`;
  } else {
    // window: glass lines in the wall
    for (const a of [-0.25, 0.25]) {
      const A = P(-hw, t * a), B = P(hw, t * a);
      s += `<line x1="${r2(A[0])}" y1="${r2(A[1])}" x2="${r2(B[0])}" y2="${r2(B[1])}" style="stroke-width:${sw}"/>`;
    }
    const A = P(-hw, t), B = P(hw, t);
    s += `<line x1="${r2(A[0])}" y1="${r2(A[1])}" x2="${r2(B[0])}" y2="${r2(B[1])}" style="stroke-width:${sw * 0.6}"/>`;
  }
  return s + '</g>';
}

function stairSvg(st, sw, sel) {
  const n = Math.max(2, st.steps || 14);
  let s = `<g class="stair${sel ? ' sel' : ''}" data-k="S:${st.id}" transform="translate(${st.x} ${st.y}) rotate(${st.rot || 0})">`;
  s += `<rect x="0" y="0" width="${st.w}" height="${st.h}" class="stairbox" style="stroke-width:${sw}"/>`;
  for (let i = 1; i < n; i++) s += `<line x1="0" y1="${r2((st.h * i) / n)}" x2="${st.w}" y2="${r2((st.h * i) / n)}" style="stroke-width:${sw * 0.7}"/>`;
  const cx = st.w / 2;
  s += `<path d="M ${cx} ${st.h * 0.9} L ${cx} ${st.h * 0.1} M ${cx - st.w * 0.12} ${st.h * 0.1 + st.w * 0.15} L ${cx} ${st.h * 0.1} L ${cx + st.w * 0.12} ${st.h * 0.1 + st.w * 0.15}" style="stroke-width:${sw}"/>`;
  return s + `<rect class="hit" x="0" y="0" width="${st.w}" height="${st.h}"/></g>`;
}

export function linkKind(defA, defB) {
  const kinds = [defA?.kind, defB?.kind];
  if (kinds.includes('switch') || kinds.includes('push')) return 'switch';
  if (kinds.includes('dom-in') || kinds.includes('dom-out')) return 'dom';
  if (kinds.includes('pv') || kinds.includes('inverter') || kinds.includes('battery')) return 'pv';
  return 'other';
}

/** One installation symbol at plan position, drawn at paper size. */
function symbolSvg(sym, def, k, building, sel, opts) {
  const inv = 1 / k;
  const geom = geometry(def, sym);
  let shapes = '';
  for (const g of geom.graphics || []) shapes += g.t === 'text' ? textSvg(g.x, g.y, g.text, g.size, g.anchor) : shapeSvg(g);
  let s = `<g class="psym${sel ? ' sel' : ''}" data-k="A:${sym.id}" transform="translate(${r2(sym.x)} ${r2(sym.y)}) scale(${inv})">`;
  s += `<g transform="rotate(${sym.rot || 0})">${shapes}</g>`;
  const c = building.circuits.find((x) => x.id === sym.circuit);
  const label = c ? `${c.name}${sym.n ?? ''}` : '';
  if (label) s += textSvg(3.6, -3.2, label, 2, 'start', 'tx clabel');
  if (opts.showRooms && sym.props?.room) s += textSvg(3.6, -0.8, sym.props.room, 1.5, 'start', 'tx croom');
  if (!opts.print) s += `<circle class="hit" cx="0" cy="0" r="4.5"/>`;
  return s + '</g>';
}

export function planSvg(project, floorIdx, lib, opts = {}) {
  const b = project.building;
  const floor = b.floors[floorIdx];
  const k = planK(b);
  const sw = 0.25 / k; // 0.25 mm on paper
  const sel = opts.selection || new Set();
  const [ox, oy] = PLAN_ORIGIN;
  let s = `<rect class="sheet" x="0" y="0" width="${SHEET.w}" height="${SHEET.h}"/>`;
  if (opts.grid) s += `<rect class="plangrid" x="${FRAME.area.x0}" y="${FRAME.area.y0}" width="${FRAME.area.x1 - FRAME.area.x0}" height="${FRAME.area.y1 - FRAME.area.y0}"/>`;
  s += frameSvg(project, { title: floor.name }, floorIdx, b.floors.length);
  // scale note
  s += textSvg(FRAME.area.x1 - 3, FRAME.area.y1 - 4, `Schaal 1:${b.scale}`, 2.5, 'end', 'tx');
  s += `<g class="plan ink" transform="translate(${ox} ${oy}) scale(${k})">`;
  // walls
  s += '<g class="walls">';
  for (const w of floor.walls) {
    s += `<polygon class="wall${w.kind === 'inner' ? ' inner' : ''}${sel.has('W:' + w.id) ? ' sel' : ''}" data-k="W:${w.id}" points="${pts(wallPolygon(w))}"/>`;
  }
  s += '</g>';
  const wallsById = new Map(floor.walls.map((w) => [w.id, w]));
  for (const o of floor.openings) {
    const w = wallsById.get(o.wall);
    if (w) s += openingSvg(o, w, sw, sel.has('O:' + o.id));
  }
  for (const st of floor.stairs) s += stairSvg(st, sw, sel.has('S:' + st.id));
  // room names
  for (const t of floor.texts) {
    s += `<g class="ptext${sel.has('T:' + t.id) ? ' sel' : ''}" data-k="T:${t.id}" transform="translate(${r2(t.x)} ${r2(t.y)}) scale(${1 / k})">`;
    s += textSvg(0, 0, t.text, t.size || 3, 'middle', 'tx room');
    if (t.area) s += textSvg(0, (t.size || 3) * 1.1, t.area, (t.size || 3) * 0.7, 'middle', 'tx');
    if (!opts.print) s += `<rect class="hit" x="${-(t.text.length * (t.size || 3) * 0.3) - 1}" y="${-(t.size || 3) * 0.7}" width="${t.text.length * (t.size || 3) * 0.6 + 2}" height="${(t.size || 3) * 1.4}"/>`;
    s += '</g>';
  }
  // links (switch → lights, domotics, PV)
  const symById = new Map(floor.symbols.map((x) => [x.id, x]));
  if (opts.showLinks !== false) for (const l of floor.links) {
    const a = symById.get(l.a), c = symById.get(l.b);
    if (!a || !c) continue;
    const kind = linkKind(lib.get(a.sym), lib.get(c.sym));
    const mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2;
    const dx = c.x - a.x, dy = c.y - a.y;
    const bend = 0.18;
    const qx = mx - dy * bend, qy = my + dx * bend;
    s += `<path class="plink${sel.has('L:' + l.id) ? ' sel' : ''}" data-k="L:${l.id}" d="M ${r2(a.x)} ${r2(a.y)} Q ${r2(qx)} ${r2(qy)} ${r2(c.x)} ${r2(c.y)}" style="stroke:${LINK_COLORS[kind]};stroke-width:${sw * 1.2}" stroke-dasharray="${sw * 6} ${sw * 4}"/>`;
    if (!opts.print) s += `<path class="hit" data-k="L:${l.id}" d="M ${r2(a.x)} ${r2(a.y)} Q ${r2(qx)} ${r2(qy)} ${r2(c.x)} ${r2(c.y)}" style="stroke-width:${sw * 10}"/>`;
  }
  for (const sym of floor.symbols) {
    const def = lib.get(sym.sym);
    if (def) s += symbolSvg(sym, def, k, b, sel.has('A:' + sym.id), opts);
  }
  s += '</g>';
  return s;
}

export const PLAN_STYLE = `
.plan .wall{fill:#3d3d3d;stroke:none}.plan .wall.inner{fill:#7a7a7a}
.plan .gap{fill:#fff;stroke:none}.plan .stairbox{fill:#fff}
.plan .plink{fill:none}.room{font-weight:bold}.clabel{font-weight:bold;fill:#c2410c}.croom{fill:#555}
`;

export function standalonePlanSvg(project, floorIdx, lib) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SHEET.w} ${SHEET.h}" width="${SHEET.w}mm" height="${SHEET.h}mm"><style>${SVG_STYLE}${PLAN_STYLE}</style>${planSvg(project, floorIdx, lib, { print: true })}</svg>`;
}

export { esc };
