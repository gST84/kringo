// Demo sheets for the LS control block (M4-15, 5 electrohydraulic proportional sections, data sheet
// R901621403): an electrical sheet with a push button per magnet and an A1 hydraulic sheet with the block,
// a power unit and a cylinder per section. The magnets of the sections are set by the caller (coil tags).
import { newPage } from '../model.js';
import { uid } from '../util.js';

/** Sections as in the data sheet: compensator spring and max. flow A / B. */
const SECTIONS = [[13, 61, 98], [13, 61, 98], [13, 61, 98], [9, 50, 80], [9, 50, 80]];

/** Electrical sheet `page` (24 V DC, index `pageIdx`): push buttons a / b per section switching a solenoid each. */
export function m4ElectricPage(page, pageIdx, place, wire) {
  const keys = [];
  SECTIONS.forEach((_, k) => ['a', 'b'].forEach((s, j) => {
    const x = 30 + (k * 2 + j) * 37;
    const pb = place(pageIdx, `m4pb${k}${s}`, 'std/pb-no', x, 60, { desc: `Sectie ${k + 1} ${s === 'a' ? 'P→A' : 'P→B'}` });
    const y = place(pageIdx, `m4y${k}${s}`, 'std/valve', x, 150, { desc: `Magneet ${k + 1}${s}` });
    keys.push([k, s, pb, y]);
    wire(page, [x, 25], [x, 60]);
    wire(page, [x, 80], [x, 150]);
    wire(page, [x, 170], [x, 245]);
  }));
  page.texts.push({ id: uid('t'), x: 30, y: 251, text: 'Klik (Shift = vasthouden) op een drukknop: de magneet stuurt de sectie van het stuurblok op het blad "Stuurblok M4-15".', size: 2.5, anchor: 'start' });
  return keys;
}

/** Hydraulic A1 sheet with the complete block; `sol(k, 'a' | 'b')` gives the magnet name of a section. */
export function m4HydraulicPage(lib, sol) {
  const page = newPage('Stuurblok M4-15 (5 secties)', 'empty', 'hydr');
  page.sheet = 'A1';
  const place = (sym, x, y, tag, props = {}) => {
    const def = lib.get(sym);
    const c = { id: uid('c'), sym, x, y, rot: 0, mirror: false, props: { ...(def.props || {}), ...props }, autoTag: false, tag };
    page.comps.push(c);
    return c;
  };
  const wire = (...points) => page.wires.push({ id: uid('w'), points });
  const X0 = 90, Y0 = 260;
  place('flu/h/m4-inlet', X0, Y0, '7V0', { px: 35 });
  SECTIONS.forEach(([spring, qA, qB], k) => {
    const sx = X0 + 45 + 95 * k;
    place('flu/h/m4-section', sx, Y0, `7V${k + 1}`, { desc: `Sectie ${k + 1}`, solA: sol(k, 'a'), solB: sol(k, 'b'), spring, qA, qB });
    // cylinder per section (alternating height so the rods do not overlap)
    const cy = Y0 - (k % 2 ? 190 : 120);
    place('flu/h/cyl2', sx + 40, cy, `7A${k + 1}`, { time: 2.5, stroke: 200 });
    wire([sx + 74, Y0 - 6], [sx + 74, Y0 - 40], [sx + 45, Y0 - 40], [sx + 45, cy + 15]);
    wire([sx + 88, Y0 - 6], [sx + 88, Y0 - 50], [sx + 75, Y0 - 50], [sx + 75, cy + 15]);
  });
  place('flu/h/m4-end', X0 + 45 + 95 * 5, Y0, '7V6');
  // power unit: pump P → inlet P, inlet T → tank
  const px = X0 - 55, py = Y0 + 240;
  place('flu/h/powerpack', px, py, '0P2', { p: 180 });
  wire([px, py], [px, Y0 + 10], [X0 - 6, Y0 + 10]);
  wire([px + 10, py], [px + 10, Y0 + 188], [X0 - 6, Y0 + 188]);
  place('flu/h/gauge', X0 - 25, Y0 + 80);
  wire([X0 - 25, Y0 + 80], [X0 - 6, Y0 + 80]);
  page.texts.push({ id: uid('t'), x: 40, y: 30, text: 'LS-stuurblok M4-15 met inlaat, 5 elektrohydraulisch proportionele secties (drukweegschaal 13 / 9 bar, poortbeveiliging 230 bar) en eindplaat.', size: 3.5, anchor: 'start' });
  page.texts.push({ id: uid('t'), x: 40, y: 38, text: 'Simulatie: drukknoppen op het blad "Stuurblok M4 – magneten", of klik links (a: P→A) of rechts (b: P→B) op een sectie (handhefboom; Shift = vasthouden).', size: 3, anchor: 'start' });
  return page;
}
