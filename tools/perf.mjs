import { launch, shot, sleep } from './harness.mjs';
const W = Number(process.env.W || 1280), H = Number(process.env.H || 720);
const { page, close } = await launch({ width: W, height: H, fastFrames: !!process.env.FAST });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
await page.evaluate(() => {
  window.__gpuTime = (frames = 5) => {
    const g = window.__game, gl = g.renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const res = [];
    for (let i = 0; i < frames; i++) {
      const q = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      g.render();
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      gl.flush();
      const t0 = performance.now();
      while (performance.now() - t0 < 500) {
        if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) { if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) res.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); break; }
      }
      gl.deleteQuery(q);
    }
    res.sort((a, b) => a - b);
    return res.length ? +res[Math.floor(res.length / 2)].toFixed(2) : -1;
  };
});
const spots = JSON.parse(process.env.SPOTS || '[[-271.5,230,3.14],[0,-60,0],[420,60,1.57],[-55,-380,0],[-800,-100,1.57]]');
for (const [x, z, yaw] of spots) {
  const r = await page.evaluate(({ x, z, yaw }) => {
    const g = window.__game, v = g.player.vehicle;
    v.place(x, g.world.groundY(x, z, 60), z, yaw); g.rig.snapBehind();
    for (let i = 0; i < 90; i++) g.update(1 / 60);
    const out = { at: [x, z] };
    out.full = __gpuTime();
    const info = g.renderer.info; g.render(); out.tris = info.render.triangles; out.calls = info.render.calls;
    const w = g.world;
    const toggle = (name, obj) => { const old = obj.visible; obj.visible = false; out[name] = __gpuTime(); obj.visible = old; };
    toggle('noTerrain', w.terrainMesh); toggle('noVeg', w.veg.group); toggle('noProps', w.props.group);
    toggle('noCars', g.traffic.inst.group); toggle('noParked', g.traffic.pinst.group); toggle('noLow', g.traffic.linst.group);
    g.sky.sun.castShadow = false; out.noShadow = __gpuTime(); g.sky.sun.castShadow = true;
    let bl = 0; for (const c of w.group.children) if (c.isMesh && c.material && c.geometry && c !== w.terrainMesh) { }
    return out;
  }, { x, z, yaw });
  console.log(JSON.stringify(r));
}
const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(n / 3); }; requestAnimationFrame(f); }));
console.log('rAF fps (game loop running):', fps.toFixed(1));
await shot(page, 'perf');
await close();
process.exit(0);
