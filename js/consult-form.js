// 상담 신청서(apply.app.js·mobile.app.js 공용) — 관리자 "상담 신청 항목 관리" 설정에 맞춰
// Q1 상담 유형(켜기/끄기·이름)과 유형별 Q4 안내 문구·질문을 그리고, 답을 읽고 검사한다.
// 보호자 성함·연락처·방문 희망 일시처럼 고정된 칸은 각 화면의 HTML에 있고, 여기는 그 아래 "추가 질문"만 다룬다.
import { APPLY_OPTIONS_DEFAULTS } from './content-defaults.js';

// 신청서에 저장되는 consultType 값 → 설정 키
export const TYPE_KEYS = { '온라인': 'online', '전화': 'phone', '방문': 'visit', '설명회': 'seminar' };
export const QUESTION_TYPES = ['text', 'textarea', 'choice', 'multi'];
const FORM_TYPES = ['phone', 'visit', 'seminar'];

function cleanQuestions(list) {
  return (Array.isArray(list) ? list : [])
    .filter(q => q && typeof q.label === 'string' && q.label.trim())
    .map(q => ({
      label: q.label.trim(),
      type: QUESTION_TYPES.includes(q.type) ? q.type : 'text',
      options: Array.isArray(q.options) ? q.options.map(o => String(o).trim()).filter(Boolean) : [],
      required: !!q.required,
      hint: typeof q.hint === 'string' ? q.hint : ''
    }));
}

// 저장된 설정 + 기본값 → 빠진 값 없는 설정. 10-19 첫 배포 때의 seminarTitle/seminarQuestions 도 읽는다.
export function normalizeApplyOptions(data) {
  const d = data || {};
  const D = APPLY_OPTIONS_DEFAULTS;
  const list = (v, fallback) => (Array.isArray(v) && v.length ? v : fallback);

  const typeLabels = Object.assign({}, D.typeLabels, d.seminarTitle ? { seminar: d.seminarTitle } : {}, d.typeLabels || {});
  Object.keys(D.typeLabels).forEach(k => { if (!String(typeLabels[k] || '').trim()) typeLabels[k] = D.typeLabels[k]; });

  const savedQ = Object.assign({}, Array.isArray(d.seminarQuestions) ? { seminar: d.seminarQuestions } : {}, d.typeQuestions || {});
  const typeQuestions = {};
  FORM_TYPES.forEach(k => { typeQuestions[k] = cleanQuestions(Array.isArray(savedQ[k]) ? savedQ[k] : D.typeQuestions[k]); });

  return {
    schools: list(d.schools, D.schools),
    topics: list(d.topics, D.topics),
    visitDates: list(d.visitDates, D.visitDates),
    consultTypes: Object.assign({}, D.consultTypes, d.consultTypes || {}),
    typeLabels,
    typeNotes: Object.assign({}, D.typeNotes, d.typeNotes || {}),
    seminarDate: d.seminarDate || D.seminarDate,
    typeQuestions
  };
}

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let opts = normalizeApplyOptions(null);

export function consultTypeLabel(consultType) {
  const key = TYPE_KEYS[consultType];
  return key ? opts.typeLabels[key] : (consultType || '-');
}
export function currentSeminarDate() {
  return opts.seminarDate;
}

function renderQuestions(key) {
  const box = document.querySelector(`.type-questions[data-type="${key}"]`);
  if (!box) return;
  box.innerHTML = opts.typeQuestions[key].map((q, i) => {
    const id = `tq-${key}-${i}`;
    const label = `${escapeHtml(q.label)}${q.required ? ' *' : ' (선택)'}`;
    const hint = q.hint ? `<div class="hint">${escapeHtml(q.hint)}</div>` : '';
    if (q.type === 'choice') {
      return `<div class="field"><label>${label}</label><div class="radio-row" id="${id}">${q.options.map(o =>
        `<label class="radio-chip"><input type="radio" name="${id}" value="${escapeHtml(o)}">${escapeHtml(o)}</label>`).join('')}</div>${hint}</div>`;
    }
    if (q.type === 'multi') {
      return `<div class="field"><label>${label} <span class="q-sub">(여러 개 선택 가능)</span></label><div class="chip-group" id="${id}">${q.options.map(o =>
        `<label class="checkbox-chip"><input type="checkbox" class="chk" value="${escapeHtml(o)}"><span>${escapeHtml(o)}</span></label>`).join('')}</div>${hint}</div>`;
    }
    if (q.type === 'textarea') {
      return `<div class="field"><label for="${id}">${label}</label><textarea id="${id}" placeholder="${escapeHtml(q.hint)}"></textarea></div>`;
    }
    return `<div class="field"><label for="${id}">${label}</label><input type="text" id="${id}" placeholder="${escapeHtml(q.hint)}"></div>`;
  }).join('');
  // 고른 보기에 색 표시(신청서의 다른 칩과 같은 방식)
  box.querySelectorAll('.radio-row input').forEach(r => r.addEventListener('change', () => {
    r.closest('.radio-row').querySelectorAll('.radio-chip').forEach(c => c.classList.toggle('checked', c.contains(r)));
  }));
  box.querySelectorAll('.chip-group input').forEach(cb => cb.addEventListener('change', () => {
    cb.closest('.checkbox-chip').classList.toggle('checked', cb.checked);
  }));
}

function answerOf(key, q, i) {
  const id = `tq-${key}-${i}`;
  if (q.type === 'choice') {
    const r = document.querySelector(`input[name="${id}"]:checked`);
    return r ? r.value : '';
  }
  if (q.type === 'multi') {
    return [...document.querySelectorAll(`#${id} input:checked`)].map(cb => cb.value).join(', ');
  }
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

// 신청서의 Q4 추가 질문 답 → [{ q, a }] (서버가 "질문: 답" 줄로 정리해 관리자 화면에 보여 준다)
export function readTypeAnswers(consultType) {
  const key = TYPE_KEYS[consultType];
  return (opts.typeQuestions[key] || []).map((q, i) => ({ q: q.label, a: answerOf(key, q, i) }));
}

// 필수 질문이 비었으면 안내 문구, 아니면 null
export function validateTypeAnswers(consultType) {
  const key = TYPE_KEYS[consultType];
  const list = opts.typeQuestions[key] || [];
  for (let i = 0; i < list.length; i++) {
    const q = list[i];
    if (q.required && !answerOf(key, q, i)) {
      return `Q4. '${q.label}' 항목을 ${q.type === 'choice' || q.type === 'multi' ? '선택' : '입력'}해 주세요.`;
    }
  }
  return null;
}

// 고른 유형이 숨겨졌거나 아무것도 안 골랐으면 보이는 첫 유형을 고르고, onChange(값 | null)로 알린다.
export function syncConsultSelection(onChange) {
  const chips = [...document.querySelectorAll('#consult-type-row .consult-type-chip')];
  const visible = chips.filter(c => !c.hidden);
  if (!visible.length) {
    chips.forEach(c => { c.classList.remove('checked'); c.querySelector('input').checked = false; });
    onChange(null);
    return;
  }
  let cur = chips.find(c => c.querySelector('input').checked);
  if (!cur || cur.hidden) {
    cur = visible[0];
    cur.querySelector('input').checked = true;
  }
  chips.forEach(c => c.classList.toggle('checked', c === cur));
  onChange(cur.querySelector('input').value);
}

// 설정(Firestore site_content/applyOptions, 없으면 null)을 화면에 반영
export function applyConsultOptions(data, onChange) {
  opts = normalizeApplyOptions(data);
  document.querySelectorAll('.type-title[data-type]').forEach(el => { el.textContent = opts.typeLabels[el.dataset.type] || ''; });
  document.querySelectorAll('.type-note[data-type]').forEach(el => { el.textContent = opts.typeNotes[el.dataset.type] || ''; });
  document.querySelectorAll('.seminar-date-text').forEach(el => { el.textContent = opts.seminarDate; });
  FORM_TYPES.forEach(renderQuestions);

  const row = document.getElementById('consult-type-row');
  const chips = [...row.querySelectorAll('.consult-type-chip')];
  chips.forEach(c => { c.hidden = !opts.consultTypes[c.dataset.type]; });
  const count = chips.filter(c => !c.hidden).length;
  row.dataset.count = count;
  let empty = document.getElementById('consult-type-empty');
  if (count === 0 && !empty) {
    empty = document.createElement('div');
    empty.id = 'consult-type-empty';
    empty.className = 'consult-type-empty';
    empty.textContent = '지금은 상담 신청을 받고 있지 않아요.';
    row.after(empty);
  } else if (count > 0 && empty) {
    empty.remove();
  }
  syncConsultSelection(onChange);
}
