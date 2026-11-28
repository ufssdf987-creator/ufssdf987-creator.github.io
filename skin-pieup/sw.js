/*!
 * sw.js — 오프라인에서도 열리는 정적 앱 셸
 * ------------------------------------------------------------------
 * 파일을 수정할 때마다 VERSION 을 올려 주세요(index.html 의 ?v= 쿼리, config.js 의 version 과 맞춥니다).
 *
 * 캐시 정책
 *  · 문서(HTML)·CSS·JS : network-first  → 새 배포가 있으면 즉시 새 파일을 받아 씁니다.
 *  · 아이콘·이미지      : cache-first(뒤에서 조용히 갱신) → 오프라인에서도 빠르게 뜹니다.
 *  · install 에서 skipWaiting, activate 에서 이전 캐시 전체 삭제 + clients.claim
 *    → 예전 CSS 가 계속 돌려주던 문제를 막습니다.
 */
'use strict';

var VERSION = '1.1.1';
var CACHE_NAME = 'sp-v' + VERSION;

var CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './config.js',
  './manifest.json',
  './privacy.html',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/og-image.png'
];

// 새 배포를 바로 반영해야 하는 파일(HTML·CSS·JS) 판별
var FRESH_RE = /\.(?:html?|css|js)$/i;

function isFreshRequest(req, url) {
  if (req.mode === 'navigate') return true;
  if (FRESH_RE.test(url.pathname)) return true;
  // 루트(디렉터리) 요청도 문서로 본다
  return url.pathname === '/' || url.pathname.slice(-1) === '/';
}

// network-first: 네트워크가 되면 항상 새 파일, 실패할 때만 캐시
function networkFirst(req) {
  return fetch(req, { cache: 'no-store' }).then(function (res) {
    if (res && (res.ok || res.type === 'opaque')) {
      var copy = res.clone();
      caches.open(CACHE_NAME).then(function (cache) {
        cache.put(req, copy).catch(function () { /* 저장 실패는 무시 */ });
      });
    }
    return res;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      if (req.mode === 'navigate' || FRESH_RE.test(new URL(req.url).pathname)) {
        return caches.match('./index.html', { ignoreSearch: true }).then(function (shell) {
          return shell || Response.error();
        });
      }
      return Response.error();
    });
  });
}

// cache-first + 백그라운드 갱신(아이콘·이미지 등)
function staleWhileRevalidate(req) {
  return caches.match(req, { ignoreSearch: true }).then(function (hit) {
    var fresh = fetch(req).then(function (res) {
      if (res && (res.ok || res.type === 'opaque')) {
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(req, copy).catch(function () { });
        });
      }
      return res;
    }).catch(function () { return hit || Response.error(); });
    return hit || fresh;
  });
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return Promise.all(CORE_ASSETS.map(function (asset) {
        // HTTP 캐시에 남은 옛 파일을 쓰지 않도록 reload 로 받는다
        return cache.add(new Request(asset, { cache: 'reload' })).catch(function () { return null; });
      }));
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE_NAME) return caches.delete(key);
        return null;
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// 페이지에서 새 서비스워커에게 바로 넘겨달라고 할 때
self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }
  if (url.origin !== self.location.origin) return;
  // 확장프로그램 등 비정상 스킴 제외
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (isFreshRequest(req, url)) {
    event.respondWith(networkFirst(req));
    return;
  }

  event.respondWith(staleWhileRevalidate(req));
});
