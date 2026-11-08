"use strict";

const FLOOR_LOOK = { "": 0x6f6d69, grass: 0x40592c, dirt: 0x5c4733, sand: 0x9c8a62 };
const BOARD_MAX_M = 300;

const boardBtn = document.getElementById("board-size-btn"), boardPop = document.getElementById("board-pop");
let boardDraft = null;
function boardPopRender(){
  const d = boardDraft;
  boardPop.innerHTML = `<div class="bp-head"></div>
    <div class="bp-row"><label><span></span><input type="number" min="2" max="${BOARD_MAX_M}" step="0.5" class="bp-w"></label><b>×</b><label><span></span><input type="number" min="2" max="${BOARD_MAX_M}" step="0.5" class="bp-h"></label><small>m</small></div>
    <div class="bp-lab bp-l-snap"></div><div class="seg bp-snap"></div>
    <div class="bp-lab bp-l-floor"></div><div class="seg bp-floor"></div>
    <div class="bp-note"></div>
    <div class="bp-btns"><button type="button" class="bp-cancel"></button><button type="button" class="bp-ok c-save"></button></div>`;
  boardPop.querySelector(".bp-head").textContent = t("bpHead");
  const [lw, lh] = boardPop.querySelectorAll(".bp-row label span"); lw.textContent = t("bpW"); lh.textContent = t("bpH");
  const iw = boardPop.querySelector(".bp-w"), ih = boardPop.querySelector(".bp-h"); iw.value = d.w; ih.value = d.h;
  [iw, ih].forEach(i => { i.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Enter") apply(); }); i.addEventListener("input", () => { d.w = +iw.value; d.h = +ih.value; note(); }); });
  boardPop.querySelector(".bp-l-snap").textContent = t("bpSnap");
  boardPop.querySelector(".bp-l-floor").textContent = t("bpFloor");
  const seg = (box, list, key) => { box.innerHTML = ""; list.forEach(([v, lab]) => { const b = document.createElement("button"); b.type = "button"; b.textContent = lab; b.classList.toggle("on", d[key] === v); b.addEventListener("click", () => { d[key] = v; seg(box, list, key); note(); }); box.appendChild(b); }); };
  seg(boardPop.querySelector(".bp-snap"), [[0.5, t("bpSnapIn")], [5, "5m"], [10, "10m"]], "snap");
  seg(boardPop.querySelector(".bp-floor"), [["", t("floorConcrete")], ["grass", t("floorGrass")], ["dirt", t("floorDirt")], ["sand", t("floorSand")]], "floor");
  const note = () => {
    const n = []; if (Math.max(d.w, d.h) > 60 && d.snap === 0.5) n.push(t("bpNoteWide"));
    if (d.floor && ceilingOn) n.push(t("bpNoteCeil"));
    boardPop.querySelector(".bp-note").textContent = n.join(" · ");
  };
  note();
  boardPop.querySelector(".bp-cancel").textContent = t("bpCancel"); boardPop.querySelector(".bp-cancel").addEventListener("click", () => { boardPop.hidden = true; });
  boardPop.querySelector(".bp-ok").textContent = t("bpOk"); boardPop.querySelector(".bp-ok").addEventListener("click", apply);
  function apply(){
    const w = Math.max(2, Math.min(BOARD_MAX_M, +iw.value || 10)), h = Math.max(2, Math.min(BOARD_MAX_M, +ih.value || 7.5));
    boardCols = Math.round(w * 2); boardRows = Math.round(h * 2); snapM = d.snap;
    const wasFloor = floorType; floorType = d.floor;
    if (floorType && !wasFloor && ceilingOn){ ceilingOn = false; updateCeilingButton(); setTimeout(() => showToast(t("ceilOffToast")), 1700); }
    boardPop.hidden = true;
    renderBoard(); fitBoard(); render();
    showToast(t("boardSizeToast") + (boardCols * 0.5) + "m × " + (boardRows * 0.5) + "m · " + t("bpSnap") + " " + snapM + "m" + (floorType ? " · " + t("floor_" + floorType) : ""));
  }
}
boardBtn.addEventListener("click", e => {
  e.stopPropagation();
  if (!boardPop.hidden){ boardPop.hidden = true; return; }
  boardDraft = { w: boardCols * 0.5, h: boardRows * 0.5, snap: snapM, floor: floorType };
  boardPopRender(); boardPop.hidden = false;
  const r = boardBtn.getBoundingClientRect();
  boardPop.style.left = (r.right + 8) + "px"; boardPop.style.top = Math.max(60, Math.min(innerHeight - boardPop.offsetHeight - 8, r.top)) + "px";
});
document.addEventListener("pointerdown", e => { if (!boardPop.hidden && !boardPop.contains(e.target) && e.target !== boardBtn) boardPop.hidden = true; }, true);
window.addEventListener("keydown", e => { if (e.key === "Escape" && !boardPop.hidden) boardPop.hidden = true; });
