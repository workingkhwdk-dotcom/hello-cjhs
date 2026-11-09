// Firebase App Check (reCAPTCHA v3) — 우리 사이트가 Cloud Functions를 부를 때 "정상 사이트에서 온 요청"임을 증명하는 토큰을 붙인다.
// 사용법: 아래 SITE_KEY에 reCAPTCHA v3 사이트 키를 넣는다(비어 있으면 아무 일도 하지 않아 사이트는 지금처럼 동작).
// 서버 쪽 검사는 functions/app_check.js. 각 페이지에서 render 스크립트보다 먼저 불러온다.
// 방식: window.fetch를 한 번 감싸, 우리 함수 주소로 가는 요청에만 X-Firebase-AppCheck 헤더를 붙인다.
// 토큰을 못 받으면 헤더 없이 보낸다(서버가 monitor 모드면 통과, enforce 모드면 안내 문구와 함께 거절).
const SITE_KEY = "6LdBI94tAAAAADGI2BOG2Cyf-0qQnuSjvt7lY5A0"; // reCAPTCHA v3 사이트 키(공개해도 되는 키). 비밀 키는 코드에 넣지 않고 Firebase 콘솔 App Check에만 등록
const SDK = "https://www.gstatic.com/firebasejs/10.12.2";
const FUNCTIONS_ORIGIN = "https://asia-northeast3-hello-cjhs.cloudfunctions.net/";
const CONFIG = { apiKey: "AIzaSyAnGmSChA8ENvs4EM-biLnjG3PNH4JAzXY", authDomain: "hello-cjhs.firebaseapp.com", projectId: "hello-cjhs", storageBucket: "hello-cjhs.firebasestorage.app", messagingSenderId: "331353969542", appId: "1:331353969542:web:6d528577f2c7a9f0a49207", measurementId: "G-899YV6G5YB" };

if (SITE_KEY && !window.__cjhsAppCheck) {
  window.__cjhsAppCheck = true;
  // 로컬에서 열어 볼 때는 디버그 토큰을 쓴다(콘솔에 찍힌 토큰을 Firebase 콘솔 → App Check → 디버그 토큰에 등록).
  if (["localhost", "127.0.0.1"].includes(location.hostname)) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;

  // reCAPTCHA(수백 KB 스크립트)는 첫 화면과 경쟁하지 않게 바로 받지 않는다:
  // 우리 함수를 처음 부를 때, 또는 화면이 다 뜨고 한가해졌을 때(미리 준비) 중 먼저 오는 때에 초기화한다. fetch 래퍼는 지금 바로 설치한다.
  let readyP = null;
  const ready = () => readyP || (readyP = (async () => {
    const [{ initializeApp }, { initializeAppCheck, ReCaptchaV3Provider, getToken }] = await Promise.all([import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-app-check.js`)]);
    // 페이지 쪽 initializeApp(같은 설정)은 이미 만들어진 앱을 그대로 돌려받으므로 겹치지 않는다.
    const appCheck = initializeAppCheck(initializeApp(CONFIG), { provider: new ReCaptchaV3Provider(SITE_KEY), isTokenAutoRefreshEnabled: true });
    return () => getToken(appCheck).then(r => r.token);
  })().catch(e => { console.warn("App Check 초기화 실패 — 토큰 없이 진행해요.", e); return null; }));
  const warmUp = () => (window.requestIdleCallback ? requestIdleCallback(ready, { timeout: 3000 }) : setTimeout(ready, 1500));
  if (document.readyState === "complete") warmUp(); else addEventListener("load", warmUp, { once: true });

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input && input.url;
    if (!url || !String(url).startsWith(FUNCTIONS_ORIGIN)) return nativeFetch(input, init);
    let token = "";
    try { const get = await ready(); if (get) token = await get(); } catch (e) { console.warn("App Check 토큰을 받지 못했어요.", e); }
    if (!token) return nativeFetch(input, init);
    const headers = new Headers((init && init.headers) || (typeof input !== "string" && input.headers) || undefined);
    headers.set("X-Firebase-AppCheck", token);
    return nativeFetch(input, { ...(init || {}), headers });
  };
}
