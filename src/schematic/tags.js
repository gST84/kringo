// Device tags (page / column / row based), terminal numbers and contact numbering.
import { isFluidPage, locate } from '../model.js';

const NO_TAG_ROLES = new Set(['terminal', 'link', 'graphic']);

export const needsTag = (def) => def && !NO_TAG_ROLES.has(def.role);

function baseTag(project, fmt, prefix, pageIdx, x, y) {
  const { col, row } = locate(project, x, y, project.pages[pageIdx]);
  return fmt.replace('{prefix}', prefix || '').replace('{page}', pageIdx + 1).replace('{col}', col).replace('{row}', row);
}

/** Tag format of a sheet: fluid sheets have their own (ISO 1219 style) format. */
const tagFormat = (project, pageIdx) => (isFluidPage(project.pages[pageIdx])
  ? project.settings.fluidTagFormat || '{prefix}{n}'
  : project.settings.tagFormat || '-{prefix}{n}');

function uniqueTag(base, used) {
  if (base.includes('{n}')) {
    let k = 1;
    while (used.has(base.replace('{n}', k))) k++;
    return base.replace('{n}', k);
  }
  if (!used.has(base)) return base;
  let k = 1;
  while (used.has(`${base}.${k}`)) k++;
  return `${base}.${k}`;
}

function usedTags(project, exceptId) {
  const used = new Set();
  for (const pg of project.pages) for (const c of pg.comps) if (c.id !== exceptId && c.tag && !c.link) used.add(c.tag);
  return used;
}

/** Tag for a newly placed component at its current position. */
export function autoTag(project, lib, comp, pageIdx) {
  const def = lib.get(comp.sym);
  if (!needsTag(def)) return '';
  const fmt = tagFormat(project, pageIdx);
  return uniqueTag(baseTag(project, fmt, comp.props?.prefix || def.prefix || 'A', pageIdx, comp.x, comp.y), usedTags(project, comp.id));
}

/** Re-tags every component with automatic tags, in page / column / row order. */
export function renumberDevices(project, lib) {
  const list = [];
  project.pages.forEach((pg, pi) => {
    for (const c of pg.comps) {
      const def = lib.get(c.sym);
      if (!needsTag(def) || c.link) continue;
      list.push({ c, pi, def });
    }
  });
  list.sort((a, b) => a.pi - b.pi || a.c.x - b.c.x || a.c.y - b.c.y);
  const used = new Set(list.filter((e) => e.c.autoTag === false && e.c.tag).map((e) => e.c.tag));
  let changed = 0;
  for (const { c, pi, def } of list) {
    if (c.autoTag === false) continue;
    const t = uniqueTag(baseTag(project, tagFormat(project, pi), c.props?.prefix || def.prefix || 'A', pi, c.x, c.y), used);
    used.add(t);
    if (c.tag !== t) { c.tag = t; changed++; }
  }
  return changed;
}

/** Next free terminal number on a strip. */
export function nextTerminal(project, lib, strip) {
  let max = 0;
  for (const pg of project.pages) for (const c of pg.comps) {
    if (lib.get(c.sym)?.role !== 'terminal' || (c.props?.strip || '') !== strip) continue;
    const n = parseInt(c.props?.number, 10);
    if (n > max) max = n;
  }
  return String(max + 1);
}

/** Numbers all terminals per strip 1..n in page / x / y order. */
export function renumberTerminals(project, lib, onlyStrip) {
  const strips = new Map();
  project.pages.forEach((pg, pi) => {
    for (const c of pg.comps) {
      if (lib.get(c.sym)?.role !== 'terminal') continue;
      const s = c.props?.strip || '';
      if (onlyStrip && s !== onlyStrip) continue;
      if (!strips.has(s)) strips.set(s, []);
      strips.get(s).push({ c, pi });
    }
  });
  for (const list of strips.values()) {
    list.sort((a, b) => a.pi - b.pi || a.c.x - b.c.x || a.c.y - b.c.y);
    list.forEach(({ c }, i) => { c.props.number = String(i + 1); });
  }
}

/**
 * Gives a single auxiliary contact the next free contact number of its master
 * (NO: x3-x4, NC: x1-x2, CO: x1-x2-x4).
 */
export function numberContact(project, lib, comp) {
  const def = lib.get(comp.sym);
  if (def?.role !== 'contact' || def.fixedPins || !['NO', 'NC', 'CO'].includes(def.contact) || !comp.link) return;
  const used = new Set();
  for (const pg of project.pages) for (const c of pg.comps) {
    if (c.id === comp.id || c.link !== comp.link) continue;
    for (const v of Object.values(c.pinNames || {})) {
      const m = /^(\d+)\d$/.exec(v);
      if (m) used.add(+m[1]);
    }
  }
  let k = 1;
  while (used.has(k)) k++;
  if (def.contact === 'NO') comp.pinNames = { 1: `${k}3`, 2: `${k}4` };
  else if (def.contact === 'NC') comp.pinNames = { 1: `${k}1`, 2: `${k}2` };
  else comp.pinNames = { 1: `${k}1`, 2: `${k}2`, 3: `${k}4` };
}
