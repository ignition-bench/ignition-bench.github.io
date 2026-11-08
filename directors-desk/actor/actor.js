"use strict";

const ACT = { inited: false, scene: null, cam: null, orbit: null, fig: null, fk: {}, floor: null, grid: null, tri: null,
  pose: poseZero(), sel: null, undo: [], redo: [], drag: null, preset: "stand" };
const actorView = document.getElementById("actor-view");
const jointPanel = document.getElementById("joint-panel");
const POSE_FILE_NAME = "directors-desk-pose.json";

const POSE_PRESETS = {
  stand(){ const p = poseZero(); p.j.shoulderL.abd = 4; p.j.shoulderR.abd = 4; return p; },
  tpose(){ const p = poseZero(); p.j.shoulderL.abd = 90; p.j.shoulderR.abd = 90; return p; },
  aim(){
    const p = POSE_PRESETS.stand();
    p.root.y = -0.04; p.j.spine.flex = 6; p.j.chest.flex = 6; p.j.head.nod = 6;
    for (const s of ["L", "R"]){ Object.assign(p.j["shoulder"+s], { flex: 75, abd: -20, rot: 0 }); p.j["elbow"+s].flex = 40; }
    ikSolve(p, "ankleL", new THREE.Vector3(0.12, 0.05, 0.14), 60);
    ikSolve(p, "ankleR", new THREE.Vector3(-0.12, 0.05, -0.20), 60);
    ikSolve(p, "wristR", new THREE.Vector3(-0.02, 1.36, 0.48), 60);
    ikSolve(p, "wristL", new THREE.Vector3(0.03, 1.33, 0.45), 60);
    return p;
  },
};

function actorInit(){
  if (ACT.inited) return;
  ACT.inited = true;
  const S = new THREE.Scene(); S.background = new THREE.Color(STUDIO.bg); ACT.scene = S;
  ACT.cam = new THREE.PerspectiveCamera(40, window.innerWidth/window.innerHeight, 0.05, 200);
  v3Ensure(actorView); V3.scene = S; V3.camera = ACT.cam;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(6, 0.1, 6), new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 1 }));
  floor.position.y = -0.05; floor.receiveShadow = true; S.add(floor); ACT.floor = floor;
  const gp = []; for (let i = -3; i <= 3; i++){ gp.push(i, 0.003, -3, i, 0.003, 3, -3, 0.003, i, 3, 0.003, i); }
  const gg = new THREE.BufferGeometry(); gg.setAttribute("position", new THREE.Float32BufferAttribute(gp, 3));
  ACT.grid = new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0x5a606b, transparent: true, opacity: 0.6 })); S.add(ACT.grid);
  const tri = new THREE.Mesh(new THREE.CircleGeometry(0.12, 3), new THREE.MeshBasicMaterial({ color: 0xd8dbe2 }));
  tri.rotation.x = -Math.PI/2; tri.rotation.z = -Math.PI/2; tri.position.set(0, 0.004, 0.75); S.add(tri); ACT.tri = tri;
  S.add(new THREE.HemisphereLight(0xffffff, 0x6b6660, 0.62));
  const sun = new THREE.DirectionalLight(0xfff6ea, 0.95);
  sun.position.set(-3, 7, 5); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left:-3.5, right:3.5, top:3.5, bottom:-3.5, near:0.5, far:20 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; S.add(sun);
  ACT.fig = figBuild(S);
  motionInit(S);
  ACT.orbit = new THREE.OrbitControls(ACT.cam, V3.renderer.domElement);
  Object.assign(ACT.orbit, { enableDamping: true, dampingFactor: 0.08, maxPolarAngle: Math.PI/2 - 0.02, minDistance: 0.8, maxDistance: 12, screenSpacePanning: true });
  spacePanRegister(() => APP.screen === "actor" ? ACT.orbit : null);
  actorResetView();
  ACT.pose = POSE_PRESETS.stand();
  actorRefresh();
  warmScene();
  motionGhosts();
  bindActorInput();
  photoBindUI();
  if (PHOTO.on) photoOn(true);
  actorLoop();
}
function actorResetView(){
  ACT.orbit.target.set(0, 0.62, 0); ACT.cam.position.set(2.5, 1.5, 3.7); ACT.orbit.update();
}
function actorLoop(){
  requestAnimationFrame(actorLoop);
  if (APP.screen !== "actor") return;
  perfFrameStart();
  const now = performance.now(), dt = Math.min(0.1, (now - (ACT._last || now)) / 1000); ACT._last = now;
  motionTick(dt);
  ACT.orbit.update();
  if (typeof RIG2D !== "undefined" && RIG2D.on) rig2dRender();
  v3Render(); diagTick(); perfFrameEnd(); drsTick();
}
function actorRefresh(panelToo){
  skFK(ACT.pose, ACT.fk);
  figUpdate(ACT.fig, ACT.fk, ACT.pose, ACT.sel, ACT.hov);
  if (panelToo !== false){ renderJointPanel(true); motionPoseChanged(); }
}

function poseSnap(){ return JSON.stringify({ p: ACT.pose, m: motionSnap() }); }
function pushPoseUndo(){ ACT.undo.push(poseSnap()); if (ACT.undo.length > 80) ACT.undo.shift(); ACT.redo = []; }
function poseRestore(s){
  const o = JSON.parse(s); motionPlay(false);
  MOT.applying = true; ACT.pose = o.p; motionRestore(o.m); actorRefresh(); MOT.applying = false;
  motionGhosts();
}
function poseUndo(){ if (!ACT.undo.length) return; ACT.redo.push(poseSnap()); poseRestore(ACT.undo.pop()); }
function poseRedo(){ if (!ACT.redo.length) return; ACT.undo.push(poseSnap()); poseRestore(ACT.redo.pop()); }

const jointBase = id => id.replace(/[LR]$/, "");
const dofLabel = (id, key) => { const k = "dof_" + jointBase(id) + "_" + key; return I18N[k] ? t(k) : t("dof_" + key); };
function renderJointPanel(valuesOnly){
  const id = ACT.sel;
  if (!id){ jointPanel.innerHTML = `<div class="jp-empty"></div>`; jointPanel.querySelector(".jp-empty").textContent = t("jpEmpty"); return; }
  const J = SK[id], isRoot = !J.parent;
  const rows = isRoot ? SK_ROOT_DOF.map(d => ({ d, v: ACT.pose.root[d.key], label: t("dof_root_" + d.key) }))
                      : J.dof.map(d => ({ d, v: ACT.pose.j[id][d.key], label: dofLabel(id, d.key) }));
  if (valuesOnly && jointPanel.dataset.joint === id && jointPanel.dataset.lang === currentLang && jointPanel.dataset.free === String(SK_FREE)){
    rows.forEach((r, i) => {
      const row = jointPanel.querySelectorAll(".jp-row")[i]; if (!row) return;
      const inp = row.querySelector("input"); if (document.activeElement !== inp) inp.value = r.v;
      row.querySelector(".jp-val").textContent = fmtDof(r.d, r.v);
      const near = isRoot ? 0 : dofNearEdge(r.d, r.v); row.classList.toggle("warn", near >= 0.85 && near < 0.98); row.classList.toggle("limit", near >= 0.98);
    });
    return;
  }
  jointPanel.dataset.joint = id; jointPanel.dataset.lang = currentLang; jointPanel.dataset.free = String(SK_FREE);
  jointPanel.innerHTML = `<div class="jp-title"></div><div class="jp-kind"></div><div class="jp-rows"></div><button type="button" class="jp-zero"></button>`;
  jointPanel.querySelector(".jp-title").textContent = t("j_" + id);
  jointPanel.querySelector(".jp-kind").textContent = t("kind_" + J.kind);
  const box = jointPanel.querySelector(".jp-rows");
  rows.forEach(r => {
    const row = document.createElement("div"); row.className = "jp-row";
    row.innerHTML = `<div class="jp-top"><span class="jp-lab"></span><span class="jp-val"></span></div><input type="range"><div class="jp-range"></div>`;
    row.querySelector(".jp-lab").textContent = r.label;
    const inp = row.querySelector("input");
    const L = isRoot ? r.d : dofLim(r.d);
    Object.assign(inp, { min: L.min, max: L.max, step: r.d.step || 1, value: r.v });
    row.querySelector(".jp-range").textContent = fmtDof(r.d, L.min) + " ~ " + fmtDof(r.d, L.max) + (!isRoot && SK_FREE ? "  " + t("jpHumanRange") + " " + fmtDof(r.d, r.d.min) + " ~ " + fmtDof(r.d, r.d.max) : "");
    inp.addEventListener("pointerdown", pushPoseUndo);
    inp.addEventListener("keydown", e => { if (e.key.startsWith("Arrow")) pushPoseUndo(); });
    inp.addEventListener("input", () => {
      const v = +inp.value;
      if (isRoot) ACT.pose.root[r.d.key] = v; else ACT.pose.j[id][r.d.key] = v;
      actorRefresh();
    });
    box.appendChild(row);
  });
  const z = jointPanel.querySelector(".jp-zero"); z.textContent = t("jpZero");
  z.addEventListener("click", () => {
    pushPoseUndo();
    if (isRoot) SK_ROOT_DOF.forEach(d => ACT.pose.root[d.key] = 0); else J.dof.forEach(d => ACT.pose.j[id][d.key] = 0);
    actorRefresh();
  });
  renderJointPanel(true);
}
function fmtDof(d, v){ return d.unit === "m" ? (+v).toFixed(2) + "m" : Math.round(v) + "°"; }

const _ray = new THREE.Raycaster(), _mouse = new THREE.Vector2(), _plane = new THREE.Plane(), _hit = new THREE.Vector3();
function setMouse(e){ const r = V3.renderer.domElement.getBoundingClientRect(); _mouse.set(((e.clientX - r.left)/r.width)*2 - 1, -((e.clientY - r.top)/r.height)*2 + 1); _ray.setFromCamera(_mouse, ACT.cam); }
function toScreen(v){ const r = V3.renderer.domElement.getBoundingClientRect(); const p = v.clone().project(ACT.cam); return { x: r.left + (p.x*0.5+0.5)*r.width, y: r.top + (-p.y*0.5+0.5)*r.height, z: p.z, depth: v.distanceTo(ACT.cam.position) }; }
function pxRadius(worldR, depth){ return worldR * (V3.renderer.domElement.clientHeight / 2) / Math.tan(ACT.cam.fov * Math.PI / 360) / Math.max(0.05, depth); }
function pickTarget(e){
  const mx = e.clientX, my = e.clientY, F = ACT.fig;
  const cand = Object.keys(F.joints).map(id => { const pos = id === "head" ? ACT.fk.headC.pos : ACT.fk[id].pos, s = toScreen(pos);
    return { id, s, pr: pxRadius(id === "head" ? 0.13 : FIG_JOINT_R[id], s.depth), d: Math.hypot(s.x - mx, s.y - my) }; }).filter(c => c.s.z <= 1);
  const pickJ = slack => { let b = null; for (const c of cand){ if (c.d > slack(c.pr)) continue; const score = c.d - c.pr;
    if (!b || score < b.score - 0.5 || (Math.abs(score - b.score) <= 0.5 && c.s.depth < b.depth)) b = { kind: "joint", id: c.id, score, depth: c.s.depth }; } return b; };
  setMouse(e);
  const meshes = Object.values(F.joints).concat([F.head], F.bones);
  const hit = _ray.intersectObjects(meshes, false)[0];
  if (hit){
    const o = hit.object;
    if (o === F.head) return { kind: "joint", id: "head", score: 0, depth: hit.distance };
    const jid = Object.keys(F.joints).find(k => F.joints[k] === o);
    if (jid) return { kind: "joint", id: jid, score: 0, depth: hit.distance };
    const idx = F.bones.indexOf(o), m = o, A = ACT.fk[m.userData.a].pos, B = ACT.fk[m.userData.b].pos, AB = B.clone().sub(A);
    for (const [jid, P] of [[m.userData.a, A], [m.userData.b, B]]){
      if (F.joints[jid] && hit.point.distanceTo(P) < Math.max(FIG_JOINT_R[jid] * 1.15, m.userData.r * 1.3)) return { kind: "joint", id: jid, score: 0, depth: hit.distance };
    }
    const f = Math.max(0, Math.min(1, hit.point.clone().sub(A).dot(AB) / (AB.lengthSq() || 1)));
    return { kind: "bone", idx, mover: m.userData.mover, name: m.userData.name, point: A.clone().addScaledVector(AB, f), score: 0, depth: hit.distance };
  }
  let best = pickJ(pr => pr + 2);
  if (best) return best;
  F.bones.forEach((m, idx) => {
    const A = ACT.fk[m.userData.a].pos, B = ACT.fk[m.userData.b].pos, sa = toScreen(A), sb = toScreen(B);
    if (sa.z > 1 || sb.z > 1) return;
    const vx = sb.x - sa.x, vy = sb.y - sa.y, L2 = vx*vx + vy*vy || 1;
    const f = Math.max(0, Math.min(1, ((mx - sa.x)*vx + (my - sa.y)*vy) / L2));
    const d = Math.hypot(sa.x + vx*f - mx, sa.y + vy*f - my), depth = sa.depth + (sb.depth - sa.depth)*f;
    if (d > Math.max(pxRadius(m.userData.r, depth) + 5, 8)) return;
    if (!best || d < best.score - 0.5 || (Math.abs(d - best.score) <= 0.5 && depth < best.depth))
      best = { kind: "bone", idx, mover: m.userData.mover, name: m.userData.name, point: A.clone().lerp(B, f), score: d, depth };
  });
  return best || pickJ(pr => Math.max(pr + 8, 12));
}
function targetLabel(T){
  if (T.kind === "joint") return t("j_" + T.id);
  return (T.mover === "body" ? t("bone_body") : t("j_" + T.mover)) + " · " + t("bone_" + T.name);
}
const hoverLabel = document.getElementById("actor-hover");
function setHover(T, e){
  const key = T ? (T.kind === "joint" ? "j:" + T.id : "b:" + T.idx) : "";
  if (key !== ACT.hovKey){ ACT.hovKey = key; ACT.hov = T; actorRefresh(false); }
  if (T && e){ hoverLabel.textContent = targetLabel(T); hoverLabel.style.left = (e.clientX + 14) + "px"; hoverLabel.style.top = (e.clientY + 12) + "px"; hoverLabel.hidden = false; }
  else hoverLabel.hidden = true;
}
function bindActorInput(){
  const el = V3.renderer.domElement;
  let down = null;
  el.addEventListener("pointerdown", e => {
    if (APP.screen !== "actor" || e.button !== 0) return;
    if (SPACE_PAN.held) return;
    const T = pickTarget(e);
    down = { x: e.clientX, y: e.clientY, hit: !!T };
    if (!T) return;
    motionPlay(false);
    ACT.orbit.enabled = false;
    const selId = T.kind === "joint" ? T.id : (T.mover === "body" ? "pelvis" : T.mover);
    if (ACT.sel !== selId){ ACT.sel = selId; actorRefresh(); renderJointPanel(); }
    let chain, p0;
    if (T.kind === "joint"){ chain = IK_CHAINS[T.id]; p0 = (T.id === "head" ? ACT.fk.headC.pos : ACT.fk[T.id].pos).clone(); if (T.id === "head") chain = IK_CHAINS.head; }
    else if (T.mover === "body"){ chain = "body"; p0 = T.point.clone(); }
    else {
      const J = ACT.fk[T.mover], off = T.point.clone().sub(J.pos).applyQuaternion(J.q.clone().invert());
      chain = { endJoint: T.mover, endOff: off, dofs: BONE_DOFS[T.mover], rotDamp: 2e-6 }; p0 = T.point.clone();
    }
    if (!chain) return;
    _plane.setFromNormalAndCoplanarPoint(ACT.cam.getWorldDirection(new THREE.Vector3()), p0);
    ACT.drag = { chain, label: targetLabel(T), p0, root0: { ...ACT.pose.root }, feet: { L: ACT.fk.ankleL.pos.clone(), R: ACT.fk.ankleR.pos.clone() }, started: false };
    el.setPointerCapture(e.pointerId);
  }, true);
  el.addEventListener("pointermove", e => {
    if (APP.screen !== "actor") return;
    if (!ACT.drag){
      if (SPACE_PAN.held || e.buttons){ setHover(null); return; }
      const T = pickTarget(e); setHover(T, e); el.style.cursor = T ? "grab" : ""; return;
    }
    setMouse(e); if (!_ray.ray.intersectPlane(_plane, _hit)) return;
    const D = ACT.drag;
    if (!D.started){ if (Math.hypot(e.clientX - down.x, e.clientY - down.y) < 3) return; D.started = true; pushPoseUndo(); el.style.cursor = "grabbing"; }
    if (D.chain === "body"){
      const dv = _hit.clone().sub(D.p0);
      ACT.pose.root.x = Math.max(-3, Math.min(3, D.root0.x + dv.x));
      ACT.pose.root.y = Math.max(-0.9, Math.min(0.6, D.root0.y + dv.y));
      ACT.pose.root.z = Math.max(-3, Math.min(3, D.root0.z + dv.z));
      ikSolve(ACT.pose, "ankleL", D.feet.L, 14); ikSolve(ACT.pose, "ankleR", D.feet.R, 14);
    } else {
      ikSolve(ACT.pose, D.chain, _hit, 14);
    }
    hoverLabel.textContent = D.label; hoverLabel.style.left = (e.clientX + 14) + "px"; hoverLabel.style.top = (e.clientY + 12) + "px"; hoverLabel.hidden = false;
    actorRefresh();
  });
  const end = e => {
    if (APP.screen !== "actor") return;
    if (ACT.drag){ try { el.releasePointerCapture(e.pointerId); } catch(_){} el.style.cursor = ""; hoverLabel.hidden = true; }
    ACT.drag = null; ACT.orbit.enabled = true;
    if (down && !down.hit && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4 && ACT.sel){ ACT.sel = null; actorRefresh(); renderJointPanel(); }
    down = null;
  };
  el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
  el.addEventListener("pointerleave", () => { if (!ACT.drag) setHover(null); });
  window.addEventListener("keydown", e => {
    if (APP.screen !== "actor") return;
    const a = document.activeElement; if (a && (a.tagName === "INPUT" && a.type !== "range" || a.tagName === "TEXTAREA" || a.tagName === "SELECT")) return;
    if ((e.ctrlKey || e.metaKey) && (e.code === "KeyZ" || e.key.toLowerCase() === "z")){ e.preventDefault(); e.shiftKey ? poseRedo() : poseUndo(); }
    if (e.key === "Escape" && ACT.sel){ ACT.sel = null; actorRefresh(); renderJointPanel(); }
  });
}

function poseToJson(){ return JSON.stringify({ kind: "dd-pose", version: 1, about: FILE_ABOUT.pose, skeleton: "dd-human-19", body: SK_BODY, freeRange: SK_FREE, pose: ACT.pose }, null, 2); }
function poseLoadJson(text){
  const data = JSON.parse(text);
  if (data && data.kind === "dd-motion"){ motionLoadJson(data); return "motion"; }
  if (data && data.kind === "dd-pack"){ packLoadData(data); packToggle(true); return "pack"; }
  if (data && data.kind === "dd-session"){
    PACK.items = []; if (data.pack) { PACK.name = data.pack.name || ""; packLoadData(data.pack); }
    if (data.motion && data.motion.keys && data.motion.keys.length) motionLoadJson(data.motion); else if (data.pose) { pushPoseUndo(); ACT.pose = poseNormalize(data.pose); actorRefresh(); }
    packRender(); return "session";
  }
  const src = data && data.pose ? data.pose : data;
  if (!src || (!src.j && !src.root)) throw new Error("not a pose");
  if (data && typeof data.freeRange === "boolean") setFreeRange(data.freeRange);
  pushPoseUndo(); ACT.pose = poseNormalize(src); actorRefresh();
  return "pose";
}
function fillPresetSelect(){
  const s = document.getElementById("pose-preset"); const v = s.value || "";
  s.innerHTML = "";
  [["", "presetPick"], ["stand", "presetStand"], ["tpose", "presetT"], ["aim", "presetAim"]].forEach(([k, lab]) => { const o = document.createElement("option"); o.value = k; o.textContent = t(lab); s.appendChild(o); });
  s.value = v;
}
document.getElementById("pose-preset").addEventListener("change", e => {
  const k = e.target.value; if (!k) return;
  if (ACT.inited){ pushPoseUndo(); ACT.pose = POSE_PRESETS[k](); actorRefresh(); }
  e.target.value = "";
});
document.getElementById("pose-save").addEventListener("click", () => { saveTextFile(POSE_FILE_NAME, poseToJson()); fileCard("pose", POSE_FILE_NAME, t("sumJoints") + " " + poseMovedCount()); });
document.getElementById("pose-open").addEventListener("click", () => document.getElementById("pose-input").click());
document.getElementById("pose-input").addEventListener("change", e => {
  const f = e.target.files[0]; if (!f) return;
  readTextFile(f, text => { try {
    const kind = poseLoadJson(text);
    fileCard(kind === "session" ? "motion" : kind, f.name, kind === "motion" ? motionDetail(MOT.keys, MOT.dur) : kind === "pack" ? t("packCount") + " " + PACK.items.length : "", true);
  } catch(err){ alert(t("cantReadFile") + err.message); } });
  e.target.value = "";
});
function setFreeRange(on){
  SK_FREE = !!on;
  const b = document.getElementById("free-range"); b.textContent = t(SK_FREE ? "freeOn" : "freeOff"); b.classList.toggle("on", SK_FREE);
  if (ACT.inited){ renderJointPanel(); actorRefresh(); }
}
document.getElementById("free-range").addEventListener("click", () => setFreeRange(!SK_FREE));
document.getElementById("pose-undo").addEventListener("click", poseUndo);
document.getElementById("pose-redo").addEventListener("click", poseRedo);
document.getElementById("actor-reset-view").addEventListener("click", () => { if (ACT.inited) actorResetView(); });
document.getElementById("actor-lang").addEventListener("click", toggleLang);
function showToastA(msg, ms){ const el = document.getElementById("actor-toast"); el.textContent = msg; el.classList.add("show"); clearTimeout(showToastA._t); showToastA._t = setTimeout(() => el.classList.remove("show"), ms || 1600); }

onScreen("actor", () => {
  if (!v3Check()){ v3ShowNoWebgl(); showScreen("start"); return; }
  if (typeof orbit !== "undefined" && orbit) orbit.enabled = false;
  const first = !ACT.inited;
  actorInit();
  if (!first){ v3Ensure(actorView); V3.scene = ACT.scene; V3.camera = ACT.cam; v3Resize(); ACT.orbit.enabled = true; }
  perfEv(t("ev_enterActor")); perfResume(); drsResume();
  renderJointPanel();
}, () => { if (ACT.orbit) ACT.orbit.enabled = false; ACT.drag = null; hoverLabel.hidden = true; });
onLangChange(() => { fillPresetSelect(); setFreeRange(SK_FREE); if (ACT.inited) renderJointPanel(); const b = document.getElementById("actor-lang"); if (b) b.textContent = langLabel(); });
autosaveRegister("actor", () => {
  if (!ACT.inited) return null;
  if (MOT.keys.length || PACK.items.length)
    return { json: JSON.stringify({ kind: "dd-session", motion: motionToObj(), pack: packToObj(), pose: ACT.pose }),
      summary: t("sumMotion") + " · " + t("sumKeys") + " " + MOT.keys.length + (PACK.items.length ? " · " + t("packCount") + " " + PACK.items.length : "") };
  let moved = 0; for (const id in ACT.pose.j) if (Object.values(ACT.pose.j[id]).some(v => Math.abs(v) > 0.5)) moved++;
  return { json: poseToJson(), summary: t("sumPose") + " · " + t("sumJoints") + " " + moved };
});
onRecentOpen("actor", json => { setTimeout(() => { try { poseLoadJson(json); ACT.undo = []; } catch(e){} }, 0); });

PERF_ACTIVE = () => inLiveMode || APP.screen === "actor";
PERF_WHERE = (prev => () => APP.screen === "actor" ? "배우" + (ACT.drag ? " · 끌기" : "") : prev())(PERF_WHERE);

function poseMovedCount(p){
  p = p || ACT.pose; const st = POSE_PRESETS.stand(); let n = 0;
  for (const id in p.j) if (Object.keys(p.j[id]).some(k => Math.abs(p.j[id][k] - st.j[id][k]) > 0.5)) n++;
  return n;
}
flowSteps("actor", [
  { key: "fsGet", tut: 0,  color: "get",  target: "mot-lib", check: () => MOT.keys.length > 0 || FLOW.flags.libOpened },
  { key: "fsPose", tut: 1, color: "make", target: "pose-preset", check: () => ACT.inited && (MOT.keys.length > 0 || poseMovedCount() > 0 || Object.values(ACT.pose.root).some(v => Math.abs(v) > 0.005)) },
  { key: "fsKey", tut: 3,  color: "make", target: "mot-add",     check: () => MOT.keys.length > 0 },
  { key: "fsPlay", tut: 3, color: "edit", target: "mot-play",    check: () => MOT.keys.length >= 2 && FLOW.flags.played },
  { key: "fsSave", tut: 3, color: "save", target: "mot-save",    check: () => MOT.keys.length > 0 && MOT.savedSig === motionSig() },
  { key: "fsPack", tut: 6, color: "save", target: "mot-pack",    check: () => MOT.keys.length > 0 && PACK.items.some(it => it.name === MOT.name && JSON.stringify(it.keys) === JSON.stringify(MOT.keys)) },
]);

fillPresetSelect();
applyLang();
appStart();
