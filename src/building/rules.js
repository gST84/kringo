// Basic AREI checks for circuits (Belgian rules for household installations).
import { boardOf, circuitSymbols, treeAncestors } from './model.js';

/** Maximum breaker rating per copper section (mm²) for household circuits. */
export const MAX_IN = { 1.5: 16, 2.5: 20, 4: 25, 6: 32, 10: 40, 16: 63 };
const DEDICATED = new Set(['washer', 'dryer', 'dishwasher', 'hob', 'oven', 'boiler', 'heatpump', 'ev', 'hood', 'cooker', 'freezer', 'heater', 'heater-acc', 'heater-fan', 'boiler-acc']);

export function checkCircuits(building, lib) {
  const out = [];
  const warn = (c, text, level = 'warn') => out.push({ circuit: c?.id, name: c?.name, text, level });
  for (const c of building.circuits) {
    const syms = circuitSymbols(building, c.id).map(({ s }) => ({ s, def: lib.get(s.sym) }));
    const sockets = syms.filter((x) => x.def?.kind === 'socket').length;
    const max = MAX_IN[c.section];
    if (!syms.length) warn(c, 'Kring zonder toestellen.', 'info');
    if (max && c.In > max) warn(c, `Automaat ${c.In} A te groot voor ${c.section} mm² (max. ${max} A).`, 'error');
    if (sockets > 8) warn(c, `${sockets} stopcontacten: max. 8 (enkel- of meervoudige) per kring.`, 'error');
    if (sockets && c.section < 2.5) warn(c, 'Kringen met stopcontacten: min. 2,5 mm².', 'error');
    if (sockets && c.In > 20) warn(c, 'Kringen met stopcontacten: automaat max. 20 A.', 'error');
    const dedicated = syms.filter((x) => DEDICATED.has(String(x.s.sym).replace('arei/', '')));
    if (dedicated.length && syms.length > 1) warn(c, `${dedicated[0].def.name}: hoort op een aparte kring.`);
    const board = boardOf(building, c.id);
    const has30 = treeAncestors(building, c.id).some((a) => (a.type === 'rcd' && a.node.sens <= 30) || (a.type === 'board' && a.node.main?.rcd > 0 && a.node.main.rcd <= 30));
    if (!board) warn(c, 'Niet aangesloten op een verdeelbord.', 'error');
    else if (!has30) {
      if (syms.some((x) => ['socket', 'appliance'].includes(x.def?.kind))) warn(c, 'Stopcontacten / toestellen zonder differentieel 30 mA (verplicht in natte ruimten).', 'info');
    }
  }
  let loose = 0;
  for (const f of building.floors) for (const s of f.symbols) {
    const d = lib.get(s.sym);
    if (!s.circuit && d && !['switch', 'push', 'dom-in', 'board'].includes(d.kind)) loose++;
  }
  if (loose) warn(null, `${loose} symbool/symbolen zonder kring.`, 'info');
  return out;
}
