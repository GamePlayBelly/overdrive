// Loading screen animation: runs in a worker on an OffscreenCanvas so it stays smooth while the main thread builds the world.
// A small car drives through a parallax city; press SPACE / click / tap to jump the obstacles.
let cv, ctx, W = 1280, H = 720, DPR = 1;
let running = false, last = 0, T = 0;
const S = { progress: 0, shown: 0, jumpReq: 0, hue: 0, score: 0, best: 0, combo: 0, msgT: 0, hit: 0, shake: 0, speed: 0, target: 1, mx: 0.5, my: 0.5, pulse: 0, hint: 4, done: false, cover: 0 };
let seed = 1337;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

const car = { x: 0.3, y: 0, vy: 0, air: false, rot: 0, bounce: 0, bounceV: 0, wheel: 0, w: 210, h: 62, nitro: 0, honk: 0, wheelie: 0 };
let obstacles = [], coins = [], puffs = [], sparks = [], buildings = [[], []], trees = [], mount = [], stars = [], pops = [];
let dashOff = 0;

function init() {
  seed = 4242;
  buildings = [[], []];
  for (let L = 0; L < 2; L++) {
    let x = -100;
    while (x < W * 2.2) {
      const w = 60 + rnd() * 110, h = (L ? 140 : 220) + rnd() * (L ? 200 : 260);
      buildings[L].push({ x, w, h, win: Math.floor(rnd() * 3), seed: rnd(), roof: rnd() < 0.25 ? 1 : rnd() < 0.2 ? 2 : 0 });
      x += w + (L ? 6 : 14) + rnd() * 20;
    }
  }
  mount = [];
  let mx = -200;
  while (mx < W * 2.4) { const w = 260 + rnd() * 380; mount.push({ x: mx, w, h: 90 + rnd() * 150 }); mx += w * 0.55; }
  trees = [];
  let tx = 0;
  while (tx < W * 2.4) { trees.push({ x: tx, s: 0.7 + rnd() * 0.7, kind: rnd() < 0.3 ? 1 : 0 }); tx += 140 + rnd() * 260; }
  stars = Array.from({ length: 120 }, () => ({ x: rnd(), y: rnd() * 0.5, s: 0.5 + rnd() * 1.4, t: rnd() * 6 }));
}

function resize(w, h, dpr) {
  W = w; H = h; DPR = dpr;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  init();
}

const skyStops = [
  [0.00, [11, 14, 24], [40, 30, 44]],
  [0.25, [18, 34, 62], [172, 104, 78]],
  [0.50, [22, 52, 92], [96, 138, 178]],
  [0.75, [30, 26, 54], [186, 92, 66]],
  [1.00, [11, 14, 24], [40, 30, 44]],
];
function skyAt(t) {
  let a = skyStops[0], b = skyStops[1];
  for (let i = 0; i < skyStops.length - 1; i++) if (t >= skyStops[i][0] && t <= skyStops[i + 1][0]) { a = skyStops[i]; b = skyStops[i + 1]; }
  const k = (t - a[0]) / (b[0] - a[0] || 1), l = (x, y) => x.map((v, i) => Math.round(v + (y[i] - v) * k));
  return { top: l(a[1], b[1]), hor: l(a[2], b[2]) };
}
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const roundRect = (x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };

function spawnObstacle() {
  const k = rnd();
  const kind = k < 0.4 ? 'cone' : k < 0.72 ? 'crate' : k < 0.9 ? 'barrier' : 'tire';
  const dims = { cone: [26, 40], crate: [46, 46], barrier: [78, 36], tire: [38, 38] }[kind];
  obstacles.push({ x: W + 60, w: dims[0], h: dims[1], kind, hit: false, passed: false, rot: 0, vx: 0 });
  if (rnd() < 0.55) for (let i = 0; i < 3; i++) coins.push({ x: W + 60 + 30 + i * 46, y: 96 + i * 14 - (i === 1 ? 14 : 0) + (kind === 'barrier' ? 20 : 0), got: false, ph: rnd() * 6 });
}

function update(dt) {
  T += dt;
  S.shown += (S.progress - S.shown) * Math.min(1, dt * 3.2);
  S.speed += ((S.done ? 0.1 : 1) - S.speed) * Math.min(1, dt * 2);
  S.shake *= Math.exp(-dt * 6); S.hit = Math.max(0, S.hit - dt); S.pulse *= Math.exp(-dt * 4); S.hint = Math.max(0, S.hint - dt * (S.jumps ? 4 : 0.15));
  car.honk = Math.max(0, car.honk - dt);
  const base = 380 + S.shown * 140;
  const speed = (S.hit > 0 ? base * 0.45 : base) * S.speed * (1 + car.nitro * 0.6);
  car.nitro = Math.max(0, car.nitro - dt);
  dashOff = (dashOff + speed * dt) % 120;
  // car physics
  const ground = 0;
  if (S.jumpReq > 0 && !car.air && S.hit <= 0) { car.vy = 760; car.air = true; car.bounceV -= 60; S.jumps = (S.jumps || 0) + 1; S.pulse = 1; for (let i = 0; i < 8; i++) puffs.push({ x: car.x * W - 90, y: 6, vx: -speed * 0.3 - rnd() * 80, vy: 20 + rnd() * 50, r: 6 + rnd() * 6, a: 0.7, dark: 0 }); }
  S.jumpReq = Math.max(0, S.jumpReq - dt);
  if (car.air) {
    car.vy -= 2200 * dt; car.y += car.vy * dt;
    car.rot += (-car.vy / 4200 - car.rot) * Math.min(1, dt * 6);
    if (car.y <= ground) { car.y = 0; car.vy = 0; car.air = false; car.bounceV += 260; for (let i = 0; i < 10; i++) puffs.push({ x: car.x * W - 60 + rnd() * 120, y: 4, vx: -speed * 0.15 - rnd() * 90, vy: 20 + rnd() * 60, r: 5 + rnd() * 7, a: 0.6, dark: 0 }); }
  } else car.rot += (0 - car.rot) * Math.min(1, dt * 8);
  car.bounceV += (-car.bounce * 190 - car.bounceV * 11) * dt; car.bounce += car.bounceV * dt;
  if (!car.air) car.bounce += Math.sin(T * 34) * 0.05;
  car.wheel += (speed / 26) * dt;
  // obstacles
  S.nextObs = (S.nextObs ?? 1.2) - dt * S.speed;
  if (S.nextObs <= 0 && S.speed > 0.5) { spawnObstacle(); S.nextObs = 1.1 + rnd() * 1.6; }
  const cx = car.x * W;
  for (const o of obstacles) {
    o.x -= (speed + o.vx) * dt; if (o.hit) { o.vx += 900 * dt; o.rot += 10 * dt; }
    if (!o.hit && !o.passed && o.x + o.w / 2 > cx - car.w * 0.42 && o.x - o.w / 2 < cx + car.w * 0.46) {
      if (car.y < o.h - 4) { o.hit = true; S.hit = 0.9; S.shake = 1; S.combo = 0; car.bounceV += 500; car.nitro = 0; for (let i = 0; i < 14; i++) sparks.push({ x: o.x, y: 20 + rnd() * 30, vx: -rnd() * 300 - 40, vy: 100 + rnd() * 300, l: 0.5 + rnd() * 0.4 }); pops.push({ x: cx + 40, y: 130, t: 0, text: 'Oops', c: '#e5383b' }); }
    }
    if (!o.passed && !o.hit && o.x + o.w / 2 < cx - car.w * 0.5) { o.passed = true; S.combo++; S.score += 10 * Math.min(5, S.combo); S.best = Math.max(S.best, S.score); pops.push({ x: cx, y: 150, t: 0, text: S.combo > 2 ? `+${10 * Math.min(5, S.combo)} x${Math.min(5, S.combo)}` : '+10', c: '#ffffff' }); }
  }
  obstacles = obstacles.filter((o) => o.x > -200);
  for (const c of coins) { c.x -= speed * dt; if (!c.got && Math.abs(c.x - cx) < 60 && car.y + 30 > c.y - 20 && car.y < c.y + 60) { c.got = true; S.score += 5; S.best = Math.max(S.best, S.score); car.nitro = Math.min(2, car.nitro + 0.35); pops.push({ x: c.x, y: c.y + 30, t: 0, text: '+5', c: '#d6a935' }); } }
  coins = coins.filter((c) => c.x > -60 && !c.got);
  // exhaust
  if (rnd() < dt * 40 * S.speed) puffs.push({ x: cx - car.w * 0.5 - 8, y: 16 + car.y, vx: -speed * 0.25 - rnd() * 60, vy: 12 + rnd() * 26, r: 3 + rnd() * 4, a: 0.35, dark: 1 });
  if (car.nitro > 0.02) puffs.push({ x: cx - car.w * 0.5 - 10, y: 18 + car.y, vx: -speed * 0.6, vy: (rnd() - 0.5) * 40, r: 6 + rnd() * 5, a: 0.8, dark: 2 });
  for (const p of puffs) { p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * 16; p.a -= dt * 0.9; p.vy *= 0.98; }
  puffs = puffs.filter((p) => p.a > 0.01);
  for (const s of sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy -= 900 * dt; s.l -= dt; }
  sparks = sparks.filter((s) => s.l > 0 && s.y > -10);
  for (const p of pops) p.t += dt;
  pops = pops.filter((p) => p.t < 1.1);
}

function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const cyc = (T / 70) % 1, sk = skyAt(cyc), night = cyc < 0.12 || cyc > 0.9 ? 1 : cyc < 0.25 ? 1 - (cyc - 0.12) / 0.13 : cyc > 0.72 ? (cyc - 0.72) / 0.18 : 0;
  const px = (S.mx - 0.5) * 24, py = (S.my - 0.5) * 10;
  const gy = H * 0.74; // road top edge
  ctx.save();
  if (S.shake > 0.01) ctx.translate((rnd() - 0.5) * 8 * S.shake, (rnd() - 0.5) * 6 * S.shake);
  // sky
  const g = ctx.createLinearGradient(0, 0, 0, gy);
  g.addColorStop(0, rgb(sk.top)); g.addColorStop(1, rgb(sk.hor));
  ctx.fillStyle = g; ctx.fillRect(-20, -20, W + 40, gy + 20);
  // stars
  if (night > 0.02) for (const s of stars) { ctx.globalAlpha = night * (0.4 + 0.6 * Math.abs(Math.sin(T * 1.3 + s.t))); ctx.fillStyle = '#dfe8ff'; ctx.fillRect(s.x * W, s.y * gy, s.s, s.s); }
  ctx.globalAlpha = 1;
  // sun / moon
  const sa = cyc * Math.PI * 2 - Math.PI / 2;
  const sx = W * 0.5 + Math.cos(sa) * W * 0.46, sy = gy * 0.95 - Math.sin(sa) * gy * 0.85;
  const sunA = Math.max(0, Math.min(1, 1 - night));
  if (sunA > 0.02) { const rg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 160); rg.addColorStop(0, `rgba(255,220,170,${0.75 * sunA})`); rg.addColorStop(1, 'rgba(255,200,140,0)'); ctx.fillStyle = rg; ctx.fillRect(sx - 170, sy - 170, 340, 340); ctx.fillStyle = `rgba(255,236,200,${sunA})`; ctx.beginPath(); ctx.arc(sx, sy, 22, 0, 7); ctx.fill(); }
  if (night > 0.05) { const ma = sa + Math.PI, mx2 = W * 0.5 + Math.cos(ma) * W * 0.46, my2 = gy * 0.95 - Math.sin(ma) * gy * 0.85; ctx.fillStyle = `rgba(228,236,255,${night * 0.9})`; ctx.beginPath(); ctx.arc(mx2, my2, 16, 0, 7); ctx.fill(); ctx.fillStyle = `rgba(20,30,50,${night * 0.35})`; ctx.beginPath(); ctx.arc(mx2 + 5, my2 - 3, 13, 0, 7); ctx.fill(); }
  // mountains
  const mo = (T * 14 * S.speed) % (W * 2.4);
  ctx.fillStyle = rgb(sk.hor.map((v, i) => v * 0.45 + sk.top[i] * 0.3 + 8), 1);
  ctx.beginPath(); ctx.moveTo(-50, gy);
  for (const m of mount) { const x = m.x - mo + px * 0.3; for (const o of [0, W * 2.4]) { const xx = x + o; if (xx > -m.w && xx < W + m.w) { ctx.lineTo(xx, gy); ctx.lineTo(xx + m.w * 0.5, gy - m.h + py * 0.3); ctx.lineTo(xx + m.w, gy); } } }
  ctx.lineTo(W + 50, gy); ctx.closePath(); ctx.fill();
  // skyline layers
  for (let L = 0; L < 2; L++) {
    const off = (T * (L ? 130 : 46) * S.speed) % (W * 2.2 + 200), par = L ? 1 : 0.5;
    const fog = L ? 0.0 : 0.35;
    ctx.fillStyle = rgb(sk.top.map((v, i) => Math.round(v * (L ? 0.32 : 0.5) + sk.hor[i] * fog * 0.4 + 6)));
    for (const b of buildings[L]) {
      let x = b.x - off + px * par; if (x < -b.w - 10) x += W * 2.2 + 200; if (x > W + 10) continue;
      const bh = b.h;
      ctx.fillRect(x, gy - bh + py * par * 0.3, b.w, bh);
      if (b.roof === 1) { ctx.fillRect(x + b.w * 0.3, gy - bh - 26 + py * par * 0.3, 3, 26); }
      if (b.roof === 2) { ctx.fillRect(x + b.w * 0.15, gy - bh - 12 + py * par * 0.3, b.w * 0.7, 12); }
      // lit windows at night
      const wa = Math.max(night, L ? 0.15 : 0.05);
      ctx.fillStyle = `rgba(255,214,140,${wa * (L ? 0.85 : 0.5)})`;
      const cols = Math.floor(b.w / 14), rows = Math.floor(bh / 18);
      for (let r = 1; r < rows; r++) for (let c2 = 0; c2 < cols; c2++) { const h = Math.sin((r * 12.9898 + c2 * 78.233 + b.seed * 43758) * 1.7) * 0.5 + 0.5; if (h > 0.55 && (Math.floor(T * 0.2 + h * 9) + r + c2) % 9 !== 0) ctx.fillRect(x + 5 + c2 * 14, gy - bh + py * par * 0.3 + r * 18 - 8, 6, 8); }
      ctx.fillStyle = rgb(sk.top.map((v, i) => Math.round(v * (L ? 0.32 : 0.5) + sk.hor[i] * fog * 0.4 + 6)));
    }
  }
  // trees
  const to = (T * 300 * S.speed) % (W * 2.4);
  for (const t of trees) { const x = t.x - to + px * 1.4; for (const o of [0, W * 2.4]) { const xx = x + o; if (xx < -80 || xx > W + 80) continue; const h = 70 * t.s; ctx.fillStyle = '#0f151a'; ctx.fillRect(xx - 3, gy - h * 0.5, 6, h * 0.5 + 6); ctx.beginPath(); if (t.kind) { ctx.moveTo(xx, gy - h - 24); ctx.lineTo(xx + 26 * t.s, gy - h * 0.35); ctx.lineTo(xx - 26 * t.s, gy - h * 0.35); } else ctx.arc(xx, gy - h * 0.75, 30 * t.s, 0, 7); ctx.fill(); } }
  ctx.restore();
  // road
  const ry = gy;
  const rg2 = ctx.createLinearGradient(0, ry, 0, H);
  rg2.addColorStop(0, '#1b1e23'); rg2.addColorStop(0.5, '#15181c'); rg2.addColorStop(1, '#0b0d10');
  ctx.fillStyle = rg2; ctx.fillRect(0, ry, W, H - ry);
  ctx.fillStyle = '#2b3037'; ctx.fillRect(0, ry, W, 3);
  ctx.fillStyle = '#3a4048'; ctx.fillRect(0, ry + 3, W, 2);
  const laneY = ry + (H - ry) * 0.5;
  ctx.fillStyle = 'rgba(235,238,242,0.75)';
  for (let x = -dashOff; x < W + 120; x += 120) ctx.fillRect(x, laneY - 3, 64, 6);
  ctx.fillStyle = 'rgba(214,169,53,0.7)'; ctx.fillRect(0, ry + 14, W, 3);
  // ground reference y for car wheels
  const wy = ry + (H - ry) * 0.36;
  // obstacles
  for (const o of obstacles) drawObstacle(o, wy);
  for (const c of coins) { const yy = wy - c.y - Math.sin(T * 5 + c.ph) * 4; ctx.save(); ctx.translate(c.x, yy); ctx.scale(Math.abs(Math.cos(T * 4 + c.ph)) * 0.7 + 0.3, 1); ctx.fillStyle = '#d6a935'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, 7); ctx.fill(); ctx.fillStyle = '#f2d477'; ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, 7); ctx.fill(); ctx.restore(); }
  drawCar(wy, night);
  for (const p of puffs) { ctx.globalAlpha = Math.max(0, p.a); ctx.fillStyle = p.dark === 2 ? '#7bb7ff' : p.dark ? '#8a9099' : '#c9ced4'; ctx.beginPath(); ctx.arc(p.x, wy - p.y, p.r, 0, 7); ctx.fill(); }
  ctx.globalAlpha = 1;
  for (const s of sparks) { ctx.fillStyle = '#ffd27a'; ctx.fillRect(s.x, wy - s.y, 3, 3); }
  ctx.font = '700 22px system-ui,sans-serif'; ctx.textAlign = 'center';
  for (const p of pops) { ctx.globalAlpha = Math.max(0, 1 - p.t / 1.1); ctx.fillStyle = p.c; ctx.fillText(p.text, p.x, wy - p.y - p.t * 60); }
  ctx.globalAlpha = 1;
  // vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  // score
  ctx.textAlign = 'right'; ctx.font = '600 13px system-ui,sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.55)';
  if (S.jumps) ctx.fillText(`SCORE ${S.score}   BEST ${S.best}   COMBO x${Math.max(1, Math.min(5, S.combo))}`, W - 26, 34);
}

function drawObstacle(o, wy) {
  ctx.save(); ctx.translate(o.x, wy); ctx.rotate(-o.rot);
  const w = o.w, h = o.h;
  if (o.kind === 'cone') { ctx.fillStyle = '#e8641c'; ctx.beginPath(); ctx.moveTo(-w / 2 + 3, 0); ctx.lineTo(w / 2 - 3, 0); ctx.lineTo(3, -h); ctx.lineTo(-3, -h); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#f4f4f2'; ctx.fillRect(-w * 0.28, -h * 0.5, w * 0.56, 6); ctx.fillStyle = '#c9541a'; ctx.fillRect(-w / 2, -3, w, 5); }
  else if (o.kind === 'crate') { ctx.fillStyle = '#8a6a42'; ctx.fillRect(-w / 2, -h, w, h); ctx.strokeStyle = '#5c4529'; ctx.lineWidth = 3; ctx.strokeRect(-w / 2 + 2, -h + 2, w - 4, h - 4); ctx.beginPath(); ctx.moveTo(-w / 2, -h); ctx.lineTo(w / 2, 0); ctx.moveTo(w / 2, -h); ctx.lineTo(-w / 2, 0); ctx.stroke(); }
  else if (o.kind === 'barrier') { ctx.fillStyle = '#d8dce0'; ctx.fillRect(-w / 2, -h, w, h * 0.6); for (let i = 0; i < 5; i++) { ctx.fillStyle = i % 2 ? '#d8dce0' : '#e5383b'; ctx.beginPath(); ctx.moveTo(-w / 2 + i * (w / 5), -h); ctx.lineTo(-w / 2 + (i + 1) * (w / 5), -h); ctx.lineTo(-w / 2 + (i + 1) * (w / 5) - 8, -h * 0.4); ctx.lineTo(-w / 2 + i * (w / 5) - 8, -h * 0.4); ctx.fill(); } ctx.fillStyle = '#4a5058'; ctx.fillRect(-w / 2 + 6, -h * 0.4, 5, h * 0.4); ctx.fillRect(w / 2 - 11, -h * 0.4, 5, h * 0.4); }
  else { ctx.fillStyle = '#16181b'; ctx.beginPath(); ctx.arc(0, -h / 2, h / 2, 0, 7); ctx.fill(); ctx.fillStyle = '#2a2d31'; ctx.beginPath(); ctx.arc(0, -h / 2, h * 0.22, 0, 7); ctx.fill(); }
  ctx.restore();
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(o.x, wy + 2, o.w * 0.55, 4, 0, 0, 7); ctx.fill();
}

function drawCar(wy, night) {
  const cx = car.x * W, w = car.w, h = car.h;
  const lift = car.y, sq = car.bounce;
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(cx, wy + 2, w * 0.5 * (1 - Math.min(0.5, lift / 500)), 7, 0, 0, 7); ctx.fill();
  ctx.save();
  ctx.translate(cx, wy - lift);
  ctx.rotate(car.rot * 0.55 + (S.hit > 0 ? Math.sin(T * 40) * 0.03 : 0));
  // headlight beam
  if (night > 0.1) { const bg = ctx.createLinearGradient(w * 0.46, 0, w * 0.46 + 420, 0); bg.addColorStop(0, `rgba(255,236,190,${0.42 * night})`); bg.addColorStop(1, 'rgba(255,236,190,0)'); ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(w * 0.47, -30); ctx.lineTo(w * 0.47 + 420, -70); ctx.lineTo(w * 0.47 + 420, 30); ctx.lineTo(w * 0.47, -22); ctx.fill(); }
  // wheels
  const wr = 22, wxs = [-w * 0.3, w * 0.31];
  for (const wx of wxs) {
    const wyy = -wr + sq * 0.15;
    ctx.save(); ctx.translate(wx, wyy);
    ctx.fillStyle = '#0d0e10'; ctx.beginPath(); ctx.arc(0, 0, wr, 0, 7); ctx.fill();
    ctx.fillStyle = '#b9bec4'; ctx.beginPath(); ctx.arc(0, 0, wr * 0.62, 0, 7); ctx.fill();
    ctx.rotate(car.wheel);
    ctx.strokeStyle = '#4b5057'; ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) { ctx.rotate((Math.PI * 2) / 5); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(wr * 0.6, 0); ctx.stroke(); }
    ctx.fillStyle = '#2a2d31'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, 7); ctx.fill();
    ctx.restore();
  }
  // body
  const by = -wr * 0.9 - 6 + sq * 0.35;
  ctx.fillStyle = '#b5232a';
  ctx.beginPath();
  ctx.moveTo(-w * 0.5, by - 2);
  ctx.quadraticCurveTo(-w * 0.52, by - 24, -w * 0.44, by - 30);
  ctx.lineTo(-w * 0.26, by - 34);
  ctx.quadraticCurveTo(-w * 0.14, by - 62, w * 0.02, by - 62);
  ctx.lineTo(w * 0.14, by - 62);
  ctx.quadraticCurveTo(w * 0.26, by - 60, w * 0.33, by - 36);
  ctx.lineTo(w * 0.47, by - 26);
  ctx.quadraticCurveTo(w * 0.53, by - 20, w * 0.52, by - 2);
  ctx.lineTo(w * 0.5, by + 10); ctx.lineTo(-w * 0.5, by + 10); ctx.closePath(); ctx.fill();
  // lower shade
  const bgd = ctx.createLinearGradient(0, by - 30, 0, by + 10); bgd.addColorStop(0, 'rgba(255,255,255,0.16)'); bgd.addColorStop(0.55, 'rgba(0,0,0,0)'); bgd.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = bgd; ctx.fill();
  // windows
  ctx.fillStyle = '#10151b';
  ctx.beginPath(); ctx.moveTo(-w * 0.22, by - 36); ctx.quadraticCurveTo(-w * 0.12, by - 58, 0, by - 58); ctx.lineTo(w * 0.13, by - 58); ctx.quadraticCurveTo(w * 0.24, by - 56, w * 0.29, by - 37); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(160,190,230,0.28)'; ctx.beginPath(); ctx.moveTo(-w * 0.15, by - 40); ctx.lineTo(-w * 0.07, by - 55); ctx.lineTo(w * 0.0, by - 55); ctx.lineTo(-w * 0.09, by - 40); ctx.fill();
  ctx.fillStyle = '#7a1519'; ctx.fillRect(-w * 0.06, by - 58, 3, 24);
  // door line + handle
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-w * 0.06, by - 32); ctx.lineTo(-w * 0.06, by + 8); ctx.moveTo(w * 0.2, by - 32); ctx.lineTo(w * 0.2, by + 8); ctx.stroke();
  ctx.fillStyle = '#d6dadf'; ctx.fillRect(-w * 0.02, by - 22, 14, 3);
  // arches
  ctx.fillStyle = '#0a0b0d';
  for (const wx of wxs) { ctx.beginPath(); ctx.arc(wx, -wr + sq * 0.15, wr + 5, Math.PI, 0); ctx.fill(); }
  // wheels again on top (front of arch)
  for (const wx of wxs) { const wyy = -wr + sq * 0.15; ctx.save(); ctx.translate(wx, wyy); ctx.fillStyle = '#0d0e10'; ctx.beginPath(); ctx.arc(0, 0, wr, 0, 7); ctx.fill(); ctx.fillStyle = '#c3c8ce'; ctx.beginPath(); ctx.arc(0, 0, wr * 0.6, 0, 7); ctx.fill(); ctx.rotate(car.wheel); ctx.strokeStyle = '#3f444a'; ctx.lineWidth = 3; for (let i = 0; i < 5; i++) { ctx.rotate((Math.PI * 2) / 5); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(wr * 0.58, 0); ctx.stroke(); } ctx.fillStyle = '#1e2124'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, 7); ctx.fill(); ctx.restore(); }
  // lights
  ctx.fillStyle = '#fff3d0'; ctx.beginPath(); ctx.ellipse(w * 0.49, by - 14, 7, 5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = car.honk > 0 ? '#ff5a5a' : '#8a1116'; ctx.fillRect(-w * 0.5, by - 18, 6, 9);
  if (S.hit <= 0 && car.nitro > 0.02) { ctx.fillStyle = 'rgba(120,180,255,0.9)'; ctx.beginPath(); ctx.moveTo(-w * 0.5, by + 2); ctx.lineTo(-w * 0.5 - 40 - Math.random() * 24, by + 4); ctx.lineTo(-w * 0.5, by + 8); ctx.fill(); }
  ctx.restore();
}

function loop(now) {
  if (!running) return;
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
  update(dt); draw();
  requestAnimationFrame(loop);
}

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') {
    cv = m.canvas; ctx = cv.getContext('2d', { alpha: false });
    resize(m.w, m.h, m.dpr);
    running = true; last = performance.now(); requestAnimationFrame(loop);
  } else if (m.type === 'resize') resize(m.w, m.h, m.dpr);
  else if (m.type === 'progress') { S.progress = m.p; }
  else if (m.type === 'jump') { S.jumpReq = 0.14; }
  else if (m.type === 'honk') { car.honk = 0.4; S.pulse = 1; car.bounceV += 120; }
  else if (m.type === 'nitro') { car.nitro = 1.2; }
  else if (m.type === 'mouse') { S.mx = m.x; S.my = m.y; }
  else if (m.type === 'done') S.done = true;
  else if (m.type === 'stop') running = false;
};
