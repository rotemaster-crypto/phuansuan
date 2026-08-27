/* ============================================================
 *  sw.js — Service Worker สำหรับ PWA (ติดตั้งได้ + ออฟไลน์ fallback)
 *  กลยุทธ์:
 *   • navigation (เปิดหน้า) → network-first, ล้มเหลวค่อยใช้ cache/offline
 *   • static ภายในโดเมน (icons/css/js/manifest) → stale-while-revalidate
 *   • ข้ามพวก Firebase/gstatic/LINE/analytics → ปล่อยผ่าน network เสมอ
 *  bump CACHE_VERSION เมื่อแก้ shell เพื่อล้าง cache เก่า
 * ========================================================== */
const CACHE_VERSION = 'v2';
const STATIC_CACHE  = `bocean-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `bocean-runtime-${CACHE_VERSION}`;

// ยิงโหลดตอนติดตั้ง (best-effort; ตัวไหนพลาดไม่ทำให้ install ล้ม)
const PRECACHE = [
  '/offline.html',
  '/manifest.webmanifest',
  '/config.js',
  '/themes.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await Promise.allSettled(PRECACHE.map((u) => cache.add(new Request(u, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((k) => k.startsWith('bocean-') && k !== STATIC_CACHE && k !== RUNTIME_CACHE)
      .map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// รับคำสั่ง skipWaiting จากหน้า (ตอนมี SW ใหม่รอ)
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

const isSameOrigin = (url) => url.origin === self.location.origin;

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (!isSameOrigin(url)) return;                 // ปล่อย cross-origin (Firebase/gstatic/LINE) ผ่านไปเอง

  // เปิดหน้า/นำทาง → network-first
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(req);
        return cached || await caches.match('/index.html') || await caches.match('/offline.html');
      }
    })());
    return;
  }

  // static ภายในโดเมน → stale-while-revalidate
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then((res) => {
      if (res && res.status === 200 && res.type === 'basic') {
        caches.open(STATIC_CACHE).then((c) => c.put(req, res.clone()));
      }
      return res;
    }).catch(() => cached);
    return cached || network;
  })());
});
