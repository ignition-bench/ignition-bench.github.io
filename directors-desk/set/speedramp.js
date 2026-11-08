"use strict";

const SPD = { list: [], sel: null, drag: null };
const SPD_X = [0.25, 0.5, 2, 4];
const SPD_MIN = 0.2, SPD_SNAP = 0.1;
const spdR = v => Math.round(v / SPD_SNAP) * SPD_SNAP;
const spd2 = v => Math.round(v * 100) / 100;

function spdAt(T){ for (const s of SPD.list) if (T >= s.t0 - 1e-9 && T < s.t1 - 1e-9) return s.x; return 1; }
function spdNextEdge(T, lim){ let b = lim; SPD.list.forEach(s => { if (s.t0 > T + 1e-9) b = Math.min(b, s.t0); if (s.t1 > T + 1e-9) b = Math.min(b, s.t1); }); return b; }
function spdAdvance(T, dt){
  for (let g = 0; dt > 1e-9 && g < 1000; g++){
    const x = spdAt(T), b = spdNextEdge(T, Infinity), need = (b - T) / x;
    if (dt < need) return T + dt * x;
    T = b; dt -= need;
  }
  return T;
}
function spdVideoLen(a, b){
  let v = 0, T = a;
  for (let g = 0; T < b - 1e-9 && g < 1000; g++){ const e = spdNextEdge(T, b); v += (e - T) / spdAt(T); T = e; }
  return v;
}

function spdTidy(){
  SPD.list = SPD.list.filter(s => isFinite(s.t0) && isFinite(s.t1) && SPD_X.includes(s.x));
  SPD.list.forEach(s => { s.t0 = Math.max(0, spd2(s.t0)); s.t1 = spd2(s.t1); });
  SPD.list.sort((a, b) => a.t0 - b.t0);
  for (let i = 1; i < SPD.list.length; i++){ const p = SPD.list[i - 1], s = SPD.list[i]; if (s.t0 < p.t1){ const L = s.t1 - s.t0; s.t0 = p.t1; s.t1 = s.t0 + L; } }
  SPD.list = SPD.list.filter(s => s.t1 - s.t0 >= SPD_MIN - 1e-6);
  if (SPD.sel && !SPD.list.includes(SPD.sel)) SPD.sel = null;
}
function spdChanged(){ spdTidy(); tlRender(); }
function spdRoom(s){
  const i = SPD.list.indexOf(s), p = SPD.list[i - 1], n = SPD.list[i + 1];
  return { lo: p ? p.t1 : 0, hi: n ? n.t0 : Math.max(TL.total, s.t1) };
}
function spdSelect(s){
  SPD.sel = s;
  if (s){
    if (typeof CUTS !== "undefined") CUTS.sel = null;
    if (CAST.sel || CAST.selClip){ CAST.sel = null; CAST.selClip = null; CAST.selPt = null; castRender2D(); }
  }
  tlRender();
}
function spdSetStart(s, v){
  if (!s || !isFinite(v)) return;
  const R = spdRoom(s), L = s.t1 - s.t0, t0 = Math.max(R.lo, Math.min(R.hi - L, spd2(v)));
  pushHistory(); s.t0 = t0; s.t1 = t0 + L; spdChanged();
}
function spdSetLen(s, v){
  if (!s || !isFinite(v)) return;
  const R = spdRoom(s);
  pushHistory(); s.t1 = Math.max(s.t0 + SPD_MIN, Math.min(R.hi, s.t0 + spd2(v))); spdChanged();
}
function spdSetX(s, x){ if (!s || !SPD_X.includes(x)) return; pushHistory(); s.x = x; spdChanged(); }
function spdRemove(s){
  if (!s) return;
  pushHistory(); SPD.list.splice(SPD.list.indexOf(s), 1); SPD.sel = null; spdChanged();
  if (typeof undoToastSet === "function") undoToastSet(t("spdRemoved"));
}
const spdWord = x => t(x < 1 ? "spdSlow" : "spdFast");

const spdRow = document.getElementById("tl-spd");
let helpSeenCuts = false;
try { helpSeenCuts = localStorage.getItem("dd-help-cuts") === "1"; } catch(e){}
function spdHelpBtn(kind){
  const b = document.createElement("button"); b.type = "button";
  b.className = "tl-help " + (kind === "cuts" ? "c-view" : "c-edit"); b.dataset.help = kind; b.textContent = "?";
  b.title = t(kind === "cuts" ? "helpCutsT" : "helpSpdT");
  if (kind === "cuts" && !helpSeenCuts && CAMS.list.length >= 2 && !CUTS.list.length) b.classList.add("blink");
  return b;
}
function spdRender(){
  spdRow.hidden = !TL.open;
  const cl = tlLabels.querySelector(".tl-cut-lab");
  if (cl && !cl.querySelector(".tl-help")) cl.appendChild(spdHelpBtn("cuts"));
  if (!TL.open) return;
  const lab = document.createElement("div"); lab.className = "tl-lab tl-spd-lab"; lab.title = t("spdRowTitle");
  const sp = document.createElement("span"); sp.textContent = t("spdRowLab"); lab.appendChild(sp); lab.appendChild(spdHelpBtn("spd"));
  const after = cl || tlLabels.querySelector(".tl-lab-head"); if (after) after.after(lab); else tlLabels.prepend(lab);
  spdRow.innerHTML = "";
  if (!SPD.list.length){ const g = document.createElement("div"); g.className = "tl-spd-ghost"; g.textContent = t("spdGhost"); spdRow.appendChild(g); }
  SPD.list.forEach((s, i) => {
    const b = document.createElement("div");
    b.className = "tl-spd-seg " + (s.x < 1 ? "slow" : "fast") + (SPD.sel === s ? " sel" : "");
    b.dataset.si = i;
    b.style.left = (s.t0 * TL.pps) + "px"; b.style.width = Math.max(8, (s.t1 - s.t0) * TL.pps - 1) + "px";
    b.textContent = "×" + s.x + " " + spdWord(s.x);
    b.title = s.t0.toFixed(1) + "–" + s.t1.toFixed(1) + "s ×" + s.x + " — " + t("spdSegTitle");
    ["l", "r"].forEach(k => { const h = document.createElement("i"); h.className = "tl-spd-edge " + k; h.dataset.edge = k; b.appendChild(h); });
    spdRow.appendChild(b);
  });
  const grp = document.getElementById("tl-spd-grp"), s = SPD.sel;
  grp.hidden = !s;
  if (s){
    const a = document.getElementById("tl-spd-t0"), l = document.getElementById("tl-spd-len"), x = document.getElementById("tl-spd-x");
    if (document.activeElement !== a) a.value = String(spd2(s.t0));
    if (document.activeElement !== l) l.value = String(spd2(s.t1 - s.t0));
    x.value = String(s.x);
  }
}
{ const r0 = tlRender;
  tlRender = function(){
    if (SPD.sel && (CAST.selClip || (typeof CUTS !== "undefined" && CUTS.sel))) SPD.sel = null;
    r0();
    spdRender();
  };
}

spdRow.addEventListener("pointerdown", e => {
  if (e.button !== 0) return;
  e.stopPropagation(); e.preventDefault();
  const b = e.target.closest(".tl-spd-seg"), T = tlTimeAt(e.clientX);
  if (b){
    const s = SPD.list[+b.dataset.si]; if (!s) return;
    const R = spdRoom(s);
    SPD.drag = { mode: e.target.dataset.edge || "move", s, x: e.clientX, o0: s.t0, o1: s.t1, R, moved: false };
    spdSelect(s);
  } else {
    let lo = 0, hi = TL.total;
    SPD.list.forEach(s => { if (s.t1 <= T + 1e-9) lo = Math.max(lo, s.t1); if (s.t0 >= T - 1e-9) hi = Math.min(hi, s.t0); });
    SPD.drag = { mode: "new", a: Math.max(lo, Math.min(hi, spdR(T))), x: e.clientX, lo, hi, s: null, moved: false };
  }
  try { spdRow.setPointerCapture(e.pointerId); } catch(err){}
});
spdRow.addEventListener("pointermove", e => {
  const D = SPD.drag; if (!D) return;
  const dx = e.clientX - D.x;
  if (!D.moved){ if (Math.abs(dx) < 4) return; D.moved = true; pushHistory(); }
  if (D.mode === "new"){
    const T = Math.max(D.lo, Math.min(D.hi, spdR(tlTimeAt(e.clientX))));
    if (!D.s){ D.s = { t0: D.a, t1: D.a, x: 0.5 }; SPD.list.push(D.s); SPD.list.sort((a, b) => a.t0 - b.t0); SPD.sel = D.s; if (typeof CUTS !== "undefined") CUTS.sel = null; CAST.selClip = null; }
    D.s.t0 = Math.min(D.a, T); D.s.t1 = Math.max(D.a, T);
  } else {
    const d = spdR(dx / TL.pps), s = D.s, R = D.R;
    if (D.mode === "move"){ const L = D.o1 - D.o0, t0 = Math.max(R.lo, Math.min(R.hi - L, D.o0 + d)); s.t0 = t0; s.t1 = t0 + L; }
    else if (D.mode === "l") s.t0 = Math.max(R.lo, Math.min(D.o1 - SPD_MIN, D.o0 + d));
    else s.t1 = Math.min(R.hi, Math.max(D.o0 + SPD_MIN, D.o1 + d));
  }
  tlRender();
});
const spdUp = e => {
  const D = SPD.drag; SPD.drag = null; if (!D) return;
  if (D.mode === "new" && !D.moved){ SPD.sel = null; tlRender(); castSetTime(tlTimeAt(e.clientX)); return; }
  if (D.mode === "new" && D.s && D.s.t1 - D.s.t0 < SPD_MIN - 1e-6){ SPD.list.splice(SPD.list.indexOf(D.s), 1); SPD.sel = null; if (undoStack.length) undoStack.pop(); tlRender(); return; }
  if (D.moved) spdChanged();
  if (D.mode === "new" && D.s) showToast(t("spdMade"));
};
spdRow.addEventListener("pointerup", spdUp); spdRow.addEventListener("pointercancel", spdUp);

["tl-spd-t0", "tl-spd-len"].forEach(id => {
  const el = document.getElementById(id);
  el.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Enter") el.blur(); });
  el.addEventListener("change", () => { if (id === "tl-spd-t0") spdSetStart(SPD.sel, +el.value); else spdSetLen(SPD.sel, +el.value); });
});
document.getElementById("tl-spd-x").addEventListener("change", e => spdSetX(SPD.sel, +e.target.value));
document.getElementById("tl-spd-del").addEventListener("click", () => spdRemove(SPD.sel));

window.addEventListener("keydown", e => {
  if (APP.screen !== "set" || typingNow() || !SPD.sel || e.ctrlKey || e.metaKey || e.altKey) return;
  if (typeof SETM !== "undefined" && (SETM.sel || SETM.editing)) return;
  if (e.code === "Delete" || e.code === "Backspace"){ e.preventDefault(); e.stopImmediatePropagation(); spdRemove(SPD.sel); }
  else if (e.key === "Escape"){ e.stopImmediatePropagation(); SPD.sel = null; tlRender(); }
}, true);

{ const s0 = camSnap; camSnap = function(){ const o = s0(); o.speeds = SPD.list.map(s => ({ t0: s.t0, t1: s.t1, x: s.x })); return o; }; }
{ const a0 = camAfterHist; camAfterHist = function(o){ SPD.list = o && Array.isArray(o.speeds) ? o.speeds.map(s => ({ t0: s.t0, t1: s.t1, x: s.x })) : []; SPD.sel = null; a0(o); spdTidy(); tlRender(); }; }
function spdToObj(){ return SPD.list.length ? SPD.list.map(s => ({ t0: spd2(s.t0), t1: spd2(s.t1), x: s.x })) : undefined; }
function spdLoadArr(arr){
  SPD.list = (Array.isArray(arr) ? arr : []).map(s => s && { t0: +s.t0, t1: +s.t1, x: +s.x }).filter(Boolean);
  SPD.sel = null; spdTidy(); tlRender();
}
{ const o0 = castToObj; castToObj = function(){ const o = o0(); o.version = 7; o.speeds = spdToObj(); return o; }; }
{ const l0 = castLoadObj; castLoadObj = function(o, quiet){ const ok = l0(o, quiet); if (ok) spdLoadArr(o.speeds); return ok; }; }
function spdAiLine(){
  if (!SPD.list.length) return "";
  return t("aiSpd") + " " + SPD.list.map(s => t("aiSpdSeg").replace("{a}", s.t0.toFixed(1)).replace("{b}", s.t1.toFixed(1)).replace("{w}", spdWord(s.x)).replace("{x}", s.x)).join(" · ");
}
{ const a0 = castAiLines; castAiLines = function(out, B){ const r = a0(out, B); const l = spdAiLine(); if (CAST.actors.length && l) out.push(l); return r; }; }

const helpCard = document.getElementById("tl-help-card");
function helpOpen(kind, btn){
  if (!helpCard.hidden && helpCard.dataset.kind === kind){ helpClose(); return; }
  helpCard.dataset.kind = kind;
  helpCard.className = kind === "cuts" ? "hc-view" : "hc-edit";
  document.getElementById("thc-title").textContent = t(kind === "cuts" ? "helpCutsT" : "helpSpdT");
  document.getElementById("thc-body").innerHTML = t(kind === "cuts" ? "helpCutsB" : "helpSpdB");
  helpCard.hidden = false;
  const r = btn.getBoundingClientRect(), W = helpCard.offsetWidth, H = helpCard.offsetHeight;
  helpCard.style.left = Math.max(8, Math.min(innerWidth - W - 8, r.left)) + "px";
  helpCard.style.top = Math.max(8, r.top - H - 8) + "px";
  if (kind === "cuts" && !helpSeenCuts){ helpSeenCuts = true; try { localStorage.setItem("dd-help-cuts", "1"); } catch(e){} tlLabels.querySelectorAll(".tl-help.blink").forEach(b => b.classList.remove("blink")); }
}
function helpClose(){ helpCard.hidden = true; }
tlLabels.addEventListener("click", e => { const b = e.target.closest(".tl-help"); if (!b) return; e.stopPropagation(); helpOpen(b.dataset.help, b); });
document.getElementById("thc-x").addEventListener("click", helpClose);
document.addEventListener("pointerdown", e => { if (!helpCard.hidden && !helpCard.contains(e.target) && !e.target.closest(".tl-help")) helpClose(); }, true);
window.addEventListener("keydown", e => { if (e.key === "Escape" && !helpCard.hidden){ e.stopImmediatePropagation(); helpClose(); } }, true);
onLangChange(() => { if (!helpCard.hidden) helpClose(); });
