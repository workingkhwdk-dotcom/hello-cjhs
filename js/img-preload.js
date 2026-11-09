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

// 메인 화면 글(site_content) 선로딩 — 예전에는 "Firebase SDK(수백 KB) 다운로드 → Firestore 연결 → 문서 읽기"가 끝나야
// 학교장 인사말 본문이 그려졌다(휴대폰에서 수 초). 여기서는 <head>에서 곧바로 Firestore REST 주소로 문서만 가볍게 받아 둔다.
// - window.__cjhsSiteContent[id]: 받은 내용(Promise). 문서가 없으면 null, 끝내 못 받으면 undefined(그때 app.js가 SDK로 다시 시도).
// - window.__cjhsCachedContent(id): 지난번에 받은 내용(localStorage). 화면을 처음 그릴 때 바로 쓴다.
// site_content는 누구나 읽을 수 있는 문서(firestore.rules)라 로그인 없이 읽힌다.
(function () {
  var API = "https://firestore.googleapis.com/v1/projects/hello-cjhs/databases/(default)/documents/site_content/";
  var KEY_PARAM = "?key=AIzaSyAnGmSChA8ENvs4EM-biLnjG3PNH4JAzXY";
  function cacheKey(id) { return "cjhs:site_content:" + id; }
  window.__cjhsCachedContent = function (id) {
    try { var v = localStorage.getItem(cacheKey(id)); return v == null ? undefined : JSON.parse(v); } catch (e) { return undefined; }
  };
  // Firestore REST의 타입 붙은 값({stringValue:"..."} 등)을 SDK의 data()와 같은 평범한 값으로 바꾼다.
  function val(v) {
    if (!v || typeof v !== "object") return null;
    if ("stringValue" in v) return v.stringValue;
    if ("integerValue" in v) return Number(v.integerValue);
    if ("doubleValue" in v) return Number(v.doubleValue);
    if ("booleanValue" in v) return v.booleanValue;
    if ("timestampValue" in v) return v.timestampValue;
    if ("arrayValue" in v) return ((v.arrayValue && v.arrayValue.values) || []).map(val);
    if ("mapValue" in v) return fields((v.mapValue && v.mapValue.fields) || {});
    return null;
  }
  function fields(f) { var o = {}; for (var k in f) if (Object.prototype.hasOwnProperty.call(f, k)) o[k] = val(f[k]); return o; }
  function once(id) {
    var ctl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 6000);
    return fetch(API + encodeURIComponent(id) + KEY_PARAM, ctl ? { signal: ctl.signal } : {}).then(function (r) {
      clearTimeout(timer);
      if (r.status === 404) return null; // 아직 관리자가 저장한 적 없는 문서
      if (!r.ok) { var err = new Error("HTTP " + r.status); err.final = r.status < 500 && r.status !== 429; throw err; } // 403 등은 다시 해도 같으니 바로 SDK로 넘긴다
      return r.json().then(function (j) { return fields(j.fields || {}); });
    }, function (e) { clearTimeout(timer); throw e; });
  }
  function load(id) {
    var tries = 0;
    function attempt() {
      return once(id).then(function (d) {
        try { localStorage.setItem(cacheKey(id), JSON.stringify(d)); } catch (e) {}
        if (d && window.__cjhsRememberPhotos) window.__cjhsRememberPhotos(id, d);
        return d;
      }, function (e) {
        if (!e.final && ++tries < 3) return new Promise(function (r) { setTimeout(r, 600 * tries); }).then(attempt);
        console.warn("site_content 빠른 읽기 실패(SDK로 다시 시도):", id, e);
        return undefined;
      });
    }
    return attempt();
  }
  if (typeof fetch !== "function" || typeof Promise !== "function") return;
  window.__cjhsSiteContent = { greeting: load("greeting"), gallery: load("gallery") };
})();
