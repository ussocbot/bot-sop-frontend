const CACHE_NAME = "bot-sop-static-v18-2";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/signed-out.html",
  "/css/styles.css?v=2026.07.18-v18.2",
  "/js/data.js?v=2026.07.18-v18.2",
  "/js/components.js?v=2026.07.18-v18.2",
  "/js/navigation.js?v=2026.07.18-v18.2",
  "/js/reviews.js?v=2026.07.18-v18.2",
  "/js/submissions.js?v=2026.07.18-v18.2",
  "/js/app.js?v=2026.07.18-v18.2",
  "/vendor/lucide.min.js?v=0.468.0",
  "/assets/gear-favicon.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(
    caches.match(request).then(cached => {
      const fresh = fetch(request).then(response => {
        if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
        return response;
      }).catch(() => cached);
      return cached || fresh;
    })
  );
});
