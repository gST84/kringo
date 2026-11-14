// Ventilation flows of a dwelling (Belgium, NBN D 50-001 / EPB): per room the nominal supply (dry rooms)
// or extract (wet rooms) flow, the transfer opening, the totals for the unit, and labels on the
// ventilation plan. Rooms carry their choice in r.vent = { type?, flow? } (flow: own design flow, m³/h).
import { t } from '../i18n.js';
import { uid } from '../util.js';
import { isDivider, isFixture, newPlan, wallGeom } from './model.js';
import { planK } from './render.js';
import { roomAt } from './heating.js';
import { isCustomPreset, roomArea, roomLabelPos, roomPolygon } from './rooms.js';

/**
 * Room types: side 'T' (toevoer, supply) or 'A' (afvoer, extract), m³/h per m² floor area, minimum and
 * the maximum the flow may be limited to; `fixed`: a fixed flow. Transfer opening in cm².
 */
export const VENT_TYPES = {
  living: { label: 'Woonkamer / leefruimte', side: 'T', perM2: 3.6, min: 75, max: 150, transfer: 140 },
  bed: { label: 'Slaap-, studeer- of speelkamer', side: 'T', perM2: 3.6, min: 25, max: 72, transfer: 140 },
  kitchen: { label: 'Gesloten keuken', side: 'A', perM2: 3.6, min: 50, max: 75, transfer: 140 },
  'kitchen-open': { label: 'Open keuken', side: 'A', fixed: 75, transfer: 0 },
  bath: { label: 'Badkamer / douche', side: 'A', perM2: 3.6, min: 50, max: 75, transfer: 140 },
  laundry: { label: 'Wasplaats', side: 'A', perM2: 3.6, min: 50, max: 75, transfer: 140 },
  wc: { label: 'WC', side: 'A', fixed: 25, transfer: 70 },
  hall: { label: 'Gang / hal / trap (doorstroming)', side: '', transfer: 0 },
  none: { label: 'Geen ventilatie (berging, garage, technisch …)', side: '' },
};

/** Type of a room from its own choice, its template and its name. */
export function ventType(r) {
  if (VENT_TYPES[r.vent?.type]) return r.vent.type;
  const n = String(r.name || '').toLowerCase();
  const p = r.preset || 'normal';
  if (p === 'bathroom' || /bad|douche/.test(n)) return 'bath';
  if (p === 'wc' || /\bwc\b|toilet/.test(n)) return 'wc';
  if (p === 'kitchen' || /keuken/.test(n)) return /open/.test(n) ? 'kitchen-open' : 'kitchen';
  if (/was(plaats|ruimte)|bijkeuken/.test(n)) return 'laundry';
  if (p === 'laundry') return /was/.test(n) ? 'laundry' : 'none';
  if (p !== 'normal' && !isCustomPreset(p)) return 'none';
  if (/hal\b|gang|inkom|overloop|trap|vestiaire|traphal/.test(n)) return 'hall';
  if (/slaap|kamer|bureau|studeer|speel|logeer/.test(n) && !/woon|leef|zit|eet/.test(n)) return 'bed';
  if (/berging|garage|kelder|zolder|techn/.test(n)) return 'none';
  return 'living';
}

/** Required flow (m³/h) of a room type for a floor area; `limit`: use the maximum the norm allows. */
export function requiredFlow(type, area, limit = true) {
  const v = VENT_TYPES[type];
  if (!v?.side) return 0;
  if (v.fixed) return v.fixed;
  const f = Math.max(v.min, v.perM2 * area);
  return Math.ceil(limit && v.max ? Math.min(f, v.max) : f);
}

/** Ventilation systems: which side is mechanical (fan) – T supply, A extract. */
export const VENT_SYSTEMS = {
  A: { label: 'A – natuurlijke toe- en afvoer', mech: '' },
  B: { label: 'B – mechanische toevoer, natuurlijke afvoer', mech: 'T' },
  C: { label: 'C – natuurlijke toevoer, mechanische afvoer', mech: 'A' },
  D: { label: 'D – mechanische toe- en afvoer (balansventilatie)', mech: 'TA' },
};
export const ventCfg = (b) => ({ limit: true, system: 'D', balance: true, ...(b.ventCfg || {}) });

/** Splits a total over n parts in whole m³/h (the first parts get the remainder). */
const split = (total, n) => Array.from({ length: n }, (_, i) => Math.floor(total / n) + (i < total % n ? 1 : 0));

/**
 * All rooms of the building with their flows and the balance:
 * rows [{ floor, room, name, area, type, side, required, flow (design), bal (balanced), transfer, valves: [{ s, flow }] }],
 * totals { supply, extract } (design), { supplyBal, extractBal }, unit (flow of the fan(s)), factor (of the raised
 * side), raised ('T' / 'A' / ''), warnings.
 */
export function ventRows(b) {
  const cfg = ventCfg(b);
  const rows = [];
  const warnings = [];
  for (const floor of b.floors) for (const r of floor.rooms) {
    const area = Math.round(roomArea(roomPolygon(floor, r)) * 10) / 10;
    const type = ventType(r);
    const v = VENT_TYPES[type];
    const required = requiredFlow(type, area, cfg.limit);
    const own = parseFloat(r.vent?.flow);
    const flow = v.side ? (own > 0 ? Math.round(own) : required) : 0;
    rows.push({ floor, room: r, name: r.name || '?', area, type, side: v.side, required, flow, bal: flow, transfer: v.transfer || 0, valves: [] });
  }
  const sum = (side, k) => rows.filter((x) => x.side === side).reduce((s, x) => s + x[k], 0);
  const supply = sum('T', 'flow'), extract = sum('A', 'flow');

  // balance (system D): the smaller side is raised in proportion to the flows of its rooms
  let raised = '', factor = 1;
  if (cfg.system === 'D' && cfg.balance && supply && extract && supply !== extract) {
    raised = supply < extract ? 'T' : 'A';
    const target = Math.max(supply, extract), from = Math.min(supply, extract);
    factor = target / from;
    const list = rows.filter((x) => x.side === raised);
    for (const x of list) x.bal = Math.ceil(x.flow * factor);
    // rounding up gives a little too much: take it off the largest rooms
    let over = list.reduce((s, x) => s + x.bal, 0) - target;
    for (const x of [...list].sort((p, q) => q.bal - p.bal)) { if (over <= 0) break; x.bal--; over--; }
  } else if (cfg.system === 'D' && cfg.balance && supply !== extract) {
    warnings.push(t('Geen balans mogelijk: er zijn geen ruimtes met {s}.', { s: supply ? t('afvoer') : t('toevoer') }));
  }
  const supplyBal = sum('T', 'bal'), extractBal = sum('A', 'bal');
  const mech = VENT_SYSTEMS[cfg.system]?.mech || '';
  const unit = mech === 'TA' ? Math.max(supplyBal, extractBal) : mech === 'T' ? supplyBal : mech === 'A' ? extractBal : 0;

  // valves on the ventilation plans: the room's flow split over its valves (setting values)
  let anyValve = false;
  for (const floor of b.floors) {
    for (const s of floor.symbols) {
      const side = s.sym === 'hvac/vent-in' ? 'T' : s.sym === 'hvac/vent-out' ? 'A' : '';
      if (!side) continue;
      anyValve = true;
      const hit = roomAt(floor, s.x, s.y);
      const row = hit && rows.find((x) => x.room === hit.room);
      if (!row) { warnings.push(t('{v} op {f} staat in geen ruimte.', { v: t(side === 'T' ? 'Toevoerventiel' : 'Afvoerventiel'), f: floor.name })); continue; }
      if (row.side !== side) { warnings.push(t('{v} in {r}: die ruimte krijgt {s}.', { v: t(side === 'T' ? 'Toevoerventiel' : 'Afvoerventiel'), r: row.name, s: row.side === 'T' ? t('toevoer') : row.side === 'A' ? t('afvoer') : t('geen ventilatie') })); continue; }
      row.valves.push({ s });
    }
  }
  for (const x of rows) {
    if (x.valves.length) split(x.bal, x.valves.length).forEach((f, i) => { x.valves[i].flow = f; });
    else if (anyValve && x.side && x.bal && mechSide(cfg, x.side)) warnings.push(t('{r}: nog geen {v} op het plan.', { r: x.name, v: t(x.side === 'T' ? 'toevoerventiel' : 'afvoerventiel') }));
  }
  return { rows, supply, extract, supplyBal, extractBal, unit, raised, factor, warnings, cfg };
}
/** Is this side mechanical (valves to set) in the chosen system? */
const mechSide = (cfg, side) => (VENT_SYSTEMS[cfg.system]?.mech || '').includes(side);

const COLOR = { T: '#1c7ed6', A: '#c2410c' };
/** Generated ventilation labels: room flows, valve settings, doors / windows. */
export const VENT_GEN = ['vent', 'vent-valve', 'vent-door'];
/** "T 75 m³/h" (supply) or "A 50 m³/h" (extract), translated. */
export const flowText = (side, flow) => t(side === 'T' ? 'T {f} m³/h' : 'A {f} m³/h', { f: flow });

/**
 * Puts a label "T 75 m³/h" / "A 50 m³/h" (the balanced flow) under the name of every ventilated room, and
 * the setting of each valve next to it, on the ventilation plan of its floor (made when missing). Labels
 * put there before are replaced; moved ones keep their place. Call inside app.mutate. Returns the number
 * of labels.
 */
export function placeVentLabels(b) {
  const res = ventRows(b);
  const { rows } = res;
  const air = ventAirflow(b, res);
  const k = planK(b);
  let n = 0;
  for (const floor of b.floors) {
    const mine = rows.filter((x) => x.floor === floor && x.side && x.bal);
    const old = new Map((floor.shapes || []).filter((sh) => sh.gen === 'vent' || sh.gen === 'vent-valve').map((sh) => [sh.gen + ':' + (sh.room || sh.valve), sh]));
    floor.shapes = (floor.shapes || []).filter((sh) => !VENT_GEN.includes(sh.gen));
    if (!mine.length) continue;
    let pl = b.plans.find((p) => p.floor === floor.id && p.disc === 'vent');
    if (!pl) { pl = newPlan(floor.id, 'vent'); b.plans.push(pl); }
    for (const x of mine) {
      const prev = old.get('vent:' + x.room.id);
      const [lx, ly] = roomLabelPos(x.room, roomPolygon(floor, x.room));
      const at = prev?.pts?.[0] || [Math.round(lx), Math.round(ly + 14 / k)];
      floor.shapes.push({
        id: uid('sh'), type: 'callout', gen: 'vent', room: x.room.id, plan: pl.id, pts: [at],
        text: flowText(x.side, x.bal), color: COLOR[x.side], size: 3,
      });
      n++;
      for (const v of x.valves) {
        const p = old.get('vent-valve:' + v.s.id);
        floor.shapes.push({
          id: uid('sh'), type: 'callout', gen: 'vent-valve', valve: v.s.id, plan: pl.id,
          pts: [[v.s.x, v.s.y], p?.pts?.length ? p.pts[p.pts.length - 1] : [Math.round(v.s.x + 9 / k), Math.round(v.s.y - 7 / k)]],
          text: `${v.flow} m³/h`, color: COLOR[x.side], size: 2.5,
        });
        n++;
      }
    }
    // air through the doors (arrow across the door + flow) and the window grilles (system C)
    const mm = 1 / k;
    for (const d of air.doors.filter((x) => x.floor === floor && x.flow)) {
      const [x, y] = d.at, [dx, dy] = d.dir;
      const text = d.kind === 'stair' ? t('↕ {f} m³/h', { f: d.flow }) : `${d.flow} m³/h`;
      if (dx || dy) {
        floor.shapes.push({ id: uid('sh'), type: 'line', gen: 'vent-door', plan: pl.id, pts: [[Math.round(x - dx * 8 * mm), Math.round(y - dy * 8 * mm)], [Math.round(x + dx * 8 * mm), Math.round(y + dy * 8 * mm)]], arrow: 'end', color: '#2f9e44', width: 0.35 });
      }
      floor.shapes.push({ id: uid('sh'), type: 'callout', gen: 'vent-door', plan: pl.id, pts: [[Math.round(x + dx * 15 * mm), Math.round(y + dy * 15 * mm)]], text, color: '#2f9e44', size: 2.5 });
      n++;
    }
    for (const w of air.windows.filter((x) => x.floor === floor)) {
      const [x, y] = w.at, [ix, iy] = w.inward;
      floor.shapes.push({ id: uid('sh'), type: 'callout', gen: 'vent-door', plan: pl.id, pts: [[Math.round(x + ix * 12 * mm), Math.round(y + iy * 12 * mm)]], text: t('rooster {f} m³/h', { f: w.flow }), color: '#1c7ed6', size: 2.5 });
      n++;
    }
  }
  return n;
}

/** Removes the flow labels of all floors (inside app.mutate); returns how many. */
export function clearVentLabels(b) {
  let n = 0;
  for (const f of b.floors) {
    const before = (f.shapes || []).length;
    f.shapes = (f.shapes || []).filter((sh) => !VENT_GEN.includes(sh.gen));
    n += before - f.shapes.length;
  }
  return n;
}

// ---------- air flow through doors and windows (systems C and D) ----------

/** Centre of a stair (cm). */
function stairCentre(st) {
  if (st.kind === 'spiral') return [st.x, st.y];
  const a = ((st.rot || 0) * Math.PI) / 180;
  return [st.x + (st.w / 2) * Math.cos(a) - (st.h / 2) * Math.sin(a), st.y + (st.w / 2) * Math.sin(a) + (st.h / 2) * Math.cos(a)];
}
const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 80;

/**
 * Stairs that join two floors for the air: st.link 'up' / 'down' / 'none', or automatically: up when the
 * floor above has a room at the stair (the stairwell / landing), down when the stair is only drawn on the
 * upper floor. A stair drawn on both floors counts once. Returns [{ floor, st, at, dir, a, b, other, warn }]
 * (a: room with the stair, b: room on the other floor, other: that floor).
 */
export function stairLinks(b) {
  const out = [];
  b.floors.forEach((floor, i) => {
    for (const st of floor.stairs || []) {
      if (isFixture(st)) continue;
      const at = stairCentre(st);
      const up = b.floors[i + 1], down = b.floors[i - 1];
      let dir = st.link || 'auto';
      if (dir === 'auto') {
        // the same stair drawn on the floor below already makes this link
        if (down && (down.stairs || []).some((x) => !isFixture(x) && near(stairCentre(x), at) && (x.link || 'auto') !== 'none')) continue;
        dir = up && roomAt(up, ...at) ? 'up' : down && roomAt(down, ...at) ? 'down' : 'up';
      }
      if (dir === 'none') continue;
      const other = dir === 'up' ? up : down;
      const a = roomAt(floor, ...at)?.room || null, bb = other ? roomAt(other, ...at)?.room || null : null;
      const warn = !other ? (b.floors.length > 1 ? t('Trap op {f}: er is geen verdieping {d}.', { f: floor.name, d: dir === 'up' ? t('erboven') : t('eronder') }) : '')
        : !a ? t('Trap op {f}: staat in geen ruimte.', { f: floor.name })
          : !bb ? t('Trap op {f}: op {o} ligt er geen ruimte boven / onder de trap (teken de overloop of hal als ruimte, op dezelfde plaats).', { f: floor.name, o: other.name }) : '';
      out.push({ floor, st, at, dir, a, b: bb, other, warn });
    }
  });
  return out;
}

/** Conductance of a connection between two rooms (relative; a door with a gap underneath = 1 per 83 cm). */
const CONDUCT = { door: 1, door2: 1.8, slide: 3, open: 12, divider: 25, stair: 25 };

/**
 * Air flow through the building for systems C and D: supply rooms push their flow into the network,
 * extract rooms draw theirs, halls pass it on. The network: rooms (nodes) and their doors, open doorways,
 * room dividers and stairs to the floor above (edges), solved like a resistor network (a pressure per
 * room, flow = conductance × pressure difference), so every door gets a flow and a direction.
 * System C: the supply of a dry room comes in through its windows (split by width) – the grille flows.
 * Returns { doors: [{ floor, o, from, to, flow, need, at, dir }], windows: [{ floor, o, room, flow, at, inward }],
 * warnings }.
 */
export function ventAirflow(b, res = ventRows(b)) {
  const { rows, cfg } = res;
  const out = { doors: [], windows: [], warnings: [] };
  if (cfg.system !== 'C' && cfg.system !== 'D') return out;
  const node = new Map(); // room → row
  for (const x of rows) node.set(x.room, x);
  // injection per room: + into the network (supply), − out of it (extract)
  // system C: the extract fan sets the real flow, the grilles (sized on the nominal supply) let in as much
  const sT = rows.filter((x) => x.side === 'T').reduce((q, x) => q + x.bal, 0);
  const sA = rows.filter((x) => x.side === 'A').reduce((q, x) => q + x.bal, 0);
  const fT = cfg.system === 'C' && sT && sA ? sA / sT : 1;
  const inj = new Map(rows.map((x) => [x.room, x.side === 'T' ? x.bal * fT : x.side === 'A' ? -x.bal : 0]));
  const edges = []; // { a: room, b: room, g, kind, floor, o?, at, n }
  const side = (floor, p, n, d) => roomAt(floor, p.x + n[0] * d, p.y + n[1] * d)?.room || null;

  for (const floor of b.floors) {
    const byId = new Map(floor.walls.map((w) => [w.id, w]));
    for (const o of floor.openings || []) {
      const w = byId.get(o.wall);
      if (!w || !['door', 'door2', 'slide', 'window'].includes(o.type)) continue;
      const g = wallGeom(w);
      const p = g.at(Math.max(0, Math.min(g.len, o.pos)));
      const d = (w.t || 20) / 2 + 15;
      const ra = side(floor, p, p.n, d), rb = side(floor, p, p.n, -d);
      if (ra && rb && ra !== rb) {
        if (o.type === 'window') continue; // an inner window: no air
        const kind = o.leaf === false ? 'open' : o.type;
        edges.push({ a: ra, b: rb, g: CONDUCT[kind] * Math.max(0.5, (o.width || 83) / (o.type === 'door2' ? 150 : 83)), kind, floor, o, at: [p.x, p.y], n: p.n });
      } else if ((ra || rb) && !(ra && rb) && (o.type === 'window' || o.type === 'slide')) {
        const room = ra || rb;
        out.windows.push({ floor, o, room, at: [p.x, p.y], inward: ra ? p.n : [-p.n[0], -p.n[1]], width: o.width || 100 });
      }
    }
    for (const w of floor.walls) {
      if (!isDivider(w)) continue;
      const g = wallGeom(w);
      const p = g.at(g.len / 2);
      const ra = side(floor, p, p.n, 15), rb = side(floor, p, p.n, -15);
      if (ra && rb && ra !== rb) edges.push({ a: ra, b: rb, g: CONDUCT.divider, kind: 'divider', floor, at: [p.x, p.y], n: p.n });
    }
  }
  // stairs: the room with the stair and the room on the next floor (stairLinks)
  for (const l of stairLinks(b)) if (l.warn) out.warnings.push(l.warn);
  for (const l of stairLinks(b)) if (l.a && l.b) edges.push({ a: l.a, b: l.b, g: CONDUCT.stair, kind: 'stair', floor: l.floor, at: l.at, n: [0, 0], st: l.st });

  // system C: the dry rooms get their supply through the windows
  if (cfg.system === 'C') {
    for (const x of rows.filter((r) => r.side === 'T' && r.bal)) {
      const wins = out.windows.filter((w) => w.room === x.room);
      if (!wins.length) { out.warnings.push(t('{r}: geen raam voor een toevoerrooster.', { r: x.name })); continue; }
      const tot = wins.reduce((s, w) => s + w.width, 0);
      let left = x.bal;
      wins.forEach((w, i) => { w.flow = i === wins.length - 1 ? left : Math.round((x.bal * w.width) / tot); left -= w.flow; });
    }
  }
  out.windows = out.windows.filter((w) => w.flow);

  // connected groups of rooms, each solved on its own
  const adj = new Map();
  for (const e of edges) for (const [p, q] of [[e.a, e.b], [e.b, e.a]]) { if (!adj.has(p)) adj.set(p, []); adj.get(p).push(q); }
  const seen = new Set();
  for (const start of rows.map((x) => x.room)) {
    if (seen.has(start)) continue;
    const comp = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) { const r = stack.pop(); comp.push(r); for (const q of adj.get(r) || []) if (!seen.has(q)) { seen.add(q); stack.push(q); } }
    const net = comp.reduce((s, r) => s + inj.get(r), 0);
    const active = comp.some((r) => inj.get(r));
    if (!active) continue;
    if (comp.length === 1) { out.warnings.push(t('{r}: geen deur of doorgang naar de rest van de woning; de lucht kan er niet {d}.', { r: node.get(comp[0]).name, d: inj.get(comp[0]) > 0 ? t('weg') : t('binnen') })); continue; }
    if (Math.abs(net) > 0.5) out.warnings.push(t('{r}: toe- en afvoer zijn hier niet in evenwicht ({n} m³/h); dat verschil gaat via kieren en ramen.', { r: comp.map((r) => node.get(r).name).join(', '), n: Math.round(net) }));
    // pressures: Laplacian (G) · p = injection, the room with the biggest extract grounded (p = 0)
    const idx = new Map(comp.map((r, i) => [r, i]));
    const N = comp.length;
    const ground = comp.reduce((m, r) => (inj.get(r) < inj.get(m) ? r : m), comp[0]);
    const G = Array.from({ length: N }, () => new Float64Array(N + 1));
    for (const e of edges) {
      if (!idx.has(e.a)) continue;
      const i = idx.get(e.a), j = idx.get(e.b);
      G[i][i] += e.g; G[j][j] += e.g; G[i][j] -= e.g; G[j][i] -= e.g;
    }
    comp.forEach((r, i) => { G[i][N] = inj.get(r); });
    const gi = idx.get(ground);
    G[gi].fill(0); G[gi][gi] = 1; G[gi][N] = 0;
    // Gaussian elimination with partial pivoting
    for (let c = 0; c < N; c++) {
      let piv = c;
      for (let r = c + 1; r < N; r++) if (Math.abs(G[r][c]) > Math.abs(G[piv][c])) piv = r;
      [G[c], G[piv]] = [G[piv], G[c]];
      if (Math.abs(G[c][c]) < 1e-12) continue;
      for (let r = 0; r < N; r++) {
        if (r === c || !G[r][c]) continue;
        const f = G[r][c] / G[c][c];
        for (let k = c; k <= N; k++) G[r][k] -= f * G[c][k];
      }
    }
    const P = comp.map((_, i) => (Math.abs(G[i][i]) > 1e-12 ? G[i][N] / G[i][i] : 0));
    for (const e of edges) {
      if (!idx.has(e.a)) continue;
      const q = e.g * (P[idx.get(e.a)] - P[idx.get(e.b)]); // > 0: from a to b
      const flow = Math.round(Math.abs(q));
      const [from, to] = q >= 0 ? [e.a, e.b] : [e.b, e.a];
      // which way the air goes across the opening (towards `to`)
      const toSide = q >= 0 ? -1 : 1; // e.a lies on +n
      const need = e.kind === 'door' || e.kind === 'door2' ? Math.max(...[from, to].map((r) => node.get(r)?.side ? node.get(r).transfer : 0)) : 0;
      out.doors.push({ floor: e.floor, o: e.o, kind: e.kind, from, to, fromName: node.get(from).name, toName: node.get(to).name, flow, need, at: e.at, dir: [e.n[0] * toSide, e.n[1] * toSide] });
    }
  }
  return out;
}
