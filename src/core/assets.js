import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Optional external models. Drop .glb files into assets/models/ and list them in manifest.json; when one is present it replaces the
// generated model of the same id, otherwise the procedural model is used. See assets/README.md for the node naming rules.
class AssetLibrary {
  constructor() { this.models = new Map(); this.manifest = {}; this.ready = false; }

  async init(progress) {
    let manifest = null;
    try { const r = await fetch('./assets/models/manifest.json', { cache: 'no-cache' }); if (r.ok) manifest = await r.json(); } catch { /* no models folder */ }
    if (!manifest) { this.ready = true; return; }
    this.manifest = manifest;
    const loader = new GLTFLoader(), entries = Object.entries(manifest);
    let n = 0;
    await Promise.all(entries.map(async ([id, e]) => {
      try { const gltf = await loader.loadAsync('./assets/models/' + e.file); this.models.set(id, { gltf, e }); } catch (err) { console.warn('model failed to load:', id, err.message); }
      progress?.(++n / entries.length);
    }));
    this.ready = true;
  }

  has(id) { return this.models.has(id); }

  // a fresh copy of the scene graph (geometry shared, materials cloned so paint can be recoloured per vehicle)
  clone(id) {
    const m = this.models.get(id);
    if (!m) return null;
    const root = m.gltf.scene.clone(true);
    root.traverse((o) => { if (o.isMesh && o.material) { o.material = Array.isArray(o.material) ? o.material.map((q) => q.clone()) : o.material.clone(); o.castShadow = true; o.receiveShadow = true; } });
    return { root, e: m.e };
  }
}

export const Assets = new AssetLibrary();
