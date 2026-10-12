# 창원중앙고 입학 상담 사이트 — Firebase 연동 스캐폴드

## 폴더 구조
```
.
├── index.html          메인 페이지 (학교소개 / 입학신청 / AI챗봇 바로가기, 학교소개 탭 오른쪽에 Q&A 링크)
├── apply.html          입학 상담 신청 폼 (Q1~Q4 문항 + 취소용 비밀번호, Cloud Function createConsultation으로 접수)
├── chatbot.html         AI 입학 상담 챗봇 UI (Cloud Function 호출, 답변에 굵게/색상/표 등 서식 지원)
├── qna.html             입학 상담 Q&A 게시판 (로그인 없이 비밀번호로 본인 확인, "qna_questions" 컬렉션)
├── admin.html            관리자 페이지 — 상담 신청 현황 / 상담 신청 항목 관리 / Q&A 관리 / 학교 소개 관리 / 휴지통 탭 (Firebase Auth 로그인 필요, PC 전용)
├── mobile.html           모바일 통합 페이지 — 홈/상담신청/챗봇/Q&A를 한 파일에서 하단 탭으로 전환 (PC/모바일 자동 감지로 진입)
├── admin-mobile.html     관리자 모바일 페이지 — 상담신청/Q&A/휴지통 (admin.html에서 모바일 자동 감지로 진입)
├── firebase-messaging-sw.js  FCM 푸시 알림용 서비스워커 (반드시 최상위 경로에 있어야 함)
├── css/style.css        전 페이지 공용 스타일시트
├── js/content-defaults.js  index.html/admin.html/mobile.html이 함께 쓰는 학교소개·상담신청 기본값
├── image/                이미지 파일
├── functions/
│   ├── index.js         Cloud Functions: chatWithAI(챗봇 프록시), createConsultation / listMyConsultations / cancelMyConsultations(상담 신청·취소), Q&A 함수들, visitCounter(메인 화면 방문자 수), 푸시/메일 알림
│   └── package.json
├── firebase.json        Hosting + Functions 배포 설정
├── .firebaserc          프로젝트 ID 연결 (본인 프로젝트 ID로 교체 필요)
├── firestore.rules      Firestore 보안 규칙
└── storage.rules        Storage(사진 업로드) 보안 규칙
```

## 한 번에 배포하기 (tools/deploy.sh)

GitHub에서 PR을 main에 병합(Merge)한 뒤, 맥 "터미널"(윈도우는 Git Bash)에서:

```bash
# 처음 한 번 (배포용 폴더 ~/hello-cjhs 를 만들고 바로 배포)
git clone https://github.com/workingkhwdk-dotcom/hello-cjhs.git ~/hello-cjhs && bash ~/hello-cjhs/tools/deploy.sh

# 그다음부터는 이 한 줄
bash ~/hello-cjhs/tools/deploy.sh
```

- 하는 일: main 최신본 받기 → 서버 함수 테스트(`functions/npm test`) → `firebase deploy`(사이트·서버 함수·보안 규칙 전체). 테스트가 실패하면 배포하지 않음.
- 화면(사이트)만 올릴 때: `bash ~/hello-cjhs/tools/deploy.sh hosting`
- 배포용 폴더는 main 사본으로 쓴다. 폴더에서 직접 고친 파일이 있으면 버릴지 먼저 묻는다.
- 처음 한 번 필요: Node.js 22, `firebase login`(Firebase CLI가 없으면 `npx firebase-tools`로 자동 실행).

## 지금 바로 되는 것 / 아직 안 되는 것

| 기능 | 상태 |
|---|---|
| 메인 페이지 레이아웃·디자인 | ✅ 완성 (이미지 placeholder만 교체하면 됨) |
| 입학 상담 신청 폼(Q1~Q4) → Cloud Function → Firestore 저장 | 🟡 코드는 완성, **functions 배포 필요** (클라이언트는 더 이상 Firestore에 직접 쓰지 않음) |
| Q&A 게시판(로그인 없이 비밀번호로 작성/수정/삭제) | 🟡 코드는 완성, **Cloud Functions 배포 + 함수 URL 4개 교체 필요** (비밀번호 확인을 서버에서 처리) |
| 관리자 페이지(상담 현황 + Q&A 답변 + 휴지통) | 🟡 코드는 완성, **admins 컬렉션에 관리자 UID 등록 필요** (아래 참고) |
| AI 챗봇 UI + 답변 서식(굵게/색상/표) | 🟡 코드는 완성, **Cloud Function 배포 + API 키 설정 필요** |
| Cloud Function(chatWithAI) | 🟡 스캐폴드만 있음, **AI API 키 설정 + 배포 필요** |

## 처음 배포까지 해야 할 일 (순서대로)

1. **Firebase 프로젝트 생성**
   [Firebase Console](https://console.firebase.google.com)에서 새 프로젝트 생성.

2. **Firestore, Authentication, Storage, Hosting, Functions 활성화**
   - Firestore Database: "프로덕션 모드"로 생성 (규칙은 이후 배포)
   - Authentication > 로그인 방법에서 "이메일/비밀번호"만 사용 설정 → 관리자 계정(admin.html 로그인용) 1개 이상 직접 생성
     (Q&A 게시판은 로그인이 필요 없으므로 Google 로그인 등은 설정하지 않아도 됩니다)
   - **Storage**: 관리자 페이지에서 학교장 사진/갤러리 사진을 업로드하려면 Firebase Console > Storage에서 "시작하기"로 한 번 활성화해 주셔야 합니다.
   - Functions는 **Blaze(종량제) 요금제**가 필요합니다 (외부 API 호출을 하기 때문).

3. **관리자를 admins 컬렉션에 등록 (★ 중요, 빠뜨리면 관리자 페이지가 동작하지 않습니다)**
   - 2번에서 만든 관리자 계정으로 admin.html에 한 번 로그인 시도 (아직 admins 등록 전이라 데이터는 안 보여도 정상입니다)
   - Firebase Console > Authentication > Users 목록에서 방금 로그인한 계정의 **UID**를 복사
   - Firestore Database > "admins" 컬렉션을 새로 만들고, 문서 ID를 그 UID로, 필드는 아무거나(예: `role: "admin"`) 넣어 문서를 하나 생성
   - 이후 admin.html에서 재로그인하면 정상적으로 데이터가 보입니다.

4. **firebaseConfig 값 확인**
   `admin.html`, `qna.html`, `mobile.html`, `apply.html` 등은 이미 실제 프로젝트 값(`hello-cjhs`)으로 채워져 있습니다. 다른 Firebase 프로젝트로 옮기실 경우에만 각 파일의 `firebaseConfig`를 함께 교체해 주세요.

5. **Firebase CLI 설치 및 로그인**
   ```bash
   npm install -g firebase-tools
   firebase login
   ```

6. **AI API 키 설정** (챗봇용 — 현재는 OpenAI GPT를 임시로 사용합니다)
   ```bash
   cd functions
   npm install
   firebase functions:secrets:set OPENAI_API_KEY
   # platform.openai.com 에서 발급받은 API 키를 붙여넣으세요.
   ```
   나중에 다른 provider(Anthropic 등)로 바꾸시려면 `functions/index.js`의
   `chatWithAI` 함수 안 fetch 호출 블록만 교체하면 됩니다.

7. **Q&A 답변 이메일 알림용 SMTP 시크릿 설정 (선택 기능)**
   ```bash
   firebase functions:secrets:set SMTP_USER
   # 답변 메일을 "보내는" 계정으로 쓸 Gmail 주소 (예: cjhs.admission@gmail.com)
   firebase functions:secrets:set SMTP_PASS
   # 그 Gmail 계정의 "앱 비밀번호" (일반 로그인 비밀번호 아님 — Google 계정 설정 >
   # 보안 > 2단계 인증 활성화 후 "앱 비밀번호"에서 새로 발급)
   ```
   이 두 시크릿을 건너뛰어도 사이트의 다른 기능에는 영향이 없고, 이메일 발송만 안 됩니다.

8. **배포**
   ```bash
   firebase deploy
   ```

9. **chatbot.html의 FUNCTION_URL 교체**
   배포된 `chatWithAI` 함수의 실제 URL을 `chatbot.html` 상단 스크립트의
   `FUNCTION_URL` 값에 넣고 다시 `firebase deploy --only hosting` 실행.

10. **qna.html의 함수 URL 4개 교체**
   배포된 `qnaCreateQuestion`, `qnaVerifyPassword`, `qnaEditQuestion`, `qnaDeleteQuestion`
   함수의 실제 URL을 `qna.html` 상단 스크립트의 `FN_CREATE`/`FN_VERIFY`/`FN_EDIT`/`FN_DELETE`
   값에 각각 넣고 다시 `firebase deploy --only hosting` 실행.

11. **apply.html / mobile.html의 상담 신청·취소 함수 URL 확인**
   배포된 `createConsultation`, `listMyConsultations`, `cancelMyConsultations` 함수의 실제 URL이
   `apply.html`과 `mobile.html` 스크립트의 `FN_CREATE`(mobile은 `FN_CREATE_CONSULT`) / `FN_CANCEL_LIST` / `FN_CANCEL` 값과 같은지 확인하고,
   다르면 교체한 뒤 `firebase deploy --only hosting` 실행.

12. **firestore.rules / storage.rules 배포**
   ```bash
   firebase deploy --only firestore:rules,storage
   ```
   ※ 상담 신청 접수가 Cloud Function으로 옮겨졌으므로 **functions와 firestore.rules를 같이(또는 functions를 먼저) 배포**해야 합니다. 규칙만 먼저 배포하면 기존 신청 폼이 잠시 동작하지 않습니다.
   한 번에: `firebase deploy --only functions,firestore:rules,hosting`


## 상담 신청 문항 구조 (apply.html)
- **Q1.** 재학 중인 중학교 (반송중 / 반림중 / 그 외 직접입력 — "OO중학교" 형식 강제, 공백 자동 제거)
- **Q2.** 궁금하신 분야 (복수 선택: 고교학점제 / 교육과정 / 특색활동 / 학습·생활 지원 방법 / 기타)
- **Q3.** 희망 상담 유형 (온라인 / 전화 / 방문, 아이콘 칩) — 하단에 "AI 챗봇으로도 알아볼 수 있다"는 안내 문구
- **Q4.** Q3 응답에 따라 분기
  - 온라인 → "AI 챗봇에게 바로 물어보기" / "Q&A 게시판에 질문 남기기" 두 카드로 안내 (보호자 성함·연락처 불필요, Firestore에 기록되지 않음)
  - 전화 → 보호자 성함 + 연락받을 전화번호(010-0000-0000 형식 자동 강제) + 궁금한 내용 + 학교 일정 조율 후 전화드린다는 안내
  - 방문 → 10/17(토)·10/19(월)·10/21(수) 18:30 중 복수 선택 + "1:다수 설명회" 안내 + 보호자 성함 + 연락처 + 궁금한 내용
  - 보호자 성함 옆에는 "상담 신청자 확인 목적으로만 사용, 입학 시즌 종료 후 폐기" 문구를 항상 함께 표시
- **취소용 비밀번호(숫자 4자리, 필수)**: 전화/방문 신청에는 반드시 입력해야 하며, 서버(`createConsultation`)가 bcrypt 해시(`pinHash`)로만 저장합니다. 이메일(선택)과 같은 카드에 있습니다.
- 이메일(선택)을 남기면, 제출 즉시 확인 메일을 자동으로 받습니다(Cloud Function `onNewConsultation`, Q&A 이메일 알림과 같은 SMTP_USER/SMTP_PASS 시크릿 사용).
- 제출하면 완료 팝업이 뜨고, 취소는 첫 화면의 **"취소하기"** 에서 합니다.
  1. 신청 때 입력한 **연락처 + 비밀번호(4자리)** 를 넣고 "내 신청 조회하기"
  2. 두 값이 모두 맞는 신청만 목록(접수시각·상담유형·중학교·희망일시·문의내용 일부)으로 나타남
  3. 취소할 신청을 체크하고 "선택한 N건 취소하기" → 확인창 → 선택한 건만 취소(휴지통으로 이동, `deleted:true`)
  - 서버(`listMyConsultations`, `cancelMyConsultations`)가 조회·취소 때마다 연락처+비밀번호를 다시 검증합니다. 연락처만 알아서는 아무것도 볼 수도 취소할 수도 없습니다.
  - **무차별 대입 방지**: 같은 연락처로 비밀번호를 5번 틀리면 15분간 그 연락처의 조회·취소가 잠깁니다(`consult_cancel_attempts` 컬렉션, 클라이언트 접근 불가). 대신 누군가 남의 연락처로 일부러 5번 틀리면 본인이 15분간 못 쓰는 부작용이 있습니다.
  - **기존 신청(이번 변경 이전에 접수된 건)** 은 비밀번호가 없어 본인이 취소할 수 없습니다 — 관리자 페이지에서 직접 삭제해 주세요.
- 개인정보 수집·이용 동의는 모든 문항과 구분된 별도 섹션으로 신청서 맨 아래에 위치 (신청서 전체에 대한 동의임을 명시)

## AI 챗봇 (chatbot.html)
- 답변을 만들기 전에 별도의 가드 단계를 거칩니다 — ① 비속어 사전 ② OpenAI Moderation ③ GPT가 "학교·입학·고교생활·대입과 무관한 질문인지" 별도 JSON으로 판정. 대화용 프롬프트에만 지시를 묻어두면 가끔 안 지켜질 수 있어서, 답변 생성과 분리된 강제 판정 단계(하네스)로 만들었습니다.
- 부적절한 표현이거나 무관한 질문이면 실제 GPT 답변 대신 안내 문구만 돌려줍니다.
- 이 상황이 **브라우저 세션 동안 3번 반복되면 채팅이 잠깁니다**(입력창 비활성화). 횟수는 서버가 아니라 `sessionStorage`에 클라이언트에서만 기록하므로, 탭을 닫았다 다시 열면 초기화됩니다.

## Q&A 게시판 (qna.html)
- **로그인이 필요 없습니다.** 누구나 이름(선택)·이메일(선택)·제목·내용·비밀번호를 입력해 바로 질문을 올릴 수 있습니다.
- 이메일을 남기면, 관리자가 admin.html에서 답변을 등록하는 순간 그 내용이 자동으로 메일로도 발송됩니다(Cloud Function `onQnaAnswered`). 이메일을 입력하지 않으면 그냥 게시판에서만 확인하면 됩니다.
- 등록 시 입력한 비밀번호로 나중에 본인 글을 수정하거나 삭제(휴지통 이동)할 수 있습니다.
- **사전 검열**: 질문을 등록/수정할 때마다 3단계로 걸러냅니다.
  1. 자체 비속어 사전(씨발/병신 등 명시적 욕설) — 단어 매칭
  2. OpenAI Moderation API(무료) — 성적/폭력적/혐오·협박/자해 관련 내용
  3. GPT(gpt-4o-mini)가 글 전체 맥락을 읽고 판단 — 특정인을 향한 모욕·명예훼손, 단어 자체는 자극적이지 않아도 암시적으로 성적인 내용 등을 잡습니다. 단순히 "이 단어가 있으니 차단" 식이 아니라 맥락을 보고 판단하며, 학교 제도에 대한 정당한 문제제기 같은 건 막지 않도록 지시해뒀습니다.
  걸리면 저장되지 않고 어떤 이유로 막혔는지 안내 문구가 뜹니다. (3단계는 GPT 호출이 하나 더 붙는 거라 건당 아주 미미한 비용이 발생합니다 — 글 하나당 1원도 안 되는 수준입니다.) 완벽하지는 않으니, 관리자 페이지에서 이상한 글이 보이면 휴지통으로 옮겨 주세요 — 그건 여전히 수동입니다.
- 비밀번호 확인은 전부 **Cloud Functions(서버)**에서 처리합니다. **"비밀글(본인만 확인)"** 에 체크한 글은 실제 제목·내용이 `qna_secrets`라는, 클라이언트가 절대 직접 읽을 수 없는 컬렉션에만 저장되고, `qna_questions`(공개 컬렉션)에는 처음부터 `null`로 들어갑니다. 즉 비밀번호를 맞히기 전에는 브라우저 개발자 도구로 네트워크 요청을 들여다봐도 내용 자체가 전달되지 않습니다.
- **비밀글의 관리자 답변도 `qna_secrets`에만 저장됩니다.** 공개 컬렉션에는 `answered: true`(답변완료 표시용)만 남고, 답변 본문은 비밀번호를 맞혔을 때 서버가 함께 돌려줍니다. 공개↔비공개로 글을 수정하면 답변도 서버가 알맞은 곳으로 옮깁니다. 예전 방식으로 공개 컬렉션에 남아 있던 비밀글 답변은 **관리자 화면에 로그인하면 자동으로 한 번 옮겨집니다.**
- **휴지통으로 간 글은 관리자만 읽을 수 있습니다**(Firestore 규칙). 공개 화면은 `deleted == false`인 글만 조회합니다. 휴지통에서 복구하면 `deleted: false`로 되돌립니다.
- 답변은 관리자만 admin.html의 "Q&A 관리" 탭에서 등록/수정할 수 있습니다. (관리자는 `admins` 컬렉션 등록만 되어 있으면 비밀번호 없이도 모든 글의 원문을 보고 답변할 수 있습니다.)
- **배포 시 함수 URL 교체 필요**: `qna.html` 상단의 `FN_CREATE`, `FN_VERIFY`, `FN_EDIT`, `FN_DELETE` 4개 URL을 chatbot.html의 `FUNCTION_URL`과 같은 방식으로, 배포 후 실제 함수 URL로 교체해야 합니다.
- 완전 삭제(관리자 휴지통의 "완전 삭제")는 `qna_questions`와 `qna_secrets`의 짝 문서를 함께 지웁니다.

## 관리자 페이지 (admin.html)
- 탭 구성: **상담 신청 현황 / 상담 신청 항목 관리 / Q&A 관리 / 학교 소개 관리 / 휴지통**
- **상담 신청 현황**: Q1~Q4 응답을 표로 확인, 상태(신규/처리완료) 토글, 삭제(휴지통 이동), 정렬, 요약 통계 (신청 목록만 표시)
- **상담 신청 항목 관리**: apply.html의 중학교/관심분야/방문 희망 날짜 "보기"를 편집합니다(별도 탭으로 분리됨). 문항 구성(몇 번 문항이 무엇을 묻는지, 온라인/전화/방문 분기)은 코드에 고정되어 있고, 이건 그 보기 목록만 관리합니다. "그 외"/"기타"는 직접입력으로 이어지는 특수 보기라 항상 자동으로 맨 뒤에 붙고 편집 대상이 아닙니다.
- 상담 신청 현황에는 **검색**(이름·연락처·중학교·내용)과 **엑셀(CSV) 내려받기**(현재 필터·검색 결과 기준, 한글 깨짐 방지 BOM 포함)가 있습니다. 관리자 모바일도 동일합니다.
- **Q&A 관리**: 질문별로 답변 등록/수정, 비공개 질문은 배지로 표시, 삭제(휴지통 이동)
- **학교 소개 관리**: 메인 페이지의 5개 탭(학교장 인사말/교육과정/학교생활 갤러리/학교 특색 활동/진로·진학 현황)을 코드를 건드리지 않고 직접 수정. 문단·카드는 정해진 개수(최대 6개)까지 추가·삭제할 수 있고(순서 변경은 아직 지원 안 함), 사진도 직접 업로드할 수 있습니다. 저장하면 메인 페이지에 바로 반영됩니다.
- **휴지통**: 삭제된 상담 신청 / Q&A를 복구하거나, 필요하면 완전히 삭제(되돌릴 수 없음)

## 모바일 버전 (mobile.html)
- 홈/상담신청/챗봇/Q&A **4개 화면을 파일 하나**로 통합하고, 하단 고정 탭바로 전환합니다(페이지 이동 없이 전부 한 화면 안에서 처리).
- **홈 화면 구성**: 상단 배너("창원중앙고 2027학년도 신입생 입학 상담") 바로 아래에 낮은 한 줄짜리 "입학 상담 신청" / "AI 입학 상담 챗봇" 카드, 그 아래에 학교소개 5개 서브탭이 있습니다. 서브탭은 5개가 잘리지 않게 한 줄에 균등 분할(아이콘 위, 글자 아래)되고, 스크롤해도 화면 위에 고정됩니다. 학교소개 내용은 박스 안에서 따로 스크롤되지 않고 화면 전체를 씁니다(스크롤은 페이지 전체가 함). 학교장 인사말의 사진은 위, 글은 그 아래로 겹치지 않게 배치됩니다.
- **PC/모바일 자동 감지**: `index.html`, `apply.html`, `chatbot.html`, `qna.html` 4개 데스크톱 페이지 상단에 감지 스크립트가 있어서, 모바일 기기(또는 좁은 화면)로 접속하면 자동으로 `mobile.html`의 해당 섹션(`?section=apply` 등)으로 이동합니다. `admin.html`은 감지 후 `admin-mobile.html`로 보냅니다.
  - 강제로 데스크톱 버전을 보고 싶으면 URL 끝에 `?force=desktop`을 붙이면 리다이렉트를 건너뜁니다. (모바일 화면에는 "PC 화면으로 보기" 링크를 두지 않습니다.)
- **상단 배너는 코드(SVG)로 만들었습니다** — 글자가 이미지 안에 박혀있는 파일을 안 씁니다. 그래서 화면 크기가 바뀌어도 글자가 깨지거나 잘리지 않습니다. 왼쪽 로고는 실제 `image/top banner.png`에서 벡터로 트레이싱해 뽑아낸 경로라 원본과 거의 동일합니다. (PC 메인 페이지의 배너는 이미지 파일이라, 그 안의 글자는 이미지를 새로 만들어야 바뀝니다.)
- 갤러리는 사진을 세로로 크게 보여주고 아래 썸네일 줄로 전환하며, 손가락으로 좌우로 밀어서도 넘길 수 있습니다. 학교소개 내용을 불러오는 동안에는 회색 자리표시(스켈레톤)가 나타나고, 서브탭을 바꾸면 새 내용이 맨 위부터 보입니다.
- 상담 신청 폼과 **취소하기(연락처+비밀번호 4자리로 조회 → 선택 취소)** 는 apply.html과 동일한 로직입니다.
- Firebase 설정, Cloud Function URL, Firestore 컬렉션 등은 데스크톱 버전과 **완전히 동일한 것을 재사용**합니다. (`js/content-defaults.js`도 그대로 같이 씁니다.)
- Q&A의 글 상세보기는 URL 해시(`#질문ID`)를, 탭 전환은 별도 JS 상태를 쓰기 때문에 서로 충돌하지 않습니다.
- 학교소개 콘텐츠 편집(admin.html "학교 소개 관리"), 상담 신청 선택지 편집("상담 신청 항목 관리")도 저장하면 모바일 버전에 똑같이 반영됩니다 — 데이터 소스가 같기 때문입니다.

## 관리자 모바일 페이지 (admin-mobile.html)
- `admin.html`을 모바일 기기로 열면 자동으로 `admin-mobile.html`로 이동합니다 (PC 사이트와 같은 방식, `?force=desktop`으로 건너뛸 수 있음).
- 상담 신청 현황(카드형 목록+필터+간단 통계), Q&A 관리(질문 확인·답변 등록), 휴지통(복구/완전삭제) — 이 3가지 핵심 기능만 하단 탭으로 담았습니다.
- 로그인하면 로그인 화면의 학교 로고·이름 블록이 통째로 사라지고 화면 맨 위부터 관리자 헤더(로그아웃 버튼만)가 시작됩니다.
- **새로고침 버튼은 없습니다.** 대신 ① 화면 맨 위에서 **아래로 당기면 새로고침**, ② 화면이 열려 있는 동안 **1분마다 자동 새로고침**, ③ 앱으로 다시 돌아왔을 때·앱이 열려 있는 중 푸시가 오면 자동 갱신합니다. 답변을 입력 중이거나(입력창 포커스/수정한 내용 있음) 선택 모드로 여러 건을 고르는 중이면, 입력이 사라지지 않도록 그 회차 새로고침은 건너뜁니다.
- **"학교 소개 관리"(사진 업로드 등 콘텐츠 편집)는 모바일에 안 넣었습니다** — 여러 필드를 채우고 사진을 올리는 작업이라 PC에서 하시는 게 더 편할 것 같아서 범위에서 뺐습니다.

## 새 Q&A 질문 / 상담 신청 접수 시 푸시 알림
- 알림은 **항상 켜져 있습니다.** `admin.html`(PC)과 `admin-mobile.html`(모바일)은 로그인하면 자동으로 이 기기를 등록합니다(권한을 이미 거부했거나 브라우저가 지원하지 않으면 조용히 넘어감). "알림 받기"/"테스트 알림" 버튼은 없앴습니다.
- 학부모가 **Q&A에 새 질문을 올리거나, 상담 신청서를 제출**하면 등록된 모든 관리자 기기로 웹 푸시 알림이 갑니다.
- 이 기능은 **Firebase Cloud Messaging(FCM)** 을 쓰며, 배포 전에 딱 한 가지가 더 필요합니다 — **VAPID 키 발급**:
  1. Firebase Console > 프로젝트 설정(⚙️) > **Cloud Messaging** 탭으로 이동
  2. "웹 구성" 섹션의 "웹 푸시 인증서"에서 **키 쌍 생성** 클릭
  3. 생성된 키 문자열을 복사해서, `admin.html`과 `admin-mobile.html` 두 파일 안의 `const VAPID_KEY = "...";` 부분에 각각 붙여넣기
  4. `firebase deploy --only hosting` 다시 배포
  - 이 키를 안 넣으면 알림 등록만 조용히 실패하고, 사이트의 다른 기능에는 영향이 없습니다.
- 알림을 여러 관리자 기기(예: 본인 휴대폰 + 학교 컴퓨터)에서 각각 로그인하면, 새 질문이 올라올 때 등록된 기기 전부로 알림이 갑니다.
- **알림을 누르면 해당 건으로 바로 이동합니다.** 새 상담 신청 알림은 그 신청 카드(펼친 상태)로, 새 질문 알림은 그 질문으로 이동하고 잠깐 노랗게 강조됩니다. 관리자 창이 이미 열려 있으면 그 창에서 이동합니다. (아이폰 홈 화면 앱은 기기 동작상 앱만 열리고 이동이 안 될 수 있음)
- `firebase-messaging-sw.js` 파일은 사이트 최상위 경로에 있어야만 정상 동작합니다(하위 폴더로 옮기면 안 됨) — 지금 위치 그대로 두시면 됩니다.

## 아이콘 / 홈 화면 추가 (PWA)
- `icons/` 폴더에 실제 로고를 벡터로 재구성한 파비콘·홈화면 아이콘이 들어 있습니다 — 메인 사이트(남색+흰 로고), 관리자 PC(딥네이비+금색 로고), 관리자 모바일(금색+남색 로고+빨간 "A" 배지)로 서로 다르게 만들어서, 여러 개를 홈 화면에 추가해도 아이콘만 보고 구분할 수 있습니다.
- `manifest.json`(메인) / `admin-manifest.json`(관리자 PC) / `admin-mobile-manifest.json`(관리자 모바일) 3개 매니페스트가 각각 연결되어 있어서, "홈 화면에 추가" 시 알맞은 이름·아이콘·테마색으로 설치됩니다.
- **중요(iOS)**: 아이폰/아이패드의 사파리는 웹 푸시 알림이 **"홈 화면에 추가"로 설치한 경우에만** 동작합니다(애플의 정책이라 저희가 바꿀 수 있는 부분이 아닙니다). 일반 사파리 탭에서는 알림 권한을 허용해도 실제 알림은 오지 않습니다. 관리자가 아이폰을 쓰신다면, 사파리에서 사이트를 연 뒤 공유 버튼 > "홈 화면에 추가"로 설치하고, 그 아이콘으로 들어가서 로그인해야 합니다. 안드로이드/PC 크롬은 이런 제약이 없습니다.

## 보안 관련 참고사항
- **상담 신청(consultations)은 클라이언트가 Firestore에 직접 쓰지 못합니다.** 접수·조회·취소는 모두 Cloud Functions(`createConsultation`, `listMyConsultations`, `cancelMyConsultations`)를 거치고, `firestore.rules`는 `admins`에 등록된 관리자에게만 읽기/수정/삭제를 허용합니다. 취소용 비밀번호는 해시로만 저장되며 관리자 화면에도 내려가지 않습니다.
- `qna.html`(질문 작성)은 비로그인 사용자가 Cloud Function을 통해서만 작성/수정/삭제할 수 있고, 조회는 공개 컬렉션(`qna_questions`)의 공개 글만 가능합니다.
- **admins 컬렉션 등록을 빠뜨리면** 관리자 계정으로 로그인해도 데이터를 하나도 읽지 못합니다 (권한 오류). 위 3번 단계를 꼭 확인해 주세요.
- AI API 키는 절대 `chatbot.html`(클라이언트)에 직접 넣지 마세요. 반드시
  `functions/index.js`를 통해 서버 측에서만 호출해야 키가 노출되지 않습니다.
- 챗봇 답변은 마크다운 일부(굵게/기울임/목록/표/링크/이미지)와 `<span style="color:...">` 형태의
  색상 강조만 허용하고, 그 외 태그·속성은 클라이언트에서 자동으로 걸러냅니다 (`chatbot.html`의
  `sanitizeNode` 참고).

## 남은 콘텐츠 작업 (디자인 쪽)
- `index.html` 안의 회색 사선 무늬 박스들은 전부 이미지 placeholder입니다.
  (학교장 사진, 체육대회/음악회/동아리/특강 사진 등)
- 탭 내용(학교장 인사말, 교육과정, 학교 특색 활동, 진로·진학 현황)은
  전부 예시 문구이니 실제 자료로 교체해 주세요.
