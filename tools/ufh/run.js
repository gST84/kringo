// Command line runner (JavaScriptCore): jsc -m tools/ufh/run.js -- <case> [svg]
// Prints a report, or the plan as SVG.
import { generate } from '../../src/building/ufh.js';
import { check, svg } from './check.js';
import { CASES } from './cases.js';

const args = globalThis.arguments || globalThis.scriptArgs || [];
const names = args[0] && args[0] !== 'all' ? [args[0]] : Object.keys(CASES);
for (const name of names) {
  const input = CASES[name];
  const t0 = Date.now();
  const res = generate(input);
  const ms = Date.now() - t0;
  const chk = check(input, res);
  if (args[1] === 'svg') { print(svg(input, res, chk, { cells: args[2] === 'cells' })); continue; }
  print(`== ${name}: ${res.loops.length} kringen, ${res.loops.reduce((s, l) => s + l.length, 0).toFixed(0)} m, ${ms} ms`);
  print(`   koude plekken ${chk.coldPct}% · verste punt ${chk.worst} cm · kruisingen ${chk.crossings.length} · kleinste tussenafstand ${res.minPitch?.toFixed(1) ?? '-'} cm`);
  for (const r of chk.rooms) print(`   ${r.name.padEnd(12)} max ${String(r.max).padStart(5)} cm  koud ${r.cold}%`);
  print('   ' + res.loops.map((l) => `${l.name} ${l.room} ${l.length}m`).join(' | '));
  for (const w of res.warnings) print('   ! ' + w);
}
