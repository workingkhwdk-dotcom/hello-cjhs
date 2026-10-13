#!/usr/bin/env node
/**
 * 이미지 캐시 무효화(cache busting) 도구 — `firebase deploy` 직전에 자동 실행된다(firebase.json hosting.predeploy).
 *
 * image/ · icons/ 는 브라우저가 1주일(max-age=604800) 캐시한다. 같은 파일명으로 사진을 바꿔 올리면
 * 방문자는 최대 1주일 동안 옛 사진을 볼 수 있으므로, 코드(html/js/css) 안의 이미지 주소 뒤에
 * `?v=<버전>`을 붙여 "주소 자체"를 바꿔 준다. 주소가 바뀌면 브라우저는 새로 받아 간다.
 *
 * 기본: 버전 = 그 이미지 파일 내용의 해시 → 바뀐 이미지만 새로 받고, 안 바뀐 이미지는 계속 캐시 사용.
 * `node tools/bump-version.js --all` : 배포 시각으로 모든 이미지를 강제 초기화.
 * 여러 번 실행해도 결과가 같다(멱등). 이미지 파일이 없으면 경고만 하고 건드리지 않는다.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const FORCE_ALL = process.argv.includes("--all");
const STAMP = Date.now().toString(36);
const CODE_EXT = new Set([".html", ".js", ".css"]);
const SKIP_DIRS = new Set(["node_modules", "functions", "tools", ".firebase", "image", "icons", "files"]);
// 이미지 주소 + (이미 붙어 있는) ?v=… . "image/png" 같은 MIME 문자열은 확장자(.png)가 없어 걸리지 않는다.
const REF = /\b((?:image|icons)\/[\w\-./%]+\.(?:jpe?g|png|webp|svg|gif))(\?v=[\w]+)?/g; // %20 같은 주소 인코딩(공백 있는 파일명)도 포함

function listCodeFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !e.name.startsWith(".")) listCodeFiles(path.join(dir, e.name), out); }
    else if (CODE_EXT.has(path.extname(e.name)) && !/ \d+\.\w+$/.test(e.name)) out.push(path.join(dir, e.name)); // "index 2.html" 같은 복사본 제외
  }
  return out;
}

const hashCache = new Map();
function versionFor(rel) {
  if (FORCE_ALL) return STAMP;
  if (!hashCache.has(rel)) {
    const abs = path.join(ROOT, decodeURIComponent(rel));
    hashCache.set(rel, fs.existsSync(abs) ? crypto.createHash("md5").update(fs.readFileSync(abs)).digest("hex").slice(0, 8) : null);
  }
  return hashCache.get(rel);
}

let changedFiles = 0, refs = 0;
const missing = new Set();
for (const file of listCodeFiles(ROOT)) {
  const src = fs.readFileSync(file, "utf8");
  const out = src.replace(REF, (m, rel) => {
    const v = versionFor(rel);
    if (!v) { missing.add(rel); return m; }
    refs++;
    return `${rel}?v=${v}`;
  });
  if (out !== src) { fs.writeFileSync(file, out); changedFiles++; }
}
console.log(`[bump-version] 이미지 주소 ${refs}곳 확인, 파일 ${changedFiles}개 갱신${FORCE_ALL ? " (전체 강제 초기화)" : ""}`);
if (missing.size) console.warn("[bump-version] 파일을 찾지 못한 주소(그대로 둠):", [...missing].join(", "));

// ---- 사이트 전체 "빌드 번호" → version.json ------------------------------------------
// 배포되는 모든 파일(코드·이미지·PDF 등)의 내용으로 만든 해시. 내용이 하나라도 바뀌면 번호가 바뀐다.
// 이미 열어 둔 화면(js/update-check.js)이 이 파일을 주기적으로 확인해, 번호가 달라지면 새로고침을 안내/실행한다.
// 배포 때마다 새로 만들어지는 파일이라 git에는 올리지 않는다(.gitignore).
const DEPLOY_SKIP_DIRS = new Set(["node_modules", "functions", "tools", "docs", ".git", ".firebase"]);
const DEPLOY_SKIP_FILES = new Set(["firebase.json", "firestore.rules", "storage.rules", "version.json"]);
function listDeployFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (e.name.startsWith(".")) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) { if (!DEPLOY_SKIP_DIRS.has(e.name)) listDeployFiles(abs, out); }
    else if (!DEPLOY_SKIP_FILES.has(e.name) && !e.name.endsWith(".md") && !/ \d+\.\w+$/.test(e.name)) out.push(abs); // 호스팅 ignore 규칙과 동일
  }
  return out;
}
const all = crypto.createHash("md5");
for (const f of listDeployFiles(ROOT)) all.update(path.relative(ROOT, f)).update(fs.readFileSync(f));
const build = all.digest("hex").slice(0, 12);
fs.writeFileSync(path.join(ROOT, "version.json"), JSON.stringify({ build, builtAt: new Date().toISOString() }) + "\n");
console.log(`[bump-version] version.json 빌드 번호: ${build}`);
