"use strict";

const annotModal = document.getElementById("annot-modal");
const annotCanvas = document.getElementById("annot-canvas");
const annotCtx = annotCanvas.getContext("2d");
const annotMemosLayer = document.getElementById("annot-memos-layer");
let annotImg = null;
let annotStrokes = [];
let annotMemos = [];
let annotTool = "pen";
let annotColor = "#ffd60a";
let annotFontSize = "m";
const ANNOT_FONT_PX = { s:12, m:15, l:19 };
let annotDrawing = null;
let annotErasing = false;
let annotMemoIdSeq = 1;
let selectedMemoId = null;
const ANNOT_BOX_W = 210, ANNOT_LINE_H = 16;

let annotAlt = null;
const annotMemoCb = document.getElementById("annot-memo-cb"), annotMemoOpt = document.getElementById("annot-memo-opt");
function annotSetBase(url){ const img = new Image(); img.onload = ()=>{ annotImg = img; redrawAnnot(); }; img.src = url; }
annotMemoCb.addEventListener("change", ()=>{ if (annotAlt) annotSetBase(annotMemoCb.checked ? annotAlt.on : annotAlt.off); });
function openAnnotModal(dataUrl, alt){
  annotAlt = alt || null; annotMemoOpt.hidden = !annotAlt;
  if (annotAlt){ annotMemoCb.checked = !!annotAlt.checked; dataUrl = annotAlt.checked ? annotAlt.on : annotAlt.off; }
  annotStrokes = []; annotMemos = []; annotMemoIdSeq = 1; selectedMemoId = null;
  setAnnotTool("pen"); annotColor = "#ffd60a"; annotFontSize = "m";
  document.querySelectorAll(".annot-swatch").forEach(s=>s.classList.toggle("selected", s.dataset.color===annotColor));
  document.querySelectorAll(".annot-size-btn").forEach(b=>b.classList.toggle("selected", b.dataset.size===annotFontSize));
  annotMemosLayer.innerHTML = "";
  const img = new Image();
  img.onload = ()=>{
    annotImg = img;
    annotCanvas.width = img.naturalWidth;
    annotCanvas.height = img.naturalHeight;
    redrawAnnot();
    annotModal.classList.add("open");
  };
  img.src = dataUrl;
}
function closeAnnotModal(){
  annotModal.classList.remove("open");
  annotMemosLayer.innerHTML = "";
}
function annotScale(){
  const r = annotCanvas.getBoundingClientRect();
  return r.width / annotCanvas.width;
}
function annotPointFromEvent(e){
  const r = annotCanvas.getBoundingClientRect();
  const s = annotScale();
  return { x:(e.clientX-r.left)/s, y:(e.clientY-r.top)/s };
}
function redrawAnnot(){
  annotCtx.clearRect(0,0,annotCanvas.width,annotCanvas.height);
  if (annotImg) annotCtx.drawImage(annotImg, 0, 0, annotCanvas.width, annotCanvas.height);
  annotStrokes.forEach(s=>{
    if (s.points.length<2) return;
    annotCtx.strokeStyle = s.color; annotCtx.lineWidth = 5; annotCtx.lineCap="round"; annotCtx.lineJoin="round";
    annotCtx.beginPath();
    annotCtx.moveTo(s.points[0].x, s.points[0].y);
    s.points.slice(1).forEach(p=> annotCtx.lineTo(p.x, p.y));
    annotCtx.stroke();
  });
  annotMemos.forEach(m=>{
    annotCtx.strokeStyle = "#e0c94a"; annotCtx.lineWidth = 2;
    annotCtx.beginPath(); annotCtx.moveTo(m.px, m.py); annotCtx.lineTo(m.tx, m.ty); annotCtx.stroke();
    annotCtx.fillStyle = "#e0c94a"; annotCtx.beginPath(); annotCtx.arc(m.px, m.py, 5, 0, Math.PI*2); annotCtx.fill();
    annotCtx.fillStyle = "#1e1e26"; annotCtx.beginPath(); annotCtx.arc(m.px, m.py, 2, 0, Math.PI*2); annotCtx.fill();
  });
  positionMemoBoxes();
}
function positionMemoBoxes(){
  const s = annotScale();
  annotMemos.forEach(m=>{
    if (!m.el) return;
    m.el.style.left = (m.tx*s)+"px";
    m.el.style.top = (m.ty*s)+"px";
  });
}
function createMemoBox(m){
  const box = document.createElement("div");
  box.className = "annot-memo";
  box.addEventListener("pointerdown", (e)=>{ if (annotTool==="eraser"){ removeMemo(m); } }, true);
  const handle = document.createElement("div");
  handle.className = "annot-memo-handle";
  handle.innerHTML = '<span class="annot-memo-handle-label">'+t("memoDragHandle")+'</span><button type="button" class="annot-memo-del" title="'+t("memoDeleteTitle")+'">✕</button>';
  const ta = document.createElement("textarea");
  ta.placeholder = t("memoPlaceholder");
  ta.value = m.text || "";
  ta.style.fontSize = ANNOT_FONT_PX[m.fontSize || "m"] + "px";
  ta.addEventListener("input", ()=>{
    m.text = ta.value;
    const overflow = ta.scrollHeight - ta.clientHeight;
    if (overflow > 0){
      const s = annotScale();
      box.style.height = (box.offsetHeight + overflow) + "px";
      m.boxH = box.offsetHeight / s;
    }
  });
  ta.addEventListener("pointerdown", e=> { e.stopPropagation(); selectMemo(m.id); });
  box.appendChild(handle); box.appendChild(ta);
  annotMemosLayer.appendChild(box);
  m.el = box;
  const s0 = annotScale();
  box.style.width = (m.boxW*s0)+"px";
  box.style.height = (m.boxH*s0)+"px";
  positionMemoBoxes();
  if (window.ResizeObserver){
    const ro = new ResizeObserver(()=>{
      const s = annotScale();
      m.boxW = box.offsetWidth / s; m.boxH = box.offsetHeight / s;
    });
    ro.observe(box);
  }
  let dragging=false, gx=0, gy=0, moved=false;
  handle.addEventListener("pointerdown", (e)=>{
    if (e.target.closest(".annot-memo-del")){ return; }
    selectMemo(m.id);
    dragging=true; moved=false; handle.setPointerCapture(e.pointerId);
    const s=annotScale(); const r=annotCanvas.getBoundingClientRect();
    gx = (e.clientX-r.left)/s - m.tx; gy = (e.clientY-r.top)/s - m.ty;
  });
  handle.addEventListener("pointermove", (e)=>{
    if (!dragging) return;
    moved = true;
    const s=annotScale(); const r=annotCanvas.getBoundingClientRect();
    m.tx = (e.clientX-r.left)/s - gx; m.ty = (e.clientY-r.top)/s - gy;
    redrawAnnot();
  });
  handle.addEventListener("pointerup", ()=> dragging=false);
  handle.querySelector(".annot-memo-del").addEventListener("click", (e)=>{ e.stopPropagation(); removeMemo(m); });
  setTimeout(()=> ta.focus(), 30);
  return box;
}
function hitTestErase(pt){
  const R = 14;
  for (let i=annotMemos.length-1;i>=0;i--){
    const m = annotMemos[i];
    if (Math.hypot(pt.x-m.px, pt.y-m.py) < R+6){ removeMemo(m); return true; }
  }
  for (let i=annotStrokes.length-1;i>=0;i--){
    const pts = annotStrokes[i].points;
    for (let j=0;j<pts.length-1;j++){
      if (distToSeg(pt, pts[j], pts[j+1]) < R){ annotStrokes.splice(i,1); return true; }
    }
  }
  return false;
}
function distToSeg(p, a, b){
  const dx=b.x-a.x, dy=b.y-a.y, len2=dx*dx+dy*dy||1;
  let t=((p.x-a.x)*dx+(p.y-a.y)*dy)/len2; t=Math.max(0,Math.min(1,t));
  return Math.hypot(p.x-(a.x+dx*t), p.y-(a.y+dy*t));
}
function selectMemo(id){
  selectedMemoId = id;
  annotMemos.forEach(m=>{ if (m.el) m.el.classList.toggle("selected", m.id===id); });
  const m = annotMemos.find(x=>x.id===id);
  if (m){
    annotFontSize = m.fontSize || "m";
    document.querySelectorAll(".annot-size-btn").forEach(b=>b.classList.toggle("selected", b.dataset.size===annotFontSize));
  }
}
function removeMemo(m){
  annotMemos = annotMemos.filter(x=>x!==m);
  if (m.el) m.el.remove();
  if (selectedMemoId===m.id) selectedMemoId = null;
  redrawAnnot();
}

const ANNOT_ERASER_CURSOR = "url(\"data:image/svg+xml;utf8,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26"><circle cx="13" cy="13" r="9" fill="white" stroke="black" stroke-width="2"/></svg>')+"\") 13 13, auto";
function setAnnotTool(name){
  annotTool = name;
  document.querySelectorAll(".annot-tool-btn").forEach(b=>b.classList.toggle("active", b.id==="annot-tool-"+name));
  annotCanvas.style.cursor = name==="eraser" ? ANNOT_ERASER_CURSOR : "crosshair";
}
document.querySelectorAll(".annot-tool-btn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    setAnnotTool(btn.id==="annot-tool-pen" ? "pen" : btn.id==="annot-tool-eraser" ? "eraser" : "memo");
  });
});
document.querySelectorAll(".annot-swatch").forEach(sw=>{
  sw.addEventListener("click", ()=>{
    annotColor = sw.dataset.color;
    document.querySelectorAll(".annot-swatch").forEach(s=>s.classList.toggle("selected", s===sw));
  });
});
document.querySelectorAll(".annot-size-btn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    annotFontSize = btn.dataset.size;
    document.querySelectorAll(".annot-size-btn").forEach(b=>b.classList.toggle("selected", b===btn));
    const m = annotMemos.find(x=>x.id===selectedMemoId);
    if (m){
      m.fontSize = annotFontSize;
      if (m.el){ const ta = m.el.querySelector("textarea"); if (ta) ta.style.fontSize = ANNOT_FONT_PX[annotFontSize]+"px"; }
    }
  });
});
annotCanvas.addEventListener("pointerdown", (e)=>{
  const pt = annotPointFromEvent(e);
  if (annotTool==="pen"){
    annotDrawing = { points:[pt], color:annotColor };
    annotStrokes.push(annotDrawing);
    annotCanvas.setPointerCapture(e.pointerId);
  } else if (annotTool==="eraser"){
    annotErasing = true;
    hitTestErase(pt); redrawAnnot();
    annotCanvas.setPointerCapture(e.pointerId);
  } else if (annotTool==="memo"){
    const m = { id:annotMemoIdSeq++, px:pt.x, py:pt.y, tx:Math.min(pt.x+40, annotCanvas.width-ANNOT_BOX_W-4), ty:Math.max(pt.y-70,4), text:"", boxW:ANNOT_BOX_W, boxH:90, fontSize:annotFontSize };
    annotMemos.push(m);
    createMemoBox(m);
    selectMemo(m.id);
    redrawAnnot();
    setAnnotTool("pen");
  }
});
annotCanvas.addEventListener("pointermove", (e)=>{
  const pt = annotPointFromEvent(e);
  if (annotTool==="pen" && annotDrawing){ annotDrawing.points.push(pt); redrawAnnot(); }
  else if (annotTool==="eraser" && annotErasing){ if (hitTestErase(pt)) redrawAnnot(); }
});
annotCanvas.addEventListener("pointerup", ()=>{ annotDrawing=null; annotErasing=false; });
window.addEventListener("keydown", (e)=>{
  if (!annotModal.classList.contains("open")) return;
  if (document.activeElement && document.activeElement.tagName==="TEXTAREA") return;
  if ((e.key==="Delete"||e.key==="Backspace") && selectedMemoId!=null){
    e.preventDefault();
    const m = annotMemos.find(x=>x.id===selectedMemoId);
    if (m) removeMemo(m);
  }
}, true);
document.getElementById("annot-cancel-btn").addEventListener("click", closeAnnotModal);
document.getElementById("annot-save-btn").addEventListener("click", ()=>{
  const HANDLE_H = 20;
  annotMemos.forEach(m=>{
    const w = m.boxW, h = m.boxH;
    const fontPx = ANNOT_FONT_PX[m.fontSize || "m"];
    const lineH = Math.round(fontPx*1.3);
    annotCtx.fillStyle = "#f2df8a"; annotCtx.fillRect(m.tx, m.ty, w, HANDLE_H);
    annotCtx.fillStyle = "#fff8d6"; annotCtx.fillRect(m.tx, m.ty+HANDLE_H, w, h-HANDLE_H);
    annotCtx.strokeStyle="#e0c94a"; annotCtx.lineWidth=1.5; annotCtx.strokeRect(m.tx, m.ty, w, h);
    annotCtx.fillStyle = "#2a2410"; annotCtx.font = fontPx+"px sans-serif";
    annotCtx.save();
    annotCtx.beginPath(); annotCtx.rect(m.tx+6, m.ty+HANDLE_H+4, w-12, h-HANDLE_H-8); annotCtx.clip();
    const lines = wrapAnnotText(m.text || "", w-16, fontPx);
    lines.forEach((line,i)=> annotCtx.fillText(line, m.tx+8, m.ty+HANDLE_H+16+i*lineH));
    annotCtx.restore();
  });
  saveDataUrl(typeof flowBase === "function" && APP.screen === "set" ? flowBase() + "_" + t("fnShot") + ".png" : SHOT_FILE_NAME, annotCanvas.toDataURL("image/png"));
  closeAnnotModal();
});
function wrapAnnotText(text, maxWidth, fontPx){
  annotCtx.font = (fontPx||13)+"px sans-serif";
  const out = [];
  text.split("\n").forEach(paragraph=>{
    let line = "";
    for (const ch of paragraph){
      const test = line+ch;
      if (annotCtx.measureText(test).width > maxWidth && line){ out.push(line); line = ch; }
      else line = test;
    }
    out.push(line);
  });
  return out;
}
