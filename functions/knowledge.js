/**
 * 창원중앙고 상담봇 지식 검색 모듈 (03_knowledge.jsonl 기반, v2.9)
 * ------------------------------------------------------------
 * - knowledge_data.json 은 03_knowledge.jsonl 271개 레코드를 그대로 담되
 *   운영자 전용/검토용 필드(school_voice_review, editorial 계열, source_refs 원문 등)만
 *   제거한 압축본이다. retrieval_text·usage_policy·scope·temporal_scope·source_ids 등
 *   45_claude_setup_prompt.md가 보존하라고 지정한 메타데이터는 그대로 남아 있다.
 * - 임베딩 API 없이도 한국어 짧은 문장에서 잘 동작하도록 "글자 2-그램(bigram)
 *   자카드 유사도 + 태그/학교사실키 완전일치 가중치"로 점수를 매기는 경량 검색을 쓴다.
 * - 매 요청마다 271개 전체를 프롬프트에 넣지 않고, 질문과 관련도가 높은 상위 N개만
 *   골라 답변 생성 컨텍스트에 넣는다(45_claude_setup_prompt.md 6번 항목: "자료 전체를
 *   매 대화마다 무조건 붙이기보다는 관련 지식을 선택").
 */

const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "knowledge_data.json");
// 2026-10-04 추가: 출처를 확인해 만든 학교 사실(knowledge_verified.json)과
// 생활규정 PDF에서 조문 단위로 만든 규정 DB(knowledge_regulation.json)를 같은 검색 대상에 합친다.
// 두 파일은 knowledge_data.json과 같은 필드(id·title·tags·retrieval_text)를 쓴다.
const EXTRA_DATA_FILES = ["knowledge_verified.json", "knowledge_regulation.json", "knowledge_reality.json", "knowledge_fair.json"];
const KNOWLEDGE = [
  ...JSON.parse(fs.readFileSync(DATA_PATH, "utf8")),
  ...EXTRA_DATA_FILES.flatMap((f) => JSON.parse(fs.readFileSync(path.join(__dirname, f), "utf8"))),
];

// ---- 학생 답변 검색에서 절대 제외해야 하는 module_id / category 방어선 ----
// 03_knowledge.jsonl 자체가 이미 00·06·07·08·09·17·18·19·20·22·25·32·33·35·36·
// 37·38·40·41·42·44·45(검토 보고서·평가 질문·빈 서식·운영 설정)를 포함하지 않도록
// 구성되어 있지만, 파일이 잘못 합쳐질 경우에 대비해 한 번 더 걸러낸다.
const EXCLUDED_MODULE_IDS = new Set([
  "review", "evaluation_cases", "maintenance", "validation",
  "module_manifest", "record_schema", "audit_ledger",
  "counseling_toolkit", "faq_template", "school_bot_profile",
  "voice_audit", "voice_review", "evidence_review",
  "operator_confirmation", "basic_disclosure", "basic_review",
  "claude_setup_prompt",
]);

const SAFE_KNOWLEDGE = KNOWLEDGE.filter((r) => !EXCLUDED_MODULE_IDS.has(r.module_id));

// 2026-10-22 추가: 기한이 있는 행사 자료(knowledge_fair.json 등)는 expires_at이 지나면 검색에서 뺀다.
// 함수 인스턴스는 오래 살아 있으므로 불러올 때가 아니라 검색할 때마다 시각을 확인한다.
const isLive = (r, now = new Date()) => !r.expires_at || now < new Date(r.expires_at);

// 학생들이 흔히 쓰는 줄임말/속어를 지식 문서에 쓰인 표현으로 정규화한다.
// 문서(retrieval_text) 쪽은 그대로 두고, 검색 질의에만 적용한다.
// 새 표현이 눈에 띄면 이 표에 한 줄 추가하는 것으로 검색 커버리지를 넓힐 수 있다.
const QUERY_SYNONYMS = [
  [/\b폰\b/g, "휴대폰"],
  [/걷어/g, "수거"],
  [/뺏/g, "수거"],
  [/야자쌤/g, "야자 감독 교사"],
  [/체육복\s*등교/g, "체육복 등하교"],
  [/체육복\s*하교/g, "체육복 등하교"],
  [/뭐가\s*좋아/g, "장점"],
  [/좋은\s*점/g, "장점"],
  [/내심\s*따기/g, "내신 받기"],
  [/내신\s*따기/g, "내신 받기"],
  [/어디\s*갈지/g, "학교를 고르는 게"],
  [/첫날/g, "첫 등교일"],
  [/챙겨/g, "준비"],
];

const CAREER_EXPANSIONS = [
  [/(의대|의예|치대|치의|한의|약대|약학|수의|간호|보건|생명공학|의사|의학)/, "생명·화학·보건 관심 생명과학 화학 의약학 간호 생명공학"],
  [/(공대|공학|기계|전기|전자|건축|토목|반도체|로봇|화공|신소재)/, "물리·공학 관심 물리학 공학 수학"],
  [/(컴공|컴퓨터|AI|인공지능|데이터|소프트웨어|코딩)/, "컴퓨터·AI·데이터 관심 정보 인공지능 데이터 수학"],
  [/(경제|경영|회계|무역|금융)/, "경제·경영 관심 경제 수학 통계"],
  [/(인문|어문|국문|영문|철학|역사|사학|문학)/, "인문·어문 관심 국어 영어 역사 철학"],
  [/(법대|법학|정치|행정|사회학|심리|사회복지|언론)/, "사회과학·법·정치 관심 사회 정치 법"],
  [/(환경|지리|지구과학|천문)/, "환경·지리·지구과학 관심 지구과학 지리 환경"],
  [/(교대|사범|체육|음악|미술)/, "교육·예술·체육 관심 교육 체육 예술"],
];

// 2026-10-04 추가: 생활규정 DB(knowledge_regulation.json) 조문 제목·태그에 쓰인 표현으로 학생들의 구어 표현을 풀어 덧붙인다.
const REGULATION_EXPANSIONS = [
  [/(담배|전자담배|흡연|피우)/, "흡연 적발 징계기준 청소년유해약물"],
  [/(음주|술\s*(마|먹|걸)|맥주|소주)/, "음주 적발 징계기준 청소년유해약물"],
  [/(컨닝|커닝|부정\s*행위|시험\s*중\s*(폰|휴대폰))/, "시험 부정행위 징계기준 고사 중 부정행위"],
  [/(걸리면|걸렸|걸려서|적발)/, "적발 징계 학생선도규정"],
  [/(징계|벌점|퇴학|출석\s*정지|선도위원회|봉사\s*시간)/, "학생선도규정 징계 종류 징계기준표"],
  [/(압수|수거|빼앗|돌려\s*받)/, "분리(압수) 보관 반환 3일 휴대폰"],
];

function normalizeQuery(str) {
  let s = String(str || "");
  for (const [pattern, repl] of QUERY_SYNONYMS) {
    s = s.replace(pattern, repl);
  }
  for (const [pattern, add] of REGULATION_EXPANSIONS) {
    if (pattern.test(s)) s += " " + add;
  }
  // "학교"와 "장점"이 함께 등장하면 "장점"만으로는 대학·학과의 장점을 묻는 다른
  // 문서(예: 대학별 특징, 진로 강점)와 뒤섞여 우리 학교 소개(FP48)가 밀려난다.
  // 두 단어가 함께 나오면 우리 학교 소개 문서와 겹치는 표현을 덧붙여 확실히 끌어올린다.
  if (/학교/.test(s) && /장점/.test(s)) {
    s += " 창원중앙고의 장점 다른 학교와 비교 명문 전통 동문 면학분위기 AI 선도학교";
  }
  // "수능 과목이 어떻게 되나요", "탐구는 몇 과목 봐요" 같은 짧고 흔한 질문은
  // "과목"·"봐요"처럼 다른 문서에도 흔히 나오는 표현 때문에 정작 F03~F05
  // (2028학년도부터 선택과목 없는 통합형 수능·통합사회·통합과학 필수) 문서가
  // 검색 상위에 오르지 못하고 밀려나는 문제가 있었다. 관련 핵심어를 확실히
  // 덧붙여서 개편 수능 문서가 항상 함께 검색되도록 한다.
  const mentionsCsat = /수능/.test(s);
  const mentionsExamSubjects = /(과목|탐구|사탐|과탐|영역|선택)/.test(s);
  // "탐구는 몇 과목 봐야 해요?"처럼 "수능"이라는 말 자체를 안 쓰고 물어도
  // (수업 중 탐구활동과 구별되도록 "몇/영역/선택"과 함께 쓰인 경우로 한정) 같이 잡는다.
  const asksAboutTamguExam =
    /탐구/.test(s) &&
    /(몇\s*과목|영역|사탐|과탐|선택)/.test(s) &&
    !/(탐구활동|탐구보고서|세특|수행평가)/.test(s);
  if ((mentionsCsat && mentionsExamSubjects) || asksAboutTamguExam) {
    s += " 수능 개편 선택과목 없는 통합형 수능 통합사회 통합과학 대수 미적분 확률과 통계 미적분Ⅱ 기하 제외";
  }
  // 진로를 말하고 선택과목을 묻는 질문("의대 가려면 뭘 골라요?")은 진로 단어가 지식 문서의
  // 표현("생명·화학·보건 관심")과 겹치지 않아 계열별 과목 안내 문서가 밀려난다.
  // 과목·선택에 추천/준비 의도가 함께 있을 때만 진로 단어를 문서가 쓰는 계열 표현으로 풀어 덧붙인다.
  if (/(과목|선택)/.test(s) && /(추천|들어야|들을|가려면|가고\s*싶|준비|골라|뭘|뭐)/.test(s)) {
    for (const [pattern, add] of CAREER_EXPANSIONS) {
      if (pattern.test(s)) s += " " + add;
    }
  }
  return s;
}

// 질문 어절 보너스(아래 qWords 루프)에서 제외할 범용 표현.
// "챙겨야 하나요?", "계속 그런가요?"처럼 거의 모든 질문에 공통으로 붙는
// 어미·부사는 실제 주제와 무관하게 같은 FAQ 문체의 여러 문서에 두루 등장해서,
// 엉뚱한 문서까지 진짜 주제어(예: "수행평가")를 언급한 문서와 비슷한 점수로
// 끌어올리는 원인이 된다. 이런 범용어는 보너스에서 제외해 "무슨 얘기인지"를
// 실제로 구별해주는 단어(명사/핵심어)만 점수에 반영되게 한다.
const GENERIC_QUERY_WORDS = new Set([
  "하나요", "되나요", "있나요", "인가요", "인데요", "그런가요", "않나요",
  "해야", "해요", "돼요", "되요", "주세요", "궁금해요", "궁금한데요", "궁금",
  "챙겨야", "챙기는", "계속", "위주", "인데", "그리고", "그래서", "근데",
  "혹시", "만약", "정말", "진짜", "너무", "그냥", "좀", "많이", "아니면",
  "어떻게", "어떤가요", "어떤지", "알려주세요", "알려줘", "말해주세요",
]);

// 어절 끝에 붙는 범용 한국어 질문/설명 어미. 질문과 지식 문서(retrieval_text)
// 양쪽 모두 이런 어미로 끝나는 문장이 많다 보니, "무슨 얘기인지"와 무관하게
// 겹치는 2-그램의 상당수가 실제로는 이 어미들에서만 나온다(예: "야자 언제 끝나요"와
// "휴대폰 사용해도 되나요"는 주제가 다른데도 "나요/되요" 같은 어미 때문에 점수가
// 겹친다). bigrams()로 2-그램을 뽑기 전에 어절 단위로 이 어미를 먼저 제거해,
// 진짜 주제어(명사·동사 어간)만 점수에 반영되게 한다. 가장 긴 어미부터 검사해야
// "인가요"를 "가요"로 반만 제거하는 것을 막을 수 있다(긴 것부터 매칭).
const TRAILING_GENERIC_SUFFIXES = [
  "그런가요", "않나요", "인데요", "인가요", "하나요", "되나요", "있나요",
  "드릴까요", "드려요", "습니다", "입니다", "합니다", "해야",
  "해요", "돼요", "가요", "나요", "어요", "아요",
].sort((a, b) => b.length - a.length);

function stripTrailingGenericSuffix(word) {
  for (const suf of TRAILING_GENERIC_SUFFIXES) {
    if (word.length > suf.length && word.endsWith(suf)) {
      return word.slice(0, -suf.length);
    }
  }
  return word;
}

function bigrams(str) {
  const s = String(str || "")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, " ")
    .trim();
  if (!s) return new Set();
  // 범용 어미를 어절 단위로 먼저 제거한 뒤 다시 이어붙인다. 원래처럼 어절 사이
  // 공백을 없애고 이어붙이므로, 어절 경계에 걸친 2-그램을 잡던 기존 동작은
  // 그대로 유지된다.
  const strippedTokens = s.split(" ").map(stripTrailingGenericSuffix).filter(Boolean);
  const compact = strippedTokens.join("");
  if (!compact) return new Set();
  const grams = new Set();
  for (let i = 0; i < compact.length - 1; i++) {
    grams.add(compact.slice(i, i + 2));
  }
  // 공백으로 나뉜 어절 단위도 통짜로 넣어서 짧은 고유명사(야자, 석식 등) 매칭을 돕는다.
  for (const tok of strippedTokens) {
    if (tok.length >= 2) grams.add("W:" + tok);
  }
  return grams;
}

/**
 * 겹침 계수(overlap coefficient) = 교집합 / min(|A|,|B|).
 * 질문은 짧고 retrieval_text(문서)는 긴 비대칭 상황에서, 전체 합집합으로 나누는
 * 자카드 유사도는 점수가 지나치게 작아져 짧은 실제 학생 질문을 놓치기 쉽다.
 * 겹침 계수는 "질문에 쓰인 표현이 문서에 얼마나 들어있는가"를 보므로 이 검색에 더 맞는다.
 */
function overlapCoefficient(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  for (const g of small) if (big.has(g)) inter++;
  return inter / small.size;
}

// university_reference 모듈(U01~U17 등)은 "특정 대학 하나"의 전형 절차를 다루는
// 좁은 범위의 참고 문서다. "정시", "수시"처럼 대입 제도 전반에서도 흔히 쓰이는
// 단어 하나가 겹친다는 이유로 이런 특정-대학 문서가 일반적인 학교생활 질문(예:
// "정시 위주라 수행평가는 안 챙겨도 되나요")에까지 끌려 나오는 사례가 있었다.
// 질문에 "대학"이나 "전형"처럼 실제로 대입 전형 절차를 묻고 있다는 신호가
// 없으면 이 카테고리의 점수를 크게 낮춰, 우연한 단어 겹침만으로 튀어나오지
// 않게 한다. 반대로 "대학"/"전형"이 언급되면(예: "서울대 정시 전형 어때요")
// 그대로 정상 점수로 검색된다.
const UNIVERSITY_SPECIFIC_MODULES = new Set(["university_reference"]);
const UNIVERSITY_INTENT_SIGNALS = ["대학", "전형"];

/**
 * 질문(및 최근 대화 맥락) 문자열에 대해 관련도 상위 topK 레코드를 돌려준다.
 * @param {string} query 사용자의 최신 메시지
 * @param {string} [contextText] 최근 대화 이력 등 보조 문맥(가중치 낮게 반영)
 * @param {number} [topK]
 */
function scoreKnowledge(query, contextText = "", now = new Date()) {
  const normalizedQuery = normalizeQuery(query);
  const qGrams = bigrams(normalizedQuery);
  const ctxGrams = bigrams(contextText);

  const scored = SAFE_KNOWLEDGE.filter((r) => isLive(r, now)).map((r) => {
    const hay = bigrams(
      [r.title, (r.tags || []).join(" "), r.retrieval_text].filter(Boolean).join(" ")
    );
    let score = overlapCoefficient(qGrams, hay) * 1.0 + overlapCoefficient(ctxGrams, hay) * 0.2;

    // 태그/제목/학교사실키/retrieval_text에 질문 어절이 그대로 등장하면 보너스
    // (예: "야자", "석식", "체육복" 같은 짧은 고유 표현을 확실히 붙잡기 위함)
    // 어절 끝의 물음표·쉼표 등 문장부호는 제거하고 비교해야 "계세요?"처럼
    // 부호가 붙은 질문 어절도 정상적으로 보너스를 받는다.
    const qWords = normalizedQuery
      .split(/\s+/)
      .map((w) => w.replace(/[\s\p{P}\p{S}]+/gu, ""))
      .filter((w) => w.length >= 2 && !GENERIC_QUERY_WORDS.has(w));
    const title = r.title || "";
    const rest = `${(r.tags || []).join(" ")} ${r.school_fact_key || ""} ${r.retrieval_text || ""}`;
    for (const w of qWords) {
      // 제목에 그대로 등장하면 더 크게, 본문/태그에만 있으면 기존대로 가중치를 준다.
      // 제목 일치를 더 쳐주는 이유는 "선생님", "학생" 같은 흔한 단어가 여러 문서의
      // 본문에 함께 등장해 생기는 점수 동률을 title 일치 여부로 갈라내기 위함이다.
      if (title.includes(w)) score += 0.15;
      else if (rest.includes(w)) score += 0.08;
    }

    if (UNIVERSITY_SPECIFIC_MODULES.has(r.module_id)) {
      const hasUniversityIntent = UNIVERSITY_INTENT_SIGNALS.some((w) => normalizedQuery.includes(w));
      if (!hasUniversityIntent) score *= 0.3;
    }

    return { r, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function retrieveKnowledge(query, contextText = "", topK = 6, now = new Date()) {
  const scored = scoreKnowledge(query, contextText, now);
  const MIN_SCORE = 0.12;
  const candidates = scored.filter((s) => s.score >= MIN_SCORE);
  if (!candidates.length) return [];

  // topK(기본 6개)를 항상 다 채우면, 진짜 관련도는 낮지만 "그나마 상위"라서
  // 딸려 들어온 항목까지 매번 프롬프트에 들어가 버린다. 이는 "맥락과 상관없는
  // 지식이 불려온다"는 문제의 핵심 원인이므로, 1등 점수 대비 상대 격차가 큰
  // 항목은(반 토막 이하) topK 안에 있어도 잘라낸다 — 이번 질문과 진짜 관련
  // 있는 소수의 항목만 남기고, 나머지는 모델이 억지로 엮지 않도록 한다.
  const topScore = candidates[0].score;
  const RELATIVE_CUTOFF = 0.45;
  const relevant = candidates.filter((s) => s.score >= topScore * RELATIVE_CUTOFF);
  return relevant.slice(0, topK).map((s) => s.r);
}

// 지식 레코드 중 상당수(272개 중 72개)는 retrieval_text 안에 상담 전략용으로
// "question: (사용자에게 되물을 질문)"과 "next_action: (다음에 할 일 제안)" 줄을
// 그대로 박아 두고 있다. 이 줄들이 검색 결과와 함께 모델에게 그대로 전달되다 보니,
// 모델이 답을 마칠 때마다 이 문구를 그대로 따라 사용자에게 후속 질문을 던지거나
// "다음엔 이걸 해보세요"를 습관적으로 덧붙이는 원인이 됐다(챗봇이 대화를 계속
// 이어가도록 유도하는 것처럼 느껴짐). knowledge_data.json 자체는 상담 설계
// 목적상 그대로 두되, 모델에게 넘기는 프롬프트에서는 이 두 줄을 제거해 "사실
// 설명"과 "사용자에게 되물어라"는 지시를 분리한다.
const PROMPT_STRIP_LINE_PATTERNS = [/^question:.*$/m, /^next_action:.*$/m];

function stripFollowUpDirectives(retrievalText) {
  let text = String(retrievalText || "");
  for (const pattern of PROMPT_STRIP_LINE_PATTERNS) {
    text = text.replace(pattern, "");
  }
  // 줄을 통째로 지우면서 생긴 빈 줄이 겹치지 않도록 정리한다.
  return text.replace(/\n{2,}/g, "\n").trim();
}

/**
 * 검색된 레코드들을 시스템 프롬프트에 넣을 텍스트 블록으로 직렬화한다.
 * retrieval_text만 노출하고, operator_notes는 "내부 판단 참고용"이라는 표시와 함께
 * 별도 블록에 담아 모델이 직접 인용하지 않도록 지시한다. retrieval_text 안의
 * "question:"/"next_action:" 줄(사용자에게 되물을 질문·다음 행동 제안)은 답변이
 * 습관적으로 후속 질문을 유도하지 않도록 프롬프트에서 제거한다.
 */
function formatKnowledgeForPrompt(records) {
  if (!records.length) {
    return "(관련 검색 지식 없음 — 아래 상위 지침과 확인된 학교 사실만으로 답변)";
  }
  return records
    .map((r) => {
      let block = `--- [${r.id}] ---\n${stripFollowUpDirectives(r.retrieval_text)}`;
      if (r.operator_notes) {
        block += `\n(운영자 내부 참고, 학생에게 그대로 보여주지 말 것: ${JSON.stringify(
          r.operator_notes
        )})`;
      }
      return block;
    })
    .join("\n\n");
}

// 이번 질문에 대한 지식 검색 1등 점수(없으면 0). 챗봇이 "근거 자료가 약한 질문"을
// 모아 관리자에게 보여주기 위한 신호로만 쓴다(답변 생성 로직에는 영향 없음).
function topKnowledgeScore(query, contextText = "") {
  const scored = scoreKnowledge(query, contextText);
  return scored.length ? scored[0].score : 0;
}

module.exports = {
  KNOWLEDGE: SAFE_KNOWLEDGE,
  topKnowledgeScore,
  retrieveKnowledge,
  formatKnowledgeForPrompt,
};