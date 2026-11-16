// Galeria comercial abandonada (interior). Corredor ao longo de -X; centro em z=-17, largura 6 m.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import * as T from './textures.js';
import { GROUND_SHADER, glowTexture, beamTexture } from './world_street.js';
import { Rng, lerp } from './util.js';

const std = (o) => new THREE.MeshStandardMaterial(o);
const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);

export const GAL = { x0: -7.6, x1: -48.0, zc: -17.0, zl: -14.0, zr: -20.0, H: 7.0 };

export function buildGallery(ctx) {
  const { W, H } = ctx;
  const rng = new Rng(404);
  const root = new THREE.Group(); root.name = 'gallery';
  const glow = glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0.3)');
  const len = GAL.x0 - GAL.x1, cx = (GAL.x0 + GAL.x1) / 2;

  // ---------------- piso de granito polido (reflexo) ----------------
  const wetTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 4; const g = c.getContext('2d'); g.fillStyle = 'rgb(168,168,168)'; g.fillRect(0, 0, 4, 4); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
  const gran = T.graniteTexture(4);
  const floor = new Reflector(new THREE.PlaneGeometry(40.4, 7), { textureWidth: W >> 1, textureHeight: H >> 1, color: 0xffffff, clipBias: 0.003, shader: GROUND_SHADER });
  floor.rotation.x = -Math.PI / 2; floor.position.set(-28.2, 0, GAL.zc);
  floor.material.uniforms.tAlbedo.value = gran; floor.material.uniforms.tWet.value = wetTex;
  floor.material.uniforms.uTiled.value.set(3.2, 3.2, -80, -30); // mapeamento mundo→granito
  floor.material.uniforms.uRefl.value = 0.85; floor.material.uniforms.uAmb.value.set(0.05, 0.06, 0.065);
  root.add(floor); root.userData.floor = floor;

  // ---------------- paredes e forro ----------------
  const tileM = std({ map: T.wallTileTexture(), roughness: 0.55, color: 0xb8b2a2 });
  tileM.map.repeat.set(len / 3, 2); 
  const ceilM = std({ map: T.ceilingTexture(), roughness: 0.9 }); ceilM.map.repeat.set(len / 3, 2);
  const ceil = box(len + 2, 0.3, 7, ceilM); ceil.position.set(cx, GAL.H + 0.15, GAL.zc); root.add(ceil);
  const wallL = box(len + 2, GAL.H, 0.3, tileM); wallL.position.set(cx, GAL.H / 2, GAL.zl + 0.15); root.add(wallL);
  const wallR = box(len + 2, GAL.H, 0.3, tileM); wallR.position.set(cx, GAL.H / 2, GAL.zr - 0.15); root.add(wallR);
  const endWall = box(0.4, GAL.H, 7, tileM); endWall.position.set(GAL.x1 - 0.2, GAL.H / 2, GAL.zc); root.add(endWall);
  const entryWall = box(0.3, GAL.H, 7, std({ color: 0x15171a, roughness: 1 })); entryWall.position.set(GAL.x0 + 0.5, GAL.H, GAL.zc); entryWall.scale.y = 0.001; root.add(entryWall); // (a fachada real vem do mundo exterior)
  const rodape = (side) => { const b = box(len, 0.24, 0.06, std({ color: 0x1b1c1e, roughness: 0.5, metalness: 0.5 })); b.position.set(cx, 0.12, side < 0 ? GAL.zr + 0.05 : GAL.zl - 0.05); root.add(b); };
  rodape(-1); rodape(1);

  // ---------------- lojas (portas de aço + letreiros) ----------------
  const sh = [T.shutterTexture(11), T.shutterTexture(12), T.shutterTexture(13), T.shutterTexture(14, 512, 512, false)];
  const names = [
    ['LOTÉRICA', '#13243d', '#ffd23a'], ['ÓTICA VISÃO', '#1c2230', '#bfd4f0'], ['SAPATARIA', '#2a1c14', '#f0c98a'], ['CELULARES', '#10281f', '#9ff0c8'],
    ['BARBEARIA', '#2b1010', '#ffb3a0'], ['LANCHES', '#3a1414', '#ffd7a0'], ['VIDEOLOCADORA', '#1c142b', '#d6b8ff'], ['RELÓGIOS', '#1c1a10', '#f0e090'],
    ['ARMARINHOS', '#102b2b', '#a0f0f0'], ['CHAVEIRO 24H', '#2b2b10', '#f0f0a0'],
  ];
  const shopsL = [], shopsR = [];
  const modules = (side, xs, list) => {
    xs.forEach((x, k) => {
      const w = 4.2, h = 3.3;
      const tx = sh[(k + (side > 0 ? 1 : 0)) % sh.length].clone(); tx.repeat.set(w / 2.4, h / 2.4); tx.needsUpdate = true;
      const z = side > 0 ? GAL.zl - 0.02 : GAL.zr + 0.02, ry = side > 0 ? Math.PI : 0; // esquerda olha -Z, direita olha +Z
      const s = new THREE.Mesh(new THREE.PlaneGeometry(w, h), std({ map: tx, roughness: 0.45, metalness: 0.55 })); s.position.set(x, h / 2, z); s.rotation.y = ry; root.add(s);
      const [nm, bg, fg] = names[(k * 2 + (side > 0 ? 1 : 0)) % names.length];
      const st = T.signTexture(nm, { bg, fg, w: 900, h: 220, font: 'bold 110px Arial, sans-serif', border: fg });
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.88), std({ map: st, roughness: 0.55, emissive: 0xffffff, emissiveMap: st, emissiveIntensity: 0.1 })); sg.position.set(x, h + 0.62, z + (side > 0 ? -0.01 : 0.01)); sg.rotation.y = ry; root.add(sg);
      const gl = box(w, 0.3, 0.25, std({ color: 0x1b1c1e, roughness: 0.6, metalness: 0.6 })); gl.position.set(x, h + 0.12, z + (side > 0 ? -0.1 : 0.1)); root.add(gl);
      (side > 0 ? shopsL : shopsR).push({ x, w });
    });
  };
  modules(1, [-12.8, -17.2, -21.6, -26.0, -30.4, -34.8, -39.2, -43.6].filter((x) => true), names);
  modules(-1, [-33.0, -37.4, -41.8, -46.2 + 0], names);
  // faixa de banners e tubulações no forro alto
  for (let k = 0; k < 7; k++) { const bn = box(0.05, 1.9, 1.0, std({ color: [0x3a1c1c, 0x1c2a3a, 0x2a3a1c][k % 3], roughness: 0.9 })); bn.position.set(-10.5 - k * 5.6, 5.8, GAL.zl - 0.4); bn.rotation.y = 0; root.add(bn); }
  const duct = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, len, 12), std({ color: 0x8a8d90, roughness: 0.5, metalness: 0.7 })); duct.rotation.z = Math.PI / 2; duct.position.set(cx, GAL.H - 0.5, GAL.zc - 1.6); root.add(duct);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, len, 8), std({ color: 0x5b1c1c, roughness: 0.5, metalness: 0.5 })); pipe.rotation.z = Math.PI / 2; pipe.position.set(cx, GAL.H - 0.3, GAL.zc + 1.8); root.add(pipe);

  // ---------------- colunas ----------------
  const colM = std({ color: 0x8e8a80, roughness: 0.5 }), chromeM = std({ color: 0xc9ccd0, metalness: 1, roughness: 0.18 });
  for (let x = -11; x > -48; x -= 6) for (const z of [GAL.zl - 0.5, GAL.zr + 0.5]) {
    if (z < GAL.zc && x < -13.5 && x > -30.5) continue; // átrio da escada: sem colunas
    const c = box(0.55, GAL.H, 0.55, colM); c.position.set(x, GAL.H / 2, z); root.add(c);
    const tr = box(0.6, 1.1, 0.6, chromeM); tr.position.set(x, 0.55, z); root.add(tr);
  }

  // ---------------- luminárias fluorescentes (emissivas) + luzes de emergência ----------------
  const fixtures = [];
  const tubeOn = new THREE.MeshBasicMaterial({ color: 0xdff4ec });
  for (let x = -10; x > -48; x -= 4.4) for (const dz of [-1.2, 1.2]) {
    const m = tubeOn.clone(); const t = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.18), m); t.position.set(x, GAL.H - 0.05, GAL.zc + dz); root.add(t);
    const hsg = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xcfeee6, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.0 })); hsg.scale.set(3.0, 1.6, 1); hsg.position.set(x, GAL.H - 0.3, GAL.zc + dz); root.add(hsg);
    fixtures.push({ x, dz, mesh: t, sprite: hsg, seed: rng.f(0, 100), alive: rng.r() < 0.6 });
  }
  root.userData.fixtures = fixtures;
  // lâmpadas de emergência (sempre acesas, fracas) e placa EXIT
  const emerg = [];
  for (let x = -12; x > -48; x -= 9) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), new THREE.MeshBasicMaterial({ color: 0xffe7c4 })); e.position.set(x, 3.7, GAL.zl - 0.1); root.add(e); emerg.push(new THREE.Vector3(x, 3.4, GAL.zl - 0.6)); }
  root.userData.emerg = emerg;

  // ---------------- escada rolante desligada + mezanino ----------------
  const esc = new THREE.Group(); root.add(esc);
  const steelM = std({ color: 0x9aa0a4, metalness: 0.9, roughness: 0.28 }), rubberM = std({ color: 0x0a0a0a, roughness: 0.6 }), stepM = std({ color: 0x2c2e31, roughness: 0.4, metalness: 0.6 });
  const rise = 3.8, run = 6.8, ang = Math.atan2(rise, run), L = Math.hypot(run, rise);
  const escG = new THREE.Group(); escG.position.set(-15.2, 0, -21.7); escG.rotation.y = Math.PI; // local +X sobe para -X no mundo
  const incl = new THREE.Group(); incl.rotation.z = ang; escG.add(incl);
  for (let k = 0; k < Math.floor(L / 0.4); k++) { const st = box(0.4, 0.18, 1.0, stepM); st.position.set(k * 0.4 + 0.2, -0.08, 0); incl.add(st); const gr = box(0.4, 0.012, 1.0, std({ color: 0x151618, roughness: 0.9 })); gr.position.set(k * 0.4 + 0.2, 0.01, 0); incl.add(gr); }
  for (const s of [-1, 1]) {
    const sk = box(L, 0.42, 0.08, steelM); sk.position.set(L / 2, -0.15, s * 0.58); incl.add(sk);
    const bal = new THREE.Mesh(new THREE.BoxGeometry(L, 0.9, 0.025), new THREE.MeshStandardMaterial({ color: 0x9fb8c4, roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.22 })); bal.position.set(L / 2, 0.55, s * 0.6); incl.add(bal);
    const hr = box(L, 0.06, 0.09, rubberM); hr.position.set(L / 2, 1.02, s * 0.6); incl.add(hr);
  }
  esc.add(escG); root.userData.escalator = { group: escG, rise, run, ang, L };
  // mezanino (balcão sobre o corredor) à direita, y=3.8, de x=-22 a x=-36
  const mezM = std({ color: 0x5a574f, roughness: 0.7 });
  const mez = box(14, 0.4, 5.0, mezM); mez.position.set(-29, rise - 0.2, -22.0); root.add(mez);
  const mezRailG = new THREE.Mesh(new THREE.BoxGeometry(14, 1.0, 0.03), new THREE.MeshStandardMaterial({ color: 0x9fb8c4, roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.2 })); mezRailG.position.set(-29, rise + 0.55, -19.55); root.add(mezRailG);
  const mezRail = box(14, 0.06, 0.1, rubberM); mezRail.position.set(-29, rise + 1.05, -19.55); root.add(mezRail);
  const alcoveBack = box(len * 0.6, 8, 0.3, std({ color: 0x1b1a18, roughness: 1 })); alcoveBack.position.set(-26, 4, -24.6); root.add(alcoveBack);
  const alcoveSideTop = box(0.3, 8, 5, std({ color: 0x1b1a18, roughness: 1 })); alcoveSideTop.position.set(-13.7, 4, -22.0); root.add(alcoveSideTop);
  const alcoveCeil = box(30, 0.3, 5, std({ color: 0x151412, roughness: 1 })); alcoveCeil.position.set(-26, 7.6, -22.0); root.add(alcoveCeil);
  const alcFloor = box(30, 0.1, 5, std({ color: 0x1c1d1f, roughness: 0.5 })); alcFloor.position.set(-26, 0.0, -22.0); root.add(alcFloor);
  // parede direita aberta no átrio (corta o painel): vão entre x=-14 e x=-36 — desfaz wallR nesse trecho
  wallR.visible = false;
  for (const [a, b] of [[-7.8, -14.0], [-36.0, -48.2]]) { const w = box(Math.abs(b - a), GAL.H, 0.3, tileM); w.position.set((a + b) / 2, GAL.H / 2, GAL.zr - 0.15); root.add(w); }

  // ---------------- balcão da lotérica (móvel: encosta nas portas) ----------------
  const counter = new THREE.Group();
  const cm = std({ color: 0x1f3552, roughness: 0.45, metalness: 0.2 });
  const cb = box(2.6, 1.05, 0.8, cm); cb.position.y = 0.52; counter.add(cb);
  const top = box(2.7, 0.06, 0.9, std({ color: 0x7e8284, roughness: 0.45, metalness: 0.3 })); top.position.y = 1.08; counter.add(top);
  const gls = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.8, 0.04), new THREE.MeshStandardMaterial({ color: 0xaad0e0, roughness: 0.05, metalness: 0.8, transparent: true, opacity: 0.25 })); gls.position.set(0, 1.5, 0.3); counter.add(gls);
  const cs = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), std({ map: T.signTexture('LOTÉRICA', { bg: '#12335b', fg: '#ffd23a', w: 800, h: 200, font: 'bold 120px Arial, sans-serif', border: '#ffd23a' }), roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0.12 })); cs.position.set(0, 0.58, 0.41); counter.add(cs);
  const cs2 = cs.clone(); cs2.rotation.y = Math.PI; cs2.position.z = -0.41; counter.add(cs2);
  root.add(counter); root.userData.counter = counter;

  // ---------------- porta corta-fogo com corrente e cadeado (x=-47.9) ----------------
  const fd = new THREE.Group(); fd.position.set(GAL.x1 + 0.1, 0, GAL.zc); root.add(fd);
  const fdM = std({ color: 0x6b1c1c, roughness: 0.45, metalness: 0.65 });
  for (const s of [-1, 1]) { const d = box(0.1, 2.3, 1.0, fdM); d.position.set(0, 1.15, s * 0.52); fd.add(d); const bar = box(0.12, 0.08, 0.9, chromeM); bar.position.set(0.1, 1.05, s * 0.52); fd.add(bar); const win = box(0.02, 0.5, 0.25, std({ color: 0x050505, roughness: 0.1 })); win.position.set(0.06, 1.7, s * 0.52); fd.add(win); }
  const frm = box(0.2, 2.45, 2.2, std({ color: 0x2b2b2d, roughness: 0.6, metalness: 0.5 })); frm.position.set(-0.05, 1.22, 0); frm.scale.set(1, 1, 1); fd.add(frm); frm.position.x = -0.1;
  const chain = new THREE.Group();
  for (let k = 0; k < 16; k++) { const lk = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 6, 10), chromeM); lk.position.set(0.17, 1.05 + Math.sin(k / 15 * 3.14) * -0.04, -0.55 + k * 0.073); lk.rotation.set(k % 2 ? 0 : Math.PI / 2, 0, 0); chain.add(lk); }
  const lock = box(0.07, 0.1, 0.05, std({ color: 0xd2a82a, metalness: 1, roughness: 0.25 })); lock.position.set(0.18, 0.96, 0.02); chain.add(lock);
  const shack = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.008, 6, 10, Math.PI), chromeM); shack.position.set(0.18, 1.04, 0.02); chain.add(shack);
  fd.add(chain); root.userData.chain = chain; root.userData.fireDoor = fd;
  const exitS = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.3), new THREE.MeshBasicMaterial({ map: T.signTexture('SAÍDA', { bg: '#04200c', fg: '#46ff7a', w: 600, h: 200, font: 'bold 130px Arial, sans-serif' }) })); exitS.position.set(0.13, 2.7, 0); exitS.rotation.y = Math.PI / 2; fd.add(exitS);
  const exitGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0x46ff7a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); exitGlow.scale.set(4, 2, 1); exitGlow.position.set(0.5, 2.7, 0); fd.add(exitGlow); root.userData.exitGlow = exitGlow;
  const alarmL = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff2a1a })); alarmL.position.set(0.15, 3.1, 1.4); alarmL.rotation.z = Math.PI / 2; alarmL.rotation.x = Math.PI / 2; fd.add(alarmL); root.userData.alarmL = alarmL;

  // ---------------- props ----------------
  const bench = new THREE.Group();
  const bm = std({ color: 0x4a3a2a, roughness: 0.8 });
  const seat = box(1.8, 0.07, 0.45, bm); seat.position.y = 0.45; bench.add(seat); for (const s of [-0.8, 0.8]) { const lg = box(0.06, 0.45, 0.4, std({ color: 0x1a1a1a, metalness: 0.6, roughness: 0.5 })); lg.position.set(s, 0.22, 0); bench.add(lg); }
  bench.position.set(-24.0, 0, -15.0); bench.rotation.set(0, 0.5, 0.0); root.add(bench);
  const bench2 = bench.clone(); bench2.position.set(-38.5, 0, -18.6); bench2.rotation.set(Math.PI / 2 * 0.0, 2.2, 1.4); bench2.position.y = 0.22; root.add(bench2); // tombado
  for (const [x, z] of [[-15.5, -14.6], [-31.0, -19.3], [-40.8, -14.7]]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.5, 12), std({ color: 0x5a4a3a, roughness: 0.9 })); pot.position.set(x, 0.25, z); root.add(pot);
    for (let k = 0; k < 9; k++) { const lf = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), std({ color: 0x1b3a1f, roughness: 0.8 })); lf.scale.set(1, 0.4, 0.6); lf.position.set(x + rng.f(-0.2, 0.2), 0.6 + k * 0.1, z + rng.f(-0.2, 0.2)); lf.rotation.set(rng.f(0, 3), rng.f(0, 3), rng.f(0, 3)); root.add(lf); }
  }
  const trash = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.8, 12), std({ color: 0x3a3d40, metalness: 0.7, roughness: 0.4 })); trash.position.set(-19.0, 0.4, -14.5); root.add(trash);
  const vend = new THREE.Group(); const vb = box(1.0, 2.0, 0.8, std({ color: 0x8a1a1a, roughness: 0.4 })); vb.position.y = 1.0; vend.add(vb);
  const vf = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.4), new THREE.MeshBasicMaterial({ color: 0x9fd2ff })); vf.position.set(0, 1.15, 0.405); vend.add(vf);
  vend.position.set(-35.0, 0, -14.4); vend.rotation.y = Math.PI; root.add(vend);
  const vlight = new THREE.PointLight(0x9fd2ff, 3.0, 7, 2); vlight.position.set(-35.0, 1.4, -15.2); root.add(vlight); root.userData.vendLight = vlight;
  // papéis, sacolas, sapato, celular caído, mochila
  const paperM = std({ color: 0xe0dccc, roughness: 0.9, side: THREE.DoubleSide });
  for (let k = 0; k < 60; k++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.3), paperM); p.rotation.set(-Math.PI / 2 + rng.f(-0.12, 0.12), 0, rng.f(0, 6.28)); p.position.set(rng.f(-46, -9), 0.012, rng.f(-19.5, -14.5)); root.add(p); }
  const bagM = std({ color: 0xc23b2e, roughness: 0.7 }); const sb = box(0.35, 0.35, 0.18, bagM); sb.position.set(-12.2, 0.17, -16.2); sb.rotation.y = 0.6; root.add(sb);
  const shoe = box(0.1, 0.07, 0.26, std({ color: 0xd8d8d2, roughness: 0.7 })); shoe.position.set(-14.2, 0.04, -17.4); shoe.rotation.y = 1.1; root.add(shoe);
  const bk = box(0.34, 0.45, 0.2, std({ color: 0x1f2a44, roughness: 0.8 })); bk.position.set(-20.6, 0.22, -15.4); bk.rotation.y = 0.3; root.add(bk);
  // sangue: poças, arrastes e marcas de mão
  const bd = T.bloodDecal(14), bd2 = T.bloodDecal(15);
  for (const [x, z, s] of [[-13.5, -16.0, 2.6], [-22.0, -17.8, 2.2], [-30.0, -16.2, 3.0], [-41.0, -17.0, 2.6]]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ map: bd, transparent: true, depthWrite: false, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -4 })); b.rotation.x = -Math.PI / 2; b.position.set(x, 0.015, z); root.add(b); }
  for (const [x, z, s] of [[-18.0, -14.1, 1.4], [-27.0, -19.9, 1.6], [-33.4, -14.1, 1.5]]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ map: bd2, transparent: true, depthWrite: false, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -4 })); b.position.set(x, 1.3, z + (z < -17 ? 0.04 : -0.04)); b.rotation.y = z < -17 ? 0 : Math.PI; root.add(b); }
  // arrastes longos ao longo do piso (para onde as vítimas foram levadas)
  const smearTex = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 64; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 512, 0); gr.addColorStop(0, 'rgba(70,4,6,0.0)'); gr.addColorStop(0.15, 'rgba(90,6,8,0.85)'); gr.addColorStop(1, 'rgba(70,4,6,0.0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(0, 22); g.lineTo(512, 8); g.lineTo(512, 54); g.lineTo(0, 44); g.fill(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  for (const [x, z, l, r] of [[-17, -15.5, 7, 0.1], [-26, -18.4, 8, -0.06], [-37, -16.3, 9, 0.04]]) { const s = new THREE.Mesh(new THREE.PlaneGeometry(l, 0.7), new THREE.MeshBasicMaterial({ map: smearTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 })); s.rotation.set(-Math.PI / 2, 0, Math.PI + r); s.position.set(x, 0.014, z); root.add(s); }

  // faixas de luz/poeira
  root.userData.len = len;
  return root;
}
