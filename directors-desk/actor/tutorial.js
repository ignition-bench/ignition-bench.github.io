"use strict";

const TUT = { on: false, menu: false, ch: 0, step: 0, done: false, played: 0, box: null, ring: null, snaps: [], marks: new Set(), looping: false };
const TUT_DONE_KEY = "dd-tut-done2"
const tutKeyNear = (a, b) => MOT.keys.find(k => k.t >= a && k.t <= b) || null;
const tutWrist = (pose, side) => skFK(pose, {})["wrist" + side].pos;
const tutEl = id => () => document.getElementById(id);
const tutQ = sel => () => document.querySelector(sel);
const tutPt = fn => () => ({ point: fn() });
const tutTime = s => () => {
  const r = MOT.ui.track.getBoundingClientRect();
  return { rect: { left: r.left + r.width * (s / MOT.dur) - 14, top: r.top - 4, width: 28, height: r.height + 8 } };
};
const tutMarked = (...ids) => ids.some(id => TUT.marks.has(id));
const tutSaved = () => MOT.keys.length > 0 && MOT.savedSig === motionSig();
const tutLibRing = (cat, id, part) => () => {
  if (!LIBUI.open) return document.getElementById("mot-lib");
  if (LIBUI.cat !== cat) return LIBUI.cat ? document.getElementById("lib-back") : document.querySelector(`.lb-cat[data-cat="${cat}"]`);
  return document.querySelector(id ? `.lb-item[data-id="${id}"] ${part || ".lb-open"}` : `#lib-body ${part || ".lb-open"}`);
};
const tutNearEdge = () => {
  for (const id in ACT.pose.j){ const J = SK[id]; if (!J || !J.dof) continue;
    if (J.dof.some(d => dofNearEdge(d, ACT.pose.j[id][d.key]) >= 0.85)) return true; }
  return false;
};
const tutStripNames = () => STRIP.clips.map(c => c.name).join("|");
function tutFrameTall(){ const x = ACT.pose.root.x || 0, z = ACT.pose.root.z || 0; ACT.orbit.target.set(x, 1.0, z); ACT.cam.position.set(x + 3.2, 1.8, z + 4.7); ACT.orbit.update(); }

const TUT_CH = [
  { n: 0, key: "tch0", min: 1, basic: true, fresh: true, steps: [
    { t: "tc0_1", d: "tc0_1d", ring: tutEl("mot-lib"), check: () => LIBUI.open },
    { t: "tc0_2", d: "tc0_2d", ring: tutLibRing("move"), check: () => LIBUI.open && LIBUI.cat === "move" },
    { t: "tc0_3", d: "tc0_3d", ring: tutLibRing("move", "run"), check: () => LIBUI.cur === "run" && MOT.keys.length > 0 },
    { t: "tc0_4", d: "tc0_4d", ring: tutEl("view-side"), check: () => tutMarked("view-side") },
    { t: "tc0_5", d: "tc0_5d", ring: tutEl("mot-speed"), check: () => MOT.speed <= 0.25 + 1e-6 },
  ]},
  { n: 1, key: "tch1", min: 2, basic: true, fresh: true, steps: [
    { t: "tc1_1", d: "tc1_1d", ring: tutPt(() => ACT.fk.elbowR.pos), check: () => !!ACT.sel },
    { t: "tc1_2", d: "tc1_2d", ring: tutPt(() => ACT.fk.wristR.pos), check: () => poseMovedCount() >= 1 && !ACT.drag },
    { t: "tc1_3", d: "tc1_3d", ring: () => document.querySelector("#joint-panel .jp-row input") || tutPt(() => ACT.fk.elbowR.pos)(), check: () => tutNearEdge() },
    { t: "tc1_4", d: "tc1_4d", ring: () => document.querySelector("#joint-panel .jp-row input") || tutPt(() => ACT.fk.elbowR.pos)(), check: () => tutMarked("jp-input") },
    { t: "tc1_5", d: "tc1_5d", ring: tutEl("pose-undo"), check: () => tutMarked("pose-undo", "ctrlz") },
    { t: "tc1_6", d: "tc1_6d", ring: tutEl("pose-save"), check: () => tutMarked("pose-save") },
  ]},
  { n: 2, key: "tchP", min: 2, basic: true, fresh: true, steps: [
    { t: "tcP_1", d: "tcP_1d", ring: tutEl("photo-sample"), check: () => PHOTO.on },
    { t: "tcP_2", d: "tcP_2d", ring: () => tutQ("#photo-handles .ph-move")() || tutEl("photo-open")(), check: () => PHOTO.moved },
    { t: "tcP_3", d: "tcP_3d", ring: () => tutQ('#rig2d .rg-pt.now .rg-ring')() || tutQ('#rig2d .rg-pt .rg-ring')(),
      onEnter: () => { PHOTO.moved = false; }, check: () => RIG2D.on && RIG2D.done.size >= 2 && !RIG2D.drag },
    { t: "tcP_4", d: "tcP_4d", ring: tutEl("photo-op"), check: () => PHOTO.op <= 0.3 + 1e-6 },
    { t: "tcP_5", d: "tcP_5d", ring: tutEl("photo-close"), check: () => !PHOTO.on },
    { t: "tcP_6", d: "tcP_6d", ring: tutEl("pose-save"), check: () => tutMarked("pose-save") },
  ], onFinish: () => photoClear() },
  { n: 3, key: "tch2", min: 3, basic: true, fresh: true, motionSetup: true, steps: [
    { t: "tut1", d: "tutDone1", ring: tutEl("mot-add"), check: () => MOT.keys.length >= 1 },
    { t: "tut2", d: "tutDone2", ring: tutTime(1), check: () => MOT.cur >= 0.8 && MOT.cur <= 1.2 && !MOT.playing },
    { t: "tut3", d: "tutDone3", ring: tutPt(() => ACT.fk.wristR.pos), onEnter: tutFrameTall,
      check: () => { const k = tutKeyNear(0.75, 1.25); return !!k && Math.max(tutWrist(k.pose, "R").y, tutWrist(k.pose, "L").y) > 1.55; } },
    { t: "tut4", d: "tutDone4",
      ring: () => (MOT.cur >= 1.3 && MOT.cur <= 1.7) ? { point: ACT.fk.wristR.pos } : tutTime(1.5)(),
      check: () => { const a = tutKeyNear(0.75, 1.25), b = tutKeyNear(1.3, 1.7); return !!a && !!b && tutWrist(a.pose, "R").distanceTo(tutWrist(b.pose, "R")) > 0.08; } },
    { t: "tut5", d: "tutDone5", ring: tutEl("mot-play"), check: () => TUT.played > 0.8 },
    { t: "tut6", d: "tutDone6",
      ring: () => { const k = tutKeyNear(0.75, 1.25);
        if (k && k.ease !== "step") return MOT.selKey === k ? tutEl("mot-ease")() : tutTime(k.t)();
        return tutEl("mot-play")(); },
      onEnter: () => { TUT.played = 0; },
      check: () => { const k = tutKeyNear(0.75, 1.25); if (!k || k.ease !== "step"){ TUT.played = 0; return false; } return TUT.played > 0.8; } },
    { t: "tut7", d: "tutDone7", ring: () => MOT.onion ? tutTime(0.5)() : tutEl("mot-onion")(),
      check: () => !MOT.playing && MOT.onion && MOT.ghosts.prev.group.visible && MOT.ghosts.next.group.visible },
    { t: "tc2_8", d: "tc2_8d", ring: () => MOT.name.trim() ? tutEl("mot-save")() : tutEl("mot-name")(), check: tutSaved },
  ], onFinish: () => tutGlow(["mot-add", "mot-play", "mot-save"]) },
  { n: 4, key: "tch3", min: 2, fresh: true, steps: [
    { t: "tc3_1", d: "tc3_1d", ring: tutLibRing("pose", "wave"), check: () => LIBUI.cur === "wave" && MOT.keys.length > 0 },
    { t: "tc3_2", d: "tc3_2d", ring: () => MOT.playing ? tutEl("mot-play")() : tutTime(1.0)(), check: () => !!MOT.selKey && !MOT.playing },
    { t: "tc3_3", d: "tc3_3d", ring: tutPt(() => ACT.fk.wristR.pos), onEnter: () => { TUT.ref = JSON.stringify(MOT.keys); tutFrameTall(); },
      check: () => !ACT.drag && JSON.stringify(MOT.keys) !== TUT.ref },
    { t: "tc3_4", d: "tc3_4d", ring: tutEl("mot-mirror"), check: () => tutMarked("mot-mirror") },
    { t: "tc3_5", d: "tc3_5d", ring: tutEl("mot-name"), check: () => { const n = MOT.name.trim(); return !!n && !n.endsWith(t("libSuffix").trim()); } },
    { t: "tc3_6", d: "tc3_6d", ring: tutEl("mot-save"), check: tutSaved },
  ]},
  { n: 5, key: "tch4", min: 2, fresh: true, steps: [
    { t: "tc4_1", d: "tc4_1d", ring: tutLibRing("move", null, ".lb-strip"), check: () => STRIP.clips.length >= 3 },
    { t: "tc4_2", d: "tc4_2d", ring: () => STRIP.sel < 0 ? tutQ(".sb-block")() : tutEl("strip-rep-up")(), check: () => STRIP.clips.some(c => c.reps >= 2) },
    { t: "tc4_3", d: "tc4_3d", ring: tutEl("strip-speed"), check: () => STRIP.clips.some(c => c.speed !== 1) },
    { t: "tc4_4", d: "tc4_4d", ring: tutEl("strip-blocks"), onEnter: () => { TUT.ref = tutStripNames(); },
      check: () => STRIP.clips.length >= 2 && tutStripNames() !== TUT.ref && STRIP.clips.length === TUT.ref.split("|").length },
    { t: "tc4_5", d: "tc4_5d", ring: () => STRIP.sel < 0 ? tutQ(".sb-block")() : tutEl("strip-remove")(), onEnter: () => { TUT.refN = STRIP.clips.length; },
      check: () => STRIP.clips.length > 0 && STRIP.clips.length < TUT.refN },
    { t: "tc4_6", d: "tc4_6d", ring: tutEl("mot-play"), onEnter: () => { TUT.played = 0; }, check: () => TUT.played > 0.8 },
  ]},
  { n: 6, key: "tch5", min: 1, fresh: false, steps: [
    { t: "tc5_1", d: "tc5_1d", ring: tutEl("mot-lib"), check: () => MOT.keys.length > 0 },
    { t: "tc5_2", d: "tc5_2d", ring: tutEl("mot-pack"), check: () => PACK.open },
    { t: "tc5_3", d: "tc5_3d", ring: tutEl("pack-add"), check: () => PACK.items.some(it => it.name === MOT.name.trim()) },
    { t: "tc5_4", d: "tc5_4d", ring: tutEl("pack-name"), check: () => PACK.name.trim().length > 0 && document.activeElement !== document.getElementById("pack-name") },
    { t: "tc5_5", d: "tc5_5d", ring: tutEl("pack-save"), check: () => tutMarked("pack-save") },
  ]},
];

function tutDoneList(){ try { return JSON.parse(localStorage.getItem(TUT_DONE_KEY)) || []; } catch(e){ return []; } }
function tutMarkDone(n){ const L = tutDoneList(); if (!L.includes(n)){ L.push(n); try { localStorage.setItem(TUT_DONE_KEY, JSON.stringify(L)); } catch(e){} } }

const TUT_STUCK_S = 30;
function tutBuild(){
  if (TUT.box) return;
  const scr = document.getElementById("actor-screen");
  TUT.box = document.createElement("div"); TUT.box.id = "tut-box"; TUT.box.hidden = true;
  TUT.box.innerHTML = `<div class="tut-head"><b class="tut-title"></b><button type="button" class="tut-close"></button></div>
    <div class="tut-menu" hidden></div>
    <div class="tut-run"><div class="tut-text"></div><div class="tut-ok" hidden></div>
    <div class="tut-stuck" hidden><span></span><button type="button" class="tut-stuck-btn"></button></div>
    <div class="tut-btns"><span class="tut-nav"><button type="button" class="tut-prev"></button><button type="button" class="tut-redo"></button></span>
      <button type="button" class="tut-skip"></button><button type="button" class="tut-next" hidden></button></div>
    <div class="tut-fin" hidden><button type="button" class="tut-nextch"></button>
      <div class="tut-end"><button type="button" class="tut-back c-get"></button><button type="button" class="tut-keep c-save"></button></div>
      <button type="button" class="tut-list"></button></div></div>`;
  scr.appendChild(TUT.box);
  TUT.ring = document.createElement("div"); TUT.ring.id = "tut-ring"; TUT.ring.hidden = true; scr.appendChild(TUT.ring);
  const q = c => TUT.box.querySelector(c);
  q(".tut-close").addEventListener("click", () => {
    if (TUT.menu && !TUT.on){ tutMenuClose(); return; }
    tutStop(TUT.step >= tutSteps().length ? "keep" : "back");
  });
  q(".tut-next").addEventListener("click", () => TUT.step >= tutSteps().length ? tutStop("keep") : tutGo(TUT.step + 1));
  q(".tut-skip").addEventListener("click", () => tutGo(TUT.step + 1));
  q(".tut-prev").addEventListener("click", () => { if (TUT.step > 0) tutGo(TUT.step - 1, true); });
  q(".tut-redo").addEventListener("click", () => tutGo(TUT.step, true));
  q(".tut-stuck-btn").addEventListener("click", () => { tutGo(TUT.step, true); TUT.ring.classList.add("big"); setTimeout(() => TUT.ring.classList.remove("big"), 2400); });
  q(".tut-back").addEventListener("click", () => tutStop("back"));
  q(".tut-keep").addEventListener("click", () => tutStop("keep"));
  q(".tut-nextch").addEventListener("click", () => tutStart(TUT.ch + 1));
  q(".tut-list").addEventListener("click", tutMenu);
}
const tutSteps = () => TUT_CH[TUT.ch].steps;

function tutMenu(){
  if (!ACT.inited) return;
  tutBuild(); TUT.menu = true; TUT.ring.hidden = true; if (TUT.on) motionPlay(false);
  const B = TUT.box, M = B.querySelector(".tut-menu"), done = tutDoneList();
  B.hidden = false; B.classList.add("menu"); M.hidden = false; B.querySelector(".tut-run").hidden = true;
  B.querySelector(".tut-title").textContent = t("tutMenuTitle");
  B.querySelector(".tut-close").textContent = "✕"; B.querySelector(".tut-close").title = t(TUT.on ? "tutStopBack" : "tutClose");
  M.innerHTML = "";
  const group = (label, list) => {
    const h = document.createElement("div"); h.className = "tm-group"; h.textContent = label; M.appendChild(h);
    list.forEach(C => {
      const b = document.createElement("button"); b.type = "button"; b.className = "tm-ch" + (done.includes(C.n) ? " done" : "") + (TUT.on && TUT.ch === C.n ? " cur" : "");
      b.dataset.ch = C.n;
      b.innerHTML = `<span class="tm-n"></span><span class="tm-txt"><b></b><small></small></span><span class="tm-st"></span>`;
      b.querySelector(".tm-n").textContent = C.n;
      b.querySelector("b").textContent = t(C.key);
      b.querySelector("small").textContent = t(C.key + "Sub") + " · " + t("tutMin").replace("{n}", C.min);
      b.querySelector(".tm-st").textContent = done.includes(C.n) ? "✔" : "";
      b.addEventListener("click", () => tutStart(C.n));
      M.appendChild(b);
    });
  };
  group(t("tutBasic"), TUT_CH.filter(C => C.basic));
  group(t("tutMore"), TUT_CH.filter(C => !C.basic));
  const note = document.createElement("div"); note.className = "tm-note"; note.textContent = t("tutMenuNote"); M.appendChild(note);
  document.getElementById("tut-start").classList.add("on");
}
function tutMenuClose(){
  TUT.menu = false;
  if (!TUT.box) return;
  TUT.box.classList.remove("menu"); TUT.box.querySelector(".tut-menu").hidden = true; TUT.box.querySelector(".tut-run").hidden = false;
  if (!TUT.on){ TUT.box.hidden = true; document.getElementById("tut-start").classList.remove("on"); }
}

function tutHasWork(){
  if (MOT.keys.length || (typeof STRIP !== "undefined" && STRIP.clips.length) || PACK.items.length) return true;
  const r = ACT.pose.root; if (Math.abs(r.x) > 0.01 || Math.abs(r.z) > 0.01 || Math.abs(r.yaw) > 0.5) return true;
  const st = POSE_PRESETS.stand();
  for (const id in ACT.pose.j) for (const k in ACT.pose.j[id]) if (Math.abs((ACT.pose.j[id][k] || 0) - ((st.j[id] || {})[k] || 0)) > 0.5) return true;
  return false;
}
function tutFresh(C){
  motionPlay(false); stripDrop();
  if (LIBUI.open) libToggle(false); if (PACK.open) packToggle(false);
  LIBUI.cat = null; LIBUI.cur = null;
  if (MOT.keys.length) motionClearKeys();
  if (Math.abs(MOT.dur - 2) > 1e-6) motionSetDur(2, false);
  MOT.loop = true; MOT.onion = C.n !== 0; MOT.speed = 1;
  motionSetName("");
  MOT.applying = true; ACT.pose = POSE_PRESETS.stand(); actorRefresh(); MOT.applying = false;
  ACT.sel = null; renderJointPanel();
  motionSeek(0); motionRenderAll(); tutFrameTall();
}
function tutStart(n){
  if (!ACT.inited) return;
  tutBuild(); motionPlay(false);
  n = Math.max(0, Math.min(TUT_CH.length - 1, n || 0));
  if (!TUT.on){
    TUT.saved = tutHasWork() ? { snap: poseSnap(), undo: ACT.undo.slice(), redo: ACT.redo.slice(), cur: MOT.cur, onion: MOT.onion, speed: MOT.speed, sel: ACT.sel,
      pack: JSON.stringify({ name: PACK.name, items: PACK.items }) } : null;
    ACT.undo = []; ACT.redo = [];
  }
  const C = TUT_CH[n];
  if (C.fresh) tutFresh(C);
  TUT.ch = n; TUT.snaps = []; TUT.on = true;
  tutMenuClose(); TUT.box.hidden = false;
  document.getElementById("tut-start").classList.add("on");
  tutGo(0);
  if (!TUT.looping){ TUT.looping = true; tutLoop(); }
}
function tutStop(how){
  if (!TUT.on){ tutMenuClose(); return; }
  TUT.on = false; TUT.menu = false;
  if (TUT.box){ TUT.box.hidden = true; TUT.ring.hidden = true; TUT.box.classList.remove("menu"); }
  const b = document.getElementById("tut-start"); if (b) b.classList.remove("on");
  const S = TUT.saved; TUT.saved = null;
  if (!S) return;
  motionPlay(false);
  if (how === "keep"){
    ACT.undo = S.undo.concat([S.snap]).slice(-80);
    showToastA(t("tutKept"), 4000); return;
  }
  if (LIBUI.open) libToggle(false);
  poseRestore(S.snap); ACT.undo = S.undo; ACT.redo = S.redo;
  try { const P = JSON.parse(S.pack); PACK.name = P.name; PACK.items = P.items; } catch(e){}
  if (PACK.open) packToggle(false); else packRender();
  MOT.onion = S.onion; MOT.speed = S.speed; if (MOT.ui) MOT.ui.speed.value = String(S.speed);
  ACT.sel = S.sel; motionSeek(Math.min(S.cur, MOT.dur)); actorRefresh(false); renderJointPanel(); motionRenderAll();
  showToastA(t("tutRestored"), 3000);
}

function tutGo(i, restore){
  const steps = tutSteps();
  if (restore && TUT.snaps[i]){ MOT.applying = true; poseRestore(TUT.snaps[i]); MOT.applying = false; motionSeek(0); }
  else if (i < steps.length) TUT.snaps[i] = poseSnap();
  TUT.step = i; TUT.done = false; TUT.played = 0; TUT.stuckT = 0; TUT.marks = new Set();
  const C = TUT_CH[TUT.ch], B = TUT.box, last = i >= steps.length, q = c => B.querySelector(c);
  q(".tut-title").textContent = last ? t(C.key + "Fin") : "🎓 " + t("tutChN").replace("{n}", C.n) + " " + t(C.key) + " · " + (i + 1) + " / " + steps.length;
  q(".tut-text").innerHTML = t(last ? C.key + "FinText" : steps[i].t);
  q(".tut-ok").hidden = true; q(".tut-stuck").hidden = true;
  q(".tut-btns").hidden = last;
  q(".tut-next").hidden = true; q(".tut-next").textContent = t("tutNext");
  q(".tut-skip").hidden = false; q(".tut-skip").textContent = t("tutSkip");
  q(".tut-prev").textContent = t("tutPrev"); q(".tut-prev").disabled = i === 0; q(".tut-prev").title = t("tutPrevTitle");
  q(".tut-redo").textContent = t("tutRedo"); q(".tut-redo").title = t("tutRedoTitle");
  q(".tut-stuck span").textContent = t("tutStuck"); q(".tut-stuck-btn").textContent = t("tutStuckBtn");
  q(".tut-fin").hidden = !last;
  const nx = TUT_CH[TUT.ch + 1];
  q(".tut-nextch").hidden = !nx; if (nx) q(".tut-nextch").textContent = t("tutNextCh").replace("{n}", nx.n).replace("{name}", t(nx.key));
  q(".tut-back").textContent = t(TUT.saved ? "tutBack" : "tutClose"); q(".tut-back").hidden = false;
  q(".tut-keep").textContent = t("tutKeep"); q(".tut-keep").hidden = !TUT.saved;
  q(".tut-back").onclick = TUT.saved ? null : () => tutStop("keep");
  q(".tut-list").textContent = t("tutList");
  q(".tut-close").textContent = "✕"; q(".tut-close").title = t(last ? "tutClose" : (TUT.saved ? "tutStopBack" : "tutStop"));
  if (last){ tutMarkDone(C.n); if (C.onFinish) C.onFinish(); }
  else if (steps[i].onEnter) steps[i].onEnter();
}
function tutPassed(){
  TUT.done = true;
  const B = TUT.box, ok = B.querySelector(".tut-ok");
  ok.innerHTML = "✔ " + t(tutSteps()[TUT.step].d); ok.hidden = false;
  B.querySelector(".tut-stuck").hidden = true;
  B.querySelector(".tut-next").hidden = false; B.querySelector(".tut-skip").hidden = true;
}
function tutLoop(){
  if (!TUT.on){ TUT.looping = false; return; }
  requestAnimationFrame(tutLoop);
  const now = performance.now(), dt = Math.min(0.1, (now - (TUT._t || now)) / 1000); TUT._t = now;
  if (APP.screen !== "actor" || TUT.menu){ TUT.ring.hidden = true; return; }
  const steps = tutSteps();
  if (TUT.step >= steps.length){ tutRing(TUT.box.querySelector(TUT_CH[TUT.ch + 1] ? ".tut-nextch" : ".tut-back")); return; }
  const S = steps[TUT.step];
  if (MOT.playing) TUT.played += dt;
  if (!TUT.done){ let ok = false; try { ok = S.check(); } catch(e){} if (ok) tutPassed(); }
  if (!TUT.done && !document.hidden){ TUT.stuckT += dt; if (TUT.stuckT > TUT_STUCK_S) TUT.box.querySelector(".tut-stuck").hidden = false; }
  let target = null; try { target = TUT.done ? TUT.box.querySelector(".tut-next") : S.ring(); } catch(e){}
  tutRing(target);
}
function tutGlow(ids){
  const els = ids.map(id => document.getElementById(id)).concat([...document.querySelectorAll("#flow-bar .flow-step")]).filter(Boolean);
  els.forEach(e => e.classList.add("tut-glow"));
  setTimeout(() => els.forEach(e => e.classList.remove("tut-glow")), 4200);
}
document.addEventListener("click", e => {
  if (!TUT.on) return;
  const el = e.target.closest && e.target.closest("[id]"); if (el) TUT.marks.add(el.id);
}, true);
document.addEventListener("input", e => { if (TUT.on && e.target.closest && e.target.closest("#joint-panel")) TUT.marks.add("jp-input"); }, true);
window.addEventListener("keydown", e => { if (TUT.on && (e.ctrlKey || e.metaKey) && e.code === "KeyZ") TUT.marks.add("ctrlz"); }, true);

function tutRing(target){
  const R = TUT.ring;
  if (!target){ R.hidden = true; return; }
  let x, y, w, h;
  if (target instanceof Element){ const r = target.getBoundingClientRect(); x = r.left - 5; y = r.top - 5; w = r.width + 10; h = r.height + 10; R.classList.remove("dot"); }
  else if (target.rect){ ({ left: x, top: y, width: w, height: h } = target.rect); R.classList.remove("dot"); }
  else if (target.point){ const s = toScreen(target.point); w = h = 44; x = s.x - 22; y = s.y - 22; R.classList.add("dot"); }
  else { R.hidden = true; return; }
  R.hidden = false; Object.assign(R.style, { left: x + "px", top: y + "px", width: w + "px", height: h + "px" });
}

function motExampleWave(){
  const st = POSE_PRESETS.stand();
  const arm = abd => { const p = poseClone(st); Object.assign(p.j.shoulderR, { flex: 12, abd, rot: 0 }); p.j.elbowR.flex = 0; p.j.elbowR.twist = 0; p.j.wristR.flex = 0; p.j.wristR.dev = 0; p.j.head.turn = -10; return motSoftClamp(p); };
  const up = arm(148), wave = d => arm(148 + d);
  return { dur: 2.4, keys: [
    { t: 0, ease: "smooth", pose: st }, { t: 1.0, ease: "smooth", pose: up },
    { t: 1.35, ease: "smooth", pose: wave(17) }, { t: 1.7, ease: "smooth", pose: wave(-22) },
    { t: 2.05, ease: "smooth", pose: wave(17) }, { t: 2.4, ease: "smooth", pose: poseClone(up) } ] };
}

document.getElementById("tut-start").addEventListener("click", () => TUT.menu ? tutMenuClose() : tutMenu());
onLangChange(() => { if (TUT.menu) tutMenu(); else if (TUT.on) tutGo(TUT.step); });
