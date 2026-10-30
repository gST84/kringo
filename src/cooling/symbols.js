// Symbols for machine cooling circuits: coolant (water / glycol) and the refrigerant circuit of a chiller.
// Instruments are P&ID bubbles (TS, FS, PSH …) that electrical contacts can be linked to.
// Every symbol carries `cool: {kind, medium}` for the simulation (src/cooling/sim.js); in-line parts have
// ports 1 (left) and 2 (right), heat exchangers a second channel 3 → 4.

const L = (x1, y1, x2, y2, o) => ({ t: 'line', x1, y1, x2, y2, ...o });
const R = (x, y, w, h, o) => ({ t: 'rect', x, y, w, h, ...o });
const C = (cx, cy, r, o) => ({ t: 'circle', cx, cy, r, ...o });
const P = (d, o) => ({ t: 'path', d, ...o });
const T = (x, y, text, size = 2.2, anchor = 'middle') => ({ t: 'text', x, y, text, size, anchor });
const pin = (id, x, y) => ({ id, x, y, name: '' });
const INK = { fill: 'ink' };
const WHITE = { fill: 'white' };
const D = { dash: true };
const THIN = { w: 0.2 };

const IN2 = [pin('1', -10, 0), pin('2', 10, 0)];
const inline = (half, body) => [L(-10, 0, -half, 0), L(half, 0, 10, 0), ...body];
/** Heat exchanger with two channels: 1 → 2 above, 3 → 4 below. */
const HX4 = [pin('1', -10, -5), pin('2', 10, -5), pin('3', 10, 5), pin('4', -10, 5)];
const hxLines = [L(-10, -5, -6, -5), L(6, -5, 10, -5), L(6, 5, 10, 5), L(-10, 5, -6, 5)];
const coil = (y, x0 = -5, x1 = 5) => P(`M ${x0} ${y} L ${x0 + 1.5} ${y - 2} L ${x0 + 3.5} ${y + 2} L ${x0 + 5.5} ${y - 2} L ${x0 + 7.5} ${y + 2} L ${x1} ${y}`, THIN);
const fan = (y) => [C(0, y, 3, WHITE), L(-2.1, y - 2.1, 2.1, y + 2.1, THIN), L(-2.1, y + 2.1, 2.1, y - 2.1, THIN), L(0, y + 3, 0, y + 5, THIN)];
const bowtie = (fill) => P('M -4 -3 L 4 3 L 4 -3 L -4 3 Z', fill ? INK : WHITE);
const snow = (cx, cy, r) => [L(cx - r, cy, cx + r, cy, THIN), L(cx - r / 2, cy - r * 0.87, cx + r / 2, cy + r * 0.87, THIN), L(cx - r / 2, cy + r * 0.87, cx + r / 2, cy - r * 0.87, THIN)];

const DRIVE = { k: 'drive', label: 'Aangestuurd door (spoel / contactor, bv. -6K1; leeg = met de hand)', list: 'coils' };
const FAN = { k: 'drive', label: 'Ventilator aangestuurd door (spoel / contactor; leeg = draait altijd)', list: 'coils' };
const SOL = { k: 'sol', label: 'Spoel (naam van het magneetventiel op een elektrisch blad, bv. -6Y1)', list: 'coils' };

const num = (k, label, unit) => ({ k, label: `${label} (${unit})`, type: 'number' });
const KW = (k, label) => num(k, label, 'kW');
const COOLANT = { k: 'medium', label: 'Koelmiddel in de kring', options: [['water', 'Water'], ['glycol30', 'Glycol 30 %'], ['glycol50', 'Glycol 50 %']] };
/** Value printed under a symbol, e.g. "3 kW". */
const val = (y, text) => T(0, y, text, 1.9);

const MEDIA = { water: 'Koeling/Koelwater', ref: 'Koeling/Koelmiddel', inst: 'Koeling/Instrumenten' };
const sym = (medium, id, name, kind, graphics, pins, o = {}) => ({
  id: `cool/${id}`, name, folder: MEDIA[o.folder || medium], prefix: o.prefix || 'Z', role: o.role || 'device',
  graphics, pins, cool: { kind, medium }, tagAt: o.tagAt || { x: -6, y: -5, anchor: 'end' },
  props: o.props || {}, fields: o.fields, build: o.build, pinText: false,
});

// ---------- valves (parametric: closed parts are filled) ----------

/** Shut-off valve; `__open` (simulation) overrides the rest position. */
const ballValve = (props) => {
  const open = props.__open ?? props.open !== 'no';
  return { graphics: inline(4, [bowtie(!open), C(0, 0, 1.1, INK)]), pins: IN2 };
};
const solValve = (props) => {
  const open = props.__open ?? props.type === 'no';
  return { graphics: inline(4, [bowtie(!open), L(0, 0, 0, -5), R(-2.5, -9, 5, 4, WHITE), L(-2.5, -5, 2.5, -9, THIN), T(0, -10.5, props.sol || '', 1.8)]), pins: IN2 };
};
/** Three-way valve: common port 1, port 2 straight on, port 3 down; the closed way is filled. */
const threeWay = (thermo) => (props) => {
  const to = props.__to ?? '2';
  return {
    graphics: [
      L(-10, 0, -4, 0), L(4, 0, 10, 0), L(0, 4, 0, 10),
      P('M -4 -2.5 L 0 0 L -4 2.5 Z', WHITE), P('M 4 -2.5 L 0 0 L 4 2.5 Z', to === '2' ? WHITE : INK), P('M -2.5 4 L 0 0 L 2.5 4 Z', to === '3' ? WHITE : INK),
      L(0, 0, 0, -4),
      ...(thermo ? [P('M -2 -4 L 2 -4 L 2 -7 A 2 2 0 0 1 -2 -7 Z', WHITE), T(0, -6, 'T', 1.8)] : [C(0, -7, 3, WHITE), T(0, -7, 'M', 2.2), T(4, -9.5, props.sol || '', 1.8, 'start')]),
    ],
    pins: [pin('1', -10, 0), pin('2', 10, 0), pin('3', 0, 10)],
  };
};

// ---------- instruments: P&ID bubble on a stub to the pipe below ----------

const bubble = (code, extra = []) => [L(0, 10, 0, 5), C(0, 0, 5, WHITE), T(0, 0.2, code, code.length > 2 ? 2.2 : 2.6), ...extra];
const INST_PIN = [pin('1', 0, 10)];
const inst = (id, name, kind, code, o = {}) => sym('inst', id, name, kind, bubble(code, o.extra), INST_PIN,
  { prefix: 'B', tagAt: { x: -6, y: -3, anchor: 'end' }, ...o, folder: 'inst' });

export const COOLING = [
  // ---------- coolant ----------
  sym('water', 'pump', 'Pomp (koelwater)', 'pump', inline(5, [C(0, 0, 5, WHITE), P('M -2 -3.2 L 3.6 0 L -2 3.2 Z', INK), val(8, '{flow} l/min')]), IN2,
    { prefix: 'P', props: { drive: '', flow: 20, medium: 'water' }, fields: [DRIVE, num('flow', 'Debiet', 'l/min'), COOLANT], tagAt: { x: -6, y: -6, anchor: 'end' } }),
  sym('water', 'tank', 'Reservoir (open)', 'tank', [L(-5, 0, -5, 5), L(5, 0, 5, 12), P('M -10 3 L -10 15 L 10 15 L 10 3'), L(-10, 7, 10, 7, { w: 0.15, dash: true }), val(18, '{volume} l'), T(12, 11, '{__t}', 1.9, 'start')],
    [pin('1', -5, 0), pin('2', 5, 0)], { prefix: 'T', props: { volume: 50, t0: 20 }, fields: [num('volume', 'Inhoud', 'liter'), num('t0', 'Begintemperatuur', '°C')], tagAt: { x: -12, y: 10, anchor: 'end' } }),
  sym('water', 'expvessel', 'Expansievat', 'none', [L(0, 0, 0, 3), P('M -4 7 A 4 4 0 0 1 4 7 L 4 14 A 4 4 0 0 1 -4 14 Z', WHITE), L(-4, 10.5, 4, 10.5, THIN)],
    [pin('1', 0, 0)], { role: 'graphic', tagAt: { x: -6, y: 10, anchor: 'end' } }),
  sym('water', 'filter', 'Filter', 'pass', inline(5, [P('M -5 0 L 0 -5 L 5 0 L 0 5 Z', WHITE), L(0, -5, 0, 5, D)]), IN2),
  sym('water', 'strainer', 'Vuilvanger', 'pass', inline(5, [R(-5, -3, 10, 6, WHITE), L(-4, 2.5, 4, -2.5, D)]), IN2),
  sym('water', 'load', 'Verbruiker / warmtebron (spindel, kast, matrijs …)', 'load',
    inline(6, [R(-6, -5, 12, 10, WHITE), coil(1, -6, 6), L(-2, -2.5, -2, -8, THIN), L(2, -2.5, 2, -8, THIN), P('M -2 -9 L -3 -7.3 L -1 -7.3 Z', INK), P('M 2 -9 L 1 -7.3 L 3 -7.3 Z', INK), val(8, '{power} kW')]), IN2,
    { prefix: 'E', props: { desc: '', power: 2 }, fields: [KW('power', 'Warmtevermogen')], tagAt: { x: -8, y: -6, anchor: 'end' } }),
  sym('water', 'aircooler', 'Luchtkoeler / droge koeler (ventilator)', 'cooler', inline(6, [R(-6, -4, 12, 8, WHITE), coil(0, -6, 6), ...fan(-10), val(7, '{cap} kW')]), IN2,
    { prefix: 'E', props: { drive: '', cap: 5, tair: 25 }, fields: [FAN, KW('cap', 'Koelvermogen'), num('tair', 'Luchttemperatuur', '°C')], tagAt: { x: -8, y: -5, anchor: 'end' } }),
  sym('water', 'chiller', 'Koelaggregaat (chiller, als geheel)', 'cooler', inline(6, [R(-6, -6, 12, 12, WHITE), ...snow(0, 0, 4), val(9, '{cap} kW')]), IN2,
    { prefix: 'E', props: { drive: '', cap: 5, sp: 15 }, fields: [{ ...DRIVE, label: 'Aangestuurd door (spoel / contactor; leeg = koelt altijd)' }, KW('cap', 'Koelvermogen'), num('sp', 'Vertrektemperatuur (setpoint)', '°C')], tagAt: { x: -8, y: -6, anchor: 'end' } }),
  sym('water', 'phe', 'Platenwarmtewisselaar', 'hx', [...hxLines, R(-6, -8, 12, 16, WHITE), L(-6, -8, 6, 8, THIN), L(-3, -8, 6, 4, THIN), L(-6, -4, 3, 8, THIN)], HX4,
    { prefix: 'E', props: { eff: 0.7 }, fields: [{ k: 'eff', label: 'Rendement ε (0 – 1)', type: 'number' }], tagAt: { x: -8, y: -9, anchor: 'end' } }),
  sym('water', 'ball', 'Afsluiter (kogelkraan)', 'manual', [], IN2, { prefix: 'V', props: { open: 'yes' }, build: ballValve,
    fields: [{ k: 'open', label: 'Stand', options: [['yes', 'Open'], ['no', 'Dicht']] }], tagAt: { x: -5, y: -4, anchor: 'end' } }),
  sym('water', 'solvalve', 'Magneetventiel (koelwater)', 'solvalve', [], IN2, { prefix: 'V', props: { sol: '', type: 'nc' }, build: solValve,
    fields: [SOL, { k: 'type', label: 'Uitvoering', options: [['nc', 'Normaal gesloten (opent bekrachtigd)'], ['no', 'Normaal open (sluit bekrachtigd)']] }], tagAt: { x: -5, y: -4, anchor: 'end' } }),
  sym('water', '3way', 'Driewegklep (motor / magneet)', 'valve3', [], [], { prefix: 'V', props: { sol: '' }, build: threeWay(false),
    fields: [{ ...SOL, label: 'Aandrijving (spoel; bekrachtigd = weg 1 → 3, anders 1 → 2)' }], tagAt: { x: -5, y: -4, anchor: 'end' } }),
  sym('water', '3way-t', 'Thermostatische driewegklep', 'valve3t', [], [], { prefix: 'V', props: { sp: 25 }, build: threeWay(true),
    fields: [num('sp', 'Boven deze temperatuur op poort 1: weg 1 → 3', '°C')], tagAt: { x: -5, y: -4, anchor: 'end' } }),
  sym('water', 'check', 'Terugslagklep', 'check', inline(3, [P('M -3 -3 L 3 0 L -3 3 Z', WHITE), L(3, -3, 3, 3)]), IN2, { prefix: 'V', tagAt: { x: -4, y: -4, anchor: 'end' } }),
  sym('water', 'vent', 'Ontluchter', 'none', [L(0, 0, 0, -4), R(-2, -8, 4, 4, WHITE), L(0, -8, 0, -10), P('M -1.5 -9.5 L 0 -11.5 L 1.5 -9.5', THIN)], [pin('1', 0, 0)], { role: 'graphic' }),
  sym('water', 'drain', 'Aftapkraan', 'none', [L(0, 0, 0, 3), P('M -2 3 L 2 3 L 0 6 Z', WHITE), L(-2, 9, 2, 9), L(0, 6, 0, 9)], [pin('1', 0, 0)], { role: 'graphic' }),

  // ---------- refrigerant circuit ----------
  sym('ref', 'compressor', 'Compressor (koelmiddel)', 'comp', inline(6, [C(0, 0, 6, WHITE), L(-3.6, -4.8, 5, -2.2), L(-3.6, 4.8, 5, 2.2)]), IN2,
    { prefix: 'M', props: { drive: '', tevap: 2, tcond: 40 }, fields: [DRIVE, num('tevap', 'Verdampingstemperatuur', '°C'), num('tcond', 'Condensatietemperatuur', '°C')], tagAt: { x: -7, y: -6, anchor: 'end' } }),
  sym('ref', 'cond-air', 'Condensor (luchtgekoeld)', 'cond', inline(6, [R(-6, -4, 12, 8, WHITE), coil(0, -6, 6), ...fan(-10)]), IN2,
    { prefix: 'E', props: { drive: '' }, fields: [FAN], tagAt: { x: -8, y: -5, anchor: 'end' } }),
  sym('ref', 'cond-w', 'Condensor (watergekoeld)', 'condw', [...hxLines, R(-6, -8, 12, 16, WHITE), coil(-5, -6, 6), L(-6, 5, 6, 5, D), val(11, '{power} kW')], HX4,
    { prefix: 'E', props: { power: 6 }, fields: [KW('power', 'Warmteafgifte aan het koelwater')], tagAt: { x: -8, y: -9, anchor: 'end' } }),
  sym('ref', 'evap-air', 'Verdamper (luchtkoeler, ventilator)', 'evap', inline(6, [R(-6, -4, 12, 8, WHITE), coil(0, -6, 6), ...fan(-10), ...snow(9, 4, 1.5)]), IN2,
    { prefix: 'E', props: { drive: '' }, fields: [FAN], tagAt: { x: -8, y: -5, anchor: 'end' } }),
  sym('ref', 'evap-w', 'Verdamper (watergekoeld, chiller)', 'evapw', [...hxLines, R(-6, -8, 12, 16, WHITE), coil(-5, -6, 6), L(-6, 5, 6, 5, D), ...snow(0, 1, 1.5), val(11, '{cap} kW')], HX4,
    { prefix: 'E', props: { cap: 5 }, fields: [KW('cap', 'Koelvermogen')], tagAt: { x: -8, y: -9, anchor: 'end' } }),
  sym('ref', 'txv', 'Thermostatisch expansieventiel', 'expansion', inline(4, [bowtie(false), L(0, 0, 0, -6, D), L(0, -6, 6, -6, D), C(7.5, -6, 1.5, INK)]), IN2,
    { prefix: 'V', tagAt: { x: -5, y: -4, anchor: 'end' } }),
  sym('ref', 'capillary', 'Capillair', 'expansion', [L(-10, 0, -6, 0), L(6, 0, 10, 0), P('M -6 0 C -6 -4 -2 -4 -2 0 C -2 4 2 4 2 0 C 2 -4 6 -4 6 0', { w: 0.3 })], IN2,
    { role: 'graphic' }),
  sym('ref', 'solvalve', 'Magneetventiel (vloeistofleiding)', 'solvalve', [], IN2, { prefix: 'V', props: { sol: '', type: 'nc' }, build: solValve,
    fields: [SOL, { k: 'type', label: 'Uitvoering', options: [['nc', 'Normaal gesloten (opent bekrachtigd)'], ['no', 'Normaal open (sluit bekrachtigd)']] }], tagAt: { x: -5, y: -4, anchor: 'end' } }),
  sym('ref', 'ball', 'Afsluiter (koelmiddel)', 'manual', [], IN2, { prefix: 'V', props: { open: 'yes' }, build: ballValve,
    fields: [{ k: 'open', label: 'Stand', options: [['yes', 'Open'], ['no', 'Dicht']] }], tagAt: { x: -5, y: -4, anchor: 'end' } }),
  sym('ref', 'check', 'Terugslagklep (koelmiddel)', 'check', inline(3, [P('M -3 -3 L 3 0 L -3 3 Z', WHITE), L(3, -3, 3, 3)]), IN2, { prefix: 'V', tagAt: { x: -4, y: -4, anchor: 'end' } }),
  sym('ref', 'drier', 'Filterdroger', 'pass', inline(5, [R(-5, -2.5, 10, 5, WHITE), C(-2.5, 0, 0.5, INK), C(0, 0, 0.5, INK), C(2.5, 0, 0.5, INK)]), IN2, { role: 'graphic' }),
  sym('ref', 'sight', 'Kijkglas', 'sight', inline(3.5, [C(0, 0, 3.5, WHITE), C(0, 0, 1.8)]), IN2, { role: 'graphic' }),
  sym('ref', 'receiver', 'Vloeistofvat', 'pass', inline(7, [P('M -4 -3.5 L 4 -3.5 A 3.5 3.5 0 0 1 4 3.5 L -4 3.5 A 3.5 3.5 0 0 1 -4 -3.5 Z', WHITE), L(-6, 1, 6, 1, { w: 0.15, dash: true })]), IN2,
    { role: 'graphic' }),
  sym('ref', 'accumulator', 'Zuiggasafscheider', 'pass', inline(5, [P('M -3 -5 L 3 -5 A 2 2 0 0 1 5 -3 L 5 3 A 2 2 0 0 1 3 5 L -3 5 A 2 2 0 0 1 -5 3 L -5 -3 A 2 2 0 0 1 -3 -5 Z', WHITE), L(-5, 2, 5, 2, { w: 0.15, dash: true })]), IN2,
    { role: 'graphic' }),

  // ---------- instruments ----------
  inst('ts', 'Thermostaat (TS)', 'tempsw', 'TS', { props: { mode: 'hot', sp: 25, hyst: 2 }, extra: [T(7, -2, '{sp} °C', 1.9, 'start')],
    fields: [{ k: 'mode', label: 'Schakelt (contact bediend) bij', options: [['hot', 'Warm water (koelvraag)'], ['cold', 'Koud water']] }, num('sp', 'Schakeltemperatuur', '°C'), num('hyst', 'Hysterese', 'K')] }),
  inst('fs', 'Debietschakelaar (FS)', 'flowsw', 'FS'),
  inst('ls', 'Niveauschakelaar (LS)', 'levelsw', 'LS'),
  inst('psh', 'Hogedrukpressostaat (PSH)', 'hp', 'PSH'),
  inst('psl', 'Lagedrukpressostaat (PSL)', 'lp', 'PSL'),
  inst('ti', 'Thermometer (TI)', 'thermo', 'TI', { role: 'graphic', extra: [T(7, -2, '{__t}', 2, 'start')] }),
  inst('pi', 'Manometer (PI)', 'gauge', 'PI', { role: 'graphic', extra: [T(7, -2, '{__p}', 2, 'start')] }),
  inst('fi', 'Debietindicator (FI)', 'flowind', 'FI', { role: 'graphic' }),
];
