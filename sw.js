const CACHE_NAME = 'lab-expert-v1';
const urlsToCache = [
  '/',
  'home.css',
  'img/labex1.jpeg',
  'img/lab1.jpg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});