// Fists: hit the nearest pedestrian in front of the player, with stagger, knock-out, blood and a crime report.
const R = 1.9;

export class Combat {
  constructor(game) {
    this.g = game;
    game.on('player:punch', (e) => this.punch(e));
  }

  blood(x, y, z, dx, dz, n, big) {
    const pt = this.g.fx.pt;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = 1.2 + Math.random() * (big ? 4 : 2.4);
      pt.emit({ x, y, z, vx: dx * s + Math.cos(a) * s * 0.5, vy: 1 + Math.random() * 2.2, vz: dz * s + Math.sin(a) * s * 0.5, life: 0.5 + Math.random() * 0.5, s0: 0.05 + Math.random() * 0.05, s1: 0.03, c0: [0.45, 0.02, 0.03, 0.95], c1: [0.25, 0.01, 0.02, 0.8], drag: 0.4, grav: 11, kind: 0 });
    }
  }

  pool(p) {
    const pt = this.g.fx.pt;
    for (let i = 0; i < 6; i++) pt.emit({ x: p.x + (Math.random() - 0.5) * 0.5, y: p.y + 0.04, z: p.z + (Math.random() - 0.5) * 0.5, vx: 0, vy: 0, vz: 0, life: 40, s0: 0.1, s1: 0.45 + Math.random() * 0.3, c0: [0.3, 0.015, 0.02, 0.85], c1: [0.2, 0.01, 0.015, 0.7], drag: 0, grav: 0, kind: 0, spin: 0 });
  }

  punch(e) {
    const g = this.g, fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
    let best = null, bd = R;
    for (const p of g.peds.list) {
      if (p.state === 'ragdoll' || p.gone) continue;
      const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz);
      if (d > bd || Math.abs(p.y - e.y) > 1.5) continue;
      if ((dx * fx + dz * fz) / (d || 1) < 0.35) continue;
      bd = d; best = p;
    }
    g.audio.play?.('thud', { vol: best ? 0.9 : 0.35, pos: { x: e.x + fx, y: 1.2, z: e.z + fz }, rate: best ? 1.1 : 1.6 });
    if (!best) return;
    const p = best;
    p.hp = (p.hp ?? 3) - 1 - (e.n === 2 ? 1 : 0);
    g.rig.addShake(0.35);
    this.blood(p.x, p.y + 1.45, p.z, fx, fz, 10, false);
    g.audio.play?.(p.look.female ? 'scream_f' : 'scream_m', { vol: 0.6, pos: { x: p.x, y: 1.6, z: p.z }, bus: 'voice', refDist: 6 });
    g.police.crime('assault', p.x, p.z, 1);
    if (p.hp > 0) { p.state = 'flee'; p.stay = false; p.panic = 7; p.yaw = Math.atan2(fx, fz); p.x += fx * 0.35; p.z += fz * 0.35; return; }
    p.state = 'ragdoll'; p.cross = null; p.onRoad = false; p.umbrella = false; p.stay = false;
    p.rv = { x: fx * 4.2, y: 2.4, z: fz * 4.2 };
    p.y += 0.95; p.rot = { pitch: 0, roll: 0 };
    p.spin = { pitch: -3.2, roll: (Math.random() - 0.5) * 2, yaw: (Math.random() - 0.5) * 2 };
    p.yaw = Math.atan2(-fx, -fz);
    p.rag = { t: 0, bounces: 0, settled: false, sev: 1, lie: 0 };
    p.downT = 12; p.fatal = false;
    this.blood(p.x, p.y + 0.6, p.z, fx, fz, 22, true);
    setTimeout(() => this.pool(p), 900);
    g.emit('ped:scared', { p, v: g.player });
  }
}
