// 챗봇 미응답 질문 기록 + SN01(수치 변동 안내) 검증
const assert = require("assert");
const { sanitizeQuestion, isUnanswered, questionDocId, logUnanswered } = require("../unanswered");
const { retrieveKnowledge } = require("../knowledge");
let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, e.message); } }

(async () => {
  await t("이메일/숫자 가림", () => {
    const s = sanitizeQuestion("제 메일 a.b@test.com 폰 010-1234-5678 로 연락줘요");
    assert(!/@|1234/.test(s), s);
  });
  await t("200자 제한", () => assert.strictEqual(sanitizeQuestion("가".repeat(500)).length, 200));
  await t("짧은 인사 제외", () => assert.strictEqual(isUnanswered({ message: "안녕", topScore: 0, reply: "" }), false));
  await t("약한 점수는 기록 대상", () => assert.strictEqual(isUnanswered({ message: "수영장 있어요 학교에", topScore: 0.2, reply: "네" }), true));
  await t("강한 점수+정상 답변은 제외", () => assert.strictEqual(isUnanswered({ message: "기숙사 있나요 학교에", topScore: 0.8, reply: "기숙사는 없어요" }), false));
  await t("확정 못 한다는 답변은 기록 대상", () => assert.strictEqual(isUnanswered({ message: "평가계획 알려주세요", topScore: 0.8, reply: "현재 확정해서 안내하기 어렵습니다" }), true));
  await t("같은 질문은 같은 ID(공백·부호 무시)", () => assert.strictEqual(questionDocId("수영장 있어요?"), questionDocId("수영장  있어요")));

  // 가짜 Firestore
  const store = {};
  const db = { collection: () => ({ doc: (id) => ({
    get: async () => ({ exists: !!store[id] }),
    set: async (d) => { store[id] = { ...d }; },
    update: async (d) => { const c = d.count; store[id] = { ...store[id], ...d, count: store[id].count + (c && c.inc || 0) }; },
  }) }) };
  const FV = { serverTimestamp: () => "ts", increment: (n) => ({ inc: n }) };
  await t("처음 기록 → count 1, 개인정보 필드 없음", async () => {
    assert.strictEqual(await logUnanswered(db, FV, { message: "수영장 있어요 학교에", topScore: 0.1, reply: "" }), true);
    const d = Object.values(store)[0];
    assert.strictEqual(d.count, 1);
    assert(!("ip" in d) && !("history" in d));
  });
  await t("같은 질문 반복 → count 증가", async () => {
    await logUnanswered(db, FV, { message: "수영장 있어요 학교에?", topScore: 0.1, reply: "" });
    assert.strictEqual(Object.keys(store).length, 1);
    assert.strictEqual(Object.values(store)[0].count, 2);
  });
  await t("기록 대상 아니면 쓰지 않음", async () => {
    assert.strictEqual(await logUnanswered(db, FV, { message: "기숙사 있나요 학교에", topScore: 0.9, reply: "없어요" }), false);
  });

  // SN01
  await t("SN01: 학생이 몇 명이에요 → 1순위", () => assert.strictEqual(retrieveKnowledge("학생이 몇 명이에요", "", 6)[0].id, "SN01"));
  await t("시스템 프롬프트에 해마다 규칙", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "../index.js"), "utf8");
    assert(src.includes("해마다 조금씩 달라질 수 있어요"));
  });
  console.log(`unanswered tests: ${pass}/${pass + fail}`);
  process.exit(fail ? 1 : 0);
})();
