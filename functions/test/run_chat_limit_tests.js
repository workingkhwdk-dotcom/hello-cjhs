/** chatWithAI에 요청 제한이 실제로 연결돼 있는지 확인(스텁 환경). 실행: node test/run_chat_limit_tests.js */
const { callChat } = require("./test_harness.js");
const { LIMITS } = require("../rate_limit.js");
let pass = 0, fail = 0; const fails = [];
const check = (n, ok, d) => { ok ? pass++ : (fail++, fails.push(d ? `${n}\n    ${d}` : n)); };
(async () => {
  const A = { "x-forwarded-for": "203.0.113.7" }, B = { "x-forwarded-for": "198.51.100.9" };
  const codes = [];
  for (let i = 0; i < LIMITS.chatPerMin.max + 2; i++) codes.push((await callChat("학교 연락처 알려주세요", [], A)).code);
  const ok = codes.slice(0, LIMITS.chatPerMin.max).every((c) => c === 200);
  check(`[연결] 한 IP의 처음 ${LIMITS.chatPerMin.max}회는 정상 응답`, ok, codes.join(","));
  check("[연결] 초과 요청은 429", codes[LIMITS.chatPerMin.max] === 429 && codes[LIMITS.chatPerMin.max + 1] === 429, codes.slice(-3).join(","));
  const r = await callChat("학교 연락처 알려주세요", [], A);
  check("[연결] 429 응답에 안내 문구(error)가 있음", r.code === 429 && typeof r.payload.error === "string" && r.payload.error.length > 5);
  check("[연결] 다른 IP는 영향 없음", (await callChat("학교 연락처 알려주세요", [], B)).code === 200);
  console.log(`\n총 ${pass + fail}건 중 ${pass}건 통과, ${fail}건 실패`);
  if (fail) { console.log(fails.map((f) => "- " + f).join("\n")); process.exit(1); }
})();
