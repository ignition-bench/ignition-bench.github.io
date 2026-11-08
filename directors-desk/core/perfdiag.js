"use strict";

const PERF = {
  budget: 1000 / 60,
  last: 0, f0: 0,
  win: [], workWin: [],
  ev: [],
  longs: [],
  loads: [],
  minute: null, minutes: [],
  loadUntil: 0, loadFrames: 0,
  shown: 0, paused: true, now: { fps: 0, work: 0, interval: 0, head: 0 },
};
const PERF_LONG = { min: 50, mul: 2, evWin: 500 };
let PERF_ACTIVE = () => true;
let PERF_WHERE = () => "3D";

function perfEv(name){ const t = performance.now(); PERF.ev.push({ t, name }); while (PERF.ev.length && t - PERF.ev[0].t > 2000) PERF.ev.shift(); }
function perfLoading(label){ perfEv(label); PERF.loadUntil = performance.now() + 1500; PERF.loadFrames = 10; }
function perfResume(){ PERF.last = 0; PERF.win.length = 0; PERF.workWin.length = 0; }

function perfFrameStart(){ PERF.f0 = performance.now(); if (V3.renderer) V3.renderer.info.reset(); }
function perfCounting(){ return !document.hidden && PERF_ACTIVE(); }
function perfFrameEnd(){
  const t = performance.now(), work = t - PERF.f0, gap = PERF.last ? t - PERF.last : 0; PERF.last = t;
  if (!gap || gap > 3000 || !perfCounting()){
    PERF.paused = true; if (t - PERF.shown > 500){ PERF.shown = t; renderPerfPanel(); }
    return;
  }
  PERF.paused = false;
  const base = PERF.win.length >= 5 ? PERF.win.slice().sort((a, b) => a - b)[Math.floor(PERF.win.length / 2)] : PERF.budget;
  const isLong = gap > PERF_LONG.min && gap > base * PERF_LONG.mul;
  PERF.win.push(gap); PERF.workWin.push(work);
  let sum = PERF.win.reduce((a, b) => a + b, 0);
  while (PERF.win.length > 1 && sum > 1000){ sum -= PERF.win.shift(); PERF.workWin.shift(); }
  const loading = t < PERF.loadUntil || PERF.loadFrames > 0;
  if (PERF.loadFrames > 0) PERF.loadFrames--;
  if (isLong){
    const evs = {}; for (const e of PERF.ev) if (t - e.t <= PERF_LONG.evWin + gap) evs[e.name] = (evs[e.name] || 0) + 1;
    const what = Object.entries(evs).map(([k, n]) => (n > 1 ? `${k}×${n}` : k)).join(", ") || t_("ev_none");
    const ri = V3.renderer ? V3.renderer.info.render : { calls: 0, triangles: 0 };
    const rec = { t: diagClock(), where: PERF_WHERE(), ms: Math.round(gap), work: Math.round(work), what, calls: ri.calls, tris: ri.triangles,
      res: typeof DRS !== "undefined" ? Math.round(DRS.scale * 100) : 100 };
    if (loading){ rec.load = true; PERF.loads.push(rec); if (PERF.loads.length > 10) PERF.loads.shift(); }
    else { PERF.longs.push(rec); if (PERF.longs.length > 50) PERF.longs.shift(); }
  }
  const M = PERF.minute || (PERF.minute = { t0: t, gaps: [], work: 0, longs: 0, scale: 0 });
  if (!loading){ M.gaps.push(gap); M.work += work; M.scale += typeof DRS !== "undefined" ? DRS.scale : 1; if (isLong) M.longs++; }
  if (t - M.t0 >= 60000) perfCloseMinute();
  if (t - PERF.shown > 500){ PERF.shown = t; perfNow(); renderPerfPanel(); }
}
const t_ = k => (typeof t === "function" ? t(k) : k);
function perfStats(gaps){
  if (!gaps.length) return null;
  const s = gaps.slice().sort((a, b) => a - b), tot = gaps.reduce((a, b) => a + b, 0);
  const low = s.slice(Math.floor(s.length * 0.99));
  const lowAvg = low.reduce((a, b) => a + b, 0) / low.length;
  return { fps: gaps.length / (tot / 1000), low1: 1000 / lowAvg, med: s[Math.floor(s.length / 2)] };
}
function perfCloseMinute(){
  const M = PERF.minute; PERF.minute = null; if (!M || M.gaps.length < 30) return;
  const st = perfStats(M.gaps), work = M.work / M.gaps.length;
  PERF.minutes.push({ idx: PERF.minutes.length + 1, at: diagClock(), where: PERF_WHERE(), fps: Math.round(st.fps), low1: Math.round(st.low1), longs: M.longs,
    work: +work.toFixed(1), head: perfHeadroom(work, st.med), res: Math.round(M.scale / M.gaps.length * 100) });
  if (PERF.minutes.length > 30) PERF.minutes.shift();
}
function perfHeadroom(work, med){
  if (med > PERF.budget * 1.1) return 0;
  return Math.max(0, Math.round((1 - work / PERF.budget) * 100));
}
function perfNow(){
  const n = PERF.win.length; if (!n) return;
  const s = PERF.win.slice().sort((a, b) => a - b), w = PERF.workWin.slice().sort((a, b) => a - b);
  PERF.now = { fps: 1000 / s[Math.floor(n / 2)], interval: s[Math.floor(n / 2)], work: w[Math.floor(n / 2)] };
  PERF.now.head = perfHeadroom(PERF.now.work, PERF.now.interval);
}

let PERF_EXTRA = () => null;
const PERFUI = { state: "btn", el: null };
try { const v = localStorage.getItem("dd-perf-ui"); if (v === "mini" || v === "full") PERFUI.state = v; } catch(e){}
const PERF_PANELS = [];
function perfPanelMount(container, opts){
  const el = document.createElement("div");
  el.className = "perf-panel";
  el.innerHTML = '<h3><span class="perf-h"></span><span class="perf-hbtns"><button type="button" class="perf-more"></button><button type="button" class="perf-close">✕</button></span></h3>'
    + '<div class="perf-state"></div><div class="perf-xmini"></div><div class="perf-xwarn"></div>'
    + '<div class="perf-full"><div class="perf-state2"></div><div class="perf-xfull"></div><ul class="perf-log"></ul>'
    + '<div class="perf-sub perf-warm"></div><ul class="perf-slog"></ul>'
    + '<button type="button" class="perf-copy"></button><textarea class="perf-text" hidden readonly></textarea></div>';
  container.appendChild(el);
  el.querySelector(".perf-copy").addEventListener("click", e => { e.currentTarget.blur(); perfCopy(el); });
  el.querySelector(".perf-more").addEventListener("click", e => { e.currentTarget.blur(); perfUiSet(PERFUI.state === "full" ? "mini" : "full"); });
  el.querySelector(".perf-close").addEventListener("click", e => { e.currentTarget.blur(); if (opts && opts.onClose) opts.onClose(); else perfUiSet("btn"); });
  PERF_PANELS.push(el);
  renderPerfPanel();
  return el;
}
function perfDock(){
  if (!PERFUI.el){
    const d = document.createElement("div"); d.id = "perf-dock";
    const pill = document.createElement("button"); pill.type = "button"; pill.className = "perf-pill";
    pill.addEventListener("click", e => { e.currentTarget.blur(); perfUiSet("mini"); });
    d.appendChild(pill);
    PERFUI.el = d; perfPanelMount(d);
  }
  const host = V3.host;
  if (host && PERFUI.el.parentNode !== host) host.appendChild(PERFUI.el);
  perfUiApply();
}
function perfUiApply(){
  const d = PERFUI.el; if (!d) return;
  d.hidden = !V3.host;
  d.classList.toggle("full", PERFUI.state === "full");
  d.classList.toggle("btn", PERFUI.state === "btn");
  const X = PERF_EXTRA() || {}, warn = !!(X.warn || X.alert);
  const pill = d.querySelector(".perf-pill");
  if (pill){ pill.textContent = (warn ? "⚠ " : "📊 ") + t_("perfTitle"); pill.classList.toggle("warn", warn); pill.title = t_(warn ? "perfPillWarn" : "perfPillTitle"); }
  const b = d.querySelector(".perf-more"); if (b) b.textContent = t_(PERFUI.state === "full" ? "perfLess" : "perfMore");
  let bottom = "";
  const mb = V3.host && V3.host.id === "actor-view" ? document.getElementById("motion-bar") : null;
  if (mb && mb.offsetParent){ const hr = V3.host.getBoundingClientRect(), mr = mb.getBoundingClientRect(); if (mr.height) bottom = Math.max(10, Math.round(hr.bottom - mr.top + 44)) + "px"; }
  if (d.style.bottom !== bottom) d.style.bottom = bottom;
}
function perfUiSet(st){
  PERFUI.state = st; try { localStorage.setItem("dd-perf-ui", st); } catch(e){}
  perfDock(); renderPerfPanel();
}
function renderPerfPanel(){
  if (!PERF_PANELS.length) return;
  const N = PERF.now, busy = N.interval > PERF.budget * 1.1;
  const lng = PERF.longs, worst = lng.reduce((a, r) => Math.max(a, r.ms), 0);
  const res = typeof DRS !== "undefined" ? DRS : null;
  const last = PERF.minutes[PERF.minutes.length - 1];
  const state = (N.fps ? `${t_("perfFrame")}: <b>${N.work.toFixed(1)}ms</b> / ${PERF.budget.toFixed(1)}ms · ${busy ? `<b class="bad">${t_("perfBusy")}</b>` : `${t_("perfHead")} <b class="${N.head < 20 ? "bad" : "ok"}">${N.head}%</b>`} · ${Math.round(N.fps)} FPS` : t_("perfNotYet"))
    + ((PERF.paused || !PERF_ACTIVE()) && N.fps ?` <span class="perf-sub">${t_("perfPaused")}</span>` : "")
    + (res ? `<br>${t_("perfRes")}: <b>${Math.round(res.scale * 100)}%</b> (${V3.sw}×${V3.sh})${res.fsr ? ` · <b>${t_("perfFsrOn")}</b>` : ""}${res.note ? " · " + t_("perfRaiseHold") : ""}` : "");
  const state2 = `${t_("perfLongs")}: <b class="${lng.length ? "bad" : "ok"}">${lng.length}${t_("perfTimes")}</b>${lng.length ? ` · ${t_("perfWorst")} ${worst}ms` : ""}${PERF.loads.length ? ` · ${t_("perfLoads")} ${PERF.loads.length}${t_("perfTimes")}${t_("perfLoadsSep")}` : ""}`
    + (last ? `<br>${t_("perfLastMin")}: ${t_("perfAvg")} ${last.fps} FPS · ${t_("perfLow1")} ${last.low1} FPS · ${t_("perfLongs")} ${last.longs}${t_("perfTimes")}` : "");
  const L = lng.slice(-8).reverse();
  const longsHtml = L.map(r => `<li>${r.t} — <b>${r.ms}ms</b> · ${escHtml(r.what)}</li>`).join("") || `<li class="none">${t_("perfNoLongs")}</li>`;
  const warm = !WARM.done ? t_("perfWarmPending")
    : `${t_("perfWarm")}: <b>${(WARM.ms / 1000).toFixed(2)}s</b> · ${t_("perfShaders")} ${WARM.progs}`
      + `<br>${t_("perfNewShaders")}: <b class="${diagNew() ? "bad" : "ok"}">${diagNew()}</b>${diagNew() ? "" : " " + t_("perfGoal0")}`;
  const slog = DIAG.log.slice(-6).map(e => `<li>${e.t} — +${e.n} (${escHtml(e.what)})</li>`).join("") || `<li class="none">${t_("perfNoShaderLog")}</li>`;
  const X = PERF_EXTRA() || {};
  for (const el of PERF_PANELS){
    el.querySelector(".perf-h").textContent = t_("perfTitle");
    el.querySelector(".perf-state").innerHTML = state;
    el.querySelector(".perf-state2").innerHTML = state2;
    const xm = el.querySelector(".perf-xmini"); xm.innerHTML = X.mini || ""; xm.hidden = !X.mini;
    const xw = el.querySelector(".perf-xwarn"); xw.textContent = X.warn || ""; xw.hidden = !X.warn;
    const xf = el.querySelector(".perf-xfull"); xf.innerHTML = X.full || ""; xf.hidden = !X.full;
    el.querySelector(".perf-log").innerHTML = longsHtml;
    el.querySelector(".perf-warm").innerHTML = warm;
    el.querySelector(".perf-slog").innerHTML = slog;
    el.querySelector(".perf-copy").textContent = t_("perfCopy");
    el.querySelector(".perf-more").title = t_("perfMoreTitle");
    el.querySelector(".perf-close").title = t_("perfCloseTitle");
  }
  perfUiApply();
}
function escHtml(s){ return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

function perfReport(){
  const d = new Date(), p2 = n => String(n).padStart(2, "0");
  const ver = (document.title.match(/v[\d.]+/) || ["?"])[0];
  const N = PERF.now, L = [
    `[디렉터스 데스크 ${ver} · 성능 기록]`,
    `날짜: ${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())} · 켠 뒤 ${diagClock()}`,
    `브라우저: ${navigator.userAgent.replace(/^Mozilla\/5\.0 /, "")}`,
    `그래픽 칩: ${V3.gpu || "(3D 아직 안 씀)"}${V3.soft ? " · 그래픽 가속 꺼짐" : ""}`,
    `화면: ${screen.width}×${screen.height} · 배율 ${(window.devicePixelRatio || 1).toFixed(2)} · 화면 틀 ${V3.w}×${V3.h} → 그리는 해상도 상한 ${V3.rw}×${V3.rh} (최대 ${V3.maxW}×${V3.maxH})`,
    `워밍업: ${WARM.done ? (WARM.ms / 1000).toFixed(2) + "초 · 셰이더 준비 " + WARM.progs + "개 · 마지막 장면 미리 그리기 " + (WARM.sceneMs / 1000).toFixed(2) + "초" : "아직"}`,
    `걷는 중 새 셰이더: ${diagNew()}개`,
  ];
  for (const e of DIAG.log) L.push(`- ${e.t} ${e.where} · +${e.n} (${e.what})`);
  L.push(`프레임 (지금): ${N.work ? N.work.toFixed(1) : "?"}ms / ${PERF.budget.toFixed(1)}ms · 여유 ${N.interval > PERF.budget * 1.1 ? "없음(그래픽 칩이 바쁨)" : (N.head || 0) + "%"} · ${Math.round(N.fps || 0)} FPS`);
  if (typeof DRS !== "undefined") L.push(`해상도 (지금): ${Math.round(DRS.scale * 100)}% (${V3.sw}×${V3.sh})${DRS.fsr ? " · FSR 켜짐" : ""} · 바뀐 횟수 ${DRS.changes}`);
  L.push(`끊김: ${PERF.longs.length}번${PERF.loads.length ? ` (로딩 ${PERF.loads.length}번은 따로)` : ""}`);
  for (const r of PERF.longs) L.push(`- ${r.t} ${r.where} · ${r.ms}ms (일 ${r.work}ms, 그리기 ${r.calls}번·${Math.round(r.tris / 1000)}천 삼각형, 해상도 ${r.res}%) · ${r.what}`);
  if (PERF.loads.length){ L.push("로딩:"); for (const r of PERF.loads) L.push(`- ${r.t} ${r.where} · ${r.ms}ms · ${r.what}`); }
  const mins = PERF.minutes.slice();
  if (PERF.minute && PERF.minute.gaps.length >= 30){
    const st = perfStats(PERF.minute.gaps), M = PERF.minute, work = M.work / M.gaps.length;
    mins.push({ idx: "지금", at: diagClock(), where: PERF_WHERE(), fps: Math.round(st.fps), low1: Math.round(st.low1), longs: M.longs, work: +work.toFixed(1), head: perfHeadroom(work, st.med), res: Math.round(M.scale / M.gaps.length * 100) });
  }
  if (mins.length){ L.push("1분 요약 (평균 FPS / 하위 1% FPS / 끊김 / 일 ms / 여유 / 해상도):"); for (const m of mins) L.push(`- ${m.idx === "지금" ? "지금" : m.idx + "분째"} (${m.at} ${m.where}) ${m.fps} / ${m.low1} / ${m.longs}번 / ${m.work}ms / ${m.head}% / ${m.res}%`); }
  L.push("(끊긴 순간을 한 줄로 덧붙여 주세요. 예: 천장을 끈 직후 툭)");
  return L.join("\n");
}
function perfCopy(panel){
  const txt = perfReport(), say = msg => { if (typeof showToast === "function") showToast(msg); };
  const done = () => say(t_("perfCopied"));
  const showBox = () => { const box = panel.querySelector(".perf-text"); box.value = txt; box.hidden = false; box.focus(); box.select(); say(t_("perfCopyBlocked")); };
  const fallback = () => {
    const ta = document.createElement("textarea"); ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    ta.remove(); if (ok) done(); else showBox();
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, fallback); else fallback();
}

(function perfHotkey(){
  window.addEventListener("keydown", e => {
    if (e.key !== "F8") return;
    e.preventDefault();
    perfUiSet(PERFUI.state === "mini" ? "full" : "mini");
  });
  if (typeof onLangChange === "function") onLangChange(renderPerfPanel);
  setInterval(() => { if (V3.host && (!PERFUI.el || PERFUI.el.parentNode !== V3.host)) perfDock(); }, 400);
})();
