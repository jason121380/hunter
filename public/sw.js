// Service Worker：只負責「可安裝」與離線提示，不快取任何需要登入狀態的內容。
// - /api/* 與頁面導覽一律走網路（含 Cookie 判斷），離線時顯示 offline.html
// - 靜態資源採「網路優先、失敗才用快取」，程式更新後不會拿到舊檔
const CACHE = 'hunter-static-v1';

const PRECACHE = [
  '/offline.html',
  '/styles.css',
  '/login.js',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

const RUNTIME = new Set([
  ...PRECACHE,
  '/app.js',
  '/admin.js',
  '/token.js',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
]);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/offline.html')));
    return;
  }

  if (url.pathname.startsWith('/api/') || !RUNTIME.has(url.pathname)) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        // 只快取真正的 200 靜態檔；被導向登入頁的回應不能存
        if (response.ok && !response.redirected && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
