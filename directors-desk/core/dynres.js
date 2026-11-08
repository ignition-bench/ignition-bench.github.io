/*! FSR 1 (EASU/RCAS) port: Copyright (c) 2021 Advanced Micro Devices, Inc. — MIT License · see /THIRD-PARTY-NOTICES.txt */
"use strict";

const DRS = {
  on: true, scale: 1, min: 0.6, max: 1, down: 0.1, up: 0.05,
  gaps: [], works: [], checks: [],
  lastChange: 0, lastRaise: -1e9, upBlock: 0, blockDur: 15000, lastCheck: 0, last: 0,
  changes: 0, note: "", fsr: false, fsrOn: true,
};
const drsMed = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

function drsCanvasRatio(pr){
  V3.sw = Math.max(1, Math.round(V3.rw * DRS.scale)); V3.sh = Math.max(1, Math.round(V3.rh * DRS.scale));
  DRS.fsr = FSR.ok && DRS.fsrOn && DRS.scale < 0.999;
  return DRS.fsr ? pr : pr * DRS.scale;
}
function drsSetScale(s){
  s = Math.round(Math.max(DRS.min, Math.min(DRS.max, s)) * 20) / 20;
  if (s === DRS.scale) return;
  DRS.scale = s; DRS.changes++; DRS.lastChange = performance.now();
  if (typeof perfEv === "function") perfEv(t("ev_resolution") + " " + Math.round(s * 100) + "%");
  v3Resize();
}
function drsResume(){ DRS.last = 0; DRS.gaps.length = 0; DRS.works.length = 0; DRS.checks.length = 0; }

function drsTick(){
  const t = performance.now(), gap = DRS.last ? t - DRS.last : 0; DRS.last = t;
  const loading = t < PERF.loadUntil || PERF.loadFrames > 0;
  if (!DRS.on || !gap || gap > 3000 || loading || !perfCounting()){ DRS.gaps.length = 0; DRS.works.length = 0; DRS.checks.length = 0; return; }
  DRS.gaps.push(gap); DRS.works.push(PERF.f0 ? t - PERF.f0 : 0);
  let sum = DRS.gaps.reduce((a, b) => a + b, 0);
  while (DRS.gaps.length > 1 && sum > 1000){ sum -= DRS.gaps.shift(); DRS.works.shift(); }
  if (t - DRS.lastCheck < 500 || sum < 900) return;
  DRS.lastCheck = t;
  const budget = PERF.budget, med = drsMed(DRS.gaps), work = drsMed(DRS.works);
  DRS.checks.push({ slow: med > budget * 1.15, easy: med <= budget * 1.05 && work < budget * 0.6 });
  if (DRS.checks.length > 6) DRS.checks.shift();
  DRS.note = t < DRS.upBlock && DRS.scale < 1 ? "hold" : "";
  if (t - DRS.lastChange < 2000) return;
  const last = DRS.checks[DRS.checks.length - 1];
  if (last.slow && DRS.scale > DRS.min){
    if (t - DRS.lastRaise < 3000){ DRS.upBlock = t + DRS.blockDur; DRS.blockDur = Math.min(60000, DRS.blockDur * 2); }
    drsSetScale(DRS.scale - DRS.down); DRS.checks.length = 0;
  } else if (DRS.scale < DRS.max && t >= DRS.upBlock && DRS.checks.length >= 6 && DRS.checks.every(c => c.easy)){
    DRS.lastRaise = t; drsSetScale(DRS.scale + DRS.up); DRS.checks.length = 0;
  }
}

const FSR = { ok: false, rt: null, rt2: null, scn: null, cam: null, quad: null, easu: null, rcas: null, stops: 0.25 };
const FSR_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const FSR_COMMON = `
precision highp float;
uniform sampler2D tSrc;
float Lum(vec3 c) { return c.b * 0.5 + (c.r * 0.5 + c.g); }`;
const FSR_EASU_FS = FSR_COMMON + `
uniform vec2 inSize; uniform vec2 outSize;
vec3 F(vec2 p) { return texture2D(tSrc, (p + 0.5) / inSize).rgb; }
void Set(inout vec2 dir, inout float len, float w, float lA, float lB, float lC, float lD, float lE) {
  float lenX = max(abs(lD - lC), abs(lC - lB)); lenX = lenX > 0.0 ? 1.0 / lenX : 0.0;
  float dirX = lD - lB; dir.x += dirX * w;
  lenX = clamp(abs(dirX) * lenX, 0.0, 1.0); lenX *= lenX; len += lenX * w;
  float lenY = max(abs(lE - lC), abs(lC - lA)); lenY = lenY > 0.0 ? 1.0 / lenY : 0.0;
  float dirY = lE - lA; dir.y += dirY * w;
  lenY = clamp(abs(dirY) * lenY, 0.0, 1.0); lenY *= lenY; len += lenY * w;
}
void Tap(inout vec3 aC, inout float aW, vec2 off, vec2 dir, vec2 len, float lob, float clp, vec3 c) {
  vec2 v = vec2(off.x * dir.x + off.y * dir.y, off.x * (-dir.y) + off.y * dir.x) * len;
  float d2 = min(dot(v, v), clp);
  float wB = 0.4 * d2 - 1.0, wA = lob * d2 - 1.0; wB *= wB; wA *= wA;
  wB = 1.5625 * wB - 0.5625;
  float w = wB * wA; aC += c * w; aW += w;
}
void main() {
  vec2 pp = (floor(gl_FragCoord.xy) + 0.5) * (inSize / outSize) - 0.5;
  vec2 fp = floor(pp); pp -= fp;
  vec3 b = F(fp + vec2(0.0, -1.0)), c = F(fp + vec2(1.0, -1.0));
  vec3 e = F(fp + vec2(-1.0, 0.0)), f = F(fp), g = F(fp + vec2(1.0, 0.0)), h = F(fp + vec2(2.0, 0.0));
  vec3 i = F(fp + vec2(-1.0, 1.0)), j = F(fp + vec2(0.0, 1.0)), k = F(fp + vec2(1.0, 1.0)), l = F(fp + vec2(2.0, 1.0));
  vec3 n = F(fp + vec2(0.0, 2.0)), o = F(fp + vec2(1.0, 2.0));
  float bL = Lum(b), cL = Lum(c), eL = Lum(e), fL = Lum(f), gL = Lum(g), hL = Lum(h), iL = Lum(i), jL = Lum(j), kL = Lum(k), lL = Lum(l), nL = Lum(n), oL = Lum(o);
  vec2 dir = vec2(0.0); float len = 0.0;
  Set(dir, len, (1.0 - pp.x) * (1.0 - pp.y), bL, eL, fL, gL, jL);
  Set(dir, len, pp.x * (1.0 - pp.y), cL, fL, gL, hL, kL);
  Set(dir, len, (1.0 - pp.x) * pp.y, fL, iL, jL, kL, nL);
  Set(dir, len, pp.x * pp.y, gL, jL, kL, lL, oL);
  float dirR = dot(dir, dir); bool zro = dirR < 1.0 / 32768.0;
  dirR = zro ? 1.0 : inversesqrt(dirR); if (zro) dir.x = 1.0; dir *= dirR;
  len = len * 0.5; len *= len;
  float stretch = dot(dir, dir) / max(abs(dir.x), abs(dir.y));
  vec2 len2 = vec2(1.0 + (stretch - 1.0) * len, 1.0 - 0.5 * len);
  float lob = 0.5 + ((1.0 / 4.0 - 0.04) - 0.5) * len, clp = 1.0 / lob;
  vec3 aC = vec3(0.0); float aW = 0.0;
  Tap(aC, aW, vec2(0.0, -1.0) - pp, dir, len2, lob, clp, b);
  Tap(aC, aW, vec2(1.0, -1.0) - pp, dir, len2, lob, clp, c);
  Tap(aC, aW, vec2(-1.0, 1.0) - pp, dir, len2, lob, clp, i);
  Tap(aC, aW, vec2(0.0, 1.0) - pp, dir, len2, lob, clp, j);
  Tap(aC, aW, vec2(0.0, 0.0) - pp, dir, len2, lob, clp, f);
  Tap(aC, aW, vec2(-1.0, 0.0) - pp, dir, len2, lob, clp, e);
  Tap(aC, aW, vec2(1.0, 1.0) - pp, dir, len2, lob, clp, k);
  Tap(aC, aW, vec2(2.0, 1.0) - pp, dir, len2, lob, clp, l);
  Tap(aC, aW, vec2(2.0, 0.0) - pp, dir, len2, lob, clp, h);
  Tap(aC, aW, vec2(1.0, 0.0) - pp, dir, len2, lob, clp, g);
  Tap(aC, aW, vec2(1.0, 2.0) - pp, dir, len2, lob, clp, o);
  Tap(aC, aW, vec2(0.0, 2.0) - pp, dir, len2, lob, clp, n);
  vec3 mn = min(min(f, g), min(j, k)), mx = max(max(f, g), max(j, k));
  gl_FragColor = vec4(min(mx, max(mn, aC / aW)), 1.0);
}`;
const FSR_RCAS_FS = FSR_COMMON + `
uniform vec2 size; uniform float sharp;
vec3 F(vec2 p) { return texture2D(tSrc, (p + 0.5) / size).rgb; }
void main() {
  vec2 ip = floor(gl_FragCoord.xy);
  vec3 b = F(ip + vec2(0.0, -1.0)), d = F(ip + vec2(-1.0, 0.0)), e = F(ip), f = F(ip + vec2(1.0, 0.0)), h = F(ip + vec2(0.0, 1.0));
  float bL = Lum(b), dL = Lum(d), eL = Lum(e), fL = Lum(f), hL = Lum(h);
  vec3 mn4 = min(min(b, d), min(f, h)), mx4 = max(max(b, d), max(f, h));
  vec3 hitMin = min(mn4, e) / max(4.0 * mx4, vec3(1e-5));
  vec3 hitMax = (1.0 - max(mx4, e)) / min(4.0 * mn4 - 4.0, vec3(-1e-5));
  vec3 lobeC = max(-hitMin, hitMax);
  float lobe = max(-0.1875, min(max(lobeC.r, max(lobeC.g, lobeC.b)), 0.0)) * sharp;
  float nz = 0.25 * (bL + dL + fL + hL) - eL;
  nz = clamp(abs(nz) / (max(max(max(bL, dL), max(fL, hL)), eL) - min(min(min(bL, dL), min(fL, hL)), eL) + 1e-5), 0.0, 1.0);
  lobe *= -0.5 * nz + 1.0;
  gl_FragColor = vec4((lobe * (b + d + f + h) + e) / (4.0 * lobe + 1.0), 1.0);
}`;
function drsInit(){
  if (FSR.easu) return;
  try {
    const mk = (fs, u) => new THREE.ShaderMaterial({ vertexShader: FSR_VS, fragmentShader: fs, uniforms: u, depthTest: false, depthWrite: false });
    FSR.easu = mk(FSR_EASU_FS, { tSrc: { value: null }, inSize: { value: new THREE.Vector2(1, 1) }, outSize: { value: new THREE.Vector2(1, 1) } });
    FSR.rcas = mk(FSR_RCAS_FS, { tSrc: { value: null }, size: { value: new THREE.Vector2(1, 1) }, sharp: { value: Math.pow(2, -FSR.stops) } });
    FSR.scn = new THREE.Scene(); FSR.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    FSR.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), FSR.easu); FSR.quad.frustumCulled = false; FSR.scn.add(FSR.quad);
    FSR.ok = true;
  } catch (e) { FSR.ok = false; }
  V3.renderer.info.autoReset = false;
}
function fsrTargets(sw, sh, ow, oh){
  const r = V3.renderer;
  const nearest = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat, stencilBuffer: false };
  const msaa = V3.aa && r.capabilities.isWebGL2 && THREE.WebGLMultisampleRenderTarget;
  if (!FSR.rt || FSR.rtAa !== !!msaa){
    if (FSR.rt) FSR.rt.dispose();
    FSR.rt = msaa ? new THREE.WebGLMultisampleRenderTarget(sw, sh, nearest) : new THREE.WebGLRenderTarget(sw, sh, nearest);
    if (msaa) FSR.rt.samples = 4;
    FSR.rt.texture.encoding = r.outputEncoding;
    FSR.rtAa = !!msaa;
  } else if (FSR.rt.width !== sw || FSR.rt.height !== sh) FSR.rt.setSize(sw, sh);
  if (!FSR.rt2) FSR.rt2 = new THREE.WebGLRenderTarget(ow, oh, Object.assign({ depthBuffer: false }, nearest));
  else if (FSR.rt2.width !== ow || FSR.rt2.height !== oh) FSR.rt2.setSize(ow, oh);
}
function fsrPasses(sw, sh, ow, oh, out){
  const r = V3.renderer;
  fsrTargets(sw, sh, ow, oh);
  r.setRenderTarget(FSR.rt); r.render(V3.scene, V3.camera);
  FSR.quad.material = FSR.easu; FSR.easu.uniforms.tSrc.value = FSR.rt.texture;
  FSR.easu.uniforms.inSize.value.set(sw, sh); FSR.easu.uniforms.outSize.value.set(ow, oh);
  r.setRenderTarget(FSR.rt2); r.render(FSR.scn, FSR.cam);
  FSR.quad.material = FSR.rcas; FSR.rcas.uniforms.tSrc.value = FSR.rt2.texture; FSR.rcas.uniforms.size.value.set(ow, oh);
  r.setRenderTarget(out || null); r.render(FSR.scn, FSR.cam);
}
function fsrWarm(){
  if (!FSR.ok) return;
  const r = V3.renderer;
  const tmp = new THREE.WebGLRenderTarget(32, 18); tmp.texture.encoding = r.outputEncoding;
  try { fsrPasses(16, 9, 32, 18, tmp); } finally { r.setRenderTarget(null); tmp.dispose(); }
}

function drsRender(){
  if (!DRS.fsr){ V3.renderer.render(V3.scene, V3.camera); return; }
  fsrPasses(V3.sw, V3.sh, V3.rw, V3.rh, null);
}
