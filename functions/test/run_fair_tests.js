/**
 * 학교 박람회(2026.11.7) 챗봇 지식 검증: 질문이 FAIR 자료를 찾는지, 상시 안내 블록 내용, 11/8 0시(KST) 이후 자동 삭제.
 * 실행: node test/run_fair_tests.js
 */
const assert = require("assert");
const { retrieveKnowledge, KNOWLEDGE } = require("../knowledge");
const { buildFairBlock } = require("../school_fair");
// index.js는 bcryptjs 등 실제 패키지를 불러오므로, 패키지 설치 전(배포 스크립트가 npm ci보다 테스트를 먼저 돌림)에도
// 돌 수 있게 test_harness.js가 스텁 모듈 경로를 끼워 넣은 뒤에 불러온다(다른 테스트와 같은 방식).
require("./test_harness.js");
const { buildSystemPrompt } = require("../index.js");

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "-", e.message); } }

const BEFORE = new Date("2026-10-22T03:00:00Z"); // 10/22 12:00 KST
const DAY = new Date("2026-11-07T01:00:00Z"); // 11/7 10:00 KST
const LAST = new Date("2026-11-07T14:59:00Z"); // 11/7 23:59 KST
const AFTER = new Date("2026-11-07T15:00:00Z"); // 11/8 00:00 KST

const ids = (q, now) => retrieveKnowledge(q, "", 6, now).map((r) => r.id);
const QUERIES = {
  "학교 박람회 언제 해요?": "FAIR01",
  "박람회 주차할 수 있나요?": "FAIR01",
  "박람회 당일 시간표 알려주세요": "FAIR02",
  "1:1 상담 몇 시에 시작해요? 회차가 있나요": "FAIR02",
  "박람회 체험 부스에서는 뭐 해요?": "FAIR03",
  "박람회 1:1 상담 사전 신청은 어떻게 해요?": "FAIR04",
};

t("FAIR 레코드 4개가 지식 DB에 있고 모두 종료 시각이 있다", () => {
  const fair = KNOWLEDGE.filter((r) => r.module_id === "school_fair");
  assert.deepStrictEqual(fair.map((r) => r.id), ["FAIR01", "FAIR02", "FAIR03", "FAIR04"]);
  for (const r of fair) assert.strictEqual(r.expires_at, "2026-11-08T00:00:00+09:00", r.id);
});
for (const [q, id] of Object.entries(QUERIES)) {
  t(`행사 전: "${q}" → ${id}`, () => assert(ids(q, BEFORE).includes(id), ids(q, BEFORE).join(",")));
  t(`행사 끝난 뒤: "${q}" → FAIR 없음`, () => assert(!ids(q, AFTER).some((x) => x.startsWith("FAIR")), ids(q, AFTER).join(",")));
}
t("당일 23:59(KST)까지는 검색된다", () => assert(ids("학교 박람회 언제 해요?", LAST).includes("FAIR01")));

t("시간표 자료에 회차·장소가 정확히 있다", () => {
  const r = KNOWLEDGE.find((x) => x.id === "FAIR02").retrieval_text;
  for (const s of ["11:10~11:40", "11:40~12:10", "12:10~12:40", "용비관 강당", "6개 부스", "학습카페와 중강의실(도서관)", "기념품"]) assert(r.includes(s), s);
});
t("상시 블록: 행사 전에는 D-day와 핵심 사실", () => {
  const b = buildFairBlock(BEFORE);
  assert(b.includes("2026년 10월 22일(목)") && b.includes("16일 남았습니다"), b.slice(0, 120));
  for (const s of ["10:00~13:00", "https://m.site.naver.com/2iU5e", "본관 뒤편", "'학교 박람회' 탭"]) assert(b.includes(s), s);
});
t("상시 블록: 당일은 '오늘이 박람회 당일'", () => assert(buildFairBlock(DAY).includes("오늘이 박람회 당일")));
t("상시 블록: 11/8 0시(KST)부터 빈 문자열", () => { assert.strictEqual(buildFairBlock(AFTER), ""); assert(buildFairBlock(LAST)); });
t("시스템 프롬프트: 행사 전 포함, 끝난 뒤 박람회 안내 없음", () => {
  assert(buildSystemPrompt("(지식)", undefined, BEFORE).includes("[학교 박람회 안내"));
  const after = buildSystemPrompt("(지식)", undefined, AFTER);
  assert(!after.includes("박람회") && !after.includes("\n\n\n\n"));
});

console.log(`fair: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
