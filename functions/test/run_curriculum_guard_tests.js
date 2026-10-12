// 교육과정 편성표 검수 하네스(curriculum_guard.js) 테스트. 실행: node test/run_curriculum_guard_tests.js
const { checkCurriculumReply: chk, feedbackFor, repairCurriculumReply, NOTICE } = require("../curriculum_guard.js");
const DATA = require("../curriculum_data.json");
let pass = 0; const fails = [];
const check = (n, c, d) => (c ? pass++ : fails.push(d ? `${n}\n    ${d}` : n));
const kinds = (r) => chk(r).violations.map((v) => v.kind);

// 올바른 추천 답변(학기 소제목 + 선택군 표)은 위반 0
const good = `정보·컴퓨터 쪽이면 이렇게 가면 돼요.

**2학년 1학기**
| 선택군 | 추천 과목 | 이유 |
| --- | --- | --- |
| A군 | 인공지능 수학 | 기초 |
| A군 | 물리학 | 보완 |
| C군 | 정보과학(진로) | 핵심 |

**2학년 2학기**
| 선택군 | 추천 과목 | 이유 |
| --- | --- | --- |
| B군 | 기하, 경제 수학 | 수리 |
| D군 | 인공지능 기초 | 이어서 |

**3학년 1학기**
| 선택군 | 추천 과목 | 이유 |
| --- | --- | --- |
| **E군** | **데이터 과학** | 실습 |
| F군 | 미술 창작 | 균형 |

A군은 11개 중 3과목, 과목당 4학점이에요. E군은 15개 중 4과목이에요.`;
check("올바른 답변은 위반 없음", kinds(good).length === 0, JSON.stringify(chk(good).violations));

// 잘못된 군
const wrongGroup = good.replace("| B군 | 기하, 경제 수학 |", "| B군 | 기하, 정보과학 |");
check("과목이 다른 군에 있으면 wrong-group", kinds(wrongGroup).includes("wrong-group") && /C군/.test(chk(wrongGroup).violations[0].detail));
// 없는 과목
const unknown = good.replace("인공지능 수학", "고급 알고리즘");
check("편성표에 없는 과목은 unknown-course", kinds(unknown).includes("unknown-course"));
// 학기 불일치
const sem = good.replace("| D군 | 인공지능 기초 |", "| G군 | 융합과학 탐구 |");
check("학기와 군이 안 맞으면 semester(표)", kinds(sem).includes("semester"));
// 정원·학점
check("정원 틀림", kinds("A군은 12개 중 3과목을 골라요.").includes("count"));
check("선택 개수 틀림", kinds("E군은 15개 중 3과목을 골라요.").includes("count"));
check("학점 틀림", kinds("E군은 과목당 4학점이에요.").includes("credit"));
check("정원·학점 맞으면 통과", kinds("E군은 15개 중 4과목, 과목당 3학점이에요.").length === 0);
// 문장 속 학기-군
check("문장: 학기와 군 불일치", kinds("2학년 2학기에는 A군에서 고르게 돼요.").includes("semester"));
check("문장: 맞으면 통과", kinds("2학년 1학기에는 A군과 C군에서 고르게 돼요.").length === 0);
check("문장: 학기 여러 개면 판단 안 함", kinds("A군은 2학년 1학기, B군은 2학년 2학기예요.").length === 0);
// 구성표(소제목 + 교과|과목)
const comp = `**B군 — 12개 중 3과목 선택**
| 교과 | 과목 |
| --- | --- |
| 국어 | 언어생활 탐구 |
| 수학 | 기하, 경제 수학 |
| 사회 | 현대사회와 윤리, 도시의 미래 탐구, 정치, 경제 |`;
check("구성표(올바름)는 통과", kinds(comp).length === 0, JSON.stringify(chk(comp).violations));
check("구성표에 다른 군 과목이 섞이면 잡음", kinds(comp.replace("정치, 경제", "정치, 세계사")).includes("wrong-group"));
// 오탐 방지
check("'경제학과' 같은 일반 문장은 안 봄", kinds("E군에서 경제 쪽이 궁금하면 경제학과 진학 때 수학을 받쳐 주세요.").length === 0);
check("지정 과목 표(군 없음)는 안 봄", kinds("| 교과 | 과목 |\n| --- | --- |\n| 국어 | 문학, 대수 |").length === 0);
check("과목 칸에 '없음'은 통과", kinds(good.replace("미술 창작", "없음")).length === 0);
check("표가 아닌 일반 답변은 통과", kinds("야자는 희망자만 하고 월~목 18:30~21:00에 운영해요.").length === 0);
check("빈 문자열", kinds("").length === 0);

// 복구: 문제 행만 지우고 안내 문구 부착
const bad = wrongGroup.replace("인공지능 수학", "고급 알고리즘");
const v = chk(bad).violations, fixed = repairCurriculumReply(bad, v);
check("복구: 문제 행 제거", !/고급 알고리즘/.test(fixed) && !/기하, 정보과학/.test(fixed));
check("복구: 멀쩡한 행은 유지", /물리학/.test(fixed) && /인공지능 기초/.test(fixed));
check("복구: 안내 문구", fixed.endsWith(NOTICE));
check("복구 후 재검사 통과", chk(fixed).violations.length === 0, JSON.stringify(chk(fixed).violations));
check("피드백 문구에 위반 상세", /정보과학은\(는\) C군/.test(feedbackFor(v)) || /C군/.test(feedbackFor(v)));

// 모든 군 × 모든 과목: 편성표 그대로 만든 표는 위반이 없어야 한다(정확도 자체 점검)
const all = DATA.ELECTIVE.map((g) => `**${DATA.SEM[g.sem]}**\n| 선택군 | 과목 |\n| --- | --- |\n${g.courses.map((c) => `| ${g.id}군 | ${c[2]} |`).join("\n")}`).join("\n\n");
check("편성표 전체를 표로 만들어도 위반 0", chk(all).violations.length === 0, JSON.stringify(chk(all).violations.slice(0, 3)));

console.log(`\n총 ${pass + fails.length}건 중 ${pass}건 통과, ${fails.length}건 실패`);
fails.forEach((f) => console.log("- " + f));
process.exit(fails.length ? 1 : 0);
