/**
 * 브라우저 쪽 AI 분석 요청 하네스(js/analysis-client.js) 테스트 — 네트워크·브라우저 없이 실행.
 * 실행: node test/run_analysis_client_tests.js
 *
 * "휴대폰 네트워크가 중간에 끊기는" 실제 상황을 가상 시계와 가짜 fetch로 재현해,
 * 끊김이 실패로 보이지 않고 결과가 끝까지 전달되는지, 확정된 실패만 오류로 보이는지 확인한다.
 */
const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");

let pass = 0;
const fails = [];
async function t(name, fn) {
  try { await fn(); pass++; } catch (e) { fails.push(`${name}: ${e.message}`); }
}

const ANALYSIS = { headline: "h", majors: [] };
const RESULT = { complete: true };
const PICKS = { A: ["가"] };

// 가상 환경: idle(ms)이 가상 시계를 움직인다. 시작 요청(start)·확인 요청(poll)은 각각 규칙 함수로 정한다.
function env({ start, poll, online = () => true, timing } = {}) {
  let t0 = 0;
  const log = { starts: 0, polls: 0, pollBodies: [], notes: [], idles: 0 };
  const pending = []; // 보류 중인 시작 요청 해결자
  const fetchFn = async (url, init) => {
    const body = JSON.parse(init.body);
    if (body.poll) {
      log.polls++;
      log.pollBodies.push(body);
      const r = await poll(log.polls, { now: () => t0, log, body });
      if (r instanceof Error) throw r;
      return r;
    }
    log.starts++;
    const r = await start(log.starts, { now: () => t0, log, hang: () => new Promise((res) => pending.push(res)) });
    if (r instanceof Error) throw r;
    return r;
  };
  return {
    log, pending,
    opts: {
      url: "u", picks: PICKS, deviceId: "d".repeat(20),
      fetchFn,
      now: () => t0,
      // 실제 idle은 수 초가 걸려 그 사이 대기 중인 요청이 먼저 처리된다 → 가짜도 먼저 한 번 양보한 뒤 시계를 움직인다.
      idle: async (ms) => { log.idles++; await new Promise((r) => setImmediate(r)); t0 += ms; },
      sleep: async (ms) => { t0 += ms; },
      isOnline: online,
      onStatus: (n) => log.notes.push(n),
      timing: { total: 290000, pollEvery: 4000, firstPollAfter: 5000, pollTimeout: 15000, startTimeout: 295000, maxStarts: 3, ...(timing || {}) },
    },
  };
}
const json = (status, data) => ({ status, json: async () => data });
const html = (status) => ({ status, json: async () => { throw new SyntaxError("Unexpected token <"); } });
const DONE = json(200, { status: "done", analysis: ANALYSIS, result: RESULT });
const RUNNING = json(200, { status: "running", elapsedMs: 3000 });
const NONE = json(200, { status: "none" });
const netErr = () => new TypeError("Load failed");

(async () => {
  const { requestAnalysis, TIMING } = await import(pathToFileURL(path.join(__dirname, "..", "..", "js", "analysis-client.js")).href);

  await t("정상: 시작 요청이 바로 완료되면 그대로 반환(확인 요청 없음)", async () => {
    const e = env({ start: () => DONE, poll: () => RUNNING });
    const r = await requestAnalysis(e.opts);
    assert.ok(r.ok && r.analysis.headline === "h");
    assert.strictEqual(e.log.polls, 0);
  });

  await t("핵심: 시작 요청이 끊겨도(Load failed) 확인 요청으로 결과를 받는다", async () => {
    const e = env({ start: () => netErr(), poll: (n) => (n < 3 ? RUNNING : DONE) });
    const r = await requestAnalysis(e.opts);
    assert.ok(r.ok, JSON.stringify(r));
    assert.strictEqual(e.log.starts, 1, "서버가 처리 중이면 다시 시작하지 않는다");
    assert.strictEqual(e.log.polls, 3);
  });

  await t("시작 요청이 오래 걸리는 동안(보류) 확인 요청이 먼저 결과를 받아 오면 그걸 쓴다", async () => {
    const e = env({ start: (n, c) => c.hang(), poll: (n) => (n < 4 ? RUNNING : DONE) });
    const r = await requestAnalysis(e.opts);
    assert.ok(r.ok);
    assert.strictEqual(e.log.starts, 1);
  });

  await t("게이트웨이 504(HTML 응답)도 실패가 아니라 '아직 모름' → 확인 요청으로 이어받는다", async () => {
    const e = env({ start: () => html(504), poll: (n) => (n < 2 ? RUNNING : DONE) });
    const r = await requestAnalysis(e.opts);
    assert.ok(r.ok);
  });

  await t("요청이 서버에 닿지 못해 '작업 없음'이면 시작 요청을 다시 보낸다", async () => {
    const e = env({ start: (n) => (n === 1 ? netErr() : DONE), poll: () => NONE });
    const r = await requestAnalysis(e.opts);
    assert.ok(r.ok);
    assert.strictEqual(e.log.starts, 2);
  });

  await t("다시 시작은 최대 maxStarts번까지만", async () => {
    const e = env({ start: () => netErr(), poll: () => NONE, timing: { total: 120000 } });
    const r = await requestAnalysis(e.opts);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(e.log.starts, 3);
    assert.strictEqual(r.code, "deadline");
    assert.ok(/인터넷 연결/.test(r.message), "네트워크 문제였다면 연결 안내를 보여 준다");
  });

  await t("시작 요청이 이미 끝나 있으면 대기 루프가 바쁘게 돌지 않고 간격을 둔다", async () => {
    const e = env({ start: () => netErr(), poll: () => RUNNING, timing: { total: 40000 } });
    await requestAnalysis(e.opts);
    // 40초 동안 4초 간격이면 확인은 10번 안팎이어야 한다(간격 없이 돌면 수천 번).
    assert.ok(e.log.polls >= 5 && e.log.polls <= 12, `확인 ${e.log.polls}번`);
  });

  await t("오프라인이면 요청을 보내지 않고 기다렸다가, 연결이 돌아오면 이어서 받는다", async () => {
    let step = 0;
    const e = env({
      start: () => netErr(),
      poll: () => DONE,
      online: () => step++ > 4, // 처음 몇 번은 오프라인
    });
    const r = await requestAnalysis(e.opts);
    assert.ok(r.ok);
    assert.ok(e.log.notes.includes("offline"));
  });

  await t("확인 요청이 네트워크 오류여도 포기하지 않고 계속 확인한다(reconnecting 안내)", async () => {
    const e = env({ start: () => netErr(), poll: (n) => (n < 4 ? netErr() : DONE) });
    const r = await requestAnalysis(e.opts);
    assert.ok(r.ok);
    assert.ok(e.log.notes.includes("reconnecting"));
  });

  await t("확인 요청이 429(과다 요청)여도 분석 실패로 보지 않고 계속 확인한다", async () => {
    const e = env({ start: () => netErr(), poll: (n) => (n < 3 ? json(429, { error: "확인 요청이 많아요." }) : DONE) });
    const r = await requestAnalysis(e.opts);
    assert.ok(r.ok, JSON.stringify(r));
  });

  await t("확정된 실패는 바로 보여 준다: 한도 초과(429)는 재시도 없이 종료", async () => {
    const e = env({ start: () => json(429, { error: "하루에 30번까지" }), poll: () => RUNNING });
    const r = await requestAnalysis(e.opts);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, "limit");
    assert.strictEqual(r.message, "하루에 30번까지");
    assert.strictEqual(r.retryable, false);
    assert.strictEqual(e.log.polls, 0);
  });

  await t("확정된 실패: 입력 오류(400)", async () => {
    const e = env({ start: () => json(400, { error: "선택과목을 모두 골라야 해요" }), poll: () => RUNNING });
    const r = await requestAnalysis(e.opts);
    assert.ok(!r.ok && r.code === "invalid");
  });

  await t("서버 내부 오류(500 status:error)는 그 안내를 그대로 전달", async () => {
    const e = env({ start: () => json(500, { status: "error", code: "internal", error: "서버 오류가 발생했습니다." }), poll: () => RUNNING });
    const r = await requestAnalysis(e.opts);
    assert.ok(!r.ok && r.code === "internal" && r.message === "서버 오류가 발생했습니다." && r.retryable);
  });

  await t("간이 분석(fallback:true)은 성공으로 전달하되 표시를 유지한다(화면이 저장하지 않도록)", async () => {
    const e = env({ start: () => json(200, { status: "done", analysis: ANALYSIS, result: RESULT, fallback: true }), poll: () => RUNNING });
    const r = await requestAnalysis(e.opts);
    assert.ok(r.ok && r.fallback === true);
    const e2 = env({ start: () => DONE, poll: () => RUNNING });
    assert.strictEqual((await requestAnalysis(e2.opts)).fallback, false);
  });

  await t("시작 요청 응답을 못 받은 뒤 확인했더니 직전 간이 분석 기록이 있으면 그걸 전달(startSettled 전송)", async () => {
    const e = env({
      start: () => netErr(),
      poll: (n, c) => (c.body.startSettled ? json(200, { status: "done", analysis: ANALYSIS, result: RESULT, fallback: true }) : RUNNING),
    });
    const r = await requestAnalysis(e.opts);
    assert.ok(r.ok && r.fallback === true);
    assert.ok(e.log.pollBodies.every((b) => b.poll === true && b.picks && b.deviceId));
  });

  await t("시작 요청이 아직 진행 중일 땐 startSettled=false로 보낸다(이전 실패와 혼동 방지)", async () => {
    const e = env({ start: (n, c) => c.hang(), poll: (n) => (n < 3 ? RUNNING : DONE) });
    await requestAnalysis(e.opts);
    assert.ok(e.log.pollBodies.every((b) => b.startSettled === false));
  });

  await t("서버가 계속 running이면 총 제한 시간 뒤 deadline(시간 초과 안내)", async () => {
    const e = env({ start: (n, c) => c.hang(), poll: () => RUNNING, timing: { total: 60000 } });
    const r = await requestAnalysis(e.opts);
    assert.ok(!r.ok && r.code === "deadline");
    assert.ok(/너무 오래/.test(r.message));
  });

  await t("사용자가 선택을 바꿔 중단하면(abort) 즉시 aborted로 끝난다", async () => {
    const ctl = new AbortController();
    const e = env({ start: (n, c) => c.hang(), poll: () => RUNNING });
    const origIdle = e.opts.idle;
    e.opts.idle = async (ms) => { await origIdle(ms); ctl.abort(); };
    const r = await requestAnalysis({ ...e.opts, signal: ctl.signal });
    assert.ok(!r.ok && r.code === "aborted");
  });

  await t("캐시된 결과(cached:true)도 정상 처리", async () => {
    const e = env({ start: () => json(200, { status: "done", analysis: ANALYSIS, result: RESULT, cached: true }), poll: () => RUNNING });
    const r = await requestAnalysis(e.opts);
    assert.ok(r.ok && r.cached === true);
  });

  await t("기본 타이밍 상수가 서버 제한(240초) 안에서 합리적이다", () => {
    assert.ok(TIMING.total > 240000 && TIMING.total <= 300000, "서버는 240초 안에 응답하고 함수 제한은 300초");
    assert.ok(TIMING.startTimeout >= TIMING.total);
    assert.ok(TIMING.pollEvery >= 2000 && TIMING.pollTimeout <= 20000 && TIMING.maxStarts >= 2);
  });

  if (fails.length) { console.error("FAIL\n" + fails.map((f) => " - " + f).join("\n")); process.exit(1); }
  console.log(`analysis client tests: ${pass}/${pass}`);
})();
