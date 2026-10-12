/**
 * 메인 화면 방문자 수(오늘 / 전체)
 * ------------------------------------------------------------
 * 브라우저(js/visitor-counter.js)가 하루에 한 번만 newVisit:true 로 부르고, 같은 날 다시 열면
 * newVisit:false 로 숫자만 받아 간다. 그래서 "오늘"은 그날 처음 들어온 브라우저 수에 가깝다.
 *
 * 저장 위치 (Admin SDK로만 접근 — Firestore 규칙에 별도 허용 없음):
 *   site_stats/visitors        { total }
 *   site_stats_daily/{YYYY-MM-DD(한국 날짜)} { date, count }
 *
 * newVisit 는 브라우저가 보내는 값이라 조작될 수 있으므로, 같은 IP의 증가 요청은 limiter 로 묶는다
 * (막히면 오류 대신 숫자만 돌려준다 — 방문자 화면에 오류를 띄울 일은 아니므로).
 */

const TOTAL_PATH = ["site_stats", "visitors"];
const DAILY_COLLECTION = "site_stats_daily";

/** db: admin.firestore(), FieldValue: admin.firestore.FieldValue. 테스트에서는 가짜를 넣는다. */
async function recordVisit(db, FieldValue, { newVisit, date }) {
  const totalRef = db.collection(TOTAL_PATH[0]).doc(TOTAL_PATH[1]);
  const dailyRef = db.collection(DAILY_COLLECTION).doc(date);
  if (newVisit) {
    const batch = db.batch();
    batch.set(totalRef, { total: FieldValue.increment(1) }, { merge: true });
    batch.set(dailyRef, { date, count: FieldValue.increment(1) }, { merge: true });
    await batch.commit();
  }
  const [t, d] = await db.getAll(totalRef, dailyRef);
  return {
    total: (t.exists && Number(t.data().total)) || 0,
    today: (d.exists && Number(d.data().count)) || 0,
  };
}

module.exports = { recordVisit, TOTAL_PATH, DAILY_COLLECTION };
