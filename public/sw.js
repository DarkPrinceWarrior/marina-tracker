const CACHE_NAME = "ritm-pwa-v4";
const SHELL_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.allSettled(
          SHELL_ASSETS.map((url) =>
            cache.add(new Request(url, { cache: "reload" }))
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept Vite dev/HMR endpoints
  if (
    url.pathname.startsWith("/@") ||
    url.pathname.startsWith("/node_modules/") ||
    url.pathname.startsWith("/web/")
  ) {
    return;
  }

  // Immutable uploaded nutrition photos: cache-first
  if (url.pathname.startsWith("/api/nutrition/photos/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response && response.ok && response.type === "basic") {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  // Network-first for API requests (never serve stale API responses when online)
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(
            JSON.stringify({
              detail: "Нет соединения с сервером. Проверьте подключение.",
              offline: true,
            }),
            {
              status: 503,
              headers: { "Content-Type": "application/json; charset=utf-8" },
            }
          )
      )
    );
    return;
  }

  // Navigation requests: network-first with cached SPA shell fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
          }
          return response;
        })
        .catch(() =>
          caches.match("/").then((cachedRoot) => cachedRoot || caches.match(request))
        )
    );
    return;
  }

  // Static assets: stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});

// Native Web Push notifications (iOS Notification Center & Desktop)
self.addEventListener("push", (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { body: event.data.text() };
    }
  }

  const title = payload.title || "Ритм";
  const body =
    payload.body || "Пора заглянуть в «Ритм» и отметить сегодняшний шаг.";
  const tab = payload.tab || "today";
  const sub = payload.sub || "";
  const url =
    payload.url ||
    (sub
      ? `/?tab=${encodeURIComponent(tab)}&sub=${encodeURIComponent(sub)}`
      : `/?tab=${encodeURIComponent(tab)}`);
  const tag = payload.tag || "ritm-notification";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag,
      renotify: true,
      data: { url, tab, sub },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const tab = data.tab || "today";
  const sub = data.sub || "";
  const targetUrl =
    data.url ||
    (sub
      ? `/?tab=${encodeURIComponent(tab)}&sub=${encodeURIComponent(sub)}`
      : `/?tab=${encodeURIComponent(tab)}`);

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.startsWith(self.location.origin) && "focus" in client) {
            client.postMessage({
              type: "NAVIGATE",
              tab,
              sub,
              url: targetUrl,
            });
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      })
  );
});
