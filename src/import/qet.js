// QElectroTech (.qet) project import.
//
// Every element definition of the embedded collection becomes an ElecAD symbol (stored in the
// project), every folio a page. QET works in pixels: symbols are stored at BASE mm/px and each
// component gets a scale so the folio fits the A3 drawing area.
//  - element pos = hotspot; definition coordinates are relative to it; orientation n×90° clockwise
//  - conductors run from terminal1 along their segments; without segments they are routed here
//  - terminals are referenced by definition terminal uuid (element1/terminal1) or, in older
//    files, by the instance terminal id alone
//  - master/slave links (coil ↔ contacts) become ElecAD links; folio reports become
//    interruption points with a shared name
import { FRAME, newProject } from '../model.js';
import { uid } from '../util.js';

const BASE = 0.375; // mm per QET pixel for symbol definitions
const PT = 1; // QET font size → pixels (QET draws point sizes as scene pixels)

const kids = (el, tag) => (el ? [...el.children].filter((c) => c.tagName === tag) : []);
const kid = (el, tag) => kids(el, tag)[0] || null;
const num = (el, a, d = 0) => {
  const v = parseFloat(el.getAttribute(a));
  return Number.isFinite(v) ? v : d;
};

const ORI = { n: 0, e: 1, s: 2, w: 3 };
const COLORS = new Set(['red', 'blue', 'green', 'gray', 'grey', 'white', 'brown', 'yellow', 'cyan', 'magenta', 'lightgray', 'orange', 'purple', 'darkgray', 'pink']);

function parseStyle(str) {
  const st = {};
  for (const part of String(str || '').split(';')) {
    const [k, v] = part.split(':').map((x) => x?.trim());
    if (k) st[k] = v;
  }
  const o = {};
  const ls = st['line-style'];
  if (ls && ls !== 'normal') o.dash = true;
  const w = st['line-weight'];
  if (w === 'none') o.noStroke = true;
  else if (w === 'thin') o.w = 0.15;
  else if (w === 'hight') o.w = 0.6;
  else if (w === 'eleve') o.w = 0.9;
  const f = st.filling;
  if (f === 'black') o.fill = 'ink';
  else if (f === 'white') o.fill = 'white';
  else if (COLORS.has(f)) o.fillColor = f;
  const c = st.color;
  if (c && c !== 'black' && c !== 'none' && COLORS.has(c)) o.color = c;
  return o;
}

/** Point size from a Qt font string "Sans Serif,9,-1,5,50,…". */
const fontPt = (font, d = 9) => {
  const v = parseFloat(String(font || '').split(',')[1]);
  return v > 0 ? v : d;
};

function pickName(namesEl, fallback) {
  const names = kids(namesEl, 'name');
  for (const lang of ['nl', 'en', 'fr', 'de']) {
    const n = names.find((x) => x.getAttribute('lang') === lang);
    if (n?.textContent.trim()) return n.textContent.trim().replace(/\s+/g, ' ');
  }
  return names[0]?.textContent.trim().replace(/\s+/g, ' ') || fallback;
}

function htmlToText(s) {
  if (!/<html|<p[ >]/i.test(s)) return s;
  const d = new DOMParser().parseFromString(s, 'text/html');
  const ps = [...d.querySelectorAll('p')];
  return (ps.length ? ps.map((p) => p.textContent) : [d.body.textContent]).join('\n').trim();
}

const arcPath = (x, y, w, h, start, span) => {
  const rx = w / 2, ry = h / 2, cx = x + rx, cy = y + ry;
  const pt = (deg) => [cx + rx * Math.cos((deg * Math.PI) / 180), cy - ry * Math.sin((deg * Math.PI) / 180)];
  if (Math.abs(span) >= 360) return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
  const [ax, ay] = pt(start), [bx, by] = pt(start + span);
  return `M ${ax} ${ay} A ${rx} ${ry} 0 ${Math.abs(span) > 180 ? 1 : 0} ${span > 0 ? 0 : 1} ${bx} ${by}`;
};

/** Converts a QET element definition into an ElecAD symbol definition (coordinates × BASE). */
function convertDefinition(defEl, path, folder) {
  const B = BASE;
  const S = (v) => v * B;
  const desc = kid(defEl, 'description');
  const graphics = [];
  const terminals = [];
  let labelAt = null;
  for (const p of desc ? desc.children : []) {
    const st = parseStyle(p.getAttribute('style'));
    switch (p.tagName) {
      case 'line':
        graphics.push({ t: 'line', x1: S(num(p, 'x1')), y1: S(num(p, 'y1')), x2: S(num(p, 'x2')), y2: S(num(p, 'y2')), ...st });
        break;
      case 'rect':
        graphics.push({ t: 'rect', x: S(num(p, 'x')), y: S(num(p, 'y')), w: S(num(p, 'width')), h: S(num(p, 'height')), ...st });
        break;
      case 'circle': {
        const d = num(p, 'diameter');
        graphics.push({ t: 'circle', cx: S(num(p, 'x') + d / 2), cy: S(num(p, 'y') + d / 2), r: S(d / 2), ...st });
        break;
      }
      case 'ellipse': {
        const x = num(p, 'x'), y = num(p, 'y'), w = num(p, 'width'), h = num(p, 'height');
        if (Math.abs(w - h) < 0.01) graphics.push({ t: 'circle', cx: S(x + w / 2), cy: S(y + h / 2), r: S(w / 2), ...st });
        else graphics.push({ t: 'path', d: arcPath(S(x), S(y), S(w), S(h), 0, 360), ...st });
        break;
      }
      case 'arc':
        graphics.push({ t: 'path', d: arcPath(S(num(p, 'x')), S(num(p, 'y')), S(num(p, 'width')), S(num(p, 'height')), num(p, 'start'), num(p, 'angle')), ...st, fill: undefined, fillColor: undefined });
        break;
      case 'polygon': {
        const pts = [];
        for (let i = 1; p.hasAttribute('x' + i); i++) pts.push([S(num(p, 'x' + i)), S(num(p, 'y' + i))]);
        if (pts.length < 2) break;
        const closed = p.getAttribute('closed') !== 'false';
        graphics.push({ t: 'path', d: 'M ' + pts.map((q) => q.join(' ')).join(' L ') + (closed ? ' Z' : ''), ...st, ...(closed ? {} : { fill: undefined, fillColor: undefined }) });
        break;
      }
      case 'text': {
        const size = p.hasAttribute('size') ? num(p, 'size') : fontPt(p.getAttribute('font'));
        const text = p.getAttribute('text') || '';
        if (text) graphics.push({ t: 'text', x: S(num(p, 'x')), y: S(num(p, 'y')), text, size: S(size * PT), anchor: 'start', base: 'alphabetic', rot: num(p, 'rotation') });
        break;
      }
      case 'input': {
        const size = num(p, 'size', 9);
        const spec = { x: S(num(p, 'x')), y: S(num(p, 'y')), size: S(size * PT), base: 'alphabetic', rot: num(p, 'rotation') };
        if (p.getAttribute('tagg') === 'label') labelAt = spec;
        else {
          const text = p.getAttribute('text') || '';
          if (text && text !== '_') graphics.push({ t: 'text', ...spec, text, anchor: 'start' });
        }
        break;
      }
      case 'terminal':
        terminals.push({ uuid: p.getAttribute('uuid'), x: num(p, 'x'), y: num(p, 'y'), ori: ORI[p.getAttribute('orientation')] ?? 0, name: p.getAttribute('name') || '' });
        break;
      default: // dynamic_text: the instance carries its own copy
    }
  }
  const kinds = {};
  for (const k of kids(kid(defEl, 'kindInformations'), 'kindInformation')) kinds[k.getAttribute('name')] = k.textContent;
  const lt = defEl.getAttribute('link_type') || 'simple';
  const role = { master: 'main', slave: 'contact', terminal: 'terminal', next_report: 'link', previous_report: 'link' }[lt] || 'device';
  const file = path.split('/').pop();
  return {
    def: {
      id: 'qet/' + path.replace(/^embed:\/\/(import\/)?/, ''),
      name: pickName(kid(defEl, 'names'), file.replace(/\.elmt$/, '')),
      folder,
      prefix: '',
      role,
      contact: kinds.state === 'NO' || kinds.state === 'NC' ? kinds.state : undefined,
      mirror: kinds.type === 'coil',
      pinText: false,
      showRefs: false,
      qet: true,
      graphics,
      pins: terminals.map((t, i) => ({ id: 't' + i, x: S(t.x), y: S(t.y), name: t.name })),
      tagAt: { x: 0, y: 0, anchor: 'start' },
      props: role === 'link' ? { name: '' } : role === 'terminal' ? { strip: '' } : {},
    },
    terminals,
    labelAt,
  };
}

function collectDefinitions(collection) {
  const defs = new Map();
  const walk = (node, parts) => {
    for (const ch of node.children) {
      if (ch.tagName === 'category') walk(ch, [...parts, ch.getAttribute('name')]);
      else if (ch.tagName === 'element') {
        const path = 'embed://' + [...parts, ch.getAttribute('name')].join('/');
        const d = kid(ch, 'definition');
        if (!d) continue;
        const folderParts = parts.filter((x, i) => !(i === 0 && x === 'import')).map((x) => x.replace(/^\d+_/, '').replace(/_/g, ' '));
        defs.set(path, convertDefinition(d, path, ['QElectroTech', ...folderParts].join('/')));
      }
    }
  };
  if (collection) walk(collection, []);
  return defs;
}

class DSU {
  constructor() { this.p = new Map(); }
  find(a) { if (!this.p.has(a)) this.p.set(a, a); const p = this.p.get(a); if (p === a) return a; const r = this.find(p); this.p.set(a, r); return r; }
  union(a, b) { this.p.set(this.find(a), this.find(b)); }
}

export function importQet(xmlText, fileName = 'QElectroTech') {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const root = doc.documentElement;
  if (doc.querySelector('parsererror') || root.tagName !== 'project') throw new Error('Geen geldig QElectroTech-projectbestand (.qet).');
  const defs = collectDefinitions(kid(root, 'collection'));
  const project = newProject(root.getAttribute('title') || fileName.replace(/\.qet$/i, ''));
  project.settings.wireFormat = ''; // keep the original wire numbers only
  project.pages = [];
  project.symbols = {};
  project.meta.description = `Geïmporteerd uit ${fileName}`;
  const usedDefs = new Map();
  const report = { pages: 0, comps: 0, wires: 0, routed: 0, skipped: 0 };

  const diagrams = kids(root, 'diagram').sort((a, b) => num(a, 'order') - num(b, 'order'));
  const byUuid = new Map(); // element uuid → comp (whole project, for links)
  const linkRefs = []; // [comp, [uuid…]]

  for (const dg of diagrams) {
    const cols = num(dg, 'cols', 17), rows = num(dg, 'rows', 8);
    const colsize = num(dg, 'colsize', 60), rowsize = num(dg, 'rowsize', 80);
    const { area } = FRAME;
    const s = Math.min((area.x1 - area.x0) / (cols * colsize), (area.y1 - area.y0) / (rows * rowsize));
    const k = s / BASE;
    const X = (x) => area.x0 + (x - 20) * s;
    const Y = (y) => area.y0 + (y - 20) * s;
    const page = {
      id: uid('p'), title: dg.getAttribute('title') || `Blad ${report.pages + 1}`,
      rails: [], comps: [], wires: [], texts: [], boxes: [],
      frame: { cols, rows, colW: colsize * s, rowH: rowsize * s },
    };
    if (!project.meta.drawer && dg.getAttribute('author')) project.meta.drawer = dg.getAttribute('author');
    if (dg.getAttribute('indexrev')) project.meta.revision = dg.getAttribute('indexrev');

    // ---------- elements ----------
    const elInfo = new Map(); // element uuid → {comp, conv, el}
    const termById = new Map(); // instance terminal id → {uuid, index}
    for (const el of kids(kid(dg, 'elements'), 'element')) {
      const conv = defs.get(el.getAttribute('type'));
      if (!conv) { report.skipped++; continue; }
      usedDefs.set(conv.def.id, conv.def);
      const rot = el.hasAttribute('rotation') ? num(el, 'rotation') : num(el, 'orientation') * 90;
      const info = {};
      for (const i of kids(kid(el, 'elementInformations'), 'elementInformation')) info[i.getAttribute('name')] = i.textContent.trim();
      const comp = {
        id: uid('c'), sym: conv.def.id, x: X(num(el, 'x')), y: Y(num(el, 'y')), rot: ((rot % 360) + 360) % 360, mirror: false,
        scale: k, props: {}, autoTag: false, tag: info.label || '', texts: [], qet: true,
      };
      if (conv.labelAt) comp.tagAt = conv.labelAt;
      if (info.comment) comp.props.desc = info.comment;
      if (info.manufacturer) comp.props.maker = info.manufacturer;
      if (info.manufacturer_reference) comp.props.article = info.manufacturer_reference;
      const userTexts = [];
      for (const t of kids(kid(el, 'dynamic_texts'), 'dynamic_elmt_text')) {
        const from = t.getAttribute('text_from');
        const infoName = kid(t, 'info_name')?.textContent;
        let text = kid(t, 'text')?.textContent ?? '';
        if (from === 'ElementInfo' && infoName && info[infoName] !== undefined) text = info[infoName];
        const spec = {
          x: num(t, 'x') * BASE, y: num(t, 'y') * BASE, size: fontPt(t.getAttribute('font')) * PT * BASE,
          rot: num(t, 'rotation'), keep: t.getAttribute('keep_visual_rotation') === 'true', base: 'hanging', anchor: 'start',
        };
        if (from === 'ElementInfo' && infoName === 'label') {
          comp.tagAt = spec;
          if (text && !comp.tag) comp.tag = text;
          continue;
        }
        if (!text || text === '_') continue;
        if (from === 'UserText') userTexts.push(text);
        comp.texts.push({ ...spec, text });
      }
      for (const inp of kids(kid(el, 'inputs'), 'input')) {
        const text = inp.getAttribute('text');
        if (text && text !== '_') comp.texts.push({ x: num(inp, 'x') * BASE, y: num(inp, 'y') * BASE, size: 9 * PT * BASE, text, base: 'alphabetic', anchor: 'start' });
      }
      if (conv.def.role === 'terminal') {
        comp.props.strip = comp.tag || '';
        comp.props.number = userTexts[0] || '';
      }
      if (conv.def.role === 'link') {
        // QET shows its own folio reference text (e.g. "5-H2"): keep it as plain text
        if (comp.tag && comp.tagAt) comp.texts.push({ ...comp.tagAt, text: comp.tag });
        comp.tag = '';
        delete comp.tagAt;
      }
      const links = kids(kid(el, 'links_uuids'), 'link_uuid').map((l) => l.getAttribute('uuid'));
      if (links.length) linkRefs.push([comp, links, conv.def.role]);
      kids(kid(el, 'terminals'), 'terminal').forEach((t, i) => termById.set(t.getAttribute('id'), { uuid: el.getAttribute('uuid'), index: i }));
      page.comps.push(comp);
      elInfo.set(el.getAttribute('uuid'), { comp, conv });
      byUuid.set(el.getAttribute('uuid'), comp);
      report.comps++;
    }

    // terminal position in QET pixels and in sheet millimetres
    const rotPx = (x, y, deg) => {
      let px = x, py = y;
      for (let i = 0; i < Math.round(deg / 90) % 4; i++) [px, py] = [-py, px];
      return [px, py];
    };
    const endpoint = (elUuid, termRef) => {
      let ei = elInfo.get(elUuid);
      let index = ei ? ei.conv.terminals.findIndex((t) => t.uuid && t.uuid === termRef) : -1;
      if (index < 0 && termById.has(termRef)) {
        const t = termById.get(termRef);
        ei = elInfo.get(t.uuid);
        index = t.index;
      }
      if (!ei || index < 0 || !ei.conv.terminals[index]) return null;
      const t = ei.conv.terminals[index];
      const deg = ei.comp.rot;
      const [dx, dy] = rotPx(t.x, t.y, deg);
      return {
        comp: ei.comp, pinId: 't' + index,
        px: [(ei.comp.x - area.x0) / s + 20 + dx, (ei.comp.y - area.y0) / s + 20 + dy],
        ori: (t.ori + Math.round(deg / 90)) % 4,
      };
    };
    // exact sheet coordinates of a pin (same formula as the renderer)
    const pinMm = (e) => {
      const p = e.comp;
      const pin = usedDefs.get(p.sym).pins.find((x) => x.id === e.pinId);
      let px = pin.x * k, py = pin.y * k;
      for (let i = 0; i < Math.round(p.rot / 90) % 4; i++) [px, py] = [-py, px];
      return [p.x + px, p.y + py];
    };

    // ---------- conductors ----------
    for (const c of kids(kid(dg, 'conductors'), 'conductor')) {
      const a = endpoint(c.getAttribute('element1'), c.getAttribute('terminal1'));
      const b = endpoint(c.getAttribute('element2'), c.getAttribute('terminal2'));
      if (!a || !b) { report.skipped++; continue; }
      let pts = [a.px];
      const segs = kids(c, 'segment');
      let cur = [...a.px];
      for (const sg of segs) {
        const l = num(sg, 'length');
        cur = sg.getAttribute('orientation') === 'horizontal' ? [cur[0] + l, cur[1]] : [cur[0], cur[1] + l];
        pts.push(cur);
      }
      const end = pts[pts.length - 1];
      if (!segs.length || Math.hypot(end[0] - b.px[0], end[1] - b.px[1]) > 1) {
        // route: leave terminal 1 in its own direction, then square off to terminal 2
        report.routed++;
        const [x1, y1] = a.px, [x2, y2] = b.px;
        if (Math.abs(x1 - x2) < 0.5 || Math.abs(y1 - y2) < 0.5) pts = [a.px, b.px];
        else pts = a.ori % 2 === 0 ? [a.px, [x1, y2], b.px] : [a.px, [x2, y1], b.px];
      }
      let mm = pts.map(([x, y]) => [X(x), Y(y)]);
      // snap both ends exactly onto the pins and keep neighbouring segments straight
      const fix = (i, j, p) => {
        const o = mm[i];
        mm[i] = p;
        if (j > 0 && j < mm.length - 1) {
          if (Math.abs(mm[j][0] - o[0]) < 1e-3) mm[j] = [p[0], mm[j][1]];
          else if (Math.abs(mm[j][1] - o[1]) < 1e-3) mm[j] = [mm[j][0], p[1]];
        }
      };
      fix(0, 1, pinMm(a));
      fix(mm.length - 1, mm.length - 2, pinMm(b));
      mm = mm.filter((p, i) => i === 0 || Math.hypot(p[0] - mm[i - 1][0], p[1] - mm[i - 1][1]) > 1e-4);
      if (mm.length < 2) continue;
      const wire = { id: uid('w'), points: mm };
      const n = c.getAttribute('num');
      if (n && n !== '_') wire.label = n;
      if (c.getAttribute('conductor_color')) wire.color = c.getAttribute('conductor_color');
      if (c.getAttribute('conductor_section')) wire.section = c.getAttribute('conductor_section');
      page.wires.push(wire);
      report.wires++;
    }

    // ---------- free texts and shapes ----------
    for (const t of kids(kid(dg, 'inputs'), 'input')) {
      const text = htmlToText(t.getAttribute('text') || '');
      if (!text.trim()) continue;
      page.texts.push({ id: uid('t'), x: X(num(t, 'x')), y: Y(num(t, 'y')), text, size: fontPt(t.getAttribute('font')) * PT * s, anchor: 'start', base: 'hanging', rot: num(t, 'rotation') });
    }
    for (const sh of kids(kid(dg, 'shapes'), 'shape')) {
      const x1 = X(num(sh, 'x1')), y1 = Y(num(sh, 'y1')), x2 = X(num(sh, 'x2')), y2 = Y(num(sh, 'y2'));
      const type = sh.getAttribute('type');
      const style = /Dash|Dot/.test(kid(sh, 'pen')?.getAttribute('style') || '') ? 'dashdot' : 'solid';
      if (type === 'Rectangle' || (type === 'Line' && (Math.abs(x1 - x2) < 0.01 || Math.abs(y1 - y2) < 0.01))) {
        if (Math.abs(x2 - x1) < 0.01 && Math.abs(y2 - y1) < 0.01) continue;
        page.boxes.push({ id: uid('b'), x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), style, label: '' });
      }
    }
    project.pages.push(page);
    report.pages++;
  }

  // ---------- links: master / slave and folio reports ----------
  const dsu = new DSU();
  for (const [comp, uuids, role] of linkRefs) {
    for (const u of uuids) {
      const other = byUuid.get(u);
      if (!other) continue;
      if (role === 'link') dsu.union(comp.id, other.id);
      else if (role === 'contact' && usedDefs.get(other.sym)?.role === 'main') comp.link = other.id;
    }
  }
  const groupName = new Map();
  for (const pg of project.pages) for (const c of pg.comps) {
    if (usedDefs.get(c.sym)?.role !== 'link') continue;
    const r = dsu.find(c.id);
    if (!groupName.has(r)) groupName.set(r, 'R' + (groupName.size + 1));
    c.props.name = groupName.get(r);
  }

  for (const [id, d] of usedDefs) project.symbols[id] = d;
  if (!project.pages.length) project.pages.push({ id: uid('p'), title: 'Leeg', rails: [], comps: [], wires: [], texts: [], boxes: [] });
  return { project, report };
}
