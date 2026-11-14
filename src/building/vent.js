// Ventilation flows of a dwelling (Belgium, NBN D 50-001 / EPB): per room the nominal supply (dry rooms)
// or extract (wet rooms) flow, the transfer opening, the totals for the unit, and labels on the
// ventilation plan. Rooms carry their choice in r.vent = { type?, flow? } (flow: own design flow, m³/h).
import { t } from '../i18n.js';
import { uid } from '../util.js';
import { newPlan } from './model.js';
import { planK } from './render.js';
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

/**
 * All rooms of the building with their flows: [{ floor, room, name, area, type, side, required, flow, transfer }]
 * and the totals { supply, extract, unit }.
 */
export function ventRows(b, limit = true) {
  const rows = [];
  for (const floor of b.floors) for (const r of floor.rooms) {
    const area = Math.round(roomArea(roomPolygon(floor, r)) * 10) / 10;
    const type = ventType(r);
    const v = VENT_TYPES[type];
    const required = requiredFlow(type, area, limit);
    const own = parseFloat(r.vent?.flow);
    const flow = v.side ? (own > 0 ? Math.round(own) : required) : 0;
    rows.push({ floor, room: r, name: r.name || '?', area, type, side: v.side, required, flow, transfer: v.transfer || 0 });
  }
  const supply = rows.filter((x) => x.side === 'T').reduce((s, x) => s + x.flow, 0);
  const extract = rows.filter((x) => x.side === 'A').reduce((s, x) => s + x.flow, 0);
  return { rows, supply, extract, unit: Math.max(supply, extract) };
}

const COLOR = { T: '#1c7ed6', A: '#c2410c' };
/** "T 75 m³/h" (supply) or "A 50 m³/h" (extract), translated. */
export const flowText = (side, flow) => t(side === 'T' ? 'T {f} m³/h' : 'A {f} m³/h', { f: flow });

/**
 * Puts a label "T 75 m³/h" / "A 50 m³/h" under the name of every ventilated room, on the ventilation plan
 * of its floor (made when missing). Labels put there before are replaced; moved ones keep their place.
 * Call inside app.mutate. Returns the number of labels.
 */
export function placeVentLabels(b, limit = true) {
  const { rows } = ventRows(b, limit);
  const k = planK(b);
  let n = 0;
  for (const floor of b.floors) {
    const mine = rows.filter((x) => x.floor === floor && x.side && x.flow);
    const old = new Map((floor.shapes || []).filter((sh) => sh.gen === 'vent').map((sh) => [sh.room, sh]));
    floor.shapes = (floor.shapes || []).filter((sh) => sh.gen !== 'vent');
    if (!mine.length) continue;
    let pl = b.plans.find((p) => p.floor === floor.id && p.disc === 'vent');
    if (!pl) { pl = newPlan(floor.id, 'vent'); b.plans.push(pl); }
    for (const x of mine) {
      const prev = old.get(x.room.id);
      const [lx, ly] = roomLabelPos(x.room, roomPolygon(floor, x.room));
      const at = prev?.pts?.[0] || [Math.round(lx), Math.round(ly + 14 / k)];
      floor.shapes.push({
        id: uid('sh'), type: 'callout', gen: 'vent', room: x.room.id, plan: pl.id, pts: [at],
        text: flowText(x.side, x.flow), color: COLOR[x.side], size: 3,
      });
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
    f.shapes = (f.shapes || []).filter((sh) => sh.gen !== 'vent');
    n += before - f.shapes.length;
  }
  return n;
}
