// Bootstrap: renderer, mundo, pós-processamento, HUD e API de renderização determinística por tempo.
import * as THREE from 'three';
import { Post } from './post.js';
import { buildStreet } from './world_street.js';
import { buildGallery } from './world_gallery.js';
import { createStory } from './story.js';
import { installPart2 } from './part2.js';
import { lensDirtTexture } from './textures.js';
import { clamp, lerp, hash1 } from './util.js';

const q = new URLSearchParams(location.search);
const W = +(q.get('w') || 1080), H = +(q.get('h') || 1920);
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance', alpha: false });
renderer.setPixelRatio(1); renderer.setSize(W, H, false);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
renderer.toneMapping = THREE.NoToneMapping;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0b1219, 0.019);
const camera = new THREE.PerspectiveCamera(68, W / H, 0.08, 420);

// ---- ambiente (reflexos em carros/vidros): cena mínima → PMREM
{
  const envScene = new THREE.Scene(); envScene.background = new THREE.Color(0x05070b);
  const mk = (c, i, w, h, x, y, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(i), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); envScene.add(m); };
  mk(0xffa24a, 9, 3, 1.6, -7, 7, 3); mk(0xffa24a, 9, 3, 1.6, 7, 7, -5); mk(0xffa24a, 6, 3, 1.6, 0, 7, -12);
  mk(0x3cff98, 3, 2, 2, 10, 3, 2); mk(0x2a4a7a, 1.2, 30, 10, 0, 12, 0); mk(0x1a2230, 0.6, 30, 6, 0, -8, 0);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(envScene, 0.04).texture; scene.environmentIntensity = 0.55;
}

const street = buildStreet({ renderer, W, H }); scene.add(street);
const gallery = buildGallery({ renderer, W, H }); scene.add(gallery);
const post = new Post(renderer, W, H);
const dirt = lensDirtTexture();
const story = createStory({ scene, camera, street, gallery, W, H, post });
installPart2(story, { scene, camera, street, gallery, W, H });

// ---- HUD (queimado no vídeo)
const hudC = document.createElement('canvas'); hudC.width = W; hudC.height = H; const hg = hudC.getContext('2d');
const hudTex = new THREE.CanvasTexture(hudC); hudTex.minFilter = THREE.LinearFilter; hudTex.generateMipmaps = false; hudTex.flipY = true;
function drawHUD(h, part, t) {
  hg.clearRect(0, 0, W, H);
  const s = W / 1080, px = (v) => v * s;
  hg.save(); hg.shadowColor = 'rgba(0,0,0,0.75)'; hg.shadowBlur = px(6); hg.fillStyle = '#fff'; hg.textBaseline = 'middle';
  const right = W - px(54), top = px(150);
  if (!h.hideAll) {
  if (h.rec !== false) {
    const on = (Math.floor(t * 1.0) % 2) === 0 || true;
    const blink = Math.floor(t * 2) % 2 === 0;
    hg.font = `700 ${px(40)}px "Helvetica Neue", Arial, sans-serif`; hg.textAlign = 'right';
    hg.fillText('REC', right, top);
    hg.shadowBlur = px(10); hg.shadowColor = 'rgba(255,0,0,0.9)'; hg.fillStyle = blink ? '#ff2a2a' : '#7a1515';
    hg.beginPath(); hg.arc(right - px(104), top, px(15), 0, Math.PI * 2); hg.fill();
    hg.shadowColor = 'rgba(0,0,0,0.75)'; hg.shadowBlur = px(6); hg.fillStyle = '#fff';
  }
  hg.font = `600 ${px(48)}px "Helvetica Neue", Arial, sans-serif`; hg.textAlign = 'right';
  hg.fillText(h.clock, right, top + px(62));
  // bateria
  const bx = right - px(44), by = top + px(132), bw = px(58), bh = px(26);
  const low = h.battery <= 20, crit = h.battery <= 3;
  const col = crit ? (Math.floor(t * 3) % 2 ? '#ff3030' : '#802020') : low ? '#ff5a3a' : '#fff';
  hg.strokeStyle = col; hg.fillStyle = col; hg.lineWidth = px(4);
  hg.strokeRect(bx - bw, by - bh / 2, bw, bh); hg.fillRect(bx + px(2), by - bh / 5, px(6), bh * 0.4);
  hg.fillRect(bx - bw + px(5), by - bh / 2 + px(5), Math.max(px(3), (bw - px(10)) * clamp(h.battery / 100, 0, 1)), bh - px(10));
  hg.font = `600 ${px(36)}px "Helvetica Neue", Arial, sans-serif`; hg.textAlign = 'right'; hg.fillStyle = '#fff';
  hg.fillText(`${Math.round(h.battery)}%`, bx - bw - px(14), by);
  // lado esquerdo: modo e tempo de gravação
  hg.textAlign = 'left'; hg.font = `500 ${px(32)}px "Helvetica Neue", Arial, sans-serif`; hg.globalAlpha = 0.85;
  hg.fillText('4K  30', px(54), top - px(2));
  const el = Math.floor(h.elapsed ?? t); hg.fillText(`${String(Math.floor(el / 3600)).padStart(2, '0')}:${String(Math.floor(el / 60) % 60).padStart(2, '0')}:${String(el % 60).padStart(2, '0')}`, px(54), top + px(48));
  hg.globalAlpha = 1;
  // zoom
  if (h.zoomUI) {
    const txt = `${h.zoomUI.toFixed(1)}x`, cx = W / 2, cy = H - px(300);
    hg.fillStyle = 'rgba(0,0,0,0.45)'; hg.beginPath(); hg.roundRect(cx - px(60), cy - px(28), px(120), px(56), px(28)); hg.fill();
    hg.fillStyle = '#ffd34a'; hg.font = `700 ${px(34)}px "Helvetica Neue", Arial, sans-serif`; hg.textAlign = 'center'; hg.fillText(txt, cx, cy);
  }
  // caixa de foco
  if (h.focusBox) {
    const f = h.focusBox, x = f.x * W, y = (1 - f.y) * H, sz = px(150) * (1 + (1 - f.k) * 0.35);
    hg.strokeStyle = '#ffd34a'; hg.lineWidth = px(4); hg.shadowBlur = 0; hg.globalAlpha = 0.5 + 0.5 * f.k;
    hg.strokeRect(x - sz / 2, y - sz / 2, sz, sz);
    hg.beginPath(); for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) { hg.moveTo(x + dx * sz / 2, y + dy * sz / 2); hg.lineTo(x + dx * (sz / 2 - px(16)), y + dy * (sz / 2 - px(16))); } hg.stroke(); hg.globalAlpha = 1;
  }
  }
  // cartela "CONTINUA NA PARTE 2"
  if (h.endCard) {
    const k = clamp((t - h.endCardT) * 3, 0, 1);
    hg.shadowBlur = 0; hg.globalAlpha = k; hg.textAlign = 'center';
    const cx = W / 2, cy = H * 0.5;
    const jit = hash1(Math.floor(t * 24)) > 0.85 ? px(8) : 0;
    for (const [dx, c] of [[-px(5) - jit, '#ff2a4a'], [px(5) + jit, '#26e0ff'], [0, '#ffffff']]) {
      hg.fillStyle = c; hg.font = `800 ${px(86)}px "Helvetica Neue", Arial, sans-serif`;
      hg.fillText('CONTINUA NA', cx + dx, cy - px(70)); hg.fillText('PARTE 2', cx + dx, cy + px(30));
      hg.beginPath(); hg.moveTo(cx - px(40) + dx, cy + px(120)); hg.lineTo(cx - px(40) + dx, cy + px(220)); hg.lineTo(cx + px(50) + dx, cy + px(170)); hg.closePath(); hg.fill();
    }
    hg.globalAlpha = 1;
  }
  hg.restore();
  hudTex.needsUpdate = true;
}

// ---- renderização por tempo
const cuesPromise = fetch(`./cues_parte${q.get('part') || 1}.json`).then((r) => r.json()).catch(() => null);
let ready = false;
async function init() {
  const cues = await cuesPromise; story.setCues(cues || { voices: {}, marks: {} });
  story.cues = cues;
  renderer.compile(scene, camera);
  ready = true; window.ready = true;
}
init();

function renderScene() {
  renderer.setRenderTarget(post.sceneRT); renderer.setClearColor(0x05080d, 1); renderer.clear(true, true, true);
  const sp = story.helpers.spot; renderer.shadowMap.needsUpdate = sp.intensity > 0.01;
  renderer.render(scene, camera);
}

window.renderAt = (part, t, opts = {}) => {
  const out0 = story.update(part, t - 0.017);
  const out = story.update(part, t);
  const ang = out.angSpeed || 0, spd = out.posSpeed || 0;
  let N = ang < 0.9 ? 1 : ang < 2.2 ? 2 : ang < 4.5 ? 3 : ang < 8 ? 4 : 5;
  if (opts.fast) N = 1;
  const snap = { ...out };
  const shutter = 1 / 45;
  if (N === 1) { renderScene(); }
  else {
    for (let i = 0; i < N; i++) {
      story.update(part, t + ((i + 0.5) / N - 0.5) * shutter);
      renderScene(); post.accumulate(i === 0, 1 / N);
    }
  }
  const input = N === 1 ? post.sceneRT : post.accumRT;
  const hud = snap.hud || {}; hud.endCardT = story.cues?.marks?.end_card ?? 0; hud.endCard = snap.endCard; hud.elapsed = (hud.elapsed ?? t) + (part === 2 ? 60 : 0);
  drawHUD(hud, part, t);
  const prm = {
    zoom: snap.zoom, focus: snap.focus, exposure: snap.exposure, skew: snap.skew || 0, seed: (t * 31.7) % 97.0,
    cocMax: 20 * (W / 1080), aperture: 0.85, nearP: camera.near, farP: camera.far, hudA: 1,
    fade: snap.fade || 0, flash: snap.flash || 0, glitch: snap.glitch || 0, lowbat: snap.lowbat || 0, flicker: snap.flicker || 0, blackout: snap.blackout || 0,
    ca: 0.0042, vig: 0.5, grainA: 0.062, compress: 0.65, bloomA: 0.5, bloomThr: 0.9, streakA: 0.1, dirtA: 0.7, barrel: 0.055, sat: 1.06,
    blurBoost: snap.cocBoost ?? 1, zoomC: [0.5, 0.5],
    tintShadow: snap.tintShadow || [0.82, 1.0, 1.1], tintHigh: snap.tintHigh || [1.1, 1.0, 0.88],
    ...(snap.post || {}),
  };
  post.composite(input, prm, post.sceneRT.depthTexture, dirt, hudTex);
  return opts.noImage ? null : canvas.toDataURL('image/jpeg', opts.q || 0.93);
};
window.__dbg = { scene, story, camera, post, renderer };
window.info = () => ({ ready, W, H, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures, progs: renderer.info.programs?.length });
