// Texturas 100% procedurais (canvas 2D). Nenhuma imagem externa é usada.
import * as THREE from 'three';
import { Rng, fbm2, noise2, clamp, lerp } from './util.js';

function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, { srgb = true, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}
function pix(w, h, fn) {
  const c = cv(w, h), g = c.getContext('2d'), im = g.createImageData(w, h), d = im.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4, r = fn(x, y);
    d[o] = r[0]; d[o + 1] = r[1]; d[o + 2] = r[2]; d[o + 3] = r[3] === undefined ? 255 : r[3];
  }
  g.putImageData(im, 0, 0);
  return c;
}
const rgb = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// ---------------------------------------------------------------- chão (calçada + asfalto)
// Cobre x∈[-8,8] (u) e 16 m em z (v), repete em z. Calçada com pedra portuguesa, faixa central amarela.
export function groundTextures() {
  const S = 1024, rng = new Rng(11);
  const albedo = pix(S, S, (x, y) => {
    const X = (x / S) * 16 - 8, Z = (y / S) * 16;
    const n = fbm2(X * 1.3, Z * 1.3, 4) * 0.5 + 0.5, g = fbm2(X * 14, Z * 14, 2) * 0.5 + 0.5;
    let col;
    const ax = Math.abs(X);
    if (ax > 4.5) {
      // pedra portuguesa: mosaico preto/branco em losangos
      const u = X * 9, v = Z * 9, cx = Math.floor(u + v), cy = Math.floor(u - v);
      const chk = (cx + cy) & 1, edge = Math.min(Math.abs(((u + v) % 1 + 1) % 1 - 0.5), Math.abs(((u - v) % 1 + 1) % 1 - 0.5));
      let b = chk ? 0.62 : 0.14; b = lerp(b, 0.07, edge < 0.06 ? 1 : 0); b *= 0.55 + 0.6 * g;
      col = [b * 255, b * 252, b * 245];
      if (ax > 4.5 && ax < 4.78) col = [0.45 * 255 * (0.8 + 0.3 * g), 0.45 * 255 * (0.8 + 0.3 * g), 0.45 * 255 * (0.8 + 0.3 * g)]; // meio-fio
    } else {
      let b = 0.085 + 0.055 * n + 0.07 * (g - 0.5);
      // remendos de asfalto novo
      const patch = fbm2(X * 0.35 + 9, Z * 0.35, 2);
      if (patch > 0.18) b *= 0.62;
      col = [b * 255 * 0.94, b * 255 * 0.98, b * 255 * 1.05];
      // faixa central amarela dupla (tracejada nas bordas)
      const dc = Math.abs(X);
      if ((dc > 0.12 && dc < 0.2) && fbm2(X * 30, Z * 30, 2) > -0.45) col = mix(col, [190, 150, 30], 0.82 * (0.5 + 0.5 * g));
      // faixa branca de pedestre desgastada em z ∈ [7.0, 8.4]
      if (Z > 7.0 && Z < 8.4 && Math.floor((X + 4.5) * 1.6) % 2 === 0 && fbm2(X * 24, Z * 24, 2) > -0.5) col = mix(col, [150, 150, 145], 0.7);
    }
    return col;
  });
  const ctx = albedo.getContext('2d');
  // rachaduras, manchas de óleo e poças escuras
  ctx.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    let x = rng.f(0, S), y = rng.f(0, S);
    ctx.strokeStyle = `rgba(5,5,6,${rng.f(0.3, 0.7)})`; ctx.lineWidth = rng.f(0.6, 2);
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < rng.i(4, 14); k++) { x += rng.f(-26, 26); y += rng.f(-26, 26); ctx.lineTo(x, y); }
    ctx.stroke();
  }
  for (let i = 0; i < 24; i++) {
    const x = rng.f(S * 0.28, S * 0.72), y = rng.f(0, S), r = rng.f(10, 34);
    const gr = ctx.createRadialGradient(x, y, 1, x, y, r); gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // máscara de poças (R): onde a rua está completamente espelhada
  const wet = pix(512, 512, (x, y) => {
    const X = (x / 512) * 16 - 8, Z = (y / 512) * 16;
    const n = fbm2(X * 0.55 + 4, Z * 0.55 + 2, 4) * 0.5 + 0.5;
    const puddle = clamp((n - 0.46) * 5.5, 0, 1);
    const base = Math.abs(X) > 4.5 ? 0.62 : 0.5; // calçada e rua molhadas
    const v = clamp(base + puddle * 0.5, 0, 1) * 255;
    return [v, v, v];
  });
  return { albedo: tex(albedo, { aniso: 16 }), wet: tex(wet, { srgb: false }) };
}

// ---------------------------------------------------------------- pichação paulistana (letras altas e angulosas)
function pixacao(ctx, x, y, w, h, color, rng) {
  ctx.strokeStyle = color; ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
  const letters = rng.i(4, 8), lw = w / letters;
  for (let i = 0; i < letters; i++) {
    const lx = x + i * lw + lw * 0.15, wd = lw * 0.55;
    ctx.lineWidth = Math.max(2, lw * 0.14);
    ctx.beginPath();
    const kind = rng.i(0, 4);
    ctx.moveTo(lx, y + h);
    if (kind === 0) { ctx.lineTo(lx, y); ctx.lineTo(lx + wd, y + h * 0.18); ctx.lineTo(lx + wd, y + h); }
    else if (kind === 1) { ctx.lineTo(lx + wd * 0.5, y); ctx.lineTo(lx + wd, y + h); ctx.moveTo(lx + wd * 0.2, y + h * 0.55); ctx.lineTo(lx + wd * 0.85, y + h * 0.55); }
    else if (kind === 2) { ctx.lineTo(lx, y + h * 0.1); ctx.lineTo(lx + wd, y); ctx.lineTo(lx + wd * 0.2, y + h * 0.5); ctx.lineTo(lx + wd, y + h); }
    else if (kind === 3) { ctx.lineTo(lx, y); ctx.moveTo(lx, y + h * 0.4); ctx.lineTo(lx + wd, y + h * 0.05); ctx.moveTo(lx, y + h * 0.4); ctx.lineTo(lx + wd, y + h); }
    else { ctx.lineTo(lx, y + h * 0.15); ctx.lineTo(lx + wd, y); ctx.lineTo(lx + wd, y + h); ctx.lineTo(lx, y + h * 0.7); }
    ctx.stroke();
  }
}
function tag(ctx, x, y, s, color, rng) {
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, s * 0.06); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(x, y);
  for (let i = 0; i < rng.i(6, 11); i++) ctx.bezierCurveTo(x + rng.f(-s, s), y + rng.f(-s * 0.5, s * 0.5), x + rng.f(-s, s), y + rng.f(-s * 0.6, s * 0.6), x += rng.f(s * 0.1, s * 0.4), y += rng.f(-s * 0.2, s * 0.2));
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth *= 0.45; ctx.stroke();
}

// ---------------------------------------------------------------- concreto (viaduto, pilares, murete)
export function concreteTexture(seed = 3, graffiti = true, w = 1024, h = 1024) {
  const rng = new Rng(seed);
  const c = pix(w, h, (x, y) => {
    const n = fbm2(x / 90, y / 90, 4) * 0.5 + 0.5, g = fbm2(x / 5, y / 5, 2) * 0.5 + 0.5;
    const streak = fbm2(x / 14, y / 400 + 7, 3) * 0.5 + 0.5; // escorrimento de chuva
    let b = 0.22 + 0.16 * n + 0.07 * g - 0.14 * streak * (y / h * 0.8 + 0.2);
    const f = Math.abs(((y / (h / 4)) % 1) - 0.5) > 0.495 ? 0.55 : 1; // juntas de forma
    b *= f;
    return [b * 255 * 0.98, b * 255 * 1.0, b * 255 * 0.97];
  });
  const g = c.getContext('2d');
  if (graffiti) {
    for (let i = 0; i < 6; i++) pixacao(g, rng.f(0, w * 0.85), rng.f(h * 0.12, h * 0.4), rng.f(w * 0.12, w * 0.3), rng.f(h * 0.14, h * 0.3), 'rgba(8,8,8,0.92)', rng);
    for (let i = 0; i < 5; i++) tag(g, rng.f(0, w), rng.f(h * 0.4, h * 0.9), rng.f(60, 150), rng.pick(['#d8d2c4', '#2a8f6a', '#c23b2e', '#e7b63a', '#3a6fb0', '#111']), rng);
  }
  return tex(c);
}

// ---------------------------------------------------------------- fachadas
export function facadeTextures(variant = 0, seed = 5) {
  const rng = new Rng(seed * 31 + variant);
  const W = 1024, H = 1024;
  const palette = [[196, 170, 128], [150, 160, 142], [176, 150, 140], [128, 136, 150], [200, 194, 176], [120, 100, 92]];
  const base = palette[variant % palette.length];
  const c = pix(W, H, (x, y) => {
    const n = fbm2(x / 70 + variant * 9, y / 70, 4) * 0.5 + 0.5, g = fbm2(x / 3, y / 3, 1) * 0.5 + 0.5;
    const streak = fbm2(x / 10 + 3, y / 300, 3) * 0.5 + 0.5;
    let k = (0.34 + 0.2 * n + 0.05 * g) * (1 - 0.3 * streak * (y / H * 0.6 + 0.3));
    return [base[0] * k, base[1] * k, base[2] * k];
  });
  const e = cv(W, H), eg = e.getContext('2d'); eg.fillStyle = '#000'; eg.fillRect(0, 0, W, H);
  const g = c.getContext('2d');
  const floors = 4, cols = 4, fh = H / floors, cw = W / cols;
  for (let f = 0; f < floors; f++) for (let k = 0; k < cols; k++) {
    const wx = k * cw + cw * 0.2, wy = f * fh + fh * 0.2, ww = cw * 0.6, wh = fh * 0.6;
    // moldura em relevo
    g.fillStyle = 'rgba(210,205,190,0.55)'; g.fillRect(wx - 7, wy - 7, ww + 14, wh + 14);
    // vidro
    const gr = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
    const lit = rng.r() < 0.1;
    gr.addColorStop(0, lit ? '#d9a35a' : '#0e1620'); gr.addColorStop(1, lit ? '#a8662a' : '#05080d');
    g.fillStyle = gr; g.fillRect(wx, wy, ww, wh);
    if (lit) { eg.fillStyle = `rgb(${rng.i(210, 255)},${rng.i(120, 170)},${rng.i(40, 80)})`; eg.fillRect(wx, wy, ww, wh); eg.fillStyle = '#000'; eg.fillRect(wx + ww * 0.4, wy, ww * 0.06, wh); }
    // venezianas / cortinas e grade
    g.strokeStyle = 'rgba(15,15,18,0.9)'; g.lineWidth = 5; g.strokeRect(wx, wy, ww, wh);
    g.lineWidth = 3; g.beginPath(); g.moveTo(wx + ww / 2, wy); g.lineTo(wx + ww / 2, wy + wh); g.moveTo(wx, wy + wh * 0.45); g.lineTo(wx + ww, wy + wh * 0.45); g.stroke();
    // parapeito/grade de sacada
    if (rng.r() < 0.55) { g.strokeStyle = 'rgba(20,20,22,0.95)'; g.lineWidth = 3; for (let q = 0; q <= 14; q++) { g.beginPath(); g.moveTo(wx + (q / 14) * ww, wy + wh * 0.72); g.lineTo(wx + (q / 14) * ww, wy + wh + 14); g.stroke(); } g.beginPath(); g.moveTo(wx, wy + wh * 0.72); g.lineTo(wx + ww, wy + wh * 0.72); g.stroke(); }
    // ar-condicionado
    if (rng.r() < 0.3) { g.fillStyle = '#c9c9c2'; g.fillRect(wx + ww * 0.55, wy + wh * 0.62, ww * 0.38, wh * 0.28); g.fillStyle = '#6c6c68'; g.fillRect(wx + ww * 0.58, wy + wh * 0.66, ww * 0.32, wh * 0.1); }
    // mancha de umidade abaixo da janela
    const st = g.createLinearGradient(0, wy + wh, 0, wy + wh + fh * 0.4); st.addColorStop(0, 'rgba(10,12,10,0.38)'); st.addColorStop(1, 'rgba(10,12,10,0)');
    g.fillStyle = st; g.fillRect(wx + 4, wy + wh, ww - 8, fh * 0.4);
  }
  // cornijas
  for (let f = 1; f < floors; f++) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, f * fh - 6, W, 5); g.fillStyle = 'rgba(220,215,200,0.25)'; g.fillRect(0, f * fh - 1, W, 4); }
  for (let i = 0; i < 2; i++) pixacao(g, rng.f(0, W * 0.8), rng.f(H * 0.7, H * 0.85), rng.f(160, 260), rng.f(120, 200), 'rgba(6,6,6,0.9)', rng);
  return { map: tex(c), emissive: tex(e) };
}

// ---------------------------------------------------------------- porta de aço de enrolar
export function shutterTexture(seed = 2, w = 512, h = 512, tags = true) {
  const rng = new Rng(seed);
  const c = pix(w, h, (x, y) => {
    const slat = (y % 14) / 14;
    const ridge = Math.sin(slat * Math.PI);
    const rust = fbm2(x / 40 + seed, y / 40, 3) * 0.5 + 0.5, g = fbm2(x / 2, y / 2, 1) * 0.5 + 0.5;
    let b = (0.22 + 0.26 * ridge) * (0.8 + 0.3 * g);
    let col = [b * 255 * 0.93, b * 255 * 0.97, b * 255 * 1.02];
    col = mix(col, [120, 70, 40], clamp((rust - 0.55) * 1.3, 0, 0.55));
    return col;
  });
  const g = c.getContext('2d');
  if (tags) {
    for (let i = 0; i < rng.i(2, 4); i++) tag(g, rng.f(0, w * 0.7), rng.f(h * 0.2, h * 0.9), rng.f(70, 170), rng.pick(['#e8e1cf', '#c23b2e', '#2a8f6a', '#e7b63a', '#111', '#3a6fb0']), rng);
    pixacao(g, rng.f(0, w * 0.5), rng.f(h * 0.1, h * 0.4), rng.f(110, 200), rng.f(100, 180), 'rgba(8,8,8,0.9)', rng);
  }
  return tex(c);
}

// ---------------------------------------------------------------- placas / letreiros
export function signTexture(text, { bg = '#14161a', fg = '#f4e6b0', w = 1024, h = 256, font = 'bold 150px "Arial Black", Arial, Helvetica, sans-serif', border = null, sub = null, glow = true } = {}) {
  const c = cv(w, h), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  const n = fbm2; // sujeira
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.2})`; g.fillRect(Math.random() * w, Math.random() * h, Math.random() * 30, Math.random() * 3); }
  if (border) { g.strokeStyle = border; g.lineWidth = 10; g.strokeRect(12, 12, w - 24, h - 24); }
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = fg; g.fillText(text, w / 2, sub ? h * 0.42 : h * 0.52);
  if (sub) { g.font = 'bold 54px Arial, Helvetica, sans-serif'; g.fillText(sub, w / 2, h * 0.82); }
  return tex(c, { repeat: false });
}

export function neonCrossTexture(color = '#38ff8a') {
  const c = cv(256, 256), g = c.getContext('2d');
  g.fillStyle = '#050806'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = color; const a = 70, b = 186;
  g.fillRect(a, 20, b - a, 216); g.fillRect(20, a, 216, b - a);
  g.fillStyle = '#050806'; g.fillRect(a + 14, 34, b - a - 28, 188); g.fillRect(34, a + 14, 188, b - a - 28);
  g.fillStyle = color; g.fillRect(a + 26, 46, b - a - 52, 164); g.fillRect(46, a + 26, 164, b - a - 52);
  return tex(c, { repeat: false });
}

// ---------------------------------------------------------------- granito polido (galeria)
export function graniteTexture(seed = 4) {
  const S = 1024;
  const c = pix(S, S, (x, y) => {
    const n = fbm2(x / 160, y / 160, 3) * 0.5 + 0.5;
    const spec = Math.random();
    let b = 0.2 + 0.12 * n;
    if (spec > 0.985) b = 0.62 + 0.3 * Math.random(); else if (spec > 0.94) b *= 0.5; else if (spec > 0.9) b *= 1.3;
    const v = fbm2(x / 55 + 40, y / 14, 3);
    if (Math.abs(v) < 0.025) b *= 1.45;
    const tile = 1024 / 4; // placas de 0,8 m (4 por textura de 3,2 m)
    const e = Math.min(x % tile, tile - (x % tile), y % tile, tile - (y % tile));
    if (e < 2) b *= 0.35;
    return [b * 255 * 0.97, b * 255 * 0.99, b * 255 * 1.02];
  });
  return tex(c, { aniso: 16 });
}

// ---------------------------------------------------------------- parede de galeria (azulejo/pastilha bege)
export function wallTileTexture() {
  const S = 512;
  const c = pix(S, S, (x, y) => {
    const n = fbm2(x / 40, y / 40, 3) * 0.5 + 0.5;
    let b = 0.52 + 0.13 * n;
    const gx = x % 64, gy = y % 64;
    if (gx < 2 || gy < 2) b *= 0.55;
    return [b * 215, b * 200, b * 170];
  });
  return tex(c);
}

// ---------------------------------------------------------------- forro com luminárias
export function ceilingTexture() {
  const S = 512;
  const c = pix(S, S, (x, y) => {
    const n = fbm2(x / 30, y / 30, 2) * 0.5 + 0.5;
    let b = 0.46 + 0.1 * n;
    const gx = x % 128, gy = y % 128;
    if (gx < 3 || gy < 3) b *= 0.45;
    return [b * 220, b * 215, b * 200];
  });
  return tex(c);
}

// ---------------------------------------------------------------- tecidos
export function plaidTexture(c1 = '#a3201f', c2 = '#0f0f12') {
  const S = 256, c = cv(S, S), g = c.getContext('2d');
  g.fillStyle = c1; g.fillRect(0, 0, S, S);
  g.fillStyle = c2; g.globalAlpha = 0.85;
  for (let i = 0; i < 4; i++) { g.fillRect(i * 64, 0, 24, S); g.fillRect(0, i * 64, S, 24); }
  g.globalAlpha = 1;
  const id = g.getImageData(0, 0, S, S), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 26; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(id, 0, 0);
  return tex(c);
}
export function denimTexture(base = '#9fb4c8') {
  const S = 256, c = pix(S, S, (x, y) => {
    const t = ((x + y) % 4 < 2 ? 1 : 0.88) * (0.88 + 0.2 * Math.random());
    const [r, g, b] = rgb(parseInt(base.slice(1), 16));
    return [r * t, g * t, b * t];
  });
  return tex(c);
}
export function suitTexture() {
  const S = 256, c = pix(S, S, (x, y) => {
    const pin = x % 18 < 2 ? 1.5 : 1, n = 0.8 + 0.2 * Math.random();
    return [34 * pin * n, 36 * pin * n, 44 * pin * n];
  });
  return tex(c);
}
export function solidCloth(hex, grain = 0.18) {
  const S = 128, c = pix(S, S, (x, y) => { const [r, g, b] = rgb(hex); const n = 1 - grain / 2 + grain * Math.random(); return [r * n, g * n, b * n]; });
  return tex(c);
}

// ---------------------------------------------------------------- pele / rosto
export function skinTexture({ tone = 0xd0a07c, zombie = 0, seed = 1, wounds = 0, w = 512, h = 512, face = false } = {}) {
  const rng = new Rng(seed);
  const base = rgb(tone), dead = [118, 128, 112];
  const c = pix(w, h, (x, y) => {
    const n = fbm2(x / 26, y / 26, 4) * 0.5 + 0.5, pore = Math.random();
    let col = mix(base, dead, zombie * 0.8);
    const k = 0.82 + 0.3 * n - 0.1 * pore;
    col = [col[0] * k, col[1] * k, col[2] * k];
    // veias escuras (zumbi)
    const v = Math.abs(fbm2(x / 30 + 11, y / 9, 3));
    if (zombie > 0 && v < 0.035) col = mix(col, [60, 40, 90], zombie * 0.55);
    return col;
  });
  const g = c.getContext('2d');
  for (let i = 0; i < wounds; i++) {
    const x = rng.f(0, w), y = rng.f(h * 0.2, h), r = rng.f(8, 40);
    const gr = g.createRadialGradient(x, y, 1, x, y, r); gr.addColorStop(0, 'rgba(60,4,6,0.95)'); gr.addColorStop(0.6, 'rgba(110,10,12,0.6)'); gr.addColorStop(1, 'rgba(110,10,12,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    g.strokeStyle = 'rgba(70,5,8,0.8)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rng.f(-6, 6), y + rng.f(20, 90)); g.stroke();
  }
  if (face) { // rosto de Lucas infectado: olheiras, sangue no queixo, bochecha dilacerada
    const cx = w * 0.25;
    for (const s of [-1, 1]) { const ex = cx + s * w * 0.072, ey = h * 0.42, r = w * 0.05; const gr = g.createRadialGradient(ex, ey, 1, ex, ey, r); gr.addColorStop(0, 'rgba(40,10,50,0.85)'); gr.addColorStop(1, 'rgba(40,10,50,0)'); g.fillStyle = gr; g.fillRect(ex - r, ey - r, r * 2, r * 2); }
    const gr2 = g.createRadialGradient(cx, h * 0.66, 1, cx, h * 0.66, w * 0.05); gr2.addColorStop(0, 'rgba(120,6,10,0.95)'); gr2.addColorStop(1, 'rgba(120,6,10,0)'); g.fillStyle = gr2; g.fillRect(cx - w * 0.05, h * 0.6, w * 0.1, h * 0.12);
    g.strokeStyle = 'rgba(105,5,9,0.9)'; g.lineCap = 'round'; for (let k = -2; k <= 2; k++) { g.lineWidth = w * (0.006 + 0.003 * ((k + 2) % 2)); g.beginPath(); g.moveTo(cx + k * w * 0.012, h * 0.68); g.lineTo(cx + k * w * 0.018 + 4, h * (0.76 + 0.03 * Math.abs(k))); g.stroke(); }
    const ex = cx + w * 0.078, ey = h * 0.535; const gr3 = g.createRadialGradient(ex, ey, 1, ex, ey, w * 0.05); gr3.addColorStop(0, 'rgba(40,0,4,1)'); gr3.addColorStop(0.55, 'rgba(120,12,16,0.9)'); gr3.addColorStop(1, 'rgba(150,60,60,0)'); g.fillStyle = gr3; g.beginPath(); g.ellipse(ex, ey, w * 0.045, h * 0.06, 0.4, 0, 6.3); g.fill();
    for (let k = 0; k < 16; k++) { g.fillStyle = `rgba(${rng.i(70, 120)},6,10,${rng.f(0.5, 0.9)})`; g.beginPath(); g.arc(cx + rng.gauss() * w * 0.07, h * 0.58 + rng.gauss() * h * 0.08, rng.f(1.5, 5), 0, 6.3); g.fill(); }
  }
  return tex(c);
}

// ---------------------------------------------------------------- sangue (decalque) e papéis
export function bloodDecal(seed = 9, w = 512, h = 512) {
  const rng = new Rng(seed), c = cv(w, h), g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) {
    const x = w / 2 + rng.gauss() * w * 0.16, y = h / 2 + rng.gauss() * h * 0.16, r = Math.abs(rng.gauss()) * 16 + 2;
    g.fillStyle = `rgba(${rng.i(60, 110)},${rng.i(2, 10)},${rng.i(4, 12)},${rng.f(0.7, 0.98)})`;
    g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill();
    if (rng.r() < 0.35) { g.strokeStyle = g.fillStyle; g.lineWidth = r * 0.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rng.f(-60, 60), y + rng.f(-60, 60)); g.stroke(); }
  }
  return tex(c, { repeat: false });
}

// sujeira da lente: borrões brilhantes ao redor de luzes fortes
export function lensDirtTexture() {
  const S = 512, c = cv(S, S), g = c.getContext('2d'), rng = new Rng(77);
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 160; i++) {
    const x = rng.f(0, S), y = rng.f(0, S), r = rng.f(4, 46) * (rng.r() < 0.1 ? 3 : 1);
    const gr = g.createRadialGradient(x, y, 0, x, y, r); const a = rng.f(0.06, 0.45);
    gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // digitais
  g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 2;
  for (let i = 0; i < 26; i++) { g.beginPath(); g.ellipse(120, 400, 20 + i * 3, 30 + i * 3.4, 0.4, 0, 6.3); g.stroke(); }
  return tex(c, { srgb: false, repeat: false });
}

// ---------------------------------------------------------------- ruído de relevo genérico (para normal/bump)
export function bumpNoise(size = 256, f = 24) {
  const c = pix(size, size, (x, y) => { const v = (fbm2(x / (size / f), y / (size / f), 3) * 0.5 + 0.5) * 255; return [v, v, v]; });
  return tex(c, { srgb: false });
}
