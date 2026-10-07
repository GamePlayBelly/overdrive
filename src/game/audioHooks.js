// Connects gameplay events to the audio system.
export function bindAudio(g) {
  const A = g.audio;
  const at = (e) => ({ x: e.x ?? e.v?.x, y: (e.y ?? e.v?.y ?? 0) + 0.5, z: e.z ?? e.v?.z });
  g.on('vehicle:crash', (e) => A.crash(e.impact, at(e), e.kind, e.mat));
  g.on('traffic:hit', (e) => A.crash(e.impact, { x: e.x, y: (e.car?.y ?? 0) + 0.6, z: e.z }, 'vehicle', 'metal'));
  g.on('vehicle:landing', (e) => {
    const p = { x: e.x, y: e.y, z: e.z };
    if (e.v.isBoat) { A.splash(p, e.speed > 3); return; }
    A.play('thud', { vol: Math.min(1, 0.25 + e.speed / 9), pos: p, rate: 0.85, refDist: 6 });
    if (e.speed > 4) A.play('crash_light', { vol: Math.min(0.7, e.speed / 14), pos: p, rate: 0.75, delay: 0.02, refDist: 6 });
  });
  g.on('vehicle:bump', (e) => { if (e.v.isBoat) { if (e.v === g.player.vehicle || e.impact > 3) A.splash(at(e), e.impact > 4); } else if (e.v === g.player.vehicle) A.play('thud', { vol: Math.min(0.5, e.impact * 0.08), pos: at(e), rate: 1.1, refDist: 5 }); });
  g.on('player:splash', (e) => A.splash({ x: e.x, y: e.y, z: e.z }, e.speed > 4));
  g.on('player:wade', (e) => A.play('splash', { vol: 0.1 + 0.03 * e.speed, rate: 1.3 + Math.random() * 0.4, pos: { x: e.x, y: e.y, z: e.z }, refDist: 3 }));
  g.on('police:radio', () => A.play('squelch', { vol: 0.25, bus: 'ui' }));
  g.on('marine:radio', () => A.play('squelch', { vol: 0.25, bus: 'ui' }));
  g.on('vehicle:door', (e) => A.door(!e.open, { x: e.v.x, y: e.v.y + 0.8, z: e.v.z }));
  g.on('vehicle:sunk', (e) => A.splash({ x: e.v.x, y: e.v.y, z: e.v.z }, true));
  g.on('player:entered', () => {});
  // on foot: jumping, landing from a height, vaulting and climbing
  const surfAt = (e) => g.world.terrain.surfAt(e.x, e.z);
  g.on('player:jump', (e) => A.footImpact(surfAt(e), { x: e.x, y: e.y, z: e.z }, e.speed || 0, 'jump'));
  g.on('player:landed', (e) => A.footImpact(surfAt(e), { x: e.x, y: e.y, z: e.z }, e.speed || 0, e.soft ? 'vault' : 'land'));
  g.on('player:mantle', (e) => A.footImpact(surfAt(e), { x: e.x, y: e.y, z: e.z }, 2, 'vault'));
  g.on('ped:bounce', (e) => A.play('bodyhit', { vol: Math.min(0.7, 0.15 + e.impact * 0.09), pos: { x: e.p.x, y: e.p.y, z: e.p.z }, rate: 0.9 + Math.random() * 0.3, refDist: 5 }));
  g.on('ped:hit', (e) => {
    const pos = { x: e.x, y: e.y, z: e.z };
    A.pedHit(pos, e.female, e.fatal);
    // bystanders react
    let n = 0;
    for (const q of g.peds.list) {
      if (q === e.p || n >= 3) continue;
      const d = Math.hypot(q.x - e.x, q.z - e.z);
      if (d < 32 && (q.state === 'flee' || q.state === 'watch') && Math.random() < 0.7) {
        n++;
        const delay = 0.25 + Math.random() * 1.4;
        A.play(q.look.female ? 'scream_f' : 'scream_m', { vol: 0.7, pos: { x: q.x, y: 1.6, z: q.z }, bus: 'voice', delay, refDist: 6, jitter: 0.12 });
      }
    }
  });
  g.on('ped:scared', (e) => { if (Math.random() < 0.35) A.shout({ x: e.p.x, y: 1.6, z: e.p.z }, e.p.look.female); });
}
