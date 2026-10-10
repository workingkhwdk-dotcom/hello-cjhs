// 챗봇 시스템 프롬프트에 "항상" 들어가는 3개년 교육과정 요약(functions/curriculum_core.js)과,
// 서버 함수(evaluatePlan)가 쓰는 구조화 데이터(functions/curriculum_data.json)를 만든다.
// 원본은 사이트 화면과 같은 js/curriculum-2026.js 이므로, 편성표가 바뀌면 이 스크립트를 다시 돌려 챗봇도 같이 맞춘다.
//   실행: node tools/gen-curriculum-core.mjs
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { _data } from "../js/curriculum-2026.js";

const { SEM, FIXED, ELECTIVE, TOTALS, sum } = _data;
const GRADE = { X: "석차등급 없음", "3": "성취도 3단계", P: "이수/미이수" };
const gl = g => (GRADE[g] ? `[${GRADE[g]}]` : "");

const fixedLine = si =>
  FIXED[si].map(c => `${c[2].replace(" ↔ ", "↔")}(${c[5]})${gl(c[6])}`).join(", ");

function groupLines(g) {
  const allSame = g.courses.every(c => c[5] === g.courses[0][5]);
  const head = `  · ${g.id}군 — ${g.courses.length}개 중 ${g.pick}과목 선택(과목당 ${g.credit}학점${g.pick > 1 ? `, ${g.pick}과목 합 ${g.total}학점` : ""})${allSame ? gl(g.courses[0][5]) : ""}:`;
  const bySubj = [];
  g.courses.forEach(c => { let e = bySubj.find(x => x[0] === c[0]); if (!e) bySubj.push(e = [c[0], []]); e[1].push(c); });
  const body = bySubj.map(([s, cs]) => `${s}: ` + cs.map(c => `${c[2]}(${c[1]}${!allSame && gl(c[5]) ? "," + GRADE[c[5]] : ""})`).join(", ")).join(" / ");
  return `${head}\n      ${body}`;
}

const sems = SEM.map((name, si) => {
  const groups = ELECTIVE.filter(g => g.sem === si);
  const elect = groups.length
    ? `\n  학생 선택 ${TOTALS.elective[si]}학점 = ${groups.map(g => `${g.id}군 ${g.total}`).join(" + ")}\n${groups.map(groupLines).join("\n")}`
    : "";
  return `■ ${name} — 교과 ${TOTALS.subject[si]}(학교 지정 ${TOTALS.fixed[si]}${TOTALS.elective[si] ? ` + 학생 선택 ${TOTALS.elective[si]}` : ""}) + 창의적 체험활동 ${TOTALS.creative[si]}\n  학교 지정: ${fixedLine(si)}${elect}`;
}).join("\n");

const text = `[확정된 3개년 교육과정 — 2027학년도 입학생(예비 고1) 적용 · 운영자 확인 2026-10-01]
창원중앙고 3개년 교육과정 편성표는 이미 확정되어 있으며, 2026학년도 입학생 편성표와 동일하게 2027학년도 입학생에게 적용됩니다. 이 표의 과목·선택군·학점에 대해 "아직 확정되지 않았다", "미정이다", "추후 안내된다"라고 말하지 말고 아래 내용으로 바로 답하세요. (교무실에 확인할 것은 수강 인원에 따른 실제 개설·반 편성 같은 세부 운영뿐입니다.)
표기: 과목명(편성학점). '유형'은 공통·일반·진로·융합. 표시가 없는 과목은 성취도 5단계+석차등급이고, [ ]는 그와 다른 성적 처리입니다. 선택군 A~I는 같은 학기에 함께 열리는 선택 과목 묶음이며, 묶음마다 정해진 수만큼만 고릅니다.
총 ${sum(TOTALS.all)}학점 = 교과 ${sum(TOTALS.subject)}(학교 지정 ${sum(TOTALS.fixed)} + 학생 선택 ${sum(TOTALS.elective)}) + 창의적 체험활동 ${sum(TOTALS.creative)}. 1학년은 학교 지정 과목만 듣고, 학생 선택은 2학년 1학기부터 시작합니다.
${sems}`;

const esc = s => s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
const out = `/**
 * 자동 생성 파일 — 직접 고치지 마세요. 원본: js/curriculum-2026.js
 * 편성표가 바뀌면 프로젝트 루트에서 \`node tools/gen-curriculum-core.mjs\` 를 다시 실행하세요.
 * (index.js의 buildSystemPrompt가 검색 결과와 무관하게 항상 이 블록을 프롬프트에 넣습니다.)
 */
const CURRICULUM_CORE = \`${esc(text)}\`;

module.exports = { CURRICULUM_CORE };
`;
const dest = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../functions/curriculum_core.js");
fs.writeFileSync(dest, out);
console.log(`wrote ${dest} (${text.length}자)`);

// 서버의 플랜 검증·학점 계산(functions/plan.js)용 구조화 데이터. 화면과 같은 원본에서 만든다.
const dataDest = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../functions/curriculum_data.json");
fs.writeFileSync(dataDest, JSON.stringify({ SEM, FIXED, ELECTIVE, TOTALS }, null, 1) + "\n");
console.log(`wrote ${dataDest}`);
