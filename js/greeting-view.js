// 학교장 인사말 탭 그리기 — PC(index)와 모바일(mobile)이 같이 쓴다.
// 1) render 스크립트가 화면을 그리자마자 "지난번 내용(localStorage) 또는 기본 문구"로 바로 채우고,
// 2) app 스크립트가 최신 내용을 받으면 달라진 부분만 고친다(같으면 아무것도 건드리지 않아 깜빡임이 없다).
// 사진: 등록 사진은 다 받아 디코딩까지 끝난 뒤 <img>의 주소만 바꾼다. 예전처럼 칸을 통째로 갈아 끼우면
// 새 사진이 그려지기 전 잠깐 칸 높이가 0이 되어 "글만 보이는" 순간이 생겼다.
import { fitGreetingPhoto } from "./greeting-photo.js";
import { SITE_CONTENT_DEFAULTS as DEFAULTS } from "./content-defaults.js";

const SIZE_KEY = "cjhs_greeting_photo_size_v1"; // 등록 사진의 가로세로 크기(다음 방문 때 칸 높이를 미리 잡아 두려고)

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function readSize() { try { return JSON.parse(localStorage.getItem(SIZE_KEY) || "null"); } catch (e) { return null; } }
function saveSize(url, w, h) { try { localStorage.setItem(SIZE_KEY, JSON.stringify({ url, w, h })); } catch (e) {} }
function setText(id, text) { const el = document.getElementById(id); if (el && el.textContent !== text) el.textContent = text; }

function setPhoto(slot, url, w, h) {
  const fg = slot.querySelector(".gp-fg");
  if (!fg) return;
  if (w && h) { fg.width = w; fg.height = h; }
  if (fg.getAttribute("src") !== url) fg.src = url;
}

let wanted = ""; // 마지막으로 요청한 사진 주소(늦게 끝난 옛 요청이 새 사진을 덮지 않게)

function builtInSrc(slot, fg) {
  if (!slot.__builtIn) slot.__builtIn = { src: fg.getAttribute("src"), w: fg.getAttribute("width"), h: fg.getAttribute("height") };
  return slot.__builtIn;
}

function applyPhoto(slot, url) {
  const fg = slot.querySelector(".gp-fg");
  if (!fg) return;
  const b = builtInSrc(slot, fg);
  if (!url) { // 관리자가 사진을 지웠으면 내장 사진으로 돌아간다
    wanted = "";
    if (fg.getAttribute("src") !== b.src) setPhoto(slot, b.src, +b.w, +b.h);
    return;
  }
  if (fg.getAttribute("src") === url || fg.getAttribute("src") === url || wanted === url) return;
  wanted = url;
  const im = new Image();
  im.decoding = "async";
  im.src = url;
  const done = () => {
    if (wanted !== url || !im.naturalWidth) return;
    saveSize(url, im.naturalWidth, im.naturalHeight);
    // 다 받아 둔 그 <img>를 그대로 칸에 넣는다(주소만 바꾸면 브라우저가 사진을 다시 받기도 한다).
    const cur = slot.querySelector(".gp-fg");
    if (!cur) return;
    im.className = cur.className;
    im.alt = cur.alt;
    im.width = im.naturalWidth; im.height = im.naturalHeight;
    cur.replaceWith(im);
  };
  // decode()가 끝나면 이미 그릴 준비가 된 상태라 바꿔도 빈 칸이 생기지 않는다. 실패하면 지금 사진(내장 사진)을 그대로 둔다.
  (im.decode ? im.decode() : new Promise((ok, no) => { im.onload = ok; im.onerror = no; })).then(done, () => { if (im.complete && im.naturalWidth) done(); else if (wanted === url) wanted = ""; });
}

// 첫 그리기: 지난번 등록 사진의 크기를 알면 그 사진을 바로 쓰고(img-preload.js가 미리 받아 둠), 모르면 내장 사진을 둔다.
function initialPhoto(slot, url) {
  const fg = slot.querySelector(".gp-fg");
  if (!fg) return;
  const b = builtInSrc(slot, fg);
  const size = readSize();
  if (url && size && size.url === url) {
    fg.addEventListener("error", function onErr() { fg.removeEventListener("error", onErr); wanted = ""; setPhoto(slot, b.src, +b.w, +b.h); });
    setPhoto(slot, url, size.w, size.h);
  } else if (url) {
    applyPhoto(slot, url);
  }
}

export function renderGreeting(data, { initial = false } = {}) {
  const d = Object.assign({}, DEFAULTS.greeting, data || {});
  setText("head-greeting-title", d.headTitle);
  setText("head-greeting-tagline", d.tagline);
  const slot = document.getElementById("greeting-photo-slot");
  if (slot) {
    if (initial) initialPhoto(slot, d.photoUrl); else applyPhoto(slot, d.photoUrl);
    fitGreetingPhoto(slot);
  }
  const body = document.getElementById("greeting-body-content");
  if (body) {
    const paragraphs = d.paragraphs && d.paragraphs.length ? d.paragraphs : DEFAULTS.greeting.paragraphs;
    const html = paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join("") + `<div class="greeting-sign">${escapeHtml(d.signOff)}</div>`;
    if (body.__html !== html) { body.innerHTML = html; body.__html = html; }
  }
}

// render 스크립트용: 저장된 내용(없으면 기본 문구)으로 즉시 그린다.
export function renderGreetingFromCache() {
  let cached;
  try { cached = window.__cjhsCachedContent && window.__cjhsCachedContent("greeting"); } catch (e) {}
  renderGreeting(cached, { initial: true });
}
