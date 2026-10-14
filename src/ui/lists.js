// Reports: device list, terminal list, wire (connection) list, PLC list.
import { h, download, toCsv, natCmp, esc, safeName } from '../util.js';
import { analyze, refText } from '../schematic/analyze.js';
import { needsTag } from '../schematic/tags.js';
import { modal } from './dialogs.js';
import { goTo } from './panels.js';

const pinRef = (p) => {
  const role = p.info.def?.role;
  if (role === 'terminal') return `${p.info.tag}:${p.info.comp.props?.number ?? '?'}`;
  if (role === 'link') return `⇢ ${p.info.tag}`;
  return `${p.info.tag || '?'}:${p.pin.name}`;
};
const loc = (info) => `/${refText(info.loc)}${info.loc.row}`;

export function buildLists(app) {
  const project = app.project;
  const an = app.analysis();
  const direct = analyze(project, app.lib, { bridges: false });

  // devices
  const devices = new Map();
  for (const info of an.comps.values()) {
    if (!needsTag(info.def)) continue;
    const root = info.master || info;
    const key = root.comp.id;
    if (!devices.has(key)) devices.set(key, { root, parts: [] });
    devices.get(key).parts.push(info);
  }
  const deviceRows = [...devices.values()]
    .sort((a, b) => natCmp(a.root.tag, b.root.tag))
    .map(({ root, parts }) => ({
      id: root.comp.id,
      cells: [
        root.tag || '—', root.comp.props?.desc || '', root.def?.name || '',
        parts.map((p) => loc(p)).join(' '), root.comp.props?.maker || '', root.comp.props?.article || '',
        an.duplicates.has(root.tag) ? '⚠ dubbel' : '',
      ],
    }));

  // terminals
  const terms = [];
  for (const info of an.comps.values()) if (info.def?.role === 'terminal') terms.push(info);
  terms.sort((a, b) => natCmp(a.tag, b.tag) || natCmp(a.comp.props?.number, b.comp.props?.number));
  const side = (info, pinId) => {
    const net = direct.pinNet.get(`${info.comp.id}:${pinId}`);
    if (!net) return '';
    const others = net.pins.filter((p) => p.info.comp.id !== info.comp.id).map((p) => {
      const i2 = an.comps.get(p.info.comp.id) || p.info;
      return pinRef({ info: i2, pin: p.pin });
    });
    const rails = [...net.rails].filter(Boolean);
    return [...rails, ...others].join(', ');
  };
  const termRows = terms.map((info) => {
    const pins = info.geom.pins || [];
    const wno = an.pinNet.get(`${info.comp.id}:${pins[0]?.id}`)?.label || '';
    return {
      id: info.comp.id,
      cells: [info.tag, info.comp.props?.number ?? '', info.comp.props?.desc || '', wno, side(info, pins[0]?.id), side(info, pins[1]?.id), loc(info)],
    };
  });

  // connections (wire list): consecutive pins of every directly connected net
  const wireRows = [];
  for (const net of direct.nets.values()) {
    const pins = net.pins.filter((p) => !['link', 'graphic'].includes(p.info.def?.role))
      .map((p) => ({ ...p, info: an.comps.get(p.info.comp.id) || p.info }));
    if (pins.length < 2 && !(pins.length === 1 && net.rails.size)) continue;
    pins.sort((a, b) => a.info.pageIdx - b.info.pageIdx || a.pin.x - b.pin.x || a.pin.y - b.pin.y);
    const label = an.pinNet.get(`${pins[0].info.comp.id}:${pins[0].pin.id}`)?.label || '';
    const w = net.wires.map((x) => x.wire);
    const color = w.find((x) => x.color)?.color || '';
    const sec = w.find((x) => x.section)?.section || '';
    if (pins.length === 1) {
      wireRows.push({ id: pins[0].info.comp.id, cells: [label, pinRef(pins[0]), [...net.rails][0], color, sec, loc(pins[0].info)] });
      continue;
    }
    for (let i = 0; i + 1 < pins.length; i++) {
      wireRows.push({ id: pins[i].info.comp.id, cells: [label, pinRef(pins[i]), pinRef(pins[i + 1]), color, sec, loc(pins[i].info)] });
    }
  }
  wireRows.sort((a, b) => natCmp(a.cells[0], b.cells[0]));

  // PLC
  const plcRows = [];
  for (const info of an.comps.values()) {
    if (info.def?.plc) {
      plcRows.push({ id: info.comp.id, cells: [info.comp.props?.addr || '', info.def.plc, info.tag, info.comp.props?.desc || '', loc(info)] });
    } else if (info.def?.build) {
      for (const p of info.pins) {
        const net = direct.pinNet.get(`${info.comp.id}:${p.id}`);
        const to = net ? net.pins.filter((x) => x.info.comp.id !== info.comp.id).map((x) => pinRef({ info: an.comps.get(x.info.comp.id) || x.info, pin: x.pin })).join(', ') : '';
        plcRows.push({ id: info.comp.id, cells: [p.name, info.def.name.replace('PLC kaart ', ''), info.tag, to ? '→ ' + to : '', loc(info)] });
      }
    }
  }
  plcRows.sort((a, b) => natCmp(a.cells[0], b.cells[0]));

  return {
    devices: { title: 'Toestellenlijst', head: ['Tag', 'Functietekst', 'Symbool', 'Plaatsen', 'Fabrikant', 'Artikelnr.', ''], rows: deviceRows },
    terminals: { title: 'Klemmenlijst', head: ['Strook', 'Klem', 'Functietekst', 'Draadnr.', 'Boven / intern', 'Onder / extern', 'Plaats'], rows: termRows },
    wires: { title: 'Draadlijst', head: ['Draadnr.', 'Van', 'Naar', 'Kleur', 'mm²', 'Plaats'], rows: wireRows },
    plc: { title: 'PLC-lijst', head: ['Adres', 'Type', 'Tag', 'Functietekst / verbinding', 'Plaats'], rows: plcRows },
  };
}

export function listsDialog(app, initial = 'devices') {
  const lists = buildLists(app);
  let current = initial;
  const tabs = h('div', { class: 'tabs' });
  const table = h('div', { class: 'tablewrap' });
  const show = () => {
    tabs.replaceChildren(...Object.entries(lists).map(([k, l]) =>
      h('button', { class: k === current ? 'active' : '', onclick: () => { current = k; show(); } }, `${l.title} (${l.rows.length})`)));
    const l = lists[current];
    table.replaceChildren(h('table', { class: 'list' },
      h('thead', null, h('tr', null, l.head.map((x) => h('th', null, x)))),
      h('tbody', null, l.rows.length ? l.rows.map((r) => h('tr', { title: 'Klik om naar het symbool te gaan', onclick: () => { goTo(app, r.id); } }, r.cells.map((c) => h('td', null, c))))
        : h('tr', null, h('td', { colspan: l.head.length, class: 'empty' }, 'Geen gegevens')))));
  };
  show();
  return modal({
    title: 'Lijsten',
    wide: true,
    body: h('div', null, tabs, table),
    buttons: [
      { label: 'CSV exporteren', value: 'csv' },
      { label: 'Afdrukken', value: 'print' },
      { label: 'Sluiten', value: 'close', primary: true },
    ],
    onButton: (v) => {
      const l = lists[current];
      if (v === 'csv') {
        download(`${safeName(app.project.name)} - ${l.title}.csv`, '﻿' + toCsv([l.head, ...l.rows.map((r) => r.cells)]), 'text/csv;charset=utf-8');
        return false;
      }
      if (v === 'print') { printTable(app, l); return false; }
      return true;
    },
  });
}

function printTable(app, l) {
  const w = window.open('', '_blank');
  if (!w) return;
  const m = app.project.meta || {};
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(l.title)}</title>
<style>body{font:11px Arial,sans-serif;margin:12mm}h1{font-size:16px;margin:0 0 2px}p{margin:0 0 10px;color:#555}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:3px 5px;text-align:left;vertical-align:top}th{background:#eee}
@page{size:A4 landscape;margin:10mm}</style></head><body>
<h1>${esc(l.title)} – ${esc(app.project.name)}</h1><p>${esc(m.company || '')} · ${esc(m.drawer || '')} · ${esc(m.date || '')} · rev. ${esc(m.revision || '')}</p>
<table><thead><tr>${l.head.map((x) => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>
${l.rows.map((r) => `<tr>${r.cells.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
<script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}
