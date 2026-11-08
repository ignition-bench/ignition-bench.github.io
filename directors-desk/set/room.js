"use strict";

const SNAP_R = 16;
const ROOM_PRESETS = [ { key: "roomSmall", w: 4, h: 3 }, { key: "roomLiving", w: 6, h: 5 }, { key: "roomWide", w: 8, h: 6 } ];
let ROOMSTAMP = null;

function wallEnds(){ const out = []; elements.forEach(w => { if (w.type === "wall"){ out.push({ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }); } }); return out; }
const onGrid = v => Math.abs(v / SNAPU() - Math.round(v / SNAPU())) < 0.02;

function wallSnap(pt, from, free){
  let p = snapToGrid(pt), dir = null;
  if (from && !free){
    const dx = pt.x - from.x, dy = pt.y - from.y;
    if (Math.hypot(dx, dy) > 1){
      const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      const ux = Math.round(Math.cos(a)), uy = Math.round(Math.sin(a));
      const diag = ux !== 0 && uy !== 0;
      const proj = dx * ux + dy * uy, k = Math.max(0, Math.round(proj / (diag ? 2 : 1) / SNAPU()));
      dir = { ux, uy };
      p = clampToBoard({ x: from.x + ux * k * SNAPU(), y: from.y + uy * k * SNAPU() });
    }
  }
  let best = null, bd = Math.max(SNAP_R / Math.max(0.5, Math.min(scale, 2)), SNAPU() * 0.4);
  for (const q of wallEnds()){
    if (from && q.x === from.x && q.y === from.y) continue;
    const d = Math.min(Math.hypot(q.x - pt.x, q.y - pt.y), Math.hypot(q.x - p.x, q.y - p.y));
    if (d >= bd) continue;
    if (dir){ const vx = q.x - from.x, vy = q.y - from.y; if (Math.abs(vx * dir.uy - vy * dir.ux) > 0.5 || vx * dir.ux + vy * dir.uy <= 0) continue; }
    best = q; bd = d;
  }
  if (best) return { x: best.x, y: best.y, mag: "end", guides: [] };
  for (const w of elements){
    if (w.type !== "wall") continue;
    const horiz = w.y1 === w.y2, vert = w.x1 === w.x2; if (!horiz && !vert) continue;
    const lo = horiz ? Math.min(w.x1, w.x2) : Math.min(w.y1, w.y2), hi = horiz ? Math.max(w.x1, w.x2) : Math.max(w.y1, w.y2);
    let c = null;
    if (dir){
      if (horiz && dir.uy !== 0){ const k = (w.y1 - from.y) / dir.uy; c = { x: from.x + dir.ux * k, y: w.y1 }; }
      else if (vert && dir.ux !== 0){ const k = (w.x1 - from.x) / dir.ux; c = { x: w.x1, y: from.y + dir.uy * k }; }
      if (c && ((c.x - from.x) * dir.ux + (c.y - from.y) * dir.uy) <= 0) c = null;
    } else c = horiz ? { x: Math.round(pt.x / SNAPU()) * SNAPU(), y: w.y1 } : { x: w.x1, y: Math.round(pt.y / SNAPU()) * SNAPU() };
    if (!c || !onGrid(c.x) || !onGrid(c.y)) continue;
    const along = horiz ? c.x : c.y; if (along <= lo || along >= hi) continue;
    if (Math.hypot(c.x - p.x, c.y - p.y) < bd && Math.hypot(c.x - pt.x, c.y - pt.y) < bd * 1.6) return { x: c.x, y: c.y, mag: "mid", guides: [] };
  }
  const guides = [];
  for (const q of wallEnds()){
    if (from && q.x === from.x && q.y === from.y) continue;
    if (q.x === p.x && q.y !== p.y && !guides.some(g => g[0] === q.x && g[2] === q.x)) guides.push([q.x, q.y, p.x, p.y]);
    else if (q.y === p.y && q.x !== p.x && !guides.some(g => g[1] === q.y && g[3] === q.y)) guides.push([q.x, q.y, p.x, p.y]);
    if (guides.length >= 2) break;
  }
  return { x: p.x, y: p.y, mag: null, guides };
}
function wallLenText(x1, y1, x2, y2){
  const dx = Math.abs(x2 - x1) / 40, dy = Math.abs(y2 - y1) / 40, L = Math.hypot(dx, dy);
  if (!dx || !dy) return L.toFixed(1) + "m";
  const f = v => (Math.round(v * 10) / 10).toString();
  return L.toFixed(2) + "m (" + f(dx) + "×" + f(dy) + "m)";
}
function snapDraw(s){
  for (const g of s.guides) shapesLayer.appendChild(makeSvgEl("line", { x1: g[0], y1: g[1], x2: g[2], y2: g[3], stroke: PAL.sel, "stroke-width": 1 / scale, "stroke-opacity": 0.55, "stroke-dasharray": `${4 / scale} ${4 / scale}`, "pointer-events": "none" }));
  if (s.mag) shapesLayer.appendChild(makeSvgEl("circle", { cx: s.x, cy: s.y, r: 9 / scale, fill: "none", stroke: "#5fdc8a", "stroke-width": 2.5 / scale, "pointer-events": "none" }));
}

const roomBtn = document.getElementById("room-btn"), roomPop = document.getElementById("room-pop");
function roomPopRender(){
  roomPop.innerHTML = "";
  const head = document.createElement("div"); head.className = "rp-head"; head.textContent = t("roomPopHead"); roomPop.appendChild(head);
  ROOM_PRESETS.forEach(r => {
    const b = document.createElement("button"); b.type = "button"; b.className = "rp-item c-make";
    b.innerHTML = "<b></b><small></small>"; b.querySelector("b").textContent = t(r.key); b.querySelector("small").textContent = r.w + " × " + r.h + " m";
    b.addEventListener("click", () => { roomPop.hidden = true; ROOMSTAMP = { w: r.w, h: r.h }; setTool("roomstamp"); showToast(t("roomStampToast")); });
    roomPop.appendChild(b);
  });
  const d = document.createElement("button"); d.type = "button"; d.className = "rp-item rp-draw";
  d.innerHTML = "<b></b><small></small>"; d.querySelector("b").textContent = t("roomDraw"); d.querySelector("small").textContent = t("roomDrawSub");
  d.addEventListener("click", () => { roomPop.hidden = true; ROOMSTAMP = null; setTool("rectroom"); });
  roomPop.appendChild(d);
}
roomBtn.addEventListener("click", e => {
  e.stopPropagation();
  if (!roomPop.hidden){ roomPop.hidden = true; return; }
  roomPopRender(); roomPop.hidden = false;
  const r = roomBtn.getBoundingClientRect();
  roomPop.style.left = r.left + "px"; roomPop.style.top = (r.bottom + 6) + "px";
});
document.addEventListener("pointerdown", e => { if (!roomPop.hidden && !roomPop.contains(e.target) && !roomBtn.contains(e.target)) roomPop.hidden = true; }, true);
onLangChange(() => { if (!roomPop.hidden) roomPopRender(); });

{ const st = setTool; setTool = function(name){ if (name !== "roomstamp") ROOMSTAMP = null; st(name); roomBtn.classList.toggle("active", name === "rectroom" || name === "roomstamp"); if (name === "roomstamp") svg.setAttribute("class", "tool-rectroom"); }; }

function roomStampAt(pt){
  const W = ROOMSTAMP.w * 40, H = ROOMSTAMP.h * 40;
  const st = SNAPU(); let x = Math.round((pt.x - W / 2) / st) * st, y = Math.round((pt.y - H / 2) / st) * st, mag = null;
  const R = SNAP_R * 1.5 / Math.max(0.5, Math.min(scale, 2));
  for (const q of wallEnds()) for (const [cx, cy] of [[0, 0], [W, 0], [0, H], [W, H]]){
    if (Math.hypot(x + cx - q.x, y + cy - q.y) < R){ x = q.x - cx; y = q.y - cy; mag = { x: q.x, y: q.y }; break; }
  }
  const fits = W <= boardW() && H <= boardH();
  x = Math.max(0, Math.min(boardW() - W, x)); y = Math.max(0, Math.min(boardH() - H, y));
  return { x, y, W, H, mag, fits };
}
function roomStampGhost(pt){
  render();
  const s = roomStampAt(pt);
  shapesLayer.appendChild(makeSvgEl("rect", { x: s.x, y: s.y, width: s.W, height: s.H, fill: PAL.selFill, stroke: PAL.sel, "stroke-width": 6, "stroke-opacity": 0.6, "stroke-dasharray": "16 8", "pointer-events": "none" }));
  const lbl = makeSvgEl("text", { x: s.x + s.W / 2, y: s.y + s.H / 2, "font-size": 13 / scale, fill: PAL.sel, "text-anchor": "middle", "font-weight": "700", "pointer-events": "none" });
  lbl.textContent = ROOMSTAMP.w + "m × " + ROOMSTAMP.h + "m"; shapesLayer.appendChild(lbl);
  if (s.mag) shapesLayer.appendChild(makeSvgEl("circle", { cx: s.mag.x, cy: s.mag.y, r: 9 / scale, fill: "none", stroke: "#5fdc8a", "stroke-width": 2.5 / scale, "pointer-events": "none" }));
}
function wallCovered(ax, ay, bx, by){
  return elements.some(w => {
    if (w.type !== "wall") return false;
    const on = (px, py) => { const dx = w.x2 - w.x1, dy = w.y2 - w.y1, L = dx * dx + dy * dy; if (!L) return false;
      const k = ((px - w.x1) * dx + (py - w.y1) * dy) / L; return k >= -0.001 && k <= 1.001 && Math.abs((px - w.x1) * dy - (py - w.y1) * dx) / Math.sqrt(L) < 0.5; };
    return on(ax, ay) && on(bx, by);
  });
}
function addRoomWalls(x1, y1, x2, y2, withDoor){
  const ids = [];
  [[x1, y1, x2, y1], [x2, y1, x2, y2], [x2, y2, x1, y2], [x1, y2, x1, y1]].forEach(([ax, ay, bx, by]) => {
    if (wallCovered(ax, ay, bx, by)){ ids.push(null); return; }
    const id = uid(); ids.push(id); elements.push({ id, type: "wall", x1: ax, y1: ay, x2: bx, y2: by, note: "" });
  });
  const dw = ids[2] || ids[0] || ids[1] || ids[3];
  if (withDoor && dw) elements.push({ id: uid(), type: "door", wallId: dw, t: 0.5, note: "" });
}
svg.addEventListener("pointerdown", e => {
  if (currentTool !== "roomstamp" || !ROOMSTAMP || e.button !== 0 || spaceHeld) return;
  e.stopImmediatePropagation(); e.preventDefault();
  const s = roomStampAt(screenToCanvas(e.clientX, e.clientY));
  if (!s.fits){ showToast(t("roomTooBig")); return; }
  pushHistory();
  addRoomWalls(s.x, s.y, s.x + s.W, s.y + s.H, true);
  setTool("select");
  render(); showToast(t("roomPlaced"));
}, true);
svg.addEventListener("pointermove", e => {
  if (currentTool !== "roomstamp" || !ROOMSTAMP || panDrag) return;
  roomStampGhost(screenToCanvas(e.clientX, e.clientY));
});
window.addEventListener("keydown", e => {
  if (APP.screen !== "set" || e.key !== "Escape") return;
  if (!roomPop.hidden){ roomPop.hidden = true; return; }
  if (currentTool === "roomstamp" || currentTool === "rectroom" || currentTool === "wall"){ if (!dragMode) setTool("select"); }
});

const emptyHint = document.createElement("div"); emptyHint.id = "plan-empty-hint"; emptyHint.hidden = true;
document.getElementById("build-screen").appendChild(emptyHint);
let emptyHintDone = false; try { emptyHintDone = localStorage.getItem("dd-plan-hint-done") === "1"; } catch(e){}
function emptyHintDismiss(){
  if (emptyHintDone) return; emptyHintDone = true;
  try { localStorage.setItem("dd-plan-hint-done", "1"); } catch(e){}
  emptyHintUpdate();
}
svg.addEventListener("pointerdown", emptyHintDismiss, true);
document.getElementById("set-side").addEventListener("click", e => { if (e.target.closest(".tool-btn, .obj-btn, #room-btn")) emptyHintDismiss(); }, true);
function emptyHintUpdate(){
  const empty = !elements.length && !emptyHintDone;
  emptyHint.hidden = !empty || currentTool === "roomstamp" || currentTool === "rectroom" || currentTool === "wall";
  if (!emptyHint.hidden) emptyHint.textContent = t("planEmptyHint");
}
{ const r0 = render; render = function(){ r0(); emptyHintUpdate(); }; }
onLangChange(emptyHintUpdate);
