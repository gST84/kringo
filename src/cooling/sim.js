// Simulation of machine cooling circuits (part of src/sim/engine.js).
//
// Flow: a running pump circulates its flow (l/min) through every line that lies on an open path from its
// outlet back to its inlet (through tanks, filters, consumers, open valves …); at branches the flow
// divides equally, at junctions it mixes.
//
// Temperatures (°C): along the flow every part changes the water temperature with its power,
// ΔT = P / (ṁ · cp): consumers add their heat (kW), coolers, chillers and evaporators take away their
// cooling capacity (kW) down to their limit (set point, air temperature, evaporating temperature), plate
// heat exchangers transfer ε · Cmin · ΔT between their channels. Reservoirs and the pump content store
// heat, so temperatures rise and fall over time and thermostats switch on real values.
//
// Refrigerant: a running compressor circulates refrigerant the same way; lines from the discharge up to
// the expansion valve are the high-pressure side, the rest the low-pressure side, with temperatures from
// the condensing / evaporating temperature of the compressor. The suction pressure rises while
// refrigerant can reach the suction (also when the compressor stands still: equalising) and falls while
// the compressor runs without feed (pump-down). A compressor without a working condenser builds up a
// high-pressure fault.

const norm = (s) => String(s || '').trim().replace(/^-+/, '').toUpperCase();
const num = (v, d) => { const x = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : d; };
/** Specific heat (J/kg K) per coolant; density ≈ 1 kg/l. */
export const COOLANTS = { water: ['Water', 4186], glycol30: ['Glycol 30 %', 3850], glycol50: ['Glycol 50 %', 3550] };
const T0 = 20; // °C, start temperature of lines and loops without a reservoir
const PUMP_MASS = 2; // kg of water in pump and nearby lines (loops without a reservoir need some mass)
const LAG = 0.6; // s, delay of flow / pressure / level switches
const SENSOR_TAU = 3; // s, time constant of a thermostat bulb (in a thermowell)
const PUMPDOWN = 2; // s, suction pressure falls / rises over about this time
const HP_TIME = 2.5; // s, until a missing condenser trips the high-pressure switch
const SENSORS = ['tempsw', 'flowsw', 'levelsw', 'hp', 'lp'];
const DOT_SPACING = 6; // mm between the flow dots on a line
const DOT_SPEED = 0.6; // mm/s on the sheet per l/min of flow
const REF_DOT_SPEED = 12; // mm/s for refrigerant lines

export class Cooling {
  constructor(sim, infos) {
    this.sim = sim;
    this.parts = infos.filter((i) => i.def?.cool);
    this.lp = new Map(); // compressor id -> suction pressure 0..1
    this.hp = new Map(); // compressor id -> high-pressure fault build-up 0..1
    this.sensor = new Map(); // sensor id -> {v (lagged 0..1), act}
    this.tank = new Map(); // tank id -> °C
    this.pumpT = new Map(); // pump id -> °C of its content
    for (const i of this.parts) {
      const k = i.def.cool.kind, id = i.comp.id;
      if (k === 'comp') { this.lp.set(id, 1); this.hp.set(id, 0); }
      if (k === 'tank') this.tank.set(id, num(this.props(i).t0, T0));
      if (SENSORS.includes(k)) this.sensor.set(id, { v: k === 'levelsw' || k === 'lp' ? 1 : 0, act: k === 'levelsw' || k === 'lp' });
    }
    this.T = new Map(); // net -> °C
    for (const i of this.parts) for (const p of i.pins) { const n = this.net(i, p.id); if (n) this.T.set(n, T0); }
    this.inT = new Map(); // "id:channel" -> inlet temperature (last step)
    this.chC = new Map(); // "id:channel" -> heat capacity flow ṁ·cp (W/K, last step)
    this.flow = new Set(); // flowing nets
    this.high = new Set(); // refrigerant nets on the high-pressure side (compressor running)
    this.low = new Set();
    this.run = new Set(); // ids of running pumps, compressors, fans
    this.open = new Map(); // valve id -> open (2-way) or way '2' / '3'
    this.flowEdges = new Set(); // "compId:channel" with flow
    this.dir = []; // flowing edges with direction
    this.paths = [];
    this.circuit = new Map(); // refrigerant net -> compressor id (static topology)
    this.fed = new Map(); // compressor id -> refrigerant can reach the suction
    this.range = { water: [T0, T0], ref: [T0, T0] };
    this.labelWire = new Map(); // net -> id of the wire that carries the temperature label
    this.qNet = new Map(); // net -> water flow (kg/s)
    this.travel = new Map(); // net -> distance the flow dots moved (mm)
    this.wireFwd = new Map(); // wire id -> flow runs along its points (true) or against them (false)
    this.dirKey = '';
    this.memo = '';
  }

  props(i) { return this.sim.props(i); }
  net(i, id) { return this.sim.net(i, id); }
  manual(i) { return this.sim.latched.has(i.comp.id) || this.sim.pressed.has(i.comp.id); }
  energized(name) { return !!name && this.sim.solOn.has(norm(name)); }
  /** Pumps, compressors: by their contactor or by hand (click). Fans without a drive always run. */
  driven(i, always = false) {
    const d = this.props(i).drive;
    return this.energized(d) || this.manual(i) || (always && !d);
  }

  /** Valve positions and running drives for the current electrical state. */
  updateActuators() {
    this.run = new Set();
    this.open = new Map();
    for (const i of this.parts) {
      const k = i.def.cool.kind, p = this.props(i), id = i.comp.id;
      if (k === 'pump' || k === 'comp') { if (this.driven(i)) this.run.add(id); }
      else if (k === 'cooler' || k === 'cond' || k === 'evap') { if (this.driven(i, true)) this.run.add(id); }
      else if (k === 'manual') this.open.set(id, (p.open !== 'no') !== this.manual(i));
      else if (k === 'solvalve') { const e = this.energized(p.sol) || this.manual(i); this.open.set(id, p.type === 'no' ? !e : e); }
      else if (k === 'valve3') this.open.set(id, this.energized(p.sol) || this.manual(i) ? '3' : '2');
      else if (k === 'valve3t') this.open.set(id, (this.T.get(this.net(i, '1')) ?? T0) > num(p.sp, 25) ? '3' : '2');
    }
  }

  /** Connections through each part: [a, b, forwardOnly, compId, channel]. */
  edges() {
    const out = [];
    const add = (i, a, b, fwd = false, ch = 0) => { const na = this.net(i, a), nb = this.net(i, b); if (na && nb && na !== nb) out.push([na, nb, fwd, i.comp.id, ch]); };
    for (const i of this.parts) {
      const k = i.def.cool.kind, id = i.comp.id;
      switch (k) {
        case 'tank': case 'pass': case 'load': case 'cooler': case 'cond': case 'evap': case 'expansion': case 'sight': add(i, '1', '2'); break;
        case 'hx': case 'condw': case 'evapw': add(i, '1', '2', false, 0); add(i, '3', '4', false, 1); break;
        case 'check': add(i, '1', '2', true); break;
        case 'manual': case 'solvalve': if (this.open.get(id)) add(i, '1', '2'); break;
        case 'valve3': case 'valve3t': add(i, '1', this.open.get(id) || '2'); break;
        default: break;
      }
    }
    return out;
  }

  /** Nets reachable from `from` over `adj`, never entering a node in `block` nor using edge `skip`. */
  reach(adj, from, block = new Set(), skip = -1) {
    const seen = new Set([from]);
    const todo = [from];
    while (todo.length) {
      const n = todo.pop();
      for (const [m, e] of adj.get(n) || []) if (e !== skip && !seen.has(m) && !block.has(m)) { seen.add(m); todo.push(m); }
    }
    return seen;
  }

  /**
   * Flowing edges for one driver (outlet s, inlet t): edge u → v carries flow when s reaches u without
   * passing v or t, and v reaches t without passing u or s (so dead ends and side loops stay still).
   */
  flowing(edges, s, t) {
    const fwd = new Map(), back = new Map();
    const link = (m, a, b, e) => { if (!m.has(a)) m.set(a, []); m.get(a).push([b, e]); };
    edges.forEach(([a, b, only], idx) => {
      link(fwd, a, b, idx); link(back, b, a, idx);
      if (!only) { link(fwd, b, a, idx); link(back, a, b, idx); }
    });
    const out = []; // [edgeIndex, from, to]
    edges.forEach(([a, b, only], idx) => {
      for (const [u, v] of only ? [[a, b]] : [[a, b], [b, a]]) {
        if (u === t || v === s) continue;
        const okU = u === s || this.reach(fwd, s, new Set([v, t]), idx).has(u);
        const okV = v === t || this.reach(back, t, new Set([u, s]), idx).has(v);
        if (okU && okV) { out.push([idx, u, v]); break; }
      }
    });
    return out;
  }

  solve() {
    this.updateActuators();
    const edges = this.edges();
    const drivers = [];
    for (const i of this.parts) {
      const k = i.def.cool.kind;
      if ((k === 'pump' || k === 'comp') && this.run.has(i.comp.id)) drivers.push({ i, s: this.net(i, '2'), t: this.net(i, '1'), ref: k === 'comp' });
    }
    // flow (memoised: topology and drives rarely change between steps)
    const key = edges.map((e) => `${e[0].id}>${e[1].id}${e[2] ? '!' : ''}`).join(',') + '|' + drivers.map((d) => d.i.comp.id).join(',');
    if (key !== this.memo) {
      this.memo = key;
      this.paths = drivers.map((d) => ({ ...d, flow: d.s && d.t ? this.flowing(edges, d.s, d.t) : [] }));
      this.edgeList = edges;
    }
    const flow = new Set(), flowEdges = new Set(), dir = [];
    for (const d of this.paths) {
      if (!d.flow.length) continue;
      flow.add(d.s); flow.add(d.t);
      for (const [idx, u, v] of d.flow) {
        const e = this.edgeList[idx];
        flow.add(u); flow.add(v);
        flowEdges.add(`${e[3]}:${e[4]}`);
        dir.push({ u, v, id: e[3], ch: e[4], ref: d.ref, drv: d.i.comp.id });
      }
    }
    this.flow = flow;
    this.flowEdges = flowEdges;
    this.dir = dir;
    this.refrigerant(edges, dir);
  }

  refrigerant(edges, dir) {
    // static circuits: which compressor serves which refrigerant line
    this.circuit = new Map();
    const parent = new Map();
    const find = (a) => { while (parent.has(a) && parent.get(a) !== a) a = parent.get(a); return a; };
    const union = (a, b) => { if (a && b) { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); } };
    for (const i of this.parts) if (i.def.cool.medium === 'ref') union(this.net(i, '1'), this.net(i, '2'));
    const comps = this.parts.filter((i) => i.def.cool.kind === 'comp');
    for (const c of comps) {
      const root = find(this.net(c, '1'));
      for (const i of this.parts) for (const p of i.pins) {
        if ((i.def.cool.kind === 'condw' || i.def.cool.kind === 'evapw') && (p.id === '3' || p.id === '4')) continue; // water side
        const n = this.net(i, p.id);
        if (n && find(n) === root) this.circuit.set(n, c.comp.id);
      }
    }
    // feed: refrigerant from the discharge side can reach the suction through open parts
    this.fed = new Map();
    const adj = new Map();
    for (const [a, b, only] of edges) {
      if (!adj.has(a)) adj.set(a, []); adj.get(a).push([b, 0]);
      if (!only) { if (!adj.has(b)) adj.set(b, []); adj.get(b).push([a, 0]); }
    }
    for (const c of comps) {
      const s = this.net(c, '2'), t = this.net(c, '1');
      this.fed.set(c.comp.id, !!(s && t && this.reach(adj, s).has(t)));
    }
    // high / low side and refrigerant temperatures of running compressors
    this.high = new Set();
    this.low = new Set();
    const byId = new Map(this.parts.map((i) => [i.comp.id, i]));
    for (const d of this.paths || []) {
      if (!d.ref || !d.flow.length) continue;
      const p = this.props(d.i);
      const te = num(p.tevap, 2), tc = num(p.tcond, 40);
      const T = new Map([[d.s, tc + 25]]); // discharge gas
      const hi = new Set([d.s]);
      const own = dir.filter((e) => e.drv === d.i.comp.id);
      for (let it = 0; it < own.length + 1; it++) {
        let changed = false;
        for (const e of own) {
          if (!T.has(e.u)) continue;
          const k = byId.get(e.id)?.def.cool.kind;
          const out = k === 'cond' || k === 'condw' ? tc - 3 : k === 'expansion' ? te : k === 'evap' || k === 'evapw' ? te + 6 : T.get(e.u);
          if (T.get(e.v) !== out) { T.set(e.v, out); changed = true; }
          if (hi.has(e.u) && k !== 'expansion' && e.v !== d.t) hi.add(e.v);
        }
        if (!changed) break;
      }
      for (const [n, v] of T) this.T.set(n, v);
      for (const e of own) for (const n of [e.u, e.v]) (hi.has(n) ? this.high : this.low).add(n);
      this.low.add(d.t);
      for (const n of hi) this.low.delete(n);
    }
    this.updateRange();
  }

  /** Is refrigerant flowing through the refrigerant side of an exchanger (channel 0)? */
  refFlow(id) { return this.flowEdges.has(`${id}:0`); }

  /** Evaporating temperature of the compressor that serves a refrigerant line. */
  tevap(net) {
    const c = this.circuit.get(net);
    const i = c && this.parts.find((x) => x.comp.id === c);
    return i ? num(this.props(i).tevap, 2) : 2;
  }

  // ---------- heat ----------

  /** Outlet temperature of one channel of a part for inlet `tin`, flow `q` (kg/s) and `cp`. */
  outlet(i, ch, tin, q, cp, dt) {
    const p = this.props(i), id = i.comp.id, C = q * cp;
    this.inT.set(`${id}:${ch}`, tin);
    this.chC.set(`${id}:${ch}`, C);
    const kw = (k, d) => num(p[k], d) * 1000;
    switch (i.def.cool.kind) {
      case 'load': return this.sim.latched.has(id) ? tin : tin + kw('power', 2) / C; // click = machine idle
      case 'tank': {
        const tt = this.tank.get(id) ?? T0;
        const mass = Math.max(1, num(p.volume, 50));
        this.tank.set(id, tt + (q * (tin - tt) * dt) / mass);
        return tt;
      }
      case 'cooler': {
        if (!this.run.has(id)) return tin;
        const cooled = tin - kw('cap', 5) / C;
        if (i.def.id === 'cool/radiator') {
          // passive radiator: heat transfer proportional to the difference with the air (capacity at 10 K)
          const ta = num(p.tair, 25), ua = kw('cap', 2) / 10;
          return ta + (tin - ta) * Math.exp(-ua / C);
        }
        if (i.def.id === 'cool/aircooler') { const lim = num(p.tair, 25) + 3; return tin > lim ? Math.max(lim, cooled) : tin; }
        return Math.max(num(p.sp, 15), Math.min(tin, cooled)); // chiller: down to its set point
      }
      case 'evapw': if (ch !== 1 || !this.refFlow(id)) return tin; return Math.max(this.tevap(this.net(i, '1')) + 2, Math.min(tin, tin - kw('cap', 5) / C));
      case 'condw': if (ch !== 1 || !this.refFlow(id)) return tin; return tin + kw('power', 6) / C;
      case 'hx': {
        const o = `${id}:${1 - ch}`;
        if (!this.flowEdges.has(o) || !this.inT.has(o)) return tin;
        const cmin = Math.min(C, this.chC.get(o) || C);
        return tin + (Math.max(0, Math.min(1, num(p.eff, 0.7))) * cmin * (this.inT.get(o) - tin)) / C;
      }
      default: return tin;
    }
  }

  /** Moves the water through every pump loop for one time step. */
  thermal(dt) {
    const byId = new Map(this.parts.map((i) => [i.comp.id, i]));
    this.qNet = new Map();
    for (const d of this.paths || []) {
      if (d.ref || !d.flow.length) continue;
      const p = this.props(d.i);
      const q = Math.max(0.01, num(p.flow, 20)) / 60; // l/min → kg/s
      const cp = (COOLANTS[p.medium] || COOLANTS.water)[1];
      const own = this.dir.filter((e) => e.drv === d.i.comp.id);
      const outs = new Map(), indeg = new Map();
      for (const e of own) {
        if (!outs.has(e.u)) outs.set(e.u, []);
        outs.get(e.u).push(e);
        indeg.set(e.v, (indeg.get(e.v) || 0) + 1);
      }
      // flow split equally at branches, mixed at junctions, in flow order (Kahn; loops broken in order)
      // the pump content starts at the temperature of the reservoir in its loop
      const tank = own.find((e) => this.tank.has(e.id));
      const tp = this.pumpT.get(d.i.comp.id) ?? (tank ? this.tank.get(tank.id) : this.T.get(d.t) ?? T0);
      const Q = new Map([[d.s, q]]), H = new Map([[d.s, q * tp]]);
      const done = new Set();
      const ready = [d.s];
      const left = new Map(indeg);
      left.delete(d.s);
      const visit = (n) => {
        done.add(n);
        const qn = Q.get(n) || 0;
        if (!qn) return;
        const tn = H.get(n) / qn;
        this.T.set(n, tn);
        const list = outs.get(n) || [];
        for (const e of list) {
          const qe = qn / list.length;
          const tout = this.outlet(byId.get(e.id), e.ch, tn, qe, cp, dt);
          Q.set(e.v, (Q.get(e.v) || 0) + qe);
          H.set(e.v, (H.get(e.v) || 0) + qe * tout);
          left.set(e.v, (left.get(e.v) || 1) - 1);
          if (left.get(e.v) <= 0 && !done.has(e.v) && e.v !== d.t) ready.push(e.v);
        }
      };
      for (let guard = 0; guard < 500; guard++) {
        let n = ready.shift();
        if (!n) n = [...outs.keys()].find((x) => !done.has(x) && Q.get(x)); // loop: take the next reached net
        if (!n) break;
        if (!done.has(n)) visit(n);
      }
      for (const [n, qn] of Q) this.qNet.set(n, (this.qNet.get(n) || 0) + qn);
      // the pump content mixes with what arrives at the suction
      const qt = Q.get(d.t) || 0;
      if (qt) {
        const tin = H.get(d.t) / qt;
        this.T.set(d.t, tin);
        this.pumpT.set(d.i.comp.id, tp + (q * (tin - tp) * dt) / PUMP_MASS);
      }
    }
    this.updateRange();
  }

  updateRange() {
    const r = { water: [Infinity, -Infinity], ref: [Infinity, -Infinity] };
    for (const n of new Set([...this.flow, ...this.high, ...this.low])) {
      const t = this.T.get(n);
      if (t == null) continue;
      const m = this.circuit.has(n) ? r.ref : r.water;
      m[0] = Math.min(m[0], t); m[1] = Math.max(m[1], t);
    }
    for (const m of Object.values(r)) if (!(m[0] <= m[1])) { m[0] = T0; m[1] = T0; }
    this.range = r;
  }

  /** Time-dependent parts: heat, suction / high pressure, sensors. */
  step(dt) {
    this.thermal(dt);
    // flow dots: water moves with its flow, refrigerant at a fixed speed
    for (const n of new Set([...this.flow, ...this.high, ...this.low])) {
      const v = this.circuit.has(n) ? REF_DOT_SPEED : (this.qNet.get(n) || 0) * 60 * DOT_SPEED;
      this.travel.set(n, ((this.travel.get(n) || 0) + v * dt) % 1000);
    }
    for (const i of this.parts) {
      const id = i.comp.id;
      if (i.def.cool.kind !== 'comp') continue;
      const running = this.run.has(id), fed = this.fed.get(id);
      let lp = this.lp.get(id);
      if (fed) lp = Math.min(1, lp + dt / PUMPDOWN);
      else if (running) lp = Math.max(0, lp - dt / PUMPDOWN);
      this.lp.set(id, lp);
      const condOk = this.parts.some((c) => this.circuit.get(this.net(c, '1')) === id
        && ((c.def.cool.kind === 'cond' && this.run.has(c.comp.id)) || (c.def.cool.kind === 'condw' && this.flowEdges.has(`${c.comp.id}:1`))));
      // running without a working condenser: the discharge pressure builds up (pump-down is no fault)
      const hp = this.hp.get(id);
      this.hp.set(id, running && !condOk ? Math.min(1, hp + dt / HP_TIME) : Math.max(0, hp - dt / HP_TIME));
    }
    for (const i of this.parts) {
      const st = this.sensor.get(i.comp.id);
      if (!st) continue;
      if (i.def.cool.kind === 'tempsw') {
        // thermostat: set point and hysteresis on the line temperature, measured with a bulb lag
        const p = this.props(i), sp = num(p.sp, 25), hy = Math.abs(num(p.hyst, 2));
        const line = this.T.get(this.net(i, '1')) ?? T0;
        st.t = (st.t ?? line) + (line - (st.t ?? line)) * Math.min(1, dt / SENSOR_TAU);
        const t = st.t;
        st.act = p.mode === 'cold' ? (st.act ? t < sp + hy : t <= sp) : (st.act ? t > sp - hy : t >= sp);
        continue;
      }
      const target = this.raw(i) ? 1 : 0;
      st.v += Math.sign(target - st.v) * Math.min(Math.abs(target - st.v), dt / LAG);
      if (st.v >= 0.99) st.act = true;
      else if (st.v <= 0.01) st.act = false;
    }
  }

  /** Instantaneous input of the delayed switches. */
  raw(i) {
    const n = this.net(i, '1');
    switch (i.def.cool.kind) {
      case 'flowsw': return this.flow.has(n);
      case 'levelsw': return !this.sim.latched.has(i.comp.id); // click = level too low
      case 'lp': { const c = this.circuit.get(n); return c ? (this.lp.get(c) ?? 1) > 0.5 : true; }
      case 'hp': { const c = this.circuit.get(n); return c ? (this.hp.get(c) ?? 0) >= 1 : false; }
      default: return false;
    }
  }

  /** Sensor contact state for linked electrical contacts. */
  act(i) { return !!this.sensor.get(i.comp.id)?.act; }

  signature() {
    return [...this.run].sort().join(',') + '|' + [...this.open].map(([k, v]) => `${k}=${v}`).join(',') + '|' + this.flow.size + '|' + this.high.size;
  }

  compState(info) {
    const id = info.comp.id, k = info.def.cool.kind, n = this.net(info, '1');
    const cls = (on) => (on ? { cls: 'sim-on' } : null);
    switch (k) {
      case 'pump': case 'comp': return cls(this.run.has(id));
      case 'cooler': case 'cond': case 'evap': return cls(this.run.has(id) && (this.flow.has(n) || !!this.props(info).drive));
      case 'manual': case 'solvalve': return { props: { __open: !!this.open.get(id) }, cls: this.open.get(id) && this.flow.has(n) ? 'sim-act' : null };
      case 'valve3': case 'valve3t': return { props: { __to: this.open.get(id) || '2' } };
      case 'load': return this.sim.latched.has(id) ? null : this.flow.has(n) ? { cls: 'sim-act' } : this.flow.size ? { cls: 'sim-warn' } : null;
      case 'tank': return { props: { __t: fmtT(this.tank.get(id)) } };
      case 'sight': case 'flowind': return cls(this.flow.has(n));
      case 'thermo': return { props: { __t: this.T.has(n) ? fmtT(this.T.get(n)) : '–' } };
      case 'gauge': return { props: { __p: this.high.has(n) ? 'hoog' : this.low.has(n) ? 'laag' : this.flow.has(n) ? 'druk' : '–' } };
      case 'tempsw': case 'flowsw': case 'levelsw': case 'hp': case 'lp': return this.act(info) ? { cls: k === 'hp' ? 'sim-warn' : 'sim-act' } : null;
      default: return null;
    }
  }

  /**
   * Direction of the flow along every wire of the flowing lines: shortest distance over the wires from
   * the points where the flow enters the line (the outlet port of the part before it).
   */
  wireDirections() {
    if (this.dirKey === this.memo) return;
    this.dirKey = this.memo;
    this.wireFwd = new Map();
    const byId = new Map(this.parts.map((i) => [i.comp.id, i]));
    const ports = (i, ch) => (i.def.cool.kind === 'hx' || i.def.cool.kind === 'condw' || i.def.cool.kind === 'evapw') ? (ch ? ['3', '4'] : ['1', '2']) : null;
    /** Position of the port of part `id` (channel `ch`) on line `net`. */
    const portAt = (id, ch, net) => {
      const i = byId.get(id);
      if (!i) return null;
      const allowed = ports(i, ch);
      return i.pins.find((p) => (!allowed || allowed.includes(p.id)) && this.net(i, p.id) === net) || null;
    };
    const entries = new Map(); // net -> [[x, y]]
    const addEntry = (net, p) => { if (!p) return; if (!entries.has(net)) entries.set(net, []); entries.get(net).push([p.x, p.y]); };
    for (const e of this.dir) addEntry(e.v, portAt(e.id, e.ch, e.v));
    for (const d of this.paths) if (d.flow.length) addEntry(d.s, portAt(d.i.comp.id, 0, d.s));
    const key = (x, y) => `${Math.round(x * 100)},${Math.round(y * 100)}`;
    for (const [net, starts] of entries) {
      // graph of the wire points of this line; entry points on a segment are spliced in
      const adj = new Map();
      const link = (a, b, l) => { for (const [p, q] of [[a, b], [b, a]]) { if (!adj.has(p)) adj.set(p, []); adj.get(p).push([q, l]); } };
      for (const { wire } of net.wires) for (let k = 0; k + 1 < wire.points.length; k++) {
        const [[ax, ay], [bx, by]] = [wire.points[k], wire.points[k + 1]];
        link(key(ax, ay), key(bx, by), Math.hypot(bx - ax, by - ay));
        for (const [sx, sy] of starts) {
          const t = Math.abs(bx - ax) > Math.abs(by - ay) ? (sx - ax) / (bx - ax) : (sy - ay) / (by - ay);
          if (t > 0 && t < 1 && Math.hypot(ax + (bx - ax) * t - sx, ay + (by - ay) * t - sy) < 0.05) {
            link(key(sx, sy), key(ax, ay), Math.hypot(sx - ax, sy - ay));
            link(key(sx, sy), key(bx, by), Math.hypot(bx - sx, by - sy));
          }
        }
      }
      const dist = new Map(starts.map(([x, y]) => [key(x, y), 0]));
      const todo = [...dist.keys()];
      while (todo.length) {
        todo.sort((a, b) => dist.get(b) - dist.get(a));
        const n = todo.pop();
        for (const [m, l] of adj.get(n) || []) {
          const d = dist.get(n) + l;
          if (d < (dist.get(m) ?? Infinity)) { dist.set(m, d); todo.push(m); }
        }
      }
      for (const { wire } of net.wires) {
        const a = dist.get(key(...wire.points[0])), b = dist.get(key(...wire.points[wire.points.length - 1]));
        if (a != null || b != null) this.wireFwd.set(wire.id, (a ?? Infinity) <= (b ?? Infinity));
      }
    }
  }

  /**
   * Colour of the flow dots of a cooling line, from blue (coldest) to red (warmest line of the same medium),
   * with the temperature on the longest wire of the line; null when nothing flows.
   */
  wireState(net, wireId) {
    if (!this.flow.has(net) && !this.high.has(net) && !this.low.has(net)) return null;
    const t = this.T.get(net);
    if (t == null) return null;
    const [lo, hi] = this.range[this.circuit.has(net) ? 'ref' : 'water'];
    const span = Math.max(2, hi - lo);
    const f = Math.max(0, Math.min(1, (t - (hi + lo) / 2) / span + 0.5));
    const hue = Math.round(240 + 120 * f) % 360; // 240 blue → 300 magenta → 360 red
    if (!this.labelWire.has(net)) {
      let best = null, len = -1;
      for (const { wire } of net.wires) for (let k = 0; k + 1 < wire.points.length; k++) {
        const [a, b] = [wire.points[k], wire.points[k + 1]];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (l > len) { len = l; best = wire.id; }
      }
      this.labelWire.set(net, best);
    }
    this.wireDirections();
    const fwd = this.wireFwd.get(wireId);
    const dots = fwd == null ? null : { fwd, off: -((this.travel.get(net) || 0) % DOT_SPACING), gap: DOT_SPACING };
    return { c: `hsl(${hue} 80% 47%)`, g: `hsl(${hue} 90% 66%)`, label: this.labelWire.get(net) === wireId ? fmtT(t) : null, dots };
  }
}

const fmtT = (t) => (t == null ? '–' : `${t.toFixed(1).replace('.', ',')} °C`);
