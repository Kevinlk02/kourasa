/* Service worker de la PWA Koursa : interface en cache pour démarrer vite en 3G, Web Push. */
const CACHE = 'koursa-app-v2';
const SHELL = ['/app', '/app/manifest.webmanifest', '/app/icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith('/app')) return;
  // Navigation : réseau d'abord, cache si hors ligne (application monopage).
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put('/app', copy));
      }
      return res;
    }).catch(() => caches.match('/app')));
    return;
  }
  // Fichiers statiques (JS/CSS/images versionnés) : cache d'abord.
  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit ||
      fetch(e.request).then((res) => {
        if (res.ok && /\/_expo\/|\/assets\/|\/icons\//.test(url.pathname)) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }),
    ),
  );
});

self.addEventListener('push', (e) => {
  let p = { title: 'Koursa', body: '', data: {} };
  try { p = { ...p, ...e.data.json() }; } catch (_) { /* texte brut */ }
  e.waitUntil(self.registration.showNotification(p.title, { body: p.body, data: p.data, icon: '/app/icons/icon-192.png', badge: '/app/icons/icon-192.png' }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const id = e.notification.data && e.notification.data.delivery_id;
  const target = id ? `/app/delivery/${id}` : '/app';
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((wins) => {
      for (const w of wins) if (w.url.includes('/app')) return w.focus().then(() => w.navigate(target));
      return self.clients.openWindow(target);
    }),
  );
});
