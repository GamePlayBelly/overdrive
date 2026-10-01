def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:70])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)

patch('server.mjs', [
("""  if (url.pathname.startsWith('/api/')) return;
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';""",
"""  if (url.pathname.startsWith('/api/')) return;
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  // /w/<path>: same file with the bare 'three' specifiers made absolute, because import maps do not apply inside workers
  const asWorker = p.startsWith('/w/');
  if (asWorker) p = p.slice(2);"""),
("""    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);""",
"""    const headers = { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' };
    if (asWorker && path.extname(file) === '.js') {
      fs.readFile(file, 'utf8', (e2, src) => {
        if (e2) { res.writeHead(500).end(); return; }
        res.writeHead(200, headers).end(src.replace(/(from\s*|import\s*\(\s*|import\s+)(['"])three(\/addons\/)?/g, (m, a, q, ad) => a + q + (ad ? '/node_modules/three/examples/jsm/' : '/node_modules/three/build/three.module.js')));
      });
      return;
    }
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);"""),
])
patch('src/world/textures.js', [
("""export function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}""",
"""export function canvas(w, h = w) {
  if (typeof document === 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}"""),
])
