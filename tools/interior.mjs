import { launch, shot, sleep } from './harness.mjs';
// Walk up to a building, press E, look around the room, talk, take an item, and walk back out.
const { page, close, logs } = await launch({ width: 1100, height: 620 });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play', null, { timeout: 240000 });
const TYPE = process.env.TYPE || '';
const r = await page.evaluate(async (TYPE) => {
  const a = window.__app, g = window.__game, P = g.player, I = g.input, out = {};
  g.sky.time = 11; g.sky.lockWeather = 'sunny'; g.sky.setWeather('sunny', true);
  P.exit(); const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
  // find a building near downtown
  let found = null;
  for (const [x, z] of [[40, -60], [-120, 40], [150, 80], [-300, 100], [400, 100], [60, 400], [-600, 100], [-250, 220]]) {
    P.place(x, z, 0); P.y = g.world.groundY(x, z, 60);
    for (let yaw = 0; yaw < 6.3 && !found; yaw += 0.8) {
      for (let k = 0; k < 4 && !found; k++) {
        P.place(x + Math.sin(yaw) * k * -1.5, z + Math.cos(yaw) * k * -1.5, yaw); P.y = g.world.groundY(P.x, P.z, 60);
        const d = a.interiors.doorway();
        if (d && (!TYPE || d.type === TYPE)) found = d;
      }
    }
    if (found) break;
  }
  out.found = found && { type: found.type, name: found.name };
  if (!found) return out;
  await a.interiors.enter(found);
  out.inside = !!a.interiors.inside; out.pos = [P.x - 6000, P.y - 200, P.z - 6000];
  for (let i = 0; i < 30; i++) { g.update(1 / 60); a.interiors.update(1 / 60); }
  g.render(1 / 60); out.img1 = g.canvas.toDataURL('image/jpeg', 0.85);
  const R = a.interiors.inside, npc = R.npcs[0];
  P.place(npc.x, npc.z - 1.5, 0); P.y = 200; for (let i = 0; i < 10; i++) g.update(1 / 60);
  a.interiors.update(1 / 60); out.prompt = a.interiors.prompt;
  g.render(1 / 60); out.img2 = g.canvas.toDataURL('image/jpeg', 0.85);
  const it = R.items[0]; P.place(it.x, it.z - 0.8, 0); P.y = 200; a.interiors.update(1 / 60); out.itemPrompt = a.interiors.prompt;
  const m0 = a.profile.money; a.interiors.take(it); out.gain = a.profile.money - m0;
  P.place(6000, 6000.8, 0); P.y = 200; a.interiors.update(1 / 60); out.doorPrompt = a.interiors.prompt;
  await a.interiors.leave();
  out.inside2 = !!a.interiors.inside; out.pos2 = [P.x.toFixed(1), P.z.toFixed(1)];
  for (let i = 0; i < 20; i++) g.update(1 / 60);
  out.visible = g.world.group.visible;
  return out;
}, TYPE);
import fs from 'node:fs';
for (const k of ['img1', 'img2']) if (r[k]) { fs.writeFileSync(`data/shots/interior_${k}.jpg`, Buffer.from(r[k].split(',')[1], 'base64')); delete r[k]; }
console.log(JSON.stringify(r));
console.log('logs:', logs.filter((l) => !/getImageData/.test(l)).slice(0, 8).join('\n') || 'none');
await close(); process.exit(0);
