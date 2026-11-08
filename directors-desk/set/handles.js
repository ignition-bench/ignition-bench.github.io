"use strict";

const STACK = { on: {} };

function inFootprint(px, py, s){
  const cx = s.x + s.w / 2, cy = s.y + s.h / 2, a = -(s.rot || 0) * Math.PI / 180;
  const dx = px - cx, dy = py - cy, lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(lx) <= s.w / 2 && Math.abs(ly) <= s.h / 2;
}
const isObj = e => e.x !== undefined && e.type !== "door" && e.type !== "window" && e.type !== "zone";
function stackUpdate(){
  STACK.on = {};
  const objs = elements.filter(isObj).sort((a, b) => b.w * b.h - a.w * a.h);
  const done = new Set();
  objs.forEach(o => {
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    let best = null, top = 0;
    objs.forEach(s => {
      if (s === o || !done.has(s.id) || !(s.type in SURFACE_TOP) || s.w * s.h <= o.w * o.h) return;
      if (!inFootprint(cx, cy, s)) return;
      const tp = (s.elev || 0) + SURFACE_TOP[s.type];
      if (tp > top){ top = tp; best = s; }
    });
    const ne = best ? Math.round(top * 1000) / 1000 : 0;
    if (ne) o.elev = ne; else delete o.elev;
    if (best) STACK.on[o.id] = best.id;
    done.add(o.id);
  });
}
function stackRiders(base){
  const out = [], q = [base.id];
  while (q.length){ const id = q.shift(); for (const k in STACK.on) if (STACK.on[k] === id){ const e = getEl(k); if (e && !out.includes(e)){ out.push(e); q.push(k); } } }
  return out.map(e => ({ el: e, ox: e.x, oy: e.y }));
}
function stackWord(o){
  const s = STACK.on[o.id] ? getEl(STACK.on[o.id]) : null;
  if (!s) return "";
  return t("aiOnTop").replace("{s}", curLabels()[s.type] || s.type).replace("{h}", (Math.round((o.elev || 0) * 100) / 100));
}

let rotDrag = null;
function rotHandleDraw(){
  if (selectedIds.length !== 1) return;
  const el = getEl(selectedIds[0]);
  if (!el || el.x === undefined || !ROTATABLE_TYPES.includes(el.type)) return;
  const cx = el.x + el.w / 2, cy = el.y + el.h / 2, a = (el.rot || 0) * Math.PI / 180;
  const R = Math.max(el.w, el.h) / 2 + 20 / scale, ux = Math.sin(a), uy = -Math.cos(a);
  const hx = cx + ux * R, hy = cy + uy * R, r = 8 / scale;
  selLayer.appendChild(makeSvgEl("line", { x1: cx, y1: cy, x2: hx, y2: hy, stroke: PAL.sel, "stroke-width": 1 / scale, "stroke-dasharray": `${3 / scale} ${3 / scale}`, "pointer-events": "none" }));
  const g = makeSvgEl("g", { class: "rot-handle" });
  g.appendChild(makeSvgEl("circle", { cx: hx, cy: hy, r, fill: PAL.board, stroke: PAL.sel, "stroke-width": 2 / scale }));
  const tx = makeSvgEl("text", { x: hx, y: hy + 4 / scale, "font-size": 11 / scale, "text-anchor": "middle", fill: PAL.sel, "pointer-events": "none" }); tx.textContent = "↻"; g.appendChild(tx);
  const tt = makeSvgEl("title", {}); tt.textContent = t("rotHandleTitle"); g.appendChild(tt);
  g.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    pushHistory();
    rotDrag = { el, cx, cy, id: e.pointerId, rot0: el.rot || 0 };
    svg.setPointerCapture(e.pointerId);
  });
  selLayer.appendChild(g);
}
svg.addEventListener("pointermove", e => {
  if (!rotDrag) return;
  const pt = screenToCanvas(e.clientX, e.clientY);
  let deg = Math.atan2(pt.y - rotDrag.cy, pt.x - rotDrag.cx) * 180 / Math.PI + 90;
  if (!e.shiftKey) deg = Math.round(deg / 15) * 15;
  deg = ((Math.round(deg * 10) / 10) % 360 + 360) % 360;
  if (deg !== rotDrag.el.rot){ rotDrag.el.rot = deg; render(); renderSelection(); }
  e.stopImmediatePropagation();
}, true);
const rotEnd = e => { if (!rotDrag) return; if (rotDrag.el.rot === rotDrag.rot0) undoStack.pop(); rotDrag = null; updatePropPanel(); };
svg.addEventListener("pointerup", rotEnd, true); svg.addEventListener("pointercancel", rotEnd, true);

{ const s1 = renderSelection; renderSelection = function(){ s1(); rotHandleDraw(); }; }
