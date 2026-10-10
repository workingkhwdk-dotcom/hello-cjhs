// evaluatePlan(과목 짜보기 서버 계산) 테스트. 실행: node test/run_plan_tests.js
const fs = require("fs");
const path = require("path");
const { evaluatePlan } = require("../plan.js");
const DATA = require("../curriculum_data.json");

let pass = 0; const fails = [];
const check = (n, c) => (c ? pass++ : fails.push(n));
const names = (g) => g.courses.map((c) => c[2]);
// 같은 이름이 여러 군에 있어도 겹치지 않게 앞에서부터 채운 "완성 플랜"
const full = () => { const used = new Set(), p = {}; for (const g of DATA.ELECTIVE) { p[g.id] = []; for (const n of names(g)) if (p[g.id].length < g.pick && !used.has(n)) { used.add(n); p[g.id].push(n); } } return p; };
const bad = (n, picks, re) => { const o = evaluatePlan(picks); check(`[거부] ${n}`, !o.ok && o.errors.length > 0 && (!re || re.test(o.errors.join(" ")))); };

const ok = evaluatePlan(full());
check("완성 플랜 통과", ok.ok);
const r = ok.result;
check("선택 19/19, 완성 true", r.pickedCount === 19 && r.totalPicks === 19 && r.complete === true);
check("학기별 학점 30/30/30/30/28/26", JSON.stringify(r.semesters.map((s) => s.credit)) === "[30,30,30,30,28,26]");
check("합계 174/174", r.credit === 174 && r.total === 174);
check("남은 선택 없음", r.semesters.every((s) => s.todo.length === 0));

const empty = evaluatePlan({});
check("빈 선택 통과·미완성", empty.ok && empty.result.pickedCount === 0 && !empty.result.complete);
check("빈 선택 학점 = 지정과목만", JSON.stringify(empty.result.semesters.map((s) => s.credit)) === JSON.stringify(DATA.TOTALS.fixed));
check("빈 선택 남은 칸 9개 군", empty.result.semesters.reduce((a, s) => a + s.todo.length, 0) === DATA.ELECTIVE.length);
const part = evaluatePlan({ [DATA.ELECTIVE[0].id]: [names(DATA.ELECTIVE[0])[0]] });
check("일부만 골라도 통과·남은 수 계산", part.ok && part.result.pickedCount === 1 && part.result.semesters[2].todo.find((t) => t.group === "A").left === 2);
check("picks 없는 키는 빈 것으로", evaluatePlan({ A: [] }).ok);

bad("picks 없음", undefined);
bad("picks null", null);
bad("picks 배열", []);
bad("picks 문자열", "A");
bad("없는 선택군", { Z: ["x"] }, /선택군/);
bad("목록이 아님", { A: "물리학" }, /목록/);
bad("문자열 아닌 항목", { A: [1] }, /목록/);
bad("없는 과목", { A: ["없는과목"] }, /없는 과목/);
const A = DATA.ELECTIVE[0];
bad("정원 초과", { A: names(A).slice(0, A.pick + 1) }, /까지만/);
bad("같은 군에서 중복", { A: [names(A)[0], names(A)[0]] }, /두 번/);
const dup = DATA.ELECTIVE.flatMap((g) => names(g).map((n) => [g.id, n])).reduce((m, [id, n]) => ((m[n] = m[n] || []).push(id), m), {});
const both = Object.entries(dup).find(([, ids]) => ids.length > 1);
if (both) bad("군 사이 중복", { [both[1][0]]: [both[0]], [both[1][1]]: [both[0]] }, /이미/);
else check("군 사이 중복 과목 존재(테스트 대상)", false);
check("거대한 과목 이름도 안전", !evaluatePlan({ A: ["가".repeat(10000)] }).ok);
check("__proto__ 키 무시/거부", (() => { const o = evaluatePlan(JSON.parse('{"__proto__":["x"]}')); return !o.ok; })());

// 데이터 동기화: curriculum_data.json == js/curriculum-2026.js 원본
(async () => {
  try {
    const mod = await import(path.join(__dirname, "../../js/curriculum-2026.js"));
    const src = JSON.stringify({ SEM: mod._data.SEM, FIXED: mod._data.FIXED, ELECTIVE: mod._data.ELECTIVE, TOTALS: mod._data.TOTALS });
    check("curriculum_data.json이 원본과 동기화", src === JSON.stringify(DATA));
  } catch (e) {
    check("원본 불러오기: " + e.message, false);
  }
  console.log(`\n총 ${pass + fails.length}건 중 ${pass}건 통과, ${fails.length}건 실패`);
  fails.forEach((f) => console.log("- " + f));
  process.exit(fails.length ? 1 : 0);
})();
