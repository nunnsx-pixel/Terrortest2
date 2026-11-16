// Utilitários: matemática, ruído determinístico, curvas de câmera por keyframes.
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
export const remap = (x, a, b) => clamp((x - a) / (b - a));
export const sstep = (a, b, x) => smooth(remap(x, a, b));
export const easeOut = (t) => 1 - (1 - t) * (1 - t);
export const easeIn = (t) => t * t;
export const deg = (d) => (d * Math.PI) / 180;

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed = 1) { this.r = mulberry32(seed); }
  f(a = 0, b = 1) { return a + (b - a) * this.r(); }
  i(a, b) { return Math.floor(this.f(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.r() * arr.length)]; }
  sign() { return this.r() < 0.5 ? -1 : 1; }
  gauss() { let u = 0, v = 0; while (!u) u = this.r(); while (!v) v = this.r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
}

// ---- ruído de valor 1D/2D/3D determinístico (para tremor de câmera, fumaça etc.)
const _p = new Uint8Array(512);
{ const r = mulberry32(777); const a = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } for (let i = 0; i < 512; i++) _p[i] = a[i & 255]; }
const _g = (i) => (_p[i & 511] / 255) * 2 - 1;
export function noise1(x) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(_g(i), _g(i + 1), u);
}
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const h = (a, b) => _g(_p[(a & 255)] + b);
  return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v);
}
export function fbm2(x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * noise2(x * f, y * f); f *= 2; a *= 0.5; }
  return s;
}
export function hash1(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

// ---- keyframes: [{t, v:[...], hold?, cut?}] → interpolação Hermite c/ tangentes Catmull-Rom
export function sampleKeys(keys, t) {
  const n = keys.length;
  if (t <= keys[0].t) return keys[0].v.slice();
  if (t >= keys[n - 1].t) return keys[n - 1].v.slice();
  let i = 0;
  while (i < n - 2 && t >= keys[i + 1].t) i++;
  const k0 = keys[i], k1 = keys[i + 1];
  if (k1.cut) return k0.v.slice();
  const dt = k1.t - k0.t;
  const u = (t - k0.t) / dt;
  const kp = keys[i - 1] && !k0.cut ? keys[i - 1] : null;
  const kn = keys[i + 2] && !keys[i + 2].cut ? keys[i + 2] : null;
  const out = new Array(k0.v.length);
  for (let c = 0; c < out.length; c++) {
    const p0 = k0.v[c], p1 = k1.v[c];
    let m0 = 0, m1 = 0;
    if (!k0.hold && kp) m0 = (p1 - kp.v[c]) / (k1.t - kp.t); else if (!k0.hold) m0 = (p1 - p0) / dt;
    if (!k1.hold && kn) m1 = (kn.v[c] - p0) / (kn.t - k0.t); else if (!k1.hold) m1 = (p1 - p0) / dt;
    if (k0.ease) m0 *= 0.15; if (k1.ease) m1 *= 0.15;
    const u2 = u * u, u3 = u2 * u;
    out[c] = (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * dt * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * dt * m1;
  }
  return out;
}
export const K = (t, v, o = {}) => ({ t, v, ...o });

// valor escalar por keyframes lineares suaves
export function track(keys, t) {
  const n = keys.length;
  if (t <= keys[0][0]) return keys[0][1];
  if (t >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 0;
  while (i < n - 2 && t >= keys[i + 1][0]) i++;
  const [t0, v0] = keys[i], [t1, v1] = keys[i + 1];
  return lerp(v0, v1, smooth((t - t0) / (t1 - t0)));
}
