/**
 * 내 커리큘럼 AI 분석 작업 하네스(analysis_job.js) 테스트 — 네트워크·Firestore 없이 실행.
 * 실행: node test/run_analysis_job_tests.js
 *
 * 검증하는 것: 같은 선택 → 같은 키 / 작업 상태(none·running·done·error·오래된 것) / 트랜잭션 선점 /
 *              OpenAI 호출 재시도(429·5xx·연결 끊김·시간 초과·형식 오류)와 비재시도(400류) / 시간 예산 / 한도 환급.
 */
const assert = require("assert");
const { jobKey, readJob, claimJob, finishJob, failJob, releaseJob, callAnalysisModel, MS, MAX_ATTEMPTS, MESSAGES } = require("../analysis_job");
const { LIMITS, consumeDaily, refundDaily, consumeDeviceQuota, refundDeviceQuota, kstDate } = require("../rate_limit");

let pass = 0;
const fails = [];
async function t(name, fn) {
  try { await fn(); pass++; } catch (e) { fails.push(`${name}: ${e.message}`); }
}

// Firestore 흉내: get/set/delete + 트랜잭션(순차 실행이라 선점 경쟁은 "먼저 끝난 쪽이 이김"으로 확인).
function fakeDb() {
  const m = new Map();
  const mkRef = (col, id) => ({
    id: `${col}/${id}`,
    get: async () => ({ exists: m.has(`${col}/${id}`), data: () => m.get(`${col}/${id}`) }),
    set: async (d, o) => { const k = `${col}/${id}`; m.set(k, o && o.merge ? { ...(m.get(k) || {}), ...d } : { ...d }); },
    delete: async () => { m.delete(`${col}/${id}`); },
  });
  const db = {
    _m: m,
    collection: (col) => ({ doc: (id) => mkRef(col, id) }),
    runTransaction: async (fn) => fn({
      get: async (r) => ({ exists: m.has(r.id), data: () => m.get(r.id) }),
      set: (r, d, o) => { m.set(r.id, o && o.merge ? { ...(m.get(r.id) || {}), ...d } : { ...d }); },
    }),
  };
  return db;
}

const okJson = (analysis) => ({ ok: true, status: 200, json: async () => ({ analysis }), text: async () => "" });
const httpErr = (status, body = "err", headers = {}) => ({ ok: false, status, text: async () => body, headers: { get: (k) => headers[k.toLowerCase()] || null } });
const interpret = (json) => ({ analysis: json.analysis || null, incomplete: !!json.incomplete });
const GOOD = { headline: "h" };

// 시간 흉내: sleep이 가상 시계를 움직인다.
function clock() { let t = 0; return { now: () => t, sleep: async (ms) => { t += ms; }, advance: (ms) => { t += ms; } }; }
// 응답 순서를 정해 두는 fetch 흉내. 항목이 함수면 호출, Error면 던진다.
function seqFetch(items, c) {
  let i = 0;
  const fn = async (url, init) => {
    const it = items[Math.min(i++, items.length - 1)];
    if (it instanceof Error) throw it;
    if (typeof it === "function") return it(init, c);
    return it;
  };
  fn.calls = () => i;
  return fn;
}
// 실제 fetch는 timeoutMs에서 끊기므로, 가짜 fetch가 쓸 수 있게 시도별 timeoutMs를 c.timeoutMs에 기록해 둔다.
const run = (fetchFn, c, extra = {}) => callAnalysisModel({ fetchFn, makeRequest: (ctx) => { c.timeoutMs = ctx.timeoutMs; return { url: "u", init: { method: "POST" } }; }, interpret, now: c.now, sleep: c.sleep, ...extra });
const timeoutErr = () => Object.assign(new Error("timed out"), { name: "TimeoutError" });
const netErr = () => Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });

(async () => {
  // ---- jobKey ----
  await t("jobKey: 과목·군 순서가 달라도 같은 키", () => {
    const a = { A: ["가", "나"], B: ["다"] }, b = { B: ["다"], A: ["나", "가"] };
    assert.strictEqual(jobKey(a, "m"), jobKey(b, "m"));
  });
  await t("jobKey: 선택·모델이 다르면 다른 키", () => {
    assert.notStrictEqual(jobKey({ A: ["가"] }, "m"), jobKey({ A: ["나"] }, "m"));
    assert.notStrictEqual(jobKey({ A: ["가"] }, "m1"), jobKey({ A: ["가"] }, "m2"));
    assert.ok(/^[0-9a-f]{40}$/.test(jobKey({ A: ["가"] }, "m")));
  });

  // ---- 작업 상태 ----
  await t("readJob: 문서가 없으면 none, 저장소 오류여도 none(서비스 계속)", async () => {
    assert.strictEqual((await readJob(fakeDb(), "k")).state, "none");
    const broken = { collection: () => ({ doc: () => ({ get: async () => { throw new Error("unavailable"); } }) }) };
    assert.strictEqual((await readJob(broken, "k")).state, "none");
  });
  await t("claim → running → finish → done 흐름", async () => {
    const db = fakeDb();
    assert.deepStrictEqual(await claimJob(db, "k", 1000), { claimed: true });
    const r = await readJob(db, "k", 5000);
    assert.strictEqual(r.state, "running");
    assert.strictEqual(r.elapsedMs, 4000);
    await finishJob(db, "k", GOOD, { ms: 3000, attempts: 1 }, 6000);
    const d = await readJob(db, "k", 7000);
    assert.strictEqual(d.state, "done");
    assert.deepStrictEqual(d.analysis, GOOD);
  });
  await t("claim: 처리 중이면 두 번째는 선점 실패(running), 완료되면 done", async () => {
    const db = fakeDb();
    assert.strictEqual((await claimJob(db, "k", 1000)).claimed, true);
    const second = await claimJob(db, "k", 2000);
    assert.strictEqual(second.claimed, false);
    assert.strictEqual(second.job.state, "running");
    await finishJob(db, "k", GOOD, {}, 3000);
    const third = await claimJob(db, "k", 4000);
    assert.strictEqual(third.claimed, false);
    assert.strictEqual(third.job.state, "done");
  });
  await t("오래된 running(함수가 죽은 경우)은 새로 시작할 수 있다", async () => {
    const db = fakeDb();
    await claimJob(db, "k", 1000);
    assert.strictEqual((await readJob(db, "k", 1000 + MS.staleRunning - 1)).state, "running");
    assert.strictEqual((await readJob(db, "k", 1000 + MS.staleRunning + 1)).state, "none");
    assert.strictEqual((await claimJob(db, "k", 1000 + MS.staleRunning + 1)).claimed, true);
  });
  await t("done은 TTL 이후 none, error는 잠깐만 보이고 다시 시작하면 덮어쓴다", async () => {
    const db = fakeDb();
    await finishJob(db, "a", GOOD, {}, 1000);
    assert.strictEqual((await readJob(db, "a", 1000 + MS.doneTtl + 1)).state, "none");
    await failJob(db, "e", "busy", "msg", 1000);
    const e = await readJob(db, "e", 2000);
    assert.strictEqual(e.state, "error");
    assert.strictEqual(e.message, "msg");
    assert.strictEqual((await readJob(db, "e", 1000 + MS.errorVisible + 1)).state, "none");
    assert.strictEqual((await claimJob(db, "e", 3000)).claimed, true); // 실패 뒤 다시 시도 가능
    assert.strictEqual((await readJob(db, "e", 3500)).state, "running");
  });
  await t("releaseJob: 한도 초과로 시작 못 하면 권한을 돌려준다", async () => {
    const db = fakeDb();
    await claimJob(db, "k", 1000);
    await releaseJob(db, "k");
    assert.strictEqual((await readJob(db, "k", 1500)).state, "none");
  });
  await t("claimJob: 트랜잭션이 실패해도 서비스는 계속(claimed, unsafe)", async () => {
    const r = await claimJob({ collection: () => ({ doc: () => ({}) }), runTransaction: async () => { throw new Error("boom"); } }, "k");
    assert.deepStrictEqual(r, { claimed: true, unsafe: true });
  });

  // ---- OpenAI 호출 재시도 ----
  await t("첫 시도 성공 → 시도 1번", async () => {
    const c = clock();
    const r = await run(seqFetch([okJson(GOOD)], c), c);
    assert.ok(r.ok);
    assert.strictEqual(r.attempts.length, 1);
    assert.strictEqual(r.attempts[0].outcome, "ok");
  });
  await t("연결 끊김 → 재시도해서 성공", async () => {
    const c = clock();
    const f = seqFetch([netErr(), okJson(GOOD)], c);
    const r = await run(f, c);
    assert.ok(r.ok);
    assert.deepStrictEqual(r.attempts.map((a) => a.outcome), ["network", "ok"]);
    assert.ok(/ECONNRESET/.test(r.attempts[0].detail), "원인 코드가 로그에 남아야 한다");
  });
  await t("429(Retry-After)·503 → 재시도해서 성공, Retry-After를 지킨다", async () => {
    const c = clock();
    const f = seqFetch([httpErr(429, "rate", { "retry-after": "5" }), httpErr(503), okJson(GOOD)], c);
    const r = await run(f, c);
    assert.ok(r.ok);
    assert.deepStrictEqual(r.attempts.map((a) => a.status), [429, 503, 200]);
    assert.ok(c.now() >= 5000, `Retry-After 5초 대기 필요(실제 ${c.now()}ms)`);
  });
  await t("형식 오류·잘림(incomplete) → 재시도", async () => {
    const c = clock();
    const f = seqFetch([{ ok: true, status: 200, json: async () => ({ incomplete: true }) }, { ok: true, status: 200, json: async () => ({}) }, okJson(GOOD)], c);
    const r = await run(f, c);
    assert.ok(r.ok);
    assert.deepStrictEqual(r.attempts.map((a) => a.outcome), ["incomplete", "bad-format", "ok"]);
  });
  await t("시간 초과(Timeout) → 재시도 후에도 계속이면 timeout 안내", async () => {
    const c = clock();
    const f = seqFetch([() => { c.advance(c.timeoutMs); throw timeoutErr(); }], c);
    const r = await run(f, c);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, "timeout");
    assert.strictEqual(r.message, MESSAGES.timeout);
    assert.ok(r.attempts.every((a) => a.outcome === "timeout"));
  });
  await t("시도마다 timeoutMs가 있고 전체 예산을 넘지 않는다", async () => {
    const c = clock();
    const f = seqFetch([() => { c.advance(c.timeoutMs); throw timeoutErr(); }], c); // 실제처럼 timeoutMs에서 끊김
    const r = await run(f, c);
    const total = c.now();
    assert.ok(total <= MS.runBudget + 5000, `총 ${total}ms가 예산 ${MS.runBudget}ms를 크게 넘음`);
    assert.ok(r.attempts.length >= 1 && r.attempts.length <= MAX_ATTEMPTS);
    assert.ok(r.attempts.every((a) => a.timeoutMs > 0 && a.timeoutMs <= MS.attemptTimeout));
  });
  await t("400·401·404 같은 확정 오류는 재시도하지 않는다(config)", async () => {
    for (const st of [400, 401, 403, 404]) {
      const c = clock();
      const f = seqFetch([httpErr(st, "bad request body")], c);
      const r = await run(f, c);
      assert.strictEqual(r.ok, false);
      assert.strictEqual(r.code, "config");
      assert.strictEqual(f.calls(), 1, `${st}는 한 번만 호출`);
      assert.ok(/bad request body/.test(r.attempts[0].detail));
    }
  });
  await t("계속 503이면 시도 상한까지 하고 busy 안내", async () => {
    const c = clock();
    const f = seqFetch([httpErr(503)], c);
    const r = await run(f, c);
    assert.strictEqual(r.code, "busy");
    assert.strictEqual(f.calls(), MAX_ATTEMPTS);
  });
  await t("남은 시간이 부족하면 재시도하지 않는다", async () => {
    const c = clock();
    const f = seqFetch([() => { c.advance(MS.runBudget - 10000); return httpErr(503); }, okJson(GOOD)], c);
    const r = await run(f, c);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(f.calls(), 1);
  });
  await t("fetch에 시도별 AbortSignal이 전달된다", async () => {
    const c = clock();
    let seen = null;
    const f = async (u, init) => { seen = init.signal; return okJson(GOOD); };
    await run(f, c);
    assert.ok(seen && typeof seen.aborted === "boolean");
  });

  // ---- 한도 환급 ----
  await t("refundDaily: 하나 되돌리고 0 아래로 내려가지 않는다", async () => {
    const db = fakeDb();
    assert.strictEqual(await consumeDaily(db, "x", 5, 1700000000000), true);
    assert.strictEqual(await consumeDaily(db, "x", 5, 1700000000000), true);
    await refundDaily(db, "x", 1700000000000);
    const key = `usage_daily/${kstDate(1700000000000)}_x`;
    assert.strictEqual(db._m.get(key).count, 1);
    await refundDaily(db, "x", 1700000000000);
    await refundDaily(db, "x", 1700000000000);
    assert.strictEqual(db._m.get(key).count, 0);
  });
  await t("refundDeviceQuota: 시간당·하루 횟수를 되돌려 다시 시도할 수 있다", async () => {
    const db = fakeDb();
    const at = 1700000000000;
    for (let i = 0; i < LIMITS.analyzeDevicePerHour; i++) assert.ok((await consumeDeviceQuota(db, "analyze_dev", "h", at)).ok);
    assert.strictEqual((await consumeDeviceQuota(db, "analyze_dev", "h", at)).ok, false); // 한도 도달
    await refundDeviceQuota(db, "analyze_dev", "h", at);
    assert.ok((await consumeDeviceQuota(db, "analyze_dev", "h", at)).ok, "환급 후에는 다시 가능해야 한다");
  });
  await t("refundDaily: 저장소 오류는 삼킨다", async () => {
    await refundDaily({ collection: () => ({ doc: () => ({}) }), runTransaction: async () => { throw new Error("x"); } }, "x");
  });

  if (fails.length) { console.error("FAIL\n" + fails.map((f) => " - " + f).join("\n")); process.exit(1); }
  console.log(`analysis job tests: ${pass}/${pass}`);
})();
