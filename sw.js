/* Shasta College ADN Course Manager — app shell service worker */
var CACHE_NAME = 'clin-sim-v21';

var PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './css/print.css',
  './css/audit-print.css',
  './vendor/chart.umd.min.js',
  './vendor/xlsx.full.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png',
  './icons/favicon.svg',
  './js/state.js',
  './js/user-template.js',
  './js/user-data.js',
  './js/course-defaults.js',
  './js/clinical-sites-library.js',
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
  './js/audit.js',
  './js/audit-snapshot.js',
  './js/audit-export.js',
  './js/dashboard-export.js',
  './js/sim-faculty-data.js',
  './js/proposal-format.js',
  './js/proposals.js',
  './js/setup-draft.js',
  './js/storage.js',
  './js/user-storage.js',
  './js/users-registry-storage.js',
  './js/user-directory.js',
  './js/user-session.js',
  './js/permissions.js',
  './js/playground-storage.js',
  './js/clinical-sites-library-storage.js',
  './js/sim-faculty-storage.js',
  './js/ui/dashboard.js',
  './js/ui/master-calendar.js',
  './js/ui/student-view.js',
  './js/ui/sim-roles.js',
  './js/ui/makeup-finder.js',
  './js/ui/audit-closeout.js',
  './js/ui/setup-proposals.js',
  './js/ui/setup-config.js',
  './js/ui/setup.js',
  './js/ui/date-inputs.js',
  './js/ui/config-modal.js',
  './js/ui/playground.js',
  './js/ui/new-semester-batch.js',
  './js/ui/users-admin.js',
  './js/ui/clinical-sites-tab.js',
  './js/ui/playground-import.js',
  './js/ui/theory-stub.js',
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
