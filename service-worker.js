const CACHE_NAME = "bot-sop-static-v18-13";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/signed-out.html",
  "/css/styles.css?v=2026.07.21-v18.13",
  "/js/data.js?v=2026.07.21-v18.13",
  "/js/components.js?v=2026.07.21-v18.13",
  "/js/navigation.js?v=2026.07.21-v18.13",
  "/js/reviews.js?v=2026.07.21-v18.13",
  "/js/submissions.js?v=2026.07.21-v18.13",
  "/js/app.js?v=2026.07.21-v18.13",
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

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match("/index.html")))
    );
    return;
  }

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
