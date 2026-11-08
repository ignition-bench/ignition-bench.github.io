"use strict";

const ctxMenu = document.createElement("div"); ctxMenu.id = "ctx-menu"; ctxMenu.hidden = true; document.body.appendChild(ctxMenu);
function ctxOpen(x, y, items){
  ctxMenu.innerHTML = "";
  items.filter(Boolean).forEach(it => {
    if (it === "-"){ const h = document.createElement("div"); h.className = "cm-sep"; ctxMenu.appendChild(h); return; }
    const b = document.createElement("button"); b.type = "button"; b.className = "cm-item" + (it.danger ? " danger" : "");
    b.textContent = it.label; b.disabled = !!it.disabled;
    b.addEventListener("click", () => { ctxClose(); it.fn(); });
    ctxMenu.appendChild(b);
  });
  ctxMenu.hidden = false;
  const w = ctxMenu.offsetWidth, h = ctxMenu.offsetHeight;
  ctxMenu.style.left = Math.min(x, innerWidth - w - 6) + "px"; ctxMenu.style.top = Math.min(y, innerHeight - h - 6) + "px";
}
function ctxClose(){ ctxMenu.hidden = true; }
document.addEventListener("pointerdown", e => { if (!ctxMenu.hidden && !ctxMenu.contains(e.target)) ctxClose(); }, true);
window.addEventListener("keydown", e => { if (e.key === "Escape" && !ctxMenu.hidden) ctxClose(); }, true);
window.addEventListener("blur", ctxClose);

function ctxMemoItems(m){
  if (!SETM.selIds.has(m.id)) memoSelect(m.id);
  const ids = new Set(SETM.selIds), n = ids.size, toScene = m.kind !== "scene";
  return [
    n === 1 && { label: t("cmMemoEdit"), fn: () => memoOpenEditor(m, ctxMenu._x, ctxMenu._y, false) },
    { label: t(toScene ? "cmToScene" : "cmToSet") + (n > 1 ? ` (${n})` : ""), fn: () => memoToggleKind(ids) },
    { label: (n > 1 ? t("cmMemoDelN").replace("{n}", n) : t("cmMemoDel")), danger: true, fn: () => memoDelete() },
    "-",
    { label: t("cmMemoAll"), fn: memoSelectAll, disabled: !memos.length },
  ];
}
function ctxObjItems(el, anchorFn){
  if (!selectedIds.includes(el.id)){ selectedIds = [el.id]; SETM.sel = null; renderSelection(); updatePropPanel(); memoRefresh(); }
  const rot = el.x !== undefined && ROTATABLE_TYPES.includes(el.type);
  return [
    rot && { label: t("cmRotate"), fn: () => rotateSelected() },
    el.type === "door" && { label: t("cmDoorSwing"), fn: () => rotateSelected() },
    LIGHT_TYPES.includes(el.type) && { label: t(el.on ? "cmLightOff" : "cmLightOn"), fn: () => envToggleLight(el.id) },
    { label: t("cmMemoHere"), fn: () => { const a = anchorFn(); memoCreate(a, ctxMenu._x, ctxMenu._y); } },
    el.x !== undefined && { label: t("cmDup"), fn: () => document.getElementById("dup-btn").click() },
    { label: t("cmDelete"), danger: true, fn: () => deleteSelected() },
  ];
}
function ctxEmptyItems(anchorFn){
  return [
    { label: t("cmNewMemo"), fn: () => memoCreate(anchorFn(), ctxMenu._x, ctxMenu._y) },
    { label: t("cmMemoAll"), fn: memoSelectAll, disabled: !memos.length },
    { label: t(SETM.show ? "cmMemoHide" : "cmMemoShow"), fn: () => memoSetShow(!SETM.show) },
    "-",
    { label: t("cmUndo"), fn: undo, disabled: !undoStack.length },
  ];
}
function ctxShow(e, items){ e.preventDefault(); ctxMenu._x = e.clientX; ctxMenu._y = e.clientY; ctxOpen(e.clientX, e.clientY, items); }

svg.addEventListener("contextmenu", e => {
  if (APP.screen !== "set") return;
  const pt = screenToCanvas(e.clientX, e.clientY);
  const mg = e.target.closest && e.target.closest(".memo2d");
  if (mg){ const m = memos.find(x => x.id === mg.dataset.mid); if (m) return ctxShow(e, ctxMemoItems(m)); }
  const shape = e.target.closest && e.target.closest(".shape-el");
  let el = shape ? getEl(shape.dataset.id) : null;
  if (el){
    const host = (el.type === "door" || el.type === "window") ? getEl(el.wallId) : el;
    return ctxShow(e, ctxObjItems(el, () => memoAnchorAt(pt.x, pt.y, null, host ? host.id : null)));
  }
  ctxShow(e, ctxEmptyItems(() => memoAnchorAt(pt.x, pt.y, null, null)));
});

const rDrag = { x: 0, y: 0, dist: 0, on: false };
document.addEventListener("pointerdown", e => { if (e.button === 2){ rDrag.x = e.clientX; rDrag.y = e.clientY; rDrag.dist = 0; rDrag.on = true; } }, true);
document.addEventListener("pointermove", e => { if (rDrag.on) rDrag.dist = Math.max(rDrag.dist, Math.hypot(e.clientX - rDrag.x, e.clientY - rDrag.y)); }, true);
document.addEventListener("pointerup", e => { if (e.button === 2) rDrag.on = false; }, true);
document.addEventListener("contextmenu", e => {
  if (APP.screen !== "set" || !inLiveMode || !V3.renderer) return;
  const box = e.target.closest && e.target.closest(".memo3d-box");
  if (box){ const id = Object.keys(memo3dEls).find(k => memo3dEls[k] === box), m = memos.find(x => x.id === id); if (m) return ctxShow(e, ctxMemoItems(m)); }
  if (e.target !== V3.renderer.domElement) return;
  if (rDrag.dist > 4){ e.preventDefault(); return; }
  const r = V3.renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }, camera);
  const hit = raycaster.intersectObjects(SET3D.pickables, false)[0];
  const at = p => ({ x: p.x / SCALE3D + minX, y: p.z / SCALE3D + minY });
  if (hit && hit.object.userData.elId){
    const el = getEl(hit.object.userData.elId), q = at(hit.point), hy = hit.point.y + 0.02;
    if (el) return ctxShow(e, ctxObjItems(el, () => memoAnchorAt(q.x, q.y, hy, el.id)));
  }
  const pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), v = new THREE.Vector3();
  const q = raycaster.ray.intersectPlane(pl, v) ? at(v) : null;
  ctxShow(e, ctxEmptyItems(() => q ? memoAnchorAt(q.x, q.y, 0, null) : memoAnchorAt(boardW() / 2, boardH() / 2, 0, null)));
}, true);
