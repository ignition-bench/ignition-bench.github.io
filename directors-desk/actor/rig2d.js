"use strict";

const RIG2D = { on: false, plane: "front", svg: null, drag: null, done: null, start: null, stuck: null };

const RIG_PERP = { front: "z", side: "x", top: "y" };
const RIG_TWIST = { front: [90, -90], side: [0, 180], top: [90, -90] };

const RIG_PTS = [
  { id: "pelvis", grp: 0, move: true },
  { id: "neck",   grp: 0, chain: ["spine", "chest"] },
  { id: "headC",  grp: 1, chain: ["neck"] },
  { id: "elbowL", grp: 2, chain: ["shoulderL"] },
  { id: "elbowR", grp: 2, chain: ["shoulderR"] },
  { id: "wristL", grp: 2, chain: ["shoulderL", "elbowL"], twistOn: "shoulderL" },
  { id: "wristR", grp: 2, chain: ["shoulderR", "elbowR"], twistOn: "shoulderR" },
  { id: "kneeL",  grp: 3, chain: ["hipL"] },
  { id: "kneeR",  grp: 3, chain: ["hipR"] },
  { id: "ankleL", grp: 3, chain: ["hipL", "kneeL"], twistOn: "hipL" },
  { id: "ankleR", grp: 3, chain: ["hipR", "kneeR"], twistOn: "hipR" },
];
const RIG_DOTS = ["shoulderL", "shoulderR", "hipL", "hipR"];
const RIG_LINES = [
  ["neck","pelvis"], ["neck","shoulderL"], ["neck","shoulderR"],
  ["shoulderL","elbowL"], ["elbowL","wristL"], ["shoulderR","elbowR"], ["elbowR","wristR"],
  ["pelvis","hipL"], ["hipL","kneeL"], ["kneeL","ankleL"],
  ["pelvis","hipR"], ["hipR","kneeR"], ["kneeR","ankleR"],
];
const RIG_GRPS = ["rigG0", "rigG1", "rigG2", "rigG3"];

function rigFlatten(pose, plane){
  const perp = RIG_PERP[plane];
  pose.root.yaw = pose.root.pitch = pose.root.roll = 0;
  for (const j of SK_JOINTS) for (const d of j.dof)
    if (d.axis !== perp) pose.j[j.id][d.key] = 0;
  if (perp === "z") for (const id of ["shoulderL", "shoulderR"]){
    const tw = SK[id].dof.find(d => d.axis === "y");
    if (tw) pose.j[id][tw.key] = clampDof(tw, RIG_TWIST.front[0]);
  }
  return pose;
}
function rigDofs(jid, plane){
  const perp = RIG_PERP[plane];
  return SK[jid].dof.map((d, idx) => ({ jid, d, idx })).filter(g => g.d.axis === perp);
}

const _rv = new THREE.Vector3(), _rv2 = new THREE.Vector3(), _rv3 = new THREE.Vector3(), _rv4 = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _rfk = {};
function rigAxis(pose, fk, jid, idx, out){
  const j = SK[jid];
  _qa.copy(fk[j.parent].q);
  for (let i = 0; i < idx; i++){
    const d = j.dof[i];
    _qb.setFromAxisAngle(_ax[d.axis], d.sign * pose.j[jid][d.key] * Math.PI / 180);
    _qa.multiply(_qb);
  }
  return out.copy(_ax[j.dof[idx].axis]).applyQuaternion(_qa).normalize();
}
function rigSweep(pose, ptId, target, dofs, iters){
  for (let it = 0; it < iters; it++){
    let moved = 0;
    for (let i = dofs.length - 1; i >= 0; i--){
      const g = dofs[i];
      skFK(pose, _rfk);
      const c = _rfk[g.jid].pos, p = _rfk[ptId].pos;
      const a = rigAxis(pose, _rfk, g.jid, g.idx, _rv4);
      const u = _rv.subVectors(p, c), w = _rv2.subVectors(target, c);
      u.addScaledVector(a, -u.dot(a));
      w.addScaledVector(a, -w.dot(a));
      if (u.lengthSq() < 1e-12 || w.lengthSq() < 1e-12) continue;
      const cross = _rv3.crossVectors(u, w);
      const deg = Math.atan2(cross.dot(a), u.dot(w)) * 180 / Math.PI;
      const was = pose.j[g.jid][g.d.key];
      const next = clampDof(g.d, was + deg * g.d.sign);
      pose.j[g.jid][g.d.key] = next;
      moved = Math.max(moved, Math.abs(next - was));
    }
    if (moved < 1e-7) break;
  }
  skFK(pose, _rfk);
  return _rfk[ptId].pos.distanceTo(target);
}
function rigSeeds(d, cur){
  const a = [cur];
  for (let i = 0; i <= 4; i++){ const v = d.min + (d.max - d.min) * (i / 4); if (!a.some(x => Math.abs(x - v) < 1e-9)) a.push(v); }
  return a;
}
function rigFit(pose, ptId, target, dofs, iters){
  if (!dofs.length) return;
  iters = iters || 8;
  if (dofs.length < 2){ rigSweep(pose, ptId, target, dofs, iters); return; }
  const lists = dofs.map(g => rigSeeds(g.d, pose.j[g.jid][g.d.key]));
  let combos = [[]];
  for (const L of lists){
    const next = [];
    for (const c of combos) for (const v of L){ if (next.length < 64) next.push(c.concat(v)); }
    combos = next;
  }
  let best = null, bestErr = Infinity;
  for (const combo of combos){
    const q = poseClone(pose);
    combo.forEach((v, i) => { q.j[dofs[i].jid][dofs[i].d.key] = clampDof(dofs[i].d, v); });
    const e = rigSweep(q, ptId, target, dofs, iters);
    if (e < bestErr - 1e-6){ bestErr = e; best = q; if (e < 1e-5) break; }
  }
  if (best){ for (const k in best.j) for (const kk in best.j[k]) pose.j[k][kk] = best.j[k][kk]; }
}

function rigMovePoint(pose, ptId, target, plane, twist){
  const P = RIG_PTS.find(p => p.id === ptId); if (!P) return;
  if (P.move){
    skFK(pose, _rfk);
    const d = _rv.subVectors(target, _rfk.pelvis.pos);
    pose.root.x += d.x; pose.root.y += d.y; pose.root.z += d.z;
    return;
  }
  const perp = RIG_PERP[plane];
  const before = poseClone(pose);
  skFK(before, _rfk); const was = {}; for (const id in _rfk) was[id] = _rfk[id].pos[perp];
  rigChainFit(pose, P, target, plane, twist, true);
  if (P.twistOn){
    skFK(pose, _rfk);
    let out = 0; for (const id in _rfk) out = Math.max(out, Math.abs(_rfk[id].pos[perp] - was[id]));
    if (out > 1e-9){
      for (const k in before.j) for (const kk in before.j[k]) pose.j[k][kk] = before.j[k][kk];
      pose.root.x = before.root.x; pose.root.y = before.root.y; pose.root.z = before.root.z;
      rigChainFit(pose, P, target, plane, twist, false);
    }
  }
}
function rigChainFit(pose, P, target, plane, twist, useTwist){
  let dofs = [];
  for (const jid of P.chain){
    let d = rigDofs(jid, plane);
    if (!d.length && P.twistOn && useTwist){
      const tw = SK[P.twistOn].dof.find(x => x.axis === "y");
      if (tw) pose.j[P.twistOn][tw.key] = clampDof(tw, twist);
      d = SK[jid].dof.map((x, idx) => ({ jid, d: x, idx })).filter(g => g.d.axis !== "y");
    }
    dofs = dofs.concat(d);
  }
  rigFit(pose, P.id, target, dofs, 10);
}
function rigPickTwist(ptId, target, plane){
  const P = RIG_PTS.find(p => p.id === ptId);
  if (!P || !P.twistOn) return 0;
  let best = RIG_TWIST[plane][0], bestErr = Infinity;
  for (const tw of RIG_TWIST[plane]){
    const trial = poseClone(ACT.pose);
    rigMovePoint(trial, ptId, target, plane, tw);
    skFK(trial, _rfk);
    const e = _rfk[ptId].pos.distanceTo(target);
    if (e < bestErr - 1e-6){ bestErr = e; best = tw; }
  }
  return best;
}

function rigRect(){ return document.getElementById("actor-view").getBoundingClientRect(); }
function rigProject(v){
  const r = rigRect(), p = _rv.copy(v).project(ACT.cam);
  return { x: (p.x * 0.5 + 0.5) * r.width, y: (-p.y * 0.5 + 0.5) * r.height };
}
const _rray = new THREE.Raycaster(), _rplane = new THREE.Plane(), _rhit = new THREE.Vector3();
function rigUnproject(cx, cy){
  const r = rigRect();
  const n = { front: new THREE.Vector3(0,0,1), side: new THREE.Vector3(1,0,0), top: new THREE.Vector3(0,1,0) }[RIG2D.plane];
  const at = new THREE.Vector3(ACT.pose.root.x, ACT.pose.root.y, ACT.pose.root.z);
  _rplane.setFromNormalAndCoplanarPoint(n, at);
  _rray.setFromCamera({ x: ((cx - r.left) / r.width) * 2 - 1, y: -((cy - r.top) / r.height) * 2 + 1 }, ACT.cam);
  return _rray.ray.intersectPlane(_rplane, _rhit) ? _rhit.clone() : null;
}

function rig2dOn(on, plane){
  const was = RIG2D.on;
  RIG2D.on = !!on;
  if (plane) RIG2D.plane = plane;
  rig2dBuild();
  RIG2D.svg.toggleAttribute("hidden", !RIG2D.on);
  if (ACT.inited && ACT.fig) ACT.fig.group.visible = !RIG2D.on;
  if (RIG2D.on && !was){
    pushPoseUndo();
    RIG2D.root0 = { x: ACT.pose.root.x, y: ACT.pose.root.y, z: ACT.pose.root.z };
    rigFlatten(ACT.pose, RIG2D.plane);
    RIG2D.done = new Set(); RIG2D.stuck = new Set(); RIG2D.start = {};
    skFK(ACT.pose, _rfk);
    RIG_PTS.forEach(P => { RIG2D.start[P.id] = _rfk[P.id].pos.clone(); });
    actorRefresh();
  }
  if (!RIG2D.on){ RIG2D.drag = null; if (was){ rigGround(ACT.pose); actorRefresh(); } }
  rig2dRender();
}
function rigGround(pose){
  const r0 = RIG2D.root0 || { x: 0, y: 0, z: 0 };
  pose.root.x = r0.x; pose.root.z = r0.z;
  const ref = {}; skFK(poseZero(), ref);
  const base = Math.min(ref.ankleL.pos.y, ref.ankleR.pos.y, ref.toeL.pos.y, ref.toeR.pos.y);
  const f = {}; skFK(pose, f);
  const low = Math.min(f.ankleL.pos.y, f.ankleR.pos.y, f.toeL.pos.y, f.toeR.pos.y);
  pose.root.y = Math.max(-0.9, Math.min(0.6, pose.root.y + (base - low)));
}

function rig2dSetPlane(kind){
  if (!RIG2D.on || !RIG_PERP[kind] || kind === RIG2D.plane) return;
  pushPoseUndo();
  RIG2D.plane = kind;
  rigFlatten(ACT.pose, kind);
  actorRefresh(); rig2dRender();
  showToastA(t(kind === "front" ? "rigPlaneFront" : kind === "side" ? "rigPlaneSide" : "rigPlaneTop"));
}

function rig2dBuild(){
  if (RIG2D.svg) return;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = "rig2d"; svg.setAttribute("hidden", "");
  RIG2D.line = {}; RIG2D.dot = {}; RIG2D.pt = {};
  for (const [a, b] of RIG_LINES){
    const e = rigEl("line", { class: "rg-bone" }); svg.appendChild(e); RIG2D.line[a + ">" + b] = e;
  }
  RIG2D.head = rigEl("circle", { class: "rg-bone rg-head" }); svg.appendChild(RIG2D.head);
  for (const id of RIG_DOTS){ const e = rigEl("circle", { class: "rg-dot", r: 4 }); svg.appendChild(e); RIG2D.dot[id] = e; }
  for (const P of RIG_PTS){
    const g = rigEl("g", { class: "rg-pt", "data-id": P.id });
    const hit = rigEl("circle", { class: "rg-hit", r: 16 }), ring = rigEl("circle", { class: "rg-ring", r: P.move ? 10 : 8 });
    g.appendChild(hit); g.appendChild(ring); svg.appendChild(g);
    g.addEventListener("pointerdown", e => rigGrab(e, P.id));
    RIG2D.pt[P.id] = { g, hit, ring };
  }
  document.getElementById("actor-view").appendChild(svg);
  RIG2D.svg = svg;
}
const rigEl = (n, a) => { const e = document.createElementNS("http://www.w3.org/2000/svg", n); for (const k in a) e.setAttribute(k, a[k]); return e; };
function rig2dStep(){
  for (let g = 0; g < RIG_GRPS.length; g++)
    if (RIG_PTS.some(P => P.grp === g && !RIG2D.done.has(P.id))) return g;
  return RIG_GRPS.length;
}
function rig2dRender(){
  if (!RIG2D.svg) return;
  const svg = RIG2D.svg;
  if (!RIG2D.on || !ACT.inited){ svg.toggleAttribute("hidden", true); rigBarRender(); return; }
  const r = rigRect();
  svg.setAttribute("viewBox", "0 0 " + r.width + " " + r.height);
  svg.setAttribute("width", r.width); svg.setAttribute("height", r.height);
  skFK(ACT.pose, _rfk);
  const S = {}; for (const id in _rfk) S[id] = rigProject(_rfk[id].pos);
  for (const [a, b] of RIG_LINES){
    const e = RIG2D.line[a + ">" + b]; if (!e || !S[a] || !S[b]) continue;
    e.setAttribute("x1", S[a].x); e.setAttribute("y1", S[a].y); e.setAttribute("x2", S[b].x); e.setAttribute("y2", S[b].y);
  }
  const hr = Math.max(10, Math.abs(S.headC.y - S.neck.y) * 0.62);
  RIG2D.head.setAttribute("cx", S.headC.x); RIG2D.head.setAttribute("cy", S.headC.y); RIG2D.head.setAttribute("r", hr);
  for (const id of RIG_DOTS){ const e = RIG2D.dot[id]; if (e && S[id]){ e.setAttribute("cx", S[id].x); e.setAttribute("cy", S[id].y); } }
  const step = rig2dStep();
  for (const P of RIG_PTS){
    const o = RIG2D.pt[P.id], p = S[P.id]; if (!o || !p) continue;
    o.hit.setAttribute("cx", p.x); o.hit.setAttribute("cy", p.y);
    o.ring.setAttribute("cx", p.x); o.ring.setAttribute("cy", p.y);
    o.g.setAttribute("class", "rg-pt" + (RIG2D.stuck.has(P.id) ? " stuck" : "") + (RIG2D.done.has(P.id) ? " done" : "") + (P.grp === step ? " now" : "") + (P.move ? " move" : ""));
  }
  rigBarRender();
}
function rigBarRender(){
  const el = document.getElementById("rig-step"); if (!el) return;
  el.hidden = !RIG2D.on;
  if (!RIG2D.on) return;
  const step = rig2dStep(), n = RIG_PTS.filter(P => RIG2D.done.has(P.id)).length;
  el.innerHTML = step >= RIG_GRPS.length
    ? `<b class="rg-ok">${t("rigAllDone")}</b>`
    : RIG_GRPS.map((k, i) => `<span class="rg-s${i === step ? " now" : i < step ? " done" : ""}">${t(k)}</span>`).join("")
      + `<span class="rg-n">${t("rigCount").replace("{n}", n).replace("{all}", RIG_PTS.length)}</span>`;
  if (RIG2D.stuck && RIG2D.stuck.size) el.innerHTML += `<span class="rg-stuck">${t(RIG2D.plane === "front" ? "rigStuckFront" : "rigStuckSide")}</span>`;
}

function rigGrab(e, id){
  if (e.button !== 0 || !RIG2D.on) return;
  e.preventDefault(); e.stopPropagation();
  const w = rigUnproject(e.clientX, e.clientY); if (!w) return;
  pushPoseUndo();
  RIG2D.drag = { id, twist: rigPickTwist(id, w, RIG2D.plane), moved: false };
  ACT.orbit.enabled = false;
  e.target.setPointerCapture(e.pointerId);
}
window.addEventListener("pointermove", e => {
  const D = RIG2D.drag; if (!D || !RIG2D.on) return;
  const w = rigUnproject(e.clientX, e.clientY); if (!w) return;
  rigMovePoint(ACT.pose, D.id, w, RIG2D.plane, D.twist);
  skFK(ACT.pose, _rfk);
  if (_rfk[D.id].pos.distanceTo(w) > 0.04) RIG2D.stuck.add(D.id); else RIG2D.stuck.delete(D.id);
  D.moved = true;
  actorRefresh(); rig2dRender();
}, true);
window.addEventListener("pointerup", () => {
  const D = RIG2D.drag; if (!D) return;
  RIG2D.drag = null; ACT.orbit.enabled = true;
  if (D.moved){
    skFK(ACT.pose, _rfk);
    const s = RIG2D.start[D.id];
    if (!s || _rfk[D.id].pos.distanceTo(s) > 0.03) RIG2D.done.add(D.id);
    rig2dRender();
  }
}, true);
window.addEventListener("pointercancel", () => { if (RIG2D.drag){ RIG2D.drag = null; ACT.orbit.enabled = true; } }, true);
onLangChange(rigBarRender);
