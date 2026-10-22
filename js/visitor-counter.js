// 메인 화면 방문자 수(TODAY / TOTAL) — index.html(PC)·mobile.html 공용.
// 같은 브라우저는 한국 날짜 기준 하루에 한 번만 숫자를 올리고(newVisit:true), 그 뒤로는 조회만 한다.
// 서버: functions/index.js 의 visitCounter. 실패하면 조용히 숨긴다(방문자 화면에 오류를 띄우지 않음).
const URL_ = "https://asia-northeast3-hello-cjhs.cloudfunctions.net/visitCounter";
const KEY = "cjhs_visit_day";

const kstDate = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const fmt = (n) => Number(n || 0).toLocaleString("ko-KR");
function store(fn) { try { return fn(localStorage); } catch (e) { return null; } }

// 화면이 다 뜨고 한가해진 뒤에 센다(첫 화면 그리기·사진 받기와 네트워크·처리 시간을 다투지 않게).
function afterLoadIdle() {
  return new Promise((resolve) => {
    const idle = () => (window.requestIdleCallback ? requestIdleCallback(resolve, { timeout: 2000 }) : setTimeout(resolve, 300));
    if (document.readyState === "complete") idle(); else addEventListener("load", idle, { once: true });
  });
}

export async function mountVisitorCounter(el) {
  if (!el) return;
  await afterLoadIdle();
  const today = kstDate();
  const newVisit = store((ls) => ls.getItem(KEY)) !== today;
  // 먼저 표시해 두어야 PC 페이지와 모바일 페이지가 거의 동시에 열려도 두 번 세지 않는다. 실패하면 되돌린다.
  if (newVisit) store((ls) => ls.setItem(KEY, today));
  let res;
  try {
    res = await fetch(URL_, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ newVisit }) });
  } catch (e) {
    // 서버에 닿지도 못했을 때만 표시를 되돌려 다음 방문 때 다시 센다(서버가 응답했다면 이미 셌을 수 있음)
    if (newVisit) store((ls) => ls.removeItem(KEY));
    el.hidden = true;
    return;
  }
  try {
    if (!res.ok) throw new Error(String(res.status));
    const d = await res.json();
    el.innerHTML = `<span>TODAY <b>${fmt(d.today)}</b></span><i aria-hidden="true">·</i><span>TOTAL <b>${fmt(d.total)}</b></span>`;
    el.setAttribute("aria-label", `오늘 방문자 ${fmt(d.today)}명, 전체 방문자 ${fmt(d.total)}명`);
    el.hidden = false;
  } catch (e) {
    el.hidden = true;
  }
}
