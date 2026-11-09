// 내 커리큘럼 AI 분석 시간 통제(analysis_runner.js) 테스트 — 네트워크 호출 없음. 실행: node test/run_analysis_runner_tests.js
const { runAnalysis, fallbackAnalysis, attemptTimeout, TOTAL_BUDGET_MS, MIN_ATTEMPT_MS, ATTEMPTS } = require("../analysis_runner.js");
const { sanitizeAnalysis } = require("../plan_analysis.js");
const { evaluatePlan } = require("../plan.js");
const DATA = require("../curriculum_data.json");

let pass = 0; const fails = [];
const check = (n, c) => (c ? pass++ : fails.push(n));
const log = { warn() {}, error() {} };

const used = new Set(), picks = {};
for (const g of DATA.ELECTIVE) { picks[g.id] = []; for (const c of g.courses) if (picks[g.id].length < g.pick && !used.has(c[2])) { picks[g.id].push(c[2]); used.add(c[2]); } }
const result = evaluatePlan(picks).result;
const good = JSON.stringify({ headline: "h", balance: "b", strengths: ["a"], gaps: [], majors: [{ track: "t", score: 70, reason: "r", caution: "" }], tips: [], caveat: "c" });
const parseResponse = (j) => ({ text: j.text, incomplete: !!j.incomplete });
const okFetch = (j) => async () => ({ ok: true, json: async () => j, text: async () => "" });
let clock = 0; const now = () => clock;
const run = (fetchFn, budgetMs) => { clock = 0; return runAnalysis({ fetchFn, apiKey: "k", result, parseResponse, log, now, budgetMs }); };

(async () => {
  // 1) 첫 시도 성공
  let r = await run(okFetch({ text: good }));
  check("첫 시도 성공 → fallback 아님, 1회", !r.fallback && r.attempts === 1 && r.analysis.headline === "h");

  // 2) 첫 시도 시간 초과 → 두 번째(낮은 강도)로 성공
  const efforts = []; let n = 0;
  r = await run(async (url, opt) => { efforts.push(JSON.parse(opt.body).reasoning.effort); if (n++ === 0) { clock += 150000; throw Object.assign(new Error("t"), { name: "TimeoutError" }); } return { ok: true, json: async () => ({ text: good }) }; });
  check("시간 초과 후 강도를 낮춰 재시도", efforts.join() === "high,low" && !r.fallback && r.attempts === 2);

  // 3) 불완전(incomplete)·형식 오류·HTTP 오류·예외 → 모두 fallback, 예외 없음
  for (const [name, f] of [
    ["incomplete", okFetch({ text: good, incomplete: true })],
    ["형식 오류", okFetch({ text: "not json" })],
    ["HTTP 500", async () => ({ ok: false, status: 500, text: async () => "boom" })],
    ["네트워크 예외", async () => { throw new Error("net"); }],
  ]) {
    r = await run(f);
    check(`${name} → 간이 분석으로 응답(예외 없음)`, r.fallback === true && r.attempts === 2 && !!r.analysis.headline);
  }

  // 4) 전체 예산: 각 시도가 한도 끝까지 걸려도 예산을 넘지 않는다
  const timeouts = []; let calls = 0;
  // 진짜 fetch는 주어진 시간(첫 시도 150초, 둘째는 남은 예산)에서 끊긴다 — 시계를 그만큼만 움직인다.
  r = await run(async (url, opt) => { timeouts.push(opt.signal); clock = calls++ === 0 ? 150000 : TOTAL_BUDGET_MS; throw Object.assign(new Error("t"), { name: "TimeoutError" }); });
  check("느린 호출이 반복돼도 총 시간이 예산(240초)을 넘지 않는다", r.ms <= TOTAL_BUDGET_MS && r.fallback === true);
  check("각 시도에 AbortSignal 시간 제한을 건다", timeouts.every((s) => s && typeof s.aborted === "boolean"));
  check("예산이 거의 남지 않으면 새 시도를 시작하지 않는다", (await run(async () => { clock += TOTAL_BUDGET_MS - 5000; throw new Error("x"); })).attempts === 1);

  // 5) 시도별 시간
  check("attemptTimeout: 상한과 남은 예산 중 작은 값", attemptTimeout(ATTEMPTS[0], TOTAL_BUDGET_MS) === ATTEMPTS[0].maxMs && attemptTimeout(ATTEMPTS[1], 30000) === 30000 && attemptTimeout(ATTEMPTS[0], -5) === 0);
  check("두 번째 시도가 첫 번째보다 낮은 추론 강도", ATTEMPTS[0].effort === "high" && ATTEMPTS[1].effort === "low");
  check("서버 예산 < 함수 제한(300s)·화면 제한(270s)보다 짧다", TOTAL_BUDGET_MS < 270000 && MIN_ATTEMPT_MS < TOTAL_BUDGET_MS);

  // 6) 간이 분석은 형식을 지키고 서버 계산 값에만 근거한다
  const fb = fallbackAnalysis(result);
  check("간이 분석이 정상 분석과 같은 형식(sanitize 통과)", !!sanitizeAnalysis(fb));
  check("점수 0~100, 계열 1개 이상", fb.majors.length >= 1 && fb.majors.every((m) => m.score >= 0 && m.score <= 100));
  check("간이 분석임을 caveat에 밝힘", fb.caveat.includes("간이 분석"));
  check("편성표 밖 과목 제안 없음(tips 비어 있음)", fb.tips.length === 0);

  console.log(`통과 ${pass} / 실패 ${fails.length}`);
  if (fails.length) { console.log(fails.join("\n")); process.exit(1); }
})();
