// 등록 사진 WebP 최적화(image_optimize.js) 테스트. 실행: node test/run_image_optimize_tests.js
// Firestore·Storage·sharp는 가짜로 바꿔, 주소 찾기·건너뛰기·문서 주소 교체만 검사한다.
const { optimizeSiteImages, parseStorageUrl, collectPhotoUrls, replacePhotoUrls, optimizedPath, MAX_KEEP_BYTES } = require("../image_optimize.js");

let pass = 0; const fails = [];
const check = (n, c) => (c ? pass++ : fails.push(n));
const B = "hello-cjhs.firebasestorage.app";
const url = (p) => `https://firebasestorage.googleapis.com/v0/b/${B}/o/${encodeURIComponent(p)}?alt=media&token=t`;

function fakeDb(docs) {
  const store = new Map(Object.entries(docs));
  const ref = (id) => ({ id });
  return {
    store,
    collection: () => ({ get: async () => ({ docs: [...store.keys()].map((id) => ({ ref: ref(id), data: () => store.get(id) })) }) }),
    runTransaction: async (fn) => fn({ get: async (r) => ({ exists: store.has(r.id), data: () => store.get(r.id) }), set: (r, d) => store.set(r.id, d) }),
  };
}
function fakeStorage(files) {
  const saved = new Map();
  return {
    saved,
    bucket: () => ({
      file: (p) => ({
        getMetadata: async () => { if (!files[p]) throw new Error("없음 " + p); return [{ size: String(files[p].size), contentType: files[p].type }]; },
        download: async () => [Buffer.alloc(files[p].size)],
        save: async (buf, opts) => saved.set(p, { buf, opts }),
      }),
    }),
  };
}
// 가짜 sharp: 원본 크기의 1/10 버퍼를 돌려준다(ratio로 조절)
const fakeSharp = (ratio = 0.1) => (buf) => {
  const chain = { rotate: () => chain, resize: () => chain, webp: () => chain, toBuffer: async () => Buffer.alloc(Math.floor(buf.length * ratio)) };
  return chain;
};

(async () => {
  check("주소 해석", JSON.stringify(parseStorageUrl(url("site-images/a b.jpg"), B)) === JSON.stringify({ bucket: B, path: "site-images/a b.jpg" }));
  check("다른 버킷 거절", parseStorageUrl(url("site-images/a.jpg").replace(B, "evil.appspot.com"), B) === null);
  check("site-images 밖 거절", parseStorageUrl(url("other/a.jpg"), B) === null);
  check("상위 경로 거절", parseStorageUrl(url("site-images/../x.jpg"), B) === null);
  check("외부 주소 거절", parseStorageUrl("https://example.com/a.jpg", B) === null);
  check("새 파일 이름", optimizedPath("site-images/greeting-1-photo.JPG") === "site-images/greeting-1-photo-opt.webp");

  const nested = { photoUrl: "a", hero: { photoUrl: "b" }, items: [{ photoUrl: "c" }, { photoUrl: "" }, { title: "x" }] };
  check("중첩 photoUrl 수집", [...collectPhotoUrls(nested)].sort().join() === "a,b,c");
  const ts = new (class Timestamp { })();
  const r = replacePhotoUrls({ ...nested, updatedAt: ts }, new Map([["b", "B"], ["c", "C"]]));
  check("주소 교체", r.changed && r.result.photoUrl === "a" && r.result.hero.photoUrl === "B" && r.result.items[0].photoUrl === "C" && r.result.items[2].title === "x");
  check("특수 값 유지", r.result.updatedAt === ts);
  check("바뀐 게 없으면 changed=false", replacePhotoUrls(nested, new Map()).changed === false);

  // 전체 흐름
  const big = "site-images/greeting-1-IMG.jpg", smallWebp = "site-images/gallery-hero-1-x.webp", bigWebp = "site-images/gallery-item-2-y.webp", missing = "site-images/gone.jpg";
  const db = fakeDb({
    greeting: { photoUrl: url(big), paragraphs: ["안녕"] },
    gallery: { hero: { photoUrl: url(smallWebp) }, items: [{ photoUrl: url(bigWebp), title: "체육대회" }, { photoUrl: url(missing) }, { photoUrl: "https://example.com/z.jpg" }] },
    curriculum: { title: "사진 없음" },
  });
  const storage = fakeStorage({
    [big]: { size: 4_000_000, type: "image/jpeg" },
    [smallWebp]: { size: 120_000, type: "image/webp" },
    [bigWebp]: { size: MAX_KEEP_BYTES + 1, type: "image/webp" },
  });
  let n = 0;
  const res = await optimizeSiteImages({ db, storage, sharp: fakeSharp(), uuid: () => "tok" + ++n, allowedBucket: B, logger: { error() {} } });
  check("변환 2장", res.converted === 2);
  check("건너뜀 2장(작은 WebP·외부 주소)", res.skipped === 2);
  check("실패 1장(없는 파일)", res.failed === 1);
  check("줄어든 용량 합계", res.savedBytes === 4_000_000 - 400_000 + (MAX_KEEP_BYTES + 1) - Math.floor((MAX_KEEP_BYTES + 1) * 0.1));
  const g = db.store.get("greeting");
  check("인사말 주소가 새 WebP로", g.photoUrl.includes(encodeURIComponent("site-images/greeting-1-IMG-opt.webp")) && g.photoUrl.includes("token=tok"));
  check("인사말 다른 내용 유지", g.paragraphs[0] === "안녕");
  const gl = db.store.get("gallery");
  check("작은 WebP는 그대로", gl.hero.photoUrl === url(smallWebp));
  check("큰 WebP는 교체", gl.items[0].photoUrl.includes("-opt.webp") && gl.items[0].title === "체육대회");
  check("실패한 사진 주소는 그대로", gl.items[1].photoUrl === url(missing));
  const sv = storage.saved.get("site-images/greeting-1-IMG-opt.webp");
  check("저장 메타데이터", sv && sv.opts.metadata.contentType === "image/webp" && /max-age=31536000/.test(sv.opts.metadata.cacheControl) && sv.opts.metadata.metadata.firebaseStorageDownloadTokens);

  // 변환해도 커지면 올리지 않는다
  const db2 = fakeDb({ greeting: { photoUrl: url(big) } });
  const st2 = fakeStorage({ [big]: { size: 1000, type: "image/png" } });
  const res2 = await optimizeSiteImages({ db: db2, storage: st2, sharp: fakeSharp(1.5), uuid: () => "t", allowedBucket: B });
  check("커지면 건너뜀", res2.converted === 0 && st2.saved.size === 0 && db2.store.get("greeting").photoUrl === url(big));

  console.log(`\n총 ${pass + fails.length}건 중 ${pass}건 통과, ${fails.length}건 실패`);
  if (fails.length) { console.log("실패:", fails); process.exit(1); }
})();
