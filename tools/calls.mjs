import { launch } from './harness.mjs';
const { page, close } = await launch({ width: 1280, height: 720 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const spots = JSON.parse(process.env.SPOTS || '[[0,-60,0],[-800,-100,1.57],[420,60,1.57]]');
for (const [x, z, yaw] of spots) {
  const out = await page.evaluate(({ x, z, yaw }) => {
    const g = window.__game, w = g.world, v = g.player.vehicle, R = g.renderer, B = w.store.batches;
    v.place(x, w.groundY(x, z, 60), z, yaw); g.rig.snapBehind(); for (let i = 0; i < 100; i++) g.update(1 / 60);
    const count = () => { g.render(1 / 60); return R.info.render.calls; };
    window.__tri = () => R.info.render.triangles;
    const base = count();
    const vis = (objs, val) => (Array.isArray(objs) ? objs : [objs]).forEach((o) => (o.visible = val));
    const groups = { terrain: w.terrain.group, veg: w.veg.group, props: w.props.group, carBatch: g.traffic.batch.group, cast: B.cast, ground: B.ground, decal: B.decal, proxy: w.store.proxyBM, peds: Object.values(g.peds.renderer.meshes), hero: g.vehicles.map((q) => q.group), contact: g.contact.mesh, sky: g.sky.dome };
    const res = { base };
    for (const [n, o] of Object.entries(groups)) { vis(o, false); res[n] = base - count(); vis(o, true); }
    let specials = 0; w.store.list.forEach((c) => c.specials.forEach((s) => s.mesh.visible && specials++)); res.storeSpecialsVisible = specials;
    return res;
  }, { x, z, yaw });
  console.log(JSON.stringify({ at: [x, z], ...out }));
}
await close(); process.exit(0);
