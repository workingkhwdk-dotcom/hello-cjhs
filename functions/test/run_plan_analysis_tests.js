// 내 커리큘럼 AI 분석(plan_analysis.js) 테스트 — 네트워크 호출 없음. 실행: node test/run_plan_analysis_tests.js
const { ANALYSIS_SCHEMA, buildAnalysisInput, sanitizeAnalysis, catalogText } = require("../plan_analysis.js");
const { evaluatePlan } = require("../plan.js");
const DATA = require("../curriculum_data.json");

let pass = 0; const fails = [];
const check = (n, c) => (c ? pass++ : fails.push(n));

const used = new Set(), picks = {};
for (const g of DATA.ELECTIVE) { picks[g.id] = []; for (const c of g.courses) if (picks[g.id].length < g.pick && !used.has(c[2])) { picks[g.id].push(c[2]); used.add(c[2]); } }
const r = evaluatePlan(picks).result;

// 1) 서버 계산 값
check("교과별 학점 합 = 교과 학점 합계", r.fields.reduce((a, f) => a + f.total, 0) === r.credit);
check("학교 지정 학점 합 110", r.fields.reduce((a, f) => a + f.fixed, 0) === 110);
check("선택 학점 합 64", r.fields.reduce((a, f) => a + f.picked, 0) === 64 && Object.values(r.types).reduce((a, b) => a + b, 0) === 64);

// 2) 모델 입력
const input = buildAnalysisInput(r);
check("입력에 교과별 학점 포함", /수학 \d+학점\(학교 지정 \d+ \+ 내 선택 \d+\)/.test(input));
check("입력에 고른 과목 포함", DATA.ELECTIVE.every((g) => picks[g.id].every((n) => input.includes(n))));
check("입력에 전체 과목 목록 포함", input.includes(catalogText()) && DATA.ELECTIVE.every((g) => input.includes(`${g.id}군(`)));

// 3) strict json_schema 요건: 모든 object는 additionalProperties:false, 모든 키가 required
const strictOk = (s) => {
  if (s.type === "object") return s.additionalProperties === false && Object.keys(s.properties).every((k) => s.required.includes(k)) && s.required.length === Object.keys(s.properties).length && Object.values(s.properties).every(strictOk);
  if (s.type === "array") return strictOk(s.items);
  return true;
};
check("스키마가 strict 요건 충족", strictOk(ANALYSIS_SCHEMA));

// 4) 응답 정리
const tipName = DATA.ELECTIVE[0].courses[0][2];
const good = {
  headline: "수학·정보 쪽으로 쏠린 조합이에요", balance: "수학이 가장 두꺼워요.", strengths: ["a", "b"], gaps: [],
  majors: [{ track: "경영·경제", score: 55, reason: "r", caution: "" }, { track: "컴퓨터", score: 130.4, reason: "<b>r</b>", caution: "c" }],
  tips: [`A군: ${tipName} → 다른 과목`, "그냥 좋아요"], caveat: "",
};
const s = sanitizeAnalysis(JSON.stringify(good));
check("정상 응답 통과", !!s);
check("점수 0~100으로 보정·내림차순", s.majors[0].track === "컴퓨터" && s.majors[0].score === 100 && s.majors[1].score === 55);
check("태그 문자 제거", !/[<>]/.test(JSON.stringify(s)));
check("편성표 과목이 없는 제안은 제거", s.tips.length === 1 && s.tips[0].includes(tipName));
check("빈 caveat은 기본 문구", s.caveat.length > 0);
check("JSON 아님 → null", sanitizeAnalysis("not json") === null);
check("majors 없음 → null", sanitizeAnalysis({ headline: "x" }) === null);
check("headline 없음 → null", sanitizeAnalysis({ headline: "", majors: [{ track: "a", score: 1, reason: "", caution: "" }] }) === null);
check("긴 문장 잘림", sanitizeAnalysis({ ...good, balance: "가".repeat(5000) }).balance.length <= 700);

console.log(`\n총 ${pass + fails.length}건 중 ${pass}건 통과, ${fails.length}건 실패`);
fails.forEach((f) => console.log("- " + f));
process.exit(fails.length ? 1 : 0);
