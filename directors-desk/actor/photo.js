"use strict";

const PHOTO = { on: false, el: null, wrap: null, x: 0, y: 0, w: 0, h: 0, ratio: 1, op: 0.55, drag: null, drsWas: true };

function photoBuild(){
  if (PHOTO.wrap) return;
  const host = document.getElementById("actor-view");
  const wrap = document.createElement("div"); wrap.id = "photo-wrap"; wrap.hidden = true;
  wrap.innerHTML = `<img id="photo-img" alt="">`;
  host.insertBefore(wrap, host.firstChild);
  const hs = document.createElement("div"); hs.id = "photo-handles"; hs.hidden = true;
  hs.innerHTML = `<div class="ph-h ph-move" data-h="move"></div>
    <div class="ph-h ph-c" data-h="nw"></div><div class="ph-h ph-c" data-h="ne"></div>
    <div class="ph-h ph-c" data-h="sw"></div><div class="ph-h ph-c" data-h="se"></div>`;
  host.appendChild(hs);
  PHOTO.wrap = wrap; PHOTO.el = wrap.querySelector("#photo-img"); PHOTO.hs = hs;
  hs.querySelectorAll(".ph-h").forEach(h => h.addEventListener("pointerdown", e => photoGrab(e, h.dataset.h)));
}

function photoOpenFile(file){
  if (!file) return;
  const rd = new FileReader();
  rd.onload = () => photoSet(rd.result);
  rd.readAsDataURL(file);
}
function photoSet(url){
  photoBuild();
  const im = new Image();
  im.onload = () => {
    PHOTO.ratio = im.naturalHeight ? im.naturalWidth / im.naturalHeight : 1;
    PHOTO.el.src = url;
    PHOTO.on = true; document.getElementById("photo-bar").hidden = false;
    const { r, top, bot } = photoBand(), band = bot - top;
    PHOTO.h = band; PHOTO.w = PHOTO.h * PHOTO.ratio;
    if (PHOTO.w > r.width - 40){ PHOTO.w = r.width - 40; PHOTO.h = PHOTO.w / PHOTO.ratio; }
    PHOTO.x = (r.width - PHOTO.w) / 2; PHOTO.y = top + (band - PHOTO.h) / 2;
    PHOTO.moved = false; PHOTO.op = 0.55;
    photoOn(true);
    showToastA(t("photoOpened"));
  };
  im.onerror = () => showToastA(t("photoBad"));
  im.src = url;
}
function photoOn(on){
  PHOTO.on = !!on;
  photoBuild();
  PHOTO.wrap.hidden = !PHOTO.on; PHOTO.hs.hidden = !PHOTO.on;
  document.getElementById("actor-screen").classList.toggle("photo-on", PHOTO.on);
  if (ACT.inited){
    ACT.scene.background = PHOTO.on ? null : new THREE.Color(STUDIO.bg);
    [ACT.floor, ACT.grid, ACT.tri].forEach(o => { if (o) o.visible = !PHOTO.on; });
    if (ACT.orbit) ACT.orbit.enableRotate = !PHOTO.on;
    if (PHOTO.on && ACT.viewKind !== "front" && ACT.viewKind !== "side") actorViewPreset("front");
    rig2dOn(PHOTO.on, ACT.viewKind === "side" ? "side" : ACT.viewKind === "top" ? "top" : "front");
  }
  if (typeof DRS !== "undefined"){
    if (PHOTO.on){ if (!PHOTO.drsHeld){ PHOTO.drsHeld = true; PHOTO.drsWas = DRS.on; } DRS.on = false; if (typeof drsSetScale === "function") drsSetScale(1); }
    else if (PHOTO.drsHeld){ PHOTO.drsHeld = false; DRS.on = PHOTO.drsWas; }
  }
  photoLayout(); photoBarRender();
}
function photoClear(){
  photoOn(false);
  if (PHOTO.el) PHOTO.el.removeAttribute("src");
}

function photoBand(){
  const r = document.getElementById("actor-view").getBoundingClientRect();
  const low = sel => { const e = document.querySelector(sel); return (e && !e.hidden && e.offsetParent !== null) ? e.getBoundingClientRect().bottom - r.top : 0; };
  const high = sel => { const e = document.querySelector(sel); return (e && !e.hidden && e.offsetParent !== null) ? e.getBoundingClientRect().top - r.top : r.height; };
  const top = Math.max(low("#actor-top"), low("#photo-bar")) + 16;
  return { r, top, bot: Math.max(top + 160, high("#motion-bar") - 16) };
}

function photoLayout(){
  if (!PHOTO.wrap || !PHOTO.on) return;
  const W = PHOTO.w, H = PHOTO.h, X = PHOTO.x, Y = PHOTO.y;
  Object.assign(PHOTO.el.style, { left: X + "px", top: Y + "px", width: W + "px", height: H + "px", opacity: PHOTO.op });
  const { r, top, bot } = photoBand();
  const cx = v => Math.max(14, Math.min(r.width - 14, v)), cy = v => Math.max(top, Math.min(bot, v));
  const put = (sel, x, y) => { const e = PHOTO.hs.querySelector(sel); if (e){ e.style.left = cx(x) + "px"; e.style.top = cy(y) + "px"; } };
  put('[data-h="nw"]', X, Y); put('[data-h="ne"]', X + W, Y);
  put('[data-h="sw"]', X, Y + H); put('[data-h="se"]', X + W, Y + H);
  put('[data-h="move"]', X - 20, Y + H / 2);
}
function photoGrab(e, kind){
  if (e.button !== 0) return;
  e.preventDefault(); e.stopPropagation();
  PHOTO.drag = { kind, sx: e.clientX, sy: e.clientY, x: PHOTO.x, y: PHOTO.y, w: PHOTO.w, h: PHOTO.h };
  e.target.setPointerCapture(e.pointerId);
}
window.addEventListener("pointermove", e => {
  const D = PHOTO.drag; if (!D) return;
  const dx = e.clientX - D.sx, dy = e.clientY - D.sy;
  if (D.kind === "move"){ PHOTO.x = D.x + dx; PHOTO.y = D.y + dy; }
  else {
    const sign = (D.kind === "nw" || D.kind === "ne") ? -1 : 1;
    const h = Math.max(60, D.h + dy * sign), w = h * PHOTO.ratio;
    PHOTO.h = h; PHOTO.w = w;
    if (D.kind === "nw" || D.kind === "sw") PHOTO.x = D.x + (D.w - w); else PHOTO.x = D.x;
    if (D.kind === "nw" || D.kind === "ne") PHOTO.y = D.y + (D.h - h); else PHOTO.y = D.y;
  }
  PHOTO.moved = true;
  photoLayout();
}, true);
window.addEventListener("pointerup", () => { PHOTO.drag = null; }, true);
window.addEventListener("pointercancel", () => { PHOTO.drag = null; }, true);

function photoBarRender(){
  const open = document.getElementById("photo-open"), bar = document.getElementById("photo-bar");
  if (!open || !bar) return;
  bar.hidden = !PHOTO.on;
  open.classList.toggle("on", PHOTO.on);
  const sl = document.getElementById("photo-op"); if (sl) sl.value = String(Math.round(PHOTO.op * 100));
}
const PHOTO_SAMPLE = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="640" viewBox="0 0 420 640">
   <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b3550"/><stop offset="1" stop-color="#6d5a3c"/></linearGradient></defs>
   <rect width="420" height="640" fill="url(#g)"/><circle cx="210" cy="430" r="150" fill="#d8a85e" opacity=".35"/>
   <g fill="#14161c"><circle cx="210" cy="150" r="30"/>
   <path d="M196 180h28l10 150h-48z"/><path d="M186 330h48l14 170h-26l-12-120-12 120h-26z"/>
   <path d="M200 192 L120 92 l-20 16 l80 116z"/><path d="M220 192 L300 92 l20 16 l-80 116z"/>
   <circle cx="104" cy="96" r="11"/><circle cx="316" cy="96" r="11"/></g></svg>`);

function photoBindUI(){
  const inp = document.getElementById("photo-input");
  document.getElementById("photo-open").addEventListener("click", () => inp.click());
  inp.addEventListener("change", e => { photoOpenFile(e.target.files[0]); e.target.value = ""; });
  document.getElementById("photo-sample").addEventListener("click", () => photoSet(PHOTO_SAMPLE));
  document.getElementById("photo-close").addEventListener("click", photoClear);
  document.getElementById("photo-op").addEventListener("input", e => { PHOTO.op = Math.max(0.1, Math.min(1, (+e.target.value || 55) / 100)); photoLayout(); });
  if (window.ResizeObserver) new ResizeObserver(photoLayout).observe(document.getElementById("actor-view"));
  photoBarRender();
}
onLangChange(photoBarRender);
