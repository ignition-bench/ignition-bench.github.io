(function(){
'use strict';
const END = 4.2;
const WARP = [[0, 1.22, .58], [1.22, 2.0, .55], [2.0, 2.3, 1], [2.3, 3.45, .75], [3.45, END, 1]];
const REAL_END = WARP.reduce((a, w) => a + (w[1]-w[0])/w[2], 0);
function sceneT(r){ let acc = 0; for (const [a, b, v] of WARP){ const d = (b-a)/v; if (r <= acc + d) return a + (r-acc)*v; acc += d; } return END; }

const clamp = (v,a=0,b=1) => Math.max(a, Math.min(b, v));
const seg = (t,a,b) => clamp((t-a)/(b-a));
const lerp = (a,b,p) => a + (b-a)*p;
const E = {
  outExpo: p => p>=1 ? 1 : 1 - Math.pow(2, -10*p),
  outCubic: p => 1 - Math.pow(1-p, 3),
  inOut: p => p<.5 ? 4*p*p*p : 1 - Math.pow(-2*p+2, 3)/2,
  outBack: p => { const c1 = 1.9, c3 = c1+1; return 1 + c3*Math.pow(p-1,3) + c1*Math.pow(p-1,2); }
};
function rng(seed){ return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let x = Math.imul(seed ^ seed>>>15, 1|seed); x = x + Math.imul(x ^ x>>>7, 61|x) ^ x; return ((x ^ x>>>14) >>> 0) / 4294967296; }; }
const hex = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
const mix = (a,b,p) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v,i)=>Math.round(lerp(v,B[i],p))).join(',')})`; };
const FONT = '"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",system-ui,-apple-system,"Segoe UI",sans-serif';
const FLAME_D = 'M41 49 C 29 45, 31 32, 36 25 C 37 31, 40 32, 41 30 C 42 24, 41 18, 46 14 C 48 24, 54 29, 52 39 C 51 45, 47 49, 41 49Z';
const TITLE = 'The Ignition Bench';
const SUB = { ko:'생각에 불을 붙이는 작업대', en:'WHERE IDEAS CATCH FIRE' };
const WORDS = { ko:['생각','설계','만들기'], en:['THINK','PLAN','BUILD'] };
const BEATS = [ {bg:'#0b0a09', fg:'#e9f1ff', sh:'#a8c5ea'}, {bg:'#0d2541', fg:'#e9f1ff', sh:'#5fd3b0'}, {bg:'#ff7a2f', fg:'#1a0c04', sh:'#1a0c04'} ];
const FX = ['glow', 'slice', 'echo'];

let cv, ctx, W = 0, H = 0, dpr = 1, lang = 'ko', FLAME;

function makeBurst(seed, n, o){ const r = rng(seed), a = [];
  for (let i=0;i<n;i++) a.push({ a: r()*Math.PI*2, v: lerp(o.vmin, o.vmax, Math.pow(r(),.7)), life: lerp(o.lmin, o.lmax, r()), sz: lerp(1.2, 3.4, r()), up: lerp(20, 120, r()) });
  return a; }
const BURST = makeBurst(7, 110, {vmin:260, vmax:1150, lmin:.45, lmax:1.35});
const AMB = makeBurst(99, 34, {vmin:0, vmax:0, lmin:2, lmax:3.5});
AMB.forEach((p,i) => { const r = rng(500+i); p.x = r(); p.y = r(); p.ph = r()*3; p.sp = lerp(.04,.12,r()); });

function layout(){
  const portrait = H > W * 1.15;
  const S = portrait ? W*0.34 : Math.min(H*0.30, W*0.17);
  const ts = portrait ? Math.min(W*0.088, 40) : Math.min(H*0.105, W*0.052);
  ctx.font = `800 ${ts}px ${FONT}`;
  const tw = ctx.measureText(TITLE).width;
  let bx, by, tx, ty;
  if (portrait){ bx = W/2; by = H*0.40; tx = W/2 - tw/2; ty = by + S*0.78 + ts; }
  else { const gap = S*0.32, gw = S + gap + tw; bx = (W-gw)/2 + S/2; by = H/2; tx = bx + S/2 + gap; ty = by + ts*0.18; }
  return { portrait, S, ts, tw, bx, by, tx, ty };
}
function bgFill(c){ ctx.fillStyle = c; ctx.fillRect(0, 0, W, H); }
function rr(x, y, w, h, r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
function glow(x, y, r, a){ if (a <= 0) return; const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,122,47,${.55*a})`); g.addColorStop(.4, `rgba(255,122,47,${.18*a})`); g.addColorStop(1, 'rgba(255,122,47,0)');
  ctx.fillStyle = g; ctx.fillRect(x-r, y-r, r*2, r*2); }
function drawFlame(cx, cy, size, sc, flick){ if (sc <= 0) return; const k = size/35 * sc;
  ctx.save(); ctx.translate(cx, cy + size*0.5*sc); ctx.scale(k, k*(1+flick)); ctx.translate(-41.5, -49);
  ctx.fillStyle = '#ff7a2f'; ctx.fill(FLAME); ctx.translate(41.5, 49); ctx.scale(.55, .55); ctx.translate(-41.5, -49); ctx.fillStyle = '#ffb35c'; ctx.fill(FLAME); ctx.restore(); }
function drawBurst(x, y, age, scale){ if (age < 0) return; ctx.save(); ctx.lineCap = 'round';
  for (const p of BURST){ if (age > p.life) continue;
    const k = 3.2, d = p.v*scale*(1 - Math.exp(-k*age))/k, sp = p.v*scale*Math.exp(-k*age);
    const px = x + Math.cos(p.a)*d, py = y + Math.sin(p.a)*d - p.up*scale*age*age, q = age/p.life, len = Math.min(26*scale, sp*0.035);
    ctx.strokeStyle = q < .35 ? mix('#fff1d6','#ffb35c',q/.35) : mix('#ffb35c','#b8360f',(q-.35)/.65);
    ctx.globalAlpha = 1 - q*q; ctx.lineWidth = p.sz*(1-q*.5);
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - Math.cos(p.a)*len, py - Math.sin(p.a)*len + 0.01); ctx.stroke(); }
  ctx.restore(); }
function ambient(a, tt){ if (a <= 0) return; ctx.save();
  for (const p of AMB){ const y = ((p.y - (tt+p.ph)*p.sp) % 1 + 1) % 1, x = p.x + Math.sin((tt+p.ph)*1.7)*0.01;
    ctx.globalAlpha = a * (0.25 + 0.5*Math.sin(y*Math.PI)); ctx.fillStyle = '#ffb35c'; ctx.beginPath(); ctx.arc(x*W, y*H, p.sz*0.7, 0, 7); ctx.fill(); }
  ctx.restore(); }
function grid(prog, alpha){
  const g = Math.max(26, Math.min(W, H)/13); ctx.save(); ctx.lineWidth = 1; let i = 0;
  for (let x = (W/2)%g; x < W; x += g, i++){ const d = .06 + ((i*7)%11)*.025, p = E.outExpo(seg(prog, d, d+.42)); if (p<=0) continue;
    ctx.strokeStyle = `rgba(168,197,234,${alpha*(i%5===0?.3:.13)})`; ctx.beginPath();
    if (i%2){ ctx.moveTo(x, 0); ctx.lineTo(x, H*p); } else { ctx.moveTo(x, H); ctx.lineTo(x, H-H*p); } ctx.stroke(); }
  i = 0;
  for (let y = (H/2)%g; y < H; y += g, i++){ const d = .1 + ((i*5)%9)*.03, p = E.outExpo(seg(prog, d, d+.42)); if (p<=0) continue;
    ctx.strokeStyle = `rgba(168,197,234,${alpha*(i%5===0?.3:.13)})`; ctx.beginPath();
    if (i%2){ ctx.moveTo(0, y); ctx.lineTo(W*p, y); } else { ctx.moveTo(W, y); ctx.lineTo(W-W*p, y); } ctx.stroke(); }
  ctx.restore(); }
function riseTitle(L, t0, tt){
  ctx.save(); ctx.font = `800 ${L.ts}px ${FONT}`; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#e9f1ff'; let x = L.tx;
  for (let i=0;i<TITLE.length;i++){ const ch = TITLE[i], w = ctx.measureText(ch).width, a = t0 + i*0.032;
    const p = E.outExpo(seg(tt, a, a+.42)), al = seg(tt, a, a+.1);
    if (al > 0 && ch !== ' '){ ctx.save(); ctx.globalAlpha = al; ctx.beginPath(); ctx.rect(x-4, L.ty - L.ts*1.1, w+8, L.ts*1.4); ctx.clip();
      ctx.translate(0, (1-p)*L.ts*1.15); ctx.fillText(ch, x, L.ty); ctx.restore(); }
    x += w; }
  ctx.restore(); }
function subtitle(L, t0, tt){
  const p = E.outCubic(seg(tt, t0, t0+.45)); if (p <= 0) return;
  const fs = Math.max(11, L.ts*0.32), y = L.ty + L.ts*0.62 + fs;
  ctx.save(); ctx.font = `600 ${fs}px ${FONT}`; ctx.fillStyle = '#8fb0d6'; ctx.globalAlpha = p;
  const txt = SUB[lang]; try { ctx.letterSpacing = '0.12em'; } catch(e){}
  const w = ctx.measureText(txt).width, x = L.portrait ? W/2 - w/2 : L.tx;
  ctx.fillText(txt, x + (1-p)*12, y);
  const lp = E.outExpo(seg(tt, t0+.08, t0+.6));
  ctx.fillStyle = '#ff7a2f'; ctx.globalAlpha = 1; ctx.fillRect(L.portrait ? W/2 - L.tw/2 : L.tx, L.ty + L.ts*0.3, L.tw*lp, Math.max(2, L.ts*0.06));
  ctx.restore(); }
function shapePath(k, cx, cy, s){
  ctx.beginPath();
  if (k === 0) rr(cx - s*.6, cy - s*.5, s*1.2, s, s*.14);
  else if (k === 1){ ctx.moveTo(cx, cy - s*.62); ctx.lineTo(cx + s*.62, cy); ctx.lineTo(cx, cy + s*.62); ctx.lineTo(cx - s*.62, cy); ctx.closePath(); }
  else rr(cx - s*.5, cy - s*.6, s, s*1.2, s*.14); }
function drawWord(word, fs, C, k, lt, wp){
  const fx = FX[k], dir = k%2 ? -1 : 1, sc = lerp(1.4, 1, wp);
  ctx.save(); ctx.font = `900 ${fs}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.translate(W/2 + (1-wp)*W*.18*dir, H/2); ctx.scale(sc, sc);
  const hot = k === 2 ? '#0d2541' : '#ff7a2f', cool = k === 2 ? '#fff1d6' : '#a8c5ea';
  if (fx === 'echo'){
    const d = (1-wp)*fs*.28 + fs*.02*Math.max(0, 1 - lt/.32)*Math.sin(lt*70);
    ctx.globalAlpha = .75; ctx.fillStyle = hot; ctx.fillText(word, -d - fs*.012, d*.25);
    ctx.fillStyle = cool; ctx.fillText(word, d + fs*.012, -d*.25);
    ctx.globalAlpha = 1; ctx.fillStyle = C.fg; ctx.fillText(word, 0, 0);
  } else if (fx === 'glow'){
    const sp = E.outCubic(seg(lt, 0, .22)), fp = E.outCubic(seg(lt, .1, .3));
    ctx.save(); ctx.shadowColor = 'rgba(255,122,47,.95)'; ctx.shadowBlur = fs*.18*(1 - fp*.6);
    ctx.lineWidth = Math.max(2, fs*.022); ctx.strokeStyle = '#ffb35c'; ctx.lineJoin = 'round';
    ctx.setLineDash([fs*6*sp, fs*6]); ctx.strokeText(word, 0, 0); ctx.restore();
    ctx.globalAlpha = fp; ctx.fillStyle = C.fg; ctx.fillText(word, 0, 0);
  } else {
    const sp = E.outExpo(seg(lt, 0, .3)), off = (1-sp)*W*.35, h = fs*.75;
    ctx.save(); ctx.beginPath(); ctx.rect(-W, -h, W*2, h); ctx.clip(); ctx.fillStyle = C.fg; ctx.fillText(word, -off, 0); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(-W, 0, W*2, h); ctx.clip(); ctx.fillStyle = C.fg; ctx.fillText(word, off, 0); ctx.restore();
    const fl = seg(lt, .18, .34); if (fl > 0 && fl < 1){ ctx.globalAlpha = 1 - fl; ctx.fillStyle = hot; ctx.fillRect(-W*.5*(1-fl*.3), -1.5, W*(1-fl*.3), 3); }
  }
  ctx.restore(); }

function scene(tt){
  const L = layout(), beat = .38, b0 = .08, endCuts = b0 + beat*3;
  if (tt < endCuts){
    const k = Math.min(2, Math.floor(Math.max(0, tt-b0)/beat)), lt = tt - b0 - k*beat, C = BEATS[k];
    bgFill(tt < b0 ? '#000' : C.bg);
    if (tt >= b0){
      const ss = Math.min(W, H) * .62, rp = E.outExpo(seg(lt, 0, .35));
      ctx.save(); ctx.translate(W/2, H/2); ctx.rotate((1-rp)*0.5); ctx.scale(lerp(1.5, 1, rp), lerp(1.5, 1, rp)); ctx.translate(-W/2, -H/2);
      shapePath(k, W/2, H/2, ss); ctx.strokeStyle = C.sh; ctx.globalAlpha = .55; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
      const word = WORDS[lang][k], wp = E.outExpo(seg(lt, 0, .28));
      let fs = Math.min(W*(lang==='ko'?.2:.18), H*.26);
      ctx.font = `900 ${fs}px ${FONT}`; const mw = ctx.measureText(word).width;
      const room = k === 0 ? ss*1.2*.84 : k === 1 ? Math.max(ss*.3, 2*(ss*.62 - fs*.42)*.86) : ss*.82;
      if (mw > room) fs *= room/mw;
      drawWord(word, fs, C, k, lt, wp);
      const fl = 1 - seg(lt, 0, .08); if (fl > 0){ ctx.fillStyle = `rgba(255,255,255,${fl*.35})`; ctx.fillRect(0,0,W,H); }
    }
    return;
  }
  const ta = endCuts, T2 = ta + .78;
  bgFill('#0d2541');
  const sh = tt > T2 ? Math.max(0, 1 - (tt-T2)/.45) : 0;
  ctx.save(); ctx.translate(Math.sin(tt*93)*14*sh, Math.cos(tt*71)*10*sh);
  grid(tt - endCuts + .2, .9);
  const u = L.S*1.3/120, ox = L.bx - 64*u, oy = L.by - 60*u;
  [{k:0, x:41, y:31, s:40}, {k:1, x:41, y:85, s:37}, {k:2, x:91, y:85, s:40}].forEach((p, i) => {
    const q = E.outBack(seg(tt, ta + i*.07, ta + .5 + i*.07));
    const cx = lerp(W/2, ox + p.x*u, q), cy = lerp(H/2, oy + p.y*u, q), s = lerp(Math.min(W,H)*.62, p.s*u, E.outExpo(seg(tt, ta + i*.07, ta + .45 + i*.07)));
    ctx.save(); shapePath(p.k, cx, cy, s);
    ctx.fillStyle = p.k === 1 ? '#103a3a' : '#11304f'; ctx.globalAlpha = seg(tt, ta+.15+i*.07, ta+.4+i*.07); ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = p.k === 1 ? '#5fd3b0' : '#a8c5ea'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
  });
  ctx.save(); ctx.translate(ox, oy); ctx.scale(u, u); ctx.lineCap = 'round';
  const smp = E.outCubic(seg(tt, ta+.42, ta+.7));
  if (smp > 0){ ctx.save(); ctx.globalAlpha = smp; ctx.strokeStyle = '#5fd3b0'; ctx.lineWidth = 2.8; ctx.setLineDash([40*smp, 60]);
    ctx.beginPath(); ctx.moveTo(35.5, 79); ctx.lineTo(35.5, 84); ctx.moveTo(46.5, 79); ctx.lineTo(46.5, 84); ctx.moveTo(33.5, 89.5); ctx.quadraticCurveTo(41, 96, 48.5, 89.5); ctx.stroke(); ctx.restore(); }
  const hp = seg(tt, ta+.5, ta+.8);
  if (hp > 0){ const sw = E.outBack(hp);
    ctx.save(); ctx.globalAlpha = seg(tt, ta+.5, ta+.58); ctx.translate(93.8, 87.6); ctx.rotate((-40 - (1-sw)*55) * Math.PI/180); ctx.scale(1.08, 1.08); ctx.fillStyle = '#ff7a2f';
    rr(-1.9, -5, 3.8, 16, 1.5); ctx.fill(); rr(-9, -11, 18, 7, 1.8); ctx.fill(); ctx.restore();
    const hit = seg(tt, ta+.66, ta+.9);
    if (hit > 0 && hit < 1){ ctx.save(); ctx.globalAlpha = 1-hit; ctx.strokeStyle = '#ffb35c'; ctx.lineWidth = 1.6;
      for (const a of [-2.6, -1.9, -1.2]){ const r0 = 13 + hit*5, r1 = r0 + 4; ctx.beginPath(); ctx.moveTo(91 + Math.cos(a)*r0, 85 + Math.sin(a)*r0); ctx.lineTo(91 + Math.cos(a)*r1, 85 + Math.sin(a)*r1); ctx.stroke(); }
      ctx.restore(); } }
  ctx.restore();
  const lp = E.outExpo(seg(tt, ta+.55, ta+.85));
  if (lp > 0){ ctx.save(); ctx.strokeStyle = '#a8c5ea'; ctx.lineWidth = 3; ctx.beginPath();
    ctx.moveTo(ox+41*u, oy+51*u); ctx.lineTo(ox+41*u, oy+(51+11*lp)*u); ctx.moveTo(ox+64*u, oy+85*u); ctx.lineTo(ox+(64+8*lp)*u, oy+85*u); ctx.stroke(); ctx.restore(); }
  const fx = ox+41*u, fy = oy+31*u;
  glow(fx, fy, L.S*2.0, tt > T2 ? (seg(tt, T2, T2+.15)*(.75 + .1*Math.sin(tt*9)) + (1-seg(tt, T2, T2+.6))*.6) : 0);
  if (tt > T2){ const q = seg(tt, T2, T2+.85), r = E.outExpo(q)*Math.max(W, H)*.85;
    ctx.save(); ctx.strokeStyle = `rgba(255,179,92,${(1-q)*.9})`; ctx.lineWidth = 2 + (1-q)*10; ctx.beginPath(); ctx.arc(fx, fy, r, 0, 7); ctx.stroke();
    ctx.strokeStyle = `rgba(168,197,234,${(1-q)*.5})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(fx, fy, r*.62, 0, 7); ctx.stroke(); ctx.restore(); }
  drawBurst(fx, fy, tt - T2, L.S/190);
  drawFlame(fx, fy, 20*u, E.outBack(seg(tt, T2, T2+.35)), Math.sin(tt*21)*.035);
  ambient(seg(tt, T2, T2+.5), tt);
  riseTitle(L, T2 + .22, tt);
  subtitle(L, T2 + .72, tt);
  ctx.restore();
  if (tt > T2){ const f = 1 - seg(tt, T2, T2+.32); ctx.fillStyle = `rgba(255,214,170,${f*f*.75})`; ctx.fillRect(0, 0, W, H); }
  const wp = E.inOut(seg(tt, 3.45, END));
  if (wp > 0){
    const band = Math.max(40, W*.06), edge = -40 + (W + H + band + 80)*wp;
    ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.moveTo(-W*3, 0); ctx.lineTo(edge - band, 0); ctx.lineTo(edge - band - H, H); ctx.lineTo(-W*3, H); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.fillStyle = '#ff7a2f'; ctx.beginPath(); ctx.moveTo(edge - band, 0); ctx.lineTo(edge, 0); ctx.lineTo(edge - H, H); ctx.lineTo(edge - band - H, H); ctx.closePath(); ctx.fill(); ctx.restore();
  }
}

let raf = 0, t0 = 0, box = null, done = null;
function fit(){ const r = box.getBoundingClientRect(); W = r.width; H = r.height; dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(W*dpr); cv.height = Math.round(H*dpr); }
function frame(now){
  const r = (now - t0)/1000;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(0, 0, W, H);
  scene(sceneT(r));
  if (r >= REAL_END) { finish(); return; }
  raf = requestAnimationFrame(frame);
}
function finish(){
  if (!box) return;
  cancelAnimationFrame(raf);
  const b = box; box = null;
  b.classList.add('out');
  document.documentElement.classList.remove('ib-intro-on');
  removeEventListener('resize', fit); removeEventListener('keydown', onKey);
  setTimeout(() => b.remove(), 400);
  if (done) { const d = done; done = null; d(); }
}
function onKey(e){ if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); finish(); } }

window.IBIntro = {
  length: REAL_END,
  play(opt){
    opt = opt || {}; lang = opt.lang === 'en' ? 'en' : 'ko'; done = opt.onEnd || null;
    if (box) finish();
    FLAME = FLAME || new Path2D(FLAME_D);
    box = document.createElement('div'); box.className = 'ib-intro'; box.setAttribute('role', 'presentation');
    cv = document.createElement('canvas'); cv.setAttribute('aria-hidden', 'true'); ctx = cv.getContext('2d');
    const skip = document.createElement('button'); skip.type = 'button'; skip.className = 'ib-skip'; skip.textContent = lang === 'en' ? 'Skip ›' : '건너뛰기 ›';
    box.append(cv, skip); document.body.appendChild(box);
    document.documentElement.classList.add('ib-intro-on');
    box.addEventListener('click', finish); addEventListener('keydown', onKey); addEventListener('resize', fit);
    fit(); t0 = performance.now(); raf = requestAnimationFrame(frame);
    setTimeout(() => { try { skip.focus({ preventScroll: true }); } catch(e){} }, 50);
  },
  skip: finish
};
})();
