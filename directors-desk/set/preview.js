"use strict";

const PV = { on: false, playing: false, start: 0, T0: 0, saved: null };
const pvBack = document.getElementById("pv-back"), pvCv = document.getElementById("pv-cv"), pvBtn = document.getElementById("pv-btn");

function pvOpen(){
  if (PV.on) return;
  if (typeof REC !== "undefined" && REC.on) return;
  if (!CAMS.list.length){ showToast(t("pvNeedCam")); return; }
  tlPlay(false);
  PV.saved = { t: CAST.t, active: CAMS.active, shotNow: CAMS.shotNow, shots: CAMS.list.map(c => [c.id, c.shot]), mode: camMode, view: SETV.view, boxes: SET3D.selBoxes.map(b => b.visible) };
  if (SETV.view !== "3d") setView("3d");
  if (!threeInited) return;
  if (!camActive()) CAMS.active = CAMS.list[0].id;
  if (camMode !== "cam") setCamMode("cam");
  PV.on = true; PV.playing = false;
  SET3D.selBoxes.forEach(b => { b.visible = false; }); cast3dSync();
  pvBack.hidden = false;
  pvLayout(); pvUi();
  camApply(true); SET3D.dirty = true;
}
function pvClose(){
  if (!PV.on) return;
  const S = PV.saved;
  PV.on = false; PV.playing = false; pvBack.hidden = true;
  S.shots.forEach(([id, sh]) => { const c = camGet(id); if (c) c.shot = sh; });
  castSetTime(S.t);
  CAMS.active = S.active; CAMS.shotNow = S.shotNow;
  if (SETV.view !== S.view) setView(S.view);
  if (camMode !== S.mode) setCamMode(S.mode);
  SET3D.selBoxes.forEach((b, i) => { b.visible = S.boxes[i] !== false; }); cast3dSync();
  camApply(true); camRender2D(); camPanelRender();
  if (typeof camFrameLayout === "function") camFrameLayout();
  SET3D.dirty = true;
}
function pvCam(n){
  const c = CAMS.list[n - 1]; if (!c) return;
  if (c.mount === "self") CAMS.shotNow = CAMS.active === c.id ? shotNext(camShotOf(c)) : "front";
  else CAMS.shotNow = null;
  CAMS.active = c.id;
  camApply(true); SET3D.dirty = true; pvLayout(); pvUi();
}
function pvPlay(on){
  const end = castTotal();
  if (end <= 0) return;
  if (on && CAST.t >= end - 1e-3) pvSetTime(0);
  PV.playing = on; PV.start = performance.now(); PV.T0 = CAST.t; pvUi();
}
function pvSetTime(T){
  CAST.t = Math.max(0, Math.min(Math.max(castTotal(), 0), T));
  cast3dSync(); camApply(true); SET3D.dirty = true;
}
function pvTick(){
  if (!PV.playing) return;
  const end = castTotal();
  let T = PV.T0 + (performance.now() - PV.start) / 1000;
  if (T >= end){ T = end; PV.playing = false; }
  pvSetTime(T);
  pvUi();
}
function pvFrame(){
  const cvs = V3.renderer.domElement, box = camFrameBoxIn(cvs.clientWidth, cvs.clientHeight);
  if (!box || box.w < 2) return;
  const kx = cvs.width / cvs.clientWidth, ky = cvs.height / cvs.clientHeight;
  const g = pvCv.getContext("2d");
  g.drawImage(cvs, box.x * kx, box.y * ky, box.w * kx, box.h * ky, 0, 0, pvCv.width, pvCv.height);
}
function pvLayout(){
  const R = camRatio(), maxW = Math.min(900, innerWidth - 80), maxH = Math.max(160, innerHeight - 250);
  let w = maxW, h = w * R.h / R.w; if (h > maxH){ h = maxH; w = h * R.w / R.h; }
  pvCv.style.width = Math.round(w) + "px"; pvCv.style.height = Math.round(h) + "px";
  const k = Math.min(1.5, window.devicePixelRatio || 1);
  pvCv.width = Math.round(w * k); pvCv.height = Math.round(h * k);
}
function pvUi(){
  const keys = document.getElementById("pv-keys"); keys.innerHTML = "";
  const lab = document.createElement("b"); lab.textContent = t("pvKeys"); keys.appendChild(lab);
  CAMS.list.forEach((c, i) => {
    const s = document.createElement("span"); s.className = "pv-k" + (CAMS.active === c.id ? " on" : "") + (i >= CAM_MAX ? " nokey" : "");
    const k = document.createElement("kbd"); k.textContent = i < CAM_MAX ? String(i + 1) : "–"; s.appendChild(k);
    s.appendChild(document.createTextNode(" " + (c.mount === "self" ? "📱" + c.name + " (" + t("camShot_" + camShotOf(c)) + ")" : c.name)));
    keys.appendChild(s);
  });
  const end = castTotal(), can = end > 0;
  document.getElementById("pv-time").textContent = CAST.t.toFixed(1) + "s / " + end.toFixed(1) + "s";
  const pb = document.getElementById("pv-play"), sk = document.getElementById("pv-seek");
  pb.textContent = t(PV.playing ? "pvPause" : "pvPlay"); pb.disabled = !can; pb.classList.toggle("on", PV.playing);
  document.getElementById("pv-start").disabled = !can;
  sk.disabled = !can; sk.max = String(Math.max(0.01, end)); if (!PV.seeking) sk.value = String(CAST.t);
  const note = document.getElementById("pv-note"); note.hidden = can; note.textContent = t("pvNoClips");
  const c = camActive(); document.getElementById("pv-tag").textContent = c ? camLabel(c) : "";
}

pvBtn.addEventListener("click", e => { e.stopPropagation(); pvOpen(); });
document.getElementById("pv-x").addEventListener("click", pvClose);
document.getElementById("pv-play").addEventListener("click", e => { pvPlay(!PV.playing); e.currentTarget.blur(); });
document.getElementById("pv-start").addEventListener("click", e => { PV.playing = false; pvSetTime(0); pvUi(); e.currentTarget.blur(); });
{ const sk = document.getElementById("pv-seek");
  sk.addEventListener("pointerdown", () => { PV.seeking = true; });
  sk.addEventListener("input", () => { pvSetTime(+sk.value); if (PV.playing){ PV.T0 = CAST.t; PV.start = performance.now(); } pvUi(); });
  const end = () => { PV.seeking = false; sk.blur(); pvUi(); };
  sk.addEventListener("change", end); sk.addEventListener("pointerup", end); }
window.addEventListener("resize", () => { if (PV.on){ pvLayout(); SET3D.dirty = true; } });
window.addEventListener("keydown", e => {
  if (!PV.on){ if (typeof droneKeyGuard === "function") droneKeyGuard(e); return; }
  e.stopImmediatePropagation();
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const d = /^Digit([1-9])$/.exec(e.code) || /^Numpad([1-9])$/.exec(e.code);
  if (d){ e.preventDefault(); pvCam(+d[1]); }
  else if (e.code === "KeyP" || e.code === "Space"){ e.preventDefault(); pvPlay(!PV.playing); }
  else if (e.key === "Escape"){ e.preventDefault(); pvClose(); }
}, true);
onLangChange(() => { if (PV.on) pvUi(); });
