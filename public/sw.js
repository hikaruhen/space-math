// Generated release cache name is inserted by the build script.
const CACHE = "space-math-v1";
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const response = await fetch("./");
      const html = await response.text();
      const files = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)]
        .map((m) => m[1])
        .filter((p) => p.startsWith("./") && !p.endsWith(".webmanifest"));
      const cache = await caches.open(CACHE);
      await cache.addAll([
        ...new Set([
          "./",
          "./rocket.svg",
          "./icon.svg",
          "./manifest.webmanifest",
          ...files,
        ]),
      ]);
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith("space-math-") && key !== CACHE)
          await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  if (
    event.request.method !== "GET" ||
    new URL(event.request.url).origin !== self.location.origin
  )
    return;
  event.respondWith(
    (async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      try {
        return await fetch(event.request);
      } catch (error) {
        if (event.request.mode === "navigate") return await caches.match("./");
        throw error;
      }
    })(),
  );
});
