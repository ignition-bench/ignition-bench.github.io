"use strict";

const APP = { screen: "start" };
const SCREEN_HOOKS = { enter: {}, leave: {} };
function onScreen(name, enterFn, leaveFn){ if (enterFn) SCREEN_HOOKS.enter[name] = enterFn; if (leaveFn) SCREEN_HOOKS.leave[name] = leaveFn; }

function showScreen(name){
  const prev = APP.screen;
  if (prev !== name && SCREEN_HOOKS.leave[prev]) SCREEN_HOOKS.leave[prev]();
  APP.screen = name;
  document.getElementById("start-screen").hidden = name !== "start";
  document.getElementById("actor-screen").hidden = name !== "actor";
  document.getElementById("set-screen").hidden = name !== "set";
  if (name === "start") renderRecent();
  if (SCREEN_HOOKS.enter[name]) SCREEN_HOOKS.enter[name]();
  if (typeof renderPerfPanel === "function") renderPerfPanel();
  if (typeof flowRender === "function") flowRender();
  if (typeof learnEnter === "function") learnEnter(name);
}

const AUTOSAVE_KEY = { set: "dd-autosave-set", actor: "dd-autosave-pose" };
function autosaveWrite(kind, json, summary){
  try { localStorage.setItem(AUTOSAVE_KEY[kind], JSON.stringify({ t: Date.now(), summary, json })); } catch(e){}
}
function autosaveRead(kind){
  try { const v = JSON.parse(localStorage.getItem(AUTOSAVE_KEY[kind])); return v && v.json ? v : null; } catch(e){ return null; }
}
const AUTOSAVE_SRC = {};
function autosaveRegister(kind, getFn){ AUTOSAVE_SRC[kind] = { get: getFn, last: null }; }
function autosaveTick(){
  for (const kind in AUTOSAVE_SRC){
    const S = AUTOSAVE_SRC[kind];
    if (APP.screen !== kind) continue;
    let cur; try { cur = S.get(); } catch(e){ continue; }
    if (!cur || cur.json === S.last) continue;
    S.last = cur.json; autosaveWrite(kind, cur.json, cur.summary);
  }
}
setInterval(autosaveTick, 3000);
window.addEventListener("beforeunload", autosaveTick);

document.addEventListener("click", e => { const b = e.target.closest && e.target.closest("button"); if (b) setTimeout(() => b.blur(), 0); });
document.addEventListener("change", e => { if (e.target.tagName === "SELECT") setTimeout(() => e.target.blur(), 0); });
const SPACE_PAN = { held: false, getters: [], active: null };
function spacePanRegister(getOrbit){ SPACE_PAN.getters.push(getOrbit); }
const isTyping = () => { const a = document.activeElement; return a && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && a.type !== "range" && a.type !== "file")); };
window.addEventListener("keydown", e => {
  if (e.code !== "Space" || isTyping()) return;
  const a = document.activeElement;
  if (a && (a.tagName === "BUTTON" || a.tagName === "SELECT")) e.preventDefault();
  if (SPACE_PAN.held) { e.preventDefault(); return; }
  for (const g of SPACE_PAN.getters){
    const o = g(); if (!o || !o.enabled) continue;
    e.preventDefault();
    SPACE_PAN.held = true; SPACE_PAN.active = o; o.mouseButtons.LEFT = THREE.MOUSE.PAN;
    if (V3.renderer) V3.renderer.domElement.style.cursor = "grab";
    break;
  }
}, true);
function spacePanRelease(){
  if (!SPACE_PAN.held) return;
  SPACE_PAN.held = false;
  if (SPACE_PAN.active) SPACE_PAN.active.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
  SPACE_PAN.active = null;
  if (V3.renderer) V3.renderer.domElement.style.cursor = "";
}
window.addEventListener("keyup", e => {
  if (e.code !== "Space") return;
  const a = document.activeElement;
  if (a && (a.tagName === "BUTTON" || a.tagName === "SELECT")) e.preventDefault();
  spacePanRelease();
}, true);
window.addEventListener("blur", spacePanRelease);
const SPACE_TAP = { down: false, t: 0, moved: false, fns: [] };
function spaceTapRegister(fn){ SPACE_TAP.fns.push(fn); }
const tapTyping = () => { const a = document.activeElement; return !!a && (a.tagName === "TEXTAREA" || a.isContentEditable || (a.tagName === "INPUT" && !/^(range|file|checkbox|radio|button)$/.test(a.type))); };
const tapFocusKeep = () => { const a = document.activeElement; return !!a && (a.tagName === "BUTTON" || a.tagName === "SELECT" || (a.tagName === "INPUT" && /^(range|checkbox|radio|button)$/.test(a.type))); };
window.addEventListener("keydown", e => {
  if (e.code !== "Space" || tapTyping()) return;
  if (tapFocusKeep()) e.preventDefault();
  if (e.repeat || SPACE_TAP.down) return;
  SPACE_TAP.down = true; SPACE_TAP.t = performance.now(); SPACE_TAP.moved = false;
}, true);
window.addEventListener("pointerdown", () => { if (SPACE_TAP.down) SPACE_TAP.moved = true; }, true);
window.addEventListener("wheel", () => { if (SPACE_TAP.down) SPACE_TAP.moved = true; }, { capture: true, passive: true });
window.addEventListener("keyup", e => {
  if (e.code !== "Space") return;
  const was = SPACE_TAP.down; SPACE_TAP.down = false;
  if (tapTyping()) return;
  if (tapFocusKeep()) e.preventDefault();
  if (!was || SPACE_TAP.moved || performance.now() - SPACE_TAP.t > 600 || e.ctrlKey || e.metaKey || e.altKey) return;
  for (const f of SPACE_TAP.fns){ try { if (f()) break; } catch(err){ console.warn(err); } }
}, true);
window.addEventListener("blur", () => { SPACE_TAP.down = false; });

const RECENT_OPEN = {};
function onRecentOpen(kind, fn){ RECENT_OPEN[kind] = fn; }
function agoText(t){
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return t_("agoNow");
  if (m < 60) return m + t_("agoMin");
  const h = Math.round(m / 60); if (h < 24) return h + t_("agoHour");
  return Math.round(h / 24) + t_("agoDay");
}
function renderRecent(){
  const box = document.getElementById("recent-list"); if (!box) return;
  box.innerHTML = "";
  let n = 0;
  for (const kind of ["actor", "set"]){
    const a = autosaveRead(kind); if (!a) continue;
    const b = document.createElement("button"); b.type = "button"; b.className = "recent-item";
    b.innerHTML = `<b></b><span></span>`;
    b.querySelector("b").textContent = (kind === "set" ? "🎬 " + t("menuSetShort") : "🎭 " + t("menuActorShort"));
    b.querySelector("span").textContent = (a.summary || "") + " · " + agoText(a.t);
    b.addEventListener("click", ()=>{ showScreen(kind); if (RECENT_OPEN[kind]) RECENT_OPEN[kind](a.json); });
    box.appendChild(b); n++;
  }
  document.getElementById("recent-none").hidden = n > 0;
}
window.addEventListener("message", e => { if (window.DD_PAGE === "edit") return; const d = e.data; if (d && d.dd === "show" && ["start", "actor", "set"].includes(d.screen) && document.getElementById("start-screen")) showScreen(d.screen); });
function appStart(){
  document.getElementById("menu-actor").addEventListener("click", ()=> showScreen("actor"));
  document.getElementById("menu-set").addEventListener("click", ()=> showScreen("set"));
  const me = document.getElementById("menu-edit"); if (me){ me.disabled = false; me.addEventListener("click", ()=> flowGo("edit")); }
  document.getElementById("start-lang").addEventListener("click", toggleLang);
  document.querySelectorAll(".home-btn").forEach(b=> b.addEventListener("click", ()=> showScreen("start")));
  onLangChange(()=>{ if (APP.screen === "start") renderRecent(); const sl = document.getElementById("start-lang"); if (sl) sl.textContent = langLabel(); });
  const h = (location.hash || "").slice(1);
  showScreen(h === "actor" || h === "set" ? h : "start");
}
