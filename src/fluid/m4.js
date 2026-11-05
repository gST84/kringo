// Load-sensing control block in the style of Bosch Rexroth M4-15 (e.g. R901621403): symbols for the internal
// parts and complete block elements (inlet, electrohydraulic proportional valve section, end plate).
// The block elements stack: placed side by side, the through channels P, X (pilot oil), Y (pilot drain),
// LS and T of neighbouring elements meet at the same points and connect.
// The main spool, the pilot valves, the port relief and the compensator, and the complete inlet, valve section
// and end plate, are the drawing of the Rexroth data sheet (vector paths, src/fluid/m4art.js); the moving spool
// shifts with the simulated stroke.
// Simulation (src/sim/engine.js), after data sheet RE 64283: the pilot reducing valves give 6.5 … 17.2 bar
// (control signal 0 … 100 %), the spool stroke and the flow follow that pilot pressure. Kinds 'prvp',
// 'm4inlet', 'm4sec', 'm4end'; the other parts use existing kinds (valve, regulator, relief, pass, or).
import { ART } from './m4art.js';

const L = (x1, y1, x2, y2, o) => ({ t: 'line', x1, y1, x2, y2, ...o });
const R = (x, y, w, h, o) => ({ t: 'rect', x, y, w, h, ...o });
const C = (cx, cy, r, o) => ({ t: 'circle', cx, cy, r, ...o });
const P = (d, o) => ({ t: 'path', d, ...o });
const T = (x, y, text, size = 2.2, anchor = 'middle') => ({ t: 'text', x, y, text, size, anchor });
const pin = (id, x, y, name = id) => ({ id, x, y, name });
const INK = { fill: 'ink' };
const WHITE = { fill: 'white' };
const D = { dash: true };
const THIN = { w: 0.2 };
const r2 = (v) => Math.round(v * 100) / 100;

/** Filled arrow from a to b. */
function arrow([ax, ay], [bx, by], s = 1.4) {
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, w = s * 0.5;
  const hx = bx - ux * s, hy = by - uy * s;
  return [L(ax, ay, r2(hx), r2(hy)), P(`M ${r2(bx)} ${r2(by)} L ${r2(hx - uy * w)} ${r2(hy + ux * w)} L ${r2(hx + uy * w)} ${r2(hy - ux * w)} Z`, INK)];
}
const zig = (x0, y0, x1, y1, n = 5) => {
  // spring from (x0,y0) to (x1,y1)
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
  let d = `M ${x0} ${y0}`;
  for (let i = 1; i <= n; i++) {
    const f = i / (n + 1), s = i % 2 ? 1.2 : -1.2;
    d += ` L ${r2(x0 + dx * f + nx * s)} ${r2(y0 + dy * f + ny * s)}`;
  }
  return P(`${d} L ${x1} ${y1}`, THIN);
};
/** Filter (diamond with dashed bar), centre (x, y), vertical flow. */
const filterG = (x, y, r = 3) => [P(`M ${x} ${y - r} L ${x + r} ${y} L ${x} ${y + r} L ${x - r} ${y} Z`, WHITE), L(x - r, y, x + r, y, { ...D, w: 0.2 })];
/** Plug / blanked option (square with cross). */
const plugG = (x, y, s = 2.5) => [R(x - s, y - s, 2 * s, 2 * s, WHITE), L(x - s * 0.6, y - s * 0.6, x + s * 0.6, y + s * 0.6, THIN), L(x - s * 0.6, y + s * 0.6, x + s * 0.6, y - s * 0.6, THIN)];
/** Measuring port stub, end at (x, y) going up (or down with dir 1). */
const portStub = (x, y, label, dir = -1) => [L(x - 1.2, y, x + 1.2, y), T(x + 1.8, y + dir * 0.5, label, 2, 'start')];
/** 2-way pressure reducing valve (pilot oil supply): centre (cx, cy), inlet top, outlet bottom. */
function prv2G(cx, cy) {
  return [R(cx - 3, cy - 4, 6, 8, WHITE), ...arrow([cx + 1, cy - 4], [cx + 1, cy + 4], 1.2), zig(cx - 3, cy, cx - 8, cy, 4), L(cx - 8, cy, cx - 10, cy, { ...D, w: 0.2 }),
    P(`M ${cx + 1} ${cy + 4} L ${cx + 3} ${cy + 6} L ${cx + 5} ${cy + 6} L ${cx + 5} ${cy - 2} L ${cx + 3} ${cy - 2}`, { ...D, w: 0.2 })];
}
/** Pressure relief valve (small, pilot oil): centre (cx, cy), P top, T bottom. */
function reliefG(cx, cy) {
  return [R(cx - 3, cy - 4, 6, 8, WHITE), ...arrow([cx + 1, cy - 4], [cx + 1, cy + 4], 1.2), zig(cx - 3, cy, cx - 8, cy, 4),
    P(`M ${cx - 1} ${cy - 4} L ${cx - 1} ${cy - 6} L ${cx - 9} ${cy - 6} L ${cx - 9} ${cy}`, { ...D, w: 0.2 })];
}
/** LS shuttle (vertical): centre (cx, cy), inputs top and bottom, output left. */
function shuttleG(cx, cy) {
  return [R(cx - 2.5, cy - 5, 5, 10, WHITE), C(cx, cy, 1.2), P(`M ${cx - 2} ${cy - 3.5} L ${cx} ${cy - 1.8} L ${cx + 2} ${cy - 3.5}`, THIN),
    P(`M ${cx - 2} ${cy + 3.5} L ${cx} ${cy + 1.8} L ${cx + 2} ${cy + 3.5}`, THIN)];
}

// ---------- traced drawings ----------

/** A traced drawing (one path of all its lines). */
const ink = (d) => P(d, { w: 0.22 });
const shifted = new Map();
/** The same path moved `dy` down (the moving spool). */
function shiftY(d, dy) {
  dy = r2(dy);
  if (!dy) return d;
  const key = d.length + ':' + d.slice(0, 40) + ':' + dy;
  if (!shifted.has(key)) {
    if (shifted.size > 200) shifted.clear();
    let i = 0;
    shifted.set(key, d.replace(/-?\d+(?:\.\d+)?/g, (m) => (i++ % 2 ? String(r2(+m + dy)) : m)));
  }
  return shifted.get(key);
}
const clampPos = (v) => Math.max(0, Math.min(2, v ?? 1));

// ---------- standalone parts ----------

const FOLDER = 'Hydraulica/Stuurblok LS (M4)';
const PARTS = `${FOLDER}/Onderdelen`;
const part = (id, name, kind, graphics, pins, o = {}) => ({
  id: `flu/h/m4-${id}`, name, folder: o.folder || PARTS, prefix: o.prefix || 'V', role: o.role || 'device',
  graphics, pins, fluid: { kind, medium: 'hydr' }, tagAt: o.tagAt || { x: -6, y: -6, anchor: 'end' },
  props: { medium: 'hydr', ...(o.props || {}) }, fields: o.fields, build: o.build, pinText: o.pinText ?? true, bridges: o.bridges,
});
const SOLF = { k: 'sol', label: 'Proportionele magneet (naam van de spoel op een elektrisch blad, bv. -7Y1)', list: 'coils' };
const BAR = (k, label) => ({ k, label: `${label} (bar)`, type: 'number' });
const CMD = { k: 'cmd', label: 'Stuursignaal (%) – 0 … 100 % = 0,45 … 0,8 A (24 V)', type: 'number' };

/**
 * Main spool (data sheet drawing, double size): proportional, hydraulically piloted on both ends, spring centred,
 * manual lever with stroke limiters. Ports left: T, LS, P, T; right: A, LS A, LS B, B. Pilot a (bottom) pushes the
 * spool up: P → A, B → T; pilot b (top) pushes it down: P → B, A → T.
 */
function buildSpool(props) {
  const pos = clampPos(props.__pos);
  return {
    graphics: [ink(ART.spool), ink(shiftY(ART.spoolMove, (pos - 1) * 20))],
    pins: [pin('R', -10, -10, 'T'), pin('LS', -10, -5), pin('P', -10, 0), pin('T2', -10, 5, 'T'),
      pin('A', 20, -10), pin('LSA', 20, -5, 'LS A'), pin('LSB', 20, 0, 'LS B'), pin('B', 20, 5),
      pin('XL', 7.5, 60, 'a'), pin('XR', 7.5, -45, 'b')],
    tagAt: { x: -11, y: -30, anchor: 'end' },
    bridges: [['R', 'T2']],
  };
}

export const M4_PARTS = [
  part('spool', 'Hoofdschuif proportioneel, hydraulisch voorgestuurd (a / b), met handhefboom en slagbegrenzing (LS)', 'valve', [], [],
    { build: buildSpool, props: { type: '4/3', left: 'pilot', right: 'pilot', centre: 'closed', prop: true }, pinText: false }),
  part('prvp', 'Proportioneel drukreduceerventiel 3-weg (voorsturing, elektrisch)', 'prvp',
    [ink(ART.pilot), T(-8.7, -24.6, '{sol}', 2)], [pin('P', 2.5, -22.5), pin('T', -2.5, -22.5), pin('A', 0, 0)],
    { props: { sol: '', p: 17.2, cmd: 100 }, fields: [SOLF, CMD, BAR('p', 'Stuurdruk bij 100 %')], tagAt: { x: -14, y: -17, anchor: 'end' } }),
  part('prv', 'Drukreduceerventiel 2-weg (stuurolieverzorging)', 'regulator', prv2G(0, 0), [pin('1', 0, -10, 'P'), pin('2', 0, 10, 'X')],
    { props: { p: 35 }, fields: [BAR('p', 'Ingestelde stuurdruk')] }),
  part('relief', 'Drukbegrenzer (stuurolie)', 'relief', reliefG(0, 0), [pin('P', 0, -10), pin('T', 0, 10)], { props: { p: 40 }, fields: [BAR('p', 'Openingsdruk')] }),
  part('portrelief', 'Secundaire drukbegrenzer met naaszuigfunctie (poort A / B)', 'relief', [ink(ART.relief)], [pin('P', 0, -25, 'A'), pin('T', 0, 0)],
    { props: { p: 230 }, fields: [BAR('p', 'Openingsdruk (vast ingesteld)')], tagAt: { x: -20, y: -14, anchor: 'end' } }),
  part('comp', 'Individuele drukweegschaal met lasthoudfunctie (type S, LS-gestuurd)', 'pass',
    [ink(ART.comp), L(10, -10, 10, -8.73, { dash: true, w: 0.22 })], [pin('1', -5, 0, 'P'), pin('2', 20, 0, 'P′'), pin('X', 10, -10, 'LS')],
    { props: { spring: 13 }, fields: [BAR('spring', 'Veer (drukverschil Δp)')], tagAt: { x: -2, y: 12, anchor: 'end' } }),
  part('shuttle', 'LS-wisselventiel', 'or', shuttleG(0, 0), [pin('X', 0, -10, ''), pin('Y', 0, 10, ''), pin('A', -10, 0, 'LS')], { prefix: 'V' }),
  part('filter', 'Stuuroliefilter', 'pass', filterG(0, 0), [pin('1', 0, -5, ''), pin('2', 0, 5, '')], { role: 'graphic', pinText: false }),
  part('plug', 'Blindplug (optie niet uitgevoerd)', 'none', plugG(0, 0), [pin('1', 0, -5, ''), pin('2', 0, 5, '')], { role: 'graphic', pinText: false }),
  part('mport', 'Meetaansluiting (M)', 'none', [L(0, 0, 0, -3), ...portStub(0, -3, '{name}')], [pin('1', 0, 0, '')], { role: 'graphic', pinText: false, props: { name: 'M' }, fields: [{ k: 'name', label: 'Naam (bv. MP, Ma, Mb)' }] }),
];

// ---------- complete block elements (data sheet drawing 1 : 1) ----------

/** Through channels at these heights (top of the element = 0). */
const Y = { P: 10, X: 15, Y: 20, LS: 25, T: 190 };
const sidePins = (x, sfx) => ['P', 'X', 'Y', 'LS', 'T'].map((k) => pin(k + sfx, x, Y[k], k));
const label = (x, y, text, size = 1.8, anchor = 'start') => T(x, y, text, size, anchor);

/** Inlet element (INLET L): pump port P, tank T, LS to the pump, gauge MP; pilot oil supply X with filter. */
function buildInlet(props) {
  const W = 60;
  return {
    graphics: [ink(ART.inlet), ...[['P', 10], ['X', 15], ['Y', 20], ['LS', 25], ['MP', 57.5], ['T', 190]].map(([k, y]) => label(1, y - 1.1, k)),
      T(W / 2, -6, 'INLAAT', 2.4), T(W / 2, 203, `X: ${props.px ?? 35} bar`, 1.8)],
    pins: [pin('P', -2.5, Y.P), pin('T', -2.5, Y.T), pin('LS', -2.5, Y.LS), pin('Y', -2.5, Y.Y), pin('MP', -2.5, 57.5), ...sidePins(W, 'r')],
    tagAt: { x: 0, y: -9.5, anchor: 'start' },
  };
}

/** Valve section: electrohydraulic proportional (pilot valves a / b), compensator, LS shuttle, port reliefs. */
function buildSection(props) {
  const W = 97.5;
  const pos = clampPos(props.__pos);
  return {
    graphics: [
      ink(ART.section), ink(shiftY(ART.sectionSpool, (pos - 1) * 10)),
      label(13.6, -1.4, 'Ma'), label(21.1, -1.4, 'Mb'), label(68.6, -1.4, 'A', 2), label(93.6, -1.4, 'B', 2),
      T(25.7, 48.4, `a ${props.solA || ''}`.trim(), 1.8), T(40.6, 38.4, `b ${props.solB || ''}`.trim(), 1.8),
      T(W / 2, -6, props.desc || '', 2.2),
      T(W / 2, 203, `A ${props.reliefA ?? 230} / B ${props.reliefB ?? 230} bar · Δp ${props.spring ?? 13} bar · ${props.cmd ?? 100} %`, 1.6),
    ],
    pins: [...sidePins(0, 'l'), ...sidePins(W, 'r'), pin('A', 67.5, 0), pin('B', 92.5, 0), pin('Ma', 12.5, 0), pin('Mb', 20, 0)],
    tagAt: { x: 0, y: -9.5, anchor: 'start' },
  };
}

/** End plate (ENDPLATE L): closes P, X, Y; LS drains to T; extra tank port T1. */
function buildEnd() {
  const W = 30;
  return {
    graphics: [ink(ART.end), T(W / 2, -6, 'EINDPLAAT', 2.2), label(30.6, 188.6, 'T1')],
    pins: [...sidePins(0, 'l'), pin('T1', 32.5, Y.T)],
    tagAt: { x: 0, y: -9.5, anchor: 'start' },
  };
}

const block = (id, name, kind, build, o = {}) => ({
  id: `flu/h/m4-${id}`, name, folder: FOLDER, prefix: o.prefix || 'V', role: 'device', graphics: [], pins: [],
  fluid: { kind, medium: 'hydr' }, build, props: { medium: 'hydr', ...(o.props || {}) }, fields: o.fields, pinText: false,
});

export const M4_BLOCKS = [
  block('inlet', 'Inlaatelement (LS, stuurolieverzorging X)', 'm4inlet', buildInlet, { props: { px: 35 }, fields: [BAR('px', 'Stuurdruk X')] }),
  block('section', 'Ventielsectie elektrohydraulisch proportioneel (LS, drukweegschaal, poortbeveiliging)', 'm4sec', buildSection, {
    props: { solA: '', solB: '', desc: '', reliefA: 230, reliefB: 230, spring: 13, qA: 61, qB: 98, cmd: 100 },
    fields: [
      { k: 'solA', label: 'Magneet a: P → A (spoel op een elektrisch blad, bv. -7Y1)', list: 'coils' },
      { k: 'solB', label: 'Magneet b: P → B (spoel, bv. -7Y2)', list: 'coils' },
      CMD,
      { k: 'desc', label: 'Omschrijving (bv. Sectie 1 – heffen)' },
      BAR('reliefA', 'Poortbeveiliging A'), BAR('reliefB', 'Poortbeveiliging B'),
      BAR('spring', 'Drukweegschaal (veer)'),
      { k: 'qA', label: 'Max. debiet A (l/min)', type: 'number' }, { k: 'qB', label: 'Max. debiet B (l/min)', type: 'number' },
    ],
  }),
  block('end', 'Eindplaat (LS naar tank, T1)', 'm4end', buildEnd),
];

export const M4 = [...M4_PARTS, ...M4_BLOCKS];
