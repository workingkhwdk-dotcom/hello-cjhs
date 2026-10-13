// '과목 선택 가이드' 탭의 "3년 과목 짜보기" — 우리 학교 선택군(A~I)에서 과목을 미리 골라 3개년 교육과정을 완성해 본다.
// 과목·선택군·학점은 교육과정 탭과 같은 데이터(js/curriculum-2026.js)를 그대로 쓰고, 결과 계산·검증은 서버(evaluatePlan)가 한다.
import { SEM, ELECTIVE, TOTALS, typeChip, badge } from "./curriculum-2026.js";

const PLAN_URL = "https://asia-northeast3-hello-cjhs.cloudfunctions.net/evaluatePlan";
const ANALYZE_URL = "https://asia-northeast3-hello-cjhs.cloudfunctions.net/analyzePlan";
const KEY = "cjhs_course_plan_v1";
const AI_KEY = "cjhs_plan_analysis_v1"; // 같은 선택이면 AI 분석을 다시 부르지 않고 저장해 둔 결과를 보여 준다
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
const picksKey = picks => JSON.stringify(ELECTIVE.map(g => [g.id, [...picks[g.id]].sort()]));
const loadAi = picks => { try { const o = JSON.parse(localStorage.getItem(AI_KEY) || "null"); return o && o.k === picksKey(picks) ? o.a : null; } catch (e) { return null; } };
const saveAi = (picks, a) => { try { localStorage.setItem(AI_KEY, JSON.stringify({ k: picksKey(picks), a })); } catch (e) { /* 저장 못 해도 화면은 동작 */ } };
// 기기 ID: AI 분석 횟수를 기기(브라우저)별로 제한하려고 서버에 보낸다. 개인정보가 아닌 무작위 문자열이고, 저장소를 못 쓰면 이번 방문 동안만 쓴다.
let memDeviceId = "";
const deviceId = () => {
  try {
    let id = localStorage.getItem("cjhs_device_id_v1");
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(id || "")) { id = newId(); localStorage.setItem("cjhs_device_id_v1", id); }
    return id;
  } catch (e) { return memDeviceId || (memDeviceId = newId()); }
};
const newId = () => (self.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);
const clearAi = () => { try { localStorage.removeItem(AI_KEY); } catch (e) { /* 무시 */ } };
const RESET_EVENT = "cjhs:plan-reset";

/** 이 기기에 저장된 3년 과목 선택을 지운다(모바일 홈 "내 선택 초기화" 등). 열려 있는 짜보기 화면도 처음 상태로 돌아간다. */
export function clearPlan() {
  try { localStorage.removeItem(KEY); } catch (e) { /* 저장소 사용 불가 */ }
  window.dispatchEvent(new Event(RESET_EVENT));
}

// onChange({ count, total })는 화면을 다시 그릴 때마다 불린다(과목선택 탭 맨 위의 "내 선택" 줄이 같은 값을 보여 준다).
// 돌려주는 reset()은 확인 창을 거쳐 고른 과목을 모두 지운다.
export function renderPlanner(root, { onChange } = {}) {
  if (!root) return null;
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

  // 결과(학기별 학점·정원 검증·완성 여부)는 서버(evaluatePlan)가 계산한다. 화면은 받은 값을 그리기만 한다.
  function resultHtml(r) {
    const cards = r.semesters.map(sm => {
      const fixed = sm.fixed.map(c => `<li class="pl-row"><span class="cur26-tag f">지정</span><span class="pl-name">${esc(c.name)}</span><b>${c.credit}학점</b></li>`).join("");
      const mine = sm.picked.map(p => `<li class="pl-row mine"><span class="cur26-tag e">${esc(p.group)}군</span><span class="pl-name">${esc(p.name)}</span>${typeChip(p.type)}${badge(p.grade)}<b>${p.credit}학점</b></li>`).join("")
        + sm.todo.map(t => `<li class="pl-row todo">${esc(t.group)}군에서 ${t.left}과목을 더 골라야 해요</li>`).join("");
      return `<div class="cur26-sem"><div class="cur26-semhead"><h5>${esc(sm.name)}</h5><span><b>${sm.credit}</b> / ${sm.total}학점</span></div>
        <ul class="cur26-list">${fixed}${mine}</ul></div>`;
    }).join("");
    const max = Math.max(1, ...r.fields.map(f => f.total));
    const fields = `<div class="pl-fields"><h5>교과별 학점</h5>
      <p class="pl-flegend"><i class="f"></i>학교 지정 <i class="e"></i>내가 고른 과목</p>
      ${r.fields.map(f => `<div class="pl-frow"><span class="pl-fname">${esc(f.field)}</span>
        <span class="pl-fbar" aria-hidden="true"><i class="f" style="width:${f.fixed / max * 100}%"></i><i class="e" style="width:${f.picked / max * 100}%"></i></span>
        <b>${f.total}<small>학점</small></b></div>`).join("")}</div>`;
    return `<p class="pl-semsum">선택 과목 <b>${r.pickedCount}</b> / ${r.totalPicks}과목 · 교과 학점 <b>${r.credit}</b> / ${r.total} ${r.complete ? "· 3년 교육과정이 완성됐어요!" : ""}</p>
      ${fields}<div class="cur26-gradepanel on">${cards}</div>`;
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

  let lastAi = null; // 지금 화면에 보여 준 분석(저장소를 못 읽어도 챗봇 이어가기에 쓴다)
  function analysisHtml(a) {
    lastAi = a;
    const list = items => `<ul class="pl-ai-list">${items.map(t => `<li>${esc(t)}</li>`).join("")}</ul>`;
    return `<div class="pl-ai-card">
      <p class="pl-ai-headline">${esc(a.headline)}</p>
      ${a.balance ? `<p class="pl-ai-text">${esc(a.balance)}</p>` : ""}
      ${a.strengths.length ? `<h6>이런 점이 좋아요</h6>${list(a.strengths)}` : ""}
      ${a.gaps.length ? `<h6>이런 점은 아쉬워요</h6>${list(a.gaps)}` : ""}
      <h6>이 커리큘럼과 어울리는 전공</h6>
      <ol class="pl-majors">${a.majors.map((m, i) => `<li class="${i === 0 ? "top" : ""}">
        <div class="pl-mhead"><span class="pl-mname">${i === 0 ? '<em>가장 잘 맞아요</em>' : ""}${esc(m.track)}</span><b>${m.score}<small>점</small></b></div>
        <span class="pl-mbar" aria-hidden="true"><i style="width:${m.score}%"></i></span>
        <p>${esc(m.reason)}</p>${m.caution ? `<p class="pl-mcaut">${esc(m.caution)}</p>` : ""}</li>`).join("")}</ol>
      ${a.tips.length ? `<h6>이렇게 바꿔 보면 어때요</h6>${list(a.tips)}` : ""}
      <p class="cur26-note">${esc(a.caveat)} 점수는 ‘이 과목 조합이 그 전공 준비에 얼마나 맞는지’를 본 AI의 참고용 판단이에요. 합격 가능성이 아니고, 실제 개설·반 편성은 학교 안내를 따라 주세요.</p>
      <div class="pl-ai-actions">
        <button type="button" class="btn btn-point pl-ai-chat" data-ai="chat">이 분석으로 중앙이와 이어서 상담하기</button>
        <button type="button" class="btn btn-ghost pl-ai-redo" data-ai="go">다시 분석하기</button>
      </div>
    </div>`;
  }

  // 선택을 끝까지 마쳤을 때만 AI 분석을 받을 수 있다. 같은 선택이면 저장해 둔 결과를 바로 보여 준다.
  function aiPanel() {
    const left = TOTAL_PICKS - pickedCount();
    if (left > 0) return `<div class="pl-ai"><h5 class="pl-ai-title">내 커리큘럼 AI 분석</h5><p class="pl-ai-wait">선택과목을 모두 고르면 분석을 받을 수 있어요. <b>${left}과목</b> 남았어요.</p></div>`;
    const saved = loadAi(picks);
    return `<div class="pl-ai"><h5 class="pl-ai-title">내 커리큘럼 AI 분석</h5>
      <div class="pl-ai-out" aria-live="polite">${saved ? analysisHtml(saved) : `<p class="pl-ai-wait">교과별 학점 균형은 어떤지, 이 조합으로 어느 전공 준비에 유리한지 중앙이가 짚어 줘요.</p>
        <button type="button" class="btn btn-point pl-ai-go" data-ai="go">AI 분석 받기</button>`}</div></div>`;
  }

  // 분석을 기다리는 동안 "중앙이가 생각하는 과정"을 단계별로 보여 준다. 서버가 진행 상황을 알려 주는 것은 아니고 시간에 따라 넘어가는 안내다:
  // 마지막 단계는 결과가 올 때까지 계속 진행 중으로 두고, 막대도 끝까지 차지 않아서 오래 걸려도 멈춘 것처럼 보이지 않는다.
  const THINK_STEPS = [
    { at: 0, label: "고른 과목을 하나씩 확인해요" },
    { at: 5, label: "교과별 학점 균형을 계산해요" },
    { at: 13, label: "전공별로 이 조합이 얼마나 맞는지 견줘 봐요" },
    { at: 25, label: "아쉬운 점과 바꿔 볼 제안을 정리해요" },
    { at: 38, label: "결과를 읽기 좋게 다듬어요" },
  ];
  function thinkingHtml() {
    return `<div class="pl-think">
      <span class="pl-sr">AI가 분석하는 중이에요. 잠시만 기다려 주세요.</span>
      <div aria-hidden="true">
        <p class="pl-think-lead">중앙이가 고른 과목을 꼼꼼히 살펴보고 있어요.<br>보통 <b>30초~1분</b> 걸려요. 창을 닫지 말고 잠시만 기다려 주세요.</p>
        <ol class="pl-think-steps">${THINK_STEPS.map(s => `<li><i class="pl-think-dot"></i><span>${s.label}</span></li>`).join("")}</ol>
        <div class="pl-think-bar"><i></i></div>
        <p class="pl-think-time"></p>
      </div>
    </div>`;
  }
  function startThinking(out) {
    const box = out.querySelector(".pl-think");
    if (!box) return () => {};
    const lis = [...box.querySelectorAll(".pl-think-steps li")], bar = box.querySelector(".pl-think-bar i"), time = box.querySelector(".pl-think-time");
    const t0 = Date.now();
    const tick = () => {
      if (!box.isConnected) { clearInterval(iv); return; } // 탭을 옮기거나 다시 그려서 사라지면 스스로 멈춘다
      const sec = (Date.now() - t0) / 1000;
      let cur = 0;
      THINK_STEPS.forEach((s, i) => { if (sec >= s.at) cur = i; });
      lis.forEach((li, i) => { li.className = i < cur ? "done" : i === cur ? "now" : ""; });
      bar.style.width = `${(94 * (1 - Math.exp(-sec / 32))).toFixed(1)}%`;
      time.textContent = sec < 60 ? `${Math.floor(sec)}초째 살펴보는 중` : `${Math.floor(sec)}초째 · 평소보다 오래 걸리지만 멈춘 게 아니에요. 계속 처리하고 있어요.`;
    };
    const iv = setInterval(tick, 500);
    tick();
    return () => clearInterval(iv);
  }

  let aiSeq = 0;
  async function runAnalysis() {
    const out = root.querySelector(".pl-ai-out");
    if (!out) return;
    const my = ++aiSeq, sentPicks = JSON.parse(JSON.stringify(picks));
    out.innerHTML = thinkingHtml();
    const stopThinking = startThinking(out);
    let html;
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 130000) // 서버는 100초 안에 반드시 응답한다(analysis_runner.js) — 화면이 먼저 끊지 않게 그보다 길게;
    try {
      const res = await fetch(ANALYZE_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ picks: sentPicks, deviceId: deviceId() }), signal: ctl.signal });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.analysis) { if (!data.fallback) saveAi(sentPicks, data.analysis); /* 간이 분석은 저장하지 않아 다음에 AI 분석을 다시 받을 수 있다 */ html = analysisHtml(data.analysis); }
      else html = `<p class="pl-ai-wait">${esc(data.error || "AI 분석에 실패했어요. 잠시 후 다시 시도해 주세요.")}</p><button type="button" class="btn btn-point pl-ai-go" data-ai="go">다시 시도</button>`;
    } catch (err) {
      console.error(err);
      html = `<p class="pl-ai-wait">${err && err.name === "AbortError" ? "분석이 너무 오래 걸려서 멈췄어요." : "AI 서버에 연결하지 못했어요."} 잠시 후 다시 시도해 주세요.</p><button type="button" class="btn btn-point pl-ai-go" data-ai="go">다시 시도</button>`;
    } finally { clearTimeout(timer); stopThinking(); }
    if (my === aiSeq && out.isConnected) out.innerHTML = html; // 그 사이 선택을 바꿨거나 탭을 옮겼다면 버린다
  }

  function resultPanel() {
    return `<div class="pl-result"></div>${aiPanel()}`;
  }

  function reset() {
    if (!pickedCount()) return;
    if (!confirm("지금까지 고른 과목을 모두 지울까요?")) return;
    ELECTIVE.forEach(g => { picks[g.id] = []; });
    save(picks); clearAi(); aiSeq++;
    tab = 0;
    draw();
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
    if (onChange) onChange({ count: pickedCount(), total: TOTAL_PICKS });
  }

  root.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b || !root.contains(b)) return;
    if (b.dataset.retry) { loadResult(); return; }
    if (b.dataset.ai === "chat") {
      // 어떤 경우에도 "눌렀는데 아무 일도 없는" 상태가 되지 않게 한다: 저장된 분석을 못 찾으면 지금 화면의 분석으로, 그것도 없으면 선택 과목만으로 이어간다(서버가 둘 다 받는다).
      const chat = window.CjhsPlanChat;
      const actions = b.closest(".pl-ai-actions");
      if (actions) actions.parentNode.querySelectorAll(".pl-ai-note").forEach(n => n.remove());
      if (!chat) {
        if (actions) actions.insertAdjacentHTML("afterend", `<p class="pl-ai-wait pl-ai-note" role="alert">챗봇 연결 기능을 불러오지 못했어요. 페이지를 새로고침한 뒤 다시 눌러 주세요.</p>`);
        return;
      }
      try { chat.set({ picks, analysis: loadAi(picks) || lastAi || null }); } catch (err) { console.error(err); }
      chat.open();
      return;
    }
    if (b.dataset.ai) { runAnalysis(); return; }
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
    } else return;
    draw(b.dataset.k);
  });

  window.addEventListener(RESET_EVENT, () => {
    if (!root.isConnected) return;
    picks = load();
    tab = 0;
    draw();
  });

  draw();
  return { reset };
}
