// 메인 화면 사진 선로딩 — 학교장 사진·갤러리 사진은 주소가 Firestore(site_content)에 들어 있어서,
// 지금까지는 "스크립트 받기 → Firestore 연결 → 주소 읽기 → 그제야 사진 요청" 순서로 늦게 시작됐다.
// 이 파일은 <head>에서 먼저 실행되어, 지난 방문 때 기억해 둔 사진 주소를 <link rel="preload">로 미리 받아 둔다(주소가 같으면 렌더 때 바로 쓴다).
// 기억은 render 스크립트가 Firestore에서 내용을 읽을 때 window.__cjhsRememberPhotos(id, data)로 한다. 저장소를 못 쓰면 아무 일도 하지 않는다.
(function () {
  var KEY = "cjhs_preload_imgs_v1", ORDER = ["greeting", "gallery"], MAX = 2;
  function read() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
  var saved = read(), n = 0;
  ORDER.forEach(function (id) {
    (Array.isArray(saved[id]) ? saved[id] : []).forEach(function (u) {
      if (n >= MAX || typeof u !== "string" || !/^https:\/\/firebasestorage\.googleapis\.com\//.test(u)) return;
      var l = document.createElement("link");
      l.rel = "preload"; l.as = "image"; l.href = u; if (n === 0) l.setAttribute("fetchpriority", "high");
      document.head.appendChild(l); n++;
    });
  });
  // 처음 보이는 사진만 기억한다: 학교장 사진 1장, 갤러리 대표 사진 1장.
  window.__cjhsRememberPhotos = function (id, d) {
    try {
      if (!d || ORDER.indexOf(id) < 0) return;
      var urls = id === "greeting" ? [d.photoUrl] : [d.hero && d.hero.photoUrl, d.items && d.items[0] && d.items[0].photoUrl];
      urls = urls.filter(function (u) { return typeof u === "string" && u; }).slice(0, 1);
      var s = read(); s[id] = urls; localStorage.setItem(KEY, JSON.stringify(s));
    } catch (e) { /* 저장 못 해도 사이트는 그대로 동작 */ }
  };
})();
