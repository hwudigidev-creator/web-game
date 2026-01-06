// Service Worker for DIGI WAR PWA
const CACHE_NAME = 'digi-war-v0.9.29a';

// 安裝 Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  // 立即啟用新的 Service Worker
  self.skipWaiting();
});

// 啟用 Service Worker
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          })
      );
    })
  );
  // 立即控制所有頁面
  self.clients.claim();
});

// 攔截網路請求 - Network First 策略
self.addEventListener('fetch', (event) => {
  // 跳過非 GET 請求
  if (event.request.method !== 'GET') return;

  // 跳過 chrome-extension 等非 http(s) 請求
  if (!event.request.url.startsWith('http')) return;

  // 跳過跨域請求（避免 CORS 問題）
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 請求成功，更新快取
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // 網路失敗，從快取取得
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // 沒有快取且網路失敗
          return new Response('Offline', { status: 503 });
        });
      })
  );
});
