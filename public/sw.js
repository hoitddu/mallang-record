// 말랑기록 서비스 워커: 앱 화면만 저장해 두고(오프라인 열기), 사용자 데이터는 다루지 않습니다.
const CACHE = 'mallang-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 화면 이동: 인터넷 먼저, 안 되면 저장본
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy));
          return r;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }
  // 빌드된 파일·글꼴: 저장본 먼저
  if ((url.origin === location.origin && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/mediapipe/') || url.pathname.startsWith('/models/'))) || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((r) => {
            if (r.ok || r.type === 'opaque') {
              const copy = r.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return r;
          })
      )
    );
  }
});
