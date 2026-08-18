// sw.js — offline cache for the Japan 2026 trip site
// Bump this version string any time you update the file list below,
// so returning visitors (with wifi) pick up the new cache.
const CACHE_NAME = "japan-2026-v1";

// List every page and asset you want available offline.
// Add a line for each day page, booking confirmation page, image, etc.
// Paths are relative to the root of the site.
const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./entries.csv",
  "./icons/icon192.png",
  "./icons/icon512.png",
  "./entries.csv",
  // locations
  "./images/autumn.jpg",
  "./images/tokyo.jpg",
  "./images/yokohama.jpg",
  "./images/osaka.jpg",
  "./images/koyasan.jpg",
  "./images/kyoto.jpg",
  "./images/nara.jpg",
  "./images/nikko.jpg",
  "./images/hakone.jpg",
  // transport
  "./images/train_aoniyoshi.jpg",
  "./images/train_grantenku.jpg",
  "./images/train_hakonetozan.jpg",
  "./images/train_jrtokaido.jpg",
  "./images/train_keikyu.jpg",
  "./images/train_plane.jpg",
  "./images/train_shinkansen.jpg",
  "./images/train_spaciax.jpg",
  // activites
  "./images/arashiyama_boat.jpg",
  "./images/ghibli_museum.jpg",
  "./images/osaka_castle.jpg",
  "./images/pokemon_cafe.jpg",
  "./images/teamlabs_borderless.jpg"
];

// Install: cache everything listed above
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate: clean up old cache versions
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: serve from cache first, fall back to network,
// and cache anything new we successfully fetch (so pages you
// visit once while online stay available offline afterward).
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          // Don't try to cache cross-origin or non-OK responses
          if (!response || response.status !== 200 || response.type !== "basic") {
            return response;
          }
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Optional: return a fallback offline page here if you make one
          // return caches.match("./offline.html");
        });
    })
  );
});
