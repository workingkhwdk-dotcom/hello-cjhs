/**
 * 답변 복구 하네스(reply_guard.js) 검증 — "깨진 코드가 화면에 나오지 않는다"를 구조적으로 확인한다.
 *
 * 1) 사례 테스트: 실제로 일어나는 깨짐(잘린 표·미닫힘 서식·인용 마커·열 불일치…)이 고쳐지는지
 * 2) 불변식 테스트(퍼징): 정상 답변 말뭉치를 "모든 글자 위치에서 자르고", 기호를 무작위로 지우고 끼워 넣어도
 *    ① 예외 없음 ② 결과에 코드 조각이 남지 않음(findIssues 빈 배열) ③ 한 번 더 고쳐도 그대로(멱등)
 *    ④ 정상 답변은 한 글자도 바뀌지 않음
 * 3) 브라우저 사본(js/reply-guard.js)이 서버 파일과 같은지
 *
 * 실행: node test/run_reply_guard_tests.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const G = require("../reply_guard.js");

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "-", e.message); }
}
const fix = (s, incomplete = false) => G.repairReply(s, { incomplete });

// ---------- 정상 답변 말뭉치(실제 FORMAT_RULES가 만드는 모양) ----------
const CLEAN = [
  "야자는 월~목 **18:30~21:00**에 운영해요.",
  "결론부터 말씀드리면 <mark>2학년 2학기에는 B군에서 3과목</mark>을 고르시면 돼요.\n\n**2학년 2학기**\n\n| 선택군 | 추천 과목 | 이유 |\n| --- | --- | --- |\n| B군 | 생명과학Ⅰ | 의학 계열 기초 |\n| B군 | 화학Ⅰ | 실험 경험 |\n| D군 | 물리학Ⅰ | 이과 기본 |\n\n모든 대학이 같은 조합을 요구하지는 않아요.",
  "- 석식은 제공돼요.\n- 귀가 버스가 있어요.\n- 체육복은 입학 후 안내해요.",
  "1. 상담 신청서를 작성해요.\n2. 일정 조율 후 연락드려요.\n3. 방문 또는 전화로 상담해요.",
  "<span style=\"color:#2563eb\">파란 강조</span>와 **굵게**를 함께 쓸 수 있어요.",
  "자세한 내용은 [학교 홈페이지](https://cwjungang-h.gne.go.kr/cwjungang-h/main.do)에서 확인해 보세요.",
  "### 입학 절차\n\n먼저 신청서를 내요.\n\n**출처**\n- [어디가](https://www.adiga.kr/p0)\n- [수능 개편안](https://www.suneung.re.kr/a)",
  "| 구분 | 방문 상담 | 전화 상담 |\n| --- | --- | --- |\n| 소요 시간 | 약 30분 | 약 10분 |\n| 준비물 | 성적표 | 없음 |",
];

// ---------- 1) 사례 ----------
t("정상 답변은 한 글자도 안 바뀐다(말뭉치 전체)", () => {
  for (const s of CLEAN) {
    const r = fix(s);
    assert.strictEqual(r.text, s, `바뀜: ${JSON.stringify(r.text)}`);
    assert.deepStrictEqual(r.fixes, [], `불필요한 수리 기록: ${r.fixes}`);
  }
});
t("잘린 표: 열이 모자란 마지막 행을 버리고 안내 문구를 붙인다", () => {
  const r = fix("추천이에요.\n\n| 선택군 | 과목 |\n| --- | --- |\n| B군 | 생명과학Ⅰ |\n| D군 | 화", true);
  assert(!r.text.includes("| D군"), r.text);
  assert(r.text.includes("| B군 | 생명과학Ⅰ |") && r.text.endsWith(G.INCOMPLETE_NOTICE), r.text);
  assert.deepStrictEqual(G.findIssues(r.text), []);
});
t("잘린 답변: 문장 중간에서 끊긴 마지막 줄을 버린다", () => {
  const r = fix("첫 문단은 끝났어요.\n\n두 번째 문단은 이렇게 시작해서 중간에", true);
  assert(r.text.startsWith("첫 문단은 끝났어요.") && !r.text.includes("중간에"), r.text);
  assert(r.text.endsWith(G.INCOMPLETE_NOTICE));
});
t("잘린 답변: 짧은 답이 통째로 잘려도 빈 답변이 되지 않는다", () => {
  const r = fix("수능 최저는 3합", true);
  assert(r.text.includes("수능 최저는 3합") && r.text.endsWith(G.INCOMPLETE_NOTICE), r.text);
});
t("잘린 답변: 내용 없는 소제목·머리글만 남은 표는 함께 지운다", () => {
  const r = fix("결론은 이거예요.\n\n**3학년 1학기**\n\n| 선택군 | 과목 |\n|---|---|\n| E군 | 물", true);
  assert(!r.text.includes("3학년 1학기") && !r.text.includes("선택군"), r.text);
});
t("잘린 답변이 아닌데 끝이 어색해도 자르지 않는다(complete 응답은 원문 존중)", () => {
  const s = "문단 하나\n\n끝이 이상하지만 완결된 응답이에요 그리고";
  assert.strictEqual(fix(s).text, s);
});
t("<mark>·**·<span> 미닫힘을 닫는다", () => {
  const a = fix("결론은 <mark>중요한 말");
  assert.strictEqual(a.text, "결론은 <mark>중요한 말</mark>");
  const b = fix("**굵게 시작");
  assert.strictEqual(b.text, "굵게 시작");
  const c = fix('<span style="color:#2563eb">파랑 <mark>강조</span> 끝');
  assert.strictEqual(c.text, '<span style="color:#2563eb">파랑 <mark>강조</mark></span> 끝');
});
t("허용 외 HTML 태그는 태그만 지우고 글자는 남긴다 / 위험한 style은 제거", () => {
  assert.strictEqual(fix("<div>안녕</div> <script>alert(1)</script>").text, "안녕 alert(1)");
  assert.strictEqual(fix('<span style="background:url(x)">글</span>').text, "글");
  assert.strictEqual(fix('<mark onclick="x()">글</mark>').text, "<mark>글</mark>");
});
t("웹 검색 인용 마커(private-use·turn0search0·【†】)를 지운다", () => {
  const r = fix("수능은 11월이에요.\uE200cite\uE202turn0search0\uE201 확인했어요.【4:0†source】 citeturn1view0 끝.");
  assert(!/[\uE000-\uF8FF]|turn\d|【/.test(r.text), r.text);
  assert(r.text.startsWith("수능은 11월이에요.") && r.text.includes("확인했어요."));
});
t("반쪽 이모지·제어문자·�·제로폭 글자 제거, 온전한 이모지는 유지", () => {
  const r = fix("좋아요 \ud83d 그리고 \ude00 끝 \u0007\uFFFD\u200b😊");
  assert.strictEqual(r.text, "좋아요 그리고 끝 😊");
});
t("safeSlice: 이모지 한가운데서 자르지 않는다", () => {
  const s = "가나😊다"; // 😊 = 서로게이트 2칸
  assert.strictEqual(G.safeSlice(s, 3), "가나");
  assert.strictEqual(G.safeSlice(s, 4), "가나😊");
  assert.strictEqual(G.safeSlice("abc", 10), "abc");
});
t("표: 구분선 없음 → 삽입, 열 부족 → 채움, 열 초과 → 마지막 칸에 합침", () => {
  const a = fix("| 구분 | 방문 | 전화 |\n| 시간 | 30분 | 10분 |");
  assert.strictEqual(a.text, "| 구분 | 방문 | 전화 |\n| --- | --- | --- |\n| 시간 | 30분 | 10분 |");
  const b = fix("| 가 | 나 | 다 |\n|---|---|---|\n| 1 | 2 |\n| 1 | 2 | 3 | 4 |");
  assert(b.text.includes("| 1 | 2 |   |") && b.text.includes("| 1 | 2 | 3 / 4 |"), b.text);
  assert.deepStrictEqual(G.findIssues(b.text), []);
});
t("표: 한 줄짜리 '표'·열 하나짜리 표는 평문으로", () => {
  assert.strictEqual(fix("| 가 | 나 |").text, "가 · 나");
  assert(!fix("| 항목 |\n| --- |\n| 값 |").text.includes("|"));
});
t("채팅창이 못 바꾸는 마크다운(코드 펜스·구분선·인용·####·+목록·1))을 바꾼다", () => {
  const r = fix("```\n코드\n```\n---\n> 인용문\n#### 소제목\n+ 항목\n1) 번호");
  assert.strictEqual(r.text, "코드\n인용문\n### 소제목\n- 항목\n1. 번호");
});
t("링크: 끝에서 잘린 링크는 글자만, 공백 든 주소는 인코딩, 이미지는 alt만", () => {
  assert.strictEqual(fix("자료는 [어디가](https://www.adiga.kr/a", true).text.split("\n")[0], "자료는 어디가");
  assert.strictEqual(fix("[목록](https://x.kr/a b)").text, "[목록](https://x.kr/a%20b)");
  assert.strictEqual(fix("![사진](https://x.kr/a.png)입니다").text, "사진입니다");
  assert.strictEqual(fix("[신청](apply.html)").text, "[신청](apply.html)");
});
t("줄바꿈이 글자 \\n 그대로 온 응답을 고친다", () => {
  assert.strictEqual(fix("첫 줄\\n둘째 줄").text, "첫 줄\n둘째 줄");
});
t("빈 입력·비문자열 입력에도 예외 없음", () => {
  for (const v of [null, undefined, "", "   ", 0, {}, [], "\n\n"]) {
    const r = fix(v);
    assert.strictEqual(typeof r.text, "string");
  }
});
t("findIssues가 문제를 잡아낸다(감시 장치 자체 검증)", () => {
  const bad = ["**열림", "<mark>열림", "| a | b |\n| c |", "```", "텍스트](https://x", "turn0search1", "\uFFFD", "---", "> 인용", "#### h"];
  for (const s of bad) assert(G.findIssues(s).length > 0, `못 잡음: ${JSON.stringify(s)}`);
  for (const s of CLEAN) assert.deepStrictEqual(G.findIssues(s), [], `오탐: ${JSON.stringify(s)}`);
});
t("평문 폴백: 어떤 서식 입력도 코드 조각 없이 읽힌다", () => {
  const p = G.toPlainText("**굵게** <mark>표시</mark> [링크](https://x.kr/a)\n| a | b |\n|---|---|\n| 1 | 2 |\n```\n코드\n```");
  assert(!/\*\*|<|\]\(|\||```/.test(p), p);
  assert(p.includes("굵게") && p.includes("링크 (https://x.kr/a)") && p.includes("1 · 2"), p);
});
t("renderedLooksBroken: 화면 글자에 남은 코드 조각을 알아본다", () => {
  for (const s of ["**x**", "텍스트](url)", "<mark>x", "| a | b |", "```", "turn0search1", "\uFFFD", "&lt;mark&gt;"])
    assert(G.renderedLooksBroken(s), `못 잡음: ${s}`);
  for (const s of ["야자는 18:30~21:00에 운영해요.", "A군 → B군", "2 < 3 이고 5 > 4", "1. 첫째\n2. 둘째"])
    assert(!G.renderedLooksBroken(s), `오탐: ${s}`);
});

// ---------- 2) 퍼징 ----------
function rng(seed) { // 결정적 난수(재현 가능)
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const NOISE = ["*", "**", "|", "<", ">", "`", "[", "]", "(", ")", "<mark>", "</mark>", "<span style=\"color:red\">", "</span>", "\n", "\n\n", "---", "```", "#", "####", "\uE200", "\ud83d", "turn0search0", "![", "\\n"];

function checkInvariants(label, input, incomplete) {
  let r1;
  try { r1 = G.repairReply(input, { incomplete }); }
  catch (e) { throw new Error(`${label}: 예외 ${e.message} 입력=${JSON.stringify(input)}`); }
  const issues = G.findIssues(r1.text);
  if (issues.length) throw new Error(`${label}: 코드 조각 남음 [${issues}] 입력=${JSON.stringify(input)} → ${JSON.stringify(r1.text)}`);
  const r2 = G.repairReply(r1.text, { incomplete: false });
  if (r2.text !== r1.text) throw new Error(`${label}: 멱등 아님 입력=${JSON.stringify(input)} → ${JSON.stringify(r1.text)} → ${JSON.stringify(r2.text)}`);
  if (incomplete && r1.text && !/\S/.test(r1.text.replace(G.INCOMPLETE_NOTICE, ""))) throw new Error(`${label}: 잘린 답변이 빈 껍데기 입력=${JSON.stringify(input)}`);
}

t("퍼징 ①: 말뭉치를 모든 글자 위치에서 잘라도(잘린 응답) 코드가 남지 않는다", () => {
  let n = 0;
  for (const s of CLEAN) for (let i = 1; i <= s.length; i++) { checkInvariants(`cut@${i}`, s.slice(0, i), true); n++; }
  assert(n > 500, `케이스 수 부족: ${n}`);
});
t("퍼징 ②: 말뭉치 전체를 모든 글자 위치에서 잘라도(완결 응답으로 취급) 코드가 남지 않는다", () => {
  for (const s of CLEAN) for (let i = 1; i <= s.length; i++) checkInvariants(`cutc@${i}`, s.slice(0, i), false);
});
t("퍼징 ③: 기호를 무작위로 지우고 끼워 넣은 5000건에서도 불변식 유지", () => {
  const rand = rng(20261002);
  for (let k = 0; k < 5000; k++) {
    let s = CLEAN[Math.floor(rand() * CLEAN.length)];
    const edits = 1 + Math.floor(rand() * 4);
    for (let e = 0; e < edits; e++) {
      const pos = Math.floor(rand() * (s.length + 1));
      if (rand() < 0.5) s = s.slice(0, pos) + NOISE[Math.floor(rand() * NOISE.length)] + s.slice(pos);
      else s = s.slice(0, pos) + s.slice(pos + 1 + Math.floor(rand() * 3));
    }
    checkInvariants(`mut#${k}`, s, rand() < 0.4);
  }
});
t("퍼징 ④: 말뭉치를 이어 붙인 긴 답변(여러 표·목록 혼합)도 안전", () => {
  const rand = rng(7);
  for (let k = 0; k < 300; k++) {
    let s = "";
    for (let p = 0; p < 4; p++) s += CLEAN[Math.floor(rand() * CLEAN.length)] + "\n\n";
    checkInvariants(`long#${k}`, s.slice(0, Math.floor(rand() * s.length) + 1), rand() < 0.5);
  }
});

// ---------- 3) 브라우저 사본 ----------
t("js/reply-guard.js(브라우저 사본)가 서버 파일과 완전히 같다", () => {
  const server = fs.readFileSync(path.join(__dirname, "..", "reply_guard.js"), "utf8");
  const clientPath = path.join(__dirname, "..", "..", "js", "reply-guard.js");
  assert(fs.existsSync(clientPath), "js/reply-guard.js 없음 — `node tools/sync-reply-guard.js` 실행");
  assert.strictEqual(fs.readFileSync(clientPath, "utf8"), server, "서버와 다름 — `node tools/sync-reply-guard.js` 실행");
});
t("브라우저 전역(window.CwjhReplyGuard)으로도 노출된다", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "js", "reply-guard.js"), "utf8");
  const sandbox = { self: {} };
  new Function("self", "module", src + "\n").call(sandbox, sandbox.self, undefined);
  assert(sandbox.self.CwjhReplyGuard && typeof sandbox.self.CwjhReplyGuard.repairReply === "function");
});
t("구형 브라우저 호환: lookbehind·named group·?? ?. 같은 최신 문법을 쓰지 않는다", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "reply_guard.js"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert(!/\(\?<[=!]/.test(code), "lookbehind 사용");
  assert(!/\(\?<[a-zA-Z]/.test(code), "named group 사용");
  assert(!/\?\?|\?\.[a-zA-Z(\[]/.test(code), "?? 또는 ?. 사용");
  assert(!/=>/.test(code) || true); // 화살표 함수는 iOS 10+에서 지원 — 허용
});

console.log(`reply guard tests: ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
