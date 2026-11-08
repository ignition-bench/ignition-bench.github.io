"use strict";

document.getElementById("lang-toggle").addEventListener("click", toggleLang);
onLangChange(()=>{ updateCeilingButton(); updatePropPanel(); render(); });

renderBoard();
centerBoard();
render();
applyLang();

if (window.ResizeObserver){
  let centeredOnce = svg.getBoundingClientRect().width > 0;
  const ro = new ResizeObserver(()=>{
    const r = svg.getBoundingClientRect();
    if (!centeredOnce && r.width > 0 && r.height > 0){
      centeredOnce = true;
      centerBoard();
    }
  });
  ro.observe(svg);
}

autosaveRegister("set", ()=>{
  if (!elements.length && !CAST.actors.length) return null;
  const walls = elements.filter(e=>e.type==="wall").length, objs = elements.filter(e=>e.x!==undefined).length;
  const json = CAST.actors.length ? JSON.stringify({ kind: "dd-recent", set: JSON.parse(setToJson()), scene: castToObj() }) : setToJson();
  return { json, summary: (setName ? setName + " · " : "") + t("sumWalls") + " " + walls + " · " + t("sumObjects") + " " + objs + (CAST.actors.length ? " · " + t("sumActors") + " " + CAST.actors.length : "") };
});
onRecentOpen("set", (json)=>{ try { const o = JSON.parse(json); if (o.kind === "dd-recent"){ loadSetData(o.set); castLoadObj(o.scene, true); CAST.savedSig = castSig(); } else loadSetData(o); } catch(e){} });
onScreen("set", ()=>{ setViewApply(); requestAnimationFrame(()=>{ if (svg.getBoundingClientRect().width) applyTransform(); }); }, ()=> set3dPause());

(function shortcutHint(){
  const box = document.getElementById("shortcut-hint"), open = document.getElementById("hint-open");
  let folded = false;
  const apply = ()=>{ box.hidden = folded; open.hidden = !folded; };
  document.getElementById("hint-close").addEventListener("click", ()=>{ folded = true; apply(); });
  open.addEventListener("click", ()=>{ folded = false; apply(); });
  apply();
})();

flowSteps("set", [
  { key: "fsDraw",    color: "make", target: "toolbar",  check: () => elements.length > 0 },
  { key: "fs3d",      color: "view", target: "view-seg", check: () => FLOW.flags.live3d },
  { key: "fsSetSave", color: "save", target: "save-btn", check: () => elements.length > 0 && FLOW.setSavedSig === setToJson() },
  { key: "fsActors",   color: "get",  target: "obj-tabs", check: () => CAST.actors.length > 0 },
  { key: "fsTimeline", color: "edit", target: "set-tl",   check: () => CAST.actors.some(a => a.clips.length) },
  { key: "fsCamera", color: "view", target: "obj-tabs", check: () => CAMS.list.length > 0 },
  { key: "fsRecord", color: "save", target: "rec-btn", check: () => REC.count > 0 },
]);

setInterval(() => {
  if (APP.screen !== "set") return;
  const b = document.getElementById("save-btn"), d = elements.length > 0 && FLOW.setSavedSig !== setToJson();
  b.classList.toggle("dirty", d); b.title = d ? t("unsavedTitle") : "";
}, 600);
