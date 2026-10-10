/** 요청 제한(rate_limit.js) 단위 테스트. 실행: node test/run_rate_limit_tests.js (네트워크·Firebase 불필요) */
const { createLimiter, clientIp, blocked, kstDate, consumeDaily, LIMITS } = require("../rate_limit.js");
let pass = 0, fail = 0; const fails = [];
const check = (n, ok, d) => { ok ? pass++ : (fail++, fails.push(d ? `${n}\n    ${d}` : n)); };

// 1) 고정 창: max번까지 통과, 초과는 차단, 창이 지나면 다시 통과
{
  let t = 1000; const l = createLimiter({ windowMs: 60000, max: 3 }, () => t);
  const r = [1, 2, 3, 4].map(() => l.check("a").ok);
  check("[제한] 3회 통과 후 4번째 차단", JSON.stringify(r) === "[true,true,true,false]", JSON.stringify(r));
  check("[제한] 다른 IP는 영향 없음", l.check("b").ok === true);
  const blockedRes = l.check("a");
  check("[제한] retryAfterSec가 1~60 범위", blockedRes.retryAfterSec >= 1 && blockedRes.retryAfterSec <= 60, String(blockedRes.retryAfterSec));
  t += 60001;
  check("[제한] 창이 지나면 다시 통과", l.check("a").ok === true);
}
// 2) 메모리 정리
{
  let t = 0; const l = createLimiter({ windowMs: 1000, max: 5 }, () => t);
  for (let i = 0; i < 500; i++) l.check("ip" + i);
  t += 5000; l.check("new");
  check("[메모리] 창이 지난 항목이 정리됨", l.size() <= 2, String(l.size()));
}
// 3) IP 추출
check("[IP] x-forwarded-for 첫 값 사용", clientIp({ headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" } }) === "1.2.3.4");
check("[IP] 헤더 없으면 req.ip", clientIp({ headers: {}, ip: "5.6.7.8" }) === "5.6.7.8");
check("[IP] 아무것도 없으면 unknown", clientIp({ headers: {} }) === "unknown");
// 4) blocked(): 429 응답
{
  const l = createLimiter({ windowMs: 60000, max: 1 });
  const mk = () => { const o = { code: 0, body: null, headers: {} }; return { o, set: (k, v) => (o.headers[k] = v), status(c) { o.code = c; return this; }, json(b) { o.body = b; return this; } }; };
  const req = { headers: { "x-forwarded-for": "9.9.9.9" } };
  const r1 = mk(); check("[blocked] 첫 요청 통과", blocked(req, r1, [l], "msg") === false && r1.o.code === 0);
  const r2 = mk(); check("[blocked] 두 번째 429 + 안내문 + Retry-After", blocked(req, r2, [l], "msg") === true && r2.o.code === 429 && r2.o.body.error === "msg" && !!r2.o.headers["Retry-After"]);
}
// 5) 한국 시간 날짜 + 일일 전체 상한(가짜 Firestore)
check("[날짜] UTC 15:00은 한국 다음 날", kstDate(Date.parse("2026-10-01T15:00:00Z")) === "2026-10-02");
check("[날짜] UTC 14:59는 한국 같은 날", kstDate(Date.parse("2026-10-01T14:59:00Z")) === "2026-10-01");
function fakeDb() {
  const store = {};
  return {
    store,
    collection: () => ({ doc: (id) => ({ id }) }),
    runTransaction: async (fn) => fn({
      get: async (ref) => ({ exists: ref.id in store, data: () => store[ref.id] }),
      set: (ref, v) => { store[ref.id] = { ...(store[ref.id] || {}), ...v }; },
    }),
  };
}
(async () => {
  const db = fakeDb(); const now = Date.parse("2026-10-01T03:00:00Z");
  const res = []; for (let i = 0; i < 4; i++) res.push(await consumeDaily(db, "chat", 3, now));
  check("[일일 상한] 3회 통과 후 차단", JSON.stringify(res) === "[true,true,true,false]", JSON.stringify(res));
  check("[일일 상한] 다음 날(한국 자정 후)에는 초기화", (await consumeDaily(db, "chat", 3, now + 24 * 3600 * 1000)) === true);
  const badDb = { collection: () => ({ doc: () => ({}) }), runTransaction: async () => { throw new Error("down"); } };
  check("[일일 상한] Firestore 장애 시에는 서비스 유지(통과)", (await consumeDaily(badDb, "chat", 3, now)) === true);
  check("[설정] 챗봇 분당 한도가 학교 와이파이 동시 사용을 감당(≥30)", LIMITS.chatPerMin.max >= 30);
  console.log(`\n총 ${pass + fail}건 중 ${pass}건 통과, ${fail}건 실패`);
  if (fail) { console.log(fails.map((f) => "- " + f).join("\n")); process.exit(1); }
})();
