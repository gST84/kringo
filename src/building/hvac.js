// Heating, plumbing and ventilation symbols for floor plans ("Technieken"): central heating boiler,
// underfloor heating manifold, radiator, convector, fan coil; drain point; ventilation unit and valves.
// Same conventions as the AREI symbols: paper millimetres around (0, 0), pin at the bottom (the wall side).
//   hvac: role in the heating / ventilation generators (boiler, collector, emitter, drain, vent-unit, vent-in, vent-out)

const L = (x1, y1, x2, y2, o) => ({ t: 'line', x1, y1, x2, y2, ...o });
const R = (x, y, w, h, o) => ({ t: 'rect', x, y, w, h, ...o });
const C = (cx, cy, r, o) => ({ t: 'circle', cx, cy, r, ...o });
const P = (d, o) => ({ t: 'path', d, ...o });
const T = (x, y, text, size = 1.8, anchor = 'middle') => ({ t: 'text', x, y, text, size, anchor });
const WHITE = { fill: 'white' };
const INK = { fill: 'ink' };

export const HVAC_ROOT = 'Technieken';
const CV = HVAC_ROOT + '/CV', UFH = HVAC_ROOT + '/Vloerverwarming', WATER = HVAC_ROOT + '/Sanitair', DRAIN = HVAC_ROOT + '/Afvoer', VENT = HVAC_ROOT + '/Ventilatie';
const DISC_OF = { [CV]: 'cv', [UFH]: 'vv', [WATER]: 'water', [DRAIN]: 'drain', [VENT]: 'vent' };

const def = (id, name, folder, kind, hvac, graphics, o = {}) => ({
  id: 'hvac/' + id, name, folder, kind, hvac, disc: DISC_OF[folder], role: 'device', prefix: o.prefix || 'W', arei: true,
  graphics, pins: [{ id: '1', x: 0, y: o.pinY ?? 2.5, name: '' }], tagAt: { x: 0, y: -5, anchor: 'middle' },
  wall: !!o.wall, pinText: false, ...o.extra,
});

/** Fan: circle with two blades. */
const fan = (cx, cy, r) => [C(cx, cy, r, WHITE), P(`M ${cx} ${cy} L ${cx - r * 0.7} ${cy - r * 0.45} L ${cx - r * 0.7} ${cy + r * 0.45} Z`, INK), P(`M ${cx} ${cy} L ${cx + r * 0.7} ${cy - r * 0.45} L ${cx + r * 0.7} ${cy + r * 0.45} Z`, INK)];

export const HVAC = [
  // CV en sanitair
  def('boiler', 'CV-ketel', CV, 'appliance', 'boiler', [R(-4, -4, 8, 8, WHITE), P('M -1.6 2.2 C -2.6 0.4 -0.6 -0.4 -0.6 -2.4 C 0.4 -1.2 2.2 0 1.4 2.2 Z', { w: 0.25 }), T(0, -1.3, 'CV', 1.5)],
    { wall: true, pinY: 4, prefix: 'W', extra: { box: true, half: 4 } }),
  def('collector', 'Collector vloerverwarming', UFH, 'hvac', 'collector',
    [R(-6, -0.6, 12, 2.1, WHITE), L(-6, 0.45, 6, 0.45, { w: 0.15 }), ...[-4.5, -2.5, -0.5, 1.5, 3.5].map((x) => L(x + 0.5, -0.6, x + 0.5, -2.8)), T(0, -3.6, 'VV', 1.4)],
    { wall: true, pinY: 1.5, prefix: 'W' }),
  def('radiator', 'Radiator', CV, 'hvac', 'emitter',
    [R(-5, -1.4, 10, 2.4, WHITE), ...[-3.75, -2.5, -1.25, 0, 1.25, 2.5, 3.75].map((x) => L(x, -1.4, x, 1, { w: 0.15 }))],
    { wall: true, pinY: 1, prefix: 'W' }),
  def('convector', 'Convector', CV, 'hvac', 'emitter',
    [R(-5, -1.4, 10, 2.4, WHITE), P('M -4.2 0.5 L -3 -1 L -1.8 0.5 L -0.6 -1 L 0.6 0.5 L 1.8 -1 L 3 0.5 L 4.2 -1', { w: 0.2 })],
    { wall: true, pinY: 1, prefix: 'W' }),
  def('fancoil', 'Ventiloconvector', CV, 'appliance', 'emitter',
    [R(-5, -2.6, 10, 3.6, WHITE), ...fan(0, -0.8, 1.4), L(-4.2, -2, -2.4, -2, { w: 0.15 }), L(2.4, -2, 4.2, -2, { w: 0.15 })],
    { wall: true, pinY: 1, prefix: 'W', extra: { box: true, half: 5 } }),
  // Sanitair
  def('tap', 'Tappunt koud water', WATER, 'hvac', 'tap',
    [C(0, 0, 1.6, WHITE), L(0, 1.6, 0, 2.5), T(0, 0.65, 'K', 1.6)], { wall: true, pinY: 2.5, prefix: 'W' }),
  def('tap-hot', 'Tappunt warm water', WATER, 'hvac', 'tap',
    [C(0, 0, 1.6, WHITE), L(0, 1.6, 0, 2.5), T(0, 0.65, 'W', 1.6)], { wall: true, pinY: 2.5, prefix: 'W' }),
  def('meter', 'Watermeter', WATER, 'hvac', 'meter',
    [C(0, 0, 2.2, WHITE), L(-2.2, 0, 2.2, 0, { w: 0.15 }), P('M -1 -0.5 L 0 -1.6 L 1 -0.5', { w: 0.2 })], { wall: true, pinY: 2.2, prefix: 'W' }),
  def('heater', 'Warmwaterboiler', WATER, 'appliance', 'heater',
    [C(0, 0, 3, WHITE), T(0, 0.6, 'WW', 1.6)], { wall: true, pinY: 3, prefix: 'W' }),
  // Afvoer
  def('drain', 'Afvoerpunt', DRAIN, 'hvac', 'drain',
    [C(0, 0, 1.6, WHITE), L(-1.13, -1.13, 1.13, 1.13, { w: 0.2 }), L(-1.13, 1.13, 1.13, -1.13, { w: 0.2 })],
    { pinY: 1.6, prefix: 'W' }),
  def('floordrain', 'Vloerputje', DRAIN, 'hvac', 'drain',
    [R(-1.8, -1.8, 3.6, 3.6, WHITE), ...[-0.9, 0, 0.9].map((y) => L(-1.2, y, 1.2, y, { w: 0.2 }))],
    { pinY: 1.8, prefix: 'W' }),
  // Ventilatie
  def('vent-unit', 'Ventilatie-unit', VENT, 'appliance', 'vent-unit', [R(-4.5, -3.5, 9, 7, WHITE), ...fan(-1.6, 0, 1.5), T(2.2, 0.6, 'D', 1.6)],
    { wall: true, pinY: 3.5, prefix: 'W', extra: { box: true, half: 4.5 } }),
  def('vent-in', 'Toevoerventiel', VENT, 'hvac', 'vent-in',
    [C(0, 0, 2, WHITE), L(0, -1.4, 0, 1.2, { w: 0.25 }), P('M -0.8 0.3 L 0 1.4 L 0.8 0.3', { w: 0.25 })], { pinY: 2, prefix: 'W' }),
  def('vent-out', 'Afvoerventiel', VENT, 'hvac', 'vent-out',
    [C(0, 0, 2, WHITE), L(0, -1.2, 0, 1.4, { w: 0.25 }), P('M -0.8 -0.3 L 0 -1.4 L 0.8 -0.3', { w: 0.25 })], { pinY: 2, prefix: 'W' }),
];

/** Installation type of each symbol (id without 'hvac/'), also for symbols in older projects. */
export const HVAC_DISC = Object.fromEntries(HVAC.map((d) => [d.id.slice(5), d.disc]));

/** Kinds without an electrical circuit (no "Kring" section in the properties). */
export const isHydronic = (def) => def?.kind === 'hvac';
