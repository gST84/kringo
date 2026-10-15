// Project data model. All coordinates are millimetres on an A3 landscape sheet.
import { uid } from './util.js';
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

export function newPage(title = 'Nieuwe pagina', template = 'empty') {
  const t = PAGE_TEMPLATES[template] || PAGE_TEMPLATES.empty;
  return {
    id: uid('p'),
    title,
    rails: t.rails.map(([n, y]) => newRail(n, y)),
    comps: [],
    wires: [],
    texts: [],
    boxes: [],
  };
}

export function newProject(name = 'Nieuw project') {
  const today = new Date().toISOString().slice(0, 10);
  return {
    format: FORMAT,
    version: VERSION,
    id: uid('prj'),
    name,
    meta: {
      description: '', customer: '', company: '', address: '', drawer: '',
      date: today, revision: 'A', logo: null,
    },
    settings: {
      tagFormat: '-{page}{prefix}{col}',
      wireFormat: '{n}',
      columns: 10,
      rows: 6,
      showWireNumbers: true,
      colorWires: true, // wires take the colour of their supply rail
    },
    pages: [newPage('Voorblad'), newPage('Stuurstroom', 'control')],
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
  if (!p.pages.length) p.pages.push(newPage('Pagina 1'));
  p.building = normalizeBuilding(p.building);
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

export const pageNo = (project, pageId) => project.pages.findIndex((p) => p.id === pageId) + 1;
