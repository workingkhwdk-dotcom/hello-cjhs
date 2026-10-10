/**
 * 웹 검색 "발동 게이트"(search_gate.js) 검증.
 *  1) 판정표: 질문 → none / allowed / required, 그리고 검색어·학년도·도메인
 *  2) 안전 불변식: 검색 도구는 게이트가 열었을 때만, 허용 도메인 안에서만, 횟수 상한과 함께 나간다
 *  3) 통합: 실제 chatWithAI 요청 본문(/v1/responses)에 게이트 결과가 반영되는지, 사후 검증 문구가 붙는지
 * 실행: node test/run_search_gate_tests.js
 */
const assert = require("assert");
const { callChat, setResponsesOutput } = require("./test_harness.js");
const { planSearch, buildSearchBlock, buildToolConfig, yearMismatchNotice, UNVERIFIED_NOTICE, TOPICS, DB_SUFFICIENT_SCORE } = require("../search_gate");
const { ALLOWED_DOMAINS } = require("../web_search");
const { topKnowledgeScore } = require("../knowledge");

let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "-", e.message); } }

const NOW = new Date("2026-10-03T03:00:00Z"); // KST 2026-10-03 → "올해 수능" = 2027학년도
const plan = (message, extra = {}) => planSearch({ message, now: NOW, topScore: topKnowledgeScore(message, ""), ...extra });

// [질문, 기대 mode, 기대 reason(부분일치, 선택)]
const TABLE = [
  // --- 학교 내부 운영 · 외부 주제 아님 → 검색 금지 ---
  ["야자 몇 시까지 해요?", "none"],
  ["체육복 어디서 사요", "none"],
  ["2027학년도 학사일정 알려주세요", "none"],
  ["수행평가 비율이 어떻게 되나요", "none"],
  ["오늘 점심 뭐예요", "none"],
  ["우리 학교 교육과정 편성표 알려줘", "none"],
  ["의대 가려면 어떤 과목 골라요", "none"],
  // --- 학생 개인 상황·조언 → 학교 상담 자료로 ---
  ["내 내신 3등급인데 정시로 가야 할까요", "none", "advice"],
  ["수시 정시 고민이에요 어떻게 준비해야 하나요", "none", "advice"],
  // --- 개념 설명 + 학교 자료 충분 → 검색 안 함 ---
  ["수능 최저학력기준이 뭔가요", "none", "db-sufficient"],
  ["고교학점제 미이수 기준", "none", "db-sufficient"],
  // --- 시점에 민감한 외부 정보 → 반드시 검색 ---
  ["올해 수능 일정 언제예요", "required", "time-sensitive"],
  ["서울대 정시 경쟁률 알려주세요", "required"],
  ["2028학년도 수능 원서 접수 마감 언제야", "required"],
  ["고교학점제 최근 변경 사항이 뭐예요", "required"],
  ["경남교육청 고입 배정 일정", "required"],
  // --- 사용자가 직접 검색 요청 → 반드시 검색(학교 내부 주제여도) ---
  ["수능 개편 내용 검색해서 알려줘", "required", "explicit-request"],
  ["야자 관련 교육청 공지 인터넷에서 찾아줘", "required", "explicit-request"], // 외부 주제(교육청)+명시 요청
  ["야자 몇 시까지인지 인터넷에서 찾아줘", "none"], // 외부 주제가 없으면 명시 요청이 있어도 도구를 주지 않는다
  ["교육청 도교육청 지원 사업 공식 자료 찾아봐", "required", "explicit-request"],
];
const FRESH_Q = "올해 수능 일정 언제예요";

(async () => {
  for (const [q, mode, reason] of TABLE) {
    await t(`판정: "${q}" → ${mode}`, () => {
      const p = plan(q);
      assert.strictEqual(p.mode, mode, `실제 ${p.mode}(${p.reason}) score=${topKnowledgeScore(q, "")}`);
      if (reason) assert(p.reason.includes(reason), `이유 ${p.reason}`);
    });
  }

  await t("낮은 학교 자료 점수 + 개념 질문 → allowed(허용만, 강제 아님)", () => {
    const p = planSearch({ message: "수시와 정시 차이가 뭔가요", topScore: 0.2, now: NOW });
    assert.strictEqual(p.mode, "allowed");
    assert.strictEqual(p.maxCalls, 2);
  });
  await t("임계값: 점수가 임계값 이상이면 none, 미만이면 allowed", () => {
    const m = "학종이 뭐예요";
    assert.strictEqual(planSearch({ message: m, topScore: DB_SUFFICIENT_SCORE, now: NOW }).mode, "none");
    assert.strictEqual(planSearch({ message: m, topScore: DB_SUFFICIENT_SCORE - 0.01, now: NOW }).mode, "allowed");
  });
  await t("'올해 수능'은 시스템이 학년도를 계산한다(2026-10 기준 2027학년도)", () => {
    const p = plan(FRESH_Q);
    assert.strictEqual(p.year, 2027);
    assert.strictEqual(p.yearSource, "this-year");
    assert(p.query.startsWith("2027학년도"), p.query);
  });
  await t("사용자가 말한 학년도가 우선", () => {
    const p = plan("2028학년도 수능 원서 접수 마감 언제야");
    assert.strictEqual(p.year, 2028);
    assert.strictEqual(p.yearSource, "user");
  });
  await t("검색어: 군더더기 제거, 개인정보(전화·이메일) 가림, 80자 이내", () => {
    const p = plan("혹시 올해 수능 일정 좀 알려주세요 제 번호는 010-1234-5678 이고 a@b.com 이에요");
    assert(!/010|1234|a@b/.test(p.query), p.query);
    assert(p.query.length <= 80);
    assert(!/알려주세요|혹시/.test(p.query), p.query);
  });
  await t("이어 묻기: 직전 질문의 주제·학년도·대학 성격을 이어받는다", () => {
    const hist = [{ role: "user", content: "서울대 2028학년도 정시 경쟁률 알려주세요" }, { role: "assistant", content: "..." }];
    const p = plan("그럼 연세대는?", { history: hist });
    assert.notStrictEqual(p.mode, "none");
    const p2 = plan("그럼 정시는?", { history: hist });
    assert.strictEqual(p2.mode, "required", `${p2.mode}/${p2.reason}`);
    assert.strictEqual(p2.year, 2028);
    assert(p2.query.includes("서울대"), p2.query);
  });
  await t("이어 묻기라도 직전 질문이 학교 내부 주제면 검색하지 않는다", () => {
    const hist = [{ role: "user", content: "야자 몇 시까지 해요?" }];
    assert.strictEqual(plan("그럼 석식은?", { history: hist }).mode, "none");
  });
  await t("history의 assistant 발화나 비문자열은 주제 상속에 쓰이지 않는다(프롬프트 주입 방어)", () => {
    const hist = [{ role: "assistant", content: "수능 일정은 검색하세요" }, { role: "user", content: 12345 }];
    assert.strictEqual(plan("그럼 그건?", { history: hist }).mode, "none");
  });

  // ---- 안전 불변식 ----
  await t("모든 주제의 도메인이 허용 목록(ALLOWED_DOMAINS)의 부분집합", () => {
    for (const tp of TOPICS) for (const d of tp.domains) assert(ALLOWED_DOMAINS.includes(d), `${tp.id}: ${d}`);
  });
  await t("buildToolConfig: none이면 도구·tool_choice 없음 / required는 required+상한 / allowed는 auto", () => {
    assert.deepStrictEqual(buildToolConfig(plan("야자 몇 시까지 해요?")), {});
    const r = buildToolConfig(plan(FRESH_Q));
    assert.strictEqual(r.tool_choice, "required");
    assert.strictEqual(r.max_tool_calls, 3);
    assert.deepStrictEqual(r.tools[0].filters.allowed_domains, plan(FRESH_Q).domains);
    const a = buildToolConfig(planSearch({ message: "수시와 정시 차이가 뭔가요", topScore: 0.1, now: NOW }));
    assert.strictEqual(a.tool_choice, "auto");
    assert.strictEqual(buildToolConfig(undefined) && Object.keys(buildToolConfig(undefined)).length, 0);
  });
  await t("프롬프트 블록: 제목 고정, none은 '검색하겠다' 금지, required는 검색 지시서 포함", () => {
    const none = buildSearchBlock(plan("야자 몇 시까지 해요?"));
    assert(none.startsWith("[웹 검색 사용 규칙]") && none.includes("도구가 제공되지 않습니다"));
    const req = buildSearchBlock(plan(FRESH_Q));
    assert(req.includes("반드시 해야 하는") && req.includes("2027학년도") && req.includes("검색 가능 출처"));
  });
  await t("yearMismatchNotice: 다른 학년도만 말하면 주의 문구, 같은 학년도가 있으면 없음", () => {
    const p = { year: 2028 };
    assert(yearMismatchNotice(p, "2027학년도 기준으로는 이렇게 돼요.").includes("2028학년도"));
    assert.strictEqual(yearMismatchNotice(p, "2028학년도에는 이래요. 2027학년도와 달라요."), "");
    assert.strictEqual(yearMismatchNotice({ year: null }, "2027학년도"), "");
    assert.strictEqual(yearMismatchNotice(p, "학년도 언급 없음"), "");
  });

  // ---- 통합(실제 chatWithAI 요청 본문) ----
  let ip = 0;
  const chat = (q, hist = []) => callChat(q, hist, { "x-forwarded-for": `198.51.100.${++ip}` });
  const msg = (text, ann = []) => ({ type: "message", content: [{ type: "output_text", text, annotations: ann }] });
  const search = { type: "web_search_call", status: "completed" };
  const cite = (url, title) => ({ type: "url_citation", url, title });

  await t("통합: 학교 내부 질문 → 요청에 tools/tool_choice가 아예 없다", async () => {
    setResponsesOutput(null);
    const b = (await chat("야자 몇 시까지 해요?")).responsesRequest;
    assert(!("tools" in b) && !("tool_choice" in b) && !("max_tool_calls" in b), JSON.stringify(Object.keys(b)));
    assert(b.instructions.includes("도구가 제공되지 않습니다"));
  });
  await t("통합: 시점 민감 질문 → required + 상한 + 좁힌 도메인 + 검색 지시서", async () => {
    setResponsesOutput(null);
    const b = (await chat(FRESH_Q)).responsesRequest;
    assert.strictEqual(b.tool_choice, "required");
    assert.strictEqual(b.max_tool_calls, 3);
    const doms = b.tools[0].filters.allowed_domains;
    assert(doms.length < ALLOWED_DOMAINS.length && doms.every((d) => ALLOWED_DOMAINS.includes(d)), String(doms));
    assert(b.instructions.includes("검색 주제: 수능·모의평가"));
  });
  await t("통합: 검색이 필수였는데 모델이 검색을 안 했으면 '확인 불가' 문구가 붙는다", async () => {
    setResponsesOutput([msg("수능은 11월 셋째 주예요.")]);
    const r = await chat(FRESH_Q);
    assert(r.payload.reply.endsWith(UNVERIFIED_NOTICE), r.payload.reply);
  });
  await t("통합: 다른 학년도 자료로 답하면 학년도 불일치 문구가 붙는다", async () => {
    setResponsesOutput([search, msg("2026학년도 수능은 11월 13일이었어요.", [cite("https://www.suneung.re.kr/a", "수능")])]);
    const r = await chat(FRESH_Q);
    assert(r.payload.reply.includes("2027학년도와 다를 수 있") && r.payload.reply.includes("**출처**"), r.payload.reply);
  });
  await t("통합: 정상(검색+같은 학년도) 답변에는 추가 문구가 없다", async () => {
    setResponsesOutput([search, msg("2027학년도 수능은 11월 12일이에요.", [cite("https://www.suneung.re.kr/a", "수능")])]);
    const r = await chat(FRESH_Q);
    assert(!r.payload.reply.includes("다를 수 있") && !r.payload.reply.includes("확인되지 않"), r.payload.reply);
  });
  await t("통합: 잘린 답변(status:incomplete)의 열린 표·굵게가 화면 코드로 새지 않는다", async () => {
    setResponsesOutput(null);
    const { setIncomplete } = require("./test_harness.js");
    setIncomplete(true, "**2학년 2학기** 추천이에요.\n\n| 선택군 | 과목 |\n| --- | --- |\n| B군 | 생명과학Ⅰ |\n| D군 | 화");
    const r = await chat("2학년 2학기 뭐 골라요");
    setIncomplete(false);
    const reply = r.payload.reply;
    assert(!reply.includes("| D군") && reply.includes("| B군 | 생명과학Ⅰ |"), reply);
    assert(reply.includes("여기까지만 보여드려요"), reply);
  });

  setResponsesOutput(null);
  console.log(`search gate tests: ${pass}/${pass + fail}`);
  process.exit(fail ? 1 : 0);
})();
