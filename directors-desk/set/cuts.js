"use strict";

const CUTS = { list: [], sel: null, drag: null };
const CUT_MIN = 0.2;

function cutSort(){ CUTS.list.sort((a, b) => a.t - b.t); }
function cutIndexAt(T){
  let k = -1;
  for (let i = 0; i < CUTS.list.length; i++){ if (CUTS.list[i].t <= T + 1e-6) k = i; else break; }
  return CUTS.list.length ? Math.max(0, k) : -1;
}
function cutCamAt(T){ const i = cutIndexAt(T); return i < 0 ? null : camGet(CUTS.list[i].cam); }
const cutIsSelf = id => { const c = camGet(id); return !!c && c.mount === "self"; };
const cutShotOf = k => cutIsSelf(k.cam) ? (k.shot || "front") : undefined;
const shotNext = s => CAM_SHOTS[(CAM_SHOTS.indexOf(s || "front") + 1) % CAM_SHOTS.length];
const cutSameAsPrev = (A, B) => !!A && !!B && B.cam === A.cam && (B.shot || null) === (A.shot || null) && !B.zoom;
function cutTidy(){
  CUTS.list = CUTS.list.filter(c => camGet(c.cam));
  CUTS.list.forEach(k => { k.shot = cutShotOf(k); });
  cutSort();
  if (CUTS.list.length) CUTS.list[0].t = 0;
  if (CUTS.list.length === 1){
    const k = CUTS.list[0], c = camGet(k.cam); if (c && k.shot) c.shot = k.shot;
    if (c){ CAMS.active = c.id; CAMS.shotNow = null; }
    CUTS.list = []; CUTS.sel = null;
  }
  if (CUTS.sel && !CUTS.list.includes(CUTS.sel)) CUTS.sel = null;
}
function cutApply(){
  if (!CUTS.list.length){ const ch = CAMS.shotNow != null; CAMS.shotNow = null; return ch; }
  const k = CUTS.list[cutIndexAt(CAST.t)], c = k && camGet(k.cam); if (!c) return false;
  const shot = k.shot || null;
  if (CAMS.active === c.id && CAMS.shotNow === shot) return false;
  CAMS.active = c.id; CAMS.shotNow = shot;
  if (typeof camFrameLayout === "function") camFrameLayout();
  return true;
}
function cutChanged(){
  cutTidy(); cutApply(); camChanged(); tlRender();
  if (typeof camFrameLayout === "function") camFrameLayout();
}
const camOrder = () => CAMS.list.map(c => c.id);
function cutNow(){
  if (CUTS.list.length){ const k = CUTS.list[cutIndexAt(CAST.t)]; return { cam: k.cam, shot: k.shot }; }
  const c = camActive(); return c ? { cam: c.id, shot: c.mount === "self" ? camShotOf(c) : undefined } : null;
}

function cutHere(camId){
  if (typeof REC !== "undefined" && REC.on){ cutRecToast(); return; }
  const cur0 = camActive();
  if (CAMS.list.length < 2 && !(cur0 && cur0.mount === "self")){ showToast(t("cutNeed2")); return; }
  const T = Math.round(CAST.t / TL_SNAP) * TL_SNAP;
  pushHistory();
  if (!CUTS.list.length){ const n = cutNow(); CUTS.list.push({ t: 0, cam: n.cam, shot: n.shot }); }
  const i = cutIndexAt(T), cur = CUTS.list[i];
  const ids = camOrder(), next = camId || ids[(ids.indexOf(cur.cam) + 1) % ids.length];
  const shot = cutIsSelf(next) ? (next === cur.cam ? shotNext(cur.shot) : "front") : undefined;
  if (Math.abs(cur.t - T) < CUT_MIN){ cur.cam = next; cur.shot = shot; CUTS.sel = cur; }
  else { const c = { t: T, cam: next, shot }; CUTS.list.push(c); CUTS.sel = c; }
  const wasPlaying = CAST.playing;
  if (wasPlaying) tlPlay(false);
  const keep = CUTS.sel;
  cutChanged();
  if (keep && CUTS.list.includes(keep)) castSetTime(keep.t);
  if (wasPlaying) showToast(t("cutPaused"));
}
let cutRecToastAt = 0;
function cutRecToast(){ if (REC.mode !== "camera") return; const n = performance.now(); if (n - cutRecToastAt > 2500){ cutRecToastAt = n; showToast(t("recNoCutKeys")); } }
function cutKey(n){
  const c = CAMS.list[n - 1]; if (!c) return;
  if (typeof REC !== "undefined" && REC.on){ cutRecToast(); return; }
  const self = c.mount === "self";
  const live = CAST.playing;
  const now = cutNow() || { cam: c.id };
  const shot = self ? (now.cam === c.id ? shotNext(now.shot) : "front") : undefined;
  const label = typeof camLabel === "function" ? camLabel(c, shot) : c.name;
  if (live){
    if (now.cam === c.id && !self) return;
    pushHistory();
    tlPlay(false);
    if (!CUTS.list.length) CUTS.list.push({ t: 0, cam: now.cam, shot: now.shot });
    const T = Math.round(CAST.t * 100) / 100, i = cutIndexAt(T), cur = CUTS.list[i];
    if (T - cur.t < CUT_MIN){ cur.cam = c.id; cur.shot = shot;
      const i0 = CUTS.list.indexOf(cur); if (i0 > 0 && cutSameAsPrev(CUTS.list[i0 - 1], cur)) CUTS.list.splice(i0, 1);
    } else CUTS.list.push({ t: T, cam: c.id, shot });
    cutTidy(); cutApply(); camRender2D(); camApply(true); tlRender();
    if (typeof camFrameLayout === "function") camFrameLayout();
    showToast(t("cutLive").replace("{n}", label).replace("{t}", T.toFixed(1)) + " · " + t("cutPaused"));
    return;
  }
  if (CUTS.list.length){
    pushHistory();
    const cur = CUTS.sel && CUTS.list.includes(CUTS.sel) ? CUTS.sel : CUTS.list[cutIndexAt(CAST.t)];
    const sh = self ? (cur.cam === c.id ? shotNext(cur.shot) : "front") : undefined;
    cur.cam = c.id; cur.shot = sh; CUTS.sel = cur; cutChanged();
    if (CUTS.list.includes(cur) && cutIndexAt(CAST.t) !== CUTS.list.indexOf(cur)) castSetTime(cur.t);
    showToast(typeof camLabel === "function" ? camLabel(c, sh) : c.name); return; }
  if (self && CAMS.active === c.id && camMode === "cam"){ pushHistory(); c.shot = shot; CAMS.shotNow = null; camChanged(); showToast(label); return; }
  CAMS.active = c.id; CAMS.shotNow = null;
  if (self){ c.shot = "front"; showToast(label); }
  if (threeInited && camMode !== "cam") setCamMode("cam");
  camChanged();
}
function cutSetShotAtNow(c, shot){
  if (!CUTS.list.length) return;
  const k = CUTS.list[cutIndexAt(CAST.t)]; if (!k || k.cam !== c.id) return;
  k.shot = shot; cutTidy(); cutApply(); tlRender();
}
function cutRemove(c){
  if (!c) return;
  pushHistory();
  const i = CUTS.list.indexOf(c);
  if (i === 0 && CUTS.list[1]) CUTS.list[1].t = 0;
  CUTS.list.splice(i, 1); CUTS.sel = null;
  cutChanged();
  if (typeof undoToastSet === "function") undoToastSet(t("cutRemoved"));
}
const cut2 = v => Math.round(v * 100) / 100;
const cutEndT = () => castTotal() > 0 ? castTotal() : TL.total;
function cutSetStart(c, v){
  const i = CUTS.list.indexOf(c); if (i <= 0 || !isFinite(v)) return;
  const lo = CUTS.list[i - 1].t + CUT_MIN, hi = (CUTS.list[i + 1] ? CUTS.list[i + 1].t : cutEndT()) - CUT_MIN; if (hi < lo) return;
  pushHistory(); c.t = Math.max(lo, Math.min(hi, cut2(v))); cutChanged();
}
function cutSetLen(c, v){
  const i = CUTS.list.indexOf(c), nx = CUTS.list[i + 1]; if (i < 0 || !nx || !isFinite(v)) return;
  const lo = c.t + CUT_MIN, hi = (CUTS.list[i + 2] ? CUTS.list[i + 2].t : cutEndT()) - CUT_MIN; if (hi < lo) return;
  pushHistory(); nx.t = Math.max(lo, Math.min(hi, cut2(c.t + v))); cutChanged();
}
function cutNumRender(sel){
  const box = document.getElementById("tl-cut-num"); box.hidden = !sel; if (!sel) return;
  const i = CUTS.list.indexOf(sel), nx = CUTS.list[i + 1], a = document.getElementById("tl-cut-t0"), l = document.getElementById("tl-cut-len");
  a.disabled = i === 0; a.title = t(i === 0 ? "cutT0First" : "cutT0Title");
  l.disabled = !nx; l.title = t(nx ? "cutLenTitle" : "cutLenLast");
  if (document.activeElement !== a) a.value = String(cut2(sel.t));
  if (document.activeElement !== l) l.value = String(cut2((nx ? nx.t : Math.max(castTotal(), sel.t)) - sel.t));
  document.getElementById("tl-cut-end").hidden = !!nx;
}
function cutZoomRender(sel){
  const zs = document.getElementById("tl-cut-zoom"), bs = document.getElementById("tl-cut-back"), ts = document.getElementById("tl-cut-zt");
  zs.hidden = !sel; const z = sel && sel.zoom;
  bs.hidden = !z; const cam = sel && camGet(sel.cam); ts.hidden = !(z && cam && (cam.mount || "fixed") === "fixed");
  if (!sel) return;
  const opt = (s, list, v) => { s.innerHTML = ""; list.forEach(([k, lab]) => { const o = document.createElement("option"); o.value = k; o.textContent = lab; s.appendChild(o); }); s.value = v; };
  opt(zs, [["", t("zoomNone")], ["snap", t("zoomSnap")], ["normal", t("zoomNormal")], ["slow", t("zoomSlow")]], z ? z.k : "");
  if (z) opt(bs, [["hold", t("backHold")], ["1", t("backN").replace("{n}", 1)], ["2", t("backN").replace("{n}", 2)], ["3", t("backN").replace("{n}", 3)]], String(z.back == null ? "hold" : z.back));
  if (!ts.hidden) opt(ts, [["", "🎯 " + t("zoomCenter")]].concat(CAST.actors.map(a => [a.name, "🎯 " + t("zoomFace").replace("{n}", a.name)])), z.actor || "");
}
function cutZoomSet(fn){ if (!CUTS.sel) return; pushHistory(); fn(CUTS.sel); cutChanged(); }
document.getElementById("tl-cut-zoom").addEventListener("change", e => cutZoomSet(k => { if (!e.target.value) delete k.zoom; else k.zoom = Object.assign({ back: "hold" }, k.zoom || {}, { k: e.target.value }); }));
document.getElementById("tl-cut-back").addEventListener("change", e => cutZoomSet(k => { if (k.zoom) k.zoom.back = e.target.value === "hold" ? "hold" : +e.target.value; }));
document.getElementById("tl-cut-zt").addEventListener("change", e => cutZoomSet(k => { if (k.zoom){ if (e.target.value) k.zoom.actor = e.target.value; else delete k.zoom.actor; } }));
const cutZoomCopy = z => z ? { k: z.k, back: z.back == null ? "hold" : z.back, actor: z.actor || undefined } : undefined;
function cutClearAll(){ if (!CUTS.list.length) return; pushHistory(); CUTS.list = []; CUTS.sel = null; cutChanged(); }

const cutRow = document.getElementById("tl-cuts");
function cutRender(){
  const on = typeof CAMS !== "undefined" && CAMS.list.length > 0;
  cutRow.hidden = !on;
  tlBar.classList.toggle("has-cams", on);
  const grp = document.getElementById("tl-cut-grp"); grp.hidden = !on;
  const selGrp = document.getElementById("tl-cutsel-grp"); selGrp.hidden = !(on && CUTS.sel);
  if (!on) return;
  const lab = document.createElement("div"); lab.className = "tl-lab tl-cut-lab"; lab.textContent = t("cutRowLab"); lab.title = t("cutRowTitle");
  const head = tlLabels.querySelector(".tl-lab-head"); if (head) head.after(lab); else tlLabels.prepend(lab);
  cutRow.innerHTML = "";
  const end = TL.total;
  const segs = CUTS.list.length ? CUTS.list : [{ t: 0, cam: (camActive() || CAMS.list[0]).id, shot: (camActive() || {}).mount === "self" ? camShotOf(camActive()) : undefined, ghost: true }];
  segs.forEach((c, i) => {
    const t1 = i < segs.length - 1 ? segs[i + 1].t : end, cam = camGet(c.cam);
    const b = document.createElement("div");
    const same = !c.ghost && i > 0 && cutSameAsPrev(segs[i - 1], c);
    b.className = "tl-cut" + (c.ghost ? " ghost" : "") + (CUTS.sel === c ? " sel" : "") + (same ? " same" : "");
    b.style.left = (c.t * TL.pps) + "px"; b.style.width = Math.max(6, (t1 - c.t) * TL.pps - 1) + "px";
    b.dataset.ci = c.ghost ? "" : i;
    const n = CAMS.list.indexOf(cam) + 1;
    const self = cam && cam.mount === "self";
    b.classList.toggle("self", !!self);
    b.textContent = (self ? "📱" : "🎥") + (n > 0 ? n : "") + " " + (self ? t("camShot_" + (c.shot || "front")) + " · " + cam.name : (cam ? cam.name : "?")) + (c.zoom ? " 🔍" : "");
    b.title = (cam ? camLabel(cam, c.shot) : "") + " · " + c.t.toFixed(2) + "–" + t1.toFixed(2) + "s — " + t(c.ghost ? "cutGhostTitle" : "cutTitle") + (same ? "\n" + t("cutSameTitle") : "");
    if (!c.ghost && i > 0){ const h = document.createElement("i"); h.className = "tl-cut-edge"; h.title = t("cutEdgeTitle") + (same ? "\n" + t("cutSameTitle") : ""); b.appendChild(h); }
    cutRow.appendChild(b);
  });
  const sel = CUTS.sel, ss = document.getElementById("tl-cut-cam"), del = document.getElementById("tl-cut-del"), sh = document.getElementById("tl-cut-shot");
  ss.hidden = !sel; del.hidden = !sel;
  sh.hidden = !(sel && cutIsSelf(sel.cam));
  cutNumRender(sel);
  cutZoomRender(sel);
  if (!sh.hidden){ sh.innerHTML = ""; CAM_SHOTS.forEach(k => { const o = document.createElement("option"); o.value = k; o.textContent = "📱 " + t("camShot_" + k); sh.appendChild(o); }); sh.value = sel.shot || "front"; }
  document.getElementById("tl-cut-clear").hidden = !CUTS.list.length;
  if (sel){
    ss.innerHTML = "";
    CAMS.list.forEach((c, i) => { const o = document.createElement("option"); o.value = c.id; o.textContent = (i + 1) + " · " + c.name; ss.appendChild(o); });
    ss.value = sel.cam;
  }
}
{ const r0 = tlRender;
  tlRender = function(){
    const has = typeof CAMS !== "undefined" && CAMS.list.length > 0;
    r0();
    tlBar.classList.toggle("empty", !CAST.actors.length && !has);
    if (TL.open) cutRender();
    else { cutRow.hidden = true; document.getElementById("tl-cut-grp").hidden = !has; document.getElementById("tl-cutsel-grp").hidden = true; }
  };
}
{ const p0 = tlPlay; tlPlay = function(on){ p0(on); if (CAST.playing && CUTS.sel){ CUTS.sel = null; tlRender(); } }; }
{ const s0 = castSetTime;
  castSetTime = function(T){
    s0(T);
    if (CUTS.list.length && !(typeof PV !== "undefined" && PV.on) && cutApply()){ camApply(true); camRender2D(); camPanelRender(); }
  };
}
{ const c0 = camChanged; camChanged = function(){ if (CUTS.list.some(c => !camGet(c.cam))) cutTidy(); c0(); if (typeof tlRender === "function" && cutRow) tlRender(); }; }
{ const s0 = camSnap; camSnap = function(){ const o = s0(); o.cuts = CUTS.list.map(c => ({ t: c.t, cam: c.cam, shot: c.shot, zoom: cutZoomCopy(c.zoom) })); return o; }; }
{ const a0 = camAfterHist; camAfterHist = function(o){ CUTS.list = o && Array.isArray(o.cuts) ? o.cuts.map(c => Object.assign({ t: c.t, cam: c.cam, shot: c.shot }, c.zoom ? { zoom: cutZoomCopy(c.zoom) } : {})) : []; CUTS.sel = null; a0(o); cutTidy(); cutApply(); tlRender(); }; }

let cutLastDown = { at: 0, x: -99 };
cutRow.addEventListener("pointerdown", e => {
  if (e.button !== 0) return;
  const b = e.target.closest(".tl-cut"); if (!b) return;
  e.stopPropagation(); e.preventDefault();
  const now = performance.now(), dbl = now - cutLastDown.at < 400 && Math.abs(e.clientX - cutLastDown.x) < 6 && !e.target.classList.contains("tl-cut-edge");
  cutLastDown = dbl ? { at: 0, x: -99 } : { at: now, x: e.clientX };
  if (dbl){ cutDblAt(e.clientX); return; }
  if (b.dataset.ci === ""){ CUTS.sel = null; tlRender(); castSetTime(tlTimeAt(e.clientX)); return; }
  const i = +b.dataset.ci, c = CUTS.list[i]; if (!c) return;
  CUTS.sel = c; if (typeof SPD !== "undefined") SPD.sel = null;
  if (e.target.classList.contains("tl-cut-edge")){
    const lo = CUTS.list[i - 1].t + CUT_MIN, hi = (CUTS.list[i + 1] ? CUTS.list[i + 1].t : TL.total) - CUT_MIN;
    CUTS.drag = { c, x: e.clientX, o: c.t, lo, hi, moved: false };
    try { cutRow.setPointerCapture(e.pointerId); } catch(err){}
  } else castSetTime(Math.max(c.t, tlTimeAt(e.clientX)));
  tlRender();
});
cutRow.addEventListener("pointermove", e => {
  const D = CUTS.drag; if (!D) return;
  const dx = e.clientX - D.x;
  if (!D.moved){ if (Math.abs(dx) < 3) return; D.moved = true; pushHistory(); }
  D.c.t = Math.max(D.lo, Math.min(D.hi, Math.round((D.o + dx / TL.pps) / TL_SNAP) * TL_SNAP));
  tlRender(); castSetTime(D.c.t);
});
const cutUp = () => { if (CUTS.drag && CUTS.drag.moved) cutChanged(); CUTS.drag = null; };
cutRow.addEventListener("pointerup", cutUp); cutRow.addEventListener("pointercancel", cutUp);
function cutDblAt(clientX){ castSetTime(Math.round(tlTimeAt(clientX) * 10) / 10); cutHere(); }
["tl-cut-t0", "tl-cut-len"].forEach(id => {
  const el = document.getElementById(id);
  el.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Enter") el.blur(); });
  el.addEventListener("change", () => { if (!CUTS.sel) return; if (id === "tl-cut-t0") cutSetStart(CUTS.sel, +el.value); else cutSetLen(CUTS.sel, +el.value); });
});

document.getElementById("tl-cut-here").addEventListener("click", () => cutHere());
document.getElementById("tl-cut-cam").addEventListener("change", e => { if (!CUTS.sel) return; pushHistory(); CUTS.sel.cam = e.target.value; CUTS.sel.shot = cutIsSelf(e.target.value) ? "front" : undefined; cutChanged(); });
document.getElementById("tl-cut-shot").addEventListener("change", e => { if (!CUTS.sel) return; pushHistory(); CUTS.sel.shot = e.target.value; cutChanged(); });
document.getElementById("tl-cut-del").addEventListener("click", () => cutRemove(CUTS.sel));
document.getElementById("tl-cut-clear").addEventListener("click", cutClearAll);

window.addEventListener("keydown", e => {
  if (APP.screen !== "set" || typingNow() || e.ctrlKey || e.metaKey || e.altKey) return;
  if (!CAMS.list.length) return;
  const d = /^Digit([1-9])$/.exec(e.code) || /^Numpad([1-9])$/.exec(e.code);
  if (d){ e.preventDefault(); e.stopImmediatePropagation(); cutKey(+d[1]); return; }
  if (e.code === "KeyC" && !e.shiftKey){ e.preventDefault(); e.stopImmediatePropagation(); cutHere(); return; }
  if (REC.on) return;
  if (!CUTS.sel || CAST.selClip || CAMS.sel || (typeof SETM !== "undefined" && (SETM.sel || SETM.editing))) return;
  if (e.code === "Delete" || e.code === "Backspace"){ e.preventDefault(); e.stopImmediatePropagation(); cutRemove(CUTS.sel); }
  else if (e.key === "Escape"){ CUTS.sel = null; tlRender(); }
}, true);

function cutToObj(){ return CUTS.list.length ? CUTS.list.map(c => ({ t: Math.round(c.t * 1000) / 1000, cam: (camGet(c.cam) || {}).name, shot: c.shot || undefined, zoom: cutZoomCopy(c.zoom) })) : undefined; }
function cutLoadArr(arr){
  CUTS.list = (Array.isArray(arr) ? arr : []).map(c => { const cam = CAMS.list.find(x => x.name === c.cam); if (!cam || !isFinite(+c.t)) return null;
    const k = { t: Math.max(0, +c.t), cam: cam.id, shot: CAM_SHOTS.includes(c.shot) ? c.shot : undefined };
    if (c.zoom && ZOOM_DUR[c.zoom.k]) k.zoom = { k: c.zoom.k, back: [1, 2, 3].includes(+c.zoom.back) ? +c.zoom.back : "hold", actor: typeof c.zoom.actor === "string" && c.zoom.actor ? c.zoom.actor : undefined };
    return k; }).filter(Boolean);
  CUTS.sel = null; cutTidy(); cutApply(); tlRender();
}
{ const o0 = castToObj; castToObj = function(){ const o = o0(); o.version = 4; o.cuts = cutToObj(); return o; }; }
{ const l0 = castLoadObj; castLoadObj = function(o, quiet){ const ok = l0(o, quiet); if (ok) cutLoadArr(o.cuts); return ok; }; }
function cutAiLine(){
  if (!CUTS.list.length) return "";
  const L = CUTS.list.filter((c, i) => i === 0 || !cutSameAsPrev(CUTS.list[i - 1], c));
  if (L.length < 2 && !L[0].zoom) return "";
  return t("aiCuts") + " " + L.map(c => t("aiCutAt").replace("{t}", c.t.toFixed(1)).replace("{n}", ((camGet(c.cam) || {}).name || "?") + (c.shot ? "(" + t("camShot_" + c.shot) + ")" : "") + cutAiZoom(c))).join(" → ");
}
function cutAiZoom(k){
  if (!k.zoom) return "";
  const c = camGet(k.cam) || {}, m = c.mount || "fixed";
  const who = m === "look" || m === "behind" ? c.actor : m === "fixed" ? k.zoom.actor : (k.shot && k.shot !== "forward" ? c.actor : "");
  const g = who ? t("zoomFace").replace("{n}", who) : t("zoomCenter");
  const zk = { snap: "zkSnap", normal: "zkNormal", slow: "zkSlow" }[k.zoom.k];
  return " (" + t("aiZoom").replace("{k}", t(zk)).replace("{g}", g) + (k.zoom.back !== "hold" && k.zoom.back != null ? t("aiZoomBack").replace("{n}", k.zoom.back) : "") + ")";
}
{ const a0 = camAiLines; camAiLines = function(out, B){ const r = a0(out, B); const l = cutAiLine(); if (r && l) out.push(l); return r; }; }

onLangChange(() => { if (typeof tlRender === "function") tlRender(); });
