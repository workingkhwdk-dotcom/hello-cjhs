// 학교장 인사말 사진 칸 — 등록한 사진의 가로세로 비율이 달라져도 어색하지 않게 보여준다.
// - 사진 비율이 칸과 비슷하면: 칸을 꽉 채운다(cover, 얼굴이 보통 있는 위쪽 중심).
// - 비율이 많이 다르면(예: 아주 넓은 단체사진): 잘라 내지 않고 사진 전체를 보여주고,
//   같은 사진을 흐리게 깔아 남는 공간을 채운다(.gp-contain).
// PC(index.html)와 모바일(mobile.html)이 같이 쓴다.

const MAX_CROP = 0.6; // 이 비율보다 많이 잘려야 하는 사진은 잘라 내지 않고 전체를 보여준다

export function greetingPhotoHtml(url) {
  const src = String(url).replace(/"/g, "&quot;");
  // 흐린 배경용 사진은 lazy — 모바일처럼 숨겨 두는 화면에서는 두 번 내려받지 않는다. 본 사진은 먼저 받도록 우선순위를 높인다.
  return `<img class="gp-bg" src="${src}" alt="" aria-hidden="true" loading="lazy" decoding="async"><img class="gp-fg" src="${src}" alt="학교장 사진" fetchpriority="high" decoding="async">`;
}

export function fitGreetingPhoto(slot) {
  if (!slot || slot.__gpFit) return; // 사진이 나중에 바뀌어도(기본 사진 → 등록한 사진) 한 번만 연결한다
  slot.__gpFit = true;
  const apply = () => {
    const fg = slot.querySelector(".gp-fg");
    if (!fg || !fg.naturalWidth || !slot.clientHeight) return;
    const img = fg.naturalWidth / fg.naturalHeight, box = slot.clientWidth / slot.clientHeight;
    const crop = 1 - Math.min(img, box) / Math.max(img, box); // cover로 채울 때 잘려 나가는 비율
    slot.classList.toggle("gp-contain", crop > MAX_CROP);
  };
  slot.addEventListener("load", apply, true); // img의 load는 버블링되지 않아 캡처로 받는다
  if (window.ResizeObserver) new ResizeObserver(apply).observe(slot);
  apply();
}
