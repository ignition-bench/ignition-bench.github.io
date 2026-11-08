"use strict";

const MOTION_FILE_NAME = "directors-desk-motion.json";
const MOT_SNAP = 1/60;
const MOT_EASES = ["smooth", "linear", "step"];
const MOT = { name: "", keys: [], dur: 2, cur: 0, playing: false, loop: true, speed: 1, onion: true, selKey: null, applying: false, ghosts: null, ui: null };

const motEq = (a, b) => Math.abs(a - b) < 1e-4;
function motKeyAt(t){ return MOT.keys.find(k => motEq(k.t, t)) || null; }
function motSort(){ MOT.keys.sort((a, b) => a.t - b.t); }
function motWraps(K, dur, loop){
  if (!K){ K = MOT.keys; dur = MOT.dur; loop = MOT.loop; }
  const n = K.length;
  if (K !== MOT.keys && K._wrapSig === dur + "/" + loop) return K._wrap;
  const w = loop && n >= 3 && motEq(K[0].t, 0) && motEq(K[n-1].t, dur) && JSON.stringify(K[0].pose) === JSON.stringify(K[n-1].pose);
  if (K !== MOT.keys){ K._wrap = w; K._wrapSig = dur + "/" + loop; }
  return w;
}
function motEach(p, fn){
  for (const k in p.root) fn(p.root, k, null);
  for (const id in p.j) for (const k in p.j[id]) fn(p.j[id], k, id);
}
function motSample(t){ return motSampleOf(MOT.keys, MOT.dur, MOT.loop, t); }
function motSampleOf(K, DUR, LOOP, t){
  const n = K.length;
  if (!n) return null;
  if (t <= K[0].t) return poseClone(K[0].pose);
  if (t >= K[n-1].t) return poseClone(K[n-1].pose);
  let i = 0; while (i < n - 1 && K[i+1].t <= t) i++;
  const a = K[i], b = K[i+1], u = (t - a.t) / (b.t - a.t || 1);
  if (a.ease === "step") return poseClone(a.pose);
  const out = poseClone(a.pose);
  if (a.ease === "linear"){
    motEach(out, (o, k, id) => { const bv = id ? b.pose.j[id][k] : b.pose.root[k]; o[k] = o[k] + (bv - o[k]) * u; });
    return out;
  }
  const wrap = motWraps(K, DUR, LOOP);
  let pv = K[i-1], pt = pv && pv.t, nx = K[i+2], nt = nx && nx.t;
  if (!pv && wrap){ pv = K[n-2]; pt = pv.t - DUR; }
  if (!nx && wrap){ nx = K[1]; nt = nx.t + DUR; }
  const h = b.t - a.t, u2 = u*u, u3 = u2*u;
  const h00 = 2*u3 - 3*u2 + 1, h10 = u3 - 2*u2 + u, h01 = -2*u3 + 3*u2, h11 = u3 - u2;
  const val = (P, k, id) => id ? P.pose.j[id][k] : P.pose.root[k];
  motEach(out, (o, k, id) => {
    const va = val(a, k, id), vb = val(b, k, id);
    const ma = pv ? (vb - val(pv, k, id)) / (b.t - pt) * h : 0;
    const mb = nx ? (val(nx, k, id) - va) / (nt - a.t) * h : 0;
    let v = h00*va + h10*ma + h01*vb + h11*mb;
    v = Math.max(Math.min(va, vb), Math.min(Math.max(va, vb), v));
    if (id){ const d = SK[id].dof.find(x => x.key === k); if (d) v = clampDof(d, v); }
    o[k] = v;
  });
  return out;
}

function motionPoseChanged(){
  if (MOT.applying || MOT.playing) return;
  const s = JSON.stringify(ACT.pose);
  if (!MOT.keys.length){
    if (MOT._seen && MOT._seen !== s && MOT.cur > 1e-3 && (MOT._warnT == null || performance.now() - MOT._warnT > 4000)){ MOT._warnT = performance.now(); showToastA(t("motNeedFirstKey")); }
    MOT._seen = s; return;
  }
  if (typeof stripOn === "function" && stripOn()){ if (JSON.stringify(motSample(MOT.cur)) !== s) stripLocked(); return; }
  let k = motKeyAt(MOT.cur);
  if (k){ if (JSON.stringify(k.pose) === s) return; k.pose = JSON.parse(s); }
  else {
    if (JSON.stringify(motSample(MOT.cur)) === s) return;
    k = { t: MOT.cur, ease: "smooth", pose: JSON.parse(s) }; MOT.keys.push(k); motSort();
  }
  const K = MOT.keys, n = K.length;
  if (MOT.loop && n >= 2 && motEq(K[0].t, 0) && motEq(K[n-1].t, MOT.dur) && MOT.linkEnds){
    if (k === K[0]) K[n-1].pose = poseClone(k.pose); else if (k === K[n-1]) K[0].pose = poseClone(k.pose);
  }
  MOT.selKey = k;
  motionRenderTrack(); motionGhosts();
}

function motionSeek(t, keepPose){
  MOT.cur = Math.max(0, Math.min(MOT.dur, t));
  if (!MOT.keys.length) MOT._seen = JSON.stringify(ACT.pose);
  if (MOT.keys.length && !keepPose){
    MOT.applying = true; ACT.pose = motSample(MOT.cur); actorRefresh(); MOT.applying = false;
  }
  motionLinkEndsCheck();
  motionRenderHead(); motionGhosts(); motionRenderKeyUI();
}
function motionLinkEndsCheck(){ MOT.linkEnds = motWraps(); }
function motionTick(dt){
  if (!MOT.playing) return;
  let t = MOT.cur + dt * MOT.speed;
  if (t >= MOT.dur){ if (MOT.loop && MOT.dur > 0) t = t % MOT.dur; else { t = MOT.dur; motionPlay(false); } }
  motionSeek(t);
}
function motionPlay(on){
  if (on && !MOT.keys.length){ showToastA(t("motNoKeys")); on = false; }
  if (on && !MOT.loop && MOT.cur >= MOT.dur - 1e-4) MOT.cur = 0;
  MOT.playing = !!on; MOT._last = performance.now();
  if (MOT.playing && typeof flowFlag === "function") flowFlag("played");
  const b = MOT.ui && MOT.ui.play; if (b){ b.textContent = MOT.playing ? "⏸ (Space)" : "▶ (Space)"; b.title = t(MOT.playing ? "motPause" : "motPlay"); }
  motionGhosts();
}

function motionInsertKey(){
  if (stripLocked()) return;
  pushPoseUndo();
  let k = motKeyAt(MOT.cur);
  if (k) k.pose = poseClone(ACT.pose);
  else { k = { t: MOT.cur, ease: "smooth", pose: poseClone(ACT.pose) }; MOT.keys.push(k); motSort(); }
  MOT.selKey = k; motionLinkEndsCheck();
  motionRenderTrack(); motionGhosts(); motionRenderKeyUI();
  showToastA(t("motKeyAdded") + " " + motFmt(k.t));
}
function motionDeleteKey(){
  const k = MOT.selKey; if (!k || stripLocked()) return;
  pushPoseUndo();
  MOT.keys = MOT.keys.filter(x => x !== k); MOT.selKey = null; undoToast("undoToastDeleted");
  motionSeek(MOT.cur);
  motionRenderTrack();
}
function motionDupKey(){
  const k = MOT.selKey; if (!k || stripLocked()) return;
  if (motKeyAt(MOT.cur)){ showToastA(t("motDupHint")); return; }
  pushPoseUndo();
  const c = { t: MOT.cur, ease: k.ease, pose: poseClone(k.pose) };
  MOT.keys.push(c); motSort(); MOT.selKey = c;
  motionSeek(MOT.cur); motionRenderTrack();
}
function motionClearKeys(){
  const had = MOT.keys.length;
  motionPlay(false); pushPoseUndo(); MOT.keys = []; MOT.selKey = null; motionPlay(false); stripDrop();
  if (had) undoToast("undoToastCleared");
  motionRenderTrack(); motionGhosts(); motionRenderKeyUI();
}
function motionSetDur(d, stretch){
  d = Math.max(0.1, Math.min(60, +d || MOT.dur));
  if (Math.abs(d - MOT.dur) < 1e-6) return;
  if (stripLocked()){ motionRenderKeyUI(); return; }
  pushPoseUndo();
  const f = d / MOT.dur;
  if (stretch) MOT.keys.forEach(k => k.t *= f);
  else {
    const out = MOT.keys.filter(k => k.t > d + 1e-6);
    if (out.length){
      const last = out[out.length - 1];
      MOT.keys = MOT.keys.filter(k => k.t <= d + 1e-6 || k === last);
      if (motKeyAt(d)) MOT.keys = MOT.keys.filter(k => k !== last); else last.t = d;
      if (!MOT.keys.includes(MOT.selKey)) MOT.selKey = null;
    }
  }
  MOT.dur = d; motSort();
  motionSeek(stretch ? MOT.cur * f : MOT.cur);
  motionRenderTrack();
}

const MOT_GAITS = {
  walk: { dist: 1.25, speed: 4.2,       stride: 0.30, lift: 0.11, bob: 0.020, lean: 0,    arm: 22, elbow: 14, elbowSwing: 8 },
  fastwalk: { dist: 3.0,  speed: 4.2 * 1.6, stride: 0.52, lift: 0.28, bob: 0.055, lean: 0.12, arm: 45, elbow: 85, elbowSwing: 15 },
};
function motBakeGait(kind){
  const G = MOT_GAITS[kind], T = G.dist / G.speed, N = 8, keys = [];
  const legLen = SK_BODY.thigh + SK_BODY.shin, drop = (SK_BODY.ankleY + legLen * (1 - 0.25 * 0.12)) - SK_BODY.hipY;
  const leanDeg = Math.atan2(G.lean, 0.4) * 180 / Math.PI;
  const fk = {};
  for (let i = 0; i <= N; i++){
    if (i === N){ keys.push({ t: T, ease: "smooth", pose: poseClone(keys[0].pose) }); break; }
    const ph = Math.PI * 2 * i / N, p = POSE_PRESETS.stand();
    p.root.y = drop - Math.abs(Math.sin(ph)) * G.bob;
    p.j.spine.flex = leanDeg * 0.5; p.j.chest.flex = leanDeg * 0.5; p.j.head.nod = -leanDeg * 0.6;
    for (const [s, x, phs] of [["L", 0.11, ph], ["R", -0.11, ph + Math.PI]]){
      const tgt = new THREE.Vector3(x, SK_BODY.ankleY + Math.max(0, Math.cos(phs)) * G.lift, Math.sin(phs) * G.stride);
      p.j["knee"+s].flex = 10;
      ikSolve(p, "ankle"+s, tgt, 80);
      const A = SK["ankle"+s].dof.find(d => d.key === "lift");
      for (let it = 0; it < 6; it++){
        skFK(p, fk);
        const dy = fk["toe"+s].pos.y - fk["ankle"+s].pos.y + 0.03;
        if (Math.abs(dy) < 0.002) break;
        const v0 = p.j["ankle"+s].lift; p.j["ankle"+s].lift = v0 + 1; skFK(p, fk);
        const dy1 = fk["toe"+s].pos.y - fk["ankle"+s].pos.y + 0.03, g = dy1 - dy;
        p.j["ankle"+s].lift = Math.abs(g) < 1e-6 ? v0 : clampDof(A, v0 - dy / g);
      }
      p.j["shoulder"+s].flex = -Math.sin(phs) * G.arm;
      p.j["elbow"+s].flex = G.elbow + Math.max(0, -Math.sin(phs)) * G.elbowSwing;
    }
    motSoftClamp(p);
    keys.push({ t: T * i / N, ease: "smooth", pose: p });
  }
  return { keys, dur: T };
}
function motSoftClamp(p){
  for (const id in p.j) for (const d of SK[id].dof){ const v = p.j[id][d.key]; if (v > 0 && d.max > 0) p.j[id][d.key] = Math.min(v, d.max * 0.92); if (v < 0 && d.min < 0) p.j[id][d.key] = Math.max(v, d.min * 0.92); }
  return p;
}
const MOT_RUN_T = 0.72;
const MOT_RUN_FOOT = [
  [0, 0.20, 0.05], [0.125, 0.02, 0.05], [0.25, -0.18, 0.05], [0.375, -0.38, 0.13], [0.5, -0.30, 0.40],
  [0.625, -0.04, 0.44], [0.75, 0.17, 0.34], [0.875, 0.28, 0.17] ];
function motBakeRun(){
  const N = 8, keys = [], fk = {};
  const footAt = s => MOT_RUN_FOOT[Math.round(((s % 1) + 1) % 1 * N) % N];
  for (let i = 0; i <= N; i++){
    if (i === N){ keys.push({ t: MOT_RUN_T, ease: "smooth", pose: poseClone(keys[0].pose) }); break; }
    const sL = i / N, p = POSE_PRESETS.stand();
    p.root.y = -0.05 + 0.04 * Math.cos(4 * Math.PI * (sL - 0.425));
    p.j.spine.flex = 6; p.j.chest.flex = 5; p.j.head.nod = -8;
    for (const [s, x, side] of [["L", 0.10, sL], ["R", -0.10, sL + 0.5]]){
      const [, z, y] = footAt(side), swing = y > 0.06;
      p.j["knee"+s].flex = swing ? 60 : 25; p.j["hip"+s].flex = z > 0 ? 25 : -5;
      ikSolve(p, "ankle"+s, new THREE.Vector3(x, y, z), 100);
      const toeDrop = (z < -0.3 && swing) ? 0.10 : 0.03, A = SK["ankle"+s].dof.find(d => d.key === "lift");
      for (let it = 0; it < 8; it++){
        skFK(p, fk); const dy = fk["toe"+s].pos.y - fk["ankle"+s].pos.y + toeDrop; if (Math.abs(dy) < 0.002) break;
        const v0 = p.j["ankle"+s].lift; p.j["ankle"+s].lift = v0 + 1; skFK(p, fk);
        const g = (fk["toe"+s].pos.y - fk["ankle"+s].pos.y + toeDrop) - dy; p.j["ankle"+s].lift = Math.abs(g) < 1e-6 ? v0 : clampDof(A, v0 - dy / g);
      }
      const fwd = -Math.max(-1, Math.min(1, z / 0.32));
      p.j["shoulder"+s].flex = fwd * 50; p.j["shoulder"+s].abd = 8;
      p.j["elbow"+s].flex = 85 + Math.max(0, fwd) * 20;
    }
    motSoftClamp(p);
    keys.push({ t: MOT_RUN_T * i / N, ease: "smooth", pose: p });
  }
  return { keys, dur: MOT_RUN_T };
}
const MOT_EXAMPLES = ["wave", "walk", "fastwalk", "run"];
function motExample(kind){
  return kind === "wave" ? motExampleWave() : kind === "run" ? motBakeRun() : MOT_GAITS[kind] ? motBakeGait(kind) : null;
}
function motionPreset(kind){
  if (kind === "clear"){ if (MOT.keys.length) motionClearKeys(); return; }
  if (kind === "all"){ packAddExamples(); return; }
  const B = motExample(kind); if (!B) return;
  motionPlay(false); pushPoseUndo(); stripDrop();
  MOT.keys = B.keys; MOT.dur = B.dur; MOT.loop = kind !== "wave"; MOT.selKey = null;
  motionSetName(t("ex_" + kind));
  motionLinkEndsCheck(); motionRenderAll(); motionSeek(0);
  showToastA(t("exToast_" + kind));
}
function packAddExamples(){
  if (!PACK.name) PACK.name = t("exPackName");
  MOT_EXAMPLES.forEach(k => { const B = motExample(k); packPut({ name: t("ex_" + k), dur: B.dur, loop: k !== "wave", keys: B.keys }); });
  packToggle(true); packRender();
  showToastA(t("exAllToast").replace("{n}", MOT_EXAMPLES.length));
}

function motionSnap(){ return { keys: MOT.keys, dur: MOT.dur, loop: MOT.loop, name: MOT.name, strip: typeof STRIP !== "undefined" ? STRIP.clips : [], stripSel: typeof STRIP !== "undefined" ? STRIP.sel : -1 }; }
function motionRestore(m){
  if (!m) return;
  MOT.keys = m.keys.map(k => ({ t: k.t, ease: k.ease, pose: k.pose })); MOT.dur = m.dur; MOT.loop = m.loop;
  if (typeof m.name === "string") motionSetName(m.name);
  if (typeof STRIP !== "undefined"){ STRIP.clips = m.strip || []; STRIP.sel = m.stripSel != null ? m.stripSel : -1; stripRender(); }
  MOT.selKey = MOT.keys.find(k => motEq(k.t, MOT.cur)) || null;
  MOT.cur = Math.min(MOT.cur, MOT.dur); motionLinkEndsCheck();
  motionRenderAll();
}
function motionToObj(){
  return { kind: "dd-motion", version: 1, about: FILE_ABOUT.motion, name: MOT.name || "", skeleton: "dd-human-19", body: SK_BODY, freeRange: SK_FREE,
    duration: +MOT.dur.toFixed(4), loop: MOT.loop, keys: MOT.keys.map(k => ({ t: +k.t.toFixed(4), ease: k.ease, pose: k.pose })) };
}
function motionToJson(){ return JSON.stringify(motionToObj(), null, 1); }
const motionSig = () => JSON.stringify([MOT.name, MOT.dur, MOT.loop, MOT.keys]);
const safeFileName = s => String(s).replace(/[\\/:*?"<>|]/g, "_").trim().slice(0, 60);
function motionFileName(){ return MOT.name.trim() ? safeFileName(MOT.name) + ".motion.json" : MOTION_FILE_NAME; }
function motionDetail(keys, dur){ return t("sumKeys") + " " + keys.length + " · " + (+dur).toFixed(2) + "s"; }
function motionSetName(n){ MOT.name = n || ""; if (MOT.ui && document.activeElement !== MOT.ui.name) MOT.ui.name.value = MOT.name; }
function motionLoadJson(text){
  const data = typeof text === "string" ? JSON.parse(text) : text;
  if (!data || data.kind !== "dd-motion" || !Array.isArray(data.keys)) throw new Error("not a motion");
  if (typeof data.freeRange === "boolean") setFreeRange(data.freeRange);
  pushPoseUndo(); stripDrop();
  MOT.keys = data.keys.filter(k => k && isFinite(+k.t)).map(k => ({ t: +k.t, ease: MOT_EASES.includes(k.ease) ? k.ease : "smooth", pose: poseNormalize(k.pose) }));
  motSort();
  MOT.dur = Math.max(0.1, +data.duration || (MOT.keys.length ? MOT.keys[MOT.keys.length-1].t : 2));
  MOT.loop = data.loop !== false; MOT.selKey = null; motionPlay(false);
  motionSetName(data.name || "");
  motionLinkEndsCheck(); motionRenderAll(); motionSeek(0);
}

function motionGhosts(){
  const G = MOT.ghosts; if (!G) return;
  let prev = null, next = null;
  if (MOT.onion && !MOT.playing) for (const k of MOT.keys){
    if (k.t < MOT.cur - 1e-4) prev = k;
    else if (k.t > MOT.cur + 1e-4 && !next) next = k;
  }
  for (const [g, k] of [[G.prev, prev], [G.next, next]]){
    g.group.visible = !!k;
    if (k){ skFK(k.pose, g.fk); figUpdateGhost(g, g.fk); }
  }
}

const motFmt = s => s.toFixed(2) + "s";
function motionBuildUI(){
  const box = document.getElementById("motion-bar");
  const $ = id => document.getElementById(id);
  MOT.ui = { box, track: $("mot-track"), keys: $("mot-keys"), head: $("mot-head"), ruler: $("mot-ruler"), time: $("mot-time"),
    play: $("mot-play"), loop: $("mot-loop"), speed: $("mot-speed"), ease: $("mot-ease"), dur: $("mot-dur"), stretch: $("mot-stretch"),
    onion: $("mot-onion"), add: $("mot-add"), dup: $("mot-dup"), del: $("mot-del"), name: $("mot-name") };
  const U = MOT.ui;
  U.play.addEventListener("click", () => motionPlay(!MOT.playing));
  $("mot-start").addEventListener("click", () => { motionPlay(false); motionSeek(0); });
  $("mot-end").addEventListener("click", () => { motionPlay(false); motionSeek(MOT.dur); });
  U.loop.addEventListener("click", () => { MOT.loop = !MOT.loop; motionLinkEndsCheck(); motionRenderKeyUI(); });
  U.speed.addEventListener("change", () => { MOT.speed = +U.speed.value; });
  U.onion.addEventListener("click", () => { MOT.onion = !MOT.onion; motionGhosts(); motionRenderKeyUI(); });
  U.add.addEventListener("click", motionInsertKey);
  U.dup.addEventListener("click", motionDupKey);
  U.del.addEventListener("click", motionDeleteKey);
  U.ease.addEventListener("change", () => { const k = MOT.selKey; if (!k || stripLocked()) return; pushPoseUndo(); k.ease = U.ease.value; motionSeek(MOT.cur); motionRenderTrack(); });
  U.dur.addEventListener("change", () => motionSetDur(U.dur.value, U.stretch.checked));
  U.name.addEventListener("input", () => { MOT.name = U.name.value; });
  U.name.addEventListener("keydown", e => { if (e.key === "Enter") U.name.blur(); e.stopPropagation(); });
  $("mot-pack").addEventListener("click", () => packToggle());
  $("mot-clear").addEventListener("click", () => { if (MOT.keys.length) motionClearKeys(); });
  $("mot-save").addEventListener("click", () => {
    if (!MOT.keys.length){ showToastA(t("motNoKeys")); return; }
    const fn = motionFileName();
    saveTextFile(fn, motionToJson()); MOT.savedSig = motionSig();
    fileCard("motion", fn, motionDetail(MOT.keys, MOT.dur));
  });
  const tAt = e => { const r = U.track.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * MOT.dur; };
  let drag = null;
  U.track.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;
    motionPlay(false);
    const el = (typeof stripOn === "function" && stripOn()) ? null : e.target.closest(".mot-key");
    if (el){
      const k = MOT.keys[+el.dataset.i]; MOT.selKey = k;
      drag = { kind: "key", k, x0: e.clientX, moved: false };
      motionSeek(k.t); motionRenderTrack();
    } else {
      drag = { kind: "scrub" }; MOT.selKey = null; motionSeek(tAt(e)); motionRenderTrack();
    }
    U.track.setPointerCapture(e.pointerId); e.preventDefault();
  });
  U.track.addEventListener("pointermove", e => {
    if (!drag) return;
    if (drag.kind === "scrub"){ const tt = tAt(e); motionSeek(tt); const k = motKeyAt(MOT.cur); if (k !== MOT.selKey){ MOT.selKey = k; motionRenderTrack(); } return; }
    if (!drag.moved){ if (Math.abs(e.clientX - drag.x0) < 3) return; drag.moved = true; pushPoseUndo(); }
    let nt = Math.round(tAt(e) / MOT_SNAP) * MOT_SNAP; nt = Math.max(0, Math.min(MOT.dur, nt));
    if (MOT.keys.some(k => k !== drag.k && Math.abs(k.t - nt) < MOT_SNAP / 2)) return;
    drag.k.t = nt; motSort(); MOT.cur = nt; motionLinkEndsCheck();
    motionRenderTrack(); motionRenderHead(); motionGhosts();
  });
  const up = () => { drag = null; };
  U.track.addEventListener("pointerup", up); U.track.addEventListener("pointercancel", up);
  window.addEventListener("keydown", e => {
    if (APP.screen !== "actor" || e.ctrlKey || e.metaKey || e.altKey) return;
    const a = document.activeElement; if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT")) return;
    const step = 1/30;
    if (e.code === "KeyK"){ e.preventDefault(); motionInsertKey(); }
    else if (e.code === "KeyP"){ e.preventDefault(); motionPlay(!MOT.playing); }
    else if ((e.key === "Delete" || e.code === "Delete") && MOT.selKey && !(typeof stripOn === "function" && stripOn())){ e.preventDefault(); motionDeleteKey(); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowRight"){
      e.preventDefault(); motionPlay(false);
      const dir = e.key === "ArrowRight" ? 1 : -1;
      if (e.shiftKey){
        const K = MOT.keys; const k = dir > 0 ? K.find(x => x.t > MOT.cur + 1e-4) : [...K].reverse().find(x => x.t < MOT.cur - 1e-4);
        if (k){ MOT.selKey = k; motionSeek(k.t); motionRenderTrack(); }
      } else { motionSeek(Math.round((MOT.cur + dir * step) / step) * step); MOT.selKey = motKeyAt(MOT.cur); motionRenderTrack(); }
    }
  });
}
spaceTapRegister(() => { if (APP.screen !== "actor") return false; const a = document.activeElement; if (a && a.tagName === "SELECT") return true; motionPlay(!MOT.playing); return true; });
function motionRenderAll(){
  if (!MOT.ui) return;
  motionFillSelects(); motionRenderRuler(); motionRenderTrack(); motionRenderHead(); motionRenderKeyUI(); motionGhosts();
}
function motionFillSelects(){
  const U = MOT.ui; if (!U) return;
  U.ease.innerHTML = ""; MOT_EASES.forEach(k => { const o = document.createElement("option"); o.value = k; o.textContent = t("ease_" + k); U.ease.appendChild(o); });
  U.name.placeholder = t("motNamePh"); const pn = document.getElementById("pack-name"); if (pn) pn.placeholder = t("packNamePh");
}
function motionRenderRuler(){
  const U = MOT.ui; if (!U) return;
  const d = MOT.dur, step = d <= 0.6 ? 0.05 : d <= 1.5 ? 0.1 : d <= 4 ? 0.25 : d <= 10 ? 0.5 : d <= 30 ? 1 : 5;
  const lab = d <= 0.6 ? 0.1 : d <= 1.5 ? 0.5 : d <= 4 ? 0.5 : d <= 10 ? 1 : d <= 30 ? 5 : 10;
  let h = "";
  for (let s = 0; s <= d + 1e-6; s += step){
    const big = Math.abs(s / lab - Math.round(s / lab)) < 1e-6;
    h += `<div class="mot-tick${big ? " big" : ""}" style="left:${(s / d * 100).toFixed(3)}%">${big ? `<span>${+s.toFixed(2)}</span>` : ""}</div>`;
  }
  U.ruler.innerHTML = h;
}
function motionRenderTrack(){
  const U = MOT.ui; if (!U) return;
  U.keys.innerHTML = MOT.keys.map((k, i) => `<div class="mot-key ${k.ease}${k === MOT.selKey ? " sel" : ""}" data-i="${i}" style="left:${(k.t / MOT.dur * 100).toFixed(3)}%" title="${motFmt(k.t)} · ${t("ease_" + k.ease)}"></div>`).join("");
  motionRenderKeyUI();
}
function motionRenderHead(){
  const U = MOT.ui; if (!U) return;
  U.head.style.left = (MOT.dur ? MOT.cur / MOT.dur * 100 : 0) + "%";
  U.time.textContent = motFmt(MOT.cur) + " / " + motFmt(MOT.dur);
}
function motionRenderKeyUI(){
  const U = MOT.ui; if (!U) return;
  const k = MOT.selKey, onKey = !!motKeyAt(MOT.cur);
  U.ease.disabled = !k; U.dup.disabled = !k; U.del.disabled = !k;
  if (k) U.ease.value = k.ease;
  U.add.classList.toggle("on-key", onKey);
  U.add.textContent = t(onKey ? "motKeyUpdate" : "motKeyAdd");
  U.loop.classList.toggle("on", MOT.loop); U.onion.classList.toggle("on", MOT.onion);
  if (document.activeElement !== U.dur) U.dur.value = +MOT.dur.toFixed(2);
  U.box.classList.toggle("empty", !MOT.keys.length);
  motionRenderHead();
}

function motionInit(scene){
  MOT.ghosts = { prev: figBuildGhost(scene, 0xff9a52), next: figBuildGhost(scene, 0x5fb4ff) };
  MOT.ghosts.prev.fk = {}; MOT.ghosts.next.fk = {};
  for (const g of [MOT.ghosts.prev, MOT.ghosts.next]){ skFK(ACT.pose, g.fk); figUpdateGhost(g, g.fk); g.group.visible = true; }
  motionBuildUI(); packBindUI(); libBindUI(); stripBindUI(); motionRenderAll();
  const mb = document.getElementById("motion-bar"), scr = document.getElementById("actor-screen");
  const setH = () => scr.style.setProperty("--mb-h", mb.offsetHeight + "px");
  if (window.ResizeObserver) new ResizeObserver(setH).observe(mb); setH();
}
onLangChange(() => { if (MOT.ui){ motionFillSelects(); motionRenderTrack(); } });

const PACK_FILE_NAME = "directors-desk-pack.json";
const PACK = { name: "", items: [], open: false };
const packItemFromObj = (o, fallbackName) => ({ name: (o.name || fallbackName || "").trim() || t("packUnnamed"), dur: Math.max(0.1, +o.duration || +o.dur || 1), loop: o.loop !== false,
  keys: (o.keys || []).filter(k => k && isFinite(+k.t)).map(k => ({ t: +k.t, ease: MOT_EASES.includes(k.ease) ? k.ease : "smooth", pose: poseNormalize(k.pose) })).sort((a, b) => a.t - b.t) });
function packPut(item){
  const i = PACK.items.findIndex(x => x.name === item.name);
  if (i >= 0){ PACK.items[i] = item; return "replaced"; }
  PACK.items.push(item); return "added";
}
function packAddCurrent(){
  if (!MOT.keys.length){ showToastA(t("motNoKeys")); return; }
  let name = MOT.name.trim();
  if (!name){ let n = PACK.items.length + 1; while (PACK.items.some(x => x.name === t("packAuto") + " " + n)) n++; name = t("packAuto") + " " + n; motionSetName(name); }
  const r = packPut({ name, dur: MOT.dur, loop: MOT.loop, keys: poseClone(MOT.keys) });
  packRender(); showToastA(t(r === "added" ? "packAdded" : "packReplaced") + " — " + name);
}
function packOpenItem(i){
  const it = PACK.items[i]; if (!it) return;
  motionPlay(false); pushPoseUndo(); stripDrop();
  MOT.keys = poseClone(it.keys); MOT.dur = it.dur; MOT.loop = it.loop; MOT.selKey = null; motionSetName(it.name);
  motionLinkEndsCheck(); motionRenderAll(); motionSeek(0); packRender();
}
function packRemoveItem(i){ PACK.items.splice(i, 1); packRender(); }
function packRenameItem(i){
  const it = PACK.items[i]; if (!it) return;
  const n = prompt(t("packRenameAsk"), it.name); if (n == null || !n.trim()) return;
  const was = it.name; it.name = n.trim();
  if (MOT.name === was) motionSetName(it.name);
  packRender();
}
function packToObj(){
  return { kind: "dd-pack", version: 1, about: FILE_ABOUT.pack, name: PACK.name || "", skeleton: "dd-human-19", body: SK_BODY,
    motions: PACK.items.map(it => ({ name: it.name, duration: +it.dur.toFixed(4), loop: it.loop, keys: it.keys.map(k => ({ t: +k.t.toFixed(4), ease: k.ease, pose: k.pose })) })) };
}
function packLoadData(data, fileName){
  if (!data) return 0;
  if (data.kind === "dd-pack" && Array.isArray(data.motions)){
    if (data.name && !PACK.name) PACK.name = data.name;
    data.motions.forEach(m => packPut(packItemFromObj(m))); return data.motions.length;
  }
  if (data.kind === "dd-motion"){ packPut(packItemFromObj(data, String(fileName || "").replace(/\.motion\.json$|\.json$/i, ""))); return 1; }
  return 0;
}
function packToggle(on){
  PACK.open = on == null ? !PACK.open : !!on;
  if (PACK.open && typeof LIBUI !== "undefined" && LIBUI.open) libToggle(false);
  document.getElementById("pack-panel").hidden = !PACK.open;
  document.getElementById("mot-pack").classList.toggle("on", PACK.open);
  packRender();
  if (PACK.open) motPanelAt("pack-panel", "mot-pack");
}
function motPanelAt(panelId, btnId){
  const P = document.getElementById(panelId), B = document.getElementById(btnId), bar = document.getElementById("motion-bar");
  if (!P || !B || !bar) return;
  const br = bar.getBoundingClientRect(), x = B.getBoundingClientRect().left - br.left;
  P.style.left = Math.max(0, Math.min(x, br.width - P.offsetWidth)) + "px"; P.style.right = "auto";
}
function packRender(){
  const n = document.getElementById("mot-pack-n"); if (n) n.textContent = PACK.items.length ? String(PACK.items.length) : "";
  const nameIn = document.getElementById("pack-name"); if (nameIn && document.activeElement !== nameIn) nameIn.value = PACK.name;
  const box = document.getElementById("pack-list"); if (!box) return;
  box.innerHTML = "";
  if (!PACK.items.length){ const e = document.createElement("div"); e.className = "pk-empty"; e.textContent = t("packEmpty"); box.appendChild(e); return; }
  PACK.items.forEach((it, i) => {
    const row = document.createElement("div");
    const same = it.name === MOT.name && JSON.stringify(it.keys) === JSON.stringify(MOT.keys);
    row.className = "pk-item" + (it.name === MOT.name ? " cur" : "") + (it.name === MOT.name && !same ? " changed" : "");
    row.innerHTML = `<button type="button" class="pk-open"><b></b><span></span></button><button type="button" class="pk-strip c-get"></button><button type="button" class="pk-ren">✎</button><button type="button" class="pk-del">✕</button>`;
    row.querySelector(".pk-strip").textContent = t("stripAddBtn"); row.querySelector(".pk-strip").title = t("stripAddTitle");
    row.querySelector(".pk-strip").addEventListener("click", () => stripAddPack(i));
    row.querySelector("b").textContent = it.name;
    row.querySelector("span").textContent = motionDetail(it.keys, it.dur) + (it.name === MOT.name && !same ? " · " + t("packChanged") : "");
    row.querySelector(".pk-open").title = t("packOpenTip");
    row.querySelector(".pk-ren").title = t("packRenameTip"); row.querySelector(".pk-del").title = t("packDelTip");
    row.querySelector(".pk-open").addEventListener("click", () => packOpenItem(i));
    row.querySelector(".pk-ren").addEventListener("click", () => packRenameItem(i));
    row.querySelector(".pk-del").addEventListener("click", () => packRemoveItem(i));
    box.appendChild(row);
  });
}
function packBindUI(){
  const $ = id => document.getElementById(id);
  $("pack-close").addEventListener("click", () => packToggle(false));

  $("pack-add").addEventListener("click", packAddCurrent);
  $("pack-open").addEventListener("click", () => $("pack-input").click());
  $("pack-name").addEventListener("input", e => { PACK.name = e.target.value; });
  $("pack-name").addEventListener("keydown", e => { if (e.key === "Enter") e.target.blur(); e.stopPropagation(); });
  $("pack-save").addEventListener("click", () => {
    if (!PACK.items.length){ showToastA(t("packEmpty")); return; }
    const fn = PACK.name.trim() ? safeFileName(PACK.name) + ".pack.json" : PACK_FILE_NAME;
    saveTextFile(fn, JSON.stringify(packToObj(), null, 1)); PACK.savedSig = JSON.stringify(PACK.items);
    fileCard("pack", fn, t("packCount") + " " + PACK.items.length + " · " + PACK.items.map(x => x.name).slice(0, 4).join(", ") + (PACK.items.length > 4 ? " …" : ""));
  });
  $("pack-input").addEventListener("change", e => {
    const files = [...e.target.files]; e.target.value = ""; if (!files.length) return;
    let left = files.length, added = 0, skipped = 0;
    files.forEach(f => readTextFile(f, text => {
      try { const c = packLoadData(JSON.parse(text), f.name); if (c) added += c; else skipped++; } catch(err){ skipped++; }
      if (--left === 0){ packRender(); fileCard("pack", files.length === 1 ? files[0].name : t("packFilesN").replace("{n}", files.length), t("packCount") + " " + added + (skipped ? " · " + t("packSkipped") + " " + skipped : ""), true); }
    }));
  });
  packRender();
}
onLangChange(() => packRender());

function undoToast(key){
  let el = document.getElementById("undo-toast");
  if (!el){
    el = document.createElement("div"); el.id = "undo-toast"; el.innerHTML = `<span></span><button type="button"></button>`;
    document.getElementById("actor-screen").appendChild(el);
    el.querySelector("button").addEventListener("click", () => { poseUndo(); el.classList.remove("show"); });
  }
  el.querySelector("span").textContent = t(key); el.querySelector("button").textContent = t("undoToastBtn");
  el.classList.add("show"); clearTimeout(undoToast._t); undoToast._t = setTimeout(() => el.classList.remove("show"), 5000);
}
setInterval(() => {
  if (APP.screen !== "actor" || !MOT.ui) return;
  const ms = document.getElementById("mot-save"), ps = document.getElementById("pack-save");
  const md = MOT.keys.length > 0 && MOT.savedSig !== motionSig();
  ms.classList.toggle("dirty", md); ms.title = md ? t("unsavedTitle") : t("motSaveTitle");
  const pd = PACK.items.length > 0 && PACK.savedSig !== JSON.stringify(PACK.items);
  ps.classList.toggle("dirty", pd); document.getElementById("mot-pack").classList.toggle("dirty", pd);
}, 500);
