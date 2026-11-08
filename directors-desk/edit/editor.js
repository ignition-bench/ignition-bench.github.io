"use strict";

APP.screen = "edit";
const $e = id => document.getElementById(id);
const V = $e("ed-video");
const ED = { name: "", url: "", dur: 0, rec: null, recName: "", cuts: [], marks: [], scenes: [], tab: "mark", off: new Set(), legend: {}, delT: -1e9, sel: null, savedSig: "", undo: [], redo: [], q: "",
  idN: 1, leaveT: 0, openT: 0, durFix: false, thumbQ: [], thumbBusy: null, thumbRestore: null, leaving: false, drag: null };
const ED_STEP = 1 / 30, ED_MIN_RANGE = 0.2, ED_WHO_KEY = "dd-ed-who";

function showToast(msg){ const el = $e("toast"); el.textContent = msg; el.classList.add("show"); clearTimeout(showToast._t); showToast._t = setTimeout(() => el.classList.remove("show"), 2400); }
function edFmt(t){ t = Math.max(0, t || 0); const m = Math.floor(t / 60), s = t - m * 60; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1); }
const edBase = n => String(n || "").replace(/\.(rec|memo)\.json$/i, "").replace(/\.[^.]+$/, "");
const edDur = () => ED.dur || (ED.rec && +ED.rec.duration) || 0;
const edWho = () => $e("ed-who").value.trim();
const edGet = id => ED.marks.find(m => m.id === id);
const edScGet = id => ED.scenes.find(s => s.id === id);
const edAny = id => edGet(id) || edScGet(id);
const edSig = () => JSON.stringify([ED.marks.map(m => [m.t, m.t2, m.text, m.who, m.src, m.star || 0]), ED.scenes.map(c => [c.t, c.text, c.star || 0, c.notes.map(n => [n.x, n.y, n.bx, n.by, n.text, n.size, n.align])])]);
const edDirty = () => !!ED.name && edSig() !== ED.savedSig;
const edSnap = () => ({ marks: ED.marks.map(m => ({ ...m })), scenes: ED.scenes.map(c => ({ ...c, notes: c.notes.map(n => ({ ...n })) })) });
function edRestore(o){ ED.marks = o.marks; ED.scenes = o.scenes; }
function edSort(){ ED.marks.sort((a, b) => a.t - b.t); }
function edNewId(){ return "m" + (ED.idN++); }

const ED_VID_RE = /\.(mp4|webm|mov|m4v)$/i;
const edIsVid = f => /^video\//.test(f.type) || ED_VID_RE.test(f.name);
const edReadJson = f => new Promise(res => readTextFile(f, txt => { let o = null; try { o = JSON.parse(txt); } catch(e){} res(o); }));
async function edOpenFiles(list, opts){
  opts = opts || {};
  const files = [...(list || [])].filter(Boolean); if (!files.length) return;
  const vid = files.find(edIsVid);
  const rec = files.find(f => /\.rec\.json$/i.test(f.name));
  const memo = files.find(f => /\.memo\.json$/i.test(f.name));
  files.filter(f => f !== vid && f !== rec && f !== memo).forEach(f => showToast(t("edBadFile").replace("{f}", f.name)));
  if (!vid && !ED.name){ if (memo || rec) edAskVideo([rec, memo].filter(Boolean)); else showToast(t("edNoVideo")); return; }
  if (vid && edDirty()){
    const v = await edConfirm("open"); if (v === "cancel") return;
    if (v === "save" && !(await edSave())) return;
    ED.savedSig = edSig(); return edOpenFiles(files, opts);
  }
  if (vid) edLoadVideo(vid, vid.name);
  const ro = rec ? await edReadJson(rec) : null, mo = memo ? await edReadJson(memo) : null;
  if (rec) edAttachRec(ro, rec.name, !memo);
  if (memo) edLoadMemo(mo, memo.name);
  if (vid && opts.folder){
    const okM = memo && mo && mo.kind === "dd-memo", okR = rec && ro && ro.kind === "dd-rec";
    showToast(t("edOpenSum").replace("{n}", vid.name).replace("{m}", okM ? t("edSumMemo").replace("{k}", ED.marks.length + ED.scenes.length) : t("edSumNoMemo")).replace("{r}", okR ? t("edSumRec").replace("{c}", ED.cuts.length) : t("edSumNoRec")));
  } else if (vid && !memo && !rec && !opts.quiet) edHintShow();
}
async function edAskVideo(jsons){
  const jf = jsons.find(f => /\.memo\.json$/i.test(f.name)) || jsons[0], o = await edReadJson(jf);
  const want = o && typeof o.video === "string" ? o.video : "", kind = t(/\.memo\.json$/i.test(jf.name) ? "edKindMemo" : "edKindRec");
  const v = await edAsk({ title: t("edNeedVidTitle"), body: (want ? t("edNeedVidBody") : t("edNeedVidBodyAny")).replace(/\{k\}/g, kind).replace("{v}", want),
    btns: [["cancel", t("edCfCancel"), "c-view"], ["pick", t("edPickVideo"), "c-get"]], def: "pick" });
  if (v !== "pick") return;
  ED.pend = { files: jsons, want, kind };
  $e("ed-file-v").click();
}
async function edPendVideo(vf){
  const P = ED.pend; ED.pend = null; if (!vf || !P) return;
  if (P.want && edBase(vf.name) !== edBase(P.want)){
    const v = await edAsk({ title: t("edVidDiffTitle"), body: t("edVidDiffBody").replace("{a}", vf.name).replace("{k}", P.kind).replace("{b}", P.want), btns: [["cancel", t("edCfCancel"), "c-view"], ["open", t("edVidDiffOpen"), "c-get"]], def: "cancel" });
    if (v !== "open") return;
  }
  edOpenFiles([vf, ...P.files]);
}
async function edScanDir(dir, depth){
  const vids = [], json = {}, subs = [];
  for await (const [n, h] of dir.entries()){
    if (h.kind === "file"){ if (ED_VID_RE.test(n)) vids.push(h); else if (/\.(rec|memo)\.json$/i.test(n)) json[n.toLowerCase()] = h; }
    else if (depth > 0) subs.push(h);
  }
  const out = vids.map(v => ({ v, rec: json[(edBase(v.name) + ".rec.json").toLowerCase()] || null, memo: json[(edBase(v.name) + ".memo.json").toLowerCase()] || null, folder: dir.name }));
  if (!out.length && depth > 0) for (const sd of subs){ try { out.push(...await edScanDir(sd, depth - 1)); } catch(e){} }
  return out;
}
async function edOpenDir(dir){
  let list;
  try { list = await edScanDir(dir, 1); } catch(e){ console.warn(e); showToast(t("edDirFail")); return; }
  if (!list.length){ showToast(t("edDirNoVideo").replace("{d}", dir.name)); return; }
  for (const c of list){
    c.vf = await c.v.getFile(); c.mf = c.memo ? await c.memo.getFile() : null; c.rf = c.rec ? await c.rec.getFile() : null;
    c.t = Math.max(c.vf.lastModified || 0, c.mf ? c.mf.lastModified || 0 : 0);
  }
  list.sort((a, b) => b.t - a.t || (a.folder < b.folder ? 1 : -1));
  let c = list[0];
  if (list.length > 1){ const i = await edPickList(list, dir.name); if (i == null) return; c = list[i]; }
  edOpenFiles([c.vf, c.rf, c.mf], { folder: true });
}
async function edPickList(list, dname){
  const box = document.createElement("div"); box.className = "ed-pick";
  list.forEach((c, i) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "ed-pick-row"; b.dataset.v = "i" + i;
    const d = new Date(c.t), p2 = n => String(n).padStart(2, "0");
    b.innerHTML = `<b></b><small class="ed-pick-sub"></small><span class="ed-pick-tags"></span>`;
    b.querySelector("b").textContent = c.vf.name;
    b.querySelector(".ed-pick-sub").textContent = (c.folder !== dname ? "📁 " + c.folder + " · " : "") + (d.getMonth() + 1) + "/" + d.getDate() + " " + p2(d.getHours()) + ":" + p2(d.getMinutes());
    b.querySelector(".ed-pick-tags").textContent = [c.mf ? t("edPickHasMemo") : t("edPickNoMemo"), c.rf ? t("edPickHasRec") : ""].filter(Boolean).join(" · ");
    box.appendChild(b);
  });
  const v = await edAsk({ title: t("edPickTitle"), body: t("edPickBody").replace("{d}", dname).replace("{n}", list.length), extra: box, btns: [["cancel", t("edCfCancel"), "c-view"]], def: "i0" });
  return /^i\d+$/.test(v) ? +v.slice(1) : null;
}
function edHintShow(){ const h = $e("ed-hint"); h.hidden = false; clearTimeout(edHintShow._t); edHintShow._t = setTimeout(edHintHide, 9000); }
function edHintHide(){ clearTimeout(edHintShow._t); $e("ed-hint").hidden = true; }
function edLoadVideo(blob, name){
  V.pause();
  if (ED.url) URL.revokeObjectURL(ED.url);
  ED.url = URL.createObjectURL(blob); ED.blob = blob; ED.name = name; ED.dur = 0; ED.durFix = false;
  ED.rec = null; ED.recName = ""; ED.cuts = []; ED.marks = []; ED.scenes = []; ED.sel = null; ED.undo = []; ED.redo = []; ED.savedSig = edSig();
  ED.thumbQ = []; ED.thumbBusy = null; ED.thumbRestore = null;
  V.src = ED.url; V.playbackRate = +$e("ed-rate").value || 1;
  $e("ed-drop").hidden = true; edHintHide();
  edRenderAll(); showToast(t("edLoaded").replace("{n}", name));
}
function edAttachRec(o, fname, withMarks){
  if (!o || o.kind !== "dd-rec"){ showToast(t("edBadFile").replace("{f}", fname)); return; }
  ED.rec = o; ED.recName = fname;
  const wrong = o.video && ED.name && edBase(o.video) !== edBase(ED.name);
  const segs = [], S = Array.isArray(o.samples) ? o.samples : [];
  S.forEach(s => { const L = segs[segs.length - 1]; if (L && L.cam === s.cam) return; if (L) L.t1 = +s.t; segs.push({ t0: L ? +s.t : 0, t1: +s.t, cam: s.cam || "" }); });
  if (segs.length) segs[segs.length - 1].t1 = Math.max(segs[segs.length - 1].t1, +o.duration || 0);
  ED.cuts = segs.filter(s => s.cam);
  let n = 0;
  if (withMarks) (Array.isArray(o.markers) ? o.markers : []).forEach(m => {
    if (ED.marks.some(x => x.src === "rec" && Math.abs(x.t - m.t) < 0.01)) return;
    ED.marks.push({ id: edNewId(), t: +m.t || 0, text: String(m.memo || ""), who: "", img: m.img || "", src: "rec", cam: m.cam || "" }); n++;
  });
  edSort(); ED.savedSig = edSig();
  edRenderAll();
  showToast(wrong ? t("edNameMismatch").replace("{f}", fname).replace("{v}", ED.name) : t("edRecLoaded").replace("{m}", (o.markers || []).length).replace("{c}", ED.cuts.length));
}
function edLoadMemo(o, fname){
  if (!o || o.kind !== "dd-memo" || !Array.isArray(o.marks)){ showToast(t("edBadFile").replace("{f}", fname)); return; }
  const wrong = o.video && ED.name && edBase(o.video) !== edBase(ED.name);
  ED.marks = o.marks.map(m => {
    const k = { id: edNewId(), t: Math.max(0, +m.t || 0), text: String(m.text || ""), who: String(m.who || ""), img: typeof m.img === "string" ? m.img : "", src: m.src === "rec" ? "rec" : "", cam: String(m.cam || "") };
    if (m.t2 != null && +m.t2 - k.t >= ED_MIN_RANGE) k.t2 = +m.t2;
    if ([1, 2, 3].includes(+m.star)) k.star = +m.star;
    return k;
  });
  ED.scenes = (Array.isArray(o.scenes) ? o.scenes : []).map(c => ({ id: edScNewId(), t: Math.max(0, +c.t || 0), img: typeof c.img === "string" ? c.img : "", text: String(c.text || ""), who: String(c.who || ""), star: [1, 2, 3].includes(+c.star) ? +c.star : 0,
    notes: (Array.isArray(c.notes) ? c.notes : []).map(n => smNoteFrom(n)) })).filter(c => c.img);
  if (o.legend && typeof o.legend === "object") [1, 2, 3].forEach(k => { if (typeof o.legend[k] === "string" && o.legend[k].trim()) ED.legend[k] = o.legend[k]; });
  edLegendUi(); edHintHide();
  edSort(); ED.sel = null; ED.undo = []; ED.redo = []; ED.savedSig = edSig();
  ED.marks.filter(m => !m.img).forEach(edThumb);
  edRenderAll();
  if (typeof fileCard === "function") fileCard("memo", fname, t("edCount").replace("{n}", ED.marks.length), true);
  showToast(wrong ? t("edNameMismatch").replace("{f}", fname).replace("{v}", ED.name) : t("edMemoLoaded").replace("{n}", ED.marks.length + ED.scenes.length));
}
V.addEventListener("loadedmetadata", () => {
  if (isFinite(V.duration) && V.duration > 0){ ED.dur = V.duration; edRenderAll(); }
  else { ED.durFix = true; V.currentTime = 1e7; }
});
V.addEventListener("durationchange", () => { if (!ED.durFix && isFinite(V.duration) && V.duration > 0 && Math.abs(V.duration - ED.dur) > 1e-3){ ED.dur = V.duration; edRenderAll(); } });
V.addEventListener("seeked", () => {
  if (ED.durFix){
    if (isFinite(V.duration) && V.duration > 0){ ED.durFix = false; ED.dur = V.duration; V.currentTime = 0; edRenderAll(); }
    return;
  }
  edThumbNext();
});
V.addEventListener("pause", () => { edPlayUi(); edThumbNext(); });
V.addEventListener("play", edPlayUi);
V.addEventListener("ended", edPlayUi);
V.addEventListener("error", () => { if (ED.name) showToast(t("edVideoErr")); });

function edGrab(){
  const w = 192, h = Math.max(1, Math.round(w * (V.videoHeight || 9) / (V.videoWidth || 16)));
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  c.getContext("2d").drawImage(V, 0, 0, w, h);
  return c.toDataURL("image/jpeg", 0.72);
}
function edThumb(m){
  if (!m) return;
  if (!V.seeking && V.readyState >= 2 && Math.abs(V.currentTime - m.t) < 0.06 && !ED.thumbBusy){ try { m.img = edGrab(); } catch(e){} edRowThumb(m); return; }
  if (!ED.thumbQ.includes(m.id)) ED.thumbQ.push(m.id);
  edThumbNext();
}
function edThumbNext(){
  if (ED.thumbBusy){
    const m = edGet(ED.thumbBusy); ED.thumbBusy = null;
    if (m && V.readyState >= 2){ try { m.img = edGrab(); } catch(e){} edRowThumb(m); }
  }
  if (!V.paused || ED.durFix || V.seeking || ED.thumbHold) return;
  while (ED.thumbQ.length){
    const m = edGet(ED.thumbQ.shift()); if (!m) continue;
    if (ED.thumbRestore == null) ED.thumbRestore = V.currentTime;
    if (Math.abs(V.currentTime - m.t) < 0.02 && V.readyState >= 2){ try { m.img = edGrab(); } catch(e){} edRowThumb(m); continue; }
    ED.thumbBusy = m.id; V.currentTime = m.t; return;
  }
  if (ED.thumbRestore != null){ const r = ED.thumbRestore; ED.thumbRestore = null; if (Math.abs(V.currentTime - r) > 0.01) V.currentTime = r; }
}

function edPush(){ ED.undo.push(edSnap()); if (ED.undo.length > 80) ED.undo.shift(); ED.redo = []; }
function edUndo(){ if (!ED.undo.length) return; ED.redo.push(edSnap()); edRestore(ED.undo.pop()); if (!edAny(ED.sel)) ED.sel = null; edRenderAll(); }
function edRedo(){ if (!ED.redo.length) return; ED.undo.push(edSnap()); edRestore(ED.redo.pop()); if (!edAny(ED.sel)) ED.sel = null; edRenderAll(); }
function edAdd(t, t2, focus){
  if (!ED.name){ showToast(t("edNoVideo")); return null; }
  edPush();
  const m = { id: edNewId(), t: +Math.max(0, Math.min(edDur() || t, t)).toFixed(2), text: "", who: edWho(), img: "", src: "" };
  if (t2 != null && t2 - m.t >= ED_MIN_RANGE) m.t2 = +Math.min(edDur() || t2, t2).toFixed(2);
  ED.marks.push(m); edSort(); ED.sel = m.id; edSetTab("mark", true);
  edRenderAll(); edThumb(m);
  if (focus) setTimeout(() => { const ta = document.querySelector(`.ed-row[data-id="${m.id}"] .ed-memo`); if (ta) ta.focus(); }, 0);
  if (typeof flowFlag === "function") flowFlag("edMarked");
  return m;
}
function edDelete(id){
  const m = edAny(id); if (!m) return;
  const keep = edKeepTxt([m]);
  edPush(); ED.marks = ED.marks.filter(x => x.id !== id); ED.scenes = ED.scenes.filter(x => x.id !== id); if (ED.sel === id) ED.sel = null;
  edRenderAll(); showToast(t("edDeleted") + keep);
}
function edSelect(id, seek){
  ED.sel = id; const m = edAny(id);
  if (m && seek && ED.name){ edUserSeek(); V.currentTime = m.t; }
  document.querySelectorAll(".ed-row").forEach(r => r.classList.toggle("sel", r.dataset.id === id));
  document.querySelectorAll(".ed-mk, .ed-sc").forEach(r => r.classList.toggle("sel", r.dataset.id === id));
  const row = document.querySelector(`.ed-row[data-id="${id}"]`); if (row && seek) row.scrollIntoView({ block: "nearest" });
}

const edPct = t => (edDur() ? Math.max(0, Math.min(100, t / edDur() * 100)) : 0) + "%";
function edRenderAll(){ edRenderRuler(); edRenderCuts(); edRenderMarks(); edRenderList(); edPlayUi(); edHeadRender(); edDirtyUi(); edTabUi(); $e("ed-name").textContent = ED.name ? ED.name + (ED.recName ? "  +  " + ED.recName : "") : ""; }
function edRenderRuler(){
  const el = $e("ed-ruler"); el.innerHTML = ""; const D = edDur(); if (!D) return;
  const w = el.clientWidth || 600, steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  const st = steps.find(s => s / D * w >= 64) || 600;
  for (let s = 0; s <= D + 1e-6; s += st){ const k = document.createElement("div"); k.className = "ed-tick"; k.style.left = edPct(s); k.textContent = edFmt(s).replace(/\.0$/, ""); el.appendChild(k); }
}
function edRenderCuts(){
  const el = $e("ed-cuts"); el.innerHTML = ""; $e("ed-lane-cut").hidden = !ED.cuts.length;
  ED.cuts.forEach(c => { const d = document.createElement("div"); d.className = "ed-cut"; d.style.left = edPct(c.t0); d.style.width = `calc(${edPct(c.t1)} - ${edPct(c.t0)})`; d.textContent = c.cam; d.title = c.cam + " · " + edFmt(c.t0) + "–" + edFmt(c.t1); el.appendChild(d); });
}
function edMatch(m, noStars){
  if (!noStars && ED.off.has(m.star || 0)) return false;
  const q = ED.q.trim().toLowerCase(); if (!q) return true;
  return (m.text + " " + m.who + " " + (m.cam || "") + " " + (m.notes ? m.notes.map(n => n.text).join(" ") : "")).toLowerCase().includes(q);
}
const edFiltering = () => !!ED.q.trim() || ED.off.size > 0;
const edTabItems = () => ED.tab === "scene" ? ED.scenes : ED.marks;
const edShown = () => edTabItems().filter(m => edMatch(m));
const edHiddenN = arr => arr.filter(m => edMatch(m, true)).length - arr.filter(m => edMatch(m)).length;
function edRenderMarks(){
  const el = $e("ed-marks"); [...el.querySelectorAll(".ed-mk")].forEach(n => n.remove());
  ED.marks.forEach((m, i) => {
    const d = document.createElement("div"); d.dataset.id = m.id;
    d.className = "ed-mk " + (m.t2 != null ? "rg" : "pt") + (m.id === ED.sel ? " sel" : "") + (m.src === "rec" ? " rec" : "") + (m.text.trim() ? " has" : "") + (edMatch(m) ? "" : " dim") + (m.star ? " s" + m.star : "");
    d.style.left = edPct(m.t); if (m.t2 != null) d.style.width = `calc(${edPct(m.t2)} - ${edPct(m.t)})`;
    d.title = "#" + (i + 1) + " " + edFmt(m.t) + (m.t2 != null ? "–" + edFmt(m.t2) : "") + (m.text ? " · " + m.text : "");
    d.innerHTML = `<span class="ed-n">${i + 1}</span>` + (m.t2 != null ? `<span class="ed-edge l"></span><span class="ed-edge r"></span>` : "");
    el.appendChild(d);
  });
  [...el.querySelectorAll(".ed-sc")].forEach(n => n.remove());
  ED.scenes.forEach((c, i) => {
    const d = document.createElement("div"); d.dataset.id = c.id;
    d.className = "ed-sc" + (c.id === ED.sel ? " sel" : "") + (edMatch(c) ? "" : " dim") + (c.star ? " s" + c.star : "");
    d.style.left = edPct(c.t); d.textContent = "📸";
    d.title = "S" + (i + 1) + " " + edFmt(c.t) + (c.text ? " · " + c.text : "") + " — " + t("edSceneNotes").replace("{n}", c.notes.length);
    el.appendChild(d);
  });
}
function edStarsEl(item, onChange){
  const w = document.createElement("span"); w.className = "ed-stars" + (item.star ? " s" + item.star : ""); w.title = t("edStarTip");
  for (let k = 1; k <= 3; k++){
    const on = k <= (item.star || 0);
    const b = document.createElement("button"); b.type = "button"; b.className = "ed-star" + (on ? " on" : ""); b.textContent = on ? "★" : "☆"; b.dataset.k = k;
    b.addEventListener("click", e => { e.stopPropagation(); b.blur(); edSetStar(item, (item.star || 0) === k ? 0 : k); if (onChange) onChange(); });
    w.appendChild(b);
  }
  return w;
}
function edSetStar(item, k){ if (!item || (item.star || 0) === k) return; edPush(); if (k) item.star = k; else delete item.star; edRenderAll(); }
function edRenderList(){
  const box = $e("ed-list"); box.innerHTML = "";
  const all = edTabItems(), shown = edShown();
  $e("ed-count").textContent = t("edTotal").replace("{n}", ED.marks.length + ED.scenes.length);
  if (!all.length || !shown.length){
    const p = document.createElement("div"); p.className = "ed-empty";
    if (!all.length) p.textContent = t(ED.tab === "scene" ? "edSceneEmpty" : "edListEmpty");
    else if (ED.off.size === 4){ p.classList.add("big"); p.textContent = t("edCondEmpty"); }
    else { p.classList.add("big"); p.textContent = t("edNoHit"); }
    if (all.length && edHiddenN(all) > 0){ const b = document.createElement("button"); b.type = "button"; b.className = "c-edit ed-allon"; b.textContent = t("edAllOn"); b.addEventListener("click", edAllOn); p.appendChild(document.createElement("br")); p.appendChild(b); }
    box.appendChild(p); return;
  }
  if (ED.tab === "scene"){ edRenderScenes(box); return; }
  ED.marks.forEach((m, i) => {
    if (!edMatch(m)) return;
    const r = document.createElement("div"); r.dataset.id = m.id;
    r.className = "ed-row" + (m.id === ED.sel ? " sel" : "") + (m.src === "rec" ? " rec" : "") + (m.text.trim() ? " has" : "") + (m.star ? " s" + m.star : "");
    r.classList.add("ed-mkrow");
    r.innerHTML = `<span class="ed-kind mk"></span><div class="ed-thumb"></div><div class="ed-meta"><div class="ed-tmrow"><span class="ed-tm"></span></div><div class="ed-tags"></div><div class="ed-mkbtns"><button type="button" class="ed-mk-shot c-make"></button><button type="button" class="ed-row-del c-del"></button></div></div><textarea class="ed-memo" rows="2"></textarea>`;
    r.querySelector(".ed-kind").textContent = t("edKindMark");
    r.querySelector(".ed-tm").textContent = "#" + (i + 1) + "  " + edFmt(m.t) + (m.t2 != null ? " – " + edFmt(m.t2) : "");
    r.querySelector(".ed-tmrow").appendChild(edStarsEl(m));
    const tags = r.querySelector(".ed-tags");
    const tag = (txt, cls, tip) => { const s = document.createElement("span"); s.className = "ed-tag" + (cls ? " " + cls : ""); s.textContent = txt; if (tip) s.title = tip; tags.appendChild(s); };
    if (m.who) tag("✎ " + m.who);
    if (m.src === "rec") tag(t("edFromRec"), "rec", t("edFromRecTitle"));
    if (m.cam) tag("🎥 " + m.cam);
    edNearScenes(m).forEach(c => { const b = document.createElement("button"); b.type = "button"; b.className = "ed-link sc"; b.textContent = "📸 S" + (ED.scenes.indexOf(c) + 1); b.title = t("edLinkScTitle").replace("{t}", edFmt(c.t)); b.addEventListener("click", e => { e.stopPropagation(); b.blur(); edSelect(c.id, false); smOpen(c.id); }); tags.appendChild(b); });
    const shot = r.querySelector(".ed-mk-shot"); shot.textContent = "📸"; shot.title = t("edMkShotTitle");
    shot.addEventListener("click", e => { e.stopPropagation(); shot.blur(); edSceneAt(m.t); });
    const del = r.querySelector(".ed-row-del"); del.textContent = t("edDel"); del.addEventListener("click", e => { e.stopPropagation(); edDelete(m.id); });
    const ta = r.querySelector(".ed-memo"); ta.value = m.text; ta.placeholder = t("edMemoPh");
    let pushed = false;
    ta.addEventListener("focus", () => { pushed = false; if (ED.sel !== m.id) edSelect(m.id, true); });
    ta.addEventListener("input", () => {
      if (!pushed){ edPush(); pushed = true; }
      m.text = ta.value; if (!m.who && ta.value.trim()) m.who = edWho();
      r.classList.toggle("has", !!m.text.trim());
      const pin = document.querySelector(`.ed-mk[data-id="${m.id}"]`); if (pin) pin.classList.toggle("has", !!m.text.trim());
      edDirtyUi();
    });
    ta.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing){ e.preventDefault(); ta.blur(); }
      else if (e.key === "Escape"){ e.preventDefault(); ta.blur(); }
    });
    ta.addEventListener("blur", () => { if (pushed){ pushed = false; edRenderMarks(); } });
    const go = () => edSelect(m.id, true);
    r.querySelector(".ed-thumb").addEventListener("click", go);
    r.querySelector(".ed-tm").addEventListener("click", go);
    box.appendChild(r); edRowThumb(m);
  });
}
function edRenderScenes(box){
  ED.scenes.forEach((c, i) => {
    if (!edMatch(c)) return;
    const r = document.createElement("div"); r.dataset.id = c.id;
    r.className = "ed-row ed-scrow" + (c.id === ED.sel ? " sel" : "") + (c.text.trim() || c.notes.length ? " has" : "") + (c.star ? " s" + c.star : "");
    r.innerHTML = `<span class="ed-kind sc"></span><div class="ed-thumb"></div><div class="ed-meta"><div class="ed-tmrow"><span class="ed-tm"></span></div><div class="ed-tags"></div><div class="ed-scbtns"><button type="button" class="ed-sc-open c-edit"></button><button type="button" class="ed-row-del c-del"></button></div></div><div class="ed-notes-pv"></div><textarea class="ed-memo" rows="1"></textarea>`;
    r.querySelector(".ed-kind").textContent = t("edKindScene");
    r.querySelector(".ed-tm").textContent = "S" + (i + 1) + "  " + edFmt(c.t);
    r.querySelector(".ed-tmrow").appendChild(edStarsEl(c));
    r.querySelector(".ed-thumb").style.backgroundImage = `url("${c.img}")`;
    const tags = r.querySelector(".ed-tags");
    const tag = txt => { const s = document.createElement("span"); s.className = "ed-tag"; s.textContent = txt; tags.appendChild(s); };
    if (c.who) tag("✎ " + c.who);
    tag("💬 " + t("edSceneNotes").replace("{n}", c.notes.length));
    edNearMarks(c).forEach(m => { const b = document.createElement("button"); b.type = "button"; b.className = "ed-link mk"; b.textContent = "📍 #" + (ED.marks.indexOf(m) + 1); b.title = t("edLinkMkTitle").replace("{t}", edFmt(m.t)); b.addEventListener("click", e => { e.stopPropagation(); b.blur(); edSetTab("mark"); edSelect(m.id, true); }); tags.appendChild(b); });
    const pv = r.querySelector(".ed-notes-pv"); pv.textContent = c.notes.map(n => n.text.trim()).filter(Boolean).map(x => "· " + x).join("\n"); pv.hidden = !pv.textContent;
    const op = r.querySelector(".ed-sc-open"); op.textContent = t("edSceneOpen"); op.title = t("edSceneOpenTitle"); op.addEventListener("click", e => { e.stopPropagation(); edSelect(c.id, true); smOpen(c.id); });
    const del = r.querySelector(".ed-row-del"); del.textContent = t("edDel"); del.addEventListener("click", e => { e.stopPropagation(); edDelete(c.id); });
    const ta = r.querySelector(".ed-memo"); ta.value = c.text; ta.placeholder = t("edSceneTextPh");
    let pushed = false;
    ta.addEventListener("focus", () => { pushed = false; if (ED.sel !== c.id) edSelect(c.id, true); });
    ta.addEventListener("input", () => { if (!pushed){ edPush(); pushed = true; } c.text = ta.value; edDirtyUi(); });
    ta.addEventListener("keydown", e => { if ((e.key === "Enter" && !e.shiftKey && !e.isComposing) || e.key === "Escape"){ e.preventDefault(); ta.blur(); } });
    ta.addEventListener("blur", () => { if (pushed){ pushed = false; edRenderMarks(); } });
    r.querySelector(".ed-thumb").addEventListener("click", () => { edSelect(c.id, true); smOpen(c.id); });
    r.querySelector(".ed-tm").addEventListener("click", () => edSelect(c.id, true));
    box.appendChild(r);
  });
}
const ED_NEAR = 0.5;
const edNear = (m, t) => m.t2 != null ? (t >= m.t - ED_NEAR && t <= m.t2 + ED_NEAR) : Math.abs(t - m.t) <= ED_NEAR;
const edNearScenes = m => ED.scenes.filter(c => edNear(m, c.t));
const edNearMarks = c => ED.marks.filter(m => edNear(m, c.t));
function edSceneAt(t){
  if (!ED.name) return;
  V.pause(); edUserSeek(); ED.thumbHold = true;
  let tries = 0;
  const done = () => { ED.thumbHold = false; setTimeout(edThumbNext, 0); };
  const go = () => {
    if (V.seeking) return;
    if (Math.abs((V.currentTime || 0) - t) > 0.04 && tries++ < 3){ V.currentTime = t; return; }
    V.removeEventListener("seeked", go);
    setTimeout(() => { smCapture(true); done(); }, 30);
  };
  if (Math.abs((V.currentTime || 0) - t) < 0.02 && !V.seeking && V.readyState >= 2){ smCapture(true); done(); return; }
  V.addEventListener("seeked", go); V.currentTime = t;
}
function edSetTab(tab, quiet){ if (ED.tab === tab) return; ED.tab = tab; if (!quiet) edRenderAll(); }
function edTabUi(){
  document.querySelectorAll("#ed-tabs [data-tab]").forEach(b => b.classList.toggle("on", b.dataset.tab === ED.tab));
  const cnt = arr => { const k = arr.filter(m => edMatch(m)).length; return edFiltering() ? k + "/" + arr.length : String(arr.length); };
  $e("ed-n-mark").textContent = cnt(ED.marks); $e("ed-n-scene").textContent = cnt(ED.scenes);
  document.querySelectorAll("#ed-tabs [data-tab]").forEach(b => { const arr = b.dataset.tab === "scene" ? ED.scenes : ED.marks; const hit = b.dataset.tab !== ED.tab && edFiltering() && arr.some(m => edMatch(m)); b.classList.toggle("hint", hit); b.title = hit ? t("edTabHint") : ""; });
  const all = edTabItems(), byText = all.filter(m => edMatch(m, true));
  document.querySelectorAll("#ed-filter .ed-chip").forEach(b => {
    const k = b.dataset.star;
    if (k === "all"){ b.textContent = t("edChipAll"); b.classList.toggle("on", ED.off.size === 0); b.classList.toggle("part", ED.off.size > 0 && ED.off.size < 4); b.title = t("edChipAllTip"); return; }
    const n = byText.filter(m => (m.star || 0) === +k).length, lab = +k ? "★".repeat(+k) : t("edChipNone");
    b.innerHTML = ""; b.append(lab + " "); const c = document.createElement("span"); c.className = "ed-cn"; c.textContent = n; b.appendChild(c);
    b.classList.toggle("on", !ED.off.has(+k));
    b.title = +k ? t("edChipTip2").replace("{s}", lab + " " + edLegendText(+k)) : t("edChipNoneTip");
  });
  $e("ed-cond-dot").hidden = !ED.off.size; $e("ed-cond-btn").classList.toggle("filtering", ED.off.size > 0);
  const res = $e("ed-result"), shown = all.filter(m => edMatch(m)).length, hid = edHiddenN(all);
  if (hid > 0){
    const offTxt = [3, 2, 1, 0].filter(k => ED.off.has(k)).map(k => k ? "★".repeat(k) : t("edChipNone")).join(" · ");
    res.className = "warn"; res.innerHTML = t("edHidden").replace("{h}", hid).replace("{c}", offTxt) + " ";
    const b = document.createElement("button"); b.type = "button"; b.className = "c-edit"; b.textContent = t("edAllOn"); b.addEventListener("click", edAllOn); res.appendChild(b);
    res.hidden = false;
  } else if (all.length){ res.className = ""; res.innerHTML = t("edResult").replace("{k}", shown).replace("{n}", all.length); res.hidden = false; }
  else res.hidden = true;
  const del = $e("ed-del-shown"); del.textContent = t("edDelShown").replace("{n}", shown); del.disabled = !shown; del.title = t("edDelShownTitle");
  del.hidden = !ED.condOpen; $e("ed-cond").hidden = !ED.condOpen; $e("ed-cond-lab").textContent = t(ED.condOpen ? "edCondOpen" : "edCondClosed"); $e("ed-cond-btn").classList.toggle("on", ED.condOpen);
  if (performance.now() - ED.delT > 4000) del.classList.remove("arm");
}
function edAllOn(){ ED.off.clear(); edRenderAll(); }
function edKeepTxt(items){
  const ids = new Set(items.map(x => x.id));
  const sc = ED.scenes.filter(c => !ids.has(c.id) && items.some(m => m.notes === undefined && edNear(m, c.t))).length;
  const mk = ED.marks.filter(m => !ids.has(m.id) && items.some(c => c.notes !== undefined && edNear(m, c.t))).length;
  return (sc ? t("edKeepScenes").replace("{n}", sc) : "") + (mk ? t("edKeepMarks").replace("{n}", mk) : "");
}
function edDelShown(){
  const shown = edShown(); if (!shown.length){ showToast(t("edDelNone")); return; }
  const now = performance.now(), del = $e("ed-del-shown");
  if (now - ED.delT > 4000){
    ED.delT = now; del.classList.add("arm");
    const parts = []; if (ED.off.size) parts.push([3, 2, 1, 0].filter(k => !ED.off.has(k)).map(k => k ? "★".repeat(k) : t("edChipNone")).join("·")); if (ED.q.trim()) parts.push("「" + ED.q.trim() + "」");
    showToast(t("edDelConfirm").replace("{c}", (ED.tab === "scene" ? t("edTabScene") : t("edTabMark")) + (parts.length ? " " + parts.join(" + ") : " " + t("edCondAllTxt"))).replace("{n}", shown.length) + edKeepTxt(shown));
    setTimeout(() => { if (performance.now() - ED.delT >= 3990) del.classList.remove("arm"); }, 4000);
    return;
  }
  ED.delT = -1e9; del.classList.remove("arm");
  edPush();
  const ids = new Set(shown.map(m => m.id));
  ED.marks = ED.marks.filter(m => !ids.has(m.id)); ED.scenes = ED.scenes.filter(c => !ids.has(c.id));
  if (ids.has(ED.sel)) ED.sel = null;
  const keep = edKeepTxt(shown);
  edRenderAll(); showToast(t("edDelDone").replace("{n}", ids.size) + keep);
}
const ED_LEG_KEY = "dd-ed-legend";
function edLegendText(k){ return (ED.legend[k] || "").trim() || t("edLeg" + k); }
function edLegendUi(){ document.querySelectorAll("#ed-legend input").forEach(inp => { const k = +inp.dataset.star; inp.placeholder = t("edLeg" + k); if (document.activeElement !== inp) inp.value = ED.legend[k] || ""; }); }
function edRowThumb(m){ const th = document.querySelector(`.ed-row[data-id="${m.id}"] .ed-thumb`); if (th) th.style.backgroundImage = m.img ? `url("${m.img}")` : ""; }
function edPlayUi(){
  const b = $e("ed-play"), on = !!ED.name && !V.paused && !V.ended;
  const lab = t(on ? "edPause" : "edPlay"); if (b.textContent !== lab) b.textContent = lab;
  b.classList.toggle("on", on);
  ["ed-play", "ed-start", "ed-end", "ed-mark", "ed-scene"].forEach(id => { $e(id).disabled = !ED.name; });
}
function edHeadRender(){
  const D = edDur(), cur = ED.durFix ? 0 : (V.currentTime || 0);
  const txt = edFmt(Math.min(cur, D || cur)) + " / " + edFmt(D); const te = $e("ed-time"); if (te.textContent !== txt) te.textContent = txt;
  const tr = $e("ed-ruler").getBoundingClientRect(), tl = $e("ed-tl").getBoundingClientRect(), h = $e("ed-head");
  h.style.display = D ? "" : "none";
  if (D) h.style.left = (tr.left - tl.left + tr.width * Math.max(0, Math.min(1, cur / D))) + "px";
}
function edDirtyUi(){ $e("ed-save").classList.toggle("dirty", edDirty()); }
(function edLoop(){ edHeadRender(); requestAnimationFrame(edLoop); })();

function edTogglePlay(){
  if (!ED.name) return;
  if (V.paused || V.ended){ if (V.ended || V.currentTime >= edDur() - 0.02) V.currentTime = 0; V.play().catch(() => {}); }
  else V.pause();
}
function edUserSeek(){
  ED.thumbRestore = null;
  if (ED.thumbBusy){ ED.thumbQ.unshift(ED.thumbBusy); ED.thumbBusy = null; }
}
function edSeek(t){ if (!ED.name) return; edUserSeek(); V.currentTime = Math.max(0, Math.min(edDur(), t)); }
$e("ed-play").addEventListener("click", edTogglePlay);
$e("ed-start").addEventListener("click", () => edSeek(0));
$e("ed-end").addEventListener("click", () => edSeek(edDur()));
$e("ed-rate").addEventListener("change", e => { V.playbackRate = +e.target.value || 1; });
$e("ed-mark").addEventListener("click", () => edAdd(V.currentTime || 0, null, true));
spaceTapRegister(() => { if (window.DD_PAGE !== "edit") return false; edTogglePlay(); return true; });

function edX2T(el, x){ const r = el.getBoundingClientRect(); return Math.max(0, Math.min(edDur(), (x - r.left) / Math.max(1, r.width) * edDur())); }
{ const ru = $e("ed-ruler"); let on = false;
  ru.addEventListener("pointerdown", e => { if (!ED.name || e.button !== 0) return; on = true; ru.setPointerCapture(e.pointerId); edSeek(edX2T(ru, e.clientX)); });
  ru.addEventListener("pointermove", e => { if (on) edSeek(edX2T(ru, e.clientX)); });
  const end = () => { on = false; }; ru.addEventListener("pointerup", end); ru.addEventListener("pointercancel", end); }
{ const lane = $e("ed-marks");
  lane.addEventListener("pointerdown", e => {
    if (!ED.name || e.button !== 0) return;
    const sc = e.target.closest(".ed-sc");
    if (sc){ e.preventDefault(); const was = ED.sel === sc.dataset.id; edSetTab("scene"); edSelect(sc.dataset.id, true); if (was) smOpen(sc.dataset.id); return; }
    const pin = e.target.closest(".ed-mk"), t0 = edX2T(lane, e.clientX);
    lane.setPointerCapture(e.pointerId);
    if (pin){
      const m = edGet(pin.dataset.id); if (!m) return;
      const mode = e.target.classList.contains("ed-edge") ? (e.target.classList.contains("l") ? "left" : "right") : "move";
      ED.drag = { mode, m, x0: e.clientX, t0, o: [m.t, m.t2], pushed: false };
      edSelect(m.id, false);
    } else ED.drag = { mode: "new", x0: e.clientX, t0, ghost: null };
    e.preventDefault();
  });
  lane.addEventListener("pointermove", e => {
    const D = ED.drag; if (!D) return;
    const moved = Math.abs(e.clientX - D.x0) > 4, t1 = edX2T(lane, e.clientX);
    if (D.mode === "new"){
      if (!moved && !D.ghost) return;
      if (!D.ghost){ D.ghost = document.createElement("div"); D.ghost.className = "ed-ghost"; lane.appendChild(D.ghost); }
      const a = Math.min(D.t0, t1), b = Math.max(D.t0, t1); D.ghost.style.left = edPct(a); D.ghost.style.width = `calc(${edPct(b)} - ${edPct(a)})`;
      return;
    }
    if (!moved && !D.pushed) return;
    if (!D.pushed){ edPush(); D.pushed = true; }
    const dt = t1 - D.t0, m = D.m, len = D.o[1] != null ? D.o[1] - D.o[0] : 0, Dur = edDur();
    if (D.mode === "move"){ m.t = +Math.max(0, Math.min(Dur - len, D.o[0] + dt)).toFixed(2); if (D.o[1] != null) m.t2 = +(m.t + len).toFixed(2); }
    else if (D.mode === "left") m.t = +Math.max(0, Math.min(m.t2 - ED_MIN_RANGE, D.o[0] + dt)).toFixed(2);
    else m.t2 = +Math.min(Dur, Math.max(m.t + ED_MIN_RANGE, D.o[1] + dt)).toFixed(2);
    edRenderMarks();
  });
  const up = e => {
    const D = ED.drag; ED.drag = null; if (!D) return;
    if (D.mode === "new"){
      if (D.ghost){ D.ghost.remove(); const t1 = edX2T(lane, e.clientX), a = Math.min(D.t0, t1), b = Math.max(D.t0, t1); if (b - a >= ED_MIN_RANGE){ V.pause(); edSeek(a); edAdd(a, b, true); return; } }
      V.pause(); edSeek(D.t0); edAdd(D.t0, null, true); return;
    }
    if (D.pushed){
      if (D.m.t !== D.o[0]){ D.m.img = ""; edThumb(D.m); }
      edSort(); edRenderAll();
    } else { edSetTab("mark"); edSelect(D.m.id, true); }
  };
  lane.addEventListener("pointerup", up); lane.addEventListener("pointercancel", () => { if (ED.drag && ED.drag.ghost) ED.drag.ghost.remove(); ED.drag = null; edRenderMarks(); });
}
if (window.ResizeObserver) new ResizeObserver(() => { edRenderRuler(); edHeadRender(); }).observe($e("ed-tl"));

const edTyping = () => { const a = document.activeElement; return !!a && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && !/^(range|checkbox|radio|button|file)$/.test(a.type)) || a.tagName === "SELECT"); };
window.addEventListener("keydown", e => {
  if (edTyping()) return;
  if (typeof SM !== "undefined" && SM.open) return;
  if (!$e("ed-confirm").hidden) return;
  const c = e.code, mod = e.ctrlKey || e.metaKey;
  if (mod && c === "KeyZ"){ e.preventDefault(); if (e.shiftKey) edRedo(); else edUndo(); return; }
  if (mod && c === "KeyY"){ e.preventDefault(); edRedo(); return; }
  if (mod || e.altKey) return;
  if (c === "KeyM"){ e.preventDefault(); edAdd(V.currentTime || 0, null, true); }
  else if (c === "KeyN"){ e.preventDefault(); smCapture(); }
  else if (/^Digit[0-3]$/.test(c) && ED.sel){ e.preventDefault(); edSetStar(edAny(ED.sel), +c.slice(5)); }
  else if (c === "KeyP"){ e.preventDefault(); edTogglePlay(); }
  else if (c === "ArrowLeft" || c === "ArrowRight"){ e.preventDefault(); if (!ED.name) return; V.pause(); edSeek((V.currentTime || 0) + (c === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 1 : ED_STEP)); }
  else if (c === "Home"){ e.preventDefault(); edSeek(0); }
  else if (c === "End"){ e.preventDefault(); edSeek(edDur()); }
  else if ((c === "Delete" || c === "Backspace") && ED.sel){ e.preventDefault(); edDelete(ED.sel); }
  else if (e.key === "Escape" && ED.sel){ ED.sel = null; edSelect(null, false); }
});

$e("ed-search").addEventListener("input", e => { ED.q = e.target.value; edRenderList(); edRenderMarks(); edTabUi(); });
$e("ed-search").addEventListener("keydown", e => {
  if (e.key === "Enter"){ e.preventDefault(); const m = edTabItems().find(x => edMatch(x)); if (m && ED.q.trim()){ edSelect(m.id, true); e.target.blur(); } }
  else if (e.key === "Escape"){ e.target.value = ""; ED.q = ""; edRenderList(); edRenderMarks(); edTabUi(); e.target.blur(); }
});
document.querySelectorAll("#ed-tabs [data-tab]").forEach(b => b.addEventListener("click", () => { b.blur(); edSetTab(b.dataset.tab); }));
document.querySelectorAll("#ed-filter .ed-chip").forEach(b => b.addEventListener("click", () => {
  b.blur(); const k = b.dataset.star;
  if (k === "all"){ if (ED.off.size === 0) [0, 1, 2, 3].forEach(x => ED.off.add(x)); else ED.off.clear(); }
  else if (ED.off.has(+k)) ED.off.delete(+k); else ED.off.add(+k);
  edRenderAll();
}));
const ED_COND_KEY = "dd-ed-cond";
try { ED.condOpen = localStorage.getItem(ED_COND_KEY) !== "0"; } catch(e){ ED.condOpen = true; }
$e("ed-cond-btn").addEventListener("click", e => { e.currentTarget.blur(); ED.condOpen = !ED.condOpen; try { localStorage.setItem(ED_COND_KEY, ED.condOpen ? "1" : "0"); } catch(err){} if (!ED.condOpen) $e("ed-help-card").hidden = true; edTabUi(); });
$e("ed-cond-help").addEventListener("click", e => { e.currentTarget.blur(); $e("ed-help-card").hidden = !$e("ed-help-card").hidden; });
$e("ed-help-x").addEventListener("click", () => { $e("ed-help-card").hidden = true; });
$e("ed-del-shown").addEventListener("click", e => { e.currentTarget.blur(); edDelShown(); });
try { const L = JSON.parse(localStorage.getItem(ED_LEG_KEY) || "{}"); [1, 2, 3].forEach(k => { if (typeof L[k] === "string") ED.legend[k] = L[k]; }); } catch(e){}
document.querySelectorAll("#ed-legend input").forEach(inp => {
  inp.addEventListener("input", () => { ED.legend[+inp.dataset.star] = inp.value; try { localStorage.setItem(ED_LEG_KEY, JSON.stringify(ED.legend)); } catch(e){} edTabUi(); });
  inp.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === "Escape") inp.blur(); });
});
edLegendUi();
try { $e("ed-who").value = localStorage.getItem(ED_WHO_KEY) || ""; } catch(e){}
$e("ed-who").addEventListener("input", e => { try { localStorage.setItem(ED_WHO_KEY, e.target.value.trim()); } catch(err){} });
$e("ed-who").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === "Escape") e.target.blur(); });
const edCanDir = () => typeof window.showDirectoryPicker === "function";
$e("ed-open").addEventListener("click", async e => {
  e.currentTarget.blur();
  if (!edCanDir()){ $e("ed-file").click(); return; }
  let d = null; const op = { id: "dd-open", mode: "read" };
  try { if (typeof PACK !== "undefined" && PACK.root) op.startIn = PACK.root; } catch(err){}
  try { d = await window.showDirectoryPicker(op); } catch(err){ if (err && err.name !== "AbortError" && op.startIn){ try { delete op.startIn; d = await window.showDirectoryPicker(op); } catch(e2){} } }
  if (d) edOpenDir(d);
});
$e("ed-open-file").addEventListener("click", e => { e.currentTarget.blur(); $e("ed-file").click(); });
$e("ed-file").addEventListener("change", e => { edOpenFiles(e.target.files); e.target.value = ""; });
$e("ed-file-v").addEventListener("change", e => { const f = e.target.files[0]; e.target.value = ""; edPendVideo(f); });
$e("ed-file-j").addEventListener("change", e => { const fs = [...e.target.files]; e.target.value = ""; edOpenFiles(fs); });
$e("ed-hint-pick").addEventListener("click", () => { edHintHide(); $e("ed-file-j").click(); });
$e("ed-hint-x").addEventListener("click", edHintHide);
function edOpenUi(){
  const can = edCanDir(); $e("ed-open-file").hidden = !can;
  $e("ed-open").dataset.tip = t(can ? "edOpenTitle" : "edOpenTitleFile"); $e("ed-open").removeAttribute("title");
}
function edMemoObj(){
  const leg = {}; [1, 2, 3].forEach(k => { leg[k] = edLegendText(k); });
  return { kind: "dd-memo", version: 2, about: FILE_ABOUT.memo, video: ED.name, duration: +edDur().toFixed(2), rec: ED.recName || undefined, saved: new Date().toISOString(), legend: leg,
    marks: ED.marks.map(m => { const o = { t: m.t }; if (m.t2 != null) o.t2 = m.t2; o.text = m.text; o.who = m.who || ""; if (m.star) o.star = m.star; if (m.src) o.src = m.src; if (m.cam) o.cam = m.cam; o.img = m.img || ""; return o; }),
    scenes: ED.scenes.map(c => ({ t: c.t, text: c.text, who: c.who || "", star: c.star || undefined, notes: c.notes.map(n => ({ x: n.x, y: n.y, bx: n.bx, by: n.by, bw: n.bw, text: n.text, size: n.size, align: n.align })), img: c.img })) };
}
async function edSave(){
  if (!ED.name){ showToast(t("edNoVideo")); return false; }
  if (!ED.marks.length && !ED.scenes.length){ showToast(t("edNothing")); return false; }
  return edSavePack();
}
$e("ed-save").addEventListener("click", e => { e.currentTarget.blur(); edSave(); });
window.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.code === "KeyS"){ e.preventDefault(); edSave(); } });
{ let n = 0;
  window.addEventListener("dragenter", e => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")){ n++; document.body.classList.add("ed-drag"); } });
  window.addEventListener("dragleave", () => { n = Math.max(0, n - 1); if (!n) document.body.classList.remove("ed-drag"); });
  window.addEventListener("dragover", e => e.preventDefault());
  window.addEventListener("drop", e => {
    e.preventDefault(); n = 0; document.body.classList.remove("ed-drag");
    const dt = e.dataTransfer; if (!dt) return;
    const files = [...dt.files], items = [...(dt.items || [])].filter(i => i.kind === "file");
    if (items.length && typeof items[0].getAsFileSystemHandle === "function"){
      const ps = items.map(i => i.getAsFileSystemHandle());
      Promise.all(ps).then(hs => { const d = hs.find(h => h && h.kind === "directory"); if (d) edOpenDir(d); else edOpenFiles(files); }).catch(() => edOpenFiles(files));
    } else edOpenFiles(files);
  });
}
async function edLeave(id){
  if (edDirty()){
    const v = await edConfirm("leave");
    if (v === "cancel") return;
    if (v === "save" && !(await edSave())) return;
  }
  ED.leaving = true;
  let op = null; try { op = window.opener && !window.opener.closed ? window.opener : null; } catch(e){}
  if (op){ try { op.postMessage({ dd: "show", screen: id }, "*"); op.focus(); } catch(e){} window.close(); }
  setTimeout(() => { location.href = "index.html" + (id === "start" ? "" : "#" + id); }, op ? 400 : 0);
}
window.addEventListener("beforeunload", e => { if (edDirty() && !ED.leaving){ e.preventDefault(); e.returnValue = ""; } });

function edAsk(o){
  const box = $e("ed-confirm");
  if (!box.hidden) return Promise.resolve("cancel");
  $e("ed-confirm-title").textContent = o.title || "";
  const body = $e("ed-confirm-body"); body.textContent = o.body || "";
  box.querySelectorAll(".ed-ask-extra").forEach(x => x.remove());
  if (o.extra){ o.extra.classList.add("ed-ask-extra"); body.after(o.extra); }
  const bb = $e("ed-confirm-btns"); bb.innerHTML = "";
  (o.btns || []).forEach(([v, label, cls]) => { const b = document.createElement("button"); b.type = "button"; b.dataset.v = v; b.className = cls || "c-view"; b.textContent = label; bb.appendChild(b); });
  box.classList.toggle("ask-list", !!o.extra);
  box.hidden = false; setTimeout(() => { const f = box.querySelector(`[data-v="${o.def}"]`); if (f) f.focus(); }, 0);
  return new Promise(res => {
    const done = v => { box.hidden = true; box.removeEventListener("click", onClick); window.removeEventListener("keydown", onKey, true); box.querySelectorAll(".ed-ask-extra").forEach(x => x.remove()); res(v); };
    const onClick = e => { const b = e.target.closest("[data-v]"); if (b) done(b.dataset.v); else if (e.target === box) done("cancel"); };
    const onKey = e => { if (e.key === "Escape"){ e.preventDefault(); e.stopImmediatePropagation(); done("cancel"); } };
    box.addEventListener("click", onClick); window.addEventListener("keydown", onKey, true);
  });
}
function edConfirm(kind){
  const op = kind === "open";
  return edAsk({ title: t("edCfTitle"), body: t(op ? "edCfOpen" : "edCfLeave"), def: "save",
    btns: [["cancel", t("edCfCancel"), "c-view"], ["save", t(op ? "edCfSaveOpen" : "edCfSaveLeave"), "c-save"], ["discard", t(op ? "edCfDiscardOpen" : "edCfDiscardLeave"), "c-del"]] });
}

const edHandoffDone = new Set();
window.addEventListener("message", async e => {
  const d = e.data; if (!d || d.dd !== "open-rec" || !d.blob) return;
  try { e.source && e.source.postMessage({ dd: "open-rec-ok", id: d.id }, "*"); } catch(err){}
  if (edHandoffDone.has(d.id)) return; edHandoffDone.add(d.id);
  if (edDirty()){ const v = await edConfirm("open"); if (v === "cancel") return; if (v === "save" && !(await edSave())) return; ED.savedSig = edSig(); }
  edLoadVideo(d.blob, d.name);
  if (d.rec) edAttachRec(d.rec, d.recName || "", true);
  window.focus(); showToast(t("edFromStudio").replace("{n}", d.name));
});
try { if (window.opener && !window.opener.closed) window.opener.postMessage({ dd: "editor-ready" }, "*"); } catch(e){}

flowSteps("edit", [
  { key: "fsEdOpen", color: "get",  check: () => !!ED.name, target: "ed-open" },
  { key: "fsEdMark", color: "make", check: () => ED.marks.some(m => m.src !== "rec"), target: "ed-mark" },
  { key: "fsEdMemo", color: "edit", check: () => ED.marks.some(m => m.text.trim()) || ED.scenes.some(c => c.text.trim() || c.notes.some(n => n.text.trim())), target: "ed-list" },
  { key: "fsEdSave", color: "save", check: () => !!(ED.marks.length || ED.scenes.length) && !edDirty(), target: "ed-save" },
]);
const edTip = $e("ed-tip"); let edTipEl = null, edTipT = 0;
function edTipTake(el){ if (!el || el.nodeType !== 1 || !el.hasAttribute("title") || el.closest("svg")) return; el.dataset.tip = el.getAttribute("title"); el.removeAttribute("title"); }
function edTipScan(root){ edTipTake(root); if (root.querySelectorAll) root.querySelectorAll("[title]").forEach(edTipTake); }
new MutationObserver(list => list.forEach(m => { if (m.type === "attributes") edTipTake(m.target); else m.addedNodes.forEach(edTipScan); }))
  .observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["title"] });
function edTipHide(){ clearTimeout(edTipT); edTipEl = null; edTip.hidden = true; }
function edTipShow(el){
  const txt = el.dataset.tip || ""; if (!txt.trim()){ edTipHide(); return; }
  const i = txt.indexOf(" — "), b = edTip.querySelector("b"), sp = edTip.querySelector("span");
  if (i > 0 && i < 48){ b.textContent = txt.slice(0, i); sp.textContent = txt.slice(i + 3); b.hidden = false; } else { b.textContent = ""; b.hidden = true; sp.textContent = txt; }
  edTip.hidden = false;
  const r = el.getBoundingClientRect(), w = edTip.offsetWidth, h = edTip.offsetHeight, M = 8;
  let x = r.left + r.width / 2 - w / 2, y = r.bottom + 8;
  if (y + h > innerHeight - M) y = r.top - h - 8;
  x = Math.max(M, Math.min(innerWidth - w - M, x)); y = Math.max(M, y);
  edTip.style.left = x + "px"; edTip.style.top = y + "px";
}
let edTipBlock = null;
document.addEventListener("pointerover", e => {
  const el = e.target.closest && e.target.closest("[data-tip]");
  if (el === edTipEl) return;
  edTipHide();
  if (el && edTipBlock && (el === edTipBlock || el.id && el.id === edTipBlock.id || el.dataset.star && el.dataset.star === edTipBlock.dataset.star && el.className.split(" ")[0] === edTipBlock.className.split(" ")[0])) return;
  edTipBlock = null; if (!el) return;
  edTipEl = el; edTipT = setTimeout(() => { if (edTipEl === el && el.isConnected) edTipShow(el); }, 300);
});
document.addEventListener("pointerdown", e => { edTipHide(); edTipBlock = e.target.closest && e.target.closest("[data-tip]"); }, true);
document.addEventListener("wheel", edTipHide, { passive: true, capture: true });
window.addEventListener("blur", edTipHide);
edTipScan(document.body);

$e("lang-toggle").addEventListener("click", toggleLang);
onLangChange(edRenderAll); onLangChange(edOpenUi);
applyLang(); edOpenUi();
flowRender();
ED.savedSig = edSig();
edRenderAll();
