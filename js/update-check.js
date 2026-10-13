// 새 버전 감지 — 사이트를 "열어 둔 채로" 쓰는 사람(홈 화면에 추가한 앱, 탭을 오래 켜 둔 PC, 뒤로가기로 복원된 화면)도
// 배포한 새 내용을 놓치지 않게 한다. 서버 캐시는 firebase.json 의 헤더가, 배포마다 바뀌는 version.json 은
// tools/bump-version.js 가 맡고, 이 스크립트는 "이미 떠 있는 화면"을 담당한다.
//
// 동작: 화면을 열 때의 빌드 번호를 기억해 두었다가, 화면으로 돌아오거나(visibilitychange/pageshow) 10분마다 version.json 을 다시 확인한다.
//  - 번호가 같으면 아무 일도 없다.
//  - 번호가 다르고, 사용자가 입력 중이 아니면 → 화면으로 돌아온 순간 조용히 새로고침한다.
//  - 입력 중이거나(작성 중인 글·챗봇 대화 포함) 화면을 보고 있는 중이면 → 하단에 "새 버전이 있어요 [새로고침]" 안내만 띄운다.
// version.json 이 없거나 읽지 못하면(로컬 열기 등) 아무 것도 하지 않는다.
(function () {
  if (window.__cjhsUpdateCheck) return;
  window.__cjhsUpdateCheck = true;

  var baseline = null, busyChecking = false, bannerShown = false;
  var INTERVAL_MS = 10 * 60 * 1000;

  function fetchBuild() {
    return fetch("version.json?t=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return j && j.build ? String(j.build) : null; })
      .catch(function () { return null; });
  }

  // 새로고침하면 잃을 것이 있는가(입력 중인 글, 선택해 둔 칩, 챗봇 대화)
  function userIsBusy() {
    var a = document.activeElement;
    if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return true;
    var fields = document.querySelectorAll("input:not([type=hidden]):not([type=button]):not([type=submit]), textarea");
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (/^(checkbox|radio)$/.test(f.type) ? f.checked !== f.defaultChecked : f.value !== f.defaultValue) return true;
    }
    return !!document.querySelector("#chat-log .msg.user");
  }

  function showBanner() {
    if (bannerShown || !document.body) return;
    bannerShown = true;
    var box = document.createElement("div");
    box.setAttribute("role", "status");
    box.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:calc(72px + env(safe-area-inset-bottom,0px));width:min(92vw,420px);z-index:2147483000;display:flex;align-items:center;gap:10px;padding:10px 12px 10px 16px;border-radius:14px;background:#14284F;color:#fff;font:600 13px/1.4 -apple-system,'Pretendard',sans-serif;box-shadow:0 8px 24px rgba(20,40,79,.35)";
    var msg = document.createElement("span");
    msg.style.flex = "1";
    msg.textContent = "새로운 내용이 있어요.";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "새로고침";
    btn.style.cssText = "border:0;border-radius:10px;padding:8px 12px;background:#ffd166;color:#14284F;font:800 13px sans-serif;cursor:pointer";
    btn.onclick = function () { location.reload(); };
    box.appendChild(msg);
    box.appendChild(btn);
    document.body.appendChild(box);
  }

  // comingBack: 화면으로 막 돌아온 순간인가(이때만 조용히 새로고침을 허용)
  function check(comingBack) {
    if (busyChecking) return;
    busyChecking = true;
    fetchBuild().then(function (b) {
      busyChecking = false;
      if (!b) return;
      if (baseline === null) { baseline = b; return; }
      if (b === baseline) return;
      if (comingBack && !userIsBusy()) location.reload();
      else showBanner();
    });
  }

  fetchBuild().then(function (b) { if (baseline === null) baseline = b; });

  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") check(true); });
  window.addEventListener("pageshow", function (e) { if (e.persisted) check(true); }); // 뒤로가기로 복원된 화면
  window.addEventListener("online", function () { check(false); });
  setInterval(function () { if (document.visibilityState === "visible") check(false); }, INTERVAL_MS);
})();
