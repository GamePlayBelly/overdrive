import * as THREE from 'three';
import { lerp, smoothstep } from '../core/math.js';

// Hulls and decks for the sailing boats; the sails themselves are built in sailModel.js and animated by Boat.sync.
export function sailBuilders(h) {
  const { hullBuild, deckBand, sideDeck, cabin, rail, bx, tube, lamp, quadN, hexa, K, C } = h;

  // keel fin, ballast bulb and rudder blade as simple prisms
  const fin = (ctx, y0, y1, zr0, zr1, zt0, zt1, hw0, hw1, col) => {
    hexa(ctx.trim, [[hw0, y0, zr0], [-hw0, y0, zr0], [-hw0, y0, zr1], [hw0, y0, zr1], [hw1, y1, zt0], [-hw1, y1, zt0], [-hw1, y1, zt1], [hw1, y1, zt1]], col, true);
  };

  const sloop = (ctx, def) => {
    const b = def.body, L = b.L, k = L / 9.4, S = def.perf.sail, W = b.W;
    const H = { L, W, draft: b.draft, fbS: 0.84 * k, fbB: 1.1 * k, beamT: 0.5, bowExp: 1.9, bowRound: 0.92, sternW: 0.72, keelT: 0.55, keelPow: 2.0, flare: 0.05, sheerSag: 0.09 * k, sheerPow: 2.3, round: true };
    const F = hullBuild(ctx, H, { anti: C('#1a2b3c'), boot: K.white, stripe: C('#1d3f73') });
    const gw = (t) => F.hw(t) * (1 + H.flare * smoothstep(0.3, 1, t));
    const Z = (t) => -L / 2 + t * L, dY = (t) => F.ys(t) + 0.02;
    const deck = C('#d8d5ca'), teak = K.teak;
    // flush foredeck, narrow side decks and stern, cockpit well aft
    const tc0 = 0.06, tc1 = 0.3, fl = F.ys(0.2) - 0.42 * k;
    const wallIn = (t) => Math.max(0.05, gw(t) - 0.36 * k);
    deckBand(ctx.trim, F, tc1, 0.995, gw, dY, deck, 18);
    deckBand(ctx.trim, F, 0, tc0, gw, dY, deck, 2);
    sideDeck(ctx.trim, F, tc0, tc1, gw, wallIn, dY, deck, 8);
    deckBand(ctx.trim, F, tc0, tc1, wallIn, () => fl, teak, 8);
    for (const s of [1, -1]) for (let i = 0; i < 8; i++) {
      const t0 = lerp(tc0, tc1, i / 8), t1 = lerp(tc0, tc1, (i + 1) / 8);
      quadN(ctx.trim, [s * wallIn(t0), fl, Z(t0)], [s * wallIn(t1), fl, Z(t1)], [s * wallIn(t1), dY(t1), Z(t1)], [s * wallIn(t0), dY(t0), Z(t0)], K.liner, [-s, 0, 0]);
    }
    quadN(ctx.trim, [wallIn(tc0), fl, Z(tc0)], [-wallIn(tc0), fl, Z(tc0)], [-wallIn(tc0), dY(tc0), Z(tc0)], [wallIn(tc0), dY(tc0), Z(tc0)], K.liner, [0, 0, 1]);
    // cockpit benches
    const zc = (Z(tc0) + Z(tc1)) / 2, cl = Z(tc1) - Z(tc0) - 0.5;
    for (const s of [1, -1]) bx(ctx.trim, s * (wallIn(0.18) - 0.24), fl + 0.2, zc, 0.5, 0.4, cl, teak);
    // coachroof with portlights, companionway hatch
    const yD = F.ys(0.5) + 0.02, ch = 0.58 * k, z0 = Z(0.34), z1 = Z(0.68);
    const win = [[0.08, 0.28, 0.32, 0.8], [0.34, 0.54, 0.32, 0.8], [0.6, 0.8, 0.32, 0.8]];
    cabin(ctx, { y0: yD, y1: yD + ch, z0, z1, hw0: 1.08 * (W / 3.1), hw1: 0.92 * (W / 3.1), rb: 0.35 * k, rf: 1.3 * k, side: win, front: [[0.16, 0.5, 0.3, 0.7], [0.54, 0.84, 0.3, 0.7]], col: K.white });
    bx(ctx.trim, 0, yD + ch * 0.55, z0 - 0.01, 0.62 * k, ch * 0.9, 0.06, K.dark);
    bx(ctx.paint, 0, yD + ch + 0.02, z0 + 0.45 * k, 0.9 * k, 0.04, 0.8 * k, K.white);
    bx(ctx.trim, 0, yD + ch + 0.05, Z(0.8) - 0.55, 0.62 * k, 0.05, 0.62 * k, K.light);
    // foredeck: bow roller, windlass, hatch; stern rail and stanchions
    bx(ctx.trim, 0, dY(0.97) + 0.07, Z(0.985), 0.14, 0.05, 0.4, K.grey);
    bx(ctx.trim, 0, dY(0.93) + 0.06, Z(0.92), 0.3, 0.1, 0.26, K.grey);
    const sides = (a, bb, n) => { const o = []; for (let i = 0; i <= n; i++) { const t = lerp(a, bb, i / n); o.push([gw(t) * 0.93, dY(t), Z(t)]); } return o; };
    const lf = sides(0.1, 0.94, 14);
    rail(ctx, lf, 0.62, K.light, 1.5); rail(ctx, lf.map((p) => [-p[0], p[1], p[2]]), 0.62, K.light, 1.5);
    const pul = [[-gw(0.94) * 0.93, dY(0.94), Z(0.94)], [-gw(0.985) * 0.7, dY(0.985), Z(0.985)], [gw(0.985) * 0.7, dY(0.985), Z(0.985)], [gw(0.94) * 0.93, dY(0.94), Z(0.94)]];
    rail(ctx, pul, 0.62, K.light, 1.2);
    const st = [[-gw(0.1) * 0.93, dY(0.1), Z(0.1)], [-gw(0.04) * 0.8, dY(0.04), Z(0.04)], [gw(0.04) * 0.8, dY(0.04), Z(0.04)], [gw(0.1) * 0.93, dY(0.1), Z(0.1)]];
    rail(ctx, st, 0.62, K.light, 1.2);
    // winches, cleats on the coamings
    for (const s of [1, -1]) {
      ctx.trim.addGeo(new THREE.CylinderGeometry(0.09, 0.1, 0.12, 10), s * (wallIn(0.3) + 0.12), dY(0.3) + 0.08, Z(0.27), 0, 1, 1, 1, K.light);
      bx(ctx.trim, s * (gw(0.7) - 0.1), dY(0.7) + 0.05, Z(0.7), 0.1, 0.06, 0.24, K.light);
    }
    // wheel pedestal and wheel
    const wz = Z(0.2) + 0.62 * k, wy = fl + 0.95;
    ctx.trim.addGeo(new THREE.CylinderGeometry(0.1, 0.14, 0.95, 10), 0, fl + 0.48, wz + 0.03, 0, 1, 1, 1, K.dark);
    // keel, bulb, rudder
    fin(ctx, -S.keel, -b.draft + 0.08, Z(0.43), Z(0.55), Z(0.3), Z(0.66), 0.04, 0.12, C('#26313d'));
    ctx.trim.addGeo(new THREE.SphereGeometry(0.5, 10, 8), 0, -S.keel, Z(0.5), 0, 0.2 * k, 0.17 * k, 1.5 * k, C('#1b232c'));
    fin(ctx, -b.draft - 0.7 * k, -b.draft + 0.1, Z(0.052), Z(0.088), Z(0.04), Z(0.1), 0.025, 0.04, C('#26313d'));
    // standing rigging: mast, spreaders, shrouds, stays
    const zm = Z(0.54), yTop = S.mast, yBase = yD + ch, sp = S.spread;
    tube(ctx.chrome, [0, yBase - 0.2, zm], [0, yTop, zm], 0.062 * k, K.light, 8);
    tube(ctx.chrome, [0, yBase, zm], [0, yBase + 0.5 * k, zm], 0.09 * k, K.light, 8);
    for (const f of [0.42, 0.72]) {
      const yy = lerp(yBase, yTop, f), sw = (f < 0.5 ? 1.0 : 0.62) * k * 0.95;
      for (const s of [1, -1]) tube(ctx.chrome, [0, yy, zm], [s * sw, yy + 0.12, zm - 0.1 * k], 0.02, K.light, 5);
    }
    const chain = (s, z) => [s * (gw(0.54) - 0.08), dY(0.54), z];
    for (const s of [1, -1]) {
      tube(ctx.chrome, chain(s, zm), [s * 0.95 * k, lerp(yBase, yTop, 0.42) + 0.12, zm - 0.1 * k], 0.011, K.light, 4);
      tube(ctx.chrome, [s * 0.95 * k, lerp(yBase, yTop, 0.42) + 0.12, zm - 0.1 * k], [s * 0.62 * k, lerp(yBase, yTop, 0.72) + 0.12, zm - 0.1 * k], 0.011, K.light, 4);
      tube(ctx.chrome, [s * 0.62 * k, lerp(yBase, yTop, 0.72) + 0.12, zm - 0.1 * k], [0, yTop - 0.3, zm], 0.011, K.light, 4);
      tube(ctx.chrome, chain(s, zm - 0.6 * k), [s * 0.95 * k, lerp(yBase, yTop, 0.42) + 0.12, zm - 0.1 * k], 0.011, K.light, 4);
    }
    tube(ctx.chrome, [0, dY(0.985) + 0.18, Z(0.985)], [0, yTop - 0.3, zm + 0.04], 0.012, K.light, 4);
    tube(ctx.chrome, [0, yTop - 0.3, zm], [0, dY(0.02) + 0.1, Z(0.015)], 0.011, K.light, 4);
    lamp(ctx.lights, 0, 0, yTop + 0.12, zm, 0.1, 0.08, 0.1, K.white);
    lamp(ctx.lights, 1, 0.75 * k, dY(0.12) + 0.6, Z(0.12), 0.06, 0.06, 0.06, C('#5a0f0f'));
    lamp(ctx.lights, 0, 0, dY(0.01) + 0.52, Z(0.012), 0.07, 0.06, 0.06, K.white);
    const boomY = yD + ch + 0.78 * k;
    return {
      H, F, seat: { x: 0, y: fl + 0.02, z: wz - 0.55, pose: 'helm' }, eye: { x: 0, y: fl + 1.62, z: wz - 0.62 },
      rig: [
        { type: 'wheel', x: 0, y: wy, z: wz, tilt: 0.32, scale: 2.1 },
        { type: 'sails', x: 0, y: boomY, z: zm - 0.12, foot: 4.1 * k, luff: yTop - 0.7 - boomY, boomLen: 4.25 * k, color: '#f3f0e6', jib: { x: 0, y: dY(0.96) + 0.28, z: Z(0.96), hx: 0, hy: yTop - 1.1, hz: zm + 0.05, foot: 3.9 * k } },
      ],
      exhaust: [[0.28 * k, F.ys(0) - 0.35, Z(0) - 0.02]], bow: L / 2 - 0.3, stern: -L / 2, prop: [0, -b.draft - 0.1, Z(0.1)], inboard: true, sail: true,
    };
  };

  const dinghy = (ctx, def) => {
    const b = def.body, L = b.L, S = def.perf.sail, W = b.W;
    const H = { L, W, draft: b.draft, fbS: 0.4, fbB: 0.64, beamT: 0.48, bowExp: 1.6, bowRound: 0.85, sternW: 0.78, keelT: 0.5, keelPow: 2, flare: 0.1, sheerSag: 0.03, sheerPow: 2, round: true };
    const F = hullBuild(ctx, H, { anti: C('#2a3340'), boot: K.white });
    const gw = (t) => F.hw(t) * (1 + H.flare * smoothstep(0.3, 1, t));
    const Z = (t) => -L / 2 + t * L, dY = (t) => F.ys(t) + 0.02, fl = 0.13;
    const wallIn = (t) => Math.max(0.05, gw(t) - 0.17);
    sideDeck(ctx.trim, F, 0.02, 0.8, gw, wallIn, dY, K.light, 12);
    deckBand(ctx.trim, F, 0.8, 0.995, gw, dY, K.light, 4);
    deckBand(ctx.trim, F, 0.04, 0.8, wallIn, () => fl, K.cream, 12);
    for (const s of [1, -1]) for (let i = 0; i < 12; i++) {
      const t0 = lerp(0.04, 0.8, i / 12), t1 = lerp(0.04, 0.8, (i + 1) / 12);
      quadN(ctx.trim, [s * wallIn(t0), fl, Z(t0)], [s * wallIn(t1), fl, Z(t1)], [s * wallIn(t1), dY(t1), Z(t1)], [s * wallIn(t0), dY(t0), Z(t0)], K.liner, [-s, 0, 0]);
    }
    quadN(ctx.trim, [wallIn(0.04), fl, Z(0.04)], [-wallIn(0.04), fl, Z(0.04)], [-wallIn(0.04), dY(0.04), Z(0.04)], [wallIn(0.04), dY(0.04), Z(0.04)], K.liner, [0, 0, 1]);
    // thwarts, centreboard case, hiking straps
    bx(ctx.trim, 0, 0.34, Z(0.3), wallIn(0.3) * 2, 0.04, 0.32, K.teak);
    bx(ctx.trim, 0, 0.36, Z(0.66), wallIn(0.66) * 2, 0.04, 0.3, K.teak);
    bx(ctx.trim, 0, 0.28, Z(0.46), 0.06, 0.32, 1.0, K.dark);
    fin(ctx, -S.keel, -b.draft + 0.04, Z(0.44), Z(0.5), Z(0.42), Z(0.52), 0.012, 0.02, C('#2a3340'));
    fin(ctx, -b.draft - 0.55, -b.draft + 0.15, Z(0.0) - 0.16, Z(0.0) - 0.04, Z(0.0) - 0.18, Z(0.0) - 0.02, 0.012, 0.016, C('#2a3340'));
    for (const s of [1, -1]) tube(ctx.trim, [s * wallIn(0.4), fl + 0.04, Z(0.35)], [s * wallIn(0.4), fl + 0.04, Z(0.58)], 0.012, K.dark, 4);
    // mast, stays
    const zm = Z(0.31), yTop = S.mast;
    tube(ctx.chrome, [0, dY(0.31), zm], [0, yTop, zm], 0.04, K.light, 6);
    for (const s of [1, -1]) tube(ctx.chrome, [s * (gw(0.31) - 0.04), dY(0.31), zm - 0.05], [0, yTop - 0.4, zm], 0.008, K.light, 3);
    tube(ctx.chrome, [0, dY(0.99) + 0.05, Z(0.99)], [0, yTop - 0.4, zm + 0.02], 0.009, K.light, 3);
    lamp(ctx.lights, 0, 0, yTop + 0.08, zm, 0.06, 0.05, 0.06, K.white);
    const boomY = 0.95;
    return {
      H, F, seat: { x: 0, y: fl + 0.18, z: Z(0.2), pose: 'drive' }, eye: { x: 0, y: fl + 1.0, z: Z(0.2) },
      rig: [
        { type: 'tiller', x: 0, y: 0.42, z: Z(0) - 0.02, len: 1.15 },
        { type: 'sails', x: 0, y: boomY, z: zm - 0.06, foot: 2.7, luff: yTop - 0.35 - boomY, boomLen: 2.8, color: '#f3f0e6', jib: { x: 0, y: dY(0.97) + 0.05, z: Z(0.97), hx: 0, hy: yTop - 0.7, hz: zm + 0.04, foot: 2.2 } },
      ],
      exhaust: [], bow: L / 2 - 0.2, stern: -L / 2, prop: [0, -0.2, Z(0) - 0.1], sail: true,
    };
  };

  return { sloop, dinghy };
}
