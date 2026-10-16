/**
 * 내 커리큘럼 AI 분석 "작업(job)" 하네스 — 네트워크가 불안정해도 결과를 끝까지 전달한다.
 * ------------------------------------------------------------
 * 이전 구조의 문제(2026-10-14 원인 분석):
 *   브라우저가 하나의 HTTP 요청을 30초~2분 동안 붙잡고 기다렸다. 휴대폰에서는 이 긴 대기 중에
 *   ① 화면이 꺼지거나 앱을 전환(특히 iOS Safari는 백그라운드 탭의 fetch를 끊는다) ② Wi-Fi↔LTE 전환
 *   ③ 통신사·학교망의 유휴 연결 정리 ④ 서버 응답 전에 클라이언트 120초 타임아웃 같은 일이 생기면
 *   요청이 끊기고 "AI 서버에 연결하지 못했어요"만 보였다. 서버는 그동안 계속 일하고 있었는데 결과를 받을 길이 없었다.
 *   게다가 ⑤ 호출이 실패(또는 간이 분석으로 대체)해도 기기별 한도(시간당 10회)가 먼저 차감돼 다시 누를수록 한도만 닳았다.
 *
 * 이 모듈의 원칙:
 *   1. 결과를 서버에 "작업 문서"(Firestore analysis_jobs/{선택 해시})로 남긴다. 클라이언트 연결이 끊겨도
 *      서버는 끝까지 처리해 저장하고, 클라이언트는 짧은 요청으로 결과를 가져온다(폴링). → 연결 끊김이 실패가 아니다.
 *   2. 같은 선택은 같은 작업이다. 완료된 결과는 재사용하고(OpenAI·한도 소모 없음), 처리 중이면 중복으로 시작하지 않는다.
 *   3. AI 호출 자체(전체 시간 예산·high→low 재시도·학점 기반 간이 분석 폴백)는 analysis_runner.js가 맡는다. 이 모듈은 그 결과를 "받아 갈 수 있게" 보관하는 쪽이다.
 *   4. 간이 분석(AI가 답하지 못한 경우)은 "완료"로 저장하지 않는다 — 같은 선택으로 다시 눌렀을 때 AI로 다시 분석할 수 있게, 연결이 끊겼던 클라이언트가 받아 갈 만큼만 잠깐 남긴다.
 *   5. 처리 중 표시가 영원히 남지 않도록 오래된 running은 죽은 작업으로 본다.
 *
 * 순수 함수 + 주입(db·fetch·sleep·now)만 있어서 test/run_analysis_job_tests.js로 네트워크 없이 검증한다.
 */
const crypto = require("crypto");

const COLLECTION = "analysis_jobs";
// 모델·지침·스키마를 바꾸면 이 값을 올린다 → 이전 결과 재사용이 끊긴다.
const CACHE_VERSION = "v1";

const MS = {
  // "처리 중"인데 이 시간이 지났으면 함수가 죽은 것으로 보고 새로 시작한다(함수 제한 300초 + 여유).
  staleRunning: 330000,
  // 간이 분석 기록은 폴링하는 클라이언트가 받아 갈 수 있게 잠깐만 남긴다.
  fallbackVisible: 120000,
  // 완료 결과 재사용 기간.
  doneTtl: 30 * 24 * 3600 * 1000,
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

/** 현재 작업 상태. state: none | running | done | fallback. 오래된 running·done·fallback은 none으로 본다. */
async function readJob(db, key, now = Date.now()) {
  let snap;
  try { snap = await ref(db, key).get(); } catch (e) { return { state: "none", storeError: true }; }
  if (!snap || !snap.exists) return { state: "none" };
  const d = snap.data() || {};
  if (d.status === "done" && d.analysis && now - (d.finishedAt || 0) < MS.doneTtl) return { state: "done", analysis: d.analysis, finishedAt: d.finishedAt };
  if (d.status === "running" && now - (d.startedAt || 0) < MS.staleRunning) return { state: "running", startedAt: d.startedAt, elapsedMs: now - (d.startedAt || now) };
  if (d.status === "fallback" && d.analysis && now - (d.finishedAt || 0) < MS.fallbackVisible) return { state: "fallback", analysis: d.analysis, finishedAt: d.finishedAt };
  return { state: "none" };
}

/** 처리 권한을 한 요청만 얻는다(트랜잭션). 이미 완료·처리 중이면 { claimed:false, job }. 저장소 오류면 { claimed:true, unsafe:true }(서비스는 계속). 간이 분석 기록은 덮어쓴다(AI로 다시 분석). */
async function claimJob(db, key, now = Date.now()) {
  try {
    const r = ref(db, key);
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(r);
      const d = snap && snap.exists ? snap.data() || {} : {};
      if (d.status === "done" && d.analysis && now - (d.finishedAt || 0) < MS.doneTtl) return { claimed: false, job: { state: "done", analysis: d.analysis } };
      if (d.status === "running" && now - (d.startedAt || 0) < MS.staleRunning) return { claimed: false, job: { state: "running", startedAt: d.startedAt, elapsedMs: now - (d.startedAt || now) } };
      tx.set(r, { status: "running", startedAt: now, finishedAt: null, analysis: null, expireAt: new Date(now + MS.doneTtl) });
      return { claimed: true };
    });
  } catch (e) {
    return { claimed: true, unsafe: true };
  }
}

/** 결과를 저장한다. extra.fallback이면 간이 분석이라 "done"이 아니라 잠깐만 보이는 "fallback"으로 남긴다. */
async function finishJob(db, key, analysis, extra = {}, now = Date.now()) {
  try {
    const fallback = !!extra.fallback;
    await ref(db, key).set({
      status: fallback ? "fallback" : "done", analysis, finishedAt: now, startedAt: extra.startedAt || now, ms: extra.ms || null, attempts: extra.attempts || null,
      expireAt: new Date(now + (fallback ? MS.fallbackVisible * 10 : MS.doneTtl)),
    });
  } catch (e) { /* 저장 못 해도 이번 응답은 전달된다 */ }
}
/** 처리 권한을 돌려준다(한도 초과로 시작하지 못했거나, 처리 중 예외가 났을 때). */
async function releaseJob(db, key) {
  try { await ref(db, key).delete(); } catch (e) { /* 무시 */ }
}

module.exports = { COLLECTION, CACHE_VERSION, MS, jobKey, readJob, claimJob, finishJob, releaseJob };
