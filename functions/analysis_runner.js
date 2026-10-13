/**
 * 내 커리큘럼 AI 분석의 "시간 통제" (analyzePlan 함수가 사용)
 * ------------------------------------------------------------
 * 예전에는 OpenAI 호출에 개별 제한 시간이 없고 최대 2번을 차례로 기다려서, 느린 날에는 서버 제한(150초)·화면 제한(120초)을
 * 먼저 넘겨 "분석에 실패했어요"가 떴다. 이 파일은 다음 세 가지를 구조로 보장한다.
 *   1) 전체 예산(TOTAL_BUDGET_MS) 안에 반드시 끝낸다 — 각 시도에 남은 예산만큼만 시간을 주고, 넘으면 호출을 끊는다.
 *   2) 시도마다 추론 강도를 낮춘다(high → low) — 느려서 끊긴 뒤에는 더 빠른 설정으로 다시 시도한다.
 *   3) 그래도 AI가 답을 못 주면 서버가 계산한 학점으로 간이 분석을 만들어 돌려준다(fallback:true) — 학생은 실패 화면 대신 결과를 받는다.
 * 네트워크 함수(fetchFn)와 시계(now)를 주입받아 테스트에서 실제 호출 없이 검증한다.
 */
const { ANALYSIS_MODEL, ANALYSIS_SCHEMA, INSTRUCTIONS, buildAnalysisInput, sanitizeAnalysis } = require("./plan_analysis");

const TOTAL_BUDGET_MS = 100000; // 서버 함수 제한(150초)·화면 제한(130초)보다 짧게 — 어떤 경우에도 이 안에 응답한다
const MIN_ATTEMPT_MS = 12000; // 이보다 적게 남았으면 새 시도를 시작하지 않고 바로 간이 분석으로 넘어간다
const ATTEMPTS = [
  { effort: "high", maxMs: 62000, maxTokens: 6000 },
  { effort: "low", maxMs: Infinity, maxTokens: 4000 }, // 남은 예산 전부
];

/** 이 시도에 줄 시간(ms). 시도 상한과 남은 예산 중 작은 쪽. */
function attemptTimeout(attempt, remainingMs) {
  return Math.max(0, Math.min(attempt.maxMs, remainingMs));
}

/** 한 번 호출. 성공하면 정리된 분석, 아니면 null (예외·시간 초과·형식 오류 모두 null). */
async function callOnce({ fetchFn, apiKey, result, attempt, timeoutMs, parseResponse, log }) {
  try {
    const aiRes = await fetchFn("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model: ANALYSIS_MODEL,
        reasoning: { effort: attempt.effort },
        max_output_tokens: attempt.maxTokens, // 추론 토큰이 이 한도에 포함되므로 넉넉히
        store: false,
        instructions: INSTRUCTIONS,
        input: buildAnalysisInput(result),
        text: { format: { type: "json_schema", name: "curriculum_analysis", strict: true, schema: ANALYSIS_SCHEMA } },
      }),
    });
    if (!aiRes.ok) { log.error("analyzePlan AI API error", { status: aiRes.status, body: String(await aiRes.text()).slice(0, 300) }); return null; }
    const parsed = parseResponse(await aiRes.json());
    const analysis = parsed.text && !parsed.incomplete ? sanitizeAnalysis(parsed.text) : null;
    if (!analysis) log.warn("analyzePlan 응답 형식 오류", { effort: attempt.effort, incomplete: parsed.incomplete });
    return analysis;
  } catch (err) {
    log.warn("analyzePlan 호출 실패", { effort: attempt.effort, timedOut: err && (err.name === "TimeoutError" || err.name === "AbortError"), message: String(err && err.message).slice(0, 200) });
    return null;
  }
}

/** 서버가 계산한 교과별 학점만으로 만드는 간이 분석. AI 판단이 아니므로 점수는 '선택 학점 비중'이고, 그렇게 밝힌다. */
const TRACKS = [
  { track: "이공계열(수학·과학·정보)", fields: ["수학", "과학", "기술·가정/정보"], text: "수학·과학·정보 과목" },
  { track: "인문·사회계열", fields: ["국어", "사회", "제2외국어/한문"], text: "국어·사회 과목" },
  { track: "어문·국제계열", fields: ["영어", "제2외국어/한문"], text: "영어·외국어 과목" },
  { track: "예체능·교양", fields: ["예술", "체육", "교양"], text: "예술·교양 과목" },
];
function fallbackAnalysis(result) {
  const picked = result.fields.filter((f) => f.picked > 0).sort((a, b) => b.picked - a.picked);
  const totalPicked = picked.reduce((s, f) => s + f.picked, 0) || 1;
  const top = picked.slice(0, 2).map((f) => f.field);
  const thin = result.fields.filter((f) => f.picked === 0 && f.fixed > 0).map((f) => f.field);
  const scored = TRACKS.map((t) => {
    const credit = result.fields.filter((f) => t.fields.includes(f.field)).reduce((s, f) => s + f.picked, 0);
    return { t, credit, score: Math.min(95, Math.round((credit / totalPicked) * 100)) };
  }).sort((a, b) => b.credit - a.credit);
  return {
    headline: top.length ? `${top.join("·")} 과목을 중심으로 고른 조합이에요` : "선택과목을 고르게 담은 조합이에요",
    balance: picked.length
      ? `내가 고른 ${totalPicked}학점 중 ${picked.slice(0, 3).map((f) => `${f.field} ${f.picked}학점`).join(", ")} 순으로 많아요. 학교 지정 과목까지 합친 교과별 학점은 위 표에서 확인할 수 있어요.`
      : "고른 선택과목의 교과별 학점은 위 표에서 확인할 수 있어요.",
    strengths: picked.slice(0, 3).map((f) => `${f.field} 교과를 선택 ${f.picked}학점으로 깊이 있게 담았어요.`),
    gaps: thin.length ? [`${thin.slice(0, 3).join("·")} 교과는 선택과목을 하나도 담지 않았어요.`] : [],
    majors: scored.filter((s) => s.credit > 0).slice(0, 3).map((s) => ({
      track: s.t.track, score: s.score,
      reason: `${s.t.text}에서 선택 ${s.credit}학점을 담아, 선택 학점 중 ${s.score}%가 이 계열과 닿아 있어요.`,
      caution: "",
    })),
    tips: [],
    caveat: "AI 응답이 늦어져 학점 비중만으로 만든 간이 분석이에요. 점수는 선택 학점 비중이고, 잠시 뒤 ‘AI로 다시 분석하기’를 누르면 AI가 더 자세히 살펴봐요.",
  };
}

/**
 * @param {{ fetchFn?: Function, apiKey: string, result: object, parseResponse: Function, log: object, now?: () => number, budgetMs?: number }} o
 * @returns {Promise<{ analysis: object, fallback: boolean, attempts: number, ms: number }>} 예외를 던지지 않고 항상 분석을 돌려준다.
 */
async function runAnalysis({ fetchFn = fetch, apiKey, result, parseResponse, log, now = Date.now, budgetMs = TOTAL_BUDGET_MS }) {
  const t0 = now();
  let attempts = 0;
  for (const attempt of ATTEMPTS) {
    const remaining = budgetMs - (now() - t0);
    if (attempts > 0 && remaining < MIN_ATTEMPT_MS) break;
    const timeoutMs = attemptTimeout(attempt, remaining);
    if (timeoutMs <= 0) break;
    attempts++;
    const analysis = await callOnce({ fetchFn, apiKey, result, attempt, timeoutMs, parseResponse, log });
    if (analysis) return { analysis, fallback: false, attempts, ms: now() - t0 };
  }
  log.warn("analyzePlan 간이 분석으로 대체", { attempts, ms: now() - t0 });
  return { analysis: fallbackAnalysis(result), fallback: true, attempts, ms: now() - t0 };
}

module.exports = { runAnalysis, fallbackAnalysis, attemptTimeout, TOTAL_BUDGET_MS, MIN_ATTEMPT_MS, ATTEMPTS };
