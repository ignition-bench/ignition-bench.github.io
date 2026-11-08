"use strict";

const SETV_KEY = "dd-set-view", SETV_SPLIT_KEY = "dd-set-split";
const SETV = (() => {
  let v = null, sp = 0.5;
  try { v = localStorage.getItem(SETV_KEY); sp = parseFloat(localStorage.getItem(SETV_SPLIT_KEY)) || 0.5; } catch(e){}
  return { view: ["2d", "split", "3d"].includes(v) ? v : "split", split: Math.max(0.2, Math.min(0.8, sp)), focus: "2d" };
})();
const setPanes = document.getElementById("set-panes"), setDivider = document.getElementById("set-divider");

function setKeysTo3d(){
  if (typeof locked !== "undefined" && locked) return true;
  return SETV.view === "3d" || (SETV.view === "split" && SETV.focus === "3d");
}

function setView(v){
  if (!["2d", "split", "3d"].includes(v)) return;
  SETV.view = v; try { localStorage.setItem(SETV_KEY, v); } catch(e){}
  if (v === "3d") SETV.focus = "3d"; else if (v === "2d") SETV.focus = "2d";
  setViewApply();
}
function setViewApply(){
  const v = SETV.view;
  setPanes.classList.toggle("v-2d", v === "2d"); setPanes.classList.toggle("v-split", v === "split"); setPanes.classList.toggle("v-3d", v === "3d");
  setPanes.style.setProperty("--split", (SETV.split * 100).toFixed(1) + "%");
  document.querySelectorAll("#view-seg button").forEach(b => b.classList.toggle("on", b.dataset.view === v));
  if (APP.screen !== "set") return;
  if (v === "2d") set3dPause(); else set3dActivate();
  requestAnimationFrame(() => { if (V3.renderer && inLiveMode) { v3Resize(); SET3D.dirty = true; } });
}
document.querySelectorAll("#view-seg button").forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));

function set3dActivate(){
  if (!v3Check()){ v3ShowNoWebgl(); SETV.view = "2d"; setViewApply(); return; }
  const first = !threeInited;
  inLiveMode = true;
  initThree();
  v3Ensure(liveView); V3.scene = scene; V3.camera = camera; v3Resize();
  if (orbit) orbit.enabled = camMode !== "walk";
  if (first || !SET3D.builtSig){ perfEv(t("ev_enter3d")); buildLiveScene(false); }
  else if (SET3D.builtSig !== set3dSig()) buildLiveScene(true);
  perfResume(); drsResume();
  updateLiveUi(); updateCeilingButton();
  SET3D.dirty = true;
  if (typeof flowFlag === "function") flowFlag("live3d");
  setMeUpdate(true);
}
function set3dPause(){
  inLiveMode = false;
  if (document.pointerLockElement) document.exitPointerLock();
  noteLabel.style.display = "none";
  setMeClear();
  if (typeof renderPerfPanel === "function") renderPerfPanel();
}

let set3dTimer = 0;
function set3dOnPlanChange(){
  if (!inLiveMode || !threeInited) return;
  clearTimeout(set3dTimer);
  set3dTimer = setTimeout(() => {
    if (!inLiveMode) return;
    if (SET3D.builtSig !== set3dSig()){ perfLoading(t("ev_rebuild3d")); buildLiveScene(true); }
  }, 140);
}
function set3dSelSync(){
  if (!threeInited || !scene) return;
  SET3D.selBoxes.forEach(b => { scene.remove(b); b.geometry.dispose(); b.material.dispose(); });
  SET3D.selBoxes = [];
  (typeof selectedIds !== "undefined" ? selectedIds : []).forEach(id => {
    const g = SET3D.byId[id]; if (!g) return;
    const box = new THREE.BoxHelper(g, 0x3b82f6); box.material.depthTest = false; box.renderOrder = 10;
    scene.add(box); SET3D.selBoxes.push(box);
  });
  SET3D.dirty = true;
}
{
  const r0 = render, s0 = renderSelection;
  render = function(){ r0(); set3dOnPlanChange(); };
  renderSelection = function(){ s0(); if (inLiveMode) set3dSelSync(); };
}

{
  let down = null;
  document.addEventListener("pointerdown", e => {
    if (APP.screen !== "set" || !inLiveMode || e.button !== 0 || !V3.renderer || e.target !== V3.renderer.domElement) { down = null; return; }
    down = { x: e.clientX, y: e.clientY };
  }, true);
  document.addEventListener("pointerup", e => {
    if (!down || APP.screen !== "set" || !inLiveMode || e.target !== V3.renderer.domElement) { down = null; return; }
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null;
    if (moved > 5) return;
    const r = V3.renderer.domElement.getBoundingClientRect();
    raycaster.setFromCamera({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }, camera);
    const hits = raycaster.intersectObjects(SET3D.pickables, false).filter(h => !h.object.userData.castId || (CAST3D.figs[h.object.userData.castId] || {}).group && CAST3D.figs[h.object.userData.castId].group.visible);
    const hit = hits[0];
    if (hit && hit.object.userData.castId){ castSelect(hit.object.userData.castId); return; }
    const id = hit ? hit.object.userData.elId : null;
    if (id){
      if (e.shiftKey) selectedIds = selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : selectedIds.concat(id);
      else selectedIds = [id];
    } else if (!e.shiftKey) selectedIds = [];
    renderSelection(); updatePropPanel();
  }, true);
}

const meLayer = document.getElementById("me-layer");
let setMeT = 0;
function setMeClear(){ if (meLayer) meLayer.innerHTML = ""; }
function setMeUpdate(force){
  if (!meLayer) return;
  if (!inLiveMode || camMode !== "walk" || !camera){ setMeClear(); return; }
  const now = performance.now(); if (!force && now - setMeT < 90) return; setMeT = now;
  const x = camera.position.x / SCALE3D + minX, y = camera.position.z / SCALE3D + minY;
  const fx = -Math.sin(yaw), fy = -Math.cos(yaw), half = 38 * Math.PI / 180, L = 70;
  const ang = Math.atan2(fy, fx), a1 = ang - half, a2 = ang + half;
  const p1 = [x + Math.cos(a1) * L, y + Math.sin(a1) * L], p2 = [x + Math.cos(a2) * L, y + Math.sin(a2) * L];
  meLayer.innerHTML = "";
  meLayer.appendChild(makeSvgEl("path", { d: `M${x} ${y} L${p1[0]} ${p1[1]} A${L} ${L} 0 0 1 ${p2[0]} ${p2[1]} Z`, fill: "#3b82f6", "fill-opacity": 0.16, stroke: "#3b82f6", "stroke-opacity": 0.5, "stroke-width": 1 }));
  meLayer.appendChild(makeSvgEl("circle", { cx: x, cy: y, r: 6, fill: "#3b82f6", stroke: "#fff", "stroke-width": 2 }));
}

{
  let drag = null;
  setDivider.addEventListener("pointerdown", e => {
    drag = { r: setPanes.getBoundingClientRect() }; setDivider.setPointerCapture(e.pointerId); setDivider.classList.add("drag"); e.preventDefault();
  });
  setDivider.addEventListener("pointermove", e => {
    if (!drag) return;
    SETV.split = Math.max(0.2, Math.min(0.8, (e.clientX - drag.r.left) / drag.r.width));
    setPanes.style.setProperty("--split", (SETV.split * 100).toFixed(1) + "%");
    if (V3.renderer && inLiveMode){ v3Resize(); SET3D.dirty = true; }
  });
  const end = () => { if (!drag) return; drag = null; setDivider.classList.remove("drag"); try { localStorage.setItem(SETV_SPLIT_KEY, String(SETV.split)); } catch(e){} };
  setDivider.addEventListener("pointerup", end); setDivider.addEventListener("pointercancel", end);
  setDivider.addEventListener("dblclick", () => { SETV.split = 0.5; setViewApply(); end(); });
}

document.getElementById("build-screen").addEventListener("pointerenter", () => { if (!(typeof locked !== "undefined" && locked)) SETV.focus = "2d"; });
liveScreen.addEventListener("pointerenter", () => { SETV.focus = "3d"; });

if (window.ResizeObserver){
  let lw = 0, lh = 0;
  new ResizeObserver(() => {
    const r = svg.getBoundingClientRect();
    if (r.width && lw){ panX += (r.width - lw) / 2; panY += (r.height - lh) / 2; applyTransform(); }
    if (r.width){ lw = r.width; lh = r.height; }
  }).observe(svg);
  new ResizeObserver(() => { if (V3.renderer && inLiveMode && V3.host === liveView){ v3Resize(); SET3D.dirty = true; } }).observe(liveView);
}

function setObjSizes(){
  const m = v => (Math.round(v / 40 * 10) / 10).toFixed(1).replace(/\.0$/, "");
  document.querySelectorAll("#object-panel .obj-btn").forEach(b => {
    const ty = b.dataset.tool, el = b.querySelector(".obj-size"); if (!el) return;
    if (ty === "door") el.textContent = m(DOOR_WIDTH_2D) + "m";
    else if (ty === "door2") el.textContent = DOOR2_W_M + "m";
    else if (ty === "window") el.textContent = "0.9m";
    else if (SIZES[ty]) el.textContent = m(SIZES[ty][0]) + "×" + m(SIZES[ty][1]) + "m";
  });
}
setObjSizes();
setViewApply();
