// sw.js — cache-first app shell. The cache name carries the version from core.js.
importScripts("./core.js");

const CACHE = "folder2md-" + self.folder2md.VERSION;
const SHELL = [
  "./", "./index.html", "./style.css", "./app.js", "./core.js", "./ignores.js",
  "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
