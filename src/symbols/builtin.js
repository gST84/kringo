// Built-in IEC 60617 style symbol library (vertical current flow, pins on a 5 mm grid).
//
// Symbol definition:
//   id, name, folder ('Standaard/…'), prefix (IEC 81346 letter), role:
//     'main'     – device that others link to (coil, PLC card, …); shows a contact mirror when `mirror`
//     'contact'  – auxiliary part normally linked to a main device (contacts, PLC I/O points)
//     'device'   – standalone device with its own tag
//     'terminal' – terminal (strip + number instead of a tag)
//     'link'     – interruption point / potential reference (same name = same potential)
//     'graphic'  – no tag (earth, …)
//   contact: 'NO' | 'NC' | 'CO' (single auxiliary contacts get automatic numbering)
//   graphics: [{t:'line'|'rect'|'circle'|'path'|'text', …, dash?, fill?: 'ink'|'white'}]
//   pins: [{id, x, y, name}], bridges: [[pinId, pinId]] (internally connected pins)
//   tagAt: {x, y, anchor}, pinText: show pin names, props: default properties
//   build(props) (built-ins only): returns {graphics, pins} for parametric symbols.
// Text graphics may contain {tag}, {desc}, {number}, {strip}, {name}, {addr} or any property name.

const L = (x1, y1, x2, y2, o) => ({ t: 'line', x1, y1, x2, y2, ...o });
const R = (x, y, w, h, o) => ({ t: 'rect', x, y, w, h, ...o });
const C = (cx, cy, r, o) => ({ t: 'circle', cx, cy, r, ...o });
const P = (d, o) => ({ t: 'path', d, ...o });
const T = (x, y, text, size = 2.5, anchor = 'start', o) => ({ t: 'text', x, y, text, size, anchor, ...o });
const pin = (id, x, y, name = id) => ({ id, x, y, name });
const D = { dash: true };
const INK = { fill: 'ink' };
const WHITE = { fill: 'white' };

const TAG_LEFT = { x: -7, y: 10, anchor: 'end' };

const noPole = (x = 0) => [L(x, 0, x, 7), L(x, 13, x, 20), L(x, 13, x - 4.5, 6.5)];
const ncPole = (x = 0) => [L(x, 0, x, 7), L(x, 7, x + 3, 7), L(x, 13, x, 20), L(x, 13, x + 3.5, 6)];
const breakerPole = (x = 0) => [
  L(x, 0, x, 6), L(x - 1.3, 4.7, x + 1.3, 7.3), L(x - 1.3, 7.3, x + 1.3, 4.7),
  L(x, 14, x, 20), L(x, 14, x - 4.5, 7),
];
const pushHead = (x) => P(`M ${x - 1.5} 7.5 L ${x} 7.5 L ${x} 12 L ${x - 1.5} 12`);
const twoPins = (a, b) => [pin('1', 0, 0, a), pin('2', 0, 20, b)];

function poles(n, names) {
  const pins = [];
  for (let i = 0; i < n; i++) {
    pins.push(pin(String(2 * i + 1), i * 10, 0, names?.[2 * i] ?? String(2 * i + 1)));
    pins.push(pin(String(2 * i + 2), i * 10, 20, names?.[2 * i + 1] ?? String(2 * i + 2)));
  }
  return pins;
}

function breaker(n, opts = {}) {
  const g = [];
  for (let i = 0; i < n; i++) g.push(...breakerPole(i * 10));
  g.push(L(-9, 10.5, (n - 1) * 10 - 2.25, 10.5, D), R(-12, 8.5, 3, 4));
  if (opts.rcd) g.push(R(-15, 14, 7, 5), T(-11.5, 16.5, 'IΔ', 2, 'middle'), L(-11.5, 14, -11.5, 12.5, D));
  if (opts.motor) g.push(T(-10.5, 6, 'I>', 1.8, 'middle'));
  return g;
}

// ---------- PLC parametric helpers ----------

export function addressSeq(start, n, step = 1) {
  const bit = /^(.*?)(\d+)\.(\d+)$/.exec(start || '');
  const out = [];
  if (bit) {
    let [, pre, by, b] = bit;
    by = +by; b = +b;
    for (let i = 0; i < n; i++) {
      out.push(`${pre}${by}.${b}`);
      if (++b > 7) { b = 0; by++; }
    }
    return out;
  }
  const word = /^(.*?)(\d+)$/.exec(start || '');
  if (word) {
    const [, pre, w] = word;
    for (let i = 0; i < n; i++) out.push(`${pre}${+w + i * step}`);
    return out;
  }
  for (let i = 0; i < n; i++) out.push(`${start || ''}${i}`);
  return out;
}

function plcCard(kind) {
  const isIn = kind === 'DI' || kind === 'AI';
  const step = kind[0] === 'A' ? 2 : 1;
  return (props) => {
    const n = Math.max(1, Math.min(32, parseInt(props.channels, 10) || 8));
    const addr = addressSeq(props.start, n, step);
    const g = [];
    const pins = [];
    const bx = R(-5, isIn ? 5 : 0, n * 10, 20);
    g.push(bx);
    for (let i = 0; i < n; i++) {
      const x = i * 10;
      if (isIn) {
        g.push(L(x, 0, x, 5), T(x, 9, addr[i], 1.9, 'middle'));
        pins.push(pin('c' + i, x, 0, addr[i]));
      } else {
        g.push(L(x, 20, x, 25), T(x, 16, addr[i], 1.9, 'middle'));
        pins.push(pin('c' + i, x, 25, addr[i]));
      }
    }
    g.push(T(-3, isIn ? 21 : 5, `${kind} ${n}`, 2.2, 'start'), T(-3, isIn ? 15.5 : 10.5, '{desc}', 2.2, 'start'));
    return { graphics: g, pins };
  };
}

// ---------- library ----------

const F = (sub) => 'Standaard/' + sub;

export const BUILTIN = [
  // Contactoren & relais
  {
    id: 'std/coil', name: 'Spoel', folder: F('Contactoren & relais'), prefix: 'K', role: 'main', mirror: true,
    graphics: [R(-5, 5, 10, 10), L(0, 0, 0, 5), L(0, 15, 0, 20)], pins: twoPins('A1', 'A2'), pinText: true, tagAt: TAG_LEFT,
  },
  {
    id: 'std/coil-on', name: 'Spoel opkomvertraagd', folder: F('Contactoren & relais'), prefix: 'K', role: 'main', mirror: true,
    graphics: [R(-5, 5, 10, 10), R(-10, 5, 5, 10), L(-10, 5, -5, 15), L(-10, 15, -5, 5), L(0, 0, 0, 5), L(0, 15, 0, 20)],
    pins: twoPins('A1', 'A2'), pinText: true, tagAt: { x: -12, y: 10, anchor: 'end' },
  },
  {
    id: 'std/coil-off', name: 'Spoel afvalvertraagd', folder: F('Contactoren & relais'), prefix: 'K', role: 'main', mirror: true,
    graphics: [R(-5, 5, 10, 10), R(-10, 5, 5, 10, INK), L(0, 0, 0, 5), L(0, 15, 0, 20)],
    pins: twoPins('A1', 'A2'), pinText: true, tagAt: { x: -12, y: 10, anchor: 'end' },
  },
  {
    id: 'std/no', name: 'Maakcontact', folder: F('Contactoren & relais'), prefix: 'K', role: 'contact', contact: 'NO',
    graphics: noPole(), pins: twoPins('13', '14'), pinText: true, tagAt: TAG_LEFT,
  },
  {
    id: 'std/nc', name: 'Verbreekcontact', folder: F('Contactoren & relais'), prefix: 'K', role: 'contact', contact: 'NC',
    graphics: ncPole(), pins: twoPins('21', '22'), pinText: true, tagAt: TAG_LEFT,
  },
  {
    id: 'std/co', name: 'Wisselcontact', folder: F('Contactoren & relais'), prefix: 'K', role: 'contact', contact: 'CO',
    graphics: [L(0, 20, 0, 13), L(0, 13, 4.5, 7), L(-5, 0, -5, 7), L(5, 0, 5, 7), L(5, 7, 3, 7)],
    pins: [pin('1', 0, 20, '11'), pin('2', 5, 0, '12'), pin('3', -5, 0, '14')], pinText: true, tagAt: { x: -9, y: 12, anchor: 'end' },
  },
  {
    id: 'std/no-on', name: 'Maakcontact opkomvertraagd', folder: F('Contactoren & relais'), prefix: 'K', role: 'contact', contact: 'NO',
    graphics: [...noPole(), P('M -2.5 9.2 L -6.5 9.2 M -2.1 10.4 L -6.5 10.4 M -6.5 7.4 A 2.4 2.4 0 0 0 -6.5 12.2')],
    pins: twoPins('17', '18'), pinText: true, tagAt: { x: -10, y: 10, anchor: 'end' },
  },
  {
    id: 'std/nc-on', name: 'Verbreekcontact opkomvertraagd', folder: F('Contactoren & relais'), prefix: 'K', role: 'contact', contact: 'NC',
    graphics: [...ncPole(), P('M 1.8 9.6 L -3 9.6 M 1.3 10.8 L -3 10.8 M -3 7.8 A 2.4 2.4 0 0 0 -3 12.6')],
    pins: twoPins('15', '16'), pinText: true, tagAt: TAG_LEFT,
  },
  {
    id: 'std/power3', name: 'Hoofdcontacten 3P', folder: F('Contactoren & relais'), prefix: 'K', role: 'contact', contact: 'NO3',
    graphics: [...noPole(0), ...noPole(10), ...noPole(20), L(-2.25, 9.75, 17.75, 9.75, D)],
    pins: poles(3), pinText: true, tagAt: TAG_LEFT,
  },

  // Beveiliging
  {
    id: 'std/fuse', name: 'Zekering', folder: F('Beveiliging'), prefix: 'F', role: 'device',
    graphics: [R(-2, 5, 4, 10), L(0, 0, 0, 20)], pins: twoPins('1', '2'), pinText: true, tagAt: { x: -5, y: 10, anchor: 'end' },
  },
  ...[1, 2, 3, 4].map((n) => ({
    id: `std/mcb${n}`, name: `Automaat ${n}P`, folder: F('Beveiliging'), prefix: 'Q', role: 'device',
    graphics: breaker(n), pins: poles(n, n === 4 ? ['1', '2', '3', '4', '5', '6', 'N', 'N'] : n === 2 ? ['1', '2', 'N', 'N'] : null),
    pinText: true, tagAt: { x: -14, y: 10, anchor: 'end' },
  })),
  {
    id: 'std/rcd2', name: 'Differentieel 2P', folder: F('Beveiliging'), prefix: 'Q', role: 'device',
    graphics: breaker(2, { rcd: true }), pins: poles(2, ['1', '2', 'N', 'N']), pinText: true, tagAt: { x: -17, y: 8, anchor: 'end' },
  },
  {
    id: 'std/rcd4', name: 'Differentieel 4P', folder: F('Beveiliging'), prefix: 'Q', role: 'device',
    graphics: breaker(4, { rcd: true }), pins: poles(4, ['1', '2', '3', '4', '5', '6', 'N', 'N']), pinText: true, tagAt: { x: -17, y: 8, anchor: 'end' },
  },
  {
    id: 'std/mpcb', name: 'Motorbeveiligingsschakelaar', folder: F('Beveiliging'), prefix: 'Q', role: 'main', mirror: true,
    graphics: breaker(3, { motor: true }), pins: poles(3), pinText: true, tagAt: { x: -14, y: 10, anchor: 'end' },
  },
  {
    id: 'std/thermal', name: 'Thermisch relais', folder: F('Beveiliging'), prefix: 'F', role: 'main', mirror: true,
    graphics: [
      ...[0, 10, 20].map((x) => P(`M ${x} 0 L ${x} 7 L ${x - 2} 7 L ${x - 2} 13 L ${x} 13 L ${x} 20`)),
      R(-4.5, 5, 28, 10, D),
    ],
    pins: poles(3), pinText: true, tagAt: TAG_LEFT,
  },
  {
    id: 'std/thermal-nc', name: 'Thermisch contact (95-96)', folder: F('Beveiliging'), prefix: 'F', role: 'contact', contact: 'NC', fixedPins: true,
    graphics: [...ncPole(), L(1.75, 9.5, -6, 9.5, D), P('M -6 7.5 L -8 7.5 L -8 11.5 L -10 11.5')],
    pins: twoPins('95', '96'), pinText: true, tagAt: { x: -12, y: 10, anchor: 'end' },
  },
  {
    id: 'std/mainswitch', name: 'Hoofdschakelaar 3P', folder: F('Beveiliging'), prefix: 'Q', role: 'device',
    graphics: [...noPole(0), ...noPole(10), ...noPole(20), L(-9, 9.75, 17.75, 9.75, D), P('M -11 7.5 L -9.5 7.5 L -9.5 12 L -8 12')],
    pins: poles(3), pinText: true, tagAt: { x: -13, y: 10, anchor: 'end' },
  },

  // Bediening
  {
    id: 'std/pb-no', name: 'Drukknop (maak)', folder: F('Bediening'), prefix: 'S', role: 'device', contact: 'NO',
    graphics: [...noPole(), L(-2.25, 9.75, -9, 9.75, D), pushHead(-9)], pins: twoPins('13', '14'), pinText: true, tagAt: { x: -12, y: 10, anchor: 'end' },
  },
  {
    id: 'std/pb-nc', name: 'Drukknop (verbreek)', folder: F('Bediening'), prefix: 'S', role: 'device', contact: 'NC',
    graphics: [...ncPole(), L(1.75, 9.5, -9, 9.5, D), pushHead(-9)], pins: twoPins('11', '12'), pinText: true, tagAt: { x: -12, y: 10, anchor: 'end' },
  },
  {
    id: 'std/estop', name: 'Noodstop', folder: F('Bediening'), prefix: 'S', role: 'device', contact: 'NC',
    graphics: [...ncPole(), L(1.75, 9.5, -7, 9.5, D), P('M -7 5.5 A 4 4 0 0 0 -7 13.5 Z')], pins: twoPins('11', '12'), pinText: true,
    tagAt: { x: -13, y: 10, anchor: 'end' },
  },
  {
    id: 'std/selector', name: 'Keuzeschakelaar', folder: F('Bediening'), prefix: 'S', role: 'device', contact: 'NO',
    graphics: [...noPole(), L(-2.25, 9.75, -9, 9.75, D), P('M -11 7.5 L -9.5 7.5 L -9.5 12 L -8 12')], pins: twoPins('13', '14'), pinText: true,
    tagAt: { x: -13, y: 10, anchor: 'end' },
  },
  {
    id: 'std/keyswitch', name: 'Sleutelschakelaar', folder: F('Bediening'), prefix: 'S', role: 'device', contact: 'NO',
    graphics: [...noPole(), L(-2.25, 9.75, -8, 9.75, D), C(-9.5, 9.75, 1.5), L(-11, 9.75, -14, 9.75), L(-13, 9.75, -13, 11.5)],
    pins: twoPins('13', '14'), pinText: true, tagAt: { x: -15, y: 10, anchor: 'end' },
  },
  {
    id: 'std/limit-no', name: 'Eindschakelaar (maak)', folder: F('Bediening'), prefix: 'B', role: 'device', contact: 'NO',
    graphics: [...noPole(), L(-2.25, 9.75, -7, 9.75, D), P('M -7 7.5 L -10 9.75 L -7 12 Z')], pins: twoPins('13', '14'), pinText: true,
    tagAt: { x: -12, y: 10, anchor: 'end' },
  },
  {
    id: 'std/limit-nc', name: 'Eindschakelaar (verbreek)', folder: F('Bediening'), prefix: 'B', role: 'device', contact: 'NC',
    graphics: [...ncPole(), L(1.75, 9.5, -7, 9.5, D), P('M -7 7.25 L -10 9.5 L -7 11.75 Z')], pins: twoPins('11', '12'), pinText: true,
    tagAt: { x: -12, y: 10, anchor: 'end' },
  },

  // Signalisatie & belasting
  {
    id: 'std/lamp', name: 'Signaallamp', folder: F('Signalisatie & belasting'), prefix: 'P', role: 'device',
    graphics: [C(0, 10, 5), L(-3.5, 6.5, 3.5, 13.5), L(-3.5, 13.5, 3.5, 6.5), L(0, 0, 0, 5), L(0, 15, 0, 20)],
    pins: twoPins('X1', 'X2'), pinText: true, tagAt: TAG_LEFT,
  },
  {
    id: 'std/buzzer', name: 'Zoemer', folder: F('Signalisatie & belasting'), prefix: 'P', role: 'device',
    graphics: [P('M -5 13 A 5 5 0 0 1 5 13 Z'), L(0, 0, 0, 8), L(0, 13, 0, 20)], pins: twoPins('1', '2'), pinText: true, tagAt: TAG_LEFT,
  },
  {
    id: 'std/valve', name: 'Magneetventiel', folder: F('Signalisatie & belasting'), prefix: 'Y', role: 'device',
    graphics: [R(-5, 5, 10, 10), L(-5, 15, 5, 5), L(0, 0, 0, 5), L(0, 15, 0, 20)], pins: twoPins('A1', 'A2'), pinText: true, tagAt: TAG_LEFT,
  },
  {
    id: 'std/heater', name: 'Verwarmingselement', folder: F('Signalisatie & belasting'), prefix: 'E', role: 'device',
    graphics: [R(-3, 4, 6, 12), L(-3, 8, 3, 8), L(-3, 12, 3, 12), L(0, 0, 0, 4), L(0, 16, 0, 20)], pins: twoPins('1', '2'), pinText: true, tagAt: TAG_LEFT,
  },
  {
    id: 'std/motor3', name: 'Motor 3~', folder: F('Signalisatie & belasting'), prefix: 'M', role: 'device',
    graphics: [
      C(10, 17, 8), L(0, 0, 0, 8), L(0, 8, 4.34, 11.34), L(10, 0, 10, 9), L(20, 0, 20, 8), L(20, 8, 15.66, 11.34),
      L(30, 0, 30, 17), L(30, 17, 18, 17), T(10, 15.5, 'M', 4.5, 'middle'), T(10, 20.5, '3~', 2.5, 'middle'),
    ],
    pins: [pin('U', 0, 0, 'U1'), pin('V', 10, 0, 'V1'), pin('W', 20, 0, 'W1'), pin('PE', 30, 0, 'PE')], pinText: true,
    tagAt: { x: -3, y: 18, anchor: 'end' },
  },
  {
    id: 'std/motor1', name: 'Motor 1~', folder: F('Signalisatie & belasting'), prefix: 'M', role: 'device',
    graphics: [C(5, 15, 7), L(0, 0, 0, 10), L(10, 0, 10, 10), L(20, 0, 20, 15), L(20, 15, 12, 15), T(5, 13.5, 'M', 4, 'middle'), T(5, 18, '1~', 2.2, 'middle')],
    pins: [pin('L', 0, 0, 'L'), pin('N', 10, 0, 'N'), pin('PE', 20, 0, 'PE')], pinText: true, tagAt: { x: -4, y: 15, anchor: 'end' },
  },
  {
    id: 'std/vfd', name: 'Frequentieregelaar', folder: F('Signalisatie & belasting'), prefix: 'T', role: 'main',
    graphics: [
      R(-5, 5, 30, 25), L(0, 0, 0, 5), L(10, 0, 10, 5), L(20, 0, 20, 5), L(0, 30, 0, 35), L(10, 30, 10, 35), L(20, 30, 20, 35),
      T(10, 14, 'f', 4, 'middle'), T(10, 21, '~ / ~', 2.5, 'middle'),
    ],
    pins: [pin('L1', 0, 0), pin('L2', 10, 0), pin('L3', 20, 0), pin('U', 0, 35), pin('V', 10, 35), pin('W', 20, 35)], pinText: true,
    tagAt: { x: -8, y: 17, anchor: 'end' },
  },
  {
    id: 'std/socket', name: 'Stopcontact', folder: F('Signalisatie & belasting'), prefix: 'X', role: 'device',
    graphics: [L(0, 0, 0, 8), L(10, 0, 10, 8), L(20, 0, 20, 8), P('M 2 14 A 8 8 0 0 1 18 14'), L(10, 6, 10, 14), L(0, 8, 2, 14), L(20, 8, 18, 14)],
    pins: [pin('L', 0, 0), pin('N', 10, 0), pin('PE', 20, 0)], pinText: true, tagAt: { x: -4, y: 10, anchor: 'end' },
  },

  // Voeding
  {
    id: 'std/psu', name: 'Voeding AC/DC', folder: F('Voeding'), prefix: 'T', role: 'device',
    graphics: [R(-5, 5, 20, 20), L(-5, 25, 15, 5), T(-2, 10, '~', 3.5), T(12, 21, '=', 3.5, 'end'), L(0, 0, 0, 5), L(10, 0, 10, 5), L(0, 25, 0, 30), L(10, 25, 10, 30)],
    pins: [pin('L', 0, 0), pin('N', 10, 0), pin('P', 0, 30, '+'), pin('M', 10, 30, '-')], pinText: true, tagAt: { x: -8, y: 15, anchor: 'end' },
  },
  {
    id: 'std/transformer', name: 'Transformator', folder: F('Voeding'), prefix: 'T', role: 'device',
    graphics: [C(0, 11, 6), C(0, 19, 6), L(-5, 0, -5, 7.7), L(5, 0, 5, 7.7), L(-5, 22.3, -5, 30), L(5, 22.3, 5, 30)],
    pins: [pin('1', -5, 0, '1U1'), pin('2', 5, 0, '1U2'), pin('3', -5, 30, '2U1'), pin('4', 5, 30, '2U2')], pinText: true,
    tagAt: { x: -9, y: 15, anchor: 'end' },
  },
  {
    id: 'std/earth', name: 'Aarding', folder: F('Voeding'), role: 'graphic',
    graphics: [L(0, 0, 0, 5), L(-4, 5, 4, 5), L(-2.5, 6.5, 2.5, 6.5), L(-1, 8, 1, 8)], pins: [pin('1', 0, 0, 'PE')],
  },

  // Klemmen & verwijzingen
  {
    id: 'std/terminal', name: 'Klem', folder: F('Klemmen & verwijzingen'), prefix: 'X', role: 'terminal',
    graphics: [L(0, 0, 0, 3.5), C(0, 5, 1.5, WHITE), L(0, 6.5, 0, 10), T(2.3, 5, '{number}', 2.2)],
    pins: [pin('a', 0, 0, ''), pin('b', 0, 10, '')], bridges: [['a', 'b']], tagAt: { x: -2.5, y: 5, anchor: 'end' },
    props: { strip: '-X1' },
  },
  {
    id: 'std/terminal-pe', name: 'PE-klem', folder: F('Klemmen & verwijzingen'), prefix: 'X', role: 'terminal',
    graphics: [L(0, 0, 0, 3.5), C(0, 5, 1.5, WHITE), L(-1.06, 6.06, 1.06, 3.94), L(0, 6.5, 0, 10), T(2.3, 5, '{number}', 2.2)],
    pins: [pin('a', 0, 0, ''), pin('b', 0, 10, '')], bridges: [['a', 'b']], tagAt: { x: -2.5, y: 5, anchor: 'end' },
    props: { strip: '-X1', pe: true },
  },
  {
    id: 'std/link-out', name: 'Onderbrekingspunt', folder: F('Klemmen & verwijzingen'), role: 'link',
    graphics: [L(0, 0, 0, 4), P('M -2 4 L 2 4 L 0 7 Z', INK), T(0, 9.5, '{name}', 2.5, 'middle')], pins: [pin('1', 0, 0, '')],
    props: { name: 'A' },
  },

  // PLC
  {
    id: 'std/plc-di', name: 'PLC ingang', folder: F('PLC'), prefix: 'A', role: 'contact', plc: 'DI',
    graphics: [L(0, 0, 0, 5), R(-6, 5, 12, 7), T(0, 8.5, '{addr}', 2, 'middle')], pins: [pin('1', 0, 0, '')],
    tagAt: { x: -8, y: 8.5, anchor: 'end' }, props: { addr: 'I0.0' },
  },
  {
    id: 'std/plc-do', name: 'PLC uitgang', folder: F('PLC'), prefix: 'A', role: 'contact', plc: 'DO',
    graphics: [R(-6, 0, 12, 7), L(0, 7, 0, 10), T(0, 3.5, '{addr}', 2, 'middle')], pins: [pin('1', 0, 10, '')],
    tagAt: { x: -8, y: 3.5, anchor: 'end' }, props: { addr: 'Q0.0' },
  },
  {
    id: 'std/plc-ai', name: 'PLC analoge ingang', folder: F('PLC'), prefix: 'A', role: 'contact', plc: 'AI',
    graphics: [L(0, 0, 0, 5), R(-7, 5, 14, 7), T(0, 8.5, '{addr}', 2, 'middle'), T(-6.3, 6.6, '∿', 1.6)], pins: [pin('1', 0, 0, '')],
    tagAt: { x: -9, y: 8.5, anchor: 'end' }, props: { addr: 'IW64' },
  },
  {
    id: 'std/plc-ao', name: 'PLC analoge uitgang', folder: F('PLC'), prefix: 'A', role: 'contact', plc: 'AO',
    graphics: [R(-7, 0, 14, 7), L(0, 7, 0, 10), T(0, 3.5, '{addr}', 2, 'middle'), T(-6.3, 1.6, '∿', 1.6)], pins: [pin('1', 0, 10, '')],
    tagAt: { x: -9, y: 3.5, anchor: 'end' }, props: { addr: 'QW64' },
  },
  {
    id: 'std/plc-card-di', name: 'PLC kaart DI', folder: F('PLC'), prefix: 'A', role: 'main', build: plcCard('DI'),
    tagAt: { x: -7, y: 10, anchor: 'end' }, props: { channels: 8, start: 'I0.0' },
  },
  {
    id: 'std/plc-card-do', name: 'PLC kaart DO', folder: F('PLC'), prefix: 'A', role: 'main', build: plcCard('DO'),
    tagAt: { x: -7, y: 10, anchor: 'end' }, props: { channels: 8, start: 'Q0.0' },
  },
  {
    id: 'std/plc-card-ai', name: 'PLC kaart AI', folder: F('PLC'), prefix: 'A', role: 'main', build: plcCard('AI'),
    tagAt: { x: -7, y: 10, anchor: 'end' }, props: { channels: 4, start: 'IW64' },
  },
  {
    id: 'std/plc-card-ao', name: 'PLC kaart AO', folder: F('PLC'), prefix: 'A', role: 'main', build: plcCard('AO'),
    tagAt: { x: -7, y: 10, anchor: 'end' }, props: { channels: 2, start: 'QW64' },
  },
  {
    id: 'std/plc-cpu', name: 'PLC CPU', folder: F('PLC'), prefix: 'A', role: 'main',
    graphics: [R(-5, 5, 30, 20), L(0, 0, 0, 5), L(10, 0, 10, 5), T(10, 13, 'CPU', 3.5, 'middle'), T(10, 19, '{desc}', 2.2, 'middle')],
    pins: [pin('L', 0, 0, 'L+'), pin('M', 10, 0, 'M')], pinText: true, tagAt: { x: -8, y: 15, anchor: 'end' },
  },

  // Sensoren
  {
    id: 'std/sensor-pnp', name: 'Inductieve sensor PNP', folder: F('Sensoren'), prefix: 'B', role: 'device',
    graphics: [
      R(-5, 8, 20, 14), P('M 5 11 L 8.5 15 L 5 19 L 1.5 15 Z'), L(3.5, 15, 6.5, 15), L(0, 0, 0, 8), L(10, 0, 10, 8), L(0, 22, 0, 30),
    ],
    pins: [pin('BN', 0, 0, 'BN'), pin('BK', 10, 0, 'BK'), pin('BU', 0, 30, 'BU')], pinText: true, tagAt: { x: -8, y: 15, anchor: 'end' },
  },

  // Passieve componenten
  {
    id: 'std/resistor', name: 'Weerstand', folder: F('Passief'), prefix: 'R', role: 'device',
    graphics: [R(-2, 4, 4, 12), L(0, 0, 0, 4), L(0, 16, 0, 20)], pins: twoPins('1', '2'), tagAt: { x: -5, y: 10, anchor: 'end' },
  },
  {
    id: 'std/capacitor', name: 'Condensator', folder: F('Passief'), prefix: 'C', role: 'device',
    graphics: [L(0, 0, 0, 9), L(-4, 9, 4, 9), L(-4, 11, 4, 11), L(0, 11, 0, 20)], pins: twoPins('1', '2'), tagAt: { x: -6, y: 10, anchor: 'end' },
  },
  {
    id: 'std/diode', name: 'Diode', folder: F('Passief'), prefix: 'V', role: 'device',
    graphics: [P('M -3.5 7 L 3.5 7 L 0 13 Z'), L(-3.5, 13, 3.5, 13), L(0, 0, 0, 7), L(0, 13, 0, 20)], pins: twoPins('A', 'K'), tagAt: { x: -6, y: 10, anchor: 'end' },
  },
];
