"use strict";

const TIME_LOOK = {
  "":    { bg: 0x1d1f24, sky: 0xffffff, ground: 0x6b6660, hemi: 0.62, sun: 0xfff6ea, sunI: 0.95 },
  day:   { bg: 0x86aed4, sky: 0xeaf4ff, ground: 0x6b6660, hemi: 0.70, sun: 0xfff3dc, sunI: 1.00 },
  dusk:  { bg: 0xb8735a, sky: 0xffc9a0, ground: 0x4a3a40, hemi: 0.42, sun: 0xffa060, sunI: 0.70 },
  night: { bg: 0x0a0f1e, sky: 0x8fa6ff, ground: 0x1a1c28, hemi: 0.20, sun: 0xa9bcff, sunI: 0.22 },
};
function envLightSetup(hemi, sun){
  const L = TIME_LOOK[timeOfDay] || TIME_LOOK[""];
  scene.background = new THREE.Color(L.bg);
  hemi.color.setHex(L.sky); hemi.groundColor.setHex(L.ground); hemi.intensity = L.hemi;
  sun.color.setHex(L.sun); sun.intensity = L.sunI;
}
const GLOW_MAT = {};
function envGlow(g, o){
  if (!o.on || !LIGHT_TYPES.includes(o.type)) return;
  const part = o.type === "tv" ? "screen" : "soft";
  if (!GLOW_MAT[o.type]) GLOW_MAT[o.type] = new THREE.MeshBasicMaterial({ color: o.type === "tv" ? 0xbfe3ff : 0xffe39a });
  g.traverse(m => { if (m.isMesh && m.userData.kind === part) m.material = GLOW_MAT[o.type]; });
}
function envToggleLight(id){
  const el = getEl(id); if (!el || !LIGHT_TYPES.includes(el.type)) return;
  pushHistory();
  if (el.on) delete el.on; else el.on = true;
  render(); updatePropPanel();
  showToast(t(el.on ? "lightOnToast" : "lightOffToast").replace("{n}", curLabels()[el.type] || el.type));
}

const timeSeg = document.getElementById("time-seg");
function envTimeRender(){ timeSeg.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.time === timeOfDay)); }
timeSeg.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
  if (timeOfDay === b.dataset.time) return;
  timeOfDay = b.dataset.time; envTimeRender();
  if (typeof set3dOnPlanChange === "function") set3dOnPlanChange();
  showToast(t("envTimeToast").replace("{t}", b.textContent));
}));
envTimeRender();

document.getElementById("light-btn").addEventListener("click", () => { if (selectedIds.length === 1) envToggleLight(selectedIds[0]); });
{ const u0 = updatePropPanel; updatePropPanel = function(){
    u0();
    const one = selectedIds.length === 1 ? getEl(selectedIds[0]) : null, lg = document.getElementById("light-group");
    const show = !!(one && LIGHT_TYPES.includes(one.type));
    lg.style.display = show ? "block" : "none";
    if (show) document.getElementById("light-btn").textContent = t(one.on ? "lightBtnOff" : "lightBtnOn");
  }; }

const objTabs = document.getElementById("obj-tabs");
let objCat = "indoor";
try { objCat = localStorage.getItem("dd-obj-cat") || "indoor"; } catch(e){}
function objCatApply(){
  objTabs.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.cat === objCat));
  document.querySelectorAll("#object-panel [data-cat]").forEach(n => { n.hidden = n.dataset.cat !== objCat; });
}
objTabs.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
  objCat = b.dataset.cat; try { localStorage.setItem("dd-obj-cat", objCat); } catch(e){}
  objCatApply();
}));
objCatApply();
