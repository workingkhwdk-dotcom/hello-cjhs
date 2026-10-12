// 챗봇 파이프라인에 편성표 검수가 연결돼 있는지(스텁 환경). 실행: node test/run_curriculum_guard_integration.js
const { callChat, setResponsesOutput } = require("./test_harness.js");
const { NOTICE } = require("../curriculum_guard.js");
let pass = 0; const fails = [];
const check = (n, c, d) => (c ? pass++ : fails.push(d ? `${n}\n    ${d}` : n));
const out = (text) => [{ type: "message", content: [{ type: "output_text", text, annotations: [] }] }];
const T = (rows) => `**2학년 1학기**\n| 선택군 | 추천 과목 | 이유 |\n| --- | --- | --- |\n${rows}`;
const Q = "컴퓨터공학과 가려면 2학년 1학기에 어떤 선택과목을 고르면 좋을까요?";
let ip = 60;
const ask = async () => callChat(Q, [], { "x-forwarded-for": `203.0.113.${ip++}` });

(async () => {
  // 1) 정상 답변은 그대로, 모델 호출 1번
  setResponsesOutput(out(T("| A군 | 인공지능 수학 | 기초 |")));
  let r = await ask();
  check("정상 답변은 그대로", r.code === 200 && r.payload.reply.includes("인공지능 수학") && !r.payload.reply.includes(NOTICE));

  // 2) 틀린 답변 → 재작성 요청(검수 안내 포함)이 모델에 가고, 고쳐진 답이 나감
  let calls = 0;
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    if (String(url).includes("/v1/responses")) {
      calls++;
      const body = JSON.parse(opts.body);
      const last = body.input[body.input.length - 1];
      const fixed = typeof last.content === "string" && last.content.includes("[검수 결과]");
      if (fixed) check("재작성 요청에 위반 상세 포함", /정보과학은\(는\) C군/.test(last.content) || /C군/.test(last.content));
      if (fixed) check("재작성에는 웹 검색 도구를 주지 않음", !body.tools);
      const text = fixed ? T("| A군 | 인공지능 수학 | 기초 |") : T("| A군 | 정보과학 | 기초 |");
      return { ok: true, json: async () => ({ output: out(text) }) };
    }
    return realFetch(url, opts);
  };
  setResponsesOutput(null);
  r = await ask();
  check("틀린 답은 재작성돼 나감", r.code === 200 && r.payload.reply.includes("인공지능 수학") && !r.payload.reply.includes("정보과학"), r.payload.reply);
  check("모델은 2번 호출", calls === 2, String(calls));

  // 3) 재작성해도 틀리면 문제 행을 빼고 안내
  calls = 0;
  global.fetch = async (url, opts) => {
    if (String(url).includes("/v1/responses")) { calls++; return { ok: true, json: async () => ({ output: out(T("| A군 | 정보과학 | 기초 |\n| A군 | 물리학 | 보완 |")) }) }; }
    return realFetch(url, opts);
  };
  r = await ask();
  check("계속 틀리면 문제 행 제거", r.payload.reply.includes("물리학") && !r.payload.reply.includes("정보과학"), r.payload.reply);
  check("안내 문구 부착", r.payload.reply.includes(NOTICE));
  check("재시도는 1번만(총 2회)", calls === 2, String(calls));
  global.fetch = realFetch;

  console.log(`\n총 ${pass + fails.length}건 중 ${pass}건 통과, ${fails.length}건 실패`);
  fails.forEach((f) => console.log("- " + f));
  process.exit(fails.length ? 1 : 0);
})();
