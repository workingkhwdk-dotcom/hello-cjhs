// 방문자 집계 — 이 사이트의 모든 공개 페이지에서 쓴다(index.html·mobile.html·chatbot.html·qna.html·apply.html 등).
// 같은 브라우저는 한국 날짜 기준으로 "사이트 전체" 하루 한 번, "페이지별" 하루 한 번만 숫자를 올린다.
//   사이트 전체: localStorage cjhs_visit_day        (어느 페이지로 들어오든 하루 1)
//   페이지별   : localStorage cjhs_visit_day:<page>  (그 페이지를 연 날 1)
// 서버: functions/index.js 의 visitCounter / functions/visit_counter.js. 실패하면 조용히 넘어간다(방문자 화면에 오류를 띄우지 않음).
//
// 사용: mountVisitorCounter(el) — el 이 있으면 TODAY/TOTAL 을 그려 준다(메인 화면). el 이 null 이면 집계만 한다(그 밖의 페이지).
//   page 는 주소로 알아낸다: index.html→index, chatbot.html→chatbot, qna.html→qna, apply.html→apply, curriculum-original.html→curriculum, results.html→results.
//   mobile.html 은 한 페이지 안에서 탭(home/chat/qna/apply/fair)이 바뀌므로, 처음 열린 탭과 이후에 연 탭을 각각 그 페이지로 센다.
const URL_ = "https://asia-northeast3-hello-cjhs.cloudfunctions.net/visitCounter";
const KEY = "cjhs_visit_day";
const PAGE_KEY = (page) => `${KEY}:${page}`;
const FILE_PAGE = { "": "index", "index.html": "index", "chatbot.html": "chatbot", "qna.html": "qna", "apply.html": "apply", "curriculum-original.html": "curriculum", "results.html": "results" };
const TAB_PAGE = { home: "index", chat: "chatbot", qna: "qna", apply: "apply", fair: "fair" }; // mobile.html 의 탭 → 페이지

const kstDate = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const fmt = (n) => Number(n || 0).toLocaleString("ko-KR");
function store(fn) { try { return fn(localStorage); } catch (e) { return null; } }

const isMobileShell = () => /(^|\/)mobile\.html$/.test(location.pathname);
function pageFromPath() {
  const file = location.pathname.split("/").pop();
  return FILE_PAGE[file] || null; // 모르는 주소(관리자 화면 등)는 집계하지 않는다
}
function activeTab() {
  const on = document.querySelector(".m-section.on");
  return (on && on.dataset.sec) || new URLSearchParams(location.search).get("section") || "home";
}

// 한 번의 호출: 사이트 전체·페이지별 "오늘 처음"인지 판단해 서버에 알리고 숫자를 돌려받는다.
async function send(page, wantNumbers) {
  const today = kstDate();
  const newVisit = store((ls) => ls.getItem(KEY)) !== today;
  const newPage = !!page && store((ls) => ls.getItem(PAGE_KEY(page))) !== today;
  // 아무것도 올릴 게 없고 숫자도 필요 없으면 요청 자체를 보내지 않는다.
  if (!newVisit && !newPage && !wantNumbers) return null;
  // 먼저 표시해 두어야 여러 페이지가 거의 동시에 열려도 두 번 세지 않는다. 서버에 닿지 못하면 되돌린다.
  if (newVisit) store((ls) => ls.setItem(KEY, today));
  if (newPage) store((ls) => ls.setItem(PAGE_KEY(page), today));
  try {
    const res = await fetch(URL_, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ newVisit, page, newPage }) });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } catch (e) {
    // 서버에 닿지도 못했을 때만 되돌려 다음 방문 때 다시 센다(서버가 응답했다면 이미 셌을 수 있어 상태 오류는 되돌리지 않음).
    if (e instanceof TypeError) {
      if (newVisit) store((ls) => ls.removeItem(KEY));
      if (newPage) store((ls) => ls.removeItem(PAGE_KEY(page)));
    }
    return null;
  }
}

function show(el, d) {
  if (!el) return;
  if (!d || d.today == null) { el.hidden = true; return; }
  el.innerHTML = `<span>TODAY <b>${fmt(d.today)}</b></span><i aria-hidden="true">·</i><span>TOTAL <b>${fmt(d.total)}</b></span>`;
  el.setAttribute("aria-label", `오늘 방문자 ${fmt(d.today)}명, 전체 방문자 ${fmt(d.total)}명`);
  el.hidden = false;
}

// 화면이 다 뜨고 한가해진 뒤에 센다(첫 화면 그리기·사진 받기와 네트워크·처리 시간을 다투지 않게).
function afterLoadIdle() {
  return new Promise((resolve) => {
    const idle = () => (window.requestIdleCallback ? requestIdleCallback(resolve, { timeout: 2000 }) : setTimeout(resolve, 300));
    if (document.readyState === "complete") idle(); else addEventListener("load", idle, { once: true });
  });
}

export async function mountVisitorCounter(el) {
  await afterLoadIdle();
  if (isMobileShell()) {
    // 첫 탭은 숫자 표시와 함께, 이후 탭 전환은 집계만(탭을 처음 연 날 한 번).
    // ?section=chat 으로 바로 들어온 경우, 앱 코드가 탭을 바꾸기 전이라도 처음부터 그 탭으로 센다.
    const fromUrl = new URLSearchParams(location.search).get("section");
    let seen = activeTab(); // 화면에서 마지막으로 본 탭(앱 코드가 URL 의 탭으로 옮기기 전에는 보통 home)
    const watch = () => { const t = activeTab(); if (t !== seen) { seen = t; if (TAB_PAGE[t]) send(TAB_PAGE[t], false); } };
    // 관찰을 먼저 시작해야 서버 응답을 기다리는 동안 일어난 탭 전환도 놓치지 않는다.
    new MutationObserver(watch).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["class"] });
    show(el, await send(TAB_PAGE[TAB_PAGE[fromUrl] ? fromUrl : seen] || "index", !!el));
    return;
  }
  const d = await send(pageFromPath(), !!el);
  show(el, d);
}
