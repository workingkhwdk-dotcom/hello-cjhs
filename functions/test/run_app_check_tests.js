// App Check 검증(app_check.js) 단위 테스트 + 모든 공개 함수가 실제로 게이트를 거치는지 확인. 실행: node test/run_app_check_tests.js
const fs = require("fs");
const path = require("path");
const { createAppCheckGate } = require("../app_check.js");

let pass = 0; const fails = [];
const check = (n, c) => (c ? pass++ : fails.push(n));

const logs = [];
const logger = { warn: (...a) => logs.push(a), info() {}, error() {} };
const fakeAdmin = (valid) => ({ appCheck: () => ({ verifyToken: async (t) => { if (t !== valid) throw new Error("bad"); return { appId: "x" }; } }) });
const mkRes = () => { const r = { code: null, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; } }; return r; };
const req = (token) => ({ headers: token === undefined ? {} : { "x-firebase-appcheck": token } });

(async () => {
  // monitor(기본): 막지 않고 로그만
  for (const [name, token] of [["토큰 없음", undefined], ["틀린 토큰", "nope"], ["올바른 토큰", "good"]]) {
    logs.length = 0;
    const { appCheckBlocked } = createAppCheckGate({ admin: fakeAdmin("good"), logger, env: {} });
    const res = mkRes();
    const blocked = await appCheckBlocked(req(token), res);
    check(`[monitor] ${name} → 통과`, blocked === false && res.code === null);
    check(`[monitor] ${name} → 경고 로그 ${token === "good" ? "없음" : "있음"}`, token === "good" ? logs.length === 0 : logs.length === 1);
  }
  // enforce: 없거나 틀리면 401, 맞으면 통과
  const enf = createAppCheckGate({ admin: fakeAdmin("good"), logger, env: { APP_CHECK_ENFORCE: "true" } });
  for (const [name, token, expectBlock, reason] of [["토큰 없음", undefined, true, "missing"], ["빈 토큰", "  ", true, "missing"], ["틀린 토큰", "nope", true, "invalid"], ["올바른 토큰", "good", false]]) {
    const res = mkRes();
    const blocked = await enf.appCheckBlocked(req(token), res);
    check(`[enforce] ${name} → ${expectBlock ? "401" : "통과"}`, blocked === expectBlock && (expectBlock ? res.code === 401 && res.body.appCheck === reason && !!res.body.error : res.code === null));
  }
  // 대소문자 헤더 이름도 인정
  const res2 = mkRes();
  check("[enforce] 헤더 이름 대소문자", (await enf.appCheckBlocked({ headers: { "X-Firebase-AppCheck": "good" } }, res2)) === false);
  // APP_CHECK_ENFORCE=false 문자열은 monitor
  const off = createAppCheckGate({ admin: fakeAdmin("good"), logger, env: { APP_CHECK_ENFORCE: "false" } });
  check("[mode] 'false'는 monitor", (await off.appCheckBlocked(req(undefined), mkRes())) === false);

  // 코드 점검: 모든 공개 onRequest 함수가 핸들러 첫 줄에서 게이트를 호출한다
  const src = fs.readFileSync(path.join(__dirname, "../index.js"), "utf8");
  const handlers = [...src.matchAll(/exports\.(\w+) = onRequest\(\s*\{[^}]*\},\s*async \(req, res\) => \{\n(.*)\n/g)];
  check(`[적용] onRequest 함수 ${handlers.length}개 발견(10개 이상)`, handlers.length >= 10);
  handlers.forEach(([, name, first]) => check(`[적용] ${name} 첫 줄이 App Check`, first.includes("appCheckBlocked(req, res)")));

  console.log(`\n총 ${pass + fails.length}건 중 ${pass}건 통과, ${fails.length}건 실패`);
  fails.forEach((f) => console.log("- " + f));
  process.exit(fails.length ? 1 : 0);
})();
