import { launch } from './harness.mjs';
const { page, close } = await launch({ width: 1280, height: 720 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const spots = JSON.parse(process.env.SPOTS || '[[-271.5,230,3.14],[-800,-100,1.57],[420,60,1.57]]');
for (const [x, z, yaw] of spots) {
  const out = await page.evaluate(({ x, z, yaw }) => {
    window.__pauseLoop = true;
    const g = window.__game, R = g.renderer, v = g.player.vehicle;
    g.gov.enabled = false;
    v.place(x, g.world.groundY(x, z, 60), z, yaw); g.rig.snapBehind(); for (let i = 0; i < 60; i++) g.update(1 / 60);
    g.sky.sun.castShadow = false;
    g.render(); const total = R.info.render.triangles;
    const res = { total, parts: [] };
    const kids = g.scene.children.filter((c) => c.visible);
    for (const k of kids) {
      k.visible = false; g.render(); const t = R.info.render.triangles; k.visible = true;
      const d = total - t;
      if (d > 2000) res.parts.push([(k.name || k.type) + ':' + k.children.length, d]);
    }
    // world group children
    const wg = g.world.group; const sub = [];
    for (const k of wg.children.filter((c) => c.visible)) { k.visible = false; g.render(); const t = R.info.render.triangles; k.visible = true; const d = total - t; if (d > 4000) sub.push([(k.name || k.type) + ':' + (k.material?.name || k.material?.type || '') + ':' + (k.geometry?.index ? k.geometry.index.count / 3 : '?'), d]); }
    res.parts.sort((a, b) => b[1] - a[1]); sub.sort((a, b) => b[1] - a[1]);
    res.worldGroup = sub.slice(0, 14);
    return res;
  }, { x, z, yaw });
  console.log(JSON.stringify({ at: [x, z], total: out.total }));
  for (const p of out.parts.slice(0, 12)) console.log('  ', p[0], p[1]);
  console.log('  world group:'); for (const p of out.worldGroup) console.log('    ', p[0], p[1]);
}
await close(); process.exit(0);
