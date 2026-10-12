// '과목 선택 가이드' 탭의 "3년 과목 짜보기" — 우리 학교 선택군(A~I)에서 과목을 미리 골라 3개년 교육과정을 완성해 본다.
// 과목·선택군·학점은 교육과정 탭과 같은 데이터(js/curriculum-2026.js)를 그대로 쓰고, 결과 계산·검증은 서버(evaluatePlan)가 한다.
import { SEM, ELECTIVE, TOTALS, typeChip, badge } from "./curriculum-2026.js";

const PLAN_URL = "https://asia-northeast3-hello-cjhs.cloudfunctions.net/evaluatePlan";
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
    const reset = pickedCount() ? `<button type="button" class="pl-reset-top" data-k="reset" data-reset="1" aria-label="내 선택 초기화"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/></svg>내 선택 초기화</button>` : "";
    return `<div class="pl-semtop"><p class="pl-semsum"><b>${SEM[si]}</b> 선택 학점 <b>${pickedCredits(si)}</b> / ${TOTALS.elective[si]}</p>${reset}</div>
      ${groupsOf(si).map(g => groupHtml(g, taken)).join("")}${next}`;
  }

  // 결과(학기별 학점·정원 검증·완성 여부)는 서버(evaluatePlan)가 계산한다. 화면은 받은 값을 그리기만 한다.
  function resultHtml(r) {
    const cards = r.semesters.map(sm => {
      const fixed = sm.fixed.map(c => `<li class="pl-row"><span class="cur26-tag f">지정</span><span class="pl-name">${esc(c.name)}</span><b>${c.credit}학점</b></li>`).join("");
      const mine = sm.picked.map(p => `<li class="pl-row mine"><span class="cur26-tag e">${esc(p.group)}군</span><span class="pl-name">${esc(p.name)}</span>${typeChip(p.type)}${badge(p.grade)}<b>${p.credit}학점</b></li>`).join("")
        + sm.todo.map(t => `<li class="pl-row todo">${esc(t.group)}군에서 ${t.left}과목을 더 골라야 해요</li>`).join("");
      return `<div class="cur26-sem"><div class="cur26-semhead"><h5>${esc(sm.name)}</h5><span><b>${sm.credit}</b> / ${sm.total}학점</span></div>
        <ul class="cur26-list">${fixed}${mine}</ul></div>`;
    }).join("");
    return `<p class="pl-semsum">선택 과목 <b>${r.pickedCount}</b> / ${r.totalPicks}과목 · 교과 학점 <b>${r.credit}</b> / ${r.total} ${r.complete ? "· 3년 교육과정이 완성됐어요!" : ""}</p>
      <div class="cur26-gradepanel on">${cards}</div>`;
  }

  let seq = 0;
  async function loadResult() {
    const box = root.querySelector(".pl-result");
    if (!box) return;
    const my = ++seq;
    box.innerHTML = `<p class="pl-semsum" aria-live="polite">내 교육과정을 계산하고 있어요…</p>`;
    let html;
    try {
      const res = await fetch(PLAN_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ picks }) });
      const data = await res.json().catch(() => ({}));
      html = res.ok && data.result ? resultHtml(data.result)
        : `<p class="pl-semsum">${esc(data.error || "계산 서버에 연결하지 못했어요.")}</p><button type="button" class="btn btn-point" data-retry="1">다시 시도</button>`;
    } catch (err) {
      console.error(err);
      html = `<p class="pl-semsum">계산 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.</p><button type="button" class="btn btn-point" data-retry="1">다시 시도</button>`;
    }
    if (my === seq && box.isConnected) box.innerHTML = html; // 그 사이 탭을 옮겼다면 버린다
  }

  function resultPanel() {
    return `<div class="pl-result"></div>`;
  }

  function draw(focusKey) {
    const seg = [...SEM_TABS.map((si, i) => `${short(si)}${semDone(si) ? " ✓" : ""}`), "내 교육과정"]
      .map((t, i) => `<button type="button" class="${i === tab ? "on" : ""}" data-k="t${i}" data-tab="${i}">${t}</button>`).join("");
    root.innerHTML = `<p class="cur26-lead">1학년은 모두 같은 과목을 들어요. <b>2학년 1학기부터 3학년 2학기까지 4학기</b> 동안 선택군마다 정해진 수만큼 과목을 골라 3년 교육과정을 미리 만들어 보세요. 미리 생각해 보는 연습용이에요. 실제 개설·신청 방법은 학교 안내를 따라 주세요.</p>
      <div class="cur26-seg" role="tablist">${seg}</div>
      ${tab < SEM_TABS.length ? semPanel(SEM_TABS[tab], tab) : resultPanel()}`;
    const el = focusKey && root.querySelector(`[data-k="${CSS.escape(focusKey)}"]`);
    if (el) el.focus({ preventScroll: true });
    if (tab === SEM_TABS.length) loadResult();
  }

  root.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b || !root.contains(b)) return;
    if (b.dataset.retry) { loadResult(); return; }
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
