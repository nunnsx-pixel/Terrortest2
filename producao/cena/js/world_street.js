// Rua do centro antigo de São Paulo, madrugada, asfalto molhado. Mundo exterior (Parte 1 e início da Parte 2).
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import * as T from './textures.js';
import { Rng, clamp, lerp, smooth, noise1, hash1, sstep, remap } from './util.js';

const std = (o) => new THREE.MeshStandardMaterial(o);
const box = (w, h, d, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.castShadow = false; m.receiveShadow = false; return m; };

// ---------------------------------------------------------------------------------- shaders de reflexão
export const GROUND_SHADER = {
  name: 'WetGround',
  uniforms: {
    color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
    tAlbedo: { value: null }, tWet: { value: null }, time: { value: 0 },
    uL: { value: Array.from({ length: 10 }, () => new THREE.Vector4()) },
    uLc: { value: Array.from({ length: 10 }, () => new THREE.Vector3()) },
    uSpot: { value: new THREE.Vector4() }, uSpotDir: { value: new THREE.Vector4() }, uSpotC: { value: new THREE.Vector3(1, 1, 1) },
    uTiled: { value: new THREE.Vector4(16, 16, -8, 0) }, uMode: { value: 0 }, uRefl: { value: 1.0 }, uAmb: { value: new THREE.Vector3(0.012, 0.016, 0.026) },
  },
  vertexShader: /* glsl */`
    uniform mat4 textureMatrix; varying vec4 vUvR; varying vec3 vWorld;
    void main(){ vUvR = textureMatrix*vec4(position,1.0); vec4 wp = modelMatrix*vec4(position,1.0); vWorld = wp.xyz; gl_Position = projectionMatrix*viewMatrix*wp; }`,
  fragmentShader: /* glsl */`
    uniform vec3 color; uniform sampler2D tDiffuse, tAlbedo, tWet; uniform float time;
    uniform vec4 uL[10]; uniform vec3 uLc[10]; uniform vec4 uSpot, uSpotDir; uniform vec3 uSpotC;
    uniform vec4 uTiled; uniform float uMode; uniform float uRefl; uniform vec3 uAmb;
    varying vec4 vUvR; varying vec3 vWorld;
    float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
    void main(){
      vec2 gp = vec2((vWorld.x - uTiled.z)/uTiled.x, (vWorld.z - uTiled.w)/uTiled.y);
      vec3 alb = texture2D(tAlbedo, gp).rgb;
      float wet = texture2D(tWet, gp).r;
      float fine = vn(vWorld.xz*38.0)*0.5 + vn(vWorld.xz*95.0)*0.5;
      alb *= 0.78 + 0.5*fine;
      vec3 V = normalize(cameraPosition - vWorld);
      // normal perturbada: ondulações da chuva + rugosidade
      vec2 rp = vWorld.xz*7.0; float tt = time*1.7;
      vec2 n2 = vec2(vn(rp+tt)-vn(rp+tt+17.3), vn(rp.yx*1.3-tt)-vn(rp.yx*1.3-tt+9.1))*0.5;
      float rough = mix(1.0, 0.25, wet);
      vec3 N = normalize(vec3(n2.x*0.18*(0.3+wet), 1.0, n2.y*0.18*(0.3+wet)) + vec3((fine-0.5)*0.35*(1.0-wet),0.,(fine-0.5)*0.35*(1.0-wet)));
      // iluminação difusa pelas luzes do pool
      vec3 diff = uAmb;
      for(int i=0;i<10;i++){
        vec3 Ld = uL[i].xyz - vWorld; float d2 = dot(Ld,Ld); float nd = max(dot(N, Ld*inversesqrt(d2)), 0.0);
        diff += uLc[i]*uL[i].w*nd/(1.0 + d2*0.05);
      }
      { vec3 Ld = uSpot.xyz - vWorld; float d2 = dot(Ld,Ld); vec3 ld = Ld*inversesqrt(d2); float cone = smoothstep(uSpotDir.w, uSpotDir.w+0.12, dot(-ld, uSpotDir.xyz));
        diff += uSpotC*uSpot.w*cone*max(dot(N,ld),0.0)/(1.0 + d2*0.02); }
      // reflexão planar com desfoque anisotrópico (alongada na vertical da tela)
      vec2 ruv = vUvR.xy/vUvR.w + n2*0.02*(0.4+wet);
      vec3 refl = vec3(0.0); float ws = 0.0;
      float blur = mix(0.035, 0.0035, wet);
      for(int i=-4;i<=4;i++){ float f = float(i)/4.0; float w = 1.0 - abs(f)*0.7;
        refl += texture2D(tDiffuse, ruv + vec2(f*blur*0.35, f*blur)).rgb*w;
        refl += texture2D(tDiffuse, ruv + vec2(f*blur*0.2, -f*blur*0.6)).rgb*w*0.6; ws += w*1.6; }
      refl /= ws;
      float fr = 0.04 + 0.96*pow(1.0 - clamp(dot(V, vec3(0,1,0)), 0.0, 1.0), 5.0);
      float amt = (mix(0.06, 0.92, wet)*(0.45 + 0.55*fr))*uRefl;
      vec3 col = alb*diff*(1.0 - 0.45*wet) + refl*amt*color;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export const GLASS_SHADER = {
  name: 'GlassMirror',
  uniforms: {
    color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
    uAlpha: { value: 0.5 }, uTint: { value: new THREE.Vector3(0.7, 0.85, 0.9) }, time: { value: 0 }, uDirt: { value: 1.0 },
  },
  vertexShader: /* glsl */`
    uniform mat4 textureMatrix; varying vec4 vUvR; varying vec3 vWorld; varying vec2 vUv2;
    void main(){ vUvR = textureMatrix*vec4(position,1.0); vUv2 = uv; vec4 wp = modelMatrix*vec4(position,1.0); vWorld = wp.xyz; gl_Position = projectionMatrix*viewMatrix*wp; }`,
  fragmentShader: /* glsl */`
    uniform vec3 color; uniform sampler2D tDiffuse; uniform float uAlpha; uniform vec3 uTint; uniform float time, uDirt;
    varying vec4 vUvR; varying vec3 vWorld; varying vec2 vUv2;
    float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
    void main(){
      vec2 ruv = vUvR.xy/vUvR.w;
      float dust = vn(vUv2*vec2(9.0,4.0)) * 0.5 + vn(vUv2*vec2(40.0,18.0))*0.5;
      float streak = vn(vec2(vUv2.x*60.0, vUv2.y*1.5));
      ruv += (vec2(vn(vUv2*30.0), vn(vUv2*30.0+9.0))-0.5)*0.0035;
      vec3 refl = texture2D(tDiffuse, ruv).rgb;
      vec3 V = normalize(cameraPosition - vWorld);
      float fr = 0.06 + 0.94*pow(1.0 - clamp(abs(V.x), 0.0, 1.0), 4.0);
      float a = clamp(uAlpha*(0.7 + 0.5*fr) + dust*0.06*uDirt, 0.0, 0.92);
      vec3 col = refl*uTint + vec3(0.02,0.03,0.035)*dust*uDirt*0.5 + vec3(0.03)*streak*uDirt*0.3;
      gl_FragColor = vec4(col, a);
    }`,
};

// ---------------------------------------------------------------------------------- utilitário: textura radial (brilho/luz)
export function glowTexture(inner = 'rgba(255,255,255,1)', mid = 'rgba(255,255,255,0.25)') {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, inner); gr.addColorStop(0.18, mid); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function beamTexture() { // gradiente vertical p/ cones de luz volumétrica
  const c = document.createElement('canvas'); c.width = 8; c.height = 128; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 8, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------------------------------------------------------------------------------- carro (EcoSport-like)
export function buildSUV(paint = 0x39474f) {
  const car = new THREE.Group(); const body = new THREE.Group(); car.add(body);
  const paintM = new THREE.MeshPhysicalMaterial({ color: paint, metalness: 0.65, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.15 });
  const glassM = new THREE.MeshStandardMaterial({ color: 0x080d12, metalness: 0.9, roughness: 0.06 });
  const blackM = std({ color: 0x0b0b0d, roughness: 0.7 });
  // perfil lateral (em Z: frente=+z) — polígono extrudado na largura
  const L = 4.25, Hh = 1.7, W = 1.8;
  const s = new THREE.Shape();
  s.moveTo(-L / 2, 0.28); s.lineTo(-L / 2, 0.85); s.lineTo(-L / 2 + 0.08, 1.05); s.lineTo(-L / 2 + 0.55, 1.5); s.lineTo(-L / 2 + 0.55, 1.62);   // traseira reta (SUV boxy)
  s.lineTo(0.78, 1.66); s.lineTo(1.22, 1.14); s.lineTo(L / 2 - 0.05, 1.02); s.lineTo(L / 2, 0.82); s.lineTo(L / 2, 0.3); s.lineTo(-L / 2, 0.28);
  const geo = new THREE.ExtrudeGeometry(s, { depth: W - 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 4, curveSegments: 8 });
  geo.translate(0, 0, -(W - 0.12) / 2);
  const shell = new THREE.Mesh(geo, paintM); shell.rotation.y = Math.PI / 2; // comprimento ao longo de Z
  body.add(shell);
  // vidros (painéis levemente embutidos)
  const win = new THREE.Mesh(new THREE.BoxGeometry(W - 0.04, 0.5, 1.9), glassM); win.position.set(0, 1.28, -0.35); win.scale.set(1, 1, 1);
  body.add(win);
  const ws = new THREE.Mesh(new THREE.BoxGeometry(W - 0.14, 0.46, 0.05), glassM); ws.position.set(0, 1.35, 0.96); ws.rotation.x = -0.82; body.add(ws);
  // pilares
  for (const z of [-0.56, 0.18, 0.7]) { const p = box(W - 0.02, 0.5, 0.07, blackM); p.position.set(0, 1.28, z); body.add(p); }
  // rodas
  const tyreM = std({ color: 0x0b0b0b, roughness: 0.9 }), rimM = std({ color: 0x9aa0a5, metalness: 0.9, roughness: 0.25 });
  car.userData.wheels = [];
  for (const [x, z] of [[0.86, 1.35], [-0.86, 1.35], [0.86, -1.25], [-0.86, -1.25]]) {
    const w = new THREE.Group();
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.24, 24), tyreM); t.rotation.z = Math.PI / 2; w.add(t);
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.26, 16), rimM); r.rotation.z = Math.PI / 2; w.add(r);
    w.position.set(x, 0.36, z); body.add(w);
  }
  // faróis e lanternas
  car.userData.signals = [];
  const sigM = () => new THREE.MeshBasicMaterial({ color: 0xff9a20 });
  const mk = (w, h, x, y, z, col) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: col })); m.position.set(x, y, z); return m; };
  for (const x of [0.62, -0.62]) {
    const hl = mk(0.36, 0.17, x, 0.84, 2.13, 0xdfe8ff); body.add(hl); (car.userData.head ??= []).push(hl);
    const tl = mk(0.18, 0.4, x * 1.3, 0.95, -2.13, 0xaa1010); tl.rotation.y = Math.PI; body.add(tl); (car.userData.tail ??= []).push(tl);
    const sg = mk(0.14, 0.07, x * 1.35, 0.76, 2.14, 0xffa020); body.add(sg); car.userData.signals.push(sg);
    const sg2 = mk(0.1, 0.07, x * 1.5, 0.62, -2.14, 0xffa020); sg2.rotation.y = Math.PI; body.add(sg2); car.userData.signals.push(sg2);
  }
  const grill = box(1.1, 0.2, 0.04, blackM); grill.position.set(0, 0.75, 2.14); body.add(grill);
  const plate = mk(0.4, 0.14, 0, 0.55, -2.15, 0xdddddd); plate.rotation.y = Math.PI; body.add(plate);
  const bump = box(1.74, 0.2, 0.18, blackM); bump.position.set(0, 0.38, 2.1); body.add(bump);
  const bump2 = box(1.74, 0.2, 0.18, blackM); bump2.position.set(0, 0.38, -2.1); body.add(bump2);
  const rail = box(0.04, 0.04, 1.9, blackM); rail.position.set(0.8, 1.7, -0.3); body.add(rail); const rail2 = rail.clone(); rail2.position.x = -0.8; body.add(rail2);
  const mirror = box(0.14, 0.12, 0.18, paintM); mirror.position.set(1.0, 1.28, 0.78); body.add(mirror); const m2 = mirror.clone(); m2.position.x = -1.0; body.add(m2);
  const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.2, 20), tyreM); spare.rotation.x = Math.PI / 2; spare.position.set(0, 1.12, -2.2); body.add(spare); // estepe na traseira
  body.position.y = 0.0;
  car.userData.body = body;
  return car;
}

// ---------------------------------------------------------------------------------- mundo
export function buildStreet(ctx) {
  const { renderer, W, H } = ctx;
  const rng = new Rng(2025);
  const root = new THREE.Group(); root.name = 'street';
  const lampsData = []; // posições dos postes para o pool de luz
  const glow = glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0.3)');
  const beam = beamTexture();
  const ground = T.groundTextures();

  // ---------------- chão: Reflector com shader de asfalto molhado
  const gGeo = new THREE.PlaneGeometry(16, 220);
  const groundMesh = new Reflector(gGeo, { textureWidth: W >> 1, textureHeight: H >> 1, color: 0xffffff, clipBias: 0.003, shader: GROUND_SHADER });
  groundMesh.rotation.x = -Math.PI / 2; groundMesh.position.set(0, 0, -80);
  groundMesh.material.uniforms.tAlbedo.value = ground.albedo; groundMesh.material.uniforms.tWet.value = ground.wet;
  groundMesh.material.uniforms.uTiled.value.set(16, 16, -8, 0);
  groundMesh.name = 'ground';
  root.add(groundMesh);
  // meio-fio (relevo)
  const curbM = std({ color: 0x555550, roughness: 0.4 });
  for (const s of [-1, 1]) { const c = box(0.28, 0.16, 220, curbM); c.position.set(s * 4.55, 0.08, -80); root.add(c); }

  // ---------------- céu / horizonte
  const sky = new THREE.Mesh(new THREE.SphereGeometry(380, 24, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {}, vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 hor = vec3(0.16,0.09,0.05); vec3 mid = vec3(0.025,0.04,0.07); vec3 top = vec3(0.004,0.007,0.016);
      vec3 c = mix(hor, mid, smoothstep(0.0,0.22,h)); c = mix(c, top, smoothstep(0.18,0.8,h)); gl_FragColor = vec4(c,1.); }`,
  }));
  root.add(sky);

  // ---------------- prédios
  const facTex = [0, 1, 2, 3, 4, 5].map((v) => T.facadeTextures(v, 7));
  const darkM = std({ color: 0x14161a, roughness: 0.95 });
  const concM = std({ map: T.concreteTexture(5, true), roughness: 0.9 });
  const shutterTexes = [T.shutterTexture(1), T.shutterTexture(2), T.shutterTexture(3), T.shutterTexture(4, 512, 512, false)];
  const buildingList = [];
  const addBuilding = (side, z0, w, h, variant, hollow = null) => {
    const d = 14;
    const ft = facTex[variant % facTex.length];
    const map = ft.map.clone(); map.repeat.set(Math.max(1, w / 12), Math.max(1, h / 12)); map.needsUpdate = true;
    const em = ft.emissive.clone(); em.repeat.copy(map.repeat); em.needsUpdate = true;
    const facade = std({ map, roughness: 0.9, emissive: 0xffffff, emissiveMap: em, emissiveIntensity: 1.3 });
    const mats = side < 0 ? [facade, darkM, darkM, darkM, darkM, darkM] : [darkM, facade, darkM, darkM, darkM, darkM];
    const y0 = hollow ? hollow[0] : 0, y1 = hollow ? hollow[1] : 0;
    // caixa principal (de y1 até o topo); vão térreo (y0..y1) só com uma lâmina fina de fachada
    const b = new THREE.Mesh(new THREE.BoxGeometry(d, h - y1, w), mats);
    b.position.set(side * (7.5 + d / 2), y1 + (h - y1) / 2, z0 - w / 2);
    root.add(b);
    if (hollow && y1 > y0) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(0.5, y1 - y0, w), mats);
      slab.position.set(side * (7.5 + 0.25), y0 + (y1 - y0) / 2, z0 - w / 2); root.add(slab);
    }
    buildingList.push({ side, z0, w, h });
    return b;
  };
  // módulo térreo: porta de aço/placa
  const addShutter = (side, zc, w, h = 3.4, tex = 0, sign = null) => {
    const tx = shutterTexes[tex % shutterTexes.length].clone(); tx.repeat.set(w / 2.4, h / 2.4); tx.needsUpdate = true;
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), std({ map: tx, roughness: 0.45, metalness: 0.5 }));
    sh.position.set(side * 7.46, h / 2, zc); sh.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2; root.add(sh);
    const box_ = box(0.4, 0.3, w, std({ color: 0x23252a, roughness: 0.7 })); box_.position.set(side * 7.3, h + 0.15, zc); root.add(box_);
    if (sign) {
      const st = T.signTexture(sign.text, sign.opts || {});
      const sm = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w, 5), Math.min(w, 5) / 4), new THREE.MeshStandardMaterial({ map: st, roughness: 0.6, emissive: 0xffffff, emissiveMap: st, emissiveIntensity: sign.glow ?? 0.12 }));
      sm.position.set(side * 7.44, h + 0.75, zc); sm.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2; root.add(sm);
    }
  };

  // esquerda (x<0)  /  direita (x>0): sequência a partir de z=+30 para -150
  const heights = [16, 22, 19, 25, 17, 21, 24, 18, 20, 26, 17, 22, 19, 23, 18];
  let zc = 34; let i = 0;
  const leftSpecial = [ // [z_start, w, tipo]
    [3.4, 6.8, 'padaria'], [-6.4, 4.2, 'rampa'], [-13.6, 7.8, 'galeria'],
  ];
  // construção: percorre blocos; reserva vãos especiais
  const HOLLOW = { 3.4: [3.6, 3.6], '-6.4': [3.4, 3.4], '-13.6': [4.2, 7.4] };
  const bz = [[34, 10], [24, 11], [13, 9.6], [3.4, 6.8], [-3.4, 3.0], [-6.4, 4.2], [-10.6, 3.0], [-13.6, 7.8], [-21.4, 11], [-32.4, 12], [-44.4, 10], [-54.4, 12], [-66.4, 12], [-78.4, 12], [-90.4, 14], [-104.4, 14], [-118.4, 16], [-134.4, 16]];
  for (const [z0, w] of bz) {
    const h = heights[i++ % heights.length];
    addBuilding(-1, z0, w, h, i + 1, HOLLOW[z0] || null);
  }
  const bzR = [[34, 9], [25, 12], [13, 10], [3, 12], [-9, 9], [-18, 11], [-29, 11], [-40, 12], [-52, 12], [-64, 12], [-76, 12], [-88, 14], [-102, 14], [-116, 16], [-132, 18]];
  i = 3;
  for (const [z0, w] of bzR) { const h = heights[i++ % heights.length]; addBuilding(1, z0, w, h, i + 2); }

  // térreo esquerdo
  addShutter(-1, 29, 10, 3.4, 0, { text: 'ÓTICA LUZ', opts: { bg: '#1c2230', fg: '#bfd4f0', border: '#bfd4f0' } });
  addShutter(-1, 18.5, 11, 3.4, 1, { text: 'SAPATARIA', opts: { bg: '#2a1c14', fg: '#f0c98a' } });
  addShutter(-1, 8.2, 9.6, 3.4, 2);
  // ... padaria (z∈[-3.4, 3.4]) é construída abaixo; rampa em [-10.6,-6.4]; galeria em [-21.4,-13.6]
  addShutter(-1, -4.9, 3.0, 3.4, 3);
  addShutter(-1, -12.1, 3.0, 3.4, 1);
  addShutter(-1, -26.9, 11, 3.4, 0, { text: 'CELULARES & ACESSÓRIOS', opts: { bg: '#10281f', fg: '#9ff0c8', font: 'bold 96px Arial, sans-serif' } });
  addShutter(-1, -38.4, 12, 3.4, 2, { text: 'LANCHES 24H', opts: { bg: '#3a1414', fg: '#ffd7a0' } });
  addShutter(-1, -49.4, 10, 3.4, 3);
  addShutter(-1, -60.4, 12, 3.4, 1, { text: 'HOTEL CENTRAL', opts: { bg: '#161616', fg: '#ff6a5a', border: '#ff6a5a' } });
  addShutter(-1, -72.4, 12, 3.4, 0);
  // térreo direito
  addShutter(1, 29.5, 9, 3.4, 2);
  addShutter(1, 19, 12, 3.4, 0, { text: 'MERCADO DO ZÉ', opts: { bg: '#1f2a14', fg: '#e8f09a' } });
  addShutter(1, 8, 10, 3.4, 1);
  addShutter(1, -3.6, 5, 3.4, 3);
  addShutter(1, -14.5, 9, 3.4, 0, { text: 'BAR DO PORTUGA', opts: { bg: '#2b1a2b', fg: '#f6c9ff' } });
  addShutter(1, -23.5, 11, 3.4, 2);
  addShutter(1, -34.5, 11, 3.4, 1);
  addShutter(1, -46, 12, 3.4, 3, { text: 'FERRAGENS', opts: { bg: '#201c14', fg: '#f0d890' } });
  addShutter(1, -58, 12, 3.4, 0);
  addShutter(1, -70, 12, 3.4, 2);

  // ---------------- farmácia (direita, z∈[-12,-6]) com neon verde
  const farm = new THREE.Group(); farm.position.set(7.44, 0, -9);
  const farmSh = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 3.4), std({ map: shutterTexes[2], roughness: 0.4, metalness: 0.5 })); farmSh.position.set(0, 1.7, 0); farmSh.rotation.y = -Math.PI / 2; farm.add(farmSh);
  const farmSign = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 1.0), new THREE.MeshBasicMaterial({ map: T.signTexture('FARMÁCIA 24H', { bg: '#04120a', fg: '#46ff9a', w: 1024, h: 200, font: 'bold 120px Arial, sans-serif' }), transparent: false }));
  farmSign.position.set(-0.05, 3.9, 0); farmSign.rotation.y = -Math.PI / 2; farm.add(farmSign);
  const cross = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({ map: T.neonCrossTexture('#46ff9a'), transparent: false }));
  cross.position.set(-0.55, 5.4, 2.1); cross.rotation.y = -Math.PI / 2; farm.add(cross);
  const cross2 = cross.clone(); cross2.rotation.y = Math.PI / 2; cross2.position.x = -0.6; farm.add(cross2);
  root.add(farm);

  // ---------------- padaria (esquerda, z∈[-3.4, 3.4])
  const bak = new THREE.Group(); bak.position.set(-7.5, 0, 0); root.add(bak);
  // paredes do fundo e interior
  const inM = std({ color: 0x2a211c, roughness: 0.9 }), tileM = std({ map: T.wallTileTexture(), roughness: 0.6 });
  const floorIn = box(6, 0.1, 6.8, std({ map: T.graniteTexture(), roughness: 0.4 })); floorIn.position.set(-3, 0.05, 0); bak.add(floorIn);
  const back = box(0.2, 3.6, 6.8, tileM); back.position.set(-6.1, 1.8, 0); bak.add(back);
  const ceil = box(6, 0.2, 6.8, inM); ceil.position.set(-3, 3.5, 0); bak.add(ceil);
  for (const s of [-1, 1]) { const sw = box(6, 3.6, 0.2, inM); sw.position.set(-3, 1.8, s * 3.5); bak.add(sw); }
  // balcão refrigerado + pães
  const counter = box(0.8, 1.05, 4.6, std({ color: 0x6a1d18, roughness: 0.5 })); counter.position.set(-1.6, 0.52, 0.2); bak.add(counter);
  const cglass = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 4.4), new THREE.MeshStandardMaterial({ color: 0xaad0e0, roughness: 0.05, metalness: 0.8, transparent: true, opacity: 0.25 })); cglass.position.set(-1.6, 1.3, 0.2); bak.add(cglass);
  const breadM = std({ color: 0xc58a43, roughness: 0.8, emissive: 0x3a1c08, emissiveIntensity: 0.25 });
  for (let k = 0; k < 26; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), breadM); b.scale.set(1.3, 0.7, 0.8); b.position.set(-1.6 + (k % 2) * 0.2 - 0.1, 1.17 + (k % 3) * 0.002, -1.8 + k * 0.16); bak.add(b); }
  const rack = box(0.3, 2.4, 4.8, std({ color: 0x3a2a1f, roughness: 0.8 })); rack.position.set(-5.7, 1.4, 0); bak.add(rack);
  for (let r = 0; r < 4; r++) for (let k = 0; k < 9; k++) { const lf = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.22, 4, 8), breadM); lf.rotation.x = Math.PI / 2; lf.position.set(-5.45, 0.8 + r * 0.52, -2 + k * 0.5); bak.add(lf); }
  // relógio/LED vermelho de standby e luz fria da geladeira
  const led = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.18), new THREE.MeshBasicMaterial({ color: 0xff2a1a })); led.position.set(-5.9, 2.6, 1.6); led.rotation.y = Math.PI / 2; bak.add(led);
  const fridge = new THREE.PointLight(0xbfe6ff, 2.2, 8, 2); fridge.position.set(-1.2, 1.7, 0.2); bak.add(fridge); root.userData.bakeryLight = fridge;
  const redL = new THREE.PointLight(0xff3a1a, 1.2, 6, 2); redL.position.set(-5.5, 2.5, 1.6); bak.add(redL);
  // vitrine espelhada (Reflector com alpha)
  const vit = new Reflector(new THREE.PlaneGeometry(6.4, 2.5), { textureWidth: W >> 1, textureHeight: H >> 1, color: 0xffffff, clipBias: 0.003, shader: GLASS_SHADER });
  vit.material.transparent = true; vit.material.depthWrite = true; vit.material.uniforms.uAlpha.value = 0.55;
  vit.rotation.y = Math.PI / 2; vit.position.set(0.02, 1.85, 0); vit.renderOrder = 5; bak.add(vit); root.userData.vitrine = vit;
  // moldura da vitrine e rodapé de alvenaria
  const frameM = std({ color: 0x0c0d0f, roughness: 0.45, metalness: 0.6 });
  for (const z of [-3.2, -1.07, 1.07, 3.2]) { const fm = box(0.12, 2.6, 0.1, frameM); fm.position.set(0.05, 1.85, z); bak.add(fm); }
  const fm2 = box(0.12, 0.1, 6.5, frameM); fm2.position.set(0.05, 3.1, 0); bak.add(fm2); const fm3 = fm2.clone(); fm3.position.y = 0.6; bak.add(fm3);
  const sill = box(0.5, 0.6, 7.0, std({ color: 0x4a4540, roughness: 0.8 })); sill.position.set(0.15, 0.3, 0); bak.add(sill);
  const bakSign = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 0.9), std({ map: T.signTexture('PADARIA PÃO DOURADO', { bg: '#2b1b12', fg: '#f4d9a0', w: 1400, h: 200, font: 'bold 110px Georgia, serif', border: '#f4d9a0' }), roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0.1 }));
  bakSign.rotation.y = Math.PI / 2; bakSign.position.set(0.1, 3.7, 0); bak.add(bakSign);
  const bakAw = box(0.9, 0.06, 6.8, std({ color: 0x7a1d1d, roughness: 0.8 })); bakAw.position.set(0.45, 3.45, 0); bakAw.rotation.z = -0.15; bak.add(bakAw);

  // ---------------- rampa de garagem (esquerda, z∈[-10.6,-6.4])
  const ramp = new THREE.Group(); ramp.position.set(-7.5, 0, -8.5); root.add(ramp);
  const rampConc = std({ map: T.concreteTexture(8, false), roughness: 0.92 });
  const slope = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 4.0), std({ map: T.concreteTexture(9, false), roughness: 0.7 })); slope.rotation.set(-Math.PI / 2, 0, -0.25); slope.position.set(-2.6, -0.1, 0); ramp.add(slope);
  const gateM = std({ map: shutterTexes[3], roughness: 0.5, metalness: 0.6 });
  const gate = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 2.8), gateM); gate.position.set(-4.6, 0.3, 0); gate.rotation.y = Math.PI / 2; ramp.add(gate);
  const rampBack = box(0.3, 4, 4.4, concM); rampBack.position.set(-5.0, 1.8, 0); ramp.add(rampBack);
  // muretas de concreto (parapeitos) ao longo da calçada: lado da rua
  const mu = std({ map: T.concreteTexture(12, true, 1024, 512), roughness: 0.88 });
  const mur1 = box(0.32, 1.12, 4.3, mu); mur1.position.set(1.65, 0.56, 0); ramp.add(mur1); // x ≈ -5.85 no mundo
  const mur1cap = box(0.4, 0.07, 4.4, std({ color: 0x77766f, roughness: 0.8 })); mur1cap.position.set(1.65, 1.15, 0); ramp.add(mur1cap);
  for (const s of [-1, 1]) { const mw = box(2.4, 1.1, 0.28, mu); mw.position.set(0.45, 0.55, s * 2.15); ramp.add(mw); }
  const pil = box(0.45, 3.4, 0.45, concM); pil.position.set(0.1, 1.7, 2.4); ramp.add(pil); const pil2 = pil.clone(); pil2.position.z = -2.4; ramp.add(pil2);
  // lixeiras, saco de lixo, caixa de papelão
  const bag = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), std({ color: 0x0a0a0c, roughness: 0.3 })); bag.scale.set(1, 0.85, 1); bag.position.set(-6.2, 0.22, -4.1); root.add(bag);
  const bag2 = bag.clone(); bag2.position.set(-6.0, 0.2, -3.7); bag2.scale.set(0.8, 0.7, 0.8); root.add(bag2);

  // ---------------- galeria comercial: fachada, portas de vidro e marquise de zinco (esquerda, z∈[-21.4,-13.6], centro -17.5)
  const gal = new THREE.Group(); gal.position.set(-7.5, 0, -17.5); root.add(gal);
  // pórtico: pilares laterais + verga (vão da porta livre: z_mundo ∈ [-19,-16])
  const portM = std({ color: 0x6e6a60, roughness: 0.8 });
  for (const zl of [2.7, -2.7]) { const wl = box(0.5, 4.2, 2.4, portM); wl.position.set(-0.2, 2.1, zl); gal.add(wl); }
  const lint = box(0.5, 1.5, 3.0, portM); lint.position.set(-0.2, 3.45, 0.0); gal.add(lint);
  const galSign = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 0.7), std({ map: T.signTexture('GALERIA CENTRAL', { bg: '#101418', fg: '#e6dcb8', w: 1200, h: 210, font: 'bold 120px Georgia, serif', border: '#e6dcb8' }), roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0.06 }));
  galSign.rotation.y = Math.PI / 2; galSign.position.set(0.12, 4.4, 0); gal.add(galSign);
  // portas de vidro temperado (painéis que podem estilhaçar)
  const doorGlass = new THREE.MeshStandardMaterial({ color: 0x9fb8c4, roughness: 0.05, metalness: 0.7, transparent: true, opacity: 0.28, envMapIntensity: 1.2, side: THREE.DoubleSide, depthWrite: false });
  const doorFrame = std({ color: 0x1a1c1f, roughness: 0.35, metalness: 0.8 });
  const doors = [];
  for (const s of [-1, 1]) {
    const dg = new THREE.Group(); dg.position.set(0.05, 0, s * 0.78);
    const gl = new THREE.Mesh(new THREE.BoxGeometry(0.03, 2.5, 1.46), doorGlass); gl.position.y = 1.35; dg.add(gl);
    for (const [y, h] of [[0.12, 0.2], [2.52, 0.12]]) { const fr = box(0.06, h, 1.5, doorFrame); fr.position.y = y; dg.add(fr); }
    const hnd = box(0.05, 0.9, 0.04, std({ color: 0xb8bcc0, metalness: 1, roughness: 0.2 })); hnd.position.set(0.06, 1.1, -s * 0.62); dg.add(hnd);
    gal.add(dg); doors.push(dg);
  }
  // cacos de vidro (instâncias) para estilhaçar a porta
  const shardGeo = new THREE.BufferGeometry(); shardGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.09, 0.02, 0, 0.03, 0.1, 0], 3)); shardGeo.computeVertexNormals();
  const shardMat = new THREE.MeshStandardMaterial({ color: 0xc7e0ea, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  const NSH = 220; const shards = new THREE.InstancedMesh(shardGeo, shardMat, NSH); shards.frustumCulled = false; gal.add(shards);
  const shardData = Array.from({ length: NSH }, () => ({ p: new THREE.Vector3(0.05, rng.f(0.1, 2.5), rng.f(-1.5, 1.5)), v: new THREE.Vector3(rng.f(-4.5, -1), rng.f(-1, 3), rng.f(-3, 3)), r: new THREE.Vector3(rng.f(0, 6), rng.f(0, 6), rng.f(0, 6)), w: new THREE.Vector3(rng.f(-12, 12), rng.f(-12, 12), rng.f(-12, 12)), s: rng.f(0.6, 1.8) }));
  root.userData.doorShards = { mesh: shards, data: shardData, group: gal }; root.userData.doors = doors;

  // marquise de zinco: estrutura + painéis ondulados que despencam; ancorada em x=-7.5 (fachada), projeta 3 m sobre a calçada
  const awn = new THREE.Group(); awn.position.set(-7.5, 3.55, -17.5); root.add(awn);
  const zincTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d'); for (let y = 0; y < 256; y++) { const s = 0.5 + 0.5 * Math.sin((y / 256) * Math.PI * 2 * 12); const b = 90 + 70 * s + Math.random() * 12; g.fillStyle = `rgb(${b * 0.96},${b},${b * 1.04})`; g.fillRect(0, y, 256, 1); } for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(110,70,40,${Math.random() * 0.25})`; g.fillRect(Math.random() * 256, Math.random() * 256, Math.random() * 40, Math.random() * 6); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
  const zincM = std({ map: zincTex, roughness: 0.42, metalness: 0.75, side: THREE.DoubleSide });
  const panels = [];
  const NP = 6;
  for (let k = 0; k < NP; k++) {
    const pg = new THREE.Group();
    const geo = new THREE.PlaneGeometry(3.0, 8.0 / NP * 0.98, 1, 14); geo.rotateX(-Math.PI / 2);
    const pp = geo.attributes.position; for (let v = 0; v < pp.count; v++) pp.setY(v, 0.07 * Math.sin(pp.getZ(v) * 18));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, zincM); mesh.position.set(1.5, 0, 0); pg.add(mesh);
    pg.position.set(0, 0, -4 + (k + 0.5) * (8 / NP)); awn.add(pg);
    panels.push({ g: pg, k, tFall: 51.6 + k * 1.45 + (k % 2) * 0.5, z0: pg.position.z });
  }
  const frameBars = [];
  for (const z of [-4.0, 0, 4.0]) { const b = box(3.1, 0.1, 0.1, std({ color: 0x23252a, roughness: 0.5, metalness: 0.7 })); b.position.set(1.55, -0.05, z); awn.add(b); frameBars.push(b); }
  for (const x of [3.0]) for (const z of [-3.9, 3.9]) { const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.4, 6), std({ color: 0x2b2c30, metalness: 0.8, roughness: 0.4 })); rod.position.set(x, -1.7, z); awn.add(rod); frameBars.push(rod); }
  const skylight = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 1.8), new THREE.MeshStandardMaterial({ color: 0xa8c8d2, roughness: 0.08, metalness: 0.5, transparent: true, opacity: 0.4 })); skylight.position.set(1.5, 0.02, 0); awn.add(skylight); root.userData.skylight = skylight;
  root.userData.awning = { group: awn, panels, bars: frameBars };
  // janela do andar de cima (vidro que estilhaça): na fachada acima da marquise
  const winUp = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.6), new THREE.MeshStandardMaterial({ color: 0x0a1118, roughness: 0.06, metalness: 0.9 })); winUp.rotation.y = Math.PI / 2; winUp.position.set(0.05, 5.7, 1.4); gal.add(winUp); root.userData.winUp = winUp;
  root.userData.gal = gal;

  // ---------------- postes de luz (sódio) — luminárias + brilho + cone de luz
  const poleM = std({ color: 0x1c1e21, roughness: 0.5, metalness: 0.7 });
  const glowMat = new THREE.SpriteMaterial({ map: glow, color: 0xffa14a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const beamMat = new THREE.MeshBasicMaterial({ map: beam, color: 0xff9a3c, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const lampZ = [];
  for (let z = 10; z > -150; z -= 14) lampZ.push(z);
  lampZ.forEach((z, idx) => {
    const side = idx % 2 === 0 ? -1 : 1;
    const x = side * 4.9;
    const pole = new THREE.Group(); pole.position.set(x, 0, z);
    pole.add((() => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 8.2, 8), poleM); p.position.y = 4.1; return p; })());
    const arm = box(1.9, 0.08, 0.08, poleM); arm.position.set(-side * 0.95, 8.2, 0); pole.add(arm);
    const head = box(0.9, 0.16, 0.36, poleM); head.position.set(-side * 1.7, 8.18, 0); pole.add(head);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.26), new THREE.MeshBasicMaterial({ color: 0xffc27a })); lamp.position.set(-side * 1.7, 8.08, 0); pole.add(lamp);
    const sp = new THREE.Sprite(glowMat.clone()); sp.scale.set(4.2, 4.2, 1); sp.position.set(-side * 1.7, 8.0, 0); pole.add(sp);
    const bm = new THREE.Mesh(new THREE.ConeGeometry(2.8, 8, 24, 1, true), beamMat.clone()); bm.position.set(-side * 1.7, 4.05, 0); bm.material.opacity = 0.075; pole.add(bm);
    root.add(pole);
    lampsData.push({ pos: new THREE.Vector3(x - side * 1.7, 7.9, z), idx, sprite: sp, beam: bm, lamp });
  });
  root.userData.lampsData = lampsData;

  // ---------------- viaduto (z ∈ [-96, -80]) sobre a rua
  const via = new THREE.Group(); via.position.set(0, 0, -88); root.add(via);
  const deckM = std({ map: T.concreteTexture(21, true, 1024, 512), roughness: 0.9 });
  const deck = box(80, 2.0, 18, deckM); deck.position.set(0, 7.2, 0); via.add(deck);
  const deckLow = box(80, 0.4, 18, std({ color: 0x1b1d1f, roughness: 1 })); deckLow.position.set(0, 6.15, 0); via.add(deckLow);
  for (const s of [-1, 1]) {
    for (const z of [-6.4, 6.4]) { const p = new THREE.Mesh(new THREE.BoxGeometry(1.5, 6.2, 1.5), std({ map: T.concreteTexture(30 + Math.round(s) + Math.round(z), true, 512, 1024), roughness: 0.88 })); p.position.set(s * 5.6, 3.1, z); via.add(p); const cap = box(2.6, 0.5, 2.0, concM); cap.position.set(s * 5.6, 6.0, z); via.add(cap); }
    const wallV = box(24, 6.2, 18, std({ map: T.concreteTexture(40 + Math.round(s), true), roughness: 0.9 })); wallV.position.set(s * 20, 3.1, 0); via.add(wallV);
  }
  // lâmpadas sob o viaduto (sódio fraco) — iluminam o homem
  for (const z of [-3, 3]) for (const x of [-2.5, 2.5, 0]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.3), new THREE.MeshBasicMaterial({ color: 0xffb877 })); l.position.set(x, 6.0, z); via.add(l);
    const sp = new THREE.Sprite(glowMat.clone()); sp.scale.set(3.2, 3.2, 1); sp.position.set(x, 5.9, z); via.add(sp);
  }
  lampsData.push({ pos: new THREE.Vector3(0, 5.8, -85), idx: -1 }, { pos: new THREE.Vector3(0, 5.8, -91), idx: -2 });
  root.userData.via = via;

  // ---------------- semáforo âmbar piscando (z=-62)
  const sem = new THREE.Group(); sem.position.set(4.0, 0, -62);
  sem.add((() => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 5.2, 8), poleM); p.position.y = 2.6; return p; })());
  const sbox = box(0.35, 0.95, 0.3, std({ color: 0x151515, roughness: 0.6 })); sbox.position.set(0, 5.2, 0); sem.add(sbox);
  const amb = new THREE.Mesh(new THREE.CircleGeometry(0.11, 16), new THREE.MeshBasicMaterial({ color: 0xffb020 })); amb.position.set(0, 5.2, 0.155); sem.add(amb);
  const ambSp = new THREE.Sprite(glowMat.clone()); ambSp.scale.set(2.2, 2.2, 1); ambSp.position.set(0, 5.2, 0.4); sem.add(ambSp);
  root.add(sem); root.userData.sem = { amb, sp: ambSp, pos: new THREE.Vector3(4.0, 5.2, -61.8) };

  // ---------------- EcoSport estacionado à direita + outros carros
  const eco = buildSUV(0x3a4a52); eco.position.set(3.4, 0, -5.4); eco.rotation.y = Math.PI + 0.1; root.add(eco); root.userData.eco = eco;
  const others = [[3.5, -21, 0xa8a8a0, 0.04], [3.6, -47, 0x6f1e1e, Math.PI - 0.04], [3.5, -66, 0x2d3a56, 0.1], [3.6, -73, 0x1a1a1a, Math.PI + 0.06]];
  for (const [x, z, c, ry] of others) { const car = buildSUV(c); car.scale.set(1, 0.95, 0.95); car.position.set(x, 0, z); car.rotation.y = ry; root.add(car); }

  // ---------------- fios elétricos cruzando a rua
  const wireM = new THREE.LineBasicMaterial({ color: 0x050507 });
  for (let z = 22; z > -75; z -= 11) {
    const pts = []; for (let k = 0; k <= 20; k++) { const u = k / 20; pts.push(new THREE.Vector3(lerp(-8, 8, u), 9.6 - 1.1 * Math.sin(Math.PI * u) + (z % 3) * 0.08, z + Math.sin(u * 8) * 0.2)); }
    root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireM));
  }

  // ---------------- lixo espalhado, papéis, poças de sangue
  const trashM = std({ color: 0xd7d3c4, roughness: 0.9, side: THREE.DoubleSide });
  for (let k = 0; k < 40; k++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.3), trashM); p.rotation.set(-Math.PI / 2 + rng.f(-0.1, 0.1), 0, rng.f(0, 6.28)); p.position.set(rng.f(-7, 7), 0.012, rng.f(-40, 14)); root.add(p); }
  const bd = T.bloodDecal(4);
  for (const [x, z, s] of [[2.4, -6.7, 2.2], [3.1, -4.4, 1.6], [-3.0, -26, 2.5]]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ map: bd, transparent: true, depthWrite: false, opacity: 0.8, polygonOffset: true, polygonOffsetFactor: -4 })); b.rotation.x = -Math.PI / 2; b.position.set(x, 0.015, z); root.add(b); }

  // ---------------- prédios distantes (silhuetas) e luzes de aviação
  const redM = new THREE.MeshBasicMaterial({ color: 0xff2010 });
  const skyline = [];
  for (let k = 0; k < 22; k++) { const hh = rng.f(40, 150), ww = rng.f(14, 30); const bx = (k % 2 ? 1 : -1) * rng.f(22, 80), bz = -rng.f(170, 330);
    const tb = box(ww, hh, ww, std({ color: 0x0c0f14, roughness: 1, emissive: 0x1a1408, emissiveIntensity: 0.35, map: facTex[k % 6].emissive })); tb.position.set(bx, hh / 2, bz); root.add(tb);
    if (hh > 90) { const rl = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), redM); rl.position.set(bx, hh + 1, bz); root.add(rl); skyline.push(rl); } }
  root.userData.skyline = skyline;

  // ---------------- chuva fina (linhas) + bruma (sprites)
  const NR = 2400; const rg = new THREE.BufferGeometry(); const rpos = new Float32Array(NR * 6); rg.setAttribute('position', new THREE.BufferAttribute(rpos, 3));
  const rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xa9c4ff, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false })); rain.frustumCulled = false; root.add(rain);
  const rainSeed = Array.from({ length: NR }, () => ({ x: rng.f(0, 1), y: rng.f(0, 1), z: rng.f(0, 1), v: rng.f(0.8, 1.3) }));
  root.userData.rain = { mesh: rain, seed: rainSeed, pos: rpos };
  const mist = [];
  for (let k = 0; k < 26; k++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,255,255,0.5)', 'rgba(255,255,255,0.2)'), color: 0x6f8ca6, transparent: true, opacity: 0.1, depthWrite: false, fog: true })); s.scale.set(18, 5, 1); s.position.set(rng.f(-6, 6), rng.f(0.8, 3), -rng.f(5, 110)); root.add(s); mist.push(s); }
  root.userData.mist = mist;

  root.userData.groundMesh = groundMesh;
  root.userData.zinc = { zincM };
  return root;
}

// chuva: posições dependem só do tempo (determinístico)
export function updateRain(rain, t, cam) {
  const { seed, pos, mesh } = rain; const N = seed.length;
  const V = 14, len = 0.55;
  for (let i = 0; i < N; i++) {
    const s = seed[i];
    const x = cam.x + (s.x - 0.5) * 22, z = cam.z + (s.z - 0.5) * 30 - 6;
    const y = 12 - ((s.y * 12 + t * V * s.v) % 12) ;
    const k = i * 6;
    pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
    pos[k + 3] = x - 0.04; pos[k + 4] = y + len; pos[k + 5] = z - 0.02;
  }
  mesh.geometry.attributes.position.needsUpdate = true;
}
