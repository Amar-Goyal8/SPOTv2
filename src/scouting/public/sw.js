const cacheVersion = "spotv2-cache-v3";

const filesToCache = [
  // Core scouting app
  "/",
  "/executables.js",

  // CSS
  "/css/design-system.css",
  "/css/nav.css",
  "/css/animations.css",
  "/css/scouting.css",

  // JS
  "/js/internal.js",
  "/js/landing.js",
  "/js/match-scouting.js",
  "/js/scouting-sync.js",
  "/js/local-data.js",
  "/js/waiting.js",
  "/js/toast.js",
  "/js/lib/qrcode.js",
  "/js/lib/jsqr.js",

  // Config
  "/config/config.json",
  "/config/match-scouting.json",
  "/config/qr.json",

  // Images
  "/img/field.svg",
  "/img/half-field.svg",
  "/img/spinner_red.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(cacheVersion).then((cache) => {
      // Cache files individually so one failure doesn't abort all
      return Promise.allSettled(
        filesToCache.map((url) =>
          cache.add(url).catch((e) => console.warn("SW: failed to cache", url, e))
        )
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Remove old cache versions
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== cacheVersion).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  let url;
  try {
    url = new URL(event.request.url);
  } catch {
    return;
  }

  // Only handle same-origin GET requests.
  if (event.request.method !== "GET" || url.origin !== location.origin) return;
  // Never intercept Socket.IO polling/websocket upgrade requests.
  if (url.pathname.startsWith("/socket.io/")) return;
  // Only intercept explicit static assets this worker manages.
  if (!filesToCache.includes(url.pathname)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(cacheVersion);
      const cached = await cache.match(event.request);

      try {
        const response = await fetch(event.request);
        if (response && response.ok && filesToCache.includes(url.pathname)) {
          cache.put(event.request, response.clone());
        }
        return response;
      } catch (err) {
        if (cached) return cached;
        return new Response("Offline", { status: 503 });
      }
    })()
  );
});
