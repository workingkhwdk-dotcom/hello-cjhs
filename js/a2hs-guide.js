// 모바일 홈 하단 "홈 화면에 추가" 안내 — 아이폰(사파리)·안드로이드(크롬)별 방법을 바텀시트로 보여 준다.
// 안드로이드 크롬처럼 브라우저가 설치 창(beforeinstallprompt)을 허용하면 "지금 추가하기" 버튼으로 바로 설치한다.
// 이미 홈 화면 앱으로 열었다면(standalone) 호출하는 쪽에서 버튼을 숨길 수 있게 isStandalone()을 내보낸다.
let deferred = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; });
window.addEventListener("appinstalled", () => { deferred = null; });

export function isStandalone() {
  const mm = (m) => !!(window.matchMedia && window.matchMedia(`(display-mode: ${m})`).matches);
  return mm("standalone") || mm("fullscreen") || mm("minimal-ui") || window.navigator.standalone === true || document.referrer.startsWith("android-app://");
}

const IOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const ICON_SHARE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3"/><path d="m8 7 4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/></svg>';
const ICON_MENU = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>';

const GUIDES = {
  ios: { name: "아이폰 · 아이패드 (사파리)", steps: [
    `화면 아래(또는 위)의 <b>공유 버튼</b> ${ICON_SHARE} 을 눌러요.`,
    "메뉴를 위로 밀어 <b>‘홈 화면에 추가’</b>를 눌러요.",
    "오른쪽 위 <b>‘추가’</b>를 누르면 끝! 홈 화면에 아이콘이 생겨요.",
  ], note: "크롬·네이버 앱 등에서 열었다면 사파리로 다시 열어야 해요." },
  android: { name: "안드로이드 (크롬)", steps: [
    `오른쪽 위 <b>메뉴</b> ${ICON_MENU} 를 눌러요.`,
    "<b>‘홈 화면에 추가’</b> 또는 <b>‘앱 설치’</b>를 눌러요.",
    "<b>‘추가’(‘설치’)</b>를 누르면 끝! 홈 화면에 아이콘이 생겨요.",
  ], note: "삼성 인터넷은 메뉴(≡)에서 ‘현재 페이지 추가 → 홈 화면’을 고르세요." },
};

export function openA2hsGuide() {
  if (document.querySelector(".a2-layer")) return;
  const key = IOS() ? "ios" : "android";
  const layer = document.createElement("div");
  layer.className = "a2-layer";
  const body = (k) => `<p class="a2-os">${GUIDES[k].name}</p>
    <ol class="a2-steps">${GUIDES[k].steps.map((s) => `<li>${s}</li>`).join("")}</ol>
    <p class="a2-note">${GUIDES[k].note}</p>`;
  const otherOf = (k) => (k === "ios" ? "android" : "ios");
  layer.innerHTML = `
    <div class="a2-sheet" role="dialog" aria-modal="true" aria-labelledby="a2-title">
      <div class="a2-grab" aria-hidden="true"></div>
      <h3 class="a2-title" id="a2-title">홈 화면에 추가하기</h3>
      <p class="a2-lead">앱처럼 한 번에 열 수 있어요. 챗봇·상담 신청이 더 빨라져요.</p>
      <div class="a2-body">${body(key)}</div>
      ${deferred ? '<button type="button" class="a2-install">지금 추가하기</button>' : ""}
      <button type="button" class="a2-switch">${GUIDES[otherOf(key)].name} 방법 보기</button>
      <button type="button" class="a2-close">닫기</button>
    </div>`;
  document.body.appendChild(layer);
  let cur = key;
  const onKey = (e) => { if (e.key === "Escape") close(); };
  function close() { document.removeEventListener("keydown", onKey); layer.remove(); }
  document.addEventListener("keydown", onKey);
  layer.addEventListener("click", (e) => { if (e.target === layer) close(); });
  layer.querySelector(".a2-close").addEventListener("click", close);
  layer.querySelector(".a2-switch").addEventListener("click", (e) => {
    cur = otherOf(cur);
    layer.querySelector(".a2-body").innerHTML = body(cur);
    e.currentTarget.textContent = `${GUIDES[otherOf(cur)].name} 방법 보기`;
  });
  const inst = layer.querySelector(".a2-install");
  if (inst) inst.addEventListener("click", async () => {
    try { deferred.prompt(); await deferred.userChoice; } catch (e) { /* 사용자가 닫음 */ }
    deferred = null; close();
  });
  layer.querySelector(".a2-close").focus({ preventScroll: true });
}
