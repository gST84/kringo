// Example control project: direct-on-line motor starter (power + control), a 24 V page with
// emergency stop, selector, time relay, lamps and buzzer, a PLC page, an electrical sheet that drives
// a pneumatic cylinder, the pneumatic / hydraulic sheets, and a machine cooling circuit (chiller) with
// its control. All pages can be simulated together.
import { newPage, newProject } from './model.js';
import { fluidDemoPages } from './fluid/demo.js';
import { coolingDemoPage } from './cooling/demo.js';
import { autoTag, numberContact, nextTerminal } from './schematic/tags.js';
import { uid } from './util.js';

export function demoProject(lib) {
  const p = newProject('Demo – besturing');
  p.meta.description = 'Motorstarter, tijdrelais, PLC, elektropneumatiek, hydraulica / pneumatica en machinekoeling – met simulatie';
  p.pages = [newPage('Vermogen', 'power'), newPage('Stuurstroom', 'control'), newPage('Ventilatie 24 V (tijdrelais)', 'dc'), newPage('PLC', 'dc'),
    newPage('Elektropneumatiek – sturing', 'dc'), newPage('Koeling – sturing', 'dc')];
  const [pw, ctl, vent, plc, ep, ks] = p.pages;
  const cool = coolingDemoPage(lib);
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

  // 24 V page: emergency stop → selector → on-delay relay; its contacts switch lamps; push button → buzzer
  place(2, 'estop', 'std/estop', 60, 40, { desc: 'Noodstop' });
  place(2, 'sel', 'std/selector', 60, 80, { desc: 'Ventilatie aan' });
  place(2, 'kt', 'std/coil-on', 60, 140, { desc: 'Ventilator vertraagd', t: 3 });
  place(2, 'kton', 'std/no-on', 120, 80);
  place(2, 'run', 'std/lamp', 120, 140, { desc: 'Ventilator draait' });
  place(2, 'ktnc', 'std/nc', 180, 80);
  place(2, 'wait', 'std/lamp', 180, 140, { desc: 'Wachten' });
  place(2, 'test', 'std/pb-no', 240, 80, { desc: 'Test zoemer' });
  place(2, 'buzz', 'std/buzzer', 240, 140, { desc: 'Zoemer' });
  for (const x of [60, 120, 180, 240]) wire(vent, [x, 25], [x, x === 60 ? 40 : 80]);
  wire(vent, [60, 60], [60, 80]);
  for (const x of [60, 120, 180, 240]) { wire(vent, [x, 100], [x, 140]); wire(vent, [x, 160], [x, 245]); }
  // PLC page: push button on input I0.0, lamp on output Q0.0
  place(3, 'di', 'std/plc-card-di', 60, 100, { desc: 'Ingangen' });
  place(3, 'do', 'std/plc-card-do', 60, 160, { desc: 'Uitgangen' });
  place(3, 'pbplc', 'std/pb-no', 60, 60, { desc: 'Start cyclus' });
  place(3, 'lplc', 'std/lamp', 60, 200, { desc: 'Cyclus actief' });
  wire(plc, [60, 25], [60, 60]);
  wire(plc, [60, 80], [60, 100]);
  wire(plc, [60, 185], [60, 200]);
  wire(plc, [60, 220], [60, 245]);
  plc.texts.push({ id: uid('t'), x: 150, y: 110, text: 'De PLC-logica zelf wordt niet gesimuleerd;\nde kaarten tonen de adressen en aansluitingen.', size: 2.5, anchor: 'start' });

  // electro-pneumatics: Start (self-holding) → K energizes solenoid Y of valve 5V1 on the fluid sheet;
  // limit switch at the extended end (NC) drops K, the cylinder returns; a lamp shows "retracted"
  place(4, 'epStart', 'std/pb-no', 60, 40, { desc: 'Start cilinder' });
  place(4, 'epHold', 'std/no', 80, 40);
  place(4, 'epEnd', 'std/limit-nc', 60, 90, { desc: 'Cilinder uit' });
  place(4, 'epK', 'std/coil', 60, 150, { desc: 'Cilinder uitsturen' });
  place(4, 'epKno', 'std/no', 120, 90);
  place(4, 'epY', 'std/valve', 120, 150, { desc: 'Ventiel 5V1' });
  place(4, 'epIn', 'std/limit-no', 180, 90, { desc: 'Cilinder in' });
  place(4, 'epLamp', 'std/lamp', 180, 150, { desc: 'Cilinder ingetrokken' });
  wire(ep, [60, 25], [60, 35]);
  wire(ep, [60, 35], [60, 40]);
  wire(ep, [60, 35], [80, 35], [80, 40]);
  wire(ep, [60, 60], [60, 75]);
  wire(ep, [80, 60], [80, 75], [60, 75]);
  wire(ep, [60, 75], [60, 90]);
  for (const x of [60, 120, 180]) { wire(ep, [x, 110], [x, 150]); wire(ep, [x, 170], [x, 245]); }
  for (const x of [120, 180]) wire(ep, [x, 25], [x, 90]);
  ep.texts.push({ id: uid('t'), x: 230, y: 60, text: 'Start → spoel van ventiel 5V1 (blad "Elektropneumatiek – cilinder")\nschuift de cilinder uit; de eindschakelaar keert hem terug.', size: 2.5, anchor: 'start' });

  // cooling: Stop / Start (self-holding) → K pump; thermostat → liquid-line solenoid valve;
  // flow switch, low-pressure (closes with pressure) and high-pressure switch (NC) → K compressor
  place(5, 'kStop', 'std/pb-nc', 60, 40, { desc: 'Stop pomp' });
  place(5, 'kStart', 'std/pb-no', 60, 75, { desc: 'Start pomp' });
  place(5, 'kHold', 'std/no', 80, 75);
  place(5, 'kPump', 'std/coil', 60, 150, { desc: 'Pomp koelwater' });
  place(5, 'kTs', 'std/no', 120, 40, { desc: 'Koelvraag' });
  place(5, 'kY', 'std/valve', 120, 150, { desc: 'Magneetventiel V1' });
  place(5, 'kFs', 'std/no', 180, 40, { desc: 'Debiet' });
  place(5, 'kLp', 'std/no', 180, 75, { desc: 'Lage druk' });
  place(5, 'kHp', 'std/nc', 180, 110, { desc: 'Hoge druk' });
  place(5, 'kComp', 'std/coil', 180, 150, { desc: 'Compressor + ventilator' });
  place(5, 'kHpL', 'std/no', 240, 40);
  place(5, 'kHpLamp', 'std/lamp', 240, 150, { desc: 'Storing hoge druk' });
  place(5, 'kFsL', 'std/nc', 300, 40);
  place(5, 'kFsLamp', 'std/lamp', 300, 150, { desc: 'Geen debiet' });
  wire(ks, [60, 25], [60, 40]);
  wire(ks, [60, 60], [60, 70]);
  wire(ks, [60, 70], [60, 75]);
  wire(ks, [60, 70], [80, 70], [80, 75]);
  wire(ks, [60, 95], [60, 105]);
  wire(ks, [80, 95], [80, 105], [60, 105]);
  wire(ks, [60, 105], [60, 150]);
  for (const x of [120, 240, 300]) { wire(ks, [x, 25], [x, 40]); wire(ks, [x, 60], [x, 150]); }
  wire(ks, [180, 25], [180, 40]);
  wire(ks, [180, 60], [180, 75]);
  wire(ks, [180, 95], [180, 110]);
  wire(ks, [180, 130], [180, 150]);
  for (const x of [60, 120, 180, 240, 300]) wire(ks, [x, 170], [x, 245]);
  ks.texts.push({ id: uid('t'), x: 320, y: 70, text: 'Het koelcircuit staat op het blad\n"Koelwater spindel met chiller".', size: 2.5, anchor: 'start' });
  comps.kHold.link = comps.kPump.id;
  comps.kTs.link = cool.comps.ts.id;
  comps.kFs.link = cool.comps.fs.id;
  comps.kFsL.link = cool.comps.fs.id;
  comps.kLp.link = cool.comps.psl.id;
  comps.kHp.link = cool.comps.psh.id;
  comps.kHpL.link = cool.comps.psh.id;

  comps.epHold.link = comps.epK.id;
  comps.epKno.link = comps.epK.id;
  comps.kton.link = comps.kt.id;
  comps.ktnc.link = comps.kt.id;
  comps.kmain.link = comps.coil.id;
  comps.hold.link = comps.coil.id;
  comps.aux.link = comps.coil.id;
  comps.fnc.link = comps.f.id;
  tagAll();
  numberContact(p, lib, comps.hold);
  numberContact(p, lib, comps.aux);
  numberContact(p, lib, comps.kton);
  numberContact(p, lib, comps.ktnc);
  numberContact(p, lib, comps.epHold);
  numberContact(p, lib, comps.epKno);
  // the limit switches react to cylinder marks with their own name
  const mark = (c) => (c.props.mark = c.tag.replace(/^-+/, ''));
  p.pages.push(...fluidDemoPages(lib, { sol: comps.epY.tag, marks: [mark(comps.epIn), mark(comps.epEnd)] }), cool.page);
  // the cooling parts follow the contactors and the solenoid of the electrical sheet
  cool.comps.pump.props.drive = comps.kPump.tag;
  cool.comps.comp.props.drive = comps.kComp.tag;
  cool.comps.cond.props.drive = comps.kComp.tag;
  cool.comps.sol.props.sol = comps.kY.tag;
  for (const k of ['kHold', 'kTs', 'kFs', 'kFsL', 'kLp', 'kHp', 'kHpL']) numberContact(p, lib, comps[k]);
  return p;
}
