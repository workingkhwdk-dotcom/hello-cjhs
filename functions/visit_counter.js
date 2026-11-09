/**
 * 방문자 수 집계 (사이트 전체 + 페이지별)
 * ------------------------------------------------------------
 * 브라우저(js/visitor-counter.js)는 "같은 브라우저가 같은 날(한국 날짜) 처음 열었을 때만" 올리라고 알린다.
 *   newVisit: 오늘 이 사이트(어느 페이지든)에 처음 들어왔다 → 사이트 전체(total / count) +1
 *   newPage : 오늘 이 페이지에 처음 들어왔다               → 그 페이지(p_<page>) +1
 * 그래서 숫자는 모두 "그날 처음 온 브라우저 수"(순 방문자에 가까운 값)이고,
 *   - 사이트 전체 = 어느 페이지로 들어왔든 한 브라우저는 하루 1
 *   - 페이지별   = 그 페이지를 연 브라우저는 하루 1 (한 사람이 메인+챗봇을 다 열면 두 페이지에 각각 1, 사이트 전체에는 1)
 *
 * 저장 위치 (Admin SDK로만 접근 — Firestore 규칙에 별도 허용 없음):
 *   site_stats/visitors                       { total, p_index, p_chatbot, ... }   ← 누적
 *   site_stats_daily/{YYYY-MM-DD(한국 날짜)}   { date, count, p_index, p_chatbot, ... }  ← 일별
 *
 * newVisit / newPage 는 브라우저가 보내는 값이라 조작될 수 있으므로, 같은 IP의 증가 요청은 limiter 로 묶는다
 * (막히면 오류 대신 숫자만 돌려준다 — 방문자 화면에 오류를 띄울 일은 아니므로).
 */

const TOTAL_PATH = ["site_stats", "visitors"];
const DAILY_COLLECTION = "site_stats_daily";
// 집계하는 페이지. 이 목록에 없는 값은 페이지별 집계에서 무시한다(필드가 무한히 늘어나는 것 방지).
//   index: PC 메인·모바일 홈 / chatbot: 챗봇(chatbot.html, 모바일 챗봇 탭) / qna: Q&A / apply: 상담 신청
//   curriculum: 교육과정 원문 / results: 교육활동 결과물
const PAGES = ["index", "chatbot", "qna", "apply", "curriculum", "results"];
const field = (page) => `p_${page}`;

/** db: admin.firestore(), FieldValue: admin.firestore.FieldValue. 테스트에서는 가짜를 넣는다. */
async function recordVisit(db, FieldValue, { newVisit, page, newPage, date }) {
  const totalRef = db.collection(TOTAL_PATH[0]).doc(TOTAL_PATH[1]);
  const dailyRef = db.collection(DAILY_COLLECTION).doc(date);
  const countPage = newPage && PAGES.includes(page);
  if (newVisit || countPage) {
    const inc = FieldValue.increment(1);
    const total = {};
    const daily = { date };
    if (newVisit) { total.total = inc; daily.count = inc; }
    if (countPage) { total[field(page)] = inc; daily[field(page)] = inc; }
    const batch = db.batch();
    batch.set(totalRef, total, { merge: true });
    batch.set(dailyRef, daily, { merge: true });
    await batch.commit();
  }
  const [t, d] = await db.getAll(totalRef, dailyRef);
  const tData = t.exists ? t.data() : {};
  const dData = d.exists ? d.data() : {};
  const pages = {};
  for (const p of PAGES) pages[p] = { today: Number(dData[field(p)]) || 0, total: Number(tData[field(p)]) || 0 };
  return { total: Number(tData.total) || 0, today: Number(dData.count) || 0, pages };
}

module.exports = { recordVisit, TOTAL_PATH, DAILY_COLLECTION, PAGES };
