// firebase-messaging-sw.js
// FCM(Firebase Cloud Messaging) 웹 푸시는 반드시 사이트 루트에 있는
// 이 서비스워커를 통해서만 "백그라운드(탭이 꺼져있거나 다른 탭을 보고
// 있을 때)" 알림을 띄울 수 있다. 관리자가 admin.html / admin-mobile.html
// 에서 로그인하면 이 파일이 등록된다.
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAnGmSChA8ENvs4EM-biLnjG3PNH4JAzXY",
  authDomain: "hello-cjhs.firebaseapp.com",
  projectId: "hello-cjhs",
  storageBucket: "hello-cjhs.firebasestorage.app",
  messagingSenderId: "331353969542",
  appId: "1:331353969542:web:6d528577f2c7a9f0a49207"
});

const messaging = firebase.messaging();

// 탭이 백그라운드일 때 온 메시지를 OS 알림으로 띄운다.
// (탭이 열려서 포커스된 상태일 때는 이 핸들러가 아니라, 관리자 화면의
//  onMessage 콜백이 대신 처리한다 — 웹 푸시의 일반적인 동작 방식.)
//
// 서버(functions/index.js)에서 일부러 notification 필드가 아니라 data
// 필드로만 보낸다 — notification 필드를 쓰면 브라우저가 알림을 자동으로
// 한 번 띄우고, 아래 showNotification() 호출이 또 한 번 띄워서 알림이
// 두 번 뜨는 문제가 있었다. data만 쓰면 자동 표시가 없어지고, 아래
// 코드가 직접 딱 한 번만 띄운다.
messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const title = data.title || "창원중앙고 관리자 알림";
  const link = data.link || "/admin.html";
  self.registration.showNotification(title, {
    body: data.body || "",
    icon: "https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/school/default/24px.svg",
    data: { link }
  });
});

// 알림을 눌렀을 때: 이미 열려 있는 관리자 창이 있으면 그 창을 앞으로 가져와
// 해당 건으로 이동하라고 알려주고, 없으면 새 창을 연다.
// link 예: /admin.html?open=consult&id=문서ID  (관리자 화면이 open/id를 읽어 이동)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/admin.html";
  event.waitUntil((async () => {
    const wins = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = wins.find((c) => /\/admin(-mobile)?\.html/.test(c.url));
    if (existing) {
      try {
        await existing.focus();
        existing.postMessage({ type: "open-link", link });
        return;
      } catch (e) { /* 포커스 실패 시 아래에서 새 창으로 연다 */ }
    }
    await clients.openWindow(link);
  })());
});
