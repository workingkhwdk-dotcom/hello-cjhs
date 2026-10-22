// 새 버전 감지 — 사이트를 "열어 둔 채로" 쓰는 사람(홈 화면에 추가한 앱, 탭을 오래 켜 둔 PC, 뒤로가기로 복원된 화면)도
// 배포한 새 내용을 놓치지 않게 한다. 서버 캐시는 firebase.json 의 헤더가, 배포마다 바뀌는 version.json 은
// tools/bump-version.js 가 맡고, 이 스크립트는 "이미 떠 있는 화면"을 담당한다.
//
// 동작: 화면을 열 때의 빌드 번호를 기억해 두었다가, 화면으로 돌아오거나(visibilitychange/pageshow) 10분마다 version.json 을 다시 확인한다.
//  - 번호가 같으면 아무 일도 없다.
//  - 번호가 다르고, 사용자가 입력 중이 아니면 → 화면으로 돌아온 순간 조용히 새로고침한다.
//  - 입력 중이거나(작성 중인 글·챗봇 대화 포함) 화면을 보고 있는 중이면 → 하단에 "새 버전이 있어요 [새로고침]" 안내만 띄운다.
// version.json 이 없거나 읽지 못하면(로컬 열기 등) 아무 것도 하지 않는다.
//
// 업데이트 후 첫 방문(2026-10-22): 지난번에 본 빌드 번호(localStorage)와 지금 번호가 다르면 —
//  ① 이전 캐시를 지운다: 브라우저 Cache Storage, 사진 미리받기 목록, 학교소개 내용 임시 저장본.
//  ② 사용 가이드(모바일 사용법 안내·학교 박람회 안내)를 "아직 안 본" 상태로 되돌려 새로 보이게 한다.
//  학생이 고른 과목·AI 분석, 기기 ID, 챗봇 제한·방문자 집계 기록, 홈 화면 추가 안내, 관리자 푸시용 서비스워커는 건드리지 않는다.
//  처음 오는 사람은 지울 것이 없으므로 번호만 기억한다. 가이드는 window.cjhsBuildChecked 가 끝난 뒤 열린다(js/mobile-tour.js).
(function () {
  if (window.__cjhsUpdateCheck) return;
  window.__cjhsUpdateCheck = true;

  var baseline = null, busyChecking = false, bannerShown = false;
  var INTERVAL_MS = 10 * 60 * 1000;
  var LAST_BUILD_KEY = "cjhs_last_build";
  var GUIDE_KEYS = ["cjhs_m_tour_done_v1", "cjhs_fair_tip_done_v1"];
  var CACHE_KEYS = ["cjhs_preload_imgs_v1"];
  var CACHE_PREFIXES = ["cjhs:site_content:"];

  function ls(fn) { try { return fn(window.localStorage); } catch (e) { return null; } }

  // 업데이트 뒤 첫 방문이면 이전 캐시를 지우고 가이드를 되돌린다. 끝나면 resolve(가이드가 기다린다).
  function resetAfterUpdate(build) {
    if (!build) return Promise.resolve(false);
    var last = ls(function (s) { return s.getItem(LAST_BUILD_KEY); });
    ls(function (s) { s.setItem(LAST_BUILD_KEY, build); });
    if (!last || last === build) return Promise.resolve(false);
    ls(function (s) {
      var drop = GUIDE_KEYS.concat(CACHE_KEYS);
      for (var i = s.length - 1; i >= 0; i--) {
        var k = s.key(i);
        for (var j = 0; j < CACHE_PREFIXES.length; j++) if (k && k.indexOf(CACHE_PREFIXES[j]) === 0) drop.push(k);
      }
      drop.forEach(function (k) { s.removeItem(k); });
    });
    var cleared = window.caches && caches.keys
      ? caches.keys().then(function (names) { return Promise.all(names.map(function (n) { return caches.delete(n); })); }).catch(function () {})
      : Promise.resolve();
    return cleared.then(function () { return true; });
  }

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
      // 새로고침 뒤 첫 로드에서 resetAfterUpdate 가 캐시 정리·가이드 초기화를 한다
      if (comingBack && !userIsBusy()) location.reload();
      else showBanner();
    });
  }

  // 가이드(js/mobile-tour.js)는 이 약속이 끝난 뒤 열린다. version.json 이 늦거나 없어도 막히지 않게 최대 3초만 기다리게 한다.
  window.cjhsBuildChecked = fetchBuild().then(function (b) {
    if (baseline === null) baseline = b;
    return resetAfterUpdate(b);
  }).catch(function () { return false; });

  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") check(true); });
  window.addEventListener("pageshow", function (e) { if (e.persisted) check(true); }); // 뒤로가기로 복원된 화면
  window.addEventListener("online", function () { check(false); });
  setInterval(function () { if (document.visibilityState === "visible") check(false); }, INTERVAL_MS);
})();
