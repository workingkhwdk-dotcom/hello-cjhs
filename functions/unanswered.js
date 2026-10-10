/**
 * "챗봇이 제대로 답하지 못한 질문"을 모아 관리자에게 보여주기 위한 보조 로직.
 * 신원 정보는 저장하지 않는다(IP·기기 정보 없음, 이메일·긴 숫자는 가림).
 */
const crypto = require("crypto");

const WEAK_SCORE = 0.3; // 지식 검색 1등 점수가 이보다 낮으면 근거가 약한 질문
const MAX_LEN = 200;
const FALLBACK_REPLY = /안내하기 어렵|확인되지 않|확인이 되지|알 수 없|확정되지|확정해서/;

function sanitizeQuestion(text) {
  return String(text || "")
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[이메일]")
    .replace(/\d[\d\s-]{4,}\d/g, "[숫자]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LEN);
}

function isUnanswered({ message, topScore, reply }) {
  if (!message || String(message).trim().length < 5) return false; // 인사·단답은 제외
  return topScore < WEAK_SCORE || FALLBACK_REPLY.test(String(reply || ""));
}

function questionDocId(sanitized) {
  const norm = sanitized.replace(/[\s\p{P}\p{S}]+/gu, "").toLowerCase();
  return crypto.createHash("sha1").update(norm).digest("hex").slice(0, 20);
}

/** Firestore에 기록(실패해도 챗봇 응답에는 영향 없음). */
async function logUnanswered(db, FieldValue, { message, topScore, reply }) {
  if (!isUnanswered({ message, topScore, reply })) return false;
  const q = sanitizeQuestion(message);
  if (!q) return false;
  const ref = db.collection("chat_unanswered").doc(questionDocId(q));
  const snap = await ref.get();
  const now = FieldValue.serverTimestamp();
  if (snap.exists) {
    await ref.update({ count: FieldValue.increment(1), lastAt: now, resolved: false });
  } else {
    await ref.set({
      question: q,
      count: 1,
      topScore: Math.round(topScore * 100) / 100,
      resolved: false,
      createdAt: now,
      lastAt: now,
    });
  }
  return true;
}

module.exports = { WEAK_SCORE, sanitizeQuestion, isUnanswered, questionDocId, logUnanswered };
