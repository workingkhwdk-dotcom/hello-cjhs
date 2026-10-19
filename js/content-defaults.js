// 메인 페이지(index.html)의 학교소개 5개 탭 기본값.
// admin.html "학교 소개 관리"에서 아직 한 번도 저장하지 않았을 때 보여줄
// 문구이자, index.html이 Firestore에서 못 불러왔을 때(문서가 없거나
// 네트워크 오류) 대신 보여줄 문구이기도 하다.
// index.html과 admin.html 둘 다 이 파일 하나를 가져다 쓴다 — 예전엔
// 두 파일에 같은 내용이 따로 복사돼 있어서, 한쪽만 고치면 서로 어긋날
// 위험이 있었다.
export const SITE_CONTENT_DEFAULTS = {
  greeting: {
    headTitle: '학교장 인사말', tagline: '환영합니다, 창원중앙고입니다',
    paragraphs: [
      '안녕하십니까. 창원중앙고등학교 홈페이지를 찾아주신 예비 신입생과 학부모님께 진심으로 감사드립니다.',
      '본교는 고교학점제를 기반으로 학생 개개인의 진로와 적성을 존중하는 맞춤형 교육과정을 운영하며, 학생 스스로 삶의 방향을 설계하고 그 과정에서 성장할 수 있도록 돕고 있습니다. 교과 수업뿐 아니라 다양한 진로 탐색 프로그램과 특색 활동을 통해 학생들이 자신만의 강점을 발견하고, 이를 대학 진학과 미래 진로로 자연스럽게 이어갈 수 있도록 지원하고 있습니다.',
      '저희 교직원 모두는 학생 한 명 한 명이 존중받으며 배움의 즐거움을 느낄 수 있는 학교, 그리고 학부모님과 함께 소통하며 신뢰를 쌓아가는 학교를 만들기 위해 최선을 다하고 있습니다. 2027학년도 창원중앙고등학교의 새 식구가 되실 예비 신입생 여러분을 진심으로 환영하며, 앞으로도 많은 관심과 성원 부탁드립니다.'
    ],
    signOff: '창원중앙고등학교장 김문섭 드림',
    photoUrl: null
  },
  gallery: {
    headTitle: '학교생활 갤러리', tagline: '꿈을 찾는 오늘, 더 큰 내일로',
    desc: '배움의 울타리를 넘어, 다양한 경험으로 성장하는 창원중앙고의 특별한 하루를 만나보세요.',
    hero: { title: '체육대회', desc: '함께 뛰고 즐기는 학교 공동체 행사', photoUrl: null },
    items: [
      { title: '작은 음악회', desc: '학생자치회가 운영하는 공연', photoUrl: null },
      { title: '동아리 활동', desc: '학생 주도 프로젝트 활동', photoUrl: null },
      { title: '이공계 특강', desc: '진로 탐색 프로그램', photoUrl: null }
    ]
  }
};

// apply.html·mobile.html(상담 신청서) 설정 기본값 — 관리자 "상담 신청 항목 관리"에서 바꾼다.
// 정리·예전 형식 읽기는 js/consult-form.js 의 normalizeApplyOptions 가 맡는다.
// "그 외"(중학교)/"기타"(관심분야)는 직접입력 칸으로 이어지는 특수 보기라
// 여기 목록에는 안 넣는다 — 신청서가 항상 맨 끝에 고정으로 붙인다.
export const APPLY_OPTIONS_DEFAULTS = {
  // 모든 유형 공통 Q2·Q3 보기
  schools: ['반송중', '반림중'],
  topics: ['고교학점제', '창원중앙고 교육과정', '창원중앙고 특색활동', '고등학생 자녀 학습·생활 지원 방법'],
  // Q1 상담 유형 켜기/끄기. 켜진 것만 신청 화면에 나온다.
  // functions/index.js 의 CONSULT_TYPES_DEFAULT 와 같게 유지.
  consultTypes: { online: true, phone: true, visit: false, seminar: false },
  // Q1 버튼·Q4 제목에 쓰는 이름
  typeLabels: { online: '온라인 상담', phone: '전화 상담', visit: '방문/대면 상담', seminar: '입학 설명회 참가 신청' },
  // Q4 맨 위 안내 상자(빈 문자열이면 안 보임)
  typeNotes: {
    phone: '학교 일정을 고려하여 상담 일정을 정한 뒤 미리 안내드리고, 정해진 시간에 전화드립니다.',
    visit: '이 상담은 1:1 상담이 아닌, 여러 학부모님과 함께하는 설명회(1:다수) 형태로 진행됩니다.',
    seminar: '시간·장소 등 자세한 내용은 입력하신 연락처로 미리 안내드립니다.'
  },
  // 방문 상담: 학부모가 고르는 희망 일시(복수 선택)
  visitDates: ['10월 17일(토) 18:30', '10월 19일(월) 18:30', '10월 21일(수) 18:30'],
  // 입학 설명회: 정해진 일시(안내 문구로 보여 주고 신청 기록에 남긴다)
  seminarDate: '11월 7일(토)',
  // 유형별 Q4 질문. 보호자 성함·연락처는 취소 조회에 필요해 항상 고정으로 먼저 묻고, 그 아래에 이 질문들이 나온다.
  // type: 'text'(짧은 답) | 'textarea'(긴 답) | 'choice'(하나 선택) | 'multi'(여러 개 선택), hint: 입력칸 안내 문구
  typeQuestions: {
    phone: [
      { label: '궁금하신 내용', type: 'textarea', options: [], required: true, hint: '전화 상담 시 여쭤보고 싶은 내용을 적어주세요.' }
    ],
    visit: [
      { label: '궁금하신 내용', type: 'textarea', options: [], required: true, hint: '방문 상담에서 여쭤보고 싶은 내용을 적어주세요.' }
    ],
    seminar: [
      { label: '참석 인원', type: 'choice', options: ['1명', '2명', '3명 이상'], required: true, hint: '' },
      { label: '설명회에서 궁금하신 내용', type: 'textarea', options: [], required: false, hint: '설명회에서 특히 듣고 싶은 내용이 있으면 적어주세요.' }
    ]
  }
};
