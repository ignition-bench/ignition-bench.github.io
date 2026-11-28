(function(){
'use strict';
var KEY_SESSION = 'ib-notice-closed';
var KEY_UNTIL = 'ib-notice-until';
var DAYS = 7;
var LS = { get: function(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }, set: function(k,v){ try { localStorage.setItem(k,v); } catch(e){} }, del: function(k){ try { localStorage.removeItem(k); } catch(e){} } };
var SS = { get: function(k){ try { return sessionStorage.getItem(k); } catch(e){ return null; } }, set: function(k,v){ try { sessionStorage.setItem(k,v); } catch(e){} } };
LS.del('ib-notice-seen');

var T = {
  ko: {
    sheet: 'NOTICE · 소개',
    title: '이 사이트는 이런 곳이에요',
    p1: 'AI 덕분에 프로그램 만들기는 쉬워졌지만, 매번 긴 설명을 쓰고 설정하는 일은 여전히 피곤해요.',
    p2: '그래서 여기에는 설치 없이 바로 쓰는 가벼운 웹 도구(도화지)와, 내 AI에게 그 도구 쓰는 법을 알려 주는 <b>「AI 학습」 글</b>을 한 쌍으로 두었어요.',
    steps: ['도구를 열고', 'AI 학습 글을 복사해서', '내가 쓰는 AI(무료 플랜도 괜찮아요)에 붙여넣고', '나온 결과를 도구에 붙여넣으면 그림과 카드로 완성돼요'],
    p3: '로그인도, 따로 내는 비용도 없어요. 지금은 <b>기획 도구</b>와 <b>사운드 작업대</b>에서 써 볼 수 있고, 다른 도구로 넓혀 가는 중이에요.',
    view: '<b>제 전망:</b> 이 방식이 AI를 처음 써 보는 사람에게 부담 없는 입구가 되고, 재미를 느낀 사람이 스스로 더 배우러 가는 길이 되면 좋겠어요. 같은 방식을 쓰는 곳을 아직 많이 찾지 못해서, 하나의 실험으로 시작합니다.',
    go: '전체 보고서 읽기', go2: '보고서 바로가기', close: '닫기', x: '닫기', skip: '7일 동안 보지 않기'
  },
  en: {
    sheet: 'NOTICE · ABOUT',
    title: 'What this site is',
    p1: 'AI made building software easier, but writing long instructions and setting things up every time is still tiring.',
    p2: 'So here, a light web tool (a canvas with no install) is paired with an <b>“AI learning” text</b> that teaches your own AI how to use that tool.',
    steps: ['Open a tool,', 'copy its AI learning text,', 'paste it into the AI you already use (a free plan is fine),', 'then paste the result back into the tool — and it becomes a diagram or card.'],
    p3: 'No sign-in and no extra cost. You can try it now in the <b>Planner</b> and the <b>Sound Workbench</b>; more tools are on the way.',
    view: '<b>My outlook:</b> I hope this becomes a gentle entrance for people trying AI for the first time, and a path for those who enjoy it to keep learning on their own. I have not found many others doing the same, so I am starting it as an experiment.',
    go: 'Read the full report', go2: 'Go to report', close: 'Close', x: 'Close', skip: "Don't show for 7 days"
  }
};

var IC = [
  '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M6.5 6.5h.01"/>',
  '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>',
  '<path d="M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4z"/><path d="M8 8.5h8M8 11.5h5"/>',
  '<rect x="3" y="4" width="7" height="6" rx="1.5"/><rect x="14" y="14" width="7" height="6" rx="1.5"/><path d="M10 7h4a3 3 0 0 1 3 3v4"/>'
];
T.ko.flow = ['도구 열기', '학습 글 복사', '내 AI에 붙여넣기', '결과 붙여넣기'];
T.en.flow = ['Open tool', 'Copy text', 'Paste in AI', 'Paste result'];

var lang = 'ko', el = null, lastFocus = null, skip = false;

function html(L){
  var t = T[L];
  return '<div class="ib-nc" role="dialog" aria-modal="true" aria-labelledby="ibNt" tabindex="-1">'
    + '<button type="button" class="ib-nx" aria-label="' + t.x + '">✕</button>'
    + '<div class="ib-ns">' + t.sheet + '</div>'
    + '<div class="ib-nh"><h2 id="ibNt">' + t.title + '</h2><a class="ib-ngo2" href="ai-learning/">' + t.go2 + '</a></div>'
    + '<p>' + t.p1 + '</p><p>' + t.p2 + '</p>'
    + '<div class="ib-nf" aria-hidden="true">' + t.flow.map(function(f, i){ return '<span class="ib-ni"><i><svg viewBox="0 0 24 24">' + IC[i] + '</svg></i><em>' + f + '</em></span>'; }).join('') + '</div>'
    + '<ol class="ib-nl">' + t.steps.map(function(s){ return '<li>' + s + '</li>'; }).join('') + '</ol>'
    + '<p>' + t.p3 + '</p>'
    + '<p class="ib-nv">' + t.view + '</p>'
    + '<div class="ib-nb"><a class="ib-ngo" href="ai-learning/">' + t.go + '</a><label class="ib-nk"><input type="checkbox" class="ib-nkb"' + (skip ? ' checked' : '') + '> ' + t.skip + '</label><button type="button" class="ib-nc2">' + t.close + '</button></div>'
    + '</div>';
}

function fill(){
  if (!el) return;
  el.innerHTML = html(lang);
  el.querySelector('.ib-nx').addEventListener('click', close);
  el.querySelector('.ib-nc2').addEventListener('click', close);
  el.querySelector('.ib-nkb').addEventListener('change', function(e){ skip = e.target.checked; });
  var c = el.querySelector('.ib-nc'); if (c && el.classList.contains('on')) c.focus({ preventScroll: true });
}

function onKey(e){
  if (!el) return;
  if (e.key === 'Escape'){ e.preventDefault(); close(); return; }
  if (e.key !== 'Tab') return;
  var f = el.querySelectorAll('a[href], button, input'); if (!f.length) return;
  var a = f[0], z = f[f.length - 1];
  if (e.shiftKey && (document.activeElement === a || document.activeElement === el.querySelector('.ib-nc'))){ e.preventDefault(); z.focus(); }
  else if (!e.shiftKey && document.activeElement === z){ e.preventDefault(); a.focus(); }
}

function open(){
  if (el) return;
  skip = false;
  lastFocus = document.activeElement;
  el = document.createElement('div'); el.className = 'ib-notice';
  fill();
  el.addEventListener('click', function(e){ if (e.target === el) close(); });
  document.body.appendChild(el);
  document.documentElement.classList.add('ib-notice-on');
  requestAnimationFrame(function(){ if (el) el.classList.add('on'); });
  addEventListener('keydown', onKey);
  var c = el.querySelector('.ib-nc'); if (c) c.focus({ preventScroll: true });
}

function close(){
  if (!el) return;
  SS.set(KEY_SESSION, '1');
  if (skip) LS.set(KEY_UNTIL, String(Date.now() + DAYS * 864e5));
  var box = el; el = null;
  removeEventListener('keydown', onKey);
  document.documentElement.classList.remove('ib-notice-on');
  box.classList.remove('on');
  setTimeout(function(){ box.remove(); }, 260);
  if (lastFocus && lastFocus.focus){ try { lastFocus.focus({ preventScroll: true }); } catch(e){} }
}

window.IBNotice = {
  open: open,
  auto: function(){ if (SS.get(KEY_SESSION)) return; var u = +LS.get(KEY_UNTIL) || 0; if (u > Date.now()) return; setTimeout(open, 350); },
  setLang: function(l){ lang = l === 'en' ? 'en' : 'ko'; if (el) fill(); }
};
})();
