"use strict";

const svg = document.getElementById("canvas");
const world = document.getElementById("world");
const boardLayer = document.getElementById("board-layer");
const shapesLayer = document.getElementById("shapes-layer");
const selLayer = document.getElementById("selection-layer");
const textEditor = document.getElementById("text-editor");
const toast = document.getElementById("toast");

let scale=1, panX=140, panY=90;
let currentTool = "select";
let selectedIds = [];
let undoStack=[], redoStack=[];

function renderBoard(){
  boardLayer.innerHTML = "";
  const W = boardW(), H = boardH();
  boardLayer.appendChild(makeSvgEl("rect",{x:0,y:0,width:W,height:H, fill:PAL.board}));
  const st = SNAPU();
  for (let i=0, x=0; x<=W+0.01; i++, x=i*st){
    const major = i%2===0;
    boardLayer.appendChild(makeSvgEl("line",{x1:x,y1:0,x2:x,y2:H, stroke: major?PAL.gridMajor:PAL.gridMinor, "stroke-width": major?1:0.5}));
  }
  for (let i=0, y=0; y<=H+0.01; i++, y=i*st){
    const major = i%2===0;
    boardLayer.appendChild(makeSvgEl("line",{x1:0,y1:y,x2:W,y2:y, stroke: major?PAL.gridMajor:PAL.gridMinor, "stroke-width": major?1:0.5}));
  }
  boardLayer.appendChild(makeSvgEl("rect",{x:0,y:0,width:W,height:H, fill:"none", stroke:PAL.edge, "stroke-width":1.5}));
  const rs = Math.max(40, st*2), fs = Math.min(9 * rs / 40, 70);
  for (let x=0; x<=W+0.01; x+=rs){
    boardLayer.appendChild(makeSvgEl("line",{x1:x,y1:-6,x2:x,y2:0, stroke:PAL.tick,"stroke-width":1}));
    const t=makeSvgEl("text",{x:x+3,y:-9,"font-size":fs,fill:PAL.ruler}); t.textContent=Math.round(x/40)+"m"; boardLayer.appendChild(t);
  }
  for (let y=0; y<=H+0.01; y+=rs){
    boardLayer.appendChild(makeSvgEl("line",{x1:-6,y1:y,x2:0,y2:y, stroke:PAL.tick,"stroke-width":1}));
    const t=makeSvgEl("text",{x:-9,y:y-2,"font-size":fs,fill:PAL.ruler,"text-anchor":"end"}); t.textContent=Math.round(y/40)+"m"; boardLayer.appendChild(t);
  }
}
function snapToGrid(pt){
  const st = SNAPU();
  let x = Math.round(pt.x/st)*st;
  let y = Math.round(pt.y/st)*st;
  x = Math.max(0, Math.min(boardW(), x));
  y = Math.max(0, Math.min(boardH(), y));
  return {x,y};
}
function clampToBoard(pt){
  return { x: Math.max(0, Math.min(boardW(), pt.x)), y: Math.max(0, Math.min(boardH(), pt.y)) };
}

function showToast(msg){ toast.textContent=msg; toast.classList.add("show"); clearTimeout(showToast._t); showToast._t=setTimeout(()=>toast.classList.remove("show"),1600); }
function makeSvgEl(name, attrs){ const n=document.createElementNS(SVGNS,name); for(const k in attrs) n.setAttribute(k, attrs[k]); return n; }
function screenToCanvas(cx,cy){ const r=svg.getBoundingClientRect(); return {x:(cx-r.left-panX)/scale, y:(cy-r.top-panY)/scale}; }
function applyTransform(){ world.setAttribute("transform", `translate(${panX} ${panY}) scale(${scale})`); document.getElementById("zoom-pct").textContent = Math.round(scale*100)+"%"; }
function centerBoard(){
  const r = svg.getBoundingClientRect();
  panX = Math.round((r.width - boardW()*scale)/2);
  panY = Math.round((r.height - boardH()*scale)/2);
  applyTransform();
}
function getEl(id){ return elements.find(e=>e.id===id); }
const histSnap = () => JSON.stringify({ e: elements, m: memos, c: typeof castSnap === "function" ? castSnap() : [], k: typeof camSnap === "function" ? camSnap() : null });
function histLoad(s){ const o = JSON.parse(s); elements = o.e; memos = o.m || []; if (typeof SETM !== "undefined") SETM.sel = null; if (typeof castAfterHist === "function") castAfterHist(o.c); if (typeof camAfterHist === "function") camAfterHist(o.k); }
function pushHistory(){ undoStack.push(histSnap()); if(undoStack.length>60) undoStack.shift(); redoStack=[]; }
function undo(){ if(!undoStack.length) return; redoStack.push(histSnap()); histLoad(undoStack.pop()); selectedIds=[]; render(); updatePropPanel(); }
function redo(){ if(!redoStack.length) return; undoStack.push(histSnap()); histLoad(redoStack.pop()); selectedIds=[]; render(); updatePropPanel(); }

function makeDefaultObject(type, x, y){
  const [w,h] = SIZES[type];
  return { id:uid(), type, x:x-w/2, y:y-h/2, w, h, rot:0, note:"" };
}

function render(){
  if (typeof stackUpdate === "function") stackUpdate();
  shapesLayer.innerHTML = "";
  if (typeof trRender2D === "function") trRender2D(shapesLayer);
  elements.forEach(el=>{
    if (el.type==="wall") shapesLayer.appendChild(renderWallLine(el, true));
    else if (el.type==="line") shapesLayer.appendChild(renderWallLine(el, false));
  });
  elements.filter(el=>el.x!==undefined && el.type!=="door" && el.type!=="window" && el.type!=="zone").sort((a,b)=>(a.elev||0)-(b.elev||0))
    .forEach(el=> shapesLayer.appendChild(renderObject(el)));
  elements.forEach(el=>{ if (el.type==="door" || el.type==="window") shapesLayer.appendChild(renderAttachMarker(el)); });
  renderSelection();
}
function renderSelection(){
  selLayer.innerHTML = "";
  selectedIds.forEach(id=>{
    const el = getEl(id); if(!el) return;
    if (el.pts) return;
    if (el.type==="wall" || el.type==="line"){
      selLayer.appendChild(makeSvgEl("line",{x1:el.x1,y1:el.y1,x2:el.x2,y2:el.y2, stroke:PAL.sel,"stroke-width":8,"stroke-opacity":0.35}));
    } else if (el.type==="door" || el.type==="window"){
      const F = attachFrame(el);
      if (F) selLayer.appendChild(makeSvgEl("circle",{cx:F.px, cy:F.py, r:24, fill:"none", stroke:PAL.sel,"stroke-width":1,"stroke-dasharray":"4 3"}));
    } else {
      const pad=5;
      selLayer.appendChild(makeSvgEl("rect",{x:el.x-pad,y:el.y-pad,width:el.w+pad*2,height:el.h+pad*2, fill:"none", stroke:PAL.sel,"stroke-width":1,"stroke-dasharray":"4 3"}));
    }
  });
}

function setTool(name){
  currentTool = name;
  document.querySelectorAll(".tool-btn[data-tool]").forEach(b=>b.classList.toggle("active", b.dataset.tool===name));
  document.querySelectorAll(".obj-btn[data-tool]").forEach(b=>b.classList.toggle("active", b.dataset.tool===name));
  svg.setAttribute("class", "tool-"+currentTool);
  dragMode = null; dragEl = null; dragStart = null;
  selectedIds = [];
  render(); updatePropPanel();
}
document.querySelectorAll(".tool-btn[data-tool]").forEach(btn=>{
  btn.addEventListener("click", ()=> setTool(btn.dataset.tool));
});
document.querySelectorAll(".obj-btn[data-tool]").forEach(btn=>{
  btn.addEventListener("click", ()=> setTool(btn.dataset.tool));
});

function updatePropPanel(){
  const panel = document.getElementById("prop-panel");
  panel.classList.toggle("open", selectedIds.length>0);
  const one = selectedIds.length === 1 ? getEl(selectedIds[0]) : null;
  document.getElementById("sel-title").textContent = !selectedIds.length ? t("selNone") : one ? t("selTitle") + " " + (one.type === "door" ? doorName(one) : (curLabels()[one.type] || one.type)) : t("selTitle");
  if (!selectedIds.length) return;
  const multi = selectedIds.length>1;
  const sel = multi ? null : getEl(selectedIds[0]);
  document.getElementById("multi-group").style.display = multi ? "block":"none";
  if (multi) document.getElementById("multi-count").textContent = selectedIds.length+t("selectedCount");
  document.getElementById("rotate-group").style.display = (sel && (ROTATABLE_TYPES.includes(sel.type) || sel.type==="door")) ? "block":"none";
  if (sel) document.getElementById("rotate-btn").textContent = sel.type==="door" ? t("doorSwingBtn") : t("rotateBtn");
  const dk = document.getElementById("door-kind"); dk.hidden = !(sel && sel.type === "door");
  if (sel && sel.type === "door") dk.querySelectorAll("button").forEach(b => b.classList.toggle("on", (b.dataset.kind === "2") === isDoor2(sel)));
  document.getElementById("hint-group").style.display = multi ? "none":"block";
  document.getElementById("dup-btn").style.display = multi ? "none":"block";
}
document.querySelectorAll("#door-kind button").forEach(b => b.addEventListener("click", () => {
  const el = getEl(selectedIds[0]); if (!el || el.type !== "door") return;
  const two = b.dataset.kind === "2"; if (two === isDoor2(el)) return;
  pushHistory(); if (two) el.w = DOOR2_W_M; else delete el.w;
  render(); renderSelection(); updatePropPanel(); b.blur();
}));
function rotateSelected(){
  const el = getEl(selectedIds[0]); if(!el) return false;
  if (el.type==="door"){ pushHistory(); el.swing = ((el.swing||0)+1)%4; render(); renderSelection(); return true; }
  if (ROTATABLE_TYPES.includes(el.type)){ pushHistory(); el.rot=(el.rot+90)%360; render(); renderSelection(); return true; }
  return false;
}
document.getElementById("rotate-btn").addEventListener("click", rotateSelected);
document.getElementById("dup-btn").addEventListener("click", ()=>{
  const el = getEl(selectedIds[0]); if(!el) return;
  pushHistory();
  const copy = JSON.parse(JSON.stringify(el)); copy.id = uid();
  if (copy.x1!==undefined){ copy.x1+=16;copy.y1+=16;copy.x2+=16;copy.y2+=16; } else if (copy.x!==undefined) { copy.x+=16; copy.y+=16; }
  elements.push(copy); selectedIds=[copy.id]; render(); renderSelection(); updatePropPanel();
});
document.getElementById("del-btn").addEventListener("click", deleteSelected);
function deleteSelected(){
  if (!selectedIds.length) return;
  pushHistory();
  const removed = new Set(selectedIds);
  elements = elements.filter(e=>{
    if (removed.has(e.id)) return false;
    if ((e.type==="door"||e.type==="window") && removed.has(e.wallId)) return false;
    return true;
  });
  const mN = memos.length; memos = memos.filter(m => !m.elId || !removed.has(m.elId));
  if (memos.length < mN) showToast(t("memoGoneWith").replace("{n}", mN - memos.length));
  selectedIds=[]; render(); updatePropPanel();
}

let editingEl = null;
function openNoteEditor(el, clientX, clientY){
  editingEl = el;
  textEditor.style.display="block";
  textEditor.style.left = clientX+"px"; textEditor.style.top = clientY+"px";
  textEditor.style.width="180px"; textEditor.style.height="70px";
  textEditor.value = el.note||"";
  textEditor.focus();
}
function commitNote(){
  if (!editingEl) return;
  pushHistory();
  editingEl.note = textEditor.value;
  textEditor.style.display="none"; editingEl=null;
  render();
}
textEditor.addEventListener("blur", commitNote);
textEditor.addEventListener("keydown",(e)=>{ e.stopPropagation(); if(e.key==="Escape") textEditor.blur(); });

let dragMode=null, dragStart=null, dragEl=null, marqueeRect=null, dragRiders=[];
const MIN_WALL_LEN = 10;

function nearestWallElement2D(px, py){
  let best=null, bestD=Infinity, bestT=0;
  elements.filter(e=>e.type==="wall").forEach(w=>{
    const dx=w.x2-w.x1, dy=w.y2-w.y1, len2=dx*dx+dy*dy || 1;
    let t = ((px-w.x1)*dx + (py-w.y1)*dy)/len2;
    t = Math.max(0, Math.min(1, t));
    const cx=w.x1+dx*t, cy=w.y1+dy*t;
    const d = Math.hypot(px-cx, py-cy);
    if (d<bestD){ bestD=d; best=w; bestT=t; }
  });
  const THRESH = 60/scale;
  return (best && bestD<THRESH) ? {wall:best, t:bestT} : null;
}

function objAABB(el){
  const cx = el.x+el.w/2, cy = el.y+el.h/2;
  const a = (el.rot||0)*Math.PI/180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  const w = el.w*c + el.h*s, h = el.w*s + el.h*c;
  return { x1:cx-w/2, y1:cy-h/2, x2:cx+w/2, y2:cy+h/2, cx, cy, w, h };
}
function findAdjacentWall(el){
  const box = objAABB(el);
  let best=null, bestD=CELL*1.2;
  elements.filter(w=>w.type==="wall").forEach(w=>{
    const dx=w.x2-w.x1, dy=w.y2-w.y1, len2=dx*dx+dy*dy||1;
    let t=((box.cx-w.x1)*dx+(box.cy-w.y1)*dy)/len2; t=Math.max(0,Math.min(1,t));
    const cx=w.x1+dx*t, cy=w.y1+dy*t;
    const d=Math.hypot(box.cx-cx, box.cy-cy);
    if (d<bestD){ bestD=d; best=w; }
  });
  return best;
}
function tryAttachToWall(el){
  const wall = findAdjacentWall(el);
  if (!wall) return true;
  const dx=wall.x2-wall.x1, dy=wall.y2-wall.y1;
  const box = objAABB(el);
  const EPS = 4;
  if (Math.abs(dy) < Math.abs(dx)*0.35){
    const wy = wall.y1;
    if (wy > box.y1+EPS && wy < box.y2-EPS) return false;
    el.y += (wy <= box.y1+EPS) ? (wy-box.y1) : (wy-box.y2);
    return true;
  }
  if (Math.abs(dx) < Math.abs(dy)*0.35){
    const wx = wall.x1;
    if (wx > box.x1+EPS && wx < box.x2-EPS) return false;
    el.x += (wx <= box.x1+EPS) ? (wx-box.x1) : (wx-box.x2);
    return true;
  }
  return true;
}

let spaceHeld = false, panDrag = null;
function setPanCursor(){ svg.style.cursor = panDrag ? "grabbing" : spaceHeld ? "grab" : ""; }
const typingNow = ()=>{ const a = document.activeElement; return a && (a.tagName==="TEXTAREA" || a.tagName==="INPUT"); };
document.addEventListener("pointerdown", e => {
  const a = document.activeElement;
  if (!a || !(a.tagName === "INPUT" || a.tagName === "TEXTAREA") || a === textEditor) return;
  if (svg.contains(e.target) || (typeof V3 !== "undefined" && V3.renderer && e.target === V3.renderer.domElement)) a.blur();
}, true);
window.addEventListener("keydown", (e)=>{
  if (e.code !== "Space" || APP.screen !== "set" || setKeysTo3d() || typingNow()) return;
  e.preventDefault();
  if (!spaceHeld){ spaceHeld = true; setPanCursor(); }
}, true);
window.addEventListener("keyup", (e)=>{
  if (e.code !== "Space") return;
  if (spaceHeld && !typingNow()) e.preventDefault();
  spaceHeld = false; setPanCursor();
}, true);
window.addEventListener("blur", ()=>{ spaceHeld = false; panDrag = null; setPanCursor(); });
svg.addEventListener("mousedown", (e)=>{ if (e.button === 1) e.preventDefault(); });
svg.addEventListener("pointerdown", (e)=>{
  if (!(spaceHeld && e.button === 0) && e.button !== 1) return;
  panDrag = { x: e.clientX, y: e.clientY, px: panX, py: panY };
  svg.setPointerCapture(e.pointerId); setPanCursor();
  e.stopImmediatePropagation(); e.preventDefault();
}, true);
svg.addEventListener("pointermove", (e)=>{
  if (!panDrag) return;
  panX = panDrag.px + (e.clientX - panDrag.x); panY = panDrag.py + (e.clientY - panDrag.y); applyTransform();
  e.stopImmediatePropagation();
}, true);
svg.addEventListener("pointerup", (e)=>{
  if (!panDrag) return;
  panDrag = null; setPanCursor(); e.stopImmediatePropagation();
}, true);
const minScale = () => Math.min(0.2, 300 / Math.max(boardW(), boardH()));
function fitBoard(){
  const r = svg.getBoundingClientRect(); if (!r.width) return;
  const m = 70;
  scale = Math.min(4, Math.max(minScale(), Math.min((r.width - 2*m) / boardW(), (r.height - 2*m) / boardH())));
  centerBoard();
}
document.getElementById("zoom-fit").addEventListener("click", fitBoard);

svg.addEventListener("pointerdown", (e)=>{
  if (document.activeElement===textEditor) commitNote();
  svg.focus({preventScroll:true});
  const pt = screenToCanvas(e.clientX, e.clientY);
  const targetShape = e.target.closest(".shape-el");

  if (currentTool === "wall"){
    const snapped = wallSnap(pt, null, e.shiftKey);
    dragMode = "draw-wall";
    try { svg.setPointerCapture(e.pointerId); } catch(err){}
    dragStart = snapped;
    dragEl = { type: "wall", x1: snapped.x, y1: snapped.y, x2: snapped.x, y2: snapped.y };
    render();
    return;
  }

  if (currentTool === "rectroom"){
    const snapped = wallSnap(pt, null, e.shiftKey);
    dragMode = "draw-rectroom";
    try { svg.setPointerCapture(e.pointerId); } catch(err){}
    dragStart = snapped;
    dragEl = { x1: snapped.x, y1: snapped.y, x2: snapped.x, y2: snapped.y };
    render();
    return;
  }

  if (currentTool === "door" || currentTool === "door2" || currentTool === "window"){
    const near = nearestWallElement2D(pt.x, pt.y);
    if (near){
      pushHistory();
      const el = { id:uid(), type:currentTool === "door2" ? "door" : currentTool, wallId:near.wall.id, t:near.t, note:"" };
      if (currentTool === "door2") el.w = DOOR2_W_M;
      elements.push(el);
      setTool("select");
      selectedIds=[el.id];
      renderSelection(); updatePropPanel();
    } else {
      showToast(t("wallNearToast"));
    }
    return;
  }

  if (SIZES[currentTool]){
    const cpt = clampToBoard(pt);
    const el = makeDefaultObject(currentTool, cpt.x, cpt.y);
    if (!tryAttachToWall(el)){
      showToast(t("wallCrossToast"));
      return;
    }
    pushHistory();
    elements.push(el);
    if (typeof onObjectPlaced === "function") onObjectPlaced(el);
    setTool("select");
    selectedIds=[el.id];
    render(); renderSelection(); updatePropPanel();
    return;
  }

  if (targetShape){
    const id = targetShape.dataset.id;
    const el = getEl(id);
    if (el.type==="door"||el.type==="window"||el.type==="wall"||el.type==="line"){ selectedIds=[id]; renderSelection(); updatePropPanel(); return; }
    selectedIds = [id];
    dragMode = "move"; dragStart = pt; dragEl = el;
    pushHistory();
    renderSelection(); updatePropPanel();
    return;
  }
  selectedIds=[]; renderSelection(); updatePropPanel();
  dragMode="marquee"; dragStart=pt;
  marqueeRect = makeSvgEl("rect",{x:pt.x,y:pt.y,width:0,height:0,fill:PAL.selFill,stroke:PAL.sel,"stroke-width":1});
  selLayer.appendChild(marqueeRect);
});

svg.addEventListener("pointermove", (e)=>{
  const pt = screenToCanvas(e.clientX, e.clientY);
  if (dragMode==="move" && dragEl){
    const dx = pt.x-dragStart.x, dy = pt.y-dragStart.y;
    if (dragEl._ox===undefined){ dragEl._ox=dragEl.x; dragEl._oy=dragEl.y; dragEl._ox1=dragEl.x1; dragEl._oy1=dragEl.y1; dragEl._ox2=dragEl.x2; dragEl._oy2=dragEl.y2;
      dragRiders = (dragEl.x!==undefined && typeof stackRiders === "function") ? stackRiders(dragEl) : []; }
    if (dragEl.x1!==undefined){
      const minX = Math.min(dragEl._ox1, dragEl._ox2), maxX = Math.max(dragEl._ox1, dragEl._ox2);
      const minY = Math.min(dragEl._oy1, dragEl._oy2), maxY = Math.max(dragEl._oy1, dragEl._oy2);
      const ndx = Math.max(-minX, Math.min(boardW()-maxX, dx));
      const ndy = Math.max(-minY, Math.min(boardH()-maxY, dy));
      dragEl.x1=dragEl._ox1+ndx; dragEl.y1=dragEl._oy1+ndy; dragEl.x2=dragEl._ox2+ndx; dragEl.y2=dragEl._oy2+ndy;
    }
    else {
      const c = clampToBoard({x:dragEl._ox+dx, y:dragEl._oy+dy});
      dragEl.x=c.x; dragEl.y=c.y;
      dragRiders.forEach(r=>{ r.el.x = r.ox + (dragEl.x - dragEl._ox); r.el.y = r.oy + (dragEl.y - dragEl._oy); });
    }
    render(); renderSelection();
    return;
  }
  if (dragMode==="marquee"){
    const x=Math.min(dragStart.x,pt.x), y=Math.min(dragStart.y,pt.y), w=Math.abs(pt.x-dragStart.x), h=Math.abs(pt.y-dragStart.y);
    marqueeRect.setAttribute("x",x); marqueeRect.setAttribute("y",y); marqueeRect.setAttribute("width",w); marqueeRect.setAttribute("height",h);
    selectedIds = elements.filter(el=>{
      if (el.type==="door"||el.type==="window") return false;
      const b = el.x1!==undefined ? {x:Math.min(el.x1,el.x2),y:Math.min(el.y1,el.y2),w:Math.abs(el.x2-el.x1)||1,h:Math.abs(el.y2-el.y1)||1} : el;
      return b.x<x+w && b.x+b.w>x && b.y<y+h && b.y+b.h>y;
    }).map(el=>el.id);
    return;
  }
  if (dragMode==="draw-wall" && dragEl){
    const snapped = wallSnap(pt, dragStart, e.shiftKey);
    dragEl.x2 = snapped.x; dragEl.y2 = snapped.y;
    render(); snapDraw(snapped);
    const isWall = dragEl.type==="wall";
    shapesLayer.appendChild(makeSvgEl("line",{x1:dragEl.x1,y1:dragEl.y1,x2:dragEl.x2,y2:dragEl.y2, stroke:PAL.sel,"stroke-width":isWall?10:2.5,"stroke-dasharray":"5 4","stroke-linecap":"square","pointer-events":"none"}));
    shapesLayer.appendChild(makeSvgEl("circle",{cx:snapped.x,cy:snapped.y,r:5/scale, fill:PAL.sel,"pointer-events":"none"}));
    const distM = Math.hypot(dragEl.x2-dragEl.x1, dragEl.y2-dragEl.y1)/40;
    if (distM>0){
      const midx=(dragEl.x1+dragEl.x2)/2, midy=(dragEl.y1+dragEl.y2)/2;
      const lbl = makeSvgEl("text",{x:midx, y:midy-10/scale, "font-size":11/scale, fill:PAL.sel,"text-anchor":"middle","font-weight":"600","pointer-events":"none"});
      lbl.textContent = wallLenText(dragEl.x1, dragEl.y1, dragEl.x2, dragEl.y2);
      shapesLayer.appendChild(lbl);
    }
    return;
  }
  if (dragMode==="draw-rectroom" && dragEl){
    const snapped = wallSnap(pt, null, e.shiftKey);
    dragEl.x2 = snapped.x; dragEl.y2 = snapped.y;
    render(); snapDraw(snapped);
    const {x1,y1,x2,y2} = dragEl;
    [[x1,y1,x2,y1],[x2,y1,x2,y2],[x2,y2,x1,y2],[x1,y2,x1,y1]].forEach(([ax,ay,bx,by])=>{
      shapesLayer.appendChild(makeSvgEl("line",{x1:ax,y1:ay,x2:bx,y2:by, stroke:PAL.sel,"stroke-width":10,"stroke-dasharray":"5 4","stroke-linecap":"square","pointer-events":"none"}));
    });
    shapesLayer.appendChild(makeSvgEl("circle",{cx:snapped.x,cy:snapped.y,r:5/scale, fill:PAL.sel,"pointer-events":"none"}));
    const wM=(Math.abs(x2-x1)/40).toFixed(1), hM=(Math.abs(y2-y1)/40).toFixed(1);
    const lbl = makeSvgEl("text",{x:(x1+x2)/2, y:(y1+y2)/2, "font-size":12/scale, fill:PAL.sel,"text-anchor":"middle","font-weight":"600","pointer-events":"none"});
    lbl.textContent = wM+"m × "+hM+"m";
    shapesLayer.appendChild(lbl);
    return;
  }
  if (!dragMode && (currentTool==="wall"||currentTool==="rectroom")){
    render();
    const snapped = wallSnap(pt, null, e.shiftKey);
    shapesLayer.appendChild(makeSvgEl("circle",{cx:snapped.x,cy:snapped.y,r:5/scale, fill:PAL.sel,"fill-opacity":0.5,"pointer-events":"none"}));
    snapDraw(snapped);
    return;
  }
});

svg.addEventListener("pointerup", ()=>{
  if (dragMode==="move" && dragEl){
    const moved = dragEl._ox!==undefined && (dragEl.x!==dragEl._ox || dragEl.y!==dragEl._oy || dragEl.x1!==dragEl._ox1 || dragEl.y1!==dragEl._oy1);
    delete dragEl._ox; delete dragEl._oy; delete dragEl._ox1; delete dragEl._oy1; delete dragEl._ox2; delete dragEl._oy2;
    if (moved && dragEl.x!==undefined && ROTATABLE_TYPES.concat("person").includes(dragEl.type) && !["zone","mountain","hill"].includes(dragEl.type)){
      if (!tryAttachToWall(dragEl)){
        undo();
        showToast(t("wallCrossToast"));
      }
    }
  }
  if (dragMode==="draw-wall" && dragEl){
    const len = Math.hypot(dragEl.x2-dragEl.x1, dragEl.y2-dragEl.y1);
    if (len >= MIN_WALL_LEN){
      pushHistory();
      elements.push({ id:uid(), type:dragEl.type, x1:dragEl.x1, y1:dragEl.y1, x2:dragEl.x2, y2:dragEl.y2, note:"" });
    }
  }
  if (dragMode==="draw-rectroom" && dragEl){
    const w = Math.abs(dragEl.x2-dragEl.x1), h = Math.abs(dragEl.y2-dragEl.y1);
    if (w >= MIN_WALL_LEN && h >= MIN_WALL_LEN){
      pushHistory();
      const x1=Math.min(dragEl.x1,dragEl.x2), x2=Math.max(dragEl.x1,dragEl.x2);
      const y1=Math.min(dragEl.y1,dragEl.y2), y2=Math.max(dragEl.y1,dragEl.y2);
      addRoomWalls(x1, y1, x2, y2, false);
    }
  }
  if (dragMode==="marquee"){ if (marqueeRect) marqueeRect.remove(); renderSelection(); updatePropPanel(); }
  dragMode=null; dragEl=null; dragStart=null;
  render();
});


window.addEventListener("keydown", (e)=>{
  if (APP.screen !== "set") return;
  if (document.activeElement===textEditor) return;
  if (typingNow()) return;
  if (setKeysTo3d()) return;
  if (e.key==="Escape"){ if (dragMode==="draw-wall"||dragMode==="draw-rectroom"){ dragMode=null; dragEl=null; dragStart=null; } render(); }
  if ((e.key==="Delete"||e.key==="Backspace"||e.code==="Delete"||e.code==="Backspace") && selectedIds.length && !(typeof SETM !== "undefined" && SETM.sel)){
    e.preventDefault();
    deleteSelected();
  }
  if ((e.ctrlKey||e.metaKey) && (e.code==="KeyZ" || e.key.toLowerCase()==="z")){ e.preventDefault(); e.shiftKey?redo():undo(); }
  if ((e.code==="KeyR" || e.key.toLowerCase()==="r") && !e.ctrlKey && !e.metaKey && selectedIds.length)
  rotateSelected();
}, true);

svg.addEventListener("wheel", (e)=>{
  e.preventDefault();
  if (e.ctrlKey||e.metaKey){
    const r=svg.getBoundingClientRect();
    const cx=(e.clientX-r.left-panX)/scale, cy=(e.clientY-r.top-panY)/scale;
    scale = Math.min(4, Math.max(minScale(), scale*(e.deltaY<0?1.08:0.92)));
    panX = e.clientX-r.left-cx*scale; panY = e.clientY-r.top-cy*scale;
  } else { panX -= e.deltaX; panY -= e.deltaY; }
  applyTransform();
}, {passive:false});
document.getElementById("zoom-in").addEventListener("click", ()=>{ scale=Math.min(4,scale*1.2); applyTransform(); });
document.getElementById("zoom-out").addEventListener("click", ()=>{ scale=Math.max(minScale(),scale/1.2); applyTransform(); });


function loadSetData(data){
  pushHistory();
  elements = data.elements||[];
  memos = Array.isArray(data.memos) ? data.memos : [];
  setName = typeof data.name === "string" ? data.name : ""; const sn = document.getElementById("set-name"); if (sn) sn.value = setName;
  if (typeof memoMigrateNotes === "function") memoMigrateNotes();
  if (typeof SET3D !== "undefined") SET3D.fresh = true;
  memos.forEach(m => { if (!m.elId && m.h === 1) m.h = 0; });
  timeOfDay = ["day", "dusk", "night"].includes(data.time) ? data.time : ""; if (typeof envTimeRender === "function") envTimeRender();
  ceilingOn = !!data.ceilingOn;
  boardCols = data.boardCols || 20; boardRows = data.boardRows || 15;
  snapM = [0.5, 5, 10].includes(data.snap) ? data.snap : 0.5; floorType = ["grass", "dirt", "sand"].includes(data.floor) ? data.floor : "";
  updateCeilingButton();
  idCounter = elements.reduce((m,el)=>Math.max(m,parseInt((el.id||"e0").slice(1))||0),0)+1;
  selectedIds=[]; renderBoard(); centerBoard(); render(); updatePropPanel();
}
document.getElementById("save-btn").addEventListener("click", ()=>{
  const fname = setName ? safeName(setName) + ".set.json" : SET_FILE_NAME;
  saveTextFile(fname, setToJson());
  FLOW.setSavedSig = setToJson();
  fileCard("set", fname, setDetail());
});
document.getElementById("open-btn").addEventListener("click", ()=> document.getElementById("open-input").click());
document.getElementById("open-input").addEventListener("change", (e)=>{
  const file = e.target.files[0]; if(!file) return;
  readTextFile(file, (text)=>{
    try{
      loadSetData(JSON.parse(text));
      fileCard("set", file.name, setDetail(), true);
    }catch(err){ alert(t("cantReadFile")+err.message); }
  });
  e.target.value="";
});

function setDetail(){ const w = elements.filter(e => e.type === "wall").length; return t("sumWalls") + " " + w + " · " + t("sumObjects") + " " + (elements.length - w); }
