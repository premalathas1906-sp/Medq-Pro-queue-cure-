// Service Worker for MedQ PWA
const CACHE_NAME = 'medq-v1';
const ASSETS = [
  '/',
  '/index.html'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).catch(err => console.log('SW install cache failed:', err))
  );
});

self.addEventListener('activate', (e) => {
  console.log('[Service Worker] Active');
});

// Handle push notification events
self.addEventListener('push', (event) => {
  let data = { title: 'MedQ Update', body: 'Your queue status has updated!' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'MedQ Update', body: event.data.text() };
    }
  }

  const options = {
    body: data.body,
    icon: 'https://cdn-icons-png.flaticon.com/512/3063/3063176.png',
    badge: 'https://cdn-icons-png.flaticon.com/512/3063/3063176.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '1'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Listen for notifications clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('view=patient') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/?view=patient');
      }
    })
  );
});
