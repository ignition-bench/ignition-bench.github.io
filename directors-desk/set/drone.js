"use strict";

const LOOK_SENS = { slow: { k: 0.0016, max: 70 }, normal: { k: 0.0026, max: 120 }, fast: { k: 0.004, max: 200 } };
const LOOK = { sens: "slow", smooth: true };
try { const o = JSON.parse(localStorage.getItem("dd-look") || "{}"); if (LOOK_SENS[o.sens]) LOOK.sens = o.sens; if (o.smooth === false) LOOK.smooth = false; } catch(e){}
const lookSave = () => { try { localStorage.setItem("dd-look", JSON.stringify(LOOK)); } catch(e){} };
const lookT = { yaw: 0, pitch: 0 };
function lookSync(){ lookT.yaw = yaw; lookT.pitch = pitch; }
function lookInput(dx, dy, scale){
  const k = LOOK_SENS[LOOK.sens].k * (scale || 1);
  lookT.yaw -= dx * k; lookT.pitch = Math.max(-1.4, Math.min(1.4, lookT.pitch - dy * k));
}
function lookStep(dt){
  let dy = lookT.yaw - yaw, dp = lookT.pitch - pitch;
  if (Math.abs(dy) < 1e-5 && Math.abs(dp) < 1e-5) return false;
  if (LOOK.smooth){ const f = 1 - Math.exp(-dt * 7); dy *= f; dp *= f; }
  const m = LOOK_SENS[LOOK.sens].max * Math.PI / 180 * dt;
  const n = Math.hypot(dy, dp); if (n > m){ dy *= m / n; dp *= m / n; }
  yaw += dy; pitch += dp;
  return true;
}
const ZOOM = { fov: 0, fovT: 0, z: false };
function zoomReset(f){ ZOOM.fov = ZOOM.fovT = f; ZOOM.z = false; }
function zoomStep(dt){
  const goal = ZOOM.z ? Math.max(8, ZOOM.fovT * 0.45) : ZOOM.fovT;
  const d = goal - ZOOM.fov; if (Math.abs(d) < 0.01){ if (d){ ZOOM.fov = goal; return true; } return false; }
  ZOOM.fov += d * (1 - Math.exp(-dt * (ZOOM.zMoving ? 11 : 5)));
  return true;
}

let lookLast = 0;
function lookDt(){ const n = performance.now(), d = lookLast ? Math.min(0.25, (n - lookLast) / 1000) : 0.016; lookLast = n; return d; }

const DR = { pos: null, vel: null, vy: 0, up: false, down: false, prev: "orbit", fovDef: 60, lockWanted: false };
const DR_SPEED = 2.5, DR_FAST = 5, DR_VSPEED = 1.6, DR_YMAX = 80;
const droneBtn = document.getElementById("cam-drone");
function droneEnter(){
  if (!threeInited || camMode === "drone") return;
  DR.prev = camMode === "cam" || camMode === "walk" ? camMode : "orbit";
  const e = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
  DR.pos = camera.position.clone(); if (DR.pos.y < 0.3) DR.pos.y = 0.3; if (DR.pos.y > DR_YMAX) DR.pos.y = DR_YMAX;
  DR.vel = new THREE.Vector3(); DR.vy = 0; DR.up = DR.down = false;
  setCamMode("drone");
  yaw = e.y; pitch = Math.max(-1.4, Math.min(1.4, e.x)); lookSync();
  zoomReset(DR.fovDef);
  DR.lockWanted = true;
  try { renderer.domElement.requestPointerLock(); } catch(err){}
  showToast(t("droneIn"));
}
function droneExit(){
  if (camMode !== "drone") return;
  DR.lockWanted = false; DR.up = DR.down = false;
  if (typeof REC !== "undefined" && REC.on){ REC.stopReason = REC.stopReason || "user"; recStop(); }
  if (document.pointerLockElement) document.exitPointerLock();
  const back = DR.prev === "cam" && !(typeof CAMS !== "undefined" && CAMS.list.length) ? "orbit" : DR.prev;
  setCamMode(back);
}
function droneTick(){
  const dt = lookDt();
  lookStep(dt);
  camera.rotation.order = "YXZ"; camera.rotation.set(pitch, yaw, 0);
  const sp = (keys.ShiftLeft || keys.ShiftRight) ? DR_FAST : DR_SPEED;
  const F = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), Rt = new THREE.Vector3(-F.z, 0, F.x), want = new THREE.Vector3();
  if (keys.KeyW || keys.ArrowUp) want.add(F);
  if (keys.KeyS || keys.ArrowDown) want.sub(F);
  if (keys.KeyD || keys.ArrowRight) want.add(Rt);
  if (keys.KeyA || keys.ArrowLeft) want.sub(Rt);
  if (want.lengthSq()) want.normalize().multiplyScalar(sp);
  const f = 1 - Math.exp(-dt * 3);
  DR.vel.lerp(want, f);
  const vw = ((DR.up || keys.KeyE) ? 1 : 0) - ((DR.down || keys.KeyQ) ? 1 : 0);
  DR.vy += (vw * DR_VSPEED - DR.vy) * f;
  DR.pos.addScaledVector(DR.vel, dt); DR.pos.y = Math.max(0.2, Math.min(DR_YMAX, DR.pos.y + DR.vy * dt));
  camera.position.copy(DR.pos);
  zoomStep(dt);
  const fov = camFovFit(ZOOM.fov);
  if (Math.abs(camera.fov - fov) > 1e-3){ camera.fov = fov; camera.updateProjectionMatrix(); }
  droneHud();
}
let droneHudAt = 0;
function droneHud(){
  const n = performance.now(); if (n - droneHudAt < 200) return; droneHudAt = n;
  orbitHint.textContent = t("droneHint") + " · " + t("droneNow").replace("{h}", DR.pos.y.toFixed(1)).replace("{f}", Math.round(ZOOM.fov));
}
droneBtn.addEventListener("click", () => { if (camMode === "drone") droneExit(); else droneEnter(); });
document.addEventListener("pointerlockchange", () => {
  if (camMode !== "drone") return;
  if (document.pointerLockElement === renderer.domElement) return;
  droneExit();
});
document.addEventListener("mousemove", e => { if (camMode === "drone" && locked) lookInput(e.movementX || 0, e.movementY || 0, 1); });
const droneBtnEv = (e, on) => {
  if (camMode !== "drone" || !(locked || e.target === renderer.domElement)) return;
  e.preventDefault(); e.stopPropagation();
  if (!locked){ if (on && e.button === 0 && e.target === renderer.domElement){ try { renderer.domElement.requestPointerLock(); } catch(err){} } return; }
  if (e.button === 0) DR.up = on; else if (e.button === 2) DR.down = on;
};
window.addEventListener("pointerdown", e => droneBtnEv(e, true), true);
window.addEventListener("pointerup", e => droneBtnEv(e, false), true);
window.addEventListener("mousedown", e => { if (camMode === "drone" && (locked || e.target === renderer.domElement)){ e.preventDefault(); e.stopPropagation(); } }, true);
window.addEventListener("contextmenu", e => { if (camMode === "drone") e.preventDefault(); }, true);
window.addEventListener("wheel", e => {
  if (!inLiveMode || (camMode !== "drone" && camMode !== "walk")) return;
  if (camMode === "walk" && !(e.target === renderer.domElement)) return;
  e.preventDefault(); e.stopPropagation();
  ZOOM.fovT = Math.max(15, Math.min(90, ZOOM.fovT * (e.deltaY > 0 ? 1.08 : 1 / 1.08)));
  ZOOM.zMoving = false; SET3D.dirty = true;
}, { capture: true, passive: false });
function droneKeyGuard(e){
  if (typeof camMode === "undefined") return false;
  if (camMode === "walk" && e.code === "KeyZ" && !e.ctrlKey && !e.metaKey && !e.altKey && !typingNow() && setKeysTo3d()){
    e.preventDefault(); e.stopImmediatePropagation(); if (!ZOOM.z){ ZOOM.z = true; ZOOM.zMoving = true; SET3D.dirty = true; } return true;
  }
  if (camMode !== "drone") return false;
  e.stopImmediatePropagation();
  if (e.key === "Escape"){ e.preventDefault(); droneExit(); return true; }
  if (e.code === "KeyM" && typeof REC !== "undefined" && REC.on){ e.preventDefault(); recMark(); return true; }
  if (e.ctrlKey || e.metaKey || e.altKey) return true;
  keys[e.code] = true;
  if (/^(Key[WASDEQ]|Arrow|Space|Digit|Numpad)/.test(e.code)) e.preventDefault();
  return true;
}
window.addEventListener("keyup", e => { if (e.code === "KeyZ" && ZOOM.z){ ZOOM.z = false; ZOOM.zMoving = true; SET3D.dirty = true; } }, true);
window.addEventListener("blur", () => { DR.up = DR.down = false; ZOOM.z = false; });

function lookSetRender(){
  const box = document.getElementById("look-set"), on = typeof camMode !== "undefined" && (camMode === "walk" || camMode === "drone");
  box.hidden = !on; if (!on) return;
  box.querySelectorAll("[data-sens]").forEach(b => b.classList.toggle("on", b.dataset.sens === LOOK.sens));
  document.getElementById("look-smooth").checked = LOOK.smooth;
}
document.querySelectorAll("#look-set [data-sens]").forEach(b => b.addEventListener("click", () => { LOOK.sens = b.dataset.sens; lookSave(); lookSetRender(); }));
document.getElementById("look-smooth").addEventListener("change", e => { LOOK.smooth = e.target.checked; lookSave(); e.target.blur(); });
{ const u0 = updateLiveUi; updateLiveUi = function(){ u0(); droneBtn.classList.toggle("on", camMode === "drone"); lookSetRender(); if (camMode === "drone" && DR.pos) droneHud(); }; }
onLangChange(lookSetRender);
lookSetRender();
