/* Synth PWA service worker — build version comes from the registration query. */
const BUILD_ID =
  new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE_NAME = "synth-shell-" + BUILD_ID;
const CACHE_PREFIX = "synth-shell-";
const SCOPE_URL = new URL(self.registration.scope);
const ROOT_URL = new URL("./", SCOPE_URL).href;
const MANIFEST_URL = new URL("./manifest.webmanifest", SCOPE_URL).href;
const ASSET_MANIFEST_URL = new URL("./asset-manifest.json", SCOPE_URL).href;
const ICON_URLS = [
  "./icons/synth.svg",
  "./icons/synth-180.png",
  "./icons/synth-192.png",
  "./icons/synth-512.png",
].map((path) => new URL(path, SCOPE_URL).href);

function sameScope(url) {
  return (
    url.origin === SCOPE_URL.origin &&
    url.href.startsWith(SCOPE_URL.href)
  );
}

async function cacheResponse(cache, request, response) {
  if (
    response &&
    response.ok &&
    response.type !== "opaque"
  ) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function precacheShell() {
  const cache = await caches.open(CACHE_NAME);
  const rootResponse = await fetch(ROOT_URL, {
    cache: "reload",
  });
  if (!rootResponse.ok) {
    throw new Error("Could not fetch Synth app shell.");
  }

  await cache.put(ROOT_URL, rootResponse.clone());
  const html = await rootResponse.text();
  const urls = new Set([
    MANIFEST_URL,
    ASSET_MANIFEST_URL,
    ...ICON_URLS,
  ]);

  try {
    const manifestResponse = await fetch(
      ASSET_MANIFEST_URL,
      { cache: "reload" },
    );
    if (manifestResponse.ok) {
      const manifest = await manifestResponse.json();
      for (const asset of manifest.assets ?? []) {
        const assetUrl = new URL(asset, ROOT_URL);
        if (sameScope(assetUrl)) {
          urls.add(assetUrl.href);
        }
      }
    }
  } catch {
    // index.html discovery below remains a safe fallback.
  }
  const pattern = /(?:src|href)=["']([^"'#]+)["']/g;
  let match;

  while ((match = pattern.exec(html))) {
    try {
      const url = new URL(match[1], ROOT_URL);
      if (sameScope(url) && url.href !== self.location.href) {
        urls.add(url.href);
      }
    } catch {
      // Ignore malformed/non-URL attributes.
    }
  }

  await Promise.all(
    [...urls].map(async (url) => {
      try {
        const response = await fetch(url, {
          cache: "reload",
        });
        await cacheResponse(cache, url, response);
      } catch {
        // Optional shell resources should not make installation fatal.
      }
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((names) =>
        Promise.all(
          names
            .filter(
              (name) =>
                name.startsWith(CACHE_PREFIX) &&
                name !== CACHE_NAME,
            )
            .map((name) => caches.delete(name)),
        ),
      ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (!sameScope(url) || url.pathname.endsWith("/sw.js")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const response = await fetch(request);
          if (response.ok) {
            await cache.put(ROOT_URL, response.clone());
          }
          return response;
        } catch {
          return (
            (await cache.match(request)) ||
            (await cache.match(ROOT_URL)) ||
            Response.error()
          );
        }
      })(),
    );
    return;
  }

  const cacheableDestination = new Set([
    "script",
    "style",
    "image",
    "font",
    "manifest",
  ]);

  if (
    cacheableDestination.has(request.destination) ||
    url.pathname.includes("/assets/")
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        if (cached) return cached;

        try {
          const response = await fetch(request);
          await cacheResponse(cache, request, response);
          return response;
        } catch {
          return Response.error();
        }
      })(),
    );
  }
});
