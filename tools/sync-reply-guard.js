#!/usr/bin/env node
/**
 * functions/reply_guard.js(서버 원본)를 js/reply-guard.js(브라우저 사본)로 복사한다.
 * 챗봇 "깨진 코드 방지" 하네스는 서버와 브라우저가 같은 코드를 써야 하므로, 원본을 고친 뒤에는 이 도구를 실행한다.
 * (functions/test/run_reply_guard_tests.js 가 두 파일이 같은지 매번 확인하므로, 깜빡해도 테스트가 알려 준다.)
 *
 * 사용: node tools/sync-reply-guard.js
 */
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "functions", "reply_guard.js");
const DST = path.join(__dirname, "..", "js", "reply-guard.js");

const src = fs.readFileSync(SRC, "utf8");
const prev = fs.existsSync(DST) ? fs.readFileSync(DST, "utf8") : null;
if (prev === src) {
  console.log("js/reply-guard.js 는 이미 최신입니다.");
} else {
  fs.writeFileSync(DST, src);
  console.log("js/reply-guard.js 를 갱신했습니다.");
}
