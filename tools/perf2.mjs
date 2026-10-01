import { launch, shot } from './harness.mjs';
const { page, close } = await launch({ width: Number(process.env.W || 1280), height: Number(process.env.H || 720) });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const spots = JSON.parse(process.env.SPOTS || '[[-271.5,230,3.14],[0,-60,0],[420,60,1.57],[-800,-100,1.57]]');
for (const [x, z, yaw] of spots) {
  const r = await page.evaluate(({ x, z, yaw }) => {
    const g = window.__game, v = g.player.vehicle, gl = g.renderer.getContext();
    v.place(x, g.world.groundY(x, z, 60), z, yaw); g.rig.snapBehind();
    for (let i = 0; i < 90; i++) g.update(1 / 60);
    const med = (a) => { a = a.slice().sort((p, q) => p - q); return +a[Math.floor(a.length / 2)].toFixed(1); };
    const measure = (fn, n = 8) => { const t = []; for (let i = 0; i < n; i++) { const t0 = performance.now(); fn(); t.push(performance.now() - t0); } return med(t); };
    const fin = () => gl.finish();
    const out = { at: [x, z] };
    out.update = measure(() => g.update(1 / 60));
    g.render(); fin();
    out.render = measure(() => { g.render(); fin(); });
    const info = g.renderer.info; out.tris = info.render.triangles; out.calls = info.render.calls;
    const w = g.world;
    const toggle = (name, obj) => { const old = obj.visible; obj.visible = false; out[name] = measure(() => { g.render(); fin(); }, 6); obj.visible = old; };
    toggle('noTerrain', w.terrainMesh); toggle('noVeg', w.veg.group); toggle('noProps', w.props.group);
    toggle('noCars', g.traffic.inst.group); toggle('noParked', g.traffic.pinst.group); toggle('noLow', g.traffic.linst.group);
    const chunkGroups = w.group.children.filter((c) => c.isMesh && c !== w.terrainMesh);
    const oldV = chunkGroups.map((c) => c.visible); chunkGroups.forEach((c) => (c.visible = false)); out.noWorldMeshes = measure(() => { g.render(); fin(); }, 6); chunkGroups.forEach((c, i) => (c.visible = oldV[i]));
    g.sky.sun.castShadow = false; out.noShadow = measure(() => { g.render(); fin(); }, 6); g.sky.sun.castShadow = true;
    const sc = g.scene; const kids = sc.children.map((c) => c.visible); sc.children.forEach((c) => { if (c !== g.sky.dome) c.visible = false; }); out.skyOnly = measure(() => { g.render(); fin(); }, 6); sc.children.forEach((c, i) => (c.visible = kids[i]));
    out.meshCount = w.group.children.length;
    return out;
  }, { x, z, yaw });
  console.log(JSON.stringify(r));
}
await close();
process.exit(0);
