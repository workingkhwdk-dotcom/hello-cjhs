/**
 * "3년 과목 짜보기" 서버 쪽 검증·계산 (evaluatePlan 함수가 사용)
 * ------------------------------------------------------------
 * 브라우저는 학생이 고른 과목 이름만 보낸다(picks: { A: ["물리학", ...], ... }).
 * 정원·중복 규칙 검증, 학기별 학점 계산, 완성 여부 판정은 모두 여기서 한다.
 * 편성표 데이터(curriculum_data.json)는 화면과 같은 원본(js/curriculum-2026.js)에서
 * `node tools/gen-curriculum-core.mjs`로 생성한 파일이다. 직접 고치지 마세요.
 */
const DATA = require("./curriculum_data.json");

const sum = (a) => a.reduce((x, y) => x + y, 0);
const short = (name) => name.replace(/(\d)학년 (\d)학기/, "$1-$2");

/** @returns {{ ok: true, result: object } | { ok: false, errors: string[] }} */
function evaluatePlan(picks, data = DATA) {
  const { SEM, FIXED, ELECTIVE, TOTALS } = data;
  const errors = [];
  if (!picks || typeof picks !== "object" || Array.isArray(picks)) return { ok: false, errors: ["picks는 선택군별 과목 목록이어야 해요."] };

  const groups = new Map(ELECTIVE.map((g) => [g.id, g]));
  const seen = new Map(); // 과목명 -> 선택군 (같은 과목을 두 번 담지 못하게)
  const clean = {};
  for (const id of Object.keys(picks)) {
    if (!groups.has(id)) { errors.push(`없는 선택군이에요: ${String(id).slice(0, 10)}`); continue; }
  }
  for (const g of ELECTIVE) {
    const raw = picks[g.id] === undefined ? [] : picks[g.id];
    if (!Array.isArray(raw) || raw.some((n) => typeof n !== "string")) { errors.push(`${g.id}군 선택은 과목 이름 목록이어야 해요.`); continue; }
    if (raw.length > g.pick) errors.push(`${g.id}군은 ${g.pick}과목까지만 고를 수 있어요.`);
    const names = new Set(g.courses.map((c) => c[2]));
    const own = new Set();
    for (const n of raw) {
      if (!names.has(n)) errors.push(`${g.id}군에 없는 과목이에요: ${n.slice(0, 20)}`);
      else if (own.has(n)) errors.push(`${g.id}군에서 ${n}을(를) 두 번 골랐어요.`);
      else if (seen.has(n)) errors.push(`${n}은(는) ${seen.get(n)}군에서 이미 골랐어요.`);
      else { own.add(n); seen.set(n, g.id); }
    }
    clean[g.id] = [...own].slice(0, g.pick);
  }
  if (errors.length) return { ok: false, errors };

  const semesters = SEM.map((name, si) => {
    const fixed = FIXED[si].map((c) => ({ name: c[2], credit: c[5] }));
    const picked = [], todo = [];
    for (const g of ELECTIVE.filter((x) => x.sem === si)) {
      for (const n of clean[g.id]) {
        const c = g.courses.find((x) => x[2] === n);
        picked.push({ group: g.id, name: n, field: c[0], type: c[1], grade: c[5], credit: g.credit });
      }
      const left = g.pick - clean[g.id].length;
      if (left) todo.push({ group: g.id, left });
    }
    return { name, short: short(name), fixed, picked, todo, credit: TOTALS.fixed[si] + sum(picked.map((p) => p.credit)), total: TOTALS.subject[si] };
  });
  const pickedCount = sum(semesters.map((s) => s.picked.length));
  const totalPicks = sum(ELECTIVE.map((g) => g.pick));
  // 교과(국어·수학·…)별 학점: 학교 지정(fixed)과 내가 고른 과목(picked)을 나눠 센다. 화면 표와 AI 분석이 같은 값을 쓴다.
  const byField = new Map();
  const addField = (field, key, credit) => {
    if (!byField.has(field)) byField.set(field, { field, fixed: 0, picked: 0 });
    byField.get(field)[key] += credit;
  };
  FIXED.forEach((rows) => rows.forEach((c) => addField(c[0], "fixed", c[5])));
  semesters.forEach((sm) => sm.picked.forEach((p) => addField(p.field, "picked", p.credit)));
  const fields = [...byField.values()].map((f) => ({ ...f, total: f.fixed + f.picked })).sort((a, b) => b.total - a.total);
  // 내가 고른 과목의 유형(일반·진로·융합)별 학점
  const types = {};
  semesters.forEach((sm) => sm.picked.forEach((p) => { types[p.type] = (types[p.type] || 0) + p.credit; }));
  return { ok: true, result: { semesters, fields, types, pickedCount, totalPicks, credit: sum(semesters.map((s) => s.credit)), total: sum(TOTALS.subject), complete: pickedCount === totalPicks } };
}

module.exports = { evaluatePlan };
