// Example electro-pneumatic project: a double-acting cylinder with meter-out speed control, a 5/2
// solenoid valve and a relay with self-holding that is reset by limit switch 1S2 (automatic return).
import { newPage, newProject } from '../model.js';
import { uid } from '../util.js';

export function fluidDemoProject(lib) {
  const p = newProject('Demo – elektropneumatica', 'fluid');
  p.meta.description = 'Cilinder 1A1 schuift uit met drukknop S1 en keert automatisch terug bij 1S2';
  p.settings.tagFormat = '{prefix}{n}';
  p.pages = [newPage('Pneumatisch schema'), newPage('Elektrische sturing', 'dc')];
  const [pn, el] = p.pages;
  const place = (page, sym, x, y, tag, props = {}, o = {}) => {
    const def = lib.get(sym);
    const c = { id: uid('c'), sym, x, y, rot: 0, mirror: false, props: { ...(def.props || {}), ...props }, autoTag: false, tag, ...o };
    page.comps.push(c);
    return c;
  };
  const wire = (page, ...points) => page.wires.push({ id: uid('w'), points });

  // pneumatic circuit
  place(pn, 'flu/p/cyl2', 180, 60, '1A1', { marks: '1S1=0; 1S2=100', time: 1.5, desc: '' });
  place(pn, 'flu/p/flowcheck', 185, 85, '1V2', { open: 60 });
  place(pn, 'flu/p/flowcheck', 215, 85, '1V3', { open: 40 });
  place(pn, 'flu/p/v52-sol', 180, 130, '1V1', { solL: 'Y1' });
  place(pn, 'flu/p/exhaust', 185, 145, '');
  place(pn, 'flu/p/exhaust', 195, 145, '');
  place(pn, 'flu/p/source', 190, 175, '0Z1', { p: 6 });
  place(pn, 'flu/p/gauge', 200, 165, '');
  wire(pn, [185, 75], [185, 85]);
  wire(pn, [215, 75], [215, 85]);
  wire(pn, [185, 105], [185, 125]);
  wire(pn, [215, 105], [215, 115], [195, 115], [195, 125]);
  wire(pn, [190, 145], [190, 175]);
  wire(pn, [190, 165], [200, 165]);
  pn.texts.push({ id: uid('t'), x: 180, y: 40, text: 'Cilinder 1A1 – uitschuiven met S1, automatisch terug bij 1S2', size: 3, anchor: 'start' });

  // electrical control (24 V DC)
  place(el, 'std/pb-no', 60, 40, 'S1', { desc: 'Start' });
  const k1 = place(el, 'std/coil', 60, 120, 'K1', { desc: 'Uitschuiven' });
  place(el, 'std/no', 80, 40, 'K1', {}, { link: k1.id });
  place(el, 'std/limit-nc', 60, 80, '1S2', { desc: 'Cilinder uit' });
  place(el, 'std/no', 120, 40, 'K1', {}, { link: k1.id });
  place(el, 'std/valve', 120, 120, 'Y1', { desc: 'Ventiel 1V1' });
  wire(el, [60, 25], [60, 40]);
  wire(el, [80, 25], [80, 40]);
  wire(el, [60, 60], [80, 60]);
  wire(el, [60, 60], [60, 80]);
  wire(el, [60, 100], [60, 120]);
  wire(el, [60, 140], [60, 245]);
  wire(el, [120, 25], [120, 40]);
  wire(el, [120, 60], [120, 120]);
  wire(el, [120, 140], [120, 245]);
  return p;
}
