import * as THREE from 'three';
import { GeoBuilder } from '../core/geo.js';
import { Polyline, clamp } from '../core/math.js';
import { SURF } from './terrain.js';

const Y_ROAD = 0.02, Y_MARK = 0.035;

function convexHull(pts) {
  const p = [...pts].sort((a, b) => a.x - b.x || a.z - b.z);
  const cross = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop();
  return lo.concat(up);
}

// strip following a polyline between lateral offsets o0..o1 (o0 < o1, positive = right); sink(x,z) -> GeoBuilder
function band(sink, pl, s0, s1, o0, o1, y, col, uvS = 7, step = 0) {
  if (s1 - s0 < 0.05) return;
  if (step > 0 && s1 - s0 > step * 1.5) {
    const n = Math.ceil((s1 - s0) / step);
    for (let k = 0; k < n; k++) band(sink, pl, s0 + ((s1 - s0) * k) / n, s0 + ((s1 - s0) * (k + 1)) / n, o0, o1, y, col, uvS, 0);
    return;
  }
  const pts = pl.slice(s0, s1, 0);
  if (pts.length < 2) return;
  const sub = new Polyline(pts);
  const L = sub.offset(o0), R = sub.offset(o1);
  const mid = pts[pts.length >> 1];
  const b = sink(mid.x, mid.z);
  const base = b.count;
  let acc = 0;
  const so = pl.cum ? s0 : 0;
  for (let i = 0; i < pts.length; i++) {
    if (i) acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    b.v(L[i].x, L[i].y + y, L[i].z, 0, 1, 0, o0 / uvS, (so + acc) / uvS, col.r, col.g, col.b);
    b.v(R[i].x, R[i].y + y, R[i].z, 0, 1, 0, o1 / uvS, (so + acc) / uvS, col.r, col.g, col.b);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = base + i * 2;
    b.i.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
}

function dashed(sink, pl, s0, s1, o, w, dash, gap, y, col) {
  for (let s = s0; s < s1; s += dash + gap) band(sink, pl, s, Math.min(s + dash, s1), o - w / 2, o + w / 2, y, col, 7, 0);
}

export function buildRoads(world) {
  const { roads, terrain, colliders, store } = world;
  const road = (x, z) => store.b('road', 'asphalt', x, z), white = (x, z) => store.b('mark', 'markWhite', x, z), yellow = (x, z) => store.b('mark', 'markYellow', x, z);
  const deck = (x, z) => store.b('deck', 'wallConcrete', x, z);
  const W = new THREE.Color(1, 1, 1);
  const cConc = new THREE.Color(0.86, 0.85, 0.82), cDark = new THREE.Color(0.7, 0.69, 0.66), cRail = new THREE.Color(0.75, 0.76, 0.78);
  const out = { lamps: [], signals: [], stopSigns: [], speedSigns: [], decks: [], gantries: [], streetNames: [] };

  // ---- stamp terrain & paint surfaces ----
  for (const e of roads.edges) {
    const fall = e.clsName === 'rural' || e.clsName === 'avenue' ? 14 : 8;
    terrain.stamp(e.pts, e.halfW + (e.structure ? 1.5 : 0.5), fall, e.structure ? 0.35 : null);
    terrain.paintPoly(e.pts, e.halfW + 0.5, SURF.ASPHALT);
  }

  // ---- junction polygons ----
  for (const n of roads.nodes) {
    if (n.kind !== 'junction') continue;
    const pts = [];
    for (const id of n.edges) {
      const e = roads.edges[id];
      const atA = e.a === n.id;
      const s = atA ? e.sbA : e.pl.len - e.sbB;
      const p = e.pl.at(s);
      const rx = -p.dz, rz = p.dx;
      pts.push({ x: p.x + rx * e.halfW, z: p.z + rz * e.halfW }, { x: p.x - rx * e.halfW, z: p.z - rz * e.halfW });
    }
    pts.push({ x: n.x, z: n.z });
    const hull = convexHull(pts);
    const rb = road(n.x, n.z);
    const base = rb.count;
    rb.v(n.x, n.y + Y_ROAD, n.z, 0, 1, 0, n.x / 7, n.z / 7);
    for (const q of hull) rb.v(q.x, n.y + Y_ROAD, q.z, 0, 1, 0, q.x / 7, q.z / 7);
    for (let k = 0; k < hull.length; k++) {
      const a = base + 1 + k, c = base + 1 + ((k + 1) % hull.length);
      rb.tri(base, c, a);
    }
    n.hull = hull;
    terrain.paintConvex(hull, SURF.ASPHALT);
  }

  // ---- edges ----
  for (const e of roads.edges) {
    const pl = e.pl, c = e.cls, hw = e.halfW;
    const s0 = e.sbA, s1 = pl.len - e.sbB;
    band(road, pl, s0, s1, -hw, hw, Y_ROAD, W, 7, 48);
    const cwA = e.hasCrosswalkA ? 4.2 : 0, cwB = e.hasCrosswalkB ? 4.2 : 0;
    const m0 = s0 + cwA + (e.hasCrosswalkA ? 1.2 : 0.5), m1 = s1 - cwB - (e.hasCrosswalkB ? 1.2 : 0.5);
    if (m1 > m0) {
      if (e.oneway) {
        const l = -hw + c.shoulderL, r = l + c.lanes * c.laneW;
        band(yellow, pl, m0, m1, l - 0.07, l + 0.07, Y_MARK, W);
        band(white, pl, m0, m1, r - 0.07, r + 0.07, Y_MARK, W);
        for (let k = 1; k < c.lanes; k++) dashed(white, pl, m0, m1, l + c.laneW * k, 0.12, 3, 9, Y_MARK, W);
      } else {
        const md = c.median / 2;
        if (c.centerline === 'double-yellow') { band(yellow, pl, m0, m1, -0.2, -0.08, Y_MARK, W); band(yellow, pl, m0, m1, 0.08, 0.2, Y_MARK, W); }
        else if (c.centerline === 'yellow-dashed') dashed(yellow, pl, m0, m1, 0, 0.12, 3, 6, Y_MARK, W);
        else if (c.centerline === 'barrier') { band(yellow, pl, m0, m1, -md + 0.3, -md + 0.42, Y_MARK, W); band(yellow, pl, m0, m1, md - 0.42, md - 0.3, Y_MARK, W); }
        for (const sg of [1, -1]) {
          for (let k = 1; k < c.lanes; k++) dashed(white, pl, m0, m1, sg * (md + c.laneW * k), 0.12, 3, 9, Y_MARK, W);
          const edgeO = md + c.lanes * c.laneW + 0.1;
          if (c.edge === 'white' || c.edge === 'parking') band(white, pl, m0, m1, sg > 0 ? edgeO - 0.07 : -edgeO - 0.07, sg > 0 ? edgeO + 0.07 : -edgeO + 0.07, Y_MARK, W);
        }
        if (c.parking > 0) {
          for (const sg of [1, -1]) {
            const o = md + c.lanes * c.laneW + 0.1;
            for (let s = m0 + 8; s < m1 - 8; s += 6.2) {
              const oo = sg * (o + c.parking * 0.5);
              band(white, pl, s - 0.06, s + 0.06, oo - c.parking * 0.45, oo + c.parking * 0.45, Y_MARK, W);
            }
          }
        }
      }
    }
    // crosswalks + stop lines
    for (const [has, atA] of [[e.hasCrosswalkA, true], [e.hasCrosswalkB, false]]) {
      const node = roads.nodes[atA ? e.a : e.b];
      if (has) {
        const sa = atA ? s0 + 0.5 : s1 - 0.5 - 3.4;
        for (let o = -hw + 0.6; o < hw - 0.4; o += 1.0) band(white, pl, sa, sa + 3.4, o, o + 0.5, Y_MARK, W);
      }
      if (node.control !== 'none' && node.control !== 'merge' && !e.oneway) {
        const sl = atA ? s0 + (has ? 4.6 : 1.2) : s1 - (has ? 4.6 : 1.2);
        const md = c.median / 2;
        const o0 = atA ? -(md + c.lanes * c.laneW) : md, o1 = atA ? -md : md + c.lanes * c.laneW;
        const minor = node.control === 'minorstop' && !['arterial', 'avenue', 'rural'].includes(e.clsName);
        if (node.control === 'signal' || node.control === 'allstop' || minor) band(white, pl, sl - 0.25, sl + 0.25, o0, o1, Y_MARK, W);
      }
    }
  }

  // ---- structures: elevated decks, barriers, piers ----
  const mergeNear = (e, s) => {
    const na = roads.nodes[e.a], nb = roads.nodes[e.b];
    const dA = na.kind === 'merge' ? s : Infinity, dB = nb.kind === 'merge' ? e.pl.len - s : Infinity;
    return Math.min(dA, dB);
  };
  for (const e of roads.edges) {
    if (!e.structure) continue;
    const pl = e.pl, hw = e.halfW, fw = e.clsName === 'freeway';
    const step = 6;
    const segs = Math.ceil(pl.len / step);
    const P = [];
    for (let i = 0; i <= segs; i++) {
      const s = (pl.len * i) / segs, p = pl.at(s);
      const g = terrain.base(p.x, p.z);
      P.push({ s, x: p.x, y: p.y, z: p.z, dx: p.dx, dz: p.dz, g, elev: p.y - g });
    }
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      const elevated = a.elev > 0.45 || b.elev > 0.45;
      const rA = { x: -a.dz, z: a.dx }, rB = { x: -b.dz, z: b.dx };
      const L = (p, r, o) => [p.x + r.x * o, p.y, p.z + r.z * o];
      if (elevated) {
        out.decks.push({ ax: a.x, az: a.z, ay: a.y, bx: b.x, bz: b.z, by: b.y, hw: hw + 0.4, edge: e.id });
        const th = 1.3;
        for (const sg of [-1, 1]) {
          const o = sg * (hw + 0.4);
          const A0 = L(a, rA, o), B0 = L(b, rB, o);
          if (sg > 0) deck(A0[0], A0[2]).quad([A0[0], A0[1] - th, A0[2]], [B0[0], B0[1] - th, B0[2]], [B0[0], B0[1] + 0.02, B0[2]], [A0[0], A0[1] + 0.02, A0[2]], cConc, [0, 0, step / 4, 0.3]);
          else deck(A0[0], A0[2]).quad([B0[0], B0[1] - th, B0[2]], [A0[0], A0[1] - th, A0[2]], [A0[0], A0[1] + 0.02, A0[2]], [B0[0], B0[1] + 0.02, B0[2]], cConc, [0, 0, step / 4, 0.3]);
        }
        const l0 = L(a, rA, -hw - 0.4), l1 = L(b, rB, -hw - 0.4), r0 = L(a, rA, hw + 0.4), r1 = L(b, rB, hw + 0.4);
        deck(a.x, a.z).quad([r0[0], r0[1] - th, r0[2]], [l0[0], l0[1] - th, l0[2]], [l1[0], l1[1] - th, l1[2]], [r1[0], r1[1] - th, r1[2]], cDark, [0, 0, 1, 1]);
      }
      // barriers
      const ramp = e.clsName === 'ramp';
      const nearMerge = mergeNear(e, a.s);
      for (const sg of [-1, 1]) {
        if (!elevated && !fw) continue;
        if (fw && nearMerge < 105 && hasRampSide(roads, e, a.s, sg)) continue;
        if (ramp && nearMerge < 110 && sg < 0) continue;
        const o = sg * (hw + 0.1);
        const A0 = L(a, rA, o), B0 = L(b, rB, o);
        const tall = elevated ? 1.05 : 0.8;
        jersey(deck(A0[0], A0[2]), A0, B0, tall, sg, cConc);
        colliders.seg(A0[0], A0[2], B0[0], B0[2], 0.5, Math.min(A0[1], B0[1]) - 0.3, Math.max(A0[1], B0[1]) + tall, { kind: 'barrier', mat: 'concrete' });
      }
      if (fw) {
        const nearEnd = Math.min(a.s, pl.len - a.s);
        const endNode = a.s < pl.len / 2 ? roads.nodes[e.a] : roads.nodes[e.b];
        if (!(endNode.kind === 'junction' && nearEnd < 20)) {
          const A0 = L(a, rA, 0), B0 = L(b, rB, 0);
          jersey(deck(A0[0], A0[2]), A0, B0, 1.0, 1, cConc);
          colliders.seg(A0[0], A0[2], B0[0], B0[2], 0.8, Math.min(A0[1], B0[1]) - 0.3, Math.max(A0[1], B0[1]) + 1.0, { kind: 'barrier', mat: 'concrete' });
        }
      }
      // retaining walls where low but raised
      if (elevated && Math.min(a.elev, b.elev) < 4.2) {
        for (const sg of [-1, 1]) {
          const o = sg * (hw + 0.4);
          const A0 = L(a, rA, o), B0 = L(b, rB, o);
          const ga = a.g - 0.3, gb = b.g - 0.3;
          if (sg > 0) deck(A0[0], A0[2]).quad([A0[0], ga, A0[2]], [B0[0], gb, B0[2]], [B0[0], B0[1] - 1.3, B0[2]], [A0[0], A0[1] - 1.3, A0[2]], cConc, [0, 0, step / 4, 1]);
          else deck(A0[0], A0[2]).quad([B0[0], gb, B0[2]], [A0[0], ga, A0[2]], [A0[0], A0[1] - 1.3, A0[2]], [B0[0], B0[1] - 1.3, B0[2]], cConc, [0, 0, step / 4, 1]);
          colliders.seg(A0[0], A0[2], B0[0], B0[2], 0.6, Math.min(a.g, b.g) - 1, Math.min(A0[1], B0[1]) - 0.4, { kind: 'wall', mat: 'concrete' });
        }
      }
      // piers
      if (elevated && a.elev > 4.2 && i % (fw ? 5 : 4) === 0) {
        const below = roads.nearest(a.x, a.z, a.g, 30);
        const clearRoad = below && below.d < below.e.halfW + 4 && !below.e.structure;
        if (!clearRoad) {
          const h = a.elev - 1.2;
          const ang = Math.atan2(a.dx, a.dz);
          const cols = fw ? [-hw * 0.45, hw * 0.45] : [0];
          for (const o of cols) {
            const px = a.x + rA.x * o, pz = a.z + rA.z * o;
            deck(px, pz).box(px, a.g + h / 2 - 0.3, pz, 1.6, h + 0.6, 1.6, cConc, ang, 3);
            colliders.circle(px, pz, 1.0, a.g - 1, a.y - 1.3, { kind: 'pier', mat: 'concrete' });
          }
          deck(a.x, a.z).box(a.x, a.y - 1.3 - 0.45, a.z, (fw ? hw * 2 : hw * 1.6), 0.9, 1.8, cConc, ang, 3);
        }
      }
      // lamps along freeway median / ramp edge
      if (fw && i % 8 === 4) out.lamps.push({ type: 'lampDouble', x: a.x, y: a.y + 1.0, z: a.z, rot: Math.atan2(a.dx, a.dz) });
      if (!fw && elevated && i % 7 === 3) out.lamps.push({ type: 'lampCobra', x: a.x + rA.x * (hw + 0.2), y: a.y + 1.0, z: a.z + rA.z * (hw + 0.2), rot: Math.atan2(-rA.x, -rA.z) });
    }
  }

  // ---- signals, stop signs, street names ----
  for (const n of roads.nodes) {
    if (n.control === 'none' || n.control === 'merge') continue;
    for (const id of n.edges) {
      const e = roads.edges[id];
      const atA = e.a === n.id;
      const inLanes = atA ? e.bwd : e.fwd;
      if (!inLanes.length) continue;
      const s = atA ? e.sbA : e.pl.len - e.sbB;
      const p = e.pl.at(s);
      // direction of travel into the junction
      const dx = atA ? -p.dx : p.dx, dz = atA ? -p.dz : p.dz;
      const rx = -dz, rz = dx;
      const heading = Math.atan2(dx, dz);
      if (n.control === 'signal') {
        // far-side mast: across the junction on the right
        let far = 0;
        for (const fid of n.edges) { if (fid === id) continue; const f = roads.edges[fid]; const d = roads.dirFrom(f, n); if (d.x * dx + d.z * dz > 0.7) far = f.a === n.id ? f.sbA : f.sbB; }
        const cross = far || Math.max(8, e.halfW);
        const hwIn = e.cls.oneway ? e.halfW : e.cls.median / 2 + e.cls.lanes * e.cls.laneW;
        const px = n.x + dx * (cross + 1.8) + rx * (e.halfW + 1.2), pz = n.z + dz * (cross + 1.8) + rz * (e.halfW + 1.2);
        const heads = inLanes.map((lid) => {
          const L = roads.lanes[lid], q = L.pl.at(L.len);
          const lat = (q.x - n.x) * rx + (q.z - n.z) * rz;
          return lat;
        });
        out.signals.push({ node: n.id, edge: id, x: px, y: n.y, z: pz, heading, rx, rz, dx, dz, arm: e.halfW + 1.2 - Math.min(...heads) + 0.5, heads: heads.map((lat) => e.halfW + 1.2 - lat), hwIn, name: e.name });
        colliders.circle(px, pz, 0.3, n.y - 1, n.y + 7, { kind: 'pole', mat: 'metal' });
      } else {
        const minor = n.control === 'minorstop' && !['arterial', 'avenue', 'rural'].includes(e.clsName);
        if (n.control === 'allstop' || minor) {
          const px = p.x + rx * (e.halfW + 0.9) - dx * 2.5, pz = p.z + rz * (e.halfW + 0.9) - dz * 2.5;
          out.stopSigns.push({ x: px, y: n.y, z: pz, rot: heading + Math.PI });
        }
      }
    }
  }

  return out;
}

function hasRampSide(roads, e, s, side) {
  const near = s < e.pl.len / 2 ? roads.nodes[e.a] : roads.nodes[e.b];
  if (near.kind !== 'merge') return false;
  const d = roads.dirFrom(e, near);
  for (const id of near.edges) {
    const r = roads.edges[id];
    if (r.clsName !== 'ramp') continue;
    const far = roads.nodes[r.a === near.id ? r.b : r.a];
    if ((far.x - near.x) * d.x + (far.z - near.z) * d.z <= 0) continue;
    // ramp side relative to this edge's travel direction (a->b)
    const mid = r.pl.at(r.pl.len / 2);
    const p = e.pl.at(s);
    const lat = (mid.x - p.x) * -p.dz + (mid.z - p.z) * p.dx;
    if (Math.sign(lat) === side) return true;
  }
  return false;
}

// jersey barrier profile along A->B on side sg (outer face toward +sg*right)
function jersey(b, A, B, h, sg, col) {
  const dx = B[0] - A[0], dz = B[2] - A[2], L = Math.hypot(dx, dz) || 1;
  const rx = (-dz / L) * sg, rz = (dx / L) * sg;
  const prof = [[-0.3, 0], [-0.2, 0.25], [-0.09, h], [0.09, h], [0.2, 0.25], [0.3, 0]];
  for (let k = 0; k < prof.length - 1; k++) {
    const [o0, y0] = prof[k], [o1, y1] = prof[k + 1];
    const a0 = [A[0] + rx * o0, A[1] + y0, A[2] + rz * o0], b0 = [B[0] + rx * o0, B[1] + y0, B[2] + rz * o0];
    const a1 = [A[0] + rx * o1, A[1] + y1, A[2] + rz * o1], b1 = [B[0] + rx * o1, B[1] + y1, B[2] + rz * o1];
    b.quad(b0, a0, a1, b1, col, [0, 0, L / 3, 0.3]);
  }
}
