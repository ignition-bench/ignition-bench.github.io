"use strict";

const LIB_VERSION = "v0.6.2";
const LIB_CATS = [
  { id: "move",   icon: "🚶", groups: ["stand", "locomote"], first: true },
  { id: "pose",   icon: "🪑", groups: ["posture", "gesture"] },
  { id: "action", icon: "🤾", groups: ["action", "react"] },
];

const V3_ = (x, y, z) => new THREE.Vector3(x, y, z);
const FOOT0 = { L: [0.10, 0.05, 0], R: [-0.10, 0.05, 0] };
const libStand = () => POSE_PRESETS.stand();
function libP(set, base){
  const p = poseClone(base || libStand());
  for (const k in set){ if (k === "root") Object.assign(p.root, set.root); else Object.assign(p.j[k], set[k]); }
  return p;
}
function libLevelFoot(p, s, toeDrop){
  const fk = {}, A = SK["ankle"+s].dof.find(d => d.key === "lift");
  for (let it = 0; it < 8; it++){
    skFK(p, fk); const dy = fk["toe"+s].pos.y - fk["ankle"+s].pos.y + toeDrop; if (Math.abs(dy) < 0.002) break;
    const v0 = p.j["ankle"+s].lift; p.j["ankle"+s].lift = v0 + 1; skFK(p, fk);
    const g = (fk["toe"+s].pos.y - fk["ankle"+s].pos.y + toeDrop) - dy; p.j["ankle"+s].lift = Math.abs(g) < 1e-6 ? v0 : clampDof(A, v0 - dy / g);
  }
}
function libFeetOne(p, s, f, drop){
  if (p.j["knee"+s].flex < 5) p.j["knee"+s].flex = 5;
  drop = drop != null ? drop : 0.03;
  ikSolve(p, "ankle"+s, V3_(f[0], f[1], f[2]), 100); libLevelFoot(p, s, drop);
  for (let it = 0; it < 3; it++){
    const fk = skFK(p, {}), toeY = fk["toe"+s].pos.y; if (toeY >= 0.015) break;
    const y = fk["ankle"+s].pos.y + (0.02 - toeY);
    ikSolve(p, "ankle"+s, V3_(f[0], y, f[2]), 60); libLevelFoot(p, s, Math.max(drop, y - 0.02));
  }
}
function libFeet(p, feet, drops){
  feet = feet || {};
  for (const s of ["L", "R"]){
    const f = feet[s] || FOOT0[s];
    if (p.j["knee"+s].flex < 5) p.j["knee"+s].flex = 5;
    const drop = drops && drops[s] != null ? drops[s] : 0.03;
    ikSolve(p, "ankle"+s, V3_(f[0], f[1], f[2]), 100);
    libLevelFoot(p, s, drop);
    for (let it = 0; it < 3; it++){
      const fk = skFK(p, {}), toeY = fk["toe"+s].pos.y; if (toeY >= 0.015) break;
      const y = fk["ankle"+s].pos.y + (0.02 - toeY);
      ikSolve(p, "ankle"+s, V3_(f[0], y, f[2]), 60); libLevelFoot(p, s, Math.max(drop, y - 0.02));
    }
  }
  return p;
}
function libArm(p, s, x, y, z, iters){ ikSolve(p, "wrist"+s, V3_(x, y, z), iters || 80); return p; }
function libArmRot(p, s, x, y, z, guess){
  if (guess) Object.assign(p.j["shoulder"+s], guess.sh || {}), Object.assign(p.j["elbow"+s], guess.el || {});
  ikSolve(p, { end: "wrist"+s, dofs: [["shoulder"+s,"flex"],["shoulder"+s,"abd"],["shoulder"+s,"rot"],["elbow"+s,"flex"]], rotDamp: 2e-6 }, V3_(x, y, z), 120);
  return p;
}
function libPlantFix(B){
  const out = [B.keys[0]];
  for (let i = 1; i < B.keys.length; i++){
    const a = B.keys[i-1], b = B.keys[i], fa = skFK(a.pose, {}), fb = skFK(b.pose, {});
    const mid = poseClone(a.pose); let need = false;
    motEach(mid, (o, k, id) => { const bv = id ? b.pose.j[id][k] : b.pose.root[k]; o[k] = o[k] + (bv - o[k]) * 0.5; });
    const fm = skFK(mid, {}), feet = {};
    for (const s of ["L", "R"]){
      const A = fa["ankle"+s].pos, Bp = fb["ankle"+s].pos, flat = Math.hypot(A.x - Bp.x, A.z - Bp.z);
      const M = A.clone().lerp(Bp, 0.5);
      if (A.y < 0.15 && Bp.y < 0.15 && flat < 0.03 && (fm["ankle"+s].pos.distanceTo(M) > 0.01 || Math.min(fm["toe"+s].pos.y, fm["ankle"+s].pos.y) < 0.015)){ feet[s] = [M.x, M.y, M.z]; need = true; }
    }
    if (need){
      const keepFeet = {}; for (const s of ["L", "R"]) keepFeet[s] = feet[s] || null;
      for (const s of ["L", "R"]) if (feet[s]){ const one = {}; one[s] = feet[s]; libFeetOne(mid, s, feet[s]); }
      out.push({ t: (a.t + b.t) / 2, ease: a.ease === "step" ? "step" : "smooth", pose: motSoftClamp(mid) });
    }
    out.push(b);
  }
  B.keys = out; return B;
}
const libK = (t, pose, ease) => ({ t, ease: ease || "smooth", pose: motSoftClamp(pose) });

function libGait(o){
  const N = 8, keys = [];
  for (let i = 0; i <= N; i++){
    if (i === N){ keys.push({ t: o.T, ease: "smooth", pose: poseClone(keys[0].pose) }); break; }
    const ph = Math.PI * 2 * i / N;
    const p = libP(o.base || {});
    p.root.y = (o.rootY || 0) - Math.abs(Math.sin(ph)) * (o.bob || 0);
    const feet = {};
    for (const [s, x0, phs] of [["L", 0.10, ph], ["R", -0.10, ph + Math.PI]]){
      const d = (o.dir || 1) * Math.sin(phs) * o.stride, up = Math.max(0, Math.cos(phs)) * o.lift;
      feet[s] = o.axis === "x" ? [x0 * (o.width || 1) + d, 0.05 + up, 0] : [x0 * (o.width || 1), 0.05 + up, d];
      p.j["knee"+s].flex = 10 + up * 200;
      if (o.arm){
        const fwd = -Math.sin(phs) * (o.dir || 1);
        p.j["shoulder"+s].flex = (o.armBase || 0) + fwd * o.arm;
        p.j["elbow"+s].flex = (o.elbow || 10) + Math.max(0, fwd) * (o.elbowSwing || 6);
      }
    }
    libFeet(p, feet);
    keys.push({ t: o.T * i / N, ease: "smooth", pose: motSoftClamp(p) });
  }
  return { keys, dur: o.T };
}

const LIB = [
  { id: "idle", group: "stand", loop: true, ver: 2, build(){
      const a = libP({ chest: { flex: -1 }, clavL: { shrug: 0 }, clavR: { shrug: 0 }, shoulderL: { abd: 5 }, shoulderR: { abd: 5 } });
      const b = libP({ root: { y: 0.012 }, chest: { flex: -5 }, spine: { flex: -1.5 }, clavL: { shrug: 8 }, clavR: { shrug: 8 }, shoulderL: { abd: 8, flex: 2 }, shoulderR: { abd: 8, flex: 2 }, elbowL: { flex: 7 }, elbowR: { flex: 7 }, head: { nod: -3 } });
      libFeet(a); libFeet(b);
      return { dur: 3.2, keys: [libK(0, a), libK(1.2, b), libK(3.2, poseClone(a))] }; } },
  { id: "lookaround", group: "stand", loop: true, ver: 1, build(){
      const c = libFeet(libP({}));
      const L = libFeet(libP({ head: { turn: -55, nod: 3 }, neck: { side: 0 }, chest: { twist: -12 } }));
      const R = libFeet(libP({ head: { turn: 55, nod: 3 }, chest: { twist: 12 } }));
      return { dur: 4.4, keys: [libK(0, c), libK(0.8, L), libK(1.7, L), libK(2.3, c), libK(3.1, R), libK(3.9, R), libK(4.4, poseClone(c))] }; } },
  { id: "shift", group: "stand", loop: true, ver: 1, build(){
      const c = libFeet(libP({}), { L: [0.12, 0.05, 0], R: [-0.12, 0.05, 0] });
      const toL = libFeet(libP({ root: { x: 0.05, y: -0.01, roll: 0 }, spine: { side: -3 }, chest: { side: 2 } }), { L: [0.12, 0.05, 0], R: [-0.12, 0.05, 0] });
      const toR = libFeet(libP({ root: { x: -0.05, y: -0.01 }, spine: { side: 3 }, chest: { side: -2 } }), { L: [0.12, 0.05, 0], R: [-0.12, 0.05, 0] });
      return { dur: 4.8, keys: [libK(0, c), libK(1.0, toL), libK(2.2, toL), libK(2.6, c), libK(3.4, toR), libK(4.4, toR), libK(4.8, poseClone(c))] }; } },
  { id: "walk", group: "locomote", loop: true, ver: 1, build(){
      return libGait({ T: 1.05, stride: 0.30, lift: 0.10, bob: 0.022, rootY: -0.02, arm: 18, elbow: 12, elbowSwing: 8 }); } },
  { id: "fastwalk", group: "locomote", loop: true, ver: 1, build(){ return motBakeGait("fastwalk"); } },
  { id: "run", group: "locomote", loop: true, ver: 1, build(){ return motBakeRun(); } },
  { id: "backwalk", group: "locomote", loop: true, ver: 1, build(){
      return libGait({ T: 1.2, stride: 0.20, lift: 0.08, bob: 0.015, rootY: -0.02, dir: -1, arm: 10, elbow: 15, base: { spine: { flex: -3 }, head: { nod: 4 } } }); } },
  { id: "sidestep", group: "locomote", loop: true, ver: 1, build(){
      return libGait({ T: 0.95, stride: 0.07, lift: 0.07, bob: 0.012, rootY: -0.03, axis: "x", width: 1.3, base: { shoulderL: { abd: 12 }, shoulderR: { abd: 12 }, elbowL: { flex: 20 }, elbowR: { flex: 20 }, head: { turn: -15 } } }); } },
  { id: "crouchwalk", group: "locomote", loop: true, ver: 1, build(){
      return libGait({ T: 1.25, stride: 0.22, lift: 0.07, bob: 0.01, rootY: -0.27, arm: 8, armBase: 25, elbow: 70, elbowSwing: 5,
        base: { spine: { flex: 22 }, chest: { flex: 10 }, neck: { flex: -15 }, head: { nod: -15 } } }); } },
  { id: "sitstand", group: "posture", loop: false, ver: 1, build(){
      const st = libFeet(libP({}));
      const lean = libFeet(libP({ root: { y: -0.12, z: -0.06 }, spine: { flex: 30 }, chest: { flex: 8 }, head: { nod: -10 }, shoulderL: { flex: 25 }, shoulderR: { flex: 25 }, elbowL: { flex: 20 }, elbowR: { flex: 20 } }), { L: [0.12, 0.05, 0.08], R: [-0.12, 0.05, 0.08] });
      const seat = libFeet(libP({ root: { y: -0.47, z: -0.20 }, spine: { flex: 8 }, chest: { flex: 0 }, shoulderL: { flex: 30, abd: 4 }, shoulderR: { flex: 30, abd: 4 }, elbowL: { flex: 60 }, elbowR: { flex: 60 } }), { L: [0.12, 0.05, 0.12], R: [-0.12, 0.05, 0.12] });
      return { dur: 4.2, keys: [libK(0, st), libK(0.7, lean), libK(1.4, seat), libK(2.6, seat), libK(3.3, poseClone(lean)), libK(4.2, poseClone(st))] }; } },
  { id: "squat", group: "posture", loop: false, ver: 1, build(){
      const st = libFeet(libP({}), { L: [0.15, 0.05, 0.02], R: [-0.15, 0.05, 0.02] });
      const down = libFeet(libP({ root: { y: -0.42, z: -0.10 }, spine: { flex: 34 }, chest: { flex: 15 }, neck: { flex: -15 }, head: { nod: -10 },
        hipL: { abd: 18 }, hipR: { abd: 18 }, shoulderL: { flex: 55 }, shoulderR: { flex: 55 }, elbowL: { flex: 40 }, elbowR: { flex: 40 } }), { L: [0.17, 0.05, 0.04], R: [-0.17, 0.05, 0.04] });
      return { dur: 3.4, keys: [libK(0, st), libK(1.1, down), libK(2.3, down), libK(3.4, poseClone(st))] }; } },
  { id: "kneel", group: "posture", loop: false, ver: 1, build(){
      const st = libFeet(libP({}));
      const step = libFeet(libP({ root: { y: -0.18, z: -0.05 }, spine: { flex: 8 } }), { L: [0.11, 0.05, 0.22], R: [-0.11, 0.09, -0.30] }, { R: 0.07 });
      const down = libP({ root: { y: -0.46, z: -0.02 }, spine: { flex: 2 }, shoulderL: { flex: 20 }, elbowL: { flex: 50 }, shoulderR: { flex: 8 } });
      libFeet(down, { L: [0.12, 0.05, 0.40], R: [-0.11, 0.10, -0.42] }, { R: 0.08 });
      return { dur: 4.0, keys: [libK(0, st), libK(0.8, step), libK(1.6, down), libK(2.8, down), libK(3.4, poseClone(step)), libK(4.0, poseClone(st))] }; } },
  { id: "wave", group: "gesture", loop: false, ver: 2, build(){ return motExampleWave(); } },
  { id: "point", group: "gesture", loop: false, ver: 1, build(){
      const st = libFeet(libP({}));
      const pt = libFeet(libP({ shoulderR: { flex: 82, abd: 18, rot: 0 }, elbowR: { flex: 0 }, wristR: { flex: 0 }, head: { turn: 18, nod: -3 }, chest: { twist: 8 } }));
      return { dur: 2.8, keys: [libK(0, st), libK(0.45, pt), libK(2.1, pt), libK(2.8, poseClone(st))] }; } },
  { id: "beckon", group: "gesture", loop: false, ver: 1, build(){
      const st = libFeet(libP({}));
      const open = libFeet(libP({ shoulderR: { flex: 45, abd: 10 }, elbowR: { flex: 25, twist: -40 }, wristR: { flex: -10 } }));
      const pull = libP({ elbowR: { flex: 105 }, wristR: { flex: 20 } }, open);
      const keys = [libK(0, st), libK(0.5, open)];
      let tt = 0.5; for (let i = 0; i < 3; i++){ keys.push(libK(tt += 0.32, poseClone(pull))); keys.push(libK(tt += 0.32, poseClone(open))); }
      keys.push(libK(tt + 0.6, poseClone(st)));
      return { dur: tt + 0.6, keys }; } },
  { id: "scratch", group: "gesture", loop: false, ver: 1, build(){
      const st = libFeet(libP({}));
      const up = libFeet(libP({ head: { nod: 8 }, neck: { side: 6 } }));
      libArmRot(up, "R", -0.15, 1.74, -0.02, { sh: { flex: 20, abd: 110, rot: 0 }, el: { flex: 120 } });
      const s1 = libP({ wristR: { flex: 25 } }, up), s2 = libP({ wristR: { flex: -15 } }, up);
      const down = libFeet(libP({ shoulderR: { flex: 25, abd: 45, rot: 20 }, elbowR: { flex: 70 } }));
      return { dur: 3.3, keys: [libK(0, st), libK(0.6, up), libK(0.85, s1), libK(1.1, s2), libK(1.35, poseClone(s1)), libK(1.6, poseClone(s2)), libK(1.85, poseClone(s1)), libK(2.2, poseClone(up)), libK(2.7, down), libK(3.3, poseClone(st))] }; } },
  { id: "jump", group: "action", loop: false, ver: 1, build(){
      const st = libFeet(libP({}));
      const load = libFeet(libP({ root: { y: -0.20, z: -0.04 }, spine: { flex: 25 }, head: { nod: -12 }, shoulderL: { flex: -35 }, shoulderR: { flex: -35 }, elbowL: { flex: 15 }, elbowR: { flex: 15 } }));
      const push = libFeet(libP({ root: { y: 0.03 }, spine: { flex: 3 }, shoulderL: { flex: 140 }, shoulderR: { flex: 140 }, elbowL: { flex: 10 }, elbowR: { flex: 10 } }), { L: [0.10, 0.13, 0], R: [-0.10, 0.13, 0] }, { L: 0.11, R: 0.11 });
      const air = libP({ root: { y: 0.28 }, spine: { flex: 5 }, shoulderL: { flex: 150 }, shoulderR: { flex: 150 }, elbowL: { flex: 15 }, elbowR: { flex: 15 } });
      libFeet(air, { L: [0.11, 0.24, 0.02], R: [-0.11, 0.24, 0.02] });
      const land = libFeet(libP({ root: { y: -0.24, z: -0.05 }, spine: { flex: 22 }, head: { nod: -8 }, shoulderL: { flex: 40, abd: 15 }, shoulderR: { flex: 40, abd: 15 }, elbowL: { flex: 30 }, elbowR: { flex: 30 } }));
      return { dur: 2.0, keys: [libK(0, st), libK(0.45, load), libK(0.62, push), libK(0.85, air), libK(1.08, poseClone(push)), libK(1.25, land), libK(2.0, poseClone(st))] }; } },
  { id: "throw", group: "action", loop: false, ver: 2, build(){
      const st = libFeet(libP({}));
      const wind = libP({ root: { yaw: -25, y: -0.04 }, spine: { twist: -15, flex: -4 }, chest: { twist: -15 }, head: { turn: 35 },
        shoulderL: { flex: 70, abd: 10 }, elbowL: { flex: 30 } });
      libFeet(wind, { L: [0.12, 0.09, 0.10], R: [-0.10, 0.05, -0.12] });
      libArmRot(wind, "R", -0.28, 1.70, -0.30, { sh: { flex: 20, abd: 100, rot: 0 }, el: { flex: 100 } });
      const rel = libP({ root: { yaw: 10, y: -0.07, z: 0.04 }, spine: { twist: 10, flex: 12 }, chest: { twist: 10, flex: 6 }, head: { turn: -5 },
        shoulderL: { flex: 20, abd: 20 }, elbowL: { flex: 60 } });
      libFeet(rel, { L: [0.14, 0.05, 0.32], R: [-0.10, 0.05, -0.15] });
      libArm(rel, "R", -0.10, 1.55, 0.55);
      const fol = libP({ root: { yaw: 25, y: -0.12, z: 0.06 }, spine: { twist: 15, flex: 28 }, chest: { twist: 10, flex: 12 }, head: { turn: -10 },
        shoulderL: { flex: -10, abd: 15 }, elbowL: { flex: 40 } });
      libFeet(fol, { L: [0.14, 0.05, 0.32], R: [-0.10, 0.11, -0.18] }, { R: 0.09 });
      libArm(fol, "R", -0.04, 1.05, 0.60);
      const back = libP({ root: { yaw: 10, y: -0.05, z: 0.03 }, spine: { twist: 5, flex: 10 }, chest: { flex: 4 }, shoulderL: { flex: 5, abd: 10 }, elbowL: { flex: 25 } });
      libFeet(back, { L: [0.13, 0.05, 0.16], R: [-0.10, 0.05, -0.08] });
      libArm(back, "R", -0.28, 0.95, 0.18);
      return { dur: 2.3, keys: [libK(0, st), libK(0.7, wind), libK(0.85, poseClone(wind)), libK(1.0, rel), libK(1.2, fol), libK(1.75, back), libK(2.3, poseClone(st))] }; } },
  { id: "pickup", group: "action", loop: false, ver: 1, build(){
      const st = libFeet(libP({}));
      const down = libP({ root: { y: -0.36, z: -0.10 }, spine: { flex: 40 }, chest: { flex: 18 }, head: { nod: -10 }, shoulderL: { flex: 25 }, elbowL: { flex: 35 } });
      libFeet(down);
      libArm(down, "R", -0.14, 0.12, 0.38);
      const hold = libFeet(libP({ shoulderR: { flex: 20, abd: 6 }, elbowR: { flex: 95 }, head: { nod: 5 } }));
      return { dur: 3.0, keys: [libK(0, st), libK(0.9, down), libK(1.3, poseClone(down)), libK(2.2, hold), libK(3.0, poseClone(hold))] }; } },
  { id: "button", group: "action", loop: false, ver: 1, build(){
      const st = libFeet(libP({}));
      const reach = libFeet(libP({ head: { nod: 6 }, chest: { twist: 5 } })); libArm(reach, "R", -0.14, 1.25, 0.46);
      const push = poseClone(reach); libArm(push, "R", -0.13, 1.25, 0.55, 40);
      return { dur: 2.2, keys: [libK(0, st), libK(0.6, reach), libK(0.78, push), libK(0.95, poseClone(reach)), libK(1.25, poseClone(reach)), libK(2.2, poseClone(st))] }; } },
  { id: "startle", group: "react", loop: false, ver: 1, build(){
      const st = libFeet(libP({}));
      const jolt = libFeet(libP({ root: { y: 0.015, z: -0.03 }, spine: { flex: -8 }, chest: { flex: -6 }, head: { nod: -10 }, clavL: { shrug: 25 }, clavR: { shrug: 25 },
        shoulderL: { flex: 55, abd: 25 }, shoulderR: { flex: 55, abd: 25 }, elbowL: { flex: 115 }, elbowR: { flex: 115 }, wristL: { flex: -30 }, wristR: { flex: -30 } }));
      const half = libFeet(libP({ spine: { flex: -3 }, clavL: { shrug: 8 }, clavR: { shrug: 8 }, shoulderL: { flex: 25, abd: 12 }, shoulderR: { flex: 25, abd: 12 }, elbowL: { flex: 60 }, elbowR: { flex: 60 } }));
      return { dur: 2.0, keys: [libK(0, st, "linear"), libK(0.12, jolt), libK(0.7, poseClone(jolt)), libK(1.3, half), libK(2.0, poseClone(st))] }; } },
  { id: "hit", group: "react", loop: false, ver: 1, build(){
      const st = libFeet(libP({}));
      const snap = libFeet(libP({ root: { z: -0.05, y: -0.01 }, spine: { flex: -18 }, chest: { flex: -12 }, neck: { flex: -15 }, head: { nod: -15 },
        shoulderL: { flex: 30, abd: 40 }, shoulderR: { flex: 30, abd: 40 }, elbowL: { flex: 30 }, elbowR: { flex: 30 } }));
      const stag = libP({ root: { z: -0.14, y: -0.06 }, spine: { flex: -6 }, head: { nod: -4 }, shoulderL: { flex: 15, abd: 30 }, shoulderR: { flex: 15, abd: 30 }, elbowL: { flex: 25 }, elbowR: { flex: 25 } });
      libFeet(stag, { L: [0.11, 0.05, 0], R: [-0.11, 0.05, -0.32] });
      const rec = libP({ root: { z: -0.10, y: -0.06 }, spine: { flex: 14 }, head: { nod: -6 }, shoulderL: { flex: 10, abd: 10 }, shoulderR: { flex: 10, abd: 10 } });
      libFeet(rec, { L: [0.11, 0.05, 0], R: [-0.11, 0.05, -0.32] });
      return { dur: 2.2, keys: [libK(0, st, "linear"), libK(0.12, snap), libK(0.45, stag), libK(1.1, rec), libK(2.2, poseClone(rec))] }; } },
];
const LIB_BY = {}; LIB.forEach(L => LIB_BY[L.id] = L);
function libBuild(id){ const L = LIB_BY[id]; if (!L) return null; let B = L.build(); if (L.group !== "locomote") B = libPlantFix(libPlantFix(B)); return { keys: B.keys.map(k => ({ t: k.t, ease: k.ease || "smooth", pose: k.pose })), dur: B.dur, loop: L.loop }; }

function libOpen(id){
  const B = libBuild(id); if (!B) return;
  motionPlay(false); pushPoseUndo(); stripDrop();
  MOT.keys = B.keys; MOT.dur = B.dur; MOT.loop = B.loop; MOT.selKey = null;
  motionSetName(t("lib_" + id) + t("libSuffix"));
  motionLinkEndsCheck(); motionRenderAll(); motionSeek(0);
  LIBUI.cur = id; libRender(); if (typeof flowFlag === "function") flowFlag("libOpened");
  motionPlay(true);
}
function libAddCat(cat){
  const C = LIB_CATS.find(c => c.id === cat); if (!C) return;
  if (!PACK.name) PACK.name = t("libPackName_" + cat);
  let n = 0;
  LIB.filter(L => C.groups.includes(L.group)).forEach(L => { const B = libBuild(L.id); packPut({ name: t("lib_" + L.id) + t("libSuffix"), dur: B.dur, loop: B.loop, keys: B.keys }); n++; });
  packRender(); showToastA(t("libAddedCat").replace("{n}", n));
}

const REVIEW_KEY = "dd-lib-review", ORDER_KEY = "dd-lib-orders";
function reviewLoad(){ try { return JSON.parse(localStorage.getItem(REVIEW_KEY)) || {}; } catch(e){ return {}; } }
function reviewSave(R){ try { localStorage.setItem(REVIEW_KEY, JSON.stringify(R)); } catch(e){} }
function ordersLoad(){ try { return localStorage.getItem(ORDER_KEY) || ""; } catch(e){ return ""; } }
function ordersSave(s){ try { localStorage.setItem(ORDER_KEY, s); } catch(e){} }
function reviewOf(id){
  const r = LIBUI.review[id]; if (!r) return { s: "" };
  if (r.ver !== LIB_BY[id].ver) return { s: "", changed: true, old: r };
  return r;
}
function reviewSet(id, s){
  const cur = LIBUI.review[id] || {};
  LIBUI.review[id] = { s: cur.s === s && cur.ver === LIB_BY[id].ver ? "" : s, m: cur.m || "", ver: LIB_BY[id].ver };
  reviewSave(LIBUI.review); libRender();
}
function reviewMemo(id, m){ const cur = LIBUI.review[id] || { s: "", ver: LIB_BY[id].ver }; cur.m = m; cur.ver = LIB_BY[id].ver; LIBUI.review[id] = cur; reviewSave(LIBUI.review); }
function catProgress(cat){
  const C = LIB_CATS.find(c => c.id === cat), list = LIB.filter(L => C.groups.includes(L.group));
  return { ok: list.filter(L => reviewOf(L.id).s === "ok").length, n: list.length };
}
function reviewText(){
  const sym = { ok: "✔", fix: "✎", redo: "✕" }, lines = [`[디렉터스 데스크 ${LIB_VERSION} · 기본 동작 검증]`];
  for (const C of LIB_CATS){
    const pr = catProgress(C.id); lines.push("", `${C.icon} ${t("libCat_" + C.id)} (${pr.ok}/${pr.n} ${t("libPassed")})`);
    const none = [];
    LIB.filter(L => C.groups.includes(L.group)).forEach(L => {
      const r = reviewOf(L.id);
      if (!r.s){ none.push(t("lib_" + L.id) + (r.changed ? "(" + t("libChanged") + ")" : "")); return; }
      lines.push(` ${sym[r.s]} ${t("lib_" + L.id)}${r.m ? " — " + r.m : ""}`);
    });
    if (none.length) lines.push(` · ${t("libUnreviewed")}: ${none.join(", ")}`);
  }
  const ord = ordersLoad().split("\n").map(s => s.trim()).filter(Boolean);
  lines.push("", `[${t("libOrders")}]`); if (ord.length) ord.forEach(o => lines.push(" - " + o)); else lines.push(" (" + t("libNone") + ")");
  return lines.join("\n");
}
function copyText(text, done){
  const fallback = () => { const ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px"; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch(e){} ta.remove(); done(ok); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => done(true), fallback); else fallback();
}

const LIBUI = { open: false, cat: null, cur: null, review: reviewLoad() };
function libToggle(on){
  LIBUI.open = on == null ? !LIBUI.open : !!on;
  if (LIBUI.open && PACK.open) packToggle(false);
  document.getElementById("lib-panel").hidden = !LIBUI.open;
  document.getElementById("mot-lib").classList.toggle("on", LIBUI.open);
  libRender();
  if (LIBUI.open) motPanelAt("lib-panel", "mot-lib");
}
function libRender(){
  const box = document.getElementById("lib-body"); if (!box || !LIBUI.open) return;
  const title = document.getElementById("lib-title"), back = document.getElementById("lib-back");
  box.innerHTML = "";
  if (!LIBUI.cat){
    title.textContent = t("libTitle"); back.hidden = true;
    const d = document.createElement("div"); d.className = "lb-desc"; d.textContent = t("libDesc"); box.appendChild(d);
    LIB_CATS.forEach(C => {
      const pr = catProgress(C.id), b = document.createElement("button"); b.type = "button"; b.className = "lb-cat"; b.dataset.cat = C.id;
      b.innerHTML = `<span class="lb-ic"></span><span class="lb-txt"><b></b><small></small></span><span class="lb-prog"></span>`;
      b.querySelector(".lb-ic").textContent = C.icon;
      b.querySelector("b").textContent = t("libCat_" + C.id) + (C.first ? "  " + t("libFirst") : "");
      b.querySelector("small").textContent = t("libCatSub_" + C.id);
      b.querySelector(".lb-prog").textContent = `✔ ${pr.ok}/${pr.n}`;
      b.addEventListener("click", () => { LIBUI.cat = C.id; libRender(); });
      box.appendChild(b);
    });
  } else {
    const C = LIB_CATS.find(c => c.id === LIBUI.cat), pr = catProgress(C.id);
    title.textContent = C.icon + " " + t("libCat_" + C.id) + "  ✔ " + pr.ok + "/" + pr.n; back.hidden = false;
    for (const g of C.groups){
      const h = document.createElement("div"); h.className = "lb-group"; h.textContent = t("libGroup_" + g); box.appendChild(h);
      LIB.filter(L => L.group === g).forEach(L => box.appendChild(libRow(L)));
    }
    const add = document.createElement("button"); add.type = "button"; add.className = "lb-addcat"; add.textContent = t("libAddCatBtn");
    add.addEventListener("click", () => libAddCat(C.id)); box.appendChild(add);
  }
  const ord = document.createElement("div"); ord.className = "lb-orders";
  ord.innerHTML = `<div class="lb-olab"></div><textarea rows="2"></textarea><button type="button" class="lb-copy"></button>`;
  ord.querySelector(".lb-olab").textContent = t("libOrdersLab");
  const ta = ord.querySelector("textarea"); ta.placeholder = t("libOrdersPh"); ta.value = ordersLoad();
  ta.addEventListener("input", () => ordersSave(ta.value)); ta.addEventListener("keydown", e => e.stopPropagation());
  const cp = ord.querySelector(".lb-copy"); cp.textContent = t("libCopy"); cp.title = t("libCopyTitle");
  cp.addEventListener("click", () => copyText(reviewText(), ok => showToastA(t(ok ? "libCopied" : "libCopyFail"))));
  box.appendChild(ord);
}
function libRow(L){
  const r = reviewOf(L.id), row = document.createElement("div");
  row.className = "lb-item" + (LIBUI.cur === L.id ? " cur" : "") + (r.s ? " s-" + r.s : ""); row.dataset.id = L.id;
  row.innerHTML = `<button type="button" class="lb-open"><b></b><small></small></button>
    <button type="button" class="lb-strip c-get"></button>
    <div class="lb-rv"><button type="button" data-s="ok">✔</button><button type="button" data-s="fix">✎</button><button type="button" data-s="redo">✕</button></div>`;
  row.querySelector("b").textContent = t("lib_" + L.id) + (r.changed ? "  · " + t("libChanged") : "");
  row.querySelector("small").textContent = t("libd_" + L.id);
  row.querySelector(".lb-open").title = t("libOpenTip");
  row.querySelector(".lb-open").addEventListener("click", () => libOpen(L.id));
  const sb = row.querySelector(".lb-strip"); sb.textContent = t("stripAddBtn"); sb.title = t("stripAddTitle");
  sb.addEventListener("click", () => stripAddLib(L.id));
  row.querySelectorAll(".lb-rv button").forEach(b => {
    b.title = t("libRv_" + b.dataset.s); b.classList.toggle("on", r.s === b.dataset.s);
    b.addEventListener("click", () => reviewSet(L.id, b.dataset.s));
  });
  if (r.s === "fix" || r.s === "redo"){
    const m = document.createElement("input"); m.type = "text"; m.className = "lb-memo"; m.placeholder = t("libMemoPh"); m.value = r.m || "";
    m.addEventListener("input", () => reviewMemo(L.id, m.value)); m.addEventListener("keydown", e => e.stopPropagation());
    row.appendChild(m);
  }
  return row;
}
function libBindUI(){
  document.getElementById("mot-lib").addEventListener("click", () => libToggle());
  document.getElementById("lib-close").addEventListener("click", () => libToggle(false));
  document.getElementById("lib-back").addEventListener("click", () => { LIBUI.cat = null; libRender(); });
}
onLangChange(() => libRender());
