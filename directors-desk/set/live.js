"use strict";

const buildScreen = document.getElementById("build-screen");
const liveScreen = document.getElementById("live-screen");
const liveView = document.getElementById("live-view");
const liveOverlay = document.getElementById("live-overlay");
const crosshair = document.getElementById("crosshair");
const noteLabel = document.getElementById("note-label");
const camOrbitBtn = document.getElementById("cam-orbit"), camWalkBtn = document.getElementById("cam-walk");
const camCamBtn = document.getElementById("cam-cam");
const ceilBtn = document.getElementById("ceiling-toggle");
const orbitHint = document.getElementById("orbit-hint");

let threeInited = false;
let scene, camera, renderer, clock, raycaster;
let orbit = null;
let camMode = "orbit";
let liveObjects = [];
let noteTargets = [];
let ceilingMesh = null;
let sceneBox = { minX:0, maxX:1, minZ:0, maxZ:1, W:1, D:1 };
let walkBoard = { W: 1, D: 1 };
function walkSpawnCalc(){
  let a = sceneBox.minX, b = sceneBox.maxX, c = sceneBox.minZ, d = sceneBox.maxZ;
  const add = (x, z) => { a = Math.min(a, x); b = Math.max(b, x); c = Math.min(c, z); d = Math.max(d, z); };
  if (typeof CAST !== "undefined") CAST.actors.forEach(p => add(toX(p.x), toZ(p.y)));
  if (typeof CAMS !== "undefined") CAMS.list.forEach(k => { if ((k.mount || "fixed") === "fixed") add(toX(k.x), toZ(k.y)); });
  const cx = (a + b) / 2, cz = (c + d) / 2, m = 0.5;
  const x = Math.max(m, Math.min(walkBoard.W - m, cx));
  const z = Math.max(m, Math.min(walkBoard.D - m, cz + Math.max(2.5, (d - c) / 2 + 1)));
  const dx = cx - x, dz = cz - z, h = Math.hypot(dx, dz);
  spawnPos = { x, y: 1.6, z };
  spawnYaw = h > 0.3 ? Math.atan2(-dx, -dz) : 0;
  spawnPitch = h > 0.3 ? Math.max(-0.35, Math.min(-0.05, Math.atan2(0.8 - 1.6, h))) : -0.05;
}
let yaw = 0, pitch = 0, locked = false;
let walkLook = null;
let spawnPos = {x:0,y:1.6,z:0}, spawnYaw = 0, spawnPitch = 0;
let orbitHome = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
const keys = {};
let minX=0,minY=0;
const SET3D = { dirty: true, rendering: false, byId: {}, pickables: [], selBoxes: [] };

const toX = (x)=> (x-minX)*SCALE3D;
const toZ = (y)=> (y-minY)*SCALE3D;

const STUDIO = {
  wallT: 0.25,
  doorW: DOOR_WIDTH_2D*SCALE3D, doorH: 2.1,
  winW: 0.9, winH: 1.0, winSill: WALL_H*0.55 - 0.5,
  bg: 0x1d1f24, wall: 0x8f8d88, floor: 0x6f6d69, ceil: 0x7d7b77, grid: 0x4a4946, glass: 0x9ecbe0,
};
const WALK_FOV = 70, ORBIT_FOV = 50;

function initThree(){
  if (threeInited) return;
  threeInited = true;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(STUDIO.bg);
  camera = new THREE.PerspectiveCamera(ORBIT_FOV, window.innerWidth/window.innerHeight, 0.05, 400);
  renderer = v3Ensure(liveView);
  V3.scene = scene; V3.camera = camera;
  raycaster = new THREE.Raycaster();
  clock = new THREE.Clock();

  orbit = new THREE.OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true; orbit.dampingFactor = 0.08;
  orbit.maxPolarAngle = Math.PI/2 - 0.04;
  orbit.minDistance = 1.2; orbit.maxDistance = 120;
  orbit.screenSpacePanning = true;
  orbit.addEventListener("change", () => { SET3D.dirty = true; });
  spacePanRegister(() => (inLiveMode && camMode === "orbit") ? orbit : null);

  document.addEventListener("mousemove", (e)=>{
    if (!locked || camMode === "drone") return;
    yaw -= (e.movementX||0)*0.0022; pitch -= (e.movementY||0)*0.0022;
    pitch = Math.max(-1.4, Math.min(1.4, pitch));
  });
  renderer.domElement.addEventListener("pointermove", orbitHover);
  renderer.domElement.addEventListener("pointerleave", ()=>{ if (camMode==="orbit") noteLabel.style.display="none"; });
  const cvs = renderer.domElement;
  cvs.addEventListener("pointerdown", (e)=>{
    if (!inLiveMode || camMode !== "walk" || V3.host !== liveView || (e.button !== 0 && e.button !== 2)) return;
    walkLook = { x: e.clientX, y: e.clientY, id: e.pointerId }; cvs.setPointerCapture(e.pointerId); cvs.style.cursor = "grabbing";
  });
  cvs.addEventListener("pointermove", (e)=>{
    if (!walkLook || camMode !== "walk") return;
    const dx = e.clientX - walkLook.x, dy = e.clientY - walkLook.y; walkLook.x = e.clientX; walkLook.y = e.clientY;
    lookInput(dx, dy, 2); SET3D.dirty = true;
  });
  const lookEnd = ()=>{ if (!walkLook) return; walkLook = null; cvs.style.cursor = camMode === "walk" ? "grab" : ""; };
  cvs.addEventListener("pointerup", lookEnd); cvs.addEventListener("pointercancel", lookEnd);
  cvs.addEventListener("contextmenu", (e)=>{ if (inLiveMode && V3.host === liveView && camMode === "walk") e.preventDefault(); });

  document.getElementById("live-start-btn").addEventListener("click", ()=>{
    renderer.domElement.requestPointerLock();
  });
  document.addEventListener("pointerlockchange", ()=>{
    locked = document.pointerLockElement === renderer.domElement;
    updateLiveUi();
  });
  window.addEventListener("keydown",(e)=>{
    if (!inLiveMode) return;
    if (typeof typingNow === "function" && typingNow()) return;
    keys[e.code]=true;
    if (camMode === "walk" && /^Arrow/.test(e.code) && typeof setKeysTo3d === "function" && setKeysTo3d()) e.preventDefault();
    if (e.code==="KeyR" && typeof setKeysTo3d === "function" && setKeysTo3d() && !e.ctrlKey && !e.metaKey){ resetView(); SET3D.dirty = true; }
  });
  window.addEventListener("keyup",(e)=>{ keys[e.code]=false; });
  animate();
}

function buildLiveScene(keepView){
  v3ClearScene(scene);
  liveObjects = []; noteTargets = []; ceilingMesh = null;
  SET3D.byId = {}; SET3D.pickables = []; SET3D.selBoxes = [];
  const mats = {
    wall:  new THREE.MeshStandardMaterial({ color: STUDIO.wall, roughness: 0.95, metalness: 0 }),
    floor: new THREE.MeshStandardMaterial({ color: (typeof FLOOR_LOOK !== "undefined" && FLOOR_LOOK[floorType]) || STUDIO.floor, roughness: 1, metalness: 0 }),
    ceil:  new THREE.MeshStandardMaterial({ color: STUDIO.ceil, roughness: 1, metalness: 0 }),
    glass: new THREE.MeshStandardMaterial({ color: STUDIO.glass, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.32, depthWrite: false }),
    edge:  new THREE.LineBasicMaterial({ color: 0x3b3a37, transparent: true, opacity: 0.35 }),
    door:  new THREE.MeshStandardMaterial({ color: new THREE.Color(STUDIO.wall).multiplyScalar(0.78), roughness: 0.9, metalness: 0 }),
    grid:  new THREE.LineBasicMaterial({ color: STUDIO.grid, transparent: true, opacity: 0.45 }),
  };
  const propMats = {};

  const walls = elements.filter(e=>e.type==="wall");
  const others = elements.filter(e=>e.type!=="wall" && e.type!=="line" && e.type!=="door" && e.type!=="window" && !e.pts && e.type!=="zone");
  minX = 0; minY = 0;
  const W = Math.max(1, boardW()*SCALE3D), D = Math.max(1, boardH()*SCALE3D);

  const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.1, D), mats.floor);
  floor.position.set(W/2, -0.05, D/2); floor.receiveShadow = true; scene.add(floor);
  const gp = [];
  const gs = Math.max(1, snapM);
  for (let x = 0; x <= W + 1e-6; x += gs) gp.push(x, 0.003, 0, x, 0.003, D);
  for (let z = 0; z <= D + 1e-6; z += gs) gp.push(0, 0.003, z, W, 0.003, z);
  const gg = new THREE.BufferGeometry(); gg.setAttribute("position", new THREE.Float32BufferAttribute(gp, 3));
  scene.add(new THREE.LineSegments(gg, mats.grid));

  const attachByWall = {};
  elements.filter(e=>e.type==="door"||e.type==="window").forEach(a=>{
    (attachByWall[a.wallId] = attachByWall[a.wallId]||[]).push(a);
  });
  const posts = new Map();
  walls.forEach(w=>{
    buildWall(w, attachByWall[w.id]||[], mats);
    for (const [px, pz] of [[toX(w.x1), toZ(w.y1)], [toX(w.x2), toZ(w.y2)]]) posts.set(Math.round(px*100)+","+Math.round(pz*100), [px, pz]);
  });
  elements.filter(e=>e.type==="door").forEach(d=> buildDoorLeaves(d, mats));
  posts.forEach(([px, pz])=>{
    const p = new THREE.Mesh(new THREE.CylinderGeometry(STUDIO.wallT/2 + 0.004, STUDIO.wallT/2 + 0.004, WALL_H + 0.004, 16), mats.wall);
    p.position.set(px, (WALL_H + 0.004)/2, pz); p.castShadow = true; p.receiveShadow = true; scene.add(p);
  });

  ceilingMesh = new THREE.Group(); ceilingMesh.visible = false;
  ceilingAreas = ceilWallGroups(walls);
  ceilingAreas.forEach(b => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0, 0.08, b.z1 - b.z0), mats.ceil);
    m.position.set((b.x0 + b.x1)/2, WALL_H + 0.04, (b.z0 + b.z1)/2); m.receiveShadow = true;
    ceilingMesh.add(m);
  });
  scene.add(ceilingMesh);
  updateCeilingButton();

  others.forEach(o=>{
    const w3=o.w*SCALE3D, d3=o.h*SCALE3D, h3=elHeight(o);
    const g = buildProp(o.type, w3, d3, h3, COLORS[o.type] || 0x999999, propMats);
    g.position.set(toX(o.x)+w3/2, o.elev||0, toZ(o.y)+d3/2);
    g.rotation.y = -o.rot*Math.PI/180;
    scene.add(g);
    set3dTag(g, o.id);
    if (typeof envGlow === "function") envGlow(g, o);
    if (o.note){
      const note = curLabels()[o.type]+": "+o.note;
      liveObjects.push({x:g.position.x, y:h3+0.3, z:g.position.z, note});
      g.traverse(m=>{ if (m.isMesh){ m.userData.note = note; noteTargets.push(m); } });
    }
  });
  if (typeof trBuild3D === "function") trBuild3D(scene);
  if (typeof cast3dBuild === "function") cast3dBuild();

  const hemi = new THREE.HemisphereLight(0xffffff, 0x6b6660, 0.62); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff6ea, 0.95);
  if (typeof envLightSetup === "function") envLightSetup(hemi, sun);
  const R = Math.max(W, D) + 8;
  orbit.maxDistance = Math.max(120, Math.max(W, D) * 1.6); camera.far = Math.max(400, Math.max(W, D) * 4); camera.updateProjectionMatrix();
  sun.position.set(W/2 - 0.45*R, R, D/2 + 0.65*R); sun.target.position.set(W/2, 0, D/2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const half = Math.max(W, D)*0.72 + 1;
  Object.assign(sun.shadow.camera, { left:-half, right:half, top:half, bottom:-half, near:0.5, far:R*3 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun); scene.add(sun.target);

  if (walls.length || others.length){
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    walls.forEach(w=>{ a=Math.min(a,toX(w.x1),toX(w.x2)); b=Math.max(b,toX(w.x1),toX(w.x2)); c=Math.min(c,toZ(w.y1),toZ(w.y2)); d=Math.max(d,toZ(w.y1),toZ(w.y2)); });
    others.forEach(o=>{ if (o.x === undefined) return; a=Math.min(a,toX(o.x)); b=Math.max(b,toX(o.x+o.w)); c=Math.min(c,toZ(o.y)); d=Math.max(d,toZ(o.y+o.h)); });
    sceneBox = { minX:a, maxX:b, minZ:c, maxZ:d, W:Math.max(1,b-a), D:Math.max(1,d-c) };
  } else sceneBox = { minX:0, maxX:W, minZ:0, maxZ:D, W, D };
  const cx = (sceneBox.minX + sceneBox.maxX)/2, cz = (sceneBox.minZ + sceneBox.maxZ)/2;
  spawnPos = { x: cx, y: 1.6, z: sceneBox.D > 2.2 ? sceneBox.maxZ - 0.9 : cz };
  spawnYaw = 0; spawnPitch = -0.05;
  walkBoard = { W, D };
  const span = Math.max(sceneBox.W, sceneBox.D);
  orbitHome.target.set(cx, 0.6, cz);
  orbitHome.pos.set(cx, 0.6 + span*0.95 + 2.5, cz + span*0.85 + 2.5);

  const bsig = boardCols + "x" + boardRows;
  if (SET3D.boardSig !== bsig || SET3D.fresh) keepView = false;
  SET3D.boardSig = bsig; SET3D.fresh = false;
  if (keepView){ if (ceilingMesh) ceilingMesh.visible = (camMode === "walk" || camMode === "cam") && ceilingOn; }
  else { applyCameraMode(false); resetView(); }
  warmScene();
  SET3D.builtSig = set3dSig(); SET3D.dirty = true;
  if (typeof set3dSelSync === "function") set3dSelSync();
}
function set3dTag(g, id){
  if (!id) return;
  SET3D.byId[id] = g;
  g.traverse(m => { if (m.isMesh){ m.userData.elId = id; SET3D.pickables.push(m); } });
}
const set3dSig = () => JSON.stringify([elements, boardCols, boardRows, timeOfDay, floorType, snapM]);

function buildWall(w, attach, mats){
  const x1=toX(w.x1), z1=toZ(w.y1), x2=toX(w.x2), z2=toZ(w.y2);
  const len = Math.hypot(x2-x1, z2-z1); if (len < 0.02) return;
  const T = STUDIO.wallT, H = WALL_H;
  const g = new THREE.Group();
  g.position.set((x1+x2)/2, 0, (z1+z2)/2);
  g.rotation.y = -Math.atan2(z2-z1, x2-x1);
  const piece = (x0, x1_, y0, y1)=>{
    const sw = x1_ - x0, sh = y1 - y0; if (sw < 0.01 || sh < 0.01) return;
    const geo = new THREE.BoxGeometry(sw, sh, T);
    const m = new THREE.Mesh(geo, mats.wall);
    m.position.set((x0 + x1_)/2, (y0 + y1)/2, 0); m.castShadow = true; m.receiveShadow = true;
    if (w.note){ m.userData.note = w.note; noteTargets.push(m); }
    g.add(m);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), mats.edge); e.position.copy(m.position); g.add(e);
  };
  const ops = attach.map(a=> a.type==="door"
    ? { pos:(a.t - 0.5)*len, w:doorW2D(a)*SCALE3D, bottom:0, top:STUDIO.doorH, win:false }
    : { pos:(a.t - 0.5)*len, w:STUDIO.winW, bottom:STUDIO.winSill, top:STUDIO.winSill + STUDIO.winH, win:true }
  ).sort((a,b)=>a.pos-b.pos);
  let cur = -len/2;
  ops.forEach(op=>{
    const l = Math.max(cur, op.pos - op.w/2), r = Math.min(len/2, op.pos + op.w/2);
    if (r <= l) return;
    piece(cur, l, 0, H);
    piece(l, r, op.top, H);
    piece(l, r, 0, op.bottom);
    if (op.win){
      const gl = new THREE.Mesh(new THREE.BoxGeometry(r - l - 0.04, op.top - op.bottom - 0.04, 0.02), mats.glass);
      gl.position.set((l + r)/2, (op.bottom + op.top)/2, 0); g.add(gl);
    }
    cur = r;
  });
  piece(cur, len/2, 0, H);
  scene.add(g);
  set3dTag(g, w.id);
  if (w.note){ liveObjects.push({x:(x1+x2)/2, y:WALL_H*0.6, z:(z1+z2)/2, note:w.note}); }
}

const DOOR_LEAF_T = 0.04;
function doorLeafLines(el){
  const F = attachFrame(el); if (!F) return [];
  const { px, py, ux, uy, nx, ny } = F, half = doorW2D(el)/2;
  if (isDoor2(el)){
    const side = (el.swing||0) < 2 ? 1 : -1;
    return [-1, 1].map(h => { const hx = px+ux*h*half, hy = py+uy*h*half; return [hx, hy, hx+nx*side*half, hy+ny*side*half]; });
  }
  const s = el.swing||0, side = s < 2 ? 1 : -1, hinge = s % 2 === 0 ? -1 : 1;
  const hx = px+ux*hinge*half, hy = py+uy*hinge*half;
  return [[hx, hy, hx+nx*side*DOOR_W2D, hy+ny*side*DOOR_W2D]];
}
function buildDoorLeaves(el, mats){
  const H = STUDIO.doorH - 0.02;
  doorLeafLines(el).forEach(([ax, ay, bx, by]) => {
    const x1 = toX(ax), z1 = toZ(ay), x2 = toX(bx), z2 = toZ(by), L = Math.hypot(x2-x1, z2-z1); if (L < 0.05) return;
    const geo = new THREE.BoxGeometry(L - 0.02, H, DOOR_LEAF_T);
    const m = new THREE.Mesh(geo, mats.door); m.castShadow = true; m.receiveShadow = true;
    const g = new THREE.Group();
    g.position.set((x1+x2)/2, H/2 + 0.01, (z1+z2)/2); g.rotation.y = -Math.atan2(z2-z1, x2-x1);
    g.add(m);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), mats.edge); g.add(e);
    g.userData.doorLeaf = el.id;
    scene.add(g);
  });
}

let ceilingAreas = [];
function ceilWallGroups(walls){
  const n = walls.length, par = walls.map((_, i) => i), tol = 4;
  const find = i => { while (par[i] !== i){ par[i] = par[par[i]]; i = par[i]; } return i; };
  const segD = (px, py, w) => { const dx = w.x2 - w.x1, dy = w.y2 - w.y1, L2 = dx*dx + dy*dy; let u = L2 ? ((px - w.x1)*dx + (py - w.y1)*dy) / L2 : 0; u = Math.max(0, Math.min(1, u)); return Math.hypot(w.x1 + dx*u - px, w.y1 + dy*u - py); };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++){
    const a = walls[i], b = walls[j];
    if (segD(a.x1, a.y1, b) < tol || segD(a.x2, a.y2, b) < tol || segD(b.x1, b.y1, a) < tol || segD(b.x2, b.y2, a) < tol) par[find(i)] = find(j);
  }
  const box = {};
  walls.forEach((w, i) => {
    const r = find(i), B = box[r] || (box[r] = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity });
    [[toX(w.x1), toZ(w.y1)], [toX(w.x2), toZ(w.y2)]].forEach(([x, z]) => { B.x0 = Math.min(B.x0, x); B.x1 = Math.max(B.x1, x); B.z0 = Math.min(B.z0, z); B.z1 = Math.max(B.z1, z); });
  });
  const pad = STUDIO.wallT / 2;
  return Object.values(box).filter(B => B.x1 - B.x0 >= 0.5 && B.z1 - B.z0 >= 0.5).map(B => ({ x0: B.x0 - pad, x1: B.x1 + pad, z0: B.z0 - pad, z1: B.z1 + pad }));
}

function applyCameraMode(fromButton){
  const walk = camMode === "walk", cam = camMode === "cam", drone = camMode === "drone";
  orbit.enabled = !walk && !cam && !drone;
  if (!cam && !drone){ camera.fov = walk ? WALK_FOV : ORBIT_FOV; camera.updateProjectionMatrix(); if (walk) zoomReset(WALK_FOV); }
  if (ceilingMesh) ceilingMesh.visible = (walk || cam) && ceilingOn;
  if (!walk && !drone && document.pointerLockElement) document.exitPointerLock();
  if (drone){ fromButton = false; }
  if (cam && typeof camApply === "function") camApply(true);
  noteLabel.style.display = "none";
  if (fromButton) resetView();
  updateLiveUi();
}
function resetView(){
  if (camMode === "drone") return;
  if (camMode === "cam"){ if (typeof camApply === "function") camApply(true); return; }
  if (camMode === "walk"){
    walkSpawnCalc();
    camera.position.set(spawnPos.x, spawnPos.y, spawnPos.z);
    yaw = spawnYaw; pitch = spawnPitch; lookSync(); zoomReset(WALK_FOV); camera.fov = WALK_FOV; camera.updateProjectionMatrix();
    camera.rotation.order = "YXZ"; camera.rotation.set(pitch, yaw, 0);
  } else {
    camera.position.copy(orbitHome.pos);
    orbit.target.copy(orbitHome.target);
    orbit.update();
  }
}
function updateLiveUi(){
  const walk = camMode === "walk", cam = camMode === "cam";
  camOrbitBtn.classList.toggle("on", !walk && !cam && camMode !== "drone"); camWalkBtn.classList.toggle("on", walk);
  camCamBtn.classList.toggle("on", cam);
  camCamBtn.disabled = typeof CAMS === "undefined" || !CAMS.list.length;
  ceilBtn.style.display = ""; ceilBtn.style.visibility = (walk || cam) ? "" : "hidden";
  orbitHint.style.display = "";
  orbitHint.textContent = t(cam ? "camHint" : walk ? "walkHint" : camMode === "drone" ? "droneHint" : "orbitHint");
  liveHintShow();
  liveOverlay.style.display = "none";
  crosshair.style.display = walk || camMode === "drone" ? "block" : "none";
  if (renderer) renderer.domElement.style.cursor = walk ? "grab" : "";
  if (typeof camFrameLayout === "function") camFrameLayout();
}
function setCamMode(mode){
  if (camMode === mode) return;
  camMode = mode; perfEv(t("ev_mode"));
  applyCameraMode(true); SET3D.dirty = true;
  if (typeof setMeUpdate === "function") setMeUpdate(true);
}
camOrbitBtn.addEventListener("click", ()=> setCamMode("orbit"));
camCamBtn.addEventListener("click", ()=> { if (typeof CAMS !== "undefined" && CAMS.list.length) setCamMode(camMode === "cam" ? "orbit" : "cam"); });
camWalkBtn.addEventListener("click", ()=> setCamMode("walk"));

function orbitHover(e){
  return;
  if (!inLiveMode) return;
  if (camMode !== "orbit" || !noteTargets.length || e.buttons){ if (camMode==="orbit") noteLabel.style.display="none"; return; }
  const r = renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera({ x: ((e.clientX - r.left)/r.width)*2 - 1, y: -((e.clientY - r.top)/r.height)*2 + 1 }, camera);
  const hit = raycaster.intersectObjects(noteTargets, false)[0];
  if (hit){
    noteLabel.textContent = hit.object.userData.note;
    const hr = liveScreen.getBoundingClientRect();
    noteLabel.style.left = (e.clientX - hr.left) + "px"; noteLabel.style.top = (e.clientY - hr.top) + "px";
    noteLabel.style.display = "block";
  } else noteLabel.style.display = "none";
}

function animate(){
  requestAnimationFrame(animate);
  if (!inLiveMode){ SET3D.rendering = false; return; }
  const dt = clock ? Math.min(clock.getDelta(),0.05) : 0.016;
  let need = SET3D.dirty;
  const recOn = typeof REC !== "undefined" && REC.on;
  if (recOn){ recTick(); need = true; }
  const pvOn = typeof PV !== "undefined" && PV.on;
  if (pvOn){ pvTick(); need = true; }

  if (camMode === "drone"){ droneTick(); need = true; }
  else if (camMode === "walk"){
    const ldt = lookDt();
    if (lookStep(ldt)) need = true;
    if (zoomStep(ldt)){ camera.fov = ZOOM.fov; camera.updateProjectionMatrix(); need = true; }
    camera.rotation.order="YXZ";
    camera.rotation.y=yaw; camera.rotation.x=pitch; camera.rotation.z=0;
    const walkKeys = locked || (typeof setKeysTo3d === "function" && setKeysTo3d());
    const moving = walkKeys && ["KeyW","KeyA","KeyS","KeyD","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].some(k => keys[k]);
    if (moving || locked){
      need = true;
      const speed = (keys["ShiftLeft"]||keys["ShiftRight"]) ? 3.2 : 1.7;
      const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const right = new THREE.Vector3(-forward.z, 0, forward.x);
      const move = new THREE.Vector3();
      if (keys["KeyW"]||keys["ArrowUp"]) move.add(forward);
      if (keys["KeyS"]||keys["ArrowDown"]) move.sub(forward);
      if (keys["KeyD"]||keys["ArrowRight"]) move.add(right);
      if (keys["KeyA"]||keys["ArrowLeft"]) move.sub(right);
      if (move.lengthSq()>0){ move.normalize().multiplyScalar(speed*dt); camera.position.x+=move.x; camera.position.z+=move.z; }
    }
    if (typeof setMeUpdate === "function") setMeUpdate();
  } else if (camMode === "cam"){
    if (typeof camApply === "function" && camApply()) need = true;
  } else {
    if (orbit.update()) need = true;
  }

  if (!need){ SET3D.rendering = false; return; }
  if (!SET3D.rendering){ perfResume(); drsResume(); }
  SET3D.rendering = true; SET3D.dirty = false;
  perfFrameStart();
  v3Render();
  if (pvOn) pvFrame();
  if (recOn) recFrame();
  if (typeof memo3dLayout === "function") memo3dLayout();
  diagTick();
  perfFrameEnd();
  drsTick();
}

function enterLiveMode(){
  if (document.pointerLockElement) document.exitPointerLock();
  locked=false;
  camMode = "orbit";
  buildLiveScene();
}

document.getElementById("reset-view-btn").addEventListener("click", ()=>{ perfEv(t("ev_resetView")); resetView(); SET3D.dirty = true; });
document.getElementById("screenshot-btn").addEventListener("click", ()=>{
  perfEv(t("ev_screenshot"));
  if (typeof shotWithChoice === "function") shotWithChoice(); else openAnnotModal(v3Snapshot());
});

function ceilingUsable(){ return ceilingAreas.length > 0; }
function updateCeilingButton(){
  const ok = ceilingUsable();
  ceilBtn.classList.toggle("on", ceilingOn && ok);
  ceilBtn.classList.toggle("dim", !ok); ceilBtn.setAttribute("aria-disabled", ok ? "false" : "true");
  ceilBtn.title = t(ok ? "ceilingTitle" : "ceilingNoWalls");
  ceilBtn.textContent = t("ceilingBtn");
}
ceilBtn.addEventListener("click", ()=>{
  if (!ceilingUsable()){ showToast(t("ceilingNoWalls")); return; }
  ceilingOn = !ceilingOn;
  updateCeilingButton();
  if (inLiveMode && ceilingMesh){
    perfEv(t("ev_ceiling"));
    ceilingMesh.visible = (camMode === "walk" || camMode === "cam") && ceilingOn; SET3D.dirty = true;
  }
});
onLangChange(()=>{ if (threeInited){ updateLiveUi(); updateCeilingButton(); } });

PERF_ACTIVE = () => inLiveMode;
PERF_WHERE = () => "세트 3D · " + (camMode === "walk" ? (locked ? "걷기" : "1인칭 대기") : "돌려 보기") + (typeof SETV !== "undefined" && SETV.view === "split" ? " · 나란히" : "");

let liveHintTimer = 0, liveHintMode = "";
function liveHintShow(){
  if (liveHintMode === camMode && orbitHint.classList.contains("dim")) return;
  liveHintMode = camMode;
  orbitHint.classList.remove("dim"); clearTimeout(liveHintTimer);
  liveHintTimer = setTimeout(() => orbitHint.classList.add("dim"), 5000);
}
liveScreen.addEventListener("pointermove", e => {
  if (!orbitHint.classList.contains("dim")) return;
  const r = orbitHint.getBoundingClientRect(), pad = 8;
  orbitHint.classList.toggle("near", e.clientX >= r.left - pad && e.clientX <= r.right + pad && e.clientY >= r.top - pad && e.clientY <= r.bottom + pad);
});
liveScreen.addEventListener("pointerleave", () => orbitHint.classList.remove("near"));
