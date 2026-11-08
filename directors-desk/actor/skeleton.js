"use strict";

const SK_BODY = { upperArm: 0.31, forearm: 0.29, thigh: 0.45, shin: 0.45, ankleY: 0.05, shoulderHalf: 0.18, shoulderY: 1.42, hipY: 0.95,
  hipHalf: 0.1, chestY: 1.30, neckY: 1.50, headY: 1.67, hand: 0.08, foot: 0.14 };

const D = (key, axis, sign, min, max, mir) => ({ key, axis, sign, min, max, mir: !!mir });
const SK_LEFT = [
  { id:"clavL",     parent:"chest",     at:[0.06, 1.41, 0],  kind:"glide", dof:[D("shrug","z",1,-10,30,true), D("reach","y",-1,-15,25,true)] },
  { id:"shoulderL", parent:"clavL",     at:[0.18, 1.42, 0],  kind:"ball",  dof:[D("flex","x",-1,-50,180), D("abd","z",1,-40,180,true), D("rot","y",1,-90,90,true)] },
  { id:"elbowL",    parent:"shoulderL", at:[0.18, 1.11, 0],  kind:"hinge", dof:[D("flex","x",-1,0,145), D("twist","y",1,-80,80,true)] },
  { id:"wristL",    parent:"elbowL",    at:[0.18, 0.82, 0],  kind:"ball",  dof:[D("flex","x",-1,-70,80), D("dev","z",1,-30,30,true)] },
  { id:"hipL",      parent:"pelvis",    at:[0.10, 0.95, 0],  kind:"ball",  dof:[D("flex","x",-1,-20,120), D("abd","z",1,-30,45,true), D("rot","y",1,-40,45,true)] },
  { id:"kneeL",     parent:"hipL",      at:[0.10, 0.50, 0],  kind:"hinge", dof:[D("flex","x",1,0,135)] },
  { id:"ankleL",    parent:"kneeL",     at:[0.10, 0.05, 0],  kind:"hinge", dof:[D("lift","x",-1,-45,20), D("tilt","z",1,-20,30,true)] },
];
const SK_JOINTS = [
  { id:"pelvis", parent:null,    at:[0, 0.95, 0], kind:"root", dof:[] },
  { id:"spine",  parent:"pelvis",at:[0, 1.10, 0], kind:"ball", dof:[D("flex","x",1,-30,60), D("side","z",1,-30,30), D("twist","y",-1,-30,30)] },
  { id:"chest",  parent:"spine", at:[0, 1.30, 0], kind:"ball", dof:[D("flex","x",1,-20,40), D("side","z",1,-20,20), D("twist","y",-1,-30,30)] },
  { id:"neck",   parent:"chest", at:[0, 1.50, 0], kind:"ball", dof:[D("flex","x",1,-40,50), D("side","z",1,-30,30)] },
  { id:"head",   parent:"neck",  at:[0, 1.56, 0], kind:"pivot", dof:[D("turn","y",-1,-70,70), D("nod","x",1,-30,35)] },
  ...SK_LEFT,
  ...SK_LEFT.map(j => ({ ...j, id: j.id.replace(/L$/, "R"), parent: j.parent.replace(/L$/, "R"), at: [-j.at[0], j.at[1], j.at[2]],
    dof: j.dof.map(d => ({ ...d, sign: d.mir ? -d.sign : d.sign })) })),
];
const SK = {};
SK_JOINTS.forEach(j => { SK[j.id] = j; j.off = j.parent ? new THREE.Vector3(j.at[0]-SK[j.parent].at[0], j.at[1]-SK[j.parent].at[1], j.at[2]-SK[j.parent].at[2]) : new THREE.Vector3(...j.at); });
const SK_ROOT_DOF = [
  { key:"x", min:-3, max:3, step:0.01, unit:"m" }, { key:"y", min:-0.9, max:0.6, step:0.01, unit:"m" }, { key:"z", min:-3, max:3, step:0.01, unit:"m" },
  { key:"yaw", min:-180, max:180 }, { key:"pitch", min:-90, max:90 }, { key:"roll", min:-90, max:90 },
];
const SK_TIPS = {
  handL: { from:"wristL", off: new THREE.Vector3(0, -SK_BODY.hand, 0) }, handR: { from:"wristR", off: new THREE.Vector3(0, -SK_BODY.hand, 0) },
  toeL:  { from:"ankleL", off: new THREE.Vector3(0, -0.03, SK_BODY.foot) }, toeR: { from:"ankleR", off: new THREE.Vector3(0, -0.03, SK_BODY.foot) },
  headC: { from:"head",   off: new THREE.Vector3(0, 0.11, 0) },
};

function poseZero(){
  const p = { root: { x:0, y:0, z:0, yaw:0, pitch:0, roll:0 }, j: {} };
  SK_JOINTS.forEach(j => { if (j.dof.length){ p.j[j.id] = {}; j.dof.forEach(d => p.j[j.id][d.key] = 0); } });
  return p;
}
function poseClone(p){ return JSON.parse(JSON.stringify(p)); }
function poseNormalize(src){
  const p = poseZero();
  if (src && src.root) for (const d of SK_ROOT_DOF){ const v = +src.root[d.key]; if (isFinite(v)) p.root[d.key] = Math.max(d.min, Math.min(d.max, v)); }
  if (src && src.j) SK_JOINTS.forEach(j => j.dof.forEach(d => { const v = src.j[j.id] && +src.j[j.id][d.key]; if (isFinite(v)) p.j[j.id][d.key] = Math.max(-180, Math.min(180, v)); }));
  return p;
}
let SK_FREE = false;
const FREE_LIM = { min: -180, max: 180 };
const dofLim = d => SK_FREE ? FREE_LIM : d;
const clampDof = (d, v) => { const L = dofLim(d); return Math.max(L.min, Math.min(L.max, v)); };

function dofNearEdge(d, v){
  if (v > d.max + 1e-6 || v < d.min - 1e-6) return 1.5;
  if (v > 0 && d.max > 0) return v / d.max;
  if (v < 0 && d.min < 0) return v / d.min;
  return 0;
}
function jointNearEdge(p, id){
  const j = SK[id]; let m = 0;
  j.dof.forEach(d => { m = Math.max(m, dofNearEdge(d, p.j[id][d.key])); });
  return m;
}

const _ax = { x: new THREE.Vector3(1,0,0), y: new THREE.Vector3(0,1,0), z: new THREE.Vector3(0,0,1) };
const _q = new THREE.Quaternion();
function dofQuat(j, vals, out){
  out.identity();
  for (const d of j.dof){ _q.setFromAxisAngle(_ax[d.axis], d.sign * vals[d.key] * Math.PI/180); out.multiply(_q); }
  return out;
}
function skFK(p, out){
  out = out || {};
  for (const j of SK_JOINTS){
    const o = out[j.id] || (out[j.id] = { pos: new THREE.Vector3(), q: new THREE.Quaternion(), lq: new THREE.Quaternion() });
    if (!j.parent){
      o.q.setFromEuler(new THREE.Euler(p.root.pitch*Math.PI/180, p.root.yaw*Math.PI/180, p.root.roll*Math.PI/180, "YXZ"));
      o.pos.set(j.at[0] + p.root.x, j.at[1] + p.root.y, j.at[2] + p.root.z);
    } else {
      const P = out[j.parent];
      dofQuat(j, p.j[j.id], o.lq);
      o.q.copy(P.q).multiply(o.lq);
      o.pos.copy(j.off).applyQuaternion(P.q).add(P.pos);
    }
  }
  for (const k in SK_TIPS){
    const tdef = SK_TIPS[k], F = out[tdef.from];
    const o = out[k] || (out[k] = { pos: new THREE.Vector3(), q: F.q });
    o.pos.copy(tdef.off).applyQuaternion(F.q).add(F.pos); o.q = F.q;
  }
  return out;
}

const IK_CHAINS = {};
for (const s of ["L", "R"]){
  IK_CHAINS["wrist"+s]    = { end:"wrist"+s,    dofs:[["shoulder"+s,"flex"],["shoulder"+s,"abd"],["elbow"+s,"flex"]] };
  IK_CHAINS["ankle"+s]    = { end:"ankle"+s,    dofs:[["hip"+s,"flex"],["hip"+s,"abd"],["knee"+s,"flex"]] };
  IK_CHAINS["elbow"+s]    = { end:"elbow"+s,    dofs:[["shoulder"+s,"flex"],["shoulder"+s,"abd"]] };
  IK_CHAINS["knee"+s]     = { end:"knee"+s,     dofs:[["hip"+s,"flex"],["hip"+s,"abd"]] };
  IK_CHAINS["shoulder"+s] = { end:"shoulder"+s, dofs:[["clav"+s,"shrug"],["clav"+s,"reach"]] };
  IK_CHAINS["clav"+s]     = { end:"chest",      dofs:[["spine","flex"],["spine","side"]] };
  IK_CHAINS["hip"+s] = "body";
}
const BONE_DOFS = {
  spine: [["spine","flex"],["spine","side"]], chest: [["chest","flex"],["chest","side"]], neck: [["neck","flex"],["neck","side"]],
};
for (const s of ["L", "R"]){
  BONE_DOFS["clav"+s] = [["clav"+s,"shrug"],["clav"+s,"reach"]];
  BONE_DOFS["shoulder"+s] = [["shoulder"+s,"flex"],["shoulder"+s,"abd"]];
  BONE_DOFS["elbow"+s] = [["elbow"+s,"flex"],["shoulder"+s,"rot"]];
  BONE_DOFS["wrist"+s] = [["wrist"+s,"flex"],["wrist"+s,"dev"]];
  BONE_DOFS["hip"+s] = [["hip"+s,"flex"],["hip"+s,"abd"]];
  BONE_DOFS["knee"+s] = [["knee"+s,"flex"],["hip"+s,"rot"]];
  BONE_DOFS["ankle"+s] = [["ankle"+s,"lift"],["ankle"+s,"tilt"]];
}
IK_CHAINS.head   = { end:"headC", dofs:[["neck","flex"],["neck","side"],["head","nod"]] };
IK_CHAINS.neck   = { end:"neck",  dofs:[["spine","flex"],["spine","side"],["chest","flex"],["chest","side"]] };
IK_CHAINS.chest  = { end:"chest", dofs:[["spine","flex"],["spine","side"]] };
IK_CHAINS.spine  = "body";
IK_CHAINS.pelvis = "body";
const _fkA = {}, _fkB = {}, _endV = new THREE.Vector3();
function ikSolve(p, chainId, target, iters){
  const C = typeof chainId === "string" ? IK_CHAINS[chainId] : chainId, n = C.dofs.length, h = 0.5;
  const endPos = f => C.endJoint ? _endV.copy(C.endOff).applyQuaternion(f[C.endJoint].q).add(f[C.endJoint].pos) : f[C.end].pos;
  const getD = ([jid, key]) => SK[jid].dof.find(d => d.key === key);
  const last = C.dofs[n-1], lastD = getD(last);
  if (SK[last[0]].kind === "hinge" && lastD.key === "flex" && lastD.min === 0 && Math.abs(p.j[last[0]][last[1]]) < 3) p.j[last[0]][last[1]] = 3;
  for (let it = 0; it < (iters || 12); it++){
    const cur = endPos(skFK(p, _fkA)).clone();
    const e = target.clone().sub(cur);
    if (e.lengthSq() < 1e-6) break;
    const J = [];
    for (const dk of C.dofs){
      const d = getD(dk), v0 = p.j[dk[0]][dk[1]];
      p.j[dk[0]][dk[1]] = v0 + h;
      const pp = endPos(skFK(p, _fkB));
      J.push(pp.clone().sub(cur).divideScalar(h));
      p.j[dk[0]][dk[1]] = v0;
    }
    const A = [], b = [];
    for (let r = 0; r < n; r++){
      A.push([]); b.push(J[r].dot(e));
      for (let c = 0; c < n; c++) A[r].push(J[r].dot(J[c]) + (r === c ? (C.dofs[r][1] === "rot" ? (C.rotDamp != null ? C.rotDamp : 4e-5) : 1e-6) : 0));
    }
    const x = solveSmall(A, b); if (!x) break;
    C.dofs.forEach((dk, i) => { const d = getD(dk); const step = Math.max(-15, Math.min(15, x[i])); p.j[dk[0]][dk[1]] = clampDof(d, p.j[dk[0]][dk[1]] + step); });
  }
  return p;
}
function solveSmall(A, b){
  const n = b.length, M = A.map((r, i) => r.concat([b[i]]));
  for (let c = 0; c < n; c++){
    let piv = c; for (let r = c+1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++){ if (r === c) continue; const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}
