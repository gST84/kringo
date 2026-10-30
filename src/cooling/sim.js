// Functional simulation of machine cooling circuits (part of src/sim/engine.js).
//
// Coolant: a running pump circulates water through every line that lies on an open path from its outlet
// back to its inlet (through tanks, filters, consumers, open valves …). Along that flow the water is
// warmed by consumers and cooled by coolers, chillers and evaporators; heat exchangers swap the
// temperatures of their two channels. Lines are 'hot', 'cold' or just flowing.
//
// Refrigerant: a running compressor circulates refrigerant the same way; lines from the discharge up to
// the expansion valve are the high-pressure side, the rest the low-pressure side. The suction pressure
// rises while refrigerant can reach the suction (also when the compressor stands still: equalising) and
// falls while the compressor runs without feed (pump-down). A compressor without a working condenser
// builds up a high-pressure fault.
//
// Sensors (TS, FS, PSL, PSH, LS) follow with a short delay, so control loops through the electrical
// sheets do not oscillate within one step.

const norm = (s) => String(s || '').trim().replace(/^-+/, '').toUpperCase();
const RANK = { cold: 1, hot: 2 };
const LAG = 0.6; // s, sensor delay
const PUMPDOWN = 2; // s, suction pressure falls / rises over about this time
const HP_TIME = 2.5; // s, until a missing condenser trips the high-pressure switch

export class Cooling {
  constructor(sim, infos) {
    this.sim = sim;
    this.parts = infos.filter((i) => i.def?.cool);
    this.lp = new Map(); // compressor id -> suction pressure 0..1
    this.hp = new Map(); // compressor id -> high-pressure fault build-up 0..1
    this.sensor = new Map(); // sensor id -> {v (lagged 0..1), act}
    for (const i of this.parts) {
      const k = i.def.cool.kind;
      if (k === 'comp') { this.lp.set(i.comp.id, 1); this.hp.set(i.comp.id, 0); }
      if (['tempsw', 'flowsw', 'levelsw', 'hp', 'lp'].includes(k)) this.sensor.set(i.comp.id, { v: k === 'levelsw' || k === 'lp' ? 1 : 0, act: k === 'levelsw' || k === 'lp' });
    }
    this.flow = new Set(); // flowing nets
    this.temp = new Map(); // net -> 'hot' | 'cold'
    this.high = new Set(); // refrigerant nets on the high-pressure side (compressor running)
    this.low = new Set();
    this.run = new Set(); // ids of running pumps, compressors, fans
    this.open = new Map(); // valve id -> open (2-way) or way '2' / '3'
    this.flowEdges = new Set(); // "compId:channel" with flow
    this.circuit = new Map(); // refrigerant net -> compressor id (static topology)
    this.fed = new Map(); // compressor id -> refrigerant can reach the suction
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
      else if (k === 'valve3t') this.open.set(id, this.temp.get(this.net(i, '1')) === 'hot' ? '3' : '2');
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
        dir.push({ u, v, id: e[3], ch: e[4], ref: d.ref });
      }
      dir.push({ u: d.t, v: d.s, id: d.i.comp.id, ch: 0, driver: true });
    }
    this.flow = flow;
    this.flowEdges = flowEdges;
    this.refrigerant(edges, dir);
    this.temperatures(dir);
  }

  refrigerant(edges, dir) {
    // static circuits: which compressor serves which refrigerant line
    this.circuit = new Map();
    const parent = new Map();
    const find = (a) => { while (parent.has(a) && parent.get(a) !== a) a = parent.get(a); return a; };
    const union = (a, b) => { if (a && b) { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); } };
    const isRef = (i) => i.def.cool.medium === 'ref';
    for (const i of this.parts) if (isRef(i)) for (const [a, b] of [['1', '2'], ['3', '4']]) {
      const k = i.def.cool.kind;
      if ((k === 'condw' || k === 'evapw') && a === '3') continue; // water side
      union(this.net(i, a), this.net(i, b));
    }
    const comps = this.parts.filter((i) => i.def.cool.kind === 'comp');
    for (const c of comps) {
      const root = find(this.net(c, '1'));
      for (const i of this.parts) for (const p of i.pins) { const n = this.net(i, p.id); if (n && find(n) === root) this.circuit.set(n, c.comp.id); }
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
    // high / low side of running compressors
    this.high = new Set();
    this.low = new Set();
    const expansion = new Set(this.parts.filter((i) => i.def.cool.kind === 'expansion').map((i) => i.comp.id));
    for (const d of this.paths || []) {
      if (!d.ref || !d.flow.length) continue;
      const hi = new Set([d.s]);
      for (let changed = true; changed;) {
        changed = false;
        for (const e of dir) if (e.ref && !e.driver && !expansion.has(e.id) && hi.has(e.u) && !hi.has(e.v) && e.v !== d.t) { hi.add(e.v); changed = true; }
      }
      for (const e of dir) if (e.ref) for (const n of [e.u, e.v]) (hi.has(n) ? this.high : this.low).add(n);
      this.low.add(d.t);
      for (const n of hi) this.low.delete(n);
    }
  }

  /** Is refrigerant flowing through the refrigerant side of an exchanger (channel 0)? */
  refFlow(id) { return this.flowEdges.has(`${id}:0`); }

  temperatures(dir) {
    const kinds = new Map(this.parts.map((i) => [i.comp.id, i]));
    const temp = new Map();
    const inOf = new Map(); // "id:ch" -> inlet temperature
    for (let it = 0; it < 60; it++) {
      let changed = false;
      for (const e of dir) {
        if (e.ref && !e.driver) continue;
        const tin = temp.get(e.u);
        inOf.set(`${e.id}:${e.ch}`, tin);
        let out = tin;
        const i = kinds.get(e.id);
        const k = i?.def.cool?.kind;
        if (k === 'load') out = this.sim.latched.has(e.id) ? tin : 'hot'; // click = machine idle (no heat)
        else if (k === 'cooler') out = this.run.has(e.id) ? 'cold' : tin;
        else if (k === 'evapw' && e.ch === 1) out = this.refFlow(e.id) ? 'cold' : tin;
        else if (k === 'condw' && e.ch === 1) out = this.refFlow(e.id) ? 'hot' : tin;
        else if (k === 'hx') { const other = inOf.get(`${e.id}:${1 - e.ch}`); out = this.flowEdges.has(`${e.id}:${1 - e.ch}`) && other ? other : tin; }
        if (out && (RANK[out] || 0) > (RANK[temp.get(e.v)] || 0)) { temp.set(e.v, out); changed = true; }
      }
      if (!changed) break;
    }
    for (const n of this.high) temp.set(n, 'hot');
    for (const n of this.low) temp.set(n, 'cold');
    this.temp = temp;
  }

  /** Time-dependent parts: suction / high pressure, lagged sensors. */
  step(dt) {
    for (const i of this.parts) {
      const id = i.comp.id, k = i.def.cool.kind;
      if (k === 'comp') {
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
    }
    for (const i of this.parts) {
      const st = this.sensor.get(i.comp.id);
      if (!st) continue;
      const target = this.raw(i) ? 1 : 0;
      st.v += Math.sign(target - st.v) * Math.min(Math.abs(target - st.v), dt / LAG);
      if (st.v >= 0.99) st.act = true;
      else if (st.v <= 0.01) st.act = false;
    }
  }

  /** Instantaneous sensor input. */
  raw(i) {
    const n = this.net(i, '1');
    switch (i.def.cool.kind) {
      case 'tempsw': return this.temp.get(n) === (this.props(i).mode === 'cold' ? 'cold' : 'hot');
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
    return [...this.run].sort().join(',') + '|' + [...this.open].map(([k, v]) => `${k}=${v}`).join(',') + '|' + [...this.temp].map(([n, v]) => `${n.id}${v[0]}`).sort().join(',') + '|' + this.flow.size;
  }

  compState(info) {
    const id = info.comp.id, k = info.def.cool.kind, n = this.net(info, '1');
    const cls = (on) => (on ? { cls: 'sim-on' } : null);
    switch (k) {
      case 'pump': case 'comp': return cls(this.run.has(id));
      case 'cooler': case 'cond': case 'evap': return cls(this.run.has(id) && (this.flow.has(n) || !!this.props(info).drive));
      case 'manual': case 'solvalve': return { props: { __open: !!this.open.get(id) }, cls: this.open.get(id) && this.flow.has(n) ? 'sim-act' : null };
      case 'valve3': case 'valve3t': return { props: { __to: this.open.get(id) || '2' } };
      case 'load': return this.sim.latched.has(id) ? null : this.flow.has(n) ? { cls: 'sim-act' } : this.anyFlow() ? { cls: 'sim-warn' } : null;
      case 'sight': return cls(this.flow.has(n));
      case 'flowind': return cls(this.flow.has(n));
      case 'thermo': return { props: { __t: { hot: 'warm', cold: 'koud' }[this.temp.get(n)] || '–' } };
      case 'gauge': return { props: { __p: this.high.has(n) ? 'hoog' : this.low.has(n) ? 'laag' : this.flow.has(n) ? 'druk' : '–' } };
      case 'tempsw': case 'flowsw': case 'levelsw': case 'hp': case 'lp': return this.act(info) ? { cls: k === 'hp' ? 'sim-warn' : 'sim-act' } : null;
      default: return null;
    }
  }

  anyFlow() { return this.flow.size > 0; }

  /** 'p' hot / high pressure, 'v' cold / low pressure, 'f' flowing coolant of unknown temperature. */
  wireState(net) {
    if (this.high.has(net)) return 'p';
    if (this.low.has(net)) return 'v';
    if (!this.flow.has(net)) return null;
    const t = this.temp.get(net);
    return t === 'hot' ? 'p' : t === 'cold' ? 'v' : 'f';
  }
}
