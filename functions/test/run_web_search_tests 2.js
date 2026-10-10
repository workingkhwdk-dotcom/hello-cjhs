// 웹 검색(Responses API web_search) 연동 검증.
// 실제 OpenAI를 호출하지 않는다. (1) 요청이 올바른 형태로 나가는지, (2) 가짜 응답을 받았을 때
// 출처 목록/확인 불가 안내/허용 외 링크 제거가 규칙대로 되는지를 본다.
const assert = require("assert");
const { callChat, setResponsesOutput } = require("./test_harness.js");
const { ALLOWED_DOMAINS, NO_SOURCE_NOTICE, isAllowedUrl, parseResponse, finalizeReply } = require("../web_search");
const { isUnanswered } = require("../unanswered");

let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "-", e.message); } }

const msg = (text, annotations = []) => ({ type: "message", content: [{ type: "output_text", text, annotations }] });
const search = () => ({ type: "web_search_call", status: "completed", action: { type: "search", query: "q" } });
const cite = (url, title) => ({ type: "url_citation", url, title, start_index: 0, end_index: 1 });
const Q = "2028학년도 수능 개편 내용 알려주세요";
let ipSeq = 0;
const chat = async (q = Q) => callChat(q, [], { "x-forwarded-for": `203.0.113.${++ipSeq}` });

(async () => {
  // ---- 요청 형태 ----
  await t("답변 호출은 /v1/responses로, web_search + allowed_domains + store:false", async () => {
    setResponsesOutput(null);
    const r = await chat();
    const b = r.responsesRequest;
    assert(b, "responses 요청이 나가지 않음");
    assert.deepStrictEqual(b.tools, [{ type: "web_search", filters: { allowed_domains: ALLOWED_DOMAINS } }]);
    assert.strictEqual(b.tool_choice, "auto");
    assert.strictEqual(b.store, false);
    assert.strictEqual(b.reasoning.effort, "low");
    assert(!("messages" in b) && !("max_completion_tokens" in b), "chat/completions 형식이 남아 있음");
  });
  await t("instructions에 웹 검색 규칙과 기존 확정 사실이 함께 들어감", async () => {
    const r = await chat();
    const ins = r.responsesRequest.instructions;
    assert(ins.includes("[웹 검색 사용 규칙]") && ins.includes("[확인된 학교 사실") && ins.includes("[확정된 3개년 교육과정"));
  });
  await t("input 마지막은 이번 사용자 메시지, history는 role 유지", async () => {
    setResponsesOutput(null);
    const hist = [{ role: "user", content: "안녕하세요" }, { role: "assistant", content: "안녕하세요!" }];
    const r = await callChat(Q, hist, { "x-forwarded-for": `203.0.113.${++ipSeq}` });
    const inp = r.responsesRequest.input;
    assert.deepStrictEqual(inp.map((m) => m.role), ["user", "assistant", "user"]);
    assert.strictEqual(inp[2].content, Q);
  });
  await t("허용 도메인 목록: 중복 없음, 프로토콜 미포함, 100개 이하", () => {
    assert(new Set(ALLOWED_DOMAINS).size === ALLOWED_DOMAINS.length);
    assert(ALLOWED_DOMAINS.every((d) => !/[:/]/.test(d)) && ALLOWED_DOMAINS.length <= 100);
  });

  // ---- 도메인 검사 ----
  await t("isAllowedUrl: 허용/하위도메인 통과, 유사 도메인·타 도메인·javascript 차단", () => {
    assert(isAllowedUrl("https://www.adiga.kr/x"));
    assert(isAllowedUrl("https://cwjungang-h.gne.go.kr/cwjungang-h/main.do"));
    assert(!isAllowedUrl("https://evil-adiga.kr/x"));
    assert(!isAllowedUrl("https://adiga.kr.evil.com/x"));
    assert(!isAllowedUrl("https://blog.naver.com/x"));
    assert(!isAllowedUrl("javascript:alert(1)"));
    assert(!isAllowedUrl("not a url"));
  });

  // ---- 통합: 검색 + 출처 ----
  await t("검색+허용 도메인 인용 → 본문 뒤에 '출처' 링크, utm 제거", async () => {
    setResponsesOutput([search(), msg("2028학년도부터 수능이 개편돼요.", [cite("https://www.suneung.re.kr/a?utm_source=openai", "수능 개편안")])]);
    const r = await chat();
    const reply = r.payload.reply;
    assert(reply.includes("**출처**") && reply.includes("[수능 개편안](https://www.suneung.re.kr/a)"), reply);
    assert(!reply.includes("utm_source"));
  });
  await t("검색+인용 0건 → 확인 불가 안내를 붙이고 미답변 기록 대상이 됨", async () => {
    setResponsesOutput([search(), msg("관련 내용을 찾지 못했어요.")]);
    const r = await chat();
    assert(r.payload.reply.endsWith(NO_SOURCE_NOTICE) && !r.payload.reply.includes("**출처**"));
    assert.strictEqual(isUnanswered({ message: Q, topScore: 0.9, reply: r.payload.reply }), true);
  });
  await t("검색+허용 외 도메인 인용만 → 출처에 안 나오고 확인 불가 안내", async () => {
    setResponsesOutput([search(), msg("블로그에 따르면...", [cite("https://blog.naver.com/abc", "블로그")])]);
    const r = await chat();
    assert(!r.payload.reply.includes("blog.naver.com") && r.payload.reply.includes(NO_SOURCE_NOTICE));
  });
  await t("검색 안 함 → 본문 그대로(출처·안내 없음)", async () => {
    setResponsesOutput([msg("야자는 월~목 18:30~21:00에 운영해요.")]);
    const r = await chat("야자 몇 시까지 해요?");
    assert.strictEqual(r.payload.reply, "야자는 월~목 18:30~21:00에 운영해요.");
  });
  await t("응답 본문이 비면 기존 실패 문구", async () => {
    setResponsesOutput([search()]);
    const r = await chat();
    assert.strictEqual(r.payload.reply, "죄송해요, 답변을 생성하지 못했어요.");
  });

  // ---- 순수 함수 ----
  await t("본문 속 허용 외 http 링크는 글자만 남기고, 허용 링크·상대경로는 유지", () => {
    const parsed = { searched: true, cites: [cite("https://www.adiga.kr/p", "어디가")], text:
      "[나쁜곳](https://evil.com/x) [어디가](https://www.adiga.kr/p?utm_source=openai) [신청](apply.html)" };
    const out = finalizeReply(parsed);
    assert(!out.includes("evil.com") && out.includes("나쁜곳"));
    assert(out.includes("[어디가](https://www.adiga.kr/p)") && out.includes("[신청](apply.html)"));
  });
  await t("출처: 중복 제거, 최대 5개, 제목 대괄호 제거, URL 괄호 인코딩", () => {
    const cites = [];
    for (let i = 0; i < 8; i++) cites.push(cite(`https://www.adiga.kr/p${i}`, `제목 [${i}]`));
    cites.push(cite("https://www.adiga.kr/p0", "중복"));
    cites.push(cite("https://www.adiga.kr/a_(b)", "괄호"));
    const out = finalizeReply({ searched: true, text: "본문", cites });
    const lines = out.split("\n").filter((l) => l.startsWith("- "));
    assert.strictEqual(lines.length, 5);
    assert(!lines.some((l) => l.includes("중복")), "중복 URL이 제거되지 않음");
    assert.strictEqual(lines[0], "- [제목 0](https://www.adiga.kr/p0)");
    const paren = finalizeReply({ searched: true, text: "본문", cites: [cite("https://www.adiga.kr/a_(b)", "괄호")] });
    assert(paren.includes("a_%28b%29"));
  });
  await t("parseResponse: 이상한 입력에도 예외 없이 빈 결과", () => {
    for (const bad of [null, {}, { output: null }, { output: [null, {}, { type: "message" }] }]) {
      const p = parseResponse(bad);
      assert.strictEqual(p.text, "");
      assert.strictEqual(p.searched, false);
    }
  });

  setResponsesOutput(null);
  console.log(`web search tests: ${pass}/${pass + fail}`);
  process.exit(fail ? 1 : 0);
})();
