// "홈 화면에 추가" 안내 — 홈 하단 아이콘 버튼을 누르면 기기에 맞는 방법을 바텀시트로 보여 준다.
// 안드로이드 크롬처럼 설치 창을 바로 띄울 수 있으면(beforeinstallprompt) "지금 추가" 버튼을 함께 보여 준다.
let deferred = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; });
window.addEventListener("appinstalled", () => { deferred = null; });

const ua = navigator.userAgent;
const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

const ICON_SHARE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';
const ICON_MENU = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';
const ICON_HOME = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/></svg>';

const STEPS = {
  ios: [
    [ICON_SHARE, "Safari 아래쪽 <b>공유</b> 버튼을 눌러요"],
    [ICON_PLUS, "<b>홈 화면에 추가</b>를 골라요"],
    [ICON_HOME, "오른쪽 위 <b>추가</b>를 누르면 끝!"],
  ],
  android: [
    [ICON_MENU, "Chrome 오른쪽 위 <b>⋮ 메뉴</b>를 눌러요"],
    [ICON_PLUS, "<b>홈 화면에 추가</b>(또는 앱 설치)를 골라요"],
    [ICON_HOME, "<b>추가</b>를 누르면 끝!"],
  ],
};

export function openAddToHome() {
  if (document.querySelector(".a2hs-layer")) return;
  const os = isIOS ? "ios" : "android";
  const layer = document.createElement("div");
  layer.className = "a2hs-layer";
  layer.innerHTML = `
    <div class="a2hs-sheet" role="dialog" aria-modal="true" aria-labelledby="a2hs-title">
      <div class="a2hs-grab" aria-hidden="true"></div>
      <h2 id="a2hs-title">홈 화면에 추가하기</h2>
      <p class="a2hs-sub">${isStandalone() ? "이미 홈 화면에서 열고 계세요 👍" : "앱처럼 한 번에 열 수 있어요."}</p>
      <div class="a2hs-seg" role="tablist">
        <button type="button" role="tab" data-os="ios" class="${os === "ios" ? "on" : ""}">iPhone</button>
        <button type="button" role="tab" data-os="android" class="${os === "android" ? "on" : ""}">Android</button>
      </div>
      <ol class="a2hs-steps"></ol>
      <button type="button" class="a2hs-go" hidden>지금 추가하기</button>
      <button type="button" class="a2hs-close">닫기</button>
    </div>`;
  document.body.appendChild(layer);
  const list = layer.querySelector(".a2hs-steps");
  const go = layer.querySelector(".a2hs-go");

  function draw(which) {
    layer.querySelectorAll(".a2hs-seg button").forEach((b) => b.classList.toggle("on", b.dataset.os === which));
    list.innerHTML = STEPS[which].map(([ico, txt], i) => `<li><span class="a2hs-ico">${ico}<em>${i + 1}</em></span><span>${txt}</span></li>`).join("");
    go.hidden = !(which === "android" && deferred);
  }
  function close() { document.removeEventListener("keydown", onKey); layer.remove(); }
  function onKey(e) { if (e.key === "Escape") close(); }

  layer.querySelector(".a2hs-seg").addEventListener("click", (e) => { const b = e.target.closest("button[data-os]"); if (b) draw(b.dataset.os); });
  layer.querySelector(".a2hs-close").addEventListener("click", close);
  layer.addEventListener("click", (e) => { if (e.target === layer) close(); });
  go.addEventListener("click", async () => {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch (err) { /* 무시 */ }
    deferred = null;
    close();
  });
  document.addEventListener("keydown", onKey);
  draw(os);
  layer.querySelector(".a2hs-close").focus({ preventScroll: true });
}
