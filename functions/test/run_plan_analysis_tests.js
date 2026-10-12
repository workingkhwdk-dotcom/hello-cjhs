// 내 커리큘럼 AI 분석(plan_analysis.js) 테스트 — 네트워크 호출 없음. 실행: node test/run_plan_analysis_tests.js
const { ANALYSIS_SCHEMA, buildAnalysisInput, sanitizeAnalysis, catalogText, buildChatContext } = require("../plan_analysis.js");
const { LIMITS, deviceHash, consumeDeviceQuota } = require("../rate_limit.js");
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

// 5) 챗봇 이어서 상담: planContext 검증
const ctx = buildChatContext({ picks, analysis: good });
check("맥락 블록 생성(선택 결과·분석 포함)", !!ctx && ctx.includes("[내 선택 결과]") && ctx.includes("[AI 분석 결과]") && ctx.includes("컴퓨터"));
check("분석 없이도 선택 결과만으로 생성", !!buildChatContext({ picks }) && buildChatContext({ picks }).includes("분석 결과는 전달되지 않았어요"));
check("미완성 선택은 맥락 없음(null)", buildChatContext({ picks: { A: [DATA.ELECTIVE[0].courses[0][2]] } }) === null);
check("잘못된 picks/형식은 null", buildChatContext({ picks: { Z: ["x"] } }) === null && buildChatContext("x") === null && buildChatContext(null) === null);
check("태그 문자가 맥락에 새지 않음", !/[<>]/.test(buildChatContext({ picks, analysis: { ...good, headline: "<script>x</script>" } }).split("총평:")[1]));

// 6) 기기별 한도: 시간당 10회, 하루 30회 (가짜 DB)
const fakeDb = () => { const m = new Map(); return { collection: () => ({ doc: (id) => ({ id }) }), runTransaction: async (fn) => fn({ get: async (r) => ({ exists: m.has(r.id), data: () => m.get(r.id) }), set: (r, d) => m.set(r.id, { ...(m.get(r.id) || {}), ...d }) }) }; };
check("기기 ID 검증", deviceHash("a".repeat(16)) && !deviceHash("short") && !deviceHash(123) && !deviceHash("가".repeat(20)) && !deviceHash("a".repeat(65)));
(async () => {
  const db = fakeDb(), h = deviceHash("device-aaaaaaaaaaaaaaaa"), other = deviceHash("device-bbbbbbbbbbbbbbbb");
  const t0 = Date.UTC(2026, 9, 12, 3, 0, 0); // 한국 12:00
  let okCount = 0, r;
  for (let i = 0; i < LIMITS.analyzeDevicePerHour; i++) if ((await consumeDeviceQuota(db, "t", h, t0 + i)).ok) okCount++;
  check("한 기기는 시간당 10회까지 통과", okCount === 10);
  r = await consumeDeviceQuota(db, "t", h, t0 + 100);
  check("11번째는 시간당 초과로 거절", !r.ok && r.which === "hour");
  check("같은 IP의 다른 기기는 영향 없음", (await consumeDeviceQuota(db, "t", other, t0 + 100)).ok);
  // 다음 시간들: 하루 30회 상한
  let passed = 10, hr = 1;
  for (; hr < 6; hr++) for (let i = 0; i < 10; i++) { const x = await consumeDeviceQuota(db, "t", h, t0 + hr * 3600000 + i); if (x.ok) passed++; }
  check("하루 통과는 30회", passed === LIMITS.analyzeDevicePerDay);
  r = await consumeDeviceQuota(db, "t", h, t0 + 6 * 3600000);
  check("31번째는 하루 초과로 거절", !r.ok && r.which === "day");
  check("다음 날은 다시 가능", (await consumeDeviceQuota(db, "t", h, t0 + 24 * 3600000)).ok);
  check("한도 값: IP 300/시간, 전체 1000/일", LIMITS.analyzePerHour.max === 300 && LIMITS.analyzeGlobalPerDay === 1000);
  done();
})();
function done() {
console.log(`\n총 ${pass + fails.length}건 중 ${pass}건 통과, ${fails.length}건 실패`);
fails.forEach((f) => console.log("- " + f));
process.exit(fails.length ? 1 : 0);
}
