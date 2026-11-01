'use strict';

const CACHE_PREFIX = 'kommercia-pwa-';
const CACHE_NAME = CACHE_PREFIX + 'v3-20261101';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon.png'
];

// Эти версии совпадают с адресами SDK в index.html.
// Классические скрипты загружаются браузером как no-cors, поэтому opaque
// ответы допускаются в Cache Storage и позволяют открыть приложение офлайн.
const REMOTE_LIBRARIES = [
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);

    await Promise.all(REMOTE_LIBRARIES.map(async url => {
      try {
        const response = await fetch(url, { mode: 'no-cors', cache: 'reload' });
        if (response && (response.ok || response.type === 'opaque')) {
          await cache.put(url, response.clone());
        }
      } catch (error) {
        // Первый запуск может быть офлайн. Приложение остаётся доступным,
        // а Firebase SDK будет повторно загружен при восстановлении сети.
        console.warn('Не удалось предварительно кэшировать библиотеку:', url, error);
      }
    }));

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map(name => {
      if (name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME) {
        return caches.delete(name);
      }
      return Promise.resolve(false);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  const isRemoteLibrary = REMOTE_LIBRARIES.includes(request.url);

  if (isRemoteLibrary) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response && (response.ok || response.type === 'opaque')) {
        await cache.put(request, response.clone());
      }
      return response;
    })());
    return;
  }

  if (requestUrl.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          await cache.put('./index.html', response.clone());
        }
        return response;
      } catch (error) {
        return (await cache.match(request)) ||
          (await cache.match('./index.html')) ||
          new Response('Приложение пока недоступно. Откройте его при подключении к интернету.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response && response.ok) await cache.put(request, response.clone());
    return response;
  })());
});
