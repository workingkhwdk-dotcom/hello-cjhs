/**
 * 내 커리큘럼 AI 분석 작업 하네스(analysis_job.js) 테스트 — 네트워크·Firestore 없이 실행.
 * 실행: node test/run_analysis_job_tests.js
 *
 * 검증하는 것: 같은 선택 → 같은 키 / 작업 상태(none·running·done·fallback·오래된 것) / 트랜잭션 선점 / 한도 환급.
 * (AI 호출·시간 예산·간이 분석은 analysis_runner.js와 그 테스트가 맡는다.)
 */
const assert = require("assert");
const { jobKey, readJob, claimJob, finishJob, releaseJob, MS } = require("../analysis_job");
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

const GOOD = { headline: "h" };

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
  await t("staleRunning은 함수 제한(300초)보다 길다 — 아직 도는 작업을 죽은 것으로 오인하지 않는다", () => {
    assert.ok(MS.staleRunning > 300000);
  });
  await t("오래된 running(함수가 죽은 경우)은 새로 시작할 수 있다", async () => {
    const db = fakeDb();
    await claimJob(db, "k", 1000);
    assert.strictEqual((await readJob(db, "k", 1000 + MS.staleRunning - 1)).state, "running");
    assert.strictEqual((await readJob(db, "k", 1000 + MS.staleRunning + 1)).state, "none");
    assert.strictEqual((await claimJob(db, "k", 1000 + MS.staleRunning + 1)).claimed, true);
  });
  await t("done은 TTL 이후 none", async () => {
    const db = fakeDb();
    await finishJob(db, "a", GOOD, {}, 1000);
    assert.strictEqual((await readJob(db, "a", 1000 + MS.doneTtl - 1)).state, "done");
    assert.strictEqual((await readJob(db, "a", 1000 + MS.doneTtl + 1)).state, "none");
  });
  await t("간이 분석(fallback)은 done이 아니라 잠깐만 보이는 fallback이고, 다시 시작하면 덮어쓴다(AI로 다시 분석)", async () => {
    const db = fakeDb();
    await finishJob(db, "f", GOOD, { fallback: true }, 1000);
    const r = await readJob(db, "f", 2000);
    assert.strictEqual(r.state, "fallback");
    assert.deepStrictEqual(r.analysis, GOOD);
    assert.strictEqual((await readJob(db, "f", 1000 + MS.fallbackVisible + 1)).state, "none");
    const c = await claimJob(db, "f", 3000); // 캐시처럼 재사용되지 않고 새로 시작할 수 있다
    assert.strictEqual(c.claimed, true);
    assert.strictEqual((await readJob(db, "f", 3500)).state, "running");
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
