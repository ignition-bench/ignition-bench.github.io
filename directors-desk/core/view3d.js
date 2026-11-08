"use strict";

const V3 = {
  renderer: null, scene: null, camera: null, host: null,
  ok: null, gpu: "", soft: false, aa: true,
  maxW: 1920, maxH: 1080,
  w: 1, h: 1, pr: 1, rw: 1, rh: 1, sw: 1, sh: 1,
};

function v3Check(){
  if (V3.ok !== null) return V3.ok;
  const c = document.createElement("canvas"), gl = c.getContext("webgl2") || c.getContext("webgl");
  if (!gl){ V3.ok = false; return false; }
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  V3.gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  V3.soft = /swiftshader|basic render|llvmpipe|softpipe|software/i.test(V3.gpu);
  const lose = gl.getExtension("WEBGL_lose_context"); if (lose) lose.loseContext();
  V3.aa = !V3.soft;
  if (V3.soft){ V3.maxW = 1280; V3.maxH = 720; }
  V3.ok = true;
  return true;
}
function v3ShowNoWebgl(){
  let el = document.getElementById("no-webgl");
  if (!el){
    el = document.createElement("div"); el.id = "no-webgl";
    el.innerHTML = '<div><b></b><span></span><br><button type="button"></button></div>';
    document.body.appendChild(el);
    el.querySelector("button").addEventListener("click", ()=>{ el.hidden = true; });
  }
  el.querySelector("b").textContent = t("noWebglTitle");
  el.querySelector("span").textContent = t("noWebglSub");
  el.querySelector("button").textContent = t("ok");
  el.hidden = false;
}

function v3Create(host){
  V3.host = host;
  const r = new THREE.WebGLRenderer({ antialias: V3.aa, alpha: true });
  r.setPixelRatio(1);
  host.insertBefore(r.domElement, host.firstChild);
  V3.renderer = r;
  window.addEventListener("resize", v3Resize);
  return r;
}

function v3Ensure(host){
  if (!V3.renderer){
    const r = v3Create(host);
    r.outputEncoding = THREE.sRGBEncoding;
    r.shadowMap.enabled = true;
    r.shadowMap.type = V3.aa ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    if (typeof drsInit === "function") drsInit();
    if (typeof warmHook === "function") warmHook();
  } else if (V3.renderer.domElement.parentNode !== host){
    host.insertBefore(V3.renderer.domElement, host.firstChild);
  }
  V3.host = host;
  v3Resize();
  return V3.renderer;
}

function v3Resize(){
  const r = V3.renderer; if (!r) return;
  const H = V3.host, hw = H ? H.clientWidth : 0, hh = H ? H.clientHeight : 0;
  if (H && (!hw || !hh)) return;
  const w = Math.max(1, hw || window.innerWidth), h = Math.max(1, hh || window.innerHeight);
  const pr = Math.max(0.25, Math.min(window.devicePixelRatio || 1, 2, V3.maxW / w, V3.maxH / h));
  V3.w = w; V3.h = h; V3.pr = pr; V3.rw = Math.round(w * pr); V3.rh = Math.round(h * pr);
  r.setPixelRatio(typeof drsCanvasRatio === "function" ? drsCanvasRatio(pr) : pr);
  if (typeof drsCanvasRatio !== "function"){ V3.sw = V3.rw; V3.sh = V3.rh; }
  r.setSize(w, h);
  if (V3.camera && V3.camera.isPerspectiveCamera){ V3.camera.aspect = w / h; V3.camera.updateProjectionMatrix(); }
}

function v3Render(){
  if (typeof drsRender === "function") drsRender();
  else V3.renderer.render(V3.scene, V3.camera);
}

function v3Snapshot(){
  const r = V3.renderer;
  const cur = r.getPixelRatio(), full = V3.pr;
  if (cur !== full) r.setPixelRatio(full);
  r.setRenderTarget(null);
  r.render(V3.scene, V3.camera);
  const url = r.domElement.toDataURL("image/png");
  if (cur !== full) r.setPixelRatio(cur);
  return url;
}

function v3DisposeTree(obj){
  obj.traverse(o=>{
    if (o.geometry) o.geometry.dispose();
    if (o.material){ (Array.isArray(o.material) ? o.material : [o.material]).forEach(m=> m.dispose()); }
    if (o.isLight && o.shadow && o.shadow.map){ o.shadow.map.dispose(); o.shadow.map = null; }
  });
}
function v3ClearScene(scene){
  while (scene.children.length){ const c = scene.children[0]; scene.remove(c); v3DisposeTree(c); }
}
