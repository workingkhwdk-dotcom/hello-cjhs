/**
 * 챗봇 답변 "깨진 코드 방지" 하네스 — 서버(functions)와 브라우저(js/reply-guard.js)가 같은 파일을 쓴다.
 * ------------------------------------------------------------
 * 왜 필요한가
 *   모델 답변은 마크다운(굵게·표·목록·링크)과 몇 가지 HTML(<mark>, <span style="color:..">)을 섞어 쓴다.
 *   그런데 아래 일이 가끔 일어나면 화면에 `**`, `|---|`, `<mark>`, `](https://` 같은 코드가 그대로 보인다.
 *     ① 토큰 한도로 답변이 중간에 잘림(status:"incomplete") → 표·굵게·링크가 열린 채로 끝남
 *     ② 웹 검색 인용 마커(\uE200cite…\uE201, turn0search0, 【4:0†source】)가 본문에 섞임
 *     ③ 표의 열 수가 안 맞거나 구분선(| --- |)이 빠짐, 코드 펜스(```)·구분선(---)·인용(>)처럼
 *        채팅창이 변환하지 않는 마크다운을 씀
 *     ④ <mark>·<span>을 닫지 않음, 허용 목록에 없는 HTML 태그를 씀
 *     ⑤ 문자열을 길이로 자르다가 이모지(서로게이트 쌍)가 반쪽이 됨 → � 문자
 *
 * 구조(3단)
 *   1. repairReply(): 위 문제를 고친다(고칠 수 있는 건 고치고, 잘린 답변은 마지막 온전한 줄까지만 남김).
 *   2. findIssues():  고친 결과를 다시 검사한다. 남은 문제가 있으면
 *   3. toPlainText(): 서식을 모두 벗긴 평문으로 내려보낸다 — 어떤 경우에도 코드가 화면에 보이지 않는다.
 *
 * 순수 함수만 있다(네트워크·DOM 없음). 서버 테스트: functions/test/run_reply_guard_tests.js
 * 브라우저 사본: `node tools/sync-reply-guard.js` 로 js/reply-guard.js 를 다시 만든다(테스트가 두 파일 동일 여부를 확인).
 * 구형 브라우저에서도 스크립트 전체가 깨지지 않도록 lookbehind·named group 같은 최신 정규식 문법은 쓰지 않는다.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CwjhReplyGuard = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var INCOMPLETE_NOTICE = "※ 답변이 길어 여기까지만 보여드려요. 이어서 알고 싶은 부분을 다시 물어봐 주세요.";
  var MAX_TABLE_COLS = 6;
  // 채팅창(sanitizeNode)이 통과시키는 인라인 태그와 같은 범위. FORMAT_RULES가 허용한 것만 남긴다.
  var INLINE_TAGS = { mark: 1, b: 1, strong: 1, i: 1, em: 1, u: 1, span: 1 };
  var CITE_TOKEN = /(?:cite)?turn\d+(?:search|view|news|image|file|forecast|finance|sports|product|calc|click)\d+/g;

  // ---------- 문자 단위 정리 ----------

  function stripLoneSurrogates(s) {
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff) {
        var n = s.charCodeAt(i + 1);
        if (n >= 0xdc00 && n <= 0xdfff) { out += s.charAt(i) + s.charAt(i + 1); i++; }
      } else if (c >= 0xdc00 && c <= 0xdfff) {
        // 짝 없는 낮은 서로게이트: 버린다
      } else {
        out += s.charAt(i);
      }
    }
    return out;
  }

  /** 글자 수로 자르되 이모지 같은 서로게이트 쌍을 반으로 쪼개지 않는다. */
  function safeSlice(str, max) {
    var s = String(str == null ? "" : str);
    if (s.length <= max) return s;
    var cut = s.slice(0, max);
    var last = cut.charCodeAt(cut.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
    return cut;
  }

  function cleanText(input) {
    var t = typeof input === "string" ? input : input == null ? "" : String(input);
    t = t.replace(/\r\n?/g, "\n");
    t = t.replace(/\uE200[^\uE201]*\uE201/g, ""); // 인용 마커 전체
    t = t.replace(/[\uE000-\uF8FF]/g, ""); // 남은 사용자 정의 영역 글자(깨진 네모)
    t = t.replace(/【\d+(?::\d+)?†[^】]*】/g, "");
    t = t.replace(CITE_TOKEN, "");
    t = stripLoneSurrogates(t);
    t = t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "");
    t = t.replace(/[\uFFFD\u200B-\u200D\u2060\uFEFF\u202A-\u202E\u2066-\u2069]/g, "");
    if (t.indexOf("\n") === -1 && t.indexOf("\\n") !== -1) t = t.replace(/\\n/g, "\n"); // 줄바꿈이 글자 그대로 온 경우
    t = t.replace(/(\S)[ \t]{2,}(?=\S)/g, "$1 "); // 마커를 지운 자리의 이중 공백
    t = t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
    return t.replace(/^\n+/, "").replace(/\s+$/, "");
  }

  // ---------- 한 줄(또는 표의 한 칸) 안의 서식 ----------

  function safeColor(v) {
    var m = String(v || "").match(/^\s*(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20})\s*$/);
    return m ? m[1] : "";
  }

  /** 허용 태그만 남기고, 짝이 안 맞는 태그는 닫거나 지운다. */
  function balanceTags(s) {
    s = s.replace(/<\/?[a-zA-Z][a-zA-Z0-9]*(?:\s[^<>]{0,40})?$/, ""); // 줄 끝에서 잘린 짧은 태그 조각(<mar, <span style="col…)
    var stack = [];
    var dangling = /<\/?[a-zA-Z][a-zA-Z0-9]*/g; // 닫는 >가 없는 태그 조각은 이름만 지운다(안의 글자는 살림)
    var tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^<>]*)>/g;
    var out = "", last = 0, m;
    function process(all, slash, rawName, attrs) {
      var name = rawName.toLowerCase();
      if (name === "br") return slash ? "" : "<br>";
      if (!INLINE_TAGS[name]) return ""; // 허용 외 태그: 태그만 지우고 안의 글자는 남긴다
      if (!slash) {
        if (name === "span") {
          var m = attrs.match(/style\s*=\s*["']?\s*color\s*:\s*([^;"'>]+)/i);
          var color = m ? safeColor(m[1]) : "";
          if (!color) { stack.push({ name: "span", kept: false }); return ""; }
          stack.push({ name: "span", kept: true });
          return '<span style="color:' + color + '">';
        }
        stack.push({ name: name, kept: true });
        return "<" + name + ">";
      }
      // 닫는 태그: 스택에서 짝을 찾는다
      for (var i = stack.length - 1; i >= 0; i--) {
        if (stack[i].name === name) {
          var closers = "";
          for (var j = stack.length - 1; j > i; j--) if (stack[j].kept) closers += "</" + stack[j].name + ">";
          var keep = stack[i].kept;
          stack.length = i;
          return closers + (keep ? "</" + name + ">" : "");
        }
      }
      return ""; // 짝 없는 닫는 태그
    }
    while ((m = tagRe.exec(s))) {
      out += s.slice(last, m.index).replace(dangling, "") + process(m[0], m[1], m[2], m[3]);
      last = m.index + m[0].length;
    }
    out += s.slice(last).replace(dangling, "");
    for (var k = stack.length - 1; k >= 0; k--) if (stack[k].kept) out += "</" + stack[k].name + ">";
    return out;
  }

  function dropLastToken(s, token) {
    var idx = s.lastIndexOf(token);
    return idx < 0 ? s : s.slice(0, idx) + s.slice(idx + token.length);
  }

  function fixLinks(s) {
    s = s.replace(/!\[([^\]\n]*)\]\([^)\n]*\)?/g, "$1"); // 이미지 마크다운은 쓰지 않는다(없는 주소를 지어낼 수 있음)
    s = s.replace(/\[([^\]\n]+)\]\(([^)\n]*)\)/g, function (all, label, url) {
      var u = url.trim();
      if (!u) return label;
      if (/\s/.test(u)) u = u.replace(/\s+/g, "%20");
      if (/[()]/.test(u)) u = u.replace(/\(/g, "%28").replace(/\)/g, "%29");
      return "[" + label + "](" + u + ")";
    });
    s = s.replace(/\[([^\]\n]+)\]\([^)\n]*$/, "$1"); // 끝에서 잘린 링크 → 글자만
    s = s.replace(/\[([^\]\n]*)$/, "$1"); // 닫는 ]가 없이 끝난 대괄호
    return s;
  }

  /** 한 번 고친 결과가 또 고쳐질 수 있어(링크 주소 안의 대괄호 등) 더 안 바뀔 때까지 반복한다. */
  function fixInline(s) {
    for (var n = 0; n < 4; n++) {
      var next = fixInlineOnce(s);
      if (next === s) break;
      s = next;
    }
    return s;
  }

  function fixInlineOnce(s) {
    s = balanceTags(s);
    s = fixLinks(s);
    s = s.replace(/\*{4,}/g, ""); // 빈 굵게 ****
    var stars = s.split("**").length - 1;
    if (stars % 2 === 1) s = dropLastToken(s, "**");
    var ticks = s.split("`").length - 1;
    if (ticks % 2 === 1) s = dropLastToken(s, "`");
    return s;
  }

  // ---------- 표 ----------

  var SEP_ROW = /^\s*\|?[\s:-]+\|[\s:|-]*\|?\s*$/; // 채팅창(mdToHtml)이 쓰는 구분선 판정과 동일
  var PIPE_ROW = /^\s*\|.*\|\s*$/;

  function splitCells(row) {
    var t = row.trim().replace(/\\\|/g, "/").replace(/^\|/, "").replace(/\|$/, "");
    return t.split("|").map(function (c) { return c.trim(); });
  }
  function isSepCells(cells, minDash) {
    var re = new RegExp("^:?-{" + (minDash || 1) + ",}:?$");
    return cells.length > 0 && cells.every(function (c) { return re.test(c) || c === ""; }) && cells.some(function (c) { return /-/.test(c); });
  }
  function startsTable(lines, i) {
    var l = lines[i];
    if (!/^\s*\|/.test(l)) return false;
    return true;
  }

  function repairTable(block, truncated, fixes) {
    var raw = block.slice();
    if (truncated && raw.length > 1) {
      var last = raw[raw.length - 1];
      if (!/\|\s*$/.test(last)) { raw.pop(); fixes.push("table-cut-row"); }
    }
    while (raw.length > 1 && isSepCells(splitCells(raw[0]), 3)) { raw.shift(); fixes.push("table-stray-sep"); } // 구분선이 머리글 자리에 온 경우
    var rows = raw.map(splitCells);
    var header = rows[0];
    var rest = rows.slice(1);
    var hadSep = rest.length > 0 && isSepCells(rest[0]);
    if (hadSep) rest = rest.slice(1);
    else fixes.push("table-sep");

    if (header.length < 2) { // 열이 하나뿐이면 표로 둘 이유가 없다
      fixes.push("table-1col");
      return [header].concat(rest).map(function (r) { return fixInline(r.join(" ").trim()); }).filter(Boolean);
    }
    var cols = Math.min(header.length, MAX_TABLE_COLS);
    if (header.length > MAX_TABLE_COLS) fixes.push("table-cols");
    function norm(r) {
      var cells = r.slice();
      if (cells.length > cols) {
        var extra = cells.slice(cols - 1).map(function (c) { return c.trim(); }).filter(Boolean);
        cells = cells.slice(0, cols - 1).concat([extra.join(" / ")]);
        fixes.push("table-extra");
      }
      while (cells.length < cols) { cells.push(""); fixes.push("table-pad"); }
      return cells.map(function (c) { return fixInline(c.replace(/\s+/g, " ")).trim() || " "; });
    }
    var body = rest.filter(function (r) { return r.some(function (c) { return c !== ""; }); });
    if (truncated && body.length) {
      var lastRow = body[body.length - 1];
      if (lastRow.length < cols) { body.pop(); fixes.push("table-cut-row"); }
    }
    // 서식을 정리한 "뒤"의 모양으로 구분선 여부를 판단해야, 한 번 고친 결과를 다시 고쳐도 같다(멱등).
    body = body.map(norm).filter(function (r) {
      if (isSepCells(r.map(function (c) { return c.trim(); }), 3)) { fixes.push("table-stray-sep"); return false; }
      return true;
    });
    if (!body.length) { // 머리글만 남은 표
      if (truncated) { fixes.push("table-cut-empty"); return []; } // 잘린 답변이면 통째로 버린다
      fixes.push("table-empty");
      return [fixInline(header.join(" · ").trim())].filter(Boolean);
    }
    var h = norm(header).map(function (c) { return c.trim() || "-"; });
    var out = ["| " + h.join(" | ") + " |", "| " + h.map(function () { return "---"; }).join(" | ") + " |"];
    body.forEach(function (r) { out.push("| " + r.join(" | ") + " |"); });
    return out;
  }

  // ---------- 줄 단위 블록 ----------

  function normalizeLine(line, fixes) {
    var l = line;
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { fixes.push("hr"); return null; }
    var h = l.match(/^\s{0,3}(#{1,6})\s*(.*)$/);
    if (h) {
      if (!h[2].trim()) return null;
      var level = Math.min(h[1].length, 3);
      if (h[1].length > 3) fixes.push("heading-level");
      return new Array(level + 1).join("#") + " " + h[2].trim();
    }
    if (/^\s*>+\s?/.test(l)) { fixes.push("quote"); l = l.replace(/^\s*>+\s?/, ""); }
    if (/^\s*[+•·▪▶▸]\s+/.test(l)) { fixes.push("bullet"); l = l.replace(/^\s*[+•·▪▶▸]\s+/, "- "); }
    var num = l.match(/^\s*(\d+)\)\s+(.*)$/);
    if (num) { fixes.push("num-paren"); l = num[1] + ". " + num[2]; }
    return l;
  }

  function looksComplete(line) {
    var t = line.replace(/\s+$/, "");
    if (!t) return true;
    if (/^\s*\|.*\|\s*$/.test(t)) return true;
    return /([.!?…。)\]>~:：%]|[0-9]|[다요죠까네군음함임됨][.!?)」』”’"'*]*|<\/(?:mark|span|b|strong|u|em|i)>|\*\*|[\u2600-\u27BF]|[\uD83C-\uD83E][\uDC00-\uDFFF])$/.test(t);
  }
  function isLabelOnly(line) {
    var t = line.trim();
    return /^#{1,3}\s/.test(t) || /^\*\*[^*]+\*\*:?$/.test(t) || /[:：]$/.test(t);
  }

  function trimIncomplete(lines, fixes) {
    var kept = lines;
    var guard = 0;
    while (kept.length && guard++ < 4) {
      var idx = kept.length - 1;
      while (idx >= 0 && !kept[idx].trim()) idx--;
      if (idx < 0) break;
      var line = kept[idx];
      if (/^\s*\|/.test(line)) break; // 표 행은 repairTable이 따로 처리
      var isItem = /^\s*[-*]\s|^\s*\d+\.\s/.test(line);
      if (!looksComplete(line) || (isLabelOnly(line) && !isItem)) {
        kept = kept.slice(0, idx);
        fixes.push("cut-tail");
        continue;
      }
      break;
    }
    // 잘라 내다 보니 남는 줄이 하나도 없으면(짧은 답변이 통째로 잘린 경우) 원문을 그대로 살린다.
    var hasText = kept.some(function (l) { return l.trim(); });
    return hasText ? kept : lines;
  }

  /** 잘린 답변 끝에 "**3학년 1학기**" 같은 소제목만 덩그러니 남은 경우를 지운다(내용이 없는 제목은 의미가 없다). */
  function dropTrailingLabels(lines, fixes) {
    var kept = lines.slice();
    var guard = 0;
    while (guard++ < 3) {
      var idx = kept.length - 1;
      while (idx >= 0 && !kept[idx].trim()) idx--;
      if (idx < 0) break;
      var line = kept[idx];
      if (/^\s*\|/.test(line) || /^\s*[-*]\s|^\s*\d+\.\s/.test(line) || !isLabelOnly(line)) break;
      kept = kept.slice(0, idx);
      fixes.push("cut-label");
    }
    return kept.some(function (l) { return l.trim(); }) ? kept : lines;
  }

  // ---------- 공개: 복구 ----------

  /**
   * @param {string} input 모델이 만든 답변
   * @param {{incomplete?:boolean}} [opts] incomplete: 토큰 한도로 잘린 답변이면 true
   * @returns {{text:string, fixes:string[], fallback:boolean}}
   */
  function repairReply(input, opts) {
    var first = repairOnce(input, opts);
    var res = first, fixes = first.fixes.slice();
    // 한 번 고친 결과가 또 고쳐지는 경우(여러 줄에 걸쳐 쪼개진 표 등)가 있어, 더 안 바뀔 때까지 반복한다(최대 3회).
    for (var n = 0; n < 3; n++) {
      var again = repairOnce(res.text, { incomplete: false });
      if (again.text === res.text) break;
      fixes = fixes.concat(again.fixes);
      res = { text: again.text, fixes: again.fixes, fallback: res.fallback || again.fallback };
    }
    return { text: res.text, fixes: unique(fixes), fallback: res.fallback };
  }

  function repairOnce(input, opts) {
    var incomplete = !!(opts && opts.incomplete);
    var fixes = [];
    var original = typeof input === "string" ? input : input == null ? "" : String(input);
    var t = cleanText(original);
    if (t !== original.replace(/\r\n?/g, "\n").replace(/^\n+/, "").replace(/\s+$/, "")) fixes.push("clean");
    if (!t) return { text: "", fixes: fixes, fallback: false };

    var src = t.split("\n");
    var lines = [];
    for (var a = 0; a < src.length; a++) {
      if (/^\s*(```|~~~)/.test(src[a])) { fixes.push("fence"); continue; }
      // 표 행 앞에 기호 찌꺼기가 붙은 경우("[| 가 | 나 |")는 찌꺼기만 떼어 표로 인식시킨다
      lines.push(src[a].replace(/^\s*[\[\](*`>#]+\s*(?=\|.*\|\s*$)/, ""));
    }

    if (incomplete) lines = trimIncomplete(lines, fixes);

    var out = [];
    for (var i = 0; i < lines.length; ) {
      if (startsTable(lines, i)) {
        var j = i;
        while (j < lines.length && /^\s*\|/.test(lines[j])) j++;
        out = out.concat(repairTable(lines.slice(i, j), incomplete && j >= lines.length, fixes));
        i = j;
        continue;
      }
      var n = normalizeLine(lines[i], fixes);
      var continueSkip = false;
      if (n !== null) {
        var fixed = fixInline(n);
        if (fixed !== n) fixes.push("inline");
        fixed = fixed.replace(/^(#{1,3})\s+/, "$1 "); // 제목 안의 태그를 지운 뒤 생긴 공백 정리
        if (/^#{1,3}\s*$/.test(fixed)) continueSkip = true;
        else out.push(fixed);
      }
      i++;
    }

    if (incomplete) out = dropTrailingLabels(out, fixes);
    var text = out.join("\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "").replace(/\s+$/, "");
    if (incomplete && text) text += "\n\n" + INCOMPLETE_NOTICE;

    var fallback = false;
    if (findIssues(text).length) { // 마지막 방어선: 서식을 모두 벗긴다
      text = toPlainText(text);
      fixes.push("plain-fallback");
      fallback = true;
      if (incomplete && text && text.indexOf(INCOMPLETE_NOTICE) === -1) text += "\n\n" + INCOMPLETE_NOTICE;
    }
    return { text: text, fixes: unique(fixes), fallback: fallback };
  }

  function unique(arr) {
    var seen = {}, out = [];
    arr.forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push(x); } });
    return out;
  }

  // ---------- 공개: 검사 ----------

  function oddCount(s, token) { return (s.split(token).length - 1) % 2 === 1; }

  function tagBalanceBad(s) {
    var stack = [];
    var re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)[^<>]*>/g, m;
    while ((m = re.exec(s))) {
      var name = m[2].toLowerCase();
      if (name === "br") continue;
      if (!INLINE_TAGS[name]) return true;
      if (!m[1]) stack.push(name);
      else if (stack.length && stack[stack.length - 1] === name) stack.pop();
      else return true;
    }
    if (stack.length > 0) return true;
    var rest = s.replace(/<\/?[a-zA-Z][a-zA-Z0-9]*[^<>]*>/g, "");
    return /<\/?[a-zA-Z]/.test(rest);
  }

  /** 렌더 전 마크다운에 "코드로 보일 만한" 문제가 남았는지 검사. 비어 있으면 안전. */
  function findIssues(text) {
    var issues = [];
    var t = typeof text === "string" ? text : "";
    if (/[\uFFFD\uE000-\uF8FF\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(t)) issues.push("bad-char");
    if (stripLoneSurrogates(t) !== t) issues.push("lone-surrogate");
    if (CITE_TOKEN.test(t)) issues.push("cite-token");
    CITE_TOKEN.lastIndex = 0;
    var lines = t.split("\n");
    var tableRun = [];
    function flushTable() {
      if (!tableRun.length) return;
      var rows = tableRun.map(splitCells);
      var okHead = rows.length >= 3 && isSepCells(rows[1]) && rows[0].length >= 2 && rows[0].length <= MAX_TABLE_COLS;
      var cols = rows[0].length;
      var okCols = rows.every(function (r, idx) { return idx === 1 || r.length === cols; });
      if (!(okHead && okCols && SEP_ROW.test(tableRun[1] || ""))) issues.push("table");
      tableRun = [];
    }
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (PIPE_ROW.test(l)) { tableRun.push(l); continue; }
      if (/^\s*\|/.test(l)) issues.push("table-open-row");
      flushTable();
      if (/^\s*(```|~~~)/.test(l)) issues.push("fence");
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) issues.push("hr");
      if (/^\s*>/.test(l)) issues.push("quote");
      if (/^\s{0,3}#{4,}/.test(l) || /^\s{0,3}#{1,3}(?![#\s])/.test(l)) issues.push("heading");
      if (/^\s*[+•·▪▶▸]\s/.test(l) || /^\s*\d+\)\s/.test(l)) issues.push("list-marker");
      if (/!\[/.test(l)) issues.push("image");
      if (/\]\([^)]*$/.test(l) || /\]\([^)]*\s[^)]*\)/.test(l)) issues.push("link");
      if (tagBalanceBad(l)) issues.push("tag");
      if (oddCount(l, "**") || /\*\*\*\*/.test(l)) issues.push("bold");
      if (oddCount(l, "`")) issues.push("tick");
    }
    flushTable();
    // 표 칸 안의 굵게/태그도 한 줄 검사에 포함되지만, 칸마다 따로 짝이 맞아야 한다
    lines.forEach(function (l) {
      if (!PIPE_ROW.test(l)) return;
      splitCells(l).forEach(function (c) {
        if (oddCount(c, "**") || tagBalanceBad(c)) issues.push("cell");
      });
    });
    return unique(issues);
  }

  // ---------- 공개: 평문 ----------

  /** 모든 마크다운/HTML 서식을 벗긴 평문. 문단 구분과 목록 줄은 남긴다. */
  function toPlainText(text) {
    var t = cleanText(text);
    t = t.replace(/^\s*(```|~~~).*$/gm, "");
    t = t.replace(/<br\s*\/?>/gi, "\n").replace(/<\/?[a-zA-Z][^<>]*>/g, "").replace(/<\/?[a-zA-Z][a-zA-Z0-9]*/g, "");
    t = t.replace(/!\[([^\]\n]*)\]\([^)\n]*\)?/g, "$1");
    t = t.replace(/\[([^\]\n]+)\]\(([^)\n]*)\)?/g, function (all, label, url) {
      var u = String(url || "").trim();
      return /^https?:\/\//i.test(u) ? label + " (" + u.replace(/\s+/g, "") + ")" : label;
    });
    var out = [];
    t.split("\n").forEach(function (line) {
      var l = line;
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) return;
      if (/^\s*\|/.test(l)) {
        var cells = splitCells(l);
        if (isSepCells(cells)) return;
        l = cells.filter(Boolean).join(" · ");
      }
      l = l.replace(/^\s{0,3}#{1,6}\s*/, "").replace(/^\s*>+\s?/, "");
      l = l.replace(/^\s*[+•·▪▶▸]\s+/, "- ").replace(/^\s*(\d+)\)\s+/, "$1. ");
      l = l.replace(/\*+/g, "").replace(/`/g, "").replace(/\|/g, " · ");
      l = l.replace(/\[|\]\(/g, function (m) { return m === "[" ? "" : " ("; });
      out.push(l.replace(/\s+$/, ""));
    });
    return out.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "").replace(/\s+$/, "");
  }

  /**
   * 렌더가 끝난 화면 글자(textContent)에 코드 조각이 남았는지 — 브라우저에서 마지막으로 한 번 더 본다.
   * 정상 답변에서는 절대 나오지 않는 패턴만 쓴다.
   */
  function renderedLooksBroken(plain) {
    var s = String(plain == null ? "" : plain);
    return /\*\*|\]\(|```|<\/?(?:mark|span|b|strong|i|em|u|br|div|p|table|thead|tbody|tr|td|th|a|script|style)\b|^\s*\|.*\|\s*$|\uFFFD|[\uE000-\uF8FF]|turn\d+(?:search|view|news)\d+|&lt;\/?[a-z]+|&gt;/im.test(s);
  }

  return {
    INCOMPLETE_NOTICE: INCOMPLETE_NOTICE,
    cleanText: cleanText,
    safeSlice: safeSlice,
    repairReply: repairReply,
    findIssues: findIssues,
    toPlainText: toPlainText,
    renderedLooksBroken: renderedLooksBroken,
  };
});
