/**
 * 2026-10-04 신뢰도 개편 검증: 학교 사실 DB · 생활규정 DB · 환각 방지 로직 · 웹 검색 폴백.
 * 실제 OpenAI를 부르지 않는다(test_harness.js의 가짜 응답). 모델이 무엇을 "받는지"와, 모델이 틀린 답을 "해도" 서버가 어떻게 막는지를 본다.
 * 실행: node test/run_school_facts_tests.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { callChat, setResponsesOutput } = require("./test_harness.js");
const { retrieveKnowledge, KNOWLEDGE, topKnowledgeScore } = require("../knowledge");
const { planSearch, buildToolConfig, buildSearchBlock, SCHOOL_TOPIC } = require("../search_gate");
const { ALLOWED_DOMAINS, SEARCHED_NOTICE } = require("../web_search");
const { enforceSchoolFacts } = require("../fact_guard");

let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "-", e.message); } }
const NOW = new Date("2026-10-04T03:00:00Z");
const plan = (message, extra = {}) => planSearch({ message, now: NOW, topScore: topKnowledgeScore(message, ""), ...extra });
const ids = (q) => retrieveKnowledge(q, "", 6).map((r) => r.id);
let ip = 0;
const chat = (q, hist = []) => callChat(q, hist, { "x-forwarded-for": `192.0.2.${++ip}` });
const msg = (text, ann = []) => ({ type: "message", content: [{ type: "output_text", text, annotations: ann }] });
const search = { type: "web_search_call", status: "completed" };
const cite = (url, title) => ({ type: "url_citation", url, title });

(async () => {
  // ================= 1) 데이터 무결성 =================
  const reg = JSON.parse(fs.readFileSync(path.join(__dirname, "../knowledge_regulation.json"), "utf8"));
  const ver = JSON.parse(fs.readFileSync(path.join(__dirname, "../knowledge_verified.json"), "utf8"));
  await t("전체 지식 DB의 id가 중복되지 않는다", () => {
    const seen = new Set();
    for (const r of KNOWLEDGE) { assert(!seen.has(r.id), `중복 ${r.id}`); seen.add(r.id); }
  });
  await t("규정·사실 DB 모든 레코드에 id/title/tags/retrieval_text와 근거(출처)가 있다", () => {
    for (const r of [...reg, ...ver]) {
      assert(r.id && r.title && Array.isArray(r.tags) && r.retrieval_text, r.id);
      assert(r.retrieval_text.includes("근거:"), `${r.id} 근거 없음`);
    }
    for (const r of ver) assert(r.sources && r.sources.length && r.verified_at, `${r.id} 출처/확인일 없음`);
  });
  await t("징계기준표 29개 항이 모두 있고 각 항에 적용 징계가 1개 이상 표시된다", () => {
    for (let n = 1; n <= 29; n++) {
      const r = reg.find((x) => x.id === `RG-D-TBL-${n}`);
      assert(r, `표 ${n}항 없음`);
      assert(/적용 가능 징계: [가-힣]+/.test(r.retrieval_text), `${n}항 징계 표시 없음`);
    }
  });
  await t("PDF 좌표로 확인한 징계표 값 대조(○ 위치)", () => {
    const pen = (n) => (reg.find((x) => x.id === `RG-D-TBL-${n}`).retrieval_text.match(/적용 가능 징계: ([^.\n]+)\./) || [])[1];
    assert.strictEqual(pen(2), "교내봉사 / 사회봉사");
    assert.strictEqual(pen(20), "출석정지 / 퇴학");
    assert.strictEqual(pen(27), "출석정지 / 퇴학");
    assert.strictEqual(pen(10), "사회봉사 / 특별교육 / 출석정지 / 퇴학");
    assert.strictEqual(pen(19), "교내봉사 / 사회봉사 / 특별교육");
    assert.strictEqual(pen(26), "사회봉사 / 특별교육 / 출석정지 / 퇴학");
    assert.strictEqual(pen(1), "교내봉사 / 사회봉사 / 특별교육");
  });
  await t("흡연·음주 단계 기준 원문 그대로(1회 교내봉사 10시간 … 5회 출석정지 10일 또는 퇴학)", () => {
    const s = reg.find((x) => x.id === "RG-D-TBL-25").retrieval_text;
    for (const k of ["1회 적발 – 교내봉사(10시간)", "2회 – 사회봉사(30시간 이내)", "3회 – 특별교육(30시간 이내)", "4회 – 출석정지 5일", "5회 – 출석정지 10일 또는 퇴학", "3년간 누적"]) assert(s.includes(k), k);
    const w = reg.find((x) => x.id === "RG-D-TBL-26").retrieval_text;
    for (const k of ["1회 적발 – 사회봉사(30시간)", "3회 – 출석정지 10일", "4회 – 출석정지 10일 또는 퇴학"]) assert(w.includes(k), k);
  });
  await t("'쉬운 설명'에 쓴 숫자는 모두 같은 조문 원문에 있다(요약이 숫자를 바꾸지 않았는지)", () => {
    for (const r of reg) {
      const m = r.retrieval_text.match(/\[쉬운 설명\] ([\s\S]*?)\n\[규정 원문\] ([\s\S]*?)\n근거:/);
      if (!m) continue;
      const nums = m[1].match(/\d+/g) || [];
      for (const n of nums) assert(m[2].includes(n), `${r.id}: 요약의 숫자 ${n}이 원문에 없음`);
    }
  });
  await t("남학교 사실이 DB에 명시돼 있고 학교알리미 출처가 있다", () => {
    const v = ver.find((x) => x.id === "VF01");
    assert(v.retrieval_text.includes("남자 고등학교") && v.retrieval_text.includes("남 548명·여 0명"));
    assert(v.sources.some((s) => s.url.includes("schoolinfo.go.kr")));
  });
  await t("확인되지 않은 수학여행 목적지를 사실처럼 쓴 레코드가 없다(비공식 표시 필수)", () => {
    const v = ver.find((x) => x.id === "VF05").retrieval_text;
    assert(v.includes("확인되지 않은 것") && v.includes("비공식") && v.includes("사실처럼 말하지 마세요"));
  });
  await t("수학여행 확인 사실(2024~26 일본, 오카야마 교류 2024·25, 2027 국내·90% 동의 미충족)이 VF05에 정확히 있다", () => {
    const v = ver.find((x) => x.id === "VF05").retrieval_text;
    for (const k of ["2024년·2025년·2026년 수학여행은 일본", "2024년과 2025년에는 일본 오카야마 다이안지중등학교와 국제 교류", "학생 및 학부모 90% 동의", "2027학년도에는", "국내로 실시할 예정"]) assert(v.includes(k), k);
    assert(!/제주도로 (간|갑)/.test(v));
  });
  await t("수면 레코드(VF10): 권고 8~10시간과 한국 평균 약 6시간·출처를 함께 담고 '8~10시간 자라'로 끝내지 말라고 적혀 있다", () => {
    const v = ver.find((x) => x.id === "VF10");
    assert(v.retrieval_text.includes("8~10시간") && v.retrieval_text.includes("약 6시간") && v.retrieval_text.includes("2,761명") && v.retrieval_text.includes("5.9시간"));
    assert(v.retrieval_text.includes("'8~10시간 주무세요'를 답의 중심에 두지 마세요") && v.retrieval_text.includes("입시"));
    assert(v.sources.length >= 2 && !v.retrieval_text.includes("창원중앙고 전용"));
  });

  // ================= 2) 검색(retrieval) =================
  const must = [
    ["창원중앙고는 남녀공학인가요?", "VF01"], ["여학생도 있나요", "VF01"], ["우리 학교 남고에요?", "VF01"],
    ["수학여행 어디로 가요", "VF05"], ["휴대폰 쉬는시간에 써도 돼요?", "RG-L-3-12"], ["머리 염색해도 되나요", "RG-L-4-13"],
    ["후드티 입고 등교해도 돼요", "RG-L-4-14"], ["시험날 사복 입어도 되나요", "RG-L-4-14"], ["담배 걸리면 어떻게 돼요", "RG-D-TBL-25"],
    ["무단결석 6일이면 어떻게 돼요", "RG-D-TBL-23"], ["소지품 검사 마음대로 해요?", "RG-L-8-31"], ["전동킥보드 타고 등교해도 돼요?", "RG-D-TBL-11"],
    ["컨닝하면 어떻게 돼요", "RG-D-TBL-21"], ["고입 원서 접수 언제", "VF08"], ["핸드볼부 소식", "VF06"], ["폰 뺏기면 언제 돌려받아요", "RG-L-TBL-SEIZE"],
    ["수학여행 해외 가나요", "VF05"], ["일본 수학여행 가요?", "VF05"], ["고등학생 잠 몇 시간 자야 해요", "VF10"], ["적정 수면시간", "VF10"],
  ];
  for (const [q, id] of must) await t(`검색: "${q}" → ${id}`, () => assert(ids(q).includes(id), ids(q).join(",")));

  // ================= 3) 프롬프트(모델이 받는 것) =================
  await t("모든 질문의 시스템 프롬프트 맨 앞 사실에 '남자 고등학교'와 '남녀공학 금지'가 들어간다", async () => {
    for (const q of ["급식은 어때요", "학교 분위기 어때요"]) {
      const ins = (await chat(q)).responsesRequest.instructions;
      assert(ins.includes("남자 고등학교(남학교)") && ins.includes("남녀공학"), q);
    }
  });
  await t("교무실로 떠넘기는 기본 응대를 금지하는 규칙이 있고, 검색→확인불가→마지막 연락처 순서가 적혀 있다", async () => {
    const ins = (await chat("급식은 어때요")).responsesRequest.instructions;
    assert(ins.includes("교무실에 문의하세요") && ins.includes("먼저 검색해 확인하세요") && ins.includes("마지막으로"));
  });
  await t("규정 질문: 검색된 규정 조문(RG-)이 프롬프트에 들어가고 원문 수치 보존 규칙이 있다", async () => {
    const ins = (await chat("휴대폰 쉬는시간에 써도 돼요?")).responsesRequest.instructions;
    assert(ins.includes("[RG-L-3-12]") && ins.includes("쉬는시간과 점심시간은 학생의 타당한 사용 요구"));
    assert(ins.includes("수치·조건·예외"));
  });
  await t("확인되지 않은 옛 설명이 남아 있지 않다(성적대 배정, 봄·가을·겨울 체육복 불가)", async () => {
    const ins = (await chat("체육복 등교 가능해요?")).responsesRequest.instructions;
    assert(!ins.includes("동일 성적대") && !ins.includes("같은 성적대에서"));
    assert(!ins.includes("봄·가을·겨울에는 체육복 등하교가 허용되지 않습니다") && !ins.includes("봄·가을·겨울에는 불가합니다"));
  });

  await t("수학여행 질문 프롬프트에 확인 사실이 들어가고 제주·한라산을 사실로 말하라는 문구는 없다", async () => {
    const ins = (await chat("수학여행 어디로 가요?")).responsesRequest.instructions;
    assert(ins.includes("오카야마 다이안지중등학교") && ins.includes("90% 동의") && ins.includes("국내로 실시"));
    assert(!/제주도로 (간|갑)/.test(ins));
  });
  await t("현실성 원칙(입시 현실 기준, 우선순위 제시, 장단점 균형)이 항상 프롬프트에 있다", async () => {
    const ins = (await chat("급식은 어때요")).responsesRequest.instructions;
    assert(ins.includes("7. 현실성 원칙(대한민국 입시 현실 기준)") && ins.includes("한국 고등학생의 실제 수준") && ins.includes("우선순위"));
  });
  await t("수면 질문: 검색 도구 없이(none) 답하고, 프롬프트에 VF10(권고+평균 6시간)이 실린다", async () => {
    const r = await chat("고등학생 잠 몇 시간 자야 해요?");
    assert(!r.responsesRequest.tools || !r.responsesRequest.tools.length || !JSON.stringify(r.responsesRequest.tools).includes("web_search"));
    assert(r.responsesRequest.instructions.includes("[VF10]") && r.responsesRequest.instructions.includes("약 6시간"));
  });

  await t("근거 없는 홍보 문구('명문', '우수한 학생들이 모여')가 학교 소개 지식·프롬프트 예시에 남아 있지 않다", async () => {
    const fp = KNOWLEDGE.find((r) => r.id === "FP48").retrieval_text;
    assert(fp.includes("쓰지 마세요") && !/명문 고등학교로 손꼽|우수한 학생들이 모여 면학/.test(fp));
    const ins = (await chat("우리 학교 장점이 뭐예요")).responsesRequest.instructions;
    assert(!ins.includes("명문 고등학교로 손꼽히고") && ins.includes("현실도 함께"));
  });

  // ---- 입시 현실(2026-10-04 3차) ----
  const rl = JSON.parse(fs.readFileSync(path.join(__dirname, "../knowledge_reality.json"), "utf8"));
  await t("입시 현실 레코드: 6건, 출처와 확인일이 있고 답변 지침이 있다", () => {
    assert.strictEqual(rl.length, 6);
    for (const r of rl) { assert(r.sources.length && r.verified_at && r.retrieval_text.includes("근거:") && r.retrieval_text.includes("답변 지침"), r.id); }
  });
  await t("입시 현실 수치가 출처 확인값과 같다(수시 80.8·정시 19.2, 5등급 10/24/32/24/10, 사교육 63.0%·6.6시간·79만 3천 원)", () => {
    const g = (id) => rl.find((r) => r.id === id).retrieval_text;
    for (const k of ["348,789명", "281,895명(80.8%)", "66,894명(19.2%)", "41%에서 34%"]) assert(g("RL01").includes(k), k);
    for (const k of ["1등급 10%", "2등급 24%(누적 34%)", "3등급 32%(누적 66%)", "4등급 24%(누적 90%)", "5등급 10%"]) assert(g("RL02").includes(k), k);
    for (const k of ["63.0%", "6.6시간", "79만 3천 원"]) assert(g("RL03").includes(k), k);
    assert(g("RL04").includes("통계가 아니라 상담 제안"));
  });
  const real = [
    ["학원 꼭 다녀야 하나요", "RL03"], ["내신 5등급 비율이 어떻게 돼요", "RL02"], ["정시만 하려는데 내신 버려도 돼요", "RL06"],
    ["입학 전 선행 얼마나 해야 해요", "RL04"], ["하루에 몇 시간 공부해야 해요", "RL05"], ["수시 정시 비율이 어떻게 돼요", "RL01"], ["첫 시험 망치면 어떻게 돼요", "RL02"],
  ];
  for (const [q, id] of real) await t(`입시 현실 검색: "${q}" → ${id}`, () => assert(ids(q).includes(id), ids(q).join(",")));
  await t("과장·단정 표현이 지식과 프롬프트에서 사라졌다(공통점 단정, 치명적, 더 유리할 수 있습니다)", async () => {
    const by = (id) => KNOWLEDGE.find((r) => r.id === id).retrieval_text;
    assert(!by("FP02").includes("공통점은") && by("FP02").includes("63%"));
    assert(!by("FP14").includes("더 유리할 수 있습니다") && !by("FP20").includes("치명적"));
    assert(by("FP27").includes("가볍게 볼 수는 없습니다"));
    const ins = (await chat("학원 다녀야 하나요")).responsesRequest.instructions;
    assert(!ins.includes("치명적일 수") && !ins.includes("공통점은 자기주도") && ins.includes("[RL03]") && ins.includes("오래된 수상·수석·지정 이력"));
  });

  // ================= 4) 검색 게이트 =================
  const gate = [
    ["수학여행 어디로 가요?", "none", "school-db-sufficient"],
    ["수학여행 해외 가나요", "none", "school-db-sufficient"],
    ["수학여행 비용 얼마예요", "required", "school-event"],
    ["2학년 수학여행 언제 가요", "required", "school-event"],
    ["우리 학교 최근 뉴스 있어요?", "required", "school-event"],
    ["체육대회 언제 해요", "required", "school-event"],
    ["야자 몇 시까지 해요?", "none"],
    ["휴대폰 쉬는시간에 써도 돼요?", "none"],
    ["2027학년도 학사일정 알려주세요", "none"],
    ["2027학년도 수학여행 일정은 학사일정에 있나요", "none"], // '학사일정' = 확정 전 항목
  ];
  for (const [q, mode, reason] of gate) await t(`게이트: "${q}" → ${mode}`, () => {
    const p = plan(q);
    assert.strictEqual(p.mode, mode, `${p.mode}(${p.reason}) score=${topKnowledgeScore(q, "")}`);
    if (reason) assert(p.reason.includes(reason), p.reason);
  });
  await t("학교 자료에 없는 학교 질문(점수 낮음)은 검색 허용(allowed), 개인 조언은 제외", () => {
    const p = planSearch({ message: "우리 학교 교장 선생님 성함이 뭐예요", topScore: 0.1, now: NOW });
    assert.strictEqual(p.mode, "allowed"); assert.strictEqual(p.reason, "school-weak-db");
    assert.strictEqual(planSearch({ message: "우리 학교 가면 내 성적으로 어떻게 해야 할까요", topScore: 0.1, now: NOW }).mode, "none");
    assert.strictEqual(planSearch({ message: "안녕", topScore: 0, now: NOW }).mode, "none");
  });
  await t("학교 검색 도구: 도메인은 허용 목록의 부분집합이며 위키·블로그·커뮤니티는 없다", () => {
    const cfg = buildToolConfig(plan("수학여행 비용 얼마예요?"));
    assert.strictEqual(cfg.tool_choice, "required");
    const doms = cfg.tools[0].filters.allowed_domains;
    assert(doms.every((d) => ALLOWED_DOMAINS.includes(d)));
    assert(doms.includes("gne.go.kr") && doms.includes("schoolinfo.go.kr") && doms.some((d) => /idomin|knnews/.test(d)));
    assert(!doms.some((d) => /namu|blog|cafe|tistory|facebook|wikipedia/.test(d)));
    assert(SCHOOL_TOPIC.domains.length <= 20);
  });
  await t("학교 검색 지시서에 '다른 학교 구별'과 '연도 밝히기'가 들어간다", () => {
    const b = buildSearchBlock(plan("수학여행 비용 얼마예요?"));
    assert(b.includes("창원중앙여자고등학교") && b.includes("연도"));
  });

  // ================= 5) 통합: 모델이 틀려도 서버가 막는다 =================
  await t("모델이 '남녀공학'이라고 답해도 그 문장은 지워지고 정정 문구가 붙는다", async () => {
    setResponsesOutput([msg("창원중앙고는 남녀공학이라 분위기가 밝아요. 야자는 선택이에요.")]);
    const r = await chat("학교 분위기 어때요");
    assert(!r.payload.reply.includes("남녀공학이라"), r.payload.reply);
    assert(r.payload.reply.includes("야자는 선택이에요") && r.payload.reply.includes("남자 고등학교(남학교)"), r.payload.reply);
  });
  await t("정상 답변('남녀공학이 아니라 남학교')은 그대로 둔다", async () => {
    setResponsesOutput([msg("저희 학교는 남녀공학이 아니라 남자 고등학교예요.")]);
    assert.strictEqual((await chat("남녀공학이에요?")).payload.reply, "저희 학교는 남녀공학이 아니라 남자 고등학교예요.");
  });
  await t("이전 대화(assistant)에 섞인 '남녀공학' 오답은 모델에 전달되기 전에 정정된다", async () => {
    setResponsesOutput(null);
    const hist = [{ role: "user", content: "어떤 학교예요" }, { role: "assistant", content: "저희 학교는 남녀공학이에요." }];
    const r = await chat("그럼 급식은요", hist);
    const sent = JSON.stringify(r.responsesRequest.input);
    assert(!sent.includes("남녀공학이에요"), sent);
  });
  await t("수학여행 비용 질문: 검색을 하면 맨 앞에 '잘 몰라서 웹에서 찾아봤다' 안내 + 출처 링크가 붙는다", async () => {
    setResponsesOutput([search, msg("2025년 자료에는 2학년 수학여행이 있다고 나와요.", [cite("https://www.knnews.co.kr/a", "경남신문 기사")])]);
    const r = await chat("수학여행 비용 얼마예요?");
    assert(r.payload.reply.startsWith(SEARCHED_NOTICE), r.payload.reply);
    assert(r.payload.reply.includes("**출처**") && r.payload.reply.includes("https://www.knnews.co.kr/a"));
  });
  await t("수학여행 비용 질문: 허용 외 출처(나무위키)만 인용하면 출처로 안 나오고 '확인 불가' 안내", async () => {
    setResponsesOutput([search, msg("제주도로 간다고 해요.", [cite("https://namu.wiki/w/x", "나무위키")])]);
    const r = await chat("수학여행 비용 얼마예요?");
    assert(!r.payload.reply.includes("namu.wiki") && r.payload.reply.includes("확인되지 않아"), r.payload.reply);
  });
  await t("수학여행 비용 질문인데 모델이 검색을 건너뛰면 '확인 불가' 문구가 붙는다(추측 답변 방지)", async () => {
    setResponsesOutput([msg("제주도로 가요.")]);
    const r = await chat("수학여행 비용 얼마예요?");
    assert(r.payload.reply.includes("확인이 필요한 내용인데, 검색으로 확인되지 않아"), r.payload.reply);
  });

  // ================= 6) fact_guard 단위 =================
  const g = (s) => enforceSchoolFacts(s);
  await t("fact_guard: 위반/정상/표 행/질문형/공학(engineering) 오탐 없음", () => {
    assert(g("여학생도 함께 다녀요.").violations.length === 1);
    assert(g("학교는 남녀공학이 아닙니다.").violations.length === 0);
    assert(g("공학중심 융합교육과 메이커 스페이스가 있어요.").violations.length === 0);
    assert(g("여학생이 없어요.").violations.length === 0);
    const tbl = g("| 항목 | 내용 |\n| --- | --- |\n| 성별 | 남녀공학 |\n| 학생수 | 548명 |").text;
    assert(tbl.includes("| 학생수 | 548명 |") && !tbl.includes("| 성별 | 남녀공학 |") && !/\n\n\|/.test(tbl), tbl);
    assert.strictEqual(g("").text, "");
  });

  setResponsesOutput(null);
  console.log(`school facts tests: ${pass}/${pass + fail}`);
  process.exit(fail ? 1 : 0);
})();
