"use strict";

const MP4FIX = (() => {
  const u32 = (d, o) => d.getUint32(o), u64 = (d, o) => d.getUint32(o) * 4294967296 + d.getUint32(o + 4);
  const typ = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  function boxes(b, d, from, to){
    const out = []; let o = from;
    while (o + 8 <= to){
      let size = u32(d, o), hdr = 8; const t = typ(b, o + 4);
      if (size === 1){ size = u64(d, o + 8); hdr = 16; } else if (size === 0) size = to - o;
      if (size < hdr || o + size > to) break;
      out.push({ type: t, start: o, size, hdr }); o += size;
    }
    return out;
  }
  const kids = (b, d, box, skip) => boxes(b, d, box.start + box.hdr + (skip || 0), box.start + box.size);
  const find = (list, t) => list.find(x => x.type === t);
  const raw = (b, box) => b.subarray(box.start, box.start + box.size);
  function mk(type, ...parts){
    const len = 8 + parts.reduce((s, p) => s + p.length, 0), out = new Uint8Array(len), dv = new DataView(out.buffer);
    dv.setUint32(0, len); for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    let o = 8; parts.forEach(p => { out.set(p, o); o += p.length; }); return out;
  }
  function full(type, ver, flags, body){ const h = new Uint8Array(4); h[0] = ver; h[1] = (flags >> 16) & 255; h[2] = (flags >> 8) & 255; h[3] = flags & 255; return mk(type, h, body); }
  function ints(arr){ const out = new Uint8Array(arr.length * 4), dv = new DataView(out.buffer); arr.forEach((v, i) => dv.setUint32(i * 4, v >>> 0)); return out; }
  function setDuration(box, durOffsetV0, durOffsetV1, value){
    const c = box.slice(), dv = new DataView(c.buffer), v = c[8];
    if (v === 1){ dv.setUint32(8 + 4 + durOffsetV1, Math.floor(value / 4294967296)); dv.setUint32(8 + 4 + durOffsetV1 + 4, value >>> 0); }
    else dv.setUint32(8 + 4 + durOffsetV0, Math.min(0xffffffff, value) >>> 0);
    return c;
  }

  function isFragmented(buf){
    const b = new Uint8Array(buf), d = new DataView(buf);
    const top = boxes(b, d, 0, b.length);
    return !!find(top, "moof") && !!find(top, "moov");
  }

  function defrag(buf){
    const b = new Uint8Array(buf), d = new DataView(buf);
    const top = boxes(b, d, 0, b.length);
    const ftyp = find(top, "ftyp"), moov = find(top, "moov");
    if (!moov || !find(top, "moof")) return null;
    const mk_ = kids(b, d, moov);
    const mvhd = find(mk_, "mvhd"); if (!mvhd) return null;
    const movieTs = u32(d, mvhd.start + 8 + (b[mvhd.start + 8] === 1 ? 4 + 16 : 4 + 8));
    const trex = {};
    const mvex = find(mk_, "mvex");
    if (mvex) kids(b, d, mvex).filter(x => x.type === "trex").forEach(x => { const o = x.start + 12; trex[u32(d, o)] = { dur: u32(d, o + 8), size: u32(d, o + 12), flags: u32(d, o + 16) }; });
    const tracks = mk_.filter(x => x.type === "trak").map(trak => {
      const tk = kids(b, d, trak), tkhd = find(tk, "tkhd"), mdia = find(tk, "mdia");
      const id = u32(d, tkhd.start + 8 + (b[tkhd.start + 8] === 1 ? 4 + 16 : 4 + 8));
      const md = kids(b, d, mdia), mdhd = find(md, "mdhd"), hdlr = find(md, "hdlr"), minf = find(md, "minf");
      const ts = u32(d, mdhd.start + 8 + (b[mdhd.start + 8] === 1 ? 4 + 16 : 4 + 8));
      const mi = kids(b, d, minf), stbl = find(mi, "stbl"), stsd = find(kids(b, d, stbl), "stsd");
      return { id, trak, tk, tkhd, mdhd, hdlr, mi, stsd, ts, samples: [], dataParts: [] };
    });
    const byId = {}; tracks.forEach(t => { byId[t.id] = t; });
    top.filter(x => x.type === "moof").forEach(moof => {
      kids(b, d, moof).filter(x => x.type === "traf").forEach(traf => {
        const tf = kids(b, d, traf), tfhd = find(tf, "tfhd"); if (!tfhd) return;
        const fl = (b[tfhd.start + 9] << 16) | (b[tfhd.start + 10] << 8) | b[tfhd.start + 11];
        let o = tfhd.start + 12; const id = u32(d, o); o += 4;
        const T = byId[id]; if (!T) return;
        const def = trex[id] || { dur: 0, size: 0, flags: 0 };
        let base = moof.start, dDur = def.dur, dSize = def.size, dFlags = def.flags;
        if (fl & 0x1){ base = u64(d, o); o += 8; }
        if (fl & 0x2) o += 4;
        if (fl & 0x8){ dDur = u32(d, o); o += 4; }
        if (fl & 0x10){ dSize = u32(d, o); o += 4; }
        if (fl & 0x20){ dFlags = u32(d, o); o += 4; }
        tf.filter(x => x.type === "trun").forEach(trun => {
          const v = b[trun.start + 8], tfl = (b[trun.start + 9] << 16) | (b[trun.start + 10] << 8) | b[trun.start + 11];
          let p = trun.start + 12; const n = u32(d, p); p += 4;
          let dataOff = 0; if (tfl & 0x1){ dataOff = d.getInt32(p); p += 4; }
          let firstFlags = null; if (tfl & 0x4){ firstFlags = u32(d, p); p += 4; }
          let pos = base + dataOff;
          for (let i = 0; i < n; i++){
            let dur = dDur, size = dSize, flags = (i === 0 && firstFlags != null) ? firstFlags : dFlags, cto = 0;
            if (tfl & 0x100){ dur = u32(d, p); p += 4; }
            if (tfl & 0x200){ size = u32(d, p); p += 4; }
            if (tfl & 0x400){ flags = u32(d, p); p += 4; }
            if (tfl & 0x800){ cto = v === 0 ? u32(d, p) : d.getInt32(p); p += 4; }
            if (pos + size > b.length) return;
            T.samples.push({ dur, size, sync: !(flags & 0x00010000), cto });
            T.dataParts.push(b.subarray(pos, pos + size)); pos += size;
          }
        });
      });
    });
    const live = tracks.filter(t => t.samples.length);
    if (!live.length) return null;
    const build = (offsets) => {
      let movieDur = 0;
      const traks = live.map((T, ti) => {
        const S = T.samples, total = S.reduce((s, x) => s + x.dur, 0);
        const tDurMovie = Math.round(total / T.ts * movieTs); movieDur = Math.max(movieDur, tDurMovie);
        const stts = []; S.forEach(x => { const L = stts[stts.length - 1]; if (L && L[1] === x.dur) L[0]++; else stts.push([1, x.dur]); });
        const parts = [raw(b, T.stsd), full("stts", 0, 0, ints([stts.length, ...stts.flat()]))];
        if (S.some(x => x.cto)){ const c = []; S.forEach(x => { const L = c[c.length - 1]; if (L && L[1] === x.cto) L[0]++; else c.push([1, x.cto]); }); parts.push(full("ctts", S.some(x => x.cto < 0) ? 1 : 0, 0, ints([c.length, ...c.flat()]))); }
        if (S.some(x => !x.sync)){ const ss = []; S.forEach((x, i) => { if (x.sync) ss.push(i + 1); }); parts.push(full("stss", 0, 0, ints([ss.length, ...ss]))); }
        parts.push(full("stsc", 0, 0, ints([1, 1, S.length, 1])));
        parts.push(full("stsz", 0, 0, ints([0, S.length, ...S.map(x => x.size)])));
        parts.push(full("stco", 0, 0, ints([1, offsets[ti] || 0])));
        const stbl = mk("stbl", ...parts);
        const minfKids = T.mi.filter(x => x.type !== "stbl").map(x => raw(b, x));
        const minf = mk("minf", ...minfKids, stbl);
        const mdhd = setDuration(raw(b, T.mdhd), 12, 20, total);
        const mdia = mk("mdia", mdhd, raw(b, T.hdlr), minf);
        const tkhd = setDuration(raw(b, T.tkhd), 16, 24, tDurMovie);
        const others = T.tk.filter(x => x.type === "edts").map(x => raw(b, x));
        return mk("trak", tkhd, ...others, mdia);
      });
      const mvhdNew = setDuration(raw(b, mvhd), 12, 20, movieDur);
      return mk("moov", mvhdNew, ...traks);
    };
    const ft = ftyp ? raw(b, ftyp) : mk("ftyp", new Uint8Array([105, 115, 111, 109, 0, 0, 2, 0, 105, 115, 111, 109, 105, 115, 111, 50, 97, 118, 99, 49, 109, 112, 52, 49]));
    const dataLen = live.reduce((s, T) => s + T.dataParts.reduce((a, p) => a + p.length, 0), 0);
    const big = dataLen + 8 > 0xffffffff;
    if (big) return null;
    const moov0 = build(live.map(() => 0));
    let at = ft.length + moov0.length + 8; const offs = live.map(T => { const o = at; at += T.dataParts.reduce((a, p) => a + p.length, 0); return o; });
    const moov1 = build(offs);
    const mdatHdr = new Uint8Array(8); new DataView(mdatHdr.buffer).setUint32(0, dataLen + 8); mdatHdr.set([109, 100, 97, 116], 4);
    const parts = [ft, moov1, mdatHdr]; live.forEach(T => parts.push(...T.dataParts));
    return { parts, samples: live.map(T => T.samples.length) };
  }

  async function fixBlob(blob){
    try {
      if (!blob || !blob.size) return blob;
      const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
      if (typ(head, 4) !== "ftyp") return blob;
      const buf = await blob.arrayBuffer();
      if (!isFragmented(buf)) return blob;
      const r = defrag(buf); if (!r) return blob;
      return new Blob(r.parts, { type: "video/mp4" });
    } catch(e){ console.warn("mp4fix", e); return blob; }
  }
  return { fixBlob, isFragmented, defrag };
})();
