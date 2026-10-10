/**
 * 지식 검색(functions/knowledge.js) 관련도 회귀 테스트
 * ------------------------------------------------------------
 * 이 파일이 존재하는 이유:
 *   knowledge.js의 검색은 임베딩 없이 "글자 2-그램 겹침 + 어절 보너스"로
 *   점수를 매기는 경량 방식이라, knowledge_data.json 레코드가 추가/수정되거나
 *   QUERY_SYNONYMS·GENERIC_QUERY_WORDS 같은 튜닝 표가 바뀔 때마다
 *   "특정 단어 하나가 겹친다는 이유로 전혀 무관한 문서가 검색 1등으로
 *   올라오는" 회귀가 조용히 재발할 수 있다. (실제로 2026-09-27에
 *   "수행평가 + 정시" 질문에서 "부산대학교 전형" 문서가 1등으로 뽑히는
 *   사례가 있었다 — CHANGES.md 4차 수정 참고.)
 *
 * 이 테스트는 OpenAI API나 firebase-functions 스텁이 전혀 필요 없다.
 * retrieveKnowledge()는 로컬 JSON 파일만 읽는 순수 함수이므로, 네트워크 없이
 * 빠르고 비용 없이 매번 돌릴 수 있다 — 따라서 knowledge.js·knowledge_data.json을
 * 건드리는 모든 변경 후에는 이 테스트를 반드시 먼저 돌려서 확인한다.
 *
 * 실행: node test/run_knowledge_retrieval_tests.js
 *       (또는 npm test — run_regulation_tests.js와 함께 돈다)
 */

const { retrieveKnowledge, formatKnowledgeForPrompt, KNOWLEDGE } = require("../knowledge.js");

let pass = 0;
let fail = 0;
const fails = [];

function check(name, condition, detail) {
  if (condition) {
    pass++;
  } else {
    fail++;
    fails.push(detail ? `${name}\n    ${detail}` : name);
  }
}

function idsOf(records) {
  return records.map((r) => r.id);
}

/**
 * 케이스 형식:
 * - query: 사용자 질문
 * - context: 최근 대화 맥락(선택, 실제 서버 코드처럼 낮은 가중치로 반영됨)
 * - top1: results[0]이 이 id여야 함(가장 명확하게 관련 있는 문서를 진짜 1등으로 뽑는지)
 * - mustExclude: 이 id들은 상위 결과에 아예 나오면 안 됨(주제가 다른데 단어 하나 겹쳐서
 *   끌려 들어오는 "맥락 무시" 회귀를 잡기 위한 항목)
 * - note: 이 케이스가 왜 존재하는지에 대한 설명(실패 시 원인 파악용)
 */
const CASES = [
  {
    name: "수행평가+정시 혼합 질문 — 무관한 대학 전형 문서가 끌려오면 안 됨",
    query: "수행평가 계속 챙겨야 하나요 정시 위주인데",
    // FP17("수행평가는 발표를 잘하는 학생만 유리한가요")과 FP18("수행평가 제출일을
    // 놓쳤어요, 무조건 0점인가요")은 둘 다 이번 질문에 정당하게 관련 있는 수행평가
    // FAQ라서, 이 둘 중 어느 게 1등이든 정상이다 — 여기서 진짜로 잡아야 할 회귀는
    // "정시" 한 단어만 겹쳐서 튀어나오는 특정 대학 전형 문서(U01/U12) 쪽이다.
    // 2026-10-04: RL06(정시만/내신 포기의 현실)도 이 질문에 정당하게 맞는 문서라 1등 허용.
    acceptableTop: ["FP17", "FP18", "RL06"],
    mustExclude: ["U12", "U01"],
    note:
      "'정시'라는 단어 하나만 겹쳐서 '부산대학교 전형 특징(U12)' 같은 특정 대학 전형 " +
      "문서가 튀어나오면 안 된다. 질문의 진짜 주제는 수행평가를 계속 챙겨야 하는지이고, " +
      "FP17/FP18(수행평가 관련 FAQ) 중 하나가 1등이면 정상이다.",
  },
  {
    name: "체육복 등교 — 명확한 단일 주제 질문",
    query: "체육복 등교 가능해요?",
    top1: "FP05",
    mustExclude: [],
    note: "교복/체육복 규정 문서가 1등이어야 하고, 결과가 소수의 관련 문서로만 좁혀져야 한다.",
  },
  {
    name: "야자 몇시까지 — 명확한 단일 주제 질문",
    query: "야자 몇시까지 해요",
    top1: "FP09",
    mustExclude: [],
    note: "야간자율학습 관련 문서가 1등이어야 한다.",
  },
  {
    name: "수능 과목 개편 — 옛 수능 체제 문서가 섞이면 안 됨",
    query: "수능 몇과목 봐요",
    top1: "F05",
    mustExclude: [],
    note:
      "2028학년도 개편 수능(통합형) 관련 문서가 상위에 와야 하고, ADMISSION_ACCURACY_RULES가 " +
      "금지하는 옛 수능 체제 설명으로 오도되면 안 된다(F03/F05 계열이 상위여야 함).",
  },
  {
    name: "학교 장점 질문 — 동의어 보정(QUERY_SYNONYMS)이 여전히 동작하는지",
    query: "우리 학교 장점이 뭐예요?",
    top1: "FP48",
    mustExclude: [],
    note:
      "'학교'+'장점'이 같이 나오면 학교소개(FP48) 문서를 확실히 끌어올리도록 만든 보정 로직이 " +
      "이번 검색 개선(GENERIC_QUERY_WORDS 필터, 상대 컷오프) 이후에도 깨지지 않았는지 확인.",
  },
  {
    name: "탐구 과목 수(수능이라는 단어 없이 질문) — 개편 수능 문서가 여전히 딸려오는지",
    query: "탐구는 몇 과목 봐야 해요?",
    top1: "F05",
    mustExclude: [],
    note:
      "'수능'이라는 단어를 안 써도 탐구 과목 수를 묻는 질문이면 개편 수능 문서가 " +
      "검색되도록 만든 보정 로직이 여전히 동작하는지 확인.",
  },
  {
    name: "부산대 전형을 실제로 물으면 university_reference 문서가 정상 검색돼야 함",
    query: "부산대 정시 전형이 어떻게 되나요",
    top1: "U12",
    mustExclude: [],
    note:
      "U12(부산대학교 전형 특징) 같은 특정 대학 문서는 질문이 '대학'이나 '전형'을 실제로 " +
      "묻고 있을 때는 정상적으로 검색돼야 한다 — 위 down-weight가 과도하게 억눌러서 " +
      "진짜 대입 전형 질문에도 안 뜨는 회귀를 잡기 위한 케이스.",
  },
  {
    name: "서울대 전형을 실제로 물으면 university_reference 문서가 정상 검색돼야 함",
    query: "서울대학교 전형 특징 알려줘",
    top1: "U01",
    mustExclude: [],
    note: "위와 동일한 이유로, 서울대 전형 문서(U01)도 명시적으로 물으면 정상 검색돼야 한다.",
  },
  {
    name: "멀티턴 맥락 — 직전 대화 주제(야자)가 이번 질문(교복) 검색을 밀어내면 안 됨",
    query: "교복은 언제 사요?",
    context: "야자 몇시까지 해요 야자 의무인가요",
    top1: "FP05",
    mustExclude: [],
    note:
      "최근 대화 맥락은 낮은 가중치(0.2)로만 반영되어야 한다. 직전 turn이 야자 얘기였다고 " +
      "해서 이번 질문(교복)의 검색 결과가 야자 쪽으로 끌려가면 멀티턴 맥락 처리가 " +
      "오히려 이번 질문의 검색 정확도를 해치는 회귀다.",
  },
];

for (const c of CASES) {
  const results = retrieveKnowledge(c.query, c.context || "", 6);
  const ids = idsOf(results);
  const acceptableTop = c.acceptableTop || (c.top1 ? [c.top1] : []);

  check(
    `[1등 문서] ${c.name}`,
    results[0] && acceptableTop.includes(results[0].id),
    `질문: "${c.query}"${c.context ? ` (맥락: "${c.context}")` : ""}\n` +
      `    기대 1등(허용 목록): ${acceptableTop.join(" 또는 ")} / 실제 결과: ${ids.join(", ") || "(없음)"}\n` +
      `    ${c.note}`
  );

  for (const badId of c.mustExclude || []) {
    check(
      `[무관 문서 배제] ${c.name} — ${badId} 미포함`,
      !ids.includes(badId),
      `질문: "${c.query}"\n    ${badId}가 결과에 포함되면 안 되는데 포함됨: ${ids.join(", ")}\n    ${c.note}`
    );
  }
}

// ---- 구조적 안전장치: 검색 결과가 topK를 넘거나, 1등보다 압도적으로 낮은 점수의
// 항목까지 억지로 채워 넣지는 않는지(상대 컷오프가 실제로 동작하는지) 확인 ----
{
  const results = retrieveKnowledge("수행평가 계속 챙겨야 하나요 정시 위주인데", "", 6);
  check(
    "[상대 컷오프] topK(6개)를 억지로 다 채우지 않을 수 있어야 함",
    results.length <= 6,
    `결과 개수: ${results.length}`
  );
}

// ---- 구조적 안전장치: 챗봇이 후속 질문/다음 행동을 습관적으로 유도하지 않아야 함 ----
// knowledge_data.json의 일부 레코드는 retrieval_text 안에 상담 전략용
// "question:"(사용자에게 되물을 질문)과 "next_action:"(다음 행동 제안) 줄을 담고
// 있다. 이 줄이 프롬프트에 그대로 들어가면 모델이 매 답변 끝에 후속 질문을
// 던지는 습관으로 이어지므로, formatKnowledgeForPrompt()가 모든 레코드에서
// 이 두 줄을 빠짐없이 제거하는지 273개 전체 레코드를 대상으로 확인한다.
{
  let leaked = [];
  for (const r of KNOWLEDGE) {
    const block = formatKnowledgeForPrompt([r]);
    if (/^question:/m.test(block) || /^next_action:/m.test(block)) {
      leaked.push(r.id);
    }
  }
  check(
    "[후속 질문 유도 방지] 모든 레코드에서 question:/next_action: 줄이 프롬프트에 남지 않아야 함",
    leaked.length === 0,
    `아직 남아있는 레코드: ${leaked.join(", ") || "(없음)"}`
  );
}

console.log(`\n총 ${pass + fail}건 중 ${pass}건 통과, ${fail}건 실패`);
if (fail > 0) {
  console.log("\n실패 목록:");
  for (const f of fails) console.log(`- ${f}`);
  process.exit(1);
}
