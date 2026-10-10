// 챗봇 답변(마크다운 비슷한 글)을 안전한 HTML로 바꾼다. chatbot.render.js / mobile.render.js 의 mdToHtml → 정화(sanitize) → 깨짐 방지(reply-guard) 와 같은 순서.
// 두 파일은 번들된 한 줄 코드라 가져다 쓸 수 없어, 같은 동작을 읽기 쉽게 옮겼다.

const ALLOWED_TAGS = new Set(["B", "STRONG", "I", "EM", "U", "MARK", "P", "BR", "UL", "OL", "LI", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD", "A", "H4", "H5", "CODE", "SPAN", "BLOCKQUOTE", "DIV"]);
const ALLOWED_ATTR = { A: ["href", "target", "rel"], SPAN: ["style"], DIV: ["class"], LI: ["value"] };
const ALLOWED_STYLE = new Set(["color", "background-color", "font-size", "font-weight", "font-style", "text-decoration"]);

const isTableRow = l => /^\s*\|.*\|\s*$/.test(l);
const isTableSep = l => /^\s*\|?[\s:-]+\|[\s:|-]*\|?\s*$/.test(l);
const cells = l => l.trim().replace(/^\||\|$/g, "").split("|").map(s => s.trim());

function inline(t) {
  return t
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => `<a href="${url.replace(/"/g, "%22").replace(/</g, "%3C").replace(/>/g, "%3E")}">${label}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function mdToHtml(md) {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  let html = "", i = 0, list = "";
  const closeList = () => { if (list) { html += `</${list}>`; list = ""; } };
  const openList = tag => { if (list !== tag) { closeList(); html += `<${tag}>`; list = tag; } };
  while (i < lines.length) {
    const line = lines[i];
    if (isTableRow(line) && lines[i + 1] && isTableSep(lines[i + 1])) {
      closeList();
      let t = `<table><thead><tr>${cells(line).map(c => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>`;
      for (i += 2; i < lines.length && isTableRow(lines[i]); i++) t += `<tr>${cells(lines[i]).map(c => `<td>${inline(c)}</td>`).join("")}</tr>`;
      html += `<div class="table-scroll">${t}</tbody></table></div>`;
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) { closeList(); const tag = h[1].length === 1 ? "h4" : "h5"; html += `<${tag}>${inline(h[2])}</${tag}>`; i++; continue; }
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ul) { openList("ul"); html += `<li>${inline(ul[1])}</li>`; i++; continue; }
    const ol = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (ol) { openList("ol"); html += `<li value="${ol[1]}">${inline(ol[2])}</li>`; i++; continue; }
    closeList();
    if (!line.trim()) { i++; continue; }
    const para = [line];
    for (i++; i < lines.length && lines[i].trim() && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i]) && !/^#{1,3}\s+/.test(lines[i]) && !isTableRow(lines[i]); i++) para.push(lines[i]);
    html += `<p>${para.map(inline).join("<br>")}</p>`;
  }
  closeList();
  return html;
}

// 허용 목록 밖의 태그는 글자로만 남기고, 속성은 허용된 것만 남긴다(링크는 http(s)만).
function sanitize(node) {
  [...node.childNodes].forEach(child => {
    if (child.nodeType === 8) return child.remove();
    if (child.nodeType !== 1) return;
    const tag = child.tagName;
    if (!ALLOWED_TAGS.has(tag)) return child.replaceWith(document.createTextNode(child.textContent));
    [...child.attributes].forEach(a => {
      const n = a.name.toLowerCase();
      if (n.startsWith("on") || !(ALLOWED_ATTR[tag] || []).includes(n)) child.removeAttribute(a.name);
    });
    if (tag === "A") {
      if (!/^https?:\/\//i.test(child.getAttribute("href") || "")) child.removeAttribute("href");
      child.setAttribute("target", "_blank");
      child.setAttribute("rel", "noopener noreferrer");
    }
    if (tag === "SPAN") {
      const safe = (child.getAttribute("style") || "").split(";").map(s => s.trim()).filter(Boolean)
        .filter(d => ALLOWED_STYLE.has(d.split(":")[0].trim().toLowerCase()) && !/expression|url\(/i.test(d)).join("; ");
      if (safe) child.setAttribute("style", safe); else child.removeAttribute("style");
    }
    sanitize(child);
  });
}

function toHtml(md) {
  const w = document.createElement("div");
  w.innerHTML = mdToHtml(md);
  sanitize(w);
  return w.innerHTML;
}

export function replyToHtml(text) {
  const G = window.CwjhReplyGuard; // js/reply-guard.js (없으면 복구 단계만 건너뜀)
  const src = text == null ? "" : String(text);
  try {
    let md = G ? G.repairReply(src).text || src : src;
    let html = toHtml(md);
    if (G) {
      const probe = document.createElement("div");
      probe.innerHTML = html;
      if (G.renderedLooksBroken(probe.textContent)) html = toHtml(G.toPlainText(md));
    }
    return html;
  } catch (err) {
    const d = document.createElement("div");
    d.textContent = G ? G.toPlainText(src) : src;
    return d.innerHTML;
  }
}
