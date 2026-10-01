import { launch } from './harness.mjs';
const { page, close } = await launch({ width: 1280, height: 720 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const out = await page.evaluate(async () => {
  window.__pauseLoop = true;
  const THREE = window.__THREE;
  const g = window.__game, R = g.renderer, gl = R.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'), P = g.pipeline;
  const time = async (fn, n = 7) => {
    const res = [];
    for (let i = 0; i < n; i++) {
      const q = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q); fn(); gl.endQuery(ext.TIME_ELAPSED_EXT);
      let k = 0;
      while (k++ < 200) { await new Promise((r) => setTimeout(r, 4)); if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) { if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) res.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); break; } }
      gl.deleteQuery(q);
    }
    res.sort((a, b) => a - b);
    return res.length ? +res[Math.floor(res.length / 2)].toFixed(2) : -1;
  };
  g.gov.enabled = false;
  const v = g.player.vehicle, x = -271.5, z = 230;
  v.place(x, g.world.groundY(x, z, 60), z, 3.14); g.rig.snapBehind(); for (let i = 0; i < 60; i++) g.update(1 / 60);
  const res = {};
  const mk = (type, format, samples, depth, resolveDepth) => { const t = new THREE.WebGLRenderTarget(1280, 720, { type, format, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: depth, samples, generateMipmaps: false }); t.texture.colorSpace = THREE.LinearSRGBColorSpace; t.resolveDepthBuffer = resolveDepth; return t; };
  const variants = {
    'half s2 depthResolve': mk(THREE.HalfFloatType, THREE.RGBAFormat, 2, true, true),
    'half s2 noDepthResolve': mk(THREE.HalfFloatType, THREE.RGBAFormat, 2, true, false),
    'half s4 noDepthResolve': mk(THREE.HalfFloatType, THREE.RGBAFormat, 4, true, false),
    'r11g11b10 s2 noDepthResolve': mk(THREE.UnsignedInt101111Type, THREE.RGBFormat, 2, true, false),
    'r11g11b10 s4 noDepthResolve': mk(THREE.UnsignedInt101111Type, THREE.RGBFormat, 4, true, false),
    'rgba8 s2 noDepthResolve': mk(THREE.UnsignedByteType, THREE.RGBAFormat, 2, true, false),
  };
  const kids = g.scene.children.map((c) => c.visible);
  for (const [name, rt] of Object.entries(variants)) {
    g.scene.children.forEach((c) => { c.visible = false; });
    const empty = await time(() => { R.setRenderTarget(rt); R.render(g.scene, g.camera); });
    g.scene.children.forEach((c, i) => { c.visible = kids[i]; });
    const tm = R.toneMapping; R.toneMapping = THREE.NoToneMapping;
    const full = await time(() => { R.setRenderTarget(rt); R.render(g.scene, g.camera); });
    R.toneMapping = tm;
    res[name] = { empty, full };
    rt.dispose();
  }
  return res;
});
for (const [k, v] of Object.entries(out)) console.log(k, JSON.stringify(v));
await close(); process.exit(0);
