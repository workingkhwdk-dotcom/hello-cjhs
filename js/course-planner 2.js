// '과목 선택 가이드' 탭의 "3년 과목 짜보기" — 우리 학교 선택군(A~I)에서 과목을 미리 골라 3개년 교육과정을 완성해 본다.
// 과목·선택군·학점은 교육과정 탭과 같은 데이터(js/curriculum-2026.js)를 그대로 쓴다.
import { SEM, FIXED, ELECTIVE, TOTALS, typeChip, badge } from "./curriculum-2026.js";

const KEY = "cjhs_course_plan_v1";
const SEM_TABS = [2, 3, 4, 5]; // 학생 선택 과목이 있는 학기(2-1 ~ 3-2)
const TOTAL_PICKS = ELECTIVE.reduce((n, g) => n + g.pick, 0);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const short = si => SEM[si].replace(/(\d)학년 (\d)학기/, "$1-$2");
const groupsOf = si => ELECTIVE.filter(g => g.sem === si);

// 저장된 선택을 불러온다. 편성표에 없는 과목·정원 초과분은 버린다. 저장소를 못 쓰는 환경이면 빈 상태로 시작.
function load() {
  const picks = {};
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { /* 저장소 사용 불가 */ }
  ELECTIVE.forEach(g => {
    const names = new Set(g.courses.map(c => c[2]));
    picks[g.id] = (Array.isArray(saved[g.id]) ? saved[g.id] : []).filter(n => names.has(n)).slice(0, g.pick);
  });
  return picks;
}
const save = picks => { try { localStorage.setItem(KEY, JSON.stringify(picks)); } catch (e) { /* 저장 못 해도 화면은 동작 */ } };

export function renderPlanner(root) {
  if (!root) return;
  let picks = load();
  let tab = 0; // 0~3: 학기, 4: 내 교육과정

  const pickedCredits = si => groupsOf(si).reduce((n, g) => n + picks[g.id].length * g.credit, 0);
  const semDone = si => groupsOf(si).every(g => picks[g.id].length === g.pick);
  const pickedCount = () => ELECTIVE.reduce((n, g) => n + picks[g.id].length, 0);
  // 같은 과목명이 두 선택군에 있으면(예: 사회문제 탐구) 한쪽에서 고른 뒤 다른 쪽에서는 고를 수 없다.
  const takenIn = () => {
    const m = new Map();
    ELECTIVE.forEach(g => picks[g.id].forEach(n => m.set(n, g.id)));
    return m;
  };

  function groupHtml(g, taken) {
    const sel = picks[g.id], full = sel.length >= g.pick;
    const bySubj = [];
    g.courses.forEach(c => { let e = bySubj.find(x => x[0] === c[0]); if (!e) bySubj.push(e = [c[0], []]); e[1].push(c); });
    const opts = cs => cs.map(c => {
      const name = c[2], on = sel.includes(name), other = taken.get(name), dup = other && other !== g.id;
      return `<button type="button" class="pl-opt${on ? " on" : ""}" data-k="${esc(g.id + "|" + name)}" data-g="${g.id}" data-n="${esc(name)}" aria-pressed="${on}"${dup || (full && !on) ? " disabled" : ""}>
        <i class="pl-check" aria-hidden="true"></i><span class="pl-name">${esc(name)}</span>${typeChip(c[1])}${badge(c[5])}${dup ? `<small>${other}군에서 이미 골랐어요</small>` : ""}</button>`;
    }).join("");
    return `<div class="pl-group">
      <div class="pl-ghead"><span class="cur26-gid sm">${g.id}군</span>
        <span class="pl-gtxt"><b>${g.courses.length}개 중 ${g.pick}과목 고르기</b><small>과목당 ${g.credit}학점${full ? " · 다 골랐어요. 바꾸려면 고른 과목을 눌러 해제하세요." : ""}</small></span>
        <span class="pl-count${full ? " ok" : ""}">${sel.length}/${g.pick}</span></div>
      ${bySubj.map(([s, cs]) => `<div class="pl-subj"><h6>${esc(s)}</h6><div class="pl-opts">${opts(cs)}</div></div>`).join("")}
    </div>`;
  }

  function semPanel(si, idx) {
    const taken = takenIn();
    const next = idx < SEM_TABS.length ? `<button type="button" class="btn btn-point pl-next" data-k="next" data-tab="${idx + 1}">${idx + 1 < SEM_TABS.length ? `다음: ${SEM[SEM_TABS[idx + 1]]} →` : "내 교육과정 보기 →"}</button>` : "";
    return `<p class="pl-semsum"><b>${SEM[si]}</b> 선택 학점 <b>${pickedCredits(si)}</b> / ${TOTALS.elective[si]}</p>
      ${groupsOf(si).map(g => groupHtml(g, taken)).join("")}${next}`;
  }

  function resultPanel() {
    const got = ELECTIVE.reduce((n, g) => n + picks[g.id].length * g.credit, 0);
    const cards = SEM.map((name, si) => {
      const fixed = FIXED[si].map(c => `<li class="pl-row"><span class="cur26-tag f">지정</span><span class="pl-name">${esc(c[2])}</span><b>${c[5]}학점</b></li>`).join("");
      const mine = groupsOf(si).map(g => {
        const rows = picks[g.id].map(n => {
          const c = g.courses.find(x => x[2] === n);
          return `<li class="pl-row mine"><span class="cur26-tag e">${g.id}군</span><span class="pl-name">${esc(n)}</span>${typeChip(c[1])}${badge(c[5])}<b>${g.credit}학점</b></li>`;
        }).join("");
        const left = g.pick - picks[g.id].length;
        return rows + (left ? `<li class="pl-row todo">${g.id}군에서 ${left}과목을 더 골라야 해요</li>` : "");
      }).join("");
      return `<div class="cur26-sem"><div class="cur26-semhead"><h5>${name}</h5><span><b>${TOTALS.fixed[si] + pickedCredits(si)}</b> / ${TOTALS.subject[si]}학점</span></div>
        <ul class="cur26-list">${fixed}${mine}</ul></div>`;
    }).join("");
    return `<p class="pl-semsum">선택 과목 <b>${pickedCount()}</b> / ${TOTAL_PICKS}과목 · 교과 학점 <b>${TOTALS.fixed.reduce((a, b) => a + b, 0) + got}</b> / 174 ${pickedCount() === TOTAL_PICKS ? "· 3년 교육과정이 완성됐어요!" : ""}</p>
      <div class="cur26-gradepanel on">${cards}</div>
      <button type="button" class="btn btn-ghost pl-reset" data-k="reset" data-reset="1">처음부터 다시 고르기</button>`;
  }

  function draw(focusKey) {
    const seg = [...SEM_TABS.map((si, i) => `${short(si)}${semDone(si) ? " ✓" : ""}`), "내 교육과정"]
      .map((t, i) => `<button type="button" class="${i === tab ? "on" : ""}" data-k="t${i}" data-tab="${i}">${t}</button>`).join("");
    root.innerHTML = `<p class="cur26-lead">1학년은 모두 같은 과목을 들어요. <b>2학년 1학기부터 3학년 2학기까지 4학기</b> 동안 선택군마다 정해진 수만큼 과목을 골라 3년 교육과정을 미리 만들어 보세요. 미리 생각해 보는 연습용이에요. 실제 개설·신청 방법은 학교 안내를 따라 주세요.</p>
      <div class="cur26-seg" role="tablist">${seg}</div>
      ${tab < SEM_TABS.length ? semPanel(SEM_TABS[tab], tab) : resultPanel()}`;
    const el = focusKey && root.querySelector(`[data-k="${CSS.escape(focusKey)}"]`);
    if (el) el.focus({ preventScroll: true });
  }

  root.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b || !root.contains(b)) return;
    if (b.dataset.n) {
      const sel = picks[b.dataset.g], g = ELECTIVE.find(x => x.id === b.dataset.g);
      if (sel.includes(b.dataset.n)) picks[g.id] = sel.filter(n => n !== b.dataset.n);
      else if (sel.length < g.pick) sel.push(b.dataset.n);
      save(picks);
    } else if (b.dataset.tab) {
      tab = +b.dataset.tab;
      draw(b.dataset.k);
      root.querySelector(".cur26-seg").scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    } else if (b.dataset.reset) {
      if (!confirm("지금까지 고른 과목을 모두 지울까요?")) return;
      ELECTIVE.forEach(g => { picks[g.id] = []; });
      save(picks);
      tab = 0;
    } else return;
    draw(b.dataset.k);
  });

  draw();
}
