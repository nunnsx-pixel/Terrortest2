// Captura frames determinísticos da cena 3D com Chromium + WebGL por software.
// Uso: node renderizar.cjs --part 1 --from 0 --to 1800 --fps 30 --w 1080 --h 1920 --out /pasta [--times 0.3,5.2] [--png]
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const part = +(args.part || 1), fps = +(args.fps || 30), W = +(args.w || 1080), H = +(args.h || 1920);
const outDir = args.out || '/tmp/frames'; fs.mkdirSync(outDir, { recursive: true });
const ROOT = path.join(__dirname, 'cena');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.mjs': 'text/javascript' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(ROOT, u === '/' ? 'index.html' : u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
(async () => {
  await new Promise((r) => server.listen(0, r)); const port = server.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
  page.on('console', (m) => { const t = m.text(); if (!/GPU stall|ReadPixels|WebGL: INVALID_OPERATION: texImage|deprecated/i.test(t)) console.log('[page]', t); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://localhost:${port}/index.html?part=${part}&w=${W}&h=${H}`);
  await page.waitForFunction('window.ready===true', { timeout: 300000 });
  console.log('pronto'); 
  const times = args.times ? String(args.times).split(',').map(Number) : null;
  const ext = args.png ? 'png' : 'jpg';
  const list = times ? times.map((t) => ({ t, name: `t${String(t).replace('.', '_')}` })) : Array.from({ length: (+args.to) - (+args.from || 0) }, (_, i) => { const n = (+args.from || 0) + i; return { t: n / fps, name: `f${String(n).padStart(5, '0')}`, n }; });
  const t0 = Date.now(); let k = 0;
  for (const it of list) {
    const file = path.join(outDir, `${it.name}.${ext}`);
    if (!times && !args.force && fs.existsSync(file) && fs.statSync(file).size > 1000) continue;
    const data = await page.evaluate(({ part, t, png, q }) => window.renderAt(part, t, { q }), { part, t: it.t, png: !!args.png, q: 0.93 });
    fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
    k++; if (k % 10 === 0 || times) console.log(`${it.name} (${((Date.now() - t0) / k / 1000).toFixed(2)} s/frame)`);
  }
  console.log('info', JSON.stringify(await page.evaluate('window.info()')));
  await browser.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
