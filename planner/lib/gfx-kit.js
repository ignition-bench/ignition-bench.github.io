/*! gfx-kit.js v1.0 — MIT License — Copyright (c) 2026 The Ignition Bench · FSR 1 shaders: Copyright (c) 2021 Advanced Micro Devices, Inc. (MIT) · see /THIRD-PARTY-NOTICES.txt */
(function(){
"use strict";

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

const med = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

function detectGpu(){
  const c = document.createElement("canvas"), gl = c.getContext("webgl2") || c.getContext("webgl");
  if (!gl) return { ok: false, gpu: "", soft: false };
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  const gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  const lose = gl.getExtension("WEBGL_lose_context"); if (lose) lose.loseContext();
  return { ok: true, gpu, soft: /swiftshader|basic render|llvmpipe|softpipe|software/i.test(gpu) };
}

function init(opt){
  opt = Object.assign({
    host: document.body, scene: null, camera: null, controls: null, renderer: null,
    maxW: 1920, maxH: 1080, maxPixelRatio: 2,
    dynamic: true, fsr: true, minScale: 0.6, targetFps: 60, sharpness: 0.25,
    onDemand: true, shadows: true, srgb: true, hud: false, autoStart: true,
  }, opt || {});
  const G = detectGpu();
  if (!G.ok) throw new Error("GfxKit: WebGL을 쓸 수 없는 브라우저예요");
  const K = {
    gpu: G.gpu, soft: G.soft, aa: !G.soft, opt,
    scene: opt.scene, camera: opt.camera, controls: null, host: opt.host,
    w: 1, h: 1, pr: 1, rw: 1, rh: 1, sw: 1, sh: 1,
    dirty: true, rendering: false, running: false, frames: 0, renders: 0,
    budget: 1000 / opt.targetFps, cbs: [],
    drs: { scale: 1, gaps: [], works: [], checks: [], lastChange: 0, lastRaise: -1e9, upBlock: 0, blockDur: 15000, lastCheck: 0, last: 0, changes: 0, fsr: false },
    fsr: { ok: false, rt: null, rt2: null, scn: null, cam: null, quad: null, easu: null, rcas: null, warmed: false },
    shaderLinks: 0,
  };
  if (G.soft){ opt.maxW = Math.min(opt.maxW, 1280); opt.maxH = Math.min(opt.maxH, 720); }

  const r = opt.renderer || new THREE.WebGLRenderer({ antialias: K.aa });
  K.renderer = r;
  if (!opt.renderer){ r.setPixelRatio(1); K.host.insertBefore(r.domElement, K.host.firstChild); r.domElement.style.display = "block"; }
  if (opt.srgb) r.outputEncoding = THREE.sRGBEncoding;
  if (opt.shadows){ r.shadowMap.enabled = true; r.shadowMap.type = K.aa ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap; }
  r.info.autoReset = false;
  { const gl = r.getContext(), lp = gl.linkProgram; gl.linkProgram = function(p){ K.shaderLinks++; return lp.call(this, p); }; }

  if (opt.fsr) try {
    const mk = (fs, u) => new THREE.ShaderMaterial({ vertexShader: FSR_VS, fragmentShader: fs, uniforms: u, depthTest: false, depthWrite: false });
    const F = K.fsr;
    F.easu = mk(FSR_EASU_FS, { tSrc: { value: null }, inSize: { value: new THREE.Vector2(1, 1) }, outSize: { value: new THREE.Vector2(1, 1) } });
    F.rcas = mk(FSR_RCAS_FS, { tSrc: { value: null }, size: { value: new THREE.Vector2(1, 1) }, sharp: { value: Math.pow(2, -opt.sharpness) } });
    F.scn = new THREE.Scene(); F.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    F.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), F.easu); F.quad.frustumCulled = false; F.scn.add(F.quad);
    F.ok = true;
  } catch (e) { K.fsr.ok = false; }
  function fsrTargets(sw, sh, ow, oh){
    const F = K.fsr, nearest = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat, stencilBuffer: false };
    const msaa = K.aa && r.capabilities.isWebGL2 && THREE.WebGLMultisampleRenderTarget;
    if (!F.rt || F.rtAa !== !!msaa){
      if (F.rt) F.rt.dispose();
      F.rt = msaa ? new THREE.WebGLMultisampleRenderTarget(sw, sh, nearest) : new THREE.WebGLRenderTarget(sw, sh, nearest);
      if (msaa) F.rt.samples = 4;
      F.rt.texture.encoding = r.outputEncoding; F.rtAa = !!msaa;
    } else if (F.rt.width !== sw || F.rt.height !== sh) F.rt.setSize(sw, sh);
    if (!F.rt2) F.rt2 = new THREE.WebGLRenderTarget(ow, oh, Object.assign({ depthBuffer: false }, nearest));
    else if (F.rt2.width !== ow || F.rt2.height !== oh) F.rt2.setSize(ow, oh);
  }
  function fsrPasses(sw, sh, ow, oh, out){
    const F = K.fsr;
    fsrTargets(sw, sh, ow, oh);
    r.setRenderTarget(F.rt); r.render(K.scene, K.camera);
    F.quad.material = F.easu; F.easu.uniforms.tSrc.value = F.rt.texture; F.easu.uniforms.inSize.value.set(sw, sh); F.easu.uniforms.outSize.value.set(ow, oh);
    r.setRenderTarget(F.rt2); r.render(F.scn, F.cam);
    F.quad.material = F.rcas; F.rcas.uniforms.tSrc.value = F.rt2.texture; F.rcas.uniforms.size.value.set(ow, oh);
    r.setRenderTarget(out || null); r.render(F.scn, F.cam);
  }

  function canvasRatio(pr){
    K.sw = Math.max(1, Math.round(K.rw * K.drs.scale)); K.sh = Math.max(1, Math.round(K.rh * K.drs.scale));
    K.drs.fsr = K.fsr.ok && K.drs.scale < 0.999;
    return K.drs.fsr ? pr : pr * K.drs.scale;
  }
  function resize(){
    const H = K.host, hw = H === document.body ? window.innerWidth : H.clientWidth, hh = H === document.body ? window.innerHeight : H.clientHeight;
    if (!hw || !hh) return;
    const pr = Math.max(0.25, Math.min(window.devicePixelRatio || 1, opt.maxPixelRatio, opt.maxW / hw, opt.maxH / hh));
    K.w = hw; K.h = hh; K.pr = pr; K.rw = Math.round(hw * pr); K.rh = Math.round(hh * pr);
    r.setPixelRatio(canvasRatio(pr)); r.setSize(hw, hh);
    if (K.camera && K.camera.isPerspectiveCamera){ K.camera.aspect = hw / hh; K.camera.updateProjectionMatrix(); }
    K.dirty = true;
  }
  function setScale(s){
    s = Math.round(Math.max(opt.minScale, Math.min(1, s)) * 20) / 20;
    if (s === K.drs.scale) return;
    K.drs.scale = s; K.drs.changes++; K.drs.lastChange = performance.now(); resize();
  }
  window.addEventListener("resize", resize);
  if (window.ResizeObserver && K.host !== document.body) new ResizeObserver(resize).observe(K.host);

  function drsReset(){ const D = K.drs; D.last = 0; D.gaps.length = 0; D.works.length = 0; D.checks.length = 0; }
  function drsTick(work){
    const D = K.drs; if (!opt.dynamic) return;
    const t = performance.now(), gap = D.last ? t - D.last : 0; D.last = t;
    if (!gap || gap > 1000 || document.hidden){ D.gaps.length = 0; D.works.length = 0; D.checks.length = 0; return; }
    D.gaps.push(gap); D.works.push(work);
    let sum = D.gaps.reduce((a, b) => a + b, 0);
    while (D.gaps.length > 1 && sum > 1000){ sum -= D.gaps.shift(); D.works.shift(); }
    if (t - D.lastCheck < 500 || sum < 900) return;
    D.lastCheck = t;
    const m = med(D.gaps), wk = med(D.works);
    D.checks.push({ slow: m > K.budget * 1.15, easy: m <= K.budget * 1.05 && wk < K.budget * 0.6 });
    if (D.checks.length > 6) D.checks.shift();
    if (t - D.lastChange < 2000) return;
    const last = D.checks[D.checks.length - 1];
    if (last.slow && D.scale > opt.minScale){
      if (t - D.lastRaise < 3000){ D.upBlock = t + D.blockDur; D.blockDur = Math.min(60000, D.blockDur * 2); }
      setScale(D.scale - 0.1); D.checks.length = 0;
    } else if (D.scale < 1 && t >= D.upBlock && D.checks.length >= 6 && D.checks.every(c => c.easy)){
      D.lastRaise = t; setScale(D.scale + 0.05); D.checks.length = 0;
    }
  }

  function draw(){
    if (!K.scene || !K.camera) return;
    r.info.reset();
    if (!K.drs.fsr){ r.setRenderTarget(null); r.render(K.scene, K.camera); }
    else fsrPasses(K.sw, K.sh, K.rw, K.rh, null);
    K.renders++;
  }

  function setControls(c){
    K.controls = c || null;
    if (c && c.addEventListener) c.addEventListener("change", () => { K.dirty = true; });
  }
  setControls(opt.controls);

  let lastT = 0, prevDrew = false;
  function loop(t){
    if (!K.running) return;
    requestAnimationFrame(loop);
    const dt = lastT ? Math.min((t - lastT) / 1000, 0.05) : 0.016; lastT = t;
    if (document.hidden){ prevDrew = false; return; }
    let need = K.dirty || !opt.onDemand;
    if (K.controls && K.controls.update && K.controls.update()) need = true;
    for (const cb of K.cbs){ if (cb(dt, t) === true) need = true; }
    if (!need){ prevDrew = false; K.rendering = false; return; }
    if (!prevDrew) drsReset();
    K.dirty = false; K.rendering = true;
    const t0 = performance.now(); draw(); const work = performance.now() - t0;
    drsTick(work); prevDrew = true; K.frames++;
    if (hud) hudTick(t);
  }

  function warm(list){
    if (!K.scene || !K.camera) return 0;
    const t0 = performance.now(), culled = [];
    const off = o => { if (o.frustumCulled){ o.frustumCulled = false; culled.push(o); } };
    K.scene.traverse(o => { if (o.isMesh || o.isLine || o.isPoints) off(o); });
    for (const o of list || []) o.traverse(off);
    r.setRenderTarget(null); r.render(K.scene, K.camera);
    for (const o of culled) o.frustumCulled = true;
    if (K.fsr.ok && !K.fsr.warmed){ const tmp = new THREE.WebGLRenderTarget(32, 18); tmp.texture.encoding = r.outputEncoding; try { fsrPasses(16, 9, 32, 18, tmp); } finally { r.setRenderTarget(null); tmp.dispose(); } K.fsr.warmed = true; }
    K.dirty = true;
    return performance.now() - t0;
  }
  function disposeTree(obj){
    obj.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { for (const k in m){ const v = m[k]; if (v && v.isTexture) v.dispose(); } m.dispose(); });
      if (o.isLight && o.shadow && o.shadow.map){ o.shadow.map.dispose(); o.shadow.map = null; }
    });
  }
  function clearScene(scene){ scene = scene || K.scene; if (!scene) return; for (const c of scene.children.slice()){ disposeTree(c); scene.remove(c); } K.dirty = true; }
  function snapshot(type){
    const cur = r.getPixelRatio(), full = K.pr;
    if (cur !== full) r.setPixelRatio(full);
    r.setRenderTarget(null); r.render(K.scene, K.camera);
    const url = r.domElement.toDataURL(type || "image/png");
    if (cur !== full) r.setPixelRatio(cur);
    K.dirty = true;
    return url;
  }

  let hud = null, hudLast = 0, hudFrames = 0;
  function hudTick(t){
    hudFrames++;
    if (t - hudLast < 500) return;
    const fps = Math.round(hudFrames * 1000 / (t - hudLast)); hudLast = t; hudFrames = 0;
    hud.textContent = `${fps >= 2 ? fps + " fps" : "쉬는 중"} · ${Math.round(K.drs.scale * 100)}%${K.drs.fsr ? " FSR" : ""} · ${K.rw}×${K.rh} · 그리기 ${r.info.render.calls} · 삼각형 ${r.info.render.triangles}`;
  }
  function showHud(on){
    if (on && !hud){ hud = document.createElement("div"); hud.style.cssText = "position:absolute;left:8px;bottom:8px;z-index:9;font:11px/1.4 monospace;color:#cfe3ff;background:rgba(10,14,22,.75);padding:3px 7px;border-radius:5px;pointer-events:none"; if (getComputedStyle(K.host).position === "static" && K.host !== document.body) K.host.style.position = "relative"; K.host.appendChild(hud); }
    if (!on && hud){ hud.remove(); hud = null; }
  }

  Object.assign(K, {
    requestRender(){ K.dirty = true; },
    render(){ draw(); },
    onFrame(cb){ K.cbs.push(cb); return () => { K.cbs = K.cbs.filter(c => c !== cb); }; },
    setScene(s){ K.scene = s; K.dirty = true; },
    setCamera(c){ K.camera = c; resize(); },
    setControls, resize, warm, disposeTree, clearScene, snapshot, showHud,
    setScale(s){ setScale(s); K.dirty = true; },
    setDynamic(on){ opt.dynamic = !!on; if (!on) setScale(1); },
    start(){ if (K.running) return; K.running = true; lastT = 0; prevDrew = false; requestAnimationFrame(loop); },
    stop(){ K.running = false; },
    stats(){ return { scale: K.drs.scale, fsr: K.drs.fsr, size: [K.rw, K.rh], draw: [K.sw, K.sh], renders: K.renders, scaleChanges: K.drs.changes, shaderLinks: K.shaderLinks, gpu: K.gpu, soft: K.soft, calls: r.info.render.calls, triangles: r.info.render.triangles }; },
  });
  resize();
  if (opt.hud) showHud(true);
  if (opt.autoStart) K.start();
  return K;
}

window.GfxKit = { init, version: "1.0" };
})();
