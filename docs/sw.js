/* Offline support: network-first for app files, falling back to the cached copy.
   Only the app's own static files are cached — never engagement data. */
const CACHE = "auditje-v0.2.0";
const ASSETS = ["./", "./index.html", "./assets/app.css", "./assets/icon.svg", "./assets/fonts/PublicSans.woff2", "./assets/vendor/exceljs.min.js",
  "./assets/js/app.js", "./assets/js/engine.js", "./assets/js/io.js", "./assets/js/store.js", "./assets/js/workpaper.js", "./assets/js/charts.js",
  "./assets/sample/synthetic_journal_entries.csv", "./assets/sample/synthetic_trial_balance.csv", "./manifest.webmanifest"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return res; }).catch(() => caches.match(e.request)));
});
