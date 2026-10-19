// 관리자 "상담 신청 항목 관리" 편집 화면 — admin.html이 mountApplyOptionsEditor(상자)로 붙이고,
// load(저장된 설정)로 채운 뒤 저장할 때 read()로 { data } 또는 { error, el }을 받는다.
// 설정 형식·기본값은 js/content-defaults.js, 신청서에 그리는 쪽은 js/consult-form.js.
import { normalizeApplyOptions } from './consult-form.js';

const TYPES = [
  {
    key: 'online', name: '온라인 상담',
    icon: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>'
  },
  {
    key: 'phone', name: '전화 상담',
    icon: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.966.362 1.914.7 2.83a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.916.338 1.864.573 2.83.7A2 2 0 0 1 22 16.92z"/>'
  },
  {
    key: 'visit', name: '방문/대면 상담',
    icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'
  },
  {
    key: 'seminar', name: '입학 설명회',
    icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'
  }
];
const Q_TYPES = [
  { key: 'text', name: '짧은 답' },
  { key: 'textarea', name: '긴 답' },
  { key: 'choice', name: '하나 선택' },
  { key: 'multi', name: '여러 개 선택' }
];

function esc(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function svg(paths) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

// ---------- 보기 편집 칩(중학교·관심 분야·방문 일시·질문 보기 공용) ----------
function chipEditorHtml(values, placeholder) {
  return `<div class="ao-chipedit">${values.map(chipHtml).join('')}<span class="ao-chip-new"><input type="text" class="ao-chip-input" placeholder="${esc(placeholder)}"><button type="button" class="ao-chip-add">추가</button></span></div>`;
}
function chipHtml(v) {
  return `<span class="ao-chip" data-v="${esc(v)}">${esc(v)}<button type="button" class="ao-chip-x" aria-label="${esc(v)} 지우기" title="지우기">×</button></span>`;
}
function addChips(editor, text) {
  const input = editor.querySelector('.ao-chip-input');
  const have = new Set(readChips(editor, false));
  text.split(',').map(t => t.trim()).filter(Boolean).forEach(v => {
    if (have.has(v)) return;
    have.add(v);
    input.parentElement.insertAdjacentHTML('beforebegin', chipHtml(v));
  });
}
// 입력칸에 쓰고 [추가]를 안 누른 글자도 저장할 때는 보기로 친다
function readChips(editor, includePending = true) {
  const list = [...editor.querySelectorAll('.ao-chip')].map(c => c.dataset.v);
  if (includePending) {
    const pending = editor.querySelector('.ao-chip-input').value.split(',').map(t => t.trim()).filter(Boolean);
    pending.forEach(v => { if (!list.includes(v)) list.push(v); });
  }
  return list;
}

// ---------- 질문 한 개 ----------
function questionHtml(q) {
  const showOptions = q.type === 'choice' || q.type === 'multi';
  return `
    <li class="ao-q" data-qtype="${esc(q.type)}">
      <div class="ao-q-row">
        <span class="ao-q-num"></span>
        <input type="text" class="ao-input ao-q-label" value="${esc(q.label)}" placeholder="질문 내용 (예: 참석 인원)">
        <span class="ao-q-tools">
          <button type="button" class="ao-icon-btn" data-act="up" title="위로" aria-label="위로">↑</button>
          <button type="button" class="ao-icon-btn" data-act="down" title="아래로" aria-label="아래로">↓</button>
          <button type="button" class="ao-icon-btn ao-danger" data-act="del" title="이 질문 지우기">삭제</button>
        </span>
      </div>
      <div class="ao-q-row ao-q-settings">
        <span class="ao-mini-label">답 형식</span>
        <span class="ao-seg" role="radiogroup" aria-label="답 형식">${Q_TYPES.map(t =>
          `<button type="button" role="radio" data-qt="${t.key}" aria-checked="${t.key === q.type}">${t.name}</button>`).join('')}</span>
        <button type="button" class="ao-req" aria-pressed="${!!q.required}">${q.required ? '필수 응답' : '선택 응답'}</button>
      </div>
      <div class="ao-q-row ao-q-options"${showOptions ? '' : ' hidden'}>
        <span class="ao-mini-label">보기</span>
        ${chipEditorHtml(q.options, '보기 입력 후 Enter')}
      </div>
      <div class="ao-q-row">
        <span class="ao-mini-label">도움말</span>
        <input type="text" class="ao-input ao-q-hint" value="${esc(q.hint)}" placeholder="(선택) 입력칸에 흐리게 보이는 안내 — 예: 궁금하신 점을 자유롭게 적어 주세요">
      </div>
    </li>`;
}

function fixedRow(label, why) {
  return `<li class="ao-q ao-q-fixed"><span class="ao-q-num">고정</span><b>${esc(label)}</b><span class="ao-tag">필수</span><span class="ao-q-why">${esc(why)}</span></li>`;
}

// ---------- 유형 카드 ----------
function typeCardHtml(t, o) {
  const on = !!o.consultTypes[t.key];
  const isForm = t.key !== 'online';
  const field = (label, help, control) =>
    `<div class="ao-field"><div class="ao-field-label">${label}${help ? ` <span class="ao-field-help">${help}</span>` : ''}</div>${control}</div>`;

  let body = `<div class="ao-grid2">${field('버튼 이름', 'Q1 버튼과 Q4 제목에 표시',
    `<input type="text" class="ao-input" data-k="label" value="${esc(o.typeLabels[t.key])}" placeholder="${esc(t.name)}">`)}`;
  if (t.key === 'seminar') {
    body += field('설명회 일시', '신청 화면에 그대로 표시',
      `<input type="text" class="ao-input" data-k="seminarDate" value="${esc(o.seminarDate)}" placeholder="예: 11월 7일(토) 14:00">`);
  }
  body += '</div>';

  if (!isForm) {
    body += `<p class="ao-explain">학부모가 이 버튼을 고르면 <b>AI 챗봇에게 물어보기 / Q&amp;A 게시판</b> 안내로 바로 연결돼요. 따로 받는 신청서는 없어요.</p>`;
  } else {
    if (t.key === 'visit') {
      body += field('방문 가능 일시', '학부모가 여러 개 고를 수 있어요',
        `<div data-k="visitDates">${chipEditorHtml(o.visitDates, '예: 10월 17일(토) 18:30 입력 후 Enter')}</div>`);
    }
    body += field('안내 문구', 'Q4 맨 위 상자에 표시 · 비워 두면 안 보임',
      `<textarea class="ao-input ao-textarea" data-k="note" rows="2">${esc(o.typeNotes[t.key])}</textarea>`);
    const fixed = fixedRow('보호자 성함', '신청 확인·취소 조회에 필요해 항상 물어요') +
      fixedRow('연락처', '취소 조회에 필요해 항상 물어요') +
      (t.key === 'visit' ? fixedRow('방문 희망 일시', '위 "방문 가능 일시" 보기 중에서 고름') : '');
    body += `
      <div class="ao-field">
        <div class="ao-field-label">Q4 신청서 질문 <span class="ao-field-help">위에서부터 순서대로 나와요 · Q2 중학교·Q3 관심 분야는 아래 "공통 질문"</span></div>
        <ol class="ao-qlist ao-qlist-fixed">${fixed}</ol>
        <ol class="ao-qlist ao-qlist-edit">${o.typeQuestions[t.key].map(questionHtml).join('')}</ol>
        <button type="button" class="ao-add-q">+ 질문 추가</button>
      </div>`;
  }

  return `
    <article class="ao-type${on ? ' is-on' : ''}${on && isForm ? ' is-open' : ''}" data-type="${t.key}">
      <header class="ao-type-head">
        <span class="ao-type-icon">${svg(t.icon)}</span>
        <button type="button" class="ao-type-title" data-nodirty aria-expanded="${on && isForm}">
          <span class="ao-type-name"></span>
          <span class="ao-type-meta"></span>
        </button>
        <button type="button" class="ao-switch" role="switch" aria-checked="${on}" title="신청 화면에 보이기/숨기기">
          <span class="ao-switch-track"><span class="ao-switch-knob"></span></span>
          <span class="ao-switch-text"></span>
        </button>
        <button type="button" class="ao-type-expand" data-nodirty aria-label="설정 펼치기/접기"><span class="ao-chev">⌄</span></button>
      </header>
      <div class="ao-type-body">${body}</div>
    </article>`;
}

function renumber(card) {
  card.querySelectorAll('.ao-qlist-edit .ao-q').forEach((li, i) => {
    li.querySelector('.ao-q-num').textContent = i + 1;
  });
}

// 카드 머리줄(이름·요약)과 맨 위 "지금 신청 화면" 미리보기를 지금 입력값대로 맞춘다
function refresh(root) {
  const live = [];
  root.querySelectorAll('.ao-type').forEach(card => {
    const key = card.dataset.type;
    const t = TYPES.find(x => x.key === key);
    const on = card.querySelector('.ao-switch').getAttribute('aria-checked') === 'true';
    const name = card.querySelector('[data-k="label"]').value.trim() || t.name;
    card.classList.toggle('is-on', on);
    card.querySelector('.ao-switch-text').textContent = on ? '보이기' : '숨김';
    card.querySelector('.ao-type-name').textContent = name;
    let meta;
    if (key === 'online') {
      meta = 'AI 챗봇 · Q&A 게시판으로 연결';
    } else {
      const qs = [...card.querySelectorAll('.ao-qlist-edit .ao-q-label')].map(i => i.value.trim()).filter(Boolean);
      const parts = ['보호자 성함', '연락처'].concat(key === 'visit' ? ['방문 희망 일시'] : [], qs);
      meta = `Q4 질문 ${parts.length}개: ${parts.join(' · ')}`;
      if (key === 'seminar') {
        const date = card.querySelector('[data-k="seminarDate"]').value.trim();
        if (date) meta = `${date} · ${meta}`;
      }
    }
    card.querySelector('.ao-type-meta').textContent = meta;
    renumber(card);
    if (on) live.push(name);
  });
  const liveEl = root.querySelector('.ao-live-chips');
  liveEl.innerHTML = live.length
    ? live.map(n => `<span class="ao-live-chip">${esc(n)}</span>`).join('')
    : '<span class="ao-live-empty">켜진 유형이 없어요 — 저장하려면 하나 이상 켜 주세요</span>';
}

function setOpen(card, open) {
  card.classList.toggle('is-open', open);
  card.querySelector('.ao-type-title').setAttribute('aria-expanded', String(open));
}

export function mountApplyOptionsEditor(root) {
  root.classList.add('ao');

  // ----- 클릭 동작(이벤트 위임) -----
  root.addEventListener('click', (e) => {
    const card = e.target.closest('.ao-type');
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.classList.contains('ao-switch')) {
      const on = btn.getAttribute('aria-checked') !== 'true';
      btn.setAttribute('aria-checked', String(on));
      if (on && card.dataset.type !== 'online') setOpen(card, true);
    } else if (btn.classList.contains('ao-type-title') || btn.classList.contains('ao-type-expand')) {
      setOpen(card, !card.classList.contains('is-open'));
    } else if (btn.classList.contains('ao-chip-x')) {
      btn.closest('.ao-chip').remove();
    } else if (btn.classList.contains('ao-chip-add')) {
      const editor = btn.closest('.ao-chipedit');
      const input = editor.querySelector('.ao-chip-input');
      addChips(editor, input.value);
      input.value = '';
      input.focus();
    } else if (btn.classList.contains('ao-add-q')) {
      const list = card.querySelector('.ao-qlist-edit');
      list.insertAdjacentHTML('beforeend', questionHtml({ label: '', type: 'text', options: [], required: false, hint: '' }));
      list.lastElementChild.querySelector('.ao-q-label').focus();
    } else if (btn.dataset.qt) {
      const li = btn.closest('.ao-q');
      li.dataset.qtype = btn.dataset.qt;
      li.querySelectorAll('[data-qt]').forEach(b => b.setAttribute('aria-checked', String(b === btn)));
      li.querySelector('.ao-q-options').hidden = !(btn.dataset.qt === 'choice' || btn.dataset.qt === 'multi');
    } else if (btn.classList.contains('ao-req')) {
      const req = btn.getAttribute('aria-pressed') !== 'true';
      btn.setAttribute('aria-pressed', String(req));
      btn.textContent = req ? '필수 응답' : '선택 응답';
    } else if (btn.dataset.act) {
      const li = btn.closest('.ao-q');
      if (btn.dataset.act === 'up' && li.previousElementSibling) li.previousElementSibling.before(li);
      if (btn.dataset.act === 'down' && li.nextElementSibling) li.nextElementSibling.after(li);
      if (btn.dataset.act === 'del') {
        const label = li.querySelector('.ao-q-label').value.trim();
        if (label && !confirm(`'${label}' 질문을 지울까요? (저장해야 실제로 반영돼요)`)) return;
        li.remove();
      }
    }
    refresh(root);
  });

  // 보기 입력칸에서 Enter = 추가 (폼 제출·줄바꿈 방지)
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.classList.contains('ao-chip-input')) return;
    e.preventDefault();
    const editor = e.target.closest('.ao-chipedit');
    addChips(editor, e.target.value);
    e.target.value = '';
  });
  root.addEventListener('input', () => refresh(root));

  return {
    load(saved) {
      const o = normalizeApplyOptions(saved);
      root.innerHTML = `
        <div class="ao-live">
          <div class="ao-live-label">지금 학부모 신청 화면의 Q1 버튼</div>
          <div class="ao-live-chips"></div>
          <div class="ao-live-help">아래에서 켜고 끄거나 이름을 바꾸면 여기에 바로 보여요. <b>맨 아래 [저장하기]</b>를 눌러야 실제 화면에 반영됩니다.</div>
        </div>

        <section class="ao-sec">
          <div class="ao-sec-head">
            <span class="ao-step">1</span>
            <div>
              <h4>상담 유형별 설정</h4>
              <p>오른쪽 스위치로 신청 화면에 보일지 정하고, 카드를 눌러 펼치면 그 유형의 신청서 질문을 따로 만들 수 있어요.</p>
            </div>
          </div>
          <div class="ao-types">${TYPES.map(t => typeCardHtml(t, o)).join('')}</div>
        </section>

        <section class="ao-sec">
          <div class="ao-sec-head">
            <span class="ao-step">2</span>
            <div>
              <h4>공통 질문 <span class="ao-sec-sub">전화·방문·설명회 신청서 모두 Q2·Q3로 물어요</span></h4>
              <p>보기를 지우려면 ×, 더하려면 입력 후 Enter(또는 [추가])를 누르세요.</p>
            </div>
          </div>
          <div class="ao-card">
            <div class="ao-field">
              <div class="ao-field-label">Q2 자녀가 재학 중인 중학교 <span class="ao-field-help">"그 외(직접 입력)"는 항상 맨 뒤에 자동으로 붙어요</span></div>
              <div data-k="schools">${chipEditorHtml(o.schools, '학교 이름 입력 후 Enter')}</div>
            </div>
            <div class="ao-field">
              <div class="ao-field-label">Q3 궁금하신 분야 <span class="ao-field-help">"기타(직접 입력)"는 항상 맨 뒤에 자동으로 붙어요</span></div>
              <div data-k="topics">${chipEditorHtml(o.topics, '분야 입력 후 Enter')}</div>
            </div>
          </div>
        </section>`;
      refresh(root);
    },

    // 저장할 값. 고칠 곳이 있으면 { error, el } (el로 스크롤·강조)
    read() {
      root.querySelectorAll('.ao-invalid').forEach(el => el.classList.remove('ao-invalid'));
      const fail = (error, el, card) => {
        if (card) setOpen(card, true);
        if (el) el.classList.add('ao-invalid');
        return { error, el };
      };
      const data = {
        schools: readChips(root.querySelector('[data-k="schools"] .ao-chipedit')),
        topics: readChips(root.querySelector('[data-k="topics"] .ao-chipedit')),
        consultTypes: {}, typeLabels: {}, typeNotes: {}, typeQuestions: {},
        visitDates: [], seminarDate: ''
      };
      if (!data.schools.length) return fail('Q2 중학교 보기를 하나 이상 넣어 주세요.', root.querySelector('[data-k="schools"]'));
      if (!data.topics.length) return fail('Q3 관심 분야 보기를 하나 이상 넣어 주세요.', root.querySelector('[data-k="topics"]'));

      for (const card of root.querySelectorAll('.ao-type')) {
        const key = card.dataset.type;
        const t = TYPES.find(x => x.key === key);
        const on = card.querySelector('.ao-switch').getAttribute('aria-checked') === 'true';
        const name = card.querySelector('[data-k="label"]').value.trim() || t.name;
        data.consultTypes[key] = on;
        data.typeLabels[key] = name;
        if (key === 'online') continue;
        data.typeNotes[key] = card.querySelector('[data-k="note"]').value.trim();
        if (key === 'visit') {
          data.visitDates = readChips(card.querySelector('[data-k="visitDates"] .ao-chipedit'));
          if (on && !data.visitDates.length) return fail(`${name}: 방문 가능 일시를 하나 이상 넣어 주세요.`, card.querySelector('[data-k="visitDates"]'), card);
        }
        if (key === 'seminar') {
          const dateEl = card.querySelector('[data-k="seminarDate"]');
          data.seminarDate = dateEl.value.trim();
          if (!data.seminarDate) return fail(`${name}: 설명회 일시를 적어 주세요.`, dateEl, card);
        }
        const qs = [];
        const items = [...card.querySelectorAll('.ao-qlist-edit .ao-q')];
        for (let i = 0; i < items.length; i++) {
          const li = items[i];
          const labelEl = li.querySelector('.ao-q-label');
          const type = li.dataset.qtype;
          const q = {
            label: labelEl.value.trim(),
            type,
            options: type === 'choice' || type === 'multi' ? readChips(li.querySelector('.ao-chipedit')) : [],
            required: li.querySelector('.ao-req').getAttribute('aria-pressed') === 'true',
            hint: li.querySelector('.ao-q-hint').value.trim()
          };
          if (!q.label) return fail(`${name}: ${i + 1}번 질문 내용을 적어 주세요. (필요 없으면 [삭제])`, labelEl, card);
          if (q.options.length === 0 && (type === 'choice' || type === 'multi')) {
            return fail(`${name}: '${q.label}' 질문의 보기를 넣어 주세요.`, li.querySelector('.ao-q-options'), card);
          }
          if (type === 'choice' && q.options.length < 2) {
            return fail(`${name}: '${q.label}'는 "하나 선택"이라 보기가 두 개 이상 필요해요.`, li.querySelector('.ao-q-options'), card);
          }
          qs.push(q);
        }
        data.typeQuestions[key] = qs;
      }
      if (!Object.values(data.consultTypes).some(Boolean)) {
        return fail('상담 유형을 하나 이상 켜 주세요. (꺼 두면 학부모가 아무것도 신청할 수 없어요)', root.querySelector('.ao-types'));
      }
      return { data };
    }
  };
}
