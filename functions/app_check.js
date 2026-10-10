/**
 * Firebase App Check 검증 (공개 onRequest 함수 공용)
 * ------------------------------------------------------------
 * 왜 필요한가: 함수 주소만 알면 누구나(우리 사이트가 아닌 스크립트도) 호출할 수 있다. 브라우저가
 * reCAPTCHA v3로 받은 App Check 토큰을 `X-Firebase-AppCheck` 헤더로 보내면, 서버가 이 토큰이 우리
 * 사이트에서 온 것인지 확인한다(클라이언트 쪽은 js/app-check.js).
 *
 * 동작 모드 (functions/.env 의 APP_CHECK_ENFORCE 로 결정, 요청 때마다 읽음):
 *   - 값이 "true"가 아니면 monitor: 토큰이 없거나 틀려도 통과시키고 경고 로그만 남긴다.
 *     (사이트 키를 넣고 배포한 직후, 정상 방문자가 토큰을 잘 보내는지 로그·Firebase 콘솔 지표로 확인하는 단계)
 *   - "true"면 enforce: 토큰이 없거나 틀리면 401로 막는다.
 */

const HEADER = "x-firebase-appcheck";
const DENY_MESSAGE = "앱 확인에 실패했어요. 페이지를 새로고침한 뒤 다시 시도해 주세요.";

function readToken(req) {
  const h = req.headers || {};
  const v = h[HEADER] || h["X-Firebase-AppCheck"];
  return typeof v === "string" ? v.trim() : "";
}

/** admin: firebase-admin, logger: firebase-functions/logger. 테스트에서는 가짜를 넣는다. */
function createAppCheckGate({ admin, logger, env = process.env }) {
  /** @returns {Promise<{ok: boolean, reason?: "missing"|"invalid"}>} */
  async function check(req) {
    const token = readToken(req);
    if (!token) return { ok: false, reason: "missing" };
    try {
      await admin.appCheck().verifyToken(token);
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: "invalid" };
    }
  }

  /** 막았으면(401 응답을 보냈으면) true. 호출하는 쪽: if (await appCheckBlocked(req, res)) return; */
  async function appCheckBlocked(req, res) {
    const r = await check(req);
    if (r.ok) return false;
    if (env.APP_CHECK_ENFORCE === "true") {
      logger.warn("App Check 차단", { reason: r.reason });
      res.status(401).json({ error: DENY_MESSAGE, appCheck: r.reason });
      return true;
    }
    logger.warn("App Check 미통과(monitor 모드라 허용)", { reason: r.reason });
    return false;
  }

  return { check, appCheckBlocked };
}

module.exports = { createAppCheckGate, DENY_MESSAGE };
