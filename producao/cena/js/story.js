// Direção: câmera POV de Lucas, atores, luzes e coreografia de cada segundo (Parte 1 e Parte 2).
import * as THREE from 'three';
import * as T from './textures.js';
import { buildHuman, buildLite, poseLite, applyPose, P0, lerpPose, poseStand, poseCrouch, poseRun, poseZWalk, poseZReach } from './humans.js';
import { updateRain, glowTexture } from './world_street.js';
import { GAL } from './world_gallery.js';
import { clamp, lerp, smooth, smoother, remap, sstep, noise1, hash1, deg, sampleKeys, K, track, Rng, easeOut, easeIn } from './util.js';

const V3 = THREE.Vector3;
const TAU = Math.PI * 2;
const yawOf = (dx, dz) => Math.atan2(dx, dz);

// ----------------------------------------------------------------------------- personagens
export function makeActors() {
  const lucas = buildHuman({ name: 'lucas', skinTone: 0xc79a78, skinColor: 0xc79a78, seed: 1, hair: { type: 'short', color: 0x16110e }, top: 'bomber', topColor: 0x17181c, topRough: 0.5, topMetal: 0.1, innerColor: 0x6b6e72, pantsColor: 0x1a2030, shoeColor: 0x0d0d0e, wristband: true, headDetail: 1 });
  const clara = buildHuman({ name: 'clara', scale: 0.94, skinTone: 0xe2b898, skinColor: 0xe2b898, seed: 2, hair: { type: 'pony', color: 0x2a1812 }, top: 'denim', topTex: T.denimTexture('#a9bdd0'), topColor: 0xffffff, topRough: 0.8, innerColor: 0xf2f2f0, pantsColor: 0x23252b, shoeColor: 0xe8e8e4, soleColor: 0xb0b0aa, radio: true, headDetail: 1 });
  const marcos = buildHuman({ name: 'marcos', skinTone: 0xb88a66, skinColor: 0xb88a66, seed: 3, hair: { type: 'shaved', color: 0x1a1410 }, glasses: true, top: 'plaid', topTex: T.plaidTexture('#a3201f', '#0f0f12'), topColor: 0xffffff, innerColor: 0xe6e6e2, pantsColor: 0x30343f, shoeColor: 0x1d1d1c, headDetail: 1 });
  const walker = buildHuman({ name: 'entregador', zombie: 1, seed: 7, skinColor: 0x8c9a88, hair: { type: 'short', color: 0x15110f }, top: 'suit', topTex: T.suitTexture(), topColor: 0xffffff, innerColor: 0xd5d4cb, pantsColor: 0x1f2227, tie: true, deliveryBag: true, blood: true, wounds: 4, headDetail: 2 });
  walker.root.traverse((o) => { if (o.isMesh && o.material && o.material.emissive && !o.material.isMeshBasicMaterial) { o.material.emissive.lerp(new THREE.Color(0x303a46), 0.7); o.material.emissiveIntensity = Math.max(o.material.emissiveIntensity || 0, 0.55); } });
  const lucasPOV = buildHuman({ name: 'lucasPOV', skinTone: 0xc79a78, skinColor: 0xc79a78, seed: 1, top: 'bomber', topColor: 0x17181c, topRough: 0.5, wristband: true, headDetail: 1 });
  const lucasZ = buildHuman({ name: 'lucasZ', zombie: 0.9, seed: 5, skinColor: 0x93a090, hair: { type: 'short', color: 0x16110e }, top: 'bomber', topColor: 0x17181c, innerColor: 0x6b6e72, blood: true, wounds: 3, headDetail: 2, face: true });
  // POV: só os braços
  const arms = new Set(); lucasPOV.j.shL.traverse((o) => arms.add(o)); lucasPOV.j.shR.traverse((o) => arms.add(o));
  lucasPOV.root.traverse((o) => { if (o.isMesh && !arms.has(o)) o.visible = false; });
  const lites = Array.from({ length: 72 }, (_, i) => buildLite(100 + i));
  return { lucas, clara, marcos, walker, lucasPOV, lucasZ, lites };
}

// ----------------------------------------------------------------------------- história
export function createStory(ctx) {
  const { scene, camera, street, gallery, W, H, post } = ctx;
  const A = makeActors();
  const all = [A.lucas, A.clara, A.marcos, A.walker, A.lucasPOV, A.lucasZ, ...A.lites];
  for (const h of all) { h.root.visible = false; scene.add(h.root); }
  const SU = street.userData, GU = gallery.userData;

  // --- pool de luzes: PointLights fixas (contagem constante → sem recompilar shaders)
  const NPL = 7;
  const pool = Array.from({ length: NPL }, () => { const l = new THREE.PointLight(0xffffff, 0, 30, 2); scene.add(l); return l; });
  const hemi = new THREE.HemisphereLight(0x16233b, 0x0a0c10, 0.5); scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x6f86b8, 0.5); moon.position.set(-18, 30, 12); scene.add(moon);
  const spot = new THREE.SpotLight(0xf4f7ff, 0, 40, 0.5, 0.55, 2); spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.camera.near = 0.3; spot.shadow.camera.far = 40; spot.shadow.bias = -0.0004; spot.shadow.radius = 4;
  scene.add(spot); scene.add(spot.target);
  const screenL = new THREE.PointLight(0x9ab4ff, 0.0, 3.5, 2); scene.add(screenL);
  // luzes embutidas nos mundos viram candidatas do pool
  scene.traverse((o) => { if (o.isPointLight && !pool.includes(o) && o !== screenL) o.visible = false; });

  const envGlow = glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0.3)');

  // --- cacos de vidro (marquise/janela) — determinístico
  const rngG = new Rng(909);
  const shardGeo = new THREE.BufferGeometry(); shardGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.1, 0.02, 0, 0.03, 0.12, 0], 3)); shardGeo.computeVertexNormals();
  const shardMat = new THREE.MeshStandardMaterial({ color: 0xcde6f0, roughness: 0.04, metalness: 0.7, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
  const NG = 260; const awShards = new THREE.InstancedMesh(shardGeo, shardMat, NG); awShards.frustumCulled = false; awShards.visible = false; scene.add(awShards);
  const awShardData = Array.from({ length: NG }, (_, i) => {
    const fromWin = i < 130;
    return { p0: fromWin ? new V3(-7.45, rngG.f(5.0, 6.5), -17.5 + rngG.f(0.8, 2.0)) : new V3(-6.8 + rngG.f(-0.6, 0.6), 3.58, -17.5 + rngG.f(-0.9, 0.9)),
      v: new V3(rngG.f(0.4, 3.2), rngG.f(-1, 2.2), rngG.f(-1.6, 1.6)), r: new V3(rngG.f(0, 6), rngG.f(0, 6), rngG.f(0, 6)), w: new V3(rngG.f(-14, 14), rngG.f(-14, 14), rngG.f(-14, 14)), s: rngG.f(0.5, 1.6), d: rngG.f(0, 0.25) };
  });
  const doorShards = SU.doorShards; // instanciados na porta da galeria
  const dummy = new THREE.Object3D();

  // sprites de poeira nos impactos
  const dust = Array.from({ length: 8 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: envGlow, color: 0x9a9688, transparent: true, opacity: 0, depthWrite: false })); s.visible = false; scene.add(s); return s; });

  const state = { shake: 0 };

  // =============================================================================== CÂMERA
  // chave: [px,py,pz, tx,ty,tz, fov, shake, roll, zoom, focus]
  const CK1 = [
    K(0.0, [-5.15, 1.52, -2.2, -9.0, 1.6, -2.3, 66, 0.35, 0, 1.0, 2.6]),
    K(1.85, [-5.55, 1.52, -2.2, -9.0, 1.58, -2.3, 66, 0.4, 0, 1.0, 2.2]),
    K(2.02, [-5.6, 1.52, -2.2, -8.6, 1.55, -2.4, 66, 1.5, 0.05, 1.0, 5], { hold: true }),
    K(2.35, [-5.7, 1.5, -2.2, 3.3, 1.0, -5.5, 68, 1.2, -0.04, 1.4, 10.8]),
    K(4.0, [-5.8, 1.42, -2.4, 3.2, 1.0, -5.9, 68, 0.9, 0, 2.0, 10.8]),
    K(5.0, [-6.4, 1.1, -4.8, 2.8, 1.0, -7.2, 68, 1.0, 0.04, 1.5, 9.5]),
    K(6.5, [-7.1, 1.02, -8.1, -2.0, 1.0, -7.6, 68, 0.8, 0, 1.0, 4]),
    K(8.1, [-7.2, 1.0, -8.5, -6.9, 0.95, -7.0, 68, 0.5, 0, 1.0, 1.4]),
    K(11.0, [-7.2, 1.0, -8.5, -6.9, 0.98, -7.0, 66, 0.4, -0.02, 1.0, 1.4]),
    K(15.0, [-7.15, 1.0, -8.5, -6.9, 1.0, -7.0, 66, 0.4, 0.02, 1.0, 1.4]),
    K(15.9, [-7.2, 1.0, -8.5, -5.8, 0.97, -7.6, 68, 0.9, 0, 1.0, 2.0], { ease: true }),
    K(18.5, [-7.2, 1.0, -8.5, -5.8, 1.0, -7.6, 66, 0.4, 0.03, 1.0, 2.0]),
    K(21.0, [-7.2, 1.02, -8.5, -5.8, 0.98, -7.6, 66, 0.45, 0, 1.0, 2.0]),
    K(23.6, [-7.0, 1.28, -8.5, 0.4, 2.2, -80, 70, 0.7, 0, 1.0, 40]),
    K(26.5, [-6.9, 1.32, -8.5, 0.6, 1.9, -76, 70, 0.5, 0, 1.5, 55]),
    K(34.0, [-6.8, 1.26, -8.5, 1.0, 1.7, -62, 70, 0.55, 0, 4.0, 52]),
    K(41.0, [-6.8, 1.2, -8.5, 1.3, 1.6, -52, 70, 0.7, 0, 6.2, 44]),
    K(46.2, [-6.8, 1.2, -8.5, 1.6, 1.6, -48, 70, 0.9, 0, 8.0, 40]),
    K(49.9, [-6.8, 1.25, -8.5, 1.7, 1.6, -47.5, 70, 0.8, 0, 8.4, 40]),
    K(50.34, [-6.8, 1.55, -8.7, -5.8, 3.9, -14.8, 70, 1.8, 0.1, 1.0, 7], { hold: true }),
    K(53.0, [-6.5, 1.5, -10.0, -5.8, 3.8, -16.2, 70, 1.6, 0.06, 1.0, 7]),
    K(57.95, [-6.2, 1.45, -11.4, -5.6, 3.4, -16.0, 70, 2.2, -0.08, 1.0, 6]),
  ];
  const CK2 = [
    K(0.0, [-6.2, 1.45, -11.4, -5.6, 3.4, -16.0, 70, 2.2, -0.08, 1.0, 6]),
    K(0.34, [-6.1, 1.45, -11.7, -8.4, 1.5, -17.0, 72, 3.0, 0.14, 1.0, 9], { hold: true }),
    K(1.0, [-5.9, 1.5, -13.2, -9.4, 1.4, -17.0, 72, 3.4, 0.05, 1.0, 6]),
    K(1.8, [-6.2, 1.5, -15.4, -10.6, 1.4, -17.0, 72, 3.2, -0.04, 1.0, 5]),
    K(2.5, [-8.2, 1.5, -16.9, -13.0, 1.3, -17.0, 72, 3.0, 0.02, 1.0, 6]),
    K(2.9, [-9.3, 1.5, -17.0, -14.0, 1.2, -17.0, 72, 3.0, 0.02, 1.0, 6]),
    K(3.5, [-10.2, 1.5, -17.0, -7.0, 1.2, -17.0, 72, 2.4, 0.0, 1.0, 3]),
    K(6.0, [-10.4, 1.5, -17.0, -8.2, 1.2, -16.6, 70, 1.6, 0.0, 1.0, 2.5]),
    K(6.8, [-10.4, 1.5, -17.2, -9.3, 1.45, -15.3, 68, 0.8, 0.0, 1.0, 1.6]),
    K(9.8, [-10.4, 1.5, -17.2, -9.4, 1.45, -15.3, 68, 0.7, 0.0, 1.0, 1.6]),
    K(11.0, [-10.4, 1.55, -17.2, -17.5, 3.3, -21.2, 70, 1.2, 0.03, 1.2, 9]),
    K(13.3, [-10.6, 1.55, -17.4, -20.5, 3.0, -21.6, 70, 1.4, 0, 1.9, 11]),
    K(15.1, [-10.7, 1.55, -17.5, -19.5, 2.4, -21.4, 70, 2.0, 0.08, 2.1, 10], { hold: true }),
    K(15.7, [-10.3, 1.5, -17.2, -9.2, 0.9, -18.8, 72, 3.5, -0.2, 1.0, 2.4]),
    K(17.0, [-10.4, 1.45, -17.2, -11.8, 0.5, -19.2, 72, 3.4, 0.1, 1.0, 3.5]),
    K(19.0, [-10.5, 1.4, -17.1, -14.2, 0.4, -19.4, 72, 3.2, 0.25, 1.0, 5]),
    K(21.5, [-10.6, 1.45, -17.0, -16.6, 0.6, -19.5, 72, 3.0, -0.15, 1.0, 6]),
    K(22.9, [-10.2, 1.5, -17.2, -16.0, 1.2, -17.1, 74, 3.2, 0.0, 1.0, 5]),
    K(26.6, [-17.2, 1.55, -17.2, -23.0, 1.2, -17.2, 74, 3.6, 0.0, 1.0, 7]),
    K(27.4, [-19.0, 1.55, -17.0, -10.0, 1.3, -17.0, 74, 3.8, 0.12, 1.0, 7]),
    K(28.2, [-21.4, 1.55, -17.0, -30.0, 1.3, -17.1, 74, 3.8, -0.1, 1.0, 7]),
    K(35.0, [-44.2, 1.55, -17.1, -48.0, 1.4, -17.0, 74, 3.4, 0.0, 1.0, 5]),
    K(36.4, [-45.2, 1.5, -17.0, -47.9, 1.05, -17.0, 72, 2.4, 0.0, 1.0, 1.6]),
    K(37.4, [-45.4, 1.5, -16.9, -44.6, 1.0, -15.6, 72, 3.0, 0.1, 1.0, 2.6]),
    K(41.6, [-45.4, 1.5, -16.9, -43.8, 1.0, -15.0, 72, 2.6, -0.1, 1.0, 2.6]),
    K(42.4, [-45.5, 1.5, -17.0, -47.9, 1.1, -17.0, 72, 2.8, 0.0, 1.0, 1.6]),
    K(44.8, [-45.8, 1.5, -17.0, -47.9, 1.1, -16.8, 72, 3.2, 0.1, 1.0, 1.6]),
    K(47.0, [-46.0, 1.5, -17.0, -47.9, 1.2, -16.5, 72, 4.2, -0.2, 1.0, 1.6]),
    K(48.6, [-46.0, 1.55, -17.0, -44.0, 3.8, -14.0, 74, 5.0, 0.4, 1.0, 3]),
    K(49.3, [-46.0, 1.5, -17.0, -45.5, 2.2, -15.5, 74, 5.0, 0.6, 1.0, 3], { hold: true }),
  ];

  const handheld = (t, a) => {
    const f = t * 1.0;
    return {
      px: (noise1(f * 1.1 + 3) * 0.016 + noise1(f * 5.3) * 0.006) * a, py: (noise1(f * 0.9 + 9) * 0.014 + noise1(f * 4.1 + 2) * 0.005) * a, pz: noise1(f * 1.3 + 5) * 0.012 * a,
      rx: (noise1(f * 1.7 + 1) * 0.0045 + noise1(f * 7.7) * 0.0016) * a, ry: (noise1(f * 1.5 + 4) * 0.0055 + noise1(f * 6.9 + 3) * 0.002) * a, rz: noise1(f * 1.2 + 8) * 0.004 * a,
    };
  };

  // =============================================================================== GANCHOS DE ATUAÇÃO
  const tmpV = new V3();
  function setActor(h, x, y, z, yaw) { h.root.position.set(x, y, z); h.root.rotation.set(0, yaw, 0); h.root.visible = true; }

  // caminhada acocorada
  function crouchWalk(t, ph, speed = 1) { const p = poseCrouch(t, 0.8, ph); const s = Math.sin(t * 6 * speed + ph); p.hipL[0] += 0.3 * s; p.hipR[0] -= 0.3 * s; p.knL[0] += 0.2 * Math.max(0, s); p.knR[0] += 0.2 * Math.max(0, -s); p.rootY += 0.02 * Math.abs(s); return p; }

  // painéis da marquise: queda (função pura do tempo da história)
  const awn = SU.awning;
  const panelFall = (k, tS) => {
    const P = awn.panels[k], tau = tS - P.tFall;
    const o = { x: 0, y: 0, rz: 0, rx: 0, ry: 0, z: 0 };
    if (tau <= 0) {
      // tremor antes de ceder
      const pre = clamp((tau + 0.8) / 0.8, 0, 1);
      o.rz = Math.sin(tS * 38 + k) * 0.01 * pre; o.y = Math.sin(tS * 31 + k * 2) * 0.01 * pre; return o;
    }
    const swing = Math.min(tau * tau * 3.4, 1.0); // gira em torno da dobradiça (fachada)
    o.rz = -swing * 0.8 - 0.2 * Math.min(1, tau); o.rx = Math.sin(k * 3.1) * 0.35 * Math.min(1, tau * 1.2);
    const td = Math.max(0, tau - 0.35), g = 9.8, gy = awn.group.position.y; // altura absoluta do centro ~gy
    const h0 = gy; let y = -0.5 * g * td * td;
    const floorY = -(gy - 0.2);
    if (y < floorY) { const tf = Math.sqrt(2 * gy / g); const tb = td - tf; const v = g * tf * 0.28; const yb = v * tb - 0.5 * g * tb * tb; y = floorY + Math.max(0, yb); if (tb > 2 * v / g) y = floorY; }
    o.y = y; o.x = tau * 0.6; o.z = Math.sin(k * 5.7) * 0.4 * Math.min(1, tau);
    return o;
  };

  // =============================================================================== LUZES
  function setLights(cands, camPos) {
    const sc = cands.map((c) => ({ c, s: c.force ? 1e9 + c.i : c.k * c.i / (1 + camPos.distanceToSquared(c.p) * 0.01) }));
    sc.sort((a, b) => b.s - a.s);
    const gu = [street.userData.groundMesh.material.uniforms, gallery.userData.floor.material.uniforms];
    for (let i = 0; i < NPL; i++) {
      const l = pool[i], s = sc[i];
      if (s) { l.position.copy(s.c.p); l.color.setHex(s.c.col); l.intensity = s.c.i; l.distance = s.c.d || 30; } else l.intensity = 0;
      for (const u of gu) { const v = u.uL.value[i], c = u.uLc.value[i]; if (s) { v.set(s.c.p.x, s.c.p.y, s.c.p.z, s.c.i * 0.02); c.set(((s.c.col >> 16) & 255) / 255, ((s.c.col >> 8) & 255) / 255, (s.c.col & 255) / 255); } else v.set(0, 0, 0, 0); }
    }
  }

  // =============================================================================== QUADRO
  const out = { zoom: 1, focus: 6, exposure: 1, shake: 0, hud: {}, skew: 0 };
  const camPos = new V3(), camTgt = new V3(), prevYaw = { v: 0, t: -1 }, prevPos = { p: new V3(), t: -1 };
  const upV = new V3(0, 1, 0);

  function cameraFrame(part, t) {
    const keys = part === 1 ? CK1 : CK2;
    const v = sampleKeys(keys, t);
    const a = (part === 1 ? 1 : 1) * v[7];
    const h = handheld(t + (part === 2 ? 100 : 0), a);
    // passada: balanço em movimento
    let bob = 0, bobx = 0;
    const run = part === 2 ? (sstep(0.3, 0.8, t) * (1 - sstep(2.6, 3.1, t))) + (sstep(22.6, 23.4, t) * (1 - sstep(35.0, 35.4, t))) : 0;
    const crouchWalkAmt = part === 1 ? sstep(3.8, 4.4, t) * (1 - sstep(6.8, 7.4, t)) : 0;
    const ph = part === 2 ? t * 2 * Math.PI * 3.1 : t * 2 * Math.PI * 2.2;
    bob = Math.sin(ph * 2) * (0.035 * run + 0.015 * crouchWalkAmt); bobx = Math.sin(ph) * (0.03 * run + 0.01 * crouchWalkAmt);
    camPos.set(v[0] + h.px + bobx * 0.8, v[1] + h.py + bob, v[2] + h.pz);
    camTgt.set(v[3], v[4], v[5]);
    camera.position.copy(camPos);
    camera.up.set(0, 1, 0);
    camera.lookAt(camTgt);
    camera.rotateX(h.rx + (run ? Math.sin(ph * 2) * 0.012 * run : 0));
    camera.rotateY(h.ry + (run ? Math.sin(ph) * 0.016 * run : 0));
    camera.rotateZ(v[8] + h.rz + (run ? Math.sin(ph) * 0.02 * run : 0));
    camera.fov = v[6]; camera.updateProjectionMatrix();
    // rolling shutter: velocidade angular em yaw
    const fwd = new V3(); camera.getWorldDirection(fwd); const yaw = Math.atan2(fwd.x, fwd.z);
    let dy = 0; if (prevYaw.t >= 0 && Math.abs(t - prevYaw.t) < 0.2 && t !== prevYaw.t) { dy = yaw - prevYaw.v; while (dy > Math.PI) dy -= TAU; while (dy < -Math.PI) dy += TAU; dy /= (t - prevYaw.t); }
    prevYaw.v = yaw; prevYaw.t = t;
    out.skew = clamp(dy * 0.012, -0.12, 0.12);
    out.angSpeed = Math.abs(dy);
    if (prevPos.t >= 0 && Math.abs(t - prevPos.t) < 0.2 && t !== prevPos.t) out.posSpeed = camPos.distanceTo(prevPos.p) / Math.abs(t - prevPos.t); else out.posSpeed = 0;
    prevPos.p.copy(camPos); prevPos.t = t;
    return { v, fwd, yaw };
  }

  // =============================================================================== PARTE 1
  function part1(t, cf) {
    const tS = t;
    street.visible = true; gallery.visible = false;
    const cam = camPos;
    const cy = cf.v[1];
    // ---- luzes
    const cands = [];
    for (const L of SU.lampsData) cands.push({ p: L.pos, col: L.idx < 0 ? 0xffa860 : 0xffa24a, i: L.idx < 0 ? 140 : 260, k: 1, d: 26 });
    // neon da farmácia (verde, pisca)
    const fl = hash1(Math.floor(t * 14)) > 0.12 ? 1 : 0.15;
    const flk = (t > 20 && t < 24.5) || (t > 37 && t < 40) ? fl : 1;
    cands.push({ p: new V3(6.2, 4.6, -9.0), col: 0x3cff98, i: 220 * flk, k: 1.4, d: 22 });
    // alarme do carro: estroboscópico laranja
    const alarmOn = t > 0.45 && t < 1.9;
    const stb = alarmOn ? (Math.floor((t - 0.45) * 5.0) % 2 === 0 ? 1 : 0.06) : 0;
    cands.push({ p: new V3(3.4, 1.0, -7.4), col: 0xff8a1a, i: 180 * stb, k: 2.2, d: 24 });
    cands.push({ p: new V3(3.4, 1.0, -3.4), col: 0xff8a1a, i: 180 * stb, k: 2.2, d: 24 });
    // luz de preenchimento do rosto (reflexo difuso da cidade) e tela do celular
    const faceFill = t > 4.5 && t < 46 ? 1 : 0.0;
    cands.push({ p: new V3(cam.x + 1.1, cam.y + 0.7, cam.z + 0.7), col: 0x9fb0d0, i: 34 * faceFill + 3, k: 3, d: 8 });
    // luz do homem sob o viaduto
    const wz = -80 + (Math.min(t, 46.4) - 24) * 1.5;
    cands.push({ p: new V3(1.0, 3.2, wz - 2.4), col: 0xff9a4c, i: t > 22 ? 520 : 0, k: 1.5, d: 16, force: true });
    cands.push({ p: new V3(-0.4, 2.4, wz + 3.2), col: 0x8fa8ff, i: t > 22 ? 420 : 0, k: 1.5, d: 14, force: true });
    // brilho vermelho/frio interno da padaria
    cands.push({ p: new V3(-8.6, 1.7, 0.2), col: 0xbfe6ff, i: 28, k: 1, d: 7 }, { p: new V3(-12.5, 2.5, 1.6), col: 0xff3a1a, i: 18, k: 1, d: 6 });
    // clarão do vidro/queda e estouro na marquise
    cands.push({ p: new V3(-5.6, 2.6, -17.0), col: 0xffb070, i: t > 49 ? 55 : 0, k: 1, d: 16, force: true });
    cands.push({ p: new V3(-5.2, 6.6, -17.0), col: 0xffa860, i: t > 49 ? 35 : 0, k: 1, d: 16, force: true });
    const glassFlash = t > 51.15 ? Math.exp(-(t - 51.2) * 3.5) : 0;
    cands.push({ p: new V3(-6.3, 4.5, -16.5), col: 0xffe9c4, i: 300 * glassFlash, k: 2, d: 14 });
    setLights(cands, cam);
    spot.intensity = 0;

    // ---- reflexo + atores iniciais
    const fwd = cf.fwd; const f2 = new V3(fwd.x, 0, fwd.z).normalize();
    const crouch = clamp((1.5 - cy) / 0.5, 0, 1);
    // Lucas fica 0,55 m atrás do telefone
    // luz da tela do celular: ilumina o rosto e o peito de Lucas (visíveis no reflexo)
    screenL.position.set(cam.x - f2.x * 0.3, cam.y + 0.02, cam.z - f2.z * 0.3); screenL.intensity = t < 2.4 ? 1.1 : 0.5; screenL.distance = 3.0;
    const L = A.lucas; L.root.visible = true;
    L.root.position.set(cam.x - f2.x * 0.52, 0, cam.z - f2.z * 0.52); L.root.rotation.y = Math.atan2(f2.x, f2.z);
    const lp = poseStand(t, 0); lp.shL = [-1.35, 0, 0.05]; lp.shR = [-1.4, 0, -0.1]; lp.elL = [-1.2, 0, 0]; lp.elR = [-1.0, 0, 0]; lp.head = [0.04, 0.0, 0]; lp.grip = 0.7;
    const lpose = lerpPose(lp, (() => { const q = poseCrouch(t, 1, 0); q.shL = [-1.35, 0, 0.05]; q.shR = [-1.4, 0, -0.1]; q.elL = [-1.2, 0, 0]; q.elR = [-1.0, 0, 0]; return q; })(), crouch);
    applyPose(L, lpose);
    const reflectOnly = t < 2.0; // fora do reflexo, Lucas está atrás da câmera
    // Clara / Marcos
    const aC = A.clara, aM = A.marcos;
    const kC = sampleKeys([K(0, [-4.15, -1.15, -90, 0]), K(1.95, [-4.2, -1.2, -90, 0]), K(2.4, [-4.3, -1.5, 118, 0.7]), K(3.8, [-4.9, -1.6, 160, 0.8]), K(5.0, [-5.7, -3.7, 170, 0.85]), K(6.0, [-6.4, -5.9, 190, 0.9]), K(7.0, [-6.9, -7.0, 191, 1.0])], t);
    const kM = sampleKeys([K(0, [-4.1, -3.35, -90, 0]), K(1.95, [-4.1, -3.4, -90, 0]), K(2.4, [-4.2, -3.6, 110, 0.7]), K(4.0, [-4.6, -4.8, 165, 0.8]), K(5.6, [-5.3, -6.0, 190, 0.85]), K(7.2, [-5.8, -7.6, -125, 1.0])], t);
    const moving = t > 3.9 && t < 7.0;
    setActor(aC, kC[0], 0, kC[1], deg(kC[2]));
    {
      let p = moving ? crouchWalk(t, 0.4) : poseCrouch(t, kC[3], 0.4);
      // rádio de pilha junto ao ouvido e depois mostrando ao Lucas
      const radioT = remap(t, 7.0, 9.5);
      p.shL = [lerp(p.shL[0], -2.2, radioT), 0, lerp(p.shL[2], 0.5, radioT)]; p.elL = [lerp(p.elL[0], -1.9, radioT), 0, 0];
      const spk = voiceEnv('p1_clara_radio', t) ; p.jaw = spk * 0.5; p.head = [p.head[0] + 0.05 * spk, p.head[1], p.head[2]];
      const spk2 = voiceEnv('p1_clara_entregador', t); p.jaw = Math.max(p.jaw, spk2 * 0.6);
      if (t > 36 && t < 40.5) { p.shR = [-1.0, 0, -0.3]; p.elR = [-1.8, 0, 0]; p.head[0] += 0.1; } // mão na boca
      applyPose(aC, p);
      aC.j.radio.visible = t < 15;
      aC.j.radio.userData.led.visible = t < 8.6 || (t > 7.6 && t < 8.6);
    }
    setActor(aM, kM[0], 0, kM[1], deg(kM[2]));
    {
      let p = moving ? crouchWalk(t, 1.7) : poseCrouch(t, kM[3], 1.7);
      const spk = voiceEnv('p1_marcos_infestada', t), spk2 = voiceEnv('p1_marcos_visor', t); p.jaw = Math.max(spk, spk2) * 0.5;
      // Marcos tapa a lente com a mão (≈45,0 s → 46,1 s)
      const cover = sstep(43.6, 44.9, t) * (1 - sstep(45.7, 46.3, t));
      p.shR = [lerp(p.shR[0], -1.8, cover), lerp(0, 0.5, cover), lerp(p.shR[2], -0.2, cover)]; p.elR = [lerp(p.elR[0], -0.4, cover), 0, 0];
      applyPose(aM, p);
      aM.j.wrR.rotation.set(0, 0, 0);
    }
    // sobe para fora do reflexo: Clara e Marcos só aparecem quando relevantes
    aC.root.visible = true; aM.root.visible = true;
    // Lucas só aparece no reflexo; depois fica atrás da câmera (oculto p/ economizar)
    L.root.visible = t < 7.0;

    // ---- carro, alarme, "baque"
    const eco = SU.eco; const car = eco.userData.body;
    const rock = t > 1.9 ? Math.exp(-(t - 1.9) * 4) * Math.sin((t - 1.9) * 38) * 0.035 : 0;
    car.rotation.z = rock; car.position.y = Math.abs(rock) * 0.6;
    const blink = alarmOn ? (Math.floor((t - 0.45) * 5) % 2 === 0) : false;
    for (const s of eco.userData.signals) s.material.color.setHex(blink ? 0xffa820 : 0x3a2208);
    for (const h of eco.userData.head) h.material.color.setHex(alarmOn ? (blink ? 0xffffff : 0x556070) : 0x303a44);
    for (const h of eco.userData.tail) h.material.color.setHex(blink ? 0xff3010 : 0x300808);
    // vítima + atacantes atrás do carro
    const vic = A.lites[0], atk1 = A.lites[1], atk2 = A.lites[2];
    const vis = t > 1.7 && t < 8;
    for (const h of [vic, atk1, atk2]) h.root.visible = vis;
    if (vis) {
      setActor(vic, 3.4, 0.14, -8.4, 0.5); vic.body.rotation.set(-Math.PI / 2 + 0.1, 0, 0); vic.j.shL.rotation.set(-2.0 + 0.4 * Math.sin(t * 9), 0, 0.3); vic.j.shR.rotation.set(-1.6, 0, -0.3); vic.j.head.rotation.set(0.4, 0.3, 0);
      const dive = Math.max(0, Math.min(1, (t - 1.9) * 3));
      setActor(atk1, 2.7, 0, -8.0, 1.2); poseLite(atk1, t, 'crouch', 0.3); atk1.body.rotation.x += 0.5 * Math.sin(t * 5.5); atk1.root.position.y = -0.1;
      setActor(atk2, 3.9, 0, -9.0, -2.0); poseLite(atk2, t, 'crouch', 1.3); atk2.body.rotation.x += 0.5 * Math.sin(t * 5.1 + 1);
      // eles aparecem no momento do baque
      const a = clamp((t - 1.88) * 8, 0, 1); atk1.root.scale.setScalar(a); atk2.root.scale.setScalar(a); vic.root.scale.setScalar(a);
    }

    // ---- homem sob o viaduto (entregador zumbi)
    const W_ = A.walker;
    const wsp = 1.5, wt = Math.min(t, 46.4);
    const wz2 = -80 + (wt - 24) * wsp, wx = 0.1 + 0.9 * Math.sin(wt * 0.33);
    const wvis = t > 22.5;
    W_.root.visible = wvis;
    if (wvis) {
      setActor(W_, wx, 0, wz2, 0 + Math.PI + 0.08 * Math.sin(wt * 0.4)); // vem em direção à câmera (frente = +Z)
      const dist = (wt - 24) * wsp; const ph = dist / 0.68 * TAU * 0.5;
      const stopped = t > 46.4;
      let p = stopped ? poseZWalk(ph, 0) : poseZWalk(ph, 0);
      if (stopped) { // trava, vira o rosto para a câmera
        const st = sstep(46.4, 46.55, t); p.head = [0.1 + 0.05 * Math.sin(t * 30) * st, lerp(0.4, 0, st), lerp(0.2, 0.55, st)]; p.neck = [0.25, 0, 0.5 * st]; p.jawDrop = 0.18 + 0.12 * Math.sin(t * 19) * st; p.jaw = 0.2 * st; p.jawShift = 1;
        p.hipL = [-0.1, 0, 0.05]; p.hipR = [-0.15, 0, -0.05]; p.knL = [0.1, 0, 0]; p.knR = [0.1, 0, 0];
        p.shL = [-0.5 - 0.15 * Math.sin(t * 7), 0, 0.2]; p.shR = [-0.4, 0, -0.2];
      } else p.head = [0.12, 0.3 * Math.sin(ph * 0.5), 0.35];
      applyPose(W_, p);
      // alinha o rosto à câmera no travamento
      W_.j.head.rotation.y += (stopped ? Math.atan2(cam.x - wx, cam.z - wz2) * 0 : 0);
    }

    // ---- marquise + zumbis nela + cacos
    const winUp = SU.winUp; winUp.visible = tS < 51.2;
    SU.skylight.visible = tS < 51.2;
    awn.panels.forEach((P, k) => {
      const f = panelFall(k, tS);
      P.g.position.set(f.x, f.y, P.z0 + f.z); P.g.rotation.set(f.rx, 0, f.rz);
    });
    // zumbis sobre a marquise (aparecem a partir de 52,3 s)
    const onAwn = [[3, 0, 1.3, -17.0 + 0.0], [4, 1, 2.1, -18.4], [5, 2, 1.8, -16.3], [6, 3, 1.1, -19.0], [7, 4, 2.4, -15.6]];
    for (const [li, pk, ox, oz] of onAwn) {
      const z = A.lites[li]; const P = awn.panels[pk]; const f = panelFall(pk, tS);
      const show = t > 52.2 + pk * 0.35;
      z.root.visible = show;
      if (show) {
        const a = clamp((t - (52.2 + pk * 0.35)) * 2.5, 0, 1);
        const base = SU.awning.group.position;
        // posição local no painel + offset de queda
        z.root.position.set(base.x + ox + f.x, base.y + f.y + 0.06, base.z + oz - base.z + P.z0 + f.z + (-17.5 - (-17.5)));
        z.root.position.z = base.z + P.z0 * 0 + (oz + 17.5) + f.z - 0.0;
        z.root.rotation.set(f.rx * 0.5, deg(180 + 40 * Math.sin(pk)), f.rz * 0.8);
        poseLite(z, t, tS > P.tFall ? 'lurch' : 'crouch', pk, 0.7); z.root.scale.setScalar(a);
        z.body.position.y = tS > P.tFall ? 0 : -0.55;
      }
    }
    // cacos de vidro da janela e da claraboia
    awShards.visible = tS > 51.2;
    if (awShards.visible) {
      for (let i = 0; i < NG; i++) {
        const d = awShardData[i]; const tau = tS - 51.2 - d.d; if (tau < 0) { dummy.position.set(0, -50, 0); dummy.scale.setScalar(0.0001); dummy.updateMatrix(); awShards.setMatrixAt(i, dummy.matrix); continue; }
        const g = 9.8; let y = d.p0.y + d.v.y * tau - 0.5 * g * tau * tau; const x = d.p0.x + d.v.x * tau, z = d.p0.z + d.v.z * tau;
        const rest = y < 0.02; if (rest) y = 0.02;
        dummy.position.set(x, y, z); dummy.rotation.set(d.r.x + (rest ? 0 : d.w.x * tau), d.r.y + (rest ? 0 : d.w.y * tau), d.r.z + (rest ? 0 : d.w.z * tau)); dummy.scale.setScalar(d.s); dummy.updateMatrix(); awShards.setMatrixAt(i, dummy.matrix);
      }
      awShards.instanceMatrix.needsUpdate = true;
    }
    // poeira nos impactos
    dust.forEach((s, k) => {
      const P = awn.panels[k % awn.panels.length]; const tf = P.tFall + 0.35 + Math.sqrt(2 * 3.35 / 9.8) + 0.0;
      const tau = tS - tf; const on = k < awn.panels.length && tau > 0 && tau < 3;
      s.visible = on; if (on) { s.position.set(-5.9 + (k % 3) * 0.5, 0.8, -17.5 + P.z0); const sc = 2 + tau * 2.8; s.scale.set(sc, sc * 0.8, 1); s.material.opacity = 0.34 * Math.exp(-tau * 1.2); }
    });

    // ---- ambiente: chuva, bruma, semáforo, luz de aviação, pisca dos letreiros
    SU.rain.mesh.visible = true; updateRain(SU.rain, t, cam);
    SU.mist.forEach((m, i) => { m.position.x += 0; m.material.opacity = 0.09 + 0.03 * Math.sin(t * 0.3 + i); });
    SU.sem.amb.visible = (Math.floor(t * 1.0) % 2) === 0; SU.sem.sp.visible = SU.sem.amb.visible;
    SU.skyline.forEach((r, i) => { r.visible = ((Math.floor(t * 0.8) + i) % 3) !== 0; });
    // sprites dos postes: brilho respira
    SU.lampsData.forEach((L, i) => { if (L.sprite) { L.sprite.material.opacity = 0.9 + 0.1 * Math.sin(t * 60 + i * 7) * (hash1(Math.floor(t * 20) + i) > 0.97 ? 3 : 0.2); } });
    // lâmpada do poste próximo à galeria falha e pisca nos últimos segundos
    const failing = SU.lampsData.find((l) => l.idx === 2); if (failing) failing.sprite.visible = tS < 50 ? true : hash1(Math.floor(t * 18)) > 0.4;
    // mundo
    scene.fog = scene.fog || new THREE.FogExp2(0x0b1219, 0.019); scene.fog.color.setHex(0x0b1219); scene.fog.density = 0.019;
    scene.background = new THREE.Color(0x05080d);
    hemi.intensity = 0.42; moon.intensity = 0.28;
    // ---- braço de Lucas apontando (24,2 → 27,0)
    const point = sstep(23.9, 24.4, t) * (1 - sstep(26.6, 27.2, t));
    povArm(cf, point, 0.1);

    // ---- parâmetros de pós
    const speak = voiceEnv('p1_lucas_sussurro', t);
    out.exposure = 1.1 + (t > 23 ? 0.15 : 0) + (t > 2 && t < 2.4 ? 0.2 : 0);
    out.zoom = cf.v[9]; out.focus = cf.v[10];
    out.flicker = (hash1(Math.floor(t * 30)) - 0.5) * 0.04 + (cover(t) ? 0 : 0);
    out.hud = { clock: '04:15 AM', battery: 80, rec: true, t, zoomUI: out.zoom > 1.05 ? out.zoom : 0, focusBox: focusBox(t) };
    out.blackout = cover(t) ? sstep(44.1, 44.9, t) * (1 - sstep(45.7, 46.2, t)) * 0.9 : 0;
    out.fade = 0;
    if (t > cues.marks.cut) { out.exposure = 0; out.hud.hideAll = true; out.zoom = 1; }
    out.endCard = t >= cues.marks.end_card;
    out.glitch = t > 57.4 && t < cues.marks.cut ? 0.5 + 0.5 * hash1(Math.floor(t * 30)) : 0;
    out.lowbat = 0; out.flash = 0;
    out.cocBoost = t > 26 && t < 49.5 ? 0.35 : 1;
  }
  function cover(t) { return t > 43.6 && t < 46.3; }

  // caixa de foco do app de câmera
  function focusBox(t) {
    const pts = [[2.4, 0.5, 0.45, 0.9], [6.8, 0.52, 0.5, 0.8], [8.2, 0.34, 0.52, 0.8], [15.9, 0.65, 0.5, 0.8], [24.5, 0.5, 0.42, 0.8], [47, 0.5, 0.44, 0.9], [51, 0.5, 0.35, 0.7]];
    for (const [tt, x, y, d] of pts) if (Math.abs(t - tt) < d) return { x, y, k: 1 - Math.abs(t - tt) / d };
    return null;
  }

  // ----- braço do Lucas em primeira pessoa (apontando / pegando)
  function povArm(cf, amount, side) {
    const P = A.lucasPOV; P.root.visible = amount > 0.01;
    if (!P.root.visible) return;
    const f = cf.fwd; const yaw = Math.atan2(f.x, f.z);
    const right = new V3(Math.cos(yaw), 0, -Math.sin(yaw)); // direita da câmera
    const pos = new V3().copy(camPos).addScaledVector(right, 0.2).addScaledVector(f, -0.35); pos.y = camPos.y - 1.42 - 0.0;
    P.root.position.copy(pos); P.root.rotation.set(0, yaw, 0);
    const p = P0(); p.shR = [lerp(-0.1, -1.55, amount), 0, lerp(-0.1, 0.0, amount)]; p.elR = [lerp(-0.2, -0.25, amount), 0, 0]; p.shL = [-0.1, 0, 0.1]; p.grip = 0.9 * (1 - amount) + 0.0;
    p.wrR = [0, 0, 0]; applyPose(P, p);
    // indicador estendido: apenas um dedo
    P.j.wrR.userData.fingers.forEach((fg, i) => { fg.rotation.x = i === 0 ? -0.05 : -1.5 * 0.9; });
  }

  // envelope de voz → abertura da boca
  let cues = null;
  function voiceEnv(id, t) {
    const v = cues && cues.voices[id]; if (!v) return 0;
    const tt = t - v.t0; if (tt < 0 || tt > v.dur) return 0;
    const i = Math.floor(tt * 60); return (v.env[i] ?? 0) * 0.9;
  }

  // =============================================================================== PARTE 2  (preenchida abaixo)
  const P2 = { fn: null };

  const api = {
    setCues(c) { cues = c; },
    update(part, t) {
      const cf = cameraFrame(part, t);
      for (const h of all) h.root.visible = false;
      if (part === 1) part1(t, cf); else if (P2.fn) P2.fn(t, cf);
      // luz de lanterna: ancorada na câmera
      return out;
    },
    P2,
    helpers: { CK2, updateRain, setActor, crouchWalk, panelFall, setLights, voiceEnv, povArm, focusBox, handheld, awShards, awShardData, doorShards, dust, dummy, spot, screenL, pool, hemi, moon, out, A, camPos, camTgt, state },
  };
  return api;
}
