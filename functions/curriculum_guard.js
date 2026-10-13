/**
 * 교육과정 편성표 검수 하네스 — 챗봇 답변이 확정된 편성표(curriculum_data.json)와 어긋나는지 서버가 마지막에 한 번 더 본다.
 * ------------------------------------------------------------
 * 배경: 시스템 프롬프트에 편성표 전체(CURRICULUM_CORE)를 넣어 두어도, 모델이 과목을 엉뚱한 선택군·학기에 놓거나
 * 없는 과목을 추천하거나 정원("11개 중 3과목")을 틀리게 말할 수 있다. 학생이 이 답으로 실제 과목을 고르므로
 * 프롬프트만 믿지 않고 코드로 검증한다.
 *
 * 흐름(index.js generateReply): 답변 → checkCurriculumReply → 위반이 있으면 위반 목록을 알려 주고 모델에게 한 번 다시 쓰게 함
 * → 그래도 위반이면 표의 문제 행을 빼고 안내 문구를 붙임(repairCurriculumReply).
 *
 * 오탐을 피하려고 "정확도가 높은 것만" 본다(문장 속 과목 이름은 "경제학과"처럼 겹치는 말이 많아 보지 않음):
 *   1) 표 행: 선택군(행의 첫 칸 또는 바로 위 소제목)별 '과목' 칸의 과목이 그 군 편성표에 있는가
 *   2) 표 행: 학기 소제목(예: **2학년 2학기**) 아래 행의 선택군이 그 학기의 군인가
 *   3) 문장: "N군 … M개 중 K과목", "N군 … 과목당 K학점"의 숫자가 편성표와 같은가
 *   4) 문장: 학기 하나와 선택군 하나만 함께 나온 문장에서 그 군이 그 학기의 군인가
 * 순수 함수라 네트워크 없이 test/run_curriculum_guard_tests.js로 검증한다.
 */
const DATA = require("./curriculum_data.json");

const GROUP_RE = /(^|[^A-Za-z])([A-I])\s*군/g;
const SEM_RE = /([1-3])\s*학년\s*([12])\s*학기/g;

function index(data) {
  const byGroup = new Map(data.ELECTIVE.map((g) => [g.id, g]));
  const names = new Map(); // 과목명 -> 선택군 목록
  data.ELECTIVE.forEach((g) => g.courses.forEach((c) => { if (!names.has(c[2])) names.set(c[2], []); names.get(c[2]).push(g.id); }));
  const fixedNames = new Set(data.FIXED.flat().flatMap((c) => String(c[2]).split(" ↔ ")));
  const semOf = new Map(data.ELECTIVE.map((g) => [g.id, data.SEM[g.sem]])); // 군 -> "2학년 1학기"
  return { byGroup, names, fixedNames, semOf };
}

const norm = (s) => String(s).replace(/\s+/g, " ").trim();
const semLabel = (grade, term) => `${grade}학년 ${term}학기`;
const groupsIn = (text) => { const out = new Set(); let m; GROUP_RE.lastIndex = 0; while ((m = GROUP_RE.exec(text))) out.add(m[2]); return [...out]; };
const semsIn = (text) => { const out = new Set(); let m; SEM_RE.lastIndex = 0; while ((m = SEM_RE.exec(text))) out.add(semLabel(m[1], m[2])); return [...out]; };

/** 마크다운 표의 한 줄을 칸 배열로 나눈다(표 줄이 아니면 null). */
function cellsOf(line) {
  if (!/^\s*\|.*\|\s*$/.test(line)) return null;
  return line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
}
const isSeparator = (cells) => cells.every((c) => /^:?-{2,}:?$/.test(c.replace(/\s/g, "")));

/** 칸 하나의 과목 목록: 굵게·괄호 표기("(진로)")를 벗기고 쉼표·슬래시로 나눈다. */
function courseTokens(cell) {
  return cell.replace(/\*\*|__|`/g, "").replace(/\([^)]*\)|（[^）]*）/g, "").split(/[,，、/]|\s·\s|\s\+\s/).map(norm).filter(Boolean);
}

/**
 * @param {string} reply
 * @returns {{violations: {kind:string, line:number, text:string, detail:string}[]}}
 */
function checkCurriculumReply(reply, data = DATA) {
  const ix = index(data);
  const violations = [];
  const lines = String(reply || "").split("\n");
  let ctxGroup = null, ctxSem = null, header = null;
  const add = (kind, i, detail) => violations.push({ kind, line: i, text: lines[i].trim().slice(0, 120), detail });

  lines.forEach((line, i) => {
    const cells = cellsOf(line);
    if (!cells) {
      header = null;
      const gs = groupsIn(line), ss = semsIn(line);
      // 소제목·굵은 글씨 줄이 문맥(선택군/학기)을 정한다.
      if (/^\s*(#{1,6}\s|\*\*|[-*]\s*\*\*)/.test(line) || line.trim().length <= 40) {
        if (gs.length === 1) ctxGroup = gs[0];
        if (ss.length === 1) { ctxSem = ss[0]; if (gs.length === 0) ctxGroup = null; } // 새 학기 소제목이면 이전 선택군 문맥을 버린다
      }
      // 3) 정원·학점 숫자
      let m; const countRe = /([A-I])\s*군[^.\n|]{0,30}?(\d+)\s*개\s*중\s*(\d+)\s*과목/g;
      while ((m = countRe.exec(line))) {
        const g = ix.byGroup.get(m[1]);
        if (g && (g.courses.length !== +m[2] || g.pick !== +m[3])) add("count", i, `${m[1]}군은 ${g.courses.length}개 중 ${g.pick}과목이에요(답변: ${m[2]}개 중 ${m[3]}과목)`);
      }
      const creditRe = /([A-I])\s*군[^.\n|]{0,20}?과목당\s*(\d+)\s*학점/g;
      while ((m = creditRe.exec(line))) {
        const g = ix.byGroup.get(m[1]);
        if (g && g.credit !== +m[2]) add("credit", i, `${m[1]}군은 과목당 ${g.credit}학점이에요(답변: ${m[2]}학점)`);
      }
      // 4) 학기 하나 + 선택군 하나가 함께 나온 문장
      if (ss.length === 1 && gs.length === 1 && !/[?？]\s*$/.test(line)) {
        const real = ix.semOf.get(gs[0]);
        if (real && real !== ss[0] && !/군[^.\n]{0,12}(은|는)?\s*[^.\n]{0,12}(아니|않)/.test(line)) add("semester", i, `${gs[0]}군은 ${real}에 고르는 군이에요(답변: ${ss[0]})`);
      }
      return;
    }
    if (isSeparator(cells)) return;
    // 표 머리글: '과목'이 들어간 칸이 과목 칸. 첫 줄이 머리글이다.
    if (!header) {
      const col = cells.findIndex((c) => /과목/.test(c));
      header = { col: col >= 0 ? col : -1, ready: col >= 0 };
      if (header.ready) return; // 머리글 줄은 검사하지 않음
    }
    if (!header.ready) return;
    const first = cells[0].replace(/\*\*|__/g, "");
    const gm = first.match(/^([A-I])\s*군/);
    const group = gm ? gm[1] : (groupsIn(first).length === 1 ? groupsIn(first)[0] : ctxGroup);
    const g = group && ix.byGroup.get(group);
    if (!g) return; // 선택군을 알 수 없는 표(예: 지정 과목 표)는 건드리지 않는다
    // 2) 학기 소제목과 선택군이 맞는가
    if (ctxSem && ix.semOf.get(group) && ix.semOf.get(group) !== ctxSem && gm) add("semester", i, `${group}군은 ${ix.semOf.get(group)}에 고르는 군이에요(답변: ${ctxSem} 아래에 있음)`);
    // 1) 과목 칸의 과목이 그 군에 있는가
    const cell = cells[header.col];
    if (cell === undefined) return;
    for (const t of courseTokens(cell)) {
      if (!t || /^[-–—~]$/.test(t) || /^(없음|해당 없음|미정|선택|자유.*|동일|위와 같음)$/.test(t)) continue;
      const here = g.courses.some((c) => c[2] === t);
      if (here) continue;
      const elsewhere = ix.names.get(t);
      if (elsewhere) add("wrong-group", i, `${t}은(는) ${group}군이 아니라 ${elsewhere.join("·")}군 과목이에요`);
      else if (!ix.fixedNames.has(t)) add("unknown-course", i, `${t}은(는) 우리 학교 ${group}군 편성표에 없어요`);
    }
  });
  return { violations };
}

/** 모델에게 다시 쓰게 할 때 붙이는 검수 안내문. */
function feedbackFor(violations) {
  return `[검수 결과] 방금 답변이 확정된 편성표와 다른 부분이 있어요:\n${violations.slice(0, 8).map((v) => `- ${v.detail}`).join("\n")}\n\n시스템 지침의 [확정된 3개년 교육과정]에 맞게 해당 부분만 바로잡아, 같은 형식(표 포함)으로 답변 전체를 다시 써 주세요. 검수나 정정이 있었다는 말은 하지 마세요. 편성표에 없는 과목은 넣지 말고 같은 선택군의 다른 과목으로 바꾸세요.`;
}

const NOTICE = "※ 과목·선택군 일부는 학교 편성표와 맞지 않아 뺐어요. 정확한 편성은 사이트의 교육과정 탭에서 확인해 주세요.";

/** 재작성 후에도 남은 위반을 정리한다: 표의 문제 행은 지우고, 문장 위반은 그대로 두되 안내 문구를 붙인다. */
function repairCurriculumReply(reply, violations) {
  const lines = String(reply || "").split("\n");
  const drop = new Set(violations.filter((v) => v.kind === "wrong-group" || v.kind === "unknown-course" || (v.kind === "semester" && /^\s*\|/.test(lines[v.line] || ""))).map((v) => v.line));
  const kept = lines.filter((_, i) => !drop.has(i));
  return `${kept.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n\n${NOTICE}`;
}

module.exports = { checkCurriculumReply, feedbackFor, repairCurriculumReply, NOTICE };
