"use strict";

const PACK = { root: null, busy: false, last: "" };
const PACK_FPS = 30;
const PACK_EDITOR_DIR = "편집기용";
const packCan = () => typeof window.showDirectoryPicker === "function";

function packIdb(){
  return new Promise((res, rej) => { const r = indexedDB.open("dd-editor", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function packRootLoad(){ try { const db = await packIdb(); return await new Promise(res => { const q = db.transaction("kv").objectStore("kv").get("root"); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); } catch(e){ return null; } }
async function packRootSave(h){ try { const db = await packIdb(); db.transaction("kv", "readwrite").objectStore("kv").put(h, "root"); } catch(e){} }
async function packRootPick(){ try { const h = await window.showDirectoryPicker({ id: "dd-notes", mode: "readwrite" }); PACK.root = h; packRootSave(h); packUi(); return true; } catch(e){ return false; } }
async function packPerm(h){
  try {
    if (!h.queryPermission) return true;
    if ((await h.queryPermission({ mode: "readwrite" })) === "granted") return true;
    return (await h.requestPermission({ mode: "readwrite" })) === "granted";
  } catch(e){ return false; }
}

const pad2 = n => String(n).padStart(2, "0");
function packStamp(d){ d = d || new Date(); return pad2(d.getMonth() + 1) + pad2(d.getDate()) + "-" + pad2(d.getHours()) + pad2(d.getMinutes()); }
const packFolderName = d => edBase(ED.name) + "_메모_" + packStamp(d);
function packTc(sec, base){
  const f = Math.max(0, Math.round(sec * PACK_FPS)) + (base || 0) * 3600 * PACK_FPS;
  const fr = f % PACK_FPS, s = Math.floor(f / PACK_FPS);
  return pad2(Math.floor(s / 3600)) + ":" + pad2(Math.floor(s / 60) % 60) + ":" + pad2(s % 60) + ":" + pad2(fr);
}
function packSrtTime(sec){ const ms = Math.max(0, Math.round(sec * 1000)), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60; return pad2(h) + ":" + pad2(m) + ":" + pad2(s) + "," + String(ms % 1000).padStart(3, "0"); }
const packStarTxt = k => k ? "★".repeat(k) + " " + edLegendText(k) : "";
function packScenePng(c){ return "장면메모_" + edFmt(c.t).replace(":", "m").replace(".", "s") + ".png"; }

function packItems(){
  const D = edDur() || 0, out = [];
  const pngNames = new Map(); const seen = {};
  ED.scenes.forEach(c => { let n = packScenePng(c); if (seen[n]){ seen[n]++; n = n.replace(/\.png$/, "_" + seen[n] + ".png"); } else seen[n] = 1; pngNames.set(c.id, n); });
  ED.marks.forEach((m, i) => out.push({ kind: "mark", no: "#" + (i + 1), t: m.t, t2: m.t2 != null ? m.t2 : null, star: m.star || 0, text: m.text || "", who: m.who || "", cam: m.cam || "", notes: "", png: "" }));
  ED.scenes.forEach((c, i) => out.push({ kind: "scene", no: "S" + (i + 1), t: c.t, t2: null, star: c.star || 0, text: c.text || "", who: c.who || "", cam: "", notes: c.notes.map(n => n.text.trim()).filter(Boolean).join(" / "), png: "장면메모/" + pngNames.get(c.id), id: c.id }));
  out.sort((a, b) => a.t - b.t || (a.kind === "mark" ? -1 : 1));
  out.forEach((it, k) => { if (it.t2 == null){ const nx = out.slice(k + 1).find(o => o.t > it.t + 0.05); it.end = Math.min(it.t + 2.5, nx ? nx.t - 0.05 : Infinity, D || Infinity); if (!(it.end > it.t)) it.end = it.t + 1; } else it.end = it.t2; });
  return { items: out, pngNames };
}
function packLine(it){
  const head = "[" + (it.kind === "mark" ? t("packKindMark") : t("packKindScene")) + " " + it.no + (it.star ? " " + packStarTxt(it.star) : "") + "]";
  const body = [it.text.trim(), it.notes ? t("packCallouts") + ": " + it.notes : "", it.png ? "→ " + it.png : ""].filter(Boolean).join(" · ");
  return head + " " + (body || t("packNoText")) + (it.who ? " (✎ " + it.who + ")" : "");
}

function packSrt(items){ return items.map((it, i) => (i + 1) + "\r\n" + packSrtTime(it.t) + " --> " + packSrtTime(it.end) + "\r\n" + packLine(it) + "\r\n").join("\r\n"); }
function packCsv(items){
  const q = v => { v = String(v == null ? "" : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const head = ["종류", "번호", "시작", "끝", "시작(초)", "끝(초)", "중요도", "중요도 뜻", "메모", "설명선", "누가", "카메라", "그림 파일"];
  const rows = items.map(it => [it.kind === "mark" ? t("packKindMark") : t("packKindScene"), it.no, edFmt(it.t), it.t2 != null ? edFmt(it.t2) : "", it.t.toFixed(2), it.t2 != null ? it.t2.toFixed(2) : "", it.star ? "★".repeat(it.star) : "", it.star ? edLegendText(it.star) : "", it.text, it.notes, it.who, it.cam, it.png]);
  return "﻿" + [head, ...rows].map(r => r.map(q).join(",")).join("\r\n") + "\r\n";
}
const PACK_RESOLVE_COLOR = { 3: "ResolveColorRed", 2: "ResolveColorYellow", 1: "ResolveColorBlue", 0: "ResolveColorCyan" };
function packEdl(items){
  const L = ["TITLE: " + edBase(ED.name) + " 감독 노트", "FCM: NON-DROP FRAME", ""];
  items.forEach((it, i) => {
    const a = packTc(it.t, 1), b = packTc(it.t + 1 / PACK_FPS, 1), dur = Math.max(1, Math.round((it.end - it.t) * PACK_FPS));
    L.push(String(i + 1).padStart(3, "0") + "  001      V     C        " + a + " " + b + " " + a + " " + b + "  ");
    L.push(" |C:" + (it.kind === "scene" ? "ResolveColorPurple" : PACK_RESOLVE_COLOR[it.star]) + " |M:" + packLine(it).replace(/\|/g, "/") + " |D:" + dur);
    L.push("");
  });
  return L.join("\r\n");
}
const xmlEsc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function packPremiereXml(items){
  const N = Math.max(1, Math.round((edDur() || 1) * PACK_FPS)), rate = `<rate><timebase>${PACK_FPS}</timebase><ntsc>FALSE</ntsc></rate>`, nm = xmlEsc(ED.name);
  const marks = items.map(it => `    <marker><name>${xmlEsc(it.no + (it.star ? " " + "★".repeat(it.star) : ""))}</name><comment>${xmlEsc(packLine(it))}</comment><in>${Math.round(it.t * PACK_FPS)}</in><out>${it.t2 != null ? Math.round(it.t2 * PACK_FPS) : -1}</out></marker>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
  <sequence id="sequence-1">
    <name>${xmlEsc(edBase(ED.name))} 감독 노트</name>
    <duration>${N}</duration>
    ${rate}
    <media><video><track>
      <clipitem id="clipitem-1"><name>${nm}</name><duration>${N}</duration>${rate}<start>0</start><end>${N}</end><in>0</in><out>${N}</out>
        <file id="file-1"><name>${nm}</name><pathurl>${encodeURI("../" + ED.name)}</pathurl>${rate}<duration>${N}</duration><media><video/></media></file>
      </clipitem>
    </track></video></media>
${marks}
  </sequence>
</xmeml>
`;
}
function packFcpxml(items){
  const N = Math.max(1, Math.round((edDur() || 1) * PACK_FPS)), W = (V.videoWidth || 1280), H = (V.videoHeight || 720), nm = xmlEsc(edBase(ED.name));
  const marks = items.map(it => `            <marker start="${Math.round(it.t * PACK_FPS)}/${PACK_FPS}s" duration="${Math.max(1, Math.round((it.end - it.t) * PACK_FPS))}/${PACK_FPS}s" value="${xmlEsc(packLine(it))}"/>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.9">
  <resources>
    <format id="r1" frameDuration="1/${PACK_FPS}s" width="${W}" height="${H}"/>
    <asset id="r2" name="${nm}" start="0s" duration="${N}/${PACK_FPS}s" hasVideo="1" format="r1" src="../${encodeURI(ED.name)}"/>
  </resources>
  <library>
    <event name="감독 노트">
      <project name="${nm} 감독 노트">
        <sequence format="r1" duration="${N}/${PACK_FPS}s" tcStart="0s" tcFormat="NDF">
          <spine>
          <asset-clip ref="r2" offset="0s" name="${nm}" duration="${N}/${PACK_FPS}s" format="r1">
${marks}
          </asset-clip>
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;
}
function packReadme(folder, files){
  const L = [t("packReadmeTitle").replace("{f}", folder), "", t("packReadmeWhat"), ""];
  files.forEach(f => L.push("  " + f[0] + "  —  " + f[1]));
  L.push("", t("packReadmeHowHead"), "", "  " + t("packReadmeHow_resolve"), "", "  " + t("packReadmeHow_premiere"), "", "  " + t("packReadmeHow_fcp"), "", "  " + t("packReadmeHow_basic"),
    "", t("packReadmeReopen"), "", t("packReadmeMade").replace("{d}", new Date().toLocaleString()));
  return L.join("\r\n") + "\r\n";
}

async function packWrite(dir, name, data){
  const fh = await dir.getFileHandle(name, { create: true }), w = await fh.createWritable();
  await w.write(data); await w.close();
}
async function packVideoBlob(){
  const b = ED.blob; if (!b) return null;
  if (ED.blobFixedFrom !== b){ ED.blobFixed = typeof MP4FIX !== "undefined" ? await MP4FIX.fixBlob(b) : b; ED.blobFixedFrom = b; }
  return ED.blobFixed;
}
async function packVideoCopy(dir){
  const b = await packVideoBlob(); if (!b) return "none";
  try { const old = await (await dir.getFileHandle(ED.name)).getFile(); if (old.size === b.size) return "same"; } catch(e){}
  await packWrite(dir, ED.name, b); return "copied";
}

async function edSavePack(opts){
  if (!ED.name){ showToast(t("edNoVideo")); return false; }
  if (PACK.busy) return false;
  if (!packCan()){
    const fname = edBase(ED.name) + ".memo.json";
    saveTextFile(fname, JSON.stringify(edMemoObj(), null, 1));
    ED.savedSig = edSig(); edDirtyUi(); showToast(t("packNoFolder")); return true;
  }
  PACK.busy = true; $e("ed-save").classList.add("busy");
  try {
    if (!PACK.root) PACK.root = await packRootLoad();
    if (opts && opts.change) PACK.root = null;
    if (!PACK.root && !(await packRootPick())) return false;
    if (!(await packPerm(PACK.root))){ if (!(await packRootPick())) return false; }
    const now = new Date(), folder = packFolderName(now), dir = await PACK.root.getDirectoryHandle(folder, { create: true });
    const base = edBase(ED.name), { items, pngNames } = packItems(), files = [];
    const vs = await packVideoCopy(dir);
    if (vs !== "none") files.push([ED.name, t("packFVideo")]);
    if (ED.scenes.length){
      const sd = await dir.getDirectoryHandle("장면메모", { create: true }), keep = new Set();
      for (const c of ED.scenes){
        const n = pngNames.get(c.id), cv = await smCompose(c);
        const blob = await new Promise(r => cv.toBlob(r, "image/png"));
        await packWrite(sd, n, blob); keep.add(n);
      }
      for await (const [n] of sd.entries()) if (!keep.has(n) && /^장면메모_.*\.png$/.test(n)) await sd.removeEntry(n);
      files.push(["장면메모/", t("packFScenes").replace("{n}", ED.scenes.length)]);
    } else { try { await dir.removeEntry("장면메모", { recursive: true }); } catch(e){} }
    if (ED.rec){ await packWrite(dir, base + ".rec.json", JSON.stringify(ED.rec, null, 1)); files.push([base + ".rec.json", t("packFRec")]); }
    await packWrite(dir, base + ".srt", packSrt(items)); files.push([base + ".srt", t("packFSrt")]);
    await packWrite(dir, base + ".csv", packCsv(items)); files.push([base + ".csv", t("packFCsv")]);
    const ed = await dir.getDirectoryHandle(PACK_EDITOR_DIR, { create: true });
    await packWrite(ed, t("packEdResolve"), packEdl(items));
    await packWrite(ed, t("packEdPremiere"), packPremiereXml(items));
    await packWrite(ed, t("packEdFcp"), packFcpxml(items));
    files.push([PACK_EDITOR_DIR + "/", t("packFEditors")]);
    for (const n of [base + ".edl", base + "_프리미어.xml", base + ".fcpxml"]){ try { await dir.removeEntry(n); } catch(e){} }
    const memo = edMemoObj(); memo.pack = { folder, saved: now.toISOString(), editors: PACK_EDITOR_DIR + "/", files: files.map(f => f[0]) };
    await packWrite(dir, base + ".memo.json", JSON.stringify(memo, null, 1)); files.splice(1, 0, [base + ".memo.json", t("packFMemo")]);
    await packWrite(dir, t("packReadmeName"), packReadme(folder, files));
    for (const n of ["읽어 주세요.txt", "README.txt"]) if (n !== t("packReadmeName")){ try { await dir.removeEntry(n); } catch(e){} }
    ED.savedSig = edSig(); edDirtyUi(); PACK.last = folder;
    if (typeof fileCard === "function") fileCard("memo", folder + "/", t("packCard").replace("{n}", files.length + 1).replace("{r}", PACK.root.name));
    showToast(t("packSaved").replace("{f}", folder).replace("{r}", PACK.root.name) + (vs === "same" ? t("packVideoSame") : ""));
    if (typeof flowFlag === "function") flowFlag("edSaved");
    packUi();
    return true;
  } catch(err){ console.warn(err); showToast(t("packFail")); return false; }
  finally { PACK.busy = false; $e("ed-save").classList.remove("busy"); }
}

function packUi(){
  const r = $e("ed-root"); if (r){ r.hidden = !packCan(); r.textContent = PACK.root ? "📁 " + PACK.root.name : t("packRootNone"); r.title = t("packRootTitle"); }
}
$e("ed-root").addEventListener("click", async e => { e.currentTarget.blur(); if (await packRootPick()) showToast(t("packRootSet").replace("{r}", PACK.root.name)); });
packRootLoad().then(h => { if (h && !PACK.root) PACK.root = h; packUi(); });
onLangChange(packUi);
packUi();
