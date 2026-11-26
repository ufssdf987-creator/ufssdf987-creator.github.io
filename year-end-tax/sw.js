/* 2026 연말정산 환급 계산기 서비스워커
 * 네트워크 우선 + 캐시 폴백: 새 배포가 있으면 바로 반영하고,
 * 인터넷이 없을 때는 마지막으로 저장한 앱 셸로 열립니다.
 * 파일을 수정하면 VERSION 을 올려 주세요(예: v1.0.5).
 */
const VERSION = "v1.0.21";
const CACHE = `year-end-tax-${VERSION}`;

const PRECACHE = [
  "./",
  "./index.html",
  "./styles.css",
  "./calc.js",
  "./app.js",
  "./manifest.json",
  "./privacy.html",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(PRECACHE.map(async (url) => {
      try {
        const res = await fetch(url, { cache: "reload" });
        if (res && res.ok) await cache.put(url, res);
      } catch (e) { /* 개별 파일 실패는 무시하고 나머지를 저장 */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // 외부(광고·분석) 요청은 그대로 두어 광고가 정상 동작하게 합니다.
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch (e) {
      const hit = await caches.match(req);
      if (hit) return hit;
      if (req.mode === "navigate") {
        return (await caches.match("./index.html")) || (await caches.match("./"));
      }
      throw e;
    }
  })());
});
