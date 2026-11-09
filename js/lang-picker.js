// 첫 접속 언어 선택 창 — 한국어 / English / 日本語 / 中文.
// 브라우저 세션당 한 번 자동으로 열린다. "더 이상 보지 않기"에 체크하고 고르면(또는 닫으면) 쿠키를 남겨,
// 그 기기에서는 다시 자동으로 열리지 않는다(PC 안내 창 js/pc-mobile-notice.js와 같은 방식).
// 외국어를 고르면 intl.html?lang=… 으로 이동하고, 한국어를 고르거나 닫으면 원래 흐름(next)을 이어 간다.
// 다시 고르고 싶으면 상단 배너의 "English · 日本語 · 中文" 버튼(intl.html)을 쓰면 된다.
const COOKIE = "cjhs_lang_picker_hide";
const SESSION_KEY = "cjhs_lang_picker_seen";
const ONE_YEAR = 60 * 60 * 24 * 365;

const LANGS = [
  { code: "ko", label: "한국어", sub: "Korean", lang: "ko" },
  { code: "en", label: "English", sub: "영어", lang: "en" },
  { code: "ja", label: "日本語", sub: "일본어", lang: "ja" },
  { code: "zh", label: "中文", sub: "중국어", lang: "zh-CN" },
];

const hidden = () => document.cookie.split("; ").some((c) => c === `${COOKIE}=1`);
function setHidden(on) {
  document.cookie = on ? `${COOKIE}=1; max-age=${ONE_YEAR}; path=/; SameSite=Lax` : `${COOKIE}=; max-age=0; path=/; SameSite=Lax`;
}
function session(fn) { try { return fn(sessionStorage); } catch (e) { return null; } }

// 브라우저 언어가 영어·일본어·중국어면 그 버튼을 강조한다(자동 이동은 하지 않는다).
function browserGuess() {
  const list = navigator.languages || [navigator.language];
  for (const l of list) {
    const s = String(l || "").toLowerCase();
    if (s.startsWith("ko")) return "ko";
    if (s.startsWith("ja")) return "ja";
    if (s.startsWith("zh")) return "zh";
    if (s.startsWith("en")) return "en";
  }
  return "ko";
}

export function showLangPicker(next = () => {}) {
  if (document.querySelector(".lp-layer")) return;
  const guess = browserGuess();
  const layer = document.createElement("div");
  layer.className = "lp-layer";
  layer.innerHTML = `
    <div class="lp-box" role="dialog" aria-modal="true" aria-labelledby="lp-title">
      <button type="button" class="lp-x" aria-label="닫기 · Close">×</button>
      <svg class="lp-globe" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
      <h2 id="lp-title">언어를 선택해 주세요</h2>
      <p class="lp-sub"><span lang="en">Choose your language</span> · <span lang="ja">言語を選んでください</span> · <span lang="zh-CN">请选择语言</span></p>
      <div class="lp-grid">
        ${LANGS.map((l) => `<button type="button" class="lp-btn${l.code === guess ? " on" : ""}" data-lang="${l.code}" lang="${l.lang}"><b>${l.label}</b><small lang="${l.code === "ko" ? "en" : "ko"}">${l.sub}</small></button>`).join("")}
      </div>
      <p class="lp-note">English · 日本語 · 中文: <span lang="ko">외국인 학부모님을 위한 입학 안내 페이지로 이동합니다.</span></p>
      <label class="lp-hide"><input type="checkbox"${hidden() ? " checked" : ""}> <span>더 이상 보지 않기 <span class="lp-hide-i18n"><span lang="en">Don’t show again</span> · <span lang="ja">今後表示しない</span> · <span lang="zh-CN">不再显示</span></span></span></label>
    </div>`;
  document.body.appendChild(layer);

  let done = false;
  function finish(code) {
    if (done) return;
    done = true;
    setHidden(layer.querySelector(".lp-hide input").checked);
    session((ss) => ss.setItem(SESSION_KEY, "1"));
    document.removeEventListener("keydown", onKey);
    if (code && code !== "ko") {
      location.href = `intl.html?lang=${code}`;
      return;
    }
    layer.remove();
    next();
  }
  function onKey(e) { if (e.key === "Escape") finish("ko"); }
  layer.querySelectorAll(".lp-btn").forEach((b) => b.addEventListener("click", () => finish(b.dataset.lang)));
  layer.querySelector(".lp-x").addEventListener("click", () => finish("ko"));
  layer.addEventListener("click", (e) => { if (e.target === layer) finish("ko"); });
  document.addEventListener("keydown", onKey);
  layer.querySelector(".lp-btn.on")?.focus({ preventScroll: true });
}

/** 이번 세션에 아직 안 봤고 "더 이상 보지 않기"도 아니면 언어 선택 창을 띄우고, 아니면 바로 next()를 이어 간다. */
export function maybeAskLanguage(next = () => {}) {
  if (hidden() || session((ss) => ss.getItem(SESSION_KEY))) { next(); return; }
  showLangPicker(next);
}
