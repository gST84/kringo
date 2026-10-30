// Project data model. All coordinates are millimetres on an A3 landscape sheet.
import { uid } from './util.js';
import { t } from './i18n.js';
import { newBuilding, normalizeBuilding } from './building/model.js';

export const FORMAT = 'kringo-project';
/** Formats written by earlier versions (still readable). */
export const LEGACY_FORMATS = ['elecad-project'];
export const VERSION = 1;

export const SHEET = { w: 420, h: 297 };
/** Drawing frame: outer border, column/row bands, title block, drawing area. */
export const FRAME = {
  x0: 10, y0: 10, x1: 415, y1: 287, // outer border
  band: 5, // column band (top) and row band (left)
  tbY: 255, // title block top
  area: { x0: 15, y0: 15, x1: 415, y1: 255 },
};

export const RAIL_PRESETS = {
  L1: '#8b4513', L2: '#222222', L3: '#808080', N: '#1e5bd8', PE: '#2e9e3e',
  L: '#8b4513', '+24V': '#d02020', '0V': '#1e5bd8', '24V': '#d02020', M: '#1e5bd8',
};

/** IEC 60757 wire colour codes → display colour. */
export const WIRE_COLORS = {
  BK: ['Zwart', '#1a1a1a'], BN: ['Bruin', '#8b4513'], RD: ['Rood', '#d32020'], OG: ['Oranje', '#f08000'],
  YE: ['Geel', '#e0b800'], GN: ['Groen', '#2e9e3e'], BU: ['Blauw', '#1e5bd8'], DBU: ['Donkerblauw', '#0b2a8a'],
  VT: ['Violet', '#8a2be2'], GY: ['Grijs', '#808080'], WH: ['Wit', '#c8c8c8'], PK: ['Roze', '#ff69b4'],
  TQ: ['Turkoois', '#20b2aa'], GNYE: ['Groen-geel', '#2e9e3e'],
};

/** Display colour for a wire colour value (IEC code, #hex or CSS name); null for none. */
export function wireColor(v) {
  if (!v) return null;
  const code = String(v).trim().toUpperCase();
  if (WIRE_COLORS[code]) return WIRE_COLORS[code][1];
  if (/^#[0-9a-f]{3,8}$/i.test(v) || /^[a-z]+$/i.test(v)) return v;
  return null;
}

export const PAGE_TEMPLATES = {
  empty: { label: 'Leeg', rails: [] },
  control: { label: 'Stuurstroom 230 V (L / N)', rails: [['L', 25], ['N', 245]] },
  dc: { label: 'Stuurstroom 24 V DC (+24V / 0V)', rails: [['+24V', 25], ['0V', 245]] },
  power: { label: 'Vermogen (L1 L2 L3 N PE)', rails: [['L1', 25], ['L2', 30], ['L3', 35], ['N', 40], ['PE', 45]] },
};

export function newRail(name, y) {
  return { id: uid('r'), name, y, x0: FRAME.area.x0, x1: FRAME.area.x1, color: RAIL_PRESETS[name] || '#444444' };
}

/** Sheet types in control projects: electrical (default), pneumatic, hydraulic or cooling. */
export const PAGE_TYPES = ['electric', 'pneu', 'hydr', 'cool'];
export const pageType = (pg) => (PAGE_TYPES.includes(pg?.type) ? pg.type : 'electric');
/** Sheets with process symbols (pneumatics, hydraulics, cooling): own tag format, no supply rails. */
export const isProcessPage = (pg) => pageType(pg) !== 'electric';

export function newPage(title = t('Nieuwe pagina'), template = 'empty', type) {
  const t = PAGE_TEMPLATES[template] || PAGE_TEMPLATES.empty;
  return {
    id: uid('p'),
    ...(PAGE_TYPES.includes(type) && type !== 'electric' ? { type } : {}),
    title,
    rails: t.rails.map(([n, y]) => newRail(n, y)),
    comps: [],
    wires: [],
    texts: [],
    boxes: [],
  };
}

/**
 * kind: 'schematic' (control: electrical sheets plus pneumatic / hydraulic sheets, simulated together)
 * or 'building' (house installation, AREI). Projects of the former kind 'fluid' load as 'schematic'.
 */
export function newProject(name = 'Nieuw project', kind = 'schematic') {
  const today = new Date().toISOString().slice(0, 10);
  return {
    format: FORMAT,
    version: VERSION,
    id: uid('prj'),
    kind,
    name,
    meta: {
      description: '', customer: '', company: '', address: '', drawer: '',
      date: today, revision: 'A', logo: null,
    },
    settings: {
      tagFormat: '-{page}{prefix}{col}',
      fluidTagFormat: '{prefix}{n}', // devices on pneumatic / hydraulic sheets (ISO 1219 style: 1V1, 1A1 …)
      wireFormat: '{n}',
      columns: 10,
      rows: 6,
      showWireNumbers: kind !== 'building',
      colorWires: true, // wires take the colour of their supply rail
    },
    pages: kind === 'building' ? [] : [newPage(t('Voorblad')), newPage(t('Stuurstroom'), 'control')],
    symbols: {}, // embedded copies of non-builtin symbol definitions
    building: newBuilding(),
    created: Date.now(),
    updated: Date.now(),
  };
}

/** Fills in fields added in later versions so older files keep loading. */
export function normalizeProject(p) {
  p.format = FORMAT;
  const d = newProject(p.name);
  p.meta = { ...d.meta, ...(p.meta || {}) };
  p.settings = { ...d.settings, ...(p.settings || {}) };
  p.symbols ||= {};
  p.pages ||= [];
  for (const pg of p.pages) {
    pg.rails ||= []; pg.comps ||= []; pg.wires ||= []; pg.texts ||= []; pg.boxes ||= [];
    for (const c of pg.comps) c.props ||= {};
  }
  if (!p.kind) {
    // projects from before the split: a building project when floors contain drawing
    const hasPlan = (p.building?.floors || []).some((f) => f.walls?.length || f.symbols?.length);
    p.kind = hasPlan && !p.pages.some((pg) => !pg.gen && pg.comps.length) ? 'building' : 'schematic';
  }
  if (p.kind === 'fluid') {
    // former pneumatics / hydraulics projects: all sheets are fluid sheets in a control project
    for (const pg of p.pages) pg.type = 'fluid'; // sorted into pneumatic / hydraulic below
    p.settings.fluidTagFormat = p.settings.tagFormat && p.settings.tagFormat !== d.settings.tagFormat ? p.settings.tagFormat : d.settings.fluidTagFormat;
    p.settings.tagFormat = d.settings.tagFormat;
    p.kind = 'schematic';
  }
  // former combined pneumatic / hydraulic sheets: by the symbols on them
  for (const pg of p.pages) if (pg.type === 'fluid') {
    const hydr = pg.comps.filter((c) => /^flu\/h\//.test(c.sym)).length, pneu = pg.comps.filter((c) => /^flu\/p\//.test(c.sym)).length;
    pg.type = hydr > pneu ? 'hydr' : 'pneu';
  }
  if (!p.pages.length && p.kind !== 'building') p.pages.push(newPage('Pagina 1'));
  sortPages(p);
  p.building = normalizeBuilding(p.building);
  // background images of floor plans (data URLs), kept apart so undo snapshots stay small
  p.images ||= {};
  const used = new Set(p.building.floors.map((f) => f.bg?.img).filter(Boolean));
  for (const k of Object.keys(p.images)) if (!used.has(k)) delete p.images[k];
  return p;
}

/** Keeps the sheets grouped: electrical, pneumatic, hydraulic, cooling (stable). */
export function sortPages(p) {
  const order = (pg) => PAGE_TYPES.indexOf(pageType(pg));
  if (p.pages.some((pg, i) => i && order(pg) < order(p.pages[i - 1]))) p.pages = [...p.pages].sort((a, b) => order(a) - order(b));
  return p;
}

/** Column / row grid of a page: the project default or a page-specific frame (imports). */
export function pageGrid(project, page) {
  const { area } = FRAME;
  const f = page?.frame;
  const cols = f?.cols || project.settings.columns || 10;
  const rows = f?.rows || project.settings.rows || 6;
  return {
    cols, rows,
    cw: f?.colW || (area.x1 - area.x0) / cols,
    rh: f?.rowH || (area.y1 - area.y0) / rows,
  };
}

/** Column (1-based) and row letter for a point on the sheet. */
export function locate(project, x, y, page) {
  const { area } = FRAME;
  const { cols, rows, cw, rh } = pageGrid(project, page);
  const col = Math.min(cols, Math.max(1, Math.floor((x - area.x0) / cw) + 1));
  const row = Math.min(rows, Math.max(1, Math.floor((y - area.y0) / rh) + 1));
  return { col, row: String.fromCharCode(64 + row) };
}

