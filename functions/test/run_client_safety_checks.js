/**
 * 프론트엔드(mobile.render.js, chatbot.render.js) 챗봇 UI의 안전 관련 로직을
 * 소스 텍스트 수준에서 검증하는 하네스.
 * ------------------------------------------------------------
 * mobile.render.js/chatbot.render.js는 DOM·Firebase·fetch에 강하게 결합된
 * 한 줄짜리 압축 파일이라 functions/test/처럼 실제로 실행해서 검증하기
 * 어렵다. 대신, "다시는 재발하면 안 되는 특정 버그 패턴이 소스에 없는지"를
 * 정규식으로 확인하는 가벼운 방식으로 안전장치를 둔다.
 *
 * 배경(2026-09-27~28 실사례):
 * 챗봇 UI는 서버가 guard(inappropriate/offtopic/self_harm_concern)를 보낸
 * 응답을 받으면 "삼진(strike)"을 1 올리고, 3번 쌓이면 채팅을 24시간 잠근다
 * (getStrikes()>=3 → lockChat()). 그런데 이 삼진 카운트 조건이 원래
 * `if (data.guard)` 로만 돼 있어서, self_harm_concern(자해·자살 위기 신호)도
 * 그대로 삼진에 포함되고 있었다. 즉 위기 상황에 있는 학생이 연달아 힘든
 * 심경을 세 번 표현하면, 도움을 주기 위해 만든 위기 대응 채팅 자체가
 * 잠겨버리는 심각한 안전 문제였다. self_harm_concern은 "사용자가 문제를
 * 일으킨 것"이 아니라 "도움이 필요한 신호"이므로, 절대 삼진에 포함되면
 * 안 된다.
 *
 * 실행: node test/run_client_safety_checks.js (프로젝트 루트에서)
 */

const fs = require("fs");
const path = require("path");

let pass = 0;
let fail = 0;
const fails = [];

function check(name, condition, detail) {
  if (condition) {
    pass++;
  } else {
    fail++;
    fails.push(detail ? `${name}\n    ${detail}` : name);
  }
}

const TARGET_FILES = ["mobile.render.js", "chatbot.render.js"];

for (const file of TARGET_FILES) {
  const filePath = path.join(__dirname, "..", "..", file);
  const src = fs.readFileSync(filePath, "utf8");

  // 삼진 카운트로 이어지는 지점(history 갱신 직후, data.guard로 분기하는 곳)을
  // 찾아서, 그 조건에 self_harm_concern을 제외하는 조건이 실제로 붙어있는지
  // 확인한다. history.push({role:"assistant",...}) 다음에 오는 guard 분기가
  // 바로 그 지점이다(현재 소스 구조 기준).
  const guardBranchMatch = src.match(
    /history\.push\(\{role:"assistant",content:reply\}\),(data\.guard[^)]*)\)\{/
  );

  check(
    `[${file}] 삼진 분기 조건을 소스에서 찾을 수 있어야 함`,
    !!guardBranchMatch,
    guardBranchMatch ? undefined : "history.push(...) 뒤 data.guard 분기 패턴을 찾지 못했습니다 — 코드 구조가 바뀌었다면 이 정규식도 함께 업데이트해야 합니다."
  );

  if (guardBranchMatch) {
    const condition = guardBranchMatch[1];
    check(
      `[${file}] self_harm_concern은 삼진(채팅 잠금) 카운트에서 제외되어야 함`,
      condition.includes('"self_harm_concern"!==data.guard') ||
        condition.includes('data.guard!=="self_harm_concern"'),
      `실제 조건: ${condition}\n    ` +
        "위기 신호(self_harm_concern)가 그대로 삼진에 포함되면, 도움이 필요한 학생의 채팅이 3번 만에 잠겨버립니다."
    );
  }

  // 삼진 임계값(3)과 잠금 문구가 여전히 존재하는지도 함께 확인해서, 위 정규식이
  // "코드가 통째로 사라져서" 우연히 통과하는 경우를 막는다.
  check(
    `[${file}] 삼진 임계값(3)과 잠금 로직이 여전히 존재함`,
    src.includes(">=3") && src.includes("lockChat")
  );
}

console.log(`\n총 ${pass + fail}건 중 ${pass}건 통과, ${fail}건 실패`);
if (fail > 0) {
  console.log("\n실패 목록:");
  for (const f of fails) console.log(`- ${f}`);
  process.exit(1);
}
