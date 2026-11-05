// Load-sensing control block in the style of Bosch Rexroth M4-15 (e.g. R901621403): symbols for the internal
// parts and complete block elements (inlet, electrohydraulic proportional valve section, end plate).
// The block elements stack: placed side by side, the through channels P, X (pilot oil), Y (pilot drain),
// LS and T of neighbouring elements meet at the same points and connect.
// Simulation (src/sim/engine.js): kinds 'prvp' (proportional pilot reducing valve), 'm4inlet', 'm4sec', 'm4end';
// the other parts use existing kinds (valve, regulator, relief, pass, or, check).

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
/** Throttle mark ")(" at (x, y) across a horizontal flow. */
const throttle = (x, y) => [P(`M ${x - 1.2} ${y - 1.3} A 2 2 0 0 1 ${x - 1.2} ${y + 1.3}`, THIN), P(`M ${x + 1.2} ${y - 1.3} A 2 2 0 0 0 ${x + 1.2} ${y + 1.3}`, THIN)];
/** Proportional solenoid (box with diagonal and slanted arrow) with its right edge at (x, y). */
const propSol = (x, y) => [R(x - 4, y - 2, 4, 4, WHITE), L(x - 4, y + 2, x, y - 2, THIN), ...arrow([x - 4.5, y + 3.2], [x + 0.5, y - 3.2], 1)];
/** Filter (diamond with dashed bar), centre (x, y), vertical flow. */
const filterG = (x, y, r = 3) => [P(`M ${x} ${y - r} L ${x + r} ${y} L ${x} ${y + r} L ${x - r} ${y} Z`, WHITE), L(x - r, y, x + r, y, { ...D, w: 0.2 })];
/** Plug / blanked option (square with cross). */
const plugG = (x, y, s = 2.5) => [R(x - s, y - s, 2 * s, 2 * s, WHITE), L(x - s * 0.6, y - s * 0.6, x + s * 0.6, y + s * 0.6, THIN), L(x - s * 0.6, y + s * 0.6, x + s * 0.6, y - s * 0.6, THIN)];
/** Measuring port stub, end at (x, y) going up (or down with dir 1). */
const portStub = (x, y, label, dir = -1) => [L(x - 1.2, y, x + 1.2, y), T(x + 1.8, y + dir * 0.5, label, 2, 'start')];

/** Proportional pressure reducing valve (3-way, pilot): body centre (cx, cy); P top, A bottom, drain right. */
function prvpG(cx, cy, label = '') {
  return [
    R(cx - 4, cy - 4, 8, 8, WHITE), ...arrow([cx, cy + 3], [cx, cy - 3], 1.2), ...arrow([cx, cy - 1], [cx, cy + 3.2], 1.2),
    ...propSol(cx - 4, cy), zig(cx + 4, cy, cx + 8, cy, 4),
    P(`M ${cx + 2} ${cy + 4} L ${cx + 4} ${cy + 6} L ${cx + 6} ${cy + 6}`, { ...D, w: 0.2 }),
    T(cx - 6, cy - 4.5, label, 2.2),
  ];
}
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
/** Port pressure relief valve with anti-cavitation check (secondary, preset): centre (cx, cy), P top, T bottom. */
function portReliefG(cx, cy) {
  return [
    R(cx - 3.5, cy - 3.5, 7, 7, WHITE),
    P(`M ${cx - 2.6} ${cy - 1.5} L ${cx - 1.4} ${cy + 0.2} L ${cx - 0.2} ${cy - 1.5}`, THIN), C(cx - 1.4, cy - 0.6, 0.6),
    ...arrow([cx + 1.6, cy - 3.5], [cx + 1.6, cy + 3.5], 1.1),
    P(`M ${cx - 3.5} ${cy - 2} L ${cx - 6} ${cy} L ${cx - 3.5} ${cy + 2} Z`, INK), zig(cx - 6, cy, cx - 10, cy, 4),
    P(`M ${cx + 1.6} ${cy - 3.5} L ${cx + 3.5} ${cy - 5.5} L ${cx + 5} ${cy - 5.5} L ${cx + 5} ${cy - 2} L ${cx + 3.5} ${cy - 2}`, { ...D, w: 0.2 }),
  ];
}
/** Individual pressure compensator (2-way, normally open, spring + LS against the inlet): centre (cx, cy), vertical. */
function compG(cx, cy) {
  return [
    R(cx - 3, cy - 6, 6, 12, WHITE), L(cx - 3, cy, cx + 3, cy, THIN),
    ...arrow([cx, cy - 4.5], [cx, cy - 1], 1), L(cx - 1.5, cy + 2, cx + 1.5, cy + 2), L(cx, cy + 2, cx, cy + 4),
    zig(cx, cy - 6, cx, cy - 10, 4),
  ];
}
/** LS shuttle (vertical): centre (cx, cy), inputs top and bottom, output left. */
function shuttleG(cx, cy) {
  return [R(cx - 2.5, cy - 5, 5, 10, WHITE), C(cx, cy, 1.2), P(`M ${cx - 2} ${cy - 3.5} L ${cx} ${cy - 1.8} L ${cx + 2} ${cy - 3.5}`, THIN),
    P(`M ${cx - 2} ${cy + 3.5} L ${cx} ${cy + 1.8} L ${cx + 2} ${cy + 3.5}`, THIN)];
}

/**
 * Main spool, vertical (as in the block drawing): positions a (top), 0, b (bottom) of `bw` × `bh`, the port row
 * is the middle one at (x0, y0) – P (left, upper), T (left, lower), LS (left, middle), A (right, upper),
 * B (right, lower). `pos` 0 = a, 1 = neutral, 2 = b (simulation shifts the body).
 */
function spoolV(x0, y0, bw, bh, pos = 1) {
  const g = [];
  const dy = (1 - pos) * bh;
  const yP = bh * 0.25, yT = bh * 0.75, yL = bh * 0.5;
  const box = (i, kind) => {
    const y = y0 + (i - 1) * bh + dy;
    g.push(R(x0, y, bw, bh, WHITE));
    if (kind === 'a') {
      g.push(...arrow([x0, y + yP], [x0 + bw, y + yP], 1.1), ...arrow([x0 + bw, y + yT], [x0, y + yT], 1.1), ...throttle(x0 + bw * 0.55, y + yP).map((s) => ({ ...s, w: 0.15 })));
      g.push(L(x0 + bw * 0.35, y + yP, x0 + bw * 0.35, y + yL), L(x0, y + yL, x0 + bw * 0.35, y + yL), C(x0 + bw * 0.35, y + yP, 0.45, INK));
    } else if (kind === 'b') {
      g.push(...arrow([x0, y + yP], [x0 + bw, y + yT], 1.1), ...arrow([x0 + bw, y + yP], [x0, y + yT], 1.1));
      g.push(L(x0, y + yL, x0 + bw * 0.25, y + yL), C(x0 + bw * 0.25, y + yL, 0.45, INK));
    } else {
      for (const [x, yy, s] of [[x0, yP, 1], [x0, yT, 1], [x0 + bw, yP, -1], [x0 + bw, yT, -1]]) g.push(L(x, y + yy, x + s * 2, y + yy), L(x + s * 2, y + yy - 1.2, x + s * 2, y + yy + 1.2));
      g.push(P(`M ${x0} ${y + yL} L ${x0 + bw * 0.3} ${y + yL} L ${x0 + bw * 0.3} ${y + yT}`, THIN));
    }
  };
  box(0, 'a'); box(1, '0'); box(2, 'b');
  // springs and pilot chambers at both ends, manual lever at the bottom
  const top = y0 - bh + dy, bot = y0 + 2 * bh + dy, cx = x0 + bw / 2;
  g.push(zig(cx, top, cx, top - 5, 4), P(`M ${cx - 2.5} ${top - 5} L ${cx + 2.5} ${top - 5} L ${cx} ${top - 7.5} Z`, INK), L(cx - 3, top - 5, cx + 3, top - 5));
  g.push(zig(cx, bot, cx, bot + 5, 4), P(`M ${cx - 2.5} ${bot + 5} L ${cx + 2.5} ${bot + 5} L ${cx} ${bot + 7.5} Z`, INK), L(cx - 3, bot + 5, cx + 3, bot + 5));
  g.push(L(x0, bot + 2, x0 - 4, bot + 2), L(x0 - 4, bot + 2, x0 - 7, bot + 5), C(x0 - 7.5, bot + 5.6, 0.7, WHITE));
  return { g, yP: y0 + yP, yT: y0 + yT, yL: y0 + yL, top: top - 7.5 - dy, bot: bot + 7.5 - dy };
}

// ---------- standalone parts ----------

const FOLDER = 'Hydraulica/Stuurblok LS (M4)';
const PARTS = `${FOLDER}/Onderdelen`;
const part = (id, name, kind, graphics, pins, o = {}) => ({
  id: `flu/h/m4-${id}`, name, folder: o.folder || PARTS, prefix: o.prefix || 'V', role: o.role || 'device',
  graphics, pins, fluid: { kind, medium: 'hydr' }, tagAt: o.tagAt || { x: -6, y: -6, anchor: 'end' },
  props: { medium: 'hydr', ...(o.props || {}) }, fields: o.fields, build: o.build, pinText: o.pinText ?? true,
});
const SOLF = { k: 'sol', label: 'Proportionele magneet (naam van de spoel op een elektrisch blad, bv. -7Y1)', list: 'coils' };
const BAR = (k, label) => ({ k, label: `${label} (bar)`, type: 'number' });

/** Rotates a graphic a quarter turn: (x, y) -> (y + ox, oy - x); arcs keep their sweep (a rotation). */
function rotG(g, ox, oy) {
  const f = (x, y) => [r2(y + ox), r2(oy - x)];
  if (g.t === 'line') { const [a, b] = f(g.x1, g.y1), [c, d] = f(g.x2, g.y2); return { ...g, x1: a, y1: b, x2: c, y2: d }; }
  if (g.t === 'rect') { const [a, b] = f(g.x + g.w, g.y); return { ...g, x: a, y: b, w: g.h, h: g.w }; }
  if (g.t === 'circle') { const [a, b] = f(g.cx, g.cy); return { ...g, cx: a, cy: b }; }
  if (g.t === 'path') {
    const d = g.d.split(/(?=[MLAZ])/).map((part) => {
      const c = part[0], n = part.slice(1).trim().split(/[\s,]+/).filter(Boolean).map(Number);
      if (c === 'Z') return 'Z';
      if (c === 'A') { const [x, y] = f(n[5], n[6]); return `A ${n[0]} ${n[1]} ${n[2]} ${n[3]} ${n[4]} ${x} ${y}`; }
      return `${c} ${f(n[0], n[1]).join(' ')}`;
    }).join(' ');
    return { ...g, d };
  }
  return g;
}

/** Main spool, standalone (horizontal like the other valves): 4/3, hydraulically piloted, spring centred, manual lever. */
function buildSpool(props) {
  const pos = Math.max(0, Math.min(2, props.__pos ?? 1));
  // the vertical drawing turned a quarter: a (left) – neutral – b (right)
  const { g } = spoolV(0, 0, 10, 10, pos);
  return {
    graphics: [...g.map((s) => rotG(s, 12.5, 10)), L(15, -5, 15, 0), L(20, -5, 20, 0), L(15, 10, 15, 15), L(17.5, 10, 17.5, 15), L(20, 10, 20, 15),
      L(-10, 5, -5 + (1 - pos) * 10, 5, D), L(40 + (1 - pos) * 10, 5, 45, 5, D)],
    pins: [pin('A', 15, -5), pin('B', 20, -5), pin('P', 15, 15), pin('LS', 17.5, 15), pin('R', 20, 15, 'T'), pin('XL', -10, 5, 'a'), pin('XR', 45, 5, 'b')],
    tagAt: { x: -10, y: -4, anchor: 'end' },
  };
}

export const M4_PARTS = [
  part('spool', 'Hoofdschuif 4/3 proportioneel, hydraulisch voorgestuurd, met handbediening (LS)', 'valve', [], [],
    { build: buildSpool, props: { type: '4/3', left: 'pilot', right: 'pilot', centre: 'closed' } }),
  part('prvp', 'Proportioneel drukreduceerventiel (voorsturing, elektrisch)', 'prvp', prvpG(0, 0), [pin('P', 0, -10), pin('A', 0, 10), pin('T', 5, 10)],
    { props: { sol: '', p: 25 }, fields: [SOLF, BAR('p', 'Stuurdruk bij volle sturing')] }),
  part('prv', 'Drukreduceerventiel 2-weg (stuurolieverzorging)', 'regulator', prv2G(0, 0), [pin('1', 0, -10, 'P'), pin('2', 0, 10, 'X')],
    { props: { p: 35 }, fields: [BAR('p', 'Ingestelde stuurdruk')] }),
  part('relief', 'Drukbegrenzer (stuurolie)', 'relief', reliefG(0, 0), [pin('P', 0, -10), pin('T', 0, 10)], { props: { p: 40 }, fields: [BAR('p', 'Openingsdruk')] }),
  part('portrelief', 'Secundaire drukbegrenzer met naaszuigfunctie (poort A / B)', 'relief', portReliefG(0, 0), [pin('P', 0, -10, 'A'), pin('T', 0, 10)],
    { props: { p: 230 }, fields: [BAR('p', 'Openingsdruk (vast ingesteld)')] }),
  part('comp', 'Individuele drukweegschaal (2-weg, LS-gestuurd)', 'pass', compG(0, 0), [pin('1', 0, -15, 'P'), pin('2', 0, 10, 'P′'), pin('X', -10, 3, 'LS')],
    { props: { spring: 13 }, fields: [BAR('spring', 'Veer (drukverschil)')] }),
  part('shuttle', 'LS-wisselventiel', 'or', shuttleG(0, 0), [pin('X', 0, -10, ''), pin('Y', 0, 10, ''), pin('A', -10, 0, 'LS')], { prefix: 'V' }),
  part('filter', 'Stuuroliefilter', 'pass', filterG(0, 0), [pin('1', 0, -5, ''), pin('2', 0, 5, '')], { role: 'graphic', pinText: false }),
  part('plug', 'Blindplug (optie niet uitgevoerd)', 'none', plugG(0, 0), [pin('1', 0, -5, ''), pin('2', 0, 5, '')], { role: 'graphic', pinText: false }),
  part('mport', 'Meetaansluiting (M)', 'none', [L(0, 0, 0, -3), ...portStub(0, -3, '{name}')], [pin('1', 0, 0, '')], { role: 'graphic', pinText: false, props: { name: 'M' }, fields: [{ k: 'name', label: 'Naam (bv. MP, Ma, Mb)' }] }),
];

// ---------- complete block elements ----------

/** Through channels at these heights (top of the element = 0); T at the bottom. */
const Y = { P: 10, X: 15, Y: 20, LS: 25, T: 115 };
const HGT = 125;
const through = (w, x0 = 0) => [L(x0, Y.P, w, Y.P), L(x0, Y.X, w, Y.X), L(x0, Y.Y, w, Y.Y, D), L(x0, Y.LS, w, Y.LS, D), L(x0, Y.T, w, Y.T)];
const sidePins = (x, sfx) => ['P', 'X', 'Y', 'LS', 'T'].map((k) => pin(k + sfx, x, Y[k], k));

/** Inlet element (INLET L): pump port P, tank T, LS to the pump, gauge MP; pilot oil supply X with filter. */
function buildInlet(props) {
  const W = 35;
  const g = [
    R(0, -3, W, HGT + 3, { dash: true, w: 0.13 }), ...through(W, 0),
    L(-5, Y.P, 0, Y.P), L(-5, Y.T, 0, Y.T), L(-5, Y.LS, 0, Y.LS, D), L(-5, Y.Y, 0, Y.Y, D), L(-5, 60, 8, 60), C(8, 60, 0.6, INK),
    // P → plug → T (no main relief)
    L(8, Y.P, 8, Y.T), C(8, Y.P, 0.6, INK), C(8, Y.T, 0.6, INK), ...plugG(8, 100),
    // pilot oil: P → filter → reducing valve → X; relief X → Y
    L(20, Y.P, 20, 62), C(20, Y.P, 0.6, INK), ...filterG(20, 65), L(20, 68, 20, 76), ...prv2G(20, 80), L(20, 84, 20, 90), C(20, 90, 0.6, INK),
    L(20, 90, 28, 90), L(28, 90, 28, Y.X), C(28, Y.X, 0.6, INK), L(20, 90, 20, 95), ...reliefG(20, 99), L(20, 103, 20, 108), L(20, 108, 14, 108, D), L(14, 108, 14, Y.Y, D), C(14, Y.Y, 0.6, INK),
    T(W / 2, -11, 'INLAAT', 2.4), T(W - 2, 96, `${props.px ?? 35} bar`, 1.8, 'end'),
  ];
  return {
    graphics: g,
    pins: [pin('P', -5, Y.P), pin('T', -5, Y.T), pin('LS', -5, Y.LS), pin('Y', -5, Y.Y), pin('MP', -5, 60), ...sidePins(W, 'r')],
    tagAt: { x: 0, y: -14.5, anchor: 'start' },
  };
}

/** Valve section: electrohydraulic proportional (pilot valves a / b), compensator, LS shuttle, port reliefs. */
function buildSection(props) {
  const W = 60;
  const sp = spoolV(32, 72, 9, 11, props.__pos ?? 1);
  const g = [
    R(0, -3, W, HGT + 3, { dash: true, w: 0.13 }), ...through(W, 0),
    // pilot valve a (top pilot) and b (bottom pilot), each with a filter on X
    L(13, Y.X, 13, 27), C(13, Y.X, 0.6, INK), ...filterG(13, 30), L(13, 33, 13, 48), ...prvpG(13, 52, 'a'), P(`M 13 56 L 13 60 L 28 60 L 28 ${sp.top - 2} L ${32 + 4.5} ${sp.top - 2} L ${32 + 4.5} ${sp.top}`, { ...D, w: 0.25 }),
    L(25, Y.X, 25, 32), C(25, Y.X, 0.6, INK), ...filterG(25, 35), L(25, 38, 25, 41), ...prvpG(25, 45, 'b'), P(`M 25 49 L 25 51 L 48 51 L 48 ${sp.bot + 2} L ${32 + 4.5} ${sp.bot + 2} L ${32 + 4.5} ${sp.bot}`, { ...D, w: 0.25 }),
    T(13, 63.5, props.solA || '', 1.8), T(31, 47, props.solB || '', 1.8, 'start'),
    // measuring ports of the pilot pressures
    L(4, -5, 4, 58, { ...D, w: 0.2 }), L(4, 58, 13, 58, { ...D, w: 0.2 }), C(13, 58, 0.5, INK), ...portStub(4, -5, 'Ma'),
    L(20, -5, 20, 50, { ...D, w: 0.2 }), L(20, 50, 25, 50, { ...D, w: 0.2 }), C(25, 50, 0.5, INK), ...portStub(20, -5, 'Mb'),
    // supply: P → compensator → spool P; spool T → T
    L(7, Y.P, 7, 86), C(7, Y.P, 0.6, INK), ...compG(7, 96), L(7, 102, 7, 106), L(7, 106, 24, 106), L(24, 106, 24, sp.yP), L(24, sp.yP, 32, sp.yP),
    L(32, sp.yT, 27, sp.yT), L(27, sp.yT, 27, Y.T), C(27, Y.T, 0.6, INK),
    // LS: spool → shuttle (with the LS channel) → compensator
    L(32, sp.yL, 18, sp.yL, { ...D, w: 0.25 }), L(18, sp.yL, 18, 72, { ...D, w: 0.25 }), ...shuttleG(18, 67), L(18, 62, 18, Y.LS, { ...D, w: 0.25 }), C(18, Y.LS, 0.6, INK),
    L(15.5, 67, 2, 67, { ...D, w: 0.25 }), L(2, 67, 2, 98, { ...D, w: 0.25 }), L(2, 98, 4, 98, { ...D, w: 0.25 }),
    // work ports with their reliefs (anti-cavitation) to T
    L(41, sp.yP, 45, sp.yP), L(45, sp.yP, 45, -5), C(45, sp.yP, 0.6, INK), L(45, sp.yP, 45, 89), ...portReliefG(45, 93), L(45, 97, 45, Y.T), C(45, Y.T, 0.6, INK),
    L(41, sp.yT, 55, sp.yT), L(55, sp.yT, 55, -5), C(55, sp.yT, 0.6, INK), L(55, sp.yT, 55, 99), ...portReliefG(55, 103), L(55, 107, 55, Y.T), C(55, Y.T, 0.6, INK),
    // LS relief options (not fitted)
    ...plugG(50, 32), ...plugG(38, 40),
    ...sp.g,
    T(W / 2, -11, props.desc || '', 2.2), T(45.8, -3.2, 'A', 2, 'start'), T(55.8, -3.2, 'B', 2, 'start'),
    T(W - 1.5, 121, `${props.reliefA ?? 230} / ${props.reliefB ?? 230} bar`, 1.6, 'end'),
  ];
  return {
    graphics: g,
    pins: [...sidePins(0, 'l'), ...sidePins(W, 'r'), pin('A', 45, -5), pin('B', 55, -5), pin('Ma', 4, -5), pin('Mb', 20, -5)],
    tagAt: { x: 1, y: -11, anchor: 'start' },
  };
}

/** End plate (ENDPLATE L): closes P, X, Y; LS drains to T; extra tank port T1. */
function buildEnd() {
  const W = 20;
  return {
    graphics: [
      R(0, -3, W, HGT + 3, { dash: true, w: 0.13 }),
      ...['P', 'X'].flatMap((k) => [L(0, Y[k], 8, Y[k]), L(8, Y[k] - 1.2, 8, Y[k] + 1.2)]), L(0, Y.Y, 8, Y.Y, D), L(8, Y.Y - 1.2, 8, Y.Y + 1.2),
      L(0, Y.LS, 14, Y.LS, D), L(14, Y.LS, 14, Y.T, D), C(14, Y.T, 0.6, INK),
      P('M 12.7 68.8 A 2 2 0 0 0 15.3 68.8', THIN), P('M 12.7 71.2 A 2 2 0 0 1 15.3 71.2', THIN),
      L(0, Y.T, W + 5, Y.T), T(W / 2, -11, 'EINDPLAAT', 2.2), T(W + 3, Y.T - 2, 'T1', 2, 'middle'),
    ],
    pins: [...sidePins(0, 'l'), pin('T1', W + 5, Y.T)],
    tagAt: { x: 0, y: -14.5, anchor: 'start' },
  };
}

const block = (id, name, kind, build, o = {}) => ({
  id: `flu/h/m4-${id}`, name, folder: FOLDER, prefix: o.prefix || 'V', role: 'device', graphics: [], pins: [],
  fluid: { kind, medium: 'hydr' }, build, props: { medium: 'hydr', ...(o.props || {}) }, fields: o.fields, pinText: false,
});

export const M4_BLOCKS = [
  block('inlet', 'Inlaatelement (LS, stuurolieverzorging X)', 'm4inlet', buildInlet, { props: { px: 35 }, fields: [BAR('px', 'Stuurdruk X')] }),
  block('section', 'Ventielsectie elektrohydraulisch proportioneel (LS, drukweegschaal, poortbeveiliging)', 'm4sec', buildSection, {
    props: { solA: '', solB: '', desc: '', reliefA: 230, reliefB: 230, spring: 13, qA: 61, qB: 98 },
    fields: [
      { k: 'solA', label: 'Magneet a: P → A (spoel op een elektrisch blad, bv. -7Y1)', list: 'coils' },
      { k: 'solB', label: 'Magneet b: P → B (spoel, bv. -7Y2)', list: 'coils' },
      { k: 'desc', label: 'Omschrijving (bv. Sectie 1 – heffen)' },
      BAR('reliefA', 'Poortbeveiliging A'), BAR('reliefB', 'Poortbeveiliging B'),
      BAR('spring', 'Drukweegschaal (veer)'),
      { k: 'qA', label: 'Max. debiet A (l/min)', type: 'number' }, { k: 'qB', label: 'Max. debiet B (l/min)', type: 'number' },
    ],
  }),
  block('end', 'Eindplaat (LS naar tank, T1)', 'm4end', buildEnd),
];

export const M4 = [...M4_PARTS, ...M4_BLOCKS];
