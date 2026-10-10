/**
 * 확정된 학교 사실과 어긋나는 답변을 서버가 마지막에 한 번 더 걸러낸다.
 * ------------------------------------------------------------
 * 배경: 시스템 프롬프트에 사실을 적어 두어도, 모델이 "고등학교는 대개 남녀공학"이라는 일반 통념으로
 * 창원중앙고를 남녀공학이라고 답한 사례가 있었다(창원중앙고는 남자 고등학교). 신뢰도에 치명적인 오류라서
 * 프롬프트 지시와 별개로, 답변 문장에 이런 단정이 있으면 그 문장을 지우고 정정 문구를 붙인다.
 *
 * 범위는 일부러 좁게 잡았다: 학교알리미 공시와 학교 자료로 확정된 "남학교" 사실 하나만 다룬다.
 * 새로 확정된 사실을 추가하려면 RULES에 항목을 더하면 된다.
 * 순수 함수라 네트워크 없이 test/run_fact_guard_tests.js로 검증한다.
 */

// 부정 표현이 같은 문장에 있으면("남녀공학이 아니라 남학교예요") 올바른 답이므로 건드리지 않는다.
const NEGATION_RE = /(아닙니다|아니에요|아니예요|아니라|아니고|아니며|아니므로|아닌|않아요|않습니다|않는|없어요|없습니다|없으며|없고|없는|별개|다른\s*학교|구별|혼동)/;

const RULES = [
  {
    id: "coed",
    // 남녀공학·여학생 재학을 사실처럼 말하는 문장. 질문형("~인가요?")이나 부정문은 제외된다.
    claim: /남녀\s*공학|남\s*·\s*녀\s*공학|남녀\s*(모두|함께|같이)\s*(다니|공부|재학|입학)|여학생(도|이|들이|은|들은)?\s*(있|다니|재학|함께|같이|많|입학|지원할)/,
    correction: "※ 정정: 창원중앙고등학교는 남자 고등학교(남학교)예요. 남녀공학이 아니며 여학생은 재학하지 않아요(학교알리미 공시: 학생 548명 전원 남학생).",
  },
];

/**
 * @param {string} reply 모델 답변(마크다운)
 * @returns {{text:string, violations:string[]}} 위반 문장을 지우고 정정 문구를 덧붙인 결과
 */
function enforceSchoolFacts(reply) {
  const original = String(reply || "");
  if (!original) return { text: original, violations: [] };

  const violations = [];
  let lines = original.split("\n");
  const corrections = [];
  for (const rule of RULES) {
    let removed = false;
    const next = [];
    for (const line of lines) {
      if (!line.trim() || !rule.claim.test(line)) { next.push(line); continue; }
      // 한 줄 안에서 문장 단위로 판정한다(표의 행은 한 문장으로 취급된다).
      const pieces = line.split(/(?<=[.!?。])(\s+)/);
      const out = [];
      for (const piece of pieces) {
        if (/^\s+$/.test(piece) || !rule.claim.test(piece) || NEGATION_RE.test(piece) || /[?？]\s*$/.test(piece)) { out.push(piece); continue; }
        removed = true;
        violations.push(`${rule.id}: ${piece.trim().slice(0, 80)}`);
      }
      const joined = out.join("").trim();
      if (joined) next.push(joined); // 문장이 모두 지워진 줄(표 행 포함)은 빈 줄을 남기지 않고 통째로 뺀다
    }
    lines = next;
    if (removed) corrections.push(rule.correction);
  }
  let text = lines.join("\n");
  if (corrections.length) text = `${text.replace(/\n{3,}/g, "\n\n").trim()}\n\n${corrections.join("\n")}`.trim();
  return { text, violations };
}

module.exports = { enforceSchoolFacts, RULES };
