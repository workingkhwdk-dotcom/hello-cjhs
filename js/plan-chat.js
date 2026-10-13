// "내 커리큘럼 분석 결과로 챗봇과 이어서 상담" — 일반 스크립트(모듈 아님)라서 index·mobile·chatbot 어디서든 <script src>로 불러 쓴다.
// 흐름: 과목 짜보기(js/course-planner.js)에서 분석을 받고 "이어서 상담하기"를 누르면 set()으로 선택·분석을 저장하고 챗봇으로 이동(open()).
// 챗봇 화면은 mount()로 상단에 안내 줄과 추천 질문을 붙이고, 이후 모든 질문에 get() 값을 planContext로 함께 보낸다(서버가 다시 검증해서 씀).
// 저장은 이 기기 브라우저(localStorage)에만 하고 12시간 뒤 사라진다. 저장소를 못 쓰면 이번 방문 동안만 메모리에 둔다.
(function () {
  var KEY = "cjhs_plan_chat_v1", TTL = 12 * 3600 * 1000, mem = null, view = null;

  function get() {
    try {
      var o = mem || JSON.parse(localStorage.getItem(KEY) || "null");
      if (o && o.picks && Date.now() - (o.at || 0) < TTL) return { picks: o.picks, analysis: o.analysis || null };
    } catch (e) { /* 저장소 사용 불가·깨진 값 */ }
    return null;
  }
  function set(ctx) {
    mem = { picks: ctx.picks, analysis: ctx.analysis || null, at: Date.now() };
    try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* 메모리에는 남음 */ }
    if (view) render();
  }
  function clear() {
    mem = null;
    try { localStorage.removeItem(KEY); } catch (e) { /* 무시 */ }
    if (view) render();
  }
  // 모바일(한 페이지 안의 챗봇 탭)이면 그 탭을 열고, PC면 챗봇 페이지로 간다.
  function open() {
    var tab = document.querySelector('.m-tabbar .m-tab[data-sec="chat"]');
    if (tab) tab.click(); else location.href = "chatbot.html";
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function chips(ctx) {
    var a = ctx.analysis, list = [];
    if (a && a.majors && a.majors[0]) list.push("왜 " + a.majors[0].track + " 쪽이 가장 잘 맞는다고 봤어요?");
    if (a && a.gaps && a.gaps[0]) list.push("아쉬운 점은 어떻게 보완하면 좋을까요?");
    if (a && a.tips && a.tips[0]) list.push("제안해 준 대로 바꾸면 뭐가 달라져요?");
    list.push("이 조합으로 학생부는 어떻게 채워 가면 좋을까요?");
    return list.slice(0, 4);
  }

  // 챗봇 화면에 붙인다. ui: { chatLog, addMessage(role, text), sendMessage(text) } — 두 챗봇 화면(chatbot.render.js, mobile.render.js)이 같은 이름을 쓴다.
  function render() {
    if (!view) return;
    var ui = view, ctx = get();
    if (ui.bar) { ui.bar.remove(); ui.bar = null; }
    if (ui.hello) { ui.hello.remove(); ui.hello = null; }
    if (!ctx) return;
    var a = ctx.analysis, bar = document.createElement("div");
    bar.className = "plan-ctx";
    bar.innerHTML = '<span class="plan-ctx-txt"><span><b>내 커리큘럼 분석</b>을 보면서 대화하는 중이에요</span>' + (a && a.headline ? '<small>' + esc(a.headline) + '</small>' : '') + '</span>' +
      '<button type="button" class="plan-ctx-off">해제</button>';
    bar.querySelector(".plan-ctx-off").addEventListener("click", clear);
    ui.chatLog.parentNode.insertBefore(bar, ui.chatLog);
    ui.bar = bar;
    var hello = ui.addMessage("bot", a && a.majors && a.majors[0]
      ? "분석 결과 잘 봤어요. **" + a.majors[0].track + "** 쪽이 " + a.majors[0].score + "점으로 가장 높게 나왔네요. 궁금한 걸 편하게 물어봐 주세요. 아래 질문으로 시작해도 좋아요."
      : "선택하신 과목 조합을 확인했어요. 이 조합에 대해 궁금한 걸 편하게 물어봐 주세요.");
    var row = document.createElement("div");
    row.className = "plan-ctx-chips";
    chips(ctx).forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "quick-chip"; b.textContent = t;
      b.addEventListener("click", function () { ui.sendMessage(t); });
      row.appendChild(b);
    });
    hello.appendChild(row);
    ui.hello = hello;
  }
  function mount(ui) {
    // 대화 초기화 등으로 다시 붙일 때, 이전에 붙였던 안내 줄·첫 메시지가 남아 겹치지 않게 먼저 걷어 낸다.
    if (view) { if (view.bar) view.bar.remove(); if (view.hello) view.hello.remove(); }
    view = ui; render();
  }

  window.CjhsPlanChat = { get: get, set: set, clear: clear, open: open, mount: mount };
})();
