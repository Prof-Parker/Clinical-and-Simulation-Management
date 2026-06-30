/* Clinical & Simulation Management — app shell service worker */
var CACHE_NAME = 'clin-sim-v7';

var PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './css/print.css',
  './vendor/chart.umd.min.js',
  './vendor/xlsx.full.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png',
  './icons/favicon.svg',
  './js/state.js',
  './js/data-model.js',
  './js/roster-balance.js',
  './js/calendar-engine.js',
  './js/orientation.js',
  './js/clinical-sites.js',
  './js/scheduler.js',
  './js/validator.js',
  './js/feasibility.js',
  './js/schedule-status.js',
  './js/makeup-display.js',
  './js/dashboard-export.js',
  './js/sim-faculty-data.js',
  './js/storage.js',
  './js/sim-faculty-storage.js',
  './js/ui/dashboard.js',
  './js/ui/master-calendar.js',
  './js/ui/student-view.js',
  './js/ui/sim-roles.js',
  './js/ui/makeup-finder.js',
  './js/ui/setup-config.js',
  './js/ui/setup.js',
  './js/ui/date-inputs.js',
  './js/ui/config-modal.js',
  './js/theme.js',
  './js/main.js',
  './js/pwa.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE_URLS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) { return key !== CACHE_NAME; }).map(function (key) {
          return caches.delete(key);
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;

  var url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('.json')) return;

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request).then(function (response) {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(event.request, copy);
        });
        return response;
      }).catch(function () {
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
