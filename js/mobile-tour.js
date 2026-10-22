// 모바일 첫 방문 안내 2단계(사용 가이드) — 1단계 홈 화면 추가 안내(js/install-guide.js)가 닫힌 뒤 열린다. 주요 기능 위에 펄스(번지는 원) 표시와 말풍선을 차례로 띄운다.
// 처음 한 번만 자동으로 열리고(localStorage), 홈 하단 "사용법 다시 보기"로 언제든 다시 볼 수 있다.
// 대상 요소가 화면에 없으면(숨김 등) 그 단계는 건너뛴다.
// '학교 박람회' 안내(모바일은 하단 탭, PC는 학교소개 탭): 처음 온 사람은 전체 안내의 첫 단계로 보고, 예전에 안내를 다 본 사람에게는
// 박람회 한 단계만 한 번 띄운다(행사가 끝나면 띄우지 않음). PC(index)도 startTour로 같은 말풍선을 쓴다.
import { fairEnded, openFairTab } from "./school-fair.js";

const KEY = "cjhs_m_tour_done_v1";
export const FAIR_KEY = "cjhs_fair_tip_done_v1";

const FAIR_STEP = { sel: '.m-tabbar .m-tab[data-sec="fair"]', title: "학교 박람회 · 11월 7일(토)", text: "고등학교 입학 상담 및 학교 박람회의 당일 시간표·프로그램(특강·체험 부스·1:1 상담·전시)과 1:1 상담 사전 신청은 이 '학교 박람회' 탭에서 볼 수 있어요." };

const STEPS = [
  FAIR_STEP,
  { sel: '.m-tabbar .m-tab[data-sec="apply"]', title: "입학 상담 신청", text: "방문·전화 상담을 여기서 바로 신청할 수 있어요." },
  { sel: '.m-tabbar .m-tab[data-sec="chat"]', title: "챗봇 중앙이", text: "입학·교육과정·학교생활, 궁금한 점을 AI 챗봇에게 언제든 물어보세요." },
  { sel: ".m-tabs-sticky .content-tabs", title: "학교 둘러보기", text: "인사말·교육과정·과목선택·갤러리·특색활동을 탭으로 넘겨 보세요." },
  { sel: '.m-tabs-sticky .content-tabs button[data-tab="career"]', title: "3년 선택과목 미리 짜 보기", text: "교육과정 탭에서 우리 학교 3년 편성표를 보고, 과목선택 탭의 '우리 학교 3년 과목 짜보기'에서 2·3학년 선택과목을 직접 골라 나만의 3개년 교육과정을 모의로 구성해 볼 수 있어요. 고른 과목은 이 휴대폰에 저장되고, '선택 초기화'로 언제든 지울 수 있어요." },
  { sel: '.m-tabbar .m-tab[data-sec="qna"]', title: "Q&A 게시판", text: "직접 질문을 남기면 선생님이 답변해 드려요." },
];

// js/update-check.js 가 "업데이트 후 첫 방문"이면 가이드 기록을 지운다. 그 판단이 끝난 뒤에 가이드 여부를 본다(최대 3초).
// (update-check.js 는 페이지 맨 끝의 defer 스크립트라, 화면을 그리는 모듈보다 늦게 실행될 수 있다 → 생길 때까지 잠깐 기다린다)
function buildChecked() {
  const started = Date.now();
  return new Promise((resolve) => {
    (function wait() {
      if (window.cjhsBuildChecked) return window.cjhsBuildChecked.then(resolve, resolve);
      if (Date.now() - started > 3000) return resolve();
      setTimeout(wait, 50);
    })();
    setTimeout(resolve, 3000); // version.json 이 늦어도 가이드가 막히지 않게
  });
}

function store(fn) { try { return fn(localStorage); } catch (e) { return null; } }
const visible = (el) => !!el && el.getClientRects().length > 0;
const inView = (el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; };

export function startMobileTour() {
  startTour(STEPS, { onClose: () => store((ls) => { ls.setItem(KEY, "1"); ls.setItem(FAIR_KEY, "1"); }) });
}

/** 박람회 탭 한 단계만 띄운다. 마지막 버튼은 그 탭을 열어 준다. */
export function startFairTip(sel = FAIR_STEP.sel) {
  startTour([{ ...FAIR_STEP, sel }], {
    fair: true, finishLabel: "박람회 안내 보기", skipLabel: "닫기", onFinish: openFairTab,
    onClose: () => store((ls) => ls.setItem(FAIR_KEY, "1")),
  });
}

/**
 * @param {{sel:string,title:string,text:string}[]} stepDefs
 * @param {{onClose?:Function, onFinish?:Function, finishLabel?:string, skipLabel?:string}} [opt]
 *   onFinish: 마지막 단계에서 진행 버튼을 눌렀을 때만(건너뛰기·Esc 제외) 닫은 뒤 실행
 */
export function startTour(stepDefs, opt = {}) {
  if (document.querySelector(".mt-layer")) return;
  const steps = stepDefs.map((s) => ({ ...s, el: document.querySelector(s.sel) })).filter((s) => visible(s.el));
  if (!steps.length) return;

  const layer = document.createElement("div");
  layer.className = "mt-layer";
  if (opt.fair) layer.dataset.fair = ""; // 행사가 끝나는 순간 school-fair.js가 찾아 닫는다
  layer.innerHTML = `
    <div class="mt-spot"></div>
    <div class="mt-bubble" role="dialog" aria-modal="true" aria-labelledby="mt-title">
      <div class="mt-step"></div>
      <div class="mt-title" id="mt-title"></div>
      <p class="mt-text"></p>
      <div class="mt-actions">
        <button type="button" class="mt-skip">${opt.skipLabel || "건너뛰기"}</button>
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
    layer.querySelector(".mt-step").textContent = steps.length > 1 ? `${i + 1} / ${steps.length}` : "새 소식";
    layer.querySelector(".mt-title").textContent = s.title;
    layer.querySelector(".mt-text").textContent = s.text;
    nextBtn.textContent = i === steps.length - 1 ? opt.finishLabel || "시작하기" : "다음";
    // 고정 탭바가 아닌 대상은 화면 가운데로 가져온다
    if (!s.el.closest(".m-tabbar") && !inView(s.el)) s.el.scrollIntoView({ block: "center", behavior: "instant" in window ? "instant" : "auto" });
    // 펄스 애니메이션을 단계마다 처음부터 다시 시작
    spot.classList.remove("pulse"); void spot.offsetWidth; spot.classList.add("pulse");
    requestAnimationFrame(place);
    nextBtn.focus({ preventScroll: true });
  }

  function close() {
    opt.onClose?.();
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

  nextBtn.addEventListener("click", () => {
    if (i < steps.length - 1) return show(i + 1);
    close();
    opt.onFinish?.();
  });
  layer.querySelector(".mt-skip").addEventListener("click", close);
  // 어두운 바깥을 누르면 다음 단계로
  layer.addEventListener("click", (e) => { if (!bubble.contains(e.target)) nextBtn.click(); });
  window.addEventListener("resize", place);
  window.addEventListener("scroll", place, true);
  document.addEventListener("keydown", onKey);
  show(0);
}

/** 첫 방문이고 홈 화면이 떠 있을 때만 자동으로 시작한다. */
export async function maybeStartMobileTour() {
  await buildChecked();
  const toured = store((ls) => ls.getItem(KEY));
  // 전체 안내를 이미 본 사람: 박람회 안내만 아직 안 봤고 행사 전이면 그 한 단계만
  const start = !toured ? startMobileTour : !store((ls) => ls.getItem(FAIR_KEY)) && !fairEnded() ? () => startFairTip() : null;
  if (!start) return;
  if (!document.querySelector('.m-section.on[data-sec="home"]')) return;
  setTimeout(() => { if (document.querySelector('.m-section.on[data-sec="home"]')) start(); }, 700);
}

/** PC(index): 박람회 안내를 한 번 띄운다. "휴대폰으로도 볼 수 있어요" 창이 떠 있으면 닫힌 뒤에 띄운다. */
export async function maybeShowFairTipPc() {
  await buildChecked();
  if (store((ls) => ls.getItem(FAIR_KEY)) || fairEnded()) return;
  const sel = "#fair-open-btn";
  let waited = 0;
  const tick = () => {
    if (document.querySelector(".pmn-layer")) { if ((waited += 400) < 600000) setTimeout(tick, 400); return; }
    startFairTip(sel);
  };
  setTimeout(tick, 1400); // 휴대폰 안내 창(0.9초 뒤 열림)보다 늦게 확인
}
