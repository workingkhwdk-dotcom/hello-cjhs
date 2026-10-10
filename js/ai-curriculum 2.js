// '과목 선택 가이드' 탭의 "AI 학과별 커리큘럼 추천" — 챗봇(chatWithAI)에 같은 질문 형태로 물어, 챗봇의 과목 추천 규칙
// (functions/index.js COURSE_ADVICE_RULES: 학기·선택군별 표)과 같은 답을 받아 보여 준다. 서버 쪽 변경은 없다.
import { replyToHtml } from "./reply-view.js";

const FUNCTION_URL = "https://asia-northeast3-hello-cjhs.cloudfunctions.net/chatWithAI";
const EXAMPLES = ["의예과", "컴퓨터공학과", "경제학과", "교육학과", "화학공학과"];
const MAX_LEN = 30; // 서버 메시지 상한(800자)보다 훨씬 짧게

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const question = major =>
  `저는 "${major}" 진학을 희망해요. 우리 학교 편성표 기준으로 2학년 1학기부터 3학년 2학기까지, 학기별로 어떤 선택과목을 고르면 좋을지 커리큘럼으로 추천해 주세요.`;

export function renderAiCurriculum(root) {
  if (!root) return;
  root.innerHTML = `<p class="cur26-lead">가고 싶은 <b>학과나 전공</b>을 적으면, 중앙이(AI)가 우리 학교 선택과목으로 <b>학기별 커리큘럼</b>을 제안해요.</p>
    <form class="ai-form">
      <input type="text" class="ai-input" maxlength="${MAX_LEN}" placeholder="예: 의예과, 컴퓨터공학과" aria-label="희망 학과 또는 전공" autocomplete="off">
      <button type="submit" class="btn btn-point ai-go">추천받기</button>
    </form>
    <div class="ai-chips">${EXAMPLES.map(m => `<button type="button" class="quick-chip" data-m="${esc(m)}">${esc(m)}</button>`).join("")}</div>
    <div class="ai-out" aria-live="polite"></div>
    <p class="cur26-note">AI가 만든 참고용 제안이에요. 대학별 필수·권장 과목은 지원하려는 대학 안내를 꼭 확인하고, 실제 개설·반 편성은 학교 안내를 따라 주세요.</p>`;

  const form = root.querySelector(".ai-form"), input = root.querySelector(".ai-input"), out = root.querySelector(".ai-out");
  const go = form.querySelector(".ai-go");
  let busy = false;

  async function ask(major) {
    major = major.trim().slice(0, MAX_LEN);
    if (!major || busy) return;
    busy = true; go.disabled = true;
    out.innerHTML = `<div class="msg bot typing ai-reply"><span></span><span></span><span></span></div>`;
    let html, failed = false;
    const fail = msg => { failed = true; html = `<p>${esc(msg)}</p>`; };
    const generic = "지금은 AI 서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요. 급하신 경우 교무실(055-239-3109)로 문의해 주세요.";
    try {
      const res = await fetch(FUNCTION_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: question(major), history: [] }) });
      const data = await res.json().catch(() => ({}));
      // 서버가 보낸 안내(질문 횟수 초과 등)가 있으면 그 문구를 그대로 보여 준다.
      if (!res.ok && !data.reply) fail(data.error || generic);
      else html = replyToHtml(data.reply || "죄송해요, 답변을 가져오지 못했어요. 잠시 후 다시 시도해 주세요.");
    } catch (err) {
      console.error(err);
      fail(generic);
    }
    out.innerHTML = `<div class="msg bot ai-reply">${failed ? "" : `<h5 class="ai-for">${esc(major)} 추천 커리큘럼</h5>`}${html}</div>`;
    busy = false; go.disabled = false;
  }

  form.addEventListener("submit", e => { e.preventDefault(); ask(input.value); });
  root.querySelector(".ai-chips").addEventListener("click", e => {
    const b = e.target.closest("[data-m]");
    if (!b) return;
    input.value = b.dataset.m;
    ask(b.dataset.m);
  });
}
