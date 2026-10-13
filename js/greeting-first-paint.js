// 학교장 인사말 본문을 "첫 화면과 함께" 채운다.
// 예전에는 본문이 Firestore 응답이 온 뒤에야 그려져서, 사진·배너는 먼저 뜨는데 인사글만 한참 비어 있었다.
// 지금은 render 단계에서 ① 지난번에 받아 둔 내용(localStorage) → ② 없으면 기본 문구를 바로 그리고,
// 뒤에서 Firestore에서 최신 내용이 오면 app.js가 같은 칸을 다시 채운다(내용이 같으면 눈에 띄는 변화 없음).
import { SITE_CONTENT_DEFAULTS } from "./content-defaults.js";

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function paintGreetingNow() {
  const body = document.getElementById("greeting-body-content");
  if (!body) return;
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem("cjhs:site_content:greeting")); } catch (e) { /* 저장소를 못 읽어도 기본 문구로 */ }
  const d = Object.assign({}, SITE_CONTENT_DEFAULTS.greeting, cached && typeof cached === "object" ? cached : {});
  const paras = Array.isArray(d.paragraphs) && d.paragraphs.length ? d.paragraphs : SITE_CONTENT_DEFAULTS.greeting.paragraphs;
  body.innerHTML = paras.map(p => `<p>${esc(p)}</p>`).join("") + `<div class="greeting-sign">${esc(d.signOff)}</div>`;
  const title = document.getElementById("head-greeting-title"), tag = document.getElementById("head-greeting-tagline");
  if (title && d.headTitle) title.textContent = d.headTitle;
  if (tag && d.tagline) tag.textContent = d.tagline;
}
