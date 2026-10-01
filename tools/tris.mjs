import { launch } from './harness.mjs';
const { page, close } = await launch({ width: 1280, height: 720 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const spots = JSON.parse(process.env.SPOTS || '[[-271.5,230,3.14],[0,-60,0],[420,60,1.57]]');
for (const [x, z, yaw] of spots) {
  const r = await page.evaluate(({ x, z, yaw }) => {
    const g = window.__game, v = g.player.vehicle, T = window.__THREE;
    v.place(x, g.world.groundY(x, z, 60), z, yaw); g.rig.snapBehind();
    for (let i = 0; i < 90; i++) g.update(1 / 60);
    g.camera.updateMatrixWorld(); const fr = new T.Frustum(); fr.setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(g.camera.projectionMatrix, g.camera.matrixWorldInverse));
    const cat = {}; let total = 0, calls = 0;
    const add = (name, t) => { cat[name] = (cat[name] || 0) + t; total += t; calls++; };
    g.scene.traverse((o) => {
      if (!o.isMesh && !o.isLineSegments && !o.isPoints) return;
      let p = o, vis = true; while (p) { if (!p.visible) { vis = false; break; } p = p.parent; }
      if (!vis) return;
      const geo = o.geometry; if (!geo) return;
      if (o.frustumCulled && !o.isInstancedMesh) { if (!geo.boundingSphere) geo.computeBoundingSphere(); const s = geo.boundingSphere.clone().applyMatrix4(o.matrixWorld); if (!fr.intersectsSphere(s)) return; }
      const per = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
      let n = per * (o.isInstancedMesh ? o.count : 1); if (o.isInstancedMesh && o.count === 0) return;
      let name = 'other';
      const wg = g.world;
      if (o.userData.mat) name = 'store:' + o.userData.mat;
      else if (wg.terrain.group && wg.terrain.group.children.includes(o)) name = 'terrain';
      else if (o.parent === wg.veg.group) name = 'veg';
      else if (o.parent === wg.props.group) name = 'props';
      else if (o.parent === g.traffic.batch.group) name = 'cars';
      else if (o === g.sky.dome) name = 'sky';
      else if (o.isInstancedMesh) name = 'inst:' + (o.material.name || o.constructor.name);
      else if (o.parent === g.scene) name = 'scene-other';
      add(name, n);
    });
    const list = Object.entries(cat).sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, v]) => k + ' ' + Math.round(v / 1000) + 'k');
    return { at: [x, z], totalMainK: Math.round(total / 1000), visibleMeshes: calls, top: list };
  }, { x, z, yaw });
  console.log(JSON.stringify(r));
}
await close(); process.exit(0);
