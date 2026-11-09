// 방문자 수(visitCounter) 저장 로직 테스트. 실행: node test/run_visit_counter_tests.js
const { recordVisit, TOTAL_PATH, DAILY_COLLECTION, PAGES } = require("../visit_counter.js");

let pass = 0; const fails = [];
const check = (n, c) => (c ? pass++ : fails.push(n));

// increment / merge / batch / getAll 만 흉내 내는 가짜 Firestore
function fakeDb() {
  const store = new Map();
  const ref = (col, id) => ({ key: `${col}/${id}` });
  const apply = (key, data) => {
    const cur = { ...(store.get(key) || {}) };
    for (const [k, v] of Object.entries(data)) cur[k] = v && v.__inc ? (cur[k] || 0) + v.__inc : v;
    store.set(key, cur);
  };
  return {
    store,
    collection: (col) => ({ doc: (id) => ref(col, id) }),
    batch() { const ops = []; return { set: (r, d) => ops.push([r.key, d]), commit: async () => ops.forEach(([k, d]) => apply(k, d)) }; },
    getAll: async (...refs) => refs.map((r) => ({ exists: store.has(r.key), data: () => store.get(r.key) })),
  };
}
const FV = { increment: (n) => ({ __inc: n }) };

(async () => {
  const db = fakeDb();
  const empty = await recordVisit(db, FV, { newVisit: false, date: "2026-10-10" });
  check("처음엔 0/0", empty.today === 0 && empty.total === 0);
  check("조회만 하면 저장 안 함", db.store.size === 0);

  await recordVisit(db, FV, { newVisit: true, date: "2026-10-10" });
  const r2 = await recordVisit(db, FV, { newVisit: true, date: "2026-10-10" });
  check("같은 날 두 번 → 오늘 2, 전체 2", r2.today === 2 && r2.total === 2);

  const r3 = await recordVisit(db, FV, { newVisit: false, date: "2026-10-10" });
  check("조회는 숫자를 올리지 않음", r3.today === 2 && r3.total === 2);

  const r4 = await recordVisit(db, FV, { newVisit: true, date: "2026-10-11" });
  check("다음 날 → 오늘 1, 전체 3", r4.today === 1 && r4.total === 3);
  check("날짜별 문서 분리", db.store.get(`${DAILY_COLLECTION}/2026-10-10`).count === 2 && db.store.get(`${DAILY_COLLECTION}/2026-10-11`).count === 1);
  check("전체 문서 위치", db.store.get(`${TOTAL_PATH.join("/")}`).total === 3);

  // ── 페이지별 집계 ──
  const db2 = fakeDb();
  const D = "2026-10-10";
  // 같은 사람이 메인 → 챗봇 순서로 연다: 사이트 전체는 1, 페이지별로 각각 1
  await recordVisit(db2, FV, { newVisit: true, page: "index", newPage: true, date: D });
  const a = await recordVisit(db2, FV, { newVisit: false, page: "chatbot", newPage: true, date: D });
  check("메인+챗봇 → 사이트 1", a.total === 1 && a.today === 1);
  check("메인+챗봇 → index 1, chatbot 1", a.pages.index.today === 1 && a.pages.chatbot.today === 1 && a.pages.index.total === 1 && a.pages.chatbot.total === 1);
  // 챗봇으로 바로 들어온 다른 사람: 사이트 +1, chatbot +1, index 그대로
  const b = await recordVisit(db2, FV, { newVisit: true, page: "chatbot", newPage: true, date: D });
  check("챗봇 직행 → 사이트 2, chatbot 2, index 1", b.total === 2 && b.pages.chatbot.today === 2 && b.pages.index.today === 1);
  // 조회만: 바뀌지 않음
  const c = await recordVisit(db2, FV, { newVisit: false, page: "chatbot", newPage: false, date: D });
  check("조회만 하면 그대로", c.total === 2 && c.pages.chatbot.total === 2);
  // 목록에 없는 페이지는 페이지별로 세지 않지만 사이트 전체는 센다
  const e = await recordVisit(db2, FV, { newVisit: true, page: "hack.__x", newPage: true, date: D });
  check("모르는 페이지는 무시, 사이트는 +1", e.total === 3 && !("hack.__x" in e.pages) && !db2.store.get(`${DAILY_COLLECTION}/${D}`)["p_hack.__x"]);
  // 다음 날: 오늘은 0부터, 누적은 이어짐
  const f = await recordVisit(db2, FV, { newVisit: true, page: "chatbot", newPage: true, date: "2026-10-11" });
  check("다음 날 chatbot 오늘 1, 누적 3", f.pages.chatbot.today === 1 && f.pages.chatbot.total === 3 && f.pages.index.today === 0);
  // 예전 방식(page 없이 newVisit 만)도 그대로 동작
  const g = await recordVisit(db2, FV, { newVisit: true, date: "2026-10-11" });
  check("page 없이 호출해도 사이트만 +1", g.total === 5 && g.today === 2 && g.pages.chatbot.total === 3);
  check("페이지 목록에 index·chatbot 포함", PAGES.includes("index") && PAGES.includes("chatbot"));

  console.log(`visit counter: ${pass} passed, ${fails.length} failed`);
  if (fails.length) { fails.forEach((f) => console.log("  FAIL:", f)); process.exit(1); }
})();
