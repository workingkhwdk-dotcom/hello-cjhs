/**
 * 실제 chatWithAI(index.js)를 스텁 환경에서 end-to-end로 돌려보는 회귀 하네스.
 * - firebase-functions/firebase-admin/bcryptjs/nodemailer는 node_modules 안의 스텁을 씀.
 * - fetch()는 이 파일에서 가짜로 바꿔서, 실제 OpenAI 키 없이도
 *   (1) 가드(모더레이션+주제분류)가 올바르게 막는지/통과시키는지
 *   (2) 실제 답변 생성 호출에 어떤 지식(retrieval + CORE_CONFIRMED_FACTS)이
 *       들어갔는지를 검증한다.
 *
 * 주의: 이건 "실제 GPT가 얼마나 잘 이해하는가"를 검증하는 게 아니다(그건 진짜
 * API 키로만 확인 가능). 여기서 검증하는 건 그 앞단 — 가드 로직이 제대로 막고
 * 통과시키는지, 그리고 모델에게 올바른 근거자료가 전달되는지다. 실제 GPT 모델은
 * 문맥 이해가 되므로, 여기서 "정답 지식이 프롬프트에 포함됨"만 확인되면 실제 답변
 * 품질은 그 위에서 자연스럽게 따라온다고 볼 수 있다.
 *
 * 실행: 프로젝트 루트에서 `npm test` (package.json에 등록됨) 또는
 *       `node test/run_regulation_tests.js`.
 * 별도 설정(NODE_PATH 등) 없이 그냥 실행하면 된다 — 아래에서 이 파일이 직접
 * test/stubs/node_modules 를 모듈 검색 경로에 끼워 넣는다. 실제 배포 코드
 * (index.js, knowledge.js)는 한 글자도 건드리지 않고, "테스트를 실행할 때만"
 * firebase-functions/firebase-admin/bcryptjs/nodemailer가 진짜 대신 이
 * 가벼운 스텁을 쓰게 만드는 것뿐이다.
 */

const path = require("path");
const Module = require("module");

const STUB_MODULES_DIR = path.join(__dirname, "stubs", "node_modules");
if (!(process.env.NODE_PATH || "").split(path.delimiter).includes(STUB_MODULES_DIR)) {
  process.env.NODE_PATH = [STUB_MODULES_DIR, process.env.NODE_PATH || ""]
    .filter(Boolean)
    .join(path.delimiter);
  // NODE_PATH는 프로세스 시작 시 한 번만 읽히므로, 값을 바꾼 뒤 모듈 검색
  // 경로를 강제로 다시 계산시켜야 실제로 반영된다.
  Module._initPaths();
}
// functions/node_modules에 진짜 firebase-functions 등이 설치돼 있으면 NODE_PATH보다 그쪽이 먼저 잡혀
// (스텁이 쓰이지 않아) `res.on is not a function` 같은 오류가 난다. 이 4개 모듈은 항상 스텁으로 강제한다.
{
  const STUBBED = ["firebase-functions", "firebase-admin", "bcryptjs", "nodemailer"];
  const origResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, ...rest) {
    const root = request.split("/")[0];
    if (STUBBED.includes(root) && !request.startsWith(".")) {
      try {
        return origResolve.call(this, path.join(STUB_MODULES_DIR, request), parent, ...rest);
      } catch (e) { /* 스텁에 없으면 기본 해석으로 */ }
    }
    return origResolve.call(this, request, parent, ...rest);
  };
}

process.env.OPENAI_API_KEY = "test-key";

// ---- 가짜 OpenAI 모더레이션 판정 (키워드 휴리스틱) ----
const SEXUAL_HINTS = ["섹스", "야동", "가슴", "성기", "자위", "따먹", "몸매 어때"];
const VIOLENT_HINTS = ["죽여", "칼로", "패버", "폭탄", "살인", "때려죽"];
const HATE_HINTS = ["장애인 새끼", "OO충", "냄져", "한녀", "김치녀"];
const SELF_HARM_HINTS = [
  "죽고싶", "죽고 싶", "자살", "자해", "사는게 의미", "사라지고싶", "사라지고 싶",
  "살기 싫", "포기하고 싶고", "끝내고 싶", "못 버티겠",
];

function fakeModerationCategories(text) {
  return {
    sexual: SEXUAL_HINTS.some((w) => text.includes(w)),
    violence: VIOLENT_HINTS.some((w) => text.includes(w)),
    hate: HATE_HINTS.some((w) => text.includes(w)),
    "self-harm": SELF_HARM_HINTS.some((w) => text.includes(w)),
    "self-harm/intent": SELF_HARM_HINTS.some((w) => text.includes(w)),
  };
}

function fakeModerationFlagged(text) {
  const cats = fakeModerationCategories(text);
  return Object.values(cats).some(Boolean);
}

// ---- 가짜 주제 분류(CHAT_GUARD_PROMPT 호출) 판정 ----
const OFFTOPIC_HINTS = [
  "날씨", "저녁 메뉴", "파이썬", "자바스크립트", "주식 추천",
  "환율", "연예인", "게임 추천", "번역해줘",
];
// 2026-09-28 추가: "챗봇 내부 구조를 캐묻는 질문"을 흉내 내기 위한 키워드.
// 실제 CHAT_GUARD_PROMPT는 GPT가 문맥으로 판단하지만, 이 스텁은 그럴 수
// 없으니(파일 상단 주석 참고) 최소한의 키워드 목록으로만 흉내 낸다.
const ARCHITECTURE_HINTS = [
  "시스템 프롬프트", "지식 데이터베이스 파일", "knowledge.js", "knowledge_data.json",
  "프롬프트 보여줘", "내부 지침", "판정 로직", "어떤 모델을 써",
];
// "제작자"/"김현우 선생님" 관련 질문은 위 내부 구조 힌트에 걸리지 않는 한
// onTopic=true로 통과해야 한다(기본값이 true이므로 별도 목록은 필요 없지만,
// 명시적으로 남겨서 이 예외가 의도된 것임을 코드로도 드러낸다).
const CREATOR_HINTS = ["만든 사람", "만들었", "개발자", "김현우"];
function fakeOnTopicJudge(text) {
  if (ARCHITECTURE_HINTS.some((w) => text.includes(w))) return false;
  if (OFFTOPIC_HINTS.some((w) => text.includes(w))) return false;
  return true; // 제작자 질문(CREATOR_HINTS)도 이 기본값 true로 통과한다.
}

let lastMainPromptCapture = null;
let lastResponsesRequest = null; // 답변 생성(/v1/responses) 요청 본문
let responsesOutputOverride = null; // 테스트가 가짜 응답(output 배열)을 지정할 때 사용

global.fetch = async (url, opts) => {
  const body = opts?.body ? JSON.parse(opts.body) : {};

  if (url.includes("/v1/moderations")) {
    const input = body.input || "";
    const categories = fakeModerationCategories(input);
    const flagged = Object.values(categories).some(Boolean);
    return {
      ok: true,
      json: async () => ({ results: [{ flagged, categories }] }),
    };
  }

  // 답변 생성 호출(웹 검색 도구 포함). 시스템 프롬프트는 instructions로 온다.
  if (url.includes("/v1/responses")) {
    lastMainPromptCapture = body.instructions || "";
    lastResponsesRequest = body;
    const output = responsesOutputOverride || [
      { type: "message", content: [{ type: "output_text", text: "[테스트용 가짜 답변]", annotations: [] }] },
    ];
    return { ok: true, json: async () => ({ output }) };
  }

  if (url.includes("/v1/chat/completions")) {
    const sys = body.messages?.[0]?.content || "";
    const isGuardCall = sys.includes("안전·주제 필터");
    if (isGuardCall) {
      const userMsg = body.messages?.[1]?.content || "";
      const cats = fakeModerationCategories(userMsg);
      const selfHarmConcern = cats["self-harm"] || cats["self-harm/intent"];
      const inappropriate =
        !selfHarmConcern &&
        (cats.sexual || cats.violence || cats.hate || /씨발|병신|개새끼/.test(userMsg));
      const onTopic = fakeOnTopicJudge(userMsg);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ inappropriate, selfHarmConcern, onTopic }) } }],
        }),
      };
    }
    // 실제 답변 생성 호출: 시스템 프롬프트 전체(=CORE_CONFIRMED_FACTS + 검색된 지식)를
    // 캡처해서, 테스트에서 "정답 근거가 실제로 모델에게 전달됐는지"를 문자열 포함
    // 여부로 검증할 수 있게 한다. 실제 GPT라면 이 내용을 바탕으로 자연스러운 문장을
    // 만들어낼 것이므로, 여기서는 그 내용이 프롬프트에 있었다는 사실 자체를 "합격"으로 본다.
    lastMainPromptCapture = sys;
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "[테스트용 가짜 답변]" } }],
      }),
    };
  }

  throw new Error("알 수 없는 fetch 대상: " + url);
};

const { chatWithAI } = require("../index.js");

function mockReqRes(message, history = [], headers = {}) {
  const req = { method: "POST", body: { message, history }, headers };
  let captured = null;
  const res = {
    status(code) {
      this._code = code;
      return this;
    },
    json(payload) {
      captured = { code: this._code, payload };
    },
    set() {},
  };
  return { req, res, get: () => captured };
}

async function callChat(message, history = [], headers = {}) {
  lastMainPromptCapture = null;
  lastResponsesRequest = null;
  const { req, res, get } = mockReqRes(message, history, headers);
  await chatWithAI(req, res);
  const result = get();
  return { ...result, promptSeen: lastMainPromptCapture, responsesRequest: lastResponsesRequest };
}

// 다음 callChat부터 /v1/responses가 돌려줄 output 배열을 지정한다(null이면 기본 가짜 답변).
function setResponsesOutput(output) {
  responsesOutputOverride = output;
}

module.exports = { callChat, setResponsesOutput };
