// 내 커리큘럼 AI 분석 요청 하네스 — 휴대폰 네트워크가 중간에 끊겨도 서버가 끝낸 결과를 끝까지 받아 온다.
// 배경: 예전에는 하나의 긴 요청(30초~2분)을 붙잡고 기다려서, 화면 꺼짐·앱 전환·Wi-Fi↔LTE 전환 중에 연결이 끊기면
//       서버가 분석을 끝내도 "AI 서버에 연결하지 못했어요"로 끝났다. 이제는
//   1) 시작 요청을 보내 두고(끝까지 기다리는 요청), 동시에 짧은 확인 요청(poll)으로 결과를 가져온다.
//   2) 시작 요청이 끊기든 실패하든 "분석 실패"로 보지 않는다. 서버는 결과를 저장해 두므로 확인 요청으로 받는다.
//   3) 확인했는데 서버에 작업이 없으면(요청이 서버에 닿지 못한 경우) 시작 요청을 다시 보낸다(최대 3번).
//   4) 오프라인이거나 화면이 꺼져 있던 동안은 기다렸다가, 다시 켜지면 곧바로 확인한다.
//   5) 한도 초과·입력 오류·서버가 재시도 끝에 낸 실패 같은 "확정된 결과"만 오류로 돌려준다.
// 브라우저 전용 API는 모두 주입할 수 있어서 functions/test/run_analysis_client_tests.js가 Node에서 검증한다.

export const TIMING = {
  total: 290000, // 이 시간 안에 결과를 못 받으면 포기(서버는 240초 안에 반드시 응답하고 함수 제한은 300초)
  pollEvery: 4000, // 확인 간격
  firstPollAfter: 5000, // 시작 직후 첫 확인까지(서버가 작업을 등록할 시간)
  pollTimeout: 15000, // 확인 요청 하나의 상한
  startTimeout: 295000, // 시작 요청 하나의 상한(끊겨도 확인 요청이 이어받는다)
  maxStarts: 3,
};

const sleepReal = ms => new Promise(r => setTimeout(r, ms));

// 화면이 다시 보이거나 네트워크가 돌아오면 기다리던 것을 바로 깨운다(브라우저에서만 의미가 있다).
function idleReal(ms) {
  return new Promise(resolve => {
    const done = () => { clearTimeout(t); try { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("online", done); } catch (e) { /* 무시 */ } resolve(); };
    const onVis = () => { if (document.visibilityState === "visible") done(); };
    const t = setTimeout(done, ms);
    try { document.addEventListener("visibilitychange", onVis); window.addEventListener("online", done); } catch (e) { /* 무시 */ }
  });
}

const isOnlineReal = () => { try { return navigator.onLine !== false; } catch (e) { return true; } };

// 요청 하나. 결과는 항상 값으로 돌려준다(던지지 않는다): { net:true } | { status, data }
// outer가 중단되면(분석을 마쳤거나 사용자가 취소) 응답을 기다리던 요청도 바로 끊어 연결이 남지 않게 한다.
async function post(fetchFn, url, body, timeoutMs, outer) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  const onOuter = () => ctl.abort();
  if (outer) { if (outer.aborted) ctl.abort(); else outer.addEventListener("abort", onOuter, { once: true }); }
  const aborted = new Promise((_, reject) => ctl.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true }));
  aborted.catch(() => {}); // 요청이 먼저 끝나 아무도 기다리지 않아도 미처리 거부로 남지 않게
  try {
    const res = await Promise.race([fetchFn(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal }), aborted]);
    const data = await res.json().catch(() => null); // JSON이 아니면(게이트웨이 504 HTML 등) data=null
    return { status: res.status, data };
  } catch (err) {
    return { net: true, err };
  } finally {
    clearTimeout(timer);
    if (outer) outer.removeEventListener("abort", onOuter);
  }
}

// 이 응답이 "확정된 결과"인가? 확정이면 { final: true, result }, 아니면 { final: false }.
function classify(r, isPoll = false) {
  if (r.net) return { final: false };
  const { status, data } = r;
  if (data && data.status === "done" && data.analysis) return { final: true, result: { ok: true, analysis: data.analysis, result: data.result, cached: !!data.cached, fallback: !!data.fallback } };
  if (data && data.status === "error" && data.error) return { final: true, result: { ok: false, code: data.code || "error", message: data.error, retryable: true } };
  if (isPoll && status === 429) return { final: false }; // 확인 요청이 잠깐 몰린 것 — 분석 한도와 다르니 계속 확인한다
  if (status >= 400 && status < 500 && data && data.error) return { final: true, result: { ok: false, code: status === 429 ? "limit" : "invalid", message: data.error, retryable: false } };
  return { final: false }; // 5xx·HTML·빈 응답·running·none → 아직 모른다
}

/**
 * @param {object} o
 * @param {string} o.url  @param {object} o.picks  @param {string} o.deviceId
 * @param {(note:string)=>void} [o.onStatus] 화면 안내용: "", "reconnecting", "offline"
 * @param {AbortSignal} [o.signal] 사용자가 선택을 바꿨거나 탭을 옮겼을 때 중단
 * @returns {Promise<{ok:true, analysis:object, result?:object, cached?:boolean, fallback?:boolean} | {ok:false, code:string, message:string, retryable:boolean}>}
 */
export async function requestAnalysis(opts) {
  // 끝나면(성공·실패 무엇이든) 아직 응답을 기다리는 시작 요청의 연결을 정리한다.
  const life = new AbortController();
  const outer = opts.signal;
  const link = () => life.abort();
  if (outer) { if (outer.aborted) life.abort(); else outer.addEventListener("abort", link, { once: true }); }
  try { return await run({ ...opts, signal: life.signal, outerSignal: outer }); }
  finally { life.abort(); if (outer) outer.removeEventListener("abort", link); }
}

async function run({ url, picks, deviceId, onStatus = () => {}, signal, outerSignal, fetchFn = (...a) => fetch(...a), sleep = sleepReal, idle = idleReal, now = Date.now, isOnline = isOnlineReal, timing = TIMING }) {
  const t0 = now();
  const startBody = { picks, deviceId }, pollBody = { picks, deviceId, poll: true };
  let starts = 0, startOutcome = null, startInFlight = null;
  const launchStart = () => {
    starts++;
    startOutcome = null;
    startInFlight = post(fetchFn, url, startBody, timing.startTimeout, signal).then(r => { startOutcome = { raw: r, c: classify(r) }; return startOutcome; });
  };
  const aborted = () => outerSignal && outerSignal.aborted;
  const fail = (code, message, retryable = true) => ({ ok: false, code, message, retryable });
  const NET_MSG = "인터넷 연결이 계속 불안정해서 결과를 받아 오지 못했어요. 연결을 확인하고 '다시 시도'를 눌러 주세요. (분석이 끝났다면 같은 선택으로 다시 누를 때 바로 보여 드려요)";
  const TIME_MSG = "분석이 너무 오래 걸려서 멈췄어요. 잠시 뒤에 '다시 시도'를 눌러 주세요.";

  if (!isOnline()) onStatus("offline");
  launchStart();
  let firstWait = true;
  while (now() - t0 < timing.total) {
    if (aborted()) return fail("aborted", "", false);
    // 시작 요청이 진행 중이면 그 끝남을, 아니면 확인 간격을 기다린다(시작 요청이 이미 실패로 끝났다면 기다리지 않고 도는 일이 없게 한다).
    const waitMs = firstWait ? timing.firstPollAfter : timing.pollEvery;
    firstWait = false;
    await (startOutcome === null ? Promise.race([startInFlight, idle(waitMs)]) : idle(waitMs));
    if (aborted()) return fail("aborted", "", false);
    if (startOutcome && startOutcome.c.final) return startOutcome.c.result;

    if (!isOnline()) { onStatus("offline"); continue; }
    // startSettled: 시작 요청이 이미 끝났는데 답을 못 받았다는 뜻. 서버는 이때만 "직전 실패 기록"을 알려 준다(새 분석을 이전 실패로 오인하지 않도록).
    const p = await post(fetchFn, url, { ...pollBody, startSettled: startOutcome !== null }, timing.pollTimeout, signal);
    if (aborted()) return fail("aborted", "", false);
    const pc = classify(p, true);
    if (pc.final) return pc.result;
    if (p.net) { onStatus("reconnecting"); continue; }
    onStatus("");
    // 확인 결과 "작업 없음"이고 시작 요청도 이미 끝났다면 요청이 서버에 닿지 못한 것 → 다시 시작
    if (p.data && p.data.status === "none" && startOutcome !== null && starts < timing.maxStarts) launchStart();
  }
  const sawNetTrouble = starts > 1 || (startOutcome !== null && startOutcome.raw.net);
  return fail("deadline", sawNetTrouble ? NET_MSG : TIME_MSG);
}
