// 2026-10-01 추가: 3개년 교육과정 "확정" 안내와 진로별 구체 과목 추천이 챗봇에 실제로 전달되는지 검증.
// (실제 GPT 답변 품질이 아니라, 모델에게 올바른 근거·규칙이 프롬프트로 들어가는지를 본다.)
const { callChat } = require("./test_harness.js");
const { retrieveKnowledge } = require("../knowledge");
const { CURRICULUM_CORE } = require("../curriculum_core");
const { COURSE_ADVICE_RULES } = require("../index.js");
const path = require("path");
const { pathToFileURL } = require("url");

async function main() {
  let pass = 0; const fails = [];
  const check = (n, c) => (c ? pass++ : fails.push(n));

  // 1) 진로 질문 → 계열별 과목 안내 문서(C06~C13)가 검색됨
  const retr = [
    ["의대 가려면 선택과목 뭐 들어야 해요?", "C07"],
    ["공대 가려면 어떤 과목 추천해요?", "C06"],
    ["컴공 가고 싶은데 과목 추천", "C08"],
    ["경제학과 준비하려면 선택과목 추천", "C09"],
    ["법대 가고 싶은데 어떤 과목 들어야 해요?", "C11"],
  ];
  for (const [q, id] of retr) {
    check(`[검색] "${q}" → ${id}`, retrieveKnowledge(q, "", 6).some((r) => r.id === id));
  }

  // 2) 프롬프트에 확정 편성표·추천 규칙이 항상 들어감 (검색 결과와 무관)
  for (const q of ["의대 가려면 선택과목 뭐 들어야 해요?", "2027 신입생 교육과정 확정됐나요?", "A군에 뭐 있어요?"]) {
    const r = await callChat(q);
    const p = r.promptSeen || "";
    check(`[프롬프트] 확정 편성표 포함: "${q}"`, p.includes("[확정된 3개년 교육과정"));
    check(`[프롬프트] 추천 규칙 포함: "${q}"`, p.includes("[교육과정·과목 추천 답변 방식]"));
    check(`[프롬프트] '아직 확정 안 됐다' 금지 문구: "${q}"`, p.includes("아직 확정되지 않았다"));
  }

  // 3) 편성표 원본(js/curriculum-2026.js)의 모든 과목명·선택군·선택 개수가 챗봇 블록에 있음
  const { _data } = await import(pathToFileURL(path.join(__dirname, "../../js/curriculum-2026.js")).href);
  const { ELECTIVE, FIXED } = _data;
  ELECTIVE.forEach((g) => {
    check(`[일치] ${g.id}군 ${g.courses.length}개 중 ${g.pick}과목`, CURRICULUM_CORE.includes(`${g.id}군 — ${g.courses.length}개 중 ${g.pick}과목`));
    g.courses.forEach((c) => check(`[일치] ${g.id}군 과목 ${c[2]}`, CURRICULUM_CORE.includes(c[2])));
  });
  FIXED.forEach((arr, si) => arr.forEach((c) => check(`[일치] 학교 지정 ${si}: ${c[2]}`, CURRICULUM_CORE.includes(c[2].replace(" ↔ ", "↔")))));

  // 4) 규칙 문구 핵심
  check("[규칙] 학기별 선택군 순서", COURSE_ADVICE_RULES.includes("A·C군") && COURSE_ADVICE_RULES.includes("G·H군"));
  check("[규칙] 구체 과목명 요구", COURSE_ADVICE_RULES.includes("구체적인 과목명"));

  console.log(`\n총 ${pass + fails.length}건 중 ${pass}건 통과, ${fails.length}건 실패`);
  fails.forEach((f) => console.log("- " + f));
  process.exit(fails.length ? 1 : 0);
}
main();
