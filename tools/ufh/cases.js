// Test plans for the floor heating generator (cm).
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

export const CASES = {
  // a ground floor like the one the generator was first tried on: manifold in the laundry room
  woning: {
    spacing: 15, maxLen: 100, margin: 10,
    rooms: [
      { id: 'garage', name: 'garage', poly: rect(15, 15, 713, 363), heat: false },
      { id: 'was', name: 'wasplaats', poly: rect(727, 15, 1153, 363) },
      { id: 'inkom', name: 'inkom', poly: rect(367, 377, 1153, 523) },
      { id: 'hal', name: 'hal', poly: rect(15, 377, 353, 985) },
      { id: 'wc', name: 'wc', poly: rect(367, 537, 673, 723) },
      { id: 'berging', name: 'berging', poly: rect(367, 737, 673, 985) },
      { id: 'keuken', name: 'keuken', poly: rect(687, 537, 1160, 985) },
      { id: 'living', name: 'living', poly: rect(1167, 15, 1885, 600) },
      { id: 'eet', name: 'eetruimte', poly: rect(1160, 600, 1885, 985) },
    ],
    doors: [
      { a: [995, 370], b: [1085, 370] }, // wasplaats – inkom
      { a: [1160, 105], b: [1160, 195] }, // wasplaats – living
      { a: [1160, 420], b: [1160, 520] }, // inkom – living
      { a: [360, 385], b: [360, 475] }, // inkom – hal
      { a: [515, 530], b: [605, 530] }, // inkom – wc
      { a: [1010, 530], b: [1110, 530] }, // inkom – keuken
      { a: [680, 815], b: [680, 905] }, // berging – keuken
      { a: [1160, 607], b: [1160, 985] }, // keuken – eetruimte (open)
      { a: [1167, 600], b: [1885, 600] }, // living – eetruimte (open)
    ],
    collector: { x: 900, y: 363, name: 'VV2' },
  },
  // one room, one loop
  kamer: {
    rooms: [{ id: 'k', name: 'kamer', poly: rect(0, 0, 400, 300) }],
    doors: [], collector: { x: 200, y: 300 },
  },
  // L-shaped room with a hall in between
  lvorm: {
    rooms: [
      { id: 'tech', name: 'technisch', poly: rect(0, 0, 200, 250) },
      { id: 'gang', name: 'gang', poly: rect(210, 0, 330, 600) },
      { id: 'l', name: 'leefruimte', poly: [[340, 0], [900, 0], [900, 600], [600, 600], [600, 330], [340, 330]] },
      { id: 'slaap', name: 'slaapkamer', poly: rect(0, 260, 200, 600) },
      { id: 'bad', name: 'badkamer', poly: rect(340, 340, 590, 600) },
    ],
    doors: [
      { a: [205, 60], b: [205, 150] }, { a: [335, 100], b: [335, 190] }, { a: [205, 400], b: [205, 490] }, { a: [335, 420], b: [335, 500] },
    ],
    collector: { x: 100, y: 0 },
  },
  // manifold on a side wall, a kitchen island that gets no pipes, bathroom at 10 cm
  eiland: {
    rooms: [
      { id: 'leef', name: 'leefruimte', poly: rect(0, 0, 820, 520) },
      { id: 'bad', name: 'badkamer', poly: rect(830, 0, 1100, 250), spacing: 10 },
      { id: 'slk', name: 'slaapkamer', poly: rect(830, 260, 1100, 520) },
    ],
    doors: [{ a: [825, 80], b: [825, 170] }, { a: [825, 340], b: [825, 430] }],
    blocked: [[300, 200, 520, 300]],
    collector: { x: 0, y: 260 },
  },
  // U-shaped room around a patio, manifold in a small technical room
  uvorm: {
    rooms: [
      { id: 'u', name: 'woonkamer', poly: [[0, 0], [1000, 0], [1000, 700], [700, 700], [700, 300], [300, 300], [300, 700], [0, 700]] },
      { id: 't', name: 'techniek', poly: rect(0, 710, 290, 900) },
      { id: 'b', name: 'bureau', poly: rect(710, 710, 1000, 1000) },
    ],
    doors: [{ a: [100, 705], b: [190, 705] }, { a: [800, 705], b: [890, 705] }],
    collector: { x: 290, y: 800 },
  },
  // long corridor with rooms on both sides, manifold at the end
  gang: {
    rooms: [
      { id: 'g', name: 'gang', poly: rect(0, 300, 1200, 420) },
      ...[0, 1, 2, 3].map((i) => ({ id: 'n' + i, name: 'kamer N' + (i + 1), poly: rect(i * 300, 0, i * 300 + 290, 290) })),
      ...[0, 1, 2, 3].map((i) => ({ id: 'z' + i, name: 'kamer Z' + (i + 1), poly: rect(i * 300, 430, i * 300 + 290, 760) })),
    ],
    doors: [
      ...[0, 1, 2, 3].map((i) => ({ a: [i * 300 + 100, 295], b: [i * 300 + 190, 295] })),
      ...[0, 1, 2, 3].map((i) => ({ a: [i * 300 + 100, 425], b: [i * 300 + 190, 425] })),
    ],
    collector: { x: 0, y: 360 },
  },
};
