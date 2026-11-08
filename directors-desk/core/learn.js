"use strict";

const LEARN_KEY = "dd-level", LEARN_TUT_SEEN = "dd-tut-seen", LEARN_LAST = "dd-actor-last";
const LEARN_AWAY_DAYS = 14;
const lsGet = k => { try { return localStorage.getItem(k); } catch(e){ return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch(e){} };
const LEARN = { level: lsGet(LEARN_KEY) === "expert" ? "expert" : "beginner", chosen: !!lsGet(LEARN_KEY) };
const learnBeginner = () => LEARN.level === "beginner";

function learnSetLevel(v){
  LEARN.level = v === "expert" ? "expert" : "beginner"; LEARN.chosen = true; lsSet(LEARN_KEY, LEARN.level);
  if (LEARN.level === "beginner") lsSet(LEARN_TUT_SEEN, null);
  learnApply();
}
function learnApply(){
  document.body.classList.toggle("lv-expert", LEARN.level === "expert");
  const b = document.getElementById("lv-beginner"), e = document.getElementById("lv-expert"), d = document.getElementById("level-desc");
  if (!b) return;
  b.classList.toggle("on", LEARN.level === "beginner"); e.classList.toggle("on", LEARN.level === "expert");
  d.textContent = t(LEARN.level === "expert" ? "lvDescExpert" : "lvDescBeginner");
  if (LEARN.level === "expert") tipHide();
}

function learnEnter(name){
  if (name !== "actor") return;
  const last = +lsGet(LEARN_LAST) || 0; lsSet(LEARN_LAST, String(Date.now()));
  if (!learnBeginner()) return;
  setTimeout(() => {
    if (APP.screen !== "actor" || typeof tutStart !== "function" || TUT.on || TUT.menu) return;
    if (!lsGet(LEARN_TUT_SEEN)){ lsSet(LEARN_TUT_SEEN, "1"); tutStart(0); return; }
    if (last && Date.now() - last > LEARN_AWAY_DAYS * 864e5) learnNudge();
  }, 450);
}
function learnNudge(){
  let el = document.getElementById("learn-nudge");
  if (!el){
    el = document.createElement("div"); el.id = "learn-nudge";
    el.innerHTML = `<span></span><button type="button" class="ln-go c-make"></button><button type="button" class="ln-no"></button>`;
    document.getElementById("actor-screen").appendChild(el);
    el.querySelector(".ln-go").addEventListener("click", () => { el.hidden = true; tutMenu(); });
    el.querySelector(".ln-no").addEventListener("click", () => { el.hidden = true; });
  }
  el.querySelector("span").textContent = t("learnNudge");
  el.querySelector(".ln-go").textContent = t("learnNudgeGo");
  el.querySelector(".ln-no").textContent = t("learnNudgeNo");
  el.hidden = false; clearTimeout(learnNudge._t); learnNudge._t = setTimeout(() => { el.hidden = true; }, 12000);
}

const TIP = { el: null, target: null, timer: 0, saved: null };
function tipEl(){
  if (!TIP.el){ TIP.el = document.createElement("div"); TIP.el.id = "tip-bubble"; TIP.el.hidden = true; TIP.el.innerHTML = "<b></b><span></span>"; document.body.appendChild(TIP.el); }
  return TIP.el;
}
function tipHide(){
  clearTimeout(TIP.timer);
  if (TIP.target && TIP.saved != null && !TIP.target.getAttribute("title")) TIP.target.setAttribute("title", TIP.saved);
  TIP.target = null; TIP.saved = null;
  if (TIP.el) TIP.el.hidden = true;
}
function tipShow(el){
  const text = el.getAttribute("title"); if (!text) return;
  const E = tipEl();
  const label = el.dataset.tip ? t(el.dataset.tip) : el.tagName === "SELECT" ? "" : (el.textContent || "").replace(/\s+/g, " ").trim();
  E.querySelector("b").textContent = label.length > 1 && label.length <= 40 ? label : "";
  E.querySelector("b").hidden = !E.querySelector("b").textContent;
  E.querySelector("span").textContent = text;
  TIP.saved = text; el.removeAttribute("title");
  const cs = getComputedStyle(el), col = cs.borderTopColor;
  E.style.borderColor = col && col !== "rgba(0, 0, 0, 0)" && cs.borderTopWidth !== "0px" ? col : "";
  E.hidden = false;
  const r = el.getBoundingClientRect(), w = E.offsetWidth, h = E.offsetHeight, vw = innerWidth;
  let x = r.left + r.width / 2 - w / 2; x = Math.max(8, Math.min(vw - w - 8, x));
  let y = r.top - h - 8; if (y < 8) y = r.bottom + 8;
  E.style.left = x + "px"; E.style.top = y + "px";
}
document.addEventListener("mouseover", e => {
  const el = e.target.closest && e.target.closest("button[title], select[title], .sb-link[title]");
  if (el === TIP.target) return;
  const quick = !!(el && el.dataset.tip);
  if (!learnBeginner() && !quick){ if (TIP.target) tipHide(); return; }
  tipHide();
  if (!el || el.disabled) return;
  TIP.target = el; TIP.timer = setTimeout(() => { if (TIP.target === el) tipShow(el); }, quick ? 150 : 500);
});
document.addEventListener("mouseout", e => { if (TIP.target && !(e.relatedTarget && TIP.target.contains(e.relatedTarget))) tipHide(); });
document.addEventListener("mousedown", tipHide, true);
window.addEventListener("scroll", tipHide, true);
window.addEventListener("blur", tipHide);

document.getElementById("lv-beginner").addEventListener("click", () => learnSetLevel("beginner"));
document.getElementById("lv-expert").addEventListener("click", () => learnSetLevel("expert"));
onLangChange(learnApply);
learnApply();
