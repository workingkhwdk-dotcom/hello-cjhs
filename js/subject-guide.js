// '과목 선택 가이드' 탭 — ① 3년 과목 짜보기 ② AI 학과별 커리큘럼 추천 ③ 선택과목 안내 자료 3종(영상·학교 자료·종합 네비게이션) 바로가기.
// 각 칸은 누르면 펼쳐진다. 링크가 바뀌면 아래 ITEMS의 url만 고치면 됩니다.
import { cat, wireCats } from "./curriculum-2026.js";
import { renderPlanner } from "./course-planner.js";
import { renderAiCurriculum } from "./ai-curriculum.js";

const ICON = {
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9.5 5 2.5-5 2.5z" fill="currentColor"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></svg>',
  compass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/></svg>',
  out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>',
};

const ITEMS = [
  { n: "01", kind: "영상", icon: "play", tone: "a",
    title: "EBS 진로 학업 설계 컨설팅", sub: "선택과목 안내 영상",
    hint: "유튜브 채널에서 ‘재생 목록 → 진로 또는 융합과목’으로 들어가면 돼요.",
    url: "https://www.youtube.com/channel/UCVgOjr8xT53UeyHlRih185g", host: "youtube.com", cta: "영상 보러가기" },
  { n: "02", kind: "학교 자료", icon: "doc", tone: "b",
    title: "‘2026 선택과목 뭐하지’", sub: "선택과목 안내 자료",
    hint: "학교 홈페이지에 게시된 안내 자료입니다.",
    url: "https://cwjungang-h.gne.go.kr/cwjungang-h/na/ntt/selectNttInfo.do?nttSn=100324562&mi=144376", host: "cwjungang-h.gne.go.kr", cta: "자료 보러가기" },
  { n: "03", kind: "참고자료", icon: "compass", tone: "c",
    title: "2028 선택과목 종합 네비게이션", sub: "선택과목 참고자료",
    hint: "선택과목을 한눈에 살펴볼 수 있는 참고자료입니다.",
    url: "https://subject-navigator-2028.vercel.app/", host: "subject-navigator-2028.vercel.app", cta: "네비게이션 열기" },
];

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function card(it) {
  return `<article class="sg-card tone-${it.tone}">
    <div class="sg-top">
      <span class="sg-num">${it.n}</span>
      <span class="sg-kind">${esc(it.kind)}</span>
    </div>
    <span class="sg-ico">${ICON[it.icon]}</span>
    <h4 class="sg-title">${esc(it.title)}</h4>
    <p class="sg-sub">${esc(it.sub)}</p>
    <p class="sg-hint">${esc(it.hint)}</p>
    <a class="sg-btn" href="${esc(it.url)}" target="_blank" rel="noopener" aria-label="${esc(it.title)} — ${esc(it.cta)}(새 창)">${esc(it.cta)}${ICON.out}</a>
    <span class="sg-host">${esc(it.host)}</span>
  </article>`;
}

export function renderSubjectGuide(el) {
  if (!el) return;
  const box = (n, title, sub, body) => cat(n, title, sub, body, "sg-cat");
  el.innerHTML = `<section class="sg cur26">
    <div class="sg-lead">
      <h4>나에게 맞는 과목, 미리 살펴보고 고르세요</h4>
      <p>아래 세 칸 중 궁금한 칸을 눌러 열어 보세요.</p>
    </div>
    ${box(1, "우리 학교 3년 과목 짜보기", "선택과목을 미리 골라 내 3개년 교육과정 완성하기", `<div id="sg-planner"></div>`)}
    ${box(2, "AI로 학과별 커리큘럼 추천받기", "가고 싶은 학과·전공에 맞는 선택과목 제안", `<div id="sg-ai"></div>`)}
    ${box(3, "선택과목 안내 자료", "영상 · 학교 자료 · 종합 네비게이션 바로가기", `<div class="sg-grid">${ITEMS.map(card).join("")}</div>`)}
  </section>`;
  renderPlanner(el.querySelector("#sg-planner"));
  renderAiCurriculum(el.querySelector("#sg-ai"));
  wireCats(el);
}

export const _items = ITEMS;
