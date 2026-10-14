/**
 * 내 커리큘럼 AI 분석 "작업(job)" 하네스 — 네트워크가 불안정해도 결과를 끝까지 전달한다.
 * ------------------------------------------------------------
 * 이전 구조의 문제(2026-10-14 원인 분석):
 *   브라우저가 하나의 HTTP 요청을 30초~2분 동안 붙잡고 기다렸다. 휴대폰에서는 이 긴 대기 중에
 *   ① 화면이 꺼지거나 앱을 전환(특히 iOS Safari는 백그라운드 탭의 fetch를 끊는다) ② Wi-Fi↔LTE 전환
 *   ③ 통신사·학교망의 유휴 연결 정리 ④ 서버 응답 전에 클라이언트 120초 타임아웃 같은 일이 생기면
 *   요청이 끊기고 "AI 서버에 연결하지 못했어요"만 보였다. 서버는 그동안 계속 일하고 있었는데 결과를 받을 길이 없었다.
 *   게다가 ⑤ OpenAI 호출에 타임아웃이 없어 멈추면 함수 제한(150초)까지 매달렸고(클라이언트는 120초에 포기),
 *   ⑥ 형식 오류 재시도까지 하면 클라이언트 제한을 넘기기 쉬웠고, ⑦ 호출이 실패해도 기기별 한도(시간당 10회)가
 *   먼저 차감돼 다시 누를수록 한도만 닳았다. ⑧ 일시 오류(429·5xx·연결 끊김)는 재시도 없이 바로 실패였다.
 *
 * 이 모듈의 원칙:
 *   1. 결과를 서버에 "작업 문서"(Firestore analysis_jobs/{선택 해시})로 남긴다. 클라이언트 연결이 끊겨도
 *      서버는 끝까지 처리해 저장하고, 클라이언트는 짧은 요청으로 결과를 가져온다(폴링). → 연결 끊김이 실패가 아니다.
 *   2. 같은 선택은 같은 작업이다. 완료된 결과는 재사용하고(OpenAI·한도 소모 없음), 처리 중이면 중복으로 시작하지 않는다.
 *   3. OpenAI 호출은 시도마다 타임아웃을 두고, 일시 오류(429·5xx·연결 끊김·시간 초과·형식 오류)만 남은 시간 안에서 재시도한다.
 *   4. 끝내 실패하면 기기별·전체 한도를 되돌려 주고(우리 쪽·AI 쪽 사정으로 한도가 닳지 않게), 원인별로 알맞은 안내를 준다.
 *   5. 매 시도를 구조화 로그로 남겨 다음 실패 때 원인을 바로 확인할 수 있다.
 *
 * 순수 함수 + 주입(db·fetch·sleep·now)만 있어서 test/run_analysis_job_tests.js로 네트워크 없이 검증한다.
 */
const crypto = require("crypto");

const COLLECTION = "analysis_jobs";
// 모델·지침·스키마를 바꾸면 이 값을 올린다 → 이전 결과 재사용이 끊긴다.
const CACHE_VERSION = "v1";

const MS = {
  // 함수 제한 시간(index.js의 timeoutSeconds: 240)보다 충분히 짧게 잡아, 우리가 먼저 정리하고 응답한다.
  runBudget: 200000,
  // 시도 하나의 상한. 멈춘 연결과 오래 걸리는 생성을 구분할 수 없어 넉넉히 두되 무한정은 아니다(예전엔 무제한이었다).
  attemptTimeout: 110000,
  // 재시도를 시작하려면 최소한 이만큼은 남아 있어야 의미가 있다.
  minRetryWindow: 35000,
  // "처리 중"인데 이 시간이 지났으면 함수가 죽은 것으로 보고 새로 시작한다(함수 제한 240초 + 여유).
  staleRunning: 260000,
  // 실패 기록은 폴링하는 클라이언트가 읽을 수 있게 잠깐만 남긴다.
  errorVisible: 120000,
  // 완료 결과 재사용 기간.
  doneTtl: 30 * 24 * 3600 * 1000,
};
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [1500, 4000];
const RETRY_AFTER_CAP_MS = 8000;

const MESSAGES = {
  timeout: "AI가 결과를 정리하는 데 너무 오래 걸렸어요. 고른 과목은 그대로 있으니 잠시 뒤에 '다시 시도'를 눌러 주세요.",
  busy: "AI 서비스가 잠시 혼잡해요. 고른 과목은 그대로 있으니 잠시 뒤에 '다시 시도'를 눌러 주세요.",
  format: "AI가 결과를 올바른 형식으로 만들지 못했어요. '다시 시도'를 눌러 주세요.",
  config: "AI 분석 설정에 문제가 있어요. 선생님께 알려 주세요. (분석 한도는 차감되지 않았어요)",
  internal: "서버에서 오류가 났어요. 잠시 뒤에 다시 시도해 주세요.",
};

/** picks → 정렬된 정규 문자열 → 해시. 같은 선택이면 과목 순서·군 순서와 상관없이 같은 키. */
function jobKey(picks, model = "") {
  const canon = Object.keys(picks || {})
    .sort()
    .map((g) => `${g}:${[...(picks[g] || [])].map(String).sort().join(",")}`)
    .join("|");
  return crypto.createHash("sha256").update(`${CACHE_VERSION}|${model}|${canon}`).digest("hex").slice(0, 40);
}

const ref = (db, key) => db.collection(COLLECTION).doc(key);

/** 현재 작업 상태. state: none | running | done | error. 오래된 running·done·error는 none으로 본다. */
async function readJob(db, key, now = Date.now()) {
  let snap;
  try { snap = await ref(db, key).get(); } catch (e) { return { state: "none", storeError: true }; }
  if (!snap || !snap.exists) return { state: "none" };
  const d = snap.data() || {};
  if (d.status === "done" && d.analysis && now - (d.finishedAt || 0) < MS.doneTtl) return { state: "done", analysis: d.analysis, finishedAt: d.finishedAt };
  if (d.status === "running" && now - (d.startedAt || 0) < MS.staleRunning) return { state: "running", startedAt: d.startedAt, elapsedMs: now - (d.startedAt || now) };
  if (d.status === "error" && now - (d.finishedAt || 0) < MS.errorVisible) return { state: "error", code: d.code, message: d.message, finishedAt: d.finishedAt };
  return { state: "none" };
}

/** 처리 권한을 한 요청만 얻는다(트랜잭션). 이미 완료·처리 중이면 { claimed:false, job }. 저장소 오류면 { claimed:true, unsafe:true }(서비스는 계속). */
async function claimJob(db, key, now = Date.now()) {
  try {
    const r = ref(db, key);
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(r);
      const d = snap && snap.exists ? snap.data() || {} : {};
      if (d.status === "done" && d.analysis && now - (d.finishedAt || 0) < MS.doneTtl) return { claimed: false, job: { state: "done", analysis: d.analysis } };
      if (d.status === "running" && now - (d.startedAt || 0) < MS.staleRunning) return { claimed: false, job: { state: "running", startedAt: d.startedAt, elapsedMs: now - (d.startedAt || now) } };
      tx.set(r, { status: "running", startedAt: now, finishedAt: null, analysis: null, code: null, message: null, expireAt: new Date(now + MS.doneTtl) });
      return { claimed: true };
    });
  } catch (e) {
    return { claimed: true, unsafe: true };
  }
}

async function finishJob(db, key, analysis, extra = {}, now = Date.now()) {
  try { await ref(db, key).set({ status: "done", analysis, finishedAt: now, startedAt: extra.startedAt || now, ms: extra.ms || null, attempts: extra.attempts || null, code: null, message: null, expireAt: new Date(now + MS.doneTtl) }); } catch (e) { /* 저장 못 해도 이번 응답은 전달된다 */ }
}
async function failJob(db, key, code, message, now = Date.now()) {
  try { await ref(db, key).set({ status: "error", analysis: null, finishedAt: now, code, message, expireAt: new Date(now + MS.errorVisible * 10) }); } catch (e) { /* 무시 */ }
}
/** 한도 초과 등으로 시작하지 못했을 때 처리 권한을 돌려준다. */
async function releaseJob(db, key) {
  try { await ref(db, key).delete(); } catch (e) { /* 무시 */ }
}

const isRetryableStatus = (s) => s === 408 || s === 409 || s === 425 || s === 429 || s >= 500;
const sleepReal = (ms) => new Promise((r) => setTimeout(r, ms));
const retryAfterMs = (res) => {
  const h = res && res.headers && typeof res.headers.get === "function" ? res.headers.get("retry-after") : null;
  const n = Number(h);
  return Number.isFinite(n) && n > 0 ? Math.min(n * 1000, RETRY_AFTER_CAP_MS) : 0;
};

/**
 * OpenAI 호출 + 재시도. 시도마다 결과(상태·시간·분류)를 attempts에 기록한다.
 * @param {object} o
 * @param {Function} o.fetchFn fetch 호환 함수
 * @param {(ctx:{n:number,timeoutMs:number}) => object} o.makeRequest 시도마다 ({ url, init })를 만든다
 * @param {(json:object) => ({analysis:object|null, incomplete:boolean})} o.interpret 응답 JSON 해석
 * @param {() => number} [o.now]  @param {(ms:number)=>Promise} [o.sleep]
 * @returns {Promise<{ok:true, analysis:object, attempts:object[]} | {ok:false, code:string, message:string, attempts:object[]}>}
 */
async function callAnalysisModel({ fetchFn, makeRequest, interpret, now = Date.now, sleep = sleepReal, budgetMs = MS.runBudget, attemptTimeoutMs = MS.attemptTimeout }) {
  const t0 = now();
  const attempts = [];
  let last = { code: "busy" };
  for (let n = 1; n <= MAX_ATTEMPTS; n++) {
    const remaining = budgetMs - (now() - t0);
    if (n > 1 && remaining < MS.minRetryWindow) break;
    const timeoutMs = Math.max(1000, Math.min(attemptTimeoutMs, remaining - 3000));
    const started = now();
    const rec = { n, timeoutMs };
    attempts.push(rec);
    let wait = BACKOFF_MS[Math.min(n - 1, BACKOFF_MS.length - 1)];
    try {
      const { url, init } = makeRequest({ n, timeoutMs });
      const res = await fetchFn(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      rec.status = res.status;
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        rec.outcome = "http";
        rec.detail = String(text).slice(0, 300);
        if (!isRetryableStatus(res.status)) { rec.ms = now() - started; last = { code: "config" }; break; }
        last = { code: "busy" };
        wait = Math.max(wait, retryAfterMs(res));
      } else {
        const out = interpret(await res.json());
        if (out && out.analysis) { rec.outcome = "ok"; rec.ms = now() - started; return { ok: true, analysis: out.analysis, attempts }; }
        rec.outcome = out && out.incomplete ? "incomplete" : "bad-format";
        last = { code: "format" };
        wait = 500;
      }
    } catch (err) {
      const timedOut = err && (err.name === "TimeoutError" || err.name === "AbortError");
      rec.outcome = timedOut ? "timeout" : "network";
      rec.detail = String((err && (err.cause && err.cause.code ? `${err.message} (${err.cause.code})` : err.message)) || err).slice(0, 200);
      last = { code: timedOut ? "timeout" : "busy" };
    }
    rec.ms = now() - started;
    if (n < MAX_ATTEMPTS && budgetMs - (now() - t0) > MS.minRetryWindow + wait) await sleep(wait);
  }
  return { ok: false, code: last.code, message: MESSAGES[last.code] || MESSAGES.internal, attempts };
}

module.exports = { COLLECTION, CACHE_VERSION, MS, MESSAGES, MAX_ATTEMPTS, jobKey, readJob, claimJob, finishJob, failJob, releaseJob, callAnalysisModel };
