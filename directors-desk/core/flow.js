"use strict";

const FLOW = { steps: {}, flags: {}, bar: null, inner: null, outer: null, card: null, cardT: 0, ring: null, ringT: 0 };
const FLOW_TABS = [
  { id: "actor", icon: "🎭", key: "flowActor", sub: "flowActorSub" },
  { id: "set",   icon: "🏠", key: "flowSet",   sub: "flowSetSub" },
  { id: "edit",  icon: "🎬", key: "flowEdit",  sub: "flowEditSub" },
  { id: "game",  icon: "🎮", key: "flowGame",  sub: "flowGameSub", soon: true, side: true },
];
function flowSteps(tab, list){ FLOW.steps[tab] = list; }
function flowFlag(name){ FLOW.flags[name] = true; }

function flowCurrentTab(){ if (window.DD_PAGE === "edit") return "edit"; return APP.screen === "actor" ? "actor" : APP.screen === "set" ? "set" : null; }
function flowBuild(){
  FLOW.bar = document.createElement("div"); FLOW.bar.id = "flow-bar";
  FLOW.bar.innerHTML = `<div class="flow-row1"><button type="button" class="flow-home home-btn"></button><div class="flow-outer"></div></div><div class="flow-row2"><div class="flow-inner"></div><button type="button" class="flow-next"></button></div>`;
  document.getElementById("app").appendChild(FLOW.bar);
  FLOW.outer = FLOW.bar.querySelector(".flow-outer"); FLOW.inner = FLOW.bar.querySelector(".flow-inner"); FLOW.next = FLOW.bar.querySelector(".flow-next");
  FLOW.next.addEventListener("click", () => { const S = FLOW.nextStep; if (S) flowPoint(S); });
  FLOW.bar.querySelector(".flow-home").addEventListener("click", () => flowGo("start"));
  FLOW.card = document.createElement("div"); FLOW.card.id = "file-card"; FLOW.card.hidden = true;
  document.getElementById("app").appendChild(FLOW.card);
  FLOW.ring = document.createElement("div"); FLOW.ring.id = "flow-ring"; FLOW.ring.hidden = true;
  document.getElementById("app").appendChild(FLOW.ring);
}
function ddEditorWin(){
  let w = null; try { w = window.open("", "dd-editor"); } catch(e){}
  if (!w) return null;
  let fresh = false;
  try { fresh = !w.location.href || w.location.href === "about:blank"; } catch(e){ fresh = false; }
  if (fresh) w.location.href = new URL("editor.html", location.href).href;
  try { w.focus(); } catch(e){}
  return { w, fresh };
}
function flowGo(id){
  if (window.DD_PAGE === "edit"){ if (id !== "edit" && typeof edLeave === "function") edLeave(id); return; }
  if (id === "edit"){ ddEditorWin(); return; }
  if (id === "start" || id === "actor" || id === "set") showScreen(id);
}
function flowRender(){
  if (!FLOW.bar) return;
  const tab = flowCurrentTab();
  document.body.classList.toggle("has-flow", !!tab);
  FLOW.bar.hidden = !tab;
  if (!tab) return;
  const home = FLOW.bar.querySelector(".flow-home"); home.textContent = "Director's Desk"; home.title = t("homeTitle");
  FLOW.outer.innerHTML = "";
  FLOW_TABS.forEach((T, i) => {
    if (i){ const a = document.createElement("span"); a.className = "flow-arrow" + (T.side ? " side" : ""); a.textContent = T.side ? "⇢" : "→"; FLOW.outer.appendChild(a); }
    const b = document.createElement("button"); b.type = "button";
    b.className = "flow-tab" + (T.id === tab ? " cur" : "") + (T.soon ? " soon" : "");
    b.innerHTML = `<span class="ft-name"></span><span class="ft-sub"></span>`;
    b.querySelector(".ft-name").textContent = T.icon + " " + t(T.key);
    b.querySelector(".ft-sub").textContent = T.soon ? t("flowSoon") : t(T.sub);
    b.title = t(T.key + "Tip");
    if (!T.soon) b.addEventListener("click", () => { if (T.id !== tab) flowGo(T.id); });
    FLOW.outer.appendChild(b);
  });
  FLOW.inner.innerHTML = "";
  (FLOW.steps[tab] || []).forEach((S, i) => {
    if (i){ const a = document.createElement("span"); a.className = "flow-chev"; a.textContent = "›"; FLOW.inner.appendChild(a); }
    const b = document.createElement("button"); b.type = "button"; b.className = "flow-step fc-" + (S.color || "make") + (S.soon ? " soon" : "");
    b.dataset.i = i; b.innerHTML = `<span class="fs-n">${"①②③④⑤⑥⑦⑧⑨"[i] || i + 1}</span><span class="fs-t"></span>`;
    b.querySelector(".fs-t").textContent = t(S.key);
    b.title = t(S.key + "Tip") + (S.soon ? " (" + t("flowSoon") + ")" : "");
    if (!S.soon) b.addEventListener("click", () => flowPoint(S));
    if (S.tut != null && typeof tutStart === "function"){
      const g = document.createElement("span"); g.className = "fs-tut"; g.textContent = "🎓"; g.title = t("flowTutTip").replace("{n}", S.tut).replace("{name}", t("tch" + S.tut));
      g.addEventListener("click", e => { e.stopPropagation(); tutStart(S.tut); });
      b.appendChild(g);
    }
    FLOW.inner.appendChild(b);
  });
  flowTick();
}
function flowTick(){
  const tab = flowCurrentTab(); if (!tab || !FLOW.inner) return;
  const walk = tab === "set" && typeof inLiveMode !== "undefined" && inLiveMode && typeof locked !== "undefined" && locked;
  FLOW.bar.classList.toggle("walk-hide", walk);
  const list = FLOW.steps[tab] || []; let nextSet = false; FLOW.nextStep = null;
  list.forEach((S, i) => {
    const b = FLOW.inner.querySelector(`.flow-step[data-i="${i}"]`); if (!b) return;
    let ok = false; if (!S.soon){ try { ok = !!S.check(); } catch(e){} }
    b.classList.toggle("done", ok);
    const nx = !ok && !S.soon && !nextSet; if (nx){ nextSet = true; FLOW.nextStep = S; FLOW.nextI = i; }
    b.classList.toggle("next", nx);
  });
  const N = FLOW.nextStep, nb = FLOW.next;
  const label = N ? t("flowNext") + " " + ("①②③④⑤⑥⑦⑧⑨"[FLOW.nextI] || "") + " " + t(N.key) + " →" : t("flowAllDone");
  if (nb.textContent !== label) nb.textContent = label;
  nb.className = "flow-next" + (N ? " fc-" + (N.color || "make") : " all-done");
  nb.title = N ? t(N.key + "Tip") : "";
  if (FLOW.ring && !FLOW.ring.hidden){
    if (performance.now() > FLOW.ringT) FLOW.ring.hidden = true; else flowRingPlace();
  }
  if (FLOW.card && !FLOW.card.hidden && performance.now() > FLOW.cardT) FLOW.card.hidden = true;
}
function flowPoint(S){
  FLOW.ringTarget = S.target; FLOW.ringT = performance.now() + 2200; FLOW.ring.hidden = false; flowRingPlace();
}
function flowRingPlace(){
  let el = typeof FLOW.ringTarget === "function" ? FLOW.ringTarget() : document.getElementById(FLOW.ringTarget);
  if (!el || !el.getBoundingClientRect){ FLOW.ring.hidden = true; return; }
  const r = el.getBoundingClientRect();
  if (!r.width){ FLOW.ring.hidden = true; return; }
  Object.assign(FLOW.ring.style, { left: (r.left - 5) + "px", top: (r.top - 5) + "px", width: (r.width + 10) + "px", height: (r.height + 10) + "px" });
}
function fileCard(kind, fileName, detail, loaded){
  if (!FLOW.card) return;
  FLOW.card.innerHTML = `<div class="fc-head"><b></b><button type="button" class="fc-x">✕</button></div><div class="fc-name"></div>
    <div class="fc-row"><span class="fc-lab"></span><span class="fc-what"></span></div><div class="fc-row"><span class="fc-lab"></span><span class="fc-next"></span></div>`;
  FLOW.card.querySelector("b").textContent = t(loaded ? "cardLoaded" : "cardSaved");
  FLOW.card.querySelector(".fc-name").textContent = fileName;
  const labs = FLOW.card.querySelectorAll(".fc-lab"); labs[0].textContent = t("cardWhat"); labs[1].textContent = t("cardNext");
  FLOW.card.querySelector(".fc-what").textContent = t("card_" + kind) + (detail ? " — " + detail : "");
  FLOW.card.querySelector(".fc-next").textContent = t("card_" + kind + "_next");
  FLOW.card.querySelector(".fc-x").addEventListener("click", () => { FLOW.card.hidden = true; });
  FLOW.card.hidden = false; FLOW.cardT = performance.now() + 7000;
}
const FILE_ABOUT = {
  rec:    "Director's Desk 녹화 기록 — 같은 이름의 영상(video)과 한 쌍. markers = 녹화 중 M 마커(t 영상 초·sceneT 장면 초·cam·img 작은 스냅샷·memo 빈 칸), cuts = 컷(장면 초·카메라), samples = 0.5초마다 FPS·해상도 %·FSR, longs = 끊긴 순간(ms), resDrops = 해상도가 내려간 구간, dropped = 빠진 프레임, perfText = 성능 기록 글. 편집 탭 「분석」란이 읽음 / Recording log paired with the video: markers, cuts, per-0.5s perf samples, hitches",
  pose:   "Director's Desk 자세 파일 — 관절 19개 각도(°)·골반 자리(m). 배우 탭이 읽음 / Pose: 19 joint angles (deg) + root position (m)",
  motion: "Director's Desk 동작 파일 — 키(t초·ease·pose)를 이어 재생. 배우 탭·세트 탭·게임 재생기가 읽음 / Motion: keys (t sec, ease, pose) played in sequence",
  pack:   "Director's Desk 동작 모음 — 동작 여러 개를 한 파일에. 세트 탭·게임이 이름으로 꺼내 씀 / Motion pack: several motions by name",
  scene:  "Director's Desk 장면 파일 — 세트 이름(set) + 배우(이름·색·자리 x·y 칸 단위 40 = 1m·방향 rot°, rot 0 = 도면 아래쪽) + 시간줄(배우마다 막대: t0 시작 초·reps 바퀴·speed 빠르기·동작 키 전체). 배우는 막대 시간 동안만 화면에 있음. 세트 탭이 읽음 / Scene: set name + actors (position, facing) + per-actor clips (start, repeats, speed, full motion keys); actors appear only during their clips",
  memo:   "Director's Desk 메모 파일 — 영상(video 이름) 위 마커: t 영상 초 · t2 구간 끝(있으면) · text 메모 · who 누가 · img 작은 스냅샷 · src rec = 녹화 중 M 마커에서 옴. 영상 원본은 손대지 않음 (메모는 이 파일에만). 편집 탭이 읽음 / Memo: markers on a video (time, optional end, text, author, thumbnail); the video itself is untouched",
  set:    "Director's Desk 세트 파일 — 2D 도면(벽·문·창·소품, 칸 단위 40 = 1m) + 메모(memos: 🔒 kind=set 모든 컷 공통 / 🎬 kind=scene 이 컷만, elId = 붙은 물건, h = 높이 m). 세트 탭이 읽음 / Set: floor plan + notes (set = every shot, scene = this shot only)",
};

onLangChange(() => flowRender());
flowBuild();
setInterval(flowTick, 400);
