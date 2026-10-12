// 모바일 첫 방문 안내 1단계 — "홈 화면에 추가"로 앱처럼 쓰는 법을 기기·브라우저에 맞춰 보여 준다.
// 홈 화면 앱(standalone)으로 열었으면 건너뛴다. 닫으면 다음 단계(사용 가이드, js/mobile-tour.js)로 넘어간다.
// 처음 한 번만 자동으로 열리고(localStorage), 홈 하단 "홈 화면에 추가하는 법"으로 언제든 다시 볼 수 있다.
const KEY = "cjhs_m_install_done_v1";

function store(fn) { try { return fn(localStorage); } catch (e) { return null; } }

// 안드로이드 크롬 등은 설치 가능하면 이 이벤트를 준다 → "앱 설치" 버튼으로 바로 설치 창을 띄울 수 있다.
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredPrompt = e; });
window.addEventListener("appinstalled", () => { deferredPrompt = null; store((ls) => ls.setItem(KEY, "1")); });

export function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function detect() {
  const ua = navigator.userAgent || "";
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  let inApp = null;
  if (/KAKAOTALK/i.test(ua)) inApp = "카카오톡";
  else if (/NAVER\(inapp/i.test(ua)) inApp = "네이버 앱";
  else if (/Instagram/i.test(ua)) inApp = "인스타그램";
  else if (/FBAN|FBAV/i.test(ua)) inApp = "페이스북";
  else if (/\bLine\//i.test(ua)) inApp = "라인";
  else if (/DaumApps/i.test(ua)) inApp = "다음 앱";
  else if (/BAND\//i.test(ua)) inApp = "밴드";
  let browser = "other";
  if (ios) browser = /CriOS/.test(ua) ? "chrome" : /FxiOS|EdgiOS|Whale|OPiOS/.test(ua) ? "other" : "safari";
  else if (android) browser = /SamsungBrowser/.test(ua) ? "samsung" : /Whale/.test(ua) ? "whale" : /Chrome\//.test(ua) && !/EdgA|OPR|Firefox/.test(ua) ? "chrome" : "other";
  return { ios, android, inApp, browser };
}

const ICON = {
  share: `<svg class="ig-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>`,
  plusBox: `<svg class="ig-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/></svg>`,
  dots: `<svg class="ig-ic" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>`,
  hdots: `<svg class="ig-ic" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>`,
  menu: `<svg class="ig-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>`,
};
const k = (t) => `<b class="ig-key">${t}</b>`;

/** 기기·브라우저별 안내: { device, steps[], note?, action? } */
function guideFor(d) {
  const page = location.href.split("#")[0];
  if (d.inApp) {
    const steps = [];
    let action = null;
    if (/카카오톡/.test(d.inApp)) {
      action = { label: d.ios ? "Safari로 열기" : "Chrome으로 열기", href: `kakaotalk://web/openExternal?url=${encodeURIComponent(page)}` };
      steps.push(`아래 ${k(action.label)} 버튼을 누르거나, 화면 ${d.ios ? "오른쪽 아래" : "오른쪽 위"} ${k(ICON.hdots)} 를 눌러 ${k("다른 브라우저로 열기")}를 고르세요.`);
    } else if (d.android) {
      action = { label: "Chrome으로 열기", href: `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=https;package=com.android.chrome;end` };
      steps.push(`아래 ${k(action.label)} 버튼을 누르거나, 화면 위 ${k(ICON.dots)} 메뉴에서 ${k("다른 브라우저로 열기")}를 고르세요.`);
    } else {
      steps.push(`화면 위·아래의 ${k(ICON.hdots)} 또는 ${k(ICON.share)} 메뉴에서 ${k("Safari로 열기")}를 고르세요.`);
    }
    steps.push(`${d.ios ? "Safari" : "Chrome"}에서 이 페이지가 열리면 이 안내가 다시 나와요. 거기서 홈 화면에 추가하면 됩니다.`);
    return { device: `${d.inApp} 안에서 열었어요`, lead: `${d.inApp} 같은 앱 안의 화면에서는 홈 화면에 추가할 수 없어요. 먼저 기본 브라우저로 열어 주세요.`, steps, action };
  }
  if (d.ios) {
    if (d.browser === "chrome") return { device: "아이폰 · Chrome", steps: [
      `주소창 오른쪽의 공유 버튼 ${k(ICON.share)} 을 누르세요.`,
      `목록을 내려 ${k(`${ICON.plusBox} 홈 화면에 추가`)}를 누르세요.`,
      `오른쪽 위 ${k("추가")}를 누르면 끝!`] };
    return { device: d.browser === "safari" ? "아이폰 · Safari" : "아이폰", steps: [
      `화면 아래(또는 주소창 옆)의 공유 버튼 ${k(ICON.share)} 을 누르세요. 안 보이면 ${k(ICON.hdots)} 을 먼저 누르세요.`,
      `목록을 위로 올려 ${k(`${ICON.plusBox} 홈 화면에 추가`)}를 누르세요.`,
      `오른쪽 위 ${k("추가")}를 누르면 끝!`],
      note: d.browser === "safari" ? "" : "메뉴에 '홈 화면에 추가'가 없으면 Safari에서 열어 주세요." };
  }
  if (d.android) {
    if (d.browser === "samsung") return { device: "안드로이드 · 삼성 인터넷", steps: [
      `화면 아래 메뉴 ${k(ICON.menu)} 를 누르세요.`,
      `${k("현재 페이지 추가")} → ${k("홈 화면")}을 고르세요.`,
      `${k("추가")}를 누르면 끝!`] };
    return { device: d.browser === "chrome" ? "안드로이드 · Chrome" : d.browser === "whale" ? "안드로이드 · 웨일" : "안드로이드", steps: [
      `화면 오른쪽 위(또는 아래) 메뉴 ${k(ICON.dots)} 를 누르세요.`,
      `${k("홈 화면에 추가")} 또는 ${k("앱 설치")}를 누르세요.`,
      `${k("추가")}(또는 ${k("설치")})를 누르면 끝!`] };
  }
  return { device: "휴대폰", steps: [
    `브라우저 메뉴(${k(ICON.share)} 또는 ${k(ICON.dots)})를 여세요.`,
    `${k("홈 화면에 추가")}(또는 ${k("바로 가기 만들기")})를 누르세요.`] };
}

/** 안내 창을 연다. 닫히면 onDone()을 부른다. */
export function showInstallGuide(onDone) {
  if (document.querySelector(".ig-layer")) return;
  const g = guideFor(detect());
  const layer = document.createElement("div");
  layer.className = "ig-layer";
  layer.innerHTML = `
    <div class="ig-sheet" role="dialog" aria-modal="true" aria-labelledby="ig-title">
      <div class="ig-head">
        <img class="ig-app" src="icons/apple-touch-icon.png?v=4dd5ad47" alt="" width="52" height="52">
        <div>
          <div class="ig-eyebrow">처음 오셨나요? · ${g.device}</div>
          <h2 id="ig-title">홈 화면에 추가하고 앱처럼 쓰세요</h2>
        </div>
      </div>
      <p class="ig-lead">${g.lead || "한 번만 추가해 두면 홈 화면 아이콘으로 바로 열려요. 주소를 다시 찾을 필요가 없고, 주소창 없이 넓은 화면으로 볼 수 있어요."}</p>
      ${deferredPrompt && !g.action ? `<button type="button" class="ig-install">이 휴대폰에 바로 설치하기</button><div class="ig-or">또는 직접 추가하기</div>` : ""}
      <ol class="ig-steps">${g.steps.map((s) => `<li>${s}</li>`).join("")}</ol>
      ${g.note ? `<p class="ig-note">${g.note}</p>` : ""}
      ${g.action ? `<a class="ig-install" href="${g.action.href}">${g.action.label}</a>` : ""}
      <div class="ig-actions">
        <button type="button" class="ig-later">나중에 할게요</button>
        <button type="button" class="ig-next">사용법 보기 →</button>
      </div>
    </div>`;
  document.body.appendChild(layer);
  document.documentElement.classList.add("ig-open");

  function close() {
    store((ls) => ls.setItem(KEY, "1"));
    document.removeEventListener("keydown", onKey);
    document.documentElement.classList.remove("ig-open");
    layer.remove();
    if (onDone) onDone();
  }
  function onKey(e) { if (e.key === "Escape") close(); }

  const install = layer.querySelector("button.ig-install");
  if (install) install.addEventListener("click", async () => {
    const p = deferredPrompt;
    if (!p) return;
    deferredPrompt = null;
    p.prompt();
    const { outcome } = await p.userChoice.catch(() => ({}));
    if (outcome === "accepted") close();
    else install.remove();
  });
  layer.querySelector(".ig-later").addEventListener("click", close);
  layer.querySelector(".ig-next").addEventListener("click", close);
  layer.addEventListener("click", (e) => { if (e.target === layer) close(); });
  document.addEventListener("keydown", onKey);
  layer.querySelector(".ig-next").focus({ preventScroll: true });
}

/** 첫 방문이면 홈 화면 추가 안내를 띄우고, 닫히면 next()(사용 가이드)로 넘어간다. */
export function maybeShowInstallGuide(next) {
  if (isStandalone() || store((ls) => ls.getItem(KEY))) { next(); return; }
  setTimeout(() => showInstallGuide(next), 500);
}
