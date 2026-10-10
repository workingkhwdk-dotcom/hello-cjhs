/**
 * 학교 안내 책자(수정시안) 기반 지식(BR01~BR15) 검색 하네스
 * 실행: node test/run_brochure_tests.js  (네트워크·API 불필요)
 * 1) 대표 질문 → 기대 문서가 상위(top3)에 오는지
 * 2) 책자의 충돌 가능 수치(학생수·교원수·전화·지정기간)가 BR 문서에 섞이지 않았는지
 * 3) 기존 확정 사실 문서(CW01 등)가 연락처 질문에서 여전히 1등인지
 */
const { retrieveKnowledge, KNOWLEDGE } = require("../knowledge.js");
let pass = 0, fail = 0; const fails = [];
const check = (n, ok, d) => { ok ? pass++ : (fail++, fails.push(d ? `${n}\n    ${d}` : n)); };

const CASES = [
  ["교훈이 뭐예요?", "BR01"], ["학교 교목이랑 교화가 뭔가요", "BR01"],
  ["학교 중점과제가 뭐예요", "BR02"], ["운영목표가 뭔가요", "BR02"],
  ["학교 언제 개교했어요?", "BR03"], ["수능 수석 배출한 적 있나요", "BR03"],
  ["유네스코학교 선정됐나요", "BR04"],
  ["자유 주제 탐구가 뭐예요", "BR05"], ["메이커스페이스 있나요", "BR05"],
  ["학생들이 어떤 주제로 탐구하나요", "BR06"],
  ["학교 화단에서 바나나 키웠다던데", "BR07"],
  ["수학의 날 영어의 날 같은 행사 있나요", "BR08"], ["도서관 프로그램 뭐 있어요", "BR08", "RS09"],
  ["AI 선도학교라던데 어떤 활동해요", "BR09"], ["비버챌린지 해커톤", "BR09"],
  ["용비제가 뭐예요", "BR10"], ["3행 3무 운동이 뭔가요", "BR10"],
  ["카누부 핸드볼부 있나요", "BR11", "RS14"],
  ["3개년 진로 로드맵이 뭐예요", "BR12"], ["진로탐색의 날 있나요", "BR12"],
  ["과학기행으로 어디 가나요", "BR13"], ["미래교육원 체험 뭐 했어요", "BR13"],
  ["체육관 도서관 위치가 어디예요", "BR14"], ["학교 배치도 알려주세요", "BR14"],
  ["학교 관련 신문 기사 있나요", "BR15"],
];
for (const [q, ...okIds] of CASES) {
  const id = okIds.join("/");
  const ids = retrieveKnowledge(q, "", 6).map((r) => r.id);
  check(`[top3] "${q}" → ${id}`, ids.slice(0, 3).some((i) => okIds.includes(i)), `실제: ${ids.join(", ") || "(없음)"}`);
}

// 연락처·학생수 질문은 기존 확정 문서가 우선이어야 함(책자 수치와 충돌 방지)
{
  const ids = retrieveKnowledge("교무실 전화번호 알려주세요", "", 6).map((r) => r.id);
  check("[연락처] CW01이 BR 문서보다 앞", ids.includes("CW01") && !ids.slice(0, 1).some((i) => i.startsWith("BR")), ids.join(", "));
}

// 충돌 수치 비포함 검사
const BAD = [/550\s*명/, /교원\s*52/, /055\)?\s*-?\s*239-?3100/, /2023\s*[~-]\s*2028/, /2013\.03\.01/];
for (const r of KNOWLEDGE.filter((x) => x.id.startsWith("BR"))) {
  const hit = BAD.find((re) => re.test(r.retrieval_text));
  check(`[충돌 수치 배제] ${r.id}`, !hit, hit ? String(hit) : "");
}
check("[등록] BR01~BR15 15건 존재", KNOWLEDGE.filter((x) => /^BR\d+$/.test(x.id)).length === 15);

console.log(`\n총 ${pass + fail}건 중 ${pass}건 통과, ${fail}건 실패`);
if (fail) { console.log(fails.map((f) => "- " + f).join("\n")); process.exit(1); }
