// Rooms on a floor plan and their external influences (uitwendige invloeden, AREI Boek 1 2.10).
// A room is either found automatically between the walls around a point you clicked (`seed`), or
// drawn as corners (`pts`) that can hang on wall corners and then follow the walls when they move.
import { uid } from '../util.js';
import { polygonArea } from './model.js';
import { wallCorners, wallPolygon } from './render.js';

/** The external influences with their classes (code → [name, [description per class]]). */
export const INFLUENCES = [
  ['AA', 'Omgevingstemperatuur', ['Uiterst koud (-60 °C tot +5 °C)', 'Zeer koud (-40 °C tot +5 °C)', 'Koud (-25 °C tot +5 °C)', 'Gematigd (-5 °C tot +40 °C)', 'Warm (+5 °C tot +40 °C)', 'Zeer warm (+5 °C tot +60 °C)', 'Koud (-15 °C tot +25 °C), buiten de lokalen', 'Gematigd (+5 °C tot +30 °C), gewoonlijk verwarmde lokalen']],
  ['AD', 'Aanwezigheid van water', ['Te verwaarlozen – droge ruimten', 'Tijdelijk vochtig – druppels, condensatie', 'Vochtig – water langs wanden, regen', 'Nat – spatten in alle richtingen', 'Besproeid – waterstralen onder druk', 'Inwerking van watermassa’s', 'Overstroomd (≤ 1 m)', 'Ondergedompeld (> 1 m)']],
  ['AE', 'Aanwezigheid van vreemde vaste lichamen', ['Verwaarloosbaar', 'Kleine voorwerpen (≥ 2,5 mm)', 'Zeer kleine voorwerpen (≥ 1 mm)', 'Stofdeeltjes']],
  ['AF', 'Aanwezigheid van corrosieve en vervuilende stoffen', ['Verwaarloosbaar', 'Van atmosferische oorsprong', 'Afwisselend of toevallig', 'Bestendig']],
  ['AG', 'Mechanische belastingen door schokken', ['Huishoudelijk gebruik (≤ 1 J)', 'Normaal industrieel gebruik (≤ 6 J)', 'Zwaar industrieel gebruik (≤ 60 J)']],
  ['AH', 'Mechanische belastingen door trillingen', ['Zwak – geen trillingen', 'Middelmatig – zwakke trillingen', 'Belangrijk – belangrijke trillingen']],
  ['AK', 'Aanwezigheid van flora en/of schimmelvorming', ['Verwaarloosbaar', 'Mogelijk – speciale bescherming']],
  ['AL', 'Aanwezigheid van fauna', ['Verwaarloosbaar', 'Mogelijk – speciale bescherming']],
  ['AM', 'Elektromagnetische, elektrostatische of ioniserende invloeden', ['Geen schadelijke invloeden', 'Zwerfstromen', 'Elektromagnetische stralingen', 'Ioniserende stralingen', 'Elektrostatische invloeden', 'Inductiestromen']],
  ['AN', 'Zonnestraling', ['Te verwaarlozen', 'Schadelijk door duur of intensiteit']],
  ['BA', 'Bekwaamheid van personen', ['Gewone', 'Kinderen', 'Gehandicapten', 'Gewaarschuwde', 'Vakbekwame']],
  ['BB', 'Toestand van het menselijk lichaam', ['Normaal – droge huid', 'Laag – natte huid', 'Zeer laag – ondergedompeld']],
  ['BC', 'Aanraking van het aardpotentiaal door personen', ['Geen', 'Zwak', 'Veelvuldig', 'Voortdurend']],
  ['BD', 'Ontruiming van personen in noodgevallen', ['Normaal', 'Lang', 'Overbezet', 'Lang en overbezet']],
  ['BE', 'Aard van behandelde of opgeslagen goederen', ['Verwaarloosbaar risico', 'Brandgevaar', 'Ontploffingsgevaar', 'Gevaar voor bezoedeling']],
  ['CA', 'Bouwmaterialen', ['Niet brandbaar', 'Brandbaar']],
  ['CB', 'Structuur van gebouwen', ['Verwaarloosbare risico’s', 'Verspreiding van het vuur', 'Bewegend', 'Instabiel of buigzaam']],
];

/** The "normaal lokaal" of the Normec overview (page 19). */
export const NORMAL = { AA: [4, 5, 8], AD: [1], AE: [1], AF: [1], AG: [1], AH: [1], AK: [1], AL: [1], AM: [1], AN: [1], BA: [1], BB: [1], BC: [1, 2, 3], BD: [1], BE: [1], CA: [1], CB: [1] };

/** Room templates: name, colour on the plan and the codes that differ from a normal room. */
export const PRESETS = {
  normal: { label: 'Normaal lokaal (woonkamer, slaapkamer …)', color: '#dbeafe', infl: {} },
  kitchen: { label: 'Keuken', color: '#e0f2fe', infl: { AD: [2] } },
  bathroom: { label: 'Badkamer / douche', color: '#cffafe', infl: { AD: [2], BB: [2], BC: [3] } },
  wc: { label: 'WC', color: '#e0f2fe', infl: { AD: [2] } },
  laundry: { label: 'Wasplaats / berging', color: '#e0f2fe', infl: { AD: [2] } },
  cellar: { label: 'Kelder', color: '#e7e5e4', infl: { AD: [2] } },
  attic: { label: 'Zolder', color: '#f5f5f4', infl: { AA: [4, 5] } },
  garage: { label: 'Garage (individueel)', color: '#e5e7eb', infl: { AD: [2], AF: [3] } },
  technical: { label: 'Technische ruimte / stookruimte', color: '#ffedd5', infl: { AA: [5, 6], AF: [3], AH: [2], BE: [2] } },
  terrace: { label: 'Overdekt terras', color: '#dcfce7', infl: { AA: [3, 5], AD: [2] } },
  outside: { label: 'Buiten', color: '#d1fae5', infl: { AA: [3, 5], AD: [3], AN: [2] } },
};

export const presetInfl = (key) => ({ ...structuredClone(NORMAL), ...structuredClone(PRESETS[key]?.infl || {}) });

/** Template guessed from a room name ("Badkamer 1" → bathroom). */
export function guessPreset(name) {
  const n = String(name || '').toLowerCase();
  const rules = [[/bad|douche|sauna/, 'bathroom'], [/keuken|kitchen|cuisine/, 'kitchen'], [/wc|toilet/, 'wc'], [/was|berging|bijkeuken/, 'laundry'],
    [/kelder/, 'cellar'], [/zolder/, 'attic'], [/garage|carport/, 'garage'], [/techn|stook|ketel|boiler/, 'technical'], [/terras|veranda/, 'terrace'], [/buiten|tuin|oprit/, 'outside']];
  return rules.find(([re]) => re.test(n))?.[1] || 'normal';
}

export function newRoom(o = {}) {
  return { id: uid('rm'), name: '', preset: 'normal', infl: presetInfl('normal'), pub: false, ...o };
}

/** Codes that differ from a normal room, e.g. ["AD2", "BB2"]. */
export function deviations(room) {
  const out = [];
  for (const [code] of INFLUENCES) {
    const v = room.infl?.[code] || [];
    const n = NORMAL[code];
    if (v.length && (v.length !== n.length || v.some((x, i) => x !== n[i]))) out.push(code + v.join(','));
  }
  return out;
}

export const roomColor = (room) => room.color || PRESETS[room.preset]?.color || '#dbeafe';

// ---------- geometry ----------

/** Position of a corner point of a manually drawn room: free, or hanging on a wall corner. */
export function cornerPoint(floor, p) {
  if (!p.w) return [p.x, p.y];
  const w = floor.walls.find((x) => x.id === p.w);
  if (!w) return [p.x, p.y];
  const c = wallCorners(w, floor.walls)[p.end ? 's1' : 's0'][p.side > 0 ? 'plus' : 'minus'];
  return c;
}

const CELL = 2.5; // cm, raster used to find the room around a point
const cache = new Map();
const wallsKey = (floor) => floor.walls.map((w) => `${w.id}:${w.x1},${w.y1},${w.x2},${w.y2},${w.t},${w.cx ?? ''},${w.cy ?? ''}`).join('|');

/** Outline of a room in plan cm, or null when the room is not closed. */
export function roomPolygon(floor, room) {
  if (room.pts) return room.pts.map((p) => cornerPoint(floor, p));
  if (!room.seed) return null;
  const key = `${room.seed}|${wallsKey(floor)}`;
  const hit = cache.get(room.id);
  if (hit?.key === key) return hit.pts;
  const pts = traceRoom(floor, room.seed);
  cache.set(room.id, { key, pts });
  return pts;
}

export const roomArea = (pts) => (pts ? polygonArea(pts) / 10000 : 0);

/** Label position: the stored one, or the middle of the room. */
export function roomLabelPos(room, pts) {
  if (room.lx != null) return [room.lx, room.ly];
  if (room.seed) return room.seed;
  if (!pts?.length) return [0, 0];
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
}

const inPoly = (x, y, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/** Finds the area enclosed by walls around (x, y): raster, flood fill, outline, simplification. */
function traceRoom(floor, [sx, sy]) {
  const polys = floor.walls.map((w) => wallPolygon(w, floor.walls));
  if (!polys.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of polys) for (const [x, y] of p) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  x0 -= 2 * CELL; y0 -= 2 * CELL; x1 += 2 * CELL; y1 += 2 * CELL;
  if (sx < x0 || sx > x1 || sy < y0 || sy > y1) return null;
  const W = Math.ceil((x1 - x0) / CELL), H = Math.ceil((y1 - y0) / CELL);
  if (W * H > 4e6) return null;
  const grid = new Uint8Array(W * H); // 1 = wall, 2 = room
  for (const p of polys) {
    let px0 = Infinity, py0 = Infinity, px1 = -Infinity, py1 = -Infinity;
    for (const [x, y] of p) { px0 = Math.min(px0, x); py0 = Math.min(py0, y); px1 = Math.max(px1, x); py1 = Math.max(py1, y); }
    const i0 = Math.max(0, Math.floor((px0 - x0) / CELL)), i1 = Math.min(W - 1, Math.ceil((px1 - x0) / CELL));
    const j0 = Math.max(0, Math.floor((py0 - y0) / CELL)), j1 = Math.min(H - 1, Math.ceil((py1 - y0) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (inPoly(x0 + (i + 0.5) * CELL, y0 + (j + 0.5) * CELL, p)) grid[j * W + i] = 1;
    }
  }
  const si = Math.floor((sx - x0) / CELL), sj = Math.floor((sy - y0) / CELL);
  if (grid[sj * W + si]) return null;
  // flood fill; reaching the border means the room is open
  const stack = [sj * W + si];
  grid[sj * W + si] = 2;
  while (stack.length) {
    const c = stack.pop();
    const i = c % W, j = (c - i) / W;
    if (i === 0 || j === 0 || i === W - 1 || j === H - 1) return null;
    for (const n of [c - 1, c + 1, c - W, c + W]) if (!grid[n]) { grid[n] = 2; stack.push(n); }
  }
  // boundary edges with the room on the right, chained into loops; the longest loop is the outline
  const next = new Map();
  const key = (i, j) => j * (W + 1) + i;
  const room = (i, j) => i >= 0 && j >= 0 && i < W && j < H && grid[j * W + i] === 2;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (!room(i, j)) continue;
    if (!room(i, j - 1)) next.set(key(i, j), key(i + 1, j));
    if (!room(i + 1, j)) next.set(key(i + 1, j), key(i + 1, j + 1));
    if (!room(i, j + 1)) next.set(key(i + 1, j + 1), key(i, j + 1));
    if (!room(i - 1, j)) next.set(key(i, j + 1), key(i, j));
  }
  let best = null;
  const seen = new Set();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    for (let k = start; !seen.has(k) && next.has(k); k = next.get(k)) { seen.add(k); loop.push(k); }
    if (!best || loop.length > best.length) best = loop;
  }
  if (!best || best.length < 4) return null;
  const pts = best.map((k) => [x0 + (k % (W + 1)) * CELL, y0 + Math.floor(k / (W + 1)) * CELL]);
  // straight lines from the staircase, then corners pulled onto the real wall corners
  const simple = simplify(pts, CELL * 1.2);
  const corners = polys.flat();
  return simple.map(([x, y]) => {
    let bestC = null, bd = CELL * 2.5;
    for (const c of corners) { const d = Math.hypot(c[0] - x, c[1] - y); if (d < bd) { bd = d; bestC = c; } }
    return bestC ? [Math.round(bestC[0] * 10) / 10, Math.round(bestC[1] * 10) / 10] : [x, y];
  });
}

/** Douglas–Peucker on a closed polygon. */
function simplify(pts, eps) {
  const dp = (a, b, list, out) => {
    let idx = -1, dmax = eps;
    const [ax, ay] = list[a], [bx, by] = list[b];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - list[i][1]) - (ax - list[i][0]) * (by - ay)) / len;
      if (d > dmax) { dmax = d; idx = i; }
    }
    if (idx < 0) { out.push(list[a]); return; }
    dp(a, idx, list, out);
    dp(idx, b, list, out);
  };
  // split the loop at its two farthest points so both halves are open polylines
  let far = 0, fd = 0;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > fd) { fd = d; far = i; } }
  const a = pts.slice(0, far + 1), b = [...pts.slice(far), pts[0]];
  const out = [];
  dp(0, a.length - 1, a, out);
  dp(0, b.length - 1, b, out);
  return out;
}
