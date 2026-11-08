(function(){
'use strict';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const LS = { get(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }, set(k,v){ try { localStorage.setItem(k,v); } catch(e){} } };
const SS = { get(k){ try { return sessionStorage.getItem(k); } catch(e){ return null; } }, set(k,v){ try { sessionStorage.setItem(k,v); } catch(e){} } };

let lang = LS.get('ib-lang') || ((navigator.language || 'ko').toLowerCase().startsWith('ko') ? 'ko' : 'en');
let pcView = SS.get('ib-pcview') === '1';

function detect(){
  if (matchMedia('(pointer:fine)').matches) return 'pc';
  return Math.min(screen.width, screen.height) >= 600 ? 'tablet' : 'phone';
}
const DEV = {
  phone:{ic:'📱', ko:'휴대폰(터치)', en:'Phone (touch)'},
  tablet:{ic:'📟', ko:'태블릿(터치)', en:'Tablet (touch)'},
  pc:{ic:'🖥', ko:'마우스 · 트랙패드 — 모든 도구 열림', en:'Mouse / trackpad — all tools work'}
};
const NAME = { phone:{ko:'휴대폰', en:'Phone'}, tablet:{ko:'태블릿', en:'Tablet'}, pc:{ko:'PC', en:'PC'} };

function render(){
  const real = detect(), dev = pcView ? 'pc' : real, L = lang;
  document.documentElement.lang = L;
  $$('[data-ko]').forEach(el => { el.textContent = el.dataset[L]; });
  $$('[data-ko-title]').forEach(el => { el.title = el.dataset[L + 'Title']; el.setAttribute('aria-label', el.title); });
  $$('.lang button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.l === L)));

  const cards = $$('.card');
  const dimCount = cards.filter(c => !c.classList.contains('soon') && !c.dataset.dev.split(' ').includes(dev)).length;
  let tx = DEV[real][L];
  if (pcView) tx = L === 'ko' ? 'PC 버전으로 보는 중 — 터치로는 불편할 수 있어요' : 'PC version — may be awkward with touch';
  else if (real !== 'pc' && dimCount) tx += L === 'ko' ? ` — 흐린 카드 ${dimCount}개는 다른 기기에서` : ` — ${dimCount} dimmed card${dimCount>1?'s':''} for other devices`;
  $('#devIc').textContent = DEV[real].ic;
  $('#devTx').textContent = tx;
  const btn = $('#devBtn');
  btn.hidden = real === 'pc';
  btn.textContent = pcView ? (L === 'ko' ? '↩ 이 기기에 맞게' : '↩ Fit device') : (L === 'ko' ? '🖥 PC 버전으로 보기' : '🖥 PC version');
  $('#devline').title = $('#devTx').textContent;

  cards.forEach(c => {
    const ok = c.dataset.dev.split(' '), dim = !c.classList.contains('soon') && !ok.includes(dev);
    c.classList.toggle('dim', dim);
    c.querySelector('.devs').innerHTML = ['phone','tablet','pc'].map(d => {
      const yes = ok.includes(d), label = `${NAME[d][L]} — ${yes ? (L === 'ko' ? '열려요' : 'works') : (L === 'ko' ? '안 열려요' : 'not available')}`;
      return `<span class="${yes ? '' : 'no'} ${d === real ? 'here' : ''}" title="${label}" role="img" aria-label="${label}">${DEV[d].ic}</span>`;
    }).join('');
    const o = c.querySelector('.open'), why = c.querySelector('.why');
    if (dim){
      o.textContent = L === 'ko' ? '안내 보기' : 'Info';
      const where = ok.map(d => DEV[d].ic + ' ' + NAME[d][L]).join(' · ');
      why.innerHTML = (L === 'ko' ? `이 도구는 <b>${where}</b>에서 열려요. 지금 기기로는 일부 기능이 안 될 수 있어요. ` : `This tool works on <b>${where}</b>. Some features may not work on this device. `)
        + `<a href="${o.getAttribute('href')}">${L === 'ko' ? '그래도 열기 →' : 'Open anyway →'}</a>`;
    } else { why.classList.remove('show'); why.innerHTML = ''; }
  });
  $$('[data-rail]').forEach(r => r._update && r._update());
}

document.addEventListener('click', e => {
  const o = e.target.closest('.card.dim .open'); if (!o) return;
  e.preventDefault(); const w = o.closest('.card').querySelector('.why'); w.classList.toggle('show');
});
$('#devBtn').addEventListener('click', () => { pcView = !pcView; SS.set('ib-pcview', pcView ? '1' : '0'); render(); });
$$('.lang button').forEach(b => b.addEventListener('click', () => { lang = b.dataset.l; LS.set('ib-lang', lang); render(); }));
addEventListener('resize', () => { clearTimeout(render.tm); render.tm = setTimeout(render, 150); });

let hlTimer = 0;
function focusGroup(id){
  const sec = document.getElementById(id), main = $('main'); if (!sec) return;
  const reduceNow = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fits = sec.offsetHeight < innerHeight * .8;
  sec.scrollIntoView({ behavior: reduceNow ? 'auto' : 'smooth', block: fits ? 'center' : 'start' });
  try { history.replaceState(null, '', '#' + id); } catch(e){}
  $$('section.grp').forEach(s => s.classList.remove('hl'));
  clearTimeout(hlTimer);
  void sec.offsetWidth;
  sec.classList.add('hl'); main.classList.add('focusing');
  hlTimer = setTimeout(() => { main.classList.remove('focusing'); sec.classList.remove('hl'); }, 1900);
  const first = sec.querySelector('.card .open'); if (first) setTimeout(() => { try { first.focus({ preventScroll: true }); } catch(e){} }, reduceNow ? 0 : 450);
}
$$('.jump a').forEach(a => a.addEventListener('click', e => { e.preventDefault(); focusGroup(a.getAttribute('href').slice(1)); }));

function setupRail(rail){
  const nav = document.createElement('div'); nav.className = 'rail-nav'; nav.hidden = true;
  nav.innerHTML = '<button type="button" class="prev">‹</button><div class="rail-dots" aria-hidden="true"></div><button type="button" class="next">›</button>';
  rail.after(nav);
  const prev = nav.querySelector('.prev'), next = nav.querySelector('.next'), dots = nav.querySelector('.rail-dots');
  const gap = () => parseFloat(getComputedStyle(rail).columnGap) || 0;
  const step = () => rail.clientWidth + gap();
  const per = () => { const c = rail.querySelector('.card'); return c ? Math.max(1, Math.round(step() / (c.offsetWidth + gap()))) : 1; };
  const pages = () => Math.max(1, Math.ceil(rail.querySelectorAll(':scope > .card').length / per()));
  const maxLeft = () => rail.scrollWidth - rail.clientWidth;
  const page = () => rail.scrollLeft >= maxLeft() - 4 ? pages() - 1 : Math.round(rail.scrollLeft / step());
  const go = i => rail.scrollTo({ left: Math.max(0, Math.min(i * step(), maxLeft())), behavior: 'smooth' });
  function update(){
    const over = rail.scrollWidth > rail.clientWidth + 4; nav.hidden = !over; if (!over) return;
    const n = pages(), i = Math.min(n - 1, page());
    if (dots.children.length !== n) dots.innerHTML = '<span></span>'.repeat(n);
    [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
    prev.disabled = rail.scrollLeft < 4; next.disabled = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 4;
    prev.setAttribute('aria-label', lang === 'ko' ? '이전 카드' : 'Previous'); next.setAttribute('aria-label', lang === 'ko' ? '다음 카드' : 'Next');
  }
  prev.addEventListener('click', () => go(page() - 1));
  next.addEventListener('click', () => go(page() + 1));
  rail.addEventListener('scroll', () => { cancelAnimationFrame(rail._r); rail._r = requestAnimationFrame(update); }, { passive: true });
  addEventListener('resize', update);
  rail._update = update; update();
}
$$('[data-rail]').forEach(setupRail);

(function(){
  const bar = $('#minibar'), head = $('header.top'), secs = $$('section.grp');
  let lastY = scrollY, tick = 0;
  const phone = () => matchMedia('(max-width:720px)').matches;
  function onScroll(){
    const y = scrollY, out = $('.brand').getBoundingClientRect().bottom < 0;
    bar.hidden = !out;
    if (out && phone()){ if (y > lastY + 6) bar.classList.add('mb-hide'); else if (y < lastY - 6) bar.classList.remove('mb-hide'); }
    else bar.classList.remove('mb-hide');
    lastY = y;
    const line = innerHeight * .35, atEnd = innerHeight + y >= document.documentElement.scrollHeight - 4;
    let on = secs.filter(s => { const r = s.getBoundingClientRect(); return r.top <= line && r.bottom > 60; });
    if (atEnd){ const lastTop = Math.round(secs[secs.length-1].getBoundingClientRect().top); on = secs.filter(s => Math.abs(Math.round(s.getBoundingClientRect().top) - lastTop) < 4); }
    if (y < 40) on = [];
    const ids = on.map(s => '#' + s.id);
    $$('.jump a').forEach(a => a.classList.toggle('on', ids.includes(a.getAttribute('href'))));
  }
  addEventListener('scroll', () => { cancelAnimationFrame(tick); tick = requestAnimationFrame(onScroll); }, { passive: true });
  addEventListener('resize', onScroll);
  $('#mbTop').addEventListener('click', () => { scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); try { history.replaceState(null, '', location.pathname); } catch(e){} });
  onScroll();
})();

function playIntro(){ if (window.IBIntro) IBIntro.play({ lang, onEnd(){ SS.set('ib-intro-seen', '1'); } }); }
$('#replay').addEventListener('click', playIntro);

render();
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!reduce && !SS.get('ib-intro-seen') && !location.hash) playIntro();
})();
