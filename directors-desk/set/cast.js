"use strict";

const CAST_COLORS = ["#ff8a5c", "#4cc9f0", "#c49bff", "#7bd88f", "#ffd166", "#ff6fa5", "#5eead4", "#f4a261"];
const CAST_R = 12;
const CAST = { actors: [], sel: null, selClip: null, selPt: null, t: 0, playing: false, speed: 1, sceneName: "", savedSig: null };
let castIdN = 1;
const castGet = id => CAST.actors.find(a => a.id === id) || null;
const castLetter = i => i < 26 ? String.fromCharCode(65 + i) : String(i + 1);

const clipLen = c => c.dur / (c.speed || 1) * (c.reps || 1);
const clipEnd = c => c.t0 + clipLen(c);
function castSortClips(a){ a.clips.sort((x, y) => x.t0 - y.t0); }
function castTotal(){ let m = 0; CAST.actors.forEach(a => a.clips.forEach(c => { m = Math.max(m, clipEnd(c)); })); return m; }
function castClipAt(a, T){
  let hit = null;
  for (const c of a.clips){ if (T >= c.t0 - 1e-6 && T <= clipEnd(c) + 1e-6){ hit = c; if (T < clipEnd(c) - 1e-6) break; } }
  return hit;
}
let _standPose = null;
const castStand = () => _standPose || (_standPose = POSE_PRESETS.stand());
function castClipPose(c, T){
  const len = clipLen(c), sp = c.speed || 1;
  let u = (Math.min(T, c.t0 + len) - c.t0) * sp;
  if (u >= c.dur - 1e-6){ const end = T >= c.t0 + len - 1e-6; u = end ? c.dur : u % c.dur; }
  return motSampleOf(c.keys, c.dur, c.loop, Math.max(0, u));
}
const CAST_BLEND = 0.25;
function poseLerp(a, b, u){
  const o = poseClone(b);
  for (const k in o.root) o.root[k] = a.root[k] + (b.root[k] - a.root[k]) * u;
  for (const id in o.j) for (const k in o.j[id]) o.j[id][k] = a.j[id][k] + (b.j[id][k] - a.j[id][k]) * u;
  return o;
}
function castPoseAt(a, T){
  if (!a.clips.length) return castStand();
  const c = castClipAt(a, T); if (!c) return null;
  let p = castClipPose(c, T);
  const into = T - c.t0;
  if (into < CAST_BLEND){
    const prev = a.clips.filter(x => x !== c && Math.abs(clipEnd(x) - c.t0) < 0.06)[0];
    if (prev){ const u = into / CAST_BLEND, s = u * u * (3 - 2 * u); p = poseLerp(castClipPose(prev, clipEnd(prev)), p, s); }
  }
  return p;
}

const CAST_GAIT = { walk: { d: 1.2 }, fastwalk: { d: 3.0 }, run: { d: 1.55 }, crouchwalk: { d: 0.88 }, backwalk: { d: 0.8, face: "back" }, sidestep: { d: 0.28, face: "left" } };
const castGaitOf = c => c && c.lib ? CAST_GAIT[c.lib] : null;
function pathLen(P){ let L = 0; for (let i = 1; i < P.length; i++) L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); return L; }
function pathAt(P, s){
  if (s <= 0 || P.length < 2) return { x: P[0][0], y: P[0][1] };
  for (let i = 1; i < P.length; i++){
    const l = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    if (s <= l || i === P.length - 1){ const u = l ? Math.min(1, s / l) : 0; return { x: P[i - 1][0] + (P[i][0] - P[i - 1][0]) * u, y: P[i - 1][1] + (P[i][1] - P[i - 1][1]) * u }; }
    s -= l;
  }
  const e = P[P.length - 1]; return { x: e[0], y: e[1] };
}
function pathDir(P, s){
  const L = pathLen(P), w = 12, a = pathAt(P, Math.max(0, Math.min(L, s) - w)), b = pathAt(P, Math.min(L, Math.max(0, s) + w));
  return [b.x - a.x, b.y - a.y];
}
function faceRot(d, face){
  if (!d || Math.hypot(d[0], d[1]) < 1e-6) return null;
  let r = face === "left" ? Math.atan2(d[1], d[0]) : Math.atan2(-d[0], d[1]);
  r = r * 180 / Math.PI + (face === "back" ? 180 : 0);
  return ((r % 360) + 360) % 360;
}
function castChain(a){
  const out = []; let px = a.x, py = a.y, pr = a.rot;
  a.clips.forEach((c, i) => {
    const prev = a.clips[i - 1], gap = prev ? c.t0 - clipEnd(prev) > 0.06 : false, face = (castGaitOf(c) || {}).face;
    let P = null, sx, sy, sr;
    if (c.pts && c.pts.length){
      P = c.link ? [[px, py]].concat(c.pts.slice(1)) : c.pts;
      sx = P[0][0]; sy = P[0][1]; sr = P.length > 1 ? faceRot(pathDir(P, 0), face) : null; if (sr == null) sr = pr;
    } else if (c.at){ sx = c.at[0]; sy = c.at[1]; sr = c.at[2] != null ? c.at[2] : pr; }
    else { sx = px; sy = py; sr = pr; }
    let ex = sx, ey = sy, er = sr;
    if (P && P.length > 1){ const e = P[P.length - 1]; ex = e[0]; ey = e[1]; const r = faceRot(pathDir(P, pathLen(P)), face); if (r != null) er = r; }
    out.push({ P, sx, sy, sr, ex, ey, er, gap, jump: i > 0 && Math.hypot(sx - px, sy - py) > 2, px, py, face });
    px = ex; py = ey; pr = er;
  });
  return out;
}
function castStateAt(a, T){
  if (!a.clips.length) return { x: a.x, y: a.y, rot: a.rot, pose: castStand(), shown: true, ci: -1 };
  const ch = castChain(a), c = castClipAt(a, T), ci = c ? a.clips.indexOf(c) : -1;
  if (!c){
    let j = a.clips.findIndex(x => x.t0 > T);
    if (j < 0){ const k = ch.length - 1; return { x: ch[k].ex, y: ch[k].ey, rot: ch[k].er, pose: null, shown: false, ci: -1, chain: ch }; }
    return { x: ch[j].sx, y: ch[j].sy, rot: ch[j].sr, pose: null, shown: false, ci: -1, next: j, chain: ch };
  }
  const C = ch[ci]; let x = C.sx, y = C.sy, rot = C.sr;
  if (C.P && C.P.length > 1){
    const L = pathLen(C.P), u = Math.max(0, Math.min(1, (T - c.t0) / (clipLen(c) || 1))), q = pathAt(C.P, u * L);
    x = q.x; y = q.y; const r = faceRot(pathDir(C.P, u * L), C.face); if (r != null) rot = r;
  }
  return { x, y, rot, pose: castPoseAt(a, T), shown: true, ci, chain: ch };
}
function castFitReps(a, c){
  const G = castGaitOf(c); if (!G) return;
  const ch = castChain(a)[a.clips.indexOf(c)]; if (!ch || !ch.P || ch.P.length < 2) return;
  c.reps = Math.max(1, Math.min(60, Math.round(pathLen(ch.P) / 40 / G.d)));
}

let spinDrag = null;
function spinHandle(layer, wx, wy, rot, R, k, apply){
  const a = rot * Math.PI / 180, hx = wx - Math.sin(a) * R, hy = wy + Math.cos(a) * R, r = 7 * k;
  layer.appendChild(makeSvgEl("line", { x1: wx, y1: wy, x2: hx, y2: hy, stroke: PAL.sel, "stroke-width": 1 * k, "stroke-dasharray": `${3 * k} ${3 * k}`, "pointer-events": "none" }));
  const h = makeSvgEl("g", { class: "spin-handle" });
  h.appendChild(makeSvgEl("circle", { cx: hx, cy: hy, r, fill: PAL.board, stroke: PAL.sel, "stroke-width": 2 * k }));
  const tx = makeSvgEl("text", { x: hx, y: hy + 3.5 * k, "font-size": 10 * k, "text-anchor": "middle", fill: PAL.sel, "pointer-events": "none" }); tx.textContent = "↻"; h.appendChild(tx);
  const tt = makeSvgEl("title", {}); tt.textContent = t("spinHandleTitle"); h.appendChild(tt);
  h.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;
    e.stopPropagation(); e.stopImmediatePropagation(); e.preventDefault();
    pushHistory();
    spinDrag = { apply, wx, wy, moved: false };
    try { svg.setPointerCapture(e.pointerId); } catch(err){}
  }, true);
  layer.appendChild(h);
}
svg.addEventListener("pointermove", e => {
  if (!spinDrag) return;
  e.stopImmediatePropagation();
  const pt = screenToCanvas(e.clientX, e.clientY);
  const dx = pt.x - spinDrag.wx, dy = pt.y - spinDrag.wy;
  if (Math.hypot(dx, dy) < 2) return;
  let deg = Math.atan2(-dx, dy) * 180 / Math.PI;
  if (!e.shiftKey) deg = Math.round(deg / 15) * 15;
  spinDrag.moved = true;
  spinDrag.apply(((deg % 360) + 360) % 360);
}, true);
const spinEnd = e => {
  if (!spinDrag) return;
  const was = spinDrag; spinDrag = null; if (e) e.stopImmediatePropagation();
  if (!was.moved && undoStack.length) undoStack.pop();
  castChanged(); if (typeof camChanged === "function") camChanged(); updatePropPanel();
};
svg.addEventListener("pointerup", spinEnd, true); svg.addEventListener("pointercancel", spinEnd, true);

function castAdd(x, y){
  pushHistory();
  const used = new Set(CAST.actors.map(a => a.name)); let i = 0; while (used.has(t("castAuto") + " " + castLetter(i))) i++;
  const a = { id: "a" + (castIdN++), name: t("castAuto") + " " + castLetter(i), color: CAST_COLORS[CAST.actors.length % CAST_COLORS.length],
    x: Math.round(x), y: Math.round(y), rot: 0, clips: [] };
  CAST.actors.push(a);
  castSelect(a.id);
  cast3dBuild(); castChanged();
  showToast(t("castPlaced").replace("{n}", a.name));
  return a;
}
function castRemove(id){
  const a = castGet(id); if (!a) return;
  pushHistory();
  CAST.actors = CAST.actors.filter(x => x !== a);
  if (CAST.sel === id){ CAST.sel = null; CAST.selClip = null; }
  cast3dBuild(); castChanged(); updatePropPanel();
  if (typeof undoToastSet === "function") undoToastSet(t("castRemoved").replace("{n}", a.name));
}
function castSelect(id, clip){
  const nc = id && clip ? clip : null;
  if (typeof TL !== "undefined" && TL.pathMode && !(nc && CAST.selClip && nc.aid === CAST.selClip.aid && nc.ci === CAST.selClip.ci)) TL.pathMode = false;
  if (!(nc && CAST.selPt && CAST.selPt.aid === nc.aid && CAST.selPt.ci === nc.ci)) CAST.selPt = null;
  CAST.sel = id; CAST.selClip = nc;
  if (id && selectedIds.length){ selectedIds = []; renderSelection(); }
  if (id && typeof SETM !== "undefined" && SETM.sel){ SETM.sel = null; memoRefresh(); }
  if (id && typeof CAMS !== "undefined" && CAMS.sel){ CAMS.sel = null; camRender2D(); }
  updatePropPanel(); castRender2D(); cast3dSync(); if (typeof tlRender === "function") tlRender();
}
function castTargetClip(a){
  if (!a.clips.length) return -1;
  if (CAST.selClip && CAST.selClip.aid === a.id && a.clips[CAST.selClip.ci]) return CAST.selClip.ci;
  const c = castClipAt(a, CAST.t); if (c) return a.clips.indexOf(c);
  const j = a.clips.findIndex(x => x.t0 > CAST.t); return j >= 0 ? j : a.clips.length - 1;
}
function castMoveBegin(a){
  const ci = castTargetClip(a), c = a.clips[ci];
  if (!c || (ci === 0 && !c.at && !(c.pts && c.pts.length))) return { kind: "base", ox: a.x, oy: a.y };
  if (c.pts && c.pts.length){ const C = castChain(a)[ci]; c.pts = C.P.map(p => p.slice()); c.link = false; return { kind: "pts", c, o: c.pts.map(p => p.slice()) }; }
  if (!c.at){ const C = castChain(a)[ci]; c.at = [C.sx, C.sy, C.sr]; }
  return { kind: "at", c, o: c.at.slice() };
}
function castMoveApply(a, M, dx, dy){
  const cl = (x, y) => { const q = clampToBoard({ x, y }); return [Math.round(q.x), Math.round(q.y)]; };
  if (M.kind === "base"){ [a.x, a.y] = cl(M.ox + dx, M.oy + dy); }
  else if (M.kind === "pts"){ M.c.pts = M.o.map(p => cl(p[0] + dx, p[1] + dy)); if (M.c.link) M.c.link = false; }
  else { const q = cl(M.o[0] + dx, M.o[1] + dy); M.c.at = [q[0], q[1], M.o[2]]; }
}
function castSetRot(a, deg){
  const ci = castTargetClip(a), c = a.clips[ci];
  deg = ((deg % 360) + 360) % 360;
  if (c && c.pts && c.pts.length > 1) return;
  if (!c || (ci === 0 && !c.at && !c.pts)) a.rot = deg;
  else { if (!c.at){ const C = castChain(a)[ci]; c.at = [C.sx, C.sy, C.sr]; } c.at[2] = deg; }
}
function castRotate(id, step){
  const a = castGet(id); if (!a) return;
  const ci = castTargetClip(a), c = a.clips[ci], d = step || 45, wrap = v => ((v + d) % 360 + 360) % 360;
  if (c && c.pts && c.pts.length > 1){ showToast(t("pathRotNo")); return; }
  pushHistory();
  if (!c || (ci === 0 && !c.at && !c.pts)) a.rot = wrap(a.rot);
  else { if (!c.at){ const C = castChain(a)[ci]; c.at = [C.sx, C.sy, C.sr]; } c.at[2] = wrap(c.at[2] != null ? c.at[2] : 0); }
  castChanged();
}
function castChanged(){
  castRender2D(); cast3dSync(); castPanelRender();
  if (typeof tlRender === "function") tlRender();
}
function castSnap(){ return CAST.actors; }
function castAfterHist(list){
  CAST.actors = Array.isArray(list) ? list : []; CAST.selPt = null;
  if (CAST.sel && !castGet(CAST.sel)){ CAST.sel = null; CAST.selClip = null; }
  if (CAST.selClip && !(castGet(CAST.selClip.aid) || { clips: [] }).clips[CAST.selClip.ci]) CAST.selClip = null;
  castIdN = Math.max(castIdN, ...CAST.actors.map(a => (parseInt(String(a.id).slice(1)) || 0) + 1));
  cast3dBuild(); castChanged();
}

const castLayer = document.getElementById("cast-layer");
function castRender2D(){
  if (!castLayer) return;
  castLayer.innerHTML = "";
  const k = Math.max(1, planK()), R = CAST_R * k;
  const pathG = makeSvgEl("g", { class: "cast-paths" }); castLayer.appendChild(pathG);
  CAST.actors.forEach(a => {
    const st = castStateAt(a, CAST.t), ch = st.chain || [];
    ch.forEach((C, ci) => {
      const selC = CAST.selClip && CAST.selClip.aid === a.id && CAST.selClip.ci === ci;
      if (C.gap && C.jump){
        const prev = a.clips[ci - 1], hid = (a.clips[ci].t0 - clipEnd(prev)).toFixed(1);
        pathG.appendChild(makeSvgEl("line", { x1: C.px, y1: C.py, x2: C.sx, y2: C.sy, stroke: a.color, "stroke-width": 1.6 * k, "stroke-dasharray": `${2 * k} ${5 * k}`, "stroke-linecap": "round", opacity: 0.85 }));
        const ang = Math.atan2(C.sy - C.py, C.sx - C.px) * 180 / Math.PI;
        pathG.appendChild(makeSvgEl("path", { d: `M${-6 * k} ${-4 * k} L0 0 L${-6 * k} ${4 * k}`, fill: "none", stroke: a.color, "stroke-width": 1.6 * k, transform: `translate(${C.sx} ${C.sy}) rotate(${ang}) translate(${-R - 3 * k} 0)` }));
        const xm = 5 * k;
        pathG.appendChild(makeSvgEl("path", { d: `M${C.px - xm} ${C.py - xm} L${C.px + xm} ${C.py + xm} M${C.px + xm} ${C.py - xm} L${C.px - xm} ${C.py + xm}`, stroke: a.color, "stroke-width": 2 * k }));
        const lb = makeSvgEl("text", { x: (C.px + C.sx) / 2, y: (C.py + C.sy) / 2 - 5 * k, "font-size": 9 * k, fill: a.color, "text-anchor": "middle", stroke: PAL.board, "stroke-width": 3 * k, "paint-order": "stroke" });
        lb.textContent = t("pathHidden").replace("{s}", hid); pathG.appendChild(lb);
      }
      if (C.P && C.P.length > 1){
        pathG.appendChild(makeSvgEl("polyline", { points: C.P.map(p => p.join(",")).join(" "), fill: "none", stroke: a.color, "stroke-width": (selC ? 3.2 : 2) * k, "stroke-linejoin": "round", "stroke-linecap": "round", opacity: selC ? 1 : 0.55 }));
        const e = C.P[C.P.length - 1], d = pathDir(C.P, pathLen(C.P)), ang = Math.atan2(d[1], d[0]) * 180 / Math.PI;
        pathG.appendChild(makeSvgEl("path", { d: `M${-7 * k} ${-5 * k} L0 0 L${-7 * k} ${5 * k} Z`, fill: a.color, opacity: selC ? 1 : 0.55, transform: `translate(${e[0]} ${e[1]}) rotate(${ang})` }));
      }
      if (selC && a.clips[ci].pts) a.clips[ci].pts.forEach((p, pi) => {
        if (pi === 0 && a.clips[ci].link) return;
        const on = CAST.selPt && CAST.selPt.aid === a.id && CAST.selPt.ci === ci && CAST.selPt.pi === pi, ds = { "data-aid": a.id, "data-ci": ci, "data-pi": pi };
        pathG.appendChild(makeSvgEl("circle", Object.assign({ class: "path-pt", cx: p[0], cy: p[1], r: (on ? 7 : 5) * k, fill: on ? a.color : PAL.board, stroke: on ? PAL.sel : a.color, "stroke-width": (on ? 2.6 : 2.2) * k }, ds)));
        pathG.appendChild(makeSvgEl("circle", Object.assign({ class: "path-pt path-hit", cx: p[0], cy: p[1], r: 12 * k, fill: "transparent" }, ds)));
      });
    });
    const c = st.ci >= 0 ? a.clips[st.ci] : null, shown = st.shown;
    const g = makeSvgEl("g", { class: "cast-el", "data-aid": a.id, transform: `translate(${st.x} ${st.y})`, opacity: shown ? 1 : 0.38 });
    const body = makeSvgEl("g", { transform: `rotate(${st.rot})` });
    body.appendChild(makeSvgEl("path", { d: `M${-R * 0.55} ${R * 0.78} L${R * 0.55} ${R * 0.78} L0 ${R * 1.55} Z`, fill: a.color }));
    body.appendChild(makeSvgEl("circle", { cx: 0, cy: 0, r: R, fill: a.color, "fill-opacity": 0.92, stroke: "#0d1117", "stroke-width": 1.5 * k, "stroke-dasharray": shown ? "" : `${3 * k} ${2 * k}` }));
    g.appendChild(body);
    const init = makeSvgEl("text", { x: 0, y: 0.5, "font-size": 11 * k, "font-weight": 700, fill: "#10131a", "text-anchor": "middle", "dominant-baseline": "middle", "pointer-events": "none" });
    init.textContent = a.name.replace(/^.*\s/, "").slice(0, 2) || "?"; g.appendChild(init);
    const nm = makeSvgEl("text", { x: 0, y: -R - 4 * k, "font-size": 10.5 * k, "font-weight": 700, fill: a.color, "text-anchor": "middle", "pointer-events": "none", stroke: PAL.board, "stroke-width": 3 * k, "paint-order": "stroke" });
    nm.textContent = a.name; g.appendChild(nm);
    if (c){
      const act = makeSvgEl("text", { x: 0, y: R * 1.55 + 12 * k, "font-size": 9.5 * k, fill: PAL.ink, "text-anchor": "middle", "pointer-events": "none", stroke: PAL.board, "stroke-width": 3 * k, "paint-order": "stroke" });
      act.textContent = "▶ " + c.name; g.appendChild(act);
    }
    if (CAST.sel === a.id){
      g.appendChild(makeSvgEl("circle", { cx: 0, cy: 0, r: R + 6 * k, fill: "none", stroke: PAL.sel, "stroke-width": 1.5 * k, "stroke-dasharray": `${4 * k} ${3 * k}`, "pointer-events": "none" }));
    }
    castLayer.appendChild(g);
    if (CAST.sel === a.id && !(c && c.pts && c.pts.length > 1))
      spinHandle(castLayer, st.x, st.y, st.rot, R + 22 * k, k, deg => { castSetRot(a, deg); castRender2D(); cast3dSync(); });
  });
  if (typeof pathHintRender === "function") pathHintRender();
}
{ const r2 = render; render = function(){ r2(); castRender2D(); }; }

let castDrag = null;
svg.addEventListener("pointerdown", e => {
  if (e.button !== 0 || spaceHeld) return;
  const pt = screenToCanvas(e.clientX, e.clientY);
  if (currentTool === "actor"){
    e.stopImmediatePropagation(); e.preventDefault();
    const c = clampToBoard(pt); setTool("select"); castAdd(c.x, c.y); return;
  }
  const pp = e.target.closest && e.target.closest(".path-pt");
  if (pp){
    e.stopImmediatePropagation(); e.preventDefault();
    const a = castGet(pp.dataset.aid), c = a && a.clips[+pp.dataset.ci]; if (!c) return;
    CAST.selPt = { aid: a.id, ci: +pp.dataset.ci, pi: +pp.dataset.pi }; castRender2D(); if (typeof tlRender === "function") tlRender();
    castDrag = { a, pathPt: { c, i: +pp.dataset.pi }, sx: pt.x, sy: pt.y, o: c.pts[+pp.dataset.pi].slice(), moved: false };
    try { svg.setPointerCapture(e.pointerId); } catch(err){} return;
  }
  if (typeof TL !== "undefined" && TL.pathMode && currentTool === "select"){
    e.stopImmediatePropagation(); e.preventDefault();
    castPathAdd(clampToBoard(pt)); return;
  }
  if (e.target.closest && e.target.closest(".spin-handle")) return;
  const g = e.target.closest && e.target.closest(".cast-el");
  if (!g){ if (CAST.sel && currentTool === "select"){ CAST.sel = null; CAST.selClip = null; castRender2D(); cast3dSync(); castPanelRender(); if (typeof tlRender === "function") tlRender(); } return; }
  if (currentTool !== "select") return;
  e.stopImmediatePropagation(); e.preventDefault();
  const a = castGet(g.dataset.aid); if (!a) return;
  if (CAST.sel !== a.id) castSelect(a.id);
  castDrag = { a, sx: pt.x, sy: pt.y, moved: false };
  try { svg.setPointerCapture(e.pointerId); } catch(err){}
}, true);
svg.addEventListener("pointermove", e => {
  if (!castDrag || spinDrag) return;
  e.stopImmediatePropagation();
  const pt = screenToCanvas(e.clientX, e.clientY), D = castDrag;
  if (!D.moved){ if (Math.hypot(pt.x - D.sx, pt.y - D.sy) * scale < 3) return; D.moved = true; pushHistory(); if (!D.pathPt) D.M = castMoveBegin(D.a); }
  if (D.pathPt){
    const q = clampToBoard({ x: D.o[0] + pt.x - D.sx, y: D.o[1] + pt.y - D.sy });
    D.pathPt.c.pts[D.pathPt.i] = [Math.round(q.x), Math.round(q.y)]; if (D.pathPt.i === 0) D.pathPt.c.link = false;
  } else castMoveApply(D.a, D.M, pt.x - D.sx, pt.y - D.sy);
  castRender2D(); cast3dSync();
}, true);
const castDragEnd = e => {
  if (!castDrag) return; const D = castDrag; castDrag = null; if (e) e.stopImmediatePropagation();
  if (D.moved && D.pathPt){ castFitReps(D.a, D.pathPt.c); if (typeof castFixOverlaps === "function") castFixOverlaps(D.a); }
  castChanged();
};
svg.addEventListener("pointerup", castDragEnd, true); svg.addEventListener("pointercancel", castDragEnd, true);
svg.addEventListener("contextmenu", e => {
  const pp = e.target.closest && e.target.closest(".path-pt"); if (!pp) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const a = castGet(pp.dataset.aid), ci = +pp.dataset.ci, pi = +pp.dataset.pi; if (!a || !a.clips[ci]) return;
  CAST.sel = a.id; CAST.selClip = { aid: a.id, ci }; CAST.selPt = { aid: a.id, ci, pi }; castChanged(); updatePropPanel();
  ctxShow(e, [
    { label: t("cmPtDel"), danger: true, fn: () => castPathRemovePt() },
    { label: t("cmPathClear"), danger: true, fn: () => castPathClear() },
  ]);
}, true);
function castPathRemovePt(){
  const S = CAST.selPt, a = S && castGet(S.aid), c = a && a.clips[S.ci]; if (!c || !c.pts || !c.pts[S.pi]) { CAST.selPt = null; return; }
  pushHistory(); c.pts.splice(S.pi, 1); if (S.pi === 0) c.link = false;
  if (!c.pts.length || (c.pts.length === 1 && c.link)){ delete c.pts; delete c.link; }
  CAST.selPt = null;
  castFitReps(a, c); if (typeof castFixOverlaps === "function") castFixOverlaps(a);
  CAST.selClip = { aid: a.id, ci: a.clips.indexOf(c) };
  castChanged();
  showToast(t("ptRemoved"));
}
function castPathAdd(q){
  const S = CAST.selClip, a = S && castGet(S.aid), c = a && a.clips[S.ci]; if (!c) return;
  pushHistory();
  const P = [Math.round(q.x), Math.round(q.y)];
  const C0 = castChain(a)[S.ci];
  if (c.pts && C0.P && C0.P.length > 1){
    let best = -1, bd = 8 / scale;
    for (let i = 1; i < C0.P.length; i++){
      const A = C0.P[i - 1], B = C0.P[i], dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((q.x - A[0]) * dx + (q.y - A[1]) * dy) / L2));
      const d = Math.hypot(q.x - (A[0] + dx * u), q.y - (A[1] + dy * u)); if (d < bd && u > 0.02 && u < 0.98){ bd = d; best = i; }
    }
    if (best > 0){
      c.pts.splice(best, 0, P); CAST.selPt = { aid: a.id, ci: S.ci, pi: best };
      castFitReps(a, c); castFixOverlaps(a); CAST.selClip = { aid: a.id, ci: a.clips.indexOf(c) }; castChanged();
      showToast(t("ptInserted")); return;
    }
  }
  if (!c.pts || !c.pts.length){
    const C = castChain(a)[S.ci];
    if (C.gap || c.at){ c.pts = [P]; c.link = false; delete c.at; showToast(t("pathEnterSet")); }
    else { c.pts = [[Math.round(C.sx), Math.round(C.sy)], P]; c.link = true; delete c.at; }
  } else c.pts.push(P);
  castFitReps(a, c); castFixOverlaps(a);
  CAST.selClip = { aid: a.id, ci: a.clips.indexOf(c) };
  castChanged();
}
function castPathClear(){
  const S = CAST.selClip, a = S && castGet(S.aid), c = a && a.clips[S.ci]; if (!c || !c.pts) return;
  pushHistory(); delete c.pts; delete c.link; CAST.selPt = null; castChanged();
}

window.addEventListener("keydown", e => {
  if (APP.screen !== "set" || !CAST.sel || typingNow() || setKeysTo3d()) return;
  if (typeof SETM !== "undefined" && (SETM.sel || SETM.editing)) return;
  if (e.code === "Delete" && CAST.selClip) return;
  if (CAST.selClip && (e.code === "Backspace" || e.key === "Delete" || e.key === "Escape")) return;
  if (e.code === "Delete" || e.code === "Backspace" || e.key === "Delete"){ e.preventDefault(); e.stopImmediatePropagation(); castRemove(CAST.sel); }
  else if ((e.code === "KeyR" || e.key.toLowerCase() === "r") && !e.ctrlKey && !e.metaKey){ e.preventDefault(); e.stopImmediatePropagation(); castRotate(CAST.sel, e.shiftKey ? -45 : 45); }
  else if (e.key === "Escape"){ castSelect(null); }
}, true);

const castGroup = document.getElementById("cast-group"), castNameIn = document.getElementById("cast-name");
function castPanelRender(){
  const a = CAST.sel ? castGet(CAST.sel) : null;
  if (!a) return;
  if (document.activeElement !== castNameIn) castNameIn.value = a.name;
  document.getElementById("cast-dot").style.background = a.color;
  const n = a.clips.length;
  document.getElementById("cast-info").textContent = n ? t("castInfoClips").replace("{n}", n).replace("{a}", a.clips[0].t0.toFixed(1)).replace("{b}", clipEnd(a.clips[n - 1]).toFixed(1)) : t("castInfoNone");
}
{
  const u0 = updatePropPanel;
  updatePropPanel = function(){
    if (selectedIds.length && CAST.sel){ CAST.sel = null; CAST.selClip = null; castRender2D(); cast3dSync(); if (typeof tlRender === "function") tlRender(); }
    u0();
    const panel = document.getElementById("prop-panel"), a = CAST.sel ? castGet(CAST.sel) : null;
    panel.classList.toggle("cast-mode", !!a);
    if (a){ panel.classList.add("open"); document.getElementById("sel-title").textContent = t("selTitle") + " 🎭 " + a.name; castPanelRender(); }
  };
}
castNameIn.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Enter") castNameIn.blur(); });
castNameIn.addEventListener("change", () => {
  const a = castGet(CAST.sel), v = castNameIn.value.trim(); if (!a || !v || v === a.name) { castPanelRender(); return; }
  pushHistory(); a.name = v.slice(0, 24); castChanged(); updatePropPanel();
});
document.getElementById("cast-rot").addEventListener("click", () => castRotate(CAST.sel, 45));
document.getElementById("cast-del").addEventListener("click", () => castRemove(CAST.sel));

const CAST3D = { root: null, figs: {}, fk: {} };
function cast3dBuild(){
  if (typeof threeInited === "undefined" || !threeInited || !scene) return;
  if (CAST3D.root){ scene.remove(CAST3D.root); v3ClearScene(CAST3D.root); }
  SET3D.pickables = SET3D.pickables.filter(m => !m.userData.castId);
  CAST3D.figs = {};
  if (!CAST.actors.length){ CAST3D.root = null; SET3D.dirty = true; return; }
  const root = new THREE.Group(); CAST3D.root = root; scene.add(root);
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 10), sph = new THREE.SphereGeometry(1, 14, 10), ringG = new THREE.RingGeometry(0.3, 0.38, 32);
  const boneM = new THREE.MeshStandardMaterial({ color: FIG_COL.bone, roughness: 0.55 }), jointM = new THREE.MeshStandardMaterial({ color: FIG_COL.joint, roughness: 0.5 }), noseM = new THREE.MeshStandardMaterial({ color: FIG_COL.nose, roughness: 0.6 });
  CAST.actors.forEach(a => {
    const F = { group: new THREE.Group(), bones: [], joints: {} };
    const tag = m => { m.userData.castId = a.id; SET3D.pickables.push(m); return m; };
    for (const [ja, jb, r] of FIG_BONES){ const m = tag(new THREE.Mesh(cyl, boneM)); m.castShadow = true; m.userData.a = ja; m.userData.b = jb; m.userData.r = r; F.group.add(m); F.bones.push(m); }
    for (const id in FIG_JOINT_R){ const m = tag(new THREE.Mesh(sph, jointM)); m.scale.setScalar(FIG_JOINT_R[id]); m.castShadow = true; F.group.add(m); F.joints[id] = m; }
    F.head = tag(new THREE.Mesh(sph, boneM)); F.head.scale.setScalar(0.13); F.head.castShadow = true; F.group.add(F.head);
    F.nose = new THREE.Mesh(sph, noseM); F.nose.scale.setScalar(0.03); F.group.add(F.nose);
    const col = new THREE.Color(a.color);
    F.ringM = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.4, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false });
    F.ring = new THREE.Mesh(ringG, F.ringM); F.ring.rotation.x = -Math.PI / 2; F.ring.position.y = 0.012;
    F.place = new THREE.Group(); F.place.add(F.group); F.place.add(F.ring); root.add(F.place);
    CAST3D.figs[a.id] = F;
  });
  cast3dSync();
}
function cast3dSync(){
  if (!CAST3D.root) { if (typeof SET3D !== "undefined") SET3D.dirty = true; return; }
  CAST.actors.forEach(a => {
    const F = CAST3D.figs[a.id]; if (!F) return;
    const st = castStateAt(a, CAST.t), p = st.pose;
    F.place.position.set(toX(st.x), 0, toZ(st.y)); F.place.rotation.y = -st.rot * Math.PI / 180;
    F.group.visible = !!p;
    const sel = CAST.sel === a.id;
    F.ring.visible = (!!p || sel) && !(typeof REC !== "undefined" && REC.on) && !(typeof PV !== "undefined" && PV.on); F.ringM.opacity = p ? 0.9 : 0.35; F.ring.scale.setScalar(sel ? 1.3 : 1); F.ringM.emissiveIntensity = sel ? 0.75 : 0.4;
    if (!p) return;
    const fk = skFK(p, CAST3D.fk);
    for (const m of F.bones) figPlace(m, fk[m.userData.a].pos, fk[m.userData.b].pos, m.userData.r);
    for (const id in F.joints) F.joints[id].position.copy(fk[id].pos);
    F.head.position.copy(fk.headC.pos);
    F.nose.position.set(0, 0, 0.125).applyQuaternion(fk.head.q).add(fk.headC.pos);
  });
  SET3D.dirty = true;
}

const SCENE_FILE_NAME = "directors-desk-scene.json";
const r4 = v => Math.round(v * 1e4) / 1e4;
function castToObj(){
  return { kind: "dd-scene", version: 2, about: FILE_ABOUT.scene, name: CAST.sceneName || "", set: setName || "", skeleton: "dd-human-19", body: SK_BODY, unit: 40,
    ratio: typeof CAMS !== "undefined" ? CAMS.ratio : undefined,
    cameras: typeof camToObj === "function" ? camToObj() : undefined, activeCamera: (typeof camActive === "function" && camActive()) ? camActive().name : undefined,
    actors: CAST.actors.map(a => ({ name: a.name, color: a.color, x: a.x, y: a.y, rot: a.rot,
      clips: a.clips.map(c => ({ name: c.name, cat: c.cat, lib: c.lib || undefined, t0: r4(c.t0), reps: c.reps || 1, speed: c.speed || 1, duration: r4(c.dur), loop: !!c.loop,
        pts: c.pts && c.pts.length ? c.pts : undefined, link: c.link || undefined, at: c.at || undefined,
        keys: c.keys.map(k => ({ t: r4(k.t), ease: k.ease, pose: k.pose })) })) })) };
}
const castSig = () => JSON.stringify([CAST.sceneName, CAST.actors, typeof CAMS !== "undefined" ? [CAMS.list, CAMS.ratio] : 0, typeof CUTS !== "undefined" ? CUTS.list : 0, typeof SPD !== "undefined" ? SPD.list : 0]);
function castLoadObj(o, quiet){
  if (!o || o.kind !== "dd-scene" || !Array.isArray(o.actors)) return false;
  pushHistory();
  CAST.actors = o.actors.map((s, i) => ({ id: "a" + (castIdN++), name: String(s.name || t("castAuto") + " " + castLetter(i)).slice(0, 24), color: s.color || CAST_COLORS[i % CAST_COLORS.length],
    x: +s.x || 0, y: +s.y || 0, rot: +s.rot || 0,
    clips: (s.clips || []).map(c => Object.assign(packItemFromObj(c, c.name), { cat: c.cat || "user", t0: Math.max(0, +c.t0 || 0), reps: Math.max(1, Math.round(+c.reps || 1)), speed: +c.speed || 1 },
      c.lib && CAST_GAIT[c.lib] ? { lib: c.lib } : {},
      Array.isArray(c.pts) && c.pts.length ? { pts: c.pts.filter(p => Array.isArray(p) && isFinite(+p[0]) && isFinite(+p[1])).map(p => [+p[0], +p[1]]), link: !!c.link } : {},
      Array.isArray(c.at) && isFinite(+c.at[0]) ? { at: [+c.at[0], +c.at[1], c.at[2] != null ? +c.at[2] : null] } : {})) }));
  CAST.actors.forEach(castSortClips);
  CAST.sceneName = String(o.name || ""); const sn = document.getElementById("scene-name"); if (sn) sn.value = CAST.sceneName;
  CAST.sel = null; CAST.selClip = null; CAST.selPt = null; CAST.t = 0; CAST.playing = false;
  if (typeof camLoadArr === "function") camLoadArr(o.cameras, o.ratio, o.activeCamera);
  if (!quiet && o.set && o.set !== setName) showToast(t("sceneOtherSet").replace("{s}", o.set));
  cast3dBuild(); castChanged(); updatePropPanel();
  return true;
}
function sceneSave(){
  const fname = CAST.sceneName.trim() ? safeName(CAST.sceneName) + ".scene.json" : SCENE_FILE_NAME;
  saveTextFile(fname, JSON.stringify(castToObj(), null, 1));
  CAST.savedSig = castSig();
  fileCard("scene", fname, sceneDetail());
}
function sceneDetail(){ const n = CAST.actors.reduce((s, a) => s + a.clips.length, 0), k = typeof CAMS !== "undefined" ? CAMS.list.length : 0;
  return t("sumActors") + " " + CAST.actors.length + " · " + t("sumClips") + " " + n + (k ? " · " + t("sumCams") + " " + k : "") + " · " + castTotal().toFixed(1) + "s"; }

function castNear(x, y, DL){
  const L = curLabels();
  let best = null, bd = 40;
  elements.forEach(e => {
    if (e.type !== "door") return; const w = getEl(e.wallId); if (!w) return;
    const d = Math.hypot(w.x1 + (w.x2 - w.x1) * e.t - x, w.y1 + (w.y2 - w.y1) * e.t - y); if (d < bd){ bd = d; best = (DL && DL.get(e.id)) || doorName(e); }
  });
  if (best) return best;
  bd = 60;
  elements.forEach(e => {
    if (e.x === undefined || e.type === "door" || e.type === "window" || e.type === "zone" || MOUND_TYPES.includes(e.type)) return;
    const dx = Math.max(e.x - x, 0, x - (e.x + e.w)), dy = Math.max(e.y - y, 0, y - (e.y + e.h)), d = Math.hypot(dx, dy);
    if (d < bd){ bd = d; best = L[e.type] || e.type; }
  });
  return best;
}
function doorPos(e){ const w = getEl(e.wallId); return w ? { x: w.x1 + (w.x2 - w.x1) * e.t, y: w.y1 + (w.y2 - w.y1) * e.t } : null; }
function doorLabels(B){
  const ds = elements.filter(e => e.type === "door" && doorPos(e)), M = new Map();
  if (ds.length === 1){ M.set(ds[0].id, doorName(ds[0])); return M; }
  const side = {};
  ds.forEach(e => {
    const p = doorPos(e), dd = [["N", p.y - B.y0], ["S", B.y1 - p.y], ["W", p.x - B.x0], ["E", B.x1 - p.x]].sort((a, b) => a[1] - b[1])[0][0];
    (side[dd] = side[dd] || []).push({ e, p });
  });
  Object.entries(side).forEach(([k, L]) => {
    L.sort((a, b) => (k === "N" || k === "S") ? a.p.x - b.p.x : a.p.y - b.p.y);
    L.forEach((o, i) => M.set(o.e.id, t("side" + k) + " " + doorName(o.e) + (L.length > 1 ? " " + (i + 1) : "")));
  });
  return M;
}
function eulReul(w){
  if (currentLang !== "ko") return "";
  const ch = String(w).trim().slice(-1);
  if (/[0-9]/.test(ch)) return "2459".includes(ch) ? "를" : "을";
  const code = ch.charCodeAt(0); if (code < 0xAC00 || code > 0xD7A3) return "을";
  return (code - 0xAC00) % 28 === 0 ? "를" : "을";
}
function pathDoors(P){
  const out = [];
  elements.forEach(e => {
    if (e.type !== "door") return; const p = doorPos(e); if (!p) return;
    const r = doorW2D(e) / 2 + 10; let best = Infinity, at = 0, acc = 0;
    for (let i = 1; i < P.length; i++){
      const ax = P[i - 1][0], ay = P[i - 1][1], dx = P[i][0] - ax, dy = P[i][1] - ay, L2 = dx * dx + dy * dy, L = Math.sqrt(L2);
      let u = L2 ? ((p.x - ax) * dx + (p.y - ay) * dy) / L2 : 0; u = Math.max(0, Math.min(1, u));
      const d = Math.hypot(ax + dx * u - p.x, ay + dy * u - p.y); if (d < best){ best = d; at = acc + L * u; }
      acc += L;
    }
    const s = P[0], f = P[P.length - 1];
    if (best <= r && Math.hypot(s[0] - p.x, s[1] - p.y) > r + 10 && Math.hypot(f[0] - p.x, f[1] - p.y) > r + 10) out.push({ e, at });
  });
  return out.sort((a, b) => a.at - b.at).map(o => o.e);
}
function euro(w){
  if (currentLang !== "ko") return "";
  const ch = String(w).trim().slice(-1), code = ch.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return "으로";
  const jong = (code - 0xAC00) % 28;
  return (jong === 0 || jong === 8) ? "로" : "으로";
}
function castAiLines(out, B){
  if (!CAST.actors.length) return;
  out.push("", "[" + t("aiCast") + "]" + (CAST.sceneName ? " " + t("aiSceneName") + ": " + CAST.sceneName : ""));
  out.push(t("aiCastNote"));
  const DL = doorLabels(B);
  const where = (x, y) => { const n = castNear(x, y, DL); return areaWord(x, y, B) + (n ? " " + t("aiNear").replace("{o}", n) : ""); };
  CAST.actors.forEach(a => {
    const ch = castChain(a), x0 = ch.length ? ch[0].sx : a.x, y0 = ch.length ? ch[0].sy : a.y, r0 = ch.length ? ch[0].sr : a.rot, f = rot2(0, 1, r0);
    out.push(`- ${a.name} · ${t("aiStartAt")} ${where(x0, y0)} (x ${m1(x0 - B.x0)}m, y ${m1(y0 - B.y0)}m) · ` + t("aiFaces").replace("{d}", dirWord(f[0], f[1])));
    if (!a.clips.length){ out.push("    " + t("aiCastStand")); return; }
    a.clips.forEach((c, i) => {
      const C = ch[i], prev = a.clips[i - 1];
      if (C.gap) out.push("    " + t("aiOffscreen").replace("{s}", (c.t0 - clipEnd(prev)).toFixed(1)) + (C.jump ? " → " + t("aiReenter").replace("{w}", where(C.sx, C.sy)) : ""));
      let line = `${c.t0.toFixed(1)}–${clipEnd(c).toFixed(1)}${t("aiSec")} ${c.name}${(c.reps || 1) > 1 ? " ×" + c.reps : ""}`;
      if (C.P && C.P.length > 1){ const to = where(C.ex, C.ey), via = pathDoors(C.P).map(d => { const n = DL.get(d.id) || doorName(d); return t("aiViaDoor").replace("{d}", n).replace("{p}", eulReul(n)); });
        line += " — " + t("aiMove").replace("{a}", where(C.sx, C.sy) + via.map(v => " → " + v).join("")).replace("{b}", to).replace("{p}", euro(to)).replace("{m}", (pathLen(C.P) / 40).toFixed(1)); }
      else if (i > 0 && C.jump && !C.gap) line += " — " + where(C.sx, C.sy);
      out.push("    " + line);
    });
    const last = a.clips[a.clips.length - 1], E = ch[ch.length - 1];
    out.push("    " + t("aiExit").replace("{s}", clipEnd(last).toFixed(1)).replace("{w}", where(E.ex, E.ey)));
  });
}
onLangChange(() => { castRender2D(); castPanelRender(); });
