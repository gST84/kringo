// Example project shown on first start: direct-on-line motor starter.
import { newPage, newProject } from './model.js';
import { autoTag, numberContact, nextTerminal } from './schematic/tags.js';
import { uid } from './util.js';

export function demoProject(lib) {
  const p = newProject('Demo – motorstarter');
  p.meta.description = 'Directe start met start/stop en signalisatie';
  p.pages = [newPage('Vermogen', 'power'), newPage('Stuurstroom', 'control')];
  const [pw, ctl] = p.pages;
  const comps = {};
  const place = (pi, key, sym, x, y, props = {}) => {
    const def = lib.get(sym);
    const c = { id: uid('c'), sym, x, y, rot: 0, mirror: false, props: { ...(def.props || {}), ...props }, autoTag: true, tag: '' };
    if (def.role === 'terminal') c.props.number = nextTerminal(p, lib, c.props.strip);
    p.pages[pi].comps.push(c);
    comps[key] = c;
    return c;
  };
  const wire = (page, ...points) => page.wires.push({ id: uid('w'), points });
  const tagAll = () => p.pages.forEach((pg, pi) => pg.comps.forEach((c) => { if (!c.link && lib.get(c.sym).role !== 'terminal') c.tag = autoTag(p, lib, c, pi); }));

  // power page
  place(0, 'q1', 'std/mpcb', 60, 60, { desc: 'Motorbeveiliging pomp' });
  place(0, 'kmain', 'std/power3', 60, 95);
  place(0, 'f', 'std/thermal', 60, 130);
  for (const x of [60, 70, 80]) place(0, 'x' + x, 'std/terminal', x, 165, { strip: '-X2' });
  place(0, 'm', 'std/motor3', 60, 195, { desc: 'Pomp' });
  for (const [x, ry] of [[60, 25], [70, 30], [80, 35]]) {
    wire(pw, [x, ry], [x, 60]);
    wire(pw, [x, 80], [x, 95]);
    wire(pw, [x, 115], [x, 130]);
    wire(pw, [x, 150], [x, 165]);
    wire(pw, [x, 175], [x, 195]);
  }
  wire(pw, [90, 45], [90, 195]);

  // control page
  place(1, 'fuse', 'std/fuse', 60, 40);
  place(1, 'fnc', 'std/thermal-nc', 60, 70);
  place(1, 'stop', 'std/pb-nc', 60, 100, { desc: 'Stop' });
  place(1, 'start', 'std/pb-no', 60, 130, { desc: 'Start' });
  place(1, 'hold', 'std/no', 80, 130);
  place(1, 'coil', 'std/coil', 60, 170, { desc: 'Pomp' });
  place(1, 'aux', 'std/no', 120, 130);
  place(1, 'lamp', 'std/lamp', 120, 170, { desc: 'Pomp in' });
  wire(ctl, [60, 25], [60, 40]);
  wire(ctl, [60, 60], [60, 70]);
  wire(ctl, [60, 90], [60, 100]);
  wire(ctl, [60, 120], [60, 130]);
  wire(ctl, [60, 125], [80, 125], [80, 130]);
  wire(ctl, [60, 150], [60, 170]);
  wire(ctl, [80, 150], [80, 155], [60, 155]);
  wire(ctl, [60, 190], [60, 245]);
  wire(ctl, [120, 25], [120, 130]);
  wire(ctl, [120, 150], [120, 170]);
  wire(ctl, [120, 190], [120, 245]);

  comps.kmain.link = comps.coil.id;
  comps.hold.link = comps.coil.id;
  comps.aux.link = comps.coil.id;
  comps.fnc.link = comps.f.id;
  tagAll();
  numberContact(p, lib, comps.hold);
  numberContact(p, lib, comps.aux);
  return p;
}
