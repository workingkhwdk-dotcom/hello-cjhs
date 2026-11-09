/**
 * 이미 올려 둔 학교소개 사진(학교장 인사말·갤러리 등 site_content의 photoUrl)을 WebP로 바꾼다.
 *
 * 2026-10-13부터 admin.html은 올리기 전에 사진을 줄여(긴 변 1600px, WebP) 올리지만,
 * 그 전에 올린 사진은 휴대폰 원본(수 MB JPG/PNG)이 그대로라 방문자 화면에서 느리다.
 * 관리자 화면의 "등록된 사진 WebP로 최적화" 버튼이 index.js 의 optimizeSiteImages 를 부르고, 실제 일은 여기서 한다.
 *
 * - site_content 의 모든 문서를 훑어, 우리 버킷 site-images/ 아래를 가리키는 photoUrl 을 찾는다(문서 구조가 바뀌어도 동작하게 재귀로).
 * - 이미 WebP이고 작으면(MAX_KEEP_BYTES 이하) 건너뛴다.
 * - 변환본이 원본보다 작을 때만 새 파일(…-opt.webp)로 올리고, 문서의 주소를 새 주소로 바꾼다.
 * - 원본 파일은 지우지 않는다(혹시 다른 곳에서 쓰고 있을 수 있어서). 문서는 트랜잭션으로 고쳐, 그사이 관리자가 바꾼 값은 덮지 않는다.
 * 의존성(db, storage, sharp, uuid)은 밖에서 받아 테스트에서 가짜로 바꿀 수 있다.
 */

const MAX_SIDE = 1600;
const QUALITY = 82;
const MAX_KEEP_BYTES = 400 * 1024; // 이미 WebP인데 이보다 크면 다시 줄인다
const URL_RE = /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/([^/]+)\/o\/([^?]+)/;

/** 다운로드 주소 → { bucket, path }. 우리 버킷의 site-images/ 가 아니면 null. */
function parseStorageUrl(url, allowedBucket) {
  if (typeof url !== "string") return null;
  const m = url.match(URL_RE);
  if (!m || m[1] !== allowedBucket) return null;
  let path;
  try { path = decodeURIComponent(m[2]); } catch (e) { return null; }
  if (!path.startsWith("site-images/") || path.includes("..")) return null;
  return { bucket: m[1], path };
}

/** 문서 안의 모든 photoUrl 문자열을 모은다(중첩 객체·배열 포함). */
function collectPhotoUrls(value, out = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => collectPhotoUrls(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k === "photoUrl" && typeof v === "string" && v) out.add(v);
      else collectPhotoUrls(v, out);
    }
  }
  return out;
}

/** 문서 안의 photoUrl 을 map(옛 주소 → 새 주소)에 따라 바꾼 사본을 만든다. 바뀐 게 없으면 changed=false. */
function replacePhotoUrls(value, map) {
  let changed = false;
  const walk = (v) => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
      const o = {};
      for (const [k, x] of Object.entries(v)) {
        if (k === "photoUrl" && typeof x === "string" && map.has(x)) { o[k] = map.get(x); changed = true; } else o[k] = walk(x);
      }
      return o;
    }
    return v; // Timestamp 등 특수 값은 그대로
  };
  const result = walk(value);
  return { changed, result };
}

function optimizedPath(path) {
  return path.replace(/\.[^./]+$/, "") + "-opt.webp";
}

function downloadUrl(bucket, path, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

/** 사진 한 장을 WebP로 바꿔 올린다. 결과: { status: "converted"|"skipped"|"failed", ... } */
async function optimizeOne(url, { storage, sharp, uuid, allowedBucket }) {
  const ref = parseStorageUrl(url, allowedBucket);
  if (!ref) return { status: "skipped", reason: "우리 저장소의 사진이 아님" };
  const file = storage.bucket(ref.bucket).file(ref.path);
  const [meta] = await file.getMetadata();
  const size = Number(meta.size) || 0;
  if (meta.contentType === "image/webp" && size <= MAX_KEEP_BYTES) return { status: "skipped", reason: "이미 WebP", before: size };
  const [buf] = await file.download();
  const out = await sharp(buf, { failOn: "none" })
    .rotate() // 휴대폰 사진의 회전 정보(EXIF)를 반영
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toBuffer();
  if (out.length >= size) return { status: "skipped", reason: "변환해도 작아지지 않음", before: size };
  const newPath = optimizedPath(ref.path);
  const token = uuid();
  await storage.bucket(ref.bucket).file(newPath).save(out, {
    resumable: false,
    metadata: {
      contentType: "image/webp",
      cacheControl: "public, max-age=31536000",
      metadata: { firebaseStorageDownloadTokens: token, optimizedFrom: ref.path },
    },
  });
  return { status: "converted", newUrl: downloadUrl(ref.bucket, newPath, token), before: size, after: out.length };
}

/**
 * site_content 의 모든 사진을 최적화하고 문서 주소를 바꾼다.
 * @returns {{ converted:number, skipped:number, failed:number, savedBytes:number, items:Array }}
 */
async function optimizeSiteImages({ db, storage, sharp, uuid, allowedBucket, logger = console }) {
  const snap = await db.collection("site_content").get();
  const urls = new Set();
  snap.docs.forEach((d) => collectPhotoUrls(d.data(), urls));

  const map = new Map();
  const items = [];
  for (const url of urls) {
    try {
      const r = await optimizeOne(url, { storage, sharp, uuid, allowedBucket });
      if (r.status === "converted") map.set(url, r.newUrl);
      items.push({ url, ...r });
    } catch (err) {
      logger.error("사진 최적화 실패", url, err);
      items.push({ url, status: "failed", reason: String((err && err.message) || err) });
    }
  }

  if (map.size) {
    for (const d of snap.docs) {
      await db.runTransaction(async (tx) => {
        const cur = await tx.get(d.ref);
        if (!cur.exists) return;
        const { changed, result } = replacePhotoUrls(cur.data(), map);
        if (changed) tx.set(d.ref, result);
      });
    }
  }

  const count = (s) => items.filter((i) => i.status === s).length;
  return {
    converted: count("converted"),
    skipped: count("skipped"),
    failed: count("failed"),
    savedBytes: items.reduce((n, i) => n + (i.status === "converted" ? i.before - i.after : 0), 0),
    items,
  };
}

module.exports = { optimizeSiteImages, parseStorageUrl, collectPhotoUrls, replacePhotoUrls, optimizedPath, MAX_KEEP_BYTES };
