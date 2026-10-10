/**
 * 교육과정 편성표(CUR01~CUR14) 검색·정합성 하네스. 실행: node test/run_curriculum_tests.js
 * 1) 대표 질문 → 기대 문서가 top3 안에 오는지
 * 2) 편성표 원본 수치(192/174/18/110/64)가 요약 문서에 정확히 있는지
 * 3) js/curriculum-2026.js(사이트 표시 데이터)의 모든 과목명이 챗봇 지식에도 들어 있는지(사이트와 챗봇 불일치 방지)
 */
const path = require("path");
const { retrieveKnowledge, KNOWLEDGE } = require("../knowledge.js");
let pass = 0, fail = 0; const fails = [];
const check = (n, ok, d) => { ok ? pass++ : (fail++, fails.push(d ? `${n}\n    ${d}` : n)); };

const CASES = [
  ["창원중앙고 교육과정이 어떻게 되나요", ["CUR01"]],
  ["3년간 총 몇 학점 이수해요", ["CUR01"]],
  ["졸업 학점이 몇 학점이에요", ["CUR01"]],
  ["석차등급 없는 과목이 뭐예요", ["CUR02"]],
  ["이수 미이수 과목은 뭔가요", ["CUR02"]],
  ["1학년 때 무슨 과목 배우나요", ["CUR03"]],
  ["공통수학 통합사회 몇 학점이에요", ["CUR03"]],
  ["2학년 교육과정 알려주세요", ["CUR04"]],
  ["3학년 때 듣는 과목이 뭐예요", ["CUR05"]],
  ["물리학 화학 생명과학 지구과학 선택할 수 있나요", ["CUR06", "CUR07"]],
  ["일본어 중국어 제2외국어 개설돼요", ["CUR08", "CUR09"]],
  ["인공지능 수학 과목 있나요", ["CUR06"]],
  ["미적분Ⅱ 기하 개설되나요", ["CUR07", "CUR10", "CUR05"]],
  ["데이터 과학 로봇과 공학세계 있어요", ["CUR10"]],
  ["미술 창작 음악 연주 선택과목", ["CUR11", "CUR13"]],
  ["진로와 직업 보건 교양 과목", ["CUR14"]],
  ["선택과목은 몇 개 고르나요", ["CUR06", "CUR07", "CUR10", "CUR01"], 6], // 범용 질문: 일반 FAQ가 앞설 수 있어 상위 6개 허용
];
for (const [q, ids, win = 3] of CASES) {
  const got = retrieveKnowledge(q, "", 6).map((r) => r.id);
  check(`[top${win}] "${q}"`, got.slice(0, win).some((i) => ids.includes(i)), `기대 ${ids.join("/")} 실제 ${got.join(", ") || "(없음)"}`);
}

const cur = KNOWLEDGE.filter((r) => /^CUR\d+$/.test(r.id));
check("[등록] CUR01~CUR14 14건", cur.length === 14, `실제 ${cur.length}건`);
const sum = cur.find((r) => r.id === "CUR01").retrieval_text;
for (const t of ["192학점", "174학점", "18학점", "110학점", "64학점"]) check(`[수치] CUR01에 ${t}`, sum.includes(t));

(async () => {
  const mod = await import(path.resolve(__dirname, "../../js/curriculum-2026.js"));
  const all = cur.map((r) => r.retrieval_text).join("\n");
  const names = new Set();
  mod._data.FIXED.flat().forEach((c) => c[2].split(" ↔ ").forEach((n) => names.add(n)));
  mod._data.ELECTIVE.forEach((g) => g.courses.forEach((c) => names.add(c[2])));
  const missing = [...names].filter((n) => !all.includes(n));
  check(`[사이트-챗봇 일치] 과목명 ${names.size}종 모두 지식에 존재`, missing.length === 0, `누락: ${missing.join(", ")}`);
  // 연락처 질문은 기존 확정 문서 우선
  const ids = retrieveKnowledge("교무실 전화번호 알려주세요", "", 6).map((r) => r.id);
  check("[연락처] 교육과정 문서가 연락처 질문 1등을 가로채지 않음", ids[0] && !ids[0].startsWith("CUR"), ids.join(", "));
  console.log(`\n총 ${pass + fail}건 중 ${pass}건 통과, ${fail}건 실패`);
  if (fail) { console.log(fails.map((f) => "- " + f).join("\n")); process.exit(1); }
})();
