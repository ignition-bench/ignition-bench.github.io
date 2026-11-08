"use strict";

const STRIP_GAP = 0.25;
const STRIP = { clips: [], sel: -1, tool: "select" };
const stripOn = () => STRIP.clips.length > 0;
function libCatOf(id){ const L = LIB_BY[id]; if (!L) return "user"; const C = LIB_CATS.find(c => c.groups.includes(L.group)); return C ? C.id : "user"; }

function stripDrop(){ if (!STRIP.clips.length) return; STRIP.clips = []; STRIP.sel = -1; stripRender(); }

function stripAdd(clip){
  motionPlay(false); pushPoseUndo();
  if (!stripOn() && MOT.keys.length){
    STRIP.clips.push({ name: MOT.name.trim() || t("stripCurrent"), cat: "user", keys: poseClone(MOT.keys), dur: MOT.dur, loop: MOT.loop, reps: 1, speed: 1 });
  }
  STRIP.clips.push(Object.assign({ reps: 1, speed: 1 }, clip, { keys: poseClone(clip.keys) }));
  STRIP.sel = STRIP.clips.length - 1;
  if (!MOT.name.trim() || /\((기본|basic)\)$/.test(MOT.name)) motionSetName(t("stripName"));
  stripCompile(true);
  showToastA(t("stripAdded").replace("{name}", clip.name));
}
function stripAddLib(id){ const B = libBuild(id); if (B) stripAdd({ name: t("lib_" + id), cat: libCatOf(id), keys: B.keys, dur: B.dur, loop: B.loop }); }
function stripAddPack(i){ const it = PACK.items[i]; if (it) stripAdd({ name: it.name, cat: "user", keys: it.keys, dur: it.dur, loop: it.loop }); }

function stripCompile(toStart){
  const keys = []; let t0 = 0;
  STRIP.clips.forEach((c, ci) => {
    const joined = ci > 0 && c.joinOf && STRIP.clips[ci - 1].uid === c.joinOf;
    if (ci > 0 && !joined) t0 += STRIP_GAP;
    const sc = 1 / (c.speed || 1), len = c.dur * sc, ks = c.keys.slice().sort((a, b) => a.t - b.t);
    c._t0 = t0;
    for (let r = 0; r < (c.reps || 1); r++){
      if (r > 0 && !c.loop) t0 += STRIP_GAP;
      ks.forEach(k => {
        if (r > 0 && c.loop && k.t < 1e-6) return;
        if (r === 0 && joined && k.t < 1e-6) return;
        keys.push({ t: +(t0 + k.t * sc).toFixed(5), ease: k.ease, pose: poseClone(k.pose), ci });
      });
      t0 += len;
    }
    c._t1 = t0;
  });
  MOT.keys = keys; MOT.dur = Math.max(0.1, t0); MOT.loop = false; MOT.selKey = null;
  STRIP._keysCi = keys.map(k => k.ci); keys.forEach(k => delete k.ci);
  motionLinkEndsCheck(); motionRenderAll();
  motionSeek(toStart ? 0 : Math.min(MOT.cur, MOT.dur));
  stripRender();
}
function stripCut(i, tt){
  const c = STRIP.clips[i]; if (!c) return;
  if (tt - c._t0 < 0.06 || c._t1 - tt < 0.06){ showToastA(t("stripCutEdge")); return; }
  const mine = MOT.keys.filter((k, n) => STRIP._keysCi[n] === i);
  const cutPose = motSample(tt);
  const front = mine.filter(k => k.t < tt - 1e-4).map(k => ({ t: k.t - c._t0, ease: k.ease, pose: poseClone(k.pose) }));
  front.push({ t: tt - c._t0, ease: "smooth", pose: poseClone(cutPose) });
  const back = [{ t: 0, ease: front.length > 1 ? front[front.length - 2].ease : "smooth", pose: poseClone(cutPose) }]
    .concat(mine.filter(k => k.t > tt + 1e-4).map(k => ({ t: k.t - tt, ease: k.ease, pose: poseClone(k.pose) })));
  motionPlay(false); pushPoseUndo();
  const base = c.name.replace(/ \((앞|뒤|A|B)\)$/, "");
  const uid = () => "c" + Math.random().toString(36).slice(2, 9);
  const A = { uid: uid(), joinOf: c.joinOf, name: base + t("stripCutFront"), cat: c.cat, keys: front, dur: tt - c._t0, loop: false, reps: 1, speed: 1 };
  const B = { uid: uid(), joinOf: A.uid, name: base + t("stripCutBack"), cat: c.cat, keys: back, dur: c._t1 - tt, loop: false, reps: 1, speed: 1 };
  STRIP.clips.splice(i, 1, A, B); STRIP.sel = i + 1;
  stripCompile(false); stripSetTool("select"); motionSeek(STRIP.clips[i + 1]._t0);
  showToastA(t("stripCutToast"));
}
function stripSetTool(tool){
  STRIP.tool = tool;
  document.getElementById("strip-tool-select").classList.toggle("on", tool === "select");
  const cb = document.getElementById("strip-tool-cut"); if (cb) cb.classList.toggle("on", tool === "cut");
  document.getElementById("mot-strip").classList.toggle("tool-cut", tool === "cut");
  const cl = document.getElementById("strip-cutline"); if (cl && tool !== "cut") cl.hidden = true;
}
function stripRemoveSel(){
  if (STRIP.sel < 0 || !stripOn()) return;
  motionPlay(false); pushPoseUndo(); STRIP.clips.splice(STRIP.sel, 1); STRIP.sel = Math.min(STRIP.sel, STRIP.clips.length - 1);
  if (stripOn()) stripCompile(false); else { MOT.keys = []; MOT.dur = 2; motionRenderAll(); motionSeek(0); stripRender(); }
  undoToast("undoToastDeleted");
}

function stripBake(){
  if (!stripOn()) return;
  pushPoseUndo(); STRIP.clips = []; STRIP.sel = -1; stripRender(); motionRenderAll();
  showToastA(t("stripBaked"));
}
function stripClear(){
  if (!stripOn()) return;
  motionPlay(false); pushPoseUndo(); STRIP.clips = []; STRIP.sel = -1;
  MOT.keys = []; MOT.selKey = null; MOT.dur = 2; motionRenderAll(); motionSeek(0); stripRender();
  undoToast("undoToastCleared");
}
function stripLocked(){
  if (!stripOn()) return false;
  if (STRIP._warn == null || performance.now() - STRIP._warn > 5000){ STRIP._warn = performance.now(); showToastA(t("stripLockedToast"), 5000); }
  return true;
}
function stripEdit(fn){ const c = STRIP.clips[STRIP.sel]; if (!c) return; motionPlay(false); pushPoseUndo(); fn(c); stripCompile(false); }
function stripMove(from, to){
  if (from === to || from < 0 || to < 0 || from >= STRIP.clips.length || to >= STRIP.clips.length) return;
  motionPlay(false); pushPoseUndo();
  const [c] = STRIP.clips.splice(from, 1); STRIP.clips.splice(to, 0, c); STRIP.sel = to; stripCompile(false);
}

function stripRender(){
  const bar = document.getElementById("strip-bar"), row = document.getElementById("mot-strip"); if (!bar) return;
  bar.hidden = row.hidden = !stripOn();
  document.getElementById("motion-bar").classList.toggle("has-strip", stripOn());
  const lk = document.getElementById("mot-lock"); if (lk) lk.hidden = !stripOn();
  if (!stripOn()) return;
  if (STRIP.sel >= STRIP.clips.length) STRIP.sel = STRIP.clips.length - 1;
  const box = document.getElementById("strip-blocks"); box.innerHTML = "";
  STRIP.clips.forEach((c, i) => {
    const b = document.createElement("div");
    b.className = "sb-block cat-" + c.cat + (i === STRIP.sel ? " sel" : "");
    b.dataset.i = i;
    b.style.left = (c._t0 / MOT.dur * 100) + "%"; b.style.width = ((c._t1 - c._t0) / MOT.dur * 100) + "%";
    b.textContent = c.name + (c.reps > 1 ? " ×" + c.reps : "") + (c.speed !== 1 ? " · " + c.speed + "배" : "");
    b.title = c.name + " — " + (c._t1 - c._t0).toFixed(2) + "s";
    box.appendChild(b);
    if (i > 0){
      const p = STRIP.clips[i - 1], g = c._t0 - p._t1;
      if (g > 1e-4){
        const l = document.createElement("div"); l.className = "sb-link";
        l.style.left = (p._t1 / MOT.dur * 100) + "%"; l.style.width = (g / MOT.dur * 100) + "%";
        l.title = t("stripLinkTitle").replace("{s}", g.toFixed(2));
        box.appendChild(l);
      }
    }
  });
  const c = STRIP.clips[STRIP.sel];
  document.getElementById("strip-sel").textContent = c ? "▸ " + c.name : t("stripPick");
  document.getElementById("strip-reps").textContent = c ? c.reps : "-";
  const sp = document.getElementById("strip-speed"); if (c) sp.value = String(c.speed);
  ["strip-rep-dn", "strip-rep-up", "strip-speed", "strip-left", "strip-right", "strip-remove"].forEach(id => document.getElementById(id).disabled = !c);
}
function stripBindUI(){
  const $ = id => document.getElementById(id);
  $("strip-rep-dn").addEventListener("click", () => stripEdit(c => c.reps = Math.max(1, c.reps - 1)));
  $("strip-rep-up").addEventListener("click", () => stripEdit(c => c.reps = Math.min(20, c.reps + 1)));
  $("strip-speed").addEventListener("change", e => stripEdit(c => c.speed = +e.target.value));
  $("strip-left").addEventListener("click", () => stripMove(STRIP.sel, STRIP.sel - 1));
  $("strip-right").addEventListener("click", () => stripMove(STRIP.sel, STRIP.sel + 1));
  $("strip-remove").addEventListener("click", stripRemoveSel);
  $("strip-tool-select").addEventListener("click", () => stripSetTool("select"));
  window.addEventListener("keydown", e => {
    if (APP.screen !== "actor" || !stripOn() || e.ctrlKey || e.metaKey || e.altKey) return;
    const a = document.activeElement; if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT")) return;
    if (e.code === "KeyV"){ e.preventDefault(); stripSetTool("select"); }
    else if (e.code === "Delete" || e.code === "Backspace" || e.key === "Delete"){ if (STRIP.sel >= 0){ e.preventDefault(); stripRemoveSel(); } }
  });
  $("strip-bake").addEventListener("click", stripBake);
  $("mot-lock").addEventListener("click", stripBake);
  $("strip-clear").addEventListener("click", () => { stripClear(); });
  const row = $("mot-strip"), drop = $("strip-drop"); let drag = null;
  const indexAt = x => { const r = row.getBoundingClientRect(), tt = (x - r.left) / r.width * MOT.dur; let i = 0;
    STRIP.clips.forEach((c, k) => { if (tt > (c._t0 + c._t1) / 2) i = k + 1; }); return i; };
  const timeAt = x => { const r = row.getBoundingClientRect(); return Math.max(0, Math.min(1, (x - r.left) / r.width)) * MOT.dur; };
  row.addEventListener("pointerdown", e => {
    const b = e.target.closest(".sb-block"); if (!b) return;
    motionPlay(false);
    const i = +b.dataset.i; STRIP.sel = i; drag = { i, x0: e.clientX, moved: false };
    motionSeek(STRIP.clips[i]._t0); stripRender(); row.setPointerCapture(e.pointerId); e.preventDefault();
  });
  row.addEventListener("pointermove", e => {
    if (!drag) return;
    if (!drag.moved && Math.abs(e.clientX - drag.x0) < 5) return;
    drag.moved = true;
    const at = indexAt(e.clientX), r = row.getBoundingClientRect();
    const tt = at >= STRIP.clips.length ? MOT.dur : STRIP.clips[at]._t0;
    drop.hidden = false; drop.style.left = (tt / MOT.dur * 100) + "%";
    drag.to = at;
  });
  const up = () => {
    if (!drag) return; drop.hidden = true;
    if (drag.moved && drag.to != null){ let to = drag.to; if (to > drag.i) to--; stripMove(drag.i, Math.max(0, Math.min(STRIP.clips.length - 1, to))); }
    drag = null;
  };
  row.addEventListener("pointerup", up); row.addEventListener("pointercancel", up);
}

const MIRROR_NEG = { spine: ["side", "twist"], chest: ["side", "twist"], neck: ["side"], head: ["turn"] };
function mirrorPose(p){
  const q = poseClone(p);
  for (const id in p.j){
    if (/L$/.test(id)){ const r = id.replace(/L$/, "R"); q.j[id] = { ...p.j[r] }; q.j[r] = { ...p.j[id] }; }
  }
  for (const id in MIRROR_NEG) for (const k of MIRROR_NEG[id]) if (q.j[id] && k in q.j[id]) q.j[id][k] = -p.j[id][k];
  q.root.x = -p.root.x; q.root.yaw = -p.root.yaw; q.root.roll = -p.root.roll;
  return q;
}
function motionMirror(){
  motionPlay(false); pushPoseUndo();
  if (stripOn()){ STRIP.clips.forEach(c => c.keys.forEach(k => k.pose = mirrorPose(k.pose))); stripCompile(false); }
  else if (MOT.keys.length){ MOT.keys.forEach(k => k.pose = mirrorPose(k.pose)); MOT.applying = true; ACT.pose = motSample(MOT.cur); actorRefresh(); MOT.applying = false; motionRenderAll(); }
  else { ACT.pose = mirrorPose(ACT.pose); actorRefresh(); }
  showToastA(t("mirrorToast"));
}

function actorViewPreset(kind){
  if (!ACT.inited) return;
  const x = ACT.pose.root.x, z = ACT.pose.root.z, T = ACT.orbit.target;
  ACT.viewKind = kind;
  T.set(x, 0.85, z);
  if (kind === "front") ACT.cam.position.set(x, 1.1, z + 4.0);
  else if (kind === "side") ACT.cam.position.set(x + 4.0, 1.1, z);
  else ACT.cam.position.set(x, 5.2, z + 0.01);
  ACT.orbit.update();
  if (typeof RIG2D !== "undefined" && RIG2D.on) rig2dSetPlane(kind);
}
document.getElementById("view-front").addEventListener("click", () => actorViewPreset("front"));
document.getElementById("view-side").addEventListener("click", () => actorViewPreset("side"));
document.getElementById("view-top").addEventListener("click", () => actorViewPreset("top"));
document.getElementById("mot-mirror").addEventListener("click", motionMirror);
onLangChange(() => stripRender());
