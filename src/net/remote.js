import * as THREE from 'three';
import { createCarMesh } from '../vehicles/carMesh.js';
import { buildHuman, poseFor, applyPose, blendPose, REST } from '../actors/human.js';
import { VEHICLE_BY_ID } from '../data/vehicles.js';
import { MISSIONS } from '../data/missions.js';
import { wrapAngle } from '../core/math.js';

// Other players as interpolated ghost vehicles with name tags, plus the multiplayer lobby modes (race, co-op, police vs drivers).
function nameTag(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.font = '600 28px Barlow Condensed, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  const w = Math.min(244, x.measureText(text).width + 28);
  x.fillStyle = 'rgba(10,12,16,0.72)'; x.beginPath(); x.roundRect((256 - w) / 2, 8, w, 48, 12); x.fill();
  x.fillStyle = '#fff'; x.fillText(text, 128, 33);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
  s.scale.set(2.2, 0.55, 1); s.renderOrder = 6;
  return s;
}

export class RemotePlayers {
  constructor(app) {
    this.app = app; this.g = app.game; this.list = new Map();
    app.net.on('lobbyStart', (m) => this.onLobbyStart(m));
    app.net.on('raceResults', (r) => this.onResults(r));
    app.net.on('disconnect', () => this.clear());
    this.role = null;
  }

  clear() { for (const r of this.list.values()) this.remove(r); this.list.clear(); }
  remove(r) { this.g.scene.remove(r.group); r.car?.mats.paint?.dispose?.(); }

  // a player on foot: their own avatar (fetched once from the server), walking, running and jumping with their real speed
  spawnHuman(p) {
    const looks = (this.looks ||= new Map());
    const r = { id: p.id, human: true, def: VEHICLE_BY_ID.civa, group: new THREE.Group(), x: p.x, y: p.y, z: p.z, yaw: p.yaw, phase: 0, t: 0, pose: { ...REST }, model: p.model, foot: true };
    const build = (look) => {
      if (r.rig) r.group.remove(r.rig.root);
      r.rig = buildHuman(look);
      r.rig.root.rotation.order = 'YXZ'; r.rig.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
      r.group.add(r.rig.root);
    };
    build(looks.get(p.id) || undefined);
    const tag = nameTag(p.name || 'Player'); tag.position.set(0, 2.15, 0); r.group.add(tag); r.tag = tag;
    if (!looks.has(p.id)) { looks.set(p.id, null); this.app.net.request('player.look', { id: p.id }).then((res) => { if (res.ok && res.look) { looks.set(p.id, res.look); try { build(res.look); } catch (e) { console.warn('remote look', e); } } else looks.delete(p.id); }); }
    this.g.scene.add(r.group);
    return r;
  }

  spawn(p) {
    if (p.foot) return this.spawnHuman(p);
    const def = VEHICLE_BY_ID[p.model] || VEHICLE_BY_ID.civa;
    const car = createCarMesh(def, { color: p.color || def.colors[0], doors: false });
    const group = car.group;
    const tag = nameTag(p.name || 'Player'); tag.position.set(0, def.body.H + 0.9, 0); group.add(tag);
    this.g.scene.add(group);
    return { id: p.id, def, car, group, tag, x: p.x, y: p.y, z: p.z, yaw: p.yaw, spin: 0, model: p.model };
  }

  update(dt) {
    const net = this.app.net;
    if (!net.connected) { if (this.list.size) this.clear(); return; }
    const cam = this.g.camera.position, now = performance.now();
    const near = [];
    for (const p of net.peers.values()) { const d = Math.hypot(p.x - cam.x, p.z - cam.z); if (d < 700) near.push([d, p]); }
    near.sort((a, b) => a[0] - b[0]);
    const keep = new Set();
    for (const [d, p] of near.slice(0, 8)) {
      keep.add(p.id);
      let r = this.list.get(p.id);
      if (r && (r.model !== p.model || r.foot !== !!p.foot)) { this.remove(r); this.list.delete(p.id); r = null; }
      if (!r) { r = this.spawn(p); this.list.set(p.id, r); }
      const k = Math.min(1, (now - p.t) / 100);
      const tx = p.px + (p.x - p.px) * k + Math.sin(p.yaw) * p.speed * Math.max(0, (now - p.t - 100) / 1000) * 0.6, tz = p.pz + (p.z - p.pz) * k + Math.cos(p.yaw) * p.speed * Math.max(0, (now - p.t - 100) / 1000) * 0.6;
      const f = 1 - Math.exp(-dt * 14);
      r.x += (tx - r.x) * f; r.z += (tz - r.z) * f; r.y += (p.y - r.y) * f;
      r.yaw += wrapAngle(p.yaw - r.yaw) * f;
      r.group.position.set(r.x, r.y, r.z); r.group.rotation.set(0, r.yaw, 0);
      r.speedNet = p.speed;
      if (r.human) {
        const sp = p.speed || 0, vy = p.py !== undefined ? (p.y - p.py) / 0.1 : 0;
        const anim = Math.abs(vy) > 1.4 && Math.abs(r.y - p.y) > 0.05 ? 'jump' : sp < 0.3 ? 'idle' : sp < 2.4 ? 'walk' : sp < 5 ? 'run' : 'sprint';
        r.t += dt; r.phase += (sp / (anim === 'walk' ? 1.45 : anim === 'run' ? 2.2 : 2.7)) * Math.PI * dt;
        blendPose(r.pose, poseFor(anim, r.t, r.phase, anim === 'walk' ? Math.min(1, sp / 1.5) : 1), 1 - Math.exp(-dt * 12), r.pose);
        applyPose(r.rig, r.pose);
      } else {
        r.spin += (p.speed / 0.33) * dt;
        for (const w of r.car.wheels) w.spin.rotation.x = r.spin;
      }
      r.tag.visible = d < 140;
      r.tag.material.opacity = Math.min(1, (140 - d) / 40);
      if (this.role === 'cop' && r.car?.mats.lights) r.car.mats.lights.userData.uBar?.value.set(Math.sin(now / 90) > 0 ? 1 : 0.1, Math.sin(now / 90) > 0 ? 0.1 : 1);
    }
    for (const [id, r] of this.list) if (!keep.has(id)) { this.remove(r); this.list.delete(id); }
  }

  // ---------------------------------------------------------------- lobby modes
  async onLobbyStart(m) {
    const app = this.app, g = this.g, me = app.net.you;
    const wait = Math.max(0, m.t0 - Date.now());
    app.hud.big('GET READY', m.mode === 'race' || m.mode === 'team' ? 'The race starts in a moment' : 'Lobby starting', '');
    let seed = m.seed >>> 0;
    const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    this.role = null;
    if (m.mode === 'race' || m.mode === 'team') {
      const R = g.world.roads, w = g.player.vehicle || g.player;
      const pts = []; let cur = R.nodes[Math.floor(rnd() * R.nodes.length)];
      for (let k = 0; k < 6; k++) {
        for (let t = 0; t < 100; t++) { const n = R.nodes[Math.floor(rnd() * R.nodes.length)]; const d = Math.hypot(n.x - cur.x, n.z - cur.z); if (d > 160 && d < 520 && Math.abs(n.y - g.world.terrain.height(n.x, n.z)) < 3) { cur = n; break; } }
        pts.push([cur.x, cur.z]);
      }
      const def = { id: 'mp_race', title: 'Online race', type: 'Racing', kind: 'online', steps: [{ t: 'checkpoints', race: false, pts, text: 'Race to the finish' }] };
      await app.fastTravel(pts[0][0], pts[0][1], 0);
      await new Promise((r) => setTimeout(r, Math.max(0, wait - 800)));
      app.missions.begin(def);
      void w;
    } else if (m.mode === 'coop') {
      await new Promise((r) => setTimeout(r, wait));
      const p = app.profile, next = MISSIONS.find((q) => !p.missions.done[q.id] && p.level >= (q.level || 1) && (q.requires || []).every((r) => p.missions.done[r])) || MISSIONS[0];
      app.startMission(next.id);
    } else if (m.mode === 'pvd') {
      const idx = m.players.indexOf(me?.id);
      this.role = idx % 2 === 0 ? 'cop' : 'driver';
      await new Promise((r) => setTimeout(r, wait));
      if (this.role === 'driver') { g.police.cooldown = 0; g.police.raise(3, 'lobby'); app.hud.say('Dispatch', 'Police vs Drivers: survive the pursuit to win.', 4500); }
      else app.hud.say('Dispatch', 'You are a cop: hunt down the drivers. Ram and stop them.', 4500);
    }
  }

  onResults(results) {
    const app = this.app;
    const list = results.map((r, i) => `${i + 1}. ${r.name}  ${(r.time || 0).toFixed(1)} s`).join('   ');
    app.hud.say('Results', list, 9000);
    app.hud.big('RACE OVER', results[0] ? `${results[0].name} wins` : '', 'green');
  }
}
