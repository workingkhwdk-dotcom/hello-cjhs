/**
 * analyzePlan(index.js) 전체 흐름 테스트 — 가짜 Firestore·가짜 OpenAI로 실제 핸들러를 end-to-end로 실행한다.
 * 실행: node test/run_analyze_plan_integration.js   
 *
 * 확인하는 것: 완료 결과 재사용(두 번째는 AI·한도 소모 없음) / 확인 요청(poll) 상태 / 간이 분석 시 한도 환급·미저장 /
 *              직전 간이 분석 기록은 startSettled일 때만 전달 / 처리 중이면 중복 시작 안 함 / 한도 초과 시 작업 권한 반환 / 입력 검증.
 */
const path = require("path");
const Module = require("module");
const assert = require("assert");

// test_harness.js와 같은 방식: firebase-* 등은 항상 스텁으로 쓴다.
const STUB_DIR = path.join(__dirname, "stubs", "node_modules");
process.env.NODE_PATH = [STUB_DIR, process.env.NODE_PATH || ""].filter(Boolean).join(path.delimiter);
Module._initPaths();
{
  const STUBBED = ["firebase-functions", "firebase-admin", "bcryptjs", "nodemailer"];
  const orig = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, ...rest) {
    if (STUBBED.includes(request.split("/")[0]) && !request.startsWith(".")) {
      try { return orig.call(this, path.join(STUB_DIR, request), parent, ...rest); } catch (e) { /* 기본 해석 */ }
    }
    return orig.call(this, request, parent, ...rest);
  };
}
process.env.OPENAI_API_KEY = "test-key";

// ---- 가짜 Firestore (admin.firestore()가 이걸 돌려주게 한 뒤 index.js를 불러온다) ----
const store = new Map();
const mkRef = (col, id) => ({
  id: `${col}/${id}`,
  get: async () => ({ exists: store.has(`${col}/${id}`), data: () => store.get(`${col}/${id}`) }),
  set: async (d, o) => { const k = `${col}/${id}`; store.set(k, o && o.merge ? { ...(store.get(k) || {}), ...d } : { ...d }); },
  delete: async () => { store.delete(`${col}/${id}`); },
  update: async (d) => { const k = `${col}/${id}`; store.set(k, { ...(store.get(k) || {}), ...d }); },
});
const fakeDb = {
  collection: (col) => ({ doc: (id) => mkRef(col, id), add: async () => ({ id: "x" }), where: () => ({ get: async () => ({ empty: true, docs: [] }) }), get: async () => ({ empty: true, docs: [] }) }),
  runTransaction: async (fn) => fn({
    get: async (r) => ({ exists: store.has(r.id), data: () => store.get(r.id) }),
    set: (r, d, o) => { store.set(r.id, o && o.merge ? { ...(store.get(r.id) || {}), ...d } : { ...d }); },
  }),
};
const admin = require("firebase-admin");
const FieldValue = admin.firestore.FieldValue;
admin.firestore = () => fakeDb;
admin.firestore.FieldValue = FieldValue;

// ---- 가짜 OpenAI(/v1/responses) ----
let aiCalls = 0;
let aiMode = "ok"; // ok | 503 | 400
const GOOD_ANALYSIS = {
  headline: "수학·정보 쪽으로 쏠린 조합이에요", balance: "수학이 가장 두꺼워요.", strengths: ["a", "b"], gaps: [],
  majors: [{ track: "컴퓨터", score: 80, reason: "r", caution: "" }], tips: [], caveat: "",
};
global.fetch = async (url) => {
  if (!String(url).includes("/v1/responses")) throw new Error("예상 밖 fetch: " + url);
  aiCalls++;
  if (aiMode === "503") return { ok: false, status: 503, text: async () => "overloaded", headers: { get: () => null } };
  if (aiMode === "400") return { ok: false, status: 400, text: async () => "invalid_request", headers: { get: () => null } };
  return { ok: true, status: 200, headers: { get: () => null }, text: async () => "", json: async () => ({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(GOOD_ANALYSIS), annotations: [] }] }] }) };
};

const { analyzePlan } = require("../index.js");
const { jobKey } = require("../analysis_job");
const { ANALYSIS_MODEL } = require("../plan_analysis");
const { LIMITS, kstDate } = require("../rate_limit");
const DATA = require("../curriculum_data.json");

const used = new Set(), PICKS = {};
for (const g of DATA.ELECTIVE) { PICKS[g.id] = []; for (const c of g.courses) if (PICKS[g.id].length < g.pick && !used.has(c[2])) { PICKS[g.id].push(c[2]); used.add(c[2]); } }
const DEVICE = "testdevice0123456789";

async function call(body) {
  const req = { method: "POST", body, headers: {} };
  let captured = null;
  const res = { status(c) { this._code = c; return this; }, json(p) { captured = { code: this._code || 200, payload: p }; }, set() {} };
  await analyzePlan(req, res);
  return captured;
}
const start = (extra = {}) => call({ picks: PICKS, deviceId: DEVICE, ...extra });
const poll = (extra = {}) => call({ picks: PICKS, deviceId: DEVICE, poll: true, ...extra });
const KEY = jobKey(PICKS, ANALYSIS_MODEL);
const counter = (name) => { const v = store.get(`usage_daily/${kstDate()}_${name}`); return v ? v.count : 0; };
const deviceHourCounter = () => [...store.entries()].filter(([k]) => k.includes("analyze_dev_h")).reduce((a, [, v]) => a + v.count, 0);

let pass = 0;
const fails = [];
async function t(name, fn) {
  store.clear(); aiCalls = 0; aiMode = "ok";
  try { await fn(); pass++; } catch (e) { fails.push(`${name}: ${e.message}`); }
}

(async () => {
  await t("처음 요청: 분석 완료(200 done) → 작업 문서가 done으로 저장되고 한도는 1회 차감", async () => {
    const r = await start();
    assert.strictEqual(r.code, 200);
    assert.strictEqual(r.payload.status, "done");
    assert.strictEqual(r.payload.analysis.headline, GOOD_ANALYSIS.headline);
    assert.ok(r.payload.result && r.payload.result.complete);
    assert.strictEqual(aiCalls, 1);
    assert.strictEqual(store.get(`analysis_jobs/${KEY}`).status, "done");
    assert.strictEqual(counter("analyze"), 1);
    assert.strictEqual(deviceHourCounter(), 1);
  });

  await t("같은 선택을 다시 요청하면 저장된 결과를 즉시 돌려준다(AI 호출·한도 소모 없음)", async () => {
    await start();
    const again = await start();
    assert.strictEqual(again.payload.status, "done");
    assert.strictEqual(again.payload.cached, true);
    assert.strictEqual(aiCalls, 1, "AI는 한 번만 호출");
    assert.strictEqual(counter("analyze"), 1);
    assert.strictEqual(deviceHourCounter(), 1);
  });

  await t("다른 기기가 같은 선택을 요청해도 저장된 결과를 재사용한다", async () => {
    await start();
    const other = await call({ picks: PICKS, deviceId: "otherdevice012345678" });
    assert.strictEqual(other.payload.cached, true);
    assert.strictEqual(aiCalls, 1);
  });

  await t("연결이 끊겼던 클라이언트가 확인(poll)하면 저장된 결과를 받는다", async () => {
    await start();
    const p = await poll();
    assert.strictEqual(p.code, 200);
    assert.strictEqual(p.payload.status, "done");
    assert.ok(p.payload.analysis.headline);
  });

  await t("poll: 작업이 없으면 none", async () => {
    const p = await poll();
    assert.deepStrictEqual(p.payload, { status: "none" });
    assert.strictEqual(aiCalls, 0, "확인 요청은 AI를 부르지 않는다");
  });

  await t("처리 중인 작업이 있으면 중복 시작하지 않고 running(poll도 running)", async () => {
    store.set(`analysis_jobs/${KEY}`, { status: "running", startedAt: Date.now() - 5000 });
    const s = await start();
    assert.strictEqual(s.payload.status, "running");
    const p = await poll();
    assert.strictEqual(p.payload.status, "running");
    assert.strictEqual(aiCalls, 0);
    assert.strictEqual(deviceHourCounter(), 0);
  });

  await t("AI 일시 장애(503 계속): 간이 분석(fallback:true)을 주고, 한도는 전부 환급되며, 완료로 저장하지 않는다", async () => {
    aiMode = "503";
    const r = await start();
    assert.strictEqual(r.code, 200);
    assert.strictEqual(r.payload.status, "done");
    assert.strictEqual(r.payload.fallback, true);
    assert.ok(r.payload.analysis.headline, "간이 분석도 화면에 보여 줄 내용이 있어야 한다");
    assert.strictEqual(aiCalls, 2, "high → low 두 번 시도(analysis_runner.js)");
    assert.strictEqual(counter("analyze"), 0, "전체 한도 환급");
    assert.strictEqual(deviceHourCounter(), 0, "기기 한도 환급");
    assert.strictEqual(store.get(`analysis_jobs/${KEY}`).status, "fallback");
  });

  await t("간이 분석은 캐시처럼 재사용되지 않는다: 다시 시도하면 AI로 새로 분석해 완료로 저장", async () => {
    aiMode = "503";
    await start();
    aiMode = "ok";
    const r = await start();
    assert.strictEqual(r.payload.status, "done");
    assert.ok(!r.payload.fallback && !r.payload.cached);
    assert.strictEqual(store.get(`analysis_jobs/${KEY}`).status, "done");
  });

  await t("간이 분석 기록은 startSettled일 때만 poll로 전달되고, 아니면 none(새 분석을 이전 결과로 오인하지 않음)", async () => {
    aiMode = "503";
    await start();
    const unsettled = await poll();
    assert.deepStrictEqual(unsettled.payload, { status: "none" });
    const settled = await poll({ startSettled: true });
    assert.strictEqual(settled.payload.status, "done");
    assert.strictEqual(settled.payload.fallback, true);
  });

  await t("AI 요청 오류(400)도 같은 경로: 간이 분석 + 한도 환급", async () => {
    aiMode = "400";
    const r = await start();
    assert.strictEqual(r.payload.fallback, true);
    assert.strictEqual(deviceHourCounter(), 0);
  });

  await t("기기 한도 초과: 429, AI 호출 없음, 작업 권한 반환(다음 요청이 막히지 않음)", async () => {
    // 같은 기기가 시간당 한도만큼 새 분석을 돌린다(결과를 지워 매번 새로 계산하게 함).
    for (let i = 0; i < LIMITS.analyzeDevicePerHour; i++) { assert.strictEqual((await start()).code, 200); store.delete(`analysis_jobs/${KEY}`); }
    const before = aiCalls;
    const r = await start();
    assert.strictEqual(r.code, 429);
    assert.ok(/한 시간에/.test(r.payload.error));
    assert.strictEqual(aiCalls, before);
    assert.ok(!store.has(`analysis_jobs/${KEY}`), "시작하지 못했으니 처리 중 표시가 남으면 안 된다");
  });

  await t("입력 검증: 미완성 선택·잘못된 기기 ID는 400", async () => {
    const partial = await call({ picks: { A: [DATA.ELECTIVE[0].courses[0][2]] }, deviceId: DEVICE });
    assert.strictEqual(partial.code, 400);
    const noDev = await call({ picks: PICKS });
    assert.strictEqual(noDev.code, 400);
    const pollNoDev = await call({ picks: PICKS, poll: true });
    assert.strictEqual(pollNoDev.code, 400);
    assert.strictEqual(aiCalls, 0);
  });

  await t("GET 등 POST 외 요청은 405", async () => {
    const req = { method: "GET", body: {}, headers: {} };
    let c = null;
    await analyzePlan(req, { status(code) { this._c = code; return this; }, json(p) { c = this._c; }, set() {} });
    assert.strictEqual(c, 405);
  });

  if (fails.length) { console.error("FAIL\n" + fails.map((f) => " - " + f).join("\n")); process.exit(1); }
  console.log(`analyzePlan integration tests: ${pass}/${pass}`);
  process.exit(0);
})();
