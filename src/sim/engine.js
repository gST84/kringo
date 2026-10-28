// Functional simulation of pneumatic / hydraulic circuits with their electrical control (FluidSIM-like).
// Every tick: cylinder positions → limit switches; then until stable: electrical circuit (contacts,
// coils, solenoids) ↔ valve positions ↔ pressures in the lines; then cylinders and motors move.
// Lines (nets) carry a pressure p (bar) and a flow capacity k (0..1, throttles reduce it); a line that is
// not under pressure can vent to the atmosphere / tank with capacity `vent`. Cylinder speed follows
// min(k of the supply side, vent of the exhaust side). The model is kept small on purpose, so it can
// grow into a physical one later (forces, flows, pressure drops) without changing the editor.
import { parseMarks, restPosition, valvePaths } from '../fluid/symbols.js';

const ATM = '__atm';
const norm = (s) => String(s || '').trim().replace(/^-+/, '').toUpperCase();

// rail names that carry the supply (+) or the return (−) of the control circuit
const PLUS = /^(\+.*|L\d?|L\+|24V|\+24V|P24|U\+)$/i;
const MINUS = /^(0V|N|M|L-|GND|-)$/i;

/** Electrical parts that conduct between pairs of pins (protection, terminals). */
const CONDUCTOR = /^std\/(fuse|mcb\d|rcd\d|mainswitch|mpcb|thermal)$/;
/** Electrical loads (two pins): coils, solenoids, lamps … */
const LOAD = /^std\/(coil|coil-on|coil-off|valve|lamp|buzzer|heater|motor1)$/;

export class Simulation {
  constructor(project, lib, an) {
    this.project = project;
    this.lib = lib;
    this.an = an;
    this.time = 0;
    this.pressed = new Set(); // momentary: compId or compId:L / compId:R
    this.latched = new Set();
    this.valvePos = new Map();
    this.cyl = new Map(); // compId -> {x}
    this.motorAngle = new Map();
    this.count = new Map(); // pulse counters: compId -> {n, last}
    this.coil = new Map(); // compId -> {on, onFor, offFor}
    this.P = new Map(); // net -> {p, k}
    this.V = new Map(); // net -> vent capacity
    this.groups = new Map(); // electric net -> {plus, minus}
    this.loadsOn = new Set(); // compIds
    this.solOn = new Set(); // normalized tags of energized loads
    this.marks = new Set(); // active cylinder marks (normalized)
    this.short = false;
    const infos = [...an.comps.values()];
    this.fluid = infos.filter((i) => i.def?.fluid);
    this.elec = infos.filter((i) => !i.def?.fluid && i.pins.length);
    for (const i of this.fluid) {
      const k = i.def.fluid.kind;
      if (k === 'valve') this.valvePos.set(i.comp.id, restPosition(this.props(i)));
      if (k === 'cylinder') this.cyl.set(i.comp.id, { x: this.props(i).acting === 'singleL' ? 1 : 0 });
      if (k === 'motor') this.motorAngle.set(i.comp.id, 0);
      if (k === 'counter') this.count.set(i.comp.id, { n: 0, last: false });
    }
    for (const i of this.elec) if (/^std\/coil/.test(i.def?.id)) this.coil.set(i.comp.id, { on: false, onFor: 0, offFor: 1e9 });
    this.solve();
  }

  props(info) { return { ...(info.def?.props || {}), ...(info.comp.props || {}) }; }
  net(info, pinId) { return this.an.pinNet.get(`${info.comp.id}:${pinId}`) || null; }
  /** A port without any pipe or other pin on it. */
  open(net) { return !net || (net.pins.length <= 1 && !net.wires.length && !net.rails.size && !net.pots.size); }
  pressure(net) { return net ? this.P.get(net)?.p || 0 : 0; }

  // ---------- user input ----------

  /** Mouse down on a component (side 'L' / 'R' for valves); `latch` keeps it pressed (Shift). */
  press(id, side, latch) {
    const info = this.an.comps.get(id);
    if (!info) return;
    const key = info.def?.fluid?.kind === 'valve' ? `${id}:${side}` : id;
    const toggle = /^std\/(estop|selector|keyswitch)$/.test(info.def?.id);
    if (toggle || latch) { if (this.latched.has(key)) this.latched.delete(key); else this.latched.add(key); }
    else this.pressed.add(key);
    this.solve();
  }

  release() { this.pressed.clear(); this.solve(); }

  // ---------- electrical ----------

  contactAct(info) {
    const c = info.comp;
    const m = info.master;
    if (m) {
      const st = this.coil.get(m.comp.id);
      if (st) {
        const t = +this.props(m).t || +this.props(info).t || 1;
        if (/-on$/.test(info.def.id) || m.def.id === 'std/coil-on') return st.on && st.onFor >= t - 1e-9;
        if (m.def.id === 'std/coil-off') return st.on || st.offFor < t - 1e-9;
        return st.on;
      }
      if (m.def?.fluid?.kind === 'pswitch') return this.pressure(this.net(m, 'X')) >= (+this.props(m).p || 0.1) - 1e-9;
      return this.deviceAct(m);
    }
    return this.deviceAct(info, c);
  }

  deviceAct(info) {
    const id = info.comp.id;
    if (/^std\/limit/.test(info.def?.id)) return this.marks.has(norm(info.comp.props?.mark || info.tag));
    if (info.def?.fluid?.kind === 'pswitch') return this.pressure(this.net(info, 'X')) >= (+this.props(info).p || 0.1) - 1e-9;
    return this.pressed.has(id) || this.latched.has(id);
  }

  solveElectric() {
    const parent = new Map();
    const find = (a) => { while (parent.has(a) && parent.get(a) !== a) a = parent.get(a); return a; };
    const union = (a, b) => { if (!a || !b) return; const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
    const pinNet = (i, idx) => this.net(i, i.pins[idx]?.id);
    for (const i of this.elec) {
      const def = i.def;
      if (!def) continue;
      if (def.contact) {
        const act = this.contactAct(i);
        if (def.contact === 'NO' && act) union(pinNet(i, 0), pinNet(i, 1));
        else if (def.contact === 'NC' && !act) union(pinNet(i, 0), pinNet(i, 1));
        else if (def.contact === 'CO') union(this.net(i, '1'), this.net(i, act ? '3' : '2'));
        else if (def.contact === 'NO3' && act) for (let k = 0; k + 1 < i.pins.length; k += 2) union(pinNet(i, k), pinNet(i, k + 1));
      } else if (CONDUCTOR.test(def.id)) {
        for (let k = 0; k + 1 < i.pins.length; k += 2) union(pinNet(i, k), pinNet(i, k + 1));
      }
    }
    const pol = new Map();
    for (const net of this.an.nets.values()) {
      if (net.fluid) continue;
      const r = find(net);
      const g = pol.get(r) || { plus: false, minus: false };
      for (const n of net.rails) { if (PLUS.test(n)) g.plus = true; if (MINUS.test(n)) g.minus = true; }
      for (const n of net.pots) { if (PLUS.test(n)) g.plus = true; if (MINUS.test(n)) g.minus = true; }
      pol.set(r, g);
    }
    this.groups = new Map();
    this.short = false;
    for (const net of this.an.nets.values()) {
      if (net.fluid) continue;
      const g = pol.get(find(net));
      this.groups.set(net, g);
      if (g.plus && g.minus) this.short = true;
    }
    const on = new Set();
    for (const i of this.elec) {
      if (!LOAD.test(i.def?.id) || i.pins.length < 2) continue;
      const a = this.groups.get(pinNet(i, 0)), b = this.groups.get(pinNet(i, 1));
      if (a && b && ((a.plus && b.minus) || (a.minus && b.plus))) on.add(i.comp.id);
    }
    this.loadsOn = on;
    this.solOn = new Set(this.elec.filter((i) => on.has(i.comp.id)).map((i) => norm(i.tag)).filter(Boolean));
    for (const [id, st] of this.coil) st.on = on.has(id);
  }

  // ---------- valves ----------

  actuated(info, kind, side) {
    const p = this.props(info);
    const key = `${info.comp.id}:${side}`;
    switch (kind) {
      case 'hand': case 'button': case 'lever': return this.pressed.has(key) || this.latched.has(key);
      case 'roller': return this.marks.has(norm(p.mark || info.tag));
      case 'pilot': return this.pressure(this.net(info, side === 'L' ? 'XL' : 'XR')) > 0;
      case 'solenoid': return this.solOn.has(norm(side === 'L' ? p.solL : p.solR)) || this.pressed.has(key) || this.latched.has(key);
      default: return false;
    }
  }

  updateValves() {
    for (const i of this.fluid) {
      if (i.def.fluid.kind !== 'valve') continue;
      const p = this.props(i);
      const n = valvePaths(p).length;
      const L = this.actuated(i, p.left, 'L'), R = this.actuated(i, p.right, 'R');
      let pos = this.valvePos.get(i.comp.id);
      if (L && !R) pos = 0;
      else if (R && !L) pos = n - 1;
      else if (!L && !R) {
        if (n === 3 && (p.centring !== false || p.left === 'spring' || p.right === 'spring')) pos = 1;
        else if (p.right === 'spring') pos = n - 1;
        else if (p.left === 'spring') pos = 0;
      }
      this.valvePos.set(i.comp.id, pos);
    }
  }

  // ---------- fluid ----------

  solveFluid() {
    const press = []; // [from, to, k, cap, mul]
    const vent = []; // [net, via, k]: `net` can vent through `via`
    const sources = [];
    const caps = new Map();
    const both = (a, b, k = 1, cap) => { if (!a || !b) return; press.push([a, b, k, cap], [b, a, k, cap]); vent.push([a, b, k], [b, a, k]); };
    for (const i of this.fluid) {
      const p = this.props(i);
      const n = (id) => this.net(i, id);
      switch (i.def.fluid.kind) {
        case 'valve': {
          const paths = valvePaths(p)[this.valvePos.get(i.comp.id)] || [];
          for (const [a, b] of paths) {
            const na = n(a), nb = n(b);
            // a free exhaust port vents to the air
            const ex = (id, net) => ((id === 'R' || id === 'S') && this.open(net) ? ATM : net);
            both(ex(a, na), ex(b, nb));
          }
          break;
        }
        case 'source': sources.push([n('1'), +p.p || 6]); break;
        case 'powerpack': sources.push([n('P'), +p.p || 60]); vent.push([n('T'), ATM, 1]); break;
        case 'exhaust': vent.push([n('1'), ATM, 1]); break;
        case 'check': press.push([n('1'), n('2'), 1]); vent.push([n('1'), n('2'), 1]); break;
        case 'throttle': both(n('1'), n('2'), Math.max(0.02, Math.min(1, (+p.open || 50) / 100))); break;
        case 'flowcheck': {
          const k = Math.max(0.02, Math.min(1, (+p.open || 50) / 100));
          press.push([n('1'), n('2'), 1], [n('2'), n('1'), k]);
          vent.push([n('1'), n('2'), 1], [n('2'), n('1'), k]);
          break;
        }
        case 'regulator': press.push([n('1'), n('2'), 1, +p.p || 6]); vent.push([n('2'), n('1'), 1]); break;
        case 'relief': if (n('P')) caps.set(n('P'), Math.min(caps.get(n('P')) ?? Infinity, +p.p || 50)); break;
        case 'pass': both(n('1'), n('2')); break;
        case 'booster': {
          // pressure intensifier / converter: output pressure = input × ratio, flow only forwards
          const r = Math.max(0.01, +p.ratio || 1);
          press.push([n('1'), n('2'), 1, undefined, r]);
          vent.push([n('2'), n('1'), 1]);
          break;
        }
        case 'counter': {
          const c = this.count.get(i.comp.id);
          if (n('A') && c && c.n >= (+p.n || 5)) both(n('P'), n('A'));
          break;
        }
        case 'or': press.push([n('X'), n('A'), 1], [n('Y'), n('A'), 1]); vent.push([n('A'), n('X'), 1], [n('A'), n('Y'), 1]); break;
        case 'and': {
          const px = this.pressure(n('X')), py = this.pressure(n('Y'));
          if (px > 0 && py > 0) press.push([n('X'), n('A'), 1, Math.min(px, py)], [n('Y'), n('A'), 1, Math.min(px, py)]);
          vent.push([n('A'), n('X'), 1], [n('A'), n('Y'), 1]);
          break;
        }
        default: break;
      }
    }
    const P = new Map();
    const get = (net) => P.get(net) || { p: 0, k: 0 };
    for (const [net, p] of sources) if (net) { const c = caps.get(net) ?? Infinity; P.set(net, { p: Math.max(get(net).p, Math.min(p, c)), k: 1 }); }
    for (let changed = true, it = 0; changed && it < 200; it++) {
      changed = false;
      for (const [a, b, k, cap, mul] of press) {
        if (!a || !b || b === ATM || a === ATM) continue;
        const pa = get(a);
        if (!(pa.p > 0)) continue;
        const pb = get(b);
        const np = Math.min(pa.p * (mul || 1), cap ?? Infinity, caps.get(b) ?? Infinity), nk = Math.min(pa.k, k);
        if (np > pb.p + 1e-9 || nk > pb.k + 1e-9) { P.set(b, { p: Math.max(pb.p, np), k: Math.max(pb.k, nk) }); changed = true; }
      }
    }
    // a line connected to the air through an open path has no pressure (the air escapes)
    const V = new Map([[ATM, 1]]);
    for (let changed = true, it = 0; changed && it < 200; it++) {
      changed = false;
      for (const [a, via, k] of vent) {
        if (!a || !via || a === ATM) continue;
        const vv = V.get(via) || 0;
        if (!vv || get(a).p > 0) continue;
        const nv = Math.min(vv, k);
        if (nv > (V.get(a) || 0) + 1e-9) { V.set(a, nv); changed = true; }
      }
    }
    this.P = P;
    this.V = V;
  }

  // ---------- step ----------

  updateMarks() {
    const on = new Set();
    for (const i of this.fluid) {
      if (i.def.fluid.kind !== 'cylinder') continue;
      const p = this.props(i);
      const stroke = +p.stroke || 100;
      const x = this.cyl.get(i.comp.id).x * stroke;
      for (const m of parseMarks(p.marks)) {
        const at = m.pct ? (m.at / 100) * stroke : m.at;
        // marks on an end position switch only there; others within a small distance
        const hit = at >= stroke ? x >= stroke - 1e-6 : at <= 0 ? x <= 1e-6 : Math.abs(x - at) <= Math.max(0.3, stroke * 0.005);
        if (hit) on.add(norm(m.name));
      }
    }
    this.marks = on;
  }

  /** Solves the circuit for the current positions (until valves, coils and pressures are stable). */
  solve() {
    this.updateMarks();
    let sig = '';
    for (let it = 0; it < 30; it++) {
      this.solveElectric();
      this.updateValves();
      this.solveFluid();
      const s = [...this.valvePos.values()].join(',') + '|' + [...this.loadsOn].sort().join(',') + '|' + [...this.P].map(([n, v]) => `${n.id}:${v.p}`).sort().join(',');
      if (s === sig) break;
      sig = s;
    }
  }

  step(dt) {
    this.time += dt;
    for (const st of this.coil.values()) {
      if (st.on) { st.onFor += dt; st.offFor = 0; } else { st.offFor += dt; st.onFor = 0; }
    }
    for (const i of this.fluid) {
      const kind = i.def.fluid.kind;
      if (kind !== 'cylinder' && kind !== 'motor') continue;
      const p = this.props(i);
      const a = this.net(i, 'A'), b = this.net(i, 'B');
      const pa = this.P.get(a), pb = this.P.get(b);
      const va = this.V.get(a) || 0, vb = b ? this.V.get(b) || 0 : 1;
      let speed = 0; // fraction of the full stroke (or turns) per second
      const acting = kind === 'cylinder' ? p.acting || 'double' : 'double';
      const base = kind === 'motor' ? (+p.rpm || 60) / 60 : 1 / Math.max(0.05, +p.time || 1);
      if (acting === 'singleL') {
        // spring on the cap side: pressure on B retracts, the spring pushes the rod out again
        speed = pb?.p > 0 ? -pb.k * base : vb * base;
      } else if (acting === 'single' || acting === 'plain') {
        // spring (or the load) returns the piston when A can vent
        speed = pa?.p > 0 ? pa.k * base : -va * base;
      } else if (pa?.p > 0 && !(pb?.p > 0)) speed = Math.min(pa.k, vb) * base;
      else if (pb?.p > 0 && !(pa?.p > 0)) speed = -Math.min(pb.k, va) * base;
      if (kind === 'cylinder') {
        const st = this.cyl.get(i.comp.id);
        st.x = Math.max(0, Math.min(1, st.x + speed * dt));
      } else this.motorAngle.set(i.comp.id, ((this.motorAngle.get(i.comp.id) || 0) + speed * dt * 360) % 360);
    }
    this.solve();
    // pulse counters count every rising pressure edge on X
    let counted = false;
    for (const i of this.fluid) {
      const c = this.count.get(i.comp.id);
      if (!c) continue;
      const on = this.pressure(this.net(i, 'X')) > 0;
      if (on && !c.last) { c.n++; counted = true; }
      c.last = on;
    }
    if (counted) this.solve();
  }

  // ---------- view ----------

  /** Extra properties / class for drawing a component in its current state. */
  compState(id) {
    const info = this.an.comps.get(id);
    if (!info) return null;
    const k = info.def?.fluid?.kind;
    if (k === 'valve') return { props: { __pos: this.valvePos.get(id) } };
    if (k === 'cylinder') return { props: { __x: Math.round(this.cyl.get(id).x * 1000) / 1000 } };
    if (k === 'motor') return { props: { __a: Math.round(this.motorAngle.get(id)) } };
    if (k === 'gauge') return { props: { __p: `${(this.pressure(this.net(info, '1'))).toFixed(1).replace('.', ',')} bar` } };
    if (k === 'pswitch') return this.deviceAct(info) ? { cls: 'sim-act' } : null;
    if (k === 'indicator') return this.pressure(this.net(info, '1')) > 0 ? { cls: 'sim-act' } : null;
    if (k === 'msensor') return this.marks.has(norm(info.comp.props?.mark || info.tag)) ? { cls: 'sim-act' } : null;
    if (k === 'dgauge') return { props: { __dp: `Δp ${(this.pressure(this.net(info, '1')) - this.pressure(this.net(info, '2'))).toFixed(1).replace('.', ',')} bar` } };
    if (k === 'counter') { const c = this.count.get(id); return { props: { __n: c?.n ?? 0 }, cls: c && c.n >= (+this.props(info).n || 5) && info.pins.length > 1 ? 'sim-act' : null }; }
    if (this.loadsOn.has(id)) return { cls: info.def?.id === 'std/lamp' ? 'sim-on sim-lamp' : 'sim-on' };
    if (info.def?.contact && this.contactAct(info)) return { cls: 'sim-act' };
    return null;
  }

  /** 'p' = line under pressure, 'v' = venting line, 'e' = live control wire, or null. */
  wireState(wireId) {
    const net = this.an.wireNet.get(wireId);
    if (!net) return null;
    if (net.fluid) return this.P.get(net)?.p > 0 ? 'p' : null;
    const g = this.groups.get(net);
    return g?.plus ? 'e' : null;
  }
}
