"use strict";

const SETM = { show: true, selIds: new Set(), editing: null, isNew: false, lastKind: "set", drag: null };
Object.defineProperty(SETM, "sel", { get(){ return this.selIds.size ? [...this.selIds][0] : null; }, set(v){ this.selIds = new Set(v ? [v] : []); } });
try { SETM.show = localStorage.getItem("dd-memo-show") !== "0"; } catch(e){}
const memoLayer2d = document.getElementById("memo2d-layer");
const memo3dBox = document.getElementById("memo3d"), memo3dLines = document.getElementById("memo3d-lines");
const memoEdit = document.getElementById("memo-edit"), memoText = document.getElementById("memo-text");
const memoNewId = () => "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const memoKindIcon = k => k === "scene" ? "🎬" : "🔒";

function memoFrame(el){
  if (!el) return null;
  if (el.type === "wall" || el.type === "line") return { cx: (el.x1 + el.x2) / 2, cy: (el.y1 + el.y2) / 2, rot: Math.atan2(el.y2 - el.y1, el.x2 - el.x1) * 180 / Math.PI, top: WALL_H * 0.72 };
  if (el.pts){ const c = trCentroid(el); return { cx: c.x, cy: c.y, rot: 0, top: 0.3 }; }
  if (el.type === "zone") return { cx: el.x + el.w / 2, cy: el.y + el.h / 2, rot: el.rot || 0, top: 0.3 };
  if (el.x === undefined) return null;
  return { cx: el.x + el.w / 2, cy: el.y + el.h / 2, rot: el.rot || 0, top: elHeight(el) + 0.12 };
}
const rot2 = (x, y, deg) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; };
function memoPos(m){
  const el = m.elId ? getEl(m.elId) : null, F = memoFrame(el);
  if (F){ const [ox, oy] = rot2(m.dx || 0, m.dy || 0, F.rot); return { x: F.cx + ox, y: F.cy + oy, el }; }
  return { x: m.x || 0, y: m.y || 0, el: null };
}
const memoWorld = m => { const p = memoPos(m); const base = p.el ? (p.el.elev || 0) : 0; return new THREE.Vector3(p.x * SCALE3D - minX * SCALE3D, base + (m.h != null ? m.h : 1), p.y * SCALE3D - minY * SCALE3D); };
function memoAnchorAt(x, y, h, elId){
  const el = elId ? getEl(elId) : null, F = memoFrame(el);
  if (F){ const [dx, dy] = rot2(x - F.cx, y - F.cy, -F.rot); return { elId: el.id, dx, dy, x, y, h: h != null ? h - (el.elev || 0) : F.top }; }
  return { elId: null, dx: 0, dy: 0, x, y, h: h != null ? h : 0 };
}

function memoMigrateNotes(){
  let n = 0;
  elements.forEach(el => {
    if (!el.note || !String(el.note).trim()) return;
    const F = memoFrame(el); if (!F) return;
    memos.push(Object.assign({ id: memoNewId(), kind: "set", text: String(el.note).trim() }, memoAnchorAt(F.cx, F.cy, F.top, el.id)));
    el.note = ""; n++;
  });
  return n;
}

function memoDodge(placed, x, y, w, h, gap){
  for (let k = 0; k < 12; k++){
    const hit = placed.find(r => x < r.x + r.w && x + w > r.x && y < r.y + r.h + gap && y + h + gap > r.y);
    if (!hit) break; y = hit.y + hit.h + gap;
  }
  placed.push({ x, y, w, h }); return y;
}
function memoShort(s, n){ s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
function memo2dRender(){
  if (!memoLayer2d) return;
  memoLayer2d.innerHTML = "";
  if (!SETM.show) return;
  const placed = [];
  memos.forEach(m => {
    const p = memoPos(m), sel = SETM.selIds.has(m.id), scene = m.kind === "scene";
    const col = scene ? "#3b82f6" : "#d99a00", bg = scene ? "#edf4ff" : "#fff7dc";
    const g = makeSvgEl("g", { class: "memo2d" + (sel ? " sel" : ""), "data-mid": m.id });
    const K = typeof planK === "function" ? planK() : 1;
    const txt = memoKindIcon(m.kind) + " " + memoShort(m.text, 14), w = K * Math.max(30, [...txt].reduce((a, ch) => a + (ch.charCodeAt(0) < 128 ? 5.4 : 9.4), 0) + 6);
    const lx = p.x + 16 * K, ly = memoDodge(placed, lx, p.y - 23 * K, w, 14 * K, 3 * K) + 3 * K;
    g.appendChild(makeSvgEl("line", { x1: p.x, y1: p.y, x2: lx, y2: ly + 4 * K, stroke: col, "stroke-width": K }));
    g.appendChild(makeSvgEl("circle", { cx: p.x, cy: p.y, r: 2.6 * K, fill: col }));
    g.appendChild(makeSvgEl("rect", { x: lx, y: ly - 3 * K, width: w, height: 14 * K, rx: 3 * K, fill: bg, stroke: col, "stroke-width": (sel ? 2 : 1) * K }));
    const tx = makeSvgEl("text", { x: lx + 4 * K, y: ly + 7.5 * K, "font-size": 9 * K, fill: "#1e1e26" }); tx.textContent = txt; g.appendChild(tx);
    const tt = makeSvgEl("title", {}); tt.textContent = memoKindIcon(m.kind) + " " + m.text; g.appendChild(tt);
    g.addEventListener("pointerdown", e => {
      if (e.button !== 0) return; e.stopPropagation();
      if (e.shiftKey || e.ctrlKey || e.metaKey){ memoSelect(m.id, true); return; }
      if (!SETM.selIds.has(m.id)) memoSelect(m.id);
      memoDragStart(m, e);
    });
    g.addEventListener("dblclick", e => { e.stopPropagation(); memoOpenEditor(m, e.clientX, e.clientY, false); });
    memoLayer2d.appendChild(g);
  });
}

const memo3dEls = {};
function memo3dLayout(){
  if (!memo3dBox) return;
  const on = SETM.show && inLiveMode && typeof camera !== "undefined" && camera && V3.host === liveView;
  memo3dBox.hidden = !on;
  if (!on) return;
  const W = liveView.clientWidth, H = liveView.clientHeight, keep = new Set();
  let lines = ""; const placed = [];
  camera.updateMatrixWorld();
  memos.forEach(m => {
    const wp = memoWorld(m), v = wp.clone().project(camera);
    const near = camMode !== "walk" || camera.position.distanceTo(wp) < 7;
    if (v.z > 1 || v.z < -1 || !near || Math.abs(v.x) > 1.15 || Math.abs(v.y) > 1.15) return;
    const ax = (v.x * 0.5 + 0.5) * W, ay = (-v.y * 0.5 + 0.5) * H;
    let el = memo3dEls[m.id];
    if (!el){
      el = memo3dEls[m.id] = document.createElement("div"); el.className = "memo3d-box";
      el.addEventListener("pointerdown", e => { e.stopPropagation(); if (e.button === 0) memoSelect(m.id, e.shiftKey || e.ctrlKey || e.metaKey); });
      el.addEventListener("dblclick", e => { e.stopPropagation(); const mm = memos.find(x => x.id === m.id); if (mm) memoOpenEditor(mm, e.clientX, e.clientY, false); });
      memo3dBox.appendChild(el);
    }
    el.classList.toggle("scene", m.kind === "scene"); el.classList.toggle("sel", SETM.selIds.has(m.id));
    const label = memoKindIcon(m.kind) + " " + m.text;
    if (el._t !== label){ el.textContent = label; el._t = label; }
    const bx = Math.min(W - 12, ax + 26);
    el.style.maxWidth = Math.max(80, Math.min(220, W - bx - 8)) + "px";
    const by = memoDodge(placed, bx, Math.max(6, ay - 52), el.offsetWidth, el.offsetHeight, 4);
    el.style.left = bx + "px"; el.style.top = by + "px";
    const col = m.kind === "scene" ? "#3b82f6" : "#f2b632";
    if (!m.elId && wp.y < 0.15){
      const pts = []; for (let i = 0; i < 16; i++){ const a = i / 16 * Math.PI * 2, q = new THREE.Vector3(wp.x + Math.cos(a) * 0.28, 0.01, wp.z + Math.sin(a) * 0.28).project(camera); pts.push(((q.x * 0.5 + 0.5) * W).toFixed(1) + "," + ((-q.y * 0.5 + 0.5) * H).toFixed(1)); }
      lines += `<polygon points="${pts.join(" ")}" fill="${col}" fill-opacity="0.28" stroke="${col}" stroke-width="2"/>`;
    }
    lines += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by + 10}" stroke="${col}" stroke-width="1.5"/><circle cx="${ax}" cy="${ay}" r="3.5" fill="${col}" stroke="#111" stroke-width="1"/>`;
    keep.add(m.id);
  });
  for (const id in memo3dEls) if (!keep.has(id)){ memo3dEls[id].remove(); delete memo3dEls[id]; }
  memo3dLines.setAttribute("viewBox", `0 0 ${W} ${H}`); memo3dLines.innerHTML = lines;
}
function memoRefresh(){ memo2dRender(); memoCountRender(); if (typeof SET3D !== "undefined") SET3D.dirty = true; }

function memoSelect(id, add){
  if (add){ if (SETM.selIds.has(id)) SETM.selIds.delete(id); else SETM.selIds.add(id); }
  else SETM.sel = id;
  if (id && selectedIds.length){ selectedIds = []; renderSelection(); updatePropPanel(); }
  memoRefresh();
}
function memoSelectAll(){ SETM.selIds = new Set(memos.map(m => m.id)); if (!SETM.show) memoSetShow(true); if (selectedIds.length){ selectedIds = []; renderSelection(); updatePropPanel(); } memoRefresh(); if (memos.length) showToast(t("memoAllSel").replace("{n}", memos.length)); }
function memoDelete(id){
  const ids = id ? new Set([id]) : new Set(SETM.selIds); if (!ids.size) return;
  const before = memos.length;
  pushHistory(); memos = memos.filter(m => !ids.has(m.id)); SETM.selIds = new Set();
  memoRefresh(); undoToastSet(before - memos.length > 1 ? t("memoDeletedN").replace("{n}", before - memos.length) : t("memoDeleted"));
}
function memoDragStart(m, e){
  const pt = screenToCanvas(e.clientX, e.clientY), p = memoPos(m);
  SETM.drag = { m, sx: pt.x, sy: pt.y, px: p.x, py: p.y, hAbs: memoWorld(m).y, moved: false, id: e.pointerId };
  svg.setPointerCapture(e.pointerId);
}
svg.addEventListener("pointermove", e => {
  const D = SETM.drag; if (!D) return;
  const pt = screenToCanvas(e.clientX, e.clientY), dx = pt.x - D.sx, dy = pt.y - D.sy;
  if (!D.moved && Math.hypot(dx, dy) * scale < 4) return;
  if (!D.moved){ D.moved = true; pushHistory(); }
  Object.assign(D.m, { elId: null, x: D.px + dx, y: D.py + dy, h: D.hAbs });
  memoRefresh(); e.stopImmediatePropagation();
}, true);
const memoDragEnd = () => {
  const D = SETM.drag; if (!D) return; SETM.drag = null;
  if (!D.moved) return;
  const x = D.m.x, y = D.m.y;
  const tgt = elements.filter(isObj).sort((a, b) => (b.elev || 0) - (a.elev || 0)).find(o => inFootprint(x, y, o))
    || elements.find(w => w.type === "wall" && distToWall(x, y, w) < 8);
  Object.assign(D.m, memoAnchorAt(x, y, tgt ? null : Math.max(0.05, D.hAbs), tgt ? tgt.id : null));
  memoRefresh();
};
svg.addEventListener("pointerup", memoDragEnd, true); svg.addEventListener("pointercancel", memoDragEnd, true);
function distToWall(px, py, w){ const dx = w.x2 - w.x1, dy = w.y2 - w.y1, L = dx * dx + dy * dy || 1, k = Math.max(0, Math.min(1, ((px - w.x1) * dx + (py - w.y1) * dy) / L)); return Math.hypot(px - (w.x1 + dx * k), py - (w.y1 + dy * k)); }
function memoClearAll(){
  if (!memos.length) return;
  pushHistory(); const n = memos.length; memos = []; SETM.sel = null; memoRefresh();
  undoToastSet(t("memoClearedN").replace("{n}", n));
}
function undoToastSet(msg){
  let el = document.getElementById("undo-toast-set");
  if (!el){
    el = document.createElement("div"); el.id = "undo-toast-set"; el.innerHTML = "<span></span><button type=\"button\"></button>";
    document.getElementById("set-screen").appendChild(el);
    el.querySelector("button").addEventListener("click", () => { undo(); el.classList.remove("show"); });
  }
  el.querySelector("span").textContent = msg; el.querySelector("button").textContent = t("undoToastBtn");
  el.classList.add("show"); clearTimeout(undoToastSet._t); undoToastSet._t = setTimeout(() => el.classList.remove("show"), 5000);
}

function memoToggleKind(ids){
  const list = memos.filter(m => ids.has(m.id)); if (!list.length) return;
  pushHistory(); const to = list[0].kind === "scene" ? "set" : "scene"; list.forEach(m => m.kind = to); memoRefresh();
}
function memoOpenEditor(m, cx, cy, isNew){
  SETM.editing = m; SETM.isNew = !!isNew; SETM.sel = m.id;
  memoEdit.hidden = false;
  memoText.value = m.text || ""; memoText.placeholder = t("memoPh");
  memoKindRender();
  const wEl = m.elId ? getEl(m.elId) : null;
  memoEdit.querySelector(".me-where").textContent = "📍 " + (wEl ? (wEl.pts || wEl.type === "zone" ? trLabel(wEl) : (curLabels()[wEl.type] || wEl.type)) : t("memoOnFloor"));
  const w = 280, h = 170;
  memoEdit.style.left = Math.max(8, Math.min(innerWidth - w - 8, cx + 10)) + "px";
  memoEdit.style.top = Math.max(64, Math.min(innerHeight - h - 8, cy - 20)) + "px";
  memoRefresh();
  setTimeout(() => memoText.focus(), 0);
}
function memoKindRender(){
  const m = SETM.editing; if (!m) return;
  memoEdit.querySelectorAll(".me-kinds button").forEach(b => b.classList.toggle("on", b.dataset.kind === m.kind));
  memoEdit.classList.toggle("scene", m.kind === "scene");
}
function memoCommit(){
  const m = SETM.editing; if (!m) return;
  SETM.editing = null; memoEdit.hidden = true;
  const txt = memoText.value.trim();
  if (!txt){
    const i = memos.indexOf(m); if (i >= 0){ if (!SETM.isNew) pushHistory(); memos.splice(i, 1); }
    if (SETM.isNew) undoStack.pop();
    SETM.sel = null; memoRefresh(); return;
  }
  if (txt !== m.text && !SETM.isNew) pushHistory();
  m.text = txt; SETM.lastKind = m.kind; memoRefresh();
}
memoEdit.querySelectorAll(".me-kinds button").forEach(b => b.addEventListener("click", () => {
  if (SETM.editing){ SETM.editing.kind = b.dataset.kind; memoKindRender(); memoRefresh(); memoText.focus(); }
}));
document.getElementById("memo-ok").addEventListener("click", memoCommit);
document.getElementById("memo-del").addEventListener("click", () => { memoText.value = ""; memoCommit(); });
memoText.addEventListener("keydown", e => {
  e.stopPropagation();
  if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))){ e.preventDefault(); memoCommit(); }
});
document.addEventListener("pointerdown", e => { if (SETM.editing && !memoEdit.contains(e.target)) memoCommit(); }, true);

function memoCreate(anchor, cx, cy){
  pushHistory();
  const m = Object.assign({ id: memoNewId(), kind: SETM.lastKind, text: "" }, anchor);
  memos.push(m);
  if (!SETM.show) memoSetShow(true);
  memoOpenEditor(m, cx, cy, true);
}
function memoNewFrom2D(e){
  if (e.target.closest && e.target.closest(".memo2d")) return;
  const pt = screenToCanvas(e.clientX, e.clientY), shape = e.target.closest && e.target.closest(".shape-el");
  let el = shape ? getEl(shape.dataset.id) : null;
  if (el && (el.type === "door" || el.type === "window")) el = getEl(el.wallId);
  memoCreate(memoAnchorAt(pt.x, pt.y, null, el ? el.id : null), e.clientX, e.clientY);
}
{
  let last = null;
  svg.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;
    const now = performance.now();
    const dbl = last && now - last.t < 380 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 6;
    last = dbl ? null : { t: now, x: e.clientX, y: e.clientY };
    if (!dbl || currentTool !== "select" || spaceHeld || (typeof TL !== "undefined" && TL.pathMode)) return;
    e.stopImmediatePropagation(); e.preventDefault();
    const mg = e.target.closest && e.target.closest(".memo2d");
    if (mg){ const m = memos.find(x => x.id === mg.dataset.mid); if (m) memoOpenEditor(m, e.clientX, e.clientY, false); return; }
    memoNewFrom2D(e);
  }, true);
}
document.addEventListener("dblclick", e => {
  if (APP.screen !== "set" || !inLiveMode || !V3.renderer || e.target !== V3.renderer.domElement) return;
  const r = V3.renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }, camera);
  const hit = raycaster.intersectObjects(SET3D.pickables, false)[0];
  let p, elId = null;
  if (hit){ p = hit.point; elId = hit.object.userData.elId || null; }
  else {
    const pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), q = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(pl, q)) return; p = q;
  }
  const x = p.x / SCALE3D + minX, y = p.z / SCALE3D + minY;
  memoCreate(memoAnchorAt(x, y, Math.max(0.05, p.y + (hit ? 0.02 : 0.05)), elId), e.clientX, e.clientY);
});

function memoCountRender(){
  const s = memos.filter(m => m.kind !== "scene").length, c = memos.length - s;
  document.getElementById("memo-count").textContent = `🔒 ${s} · 🎬 ${c}`;
  const b = document.getElementById("memo-show");
  b.textContent = SETM.show ? t("memoShowOn") : t("memoShowOff"); b.classList.toggle("on", SETM.show);
  document.getElementById("memo-clear").disabled = !memos.length;
}
function memoSetShow(v){ SETM.show = v; try { localStorage.setItem("dd-memo-show", v ? "1" : "0"); } catch(e){} memoRefresh(); }
document.getElementById("memo-show").addEventListener("click", () => memoSetShow(!SETM.show));
document.getElementById("memo-clear").addEventListener("click", memoClearAll);

window.addEventListener("keydown", e => {
  if (APP.screen !== "set" || !SETM.sel || SETM.editing) return;
  const a = document.activeElement; if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA")) return;
  if (e.code === "Delete" || e.code === "Backspace" || e.key === "Delete"){ e.preventDefault(); memoDelete(); }
  else if (e.key === "Escape"){ SETM.sel = null; memoRefresh(); }
  else if ((e.ctrlKey || e.metaKey) && e.code === "KeyA"){ e.preventDefault(); e.stopImmediatePropagation(); memoSelectAll(); }
}, true);
svg.addEventListener("pointerdown", e => { if (e.button === 0 && SETM.sel && !(e.target.closest && e.target.closest(".memo2d"))){ SETM.sel = null; memoRefresh(); } });
document.addEventListener("pointerdown", e => { if (e.button === 0 && SETM.sel && V3.renderer && e.target === V3.renderer.domElement){ SETM.sel = null; memoRefresh(); } }, true);

{ const r1 = render; render = function(){ r1(); memo2dRender(); memoCountRender(); if (typeof SET3D !== "undefined") SET3D.dirty = true; }; }
onLangChange(() => { memoCountRender(); memoKindRender(); });

const exportBtn = document.getElementById("export-btn"), exportMenu = document.getElementById("export-menu");
exportBtn.addEventListener("click", e => {
  e.stopPropagation();
  if (!exportMenu.hidden){ exportMenu.hidden = true; return; }
  flowDirRender(); exportMenu.hidden = false;
  const r = exportBtn.getBoundingClientRect(), h = exportMenu.offsetHeight;
  exportMenu.style.left = (r.right + 8) + "px"; exportMenu.style.top = Math.max(60, Math.min(innerHeight - h - 8, r.top)) + "px";
});
document.addEventListener("pointerdown", e => { if (!exportMenu.hidden && !exportMenu.contains(e.target) && e.target !== exportBtn) exportMenu.hidden = true; }, true);
exportMenu.querySelectorAll("button[data-ex]").forEach(b => b.addEventListener("click", () => { exportMenu.hidden = true; exportRun(b.dataset.ex); }));

function exportNeed3d(fn){
  if (SETV.view === "2d"){ setView("split"); setTimeout(() => requestAnimationFrame(fn), 120); }
  else fn();
}
function exportRun(kind){
  perfEv(t("ev_export"));
  if (kind === "text") return aiTextOpen();
  if (kind === "flow") return exportNeed3d(flowPackage);
  if (kind === "pair") return exportNeed3d(() => { const s3 = shot3d(true); plan2dImage(true, p2 => pairImage(s3, p2, url => openAnnotModal(url))); });
  if (kind === "refs") return exportNeed3d(() => refPhotos(url => { saveDataUrl(flowBase() + "_" + t("fnRefs") + ".png", url); showToast(t("refsSaved")); }));
}
function shotWithChoice(){
  const on = shot3d(true), off = memos.length ? shot3d(false) : on;
  openAnnotModal(on, { on, off, checked: SETM.show && memos.length > 0 });
}

const FLOWDIR = { handle: null };
const safeName = v => String(v || "").replace(/[\\/:*?"<>|]/g, "_").trim().slice(0, 40);
function flowBase(){
  const d = new Date(), p2 = n => String(n).padStart(2, "0");
  return (safeName(setName) || t("fnSet")) + "_" + p2(d.getMonth() + 1) + p2(d.getDate()) + "-" + p2(d.getHours()) + p2(d.getMinutes());
}
function dataUrlToBlob(url){
  const [head, b64] = url.split(","), mime = (head.match(/data:([^;]+)/) || [])[1] || "application/octet-stream";
  const bin = atob(b64), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
function flowDirRender(){
  const n = document.getElementById("flow-dir-name"), c = document.getElementById("flow-dir-change");
  const can = typeof window.showDirectoryPicker === "function";
  n.textContent = !can ? t("exFlowNoDir") : FLOWDIR.handle ? "📁 " + FLOWDIR.handle.name : t("exFlowDirFirst");
  c.hidden = !can || !FLOWDIR.handle;
}
document.getElementById("flow-dir-change").addEventListener("click", async e => {
  e.stopPropagation();
  try { FLOWDIR.handle = await window.showDirectoryPicker({ id: "dd-flow", mode: "readwrite" }); } catch(err){}
  flowDirRender();
});
async function flowPackage(){
  const base = flowBase();
  const files = [];
  files.push({ name: `1_${base}_${t("fnStart")}.png`, blob: dataUrlToBlob(shot3d(false)) });
  const refs = await new Promise(res => refPhotos(res));
  files.push({ name: `2_${base}_${t("fnRefs")}.png`, blob: dataUrlToBlob(refs) });
  files.push({ name: `3_${base}_${t("fnPrompt")}.txt`, blob: new Blob(["\ufeff" + aiText()], { type: "text/plain;charset=utf-8" }) });
  if (memos.length) files.push({ name: `4_${base}_${t("fnExplain")}.png`, blob: dataUrlToBlob(shot3d(true)) });
  copyText(aiText(), () => {});
  if (typeof window.showDirectoryPicker === "function"){
    try {
      if (!FLOWDIR.handle) FLOWDIR.handle = await window.showDirectoryPicker({ id: "dd-flow", mode: "readwrite" });
      if (FLOWDIR.handle.requestPermission && (await FLOWDIR.handle.requestPermission({ mode: "readwrite" })) !== "granted") throw new Error("denied");
      const dir = await FLOWDIR.handle.getDirectoryHandle(base + "_Flow", { create: true });
      for (const f of files){ const fh = await dir.getFileHandle(f.name, { create: true }), w = await fh.createWritable(); await w.write(f.blob); await w.close(); }
      showToast(t("flowSavedDir").replace("{d}", FLOWDIR.handle.name + "/" + base + "_Flow").replace("{n}", files.length));
      return;
    } catch(err){
      if (err && err.name === "AbortError"){ showToast(t("flowCancel")); return; }
    }
  }
  files.forEach((f, i) => setTimeout(() => { const a = document.createElement("a"), u = URL.createObjectURL(f.blob); a.href = u; a.download = f.name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 4000); }, i * 350));
  showToast(t("flowSavedDl").replace("{n}", files.length));
}

const setNameInput = document.getElementById("set-name");
setNameInput.addEventListener("input", () => { setName = setNameInput.value; });
setNameInput.addEventListener("change", () => { if (typeof render === "function") render(); });
setNameInput.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Enter") setNameInput.blur(); });

function withCleanScene(fn){
  const boxes = SET3D.selBoxes.map(b => [b, b.visible]); boxes.forEach(([b]) => b.visible = false);
  const ceil = ceilingMesh ? ceilingMesh.visible : false;
  try { return fn(); } finally { boxes.forEach(([b, v]) => b.visible = v); if (ceilingMesh) ceilingMesh.visible = ceil; SET3D.dirty = true; }
}
function shot3d(withMemos){
  const r = V3.renderer, cvs = r.domElement;
  return withCleanScene(() => {
    const cur = r.getPixelRatio(), full = V3.pr;
    if (cur !== full) r.setPixelRatio(full);
    r.setRenderTarget(null); r.render(scene, camera);
    const c = document.createElement("canvas"); c.width = cvs.width; c.height = cvs.height;
    const ctx = c.getContext("2d"); ctx.drawImage(cvs, 0, 0);
    if (cur !== full) r.setPixelRatio(cur);
    if (withMemos && memos.length) drawCallouts(ctx, c.width, c.height, camera);
    return shotCrop(c).toDataURL("image/png");
  });
}
function shotCrop(c){
  if (typeof camMode === "undefined" || camMode !== "cam" || typeof camFrameBox !== "function") return c;
  const cvs = V3.renderer.domElement, b = camFrameBoxIn(cvs.clientWidth, cvs.clientHeight); if (!b) return c;
  const kx = c.width / cvs.clientWidth, ky = c.height / cvs.clientHeight;
  const o = document.createElement("canvas"); o.width = Math.max(1, Math.round(b.w * kx)); o.height = Math.max(1, Math.round(b.h * ky));
  o.getContext("2d").drawImage(c, b.x * kx, b.y * ky, b.w * kx, b.h * ky, 0, 0, o.width, o.height);
  return o;
}
function drawCallouts(ctx, W, H, cam, kinds){
  const k = W / Math.max(1, liveView.clientWidth), fs = Math.round(13 * k);
  ctx.font = `${fs}px sans-serif`; ctx.textBaseline = "top";
  cam.updateMatrixWorld(); const placed = [];
  memos.forEach(m => {
    if (kinds && !kinds.includes(m.kind)) return;
    const wp = memoWorld(m), v = wp.clone().project(cam);
    if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) return;
    if (camMode === "walk" && cam === camera && camera.position.distanceTo(wp) > 7) return;
    const ax = (v.x * 0.5 + 0.5) * W, ay = (-v.y * 0.5 + 0.5) * H, scene = m.kind === "scene";
    const col = scene ? "#3b82f6" : "#f2b632", bg = scene ? "#eef4ff" : "#fff7dc";
    const lines = wrapText(ctx, memoKindIcon(m.kind) + " " + m.text, 220 * k).slice(0, 4);
    const lh = fs * 1.3, bw = Math.max(...lines.map(l => ctx.measureText(l).width)) + 14 * k, bh = lines.length * lh + 10 * k;
    const bx = Math.min(W - bw - 4, ax + 26 * k), by = memoDodge(placed, bx, Math.max(4, ay - 52 * k), bw, bh, 4 * k);
    ctx.strokeStyle = col; ctx.lineWidth = 1.5 * k; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by + 10 * k); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(ax, ay, 3.5 * k, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = bg; ctx.strokeStyle = col; ctx.lineWidth = 2 * k;
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 6 * k); else ctx.rect(bx, by, bw, bh); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#1e1e26"; lines.forEach((l, i) => ctx.fillText(l, bx + 7 * k, by + 5 * k + i * lh));
  });
}
function wrapText(ctx, text, maxW){
  const out = []; let line = "";
  for (const ch of String(text)){
    if (ch === "\n"){ out.push(line); line = ""; continue; }
    if (ctx.measureText(line + ch).width > maxW && line){ out.push(line); line = ch; } else line += ch;
  }
  if (line) out.push(line); return out;
}
function plan2dImage(withMemos, cb){
  const pad = 30, bw = boardW(), bh = boardH(), sc = Math.min(2.4, 1400 / (bw + pad * 2));
  const W = Math.round((bw + pad * 2) * sc), H = Math.round((bh + pad * 2) * sc);
  const sel = selectedIds; selectedIds = []; planTheme("light"); renderBoard(); render();
  if (typeof castRender2D === "function") castRender2D();
  const castL = document.getElementById("cast-layer"), body = boardLayer.outerHTML + shapesLayer.outerHTML + (castL ? castL.outerHTML : "") + (withMemos ? memoLayer2d.outerHTML : "");
  planTheme("dark"); selectedIds = sel; renderBoard(); render(); renderSelection();
  const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${-pad} ${-pad} ${bw + pad * 2} ${bh + pad * 2}"><rect x="${-pad}" y="${-pad}" width="${bw + pad * 2}" height="${bh + pad * 2}" fill="${PLAN_PAL.light.around}"/><g font-family="sans-serif">${body}</g></svg>`;
  const img = new Image();
  img.onload = () => { const c = document.createElement("canvas"); c.width = W; c.height = H; c.getContext("2d").drawImage(img, 0, 0); cb(c); };
  img.onerror = () => cb(null);
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgStr);
}
function pairImage(url3d, planCanvas, cb){
  const a = new Image();
  a.onload = () => {
    const H = a.height, pw = planCanvas ? Math.round(planCanvas.width * H / planCanvas.height) : 0;
    const c = document.createElement("canvas"); c.width = a.width + pw + (pw ? 12 : 0); c.height = H;
    const ctx = c.getContext("2d"); ctx.fillStyle = "#1d1f24"; ctx.fillRect(0, 0, c.width, H);
    ctx.drawImage(a, 0, 0);
    if (planCanvas) ctx.drawImage(planCanvas, a.width + 12, 0, pw, H);
    cb(c.toDataURL("image/png"));
  };
  a.src = url3d;
}
function refPhotos(cb){
  const r = V3.renderer, cvs = r.domElement, cw = cvs.width, ch = cvs.height;
  const cx = (sceneBox.minX + sceneBox.maxX) / 2, cz = (sceneBox.minZ + sceneBox.maxZ) / 2, span = Math.max(sceneBox.W, sceneBox.D);
  const cam = new THREE.PerspectiveCamera(ORBIT_FOV, cw / ch, 0.05, 400), tgt = new THREE.Vector3(cx, 0.6, cz);
  const dist = span * 0.85 + 2.5, hgt = 0.6 + span * 0.95 + 2.5;
  const views = [
    { key: "refTop",    pos: [cx, span * 1.55 + 4, cz + 0.01] },
    { key: "refFront",  pos: [cx, hgt, cz + dist] },
    { key: "refBack",   pos: [cx, hgt, cz - dist] },
    { key: "refLeft",   pos: [cx - dist, hgt, cz] },
    { key: "refRight",  pos: [cx + dist, hgt, cz] },
  ];
  const castRoot = typeof CAST3D !== "undefined" ? CAST3D.root : null, castVis = castRoot ? castRoot.visible : false;
  if (castRoot) castRoot.visible = false;
  const shots = withCleanScene(() => {
    if (ceilingMesh) ceilingMesh.visible = false;
    const pr = r.getPixelRatio(); if (pr !== V3.pr) r.setPixelRatio(V3.pr);
    const out = views.map(v => { cam.position.set(...v.pos); cam.lookAt(tgt); cam.updateMatrixWorld(); r.setRenderTarget(null); r.render(scene, cam); return cvs.toDataURL("image/png"); });
    if (pr !== V3.pr) r.setPixelRatio(pr);
    if (castRoot) castRoot.visible = castVis;
    r.render(scene, camera);
    return out;
  });
  const cellW = 640, cellH = Math.round(cellW * ch / cw), head = 30;
  const c = document.createElement("canvas"); c.width = cellW * 3; c.height = (cellH + head) * 2;
  const ctx = c.getContext("2d"); ctx.fillStyle = "#16171b"; ctx.fillRect(0, 0, c.width, c.height);
  let left = shots.length;
  shots.forEach((u, i) => {
    const im = new Image();
    im.onload = () => {
      const col = i % 3, row = Math.floor(i / 3), x = col * cellW, y = row * (cellH + head);
      ctx.fillStyle = "#e9e8e4"; ctx.font = "16px sans-serif"; ctx.textBaseline = "middle"; ctx.fillText(t(views[i].key), x + 12, y + head / 2);
      ctx.drawImage(im, x, y + head, cellW, cellH);
      if (--left === 0){
        const x = 2 * cellW, y = cellH + head;
        ctx.fillStyle = "#e9e8e4"; ctx.font = "15px sans-serif"; ctx.textBaseline = "top";
        wrapText(ctx, aiSetSummary(), cellW - 30).slice(0, 14).forEach((l, k) => ctx.fillText(l, x + 14, y + 10 + k * 22));
        cb(c.toDataURL("image/png"));
      }
    };
    im.src = u;
  });
}

const m1 = v => (Math.round(v / 40 * 10) / 10).toFixed(1).replace(/\.0$/, "");
function dirWord(dx, dy){
  if (Math.abs(dx) > Math.abs(dy)) return t(dx > 0 ? "dirRight" : "dirLeft");
  return t(dy > 0 ? "dirDown" : "dirUp");
}
function areaWord(x, y, B){
  const fx = (x - B.x0) / Math.max(1, B.x1 - B.x0), fy = (y - B.y0) / Math.max(1, B.y1 - B.y0);
  const h = fx < 0.34 ? t("areaL") : fx > 0.66 ? t("areaR") : t("areaC"), v = fy < 0.34 ? t("areaT") : fy > 0.66 ? t("areaB") : t("areaM");
  return h === t("areaC") && v === t("areaM") ? t(floorType ? "areaCenterOut" : "areaCenter") : v + " " + h;
}
function planBounds(){
  const ws = elements.filter(e => e.type === "wall");
  if (!ws.length || floorType) return { x0: 0, y0: 0, x1: boardW(), y1: boardH() };
  return { x0: Math.min(...ws.map(w => Math.min(w.x1, w.x2))), y0: Math.min(...ws.map(w => Math.min(w.y1, w.y2))), x1: Math.max(...ws.map(w => Math.max(w.x1, w.x2))), y1: Math.max(...ws.map(w => Math.max(w.y1, w.y2))) };
}
function aiSetSummary(){
  const B = planBounds();
  if (floorType) return t("aiSetLineOut").replace("{w}", m1(B.x1 - B.x0)).replace("{d}", m1(B.y1 - B.y0));
  return t("aiSetLine").replace("{w}", m1(B.x1 - B.x0)).replace("{d}", m1(B.y1 - B.y0)).replace("{h}", WALL_H);
}
function memoWhere(m, B, L){ const p = memoPos(m); return p.el ? areaWord(p.x, p.y, B) + " " + L.wall : areaWord(p.x, p.y, B) + " " + t("aiFloor"); }
function aiText(){
  const B = planBounds(), L = curLabels(), out = [];
  out.push(t("aiHead"));
  out.push("[" + t("aiSet") + "] " + (setName ? setName + " — " : "") + aiSetSummary());
  out.push(t("aiOrient"));
  if (timeOfDay) out.push("[" + t("aiTime") + "] " + t("aiTime_" + timeOfDay));
  if (floorType) out.push("[" + t("aiFloor") + "] " + t("floor_" + floorType) + " — " + t("aiOutdoor"));
  const objs = elements.filter(e => e.x !== undefined && e.type !== "door" && e.type !== "window" && !MOUND_TYPES.includes(e.type) && e.type !== "zone");
  const memoOf = (id, kind) => memos.filter(m => m.elId === id && m.kind === kind);
  out.push("", "[" + t("aiObjects") + "]");
  if (!objs.length) out.push("- " + t("aiNone"));
  objs.forEach(o => {
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2, front = o.type in PLAN_FRONT ? PLAN_FRONT[o.type] : "down";
    const fv = front === "right" ? rot2(1, 0, o.rot || 0) : front === "down" ? rot2(0, 1, o.rot || 0) : null;
    const sz = m1(o.w) + "×" + m1(o.h);
    const on = typeof stackWord === "function" ? stackWord(o) : "";
    out.push(`- ${L[o.type] || o.type}${o.on ? " (" + t("aiLightOn") + ")" : ""} ${sz}m · ${areaWord(cx, cy, B)} (x ${m1(cx - B.x0)}m, y ${m1(cy - B.y0)}m)` + (on ? " · " + on : "") + (fv ? " · " + t("aiFaces").replace("{d}", dirWord(fv[0], fv[1])) : ""));
    memoOf(o.id, "set").forEach(m => out.push("    🔒 " + m.text));
    memoOf(o.id, "scene").forEach(m => out.push("    🎬 " + m.text));
  });
  if (typeof trAiLines === "function") trAiLines(out, B, memoOf);
  const atts = elements.filter(e => e.type === "door" || e.type === "window");
  if (atts.length){
    const DL = typeof doorLabels === "function" ? doorLabels(B) : new Map();
    out.push("", "[" + t("aiOpenings") + "]");
    atts.forEach(a => { const w = getEl(a.wallId); if (!w) return; const px = w.x1 + (w.x2 - w.x1) * a.t, py = w.y1 + (w.y2 - w.y1) * a.t; out.push(`- ${a.type === "door" ? (DL.get(a.id) || doorName(a)) + (isDoor2(a) ? "(" + DOOR2_W_M + "m)" : "") : L[a.type]} · ${areaWord(px, py, B)} ${t("aiWall")}`); });
  }
  const wallMemos = memos.filter(m => { const el = m.elId ? getEl(m.elId) : null; return el && (el.type === "wall" || el.type === "line"); });
  const free = memos.filter(m => !m.elId || !getEl(m.elId));
  const extra = wallMemos.concat(free);
  if (extra.some(m => m.kind !== "scene")){
    out.push("", "[" + t("aiSetMemos") + "]");
    extra.filter(m => m.kind !== "scene").forEach(m => out.push(`- (${memoWhere(m, B, L)}) ${m.text}`));
  }
  if (extra.some(m => m.kind === "scene")){
    out.push("", "[" + t("aiSceneMemos") + "]");
    extra.filter(m => m.kind === "scene").forEach(m => out.push(`- (${memoWhere(m, B, L)}) ${m.text}`));
  }
  if (typeof castAiLines === "function") castAiLines(out, B);
  if (typeof camAiLines === "function" && camAiLines(out, B)){}
  else if (threeInited && camera){
    const x = camera.position.x / SCALE3D + minX, y = camera.position.z / SCALE3D + minY;
    const d = new THREE.Vector3(); camera.getWorldDirection(d);
    out.push("", "[" + t("aiCamera") + "] " + t(camMode === "walk" ? "aiCamWalk" : "aiCamOrbit") + ` · ${areaWord(x, y, B)} (x ${m1(x - B.x0)}m, y ${m1(y - B.y0)}m, ${t("aiHeight")} ${camera.position.y.toFixed(1)}m) · ` + t("aiLooks").replace("{d}", dirWord(d.x, d.z)));
  }
  out.push("", t("aiFoot"));
  return out.join("\n");
}
const aiModal = document.getElementById("ai-text-modal");
function aiTextOpen(){
  const txt = aiText(); document.getElementById("ai-text").value = txt; aiModal.hidden = false;
  copyText(txt, ok => showToast(t(ok ? "aiCopied" : "aiCopyFail")));
}
document.getElementById("ai-text-close").addEventListener("click", () => { aiModal.hidden = true; });
document.getElementById("ai-text-copy").addEventListener("click", () => copyText(document.getElementById("ai-text").value, ok => showToast(t(ok ? "aiCopied" : "aiCopyFail"))));
aiModal.addEventListener("pointerdown", e => { if (e.target === aiModal) aiModal.hidden = true; });

memoRefresh();
