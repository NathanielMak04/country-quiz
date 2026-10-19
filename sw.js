// Keeps a copy of the whole game on the phone after the first visit, so it opens and plays with no connection.
// make_site.py replaces "dev" with a fingerprint of the files, so a re-upload refreshes the saved copy.
const VERSION = "fe42276086";
const CACHE = "country-quiz-" + VERSION;
const FILES = [
  "./", "index.html", "css/style.css",
  "js/countries.js", "js/shapes.js", "js/regions.js", "js/match.js", "js/store.js", "js/map.js", "js/app.js",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("country-quiz-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
