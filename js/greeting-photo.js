// 학교장 인사말 사진 칸 — 등록한 사진의 가로세로 비율이 달라져도 어색하지 않게 보여준다.
// - 사진 비율이 칸과 비슷하면: 칸을 꽉 채운다(cover, 얼굴이 보통 있는 위쪽 중심).
// - 비율이 많이 다르면(예: 아주 넓은 단체사진): 잘라 내지 않고 사진 전체를 보여주고,
//   같은 사진을 흐리게 깔아 남는 공간을 채운다(.gp-contain).
// PC(index.html)와 모바일(mobile.html)이 같이 쓴다.

const MAX_CROP = 0.6; // 이 비율보다 많이 잘려야 하는 사진은 잘라 내지 않고 전체를 보여준다

export function greetingPhotoHtml(url) {
  const src = String(url).replace(/"/g, "&quot;");
  return `<img class="gp-bg" src="${src}" alt="" aria-hidden="true" decoding="async"><img class="gp-fg" src="${src}" alt="학교장 사진" decoding="async" fetchpriority="high">`;
}

export function fitGreetingPhoto(slot) {
  const fg = slot && slot.querySelector(".gp-fg");
  if (!fg) return;
  const apply = () => {
    if (!fg.naturalWidth || !slot.clientHeight) return;
    const img = fg.naturalWidth / fg.naturalHeight, box = slot.clientWidth / slot.clientHeight;
    const crop = 1 - Math.min(img, box) / Math.max(img, box); // cover로 채울 때 잘려 나가는 비율
    slot.classList.toggle("gp-contain", crop > MAX_CROP);
  };
  fg.complete ? apply() : fg.addEventListener("load", apply);
  if (window.ResizeObserver) new ResizeObserver(apply).observe(slot);
}
