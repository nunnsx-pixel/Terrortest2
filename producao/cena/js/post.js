// Pós-processamento "câmera de celular": bloom HDR, DOF por profundidade, aberração cromática,
// ruído de sensor, blocos de compressão, rolling shutter, zoom digital, HUD, color grade.
import * as THREE from 'three';

const VERT = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const PREFILTER = /* glsl */`
uniform sampler2D tMap; uniform float thr; uniform float knee;
varying vec2 vUv;
void main(){
  vec3 c = texture2D(tMap, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float soft = clamp(l - thr + knee, 0.0, 2.0*knee); soft = soft*soft/(4.0*knee+1e-4);
  float k = max(soft, l - thr) / max(l, 1e-4);
  gl_FragColor = vec4(min(c*k, vec3(60.0)), 1.0);
}`;

const DOWN = /* glsl */`
uniform sampler2D tMap; uniform vec2 texel;
varying vec2 vUv;
void main(){
  vec2 t = texel;
  vec3 a = texture2D(tMap, vUv + t*vec2(-2.,-2.)).rgb, b = texture2D(tMap, vUv + t*vec2(0.,-2.)).rgb, c = texture2D(tMap, vUv + t*vec2(2.,-2.)).rgb;
  vec3 d = texture2D(tMap, vUv + t*vec2(-2.,0.)).rgb,  e = texture2D(tMap, vUv).rgb,                   f = texture2D(tMap, vUv + t*vec2(2.,0.)).rgb;
  vec3 g = texture2D(tMap, vUv + t*vec2(-2.,2.)).rgb,  h = texture2D(tMap, vUv + t*vec2(0.,2.)).rgb,  i = texture2D(tMap, vUv + t*vec2(2.,2.)).rgb;
  vec3 j = texture2D(tMap, vUv + t*vec2(-1.,-1.)).rgb, k = texture2D(tMap, vUv + t*vec2(1.,-1.)).rgb;
  vec3 l = texture2D(tMap, vUv + t*vec2(-1.,1.)).rgb,  m = texture2D(tMap, vUv + t*vec2(1.,1.)).rgb;
  vec3 o = e*0.125 + (a+c+g+i)*0.03125 + (b+d+f+h)*0.0625 + (j+k+l+m)*0.125;
  gl_FragColor = vec4(o, 1.0);
}`;

const UP = /* glsl */`
uniform sampler2D tMap; uniform sampler2D tPrev; uniform vec2 texel; uniform float w;
varying vec2 vUv;
void main(){
  vec2 t = texel;
  vec3 s = texture2D(tMap, vUv + t*vec2(-1.,-1.)).rgb + texture2D(tMap, vUv + t*vec2(1.,-1.)).rgb
         + texture2D(tMap, vUv + t*vec2(-1.,1.)).rgb  + texture2D(tMap, vUv + t*vec2(1.,1.)).rgb;
  s += 2.0*(texture2D(tMap, vUv + t*vec2(0.,-1.)).rgb + texture2D(tMap, vUv + t*vec2(0.,1.)).rgb + texture2D(tMap, vUv + t*vec2(-1.,0.)).rgb + texture2D(tMap, vUv + t*vec2(1.,0.)).rgb);
  s += 4.0*texture2D(tMap, vUv).rgb;
  s /= 16.0;
  gl_FragColor = vec4(texture2D(tPrev, vUv).rgb + s*w, 1.0);
}`;

const STREAK = /* glsl */`
uniform sampler2D tMap; uniform vec2 texel;
varying vec2 vUv;
void main(){
  vec3 acc = vec3(0.0); float ws = 0.0;
  for(int i=-24;i<=24;i++){ float f = float(i); float w = exp(-abs(f)*0.14); acc += texture2D(tMap, vUv + vec2(texel.x*f*2.0, 0.0)).rgb*w; ws += w; }
  gl_FragColor = vec4(acc/ws, 1.0);
}`;

const ACCUM = /* glsl */`
uniform sampler2D tMap; uniform float w;
varying vec2 vUv;
void main(){ gl_FragColor = vec4(texture2D(tMap, vUv).rgb*w, 1.0); }`;

const COMPOSITE = /* glsl */`
uniform sampler2D tScene, tDepth, tBloom, tStreak, tDirt, tHud;
uniform vec2 res; uniform float seed;
uniform float zoom; uniform vec2 zoomC;
uniform float focus, cocMax, aperture, nearP, farP;
uniform float exposure, ca, vig, grainA, compress, skew, fade, flash, glitch, sat, dirtA, bloomA, streakA, barrel, hudA, blurBoost;
uniform vec3 tintShadow, tintHigh;
uniform float lowbat, flicker, blackout, selfie;
varying vec2 vUv;

float linZ(float d){ float z = d*2.0-1.0; return 2.0*nearP*farP/(farP+nearP - z*(farP-nearP)); }
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
uint pcg(uint v){ uint s = v*747796405u+2891336453u; uint w = ((s>>((s>>28u)+4u))^s)*277803737u; return (w>>22u)^w; }
float rnd(vec2 p, float s){ uvec2 q = uvec2(p); uint h = pcg(q.x + pcg(q.y + pcg(uint(s*1000.0)))); return float(h)/4294967295.0; }
float coc(float d){ return clamp(aperture*abs(d-focus)/max(d,0.05), 0.0, 1.0); }

void main(){
  vec2 uv = vUv;
  vec2 asp = vec2(res.x/res.y, 1.0);
  // distorção de barril (grande-angular do celular)
  vec2 cc = (uv-0.5)*asp; float r2 = dot(cc,cc); cc *= 1.0 + barrel*r2; uv = cc/asp + 0.5;
  // zoom digital
  uv = (uv-0.5)/zoom + zoomC;
  // rolling shutter + glitch de linhas
  uv.x += (uv.y-0.5)*skew;
  if(glitch>0.0){
    float band = floor(uv.y*38.0);
    float r = rnd(vec2(band, 3.0), seed*7.0);
    if(r > 1.0-glitch*0.6) uv.x += (rnd(vec2(band, 9.0), seed*3.0)-0.5)*0.16*glitch;
  }
  vec2 px = 1.0/res;

  // ---- profundidade de campo (gather em espiral, preserva foco do primeiro plano)
  float d = linZ(texture2D(tDepth, uv).x);
  float c0 = coc(d);
  vec3 col = texture2D(tScene, uv).rgb; float wsum = 1.0;
  float R = cocMax*(c0*blurBoost + (blurBoost>1.0?0.0:0.0));
  float ang0 = rnd(gl_FragCoord.xy, seed)*6.2831;
  const int N = 28;
  for(int i=0;i<N;i++){
    float a = float(i)*2.39996 + ang0;
    float rr = sqrt((float(i)+0.5)/float(N));
    vec2 o = vec2(cos(a), sin(a))*rr*R*px;
    vec2 su = uv + o;
    float sd = linZ(texture2D(tDepth, su).x);
    float sc = coc(sd)*cocMax*blurBoost;
    float w = (sc >= rr*R*0.9 || sd < d) ? 1.0 : 0.0;
    vec3 s = texture2D(tScene, su).rgb;
    w *= 1.0 + 3.0*smoothstep(1.0, 6.0, max(s.r,max(s.g,s.b))); // bokeh: realça pontos de luz
    col += s*w; wsum += w;
  }
  col /= wsum;
  // aberração cromática radial
  vec2 dir = (uv-0.5);
  float caAmt = ca*(0.3 + 1.6*length(dir));
  float rC = texture2D(tScene, uv + dir*caAmt).r, bC = texture2D(tScene, uv - dir*caAmt).b;
  col.r = mix(rC, col.r, clamp(c0*1.5,0.0,1.0)); col.b = mix(bC, col.b, clamp(c0*1.5,0.0,1.0));
  // bloom + sujeira da lente + estrias horizontais
  vec3 bl = texture2D(tBloom, uv).rgb;
  vec3 dirt = texture2D(tDirt, vUv).rgb;
  col += bl*bloomA*(1.0 + dirt*dirtA*5.0);
  col += texture2D(tStreak, uv).rgb*streakA*vec3(0.75,0.88,1.2);
  // blocos de compressão nas sombras
  vec2 bp = floor(vUv*res/10.0)*10.0 + 5.0;
  vec3 blk = textureLod(tScene, bp/res*0.0 + (bp/res - 0.5)/zoom + zoomC, 3.0).rgb;
  float lum0 = dot(col, vec3(0.2126,0.7152,0.0722));
  col = mix(col, blk, compress*(1.0-smoothstep(0.0,0.18,lum0))*0.55);
  // exposição + color grade
  col *= exposure * (1.0 + flicker);
  float l = dot(col, vec3(0.2126,0.7152,0.0722));
  col = mix(vec3(l), col, sat);
  col *= mix(tintShadow, tintHigh, smoothstep(0.0, 0.7, l));
  col = aces(col);
  col = col*0.965 + 0.012;
  col = pow(col, vec3(1.0/2.2));
  // bateria fraca: tom desbotado
  col = mix(col, vec3(dot(col,vec3(0.33))), lowbat*0.5);
  // HUD (queimado no vídeo)
  vec4 hud = texture2D(tHud, vUv);
  col = mix(col, hud.rgb, hud.a*hudA);
  // ruído de sensor (mais forte nas sombras), cromático e temporal
  float ln = rnd(gl_FragCoord.xy, seed+0.17)-0.5;
  vec3 cn = vec3(rnd(gl_FragCoord.xy, seed+0.31), rnd(gl_FragCoord.xy+17.0, seed+0.43), rnd(gl_FragCoord.xy+41.0, seed+0.59))-0.5;
  float sh = 1.0 - smoothstep(0.0, 0.5, dot(col, vec3(0.333)));
  col += ln*grainA*(0.35+1.3*sh) + cn*grainA*0.55*(0.3+sh);
  // vinheta
  vec2 vv = (vUv-0.5)*vec2(0.9,1.0);
  col *= 1.0 - vig*smoothstep(0.28, 0.95, length(vv));
  // linhas de varredura sutis (digital)
  col *= 0.985 + 0.015*sin(vUv.y*res.y*3.14159);
  col = mix(col, vec3(1.0,0.95,0.9), flash);
  col *= (1.0-fade) * (1.0-blackout);
  gl_FragColor = vec4(clamp(col,0.0,1.0), 1.0);
}`;

function quadMat(frag, uniforms) {
  return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
}

export class Post {
  constructor(renderer, W, H) {
    this.r = renderer; this.W = W; this.H = H;
    const hf = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    this.sceneRT = new THREE.WebGLRenderTarget(W, H, { ...hf, depthBuffer: true, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    this.sceneRT.depthTexture = new THREE.DepthTexture(W, H, THREE.UnsignedIntType);
    this.accumRT = new THREE.WebGLRenderTarget(W, H, { ...hf, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    this.levels = 5;
    this.down = []; this.up = [];
    for (let i = 0; i < this.levels; i++) {
      const w = Math.max(2, W >> (i + 1)), h = Math.max(2, H >> (i + 1));
      this.down.push(new THREE.WebGLRenderTarget(w, h, hf));
      this.up.push(new THREE.WebGLRenderTarget(w, h, hf));
    }
    this.streakRT = new THREE.WebGLRenderTarget(this.down[2].width, this.down[2].height, hf);
    this.black = new THREE.WebGLRenderTarget(2, 2, hf);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.quad.frustumCulled = false;
    this.qs = new THREE.Scene(); this.qs.add(this.quad);
    this.qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.mPre = quadMat(PREFILTER, { tMap: { value: null }, thr: { value: 1.0 }, knee: { value: 0.5 } });
    this.mDown = quadMat(DOWN, { tMap: { value: null }, texel: { value: new THREE.Vector2() } });
    this.mUp = quadMat(UP, { tMap: { value: null }, tPrev: { value: null }, texel: { value: new THREE.Vector2() }, w: { value: 1 } });
    this.mStreak = quadMat(STREAK, { tMap: { value: null }, texel: { value: new THREE.Vector2() } });
    this.mAccum = quadMat(ACCUM, { tMap: { value: null }, w: { value: 1 } });
    this.mAccum.blending = THREE.CustomBlending; this.mAccum.blendEquation = THREE.AddEquation; this.mAccum.blendSrc = THREE.OneFactor; this.mAccum.blendDst = THREE.OneFactor;
    this.hudTex = null;
    const U = (v) => ({ value: v });
    this.u = {
      tScene: U(null), tDepth: U(null), tBloom: U(null), tStreak: U(null), tDirt: U(null), tHud: U(null),
      res: U(new THREE.Vector2(W, H)), seed: U(0), zoom: U(1), zoomC: U(new THREE.Vector2(0.5, 0.5)),
      focus: U(5), cocMax: U(16), aperture: U(0.9), nearP: U(0.1), farP: U(400),
      exposure: U(1), ca: U(0.004), vig: U(0.5), grainA: U(0.05), compress: U(0.6), skew: U(0), fade: U(0), flash: U(0),
      glitch: U(0), sat: U(1.05), dirtA: U(0.6), bloomA: U(0.45), streakA: U(0.12), barrel: U(0.06), hudA: U(1), blurBoost: U(1),
      tintShadow: U(new THREE.Vector3(0.86, 1.0, 1.08)), tintHigh: U(new THREE.Vector3(1.08, 1.0, 0.9)),
      lowbat: U(0), flicker: U(0), blackout: U(0), selfie: U(0),
    };
    this.mComp = quadMat(COMPOSITE, this.u);
  }

  pass(mat, target, clear = true) {
    this.quad.material = mat;
    this.r.setRenderTarget(target);
    if (clear) { this.r.setClearColor(0x000000, 1); this.r.clear(true, false, false); }
    this.r.render(this.qs, this.qc);
  }

  accumulate(first, w) {
    this.mAccum.uniforms.tMap.value = this.sceneRT.texture; this.mAccum.uniforms.w.value = w;
    this.quad.material = this.mAccum;
    this.r.setRenderTarget(this.accumRT);
    if (first) { this.r.setClearColor(0x000000, 1); this.r.clear(true, false, false); }
    this.r.render(this.qs, this.qc);
  }

  bloom(src, thr, knee) {
    this.mPre.uniforms.tMap.value = src; this.mPre.uniforms.thr.value = thr; this.mPre.uniforms.knee.value = knee;
    this.pass(this.mPre, this.down[0]);
    for (let i = 1; i < this.levels; i++) {
      this.mDown.uniforms.tMap.value = this.down[i - 1].texture;
      this.mDown.uniforms.texel.value.set(1 / this.down[i - 1].width, 1 / this.down[i - 1].height);
      this.pass(this.mDown, this.down[i]);
    }
    // sobe acumulando
    this.mUp.uniforms.w.value = 1;
    this.mUp.uniforms.tMap.value = this.down[this.levels - 1].texture;
    this.mUp.uniforms.tPrev.value = this.black.texture;
    this.mUp.uniforms.texel.value.set(1 / this.down[this.levels - 1].width, 1 / this.down[this.levels - 1].height);
    this.pass(this.mUp, this.up[this.levels - 1]);
    for (let i = this.levels - 2; i >= 0; i--) {
      this.mUp.uniforms.tMap.value = this.up[i + 1].texture;
      this.mUp.uniforms.tPrev.value = this.down[i].texture;
      this.mUp.uniforms.texel.value.set(1 / this.up[i + 1].width, 1 / this.up[i + 1].height);
      this.pass(this.mUp, this.up[i]);
    }
    this.mStreak.uniforms.tMap.value = this.down[2].texture;
    this.mStreak.uniforms.texel.value.set(1 / this.down[2].width, 1 / this.down[2].height);
    this.pass(this.mStreak, this.streakRT);
    return this.up[0].texture;
  }

  composite(input, params, depthTex, dirtTex, hudTex) {
    const u = this.u;
    const bl = this.bloom(input.texture, params.bloomThr ?? 1.0, 0.6);
    u.tScene.value = input.texture; u.tDepth.value = depthTex; u.tBloom.value = bl; u.tStreak.value = this.streakRT.texture;
    u.tDirt.value = dirtTex; u.tHud.value = hudTex;
    for (const k in params) if (u[k] !== undefined) {
      if (Array.isArray(params[k])) u[k].value.set(...params[k]); else u[k].value = params[k];
    }
    this.pass(this.mComp, null, false);
  }
}
