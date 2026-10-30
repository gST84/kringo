// Cooling sheet of the control demo project: a chiller (compressor, air-cooled condenser, receiver, drier,
// sight glass, liquid-line solenoid valve, expansion valve, water-cooled evaporator) cooling the
// coolant of a machine spindle (tank, pump, filter, flow switch, thermostat). The electrical sheet
// "Koeling – sturing" (src/demo.js) runs the pump and the compressor and switches the solenoid valve.
import { newPage } from '../model.js';
import { uid } from '../util.js';

export function coolingDemoPage(lib) {
  const page = newPage('Koelwater spindel met chiller', 'empty', 'cool');
  const comps = {};
  const place = (key, sym, x, y, tag = '', props = {}) => {
    const def = lib.get(sym);
    const c = { id: uid('c'), sym, x, y, rot: 0, mirror: false, props: { ...(def.props || {}), ...props }, autoTag: false, tag };
    page.comps.push(c);
    comps[key] = c;
    return c;
  };
  const wire = (...points) => page.wires.push({ id: uid('w'), points });
  const note = (x, y, text) => page.texts.push({ id: uid('t'), x, y, text, size: 3, anchor: 'start' });

  // refrigerant circuit: high-pressure side on top (left → right), suction line below (right → left)
  place('comp', 'cool/compressor', 60, 60, 'M1', { tevap: 2, tcond: 40 });
  place('psh', 'cool/psh', 85, 50, 'B4');
  place('cond', 'cool/cond-air', 110, 60, 'E1');
  place('pihi', 'cool/pi', 130, 50);
  place('recv', 'cool/receiver', 150, 60);
  place('drier', 'cool/drier', 185, 60);
  place('sight', 'cool/sight', 215, 60);
  place('sol', 'cool/solvalve', 250, 60, 'V1');
  place('txv', 'cool/txv', 285, 60, 'V2');
  place('evap', 'cool/evap-w', 260, 120, 'E3', { cap: 6 });
  place('psl', 'cool/psl', 100, 105, 'B3');
  place('pilo', 'cool/pi', 130, 105);
  wire([70, 60], [100, 60]);
  wire([120, 60], [140, 60]);
  wire([160, 60], [175, 60]);
  wire([195, 60], [205, 60]);
  wire([225, 60], [240, 60]);
  wire([260, 60], [275, 60]);
  wire([295, 60], [310, 60], [310, 115], [270, 115]);
  wire([250, 115], [40, 115], [40, 60], [50, 60]);

  // coolant circuit: tank → pump → filter → evaporator → spindle → back to the tank
  place('tank', 'cool/tank', 70, 215, 'T1', { volume: 10, t0: 20 });
  place('pump', 'cool/pump', 110, 200, 'P1', { flow: 20 });
  place('filter', 'cool/filter', 160, 200, 'Z1');
  place('load', 'cool/load', 200, 160, 'E2', { desc: 'Spindel', power: 3 });
  place('fs', 'cool/fs', 230, 150, 'B1');
  place('ti', 'cool/ti', 160, 150);
  place('ts', 'cool/ts', 85, 190, 'B2', { sp: 22, hyst: 2 });
  wire([75, 215], [75, 200], [100, 200]);
  wire([120, 200], [150, 200]);
  wire([170, 200], [270, 200], [270, 125]);
  wire([250, 125], [250, 160], [210, 160]);
  wire([190, 160], [65, 160], [65, 215]);

  note(40, 25, 'Start de pomp op het blad "Koeling – sturing". De spindel (3 kW) warmt het reservoir op; boven 22 °C opent thermostaat B2 het magneetventiel V1');
  note(40, 31, 'en start de compressor op de lage druk (B3). De verdamper (6 kW) koelt tot 20 °C, dan sluit V1 en pompt de compressor af. Tip: snelheid 5× of 10×.');
  return { page, comps };
}
