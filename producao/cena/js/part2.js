// Parte 2 — O CERCO NA GALERIA. Continuação direta (mesmo instante da queda das telhas).
import * as THREE from 'three';
import { applyPose, P0, lerpPose, poseStand, poseCrouch, poseRun, poseZWalk, poseZReach, poseLite } from './humans.js';
import { GAL } from './world_gallery.js';
import { clamp, lerp, smooth, remap, sstep, hash1, noise1, deg, sampleKeys, K, Rng } from './util.js';

const V3 = THREE.Vector3;
const TAU = Math.PI * 2;
const DOOR = { x: -7.5, z: -17.0 };

export function installPart2(story, ctx) {
  const { scene, camera, street, gallery } = ctx;
  const H = story.helpers, A = H.A, SU = street.userData, GU = gallery.userData;
  const out = H.out;
  const gal = SU.gal, awn = SU.awning;
  const lites = A.lites;
  const group = (a, b) => lites.slice(a, b);
  const FLASH_T = 11.0;
  const rg = new Rng(33);
  const jit = Array.from({ length: 80 }, () => ({ a: rg.f(0, 1), b: rg.f(0, 1), c: rg.f(0, 1), d: rg.f(0, 1) }));

  // caminho do jogador (para seguir/ perseguir): posição de chão da câmera ao longo do tempo
  const camAt = (tt) => { const v = sampleKeys(H.CK2, clamp(tt, 0, 49.3)); return new V3(v[0], 0, v[2]); };

  const showAt = (h, x, y, z, yaw) => { h.root.visible = true; h.root.position.set(x, y, z); h.root.rotation.set(0, yaw, 0); h.root.scale.setScalar(1); };

  function liteTo(h, from, to, t, t0, speed) { // anda de 'from' até 'to'
    const d = from.distanceTo(to), dur = d / speed, u = clamp((t - t0) / dur, 0, 1);
    const p = new V3().lerpVectors(from, to, u);
    return { p, u, moving: u > 0 && u < 1, yaw: Math.atan2(to.x - from.x, to.z - from.z) };
  }

  const fn = (t, cf) => {
    const tS = 57.95 + t;
    const cam = H.camPos; const fwd = cf.fwd; const f2 = new V3(fwd.x, 0, fwd.z).normalize();
    const camX = cam.x;
    const inside = camX < -8.6;
    street.visible = true; gallery.visible = true;
    SU.rain.mesh.visible = !inside || t < 5; if (SU.rain.mesh.visible) H.updateRain(SU.rain, t + 60, cam);

    // ======================================================== marquise (continua caindo)
    awn.panels.forEach((P, k) => { const f = H.panelFall(k, tS); P.g.position.set(f.x, f.y, P.z0 + f.z); P.g.rotation.set(f.rx, 0, f.rz); });
    SU.winUp.visible = false; SU.skylight.visible = false;
    // cacos (já em queda desde a Parte 1)
    H.awShards.visible = true;
    for (let i = 0; i < H.awShardData.length; i++) {
      const d = H.awShardData[i]; const tau = tS - 51.2 - d.d; const g = 9.8;
      let y = d.p0.y + d.v.y * tau - 0.5 * g * tau * tau; const x = d.p0.x + d.v.x * tau, z = d.p0.z + d.v.z * tau; const rest = y < 0.02; if (rest) y = 0.02;
      H.dummy.position.set(x, y, z); H.dummy.rotation.set(d.r.x + (rest ? 0 : d.w.x * tau), d.r.y + (rest ? 0 : d.w.y * tau), d.r.z + (rest ? 0 : d.w.z * tau)); H.dummy.scale.setScalar(d.s); H.dummy.updateMatrix(); H.awShards.setMatrixAt(i, H.dummy.matrix);
    }
    H.awShards.instanceMatrix.needsUpdate = true;
    H.dust.forEach((s, k) => { const P = awn.panels[k % awn.panels.length]; const tf = P.tFall + 0.35 + Math.sqrt(2 * 3.35 / 9.8); const tau = tS - tf; const on = k < awn.panels.length && tau > 0 && tau < 4; s.visible = on; if (on) { s.position.set(-5.9 + (k % 3) * 0.5, 0.8, -17.5 + P.z0); const sc = 2 + tau * 2.8; s.scale.set(sc, sc * 0.8, 1); s.material.opacity = 0.34 * Math.exp(-tau * 1.1); } });
    // zumbis que vieram com a marquise (P1) — ainda caindo/rolando no início
    for (let i = 0; i < 5; i++) {
      const z = lites[3 + i], P = awn.panels[i], f = H.panelFall(i, tS); const base = awn.group.position;
      const hit = tS > P.tFall + 0.35 + 0.9;
      z.root.visible = t < 5.5;
      z.root.position.set(base.x + [1.3, 2.1, 1.8, 1.1, 2.4][i] + f.x, base.y + f.y + (hit ? 0.0 : 0.05), base.z + (-17.0 + [0, -1.4, 0.7, -2.0, 1.4][i] + 17.5) + f.z - 0.0 - 0.5 + 0.5);
      z.root.position.z = -17.5 + [0.5, -0.9, 0.8, -1.5, 1.7][i] + f.z;
      z.root.rotation.set(f.rx, deg(180 + 40 * i), f.rz);
      poseLite(z, t, hit ? 'lurch' : 'stand', i, 0.7);
      if (hit) { const u = clamp((tS - P.tFall - 1.25) / 2.5, 0, 1); z.root.position.x = lerp(z.root.position.x, DOOR.x + 1.0 + i * 0.4, u); z.root.position.z = lerp(z.root.position.z, DOOR.z + (i - 2) * 0.7, u); z.root.rotation.x = 0; z.root.rotation.z = 0; z.root.rotation.y = lerp(z.root.rotation.y, -Math.PI / 2, u); z.root.position.y = 0; }
    }

    // ======================================================== porta de vidro: estilhaça em 2,05 s
    const tD = t - 2.05;
    SU.doors.forEach((d) => { d.children[0].visible = tD < 0; });
    const DS = SU.doorShards; DS.mesh.visible = tD > 0;
    if (DS.mesh.visible) for (let i = 0; i < DS.data.length; i++) {
      const d = DS.data[i]; const tau = tD - (i % 7) * 0.012; const g = 9.8;
      if (tau < 0) { H.dummy.scale.setScalar(0.0001); H.dummy.updateMatrix(); DS.mesh.setMatrixAt(i, H.dummy.matrix); continue; }
      let y = d.p.y + d.v.y * tau - 0.5 * g * tau * tau; const x = d.p.x + d.v.x * tau * Math.exp(-tau * 0.9), z = d.p.z + d.v.z * tau * Math.exp(-tau * 0.7); const rest = y < 0.02; if (rest) y = 0.02;
      H.dummy.position.set(x, y, z); H.dummy.rotation.set(d.r.x + (rest ? 0 : d.w.x * tau), d.r.y + (rest ? 0 : d.w.y * tau), d.r.z + (rest ? 0 : d.w.z * tau)); H.dummy.scale.setScalar(d.s); H.dummy.updateMatrix(); DS.mesh.setMatrixAt(i, H.dummy.matrix);
    }
    if (DS.mesh.visible) DS.mesh.instanceMatrix.needsUpdate = true;

    // ======================================================== balcão da lotérica
    const ctr = GU.counter; const cu = sstep(4.1, 6.3, t);
    ctr.position.set(lerp(-10.7, -8.75, cu), 0, lerp(-14.95, -17.0, cu)); ctr.rotation.y = lerp(0, Math.PI / 2, smooth(remap(t, 4.1, 5.6)));

    // ======================================================== luzes
    const cands = [];
    if (!inside || t < 3.2) for (const L of SU.lampsData) cands.push({ p: L.pos, col: 0xffa24a, i: (L.idx === 2 && t > 3) ? 0 : 230, k: 1, d: 26 });
    const flk = (k) => (hash1(Math.floor(t * 17) + k * 7) > 0.18 ? 1 : 0.1);
    for (const e of GU.emerg) cands.push({ p: e, col: 0xcfe0ff, i: 70, k: 1.4, d: 18 });
    GU.fixtures.forEach((fx, k) => { if (!fx.alive) return; const on = fx.seed > 0 && flk(k + fx.seed | 0); cands.push({ p: new V3(fx.x, 6.6, GAL.zc + fx.dz), col: 0xd2f0e6, i: 100 * (0.3 + 0.7 * on), k: 1.6, d: 16 }); });
    cands.push({ p: new V3(-47.0, 2.7, -17.0), col: 0x46ff7a, i: 60, k: 1.4, d: 12 });
    const blink = (Math.floor(t * 2.5) % 2) === 0 ? 1 : 0.05;
    cands.push({ p: new V3(-46.4, 3.1, -15.6), col: 0xff2a1a, i: 120 * blink, k: 1.5, d: 14 });
    cands.push({ p: new V3(-35.0, 1.4, -15.2), col: 0x8fd0ff, i: 40, k: 1, d: 8 });
    cands.push({ p: new V3(-6.4, 4.0, -17.5), col: 0xffa860, i: 90, k: 1.2, d: 14 }); // rua visível pelas portas
    cands.push({ p: new V3(cam.x + f2.x * 0.2, cam.y + 0.3, cam.z + f2.z * 0.2), col: 0x88a0ff, i: 6, k: 3, d: 5 });
    const escOn = t > 10.2 && t < 24 ? 1 : 0; const escFl = hash1(Math.floor(t * 13)) > 0.15 ? 1 : 0.25;
    cands.push({ p: new V3(-19.0, 5.2, -21.0), col: 0x9fd8ff, i: 150 * escOn * escFl, k: 1, d: 20, force: true });
    cands.push({ p: new V3(-27.0, 5.8, -21.5), col: 0xff6a4a, i: 90 * escOn, k: 1, d: 18, force: true });
    H.setLights(cands, cam);
    // lanterna do celular (a partir de 11,0 s): spot presa à câmera
    const lanterna = sstep(FLASH_T, FLASH_T + 0.18, t) * (hash1(Math.floor(t * 23)) > 0.97 && t > 36 ? 0.35 : 1) * (1 - sstep(49.3, 49.35, t));
    const spot = H.spot; spot.intensity = 8 * lanterna; spot.position.copy(cam).addScaledVector(new V3(0, 0, 0), 1).add(new V3(0.0, -0.05, 0)); spot.target.position.copy(cam).addScaledVector(fwd, 10); spot.target.updateMatrixWorld();
    spot.angle = 0.52; spot.penumbra = 0.7; spot.distance = 45;
    // espalha também no shader do chão
    for (const u of [SU.groundMesh.material.uniforms, GU.floor.material.uniforms]) { u.uSpot.value.set(cam.x, cam.y, cam.z, spot.intensity * 0.05); u.uSpotDir.value.set(fwd.x, fwd.y, fwd.z, Math.cos(0.5)); }
    H.screenL.intensity = 1.2; H.screenL.position.copy(cam).addScaledVector(fwd, -0.3);
    scene.fog.color.setHex(inside ? 0x0a0f10 : 0x0b1219); scene.fog.density = inside ? 0.024 : 0.019;
    scene.background = new THREE.Color(0x05080d);
    H.hemi.intensity = inside ? 0.55 : 0.4; H.moon.intensity = inside ? 0.04 : 0.25;

    // luminárias fluorescentes: piscam
    GU.fixtures.forEach((fx, k) => { const on = fx.alive ? (hash1(Math.floor(t * 17) + k * 7) > 0.18) : false; fx.mesh.material.color.setHex(on ? 0xdff4ec : 0x1a1f1e); fx.sprite.material.opacity = on ? 0.5 : 0; });
    GU.exitGlow.material.opacity = 0.9; GU.alarmL.material.color.setHex(blink > 0.5 ? 0xff3a2a : 0x300808);

    // ======================================================== Clara / Marcos
    const C = A.clara, M = A.marcos;
    const kC = sampleKeys([
      K(0, [-6.5, -7.0, 180]), K(0.5, [-6.6, -8.4, 180]), K(1.4, [-6.9, -12.0, 180]), K(2.3, [-7.2, -16.0, 170]), K(2.9, [-9.0, -16.3, -100]), K(3.6, [-9.9, -15.6, -90]), K(4.1, [-11.8, -15.5, 90], { hold: true }),
      K(4.2, [-9.6, -15.6, 90], { cut: true }), K(6.3, [-9.6, -15.6, 90]), K(6.7, [-9.4, -15.4, -150]), K(15.2, [-9.35, -15.4, -150]), K(16.0, [-9.0, -14.9, -170]), K(18.8, [-9.2, -15.0, -165]),
      K(19.6, [-9.6, -15.8, -95]), K(21.0, [-11.8, -16.1, -92]), K(22.9, [-15.2, -16.9, -90]),
    ], t);
    const kM = sampleKeys([
      K(0, [-6.6, -10.0, 180]), K(0.4, [-6.7, -11.4, 180]), K(1.3, [-7.0, -15.0, 175]), K(2.2, [-7.4, -17.0, -120]), K(3.0, [-9.5, -17.4, -90]), K(3.6, [-10.1, -17.8, -90]), K(4.1, [-11.8, -17.9, 90], { hold: true }),
      K(4.2, [-11.9, -17.9, 90], { cut: true }), K(6.3, [-9.9, -17.9, 90]), K(6.9, [-9.4, -18.8, 120]), K(15.2, [-9.4, -18.9, 120]),
    ], t);
    const runPh = t * TAU * 1.55;
    const running = (t < 3.0) || (t > 22.6 && t < 35.1);
    // Clara
    C.root.visible = true; C.root.rotation.set(0, deg(kC[2]), 0);
    {
      let cx = kC[0], cz = kC[1];
      let p;
      if (t >= 22.9 && t <= 36.5) { // lidera a corrida, 3,5 m à frente do jogador
        const a = camAt(t + 1.25); cx = a.x; cz = a.z - 0.5 + 0.4 * Math.sin(t * 1.7); C.root.rotation.set(0, Math.atan2(-1, 0) + 0.12 * Math.sin(t * 1.3), 0);
        if (t > 35.1) { const e = camAt(35.0); cx = e.x - 1.0 * (1 - sstep(35.1, 36.0, t)); }
      }
      C.root.position.set(cx, 0, cz);
      if (running) p = poseRun(runPh + 1, 1, 0);
      else if (t >= 3.4 && t < 6.3) { p = poseStand(t, 0.3); p.rootRX = 0.25; p.spine = [0.2, 0, 0]; p.shL = [-1.3, 0, 0.2]; p.shR = [-1.3, 0, -0.2]; p.elL = [-0.5, 0, 0]; p.elR = [-0.5, 0, 0]; p.hipL = [-0.5 + 0.2 * Math.sin(t * 9), 0, 0]; p.hipR = [-0.3 - 0.2 * Math.sin(t * 9), 0, 0]; p.knL = [0.4, 0, 0]; p.knR = [0.4, 0, 0]; }
      else p = poseStand(t, 0.3);
      const spk = H.voiceEnv('p2_clara_escada', t) + H.voiceEnv('p2_clara_vaiembora', t); p.jaw = Math.min(1, spk) * 0.6;
      // olhar para a escada rolante (≈10 s) e susto
      if (t > 9.6 && t < 15.3) { p.head = [-0.3, -0.5, 0]; p.neck = [-0.1, -0.25, 0]; p.shR = [-0.9, 0, -0.5]; p.elR = [-1.6, 0, 0]; }
      if (t >= 15.3 && t < 19.0) { p.rootRX = -0.2; p.hipL = [0.3, 0, 0.2]; p.hipR = [0.3, 0, -0.2]; p.shL = [-0.8, 0, 0.6]; p.shR = [-0.8, 0, -0.6]; p.elL = [-1.2, 0, 0]; p.elR = [-1.2, 0, 0]; }
      // porta: puxando a barra (35.1–36.5), depois presa pelo cabelo
      if (t >= 35.1) {
        const g = sstep(36.45, 36.9, t); // puxada para trás pelo rabo de cavalo
        const gx = lerp(-45.3, -42.0, smooth(remap(t, 36.5, 41.6))), gz = lerp(-16.1, -14.8, smooth(remap(t, 36.5, 41.6)));
        C.root.position.set(lerp(camAt(35.0).x - 1.0, gx, g), 0, lerp(-16.1, gz, g)); C.root.rotation.set(0, lerp(-1.57, 2.2, g), 0);
        p = poseStand(t, 0); p.shL = [-1.3, 0, 0.3]; p.shR = [-1.3, 0, -0.3]; p.elL = [-0.4, 0, 0]; p.elR = [-0.4, 0, 0];
        p.rootRX = lerp(0.15, -0.35, g); p.head = [lerp(0, -0.55, g), 0.3 * Math.sin(t * 20) * g, 0.3 * g]; p.neck = [lerp(0, -0.35, g), 0, 0]; p.hipL = [-0.4 * g * Math.sin(t * 7), 0, 0.1]; p.hipR = [0.4 * g * Math.sin(t * 7), 0, -0.1]; p.knL = [0.5 * g, 0, 0]; p.knR = [0.5 * g, 0, 0];
        const reach = g * (0.5 + 0.5 * Math.sin(t * 6)); p.shL = [lerp(-1.3, -2.4, g), 0, 0.2 + 0.3 * reach]; p.elL = [-0.3, 0, 0]; p.shR = [lerp(-1.3, -2.2, g), 0, -0.2 - 0.3 * reach];
        p.jaw = Math.min(1, spk + 0.4 * g) * 0.7;
        if (t > 44.0) { C.root.position.set(lerp(-42.0, -36.0, smooth(remap(t, 44.0, 46.4))), 0, lerp(-14.8, -13.8, smooth(remap(t, 44.0, 46.4)))); }
        C.root.visible = t < 46.6;
      }
      applyPose(C, p); C.j.radio.visible = false;
    }
    // Marcos
    M.root.visible = true; M.root.position.set(kM[0], 0, kM[1]); M.root.rotation.set(0, deg(kM[2]), 0);
    {
      let p;
      if (t < 3.0) p = poseRun(runPh, 1, 0);
      else if (t >= 3.4 && t < 6.3) { p = poseStand(t, 1.2); p.rootRX = 0.25; p.spine = [0.2, 0, 0]; p.shL = [-1.3, 0, 0.2]; p.shR = [-1.3, 0, -0.2]; p.elL = [-0.5, 0, 0]; p.elR = [-0.5, 0, 0]; p.hipL = [-0.5 + 0.2 * Math.sin(t * 9 + 1), 0, 0]; p.hipR = [-0.3 - 0.2 * Math.sin(t * 9 + 1), 0, 0]; p.knL = [0.4, 0, 0]; p.knR = [0.4, 0, 0]; }
      else p = poseStand(t, 1.2);
      if (t > 9.6 && t < 15.3) { p.head = [-0.35, 0.5, 0]; }
      // agarrado e arrastado (15,3 → 21,0)
      if (t >= 15.3) {
        const g = sstep(15.3, 15.6, t), u = smooth(remap(t, 15.5, 21.0));
        const dx = lerp(-9.4, -18.0, u * u * 0.4 + u * 0.6), dz = lerp(-18.9, -19.6, u);
        M.root.position.set(dx, lerp(0, 0.16, g), dz); M.root.rotation.set(0, lerp(2.1, -Math.PI / 2, g), 0);
        p = P0(); p.rootRX = -Math.PI / 2 * 0.92 * g; p.rootY = 0.12 * g;
        p.shL = [-2.6 + 0.5 * Math.sin(t * 11), 0, 0.5]; p.shR = [-2.4 + 0.5 * Math.sin(t * 9 + 1), 0, -0.5]; p.elL = [-0.4, 0, 0]; p.elR = [-0.4, 0, 0];
        p.hipL = [0.6 * Math.sin(t * 10), 0, 0.2]; p.hipR = [-0.6 * Math.sin(t * 10), 0, -0.2]; p.knL = [0.6 + 0.4 * Math.sin(t * 10), 0, 0]; p.knR = [0.6 - 0.4 * Math.sin(t * 10), 0, 0];
        p.head = [-0.4, 0.3 * Math.sin(t * 13), 0]; p.jaw = Math.min(1, H.voiceEnv('p2_marcos_socorro', t) * 1.3) * 0.9;
        M.root.visible = t < 21.4;
      }
      if (t < 15.3) p.jaw = 0;
      applyPose(M, p);
    }

    // ======================================================== zumbis
    // — horda na rua (aproxima das portas)
    for (let i = 0; i < 10; i++) {
      const z = lites[10 + i], j = jit[i];
      const t0 = 1.5 + j.a * 3.0; const from = new V3(-6 + j.b * 3, 0, -34 + j.c * 14 + (i % 2) * -8), to = new V3(-7.1 - j.d * 0.9, 0, -17.0 + (j.a - 0.5) * 3.2);
      const w = liteTo(z, from, to, t, t0, 2.2 + j.b * 0.6);
      if (t < t0 - 0.2 || t > 24) { z.root.visible = false; continue; }
      showAt(z, w.p.x, 0, w.p.z, w.moving ? w.yaw : -Math.PI / 2);
      if (w.moving) poseLite(z, t, 'lurch', i, 0.55); else { poseLite(z, t, 'stand', i); z.j.shL.rotation.set(-1.4 + 0.3 * Math.sin(t * 8 + i), 0, 0.1); z.j.shR.rotation.set(-1.5 + 0.3 * Math.sin(t * 7 + i), 0, -0.1); }
    }
    // — mezanino: figuras paradas no escuro; algumas pulam depois de 14 s
    for (let i = 0; i < 12; i++) {
      const z = lites[36 + i], j = jit[20 + i];
      const mx = -23.5 - j.a * 10, mz = -23.2 + j.b * 3.0 + 0.3, vis = t > 9.5;
      const jump = i < 5 ? 14.4 + j.c * 1.2 : 1e9; const tau = t - jump;
      z.root.visible = vis && t < 36;
      if (!z.root.visible) continue;
      if (tau > 0) { // salta do parapeito: parábola até o piso e corre para a porta
        const u = clamp(tau / 0.8, 0, 1), px = mx + (-mx - 11) * 0, tx = lerp(mx, mx + 2 + j.d * 3, u), tz = lerp(mz, -18.2 + j.d * 2, u), ty = lerp(3.8, 0, u * u) + 1.1 * Math.sin(u * Math.PI);
        const fromP = new V3(tx, 0, tz); const run = Math.max(0, tau - 0.8);
        const px2 = tx + Math.min(run * 3.8, 12) * (j.a > 0.5 ? 1 : 0.8), pz = tz + (-17.0 - tz) * clamp(run / 2.0, 0, 1);
        showAt(z, run > 0 ? px2 : tx, run > 0 ? 0 : ty, run > 0 ? pz : tz, run > 0 ? Math.PI / 2 : 0.5);
        poseLite(z, t, 'lurch', i, 1); if (run <= 0) z.j.shL.rotation.set(-2.3, 0, 0.3), z.j.shR.rotation.set(-2.2, 0, -0.3);
        if (px2 > -11) { z.root.visible = t < 22; }
      } else { showAt(z, mx, 3.8, mz, 0.4 + j.d * 3); poseLite(z, t, i % 3 === 0 ? 'crouch' : 'stand', i * 1.7); if (i % 3 === 0) z.body.position.y = -0.55; }
    }
    // — escada rolante: descem em cascata (13,4 →) até o balcão onde Marcos está
    for (let i = 0; i < 16; i++) {
      const z = lites[20 + i], j = jit[40 + i];
      const t0 = 12.3 + i * 0.12 + j.a * 0.5;
      const top = new V3(-22.2 - j.b * 1.0, 3.8, -21.7 + (j.c - 0.5) * 0.8), bot = new V3(-15.4, 0.0, -21.7 + (j.c - 0.5) * 0.8);
      const desc = 1.6 + j.d * 0.7;
      const tau = t - t0; z.root.visible = t > 9.5 && t < 24;
      if (!z.root.visible) continue;
      if (tau < 0) { showAt(z, top.x + 0.7 * Math.sin(i), 3.8 - 0.0, top.z, 1.0 + j.b * 4); poseLite(z, t, i % 2 ? 'stand' : 'crouch', i); if (i % 2 === 0) z.body.position.y = -0.55; }
      else if (tau < desc) { const u = tau / desc, e = u * u; const x = lerp(top.x, bot.x, e), y = lerp(top.y, bot.y, e); showAt(z, x, y, top.z, Math.PI / 2); z.body.rotation.set(tau * 5.5, 0, 0.2 * Math.sin(tau * 9)); z.body.position.y = 0.3; z.j.shL.rotation.set(-2.2, 0, 0.3); z.j.shR.rotation.set(-2.2, 0, -0.3); }
      else { // corre até a pilha em volta de Marcos
        const run = tau - desc; const tx = lerp(bot.x, -9.6 - j.d * 1.2, clamp(run / 1.7, 0, 1)), tz = lerp(bot.z, -18.6 + (j.a - 0.5) * 1.8, clamp(run / 1.7, 0, 1));
        const tgt = clamp(run / 1.7, 0, 1) >= 1;
        let px = tx, pz = tz;
        if (t > 15.6) { const u = smooth(remap(t, 15.5, 21.0)); const mxp = lerp(-9.4, -18.0, u * u * 0.4 + u * 0.6); px = mxp + (j.a - 0.5) * 1.6 + (i < 8 ? 0.5 : -0.9); pz = -19.3 + (j.c - 0.5) * 1.6; }
        showAt(z, px, 0, pz, tgt && t > 15.6 ? Math.atan2(-9.4 - px, -18.9 - pz) + 0 : -Math.PI / 2 * -1);
        poseLite(z, t, 'lurch', i, 1); if (tgt) { z.j.shL.rotation.set(-1.5 + 0.5 * Math.sin(t * 13 + i), 0, 0.1); z.j.shR.rotation.set(-1.2 + 0.5 * Math.sin(t * 11 + i), 0, -0.1); z.body.rotation.x = 0.55; }
        z.root.visible = t < 21.8 || (t < 24 && px > -22);
      }
    }
    // — escada: perseguidores atrás do jogador (seguem sua própria trilha com atraso)
    for (let i = 0; i < 16; i++) {
      const z = lites[48 + i], j = jit[60 + i];
      const lag = 1.6 + i * 0.28 + j.a * 0.6; const t0 = 22.2 + j.b * 1.6;
      z.root.visible = t > t0 && t < 49.4;
      if (!z.root.visible) continue;
      const a = camAt(Math.min(t, 35.4) - lag * (t < 36 ? 1 : 0.55)); const b = camAt(Math.min(t, 35.4) - lag * (t < 36 ? 1 : 0.55) - 0.2);
      let px = a.x, pz = a.z + (j.c - 0.5) * 3.4 * (0.5 + 0.5 * sstep(23, 30, t)) + 0.5 * Math.sin(t * 2.3 + i);
      if (t > 35.4) { const u = sstep(35.4, 42.0, t); px = lerp(px, -41.6 + (j.d - 0.5) * 1.5 - (i % 5) * 0.5, 1); pz = lerp(pz, -16.4 + (j.c - 0.5) * 3.2, 0.5); }
      showAt(z, px, 0, pz, Math.atan2(a.x - b.x, a.z - b.z));
      const moving = t < 36; poseLite(z, t * (moving ? 1.25 : 0.6), moving ? 'lurch' : 'stand', i, 1);
      if (t > 36) { z.j.shL.rotation.set(-1.45 + 0.3 * Math.sin(t * 9 + i), 0, 0.1); z.j.shR.rotation.set(-1.5 + 0.3 * Math.sin(t * 8 + i), 0, -0.1); z.root.rotation.y = Math.PI / 2 * (px > -40 ? 1 : 1) * -1 + Math.PI; }
    }
    // — sustos laterais (saltam de dentro das lojas)
    for (let i = 0; i < 2; i++) {
      const z = lites[64 + i], tt = [29.45, 32.5][i], u = (t - tt) / 0.7; const cp = camAt(tt + 0.2);
      z.root.visible = u > 0 && u < 1.1;
      if (z.root.visible) { showAt(z, cp.x - 3.3 + u * 0.8, 0, lerp(-19.6, -14.6, clamp(u, 0, 1)), 0); z.root.rotation.y = 0; poseLite(z, t, 'lurch', i, 1.3); z.j.shL.rotation.set(-2.0, 0, 0.3); z.j.shR.rotation.set(-2.0, 0, -0.3); }
    }
    // — a pilha em volta de Clara e quem segura seu rabo de cavalo
    for (let i = 0; i < 4; i++) {
      const z = lites[68 + i], vis = t > 35.6 && t < 46.8;
      z.root.visible = vis; if (!vis) continue;
      const cp = C.root.position; const k = i - 1.5;
      const a = C.root.rotation.y; showAt(z, cp.x + Math.sin(a) * -0.55 + k * 0.28 + 0.2, 0, cp.z + Math.cos(a) * -0.55 + k * 0.38, a + Math.PI);
      poseLite(z, t, 'lurch', i * 2, 0.8); z.j.shL.rotation.set(-1.7 + 0.4 * Math.sin(t * 7 + i), 0, 0.2); z.j.shR.rotation.set(-2.0 + 0.5 * Math.sin(t * 8 + i), 0, -0.2); z.body.rotation.x = 0.4;
    }

    // ======================================================== braço/mãos do Lucas no portão
    const armAmt = sstep(35.0, 35.4, t) * (1 - sstep(48.4, 48.7, t));
    H.povArm(cf, armAmt, 0.0);
    if (armAmt > 0) { // as duas mãos agarram a barra e puxam a corrente
      const P = A.lucasPOV; const p = P0(); const pull = 0.5 + 0.5 * Math.sin(t * 18 + (t > 42 ? 0 : 1));
      p.shR = [-1.25 - 0.1 * pull, 0, -0.18]; p.elR = [-0.55 + 0.1 * pull, 0, 0]; p.shL = [-1.3 - 0.1 * pull, 0, 0.18]; p.elL = [-0.55 + 0.1 * pull, 0, 0]; p.grip = 0.9;
      applyPose(P, p); P.root.position.y = H.camPos.y - 1.5 - 0.42; P.root.position.addScaledVector(f2, 0.2);
    }
    // corrente balança quando puxada
    GU.chain.rotation.z = (t > 35.2 && t < 49) ? 0.05 * Math.sin(t * 30) : 0; GU.chain.position.y = (t > 35.2 && t < 49) ? 0.012 * Math.sin(t * 41) : 0;

    // ======================================================== o fim: celular cai, apaga e religa (selfie)
    const L = A.lucasZ;
    const selfie = t >= 52.1;
    if (t > 49.3 && !selfie) {
      const tau = t - 49.3; const g = 16;
      let y = 1.5 - 0.5 * g * tau * tau; const floorY = 0.04;
      if (y < floorY) { const tf = Math.sqrt(2 * 1.46 / g), tb = tau - tf, v = g * tf * 0.3; y = floorY + Math.max(0, v * tb - 0.5 * g * tb * tb); if (tb > 2 * v / g) y = floorY; }
      camera.position.y = y;
      camera.rotateZ(1.3 * smooth(clamp(tau / 0.55, 0, 1))); camera.rotateX(-0.75 * smooth(clamp(tau / 0.55, 0, 1)));
    }
    L.root.visible = selfie;
    if (selfie) {
      // câmera frontal: rosto de Lucas de baixo para cima, iluminado pela tela, vermelho do alarme e verde da saída
      const ts = t - 52.1;
      const cp = new V3(-45.0 + 0.02 * Math.sin(t * 1.6), 1.52 + 0.012 * Math.sin(t * 2.1), -17.0 + 0.015 * Math.sin(t * 1.3));
      camera.position.copy(cp);
      const faceC = new V3(-45.62, 1.66, -17.0);
      camera.up.set(0, 1, 0); camera.lookAt(faceC.x, faceC.y - 0.02, faceC.z); camera.rotateZ(0.03 * Math.sin(t * 1.1) + 0.08); camera.fov = 54; camera.updateProjectionMatrix();
      L.root.position.set(-45.64, 0, -17.0 + 0.0); L.root.rotation.set(0, Math.PI / 2, 0); L.root.visible = true;
      const sp = H.voiceEnv('p2_lucas_zumbi', t);
      const p = poseStand(t, 0); p.rootRX = 0.1; p.chest = [0.12, 0, 0]; p.neck = [0.1 + 0.05 * Math.sin(t * 0.8), 0, 0]; 
      // contorções do pescoço (estalos): rotações bruscas
      const twitch = hash1(Math.floor(t * 4.2)) > 0.72 ? 1 : 0; const tw = twitch * 0.35 * Math.sin(t * 60);
      p.head = [-0.18 + 0.1 * Math.sin(t * 0.9) + tw * 0.3, -0.15 + 0.18 * Math.sin(t * 0.7) + tw, 0.25 + 0.1 * Math.sin(t * 0.6) - tw * 0.5];
      p.jaw = Math.min(1, sp * 1.5) * 0.8; p.jawDrop = 0.12; p.jawShift = 1.2 * (0.6 + 0.4 * Math.sin(t * 3));
      p.shL = [-1.35, 0, 0.1]; p.shR = [-1.2, 0, -0.2]; p.elL = [-1.4, 0, 0]; p.elR = [-1.4, 0, 0];
      applyPose(L, p);
      // luz: tela (azul-branca) por baixo + alarme vermelho + saída verde atrás
      H.screenL.position.set(cp.x + 0.12, cp.y - 0.12, cp.z); H.screenL.intensity = 0.8; H.screenL.color.setHex(0xb8ccff); H.screenL.distance = 3;
      spot.intensity = 0;
      H.pool.forEach((l, i) => { l.intensity = 0; });
      const R = H.pool[0]; R.position.set(-46.8, 2.4, -15.6); R.color.setHex(0xff2a1a); R.intensity = 40 * blink; R.distance = 8;
      const Gn = H.pool[1]; Gn.position.set(-47.3, 2.7, -17.4); Gn.color.setHex(0x46ff7a); Gn.intensity = 26; Gn.distance = 8;
      const Wf = H.pool[2]; Wf.position.set(-44.3, 2.2, -17.0); Wf.color.setHex(0x8fa8ff); Wf.intensity = 9; Wf.distance = 6;
      // zumbis ao fundo atrás de Lucas
      for (let i = 0; i < 5; i++) { const z = lites[48 + i]; z.root.visible = true; showAt(z, -47.0 - 0.3, 0, -17.0 + (i - 2) * 0.55, Math.PI / 2); z.root.position.x = -46.6 - 0.9 - (i % 2) * 0.5; poseLite(z, t, 'stand', i); }
      for (const u of [SU.groundMesh.material.uniforms, GU.floor.material.uniforms]) u.uSpot.value.set(0, 0, 0, 0);
    }

    // ======================================================== parâmetros do quadro
    const bat = t < 20 ? 3 : t < 38 ? 2 : t < 49.3 ? 1 : 0;
    out.zoom = 1; out.focus = cf.v[10];
    out.exposure = inside ? 1.3 : 1.15;
    out.flicker = (hash1(Math.floor(t * 30)) - 0.5) * 0.05 + (t > 36 ? (hash1(Math.floor(t * 11)) > 0.9 ? -0.4 : 0) : 0);
    out.hud = { clock: t > 22 ? '04:23 AM' : '04:22 AM', battery: selfie ? 0 : bat, rec: true, t, zoomUI: 0, focusBox: null };
    out.lowbat = clamp((t - 24) / 26, 0, 1) * 0.5;
    out.blackout = (t >= 49.75 && t < 52.1) ? (t > 51.95 && hash1(Math.floor(t * 40)) > 0.5 ? 0.0 : 1) : 0;
    if (selfie) { out.exposure = 1.45; out.lowbat = 0.2; out.flicker = (hash1(Math.floor(t * 30)) > 0.93 ? -0.5 : 0); }
    out.fade = t >= 59.82 ? 1 : 0;
    out.glitch = (t > 52.0 && t < 52.45) ? 0.9 : (t > 59.3 ? 0.4 : 0);
    out.flash = 0; out.endCard = false; out.cocBoost = selfie ? 0.5 : 0.8;
    if (selfie) { out.focus = 0.5; out.zoom = 1.0; }
    out.post = { tintShadow: selfie ? [0.9, 1.0, 1.06] : [0.82, 1.0, 1.08], vig: selfie ? 0.62 : 0.5 };
  };
  story.P2.fn = fn;
}
