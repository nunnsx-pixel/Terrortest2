// Humanos procedurais articulados: Lucas, Clara, Marcos, zumbis (hero) e multidão (lite).
// Convenção local: +Z frente, +Y cima, personagem olha para +Z; lado esquerdo do personagem = +X.
import * as THREE from 'three';
import * as T from './textures.js';
import { Rng, clamp, lerp, smooth, noise1 } from './util.js';

const M = (o) => new THREE.MeshStandardMaterial(o);
let _eyeTex = null;
function eyeGlowMat(op = 0.95) {
  if (!_eyeTex) { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(210,255,235,0.75)'); gr.addColorStop(1, 'rgba(180,255,220,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); _eyeTex = new THREE.CanvasTexture(c); _eyeTex.colorSpace = THREE.SRGBColorSpace; }
  return new THREE.SpriteMaterial({ map: _eyeTex, color: 0xdfffee, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
}
const g = (x, y, sx, sy, xc, yc) => Math.exp(-(((x - xc) ** 2) / sx + ((y - yc) ** 2) / sy));

// ------------------------------------------------------------------- CABEÇA
function faceRadius(x, y, z, zb, detail) {
  // x,y,z: vetor unitário; zb: 0..1 zumbi
  const f = smooth(clamp((z + 0.05) / 0.55, 0, 1));
  let r = 1;
  const jt = clamp((-y - 0.2) / 0.8, 0, 1);
  r *= 1 - 0.07 * jt * jt;                                    // queixo mais fino
  const sock = g(x, y, 0.022, 0.016, 0.36, 0.2) + g(x, y, 0.022, 0.016, -0.36, 0.2);
  r -= f * sock * (0.042 + 0.1 * zb);                         // órbitas
  r += f * g(x, y, 0.005, 0.05, 0, -0.1) * 0.16;               // dorso do nariz
  r += f * g(x, y, 0.012, 0.012, 0, -0.2) * 0.07;              // ponta do nariz
  r += f * (g(x, y, 0.004, 0.012, 0.18, -0.2) + g(x, y, 0.004, 0.012, -0.18, -0.2)) * 0.025; // asas
  r += f * (g(x, y, 0.06, 0.004, 0.27, 0.36) + g(x, y, 0.06, 0.004, -0.27, 0.36)) * (0.03 + 0.03 * zb); // sobrancelhas
  r += f * (g(x, y, 0.03, 0.03, 0.52, -0.02) + g(x, y, 0.03, 0.03, -0.52, -0.02)) * (0.035 - 0.08 * zb); // maçãs (zumbi: afundadas)
  r += f * g(x, y, 0.04, 0.004, 0, -0.43) * 0.04;               // lábios
  r -= f * g(x, y, 0.05, 0.0006, 0, -0.5) * 0.03;              // fenda da boca
  r += f * g(x, y, 0.02, 0.01, 0, -0.74) * 0.04;               // queixo
  return r;
}

export class Head {
  constructor({ tone = 0xd0a07c, zombie = 0, seed = 1, detail = 1, wounds = 0, hair = null, glasses = false, eyes = 'normal', radii = [0.086, 0.113, 0.098], face = false } = {}) {
    this.zombie = zombie; this.radii = radii;
    const sw = detail >= 2 ? 72 : 44, sh = detail >= 2 ? 52 : 32;
    this.geo = new THREE.SphereGeometry(1, sw, sh);
    const pos = this.geo.attributes.position;
    this.base = new Float32Array(pos.array.length);
    this.unit = new Float32Array(pos.array.length);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const r = faceRadius(x, y, z, zombie, detail);
      this.unit.set([x, y, z], i * 3);
      this.base.set([x * r * radii[0], y * r * radii[1], z * r * radii[2]], i * 3);
    }
    pos.array.set(this.base);
    this.geo.computeVertexNormals();
    this.skinTex = T.skinTexture({ tone, zombie, seed, wounds, face, w: detail >= 2 ? 1024 : 512, h: detail >= 2 ? 1024 : 512 });
    this.mat = M({ map: this.skinTex, roughness: 0.62, metalness: 0, emissive: new THREE.Color(zombie > 0 ? 0x1a2018 : 0x180c08), emissiveIntensity: 0.18 });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.castShadow = true;
    this.group = new THREE.Group(); this.group.add(this.mesh);
    // olhos
    const eyeMat = eyes === 'white'
      ? new THREE.MeshStandardMaterial({ color: 0xe9f0ee, emissive: 0xcfe4df, emissiveIntensity: 0.75, roughness: 0.25 })
      : M({ color: 0xe8e4de, roughness: 0.2 });
    const irisMat = new THREE.MeshBasicMaterial({ color: eyes === 'white' ? 0xb9c4c0 : 0x2a1a10 });
    this.eyes = [];
    for (const s of [-1, 1]) {
      const eg = new THREE.Group(); eg.position.set(s * radii[0] * 0.4, radii[1] * 0.2, radii[2] * 0.7);
      const eb = new THREE.Mesh(new THREE.SphereGeometry(radii[0] * 0.19, 20, 14), eyeMat); eb.scale.set(1, 0.9, 0.9); eg.add(eb);
      if (eyes !== 'white') { const ir = new THREE.Mesh(new THREE.CircleGeometry(radii[0] * 0.075, 14), irisMat); ir.position.z = radii[0] * 0.17; eg.add(ir); }
      else { const ir = new THREE.Mesh(new THREE.CircleGeometry(radii[0] * 0.03, 10), irisMat); ir.position.z = radii[0] * 0.17; eg.add(ir); }
      this.group.add(eg); this.eyes.push(eg);
      if (eyes === 'white') { const sp = new THREE.Sprite(eyeGlowMat(0.55)); sp.scale.set(0.04, 0.04, 1); sp.position.set(0, 0, radii[0] * 0.2); eg.add(sp); }
    }
    // boca (decalque escuro que cresce com a abertura) + dentes
    const mc = document.createElement('canvas'); mc.width = 128; mc.height = 64; const mg = mc.getContext('2d');
    const gr = mg.createRadialGradient(64, 32, 4, 64, 32, 60); gr.addColorStop(0, 'rgba(8,0,2,1)'); gr.addColorStop(0.75, 'rgba(30,2,6,0.96)'); gr.addColorStop(1, 'rgba(30,2,6,0)');
    mg.fillStyle = gr; mg.fillRect(0, 0, 128, 64);
    mg.fillStyle = zombie > 0 ? '#bdb48e' : '#e8e1d3'; mg.fillRect(26, 10, 76, 9); mg.fillStyle = zombie > 0 ? '#a69c78' : '#d8d0c0'; mg.fillRect(30, 46, 68, 7);
    const mt = new THREE.CanvasTexture(mc); mt.colorSpace = THREE.SRGBColorSpace;
    this.mouth = new THREE.Mesh(new THREE.PlaneGeometry(radii[0] * 0.9, radii[1] * 0.36), new THREE.MeshBasicMaterial({ map: mt, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    this.mouth.position.set(0, -radii[1] * 0.5, radii[2] * 0.965); this.mouth.scale.set(0.01, 0.01, 1);
    this.group.add(this.mouth);
    // orelhas
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 10), this.mat); e.scale.set(0.5, 1.2, 0.9); e.position.set(s * radii[0] * 0.98, -radii[1] * 0.02, -radii[2] * 0.05); this.group.add(e); }
    // cabelo
    const hairMat = M({ color: hair?.color ?? 0x1c1511, roughness: 0.85 });
    if (hair) {
      if (hair.type === 'short' || hair.type === 'shaved' || hair.type === 'pony') {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 22, 0, Math.PI * 2, 0, hair.type === 'shaved' ? Math.PI * 0.38 : Math.PI * 0.52), hairMat);
        cap.scale.set(radii[0] * 1.06, radii[1] * 1.06, radii[2] * 1.08); cap.position.set(0, radii[1] * 0.0, -radii[2] * 0.06); cap.rotation.x = -0.28; this.group.add(cap); this.hairCap = cap;
        if (hair.type === 'shaved') {  // laterais raspadas: sombra escura nas têmporas
          for (const s of [-1, 1]) { const st = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), M({ color: 0x2a2623, roughness: 1 })); st.scale.set(radii[0] * 0.2, radii[1] * 0.35, radii[2] * 0.62); st.position.set(s * radii[0] * 0.88, radii[1] * 0.2, -radii[2] * 0.1); this.group.add(st); }
        }
      }
      if (hair.type === 'pony') {
        this.pony = new THREE.Group(); this.pony.position.set(0, radii[1] * 0.45, -radii[2] * 0.95);
        let parent = this.pony; this.ponySeg = [];
        const gm = M({ color: hair.color, roughness: 0.8 });
        for (let i = 0; i < 5; i++) {
          const seg = new THREE.Group(); seg.position.y = i === 0 ? 0 : -0.07;
          const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.03 - i * 0.003, 0.06, 6, 10), gm); m.position.y = -0.035; seg.add(m); parent.add(seg); parent = seg; this.ponySeg.push(seg);
        }
        const tie = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.009, 8, 14), M({ color: 0xaa2d3a })); tie.rotation.x = Math.PI / 2; this.pony.add(tie);
        this.group.add(this.pony);
      }
    }
    // óculos
    if (glasses) {
      const fm = M({ color: 0x0b0b0c, roughness: 0.4, metalness: 0.3 });
      const lm = new THREE.MeshStandardMaterial({ color: 0x9fb4c0, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.35 });
      this.glasses = new THREE.Group();
      for (const s of [-1, 1]) {
        const fr = new THREE.Mesh(new THREE.TorusGeometry(radii[0] * 0.3, 0.0045, 8, 24), fm); fr.position.set(s * radii[0] * 0.4, radii[1] * 0.2, radii[2] * 0.93); this.glasses.add(fr);
        const ln = new THREE.Mesh(new THREE.CircleGeometry(radii[0] * 0.29, 20), lm); ln.position.copy(fr.position); ln.position.z += 0.001; this.glasses.add(ln);
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, radii[2] * 1.0, 6), fm); arm.rotation.x = Math.PI / 2; arm.position.set(s * radii[0] * 0.98, radii[1] * 0.2, radii[2] * 0.42); this.glasses.add(arm);
      }
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, radii[0] * 0.24, 6), fm); br.rotation.z = Math.PI / 2; br.position.set(0, radii[1] * 0.22, radii[2] * 0.95); this.glasses.add(br);
      this.group.add(this.glasses);
    }
    this.jaw = 0; this.jawShift = 0; this.hairTone = hair?.color;
  }

  // jaw: 0..1 abertura; shift: deslocamento lateral (mandíbula deslocada)
  setJaw(open, shift = 0, drop = 0) {
    const p = this.geo.attributes.position, a = open * 0.55 + drop;
    const ca = Math.cos(a), sa = Math.sin(a), hy = -0.06 * this.radii[1], hz = -0.35 * this.radii[2];
    for (let i = 0; i < p.count; i++) {
      const ux = this.unit[i * 3], uy = this.unit[i * 3 + 1];
      let bx = this.base[i * 3], by = this.base[i * 3 + 1], bz = this.base[i * 3 + 2];
      const w = smooth(clamp((-uy - 0.32) / 0.14, 0, 1));
      if (w > 0 && (a !== 0 || shift !== 0)) {
        const dy = by - hy, dz = bz - hz;
        const ry = dy * ca + dz * sa + hy, rz = -dy * sa + dz * ca + hz;
        by = lerp(by, ry, w); bz = lerp(bz, rz, w); bx += shift * w * 0.03;
      }
      p.setXYZ(i, bx, by, bz);
    }
    p.needsUpdate = true;
    this.mouth.scale.set(0.35 + open * 0.9, 0.02 + open * 1.1 + drop * 1.5, 1);
    this.mouth.position.y = -this.radii[1] * (0.46 + 0.04 * open) - drop * 0.02;
    this.mouth.position.x = shift * 0.02;
    this.mouth.visible = (open + drop) > 0.04;
  }
}

// ------------------------------------------------------------------- CORPO
function limb(rTop, rBot, len, mat, seg = 10) {
  const geo = new THREE.CylinderGeometry(rTop, rBot, len, seg, 1); geo.translate(0, -len / 2, 0);
  const m = new THREE.Mesh(geo, mat); m.castShadow = true; return m;
}
function sphereAt(r, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; return m;
}
function lathe(profile, mat, { phiStart = 0, phiLength = Math.PI * 2, segs = 28, sz = 0.62 } = {}) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(pts, segs, phiStart, phiLength);
  const m = new THREE.Mesh(geo, mat); m.scale.z = sz; m.castShadow = true; return m;
}

export const JOINTS = ['spine', 'chest', 'neck', 'head', 'shL', 'elL', 'shR', 'elR', 'hipL', 'knL', 'hipR', 'knR', 'wrL', 'wrR'];

export function buildHuman(spec) {
  const S = spec.scale ?? 1;
  const z = spec.zombie ?? 0;
  const rng = new Rng(spec.seed ?? 3);
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body); body.scale.setScalar(S);
  const j = {};
  const skinMat = M({ map: null, color: spec.skinColor ?? 0xc79a78, roughness: 0.65, emissive: z ? 0x161a14 : 0x140a06, emissiveIntensity: 0.2 });
  if (z) skinMat.color = new THREE.Color(0x8c9a88);
  const topMap = spec.topTex ?? null;
  const topMat = M({ color: spec.topColor ?? 0x1a1b20, map: topMap, roughness: spec.topRough ?? 0.7, metalness: spec.topMetal ?? 0 });
  const innerMat = M({ color: spec.innerColor ?? 0x777b80, map: spec.innerTex ?? null, roughness: 0.85 });
  const pantsMat = M({ color: spec.pantsColor ?? 0x1d2433, map: spec.pantsTex ?? null, roughness: 0.8 });
  const shoeMat = M({ color: spec.shoeColor ?? 0x101010, roughness: 0.55 });
  const soleMat = M({ color: spec.soleColor ?? 0xd8d8d2, roughness: 0.7 });

  // quadril
  j.hips = new THREE.Group(); j.hips.position.y = 0.93; body.add(j.hips);
  j.hips.add(sphereAt(0.145, pantsMat, 0, -0.02, 0, 1.05, 0.8, 0.75));
  // coluna
  j.spine = new THREE.Group(); j.spine.position.y = 0.1; j.hips.add(j.spine);
  j.chest = new THREE.Group(); j.chest.position.y = 0.2; j.spine.add(j.chest);
  // torso (camada interna: camiseta / regata)
  const prof = (k) => [[0.16 * k, -0.2], [0.158 * k, -0.1], [0.152 * k, -0.02], [0.168 * k, 0.1], [0.185 * k, 0.2], [0.178 * k, 0.28], [0.12 * k, 0.33], [0.06 * k, 0.345]];
  const shape = spec.top;
  if (shape === 'bomber' || shape === 'suit' || shape === 'jacket') {
    j.chest.add(lathe(prof(1.0), innerMat)); j.chest.add(lathe(prof(1.07), topMat));
    // gola
    const col = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 8, 18), shape === 'bomber' ? topMat : innerMat); col.rotation.x = Math.PI / 2; col.position.set(0, 0.32, -0.01); col.scale.set(1, 1.1, 1); j.chest.add(col);
    if (shape === 'bomber') { const hem = new THREE.Mesh(new THREE.TorusGeometry(0.168, 0.015, 8, 26), M({ color: 0x0c0c0e, roughness: 0.9 })); hem.rotation.x = Math.PI / 2; hem.scale.set(1, 0.62, 1); hem.position.y = -0.2; j.chest.add(hem); }
  } else if (shape === 'denim' || shape === 'plaid') {
    // camiseta/regata + camisa aberta (painéis laterais/traseiro)
    j.chest.add(lathe(prof(1.0), innerMat));
    j.chest.add(lathe(prof(1.08), topMat, { phiStart: 0.55 + Math.PI / 2 * 0 + 0.0, phiLength: Math.PI * 2 - 1.2 }));
  } else { j.chest.add(lathe(prof(1.04), topMat)); }
  // abdômen/cós (liga com a calça)
  j.spine.add(lathe([[0.15, -0.1], [0.152, 0.02], [0.15, 0.1], [0.158, 0.2]], shape === 'plaid' || shape === 'denim' ? innerMat : topMat));
  // pescoço e cabeça
  j.neck = new THREE.Group(); j.neck.position.y = 0.23; j.chest.add(j.neck);
  const neckM = limb(0.045, 0.05, 0.12, skinMat); neckM.position.y = 0.04; j.neck.add(neckM);
  j.head = new THREE.Group(); j.head.position.y = 0.16; j.neck.add(j.head);
  const head = new Head({ tone: spec.skinTone ?? 0xc79a78, zombie: z, seed: spec.seed ?? 1, hair: spec.hair, glasses: spec.glasses, eyes: z ? 'white' : 'normal', wounds: spec.wounds ?? 0, detail: spec.headDetail ?? 1, face: !!spec.face });
  head.group.position.y = 0.0; j.head.add(head.group);
  if (z) skinMat.map = head.skinTex;
  // braços
  for (const s of [-1, 1]) {
    const side = s > 0 ? 'L' : 'R';
    const sh = new THREE.Group(); sh.position.set(s * 0.2, 0.22, 0); j.chest.add(sh); j['sh' + side] = sh;
    sh.add(sphereAt(0.062, topMat));
    const sleeveMat = (shape === 'tank') ? skinMat : topMat;
    const up = limb(0.055, 0.047, 0.29, sleeveMat); sh.add(up);
    const el = new THREE.Group(); el.position.y = -0.29; sh.add(el); j['el' + side] = el;
    el.add(sphereAt(0.048, sleeveMat));
    const forearmMat = (shape === 'plaid' && spec.rolled) ? skinMat : sleeveMat;
    const fo = limb(0.046, 0.036, 0.26, forearmMat); el.add(fo);
    const wr = new THREE.Group(); wr.position.y = -0.27; el.add(wr); j['wr' + side] = wr;
    // mão
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.085, 0.03), skinMat); palm.position.y = -0.04; palm.castShadow = true; wr.add(palm);
    const fingers = [];
    for (let f = 0; f < 4; f++) {
      const fg = new THREE.Group(); fg.position.set((f - 1.5) * 0.019, -0.085, 0);
      const fm = new THREE.Mesh(new THREE.CapsuleGeometry(0.0085, 0.055, 4, 6), skinMat); fm.position.y = -0.03; fg.add(fm); wr.add(fg); fingers.push(fg);
    }
    const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.045, 4, 6), skinMat); th.position.set(-s * 0.042, -0.04, 0.012); th.rotation.z = s * 0.5; wr.add(th);
    wr.userData.fingers = fingers;
    if (spec.wristband && s > 0) { const wb = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.039, 0.028, 14), M({ color: 0x080808, roughness: 0.8 })); wb.position.y = -0.2; el.add(wb); }
  }
  // pernas
  for (const s of [-1, 1]) {
    const side = s > 0 ? 'L' : 'R';
    const hp = new THREE.Group(); hp.position.set(s * 0.085, -0.04, 0); j.hips.add(hp); j['hip' + side] = hp;
    hp.add(limb(0.085, 0.062, 0.43, pantsMat, 12));
    const kn = new THREE.Group(); kn.position.y = -0.43; hp.add(kn); j['kn' + side] = kn;
    kn.add(sphereAt(0.062, pantsMat));
    kn.add(limb(0.062, 0.047, 0.42, pantsMat, 12));
    const an = new THREE.Group(); an.position.y = -0.42; kn.add(an);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.07, 0.25), shoeMat); shoe.position.set(0, -0.03, 0.05); shoe.castShadow = true; an.add(shoe);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.022, 0.265), soleMat); sole.position.set(0, -0.072, 0.052); an.add(sole);
  }
  // acessórios
  if (spec.deliveryBag) {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.44), M({ color: 0xcf3c2b, roughness: 0.6 }));
    bag.position.set(0, 0.05, -0.33); bag.castShadow = true; j.chest.add(bag);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.03, 0.45), M({ color: 0x9a2a1f, roughness: 0.6 })); lid.position.set(0, 0.31, -0.33); j.chest.add(lid);
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.06), new THREE.MeshBasicMaterial({ color: 0xdddddd })); stripe.position.set(0, 0.1, -0.552); stripe.rotation.y = Math.PI; j.chest.add(stripe);
  }
  if (spec.tie) {
    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.26, 0.01), M({ color: 0x5b1620, roughness: 0.6 })); tie.position.set(0.02, 0.1, 0.115); tie.rotation.z = 0.12; j.chest.add(tie);
  }
  if (spec.radio) {
    const radio = new THREE.Group();
    const rb = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.12, 0.03), M({ color: 0x2a2a2a, roughness: 0.55 })); radio.add(rb);
    const gr = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0x151515 })); gr.position.set(0, 0.015, 0.0155); radio.add(gr);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.34, 5), M({ color: 0xb8b8b8, metalness: 0.9, roughness: 0.3 })); ant.position.set(0.03, 0.2, 0); ant.rotation.z = -0.15; radio.add(ant);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3020 })); led.position.set(-0.025, 0.05, 0.016); radio.add(led);
    radio.userData.led = led;
    j.wrL.add(radio); radio.position.set(0.0, -0.08, 0.04); radio.rotation.set(0.1, 0, 0); j.radio = radio;
  }
  // sangue nas roupas (zumbi)
  if (z && spec.blood) {
    const bt = T.bloodDecal(spec.seed ?? 3);
    for (let i = 0; i < 2; i++) {
      const bm = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), new THREE.MeshBasicMaterial({ map: bt, transparent: true, depthWrite: false, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }));
      bm.position.set(i ? -0.04 : 0.03, 0.06 - i * 0.12, 0.125 + 0.05 * 0.2); bm.scale.z = 1; j.chest.add(bm);
    }
  }

  const h = { root, body, j, head, spec, joints: j };
  h.eyeWorld = new THREE.Vector3();
  return h;
}

// ------------------------------------------------------------------- POSES
export const P0 = () => ({
  rootY: 0, rootX: 0, rootZ: 0, rootRX: 0, rootRY: 0, rootRZ: 0,
  hips: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0],
  shL: [0, 0, 0.1], elL: [0, 0, 0], shR: [0, 0, -0.1], elR: [0, 0, 0],
  hipL: [0, 0, 0], knL: [0, 0, 0], hipR: [0, 0, 0], knR: [0, 0, 0], wrL: [0, 0, 0], wrR: [0, 0, 0],
  grip: 0, jaw: 0, jawShift: 0, jawDrop: 0,
});
export function lerpPose(a, b, t) {
  const o = {};
  for (const k in a) {
    if (Array.isArray(a[k])) o[k] = [lerp(a[k][0], b[k][0], t), lerp(a[k][1], b[k][1], t), lerp(a[k][2], b[k][2], t)];
    else o[k] = lerp(a[k], b[k], t);
  }
  return o;
}
export function applyPose(h, p) {
  const j = h.j;
  h.body.position.set(p.rootX, p.rootY, p.rootZ);
  h.body.rotation.set(p.rootRX, p.rootRY, p.rootRZ);
  for (const k of ['hips', 'spine', 'chest', 'neck', 'head', 'shL', 'elL', 'shR', 'elR', 'hipL', 'knL', 'hipR', 'knR', 'wrL', 'wrR']) j[k].rotation.set(p[k][0], p[k][1], p[k][2]);
  for (const w of [j.wrL, j.wrR]) for (const f of w.userData.fingers) f.rotation.x = -p.grip * 1.5;
  h.head.setJaw(p.jaw, p.jawShift, p.jawDrop);
  if (h.head.pony) h.head.ponySeg.forEach((s, i) => { s.rotation.x = 0.35 + p.rootRX * 0.5 + p.spine[0] * 0.3; });
}

// pose de pé com respiração
export function poseStand(t, ph = 0) {
  const p = P0(), b = Math.sin(t * 1.9 + ph);
  p.chest = [0.02 * b, 0.03 * Math.sin(t * 0.7 + ph), 0]; p.head = [0.02 * b, 0.12 * Math.sin(t * 0.5 + ph * 2), 0];
  p.shL = [-0.08 + 0.02 * b, 0, 0.12]; p.shR = [-0.08 - 0.02 * b, 0, -0.12]; p.elL = [-0.25, 0, 0]; p.elR = [-0.25, 0, 0];
  p.hipL = [0, 0, 0.02]; p.hipR = [0, 0, -0.02];
  return p;
}
// agachado (depth 0..1)
export function poseCrouch(t, depth = 1, ph = 0) {
  const p = P0(), b = Math.sin(t * 2.4 + ph);
  p.rootY = -0.42 * depth; p.rootRX = 0.12 * depth;
  p.hipL = [-1.45 * depth, 0, 0.1]; p.hipR = [-1.45 * depth, 0, -0.1];
  p.knL = [2.25 * depth, 0, 0]; p.knR = [2.25 * depth, 0, 0];
  p.spine = [0.18 * depth, 0, 0]; p.chest = [0.14 * depth + 0.02 * b, 0, 0]; p.neck = [-0.25 * depth, 0, 0]; p.head = [0.05, 0.1 * Math.sin(t * 0.6 + ph), 0];
  p.shL = [-0.7 * depth, 0, 0.1]; p.shR = [-0.7 * depth, 0, -0.1]; p.elL = [-1.1 * depth, 0, 0]; p.elR = [-1.1 * depth, 0, 0];
  return p;
}
// corrida (phase em radianos, power 0..1)
export function poseRun(phase, power = 1, ph = 0) {
  const p = P0(), s = Math.sin(phase), c = Math.cos(phase);
  p.rootY = Math.abs(Math.sin(phase)) * 0.06 * power - 0.04 * power; p.rootRX = 0.22 * power;
  p.hipL = [-1.0 * s * power - 0.05, 0, 0.04]; p.hipR = [1.0 * s * power - 0.05, 0, -0.04];
  p.knL = [Math.max(0, 1.25 * (c * 0.5 + 0.5) * power * (s > 0 ? 0.6 : 1.2)), 0, 0]; p.knR = [Math.max(0, 1.25 * (-c * 0.5 + 0.5) * power * (s < 0 ? 0.6 : 1.2)), 0, 0];
  p.spine = [0.08 * power, 0.12 * s * power, 0]; p.chest = [0.1 * power, -0.2 * s * power, 0];
  p.shL = [1.0 * s * power, 0, 0.18]; p.shR = [-1.0 * s * power, 0, -0.18]; p.elL = [-1.5 * power, 0, 0]; p.elR = [-1.5 * power, 0, 0];
  p.head = [-0.15 * power, -0.05 * s, 0];
  return p;
}
// zumbi mancando (perna direita arrasta)
export function poseZWalk(phase, ph = 0) {
  const p = P0(), s = Math.sin(phase), c = Math.cos(phase);
  p.rootRX = 0.12; p.rootRZ = 0.07 * s; p.rootY = -0.02 + 0.015 * Math.abs(s);
  p.hipL = [-0.5 * s - 0.1, 0, 0.05]; p.knL = [Math.max(0, 0.6 * c), 0, 0];
  p.hipR = [0.28 * s * 0.9 - 0.18, 0, -0.1]; p.knR = [0.1, 0, 0];
  p.spine = [0.18, 0.1 * s, 0.06]; p.chest = [0.12, -0.18 * s, 0.1]; p.neck = [0.2, 0, 0.35]; p.head = [0.12, 0.2 * Math.sin(phase * 0.5 + ph), 0.2];
  p.shL = [-0.65 + 0.2 * s, 0, 0.2]; p.elL = [-0.5, 0, 0]; p.shR = [-0.4 - 0.2 * s, 0, -0.1]; p.elR = [-0.9, 0, 0];
  p.grip = 0.4; p.jawDrop = 0.12; p.jawShift = 1;
  return p;
}
export function poseZReach(phase, ph = 0) { // braços à frente, ameaçador
  const p = poseZWalk(phase, ph);
  p.shL = [-1.35, 0, 0.12]; p.shR = [-1.4, 0, -0.12]; p.elL = [-0.15, 0, 0]; p.elR = [-0.1, 0, 0];
  p.jaw = 0.5; p.rootRX = 0.2; p.grip = 0.7;
  return p;
}

// ------------------------------------------------------------------- MULTIDÃO (lite)
export function buildLite(seed = 1, { eyeSprite = true } = {}) {
  const rng = new Rng(seed);
  const cols = [0x2b2d33, 0x4a3a30, 0x38413d, 0x5a2f2f, 0x1f2937, 0x453d52, 0x6b6558, 0x222222];
  const skin = M({ color: rng.pick([0x8d9a88, 0x9a8f80, 0x7f8c84, 0xa09a8a]), roughness: 0.8, emissive: 0x10140f, emissiveIntensity: 0.3 });
  const cloth = M({ color: rng.pick(cols), roughness: 0.85 }), pants = M({ color: rng.pick(cols), roughness: 0.85 });
  const h = new THREE.Group(); const body = new THREE.Group(); h.add(body);
  const j = {};
  j.hips = new THREE.Group(); j.hips.position.y = 0.93; body.add(j.hips);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.55, 10), cloth); torso.scale.z = 0.62; torso.position.y = 0.3; j.hips.add(torso); torso.castShadow = true;
  j.head = new THREE.Group(); j.head.position.set(0, 0.64, 0.02); j.hips.add(j.head);
  const hd = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), skin); hd.scale.set(0.085, 0.11, 0.1); j.head.add(hd); hd.castShadow = true;
  j.eyes = [];
  if (eyeSprite) for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.0165, 8, 6), new THREE.MeshBasicMaterial({ color: 0xdff6ee })); e.position.set(s * 0.034, 0.02, 0.085); j.head.add(e); j.eyes.push(e); const sp = new THREE.Sprite(eyeGlowMat(0.9)); sp.scale.set(0.15, 0.15, 1); sp.position.set(s * 0.034, 0.02, 0.1); j.head.add(sp); }
  for (const s of [-1, 1]) {
    const side = s > 0 ? 'L' : 'R';
    const sh = new THREE.Group(); sh.position.set(s * 0.21, 0.52, 0); j.hips.add(sh); j['sh' + side] = sh;
    const arm = limb(0.045, 0.035, 0.55, rng.r() < 0.5 ? cloth : skin, 6); sh.add(arm); arm.castShadow = true;
    const hp = new THREE.Group(); hp.position.set(s * 0.085, -0.04, 0); j.hips.add(hp); j['hip' + side] = hp;
    const leg = limb(0.075, 0.05, 0.9, pants, 6); hp.add(leg); leg.castShadow = true;
  }
  return { root: h, body, j, lite: true };
}
export function poseLite(h, t, mode = 'lurch', ph = 0, amt = 1) {
  const j = h.j, s = Math.sin(t * 3.2 + ph), c = Math.cos(t * 3.2 + ph);
  if (mode === 'stand') { h.body.rotation.set(0.05, 0, 0.03 * s); j.shL.rotation.set(-0.3, 0, 0.1); j.shR.rotation.set(-0.2, 0, -0.1); j.hipL.rotation.set(0, 0, 0); j.hipR.rotation.set(0, 0, 0); j.head.rotation.set(0.2, 0.3 * Math.sin(t * 0.8 + ph), 0.25); return; }
  if (mode === 'crouch') { h.body.rotation.set(0.5, 0, 0.1 * s); h.body.position.y = -0.55; j.shL.rotation.set(-1.2, 0, 0.1); j.shR.rotation.set(-1.0, 0, -0.1); j.hipL.rotation.set(-1.3, 0, 0); j.hipR.rotation.set(-1.3, 0, 0); j.head.rotation.set(-0.4, 0, 0.2); return; }
  // lurch / correr desengonçado
  h.body.rotation.set(0.2 * amt, 0.1 * s, 0.1 * c); h.body.position.y = 0.03 * Math.abs(s) * amt;
  j.hipL.rotation.set(-0.8 * s * amt, 0, 0.05); j.hipR.rotation.set(0.8 * s * amt, 0, -0.05);
  j.shL.rotation.set(-1.2 - 0.4 * s, 0, 0.2); j.shR.rotation.set(-1.1 + 0.4 * s, 0, -0.2);
  j.head.rotation.set(0.1, 0.25 * s, 0.3 * c);
}
