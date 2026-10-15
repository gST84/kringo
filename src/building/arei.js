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
/**
 * Socket outlet with earth (Belgian plans / single-line diagrams): the line runs from the wall
 * (pin), crosses a short earth bar and ends in an arc that opens away from the wall. Multiple
 * sockets in one box repeat bar + arc along the line.
 */
const SOCKET_STEP = 4.5;
const socketBase = (n = 1) => {
  const g = [L(0, 2.5, 0, -(n - 1) * SOCKET_STEP)];
  for (let k = 0; k < n; k++) {
    const oy = -k * SOCKET_STEP;
    g.push(L(-2.2, oy + 1.1, 2.2, oy + 1.1), P(`M -2.5 ${oy - 2.5} A 2.5 2.5 0 0 0 2.5 ${oy - 2.5}`));
  }
  return g;
};
const socketTop = (n = 1) => -(n - 1) * SOCKET_STEP - 1.6;
const flag = (x, y) => L(x, y, x + 0.9, y + 0.9);
const switchBase = () => [C(0, 0, 0.9, INK), L(0, 0, 2.6, -2.6)];

const F = (sub) => 'AREI/' + sub;
const def = (id, name, folder, kind, graphics, o = {}) => ({
  id: 'arei/' + id, name, folder: F(folder), kind, role: 'device', prefix: o.prefix || 'E', arei: true,
  graphics, pins: [{ id: '1', x: 0, y: o.pinY ?? 2.5, name: '' }], tagAt: { x: 0, y: -5, anchor: 'middle' },
  wall: !!o.wall, pinText: false, ...o.extra,
});

const socketDef = (id, name, n, label) =>
  def(id, name, label ? 'Toestellen' : 'Stopcontacten', label ? 'appliance' : 'socket',
    [...socketBase(n), ...(label ? [T(0, socketTop(n), label, 1.4)] : [])], { wall: true, prefix: 'X', extra: { units: n } });

export const AREI = [
  // Verlichting
  def('light', 'Lichtpunt', 'Verlichting', 'light', lampX(), { pinY: 2.5 }),
  def('light-wall', 'Wandlichtpunt', 'Verlichting', 'light', [...lampX(), L(0, 2.5, 0, 3.5), L(-2.5, 3.5, 2.5, 3.5)], { pinY: 3.5, wall: true }),
  def('spot', 'Inbouwspot', 'Verlichting', 'light', [...lampX(1.8), C(0, 0, 0.5, INK)], { pinY: 1.8 }),
  def('tl', 'TL / LED-armatuur', 'Verlichting', 'light', [L(-5, 0, 5, 0, { w: 0.6 }), L(-5, -1.2, -5, 1.2), L(5, -1.2, 5, 1.2)], { pinY: 1.2 }),
  def('light-out', 'Buitenverlichting', 'Verlichting', 'light', [...lampX(), C(0, 0, 3.3)], { pinY: 3.3, wall: true }),
  def('emergency', 'Noodverlichting', 'Verlichting', 'light', [...lampX(), L(-3.4, 3.2, 3.4, 3.2, { w: 0.5 })], { pinY: 3.2 }),

  // Stopcontacten
  socketDef('socket', 'Stopcontact met aarding', 1),
  socketDef('socket2', 'Dubbel stopcontact', 2),
  socketDef('socket3', 'Drievoudig stopcontact', 3),
  socketDef('socket4', 'Viervoudig stopcontact', 4),
  def('socket-ext', 'Stopcontact buiten (IP44)', 'Stopcontacten', 'socket', [...socketBase(1), T(0, socketTop(1), 'IP', 1.3)], { wall: true, prefix: 'X', extra: { units: 1 } }),
  def('socket-3p', 'Krachtstopcontact 3F', 'Stopcontacten', 'socket', [...socketBase(1), T(0, socketTop(1), '3F', 1.3)], { wall: true, prefix: 'X', extra: { units: 1 } }),

  // Toestellen (vaste aansluiting of eigen stopcontact)
  socketDef('washer', 'Wasmachine', 1, 'WM'),
  socketDef('dryer', 'Droogkast', 1, 'DK'),
  socketDef('dishwasher', 'Vaatwasser', 1, 'VW'),
  def('hob', 'Kookplaat', 'Toestellen', 'appliance',
    [R(-3.5, -6, 7, 7), C(-1.6, -4.1, 0.65, INK), C(1.6, -4.1, 0.65, INK), C(-1.6, -1.9, 0.65, INK), C(1.6, -1.9, 0.65, INK), L(0, 1, 0, 2.5)], { wall: true, prefix: 'E' }),
  socketDef('hood', 'Dampkap', 1, 'DA'),
  socketDef('cooker', 'Kooktoestel / fornuis', 1, 'KO'),
  socketDef('oven', 'Oven', 1, 'OV'),
  socketDef('microwave', 'Microgolfoven', 1, 'MG'),
  socketDef('fridge', 'Koelkast', 1, 'KK'),
  socketDef('boiler', 'Boiler', 1, 'BO'),
  socketDef('heatpump', 'Warmtepomp', 1, 'WP'),
  def('heater', 'Elektrische verwarming', 'Toestellen', 'other', [R(-4, -2, 8, 4), P('M -3 1 L -2 -1 L -1 1 L 0 -1 L 1 1 L 2 -1 L 3 1')], { pinY: 2, wall: true }),
  def('fan', 'Ventilator', 'Toestellen', 'other', [C(0, 0, 2.5), P('M 0 0 L -2 -1 L -2 1 Z M 0 0 L 2 -1 L 2 1 Z', INK)], { pinY: 2.5 }),
  def('ev', 'Laadpaal', 'Energie', 'other', [R(-2.5, -3.5, 5, 6), T(0, -0.5, 'EV', 1.8)], { pinY: 2.5, wall: true }),

  // Schakelaars en bediening
  def('switch', 'Schakelaar enkelpolig', 'Schakelaars', 'switch', [...switchBase(), flag(2.6, -2.6)], { wall: true, pinY: 0.9, prefix: 'S' }),
  def('switch2', 'Schakelaar tweepolig', 'Schakelaars', 'switch', [...switchBase(), flag(2.6, -2.6), flag(1.8, -1.8)], { wall: true, pinY: 0.9, prefix: 'S' }),
  def('switch-2way', 'Wisselschakelaar (hotel)', 'Schakelaars', 'switch',
    [...switchBase(), flag(2.6, -2.6), L(0, 0, -2.6, 2.6), L(-2.6, 2.6, -3.5, 1.7)], { wall: true, pinY: 0.9, prefix: 'S' }),
  def('switch-cross', 'Kruisschakelaar', 'Schakelaars', 'switch',
    [...switchBase(), flag(2.6, -2.6), L(0, 0, -2.6, 2.6), L(-2.6, 2.6, -3.5, 1.7), L(0, 0, -2.6, -2.6), L(-2.6, -2.6, -1.7, -3.5), L(0, 0, 2.6, 2.6), L(2.6, 2.6, 3.5, 1.7)],
    { wall: true, pinY: 0.9, prefix: 'S' }),
  def('dimmer', 'Dimmer', 'Schakelaars', 'switch', [...switchBase(), flag(2.6, -2.6), P('M -3 1 L -0.6 -2.2 M -0.6 -2.2 L -1.8 -1.9 M -0.6 -2.2 L -0.8 -1')], { wall: true, pinY: 0.9, prefix: 'S' }),
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
const line2 = (id, name, kind, graphics, prefix = 'Q') => ({
  id: 'arei/' + id, name, folder: F('Eendraad'), kind, role: 'device', prefix, arei: true, pinText: false,
  graphics, pins: [{ id: '1', x: 0, y: 0, name: '' }, { id: '2', x: 0, y: 20, name: '' }], tagAt: { x: -7, y: 10, anchor: 'end' },
});
const pole = [L(0, 0, 0, 6), L(-1.3, 4.7, 1.3, 7.3), L(-1.3, 7.3, 1.3, 4.7), L(0, 14, 0, 20), L(0, 14, -4.5, 7)];
AREI.push({
  id: 'arei/earth', name: 'Aardelektrode met meetklem', folder: F('Eendraad'), kind: 'earth', role: 'graphic', arei: true, pinText: false,
  graphics: [L(0, 0, 0, 5), L(-2.5, 5, 2.5, 5), L(-2.5, 7, 2.5, 7), L(0, 7, 0, 12), L(-4, 12, 4, 12), L(-2.5, 13.5, 2.5, 13.5), L(-1, 15, 1, 15)],
  pins: [{ id: '1', x: 0, y: 0, name: '' }],
});
// Breaker for the Belgian single-line layout: busbar below (pin 1 at 0,0), circuit above (pin 2 at 0,-12).
AREI.push({
  id: 'arei/mcb-v', name: 'Automaat (eendraad, verticaal)', folder: F('Eendraad'), kind: 'breaker', role: 'device', prefix: 'Q', arei: true, pinText: false,
  graphics: [L(0, 0, 0, -3), C(0, -3, 0.55, INK), L(0, -3, -2.8, -8.6), L(0, -9, 0, -12)],
  pins: [{ id: '1', x: 0, y: 0, name: '' }, { id: '2', x: 0, y: -12, name: '' }], tagAt: { x: -4, y: -6, anchor: 'end' },
});
AREI.push(
  line2('mcb', 'Automaat (eendraad)', 'breaker', [...pole, L(-2.25, 10.5, -7, 10.5, { dash: true }), R(-10, 8.5, 3, 4)]),
  line2('rcd', 'Differentieel (eendraad)', 'rcd', [...pole, L(-2.25, 10.5, -8, 10.5, { dash: true }), R(-14, 8, 6, 5), T(-11, 10.5, 'IΔ', 2)]),
  line2('mainswitch', 'Hoofdschakelaar (eendraad)', 'mainswitch', [L(0, 0, 0, 7), L(0, 13, 0, 20), L(0, 13, -4.5, 6.5), L(-2.25, 9.75, -8, 9.75, { dash: true }), P('M -10 7.5 L -8.5 7.5 L -8.5 12 L -7 12')]),
  line2('kwh', 'kWh-meter (eendraad)', 'meter', [L(0, 0, 0, 5), R(-5, 5, 10, 10), T(0, 10, 'kWh', 2.2), L(0, 15, 0, 20)], 'P'),
);

export const isSocket = (d) => d?.kind === 'socket';
