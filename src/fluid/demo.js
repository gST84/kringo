// Example fluid power project with four sheets that can all be simulated:
// 1. automatic return with meter-out speed control (5/2 impulse valve, push button and roller valve)
// 2. two-hand control with a two-pressure (AND) valve and a single-acting cylinder
// 3. hydraulics: power unit, pressure relief valve, gauge, filter, 4/3 lever valve and cylinder
// 4. oscillating cylinder (start latched with Shift) with a pulse counter
import { newPage, newProject } from '../model.js';
import { uid } from '../util.js';

export function fluidDemoProject(lib) {
  const p = newProject('Demo – hydraulica en pneumatica', 'fluid');
  p.meta.description = 'Vier simuleerbare voorbeelden: terugloop, tweehandbediening, hydraulisch heffen en pendelbeweging met teller';
  p.settings.tagFormat = '{prefix}{n}';
  p.pages = [newPage('1 Automatische terugloop'), newPage('2 Tweehandbediening (EN)'), newPage('3 Hydraulisch heffen'), newPage('4 Pendelbeweging met teller')];
  let pg = p.pages[0];
  const place = (sym, x, y, tag, props = {}, o = {}) => {
    const def = lib.get(sym);
    pg.comps.push({ id: uid('c'), sym, x, y, rot: 0, mirror: false, props: { ...(def.props || {}), ...props }, autoTag: false, tag, ...o });
  };
  const wire = (...points) => pg.wires.push({ id: uid('w'), points });
  const note = (x, y, text) => pg.texts.push({ id: uid('t'), x, y, text, size: 3, anchor: 'start' });

  // 1 – automatic return
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
  note(40, 32, 'Klik 1S1: cilinder 1A1 schuift uit (vertraagd door 1V3) en keert automatisch terug bij 1S2.');

  // 2 – two-hand control
  pg = p.pages[1];
  place('flu/p/cyl1', 200, 50, '2A1', { time: 0.8 });
  place('flu/p/v32-pil', 200, 110, '2V1');
  place('flu/p/exhaust', 215, 125, '');
  place('flu/p/and', 140, 100, '2V2');
  place('flu/p/v32-btn', 100, 160, '2S1');
  place('flu/p/exhaust', 115, 175, '');
  place('flu/p/v32-btn', 160, 160, '2S2');
  place('flu/p/exhaust', 175, 175, '');
  place('flu/p/source', 205, 210, '0Z2', { p: 6 });
  wire([205, 65], [205, 105]);
  wire([140, 100], [140, 95], [165, 95], [165, 115], [170, 115]);
  wire([105, 155], [105, 110], [130, 110]);
  wire([165, 155], [165, 130], [150, 130], [150, 110]);
  wire([105, 175], [105, 195], [205, 195]);
  wire([205, 125], [205, 195]);
  wire([205, 195], [205, 210]);
  wire([165, 175], [165, 195]);
  note(40, 32, 'Shift+klik 2S1 en klik 2S2: de cilinder schuift pas uit als beide knoppen bediend zijn (EN-ventiel 2V2).');

  // 3 – hydraulic lifting
  pg = p.pages[2];
  place('flu/h/cyl2', 180, 50, '3A1', { time: 2, marks: '' });
  place('flu/h/v43-hand', 180, 120, '3V1');
  place('flu/h/powerpack', 185, 190, '0P1', { p: 60 });
  place('flu/h/relief', 160, 150, '3V2', { p: 40 });
  place('flu/h/tank', 160, 170, '');
  place('flu/h/filter', 195, 160, '3Z1', {}, { rot: 90 });
  place('flu/h/gauge', 175, 175, '');
  wire([185, 65], [185, 115]);
  wire([215, 65], [215, 95], [195, 95], [195, 115]);
  wire([185, 135], [185, 150]);
  wire([185, 150], [185, 190]);
  wire([185, 150], [160, 150]);
  wire([195, 135], [195, 150]);
  wire([195, 170], [195, 190]);
  wire([175, 175], [185, 175]);
  note(40, 32, 'Klik links of rechts op de hendel van 3V1: heffen of dalen. 3V2 begrenst de druk op 40 bar (zie manometer).');

  // 4 – oscillating cylinder with pulse counter
  pg = p.pages[3];
  place('flu/p/cyl2', 180, 40, '4A1', { marks: '4S1=0; 4S2=100', time: 1 });
  place('flu/p/v52-pil', 180, 110, '4V1');
  place('flu/p/exhaust', 185, 125, '');
  place('flu/p/exhaust', 195, 125, '');
  place('flu/p/v32-roll', 250, 160, '4S2', { mark: '4S2' });
  place('flu/p/exhaust', 265, 175, '');
  place('flu/p/counter', 275, 140, '4C1');
  place('flu/p/and', 130, 105, '4V2');
  place('flu/p/v32-roll', 70, 160, '4S1', { mark: '4S1' });
  place('flu/p/exhaust', 85, 175, '');
  place('flu/p/v32-btn', 150, 160, '4S0');
  place('flu/p/exhaust', 165, 175, '');
  place('flu/p/source', 190, 210, '0Z4', { p: 6 });
  wire([185, 55], [185, 105]);
  wire([215, 55], [215, 85], [195, 85], [195, 105]);
  wire([255, 155], [255, 115], [210, 115]);
  wire([260, 140], [255, 140]);
  wire([130, 105], [130, 100], [145, 100], [145, 115], [150, 115]);
  wire([75, 155], [75, 115], [120, 115]);
  wire([155, 155], [155, 135], [140, 135], [140, 115]);
  wire([75, 175], [75, 195], [255, 195], [255, 175]);
  wire([190, 125], [190, 195]);
  wire([190, 195], [190, 210]);
  wire([155, 175], [155, 195]);
  note(40, 25, 'Shift+klik 4S0 (start vasthouden): 4A1 pendelt tussen 4S1 en 4S2; pulsteller 4C1 telt de slagen.');
  return p;
}
