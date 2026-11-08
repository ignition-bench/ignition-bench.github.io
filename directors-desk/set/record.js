"use strict";

const REC_TYPES = ["video/mp4;codecs=avc1.640028", "video/mp4;codecs=avc1.4d0028", "video/mp4;codecs=avc1.42E01F", "video/mp4;codecs=avc1",
  "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
const REC_FPS = 30;
const REC = { on: false, count: 0, size: "720", fromStart: true, panel: null, last: null, mode: "camera" };
const recDirect = () => REC.mode === "drone" || REC.mode === "walk";
try { const o = JSON.parse(localStorage.getItem("dd-rec-opts") || "{}"); if (o.size === "1080") REC.size = "1080"; if (o.fromStart === false) REC.fromStart = false; } catch(e){}

function recType(){
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return null;
  for (const m of REC_TYPES) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch(e){} }
  return "";
}
const recIsMp4 = m => /^video\/mp4/.test(m || "");
function recFormatName(m){ return recIsMp4(m) ? "MP4 (H.264)" : /webm/.test(m || "") ? "WebM" : "?"; }
function recOutSize(){
  const R = camRatio(), L = REC.size === "1080" ? 1920 : 1280, S = REC.size === "1080" ? 1080 : 720;
  return R.w >= R.h ? { w: L, h: S } : { w: S, h: L };
}
const recClock = s => { const m = Math.floor(s / 60), r = s - m * 60; return m + ":" + (r < 10 ? "0" : "") + r.toFixed(1); };

const recBtn = document.getElementById("rec-btn"), recPop = document.getElementById("rec-pop");
function recPopRender(){
  const m = recType(), sz = recOutSize(), end = castTotal();
  document.getElementById("rec-size").value = REC.size;
  document.getElementById("rec-from0").checked = REC.fromStart;
  const f = document.getElementById("rec-format"), mp4 = m !== null && recIsMp4(m);
  f.textContent = m === null ? t("recNoSupport") : mp4 ? "" : t("recFmtWebm");
  f.classList.toggle("warn", !mp4); f.hidden = mp4;
  document.getElementById("rec-dims").textContent = sz.w + "×" + sz.h + " · " + CAMS.ratio + " · " + REC_FPS + " FPS" + (mp4 ? " · MP4 ✓" : "");
  const T0 = REC.fromStart || CAST.t >= end - 0.05 ? 0 : CAST.t, vlen = end > T0 ? spdVideoLen(T0, end) : 0;
  const lenTx = end <= 0 ? t("recLenFree") : Math.abs(vlen - (end - T0)) > 0.05 ? t("recLenSpd").replace("{s}", (end - T0).toFixed(1)).replace("{v}", vlen.toFixed(1)) : t("recLenScene").replace("{s}", end.toFixed(1));
  const cutTx = recDirect() ? "" : CUTS.list.length ? t("recCutsN").replace("{n}", CUTS.list.length) : t("recCuts0");
  document.getElementById("rec-len").textContent = lenTx + (cutTx ? " · " + cutTx : "");
  const ci = document.getElementById("rec-cuts-info"); ci.textContent = cutTx; ci.hidden = true;
  document.querySelectorAll("#rec-src [data-src]").forEach(b => { b.classList.toggle("on", b.dataset.src === REC.mode); b.disabled = b.dataset.src === "camera" && !CAMS.list.length; });
  document.getElementById("rec-src-note").textContent = t(REC.mode === "drone" ? "srcDroneNote" : REC.mode === "walk" ? "srcWalkNote" : "srcCameraNote");
  document.querySelector("#rec-pop .rp-keys").innerHTML = t(REC.mode === "drone" ? "recKeysDrone" : REC.mode === "walk" ? "recKeysWalk" : "recKeys");
  document.getElementById("rec-go").disabled = m === null || (REC.mode === "camera" && !CAMS.list.length);
  document.getElementById("rec-last").hidden = !recUnsaved();
}
function recPopToggle(show){
  if (show == null) show = recPop.hidden;
  if (show){
    if (REC.on) return;
    REC.mode = camMode === "drone" ? "drone" : camMode === "walk" ? "walk" : CAMS.list.length ? "camera" : "drone";
    recPopRender();
  }
  recPop.hidden = !show;
}
recBtn.addEventListener("click", e => { e.stopPropagation(); if (REC.on) recStop(); else recPopToggle(); });
document.addEventListener("pointerdown", e => { if (!recPop.hidden && !recPop.contains(e.target) && e.target !== recBtn) recPop.hidden = true; }, true);
const recSaveOpts = () => { try { localStorage.setItem("dd-rec-opts", JSON.stringify({ size: REC.size, fromStart: REC.fromStart })); } catch(e){} };
document.getElementById("rec-size").addEventListener("change", e => { REC.size = e.target.value === "1080" ? "1080" : "720"; recSaveOpts(); recPopRender(); });
document.getElementById("rec-from0").addEventListener("change", e => { REC.fromStart = e.target.checked; recSaveOpts(); });
document.getElementById("rec-go").addEventListener("click", () => { recPop.hidden = true; recStart(); });
document.querySelectorAll("#rec-src [data-src]").forEach(b => b.addEventListener("click", () => { if (b.disabled) return; REC.mode = b.dataset.src; recPopRender(); }));
document.getElementById("rec-x").addEventListener("click", () => { recPop.hidden = true; });

function recStart(){
  const mime = recType();
  if (mime === null){ showToast(t("recNoSupport")); return; }
  if (REC.mode === "camera" && !CAMS.list.length){ showToast(t("recNeedCam")); return; }
  recDone.hidden = true;
  if (typeof SETV !== "undefined" && SETV.view === "2d") setView("split");
  if (!threeInited) return;
  if (REC.mode === "drone"){ if (camMode !== "drone") droneEnter(); }
  else if (REC.mode === "walk"){ if (camMode !== "walk") setCamMode("walk"); }
  else if (camMode !== "cam") setCamMode("cam");
  tlPlay(false);
  requestAnimationFrame(() => recBegin(mime));
}
function recBegin(mime){
  const box = camFrameBox();
  if (!box || box.w < 20){ showToast(t("recNo3d")); return; }
  const sz = recOutSize(), cv = document.createElement("canvas");
  cv.width = sz.w; cv.height = sz.h;
  const ctx = cv.getContext("2d"); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, sz.w, sz.h);
  const stream = cv.captureStream(0), track = stream.getVideoTracks()[0];
  const manual = !!(track && typeof track.requestFrame === "function");
  const useStream = manual ? stream : cv.captureStream(REC_FPS);
  let rec;
  try { rec = new MediaRecorder(useStream, Object.assign(mime ? { mimeType: mime } : {}, { videoBitsPerSecond: REC.size === "1080" ? 10e6 : 6e6 })); }
  catch(err){ showToast(t("recFail") + " (" + (err && err.message || err) + ")"); return; }
  const end = castTotal();
  let T0 = REC.fromStart ? 0 : CAST.t; if (end > 0 && T0 >= end - 0.05) T0 = 0;
  Object.assign(REC, { on: true, mime: rec.mimeType || mime, rec, cv, ctx, track: manual ? track : null, chunks: [], bytes: 0,
    W: sz.w, H: sz.h, T0, end: end > T0 ? end : Infinity, t0: 0, frames: 0, lastCap: 0, lastF: 0, lastSample: 0, lastUi: 0,
    markers: [], samples: [], longs: [], src: { w: 0, h: 0 }, upscaled: false, stopping: false, stopReason: "", dropped: 0, elapsed: 0 });
  rec.ondataavailable = e => { if (e.data && e.data.size){ REC.chunks.push(e.data); REC.bytes += e.data.size; } };
  rec.onstop = recFinish;
  rec.onerror = e => { showToast(t("recFail")); console.error(e); };
  CUTS.sel = null; CAMS.sel = null; if (CAST.sel || CAST.selClip){ CAST.sel = null; CAST.selClip = null; CAST.selPt = null; castRender2D(); }
  if (selectedIds.length){ selectedIds = []; renderSelection(); }
  updatePropPanel();
  castSetTime(T0); cast3dSync();
  liveScreen.classList.add("recording");
  if (typeof camFrameLayout === "function") camFrameLayout();
  document.getElementById("rec-bar").hidden = false;
  perfEv(t("ev_recStart"));
  recBtn.classList.add("on"); recBtn.textContent = t("recStopBtn");
  rec.start(1000);
  REC.t0 = performance.now();
  SET3D.dirty = true;
  recUi(true);
}

function recTick(){
  if (!REC.on || REC.stopping) return;
  const el = (performance.now() - REC.t0) / 1000;
  let T = spdAdvance(REC.T0, el);
  if (T >= REC.end){ T = REC.end; REC.stopping = true; REC.stopReason = "end"; }
  if (Math.abs(T - CAST.t) > 1e-4) castSetTime(T);
  SET3D.selBoxes.forEach(b => { b.visible = false; });
}
function recFrame(){
  if (!REC.on) return;
  const now = performance.now(), el = (now - REC.t0) / 1000;
  REC.elapsed = el;
  if (REC.lastF){ const gap = now - REC.lastF; if (gap > PERF_LONG.min) REC.longs.push({ t: +el.toFixed(2), ms: Math.round(gap), sceneT: +CAST.t.toFixed(2) }); }
  REC.lastF = now;
  if (!REC.lastCap || now - REC.lastCap >= 1000 / REC_FPS - 4 || REC.stopping){
    const cvs = V3.renderer.domElement, box = camFrameBoxIn(cvs.clientWidth, cvs.clientHeight);
    if (box){
      const kx = cvs.width / cvs.clientWidth, ky = cvs.height / cvs.clientHeight;
      const sw = box.w * kx, sh = box.h * ky;
      REC.ctx.drawImage(cvs, box.x * kx, box.y * ky, sw, sh, 0, 0, REC.W, REC.H);
      REC.src = { w: Math.round(sw), h: Math.round(sh) }; REC.upscaled = sw < REC.W * 0.9;
      if (REC.track) REC.track.requestFrame();
      REC.frames++; REC.lastCap = now;
    }
  }
  if (now - REC.lastSample >= 500){
    REC.lastSample = now;
    REC.samples.push({ t: +el.toFixed(2), fps: Math.round(PERF.now.fps || 0), res: typeof DRS !== "undefined" ? Math.round(DRS.scale * 100) : 100, fsr: typeof DRS !== "undefined" && DRS.fsr ? 1 : 0, cam: recCamName() });
  }
  REC.dropped = Math.max(0, Math.round(el * REC_FPS) - REC.frames);
  if (now - REC.lastUi > 250) recUi();
  if (REC.stopping) recStop();
}
function recCamName(){ return recDirect() ? t(REC.mode === "drone" ? "srcDrone" : "srcWalk") : typeof camLabel === "function" ? camLabel(camActive()) : (camActive() || {}).name || ""; }
function recUi(force){
  REC.lastUi = performance.now();
  document.getElementById("rec-time").textContent = recClock(REC.elapsed || 0) + (isFinite(REC.end) ? " / " + recClock(spdVideoLen(REC.T0, REC.end)) : "");
  document.getElementById("rec-marks").textContent = "📍 " + REC.markers.length;
  renderPerfPanel();
}
PERF_EXTRA = () => {
  if (!REC.on) return null;
  const bad = REC.dropped > REC_FPS / 2;
  return {
    mini: "⏺ " + REC.W + "×" + REC.H + " " + recFormatName(REC.mime) + " · " + (REC.bytes / 1048576).toFixed(1) + "MB · <b class=\"" + (bad ? "bad" : "ok") + "\">" + t("recDropped").replace("{n}", REC.dropped) + "</b>",
    warn: REC.upscaled ? t("recUpscaled").replace("{s}", REC.src.w + "×" + REC.src.h) : "",
    alert: bad,
    full: t("recPerfFull").replace("{s}", REC.src.w + "×" + REC.src.h).replace("{f}", REC.frames).replace("{e}", Math.round(REC.elapsed * REC_FPS)).replace("{m}", REC.markers.length),
  };
};

function recMark(){
  if (!REC.on) return;
  const th = document.createElement("canvas"), k = 240 / Math.max(REC.W, REC.H);
  th.width = Math.round(REC.W * k); th.height = Math.round(REC.H * k);
  th.getContext("2d").drawImage(REC.cv, 0, 0, th.width, th.height);
  REC.markers.push({ n: REC.markers.length + 1, t: +REC.elapsed.toFixed(2), sceneT: +CAST.t.toFixed(2), cam: recCamName(), img: th.toDataURL("image/jpeg", 0.7), memo: "" });
  perfEv(t("ev_recMark"));
  const f = document.getElementById("rec-flash"); f.classList.remove("go"); void f.offsetWidth; f.classList.add("go");
  recUi();
}

function recStop(){
  if (!REC.on) return;
  if (!REC.stopReason) REC.stopReason = "user";
  REC.on = false;
  try { if (REC.rec.state !== "inactive") REC.rec.stop(); } catch(e){ recFinish(); }
  liveScreen.classList.remove("recording");
  if (typeof camFrameLayout === "function") setTimeout(camFrameLayout, 0);
  document.getElementById("rec-bar").hidden = true;
  renderPerfPanel();
  recBtn.classList.remove("on"); recBtn.textContent = t("recBtn");
  perfEv(t("ev_recStop"));
  cast3dSync(); SET3D.selBoxes.forEach(b => { b.visible = true; }); SET3D.dirty = true;
  if (typeof renderSelection === "function") renderSelection();
  tlHeadRender();
}
function recBaseName(){
  const d = new Date(), p2 = n => String(n).padStart(2, "0");
  return (safeName(CAST.sceneName) || safeName(setName) || "directors-desk") + "_" + p2(d.getMonth() + 1) + p2(d.getDate()) + "-" + p2(d.getHours()) + p2(d.getMinutes());
}
function recResDrops(samples){
  const out = []; let cur = null;
  samples.forEach(s => {
    if (s.res < 100){ if (!cur) cur = { from: s.t, to: s.t, min: s.res }; else { cur.to = s.t; cur.min = Math.min(cur.min, s.res); } }
    else if (cur){ out.push(cur); cur = null; }
  });
  if (cur) out.push(cur);
  return out;
}
function recFinish(){
  const R = REC, mime = (R.rec && R.rec.mimeType) || R.mime || "video/webm";
  const ext = recIsMp4(mime) ? "mp4" : "webm", base = recBaseName();
  const blob = new Blob(R.chunks, { type: mime.split(";")[0] });
  const vname = base + "." + ext, jname = base + ".rec.json";
  const dur = +R.elapsed.toFixed(2), exp = Math.round(R.elapsed * REC_FPS);
  const log = { kind: "dd-rec", version: 1, about: FILE_ABOUT.rec,
    video: vname, format: mime, recMode: REC.mode, size: [R.W, R.H], ratio: CAMS.ratio, fps: REC_FPS, duration: dur,
    scene: CAST.sceneName || "", set: setName || "", sceneStart: +R.T0.toFixed(2), sceneEnd: +CAST.t.toFixed(2), stop: R.stopReason,
    cameras: CAMS.list.map(c => c.name), cuts: typeof cutToObj === "function" ? cutToObj() : undefined, speeds: spdToObj(),
    frames: R.frames, expectedFrames: exp, dropped: Math.max(0, exp - R.frames), bytes: blob.size,
    source: [R.src.w, R.src.h], upscaled: R.upscaled,
    markers: R.markers, longs: R.longs, resDrops: recResDrops(R.samples), samples: R.samples,
    perfText: perfReport() };
  recDiscard(true);
  const jblob = new Blob([JSON.stringify(log, null, 1)], { type: "application/json" });
  R.last = { blob, jblob, log, vname, jname, url: URL.createObjectURL(blob), jurl: URL.createObjectURL(jblob), savedV: false, savedJ: false, where: "" };
  const L = R.last;
  L.fixing = (typeof MP4FIX !== "undefined" ? MP4FIX.fixBlob(blob) : Promise.resolve(blob)).then(fb => {
    if (fb !== blob && fb && fb.size){
      L.url0 = L.url; L.blob = fb; L.url = URL.createObjectURL(fb); L.fixed = true;
      L.log.bytes = fb.size; L.log.mp4 = "plain";
      URL.revokeObjectURL(L.jurl); L.jblob = new Blob([JSON.stringify(L.log, null, 1)], { type: "application/json" }); L.jurl = URL.createObjectURL(L.jblob);
    }
  }).catch(() => {});
  R.count++;
  R.chunks = []; R.rec = null; R.cv = null; R.ctx = null; R.track = null;
  recDoneOpen();
}
function recDownload(name, blob, url){
  const a = document.createElement("a"), u = url || URL.createObjectURL(blob);
  a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  if (!url) setTimeout(() => URL.revokeObjectURL(u), 60000);
}
function recDiscard(quiet){
  const L = REC.last; if (!L) return;
  const v = document.getElementById("rd-video"); if (v){ v.pause(); v.removeAttribute("src"); v.load(); }
  setTimeout(() => { URL.revokeObjectURL(L.url); URL.revokeObjectURL(L.jurl); if (L.url0) URL.revokeObjectURL(L.url0); }, 1000);
  REC.last = null;
  document.getElementById("rec-done").hidden = true;
  if (!quiet) showToast(t("rdDiscarded"));
}
const recUnsaved = () => !!(REC.last && !REC.last.savedV);

const recDone = document.getElementById("rec-done");
function recDoneOpen(){ recDoneRender(); recDone.style.bottom = (tlBar.getBoundingClientRect().height + 12) + "px"; recDone.hidden = false; const v = document.getElementById("rd-video");
  if (REC.last && !REC.last.blob.size){ v.removeAttribute("src"); v.load(); return; }
  if (REC.last && v.getAttribute("src") !== REC.last.url) v.src = REC.last.url; }
function recDoneRender(){
  const L = REC.last; if (!L) return;
  const g = L.log;
  document.getElementById("rd-info").textContent = t("recDetailShort").replace("{f}", recFormatName(g.format)).replace("{w}", g.size[0] + "×" + g.size[1]).replace("{d}", g.duration.toFixed(1)).replace("{m}", g.markers.length).replace("{x}", g.dropped).replace("{mb}", (g.bytes / 1048576).toFixed(1));
  document.getElementById("rd-names").textContent = L.vname + "  +  " + L.jname;
  const st = document.getElementById("rd-state");
  st.textContent = !L.blob.size ? t("rdEmpty") : L.savedV && L.savedJ ? t("rdSavedBoth").replace("{w}", L.where) : L.savedV ? t("rdSavedVideo") : t("rdNotSaved");
  st.classList.toggle("ok", L.savedV && L.savedJ); st.classList.toggle("warn", !L.savedV);
  const can = typeof window.showDirectoryPicker === "function";
  const fb = document.getElementById("rd-folder"); fb.hidden = !can;
  fb.textContent = REC.dir ? t("rdToFolder").replace("{n}", REC.dir.name) : t("rdPickFolder");
  document.getElementById("rd-folder-change").hidden = !can || !REC.dir;
  document.getElementById("rd-video-btn").classList.toggle("done", L.savedV);
  document.getElementById("rd-log-btn").classList.toggle("done", L.savedJ);
  document.getElementById("rd-webm").hidden = recIsMp4(g.format);
  document.getElementById("rd-notes").disabled = !L.blob.size;
}
async function recPickDir(){
  try { REC.dir = await window.showDirectoryPicker({ id: "dd-rec", mode: "readwrite" }); return true; } catch(e){ return false; }
}
async function recSaveToFolder(change){
  const L = REC.last; if (!L) return;
  if ((change || !REC.dir) && !(await recPickDir())){ recDoneRender(); return; }
  try {
    await L.fixing;
    if (REC.dir.requestPermission && (await REC.dir.requestPermission({ mode: "readwrite" })) !== "granted") throw new Error("permission");
    for (const [name, blob] of [[L.vname, L.blob], [L.jname, L.jblob]]){
      const fh = await REC.dir.getFileHandle(name, { create: true }), w = await fh.createWritable();
      await w.write(blob); await w.close();
    }
    L.savedV = L.savedJ = true; L.where = REC.dir.name;
    recSavedCard();
  } catch(err){ console.error(err); showToast(t("rdFolderFail")); }
  recDoneRender();
}
async function recSaveOne(which){
  const L = REC.last; if (!L) return;
  await L.fixing;
  if (which === "v"){ recDownload(L.vname, L.blob, L.url); L.savedV = true; }
  else { recDownload(L.jname, L.jblob, L.jurl); L.savedJ = true; }
  L.where = t("rdDownloads");
  if (L.savedV && L.savedJ) recSavedCard();
  recDoneRender();
}
function recSavedCard(){
  const L = REC.last, g = L.log;
  if (typeof fileCard === "function") fileCard("rec", L.vname, t("recDetail").replace("{d}", g.duration.toFixed(1)).replace("{m}", g.markers.length).replace("{x}", g.dropped).replace("{f}", recFormatName(g.format)));
}
document.getElementById("rd-folder").addEventListener("click", () => recSaveToFolder(false));
document.getElementById("rd-folder-change").addEventListener("click", () => recSaveToFolder(true));
document.getElementById("rd-video-btn").addEventListener("click", () => recSaveOne("v"));
document.getElementById("rd-log-btn").addEventListener("click", () => recSaveOne("j"));
document.getElementById("rd-discard").addEventListener("click", () => recDiscard(false));
document.getElementById("rd-close").addEventListener("click", () => { recDone.hidden = true; const v = document.getElementById("rd-video"); if (v) v.pause(); if (recUnsaved()) showToast(t("rdLater")); });
document.getElementById("rec-last-open").addEventListener("click", () => { recPop.hidden = true; recDoneOpen(); });
let recHand = null;
async function recOpenInNotes(){
  const L = REC.last; if (!L || !L.blob.size) return;
  const ew = typeof ddEditorWin === "function" ? ddEditorWin() : null;
  if (!ew){ showToast(t("rdFolderFail")); return; }
  const w = ew.w;
  await L.fixing;
  const msg = { dd: "open-rec", id: "r" + Date.now(), blob: L.blob, name: L.vname, rec: L.log, recName: L.jname };
  recHand = { w, msg, tries: 0 };
  const send = () => { if (!recHand || recHand.msg !== msg) return; try { w.postMessage(msg, "*"); } catch(e){} if (++recHand.tries < 40) setTimeout(send, 250); else recHand = null; };
  setTimeout(send, 300);
  try { w.focus(); } catch(e){}
}
window.addEventListener("message", e => {
  const d = e.data; if (!d || !recHand) return;
  if (d.dd === "editor-ready"){ try { recHand.w.postMessage(recHand.msg, "*"); } catch(err){} }
  if (d.dd === "open-rec-ok" && d.id === recHand.msg.id) recHand = null;
});
document.getElementById("rd-notes").addEventListener("click", e => { e.currentTarget.blur(); recOpenInNotes(); });
window.addEventListener("beforeunload", e => { if (recUnsaved()){ e.preventDefault(); e.returnValue = ""; } });
document.getElementById("rec-stop").addEventListener("click", recStop);

{ const p0 = tlPlay; tlPlay = function(on){ if (REC.on) return; p0(on); }; }
window.addEventListener("keydown", e => {
  if (APP.screen !== "set" || typingNow()) return;
  if (e.code === "KeyM" && !e.ctrlKey && !e.metaKey && !e.altKey){
    if (REC.on){ e.preventDefault(); e.stopImmediatePropagation(); recMark(); }
    return;
  }
  if (!REC.on) return;
  if (e.key === "Escape"){ e.preventDefault(); e.stopImmediatePropagation(); recStop(); }
  else if (e.code === "KeyP"){ e.preventDefault(); e.stopImmediatePropagation(); }
}, true);
document.addEventListener("visibilitychange", () => { if (document.hidden && REC.on){ REC.stopReason = "hidden"; recStop(); } });
{ const w0 = PERF_WHERE; PERF_WHERE = () => (typeof camMode !== "undefined" && camMode === "cam" ? w0().replace(/돌려 보기/, "카메라 눈") : w0()) + (REC.on ? " · 녹화" : ""); }
onLangChange(() => { if (!REC.on) recBtn.textContent = t("recBtn"); if (!recPop.hidden) recPopRender(); if (!recDone.hidden) recDoneRender(); });

function liveBarsFit(){
  const L = document.getElementById("live-left"), Rr = document.getElementById("live-right");
  if (!L || !Rr || !liveScreen.clientWidth) return;
  if (!liveScreen.classList.contains("recording")){
    liveScreen.classList.add("bars-one");
    if (L.scrollWidth + Rr.scrollWidth + 34 > liveScreen.clientWidth) liveScreen.classList.remove("bars-one");
  }
  const need = L.scrollWidth + Rr.scrollWidth + 34;
  const stack = need > liveScreen.clientWidth;
  liveScreen.classList.toggle("bars-stack", stack);
  Rr.style.top = stack ? (L.offsetTop + L.offsetHeight + 6) + "px" : "";
  recPop.style.top = (Rr.offsetTop + Rr.offsetHeight + 8) + "px";
  recPop.style.maxHeight = Math.max(90, liveScreen.clientHeight - (Rr.offsetTop + Rr.offsetHeight + 8) - 10) + "px";
  if (!liveScreen.classList.contains("recording") && L.offsetHeight && Rr.offsetHeight){
    const hh = Math.round(Math.max(L.offsetTop + L.offsetHeight, Rr.offsetTop + Rr.offsetHeight) + 8);
    if (liveScreen.style.getPropertyValue("--lhead") !== hh + "px") liveScreen.style.setProperty("--lhead", hh + "px");
  }
  if (orbitHint) orbitHint.style.top = (Rr.offsetTop + Rr.offsetHeight + 8) + "px";
}
if (window.ResizeObserver){
  const ro = new ResizeObserver(liveBarsFit);
  ro.observe(liveScreen); ro.observe(document.getElementById("live-left")); ro.observe(document.getElementById("live-right"));
}
{ const u0 = updateLiveUi; updateLiveUi = function(){ u0(); liveBarsFit(); }; }
liveBarsFit();
onLangChange(liveBarsFit);
recBtn.textContent = t("recBtn");
