// 이미지를 누르면 전체 화면으로 열리고, 두 손가락 확대/축소·한 손가락 이동·더블탭 확대가 되는 간단한 뷰어.
// (브라우저 기본 핀치 확대가 막힌 환경 — 홈 화면에 추가한 앱, 인앱 브라우저 등 — 에서도 동작하도록 직접 구현)
const MAX = 5;

export function enableImageZoom(root, selector) {
  root.addEventListener("click", (e) => {
    const img = e.target.closest(selector);
    if (img) openViewer(img.currentSrc || img.src, img.alt);
  });
}

function openViewer(src, alt) {
  const ov = document.createElement("div");
  ov.className = "zoom-ov";
  ov.innerHTML = '<button type="button" class="zoom-x" aria-label="닫기">✕</button><img alt=""><div class="zoom-ctl"><button type="button" data-z="out" aria-label="축소">－</button><button type="button" data-z="reset" aria-label="원래 크기">원래대로</button><button type="button" data-z="in" aria-label="확대">＋</button></div><p class="zoom-hint">두 손가락으로 확대 · 두 번 탭하면 확대/원래대로</p>';
  const img = ov.querySelector("img");
  img.src = src; img.alt = alt || "";
  document.body.appendChild(ov);
  const prevOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = "hidden";

  let s = 1, x = 0, y = 0;
  const pts = new Map();
  let startDist = 0, startS = 1, lastTap = 0;

  const clamp = () => {
    const w = img.offsetWidth, h = img.offsetHeight; // 확대(transform)와 무관한 원래 크기
    const mx = Math.max(0, (w * s - innerWidth) / 2), my = Math.max(0, (h * s - innerHeight) / 2);
    x = Math.min(mx, Math.max(-mx, x)); y = Math.min(my, Math.max(-my, y));
  };
  const apply = () => { clamp(); img.style.transform = `translate(${x}px,${y}px) scale(${s})`; };
  const zoomAt = (ns, cx, cy) => {      // (cx,cy) 화면 좌표를 기준으로 확대
    ns = Math.min(MAX, Math.max(1, ns));
    const k = ns / s, ox = cx - innerWidth / 2, oy = cy - innerHeight / 2;
    x = ox - (ox - x) * k; y = oy - (oy - y) * k; s = ns; apply();
  };
  const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };

  const ui = (e) => e.target.closest(".zoom-x,.zoom-ctl");
  // 마우스·펜은 포인터 이벤트, 손가락은 터치 이벤트로 처리한다. (iOS Safari·카카오톡 같은 인앱 브라우저는 포인터 이벤트만으로는
  // 두 손가락 확대를 브라우저 기본 동작이 가로채 버리기 때문에, 터치 이벤트에서 preventDefault 한다.)
  const isTouch = (e) => e.pointerType === "touch";
  ov.addEventListener("pointerdown", (e) => {
    if (isTouch(e) || ui(e)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: Date.now(), tap: true });
    if (pts.size === 2) { pts.forEach((p) => (p.tap = false)); startDist = dist(); startS = s; }
  });
  ov.addEventListener("pointermove", (e) => {
    if (isTouch(e)) return;
    const p = pts.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(p.x - p.x0, p.y - p.y0) > 10) p.tap = false;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      zoomAt(startS * dist() / startDist, (a.x + b.x) / 2, (a.y + b.y) / 2);
    } else if (s > 1) { x += dx; y += dy; apply(); }
  });
  // 두 번 눌러 확대/원래대로 (마우스·터치 공용)
  const tapAt = (cx, cy) => {
    const now = Date.now();
    if (now - lastTap < 300) { lastTap = 0; s > 1 ? (s = 1, x = 0, y = 0, apply()) : zoomAt(2.5, cx, cy); }
    else lastTap = now;
  };
  const up = (e) => {
    if (isTouch(e)) return;
    const p = pts.get(e.pointerId); pts.delete(e.pointerId);
    if (!p || !p.tap || Date.now() - p.t > 250) return;
    tapAt(e.clientX, e.clientY);
  };
  ov.addEventListener("pointerup", up); ov.addEventListener("pointercancel", up);

  // 손가락: 두 손가락 확대·축소, 한 손가락 이동, 더블탭
  const tdist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  let last = null, tap = null;
  ov.addEventListener("touchstart", (e) => {
    if (ui(e)) return;
    if (e.touches.length >= 2) { startDist = tdist(e.touches) || 1; startS = s; tap = null; last = null; e.preventDefault(); }
    else { const t = e.touches[0]; last = { x: t.clientX, y: t.clientY }; tap = { x: t.clientX, y: t.clientY, t: Date.now() }; }
  }, { passive: false });
  ov.addEventListener("touchmove", (e) => {
    if (ui(e) && e.touches.length < 2) return;
    e.preventDefault(); // 브라우저 기본 확대·스크롤을 막아 우리 뷰어가 처리한다
    if (e.touches.length >= 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      zoomAt(startS * tdist(e.touches) / startDist, (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
    } else if (last) {
      const t = e.touches[0];
      if (tap && Math.hypot(t.clientX - tap.x, t.clientY - tap.y) > 10) tap = null;
      if (s > 1) { x += t.clientX - last.x; y += t.clientY - last.y; apply(); }
      last = { x: t.clientX, y: t.clientY };
    }
  }, { passive: false });
  ov.addEventListener("touchend", (e) => {
    if (e.touches.length === 1) { const t = e.touches[0]; last = { x: t.clientX, y: t.clientY }; startDist = 0; return; } // 두 손가락 → 한 손가락: 튀지 않게 기준점 갱신
    if (e.touches.length > 0) return;
    last = null;
    if (tap && Date.now() - tap.t <= 250 && !ui(e)) { const { x: cx, y: cy } = tap; tap = null; tapAt(cx, cy); }
    tap = null;
  });
  ov.addEventListener("touchcancel", () => { last = null; tap = null; });
  // iOS Safari의 페이지 확대 제스처 차단
  ["gesturestart", "gesturechange", "gestureend"].forEach((n) => ov.addEventListener(n, (e) => e.preventDefault()));
  ov.addEventListener("wheel", (e) => { e.preventDefault(); zoomAt(s * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY); }, { passive: false });

  ov.querySelector(".zoom-ctl").addEventListener("click", (e) => {   // 손가락 확대가 안 되는 브라우저를 위한 버튼
    const z = e.target.closest("button")?.dataset.z; if (!z) return;
    if (z === "reset") { s = 1; x = 0; y = 0; apply(); }
    else zoomAt(s * (z === "in" ? 1.6 : 1 / 1.6), innerWidth / 2, innerHeight / 2);
  });

  const close = () => { ov.remove(); document.documentElement.style.overflow = prevOverflow; document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  ov.querySelector(".zoom-x").addEventListener("click", close);
  ov.addEventListener("click", (e) => { if (e.target === ov && s === 1) close(); });
}
