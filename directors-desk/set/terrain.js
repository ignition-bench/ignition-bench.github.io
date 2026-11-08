"use strict";

const TR_KIND = {
  river:   { type: "band", c2: "#4f8fd6", c3: 0x2f5f99, width: 8 },
  road:    { type: "band", c2: "#9a9a9a", c3: 0x4a4a4e, width: 4 },
  village: { type: "zone", c2: "#9aa0a8", c3: 0x5d6066, shape: "rect",    w: 40, h: 30 },
  field:   { type: "zone", c2: "#c9a95a", c3: 0x6e6030, shape: "rect",    w: 40, h: 30 },
  lake:    { type: "zone", c2: "#4f8fd6", c3: 0x2f5f99, shape: "ellipse", w: 30, h: 30 },
  forest:  { type: "zone", c2: "#3f8a4a", c3: 0x1f3d22, shape: "ellipse", w: 40, h: 30 },
};
const trLabel = el => t("tr_" + el.kind);
const trIsTool = n => typeof n === "string" && n.startsWith("tr-");
const trMinPts = el => el.type === "zone" ? 3 : 2;
const isBoxZone = el => el && el.type === "zone" && !el.pts;
const RESIZABLE = el => el && (MOUND_TYPES.includes(el.type) || el.type === "bridge" || isBoxZone(el));
const resizeStep = el => MOUND_TYPES.includes(el.type) ? Math.max(40, SNAPU()) : 40;

function bandLen(pts){ let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
function trBox(pts){ const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }; }
function trCentroid(el){
  const P = el.pts;
  if (el.type === "band"){
    let half = bandLen(P) / 2;
    for (let i = 1; i < P.length; i++){ const L = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); if (half <= L){ const k = L ? half / L : 0; return { x: P[i - 1][0] + (P[i][0] - P[i - 1][0]) * k, y: P[i - 1][1] + (P[i][1] - P[i - 1][1]) * k }; } half -= L; }
    return { x: P[0][0], y: P[0][1] };
  }
  let A = 0, cx = 0, cy = 0;
  for (let i = 0; i < P.length; i++){ const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length], f = x1 * y2 - x2 * y1; A += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f; }
  if (Math.abs(A) < 1e-6){ const b = trBox(P); return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }; }
  return { x: cx / (3 * A), y: cy / (3 * A) };
}
function trNearestOnLine(P, x, y, closed){
  let best = null;
  const n = closed ? P.length : P.length - 1;
  for (let i = 0; i < n; i++){
    const a = P[i], b = P[(i + 1) % P.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
    const k = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2)), px = a[0] + dx * k, py = a[1] + dy * k, d = Math.hypot(x - px, y - py);
    if (!best || d < best.d) best = { d, x: px, y: py, i, ang: Math.atan2(dy, dx) * 180 / Math.PI };
  }
  return best;
}
const trSnap = (pt, free) => free ? clampToBoard(pt) : snapToGrid(pt);
const trFont = base => base * planK();

function trRender2D(layer){
  const K = planK();
  elements.filter(e => isBoxZone(e)).forEach(el => {
    const C = TR_KIND[el.kind] || TR_KIND.village, cx = el.x + el.w / 2, cy = el.y + el.h / 2;
    const g = makeSvgEl("g", { "data-id": el.id, class: "shape-el tr-shape" }), wrap = makeSvgEl("g", { transform: `rotate(${el.rot || 0} ${cx} ${cy})` });
    const st = { fill: C.c2, "fill-opacity": el.kind === "lake" ? 0.55 : 0.32, stroke: C.c2, "stroke-width": 1.5 * K, "stroke-dasharray": el.kind === "lake" ? "none" : `${6 * K} ${4 * K}` };
    wrap.appendChild(C.shape === "ellipse" ? makeSvgEl("ellipse", Object.assign({ cx, cy, rx: el.w / 2, ry: el.h / 2 }, st)) : makeSvgEl("rect", Object.assign({ x: el.x, y: el.y, width: el.w, height: el.h }, st)));
    g.appendChild(wrap);
    const tx = makeSvgEl("text", { x: C.shape === "ellipse" ? cx : el.x + 6 * K, y: C.shape === "ellipse" ? cy - el.h * 0.28 : el.y + 14 * K, "font-size": 12 * K, fill: PAL.ink, "text-anchor": C.shape === "ellipse" ? "middle" : "start", "font-weight": "700", "pointer-events": "none", opacity: 0.85 });
    tx.textContent = trLabel(el); g.appendChild(tx);
    layer.appendChild(g);
  });
  elements.filter(e => e.type === "zone" && e.pts).forEach(el => {
    const C = TR_KIND[el.kind] || TR_KIND.village, g = makeSvgEl("g", { "data-id": el.id, class: "shape-el tr-shape" });
    g.appendChild(makeSvgEl("polygon", { points: el.pts.map(p => p.join(",")).join(" "), fill: C.c2, "fill-opacity": el.kind === "lake" ? 0.55 : 0.3, stroke: C.c2, "stroke-width": 1.5 * K, "stroke-dasharray": el.kind === "lake" ? "none" : `${6 * K} ${4 * K}` }));
    const c = trCentroid(el), tx = makeSvgEl("text", { x: c.x, y: c.y, "font-size": 12 * K, fill: PAL.ink, "text-anchor": "middle", "dominant-baseline": "middle", "font-weight": "700", "pointer-events": "none", opacity: 0.85 });
    tx.textContent = trLabel(el); g.appendChild(tx);
    layer.appendChild(g);
  });
  elements.filter(e => e.type === "band").forEach(el => {
    const C = TR_KIND[el.kind] || TR_KIND.road, g = makeSvgEl("g", { "data-id": el.id, class: "shape-el tr-shape" }), pts = el.pts.map(p => p.join(",")).join(" ");
    const W = (el.width || C.width) * 40;
    g.appendChild(makeSvgEl("polyline", { points: pts, fill: "none", stroke: C.c2, "stroke-width": W, "stroke-opacity": el.kind === "river" ? 0.7 : 0.6, "stroke-linecap": "round", "stroke-linejoin": "round" }));
    if (el.kind === "road") g.appendChild(makeSvgEl("polyline", { points: pts, fill: "none", stroke: "#f0f0f0", "stroke-width": Math.max(1, W * 0.04), "stroke-dasharray": `${W * 0.5} ${W * 0.4}`, "pointer-events": "none", opacity: 0.8 }));
    if (el.kind === "river") for (let i = 1; i < el.pts.length; i++){
      const a = el.pts[i - 1], b = el.pts[i], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI, s = Math.min(W * 0.35, 12 * K);
      g.appendChild(makeSvgEl("polygon", { points: `${-s},${-s * 0.6} ${s},0 ${-s},${s * 0.6}`, fill: "#dff0ff", opacity: 0.85, transform: `translate(${mx} ${my}) rotate(${ang})`, "pointer-events": "none" }));
    }
    const c = trCentroid(el), tx = makeSvgEl("text", { x: c.x, y: c.y - W / 2 - 6 * K, "font-size": 11 * K, fill: PAL.dim, "text-anchor": "middle", "pointer-events": "none" });
    tx.textContent = trLabel(el) + " " + m1(W) + "m"; g.appendChild(tx);
    layer.appendChild(g);
  });
}

function trBuild3D(scene){
  const mats = {};
  const mat = kind => mats[kind] || (mats[kind] = new THREE.MeshStandardMaterial({ color: (TR_KIND[kind] || TR_KIND.road).c3, roughness: kind === "river" || kind === "lake" ? 0.3 : 1, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  elements.filter(e => e.pts && e.pts.length >= trMinPts(e)).forEach(el => {
    const g = new THREE.Group(), m = mat(el.kind);
    if (isBoxZone(el)) return;
    if (el.type === "zone"){
      const sh = new THREE.Shape(el.pts.map(p => new THREE.Vector2(toX(p[0]), toZ(p[1]))));
      const geo = new THREE.ShapeGeometry(sh); geo.rotateX(Math.PI / 2);
      const mesh = new THREE.Mesh(geo, m); mesh.position.y = 0.012; mesh.receiveShadow = true; g.add(mesh);
    } else {
      const W = (el.width || TR_KIND[el.kind].width), y = el.kind === "river" ? 0.026 : 0.02;
      for (let i = 1; i < el.pts.length; i++){
        const ax = toX(el.pts[i - 1][0]), az = toZ(el.pts[i - 1][1]), bx = toX(el.pts[i][0]), bz = toZ(el.pts[i][1]), L = Math.hypot(bx - ax, bz - az); if (L < 0.01) continue;
        const geo = new THREE.PlaneGeometry(L, W); geo.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(geo, m); mesh.position.set((ax + bx) / 2, y, (az + bz) / 2); mesh.rotation.y = -Math.atan2(bz - az, bx - ax); mesh.receiveShadow = true; g.add(mesh);
      }
      el.pts.forEach(p => { const geo = new THREE.CircleGeometry(W / 2, 18); geo.rotateX(-Math.PI / 2); const mesh = new THREE.Mesh(geo, m); mesh.position.set(toX(p[0]), y + 0.001, toZ(p[1])); mesh.receiveShadow = true; g.add(mesh); });
    }
    scene.add(g); set3dTag(g, el.id);
  });
  elements.filter(isBoxZone).forEach(el => {
    const C = TR_KIND[el.kind] || TR_KIND.village, w = el.w * SCALE3D, d = el.h * SCALE3D;
    const geo = C.shape === "ellipse" ? new THREE.CircleGeometry(0.5, 40) : new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat(el.kind)); mesh.scale.set(w, 1, d); mesh.receiveShadow = true;
    const g = new THREE.Group(); g.add(mesh); g.position.set(toX(el.x) + w / 2, 0.012, toZ(el.y) + d / 2); g.rotation.y = -(el.rot || 0) * Math.PI / 180;
    scene.add(g); set3dTag(g, el.id);
  });
}

function trAiLines(out, B, memoOf){
  const L = curLabels();
  const mounds = elements.filter(e => MOUND_TYPES.includes(e.type)), bands = elements.filter(e => e.type === "band"), zones = elements.filter(e => e.type === "zone");
  if (!mounds.length && !bands.length && !zones.length) return;
  out.push("", "[" + t("aiTerrain") + "]");
  const memosOf = id => { memoOf(id, "set").forEach(m => out.push("    🔒 " + m.text)); memoOf(id, "scene").forEach(m => out.push("    🎬 " + m.text)); };
  mounds.forEach(o => { const cx = o.x + o.w / 2, cy = o.y + o.h / 2; out.push(`- ${L[o.type]} ${m1(o.w)}×${m1(o.h)}m · ${t("aiHeight")} ${Math.round(elHeight(o) * 10) / 10}m · ${areaWord(cx, cy, B)} (x ${m1(cx - B.x0)}m, y ${m1(cy - B.y0)}m)`); memosOf(o.id); });
  bands.forEach(el => {
    const a = el.pts[0], b = el.pts[el.pts.length - 1], W = el.width || TR_KIND[el.kind].width;
    out.push(`- ${trLabel(el)} · ${t("trWidth")} ${W}m · ${t("trLength")} ${m1(bandLen(el.pts))}m · ` + t(el.kind === "river" ? "aiRiverFlow" : "aiRoadRuns").replace("{a}", areaWord(a[0], a[1], B)).replace("{b}", areaWord(b[0], b[1], B)));
    memosOf(el.id);
  });
  zones.forEach(el => { const bx = el.pts ? trBox(el.pts) : { x0: el.x, y0: el.y, x1: el.x + el.w, y1: el.y + el.h }, c = el.pts ? trCentroid(el) : { x: el.x + el.w / 2, y: el.y + el.h / 2 }; out.push(`- ${trLabel(el)} ${t("trZone")} · ${t("trAbout")} ${m1(bx.x1 - bx.x0)}×${m1(bx.y1 - bx.y0)}m · ${areaWord(c.x, c.y, B)} (x ${m1(c.x - B.x0)}m, y ${m1(c.y - B.y0)}m)`); memosOf(el.id); });
}

function onObjectPlaced(el){
  if (el.type !== "bridge") return;
  const cx = el.x + el.w / 2, cy = el.y + el.h / 2;
  let best = null;
  elements.filter(e => e.type === "band" && e.kind === "river").forEach(r => { const n = trNearestOnLine(r.pts, cx, cy, false); const W = (r.width || 8) * 40; if (n && n.d < W / 2 + 120 && (!best || n.d < best.n.d)) best = { r, n, W }; });
  if (!best){ showToast(t("bridgeFree")); return; }
  el.w = best.W + 160; el.h = 120;
  el.x = best.n.x - el.w / 2; el.y = best.n.y - el.h / 2;
  el.rot = ((Math.round(best.n.ang + 90) % 360) + 360) % 360;
  showToast(t("bridgeFit").replace("{w}", m1(el.w)));
}

const TRD = { kind: null, pts: [], hover: null, lastT: 0 };
let TRV = null, TRM = null, TRB = null, TRR = null;

function trStartTool(kind){ TRD.kind = kind; TRD.pts = []; TRD.hover = null; }
function trFinish(){
  const kind = TRD.kind, C = TR_KIND[kind], pts = TRD.pts.slice();
  TRD.pts = []; TRD.hover = null;
  if (!C || pts.length < (C.type === "zone" ? 3 : 2)){ render(); showToast(t(C && C.type === "zone" ? "trNeed3" : "trNeed2")); return; }
  pushHistory();
  const el = { id: uid(), type: C.type, kind, pts, note: "" }; if (C.type === "band") el.width = C.width;
  elements.push(el);
  setTool("select"); selectedIds = [el.id]; render(); updatePropPanel();
  showToast(t(C.type === "zone" ? "trZoneDone" : "trBandDone").replace("{n}", trLabel(el)));
}
function trPreview(){
  render();
  if (!TRD.kind) return;
  const C = TR_KIND[TRD.kind], K = planK(), P = TRD.pts.concat(TRD.hover ? [[TRD.hover.x, TRD.hover.y]] : []);
  if (!P.length) return;
  const ptsStr = P.map(p => p.join(",")).join(" ");
  if (C.type === "band") shapesLayer.appendChild(makeSvgEl("polyline", { points: ptsStr, fill: "none", stroke: C.c2, "stroke-width": C.width * 40, "stroke-opacity": 0.4, "stroke-linecap": "round", "stroke-linejoin": "round", "pointer-events": "none" }));
  else shapesLayer.appendChild(makeSvgEl("polygon", { points: ptsStr, fill: C.c2, "fill-opacity": 0.2, stroke: C.c2, "stroke-width": 2 * K, "pointer-events": "none" }));
  shapesLayer.appendChild(makeSvgEl("polyline", { points: ptsStr, fill: "none", stroke: PAL.sel, "stroke-width": 1.5 * K, "stroke-dasharray": `${5 * K} ${4 * K}`, "pointer-events": "none" }));
  TRD.pts.forEach((p, i) => shapesLayer.appendChild(makeSvgEl("circle", { cx: p[0], cy: p[1], r: (i === 0 && C.type === "zone" ? 7 : 4) * K, fill: i === 0 && C.type === "zone" && TRD.pts.length >= 3 ? "#5fdc8a" : PAL.sel, "pointer-events": "none" })));
  const last = P[P.length - 1], lbl = makeSvgEl("text", { x: last[0] + 10 * K, y: last[1] - 10 * K, "font-size": 12 * K, fill: PAL.sel, "font-weight": "700", "pointer-events": "none" });
  if (C.type === "band") lbl.textContent = t("trSoFar").replace("{m}", m1(bandLen(P)));
  else { const b = trBox(P); lbl.textContent = t("trAbout") + " " + m1(b.x1 - b.x0) + "×" + m1(b.y1 - b.y0) + "m" + (TRD.pts.length >= 3 ? " · " + t("trCloseHint") : ""); }
  shapesLayer.appendChild(lbl);
}
function trMoundPreview(){
  render();
  const r = trMoundRect(), K = planK(), Z = TRB.kind ? TR_KIND[TRB.kind] : null;
  shapesLayer.appendChild(makeSvgEl("rect", { x: r.x, y: r.y, width: r.w, height: r.h, rx: Z ? (Z.shape === "ellipse" ? Math.min(r.w, r.h) / 2 : 0) : Math.min(r.w, r.h) * 0.3, fill: Z ? Z.c2 : COLORS[TRB.type], "fill-opacity": 0.35, stroke: PAL.sel, "stroke-width": 2 * K, "stroke-dasharray": `${6 * K} ${4 * K}`, "pointer-events": "none" }));
  const lbl = makeSvgEl("text", { x: r.x + r.w / 2, y: r.y + r.h / 2, "font-size": 14 * K, fill: PAL.sel, "text-anchor": "middle", "font-weight": "700", "pointer-events": "none" });
  lbl.textContent = m1(r.w) + " × " + m1(r.h) + "m"; shapesLayer.appendChild(lbl);
}
function trMoundRect(){
  const a = TRB.a, b = TRB.b || a, st = TRB.kind ? 40 : Math.max(40, SNAPU());
  const x0 = Math.round(Math.min(a.x, b.x) / st) * st, y0 = Math.round(Math.min(a.y, b.y) / st) * st, x1 = Math.round(Math.max(a.x, b.x) / st) * st, y1 = Math.round(Math.max(a.y, b.y) / st) * st;
  return { x: x0, y: y0, w: Math.max(st, x1 - x0), h: Math.max(st, y1 - y0) };
}

svg.addEventListener("pointerdown", e => {
  if (e.button !== 0 || spaceHeld) return;
  const pt = screenToCanvas(e.clientX, e.clientY), tgt = e.target;
  const stop = () => { e.stopImmediatePropagation(); e.preventDefault(); try { svg.setPointerCapture(e.pointerId); } catch(err){} };
  const vtx = tgt.closest && tgt.closest(".tr-vtx");
  if (vtx){ const el = getEl(vtx.dataset.id); if (el){ TRV = { el, i: +vtx.dataset.i, moved: false }; stop(); } return; }
  const rs = tgt.closest && tgt.closest(".tr-rs");
  if (rs){ const el = getEl(rs.dataset.id); if (el){ TRR = { el, moved: false }; stop(); } return; }
  if (trIsTool(currentTool) && TR_KIND[currentTool.slice(3)] && TR_KIND[currentTool.slice(3)].type === "zone"){ stop(); TRB = { type: "zone", kind: currentTool.slice(3), a: clampToBoard(pt), b: null }; trMoundPreview(); return; }
  if (trIsTool(currentTool)){
    stop();
    const kind = currentTool.slice(3); if (TRD.kind !== kind) trStartTool(kind);
    const p = trSnap(pt, e.shiftKey), now = performance.now(), C = TR_KIND[kind];
    const last = TRD.pts[TRD.pts.length - 1];
    if (last && now - TRD.lastT < 380 && Math.hypot(p.x - last[0], p.y - last[1]) * scale < 8){ trFinish(); return; }
    TRD.lastT = now;
    if (C.type === "zone" && TRD.pts.length >= 3 && Math.hypot(pt.x - TRD.pts[0][0], pt.y - TRD.pts[0][1]) * scale < 14){ trFinish(); return; }
    if (last && last[0] === p.x && last[1] === p.y){ if (TRD.pts.length >= (C.type === "zone" ? 3 : 2)) trFinish(); return; }
    TRD.pts.push([p.x, p.y]); TRD.hover = null; trPreview();
    return;
  }
  if (MOUND_TYPES.includes(currentTool)){ stop(); TRB = { type: currentTool, a: clampToBoard(pt), b: null }; trMoundPreview(); return; }
  if (currentTool === "select"){
    const sh = tgt.closest && tgt.closest(".tr-shape"), el = sh ? getEl(sh.dataset.id) : null;
    if (el && el.pts){ stop(); selectedIds = [el.id]; if (typeof SETM !== "undefined") SETM.sel = null; renderSelection(); updatePropPanel(); TRM = { el, a: pt, orig: el.pts.map(p => p.slice()), moved: false }; return; }
  }
}, true);
svg.addEventListener("pointermove", e => {
  const pt = screenToCanvas(e.clientX, e.clientY);
  if (TRV){
    if (!TRV.moved){ TRV.moved = true; pushHistory(); }
    const p = trSnap(pt, e.shiftKey); TRV.el.pts[TRV.i] = [p.x, p.y]; render(); e.stopImmediatePropagation(); return;
  }
  if (TRM){
    const st = SNAPU(), dx = Math.round((pt.x - TRM.a.x) / st) * st, dy = Math.round((pt.y - TRM.a.y) / st) * st;
    if (!dx && !dy && !TRM.moved) { e.stopImmediatePropagation(); return; }
    if (!TRM.moved){ TRM.moved = true; pushHistory(); }
    TRM.el.pts = TRM.orig.map(p => [p[0] + dx, p[1] + dy]); render(); e.stopImmediatePropagation(); return;
  }
  if (TRR){
    const el = TRR.el, cx = el.x + el.w / 2, cy = el.y + el.h / 2, [lx, ly] = rot2(pt.x - cx, pt.y - cy, -(el.rot || 0)), st = resizeStep(el);
    if (!TRR.moved){ TRR.moved = true; pushHistory(); }
    const w = Math.max(st, Math.round(Math.abs(lx) * 2 / st) * st), h = Math.max(st, Math.round(Math.abs(ly) * 2 / st) * st);
    el.w = w; el.h = h; el.x = cx - w / 2; el.y = cy - h / 2; render(); updatePropPanel(); e.stopImmediatePropagation(); return;
  }
  if (TRB){ TRB.b = clampToBoard(pt); trMoundPreview(); e.stopImmediatePropagation(); return; }
  if (trIsTool(currentTool) && TR_KIND[currentTool.slice(3)].type === "band"){
    if (TRD.kind !== currentTool.slice(3)) trStartTool(currentTool.slice(3));
    TRD.hover = trSnap(pt, e.shiftKey); trPreview(); e.stopImmediatePropagation();
  }
}, true);
const trUp = e => {
  if (TRV){ if (!TRV.moved){} TRV = null; render(); updatePropPanel(); e.stopImmediatePropagation(); return; }
  if (TRM){ TRM = null; render(); e.stopImmediatePropagation(); return; }
  if (TRR){ TRR = null; render(); updatePropPanel(); e.stopImmediatePropagation(); return; }
  if (TRB){
    const small = !TRB.b || Math.hypot(TRB.b.x - TRB.a.x, TRB.b.y - TRB.a.y) < 40;
    let el;
    const Z = TRB.kind ? TR_KIND[TRB.kind] : null;
    if (small && Z){
      const w = Math.min(Z.w * 40, Math.round(boardW() / 2 / 40) * 40), h = Math.min(Z.h * 40, Math.round(boardH() / 2 / 40) * 40);
      const x = Math.max(0, Math.min(boardW() - w, Math.round((TRB.a.x - w / 2) / 40) * 40)), y = Math.max(0, Math.min(boardH() - h, Math.round((TRB.a.y - h / 2) / 40) * 40));
      el = { id: uid(), type: "zone", kind: TRB.kind, x, y, w, h, rot: 0, note: "" }; }
    else if (small){ el = makeDefaultObject(TRB.type, TRB.a.x, TRB.a.y); }
    else { const r = trMoundRect(); el = { id: uid(), type: TRB.type, x: r.x, y: r.y, w: r.w, h: r.h, rot: 0, note: "" }; if (Z) el.kind = TRB.kind; }
    TRB = null;
    if (Z){ pushHistory(); elements.push(el); setTool("select"); selectedIds = [el.id]; render(); updatePropPanel(); showToast(t("zoneDone").replace("{n}", trLabel(el)).replace("{s}", m1(el.w) + "×" + m1(el.h))); e.stopImmediatePropagation(); return; }
    pushHistory(); elements.push(el); setTool("select"); selectedIds = [el.id]; render(); updatePropPanel();
    showToast(t("moundDone").replace("{n}", curLabels()[el.type]).replace("{s}", m1(el.w) + "×" + m1(el.h)));
    e.stopImmediatePropagation(); return;
  }
};
svg.addEventListener("pointerup", trUp, true); svg.addEventListener("pointercancel", trUp, true);

window.addEventListener("keydown", e => {
  if (APP.screen !== "set" || !trIsTool(currentTool) || (typeof typingNow === "function" && typingNow())) return;
  if (e.key === "Enter"){ e.preventDefault(); e.stopImmediatePropagation(); trFinish(); }
  else if (e.key === "Backspace" || e.key === "Delete"){ e.preventDefault(); e.stopImmediatePropagation(); TRD.pts.pop(); trPreview(); }
  else if (e.key === "Escape"){ e.stopImmediatePropagation(); TRD.pts = []; TRD.hover = null; setTool("select"); }
}, true);
{ const st0 = setTool; setTool = function(name){ if (!trIsTool(name)){ TRD.kind = null; TRD.pts = []; TRD.hover = null; } st0(name); if (trIsTool(name) || MOUND_TYPES.includes(name)) svg.setAttribute("class", "tool-rectroom"); }; }

{ const s0 = renderSelection; renderSelection = function(){
  s0();
  if (selectedIds.length !== 1) return;
  const el = getEl(selectedIds[0]); if (!el) return;
  const K = Math.max(planK(), 1);
  if (el.pts){
    const str = el.pts.map(p => p.join(",")).join(" ");
    selLayer.appendChild(makeSvgEl(el.type === "zone" ? "polygon" : "polyline", { points: str, fill: "none", stroke: PAL.sel, "stroke-width": 2 / scale, "stroke-dasharray": `${5 / scale} ${4 / scale}`, "pointer-events": "none" }));
    el.pts.forEach((p, i) => { const c = makeSvgEl("circle", { cx: p[0], cy: p[1], r: 6 / scale, fill: PAL.board, stroke: PAL.sel, "stroke-width": 2 / scale, class: "tr-vtx", "data-id": el.id, "data-i": i }); const tt = makeSvgEl("title", {}); tt.textContent = t("trVtxTitle"); c.appendChild(tt); selLayer.appendChild(c); });
    return;
  }
  if (RESIZABLE(el)){
    const cx = el.x + el.w / 2, cy = el.y + el.h / 2, [ox, oy] = rot2(el.w / 2, el.h / 2, el.rot || 0), s = 9 / scale;
    const r = makeSvgEl("rect", { x: cx + ox - s, y: cy + oy - s, width: s * 2, height: s * 2, fill: PAL.board, stroke: PAL.sel, "stroke-width": 2 / scale, class: "tr-rs", "data-id": el.id, style: "cursor:nwse-resize" });
    const tt = makeSvgEl("title", {}); tt.textContent = t("trResizeTitle"); r.appendChild(tt); selLayer.appendChild(r);
    const lbl = makeSvgEl("text", { x: cx, y: el.y - 8 / scale, "font-size": 13 / scale, fill: PAL.sel, "text-anchor": "middle", "font-weight": "700", "pointer-events": "none" });
    lbl.textContent = isBoxZone(el) ? `${trLabel(el)} ${m1(el.w)}×${m1(el.h)}m` : el.type === "bridge" ? `${curLabels().bridge} ${t("trLength")} ${m1(el.w)}m · ${t("trWidth")} ${m1(el.h)}m` : `${curLabels()[el.type]} ${m1(el.w)}×${m1(el.h)}m · ${t("aiHeight")} ${Math.round(elHeight(el) * 10) / 10}m`; selLayer.appendChild(lbl);
  }
}; }

svg.addEventListener("contextmenu", e => {
  if (APP.screen !== "set") return;
  const pt = screenToCanvas(e.clientX, e.clientY);
  const vtx = e.target.closest && e.target.closest(".tr-vtx");
  if (vtx){
    const el = getEl(vtx.dataset.id), i = +vtx.dataset.i; if (!el) return;
    e.stopPropagation();
    return ctxShow(e, [{ label: t("trDelPt"), disabled: el.pts.length <= trMinPts(el), fn: () => { pushHistory(); el.pts.splice(i, 1); render(); } }]);
  }
  const sh = e.target.closest && e.target.closest(".tr-shape"), el = sh ? getEl(sh.dataset.id) : null;
  if (!el || !el.pts) return;
  e.stopPropagation();
  if (!selectedIds.includes(el.id)){ selectedIds = [el.id]; renderSelection(); updatePropPanel(); }
  ctxShow(e, [
    { label: t("trAddPt"), fn: () => { const n = trNearestOnLine(el.pts, pt.x, pt.y, el.type === "zone"); if (!n) return; pushHistory(); const p = snapToGrid({ x: n.x, y: n.y }); el.pts.splice(n.i + 1, 0, [p.x, p.y]); render(); } },
    { label: t("cmMemoHere"), fn: () => memoCreate(memoAnchorAt(pt.x, pt.y, null, el.id), ctxMenu._x, ctxMenu._y) },
    "-",
    { label: t("cmDelete"), danger: true, fn: () => deleteSelected() },
  ]);
}, true);

const trGroup = document.getElementById("tr-group"), trInfo = trGroup.querySelector(".tr-info"), trNumLab = trGroup.querySelector(".tr-num span"), trNum = trGroup.querySelector(".tr-num input");
{ const u0 = updatePropPanel; updatePropPanel = function(){
  u0();
  const one = selectedIds.length === 1 ? getEl(selectedIds[0]) : null;
  const mound = one && MOUND_TYPES.includes(one.type), area = one && one.pts, box = isBoxZone(one);
  trGroup.style.display = mound || area || box ? "block" : "none";
  if (box){ trInfo.textContent = `${trLabel(one)} ${t("trZone")} · ${m1(one.w)}×${m1(one.h)}m`; trNum.parentElement.hidden = true; document.getElementById("sel-title").textContent = t("selTitle") + " " + trLabel(one); }
  if (area){ document.getElementById("dup-btn").style.display = "none"; document.getElementById("rotate-group").style.display = "none"; }
  if (mound){ trInfo.textContent = `${curLabels()[one.type]} ${m1(one.w)}×${m1(one.h)}m`; trNumLab.textContent = t("trHeightLab"); trNum.parentElement.hidden = false; if (document.activeElement !== trNum) trNum.value = Math.round(elHeight(one) * 10) / 10; }
  else if (area && one.type === "band"){ trInfo.textContent = `${trLabel(one)} · ${t("trLength")} ${m1(bandLen(one.pts))}m`; trNumLab.textContent = t("trWidthLab"); trNum.parentElement.hidden = false; if (document.activeElement !== trNum) trNum.value = one.width || TR_KIND[one.kind].width; }
  else if (area){ const b = trBox(one.pts); trInfo.textContent = `${trLabel(one)} ${t("trZone")} · ${t("trAbout")} ${m1(b.x1 - b.x0)}×${m1(b.y1 - b.y0)}m`; trNum.parentElement.hidden = true; }
  if (one && (mound || area)) document.getElementById("sel-title").textContent = t("selTitle") + " " + (area ? trLabel(one) : curLabels()[one.type]);
}; }
trNum.addEventListener("change", () => {
  const one = selectedIds.length === 1 ? getEl(selectedIds[0]) : null, v = Math.max(0.5, Math.min(one && one.type === "band" ? 100 : 500, +trNum.value || 0));
  if (!one) return;
  pushHistory();
  if (one.type === "band") one.width = v; else one.hgt = v;
  render(); updatePropPanel();
});
trNum.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Enter") trNum.blur(); });
