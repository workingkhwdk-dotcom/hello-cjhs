// PC 접속 안내 — "휴대폰으로도 볼 수 있어요" 창(모바일 주소 QR + 링크 복사).
// PC로 들어올 때마다(브라우저 세션당 한 번) 자동으로 열린다. "다시 보지 않음"에 체크하고 닫으면 쿠키를 남겨,
// 그 쿠키가 남아 있는 동안(1년, 또는 방문자가 쿠키를 지우기 전까지)은 자동으로 열리지 않는다.
// 하단 "휴대폰으로 보기" 버튼으로는 언제든 다시 열 수 있다.
const COOKIE = "cjhs_pc_mobile_notice_hide";
const SESSION_KEY = "cjhs_pc_mobile_notice_seen";
const ONE_YEAR = 60 * 60 * 24 * 365;

const hidden = () => document.cookie.split("; ").some((c) => c === `${COOKIE}=1`);
function setHidden(on) {
  document.cookie = on ? `${COOKIE}=1; max-age=${ONE_YEAR}; path=/; SameSite=Lax` : `${COOKIE}=; max-age=0; path=/; SameSite=Lax`;
}
function session(fn) { try { return fn(sessionStorage); } catch (e) { return null; } }
const mobileUrl = () => new URL("mobile.html", location.href).href;

async function qrSvg(text) {
  try {
    const { default: qrcode } = await import("./vendor/qrcode-generator.js");
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ scalable: true, margin: 2 }).replace("<svg ", '<svg role="img" aria-label="모바일 페이지 QR 코드" ');
  } catch (e) {
    console.error(e);
    return "";
  }
}

export async function showPcMobileNotice() {
  if (document.querySelector(".pmn-layer")) return;
  const url = mobileUrl();
  const layer = document.createElement("div");
  layer.className = "pmn-layer";
  layer.innerHTML = `
    <div class="pmn-box" role="dialog" aria-modal="true" aria-labelledby="pmn-title">
      <button type="button" class="pmn-x" aria-label="닫기">×</button>
      <div class="pmn-eyebrow">휴대폰으로도 이용할 수 있어요</div>
      <h2 id="pmn-title">이 안내 페이지, 휴대폰에서도 그대로 볼 수 있어요</h2>
      <div class="pmn-body">
        <div class="pmn-qr"></div>
        <div class="pmn-text">
          <ol>
            <li>휴대폰 카메라로 왼쪽 <b>QR 코드</b>를 비추고, 뜨는 주소를 누르세요.</li>
            <li>처음 열면 <b>홈 화면에 추가</b>하는 법을 아이폰·안드로이드에 맞춰 알려 드려요. 추가해 두면 앱처럼 아이콘으로 바로 열려요.</li>
            <li>상담 신청, 챗봇 중앙이, Q&amp;A, <b>3년 선택과목 짜보기</b>까지 휴대폰에서 모두 할 수 있어요.</li>
          </ol>
          <div class="pmn-link"><input type="text" readonly value="${url}" aria-label="모바일 페이지 주소"><button type="button" class="pmn-copy">주소 복사</button></div>
        </div>
      </div>
      <div class="pmn-actions">
        <label class="pmn-hide"><input type="checkbox"${hidden() ? " checked" : ""}> 다시 보지 않음</label>
        <button type="button" class="pmn-ok">확인</button>
      </div>
    </div>`;
  document.body.appendChild(layer);

  function close() {
    setHidden(layer.querySelector(".pmn-hide input").checked);
    session((ss) => ss.setItem(SESSION_KEY, "1"));
    document.removeEventListener("keydown", onKey);
    layer.remove();
  }
  function onKey(e) { if (e.key === "Escape") close(); }
  layer.querySelector(".pmn-x").addEventListener("click", close);
  layer.querySelector(".pmn-ok").addEventListener("click", close);
  layer.addEventListener("click", (e) => { if (e.target === layer) close(); });
  document.addEventListener("keydown", onKey);
  const copy = layer.querySelector(".pmn-copy");
  copy.addEventListener("click", async () => {
    const input = layer.querySelector(".pmn-link input");
    try { await navigator.clipboard.writeText(url); } catch (e) { input.select(); document.execCommand?.("copy"); }
    copy.textContent = "복사했어요";
    setTimeout(() => { copy.textContent = "주소 복사"; }, 1800);
  });
  layer.querySelector(".pmn-ok").focus({ preventScroll: true });

  const svg = await qrSvg(url);
  const box = layer.querySelector(".pmn-qr");
  if (svg) box.innerHTML = svg;
  else box.remove();
}

/** "다시 보지 않음" 쿠키가 없고, 이번 브라우저 세션에서 아직 안 봤으면 안내 창을 띄운다. */
export function maybeShowPcMobileNotice() {
  if (hidden() || session((ss) => ss.getItem(SESSION_KEY))) return;
  setTimeout(showPcMobileNotice, 900);
}
