// Example pneumatic project: a double-acting cylinder with meter-out speed control, controlled by a
// 5/2 impulse valve. Push button valve 1S1 starts the stroke, roller valve 1S2 at the end returns it.
import { newPage, newProject } from '../model.js';
import { uid } from '../util.js';

export function fluidDemoProject(lib) {
  const p = newProject('Demo – pneumatica', 'fluid');
  p.meta.description = 'Cilinder 1A1 schuift uit met drukknopventiel 1S1 en keert automatisch terug via rolventiel 1S2';
  p.settings.tagFormat = '{prefix}{n}';
  p.pages = [newPage('Pneumatisch schema')];
  const [pn] = p.pages;
  const place = (sym, x, y, tag, props = {}) => {
    const def = lib.get(sym);
    pn.comps.push({ id: uid('c'), sym, x, y, rot: 0, mirror: false, props: { ...(def.props || {}), ...props }, autoTag: false, tag });
  };
  const wire = (...points) => pn.wires.push({ id: uid('w'), points });

  place('flu/p/cyl2', 180, 50, '1A1', { marks: '1S2=100', time: 1.5 });
  place('flu/p/flowcheck', 185, 75, '1V2', { open: 60 });
  place('flu/p/flowcheck', 215, 75, '1V3', { open: 40 });
  place('flu/p/v52-pil', 180, 120, '1V1');
  place('flu/p/exhaust', 185, 135, '');
  place('flu/p/exhaust', 195, 135, '');
  place('flu/p/v32-btn', 120, 170, '1S1');
  place('flu/p/exhaust', 135, 185, '');
  place('flu/p/v32-roll', 240, 170, '1S2', { mark: '1S2' });
  place('flu/p/exhaust', 255, 185, '');
  place('flu/p/source', 190, 215, '0Z1', { p: 6 });
  place('flu/p/gauge', 160, 200, '');
  wire([185, 65], [185, 75]);
  wire([215, 65], [215, 75]);
  wire([185, 95], [185, 115]);
  wire([215, 95], [215, 105], [195, 105], [195, 115]);
  wire([190, 135], [190, 200]);
  wire([190, 200], [190, 215]);
  wire([125, 165], [125, 125], [150, 125]);
  wire([245, 165], [245, 125], [210, 125]);
  wire([125, 185], [125, 200], [245, 200], [245, 185]);
  pn.texts.push({ id: uid('t'), x: 120, y: 32, text: 'Cilinder 1A1: uitschuiven met 1S1, automatisch terug bij 1S2 (rolventiel)', size: 3, anchor: 'start' });
  return p;
}
