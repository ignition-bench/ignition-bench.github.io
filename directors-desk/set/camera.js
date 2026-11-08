"use strict";

const CAM_MOUNTS = ["fixed", "look", "self", "behind"];
const CAM_SHOTS = ["front", "left", "right", "forward"];
const CAM_SELF_DEF = { dist: 0.6, fovDeg: 70 }, CAM_BEHIND_DEF = { dist: 3.0, h: 1.8, fovDeg: 60 };
const camMounted = c => !!c && (c.mount === "self" || c.mount === "behind") && !!c.actor;
const CAM_FOVS = [{ k: "wide", v: 65 }, { k: "norm", v: 50 }, { k: "tele", v: 35 }];
const CAM_RATIOS = [{ k: "16:9", w: 16, h: 9 }, { k: "9:16", w: 9, h: 16 }];
const CAMS = { list: [], sel: null, active: null, ratio: "16:9" };
let camIdN = 1;
const camGet = id => CAMS.list.find(c => c.id === id) || null;
const camActive = () => camGet(CAMS.active) || CAMS.list[0] || null;
const camRatio = () => CAM_RATIOS.find(r => r.k === CAMS.ratio) || CAM_RATIOS[0];
const camFovOf = c => (c && (c.mount === "self" || c.mount === "behind")) ? (+c.fovDeg || 60) : (CAM_FOVS.find(f => f.k === (c && c.fov)) || CAM_FOVS[1]).v;

const CAM_MAX = 9;
function camAdd(x, y){
  if (CAMS.list.length >= CAM_MAX){ showToast(t("camMax")); return null; }
  pushHistory();
  const c = { id: "c" + (camIdN++), name: t("camAuto") + " " + (CAMS.list.length + 1),
    x: Math.round(x), y: Math.round(y), rot: 0, h: 1.6, fov: "norm", mount: "fixed", actor: "", shot: "front", dist: CAM_SELF_DEF.dist, fovDeg: CAM_SELF_DEF.fovDeg };
  CAMS.list.push(c); CAMS.active = c.id;
  camSelect(c.id); camChanged();
  showToast(t("camPlaced").replace("{n}", c.name));
  return c;
}
function camRemove(id){
  const c = camGet(id); if (!c) return;
  pushHistory();
  CAMS.list = CAMS.list.filter(x => x !== c);
  if (CAMS.sel === id) CAMS.sel = null;
  if (CAMS.active === id) CAMS.active = CAMS.list.length ? CAMS.list[0].id : null;
  if (!CAMS.list.length && camMode === "cam") setCamMode("orbit");
  camChanged(); updatePropPanel();
  if (typeof undoToastSet === "function") undoToastSet(t("camRemoved").replace("{n}", c.name));
}
function camSelect(id){
  CAMS.sel = id;
  if (id){
    CAMS.active = id;
    if (selectedIds.length){ selectedIds = []; renderSelection(); }
    if (typeof CAST !== "undefined" && CAST.sel){ CAST.sel = null; CAST.selClip = null; CAST.selPt = null; castRender2D(); cast3dSync(); if (typeof tlRender === "function") tlRender(); }
    if (typeof SETM !== "undefined" && SETM.sel){ SETM.sel = null; memoRefresh(); }
  }
  updatePropPanel(); camChanged();
}
function camRotate(id, step){
  const c = camGet(id); if (!c) return;
  if (camMounted(c)){ showToast(t("camRotMounted")); return; }
  if (c.mount === "look" && c.actor){ showToast(t("camRotFollow")); return; }
  pushHistory(); c.rot = ((c.rot + (step || 45)) % 360 + 360) % 360; camChanged();
}
function camChanged(){
  camRender2D(); camPanelRender(); camApply(true);
  if (typeof updateLiveUi === "function" && typeof threeInited !== "undefined" && threeInited) updateLiveUi();
  if (typeof SET3D !== "undefined") SET3D.dirty = true;
}
function camSnap(){ return { l: CAMS.list, r: CAMS.ratio, a: CAMS.active }; }
function camAfterHist(o){
  if (!o) o = { l: [], r: "16:9", a: null };
  CAMS.list = Array.isArray(o.l) ? o.l : [];
  CAMS.ratio = o.r || "16:9"; CAMS.active = o.a && camGet(o.a) ? o.a : (CAMS.list[0] ? CAMS.list[0].id : null);
  if (CAMS.sel && !camGet(CAMS.sel)) CAMS.sel = null;
  camIdN = Math.max(camIdN, ...CAMS.list.map(c => (parseInt(String(c.id).slice(1)) || 0) + 1));
  if (!CAMS.list.length && typeof camMode !== "undefined" && camMode === "cam") setCamMode("orbit");
  camChanged();
}

function camTargetOf(c){
  if (c.mount !== "look" || !c.actor || typeof CAST === "undefined") return null;
  const a = CAST.actors.find(x => x.name === c.actor); if (!a) return null;
  const st = typeof castStateAt === "function" ? castStateAt(a, CAST.t) : { x: a.x, y: a.y };
  return { x: st.x, y: st.y, h: 1.1 };
}
function camRotNow(c){
  const rg = camRig(c); if (rg) return rg.rot;
  const tg = camTargetOf(c); if (!tg) return c.rot;
  const dx = tg.x - c.x, dy = tg.y - c.y;
  if (Math.hypot(dx, dy) < 1e-6) return c.rot;
  return ((Math.atan2(-dx, dy) * 180 / Math.PI) % 360 + 360) % 360;
}

const CAMFK = {};
function camShotOf(c){ return (c.mount === "self") ? ((CAMS.active === c.id && CAMS.shotNow) || c.shot || "front") : ""; }
function camRig(c){
  if (!camMounted(c) || typeof CAST === "undefined") return null;
  const a = CAST.actors.find(x => x.name === c.actor); if (!a) return null;
  const st = castStateAt(a, CAST.t), r = st.rot * Math.PI / 180;
  const F = new THREE.Vector3(-Math.sin(r), 0, Math.cos(r)), L = new THREE.Vector3(Math.cos(r), 0, Math.sin(r));
  const base = new THREE.Vector3(toX(st.x), 0, toZ(st.y));
  let head;
  if (st.pose){ const fk = skFK(st.pose, CAMFK), hp = fk.headC.pos; head = base.clone().add(L.clone().multiplyScalar(hp.x)).add(F.clone().multiplyScalar(hp.z)); head.y = hp.y; }
  else head = base.clone().setY(1.6);
  let pos, look;
  if (c.mount === "behind"){
    pos = base.clone().addScaledVector(F, -(+c.dist || CAM_BEHIND_DEF.dist)); pos.y = +c.h || CAM_BEHIND_DEF.h;
    look = base.clone().addScaledVector(F, 2); look.y = 1.3;
  } else {
    const shot = camShotOf(c), d = +c.dist || CAM_SELF_DEF.dist, k = Math.PI * 40 / 180;
    if (shot === "forward"){ pos = head.clone().addScaledVector(F, 0.2); pos.y -= 0.04; look = pos.clone().addScaledVector(F, 10); }
    else {
      const dir = shot === "left" ? F.clone().multiplyScalar(Math.cos(k)).addScaledVector(L, Math.sin(k))
        : shot === "right" ? F.clone().multiplyScalar(Math.cos(k)).addScaledVector(L, -Math.sin(k)) : F.clone();
      pos = head.clone().addScaledVector(dir, d); pos.y -= 0.03; look = head.clone();
    }
  }
  const dx = look.x - pos.x, dz = look.z - pos.z;
  return { pos, look, actor: a, st, x: pos.x / SCALE3D + minX, y: pos.z / SCALE3D + minY, rot: ((Math.atan2(-dx, dz) * 180 / Math.PI) % 360 + 360) % 360 };
}

function camHeadOf(name){
  if (!name || typeof CAST === "undefined") return null;
  const a = CAST.actors.find(x => x.name === name); if (!a) return null;
  const st = castStateAt(a, CAST.t); if (!st || !st.shown || !st.pose) return null;
  const r = st.rot * Math.PI / 180, F = new THREE.Vector3(-Math.sin(r), 0, Math.cos(r)), L = new THREE.Vector3(Math.cos(r), 0, Math.sin(r));
  const hp = skFK(st.pose, CAMFK).headC.pos;
  const h = new THREE.Vector3(toX(st.x), 0, toZ(st.y)).add(L.multiplyScalar(hp.x)).add(F.multiplyScalar(hp.z)); h.y = hp.y;
  return h;
}
const ZOOM_DUR = { snap: 0.3, normal: 1, slow: 3 };
function camZoomNow(c){
  if (typeof CUTS === "undefined" || !CUTS.list.length || (typeof PV !== "undefined" && PV.on)) return null;
  const i = cutIndexAt(CAST.t), k = CUTS.list[i]; if (!k || !k.zoom || k.cam !== c.id) return null;
  const D = ZOOM_DUR[k.zoom.k]; if (!D) return null;
  const tau = CAST.t - k.t; if (tau < 0) return null;
  const H = k.zoom.back === "hold" || k.zoom.back == null ? Infinity : +k.zoom.back;
  const ss = x => x * x * (3 - 2 * x);
  const a = tau < D ? ss(tau / D) : tau < D + H ? 1 : tau < 2 * D + H ? 1 - ss((tau - D - H) / D) : 0;
  if (a <= 1e-4) return null;
  let mode = "center", who = null;
  if (c.mount === "look" || c.mount === "behind"){ mode = "face"; who = c.actor; }
  else if (c.mount === "self") mode = camShotOf(c) === "forward" ? "center" : "selfie";
  else if (k.zoom.actor){ mode = "face"; who = k.zoom.actor; }
  const head = mode === "face" ? camHeadOf(who) : null;
  if (mode === "face" && !head) mode = "center";
  return { a, mode, head };
}
const camZoomSig = z => z ? z.mode + z.a.toFixed(4) + (z.head ? z.head.toArray().map(v => v.toFixed(3)).join("/") : "") : "";
function camZoomApply(z, fov){
  if (!z) return fov;
  if (z.mode === "face"){
    const pos = camera.position.clone(), d0 = new THREE.Vector3(); camera.getWorldDirection(d0);
    const d1 = z.head.clone().sub(pos), dist = Math.max(0.3, d1.length()); d1.normalize();
    camera.up.set(0, 1, 0); camera.lookAt(pos.add(d0.lerp(d1, z.a).normalize()));
    const fT = Math.max(6, Math.min(fov, 2 * Math.atan(0.32 / dist) * 180 / Math.PI));
    return fov + (fT - fov) * z.a;
  }
  return fov + (fov * (z.mode === "selfie" ? 0.5 : 0.4) - fov) * z.a;
}

const camLayer = document.getElementById("cam-layer");
function camFovH(c){
  const R = camRatio(), fy = camFovOf(c) * Math.PI / 180;
  return 2 * Math.atan(Math.tan(fy / 2) * (R.w / R.h)) * 180 / Math.PI;
}
function camRender2D(){
  if (!camLayer) return;
  camLayer.innerHTML = "";
  const k = Math.max(1, planK());
  CAMS.list.forEach(c => {
    const on = CAMS.sel === c.id, act = CAMS.active === c.id, col = on ? PAL.sel : act ? "#6aa5ff" : "#8fa3bd";
    const rg = camRig(c), cx = rg ? rg.x : c.x, cy = rg ? rg.y : c.y;
    if (rg) camLayer.appendChild(makeSvgEl("line", { x1: cx, y1: cy, x2: rg.st.x, y2: rg.st.y, stroke: col, "stroke-width": 1.2 * k, "stroke-dasharray": `${3 * k} ${3 * k}`, "stroke-opacity": 0.8, "pointer-events": "none" }));
    const rot = rg ? rg.rot : camRotNow(c), g = makeSvgEl("g", { class: "cam-el" + (rg ? " mounted" : ""), "data-cid": c.id, transform: `translate(${cx} ${cy}) rotate(${rot})` });
    const half = camFovH(c) / 2 * Math.PI / 180, L = Math.max(160, Math.min(boardW(), boardH()) * 0.55);
    const ex = Math.sin(half) * L, ey = Math.cos(half) * L;
    g.appendChild(makeSvgEl("path", { d: `M0 0 L${-ex} ${ey} A${L} ${L} 0 0 0 ${ex} ${ey} Z`, fill: col, "fill-opacity": on ? 0.16 : 0.09, stroke: col, "stroke-opacity": on ? 0.6 : 0.3, "stroke-width": 1 * k }));
    const w = 11 * k, h = 8 * k;
    g.appendChild(makeSvgEl("rect", { x: -w / 2, y: -h / 2, width: w, height: h, rx: 2 * k, fill: col, stroke: "#0d1117", "stroke-width": 1.2 * k }));
    g.appendChild(makeSvgEl("rect", { x: -w * 0.22, y: h / 2 - 1 * k, width: w * 0.44, height: 5 * k, rx: 1.5 * k, fill: col, stroke: "#0d1117", "stroke-width": 1 * k }));
    const nm = makeSvgEl("text", { x: 0, y: -h / 2 - 5 * k, "font-size": 10 * k, "font-weight": 700, fill: col, "text-anchor": "middle", transform: `rotate(${-rot})`, "pointer-events": "none", stroke: PAL.board, "stroke-width": 3 * k, "paint-order": "stroke" });
    nm.textContent = (act ? "▶ " : "") + (c.mount === "self" ? "📱" : "") + c.name + (c.mount === "look" && c.actor ? " ⇢" + c.actor : "") + (rg && c.mount === "behind" ? " ⤴" : ""); g.appendChild(nm);
    camLayer.appendChild(g);
    if (on && c.mount === "fixed" && typeof spinHandle === "function")
      spinHandle(camLayer, c.x, c.y, c.rot, 34 * k, k, deg => { c.rot = deg; camRender2D(); camApply(true); });
  });
}
{ const r3 = render; render = function(){ r3(); camRender2D(); }; }

let camDrag = null;
svg.addEventListener("pointerdown", e => {
  if (e.button !== 0 || spaceHeld) return;
  const pt = screenToCanvas(e.clientX, e.clientY);
  if (currentTool === "camera"){
    e.stopImmediatePropagation(); e.preventDefault();
    const q = clampToBoard(pt); setTool("select"); camAdd(q.x, q.y); return;
  }
  if (e.target.closest && e.target.closest(".spin-handle")) return;
  const g = e.target.closest && e.target.closest(".cam-el");
  if (!g){ if (CAMS.sel && currentTool === "select"){ CAMS.sel = null; camChanged(); } return; }
  if (currentTool !== "select") return;
  e.stopImmediatePropagation(); e.preventDefault();
  const c = camGet(g.dataset.cid); if (!c) return;
  camSelect(c.id);
  if (camMounted(c)) return;
  camDrag = { c, sx: pt.x, sy: pt.y, ox: c.x, oy: c.y, moved: false };
  try { svg.setPointerCapture(e.pointerId); } catch(err){}
}, true);
svg.addEventListener("pointermove", e => {
  if (!camDrag || (typeof spinDrag !== "undefined" && spinDrag)) return;
  e.stopImmediatePropagation();
  const pt = screenToCanvas(e.clientX, e.clientY), D = camDrag;
  if (!D.moved){ if (Math.hypot(pt.x - D.sx, pt.y - D.sy) * scale < 3) return; D.moved = true; pushHistory(); }
  const q = clampToBoard({ x: D.ox + pt.x - D.sx, y: D.oy + pt.y - D.sy });
  D.c.x = Math.round(q.x); D.c.y = Math.round(q.y);
  camRender2D(); camApply(true); SET3D.dirty = true;
}, true);
const camDragEnd = e => { if (!camDrag) return; camDrag = null; if (e) e.stopImmediatePropagation(); camChanged(); };
svg.addEventListener("pointerup", camDragEnd, true); svg.addEventListener("pointercancel", camDragEnd, true);

window.addEventListener("keydown", e => {
  if (APP.screen !== "set" || !CAMS.sel || typingNow() || setKeysTo3d()) return;
  if (typeof SETM !== "undefined" && (SETM.sel || SETM.editing)) return;
  if (e.code === "Delete" || e.code === "Backspace" || e.key === "Delete"){ e.preventDefault(); e.stopImmediatePropagation(); camRemove(CAMS.sel); }
  else if ((e.code === "KeyR" || e.key.toLowerCase() === "r") && !e.ctrlKey && !e.metaKey){ e.preventDefault(); e.stopImmediatePropagation(); camRotate(CAMS.sel, e.shiftKey ? -45 : 45); }
  else if (e.key === "Escape"){ camSelect(null); }
}, true);

const camNameIn = document.getElementById("cam-name");
function camPanelRender(){
  const c = CAMS.sel ? camGet(CAMS.sel) : null; if (!c) return;
  if (document.activeElement !== camNameIn) camNameIn.value = c.name;
  document.getElementById("cam-h").value = c.h.toFixed(1);
  document.getElementById("cam-tilt").value = Math.round(+c.tilt || 0);
  document.getElementById("cam-fov").value = c.fov;
  document.getElementById("cam-group").dataset.mount = c.mount || "fixed";
  const ms = document.getElementById("cam-mount");
  if (!ms.options.length || ms.dataset.lang !== currentLang){ ms.innerHTML = ""; CAM_MOUNTS.forEach(k => { const o = document.createElement("option"); o.value = k; o.textContent = t("camMount_" + k); ms.appendChild(o); }); ms.dataset.lang = currentLang; }
  ms.value = c.mount || "fixed";
  const as = document.getElementById("cam-actor"); as.innerHTML = "";
  const acts = typeof CAST !== "undefined" ? CAST.actors : [];
  if (!acts.length){ const o = document.createElement("option"); o.value = ""; o.textContent = t("camNoActor"); as.appendChild(o); }
  acts.forEach(a => { const o = document.createElement("option"); o.value = a.name; o.textContent = a.name; as.appendChild(o); });
  as.value = c.actor || (acts[0] ? "" : "");
  const ss = document.getElementById("cam-shot");
  if (!ss.options.length || ss.dataset.lang !== currentLang){ ss.innerHTML = ""; CAM_SHOTS.forEach(k => { const o = document.createElement("option"); o.value = k; o.textContent = t("camShot_" + k); ss.appendChild(o); }); ss.dataset.lang = currentLang; }
  ss.value = camShotOf(c) || c.shot || "front";
  document.getElementById("cam-dist").value = (+c.dist || 0).toFixed(1);
  document.getElementById("cam-fovdeg").value = Math.round(+c.fovDeg || 60);
  document.getElementById("cam-ratio").value = CAMS.ratio;
  document.getElementById("cam-eye").classList.toggle("on", camMode === "cam" && CAMS.active === c.id);
  camNowRender(c);
}
function camNowRender(c){
  const box = document.getElementById("cam-now"); if (!box) return;
  if (c.mount === "self" || c.mount === "behind"){
    box.classList.remove("warn");
    if (!c.actor){ box.textContent = t("camPickActor"); box.classList.add("warn"); return; }
    box.textContent = c.mount === "self"
      ? t("camNowSelf").replace("{n}", c.actor).replace("{s}", t("camShot_" + (camShotOf(c) || "front"))).replace("{d}", (+c.dist).toFixed(1))
      : t("camNowBehind").replace("{n}", c.actor).replace("{d}", (+c.dist).toFixed(1)).replace("{h}", (+c.h).toFixed(1)).replace("{f}", Math.round(c.fovDeg));
    return;
  }
  const tg = camTargetOf(c), tilt = camTiltOf(c), down = Math.round(-tilt * 180 / Math.PI);
  const steep = Math.abs(down) >= 60;
  let s;
  if (tg){
    const dist = Math.hypot(tg.x - c.x, tg.y - c.y) / 40;
    s = c.actor + " · " + dist.toFixed(1) + "m · " + t(down >= 0 ? "camLookDown" : "camLookUp").replace("{d}", Math.abs(down));
  } else {
    const f = rot2(0, 1, c.rot);
    s = t("aiLooks").replace("{d}", dirWord(f[0], f[1])) + " · " + t("camHeightShort").replace("{h}", c.h.toFixed(1)) + (Math.round(+c.tilt || 0) ? " · " + t(c.tilt > 0 ? "camLookDown" : "camLookUp").replace("{d}", Math.abs(Math.round(c.tilt))) : "");
  }
  box.textContent = s + (steep && tg ? " — " + t("camTooClose") : "");
  box.classList.toggle("warn", steep && !!tg);
}
function camTiltOf(c){
  const tg = camTargetOf(c); if (!tg) return -(+c.tilt || 0) * Math.PI / 180;
  const dist = Math.hypot(toX(tg.x) - toX(c.x), toZ(tg.y) - toZ(c.y));
  return Math.atan2(tg.h - c.h, Math.max(0.1, dist));
}
{ const u0 = updatePropPanel;
  updatePropPanel = function(){
    if ((selectedIds.length || (typeof CAST !== "undefined" && CAST.sel)) && CAMS.sel){ CAMS.sel = null; camRender2D(); }
    u0();
    const panel = document.getElementById("prop-panel"), c = CAMS.sel ? camGet(CAMS.sel) : null;
    panel.classList.toggle("cam-mode", !!c);
    if (c){ panel.classList.add("open"); document.getElementById("sel-title").textContent = t("selTitle") + (c.mount === "self" ? " 📱 " : " 🎥 ") + c.name; camPanelRender(); }
  };
}
const camEdit = fn => { const c = camGet(CAMS.sel); if (!c) return; pushHistory(); fn(c); camChanged(); };
camNameIn.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Enter") camNameIn.blur(); });
camNameIn.addEventListener("change", () => { const v = camNameIn.value.trim(); if (!v) return camPanelRender(); camEdit(c => { c.name = v.slice(0, 20); }); updatePropPanel(); });
document.getElementById("cam-h").addEventListener("change", e => camEdit(c => { c.h = Math.max(0.2, Math.min(40, +e.target.value || 1.6)); }));
document.getElementById("cam-tilt").addEventListener("change", e => camEdit(c => { c.tilt = Math.max(-60, Math.min(89, Math.round(+e.target.value || 0))); }));
document.getElementById("cam-tilt").addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Enter") e.target.blur(); });
document.getElementById("cam-fov").addEventListener("change", e => camEdit(c => { c.fov = e.target.value; }));
document.getElementById("cam-mount").addEventListener("change", e => {
  const m = e.target.value, c = camGet(CAMS.sel); if (!c) return;
  const acts = typeof CAST !== "undefined" ? CAST.actors : [];
  if (m !== "fixed" && !acts.length){ showToast(t("camNeedActor")); camPanelRender(); return; }
  camEdit(c => {
    c.mount = m;
    if (m !== "fixed" && !acts.some(a => a.name === c.actor)) c.actor = acts[0].name;
    if (m === "self"){ c.dist = CAM_SELF_DEF.dist; c.fovDeg = CAM_SELF_DEF.fovDeg; c.shot = "front"; }
    if (m === "behind"){ c.dist = CAM_BEHIND_DEF.dist; c.h = CAM_BEHIND_DEF.h; c.fovDeg = CAM_BEHIND_DEF.fovDeg; }
  });
  if (m === "self" || m === "behind"){ CAMS.active = c.id; if (threeInited && camMode !== "cam") setCamMode("cam"); camChanged(); }
  updatePropPanel();
});
document.getElementById("cam-actor").addEventListener("change", e => camEdit(c => { c.actor = e.target.value; }));
document.getElementById("cam-shot").addEventListener("change", e => camEdit(c => { c.shot = e.target.value; if (CAMS.active === c.id) CAMS.shotNow = null; if (typeof cutSetShotAtNow === "function") cutSetShotAtNow(c, e.target.value); }));
document.getElementById("cam-dist").addEventListener("change", e => camEdit(c => { c.dist = Math.max(0.2, Math.min(30, +e.target.value || (c.mount === "behind" ? CAM_BEHIND_DEF.dist : CAM_SELF_DEF.dist))); }));
document.getElementById("cam-fovdeg").addEventListener("change", e => camEdit(c => { c.fovDeg = Math.max(20, Math.min(120, Math.round(+e.target.value || 60))); }));
["cam-dist", "cam-fovdeg"].forEach(id => document.getElementById(id).addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Enter") e.target.blur(); }));
document.getElementById("cam-ratio").addEventListener("change", e => { pushHistory(); CAMS.ratio = e.target.value; camChanged(); camFrameLayout(); });
document.getElementById("cam-rot").addEventListener("click", () => camRotate(CAMS.sel, 45));
document.getElementById("cam-del").addEventListener("click", () => camRemove(CAMS.sel));
document.getElementById("cam-eye").addEventListener("click", () => { const c = camGet(CAMS.sel); if (!c) return; CAMS.active = c.id; setCamMode(camMode === "cam" ? "orbit" : "cam"); camChanged(); });
document.getElementById("cam-here").addEventListener("click", () => {
  const c = camGet(CAMS.sel); if (!c || !threeInited || camMode === "cam") return;
  if (camMounted(c)){ showToast(t("camRotMounted")); return; }
  const d = new THREE.Vector3(); camera.getWorldDirection(d);
  pushHistory();
  const src = camMode === "orbit" ? orbit.target : camera.position;
  const q = clampToBoard({ x: src.x / SCALE3D + minX, y: src.z / SCALE3D + minY });
  c.x = Math.round(q.x); c.y = Math.round(q.y);
  c.h = 1.6; c.tilt = 0; c.fov = "norm";
  c.rot = Math.abs(d.x) + Math.abs(d.z) > 1e-6 ? ((Math.atan2(-d.x, d.z) * 180 / Math.PI) % 360 + 360) % 360 : c.rot;
  c.mount = "fixed";
  camChanged(); updatePropPanel(); showToast(t("camHereDone").replace("{n}", c.name));
});

function camApply(force){
  if (typeof threeInited === "undefined" || !threeInited || camMode !== "cam") return false;
  const c = camActive(); if (!c) return false;
  const rg = camRig(c), z = camZoomNow(c), zs = camZoomSig(z);
  if (rg){
    const sig = [rg.pos.x, rg.pos.y, rg.pos.z, rg.look.x, rg.look.y, rg.look.z, c.fovDeg, CAMS.ratio, V3.w, V3.h, zs].map(v => typeof v === "number" ? v.toFixed(4) : v).join(",");
    if (!force && sig === camApply._sig) return false;
    camApply._sig = sig;
    camera.position.copy(rg.pos); camera.up.set(0, 1, 0); camera.lookAt(rg.look);
    camera.fov = camFovFit(camZoomApply(z, camFovOf(c))); camera.updateProjectionMatrix();
    SET3D.dirty = true;
    return true;
  }
  const rot = camRotNow(c), r = rot * Math.PI / 180;
  const px = toX(c.x), pz = toZ(c.y), tg = camTargetOf(c);
  const pitch = camTiltOf(c);
  const sig = [px, pz, c.h, rot, pitch.toFixed(4), c.fov, CAMS.ratio, V3.w, V3.h, zs].join(",");
  if (!force && sig === camApply._sig) return false;
  camApply._sig = sig;
  camera.position.set(px, c.h, pz);
  camera.rotation.order = "YXZ"; camera.rotation.set(pitch, Math.PI - r, 0);
  camera.fov = camFovFit(camZoomApply(z, camFovOf(c))); camera.updateProjectionMatrix();
  SET3D.dirty = true;
  return true;
}
function camFovFit(fovY){
  const box = camFrameBox(); if (!box || !box.h) return fovY;
  const k = (V3.h || 1) / box.h;
  return Math.min(140, 2 * Math.atan(Math.tan(fovY * Math.PI / 360) * k) * 180 / Math.PI);
}
function camFrameBox(){ return camFrameBoxIn(liveView.clientWidth, liveView.clientHeight); }
function camFrameBoxIn(w, h){
  const R = camRatio();
  if (!w || !h) return null;
  let bw = w, bh = w * R.h / R.w;
  if (bh > h){ bh = h; bw = h * R.w / R.h; }
  return { w: bw, h: bh, x: (w - bw) / 2, y: (h - bh) / 2 };
}
const camFrameEl = document.getElementById("cam-frame");
function camFrameLayout(){
  const direct = camMode === "drone" || (camMode === "walk" && typeof REC !== "undefined" && REC.on);
  const show = (camMode === "cam" && !!camActive()) || direct;
  camFrameEl.hidden = !show;
  if (!show) return;
  const b = camFrameBox(); if (!b) return;
  Object.assign(camFrameEl.style, { left: b.x + "px", top: b.y + "px", width: b.w + "px", height: b.h + "px" });
  camFrameEl.querySelector(".cf-tag").textContent = (direct ? t(camMode === "drone" ? "srcDrone" : "srcWalk") : camLabel(camActive())) + " · " + CAMS.ratio;
}
function camLabel(c, shot){
  if (!c) return "";
  if (c.mount === "self") return c.name + " · 📱 " + t("camShot_" + (shot || camShotOf(c) || "front")) + (c.actor ? " (" + c.actor + ")" : "");
  if (c.mount === "behind") return c.name + " · " + t("camBehindShort").replace("{n}", c.actor || "?");
  if (c.mount === "look" && c.actor) return c.name + " · " + t("camFollowShort").replace("{n}", c.actor);
  return c.name;
}
onLangChange(() => { camRender2D(); camPanelRender(); if (camMode === "cam") camFrameLayout(); });

function camToObj(){
  return CAMS.list.map(c => { const o = { name: c.name, x: c.x, y: c.y, rot: c.rot, h: c.h, fov: c.fov, mount: c.mount || "fixed" };
    if ((c.mount || "fixed") === "fixed" && Math.round(+c.tilt || 0)) o.tilt = Math.round(+c.tilt);
    if (c.mount !== "fixed") o.actor = c.actor || "";
    if (c.mount === "self"){ o.shot = c.shot || "front"; o.dist = +c.dist; o.fovDeg = +c.fovDeg; }
    if (c.mount === "behind"){ o.dist = +c.dist; o.fovDeg = +c.fovDeg; }
    return o; });
}
function camLoadArr(arr, ratio, active){
  CAMS.list = (Array.isArray(arr) ? arr : []).map((s, i) => ({ id: "c" + (camIdN++), name: String(s.name || t("camAuto") + " " + (i + 1)).slice(0, 20),
    x: +s.x || 0, y: +s.y || 0, rot: +s.rot || 0, h: Math.max(0.2, Math.min(40, +s.h || 1.6)),
    fov: CAM_FOVS.some(f => f.k === s.fov) ? s.fov : "norm",
    tilt: Math.max(-60, Math.min(89, Math.round(+s.tilt || 0))),
    mount: CAM_MOUNTS.includes(s.mount) ? s.mount : (s.follow ? "look" : "fixed"),
    actor: typeof s.actor === "string" ? s.actor : (typeof s.follow === "string" ? s.follow : ""),
    shot: CAM_SHOTS.includes(s.shot) ? s.shot : "front",
    dist: Math.max(0.2, Math.min(30, +s.dist || (s.mount === "behind" ? CAM_BEHIND_DEF.dist : CAM_SELF_DEF.dist))),
    fovDeg: Math.max(20, Math.min(120, +s.fovDeg || (s.mount === "behind" ? CAM_BEHIND_DEF.fovDeg : CAM_SELF_DEF.fovDeg))) }));
  if (CAMS.list.length > CAM_MAX) setTimeout(() => showToast(t("camMaxFile").replace("{n}", CAMS.list.length)), 400);
  CAMS.ratio = CAM_RATIOS.some(r => r.k === ratio) ? ratio : "16:9";
  CAMS.sel = null; CAMS.active = CAMS.list.length ? CAMS.list[Math.max(0, CAMS.list.findIndex(c => c.name === active))].id : null;
  if (!CAMS.list.length && typeof camMode !== "undefined" && camMode === "cam") setCamMode("orbit");
  camChanged();
}
function camAiLines(out, B){
  if (!CAMS.list.length) return false;
  out.push("", "[" + t("aiCamera") + "] " + t("aiCamRatio").replace("{r}", CAMS.ratio));
  CAMS.list.forEach(c => {
    const act = CAMS.active === c.id;
    if (c.mount === "self"){ out.push(`- ${c.name}${act ? " " + t("aiCamNow") : ""} · ` + t("aiCamSelf").replace("{n}", c.actor || "?").replace("{d}", (+c.dist).toFixed(1)).replace("{f}", Math.round(c.fovDeg))); return; }
    if (c.mount === "behind"){ out.push(`- ${c.name}${act ? " " + t("aiCamNow") : ""} · ` + t("aiCamBehind").replace("{n}", c.actor || "?").replace("{d}", (+c.dist).toFixed(1)).replace("{h}", (+c.h).toFixed(1)).replace("{f}", Math.round(c.fovDeg))); return; }
    const rot = camRotNow(c), f = rot2(0, 1, rot);
    out.push(`- ${c.name}${act ? " " + t("aiCamNow") : ""} · ${areaWord(c.x, c.y, B)} (x ${m1(c.x - B.x0)}m, y ${m1(c.y - B.y0)}m, ${t("aiHeight")} ${c.h.toFixed(1)}m) · `
      + t("aiLooks").replace("{d}", dirWord(f[0], f[1])) + (c.mount !== "look" && Math.round(+c.tilt || 0) ? " · " + t(c.tilt > 0 ? "camLookDown" : "camLookUp").replace("{d}", Math.abs(Math.round(c.tilt))) : "") + " · " + t("aiFov_" + c.fov) + (c.mount === "look" && c.actor ? " · " + t("aiCamFollow").replace("{n}", c.actor) : ""));
  });
  return true;
}
