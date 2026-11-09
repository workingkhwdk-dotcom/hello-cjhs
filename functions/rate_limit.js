/**
 * 공개 Cloud Function 남용 방지 (요청 횟수 제한)
 * ------------------------------------------------------------
 * 왜 필요한가: chatWithAI는 로그인 없이 누구나 호출할 수 있고, 한 번 호출할 때마다
 * OpenAI API를 여러 번(모더레이션·주제 분류·답변 생성) 부른다. 주소만 알면 반복
 * 호출로 API 비용을 쓰게 만들 수 있어, 세 겹으로 막는다.
 *   1) IP별 분당/일일 제한(이 파일의 createLimiter) — 인스턴스 메모리 기반
 *   2) 함수 동시 실행 수 상한(index.js의 maxInstances) — 1)이 인스턴스마다 따로
 *      계산되므로, 인스턴스 수를 묶어 "최악의 경우"의 총량을 제한
 *   3) 챗봇 하루 전체 호출 상한(consumeDaily, Firestore) — 위 둘이 뚫려도 비용 상한 보장
 *
 * 한도 값은 학교 와이파이처럼 한 IP를 여러 명이 같이 쓰는 경우(설명회, 수업 시간
 * 시연 등)에도 정상 이용이 막히지 않도록 넉넉하게 잡았다. 아래 LIMITS만 고치면 된다.
 */

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

const LIMITS = {
  // 챗봇: 한 IP에서 분당 120회, 하루 3000회. 전체(모든 IP 합산)는 하루 10000회까지.
  chatPerMin: { windowMs: MIN, max: 120 },
  chatPerDay: { windowMs: DAY, max: 3000 },
  chatGlobalPerDay: 10000,
  // 3년 과목 짜보기 결과 계산(evaluatePlan, OpenAI 호출 없음): 한 IP에서 분당 120회
  planPerMin: { windowMs: MIN, max: 120 },
  // 내 커리큘럼 AI 분석(analyzePlan, 상위 모델 호출이라 비쌈). 행사장 와이파이처럼 한 IP를 여럿이 쓰는 곳을 고려해
  //   ① 기기별(브라우저가 만든 기기 ID): 시간당 10회, 하루 30회  ② IP는 느슨한 안전망일 뿐(기기 ID를 계속 바꿔 우회하는 것 방지): 시간당 1000회
  //   ③ 전체(모든 기기 합산) 하루 2000회가 비용 상한.
  analyzePerHour: { windowMs: 60 * MIN, max: 1000 },
  analyzeDevicePerHour: 10,
  analyzeDevicePerDay: 30,
  analyzeGlobalPerDay: 2000,
  // 분석 결과 확인(폴링): 분석 한 번에 3~4초 간격으로 여러 번 가벼운 조회가 오므로 분석 요청과 따로 센다. 학교 와이파이를 여럿이 쓰는 경우를 고려해 넉넉히.
  analyzePollPerMin: { windowMs: MIN, max: 900 },
  // 메인 화면 방문자 수 올리기(visitCounter): 한 IP에서 하루 300회까지만 숫자를 올린다(학교 와이파이 공유 고려).
  //   넘어도 오류 없이 현재 숫자만 돌려준다. 숫자 조회 자체는 분당 120회.
  visitPerDay: { windowMs: DAY, max: 300 },
  visitReadPerMin: { windowMs: MIN, max: 120 },
  // 상담 신청·Q&A 글쓰기/수정(OpenAI 검수 호출 포함): 한 IP에서 10분에 1000회, 하루 10000회
  writePer10Min: { windowMs: 10 * MIN, max: 1000 },
  writePerDay: { windowMs: DAY, max: 10000 },
  // 비밀번호 확인·본인 신청 조회/취소: 무차별 대입 방지 — 10분에 20회
  authPer10Min: { windowMs: 10 * MIN, max: 20 },
};

/** 같은 키(IP)가 windowMs 안에 max번을 넘기면 막는 고정 창 제한기. now는 테스트용 주입. */
function createLimiter({ windowMs, max }, now = () => Date.now()) {
  const hits = new Map(); // key -> { start, count }
  let lastSweep = now();
  return {
    check(key) {
      const t = now();
      if (t - lastSweep > windowMs) {
        // 오래된 항목 정리(메모리가 무한정 늘지 않도록)
        for (const [k, v] of hits) if (t - v.start >= windowMs) hits.delete(k);
        lastSweep = t;
      }
      let h = hits.get(key);
      if (!h || t - h.start >= windowMs) {
        h = { start: t, count: 0 };
        hits.set(key, h);
      }
      h.count++;
      if (h.count > max) {
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil((h.start + windowMs - t) / 1000)) };
      }
      return { ok: true, retryAfterSec: 0 };
    },
    size: () => hits.size,
  };
}

/** 프록시(Cloud Run) 뒤의 실제 클라이언트 IP. 없으면 "unknown"(모두 한 묶음으로 취급). */
function clientIp(req) {
  const xff = req.headers && (req.headers["x-forwarded-for"] || req.headers["X-Forwarded-For"]);
  if (typeof xff === "string" && xff.trim()) return xff.split(",")[0].trim();
  return (req.ip && String(req.ip)) || "unknown";
}

/**
 * 제한기 여러 개를 차례로 검사해 하나라도 넘으면 429로 응답하고 true를 반환한다.
 * 호출하는 쪽: if (blocked(req, res, [limiterA, limiterB], "안내 문구")) return;
 */
function blocked(req, res, limiters, message) {
  const ip = clientIp(req);
  for (const l of limiters) {
    const r = l.check(ip);
    if (!r.ok) {
      res.set && res.set("Retry-After", String(r.retryAfterSec));
      res.status(429).json({ error: message, retryAfterSec: r.retryAfterSec });
      return true;
    }
  }
  return false;
}

/** 한국 시간 기준 날짜(YYYY-MM-DD) — 일일 상한이 한국 자정에 초기화되도록. */
function kstDate(t = Date.now()) {
  return new Date(t + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * 하루 전체 호출 상한. Firestore usage_daily/{날짜}_{name} 문서 한 개를 트랜잭션으로 올린다.
 * 상한 초과면 false. Firestore 오류 시에는 서비스가 멈추지 않도록 true(통과)를 반환한다.
 */
async function consumeDaily(db, name, cap, now = Date.now()) {
  try {
    const ref = db.collection("usage_daily").doc(`${kstDate(now)}_${name}`);
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const count = snap.exists ? snap.data().count || 0 : 0;
      if (count >= cap) return false;
      tx.set(ref, { name, date: kstDate(now), count: count + 1 }, { merge: true });
      return true;
    });
  } catch (err) {
    return true;
  }
}

/** consumeDaily로 올린 횟수를 하나 되돌린다(0 아래로는 내려가지 않음). 저장소 오류는 무시. */
async function refundDaily(db, name, now = Date.now()) {
  try {
    const ref = db.collection("usage_daily").doc(`${kstDate(now)}_${name}`);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const count = snap.exists ? snap.data().count || 0 : 0;
      if (count > 0) tx.set(ref, { count: count - 1 }, { merge: true });
    });
  } catch (err) { /* 되돌리지 못해도 서비스는 계속 */ }
}

/** 클라이언트가 보낸 기기 ID(브라우저가 만든 무작위 문자열)를 검증해 저장용 해시로 바꾼다. 형식이 이상하면 null. */
function deviceHash(id) {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) return null;
  return require("crypto").createHash("sha256").update(id).digest("hex").slice(0, 24);
}

/**
 * 기기별 AI 분석 횟수를 센다(Firestore usage_daily 문서, 한국 시간 기준 시간·날짜 구간).
 * 시간당·하루 중 하나라도 넘으면 { ok:false, which:"hour"|"day" }. 저장소 오류 때는 consumeDaily처럼 통과시킨다.
 */
async function consumeDeviceQuota(db, name, hash, now = Date.now()) {
  const hourBucket = Math.floor((now + 9 * 3600 * 1000) / 3600000);
  if (!(await consumeDaily(db, `${name}_h${hourBucket}_${hash}`, LIMITS.analyzeDevicePerHour, now))) return { ok: false, which: "hour" };
  if (!(await consumeDaily(db, `${name}_d_${hash}`, LIMITS.analyzeDevicePerDay, now))) return { ok: false, which: "day" };
  return { ok: true };
}

/** consumeDeviceQuota로 올린 기기별(시간·하루) 횟수를 되돌린다. quotaAt은 차감했던 시각(시간 구간이 같아야 한다). */
async function refundDeviceQuota(db, name, hash, quotaAt) {
  const hourBucket = Math.floor((quotaAt + 9 * 3600 * 1000) / 3600000);
  await refundDaily(db, `${name}_h${hourBucket}_${hash}`, quotaAt);
  await refundDaily(db, `${name}_d_${hash}`, quotaAt);
}

module.exports = { LIMITS, createLimiter, clientIp, blocked, kstDate, consumeDaily, refundDaily, deviceHash, consumeDeviceQuota, refundDeviceQuota };
