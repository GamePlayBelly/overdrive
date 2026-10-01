def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:90])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)


OLD = s = open('src/vehicles/aiDriver.js', encoding='utf8').read()
a = s.index('  cornerSpeed() {')
b = s.index('function simplify')
NEW = '''  cornerSpeed() {
    const v = this.v, P = this.path, pi = this.pi;
    let dist = 0, vmax = this.maxSpeed;
    const lat = 7.5 * (0.8 + this.skill * 0.4);
    for (let i = Math.max(1, pi - 1); i < P.length - 1 && dist < 80; i++) {
      const b = P[i];
      if (i >= pi) dist += Math.hypot(b.x - (i === pi ? v.x : P[i - 1].x), b.z - (i === pi ? v.z : P[i - 1].z));
      let j = i - 1, k = i + 1;
      while (j > 0 && Math.hypot(b.x - P[j].x, b.z - P[j].z) < 6) j--;
      while (k < P.length - 1 && Math.hypot(P[k].x - b.x, P[k].z - b.z) < 6) k++;
      const a = P[j], c = P[k];
      const turn = Math.abs(wrapAngle(Math.atan2(c.x - b.x, c.z - b.z) - Math.atan2(b.x - a.x, b.z - a.z)));
      if (turn > 0.1) {
        const len = (Math.hypot(b.x - a.x, b.z - a.z) + Math.hypot(c.x - b.x, c.z - b.z)) / 2;
        const radius = Math.max(4, Math.min(len, 24) / turn);
        const vt = Math.sqrt(radius * lat);
        vmax = Math.min(vmax, Math.sqrt(vt * vt + 2 * 6.5 * dist));
      }
    }
    return vmax;
  }
}

'''
s = s[:a] + NEW + s[b:]
open('src/vehicles/aiDriver.js', 'w', encoding='utf8').write(s)
print('ok')
