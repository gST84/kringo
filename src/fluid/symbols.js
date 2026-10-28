// Fluid power symbols (ISO 1219-1) for pneumatic and hydraulic circuit diagrams.
// Valves are parametric: type (2/2 … 5/3), actuation per side, middle position. Ports sit on the rest
// position; in the simulation the valve body shifts (`__pos`) like in FluidSIM, the ports stay put.
// Every symbol carries `fluid: {kind, medium}` for the simulation (src/sim/engine.js).

const L = (x1, y1, x2, y2, o) => ({ t: 'line', x1, y1, x2, y2, ...o });
const R = (x, y, w, h, o) => ({ t: 'rect', x, y, w, h, ...o });
const C = (cx, cy, r, o) => ({ t: 'circle', cx, cy, r, ...o });
const P = (d, o) => ({ t: 'path', d, ...o });
const T = (x, y, text, size = 2.2, anchor = 'middle') => ({ t: 'text', x, y, text, size, anchor });
const pin = (id, x, y, name = '') => ({ id, x, y, name });
const INK = { fill: 'ink' };
const WHITE = { fill: 'white' };
const D = { dash: true };

const W = 20; // width of one valve position (box), mm
const H = 10;

/** Port positions in a box (x from the left edge of the box); top ports work, bottom ports supply / exhaust. */
const PORTS = {
  '2/2': { top: { A: 10 }, bottom: { P: 10 } },
  '3/2': { top: { A: 5 }, bottom: { P: 5, R: 15 } },
  '3/2no': { top: { A: 5 }, bottom: { P: 5, R: 15 } },
  '4/2': { top: { A: 5, B: 15 }, bottom: { P: 5, R: 15 } },
  '5/2': { top: { A: 5, B: 15 }, bottom: { S: 5, P: 10, R: 15 } },
  '4/3': { top: { A: 5, B: 15 }, bottom: { P: 5, R: 15 } },
  '5/3': { top: { A: 5, B: 15 }, bottom: { S: 5, P: 10, R: 15 } },
};

/** Middle positions of 3-position valves: flow paths [from, to]; ports not named are blocked. */
const CENTRES = {
  closed: [],
  exhaust: [['A', 'S'], ['B', 'R']], // 5/3 vented: both work ports to exhaust
  pressure: [['P', 'A'], ['P', 'B']],
  float: [['A', 'R'], ['B', 'R']], // 4/3 floating: A and B to tank, P blocked
  tandem: [['P', 'R']], // 4/3 tandem: pump to tank, A and B blocked
  open: [['P', 'A'], ['P', 'B'], ['A', 'R'], ['B', 'R']],
};

/** Flow paths per position, left to right. */
function positions(type, centre) {
  const fourFive = type === '5/2' || type === '5/3';
  const left = { '2/2': [['P', 'A']], '3/2': [['P', 'A']], '3/2no': [['A', 'R']], '4/2': [['P', 'A'], ['B', 'R']], '5/2': [['P', 'A'], ['B', 'R']] };
  const right = { '2/2': [], '3/2': [['A', 'R']], '3/2no': [['P', 'A']], '4/2': [['P', 'B'], ['A', 'R']], '5/2': [['P', 'B'], ['A', 'S']] };
  if (type === '4/3' || type === '5/3') {
    const c = (CENTRES[centre] || []).map(([a, b]) => [a, fourFive && b === 'R' && a === 'A' ? 'S' : b]);
    return [[['P', 'A'], ['B', 'R']], c, fourFive ? [['P', 'B'], ['A', 'S']] : [['P', 'B'], ['A', 'R']]];
  }
  return [left[type], right[type]];
}

/** Rest position: the middle one, else the side with the spring (default right). */
export function restPosition(props) {
  const n = String(props.type).endsWith('/3') ? 3 : 2;
  if (n === 3) return 1;
  return props.left === 'spring' && props.right !== 'spring' ? 0 : 1;
}

export const valvePaths = (props) => positions(props.type, props.centre || 'closed');
export const valvePorts = (props) => PORTS[props.type] || PORTS['5/2'];

const PNEU_NAMES = { P: '1', A: '4', B: '2', R: '3', S: '5', XL: '14', XR: '12' };
const HYDR_NAMES = { P: 'P', A: 'A', B: 'B', R: 'T', S: 'T', XL: 'X', XR: 'Y' };
const portName = (medium, type, id) => {
  if (medium === 'hydr') return HYDR_NAMES[id];
  if ((type === '3/2' || type === '3/2no' || type === '2/2') && id === 'A') return '2';
  if ((type === '3/2' || type === '3/2no' || type === '2/2') && id === 'XL') return '12';
  if ((type === '3/2' || type === '3/2no' || type === '2/2') && id === 'XR') return '10';
  return PNEU_NAMES[id];
};

/** Arrow from a to b (filled head at b). */
function arrow(a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, s = 1.6, w = 0.8;
  const bx = b[0] - ux * s, by = b[1] - uy * s;
  return [L(a[0], a[1], r2(bx), r2(by)), P(`M ${r2(b[0])} ${r2(b[1])} L ${r2(bx - uy * w)} ${r2(by + ux * w)} L ${r2(bx + uy * w)} ${r2(by - ux * w)} Z`, INK)];
}

/** One valve position at x0. */
function boxGraphics(x0, paths, ports) {
  const g = [R(x0, 0, W, H, WHITE)];
  const at = (id) => (id in ports.top ? [x0 + ports.top[id], 0] : [x0 + ports.bottom[id], H]);
  const used = new Set();
  for (const [a, b] of paths) {
    used.add(a); used.add(b);
    const pa = at(a), pb = at(b);
    if (pa[1] !== pb[1]) g.push(...arrow(pa, pb));
    else {
      // both on the same side: a bridge
      const y = pa[1] === H ? H - 4 : 4;
      g.push(P(`M ${pa[0]} ${pa[1]} L ${pa[0]} ${y} L ${pb[0]} ${y} L ${pb[0]} ${pb[1]}`));
    }
  }
  for (const [id, x] of Object.entries(ports.top)) if (!used.has(id)) g.push(L(x0 + x, 0, x0 + x, 2.5), L(x0 + x - 1.5, 2.5, x0 + x + 1.5, 2.5));
  for (const [id, x] of Object.entries(ports.bottom)) if (!used.has(id)) g.push(L(x0 + x, H, x0 + x, H - 2.5), L(x0 + x - 1.5, H - 2.5, x0 + x + 1.5, H - 2.5));
  return g;
}

/** Actuator against the valve edge at x = 0, drawn towards negative x (mirrored for the right side). */
function actuator(kind, label, medium) {
  switch (kind) {
    case 'spring': return { g: [P('M 0 5 L -1 2.5 L -2.5 7.5 L -4 2.5 L -5.5 7.5 L -7 2.5 L -8 5')], w: 8 };
    case 'hand': return { g: [L(0, 5, -5, 5), L(-5, 2.5, -5, 7.5)], w: 5 };
    case 'button': return { g: [L(0, 5, -4, 5), P('M -4 2.5 A 2.5 2.5 0 0 0 -4 7.5')], w: 6.5 };
    case 'lever': return { g: [L(0, 5, -3, 5), L(-3, 5, -6, 1), C(-6, 1, 0.6, INK)], w: 6.5 };
    case 'roller': return { g: [L(0, 5, -3.5, 5), C(-5, 5, 1.5, WHITE)], w: 6.5 };
    case 'pilot': return { g: [P('M 0 5 L -2.5 3.5 L -2.5 6.5 Z', medium === 'hydr' ? INK : WHITE)], w: 2.5, pilot: true };
    case 'solenoid': return { g: [L(0, 5, -1, 5), R(-5, 2, 4, 6), L(-5, 8, -1, 2), T(-3, -1.6, label || '', 2.2)], w: 5 };
    default: return { g: [], w: 0 };
  }
}

/** Maps the x coordinates of an absolute path (M, L, A, Z only); `flip` mirrors the arc direction. */
const mapPath = (d, fx, flip) => d.split(/(?=[MLAZ])/).map((s) => {
  const c = s[0], n = s.slice(1).trim().split(/[\s,]+/).filter(Boolean).map(Number);
  if (c === 'A') return `A ${n[0]} ${n[1]} ${n[2]} ${n[3]} ${flip ? 1 - n[4] : n[4]} ${fx(n[5])} ${n[6]}`;
  if (c === 'Z') return 'Z';
  return `${c} ${fx(n[0])} ${n[1]}`;
}).join(' ');
const r2 = (v) => Math.round(v * 100) / 100;
const mirrorG = (g) => {
  if (g.t === 'line') return { ...g, x1: -g.x1, x2: -g.x2 };
  if (g.t === 'rect') return { ...g, x: -g.x - g.w };
  if (g.t === 'circle') return { ...g, cx: -g.cx };
  if (g.t === 'text') return { ...g, x: -g.x };
  if (g.t === 'path') return { ...g, d: mapPath(g.d, (x) => -x, true) };
  return g;
};
const shiftG = (g, dx) => {
  if (!dx) return g;
  if (g.t === 'line') return { ...g, x1: r2(g.x1 + dx), x2: r2(g.x2 + dx) };
  if (g.t === 'rect') return { ...g, x: r2(g.x + dx) };
  if (g.t === 'circle') return { ...g, cx: r2(g.cx + dx) };
  if (g.t === 'text') return { ...g, x: r2(g.x + dx) };
  if (g.t === 'path') return { ...g, d: mapPath(g.d, (x) => r2(x + dx), false) };
  return g;
};

function buildValve(props) {
  const type = PORTS[props.type] ? props.type : '5/2';
  const ports = PORTS[type];
  const paths = positions(type, props.centre || 'closed');
  const n = paths.length;
  const rest = restPosition({ ...props, type });
  const pos = Math.max(0, Math.min(n - 1, props.__pos ?? rest));
  const dx = (rest - pos) * W; // body shift in the simulation
  const medium = props.medium || 'pneu';
  const body = [];
  const xl = -rest * W, xr = (n - rest) * W;
  paths.forEach((p, i) => body.push(...boxGraphics((i - rest) * W, p, ports)));
  const pins = [];
  const leads = [];
  for (const [id, x] of Object.entries(ports.top)) { pins.push(pin(id, x, -5, portName(medium, type, id))); leads.push(L(x, -5, x, 0)); }
  for (const [id, x] of Object.entries(ports.bottom)) { pins.push(pin(id, x, H + 5, portName(medium, type, id))); leads.push(L(x, H, x, H + 5)); }
  const side = (kind, label, sign, edge) => {
    const a = actuator(kind, label, medium);
    let g = a.g;
    let w = a.w;
    // spring centring of 3-position valves: a spring outside the actuator
    if (n === 3 && props.centring !== false && kind !== 'spring') {
      g = [...g, ...actuator('spring').g.map((s) => shiftG(s, -w))];
      w += 8;
    }
    const placed = g.map((s) => shiftG(sign < 0 ? mirrorG(s) : s, edge));
    body.push(...placed);
    if (a.pilot) {
      const id = sign > 0 ? 'XL' : 'XR';
      const px = edge - sign * 10 - sign * Math.ceil(Math.max(0, w - 2.5) / 5) * 5;
      pins.push(pin(id, px, 5, portName(medium, type, id)));
      return { id, px, tip: edge - sign * 2.5 };
    }
    return null;
  };
  const pl = side(props.left || 'none', props.solL, 1, xl);
  const pr = side(props.right || 'none', props.solR, -1, xr);
  const shifted = body.map((g) => shiftG(g, dx));
  for (const p of [pl, pr]) if (p) leads.push(L(p.px, 5, p.tip + dx, 5, D));
  const tagX = Math.min(xl - 2, ...pins.map((p) => p.x - 2));
  return { graphics: [...leads, ...shifted], pins, tagAt: { x: tagX + dx, y: -4, anchor: 'end' } };
}

const ACT = [['none', 'Geen'], ['spring', 'Veer'], ['hand', 'Handbediening'], ['button', 'Drukknop'], ['lever', 'Hendel'], ['roller', 'Rol (cilindermarkering)'],
  ['pilot', 'Pneumatisch / hydraulisch gestuurd'], ['solenoid', 'Elektromagneet']];
const VALVE_FIELDS = [
  { k: 'type', label: 'Type', options: [['2/2', '2/2'], ['3/2', '3/2 (in rust gesloten)'], ['3/2no', '3/2 (in rust open)'], ['4/2', '4/2'], ['5/2', '5/2'], ['4/3', '4/3'], ['5/3', '5/3']] },
  { k: 'left', label: 'Bediening links', options: ACT },
  { k: 'right', label: 'Bediening rechts', options: ACT },
  { k: 'centre', label: 'Middenstand (3 standen)', options: [['closed', 'Gesloten'], ['exhaust', 'Ontlucht (A en B naar afvoer)'], ['pressure', 'Belucht (P naar A en B)'], ['float', 'Vrijloop (A en B naar tank)'], ['tandem', 'Tandem (P naar tank)'], ['open', 'Open']] },
  { k: 'solL', label: 'Spoel links (naam, bv. Y1)', list: 'coils' },
  { k: 'solR', label: 'Spoel rechts (naam, bv. Y2)', list: 'coils' },
  { k: 'mark', label: 'Rol bediend door markering (bv. 1S1)', list: 'marks' },
];

const valve = (medium, id, name, props) => ({
  id: `flu/${medium === 'hydr' ? 'h' : 'p'}/${id}`, name, folder: `${medium === 'hydr' ? 'Hydraulica' : 'Pneumatica'}/Ventielen`, prefix: 'V', role: 'device',
  props: { medium, centre: 'closed', solL: '', solR: '', mark: '', ...props }, build: buildValve, fields: VALVE_FIELDS, pinText: true,
  fluid: { kind: 'valve', medium }, graphics: [], pins: [],
});

// ---------- cylinders and motors ----------

const ROD = 33; // drawn stroke of the piston, mm

export function parseMarks(s) {
  return String(s || '').split(/[;,\n]/).map((x) => x.trim()).filter(Boolean).map((x) => {
    const m = /^(.+?)\s*[=@:]\s*(-?\d+(?:[.,]\d+)?)\s*(%?)$/.exec(x);
    return m ? { name: m[1].trim(), at: parseFloat(m[2].replace(',', '.')), pct: !!m[3] } : null;
  }).filter(Boolean);
}

function buildCylinder(props) {
  const pos = Math.max(0, Math.min(1, props.__x ?? 0));
  const single = props.acting === 'single';
  const xp = 2 + ROD * pos;
  const g = [R(0, 0, 40, H, WHITE), R(xp, 0.5, 2, H - 1, INK), L(xp + 2, 5, xp + 43, 5, { w: 0.9 })];
  if (single) g.push(P(`M ${xp + 2} 5 ${[1, 2, 3, 4, 5, 6].map((i) => `L ${xp + 2 + ((38 - xp - 2) * i) / 7} ${i % 2 ? 1.5 : 8.5}`).join(' ')} L 40 5`, { w: 0.2 }));
  const stroke = +props.stroke || 100;
  for (const m of parseMarks(props.marks)) {
    const f = Math.max(0, Math.min(1, m.pct ? m.at / 100 : m.at / stroke));
    const x = Math.round((45 + ROD * f) * 100) / 100;
    g.push(L(x, -1, x, -3.5, { w: 0.2 }), T(x, -5.2, m.name, 2));
  }
  const pins = [pin('A', 5, H + 5)];
  g.push(L(5, H, 5, H + 5));
  if (!single) { pins.push(pin('B', 35, H + 5)); g.push(L(35, H, 35, H + 5)); }
  return { graphics: g, pins, tagAt: { x: -2, y: 5, anchor: 'end' } };
}

const CYL_FIELDS = [
  { k: 'acting', label: 'Uitvoering', options: [['double', 'Dubbelwerkend'], ['single', 'Enkelwerkend met veer']] },
  { k: 'stroke', label: 'Slag (mm)', type: 'number' },
  { k: 'time', label: 'Tijd voor de volle slag (s)', type: 'number' },
  { k: 'marks', label: 'Markeringen voor eindschakelaars (naam=mm, bv. 1S1=0; 1S2=100)' },
];
const cylinder = (medium, id, name, props) => ({
  id: `flu/${medium === 'hydr' ? 'h' : 'p'}/${id}`, name, folder: `${medium === 'hydr' ? 'Hydraulica' : 'Pneumatica'}/Cilinders en motoren`, prefix: 'A', role: 'device',
  props: { stroke: 100, time: 1, marks: '', ...props }, build: buildCylinder, fields: CYL_FIELDS, fluid: { kind: 'cylinder', medium }, graphics: [], pins: [],
});

function buildMotor(props) {
  const a = ((props.__a || 0) * Math.PI) / 180;
  const tri = props.medium === 'hydr' ? INK : WHITE;
  const r = r2;
  return {
    graphics: [L(0, 0, 0, 5), L(0, 15, 0, 20), C(0, 10, 5, WHITE), P('M 0 5 L -1.5 7.6 L 1.5 7.6 Z', tri), L(5, 10, 9, 10, { w: 0.9 }),
      L(r(Math.cos(a) * 3), r(10 + Math.sin(a) * 3), r(-Math.cos(a) * 3), r(10 - Math.sin(a) * 3), { w: 0.25, dash: true })],
    pins: [pin('B', 0, 0), pin('A', 0, 20)],
  };
}
const motor = (medium) => ({
  id: `flu/${medium === 'hydr' ? 'h' : 'p'}/motor`, name: medium === 'hydr' ? 'Hydromotor' : 'Luchtmotor', folder: `${medium === 'hydr' ? 'Hydraulica' : 'Pneumatica'}/Cilinders en motoren`,
  prefix: 'M', role: 'device', props: { medium, rpm: 60 }, build: buildMotor, fields: [{ k: 'rpm', label: 'Toerental (omw/min)', type: 'number' }],
  fluid: { kind: 'motor', medium }, graphics: [], pins: [], tagAt: { x: -7, y: 10, anchor: 'end' },
});

// ---------- supply, exhaust, line elements ----------

const dev = (medium, id, name, sub, kind, graphics, pins, o = {}) => ({
  id: `flu/${medium === 'hydr' ? 'h' : 'p'}/${id}`, name, folder: `${medium === 'hydr' ? 'Hydraulica' : 'Pneumatica'}/${sub}`,
  prefix: o.prefix || 'Z', role: o.role || 'device', graphics, pins, fluid: { kind, medium }, tagAt: o.tagAt || { x: -6, y: 5, anchor: 'end' },
  props: o.props || {}, fields: o.fields, pinText: false,
});
const PFIELD = [{ k: 'p', label: 'Druk (bar)', type: 'number' }];
const throttleG = (y0) => [P(`M -2.5 ${y0} A 5 5 0 0 0 -2.5 ${y0 + 6}`), P(`M 2.5 ${y0} A 5 5 0 0 1 2.5 ${y0 + 6}`), L(-4, y0 + 6.5, 4, y0 - 0.5, { w: 0.25 }), P(`M 4 ${y0 - 0.5} L 2.4 ${y0 - 0.2} L 3.4 ${y0 + 1} Z`, INK)];

function medium(m) {
  const tri = m === 'hydr' ? INK : WHITE;
  const out = [];
  if (m === 'pneu') {
    out.push(dev(m, 'source', 'Drukluchtbron', 'Voeding', 'source', [L(0, 0, 0, 3), C(0, 6, 3, WHITE), C(0, 6, 0.8, INK)], [pin('1', 0, 0)], { props: { p: 6 }, fields: PFIELD }));
    out.push(dev(m, 'compressor', 'Compressor', 'Voeding', 'source', [L(0, 0, 0, 5), C(0, 10, 5, WHITE), P('M 0 5 L -1.8 8 L 1.8 8 Z', tri)], [pin('1', 0, 0)], { props: { p: 6 }, fields: PFIELD, tagAt: { x: -7, y: 10, anchor: 'end' } }));
    out.push(dev(m, 'frl', 'Onderhoudseenheid (filter-regelaar)', 'Voeding', 'regulator', [L(-10, 5, -5, 5), L(5, 5, 10, 5), R(-5, 0, 10, 10, WHITE), P('M -5 5 L 0 1 L 5 5 L 0 9 Z'), L(-2.5, 5, 2.5, 5, D)], [pin('1', -10, 5), pin('2', 10, 5)], { props: { p: 6 }, fields: [{ k: 'p', label: 'Ingestelde druk (bar)', type: 'number' }] }));
    out.push(dev(m, 'exhaust', 'Ontluchting', 'Leidingelementen', 'exhaust', [L(0, 0, 0, 2.5), P('M -2 2.5 L 2 2.5 L 0 5.5 Z', WHITE)], [pin('1', 0, 0)], { role: 'graphic' }));
    out.push(dev(m, 'silencer', 'Geluiddemper', 'Leidingelementen', 'exhaust', [L(0, 0, 0, 2), P('M 0 2 L -2.5 4.5 L 0 7 L 2.5 4.5 Z', WHITE), L(-1.5, 3.5, 1.5, 3.5, { w: 0.2 }), L(-2, 4.5, 2, 4.5, { w: 0.2 }), L(-1.5, 5.5, 1.5, 5.5, { w: 0.2 })], [pin('1', 0, 0)], { role: 'graphic' }));
    out.push(dev(m, 'pswitch', 'Drukschakelaar (pneumatisch-elektrisch)', 'Sensoren', 'pswitch', [L(0, 10, 0, 6), R(-4, 0, 8, 6, WHITE), P('M -4 3 L -1 3 L 1.5 1 M 1.5 3 L 4 3'), P('M 0 6 L -1.2 4.6 L 1.2 4.6 Z', tri)], [pin('X', 0, 10)], { prefix: 'B', props: { p: 3 }, fields: [{ k: 'p', label: 'Schakeldruk (bar)', type: 'number' }] }));
  } else {
    out.push(dev(m, 'powerpack', 'Hydraulisch aggregaat (pomp + tank)', 'Voeding', 'powerpack',
      [L(0, 0, 0, 5), L(10, 0, 10, 13), C(0, 10, 5, WHITE), P('M 0 5 L -1.8 8 L 1.8 8 Z', tri), L(0, 15, 0, 18), P('M -3 16 L -3 19 L 13 19 L 13 16'), L(10, 13, 10, 18, { w: 0.2 })],
      [pin('P', 0, 0, 'P'), pin('T', 10, 0, 'T')], { props: { p: 60 }, fields: PFIELD, prefix: 'P', tagAt: { x: -7, y: 10, anchor: 'end' } }));
    out.push(dev(m, 'tank', 'Tank', 'Leidingelementen', 'exhaust', [L(0, 0, 0, 5), P('M -4 2 L -4 6 L 4 6 L 4 2')], [pin('1', 0, 0)], { role: 'graphic' }));
    out.push(dev(m, 'relief', 'Drukbegrenzingsventiel', 'Ventielen', 'relief',
      [L(0, 0, 0, 5), L(0, 15, 0, 20), R(-5, 5, 10, 10, WHITE), L(1, 6.5, 1, 13.5), P('M 1 6.5 L 0.2 8.2 L 1.8 8.2 Z', INK), L(-5, 10, -3, 10, D), P('M 5 10 L 6 8 L 7 12 L 8 8 L 9 12 L 10 10'), L(8, 14, 10, 6, { w: 0.25 })],
      [pin('P', 0, 0, 'P'), pin('T', 0, 20, 'T')], { props: { p: 50 }, fields: [{ k: 'p', label: 'Openingsdruk (bar)', type: 'number' }] }));
  }
  out.push(dev(m, 'gauge', 'Manometer', 'Sensoren', 'gauge', [L(0, 0, 0, 3), C(0, 6, 3, WHITE), L(-1.6, 7.6, 1.8, 4.2), P('M 1.8 4.2 L 0.6 4.6 L 1.4 5.4 Z', INK), T(4.5, 6, '{__p}', 2, 'start')], [pin('1', 0, 0)], { role: 'graphic' }));
  out.push(dev(m, 'check', 'Terugslagklep', 'Leidingelementen', 'check', [L(0, 0, 0, 3.5), L(0, 7, 0, 10), C(0, 4, 1.5), P('M -2.5 4 L 0 6.8 L 2.5 4')], [pin('2', 0, 0), pin('1', 0, 10)]));
  out.push(dev(m, 'throttle', 'Smoorventiel (instelbaar)', 'Leidingelementen', 'throttle', [L(0, 0, 0, 2), L(0, 8, 0, 10), ...throttleG(2)], [pin('2', 0, 0), pin('1', 0, 10)],
    { props: { open: 50 }, fields: [{ k: 'open', label: 'Opening (%)', type: 'number' }] }));
  out.push(dev(m, 'flowcheck', 'Smoor-terugslagventiel', 'Leidingelementen', 'flowcheck',
    [L(0, 0, 0, 2), L(0, 18, 0, 20), L(0, 2, 0, 4), L(0, 16, 0, 18), ...throttleG(7), L(0, 4, 7, 4), L(0, 16, 7, 16), L(7, 4, 7, 8), L(7, 12.5, 7, 16), C(7, 9, 1.2), P('M 5 9 L 7 11.3 L 9 9'), R(-6, 1, 16, 18, D)],
    [pin('2', 0, 0), pin('1', 0, 20)], { props: { open: 50 }, fields: [{ k: 'open', label: 'Opening smoring (%) – vrije doorlaat van 1 naar 2', type: 'number' }], tagAt: { x: -8, y: 10, anchor: 'end' } }));
  out.push(dev(m, 'or', m === 'hydr' ? 'Wisselventiel' : 'Wisselventiel (OF)', 'Ventielen', 'or',
    [L(-10, 10, -5, 10), L(5, 10, 10, 10), L(0, 0, 0, 7), R(-5, 7, 10, 6, WHITE), C(0, 10, 1.4), L(-4, 8, -4, 12, { w: 0.2 }), L(4, 8, 4, 12, { w: 0.2 })],
    [pin('A', 0, 0, '2'), pin('X', -10, 10, '1'), pin('Y', 10, 10, '1')], { tagAt: { x: -7, y: 4, anchor: 'end' } }));
  if (m === 'pneu') out.push(dev(m, 'and', 'Tweedrukventiel (EN)', 'Ventielen', 'and',
    [L(-10, 10, -5, 10), L(5, 10, 10, 10), L(0, 0, 0, 7), R(-5, 7, 10, 6, WHITE), R(-3, 8.5, 2, 3), R(1, 8.5, 2, 3), L(-1, 10, 1, 10)],
    [pin('A', 0, 0, '2'), pin('X', -10, 10, '1'), pin('Y', 10, 10, '1')], { tagAt: { x: -7, y: 4, anchor: 'end' } }));
  return out;
}

const PNEU_VALVES = [
  ['v32-btn', '3/2-ventiel drukknop / veer', { type: '3/2', left: 'button', right: 'spring' }],
  ['v32-roll', '3/2-ventiel rol / veer', { type: '3/2', left: 'roller', right: 'spring' }],
  ['v32-pil', '3/2-ventiel pneumatisch / veer', { type: '3/2', left: 'pilot', right: 'spring' }],
  ['v32-sol', '3/2-ventiel magneet / veer', { type: '3/2', left: 'solenoid', right: 'spring', solL: 'Y1' }],
  ['v52-hand', '5/2-ventiel hendel / veer', { type: '5/2', left: 'lever', right: 'spring' }],
  ['v52-pil', '5/2-ventiel pneumatisch / pneumatisch (impuls)', { type: '5/2', left: 'pilot', right: 'pilot' }],
  ['v52-pils', '5/2-ventiel pneumatisch / veer', { type: '5/2', left: 'pilot', right: 'spring' }],
  ['v52-sol', '5/2-ventiel magneet / veer', { type: '5/2', left: 'solenoid', right: 'spring', solL: 'Y1' }],
  ['v52-sol2', '5/2-ventiel magneet / magneet (impuls)', { type: '5/2', left: 'solenoid', right: 'solenoid', solL: 'Y1', solR: 'Y2' }],
  ['v53-sol', '5/3-ventiel magneet / magneet, middenstand gesloten', { type: '5/3', left: 'solenoid', right: 'solenoid', solL: 'Y1', solR: 'Y2' }],
];
const HYDR_VALVES = [
  ['v22-sol', '2/2-ventiel magneet / veer', { type: '2/2', left: 'solenoid', right: 'spring', solL: 'Y1' }],
  ['v42-hand', '4/2-ventiel hendel / veer', { type: '4/2', left: 'lever', right: 'spring' }],
  ['v42-sol', '4/2-ventiel magneet / veer', { type: '4/2', left: 'solenoid', right: 'spring', solL: 'Y1' }],
  ['v43-hand', '4/3-ventiel hendel, middenstand gesloten', { type: '4/3', left: 'lever', right: 'lever' }],
  ['v43-sol', '4/3-ventiel magneet / magneet, middenstand gesloten', { type: '4/3', left: 'solenoid', right: 'solenoid', solL: 'Y1', solR: 'Y2' }],
  ['v43-tandem', '4/3-ventiel magneet / magneet, tandem', { type: '4/3', left: 'solenoid', right: 'solenoid', solL: 'Y1', solR: 'Y2', centre: 'tandem' }],
];

export const FLUID = [
  ...PNEU_VALVES.map(([id, name, p]) => valve('pneu', id, name, p)),
  ...HYDR_VALVES.map(([id, name, p]) => valve('hydr', id, name, p)),
  cylinder('pneu', 'cyl2', 'Dubbelwerkende cilinder', { acting: 'double', marks: '1S1=0; 1S2=100' }),
  cylinder('pneu', 'cyl1', 'Enkelwerkende cilinder (veer)', { acting: 'single', marks: '' }),
  cylinder('hydr', 'cyl2', 'Dubbelwerkende cilinder', { acting: 'double', stroke: 200, time: 2, marks: '1S1=0; 1S2=200' }),
  motor('pneu'), motor('hydr'),
  ...medium('pneu'), ...medium('hydr'),
];
