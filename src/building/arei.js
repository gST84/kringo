// AREI installation symbols (Belgian house installations), used on floor plans and in single-line
// diagrams. Coordinates in paper millimetres around (0, 0); the connection point (pin) is at the
// bottom, which on a plan faces the wall.
//   kind: light | socket | switch | push | dom-in | dom-out | board | pv | inverter | battery | other
//   wall: true when the symbol is mounted against a wall (auto-rotates when placed near one)

const L = (x1, y1, x2, y2, o) => ({ t: 'line', x1, y1, x2, y2, ...o });
const R = (x, y, w, h, o) => ({ t: 'rect', x, y, w, h, ...o });
const C = (cx, cy, r, o) => ({ t: 'circle', cx, cy, r, ...o });
const P = (d, o) => ({ t: 'path', d, ...o });
const T = (x, y, text, size = 1.8, anchor = 'middle') => ({ t: 'text', x, y, text, size, anchor });
const INK = { fill: 'ink' };
const WHITE = { fill: 'white' };

const lampX = (r = 2.5) => [C(0, 0, r, WHITE), L(-r * 0.707, -r * 0.707, r * 0.707, r * 0.707), L(-r * 0.707, r * 0.707, r * 0.707, -r * 0.707)];
/** Belgian ceiling light point: a plain cross. */
const cross = (r = 2.5) => [L(-r, -r, r, r), L(-r, r, r, -r)];
/** Appliance box (single-line diagrams and plans): 7 × 7 mm square, pin at the bottom edge. */
const box = (...inner) => [R(-3.5, -3.5, 7, 7, WHITE), ...inner];
/** Vertical hatching inside a rectangle / circle (electric heating, boiler). */
const hatchRect = (x, y, w, h, step = 0.6) => {
  const g = [];
  for (let xx = x + step; xx < x + w - 0.01; xx += step) g.push(L(+xx.toFixed(2), y, +xx.toFixed(2), y + h, { w: 0.15 }));
  return g;
};
const hatchCircle = (r, step = 0.6) => {
  const g = [];
  for (let xx = -r + step; xx < r - 0.01; xx += step) {
    const hh = Math.sqrt(r * r - xx * xx);
    g.push(L(+xx.toFixed(2), +(-hh).toFixed(2), +xx.toFixed(2), +hh.toFixed(2), { w: 0.15 }));
  }
  return g;
};
/**
 * Socket outlet (Belgian symbols): the line from the wall ends in an arc that opens away from it;
 * with earth a short bar crosses the line against the arc; child protection adds short ends to the
 * arc. Multiple sockets in one box repeat the unit along the line.
 */
const SOCKET_STEP = 4.5;
const socketBase = (n = 1, { earth = true, child = false } = {}) => {
  const g = [L(0, 2.5, 0, -(n - 1) * SOCKET_STEP)];
  for (let k = 0; k < n; k++) {
    const oy = -k * SOCKET_STEP;
    g.push(P(`M -2.5 ${oy - 2.5} A 2.5 2.5 0 0 0 2.5 ${oy - 2.5}`));
    if (earth) g.push(L(-1.7, oy + 0.45, 1.7, oy + 0.45, { w: 0.5 }));
    if (child) g.push(L(-2.5, oy - 2.5, -3.5, oy - 2.5), L(2.5, oy - 2.5, 3.5, oy - 2.5));
  }
  return g;
};
const socketTop = (n = 1) => -(n - 1) * SOCKET_STEP - 1.6;
// Switches: open circle with a lever per direction; one flag = single pole, two flags = double pole.
const lever = (sx, sy, poles = 1) => {
  const g = [L(0.55 * sx, 0.95 * sy, 1.6 * sx, 3.4 * sy), L(1.6 * sx, 3.4 * sy, 2.8 * sx, 3.4 * sy)];
  if (poles === 2) g.push(L(1.35 * sx, 2.85 * sy, 2.55 * sx, 2.85 * sy));
  return g;
};
const switchBase = (poles = 1) => [C(0, 0, 1.1, WHITE), ...lever(1, -1, poles)];

const F = (sub) => 'AREI/' + sub;
const def = (id, name, folder, kind, graphics, o = {}) => ({
  id: 'arei/' + id, name, folder: F(folder), kind, role: 'device', prefix: o.prefix || 'E', arei: true,
  graphics, pins: [{ id: '1', x: 0, y: o.pinY ?? 2.5, name: '' }], tagAt: { x: 0, y: -5, anchor: 'middle' },
  wall: !!o.wall, pinText: false, ...o.extra,
});

const socketDef = (id, name, n, label, opts) =>
  def(id, name, label ? 'Toestellen' : 'Stopcontacten', label ? 'appliance' : 'socket',
    [...socketBase(n, opts), ...(label ? [T(0, socketTop(n), label, 1.4)] : [])], { wall: true, prefix: 'X', extra: { units: n } });
/** half: half width, vhalf: half height (the pin sits on the bottom edge). */
const boxDef = (id, name, graphics, half = 3.5, vhalf = half) =>
  def(id, name, 'Toestellen', 'appliance', graphics, { wall: true, pinY: vhalf, extra: { box: true, half } });

export const AREI = [
  // Verlichting
  def('light', 'Lichtpunt', 'Verlichting', 'light', cross(), { pinY: 2.5 }),
  def('light-wall', 'Wandlichtpunt', 'Verlichting', 'light', [...lampX(2), P('M -2.3 2.3 A 3.25 3.25 0 0 0 2.3 2.3')], { pinY: 3.25, wall: true }),
  def('spot', 'Inbouwspot', 'Verlichting', 'light', [...lampX(1.8), C(0, 0, 0.5, INK)], { pinY: 1.8 }),
  def('tl', 'TL / LED-armatuur', 'Verlichting', 'light', [L(-5, 0, 5, 0, { w: 0.6 }), L(-5, -1.2, -5, 1.2), L(5, -1.2, 5, 1.2)], { pinY: 1.2 }),
  def('light-out', 'Buitenverlichting', 'Verlichting', 'light', [...lampX(), C(0, 0, 3.3)], { pinY: 3.3, wall: true }),
  def('emergency', 'Noodverlichting', 'Verlichting', 'light', [...lampX(), L(-3.4, 3.2, 3.4, 3.2, { w: 0.5 })], { pinY: 3.2 }),

  // Stopcontacten
  socketDef('socket-plain', 'Stopcontact zonder aarding', 1, '', { earth: false }),
  socketDef('socket', 'Stopcontact met aarding', 1),
  socketDef('socket-child', 'Stopcontact met aarding en kinderbescherming', 1, '', { child: true }),
  socketDef('socket2-child', 'Dubbel stopcontact met kinderbescherming', 2, '', { child: true }),
  socketDef('socket3-child', 'Drievoudig stopcontact met kinderbescherming', 3, '', { child: true }),
  socketDef('socket4-child', 'Viervoudig stopcontact met kinderbescherming', 4, '', { child: true }),
  socketDef('socket2', 'Dubbel stopcontact', 2),
  socketDef('socket3', 'Drievoudig stopcontact', 3),
  socketDef('socket4', 'Viervoudig stopcontact', 4),
  def('socket-ext', 'Stopcontact buiten (IP44)', 'Stopcontacten', 'socket', [...socketBase(1), T(0, socketTop(1), 'IP', 1.3)], { wall: true, prefix: 'X', extra: { units: 1 } }),
  def('socket-3p', 'Krachtstopcontact 3F', 'Stopcontacten', 'socket', [...socketBase(1), T(0, socketTop(1), '3F', 1.3)], { wall: true, prefix: 'X', extra: { units: 1 } }),

  // Toestellen (symbolen volgens de AREI-legende)
  boxDef('dryer', 'Droogkast', box(C(-0.9, -1.4, 0.9), C(0.9, -1.4, 0.9), C(0, 1.4, 0.6, INK))),
  boxDef('freezer', 'Diepvriezer', box(T(0, 0.6, '***', 3.6))),
  boxDef('fridge', 'Koelkast', box(T(0, 0.9, '*', 5))),
  boxDef('hob', 'Kookplaten', box(C(1.6, -1.6, 0.6, INK), C(-1.6, 1.6, 0.6, INK), C(1.6, 1.6, 0.6, INK))),
  boxDef('microwave', 'Microgolfoven', box(...[-1.8, 0, 1.8].map((y) => P(`M -1.8 ${y} q 0.9 -1 1.8 0 t 1.8 0`)))),
  boxDef('oven', 'Oven', box(L(-3.5, -1.5, 3.5, -1.5), C(0, 1.1, 0.6, INK))),
  boxDef('dishwasher', 'Vaatwasmachine', box(L(-3.5, -3.5, 3.5, 3.5), L(-3.5, 3.5, 3.5, -3.5), C(0, 0, 1.4, WHITE))),
  boxDef('washer', 'Wasmachine', box(C(0, 0, 2.3), C(0, 0, 0.6, INK))),
  boxDef('fan', 'Ventilator', box(C(-0.9, 0, 0.9), C(0.9, 0, 0.9))),
  boxDef('heater', 'Elektrische verwarming', [R(-5, -2.5, 10, 5, WHITE), ...hatchRect(-5, -2.5, 10, 5)], 5, 2.5),
  boxDef('heater-acc', 'Elektrische verwarming met accumulatie', [R(-5.5, -3, 11, 6, WHITE), R(-4, -1.8, 8, 3.6), ...hatchRect(-4, -1.8, 8, 3.6)], 5.5, 3),
  boxDef('heater-fan', 'Verwarming met accumulatie en ventilator', [R(-7, -2.5, 14, 5, WHITE), R(-6.2, -1.7, 7, 3.4), ...hatchRect(-6.2, -1.7, 7, 3.4), C(2.6, 0, 0.9), C(4.4, 0, 0.9)], 7, 2.5),
  boxDef('boiler', 'Boiler', [C(0, 0, 3, WHITE), ...hatchCircle(3)], 3),
  boxDef('boiler-acc', 'Boiler met accumulatie', [C(0, 0, 3.4, WHITE), C(0, 0, 2.6), ...hatchCircle(2.6)], 3.4),
  socketDef('hood', 'Dampkap', 1, 'DA'),
  socketDef('cooker', 'Kooktoestel / fornuis', 1, 'KO'),
  socketDef('heatpump', 'Warmtepomp', 1, 'WP'),
  def('ev', 'Laadpaal', 'Energie', 'other', [R(-2.5, -3.5, 5, 6), T(0, -0.5, 'EV', 1.8)], { pinY: 2.5, wall: true }),

  // Schakelaars en bediening
  def('switch', 'Enkelpolige schakelaar', 'Schakelaars', 'switch', switchBase(), { wall: true, pinY: 1.1, prefix: 'S', extra: { order: 0 } }),
  def('switch2', 'Dubbelpolige schakelaar', 'Schakelaars', 'switch', switchBase(2), { wall: true, pinY: 1.1, prefix: 'S', extra: { order: 0 } }),
  def('switch-2way', 'Enkelpolige wisselschakelaar', 'Schakelaars', 'switch', [...switchBase(), ...lever(-1, 1)], { wall: true, pinY: 1.1, prefix: 'S', extra: { order: 1 } }),
  def('switch2-2way', 'Dubbelpolige wisselschakelaar', 'Schakelaars', 'switch', [...switchBase(2), ...lever(-1, 1, 2)], { wall: true, pinY: 1.1, prefix: 'S', extra: { order: 1 } }),
  def('switch-cross', 'Enkelpolige kruisschakelaar', 'Schakelaars', 'switch', [...switchBase(), ...lever(-1, 1), ...lever(-1, -1), ...lever(1, 1)], { wall: true, pinY: 1.1, prefix: 'S', extra: { order: 2 } }),
  def('dimmer', 'Dimmer', 'Schakelaars', 'switch', [...switchBase(), P('M -2.8 1.6 L -0.9 -1.4 M -0.9 -1.4 L -2 -1.1 M -0.9 -1.4 L -1.1 -0.3')], { wall: true, pinY: 1.1, prefix: 'S', extra: { order: 0 } }),
  def('push', 'Drukknop', 'Schakelaars', 'push', [C(0, 0, 2), C(0, 0, 0.8, INK)], { wall: true, pinY: 2, prefix: 'S' }),
  def('motion', 'Bewegingsmelder', 'Schakelaars', 'switch', [P('M -2.5 1 A 2.5 2.5 0 0 1 2.5 1 Z'), P('M -1.6 -2.6 A 3.5 3.5 0 0 1 1.6 -2.6')], { wall: true, pinY: 1, prefix: 'B' }),
  def('thermostat', 'Thermostaat', 'Schakelaars', 'other', [C(0, 0, 2.2), T(0, 0, 'θ', 2.2)], { wall: true, pinY: 2.2, prefix: 'B' }),

  // Domotica
  def('dom-in', 'Domotica ingang (drukknop)', 'Domotica', 'dom-in', [R(-2.5, -2.5, 5, 5), T(0, 0, 'I', 2.2)], { wall: true, prefix: 'S' }),
  def('dom-sensor', 'Domotica sensor', 'Domotica', 'dom-in', [R(-2.5, -2.5, 5, 5), T(0, 0, 'S', 2.2)], { prefix: 'B' }),
  def('dom-out', 'Domotica uitgang (relais)', 'Domotica', 'dom-out', [R(-2.5, -2.5, 5, 5), T(0, 0, 'O', 2.2)], { prefix: 'K' }),
  def('dom-dim', 'Domotica dimmer', 'Domotica', 'dom-out', [R(-2.5, -2.5, 5, 5), T(0, 0, 'D', 2.2)], { prefix: 'K' }),
  def('dom-blind', 'Domotica rolluik', 'Domotica', 'dom-out', [R(-2.5, -2.5, 5, 5), T(0, 0, 'R', 2.2)], { prefix: 'K' }),

  // Energie
  def('board', 'Verdeelbord', 'Energie', 'board', [R(-4, -2.5, 8, 5), P('M -4 2.5 L 4 -2.5 L 4 2.5 Z', INK)], { wall: true, prefix: 'A' }),
  def('meter', 'Elektriciteitsmeter', 'Energie', 'other', [R(-3, -2.5, 6, 5), T(0, 0, 'kWh', 1.5)], { wall: true, prefix: 'P' }),
  def('pv', 'Zonnepaneel', 'Energie', 'pv', [R(-4, -2.5, 8, 5), L(-4, 0, 4, 0), L(-1.33, -2.5, -1.33, 2.5), L(1.33, -2.5, 1.33, 2.5)], { prefix: 'G' }),
  def('inverter', 'Omvormer', 'Energie', 'inverter', [R(-3, -3, 6, 6), L(-3, 3, 3, -3), T(-1.5, -1.4, '=', 1.8), T(1.5, 1.5, '~', 1.8)], { pinY: 3, wall: true, prefix: 'T' }),
  def('battery', 'Thuisbatterij', 'Energie', 'battery', [R(-3.5, -2.5, 7, 5), L(-0.8, -1.6, -0.8, 1.6, { w: 0.4 }), L(0.8, -0.8, 0.8, 0.8, { w: 0.4 })], { wall: true, prefix: 'G' }),

  // Diversen
  def('bell', 'Bel', 'Diversen', 'other', [P('M -2.5 1 A 2.5 2.5 0 0 1 2.5 1 Z'), L(0, 1, 0, 2.5)], { wall: true, prefix: 'P' }),
  def('smoke', 'Rookmelder', 'Diversen', 'other', [C(0, 0, 2.5), T(0, 0, 'R', 2)], { prefix: 'B' }),
  def('data', 'Datacontact (UTP)', 'Diversen', 'other', [P('M -2.8 1 L 2.8 1 L 0 -2.6 Z'), L(0, 1, 0, 2.5)], { wall: true, prefix: 'X' }),
  def('tv', 'TV-aansluiting', 'Diversen', 'other', [P('M -3 0 A 3 3 0 0 1 3 0'), L(-3, 0, 3, 0), L(0, 0, 0, 2.5), T(0, -1.2, 'TV', 1.4)], { wall: true, prefix: 'X' }),
  def('junction', 'Aftakdoos', 'Diversen', 'other', [C(0, 0, 1.2, INK)], { pinY: 1.2 }),
];

// Single-line (eendraad) protection symbols: pins at the top (0, 0) and bottom (0, 20).
const line2 = (id, name, kind, graphics, prefix = 'Q', hidden = true) => ({
  id: 'arei/' + id, name, folder: F('Eendraad'), kind, role: 'device', prefix, arei: true, pinText: false, hidden,
  graphics, pins: [{ id: '1', x: 0, y: 0, name: '' }, { id: '2', x: 0, y: 20, name: '' }], tagAt: { x: -7, y: 10, anchor: 'end' },
});
const pole = [L(0, 0, 0, 6), L(-1.3, 4.7, 1.3, 7.3), L(-1.3, 7.3, 1.3, 4.7), L(0, 14, 0, 20), L(0, 14, -4.5, 7)];
AREI.push({
  id: 'arei/earth', name: 'Aardelektrode met meetklem', folder: F('Eendraad'), kind: 'earth', role: 'graphic', arei: true, pinText: false,
  graphics: [L(0, 0, 0, 5), L(-2.5, 5, 2.5, 5), L(-2.5, 7, 2.5, 7), L(0, 7, 0, 10), L(-2.5, 10, 2.5, 10), L(-2.5, 12, 2.5, 12), L(0, 12, 0, 16), L(-3, 16, 3, 16), L(-2, 17.3, 2, 17.3), L(-1, 18.6, 1, 18.6)],
  pins: [{ id: '1', x: 0, y: 0, name: '' }],
});
// Cable installation marks (AREI, "plaatsing van de leiding") for a vertical cable line at x = 0.
const mark = (id, name, graphics) => ({
  id: 'arei/mark-' + id, name, folder: F('Eendraad'), kind: 'mark', role: 'graphic', arei: true, pinText: false, hidden: true, graphics, pins: [],
});
AREI.push(
  mark('wall', 'Leiding in een wand', [L(-3.4, -1.6, -3.4, 1.6), L(-3.4, -1.6, -1.6, -1.6), L(-3.4, 0, -1.6, 0), L(-3.4, 1.6, -1.6, 1.6)]),
  mark('onwall', 'Leiding op een wand', [L(-1.6, -1.6, -1.6, 1.6), L(-1.6, -1.6, -3.4, -1.6), L(-1.6, 0, -3.4, 0), L(-1.6, 1.6, -3.4, 1.6)]),
  mark('tube', 'Leiding in een buis', [C(-2.6, 0, 1.1)]),
  mark('ground', 'Ondergrondse leiding', [L(-1.8, -1.8, -1.8, 1.8), L(-2.6, -1.2, -2.6, 1.2), L(-3.4, -0.6, -3.4, 0.6)]),
  mark('overhead', 'Luchtleiding', [C(0, 0, 1.4, WHITE)]),
);

// Breaker for the Belgian single-line layout: busbar below (pin 1 at 0,0), circuit above (pin 2 at 0,-12).
AREI.push({
  id: 'arei/mcb-v', name: 'Automaat (eendraad, verticaal)', folder: F('Eendraad'), kind: 'breaker', role: 'device', prefix: 'Q', arei: true, pinText: false,
  graphics: [L(0, 0, 0, -4), L(0, -4, -2, -10.5), L(-1.55, -9, -2.05, -10.6, { w: 0.9 }), L(0, -9.6, 0, -12)],
  pins: [{ id: '1', x: 0, y: 0, name: '' }, { id: '2', x: 0, y: -12, name: '' }], tagAt: { x: -4, y: -6, anchor: 'end' },
});
AREI.push({
  id: 'arei/fuse-v', name: 'Smeltzekering (eendraad, verticaal)', folder: F('Eendraad'), kind: 'fuse', role: 'device', prefix: 'F', arei: true, pinText: false,
  graphics: [L(0, 0, 0, -2.5), R(-0.75, -9.5, 1.5, 7), L(0, -9.5, 0, -12)],
  pins: [{ id: '1', x: 0, y: 0, name: '' }, { id: '2', x: 0, y: -12, name: '' }], tagAt: { x: -4, y: -6, anchor: 'end' },
});
AREI.push(
  line2('mcb', 'Automaat (eendraad)', 'breaker', [...pole, L(-2.25, 10.5, -7, 10.5, { dash: true }), R(-10, 8.5, 3, 4)]),
  line2('rcd', 'Differentieel (eendraad)', 'rcd', [...pole, L(-2.25, 10.5, -8, 10.5, { dash: true }), R(-14, 8, 6, 5), T(-11, 10.5, 'IΔ', 2)]),
  line2('mainswitch', 'Hoofdschakelaar (eendraad)', 'mainswitch', [L(0, 0, 0, 7), L(0, 13, 0, 20), L(0, 13, -4.5, 6.5), L(-2.25, 9.75, -8, 9.75, { dash: true }), P('M -10 7.5 L -8.5 7.5 L -8.5 12 L -7 12')]),
  line2('kwh', 'kWh-meter (eendraad)', 'meter', [L(0, 0, 0, 5), R(-5, 5, 10, 10), T(0, 10, 'kWh', 2.2), L(0, 15, 0, 20)], 'P', false),
);
