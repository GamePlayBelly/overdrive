import { ROAD_CLASSES, halfWidth, STREETS, FREEWAY, RIDGE_ROAD, ROUTE9 } from '../data/world.js';
import { Polyline, catmull, clamp, wrapAngle, segClosest, smoothstep } from '../core/math.js';
import { CORRIDORS } from './corridors.js';

const MAJOR = new Set(['arterial', 'avenue', 'freeway', 'ramp', 'rural']);

export class RoadGraph {
  constructor(terrain) {
    this.terrain = terrain;
    this.nodes = [];
    this.edges = [];
    this.lanes = [];
    this.conns = [];
    this._nodeKey = new Map();
    this.cell = 40;
    this.grid = new Map();
    this.build();
  }

  node(x, z) {
    const k = `${Math.round(x * 2)},${Math.round(z * 2)}`;
    let n = this._nodeKey.get(k);
    if (!n) {
      n = { id: this.nodes.length, x, z, y: 0, edges: [], kind: 'junction', control: 'none' };
      this.nodes.push(n);
      this._nodeKey.set(k, n);
    }
    return n;
  }

  addEdge(a, b, pts, clsName, opts = {}) {
    const cls = ROAD_CLASSES[clsName];
    const e = {
      id: this.edges.length, a: a.id, b: b.id, clsName, cls,
      pts, halfW: halfWidth(cls), name: opts.name || '',
      oneway: !!cls.oneway, speed: cls.speed / 3.6,
      lanesF: cls.lanes, lanesB: cls.oneway ? 0 : cls.lanes,
      structure: !!opts.structure, rampSide: opts.rampSide || 0, district: opts.district || '',
      sbA: 0, sbB: 0, fwd: [], bwd: [],
    };
    this.edges.push(e);
    a.edges.push(e.id); b.edges.push(e.id);
    return e;
  }

  build() {
    this.buildStreets();
    this.buildFreeway();
    this.buildRidge();
    this.buildRoute9();
    this.buildCorridors();
    this.assignHeights();
    for (const e of this.edges) e.pl = new Polyline(e.pts);
    this.classifyNodes();
    this.computeSetbacks();
    this.buildLanes();
    this.buildConnectors();
    this.buildSignals();
    this.buildIndex();
  }

  buildStreets() {
    const H = STREETS.filter((s) => s.axis === 'x');
    const V = STREETS.filter((s) => s.axis === 'z');
    const range = (s) => [Math.min(...s.segs.map((g) => g[0])), Math.max(...s.segs.map((g) => g[1]))];
    const extra = new Map();
    for (const r of FREEWAY.ramps) extra.set(`z${r.x}`, [FREEWAY.termS, FREEWAY.termN]);
    for (const s of STREETS) {
      const [lo, hi] = range(s);
      const cuts = new Set([lo, hi]);
      for (const g of s.segs) { cuts.add(g[0]); cuts.add(g[1]); }
      const other = s.axis === 'x' ? V : H;
      for (const o of other) {
        const [olo, ohi] = range(o);
        if (o.c >= lo - 0.01 && o.c <= hi + 0.01 && s.c >= olo - 0.01 && s.c <= ohi + 0.01) cuts.add(o.c);
      }
      for (const v of extra.get(`${s.axis}${s.c}`) || []) if (v > lo && v < hi) cuts.add(v);
      const sorted = [...cuts].sort((p, q) => p - q);
      for (let i = 0; i < sorted.length - 1; i++) {
        const p0 = sorted[i], p1 = sorted[i + 1];
        if (p1 - p0 < 1) continue;
        const mid = (p0 + p1) / 2;
        const seg = s.segs.find((g) => mid >= g[0] && mid <= g[1]);
        if (!seg) continue;
        const P = (t) => (s.axis === 'x' ? { x: t, z: s.c } : { x: s.c, z: t });
        const A = P(p0), B = P(p1);
        const n = Math.max(1, Math.ceil((p1 - p0) / 20));
        const pts = [];
        for (let k = 0; k <= n; k++) { const t = p0 + ((p1 - p0) * k) / n; const q = P(t); pts.push({ x: q.x, y: 0, z: q.z }); }
        this.addEdge(this.node(A.x, A.z), this.node(B.x, B.z), pts, seg[2], { name: s.name });
      }
    }
  }

  freewayY(x) {
    const [e0, e1] = FREEWAY.elevated, Y = FREEWAY.deckY;
    if (x < e0) return Y * smoothstep(-905, e0, x);
    if (x > e1) return Y * (1 - smoothstep(e1, 950, x));
    return Y;
  }

  buildFreeway() {
    const F = FREEWAY, z = F.z;
    const cuts = [F.x0, F.x1];
    for (const r of F.ramps) cuts.push(r.x - F.rampSpan, r.x + F.rampSpan);
    cuts.sort((a, b) => a - b);
    this.mergeNodes = new Map();
    for (let i = 0; i < cuts.length - 1; i++) {
      const x0 = cuts[i], x1 = cuts[i + 1];
      const n = Math.max(2, Math.ceil((x1 - x0) / 12));
      const pts = [];
      for (let k = 0; k <= n; k++) { const x = x0 + ((x1 - x0) * k) / n; pts.push({ x, y: this.freewayY(x), z, fixedY: true }); }
      const a = this.node(x0, z), b = this.node(x1, z);
      this.addEdge(a, b, pts, 'freeway', { name: F.name, structure: true });
    }
    for (const c of cuts.slice(1, -1)) { const nd = this.node(c, z); nd.kind = 'merge'; this.mergeNodes.set(c, nd); }
    const fw = ROAD_CLASSES.freeway;
    const outer = fw.median / 2 + fw.laneW * (fw.lanes - 0.5);
    for (const r of F.ramps) {
      const X0 = r.x, S = F.rampSpan;
      const M1 = this.node(X0 - S, z), M2 = this.node(X0 + S, z);
      const TS = this.node(X0, F.termS), TN = this.node(X0, F.termN);
      const y1 = this.freewayY(X0 - S), y2 = this.freewayY(X0 + S);
      this.addEdge(M1, TS, this.rampPts(X0 - S, z + outer, X0, F.termS, y1, true), 'ramp', { name: `Exit — ${r.name}`, structure: true, rampSide: 1 });
      this.addEdge(TS, M2, this.rampPts(X0, F.termS, X0 + S, z + outer, y2, false), 'ramp', { name: `${F.name} East`, structure: true, rampSide: 1 });
      this.addEdge(M2, TN, this.rampPts(X0 + S, z - outer, X0, F.termN, y2, true), 'ramp', { name: `Exit — ${r.name}`, structure: true, rampSide: -1 });
      this.addEdge(TN, M1, this.rampPts(X0, F.termN, X0 - S, z - outer, y1, false), 'ramp', { name: `${F.name} West`, structure: true, rampSide: -1 });
    }
  }

  // ramp polyline between a freeway lane point and a terminal; yTop = freeway height at the merge point
  rampPts(xa, za, xb, zb, yTop, off) {
    const out = [];
    const n = 36;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = xa + (xb - xa) * t;
      const u = off ? smoothstep(0.04, 0.4, t) : smoothstep(0.6, 0.96, t);
      const yt = off ? 1 - smoothstep(0.3, 0.9, t) : smoothstep(0.1, 0.7, t);
      out.push({ x, y: yTop * yt, z: za + (zb - za) * u, fixedY: true });
    }
    return out;
  }

  buildRidge() {
    const R = RIDGE_ROAD;
    const ctrl = R.pts.map(([x, z]) => ({ x, y: 0, z }));
    const joinIdx = [0, ...Object.values(R.joins), ctrl.length - 1].sort((a, b) => a - b);
    for (let j = 0; j < joinIdx.length - 1; j++) {
      const i0 = joinIdx[j], i1 = joinIdx[j + 1];
      const sub = ctrl.slice(Math.max(0, i0 - 1), Math.min(ctrl.length, i1 + 2));
      const full = catmull(sub, 10);
      const pl = new Polyline(full);
      const s0 = pl.project(ctrl[i0].x, ctrl[i0].z).s, s1 = pl.project(ctrl[i1].x, ctrl[i1].z).s;
      const pts = pl.slice(s0, s1, 10);
      pts[0].x = ctrl[i0].x; pts[0].z = ctrl[i0].z;
      pts[pts.length - 1].x = ctrl[i1].x; pts[pts.length - 1].z = ctrl[i1].z;
      this.addEdge(this.node(ctrl[i0].x, ctrl[i0].z), this.node(ctrl[i1].x, ctrl[i1].z), pts, 'rural', { name: R.name });
    }
  }

  // Route 9: rural road from the end of Central Avenue through the forest to Marlow Bay, split in ~200 m edges
  buildRoute9() {
    const R = ROUTE9;
    const ctrl = R.pts.map(([x, z]) => ({ x, y: 0, z }));
    const full = catmull(ctrl, 12);
    const pl = new Polyline(full);
    const step = 10;
    const cuts = [0];
    for (let d = 190; d < pl.len - 90; d += 190) cuts.push(d);
    cuts.push(pl.len);
    for (let i = 0; i < cuts.length - 1; i++) {
      const pts = pl.slice(cuts[i], cuts[i + 1], step);
      if (i === 0) { pts[0].x = R.pts[0][0]; pts[0].z = R.pts[0][1]; }
      if (i === cuts.length - 2) { const e = R.pts[R.pts.length - 1]; pts[pts.length - 1].x = e[0]; pts[pts.length - 1].z = e[1]; }
      const a = pts[0], b = pts[pts.length - 1];
      this.addEdge(this.node(a.x, a.z), this.node(b.x, b.z), pts, 'rural', { name: R.name });
    }
  }

  // designed roads (Route 12, Route 40, the bridge, the island loop): height comes from the corridor profile
  buildCorridors() {
    for (const c of CORRIDORS) {
      const sp = c.spec, pts = c.points(6);
      const f = sp.ctrl[0], l = sp.ctrl[sp.ctrl.length - 1];
      pts[0].x = f[0]; pts[0].z = f[1]; pts[pts.length - 1].x = l[0]; pts[pts.length - 1].z = l[1];
      const pl = new Polyline(pts);
      const cuts = [0];
      for (let d = 190; d < pl.len - 90; d += 190) cuts.push(d);
      cuts.push(pl.len);
      for (let i = 0; i < cuts.length - 1; i++) {
        const sub = pl.slice(cuts[i], cuts[i + 1], 10).map((q) => ({ x: q.x, y: q.y, z: q.z, fixedY: true }));
        const a = sub[0], b = sub[sub.length - 1];
        this.addEdge(this.node(a.x, a.z), this.node(b.x, b.z), sub, sp.cls, { name: sp.name, structure: !!sp.structure });
      }
    }
  }

  assignHeights() {
    const T = this.terrain;
    for (const e of this.edges) {
      if (e.pts[0].fixedY) continue;
      const raw = e.pts.map((p) => T.base(p.x, p.z));
      const cum = [0];
      for (let i = 1; i < e.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(e.pts[i].x - e.pts[i - 1].x, e.pts[i].z - e.pts[i - 1].z));
      e.pts.forEach((p, i) => {
        let s = 0, w = 0;
        for (let j = 0; j < e.pts.length; j++) {
          const d = Math.abs(cum[j] - cum[i]);
          if (d > 45) continue;
          const k = 1 - d / 45; s += raw[j] * k; w += k;
        }
        p.y = s / w;
      });
    }
    for (const n of this.nodes) {
      let s = 0, c = 0, fixed = null;
      for (const id of n.edges) {
        const e = this.edges[id];
        const p = e.a === n.id ? e.pts[0] : e.pts[e.pts.length - 1];
        if (p.fixedY) fixed = p.y;
        s += p.y; c++;
      }
      n.y = fixed ?? s / c;
    }
    for (const e of this.edges) {
      if (e.pts[0].fixedY) continue;
      const A = this.nodes[e.a], B = this.nodes[e.b];
      const L = e.pts.length;
      const dA = A.y - e.pts[0].y, dB = B.y - e.pts[L - 1].y;
      let cum = 0;
      const tot = e.pts.reduce((acc, p, i) => (i ? acc + Math.hypot(p.x - e.pts[i - 1].x, p.z - e.pts[i - 1].z) : 0), 0);
      e.pts.forEach((p, i) => {
        if (i) cum += Math.hypot(p.x - e.pts[i - 1].x, p.z - e.pts[i - 1].z);
        const wa = 1 - smoothstep(0, Math.min(60, tot), cum), wb = smoothstep(Math.max(0, tot - 60), tot, cum);
        p.y += dA * wa + dB * wb;
      });
    }
  }

  // direction leaving node n along edge e
  dirFrom(e, n) {
    const p = e.pts;
    if (e.a === n.id) { const a = p[0], b = p[Math.min(2, p.length - 1)]; const l = Math.hypot(b.x - a.x, b.z - a.z) || 1; return { x: (b.x - a.x) / l, z: (b.z - a.z) / l }; }
    const a = p[p.length - 1], b = p[Math.max(0, p.length - 3)]; const l = Math.hypot(b.x - a.x, b.z - a.z) || 1; return { x: (b.x - a.x) / l, z: (b.z - a.z) / l };
  }

  classifyNodes() {
    for (const n of this.nodes) {
      if (n.kind === 'merge') { n.control = 'merge'; continue; }
      const deg = n.edges.length;
      if (deg <= 1) { n.kind = 'end'; continue; }
      if (deg === 2) {
        const [e0, e1] = n.edges.map((id) => this.edges[id]);
        const d0 = this.dirFrom(e0, n), d1 = this.dirFrom(e1, n);
        const dot = d0.x * d1.x + d0.z * d1.z;
        n.kind = dot < -0.94 ? 'through' : 'junction';
        n.control = 'none';
        if (n.kind === 'through') continue;
      }
      const es = n.edges.map((id) => this.edges[id]);
      const majors = es.filter((e) => MAJOR.has(e.clsName));
      const groups = this.groupEdges(n);
      n.groups = groups;
      const majorGroups = new Set(majors.map((e) => groups.get(e.id)));
      if (deg >= 3 && majorGroups.size >= 2) n.control = 'signal';
      else if (deg >= 3 && majors.length) n.control = 'minorstop';
      else if (deg >= 3) n.control = 'allstop';
      else n.control = 'none';
      if (es.some((e) => e.clsName === 'ramp') && deg >= 3) n.control = 'signal';
    }
  }

  groupEdges(n) {
    const map = new Map();
    const dirs = n.edges.map((id) => ({ id, d: this.dirFrom(this.edges[id], n) }));
    const ref = dirs[0].d;
    for (const { id, d } of dirs) {
      const dot = Math.abs(d.x * ref.x + d.z * ref.z);
      map.set(id, dot > 0.6 ? 0 : 1);
    }
    return map;
  }

  computeSetbacks() {
    for (const n of this.nodes) {
      if (n.kind !== 'junction') continue;
      const es = n.edges.map((id) => this.edges[id]);
      for (const e of es) {
        const de = this.dirFrom(e, n);
        let sb = 0;
        for (const f of es) {
          if (f === e) continue;
          const df = this.dirFrom(f, n);
          const sin = Math.abs(de.x * df.z - de.z * df.x);
          const cos = de.x * df.x + de.z * df.z;
          if (sin < 0.25) continue;
          let v = f.halfW / sin + (cos > 0 ? e.halfW * cos / sin : 0);
          sb = Math.max(sb, v);
        }
        sb = Math.min(sb + 1.2, 38);
        if (e.a === n.id) e.sbA = sb; else e.sbB = sb;
      }
    }
    for (const e of this.edges) {
      const L = e.pl.len;
      if (e.sbA + e.sbB > L * 0.9) { const k = (L * 0.9) / (e.sbA + e.sbB); e.sbA *= k; e.sbB *= k; }
      const cw = (n) => n.kind === 'junction' && n.edges.length >= 3 && n.x >= -876 && n.x <= 876 && n.z >= -276 && n.z <= 471;
      e.hasCrosswalkA = !e.structure && e.clsName !== 'rural' && cw(this.nodes[e.a]);
      e.hasCrosswalkB = !e.structure && e.clsName !== 'rural' && cw(this.nodes[e.b]);
    }
  }

  laneOffsets(e) {
    const c = e.cls;
    if (e.oneway) {
      const hw = e.halfW;
      return { f: Array.from({ length: c.lanes }, (_, i) => -hw + c.shoulderL + c.laneW * (i + 0.5)), b: [] };
    }
    const f = Array.from({ length: c.lanes }, (_, i) => c.median / 2 + c.laneW * (i + 0.5));
    return { f, b: f.map((v) => -v) };
  }

  buildLanes() {
    for (const e of this.edges) {
      const off = this.laneOffsets(e);
      const s0 = e.sbA, s1 = e.pl.len - e.sbB;
      const base = new Polyline(e.pl.slice(s0, s1, 0));
      off.f.forEach((o, i) => {
        const pts = new Polyline(base.pts).offset(o);
        const lane = this.makeLane(e, +1, i, pts);
        e.fwd.push(lane.id);
      });
      off.b.forEach((o, i) => {
        const pts = new Polyline(base.pts).offset(o).reverse();
        const lane = this.makeLane(e, -1, i, pts);
        e.bwd.push(lane.id);
      });
    }
  }

  makeLane(e, dir, index, pts) {
    const pl = new Polyline(pts);
    const endNode = dir > 0 ? this.nodes[e.b] : this.nodes[e.a];
    const cross = dir > 0 ? e.hasCrosswalkB : e.hasCrosswalkA;
    const lane = {
      id: this.lanes.length, kind: 'lane', edge: e.id, dir, index, pl, len: pl.len, speed: e.speed,
      node: endNode.id, startNode: dir > 0 ? e.a : e.b,
      stopS: Math.max(0, pl.len - (cross ? 5.2 : 1.2)), out: [], cars: [], nLanes: dir > 0 ? e.lanesF : e.lanesB,
    };
    this.lanes.push(lane);
    return lane;
  }

  // lanes arriving at node n, lanes leaving node n (per edge)
  arriving(n) {
    const res = [];
    for (const id of n.edges) {
      const e = this.edges[id];
      if (e.b === n.id) res.push(...e.fwd.map((l) => this.lanes[l]));
      if (e.a === n.id) res.push(...e.bwd.map((l) => this.lanes[l]));
    }
    return res;
  }
  leavingOnEdge(n, e) {
    const ids = e.a === n.id ? e.fwd : e.b === n.id ? e.bwd : [];
    return ids.map((l) => this.lanes[l]);
  }

  buildConnectors() {
    for (const n of this.nodes) {
      const inLanes = this.arriving(n);
      for (const L of inLanes) {
        const inEdge = this.edges[L.edge];
        const endP = L.pl.at(L.len);
        const hIn = Math.atan2(endP.dx, endP.dz);
        for (const id of n.edges) {
          const f = this.edges[id];
          const outs = this.leavingOnEdge(n, f);
          if (!outs.length) continue;
          if (f === inEdge && n.edges.length > 1) continue;
          const st = outs[0].pl.at(0);
          const hOut = Math.atan2(st.dx, st.dz);
          const dh = wrapAngle(hOut - hIn);
          let turn = Math.abs(dh) < 0.55 ? 'S' : dh > 0 ? 'L' : 'R';
          if (Math.abs(dh) > 2.6 && n.edges.length > 1) continue;
          if (n.kind === 'merge') {
            if (Math.abs(dh) > 1.2) continue;
            const inRamp = inEdge.clsName === 'ramp', outRamp = f.clsName === 'ramp';
            if (inRamp && outRamp) continue;
            if (inRamp) { this.addConn(L, outs[outs.length - 1], n, 'M'); continue; }
            if (outRamp) { if (L.index === L.nLanes - 1) this.addConn(L, outs[0], n, 'D'); continue; }
            this.addConn(L, outs[Math.min(L.index, outs.length - 1)], n, 'S');
            continue;
          }
          if (n.kind === 'through') { this.addConn(L, outs[Math.min(L.index, outs.length - 1)], n, 'S'); continue; }
          if (turn === 'S') {
            this.addConn(L, outs[Math.min(L.index, outs.length - 1)], n, 'S');
            if (L.index === L.nLanes - 1 && outs.length > L.nLanes) for (let k = L.nLanes; k < outs.length; k++) this.addConn(L, outs[k], n, 'S');
          } else if (turn === 'R') {
            if (L.index === L.nLanes - 1) this.addConn(L, outs[outs.length - 1], n, 'R');
          } else if (turn === 'L') {
            if (L.index === 0) this.addConn(L, outs[0], n, 'L');
          }
        }
        if (!L.out.length) {
          const back = this.leavingOnEdge(n, inEdge);
          if (back.length) this.addConn(L, back[0], n, 'U');
        }
      }
    }
  }

  addConn(from, to, n, turn) {
    const a = from.pl.at(from.len), b = to.pl.at(0);
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const k = turn === 'U' ? 6 : Math.max(1, d * 0.42);
    const P = [
      { x: a.x, y: a.y, z: a.z },
      { x: a.x + a.dx * k, y: a.y, z: a.z + a.dz * k },
      { x: b.x - b.dx * k, y: b.y, z: b.z - b.dz * k },
      { x: b.x, y: b.y, z: b.z },
    ];
    const N = Math.max(3, Math.ceil(d / 3));
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, u = 1 - t;
      const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
      pts.push({ x: P[0].x * w0 + P[1].x * w1 + P[2].x * w2 + P[3].x * w3, y: a.y + (b.y - a.y) * t, z: P[0].z * w0 + P[1].z * w1 + P[2].z * w2 + P[3].z * w3 });
    }
    const pl = new Polyline(pts);
    let curv = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const h0 = Math.atan2(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z), h1 = Math.atan2(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
      curv = Math.max(curv, Math.abs(wrapAngle(h1 - h0)) / (pl.len / N));
    }
    const vmax = curv > 1e-4 ? Math.sqrt(3.2 / curv) : 40;
    const c = { id: this.conns.length, kind: 'conn', from: from.id, to: to.id, node: n.id, turn, pl, len: pl.len, speed: Math.min(from.speed, to.speed, vmax), cars: [] };
    this.conns.push(c);
    from.out.push(c.id);
    return c;
  }

  buildSignals() {
    for (const n of this.nodes) {
      if (n.control !== 'signal') continue;
      const green = n.edges.length >= 4 ? 20 : 16;
      n.cycle = [
        { g: 0, t: green }, { g: 0, y: true, t: 3.5 }, { g: -1, t: 1.5 },
        { g: 1, t: green }, { g: 1, y: true, t: 3.5 }, { g: -1, t: 1.5 },
      ];
      n.cycleLen = n.cycle.reduce((s, p) => s + p.t, 0);
      n.offset = ((n.x * 0.09 + n.z * 0.05) % n.cycleLen + n.cycleLen) % n.cycleLen;
    }
  }

  // 'G' | 'Y' | 'R' for traffic arriving on edge id at node n at time t
  signal(n, edgeId, t) {
    if (n.control !== 'signal') return 'G';
    const grp = n.groups.get(edgeId);
    let tt = (t + n.offset) % n.cycleLen;
    for (const p of n.cycle) {
      if (tt < p.t) {
        if (p.g !== grp) return 'R';
        return p.y ? 'Y' : 'G';
      }
      tt -= p.t;
    }
    return 'R';
  }

  // pedestrians crossing edge e at node n may walk?
  walk(n, edgeId, t) {
    if (n.control !== 'signal') return true;
    const grp = n.groups.get(edgeId);
    let tt = (t + n.offset) % n.cycleLen;
    for (const p of n.cycle) {
      if (tt < p.t) return p.g !== -1 && p.g !== grp && !p.y && tt < p.t - 5;
      tt -= p.t;
    }
    return false;
  }

  phaseInfo(n, t) {
    let tt = (t + n.offset) % n.cycleLen;
    for (const p of n.cycle) { if (tt < p.t) return { p, left: p.t - tt }; tt -= p.t; }
    return null;
  }

  buildIndex() {
    const C = this.cell;
    const add = (key, v) => { let a = this.grid.get(key); if (!a) this.grid.set(key, (a = [])); if (!a.includes(v)) a.push(v); };
    for (const e of this.edges) {
      const r = e.halfW + 4;
      for (let i = 0; i < e.pts.length - 1; i++) {
        const a = e.pts[i], b = e.pts[i + 1];
        const x0 = Math.floor((Math.min(a.x, b.x) - r) / C), x1 = Math.floor((Math.max(a.x, b.x) + r) / C);
        const z0 = Math.floor((Math.min(a.z, b.z) - r) / C), z1 = Math.floor((Math.max(a.z, b.z) + r) / C);
        for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) add(`${x},${z}`, e.id);
      }
    }
  }

  edgesNear(x, z, r = 0) {
    const C = this.cell, out = new Set();
    const x0 = Math.floor((x - r) / C), x1 = Math.floor((x + r) / C), z0 = Math.floor((z - r) / C), z1 = Math.floor((z + r) / C);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) for (const id of this.grid.get(`${i},${j}`) || []) out.add(id);
    return [...out].map((id) => this.edges[id]);
  }

  // nearest road edge (with optional y filter) → { e, s, d, x, z, y, side }
  nearest(x, z, y = null, maxD = 60) {
    let best = null;
    for (const e of this.edgesNear(x, z, Math.min(maxD, 60))) {
      const pr = e.pl.project(x, z);
      if (pr.d > maxD) continue;
      const p = e.pl.at(pr.s);
      if (y !== null && Math.abs(p.y - y) > 4) continue;
      if (!best || pr.d < best.d) {
        const side = (x - p.x) * -p.dz + (z - p.z) * p.dx;
        best = { e, s: pr.s, d: pr.d, x: p.x, y: p.y, z: p.z, dx: p.dx, dz: p.dz, side };
      }
    }
    return best;
  }

  onRoad(x, z, y = null) {
    const n = this.nearest(x, z, y, 30);
    return n && n.d < n.e.halfW ? n : null;
  }

  // lane nearest to a point heading roughly along (hx,hz)
  nearestLane(x, z, hx = 0, hz = 0, y = null, maxD = 30) {
    let best = null, bd = Infinity;
    for (const e of this.edgesNear(x, z, maxD)) {
      for (const id of [...e.fwd, ...e.bwd]) {
        const L = this.lanes[id];
        const pr = L.pl.project(x, z);
        if (pr.d > maxD) continue;
        const p = L.pl.at(pr.s);
        if (y !== null && Math.abs(p.y - y) > 3.5) continue;
        const align = hx || hz ? p.dx * hx + p.dz * hz : 1;
        const score = pr.d + (1 - align) * 12;
        if (score < bd) { bd = score; best = { lane: L, s: pr.s, d: pr.d, align, x: p.x, y: p.y, z: p.z }; }
      }
    }
    return best;
  }

  // A* over nodes. returns array of { edge, dir } from node a to node b
  route(fromNode, toNode, { ignoreOneway = false } = {}) {
    if (fromNode === toNode) return [];
    const N = this.nodes;
    const g = new Map([[fromNode, 0]]), came = new Map();
    const open = [[this.hdist(fromNode, toNode), fromNode]];
    const closed = new Set();
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [, cur] = open.splice(bi, 1)[0];
      if (cur === toNode) break;
      if (closed.has(cur)) continue;
      closed.add(cur);
      for (const id of N[cur].edges) {
        const e = this.edges[id];
        const forward = e.a === cur;
        if (!ignoreOneway && e.oneway && !forward) continue;
        const nxt = forward ? e.b : e.a;
        const cost = g.get(cur) + e.pl.len / Math.max(8, e.speed) * (e.clsName === 'ramp' ? 1.1 : 1);
        if (cost < (g.get(nxt) ?? Infinity)) {
          g.set(nxt, cost); came.set(nxt, { from: cur, edge: id, dir: forward ? 1 : -1 });
          open.push([cost + this.hdist(nxt, toNode), nxt]);
        }
      }
    }
    if (!came.has(toNode)) return null;
    const path = [];
    let c = toNode;
    while (c !== fromNode) { const s = came.get(c); path.unshift({ edge: s.edge, dir: s.dir, from: s.from, to: c }); c = s.from; }
    return path;
  }
  // lane points from a world position (heading hx,hz) to another position: along the start edge to its end node,
  // over the graph, then along the target edge to the exact spot
  pathBetween(sx, sz, sy, hx, hz, tx, tz, off = 0) {
    const S = this.nearest(sx, sz, sy, 40), G = this.nearest(tx, tz, null, 60);
    if (!S || !G) return null;
    const lane = (e) => (e.oneway ? 0 : Math.max(e.cls.centerline === 'barrier' ? e.cls.median / 2 + e.cls.laneW * 0.5 : 0, off));
    const part = (e, sa, sb) => {
      const dir = sb >= sa ? 1 : -1, pts = new Polyline(e.pl.slice(Math.min(sa, sb), Math.max(sa, sb))).offset(dir > 0 ? lane(e) : -lane(e));
      return dir > 0 ? pts : pts.reverse();
    };
    const secs = (r) => r.reduce((t, st) => t + this.edges[st.edge].pl.len / Math.max(8, this.edges[st.edge].speed), 0);
    const e0 = S.e, e1 = G.e, dir0 = e0.oneway || hx * S.dx + hz * S.dz >= 0 ? 1 : -1;
    if (e0 === e1 && (G.s - S.s) * dir0 > 0) return part(e0, S.s, G.s);
    const n0 = dir0 > 0 ? e0.b : e0.a;
    const out = part(e0, S.s, dir0 > 0 ? e0.pl.len : 0);
    const opts = [];
    const ra = this.route(n0, e1.a);
    if (ra) opts.push({ r: ra, from: 0, cost: secs(ra) + G.s / Math.max(8, e1.speed) });
    if (!e1.oneway) { const rb = this.route(n0, e1.b); if (rb) opts.push({ r: rb, from: e1.pl.len, cost: secs(rb) + (e1.pl.len - G.s) / Math.max(8, e1.speed) }); }
    if (!opts.length) return null;
    const best = opts.reduce((a, b) => (b.cost < a.cost ? b : a));
    for (const st of best.r) {
      const e = this.edges[st.edge], o = lane(e);
      for (const p of st.dir > 0 ? e.pl.offset(o) : e.pl.offset(-o).reverse()) out.push(p);
    }
    for (const p of part(e1, best.from, G.s)) out.push(p);
    return out;
  }
  hdist(a, b) { const A = this.nodes[a], B = this.nodes[b]; return Math.hypot(A.x - B.x, A.z - B.z) / 30; }

  nearestNode(x, z, filter) {
    let best = null, bd = Infinity;
    for (const n of this.nodes) {
      if (filter && !filter(n)) continue;
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  // polyline points for a route (centerline offset to the travel lane)
  routePoints(path, offset = 3) {
    const out = [];
    for (const step of path) {
      const e = this.edges[step.edge];
      let pts = e.pl.offset(e.oneway ? 0 : offset);
      if (step.dir < 0) pts = e.pl.offset(e.oneway ? 0 : -offset).reverse();
      for (const p of pts) out.push(p);
    }
    return out;
  }
}
