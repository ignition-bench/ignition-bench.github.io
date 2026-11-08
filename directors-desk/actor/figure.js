"use strict";

const FIG_COL = { bone: 0xdfe5ea, joint: 0x9aa7b3, drag: 0x7fa8d6, sel: 0x2f6fed, warn: 0xffc23d, limit: 0xff5b4a, nose: 0x30343a, hover: 0x9cc3ff };
const FIG_BONES = [
  ["hipL","hipR",0.04,"body","pelvisBar"], ["pelvis","spine",0.05,"body","lowerTorso"], ["spine","chest",0.05,"spine","upperTorso"],
  ["chest","neck",0.035,"chest","upperChest"], ["neck","head",0.035,"neck","neck"],
  ["clavL","clavR",0.035,"chest","collar"], ["clavL","shoulderL",0.035,"clavL","clav"], ["clavR","shoulderR",0.035,"clavR","clav"],
  ["shoulderL","elbowL",0.035,"shoulderL","upperArm"], ["elbowL","wristL",0.032,"elbowL","forearm"], ["wristL","handL",0.024,"wristL","hand"],
  ["shoulderR","elbowR",0.035,"shoulderR","upperArm"], ["elbowR","wristR",0.032,"elbowR","forearm"], ["wristR","handR",0.024,"wristR","hand"],
  ["hipL","kneeL",0.042,"hipL","thigh"], ["kneeL","ankleL",0.038,"kneeL","shin"], ["ankleL","toeL",0.03,"ankleL","foot"],
  ["hipR","kneeR",0.042,"hipR","thigh"], ["kneeR","ankleR",0.038,"kneeR","shin"], ["ankleR","toeR",0.03,"ankleR","foot"],
];
const FIG_JOINT_R = { pelvis:0.06, spine:0.065, chest:0.07, neck:0.048, head:0.035, clavL:0.034, clavR:0.034,
  shoulderL:0.045, shoulderR:0.045, elbowL:0.04, elbowR:0.04, wristL:0.042, wristR:0.042,
  hipL:0.05, hipR:0.05, kneeL:0.045, kneeR:0.045, ankleL:0.04, ankleR:0.04 };
const FIG_DRAGGABLE = new Set(Object.keys(FIG_JOINT_R));

const _up = new THREE.Vector3(0,1,0), _dv = new THREE.Vector3();
function figPlace(m, a, b, r){
  _dv.subVectors(b, a); const len = _dv.length() || 1e-4;
  m.position.copy(a).addScaledVector(_dv, 0.5);
  m.scale.set(r, len, r);
  m.quaternion.setFromUnitVectors(_up, _dv.divideScalar(len));
}
function figBuild(scene){
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 12), sph = new THREE.SphereGeometry(1, 18, 12);
  const boneMat = new THREE.MeshStandardMaterial({ color: FIG_COL.bone, roughness: 0.55 });
  const F = { group: new THREE.Group(), bones: [], joints: {}, picks: [] };
  scene.add(F.group);
  for (const [a, b, r, mover, name] of FIG_BONES){
    const m = new THREE.Mesh(cyl, new THREE.MeshStandardMaterial({ color: FIG_COL.bone, roughness: 0.55 })); m.castShadow = true;
    m.userData = { a, b, r, mover, name }; F.group.add(m); F.bones.push(m);
  }
  for (const id in FIG_JOINT_R){
    const m = new THREE.Mesh(sph, new THREE.MeshStandardMaterial({ color: FIG_COL.joint, roughness: 0.5 }));
    m.scale.setScalar(FIG_JOINT_R[id]); m.castShadow = true; F.group.add(m); F.joints[id] = m;
    const pick = new THREE.Mesh(sph, boneMat); pick.visible = false; pick.scale.setScalar(Math.max(0.065, FIG_JOINT_R[id] * 1.7));
    pick.userData.joint = id; F.group.add(pick); F.picks.push(pick);
  }
  F.head = new THREE.Mesh(sph, boneMat); F.head.scale.setScalar(0.13); F.head.castShadow = true; F.group.add(F.head);
  const headPick = new THREE.Mesh(sph, boneMat); headPick.visible = false; headPick.scale.setScalar(0.14); headPick.userData.joint = "head"; F.group.add(headPick); F.picks.push(headPick); F.headPick = headPick;
  F.nose = new THREE.Mesh(sph, new THREE.MeshStandardMaterial({ color: FIG_COL.nose, roughness: 0.6 })); F.nose.scale.setScalar(0.03); F.group.add(F.nose);
  return F;
}
function figBuildGhost(scene, color){
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 10), sph = new THREE.SphereGeometry(1, 14, 10);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, transparent: true, opacity: 0.3, depthWrite: false });
  const G = { group: new THREE.Group(), bones: [], joints: {} };
  G.group.renderOrder = 2; scene.add(G.group);
  for (const [a, b, r] of FIG_BONES){ const m = new THREE.Mesh(cyl, mat); m.userData = { a, b, r }; G.group.add(m); G.bones.push(m); }
  for (const id in FIG_JOINT_R){ const m = new THREE.Mesh(sph, mat); m.scale.setScalar(FIG_JOINT_R[id]); G.group.add(m); G.joints[id] = m; }
  G.head = new THREE.Mesh(sph, mat); G.head.scale.setScalar(0.13); G.group.add(G.head);
  return G;
}
function figUpdateGhost(G, fk){
  for (const m of G.bones) figPlace(m, fk[m.userData.a].pos, fk[m.userData.b].pos, m.userData.r);
  for (const id in G.joints) G.joints[id].position.copy(fk[id].pos);
  G.head.position.copy(fk.headC.pos);
}
function figUpdate(F, fk, pose, sel, hov){
  F.bones.forEach((m, i) => {
    figPlace(m, fk[m.userData.a].pos, fk[m.userData.b].pos, m.userData.r);
    m.material.color.setHex(hov && hov.kind === "bone" && hov.idx === i ? FIG_COL.hover : FIG_COL.bone);
  });
  for (const id in F.joints){
    const m = F.joints[id]; m.position.copy(fk[id].pos);
    const near = SK[id].dof.length ? jointNearEdge(pose, id) : 0;
    const col = near >= 0.98 ? FIG_COL.limit : near >= 0.85 ? FIG_COL.warn : id === sel ? FIG_COL.sel : FIG_COL.joint;
    m.material.color.setHex(col);
    const hovered = hov && hov.kind === "joint" && hov.id === id;
    if (hovered && col === FIG_COL.joint) m.material.color.setHex(FIG_COL.hover);
    m.scale.setScalar(FIG_JOINT_R[id] * (id === sel ? 1.35 : hovered ? 1.25 : 1));
  }
  for (const p of F.picks) p.position.copy(p === F.headPick ? fk.headC.pos : fk[p.userData.joint].pos);
  F.head.position.copy(fk.headC.pos);
  F.nose.position.set(0, 0, 0.125).applyQuaternion(fk.head.q).add(fk.headC.pos);
}
