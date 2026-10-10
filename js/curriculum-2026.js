// 2026학년도 입학생 3개년 교육과정 편성표 (창원중앙고등학교) — 원본 PDF 표를 읽기 쉬운 구조로 재배치한 데이터/렌더러.
// 숫자·과목명은 원본 표 그대로. g(성적처리): '5'=성취도 5단계+석차등급O, 'X'=성취도 5단계+석차등급X, '3'=성취도 3단계, 'P'=이수/미이수
// 과목 배열 = [교과(군), 유형, 과목명, 기본학점, 운영학점, 편성학점(해당 학기), 성적처리]

const SEM = ["1학년 1학기", "1학년 2학기", "2학년 1학기", "2학년 2학기", "3학년 1학기", "3학년 2학기"];

// 학교 지정 과목: 학기 인덱스(0~5)별 목록
const FIXED = [
  [ // 1학년 1학기
    ["국어","공통","공통국어1",4,4,4,"5"], ["수학","공통","공통수학1",4,4,4,"5"], ["영어","공통","공통영어1",4,3,3,"5"],
    ["사회","공통","한국사1",3,3,3,"5"], ["사회","공통","통합사회1",4,4,4,"5"],
    ["과학","공통","통합과학1",4,4,4,"5"], ["과학","공통","과학탐구실험1",1,1,1,"3"],
    ["체육","일반","체육1",3,2,2,"3"], ["예술","일반","음악 ↔ 미술",3,2,2,"3"],
    ["기술·가정/정보","일반","기술·가정 ↔ 정보",4,3,3,"5"],
  ],
  [ // 1학년 2학기
    ["국어","공통","공통국어2",4,4,4,"5"], ["수학","공통","공통수학2",4,4,4,"5"], ["영어","공통","공통영어2",4,3,3,"5"],
    ["사회","공통","한국사2",3,3,3,"5"], ["사회","공통","통합사회2",4,4,4,"5"],
    ["과학","공통","통합과학2",4,4,4,"5"], ["과학","공통","과학탐구실험2",1,1,1,"3"],
    ["체육","일반","체육2",3,2,2,"3"], ["예술","일반","음악 ↔ 미술",3,2,2,"3"],
    ["기술·가정/정보","일반","기술·가정 ↔ 정보",4,3,3,"5"],
  ],
  [ // 2학년 1학기
    ["국어","일반","문학",4,4,4,"5"], ["수학","일반","대수",4,4,4,"5"], ["영어","일반","영어Ⅰ",4,4,4,"5"],
    ["체육","진로","스포츠 문화",2,2,2,"3"],
  ],
  [ // 2학년 2학기
    ["국어","일반","화법과 언어",4,4,4,"5"], ["수학","일반","미적분Ⅰ",4,4,4,"5"], ["영어","일반","영어 독해와 작문",4,4,4,"5"],
    ["체육","진로","스포츠 과학",2,2,2,"3"],
  ],
  [ // 3학년 1학기
    ["국어","일반","독서와 작문",4,4,3,"5"], ["수학","일반","확률과 통계",4,3,3,"5"], ["영어","일반","영어Ⅱ",4,3,3,"5"],
    ["체육","융합","스포츠 생활1",3,2,2,"3"],
  ],
  [ // 3학년 2학기
    ["국어","융합","독서 토론과 글쓰기",4,4,3,"5"], ["수학","융합","수학과제 탐구",4,3,3,"5"], ["영어","진로","심화 영어",4,3,3,"5"],
    ["체육","융합","스포츠 생활2",3,2,2,"3"],
  ],
];

// 학생 선택 과목: 선택군. sem = 학기 인덱스, pick = 택N, credit = 과목당 편성학점, total = 군 편성학점
const ELECTIVE = [
  { id:"A", sem:2, pick:3, credit:4, total:12, courses:[
    ["국어","진로","주제 탐구 독서",4,4,"5"], ["수학","진로","인공지능 수학",4,4,"5"], ["영어","융합","미디어 영어",4,4,"5"],
    ["사회","일반","세계시민과 지리",4,4,"5"], ["사회","일반","세계사",4,4,"5"], ["사회","일반","사회와 문화",4,4,"5"], ["사회","진로","윤리와 사상",4,4,"5"],
    ["과학","일반","물리학",4,4,"5"], ["과학","일반","화학",4,4,"5"], ["과학","일반","생명과학",4,4,"5"], ["과학","일반","지구과학",4,4,"5"],
  ]},
  { id:"B", sem:3, pick:3, credit:4, total:12, courses:[
    ["국어","융합","언어생활 탐구",4,4,"5"], ["수학","진로","기하",4,4,"5"], ["수학","진로","경제 수학",4,4,"5"], ["영어","융합","세계 문화와 영어",4,4,"5"],
    ["사회","일반","현대사회와 윤리",4,4,"5"], ["사회","진로","도시의 미래 탐구",4,4,"5"], ["사회","진로","정치",4,4,"5"], ["사회","진로","경제",4,4,"5"],
    ["과학","진로","역학과 에너지",4,4,"5"], ["과학","진로","물질과 에너지",4,4,"5"], ["과학","진로","생물의 유전",4,4,"5"], ["과학","진로","행성우주과학",4,4,"5"],
  ]},
  { id:"C", sem:2, pick:1, credit:4, total:4, courses:[
    ["기술·가정/정보","진로","정보과학",4,4,"5"], ["제2외국어/한문","일반","일본어",4,4,"5"], ["제2외국어/한문","일반","중국어",4,4,"5"],
  ]},
  { id:"D", sem:3, pick:1, credit:4, total:4, courses:[
    ["기술·가정/정보","진로","인공지능 기초",4,4,"5"], ["제2외국어/한문","융합","일본 문화",4,4,"5"], ["제2외국어/한문","융합","중국 문화",4,4,"5"],
  ]},
  { id:"E", sem:4, pick:4, credit:3, total:12, courses:[
    ["국어","진로","문학과 영상",4,3,"5"], ["수학","진로","미적분Ⅱ",4,3,"5"], ["영어","진로","심화 영어 독해와 작문",4,3,"5"],
    ["사회","진로","한국지리 탐구",4,3,"5"], ["사회","진로","동아시아 역사 기행",4,3,"5"], ["사회","진로","법과 사회",4,3,"5"],
    ["사회","융합","사회문제 탐구",4,3,"X"], ["사회","융합","윤리문제 탐구",4,3,"X"],
    ["과학","진로","전자기와 양자",4,3,"5"], ["과학","진로","화학 반응의 세계",4,3,"5"], ["과학","진로","세포와 물질대사",4,3,"5"],
    ["과학","진로","지구시스템과학",4,3,"5"], ["과학","융합","기후변화와 환경생태",4,3,"X"],
    ["기술·가정/정보","진로","로봇과 공학세계",4,3,"5"], ["기술·가정/정보","진로","데이터 과학",4,3,"5"],
  ]},
  { id:"F", sem:4, pick:1, credit:3, total:3, courses:[
    ["예술","진로","음악 연주와 창작",3,3,"3"], ["예술","진로","미술 창작",3,3,"3"],
  ]},
  { id:"G", sem:5, pick:4, credit:3, total:12, courses:[
    ["국어","융합","매체 의사소통",4,3,"5"], ["수학","융합","실용 통계",4,3,"5"], ["영어","융합","실생활 영어 회화",4,3,"5"],
    ["사회","진로","인문학과 윤리",4,3,"5"], ["사회","융합","여행지리",4,3,"X"], ["사회","융합","역사로 탐구하는 현대 세계",4,3,"X"],
    ["사회","융합","사회문제 탐구",4,3,"X"], ["사회","융합","기후변화와 지속가능한 세계",4,3,"X"],
    ["과학","융합","과학의 역사와 문화",4,3,"X"], ["과학","융합","기후변화와 환경생태",4,3,"X"], ["과학","융합","융합과학 탐구",4,3,"X"],
    ["기술·가정/정보","융합","지식 재산 일반",4,3,"5"], ["기술·가정/정보","융합","소프트웨어와 생활",4,3,"5"],
  ]},
  { id:"H", sem:5, pick:1, credit:3, total:3, courses:[
    ["예술","진로","음악 감상과 비평",3,3,"3"], ["예술","진로","미술 감상과 비평",3,3,"3"],
  ]},
  { id:"I", sem:4, pick:1, credit:2, total:2, courses:[
    ["교양","일반","진로와 직업",3,2,"P"], ["교양","일반","생태와 환경",3,2,"P"], ["교양","진로","인간과 심리",3,2,"P"],
    ["교양","진로","교육의 이해",3,2,"P"], ["교양","진로","보건",3,2,"P"], ["교양","융합","인간과 경제활동",3,2,"P"],
  ]},
];

// 원본 표 맨 아래 합계 행 (학기별)
const TOTALS = {
  fixed:    [30, 30, 14, 14, 11, 11],  // 학교 지정 과목 교과 편성 학점 (합 110)
  elective: [0, 0, 16, 16, 17, 15],    // 학생 선택 과목 교과 편성 학점 (합 64)
  subject:  [30, 30, 30, 30, 28, 26],  // 총 교과 편성 학점 (합 174)
  creative: [3, 3, 3, 3, 2, 4],        // 창의적 체험활동 학점 (합 18)
  all:      [33, 33, 33, 33, 30, 30],  // 편성 학점 수 (합 192)
};

const BADGE = { X: ["석차등급 없음", "x"], "3": ["성취도 3단계", "t"], P: ["이수/미이수", "p"] };
const TYPE_CLS = { "공통": "tc", "일반": "tg", "진로": "tj", "융합": "ty" };
const sum = a => a.reduce((x, y) => x + y, 0);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));

function badge(g) {
  const b = BADGE[g];
  return b ? `<span class="cur26-badge ${b[1]}">${b[0]}</span>` : "";
}

const typeChip = t => `<span class="cur26-type ${TYPE_CLS[t] || ""}">${esc(t)}</span>`;
const tag = (cls, text) => `<span class="cur26-tag ${cls}">${text}</span>`;
// 펼침/접힘 토글 안내 버튼(CSS로 열림 상태에 따라 문구·화살표가 바뀜)
const toggle = (open, close) =>
  `<span class="cur26-toggle"><span class="o">${open}</span><span class="c">${close}</span><i aria-hidden="true"></i></span>`;

function course(c, withCredit, hideSubj) {
  const [subj, type, name, base, run, cred, g] = c;
  return `<li class="cur26-course">
    <div class="cur26-course-main">
      ${hideSubj ? "" : `<span class="cur26-subj">${esc(subj)}</span>`}
      <span class="cur26-name">${esc(name)}</span>
      ${typeChip(type)}${badge(g)}
    </div>
    <div class="cur26-credit">${withCredit ? `<b>${cred}</b>학점` : ""}<small>기본 ${base} · 운영 ${run}</small></div>
  </li>`;
}

// 학교 지정 + 학생 선택 전체 과목(이름 기준 중복 제거): [교과, 유형, 과목명, 성적처리]
function allCourses() {
  const m = new Map();
  FIXED.flat().forEach(c => c[2].split(" ↔ ").forEach(n => m.set(n, [c[0], c[1], n, c[6]])));
  ELECTIVE.forEach(g => g.courses.forEach(c => m.set(c[2], [c[0], c[1], c[2], c[5]])));
  return [...m.values()];
}
const namesOf = (g, type) => allCourses().filter(c => c[3] === g && (!type || c[1] === type)).map(c => c[2]);

// 학교 지정 과목의 편성학점을 성적 처리 방식별로 합산 (예: {"5": 92, "3": 18})
function fixedCreditsByGrade() {
  const r = {};
  FIXED.forEach(sem => sem.forEach(c => { r[c[6]] = (r[c[6]] || 0) + c[5]; }));
  return r;
}

const LEGEND = `<div class="cur26-keys">
  <span class="k">과목 유형</span>${["공통", "일반", "진로", "융합"].map(typeChip).join("")}
  <span class="k">성적 표시</span>${badge("X")}${badge("3")}${badge("P")}
  <small>배지가 없는 과목은 ‘성취도 5단계 + 석차등급’으로 기록돼요.</small></div>`;

function splitBar() {
  const f = sum(TOTALS.fixed), e = sum(TOTALS.elective), c = sum(TOTALS.creative), all = f + e + c;
  const w = v => (v / all * 100).toFixed(2);
  return `<div class="cur26-split" role="img" aria-label="${all}학점 = 학교 지정 ${f} + 학생 선택 ${e} + 창의적 체험활동 ${c}">
    <div class="cur26-brace" style="width:${w(f + e)}%"><span>교과 ${f + e}학점</span></div>
    <div class="cur26-splitbar">
      <i class="f" style="width:${w(f)}%">학교 지정 <b>${f}</b></i><i class="e" style="width:${w(e)}%">학생 선택 <b>${e}</b></i><i class="c" style="width:${w(c)}%"><b>${c}</b></i>
    </div></div>`;
}

const semShort = s => s.replace(/(\d)학년 (\d)학기/, "$1-$2");   // "1학년 1학기" → "1-1"

function overview() {
  const max = Math.max(...TOTALS.all);
  const bars = SEM.map((s, i) => {
    const seg = (v, cls) => v ? `<i class="${cls}" style="height:${(v / max * 100).toFixed(2)}%">${v >= 8 ? `<em>${v}</em>` : ""}</i>` : "";
    return `<div class="cur26-col"><div class="cur26-tot">${TOTALS.all[i]}</div><div class="cur26-bar" role="img" aria-label="${s} 합계 ${TOTALS.all[i]}학점">
      ${seg(TOTALS.creative[i], "c")}${seg(TOTALS.elective[i], "e")}${seg(TOTALS.fixed[i], "f")}</div>
      <div class="cur26-colname">${semShort(s)}</div></div>`;
  }).join("");
  const row = (label, arr, cls, total) =>
    `<tr class="${cls}"><th scope="row">${label}</th>${arr.map(v => `<td>${v}</td>`).join("")}<td class="tt">${total}</td></tr>`;
  return {
    total: `
  <div class="cur26-sum">
    <div class="cur26-sumcard"><span>3년간 편성 학점</span><b>192</b></div>
    <div class="cur26-eq">=</div>
    <div class="cur26-sumcard"><span>교과 학점</span><b>174</b></div>
    <div class="cur26-eq">+</div>
    <div class="cur26-sumcard"><span>창의적 체험활동</span><b>18</b></div>
  </div>
  ${splitBar()}`,
    flow: `
  <div class="cur26-chart">${bars}</div>
  <div class="cur26-legend"><span class="f">학교 지정 과목</span><span class="e">학생 선택 과목</span><span class="c">창의적 체험활동</span></div>
  <div class="cur26-tablewrap"><table class="cur26-mini">
    <thead><tr><th></th>${SEM.map(s => `<th>${semShort(s)}</th>`).join("")}<th>합계</th></tr></thead>
    <tbody>
      ${row("학교 지정", TOTALS.fixed, "f", 110)}
      ${row("학생 선택", TOTALS.elective, "e", 64)}
      ${row("교과 합계", TOTALS.subject, "s", 174)}
      ${row("창의적 체험활동", TOTALS.creative, "c", 18)}
      ${row("편성 학점", TOTALS.all, "a", 192)}
    </tbody></table></div>`,
  };
}

// ② 과목 구분과 성적 산출 방식
const RANKS = [["1", 10, "~10%"], ["2", 24, "~34%"], ["3", 32, "~66%"], ["4", 24, "~90%"], ["5", 10, "~100%"]];

function gradeSection() {
  const fc = fixedCreditsByGrade(), ft = sum(Object.values(fc));
  const nm = a => a.map(n => `<span class="cur26-nm">${esc(n)}</span>`).join("");
  // 예시 과목명: 지정한 이름 중 편성표에 실제로 있는 것만 표시
  const ex = (type, wanted) => wanted.filter(n => allCourses().some(c => c[1] === type && c[2] === n)).join(" · ");
  const step = (n, q, body, end) =>
    `<div class="cur26-step${end ? " end" : ""}"><span class="n">STEP ${n}</span><b>${q}</b><span class="cur26-opts">${body}</span></div>`;
  const typeCard = (t, cls, goal, grade, example, warn) => `
    <div class="cur26-tcard ${cls}">
      <div class="cur26-tchead">${typeChip(t)}<b>${t}선택</b></div>
      <p class="cur26-tgoal">${goal}</p>
      <div class="cur26-tgrade"><small>성적 산출</small>${grade}</div>
      <div class="cur26-tex"><small>우리 학교 예시</small>${example}</div>
      <p class="cur26-twarn">${warn}</p>
    </div>`;
  const rec = (cls, head, sample, desc, extra) => `
    <div class="cur26-rec ${cls}">
      <div class="cur26-rechead">${head}</div>
      <div class="cur26-recsample"><small>기록 예시</small>${sample}</div>
      <p>${desc}</p>${extra || ""}
    </div>`;
  const chip = t => `<span class="cur26-sample">${t}</span>`;

  return {
  flow: `
  <p class="cur26-lead">같은 ‘과목’이라도 <b>누가 정했는지</b>, <b>어떤 성격인지</b>, <b>성적이 어떻게 기록되는지</b>는 서로 다른 이야기예요. 세 가지를 나눠서 보면 훨씬 쉬워요.</p>
  <div class="cur26-flow">
    ${step(1, "누가 정하나요?", `${tag("f", "학교 지정")}${tag("e", "학생 선택")}`)}
    <i class="cur26-arrow" aria-hidden="true"></i>
    ${step(2, "어떤 성격인가요?", ["공통", "일반", "진로", "융합"].map(typeChip).join(""))}
    <i class="cur26-arrow" aria-hidden="true"></i>
    ${step(3, "성적은 어떻게 기록되나요?", `<span class="cur26-gfour">과목마다 4가지 중 하나</span>`, true)}
  </div>
  <p class="cur26-key">STEP 1·2는 과목을 구분하는 <b>이름표</b>일 뿐이고, <b>성적 처리 방식(STEP 3)은 과목마다 따로 정해져 있어요.</b> ‘융합선택이라 절대평가겠지’처럼 이름만 보고 짐작하지 마시고, 목록의 <b>배지</b>로 확인해 주세요.</p>`,
  vs: `
  <div class="cur26-vs">
    <div class="cur26-vsrow head"><span></span><span class="f">학교 지정 과목</span><span class="e">학생 선택 과목</span></div>
    <div class="cur26-vsrow"><span class="lb">누가 정하나요</span><span data-l="학교 지정">학교가 정해서 모든 학생이 함께 들어요.</span><span data-l="학생 선택">학생이 선택군에서 직접 골라요.</span></div>
    <div class="cur26-vsrow"><span class="lb">학점</span><span data-l="학교 지정"><b>${sum(TOTALS.fixed)}</b>학점 (1~3학년)</span><span data-l="학생 선택"><b>${sum(TOTALS.elective)}</b>학점 (2~3학년)</span></div>
    <div class="cur26-vsrow same"><span class="lb">성적 산출 규칙</span><span class="both"><b>같아요.</b> 지정이든 선택이든 ‘과목마다 정해진 방식(아래 4가지)’으로 성적이 기록돼요.</span></div>
    <div class="cur26-vsrow"><span class="lb">석차등급을<br>정하는 집단</span><span data-l="학교 지정">같은 과목을 듣는 학년 학생들 안에서 정해져요.</span><span data-l="학생 선택">그 과목을 고른 학생들 안에서 정해져요. 수강 인원이 아주 적은 과목은 처리 방식이 달라질 수 있어 학교 규정을 확인해요.</span></div>
    <div class="cur26-vsrow"><span class="lb">성적 처리별<br>학점</span>
      <span data-l="학교 지정"><span class="cur26-mix"><i class="r" style="flex:${fc["5"] || 0}">${fc["5"] || 0}</i><i class="t" style="flex:${fc["3"] || 0}">${fc["3"] || 0}</i></span><small>석차등급 있는 과목 ${fc["5"] || 0}학점 + 성취도 3단계 과목 ${fc["3"] || 0}학점 (합 ${ft})</small></span>
      <span data-l="학생 선택">고르는 과목에 따라 달라져요. 석차등급 없는 과목·3단계·이수/미이수 과목이 섞여 있어요.</span></div>
  </div>`,
  types: `
  <div class="cur26-types">
    ${typeCard("일반", "tg", "각 교과의 <b>기본 내용</b>을 배우는 과목", `<b>성취도 A~E + 석차등급 1~5</b>가 원칙`, ex("일반", ["문학", "대수", "영어Ⅰ", "물리학"]), "이름이 ‘일반’이라고 쉬운 과목은 아니에요.")}
    ${typeCard("진로", "tj", "관심 분야를 <b>더 깊게</b> 파고드는 과목", `일반선택과 <b>같은 방식</b><br>(성취도 A~E + 석차등급 1~5)`, ex("진로", ["인공지능 수학", "미적분Ⅱ", "정치", "주제 탐구 독서"]), "예전 ‘진로선택=A·B·C 성취도만’ 방식과는 달라졌어요.")}
    ${typeCard("융합", "ty", "여러 교과를 엮어 <b>실생활·사회 문제</b>와 연결하는 과목", `대부분 석차등급까지 기록, <b>사회·과학 융합 일부는 성취도 A~E만</b>(석차등급 없음)`, ex("융합", ["독서 토론과 글쓰기", "수학과제 탐구", "미디어 영어"]) + `<br>${badge("X")} ${namesOf("X").slice(0, 2).join(" · ")}`, "석차등급이 없어도 수행평가·이수 기준은 그대로예요.")}
  </div>
  <p class="cur26-note">※ 체육·예술·과학탐구실험은 유형과 관계없이 <b>성취도 3단계(A~C)</b>, 교양 과목은 <b>이수/미이수(P)</b>로 기록돼요.</p>`,
  recs: `
  <div class="cur26-recs">
    ${rec("r1", `<span class="cur26-nobadge">배지 없음</span><b>성취도 5단계 + 석차등급</b>`, `${chip("성취도 A")}${chip("2등급")}`, "가장 많은 유형이에요. 성취도(A~E)와 석차등급(1~5등급)이 함께 기록돼요. 공통·일반·진로 과목 대부분, 융합선택 중 사회·과학 일부를 뺀 과목이 여기에 해당해요.",
      `<div class="cur26-rank">${RANKS.map(([n, w, l]) => `<i style="flex:${w}"><b>${n}등급</b><small>${l}</small></i>`).join("")}</div><small class="cur26-rankcap">상위 누적 비율 (같은 과목을 들은 학생들 안에서)</small>`)}
    ${rec("r2", `${badge("X")}<b>성취도 5단계만</b>`, `${chip("성취도 B")}${chip("석차등급 —")}`, "성취도(A~E)는 기록되지만 석차등급은 산출되지 않아요. 우리 학교 편성표에서는 사회·과학 융합선택 과목이에요.", `<div class="cur26-names">${nm(namesOf("X"))}</div>`)}
    ${rec("r3", `${badge("3")}<b>성취도 3단계 (A~C)</b>`, `${chip("성취도 B")}`, "체육·예술 계열과 과학탐구실험이에요. 석차등급은 없어요.", "")}
    ${rec("r4", `${badge("P")}<b>이수/미이수</b>`, `${chip("이수")}`, "점수 대신 이수했는지만 기록하는 교양 과목이에요.", `<div class="cur26-names">${nm(namesOf("P"))}</div>`)}
  </div>
  <p class="cur26-note">※ 성적(성취도·석차등급)과 <b>학점을 얻는 조건</b>(수업의 3분의 2 이상 출석 등)은 서로 다른 기준이에요. 세부 기준은 제도 개편으로 바뀔 수 있어 학교 안내를 함께 확인해 주세요.</p>`,
  };
}

function fixedSection() {
  const grades = [0, 1, 2].map(gi => {
    const sems = [gi * 2, gi * 2 + 1].map(si => `
      <div class="cur26-sem">
        <div class="cur26-semhead"><h5>${SEM[si]}</h5><span>학교 지정 <b>${TOTALS.fixed[si]}</b>학점${TOTALS.elective[si] ? ` · 선택 <b>${TOTALS.elective[si]}</b>학점` : ""}</span></div>
        <ul class="cur26-list">${FIXED[si].map(c => course(c, true)).join("")}</ul>
      </div>`).join("");
    return `<div class="cur26-gradepanel${gi === 0 ? " on" : ""}" data-g="${gi}">${sems}</div>`;
  }).join("");
  return `${LEGEND}
  <div class="cur26-seg" role="tablist">
    ${["1학년", "2학년", "3학년"].map((n, i) => `<button type="button" class="${i === 0 ? "on" : ""}" data-g="${i}">${n}</button>`).join("")}
  </div>${grades}
  <p class="cur26-note">‘음악 ↔ 미술’, ‘기술·가정 ↔ 정보’는 두 과목이 한 칸에 함께 묶여 있는 과목입니다. 반별 배정 방식 등 자세한 운영은 교무실(055-239-3109)에서 안내받으실 수 있어요.</p>`;
}

// 학기별 선택군 조립도: "이 학기엔 어느 선택군에서 몇 과목을 골라 몇 학점이 되는가"
function slotCards() {
  return [2, 3, 4, 5].map(si => {
    const gs = ELECTIVE.filter(g => g.sem === si);
    const total = sum(gs.map(g => g.total));
    const rows = gs.map(g => `<a href="#cur26-g-${g.id}" class="cur26-pickrow">
        <span class="cur26-gid sm">${g.id}군</span>
        <span class="cur26-pickinfo"><b>${g.courses.length}개 중 ${g.pick}과목 고르기</b><small>과목당 ${g.credit}학점${g.pick > 1 ? ` × ${g.pick}` : ""}</small></span>
        <span class="cur26-dots" aria-hidden="true">${"<i></i>".repeat(g.pick)}</span>
        <span class="cur26-pickcr"><b>${g.total}</b>학점</span></a>`).join('<div class="cur26-plus" aria-hidden="true">＋</div>');
    return `<div class="cur26-slotcard">
      <div class="cur26-slothead"><h5>${SEM[si]}</h5></div>
      ${rows}
      <div class="cur26-slotsum"><span>선택 과목 합계</span><span>= <b>${total}</b>학점</span></div>
      <small class="cur26-slotnote">학교 지정 ${TOTALS.fixed[si]}학점과 합쳐 교과 ${TOTALS.subject[si]}학점</small>
    </div>`;
  }).join("");
}

function groupBadges(g) {
  return ["X", "3", "P"].map(k => {
    const n = g.courses.filter(c => c[5] === k).length;
    return n ? `<span class="cur26-badge ${BADGE[k][1]}">${BADGE[k][0]} ${n === g.courses.length ? "전 과목" : n + "과목"}</span>` : "";
  }).join("");
}

function electiveSection() {
  const cards = ELECTIVE.map(g => {
    const bySubj = [];
    g.courses.forEach(c => { let e = bySubj.find(x => x[0] === c[0]); if (!e) bySubj.push(e = [c[0], []]); e[1].push(c); });
    return `<details class="cur26-group" id="cur26-g-${g.id}">
      <summary><span class="cur26-gid">${g.id}군</span>
        <span class="cur26-gtxt"><b>${SEM[g.sem]}</b> · ${g.courses.length}과목 중 <b>${g.pick}과목</b> 선택<small>과목당 ${g.credit}학점${g.pick > 1 ? ` × ${g.pick} = ${g.total}학점` : ""}</small>${groupBadges(g)}</span>
        ${toggle("과목 보기", "접기")}</summary>
      <div class="cur26-gbody">${bySubj.map(([s, cs]) => `<div class="cur26-gsubj"><h6>${esc(s)}</h6><ul class="cur26-list">${cs.map(c => course([c[0], c[1], c[2], c[3], c[4], g.credit, c[5]], false, true)).join("")}</ul></div>`).join("")}</div>
    </details>`;
  }).join("");
  return `<p class="cur26-lead">학기마다 아래 <b>선택군</b>에서 정해진 수만큼 과목을 골라요. 선택군을 누르면 해당 과목 목록으로 이동해요.</p>
    <div class="cur26-slotcards">${slotCards()}</div>
    ${LEGEND}
    ${cards}`;
}

const term = (tg, body) => `<div class="cur26-term">${tg}<p>${body}</p></div>`;
const terms = items => `<div class="cur26-terms">${items.join("")}</div>`;

// 접힘 카테고리(큰 묶음) / 그 안의 작은 접힘. name 속성 덕분에 지원 브라우저에서는 큰 묶음이 한 번에 하나만 펼쳐진다.
const cat = (n, title, sub, body, group = "cur26-cat") => `<details class="cur26-group cur26-cat" name="${group}">
  <summary><span class="cur26-gid">${n}</span><span class="cur26-gtxt"><b>${title}</b><small>${sub}</small></span>${toggle("펼쳐 보기", "접기")}</summary>
  <div class="cur26-catbody">${body}</div></details>`;
const part = (title, body) => `<details class="cur26-group cur26-sub">
  <summary><span class="cur26-gtxt"><b>${title}</b></span>${toggle("보기", "접기")}</summary>
  <div class="cur26-catbody">${body}</div></details>`;

// ‘표 한 줄 읽어보기’ 번호 해설
function readGuide() {
  return `<div class="cur26-read">
    <div class="cur26-readrow">
      <span class="mk">1</span><span class="cur26-subj">국어</span>
      <span class="mk">2</span><span class="cur26-name">공통국어1</span>
      <span class="mk">3</span>${typeChip("공통")}
      <span class="cur26-readcr"><span class="mk">4</span><b>4</b>학점 <span class="mk">5</span><small>기본 4 · 운영 4</small></span>
    </div>
    <ol class="cur26-readkey">
      <li><span class="mk">1</span><b>교과</b> 국어·수학 같은 교과 이름</li>
      <li><span class="mk">2</span><b>과목명</b></li>
      <li><span class="mk">3</span><b>유형</b> 공통·일반·진로·융합</li>
      <li><span class="mk">4</span><b>편성 학점</b> 이 학기에 실제로 수업하는 학점</li>
      <li><span class="mk">5</span><b>기본·운영</b> 참고용 숫자</li>
    </ol>
    <p>→ <b>1학년 1학기에 모두가 듣는 국어 기초 과목이고, 한 학기에 4학점(주 4번 정도) 수업합니다.</b></p>
  </div>`;
}

// 기초 → 심화 순서의 6개 카테고리. 각 카테고리는 처음엔 접혀 있고, 누르면 펼쳐진다.
function categories() {
  const ov = overview(), gr = gradeSection();
  return [
    cat(1, "고교학점제가 뭐예요?", "학점이 무엇이고, 졸업하려면 얼마나 필요한지",
      `<p class="cur26-lead">대학교처럼 <b>듣고 싶은 수업을 골라 듣고</b>, 과목마다 ‘학점’을 모아서 졸업하는 제도예요. 3년 동안 <b>192학점 이상</b>을 얻어야 졸업합니다.</p>
      ${ov.total}
      ${terms([
        term(tag("k", "학점이 뭐예요?"), "1학점은 한 학기 동안 <b>50분 수업을 16번</b> 듣는 분량이에요. 4학점 과목이라면 한 학기에 대략 주 4번 수업이 있다고 보시면 돼요."),
        term(tag("k", "192학점은 어떻게 채우나요?"), "교과(국어·수학 같은 과목) <b>174학점</b> + 창의적 체험활동 <b>18학점</b>이에요. 교과 174학점은 학교가 정한 110학점과 학생이 고르는 64학점으로 나뉘어요."),
        term(tag("c", "창의적 체험활동"), "교과 수업 말고 학생회·학급 활동, 동아리, 진로 탐색 활동을 하는 시간이에요. 3년간 18학점이며 점수 대신 참여 여부를 기록해요."),
      ])}`),
    cat(2, "3년은 어떻게 흘러가나요?", "학기마다 몇 학점을 듣는지",
      `<p class="cur26-lead"><b>1학년은 모든 학생이 같은 과목</b>을 들어요(학기마다 30학점). <b>2학년 1학기부터</b> 내가 고르는 과목이 생기고, 2~3학년은 학기마다 15~17학점을 직접 골라요.</p>
      ${ov.flow}`),
    cat(3, "과목에는 어떤 종류가 있나요?", "학교 지정 · 학생 선택 · 공통/일반/진로/융합",
      `${gr.flow}
      ${part("누가 정하나요? — 학교 지정 · 학생 선택", terms([
        term(tag("f", "학교 지정 과목"), "학교가 정해 두어 모든 학생이 함께 배우는 과목이에요(총 110학점)."),
        term(tag("e", "학생 선택 과목 · 선택군"), "2~3학년에 학생이 직접 고르는 과목이에요(총 64학점). 같은 학기에 함께 열리는 선택 과목을 묶은 것이 <b>선택군(A~I군)</b>이고, ‘11과목 중 3과목’처럼 그 묶음에서 정해진 수만큼 고르면 돼요."),
      ]))}
      ${part("어떤 성격인가요? — 공통 · 일반 · 진로 · 융합", terms([
        term(typeChip("공통"), "1학년이 모두 배우는 기초 과목이에요. 공통국어·공통수학·공통영어·통합사회·통합과학·한국사 등이 있어요."),
        term(typeChip("일반"), "각 교과의 기본 내용을 배우는 과목이에요. 예) 문학, 대수, 영어Ⅰ, 물리학"),
        term(typeChip("진로"), "진로·적성에 맞춰 한 걸음 더 깊이 배우는 과목이에요. 예) 인공지능 수학, 미적분Ⅱ, 정치"),
        term(typeChip("융합"), "여러 교과를 엮거나 실생활·사회 문제와 연결해 배우는 과목이에요. 예) 독서 토론과 글쓰기, 기후변화와 환경생태"),
      ]))}`),
    cat(4, "성적은 어떻게 기록되나요?", "성취도 · 석차등급 · 학점을 얻는 조건",
      `<p class="cur26-lead">성적은 <b>‘목표에 얼마나 도달했나’(성취도)</b>와 <b>‘같은 과목을 들은 학생들 속에서 어디쯤인가’(석차등급)</b> 두 가지로 나뉘어요. 아래 칸을 하나씩 열어 보세요.</p>
      ${part("성취도와 석차등급이 뭐예요?", terms([
        term(tag("k", "성취도 (A~E)"), "정해진 학습 목표에 얼마나 도달했는지를 A~E 5단계로 나타내요. 친구와 비교하지 않는 절대평가예요."),
        term(tag("k", "석차등급 (1~5등급)"), "같은 과목을 배운 학생들 속에서의 상대 위치예요. 상위 10%까지 1등급, 누적 34%까지 2등급, 66%까지 3등급, 90%까지 4등급, 나머지가 5등급이에요."),
      ]))}
      ${part("성적 표시는 4가지예요", gr.recs)}
      ${part("과목 성격(일반·진로·융합)에 따라 달라요?", gr.types)}
      ${part("학교 지정 vs 학생 선택 — 성적 산출은 어떻게 다를까?", gr.vs)}
      ${part("학점은 어떻게 얻나요?", terms([
        term(tag("k", "학점 이수 조건"), "수업의 <b>3분의 2 이상 출석</b>해야 하고, 1학년 공통과목은 여기에 <b>학업성취율 40% 이상</b>이 더해져요. 기준에 못 미칠 것 같으면 학교가 보충 지도를 해 주니 너무 걱정하지 않으셔도 됩니다. (이수 기준은 제도 개편으로 바뀔 수 있어 학교 안내를 함께 확인해 주세요.)"),
      ]))}`),
    cat(5, "학교 지정 과목", "모두가 같이 듣는 과목 · 1~3학년 · 총 110학점",
      `${part("표 읽는 법 먼저 보기", `${terms([
        term(tag("k", "편성 학점"), "그 학기에 <b>실제로 수업하는 학점</b>이에요. 표의 오른쪽에 크게 적힌 ‘N학점’이 바로 이 숫자이니, 이것만 보셔도 충분해요."),
        term(tag("k", "기본학점 · 운영학점"), "기본학점은 교육부가 과목마다 정해 둔 표준 학점이고, 운영학점은 학교가 교육부 기준 안에서 학생·학교 사정에 맞게 정한 학점이에요. 예를 들어 기본 4학점인 과목을 3학점으로 운영하기도 합니다."),
      ])}${readGuide()}`)}
      ${fixedSection()}`),
    cat(6, "학생 선택 과목", "내가 고르는 과목 · 2~3학년 · 총 64학점",
      electiveSection()),
  ].join("");
}

// 큰 카테고리를 펼치면 그 칸의 맨 위로 부드럽게 이동(다른 칸이 접히며 위치가 밀리는 것을 보정)
export function wireCats(el) {
  el.querySelectorAll(".cur26-cat").forEach(d => d.addEventListener("toggle", () => {
    if (d.open) d.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
}

export function renderCurriculum(el) {
  if (!el) return;
  el.innerHTML = `<section class="cur26">
    <div class="cur26-title"><h4>2027학년도 입학생 3개년 교육과정 편성표</h4></div>
    <p class="cur26-lead">한 번에 다 읽지 않아도 돼요. <b>1번부터 차례대로</b> 눌러 보세요. 궁금한 것은 챗봇 중앙이에게 물어보셔도 좋아요.</p>
    ${categories()}
    <a class="cur26-orig" href="curriculum-original.html">원본 편성표 보기</a>
  </section>`;
  wireCats(el);
  el.querySelectorAll(".cur26-seg button").forEach(b => b.addEventListener("click", () => {
    el.querySelectorAll(".cur26-seg button").forEach(x => x.classList.toggle("on", x === b));
    el.querySelectorAll(".cur26-gradepanel").forEach(p => p.classList.toggle("on", p.dataset.g === b.dataset.g));
  }));
  el.querySelectorAll('a[href^="#cur26-"]').forEach(a => a.addEventListener("click", e => {
    e.preventDefault();
    const d = el.querySelector(a.getAttribute("href")); if (!d) return;
    if (d.tagName === "DETAILS") d.open = true;
    d.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
}

// 플래너 등 같은 탭의 다른 모듈이 같은 편성표를 쓰도록 공개
export { SEM, FIXED, ELECTIVE, TOTALS, typeChip, badge, cat };

// 검증용(테스트에서만 사용)
export const _data = { SEM, FIXED, ELECTIVE, TOTALS, sum };
