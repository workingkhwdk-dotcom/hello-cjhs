// 모바일 첫 방문 안내 — 주요 기능 위에 펄스(번지는 원) 표시와 말풍선을 차례로 띄운다.
// 처음 한 번만 자동으로 열리고(localStorage), 홈 하단 "사용법 다시 보기"로 언제든 다시 볼 수 있다.
// 대상 요소가 화면에 없으면(숨김 등) 그 단계는 건너뛴다.
const KEY = "cjhs_m_tour_done_v1";

const STEPS = [
  { sel: '.m-tabbar .m-tab[data-sec="apply"]', title: "입학 상담 신청", text: "방문·전화 상담을 여기서 바로 신청할 수 있어요." },
  { sel: '.m-tabbar .m-tab[data-sec="chat"]', title: "챗봇 중앙이", text: "입학·교육과정·학교생활, 궁금한 점을 AI 챗봇에게 언제든 물어보세요." },
  { sel: ".m-tabs-sticky .content-tabs", title: "학교 둘러보기", text: "인사말·교육과정·과목선택·갤러리·특색활동을 탭으로 넘겨 보세요." },
  { sel: '.m-tabbar .m-tab[data-sec="qna"]', title: "Q&A 게시판", text: "직접 질문을 남기면 선생님이 답변해 드려요." },
];

function store(fn) { try { return fn(localStorage); } catch (e) { return null; } }
const visible = (el) => !!el && el.getClientRects().length > 0;

export function startMobileTour() {
  if (document.querySelector(".mt-layer")) return;
  const steps = STEPS.map((s) => ({ ...s, el: document.querySelector(s.sel) })).filter((s) => visible(s.el));
  if (!steps.length) return;

  const layer = document.createElement("div");
  layer.className = "mt-layer";
  layer.innerHTML = `
    <div class="mt-spot"></div>
    <div class="mt-bubble" role="dialog" aria-modal="true" aria-labelledby="mt-title">
      <div class="mt-step"></div>
      <div class="mt-title" id="mt-title"></div>
      <p class="mt-text"></p>
      <div class="mt-actions">
        <button type="button" class="mt-skip">건너뛰기</button>
        <button type="button" class="mt-next"></button>
      </div>
    </div>`;
  document.body.appendChild(layer);
  const spot = layer.querySelector(".mt-spot");
  const bubble = layer.querySelector(".mt-bubble");
  const nextBtn = layer.querySelector(".mt-next");
  let i = 0;

  function place() {
    const r = steps[i].el.getBoundingClientRect();
    const pad = 6;
    Object.assign(spot.style, { top: `${r.top - pad}px`, left: `${r.left - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    // 말풍선: 대상 아래에 자리가 있으면 아래, 없으면 위
    const vh = window.innerHeight, bh = bubble.offsetHeight, gap = 14;
    const below = r.bottom + pad + gap;
    const top = below + bh <= vh - 8 ? below : Math.max(8, r.top - pad - gap - bh);
    bubble.style.top = `${top}px`;
    bubble.classList.toggle("is-above", top < r.top);
    // 꼬리 위치를 대상 가운데에 맞춘다
    const bx = bubble.getBoundingClientRect().left;
    bubble.style.setProperty("--tail-x", `${Math.min(Math.max(r.left + r.width / 2 - bx, 22), bubble.offsetWidth - 22)}px`);
  }

  function show(n) {
    i = n;
    const s = steps[i];
    layer.querySelector(".mt-step").textContent = `${i + 1} / ${steps.length}`;
    layer.querySelector(".mt-title").textContent = s.title;
    layer.querySelector(".mt-text").textContent = s.text;
    nextBtn.textContent = i === steps.length - 1 ? "시작하기" : "다음";
    // 고정 탭바가 아닌 대상은 화면 가운데로 가져온다
    if (!s.el.closest(".m-tabbar")) s.el.scrollIntoView({ block: "center", behavior: "instant" in window ? "instant" : "auto" });
    // 펄스 애니메이션을 단계마다 처음부터 다시 시작
    spot.classList.remove("pulse"); void spot.offsetWidth; spot.classList.add("pulse");
    requestAnimationFrame(place);
    nextBtn.focus({ preventScroll: true });
  }

  function close() {
    store((ls) => ls.setItem(KEY, "1"));
    window.removeEventListener("resize", place);
    window.removeEventListener("scroll", place, true);
    document.removeEventListener("keydown", onKey);
    layer.remove();
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }
  function onKey(e) {
    if (e.key === "Escape") close();
    else if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); nextBtn.click(); }
  }

  nextBtn.addEventListener("click", () => (i < steps.length - 1 ? show(i + 1) : close()));
  layer.querySelector(".mt-skip").addEventListener("click", close);
  // 어두운 바깥을 누르면 다음 단계로
  layer.addEventListener("click", (e) => { if (!bubble.contains(e.target)) nextBtn.click(); });
  window.addEventListener("resize", place);
  window.addEventListener("scroll", place, true);
  document.addEventListener("keydown", onKey);
  show(0);
}

/** 첫 방문이고 홈 화면이 떠 있을 때만 자동으로 시작한다. */
export function maybeStartMobileTour() {
  if (store((ls) => ls.getItem(KEY))) return;
  if (!document.querySelector('.m-section.on[data-sec="home"]')) return;
  setTimeout(() => { if (document.querySelector('.m-section.on[data-sec="home"]')) startMobileTour(); }, 700);
}
