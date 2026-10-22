// '학교 박람회' 탭 — 2027학년도 고등학교 입학 상담 및 학교 박람회(2026.11.7 토) 포스터를 화면에 맞게 다시 짠 것.
// PC(index, 학교소개의 '학교 박람회' 탭)와 모바일(mobile, 하단 '학교 박람회' 탭)이 함께 쓴다. 레이아웃 차이는 css/style.css의 .sf-* 규칙(화면 폭 기준)이 맡는다.
// 포스터 윗부분(제목·사진)은 image/school-fair-hero.webp?v=22cb4e70 한 장으로, 나머지(일시·장소·프로그램·사전 신청)는 글자로 옮겼다.
// 장소는 바뀔 수 있어 모두 "(예정)"으로 표시하고, 확정되면 추후 안내한다(PLACE_NOTE).

export const FAIR = {
  // 행사 다음 날 0시(한국 시간)가 되면 박람회 버튼·탭·화면·첫 방문 안내를 모두 없앤다(setupSchoolFair).
  day: new Date("2026-11-07T00:00:00+09:00"),
  endsAt: new Date("2026-11-08T00:00:00+09:00"),
  applyUrl: "https://script.google.com/macros/s/AKfycbw1kJhe1LRRiqvqRnF98uJ0Xfjvs3uEkK0fQv3fwXe__mczApRbZZAWF5SDUsOK9UUJ/exec", // 1:1 맞춤형 상담 사전 신청 페이지(학교 제공, 2026-10-22)
};

export const fairEnded = (now = new Date()) => now >= FAIR.endsAt;

function ddayLabel(now = new Date()) {
  if (fairEnded(now)) return "행사 종료";
  const kstDay = (d) => Math.floor((d.getTime() + 9 * 3600e3) / 86400e3);
  const n = kstDay(FAIR.day) - kstDay(now);
  return n <= 0 ? "오늘 열려요" : `D-${n}`;
}

const PLACE_NOTE = "장소는 바뀔 수 있어요. 확정된 장소는 추후 안내됩니다.";

const ZONES = [
  { key: "a", title: "특강", time: "10:00 ~ 11:00", place: "용덕관(예정)", items: ["고교학점제", "교육과정 편성", "과목선택의 중요성", "대입전형"] },
  { key: "b", title: "체험 부스", time: "11:10 ~ 12:40", place: "용비관 강당(예정) · 6개 부스", items: ["AI랑 교실에서 놀자", "두근두근, 나의 동아리 찾기", "꿈을 그리는 디자인 LAB", "재학생과의 토크"] },
  { key: "c", title: "1:1 맞춤형 상담", time: "11:10 ~ 12:40", place: "본관 · 회차별 선착순 10명", items: ["진로별 선택과목", "학교 특색 프로그램", "학교생활기록부 및 대입", "고등학교 생활 전반"] },
  { key: "d", title: "전시", time: "11:10 ~ 12:40", place: "도서관 학습카페·중강의실(예정)", items: ["교육과정 편제표 및 선택과목 예시", "본교 채택 교과서 전시", "교육활동 사진 및 영상"] },
];

const ICON = {
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  car: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 17h14M5 17a2 2 0 1 0 4 0M15 17a2 2 0 1 0 4 0M3 17v-5l2-5h14l2 5v5"/><path d="M3 12h18"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5Z"/></svg>',
};

/**
 * @param {HTMLElement} el   그려 넣을 자리(#school-fair)
 * @param {{chatHref?:string, chatGoto?:string}} opt  PC는 chatbot.html로 이동, 모바일은 챗봇 탭(data-goto)으로 전환
 */
export function renderSchoolFair(el, opt = {}) {
  if (!el) return;
  const ended = fairEnded();
  const chatAttr = opt.chatGoto ? `type="button" data-goto="${opt.chatGoto}"` : `href="${opt.chatHref || "chatbot.html"}"`;
  const chatTag = opt.chatGoto ? "button" : "a";
  el.innerHTML = `
  <div class="sf">
    <figure class="sf-hero">
      <img src="image/school-fair-hero.webp?v=22cb4e70" width="1600" height="886" decoding="async" alt="2027학년도 예비 고등학생 및 학부모와 함께하는 고교학점제 박람회 — 고등학교 입학 상담 및 학교 박람회. 선택의 중심에서 미래의 길을 찾다. 보고, 듣고, 묻고, 체험하는 하루">
      <span class="sf-dday${ended ? " is-ended" : ""}">${ddayLabel()}</span>
    </figure>

    <div class="sf-facts">
      <div class="sf-fact"><div class="sf-fact-k">${ICON.cal}일시</div><div class="sf-fact-v">2026. 11. 7. (토) 10:00 ~ 13:00</div><div class="sf-fact-s">09:30부터 등록</div></div>
      <div class="sf-fact"><div class="sf-fact-k">${ICON.pin}장소</div><div class="sf-fact-v">교내</div><div class="sf-fact-s">리플릿 안내 예정</div></div>
      <div class="sf-fact"><div class="sf-fact-k">${ICON.users}대상</div><div class="sf-fact-v">예비 고등학생 및 학부모</div></div>
      <div class="sf-fact"><div class="sf-fact-k">${ICON.car}주차 안내</div><div class="sf-fact-v">본관 뒤편 주차장</div><div class="sf-fact-s">주차 공간이 협소하니 가급적 도보나 대중교통을 이용해 주세요.</div></div>
    </div>

    <section class="sf-sec">
      <h4 class="sf-h">당일 시간표</h4>
      <ol class="sf-tt">
        <li><time>09:30 ~</time><div class="sf-tt-b"><b>현장 접수 및 등록</b><span>학생회가 등록·행사 안내와 현장 접수를 진행해요</span></div></li>
        <li class="sf-a"><time>10:00 ~ 11:00</time><div class="sf-tt-b"><b>특강 (공통 강의)</b><span>용덕관(예정)</span></div></li>
        <li class="sf-tt-multi"><time>11:10 ~ 12:40</time>
          <div class="sf-tt-par">
            <div class="sf-c"><b>1:1 맞춤형 상담</b><span>본관 · 회차별 선착순 10명</span>
              <ol class="sf-rounds"><li><em>1회차</em>11:10 ~ 11:40</li><li><em>2회차</em>11:40 ~ 12:10</li><li><em>3회차</em>12:10 ~ 12:40</li></ol></div>
            <div class="sf-b"><b>체험 부스</b><span>용비관 강당(예정) · 6개 부스</span></div>
            <div class="sf-d"><b>전시</b><span>도서관 학습카페·중강의실(예정)</span></div>
          </div>
          <p class="sf-tt-tip">체험 부스와 전시는 이 시간 동안 자유롭게 오가며 둘러볼 수 있어요.</p>
        </li>
        <li><time>13:00</time><div class="sf-tt-b"><b>정리</b><span>박람회 기념품 배부 및 행사장 정리</span></div></li>
      </ol>
      <p class="sf-place-note">${PLACE_NOTE}</p>
    </section>

    <section class="sf-sec">
      <h4 class="sf-h">프로그램</h4>
      <div class="sf-zones">
        ${ZONES.map((z) => `
        <div class="sf-zone sf-${z.key}">
          <div class="sf-badge" aria-hidden="true">${z.key.toUpperCase()}<small>존</small></div>
          <div class="sf-zone-body">
            <div class="sf-zone-t"><span class="sr-only">${z.key.toUpperCase()}존 </span>${z.title}</div>
            <div class="sf-zone-time">${z.time}</div>
            <div class="sf-zone-place">${z.place}</div>
            <ul>${z.items.map((i) => `<li>${i}</li>`).join("")}</ul>
          </div>
        </div>`).join("")}
      </div>
      <p class="sf-note">* 운영 상황에 따라 일정 및 프로그램 구성이 일부 변동될 수 있습니다. 존별 장소는 바뀔 수 있으며, 확정된 장소는 추후 안내됩니다.</p>
    </section>

    <section class="sf-sec sf-apply">
      <div class="sf-apply-main">
        <h4 class="sf-h">1:1 맞춤형 상담 사전 신청</h4>
        <p class="sf-period"><b>신청기간</b> 2026. 10. 22. (목) 10:00 ~ 선착순 마감</p>
        <ul class="sf-rules">
          <li><span class="c">1:1 상담</span>은 <b>회차(타임)별 선착순 10명</b> 마감, 예비 3명 추가 접수</li>
          <li>마감되어도 <b>당일 현장 접수</b>로 상담에 참여할 수 있어요</li>
          <li>세부 상담 장소(본관)는 신청을 마친 분께 입력한 연락처로 문자 안내해요</li>
          <li><span class="a">특강</span> · <span class="b">체험 부스</span> · <span class="d">전시</span>는 사전 신청 없이 현장에서 자유 참여</li>
        </ul>
        <div class="sf-btns">
          ${ended ? "" : `<a class="sf-btn sf-btn-apply" href="${FAIR.applyUrl}" target="_blank" rel="noopener">1:1 맞춤형 상담 사전 신청${ICON.arrow}</a>`}
          <${chatTag} class="sf-btn sf-btn-chat" ${chatAttr}>${ICON.chat}중앙이에게 박람회 물어보기</${chatTag}>
        </div>
      </div>
      ${ended ? "" : `<div class="sf-qr" hidden><div class="sf-qr-img"></div><div class="sf-qr-cap">휴대폰 카메라로 찍으면<br>사전 신청 화면이 열려요</div></div>`}
    </section>

  </div>`;

  // PC에서만 의미 있는 QR(휴대폰으로 넘겨 신청). 화면에 안 보이는(모바일) 경우 CSS가 숨긴다.
  const qr = el.querySelector(".sf-qr");
  if (qr) {
    import("./vendor/qrcode-generator.js").then(({ default: qrcode }) => {
      const q = qrcode(0, "M");
      q.addData(FAIR.applyUrl);
      q.make();
      qr.querySelector(".sf-qr-img").innerHTML = q.createSvgTag({ scalable: true, margin: 1 }).replace("<svg ", '<svg role="img" aria-label="1:1 맞춤형 상담 사전 신청 QR 코드" ');
      qr.hidden = false;
    }).catch((e) => console.error(e));
  }
}

// 박람회 관련 화면 요소(PC 버튼·패널, 모바일 하단 탭·화면). 행사가 끝나면 모두 지운다.
const FAIR_NODES = '#fair-open-btn, .tab-panel[data-panel="fair"], .m-tab[data-sec="fair"], .m-section[data-sec="fair"]';

/** 행사 종료(2026-11-08 00:00 KST) 뒤에는 박람회 요소를 지우고, 열려 있던 화면은 홈/인사말로 돌린다. */
export function removeSchoolFair() {
  document.querySelector(".mt-layer[data-fair] .mt-skip")?.click(); // 떠 있는 박람회 안내 말풍선 닫기
  const mobileOpen = document.querySelector('.m-section.on[data-sec="fair"]');
  const pcOpen = document.querySelector('.tab-panel.on[data-panel="fair"]');
  document.querySelectorAll(FAIR_NODES).forEach((n) => n.remove());
  if (mobileOpen) showMobileSection("home");
  if (pcOpen) {
    document.querySelector('.content-tabs button[data-tab="greeting"]')?.classList.add("on");
    document.querySelector('.tab-panel[data-panel="greeting"]')?.classList.add("on");
  }
}

// mobile.app.js의 goToSection과 같은 동작(앱 로직이 아직 안 불렸어도 쓸 수 있게 따로 둔다)
function showMobileSection(name) {
  document.querySelectorAll(".m-section").forEach((s) => s.classList.toggle("on", s.dataset.sec === name));
  document.querySelectorAll(".m-tab").forEach((b) => b.classList.toggle("on", b.dataset.sec === name));
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

/**
 * 렌더 직후 한 번 부른다(PC·모바일 공통). 종료 전이면 내용을 그리고 버튼을 연결하며,
 * 페이지를 연 채로 종료 시각을 넘기면 그때 지운다.
 */
export function setupSchoolFair(opt = {}) {
  if (fairEnded()) { removeSchoolFair(); return; }
  renderSchoolFair(document.getElementById("school-fair"), opt);
  // PC: 탭 상자 밖 독립 버튼 → 학교소개 안에 박람회 패널을 연다. 다른 탭을 누르면 버튼 강조를 끈다.
  document.getElementById("fair-open-btn")?.addEventListener("click", openFairTab);
  document.querySelectorAll(".content-tabs button").forEach((b) =>
    b.addEventListener("click", () => document.getElementById("fair-open-btn")?.classList.remove("on")));
  openFairFromUrl();
  const left = FAIR.endsAt - Date.now();
  if (left < 864e5) setTimeout(removeSchoolFair, left + 1000);
}

/** '학교 박람회'를 연다(첫 방문 안내 버튼, 주소의 ?tab=fair 에서 사용). 모바일은 하단 탭, PC는 학교소개 안의 패널. */
export function openFairTab() {
  if (document.querySelector('.m-tab[data-sec="fair"]')) return showMobileSection("fair");
  const panel = document.querySelector('.tab-panel[data-panel="fair"]');
  if (!panel) return;
  document.querySelectorAll(".content-tabs button").forEach((b) => b.classList.remove("on"));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("on"));
  panel.classList.add("on");
  document.getElementById("fair-open-btn")?.classList.add("on");
}

export function openFairFromUrl() {
  const q = new URLSearchParams(location.search);
  if (q.get("tab") === "fair" || q.get("section") === "fair") openFairTab();
}
