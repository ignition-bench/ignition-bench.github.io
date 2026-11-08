"use strict";

const SM = { open: false, id: null, sel: null, before: null, drag: null, adding: false };
const SM_FONT = { s: 12, m: 15, l: 20 };
const SM_CAP_W = 1280;
const SM_BOX_W = 0.26;
let smIdN = 1;
function edScNewId(){ return "s" + (smIdN++); }
function smNoteFrom(n){
  const c = v => Math.max(0, Math.min(1, +v || 0));
  return { id: "n" + (smIdN++), x: c(n.x), y: c(n.y), bx: c(n.bx), by: c(n.by), bw: Math.max(0.12, Math.min(0.6, +n.bw || SM_BOX_W)), text: String(n.text || ""),
    size: SM_FONT[n.size] ? n.size : "m", align: ["left", "center", "right"].includes(n.align) ? n.align : "left" };
}
const smGet = () => edScGet(SM.id);
const smNote = id => { const c = smGet(); return c && c.notes.find(n => n.id === id); };

function smCapture(direct){
  if (!ED.name){ showToast(t("edNoVideo")); return; }
  V.pause();
  if (!direct && (ED.thumbBusy || ED.thumbRestore != null || V.seeking)){ edSceneAt(ED.thumbRestore != null ? ED.thumbRestore : V.currentTime); return; }
  if (V.readyState < 2 || V.seeking || !V.videoWidth){ showToast(t("edSceneNoFrame")); return; }
  const w = Math.min(SM_CAP_W, V.videoWidth), h = Math.round(w * V.videoHeight / V.videoWidth);
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  let img = "";
  try { cv.getContext("2d").drawImage(V, 0, 0, w, h); img = cv.toDataURL("image/jpeg", 0.86); } catch(e){ showToast(t("edSceneNoFrame")); return; }
  edPush();
  const c = { id: edScNewId(), t: +(V.currentTime || 0).toFixed(2), img, text: "", who: edWho(), notes: [] };
  ED.scenes.push(c); ED.scenes.sort((a, b) => a.t - b.t);
  ED.sel = c.id; edSetTab("scene", true); edRenderAll();
  showToast(t("edSceneMade").replace("{t}", edFmt(c.t)));
  smOpen(c.id, true);
}

const smEl = $e("sm-modal"), smPic = $e("sm-pic"), smImg = $e("sm-img"), smNotesEl = $e("sm-notes"), smLines = $e("sm-lines");
function smOpen(id, fresh){
  const c = edScGet(id); if (!c) return;
  V.pause();
  SM.open = true; SM.id = id; SM.sel = null; SM.before = fresh ? null : edSnap(); smSetAdding(false);
  SM.beforeSig = edSig();
  smImg.src = c.img;
  smEl.hidden = false;
  smRender();
  if (smImg.complete) smRender(); else smImg.onload = smRender;
}
function smClose(){
  if (!SM.open) return;
  if (document.activeElement && smEl.contains(document.activeElement)) document.activeElement.blur();
  const c = smGet(); if (c) c.notes = c.notes.filter(n => n.text.trim() || n.keep);
  if (c) c.notes.forEach(n => { delete n.keep; });
  if (SM.before && edSig() !== SM.beforeSig){ ED.undo.push(SM.before); ED.redo = []; }
  SM.open = false; SM.id = null; SM.sel = null; SM.before = null; smSetAdding(false); smEl.hidden = true;
  edRenderAll();
}
$e("sm-close").addEventListener("click", smClose);
smEl.addEventListener("pointerdown", e => { if (e.target === smEl) smClose(); });

function smRender(){
  const c = smGet(); if (!c) return;
  $e("sm-when").textContent = ED.name + " · " + edFmt(c.t);
  $e("sm-band").textContent = ED.name + "  ·  " + edFmt(c.t);
  const st = $e("sm-stars"); st.replaceWith(Object.assign(edStarsEl(c, smRender), { id: "sm-stars" }));
  smNotesEl.innerHTML = "";
  const W = smPic.clientWidth || 960, k = W / 960;
  c.notes.forEach(n => {
    const b = document.createElement("div"); b.className = "sm-note" + (n.id === SM.sel ? " sel" : "") + (c.star ? " s" + c.star : ""); b.dataset.id = n.id;
    b.style.left = (n.bx * 100) + "%"; b.style.top = (n.by * 100) + "%"; b.style.width = (n.bw * 100) + "%";
    b.innerHTML = `<div class="sm-grip" title="${t("smGripTip")}">⠿</div><textarea rows="1"></textarea><span class="sm-rs" title="${t("smResizeTip")}"></span>`;
    const ta = b.querySelector("textarea"); ta.value = n.text; ta.placeholder = t("smNotePh");
    ta.style.fontSize = Math.max(10, Math.round(SM_FONT[n.size] * k)) + "px"; ta.style.textAlign = n.align;
    const fit = () => { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; smLinesRender(); };
    ta.addEventListener("input", () => { n.text = ta.value; fit(); edDirtyUi(); });
    ta.addEventListener("focus", () => smSelect(n.id, true));
    ta.addEventListener("keydown", e => {
      e.stopPropagation();
      if (e.key === "Escape"){ e.preventDefault(); ta.blur(); }
      else if ((e.key === "Delete" || e.key === "Backspace") && !ta.value){ e.preventDefault(); smDel(n.id); }
    });
    b.querySelector(".sm-grip").addEventListener("pointerdown", e => smDragStart(e, n, "box"));
    b.querySelector(".sm-rs").addEventListener("pointerdown", e => smDragStart(e, n, "size"));
    smNotesEl.appendChild(b);
    const dot = document.createElement("div"); dot.className = "sm-dot" + (n.id === SM.sel ? " sel" : ""); dot.dataset.id = n.id;
    dot.style.left = (n.x * 100) + "%"; dot.style.top = (n.y * 100) + "%";
    dot.addEventListener("pointerdown", e => smDragStart(e, n, "dot"));
    smNotesEl.appendChild(dot);
    requestAnimationFrame(fit);
  });
  smLinesRender(); smToolsUi();
}
function smNearOnBox(n, boxH){
  const x0 = n.bx, x1 = n.bx + n.bw, y0 = n.by, y1 = n.by + boxH;
  return [Math.max(x0, Math.min(x1, n.x)), Math.max(y0, Math.min(y1, n.y))];
}
function smLinesRender(){
  const c = smGet(); if (!c) return;
  const W = smPic.clientWidth || 1, H = smPic.clientHeight || 1;
  smLines.setAttribute("viewBox", `0 0 ${W} ${H}`); smLines.innerHTML = "";
  c.notes.forEach(n => {
    const b = smNotesEl.querySelector(`.sm-note[data-id="${n.id}"]`); const bh = b ? b.offsetHeight / H : 0.08;
    const [ex, ey] = smNearOnBox(n, bh);
    const l = document.createElementNS("http://www.w3.org/2000/svg", "line");
    l.setAttribute("x1", n.x * W); l.setAttribute("y1", n.y * H); l.setAttribute("x2", ex * W); l.setAttribute("y2", ey * H);
    l.setAttribute("class", "sm-line" + (n.id === SM.sel ? " sel" : "")); smLines.appendChild(l);
  });
}
function smSelect(id, keepFocus){
  SM.sel = id;
  smNotesEl.querySelectorAll(".sm-note, .sm-dot").forEach(el => el.classList.toggle("sel", el.dataset.id === id));
  smLines.querySelectorAll(".sm-line").forEach((l, i) => { const c = smGet(); l.classList.toggle("sel", !!c && c.notes[i] && c.notes[i].id === id); });
  smToolsUi();
  if (!keepFocus && id){ const ta = smNotesEl.querySelector(`.sm-note[data-id="${id}"] textarea`); if (ta) ta.focus(); }
}
function smToolsUi(){
  const n = smNote(SM.sel); $e("sm-note-tools").hidden = !n; $e("sm-hint").hidden = !!n && !SM.adding;
  $e("sm-hint").textContent = t(SM.adding ? "smAddOn" : "smHint2"); $e("sm-hint").classList.toggle("on", SM.adding);
  if (!n) return;
  $e("sm-size").querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.v === n.size));
  $e("sm-align").querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.v === n.align));
}

function smAdd(x, y){
  const c = smGet(); if (!c) return;
  const bx = Math.max(0.01, Math.min(1 - SM_BOX_W - 0.01, x + (x > 0.62 ? -SM_BOX_W - 0.06 : 0.06)));
  const by = Math.max(0.01, Math.min(0.86, y - 0.14));
  const n = smNoteFrom({ x, y, bx, by, bw: SM_BOX_W, text: "", size: "m", align: "left" });
  c.notes.push(n); smRender(); smSelect(n.id);
  edDirtyUi();
  return n;
}
function smSetAdding(on){ SM.adding = !!on; $e("sm-add").classList.toggle("on", SM.adding); smPic.classList.toggle("adding", SM.adding); smToolsUi(); }
smPic.addEventListener("pointerdown", e => {
  if (e.button !== 0 || e.target.closest(".sm-note") || e.target.closest(".sm-dot")) return;
  e.preventDefault();
  if (document.activeElement && smEl.contains(document.activeElement)) document.activeElement.blur();
  if (!SM.adding){ smSelect(null, true); return; }
  const r = smPic.getBoundingClientRect();
  smSetAdding(false);
  smAdd((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
});
function smDragStart(e, n, what){
  if (e.button !== 0) return;
  e.preventDefault(); e.stopPropagation();
  if (document.activeElement && smEl.contains(document.activeElement)) document.activeElement.blur();
  smSelect(n.id, true);
  const r = smPic.getBoundingClientRect();
  SM.drag = { n, what, x0: e.clientX, y0: e.clientY, o: what === "box" ? [n.bx, n.by] : what === "size" ? [n.bw] : [n.x, n.y], W: r.width, H: r.height };
  e.target.setPointerCapture(e.pointerId);
  e.target.addEventListener("pointermove", smDragMove);
  e.target.addEventListener("pointerup", smDragEnd, { once: true });
  e.target.addEventListener("pointercancel", smDragEnd, { once: true });
}
function smDragMove(e){
  const D = SM.drag; if (!D) return;
  const dx = (e.clientX - D.x0) / D.W, dy = (e.clientY - D.y0) / D.H, n = D.n;
  if (D.what === "box"){ n.bx = Math.max(0, Math.min(1 - n.bw, D.o[0] + dx)); n.by = Math.max(0, Math.min(0.95, D.o[1] + dy)); }
  else if (D.what === "size"){ n.bw = Math.max(0.12, Math.min(0.6, 1 - n.bx, D.o[0] + dx)); const b = smNotesEl.querySelector(`.sm-note[data-id="${n.id}"]`); if (b){ b.style.width = (n.bw * 100) + "%"; const ta = b.querySelector("textarea"); ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; } }
  else { n.x = Math.max(0, Math.min(1, D.o[0] + dx)); n.y = Math.max(0, Math.min(1, D.o[1] + dy)); }
  const b = smNotesEl.querySelector(`.sm-note[data-id="${n.id}"]`), d = smNotesEl.querySelector(`.sm-dot[data-id="${n.id}"]`);
  if (b){ b.style.left = (n.bx * 100) + "%"; b.style.top = (n.by * 100) + "%"; }
  if (d){ d.style.left = (n.x * 100) + "%"; d.style.top = (n.y * 100) + "%"; }
  n.keep = true; smLinesRender(); edDirtyUi();
}
function smDragEnd(e){ e.target.removeEventListener("pointermove", smDragMove); SM.drag = null; }
function smDel(id){
  const c = smGet(); if (!c) return;
  c.notes = c.notes.filter(n => n.id !== id); if (SM.sel === id) SM.sel = null;
  smRender(); edDirtyUi();
}
$e("sm-add").addEventListener("click", e => { e.currentTarget.blur(); smSetAdding(!SM.adding); });
$e("sm-del").addEventListener("click", () => { if (SM.sel) smDel(SM.sel); });
$e("sm-size").addEventListener("click", e => { const b = e.target.closest("button"), n = smNote(SM.sel); if (!b || !n) return; n.size = b.dataset.v; n.keep = true; smRender(); smSelect(n.id); edDirtyUi(); });
$e("sm-align").addEventListener("click", e => { const b = e.target.closest("button"), n = smNote(SM.sel); if (!b || !n) return; n.align = b.dataset.v; n.keep = true; smRender(); smSelect(n.id); edDirtyUi(); });
window.addEventListener("keydown", e => {
  if (!SM.open) return;
  const typing = document.activeElement && smEl.contains(document.activeElement) && document.activeElement.tagName === "TEXTAREA";
  if (e.key === "Escape"){ e.preventDefault(); e.stopImmediatePropagation(); if (typing) document.activeElement.blur(); else if (SM.adding) smSetAdding(false); else smClose(); return; }
  if (typing) return;
  if (e.code === "KeyA" && !e.ctrlKey && !e.metaKey){ e.preventDefault(); e.stopImmediatePropagation(); smSetAdding(!SM.adding); return; }
  if ((e.code === "Delete" || e.code === "Backspace") && SM.sel){ e.preventDefault(); e.stopImmediatePropagation(); smDel(SM.sel); }
  else if (/^Digit[0-3]$/.test(e.code)){ e.preventDefault(); e.stopImmediatePropagation(); const c = smGet(); if (c){ edSetStar(c, +e.code.slice(5)); smRender(); } }
}, true);
if (window.ResizeObserver) new ResizeObserver(() => { if (SM.open) smRender(); }).observe(smPic);

function smCompose(c){
  return new Promise(res => {
    const im = new Image();
    im.onload = () => {
      const W = im.naturalWidth, H = im.naturalHeight, k = W / 960, band = Math.round(34 * k);
      const cv = document.createElement("canvas"); cv.width = W; cv.height = H + band;
      const g = cv.getContext("2d");
      g.fillStyle = "#14161c"; g.fillRect(0, 0, W, band);
      g.fillStyle = "#e9ecf2"; g.font = `600 ${Math.round(15 * k)}px system-ui, "Malgun Gothic", sans-serif`; g.textBaseline = "middle";
      g.fillText(ED.name + "  ·  " + edFmt(c.t) + (c.star ? "  ·  " + "★".repeat(c.star) : ""), Math.round(12 * k), band / 2);
      g.drawImage(im, 0, band, W, H);
      c.notes.filter(n => n.text.trim()).forEach(n => {
        const fs = Math.round(SM_FONT[n.size] * k), pad = Math.round(7 * k), bw = n.bw * W, lh = Math.round(fs * 1.35);
        g.font = `${fs}px system-ui, "Malgun Gothic", sans-serif`;
        const lines = smWrap(g, n.text, bw - pad * 2), bh = lines.length * lh + pad * 2 + Math.round(6 * k);
        const bx = n.bx * W, by = band + n.by * H;
        const [ex, ey] = smNearOnBox(n, bh / H);
        g.strokeStyle = "#ff9f43"; g.lineWidth = Math.max(1.5, 2 * k);
        g.beginPath(); g.moveTo(n.x * W, band + n.y * H); g.lineTo(ex * W, band + ey * H); g.stroke();
        g.fillStyle = "#ff9f43"; g.beginPath(); g.arc(n.x * W, band + n.y * H, Math.max(3, 4.5 * k), 0, Math.PI * 2); g.fill();
        g.fillStyle = "#fff6c7"; g.fillRect(bx, by, bw, bh); g.strokeRect(bx, by, bw, bh);
        g.fillStyle = "#1e1e26"; g.textBaseline = "top"; g.textAlign = n.align;
        const tx = n.align === "center" ? bx + bw / 2 : n.align === "right" ? bx + bw - pad : bx + pad;
        lines.forEach((ln, i) => g.fillText(ln, tx, by + pad + Math.round(6 * k) + i * lh));
        g.textAlign = "left";
      });
      res(cv);
    };
    im.src = c.img;
  });
}
function smWrap(g, text, maxW){
  const out = [];
  String(text).split("\n").forEach(par => {
    let line = "";
    for (const ch of par){ const test = line + ch; if (g.measureText(test).width > maxW && line){ out.push(line); line = ch; } else line = test; }
    out.push(line);
  });
  return out;
}
const smPngName = c => edBase(ED.name) + "_" + edFmt(c.t).replace(":", "m").replace(".", "s") + "_장면메모.png";
$e("ed-scene").addEventListener("click", e => { e.currentTarget.blur(); smCapture(); });
