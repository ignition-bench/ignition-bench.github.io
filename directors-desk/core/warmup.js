"use strict";

const WARM = { done: false, ms: 0, links: 0, progs: 0, sceneMs: 0, sceneLinks: 0, fsr: false };
const DIAG = { links: 0, seen: 0, log: [], start: performance.now(), hooked: false };

function warmHook(){
  if (DIAG.hooked || !V3.renderer) return;
  const gl = V3.renderer.getContext(), lp = gl.linkProgram;
  gl.linkProgram = function (p) { DIAG.links++; return lp.call(this, p); };
  DIAG.hooked = true;
}

function warmRender(list, all){
  const r = V3.renderer, culled = [];
  const off = o => { if (o.frustumCulled) { o.frustumCulled = false; culled.push(o); } };
  if (all) V3.scene.traverse(o => { if (o.isMesh || o.isLine || o.isPoints) off(o); });
  for (const o of list || []) o.traverse(off);
  r.setRenderTarget(null);
  r.render(V3.scene, V3.camera);
  for (const o of culled) o.frustumCulled = true;
}

function warmScene(list){
  if (!V3.renderer || !V3.scene || !V3.camera) return;
  warmHook();
  if (typeof perfLoading === "function") perfLoading(t("ev_buildScene"));
  const t0 = performance.now(), l0 = DIAG.links;
  warmRender(list, true);
  if (!WARM.fsr && typeof fsrWarm === "function"){ fsrWarm(); WARM.fsr = true; }
  const ms = performance.now() - t0, links = DIAG.links - l0;
  if (!WARM.done){ WARM.ms = ms; WARM.links = links; WARM.done = true; }
  WARM.sceneMs = ms; WARM.sceneLinks = links;
  WARM.progs = V3.renderer.info.programs ? V3.renderer.info.programs.length : 0;
  DIAG.seen = DIAG.links;
  if (typeof renderPerfPanel === "function") renderPerfPanel();
}

function diagClock(){ const s = Math.floor((performance.now() - DIAG.start) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
function diagWhere(){ return typeof PERF_WHERE === "function" ? PERF_WHERE() : "3D"; }
function diagNew(){ return DIAG.log.reduce((a, e) => a + e.n, 0); }
function diagTick(){
  if (!WARM.done || DIAG.links === DIAG.seen) return;
  const n = DIAG.links - DIAG.seen; DIAG.seen = DIAG.links;
  const progs = V3.renderer.info.programs || [], names = progs.slice(-n).map(p => p.name || "?").join(", ");
  DIAG.log.push({ t: diagClock(), where: diagWhere(), n, what: names });
  if (DIAG.log.length > 50) DIAG.log.shift();
  if (typeof renderPerfPanel === "function") renderPerfPanel();
}
