"use strict";

const TL = { open: true, pps: 40, total: 8, drag: null, scrub: false, pathMode: false };
const tlBar = document.getElementById("set-tl"), tlTrack = document.getElementById("tl-track"), tlRows = document.getElementById("tl-rows"),
  tlLabels = document.getElementById("tl-labels"), tlRuler = document.getElementById("tl-ruler"), tlHead = document.getElementById("tl-head"), tlPop = document.getElementById("tl-pop");
const TL_SNAP = 0.05, TL_ROW_H = 28;
try { TL.open = localStorage.getItem("dd-tl-open") !== "0"; } catch(e){}

function tlRender(){
  tlBar.classList.toggle("folded", !TL.open);
  document.getElementById("tl-fold").textContent = t(TL.open ? "tlFoldOpen" : "tlFoldClosed");
  const none = !CAST.actors.length;
  tlBar.classList.toggle("empty", none);
  tlRenderButtons();
  requestAnimationFrame(() => document.getElementById("set-screen").style.setProperty("--tlh", tlBar.offsetHeight + "px"));
  if (!TL.open) return;
  const W = Math.max(100, tlTrack.clientWidth - 12);
  TL.total = Math.max(8, Math.ceil(castTotal() + 2));
  TL.pps = W / TL.total;
  tlRuler.innerHTML = "";
  const step = [0.5, 1, 2, 5, 10, 20, 30, 60].find(s => s * TL.pps >= 45) || 60;
  for (let s = 0; s <= TL.total + 1e-6; s += step){
    const d = document.createElement("div"); d.className = "tl-tick"; d.style.left = (s * TL.pps) + "px"; d.textContent = (step < 1 ? s.toFixed(1) : Math.round(s)) + "s"; tlRuler.appendChild(d);
  }
  tlRows.innerHTML = ""; tlLabels.innerHTML = "";
  const lh = document.createElement("div"); lh.className = "tl-lab-head"; tlLabels.appendChild(lh);
  CAST.actors.forEach((a, ri) => {
    const lab = document.createElement("button"); lab.type = "button"; lab.className = "tl-lab" + (CAST.sel === a.id ? " on" : "");
    lab.innerHTML = "<i></i><span></span>"; lab.querySelector("i").style.background = a.color; lab.querySelector("span").textContent = a.name;
    lab.title = t("tlLabTitle"); lab.addEventListener("click", () => castSelect(a.id)); tlLabels.appendChild(lab);
    const row = document.createElement("div"); row.className = "tl-row" + (CAST.sel === a.id ? " on" : ""); row.dataset.aid = a.id; row.style.top = (ri * TL_ROW_H) + "px";
    a.clips.forEach((c, ci) => {
      const prev = a.clips[ci - 1];
      if (prev && Math.abs(clipEnd(prev) - c.t0) < 0.06){
        const ln = document.createElement("div"); ln.className = "sb-link tl-link"; ln.style.left = (c.t0 * TL.pps) + "px"; ln.style.width = Math.min(CAST_BLEND, clipLen(c)) * TL.pps + "px"; ln.title = t("tlLinkTitle"); row.appendChild(ln);
      }
      const b = document.createElement("div"); b.className = "sb-block tl-clip cat-" + (c.cat || "user") + (CAST.selClip && CAST.selClip.aid === a.id && CAST.selClip.ci === ci ? " sel" : "");
      b.dataset.aid = a.id; b.dataset.ci = ci;
      b.style.left = (c.t0 * TL.pps) + "px"; b.style.width = Math.max(6, clipLen(c) * TL.pps - 1) + "px";
      b.textContent = c.name + ((c.reps || 1) > 1 ? " ×" + c.reps : "") + ((c.speed || 1) !== 1 ? " ⏩" + c.speed : "");
      b.title = c.name + " · " + c.t0.toFixed(2) + "–" + clipEnd(c).toFixed(2) + "s — " + t("tlClipTitle");
      row.appendChild(b);
    });
    tlRows.appendChild(row);
  });
  tlRows.style.height = Math.max(TL_ROW_H, CAST.actors.length * TL_ROW_H) + "px";
  tlHeadRender();
}
function tlHeadRender(){
  tlHead.style.left = (CAST.t * TL.pps) + "px";
  document.getElementById("tl-time").textContent = CAST.t.toFixed(2) + "s / " + castTotal().toFixed(2) + "s";
  document.getElementById("tl-play").textContent = CAST.playing ? t("tlPause") : t("tlPlay");
  document.getElementById("tl-play").classList.toggle("on", CAST.playing);
}
function tlRenderButtons(){
  const C = tlSelClip(), grp = document.getElementById("tl-clip-grp");
  grp.hidden = !C;
  if (C){
    document.getElementById("tl-clip-name").textContent = C.c.name;
    document.getElementById("tl-reps").textContent = C.c.reps || 1;
    document.getElementById("tl-cspeed").value = String(C.c.speed || 1);
    const pb = document.getElementById("tl-path"); pb.classList.toggle("on", TL.pathMode); pb.textContent = t(TL.pathMode ? "tlPathOn" : "tlPath");
    document.getElementById("tl-path-clear").hidden = !(C.c.pts && C.c.pts.length);
    document.getElementById("tl-pt-del").hidden = !CAST.selPt;
  }
  if (!C && TL.pathMode){ TL.pathMode = false; if (typeof pathHintRender === "function") pathHintRender(); }
  const has = CAST.actors.some(a => a.clips.length);
  ["tl-play", "tl-start", "tl-end"].forEach(id => { document.getElementById(id).disabled = !has; });
}
function tlSelClip(){
  const S = CAST.selClip; if (!S) return null;
  const a = castGet(S.aid), c = a && a.clips[S.ci];
  return c ? { a, c, ci: S.ci } : null;
}

function castSetTime(T){
  CAST.t = Math.max(0, Math.min(Math.max(TL.total, castTotal()), T));
  castRender2D(); cast3dSync(); tlHeadRender();
  if (typeof camApply === "function"){ camApply(); camRender2D(); camPanelRender(); }
}
function tlPlay(on){
  const end = castTotal();
  if (on == null) on = !CAST.playing;
  if (on && end <= 0) return;
  if (on && CAST.t >= end - 1e-3) CAST.t = 0;
  CAST.playing = on; TL.last = 0; tlHeadRender();
}
function tlLoop(now){
  requestAnimationFrame(tlLoop);
  if (!CAST.playing) return;
  if (APP.screen !== "set"){ CAST.playing = false; return; }
  const dt = TL.last ? Math.min(0.1, (now - TL.last) / 1000) : 0; TL.last = now;
  const end = castTotal();
  let T = typeof spdAdvance === "function" ? spdAdvance(CAST.t, dt * CAST.speed) : CAST.t + dt * CAST.speed;
  if (T >= end){ T = end; CAST.playing = false; }
  castSetTime(T);
}
requestAnimationFrame(tlLoop);

function castFixOverlaps(a){
  castSortClips(a);
  for (let i = 1; i < a.clips.length; i++){ const pe = clipEnd(a.clips[i - 1]); if (a.clips[i].t0 < pe - 1e-6) a.clips[i].t0 = pe; }
}
function tlTargetActor(){
  if (CAST.sel) return castGet(CAST.sel);
  if (CAST.actors.length === 1) return CAST.actors[0];
  return null;
}
function castAddClip(clip){
  const a = tlTargetActor();
  if (!a){ showToast(t(CAST.actors.length ? "tlPickActor" : "tlNoActor")); return; }
  pushHistory();
  const lastEnd = a.clips.length ? clipEnd(a.clips[a.clips.length - 1]) : 0;
  const t0 = CAST.t > lastEnd + 1e-3 ? Math.round(CAST.t / TL_SNAP) * TL_SNAP : lastEnd;
  a.clips.push(Object.assign({ reps: 1, speed: 1, cat: "user" }, clip, { keys: poseClone(clip.keys), t0 }));
  castSortClips(a);
  castSelect(a.id, { aid: a.id, ci: a.clips.findIndex(c => c.t0 === t0) });
  castSetTime(t0);
  castChanged();
  showToast(t("tlAdded").replace("{m}", clip.name).replace("{a}", a.name));
}
function castAddLib(id){
  const B = libBuild(id); if (!B) return;
  castAddClip({ name: t("lib_" + id), cat: libCatOf(id), lib: id, keys: B.keys, dur: B.dur, loop: B.loop });
  if (CAST_GAIT[id] && CAST.selClip){ TL.pathMode = true; castChanged(); showToast(t("pathStart")); }
}
const pathHint = document.getElementById("path-hint");
function pathHintRender(){
  const C = tlSelClip();
  if (!TL.pathMode || !C){ pathHint.hidden = true; return; }
  const ch = castChain(C.a)[C.ci], none = !(C.c.pts && C.c.pts.length);
  pathHint.hidden = false;
  pathHint.textContent = (none && (ch.gap || C.c.at) ? t("pathHintEnter") : t("pathHint")).replace("{m}", C.c.name).replace("{a}", C.a.name);
}
function tlPathToggle(on){
  if (!tlSelClip()) return;
  TL.pathMode = on == null ? !TL.pathMode : !!on;
  if (TL.pathMode && SETV.view === "3d") setView("split");
  castChanged();
}
function castAddPack(i){ const it = PACK.items[i]; if (it) castAddClip({ name: it.name, cat: "user", keys: it.keys, dur: it.dur, loop: it.loop }); }
function tlEditClip(fn){
  const C = tlSelClip(); if (!C) return;
  pushHistory(); fn(C.c); castFixOverlaps(C.a);
  CAST.selClip = { aid: C.a.id, ci: C.a.clips.indexOf(C.c) };
  castChanged();
}
function tlRemoveClip(){
  const C = tlSelClip(); if (!C) return;
  pushHistory(); C.a.clips.splice(C.ci, 1); CAST.selClip = null;
  castSetTime(CAST.t); castChanged();
  if (typeof undoToastSet === "function") undoToastSet(t("tlClipRemoved").replace("{m}", C.c.name));
}

function tlTimeAt(clientX){ const r = tlTrack.getBoundingClientRect(); return Math.max(0, (clientX - r.left - 6) / TL.pps); }
tlTrack.addEventListener("pointerdown", e => {
  if (e.button !== 0) return;
  e.preventDefault();
  try { tlTrack.setPointerCapture(e.pointerId); } catch(err){}
  const b = e.target.closest(".tl-clip");
  if (b){
    const a = castGet(b.dataset.aid), ci = +b.dataset.ci, c = a && a.clips[ci]; if (!c) return;
    castSelect(a.id, { aid: a.id, ci });
    TL.drag = { a, c, x: e.clientX, o: c.t0, moved: false,
      lo: ci > 0 ? clipEnd(a.clips[ci - 1]) : 0, hi: ci < a.clips.length - 1 ? a.clips[ci + 1].t0 - clipLen(c) : Infinity };
    return;
  }
  const row = e.target.closest(".tl-row");
  if (row && row.dataset.aid !== CAST.sel) castSelect(row.dataset.aid);
  else if (CAST.selClip){ CAST.selClip = null; tlRender(); }
  TL.scrub = true; if (CAST.playing) tlPlay(false);
  castSetTime(tlTimeAt(e.clientX));
});
tlTrack.addEventListener("pointermove", e => {
  if (TL.scrub){ castSetTime(tlTimeAt(e.clientX)); return; }
  const D = TL.drag; if (!D) return;
  const dx = e.clientX - D.x;
  if (!D.moved){ if (Math.abs(dx) < 3) return; D.moved = true; pushHistory(); }
  D.c.t0 = Math.max(D.lo, Math.min(D.hi, Math.round((D.o + dx / TL.pps) / TL_SNAP) * TL_SNAP));
  if (Math.abs(D.c.t0 - D.lo) < 0.12) D.c.t0 = D.lo;
  tlRender(); castSetTime(CAST.t);
});
const tlUp = () => {
  if (TL.drag && TL.drag.moved){ const C = TL.drag; castSortClips(C.a); CAST.selClip = { aid: C.a.id, ci: C.a.clips.indexOf(C.c) }; castChanged(); }
  TL.drag = null; TL.scrub = false;
};
tlTrack.addEventListener("pointerup", tlUp); tlTrack.addEventListener("pointercancel", tlUp);

function tlPopRender(){
  const a = tlTargetActor();
  tlPop.innerHTML = "";
  const head = document.createElement("div"); head.className = "tp-head";
  head.innerHTML = "<b></b><button type='button' class='tp-x'>✕</button>";
  head.querySelector("b").textContent = a ? t("tpHead").replace("{a}", a.name) : t(CAST.actors.length ? "tlPickActor" : "tlNoActor");
  head.querySelector(".tp-x").addEventListener("click", () => { tlPop.hidden = true; });
  tlPop.appendChild(head);
  if (!a) return;
  const sub = document.createElement("div"); sub.className = "tp-sub"; sub.textContent = t("tpSub"); tlPop.appendChild(sub);
  const cols = document.createElement("div"); cols.className = "tp-cols";
  LIB_CATS.forEach(C => {
    const col = document.createElement("div"); col.className = "tp-col";
    const h = document.createElement("div"); h.className = "tp-cat"; h.textContent = C.icon + " " + t("libCat_" + C.id); col.appendChild(h);
    LIB.filter(L => C.groups.includes(L.group)).forEach(L => {
      const b = document.createElement("button"); b.type = "button"; b.className = "tp-item cat-" + C.id; b.textContent = t("lib_" + L.id);
      b.addEventListener("click", () => { tlPop.hidden = true; castAddLib(L.id); }); col.appendChild(b);
    });
    cols.appendChild(col);
  });
  const pc = document.createElement("div"); pc.className = "tp-col";
  const ph = document.createElement("div"); ph.className = "tp-cat"; ph.textContent = "📦 " + t("tpPack") + (PACK.name ? " — " + PACK.name : ""); pc.appendChild(ph);
  if (!PACK.items.length){ const n = document.createElement("div"); n.className = "tp-none"; n.textContent = t("tpPackNone"); pc.appendChild(n); }
  PACK.items.forEach((it, i) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "tp-item cat-user"; b.textContent = it.name;
    b.addEventListener("click", () => { tlPop.hidden = true; castAddPack(i); }); pc.appendChild(b);
  });
  const ob = document.createElement("button"); ob.type = "button"; ob.className = "tp-open c-get"; ob.textContent = t("tpPackOpen");
  ob.addEventListener("click", () => document.getElementById("tl-pack-input").click()); pc.appendChild(ob);
  cols.appendChild(pc);
  tlPop.appendChild(cols);
}
function tlPopToggle(){
  if (!tlPop.hidden){ tlPop.hidden = true; return; }
  tlPopRender(); tlPop.hidden = false;
  const r = document.getElementById("tl-add").getBoundingClientRect(), h = tlPop.offsetHeight, w = tlPop.offsetWidth;
  tlPop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left)) + "px"; tlPop.style.top = Math.max(8, r.top - h - 8) + "px";
}
document.getElementById("tl-add").addEventListener("click", e => { e.stopPropagation(); tlPopToggle(); });
document.addEventListener("pointerdown", e => { if (!tlPop.hidden && !tlPop.contains(e.target) && e.target.id !== "tl-add") tlPop.hidden = true; }, true);
document.getElementById("tl-pack-input").addEventListener("change", e => {
  const files = [...e.target.files]; let left = files.length, n = 0;
  files.forEach(f => readTextFile(f, txt => {
    try { n += packLoadData(JSON.parse(txt), f.name); } catch(err){}
    if (--left === 0){ if (typeof packRender === "function") packRender(); showToast(t("tpPackLoaded").replace("{n}", n)); if (!tlPop.hidden) tlPopRender(); else tlPopToggle(); }
  }));
  e.target.value = "";
});

document.getElementById("tl-fold").addEventListener("click", () => { TL.open = !TL.open; try { localStorage.setItem("dd-tl-open", TL.open ? "1" : "0"); } catch(e){} tlRender(); });
document.getElementById("tl-play").addEventListener("click", () => tlPlay());
document.getElementById("tl-start").addEventListener("click", () => { tlPlay(false); castSetTime(0); });
document.getElementById("tl-end").addEventListener("click", () => { tlPlay(false); castSetTime(castTotal()); });
document.getElementById("tl-speed").addEventListener("change", e => { CAST.speed = +e.target.value || 1; });
document.getElementById("tl-rep-dn").addEventListener("click", () => tlEditClip(c => { c.reps = Math.max(1, (c.reps || 1) - 1); }));
document.getElementById("tl-rep-up").addEventListener("click", () => tlEditClip(c => { c.reps = Math.min(20, (c.reps || 1) + 1); }));
document.getElementById("tl-cspeed").addEventListener("change", e => tlEditClip(c => { c.speed = +e.target.value || 1; }));
document.getElementById("tl-del").addEventListener("click", tlRemoveClip);
document.getElementById("tl-path").addEventListener("click", () => tlPathToggle());
document.getElementById("tl-path-clear").addEventListener("click", () => { castPathClear(); });
document.getElementById("tl-pt-del").addEventListener("click", () => castPathRemovePt());
const sceneNameIn = document.getElementById("scene-name");
sceneNameIn.addEventListener("input", () => { CAST.sceneName = sceneNameIn.value; });
sceneNameIn.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Enter") sceneNameIn.blur(); });
document.getElementById("scene-save").addEventListener("click", sceneSave);
document.getElementById("scene-open").addEventListener("click", () => document.getElementById("scene-input").click());
document.getElementById("scene-input").addEventListener("change", e => {
  const f = e.target.files[0]; if (!f) return;
  readTextFile(f, txt => {
    let ok = false; try { ok = castLoadObj(JSON.parse(txt)); } catch(err){}
    if (ok){ CAST.savedSig = castSig(); fileCard("scene", f.name, sceneDetail(), true); } else showToast(t("sceneBad"));
  });
  e.target.value = "";
});

window.addEventListener("keydown", e => {
  if (APP.screen !== "set" || typingNow()) return;
  if ((e.code === "KeyP" || e.key.toLowerCase() === "p") && !e.ctrlKey && !e.metaKey){ e.preventDefault(); tlPlay(); return; }
  if (TL.pathMode && e.key === "Escape" && !CAST.selPt){ e.preventDefault(); e.stopImmediatePropagation(); tlPathToggle(false); return; }
  if (!CAST.selClip || (typeof SETM !== "undefined" && (SETM.sel || SETM.editing))) return;
  if (e.code === "Delete" || e.code === "Backspace" || e.key === "Delete"){ e.preventDefault(); e.stopImmediatePropagation(); if (CAST.selPt) castPathRemovePt(); else tlRemoveClip(); }
  else if (e.key === "Escape"){ if (CAST.selPt){ CAST.selPt = null; castChanged(); } else { CAST.selClip = null; tlRender(); } }
}, true);

spaceTapRegister(() => {
  if (APP.screen !== "set") return false;
  if ((typeof PV !== "undefined" && PV.on) || (typeof REC !== "undefined" && REC.on) || (typeof camMode !== "undefined" && camMode === "drone")) return true;
  tlPlay(); return true;
});
if (window.ResizeObserver) new ResizeObserver(() => { if (TL.open) tlRender(); }).observe(tlTrack);
onLangChange(tlRender);
setInterval(() => {
  if (APP.screen !== "set") return;
  const b = document.getElementById("scene-save"), d = CAST.actors.length > 0 && CAST.savedSig !== castSig();
  b.classList.toggle("dirty", d);
}, 600);
tlRender();
