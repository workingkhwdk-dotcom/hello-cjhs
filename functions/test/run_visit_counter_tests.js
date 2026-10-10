// 방문자 수(visitCounter) 저장 로직 테스트. 실행: node test/run_visit_counter_tests.js
const { recordVisit, TOTAL_PATH, DAILY_COLLECTION } = require("../visit_counter.js");

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

  console.log(`visit counter: ${pass} passed, ${fails.length} failed`);
  if (fails.length) { fails.forEach((f) => console.log("  FAIL:", f)); process.exit(1); }
})();
