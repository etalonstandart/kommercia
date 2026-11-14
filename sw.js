'use strict';

// Версия кэша. При изменении версии браузер обновит файлы приложения.
const CACHE_PREFIX = 'kommercia-pwa-';
const CACHE_NAME = CACHE_PREFIX + 'v5-20261114';

// Файлы ядра приложения, которые скачиваются сразу и хранятся на телефоне
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon.png',
  './html5-qrcode.min.js'
];

// Внешние библиотеки (Firebase для облачной базы данных)
const REMOTE_LIBRARIES = [
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Скачиваем все файлы приложения в память телефона
    await cache.addAll(APP_SHELL);

    // Подтягиваем Firebase в кэш
    await Promise.all(REMOTE_LIBRARIES.map(async url => {
      try {
        const response = await fetch(url, {
          mode: 'no-cors',
          cache: 'reload'
        });

        if (response && (response.ok || response.type === 'opaque')) {
          await cache.put(url, response.clone());
        }
      } catch (error) {
        console.warn(
          'Не удалось предварительно кэшировать библиотеку:',
          url,
          error
        );
      }
    }));

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();

    // Удаляем старые версии кэша, чтобы освободить место
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
          new Response(
            'Приложение пока недоступно. Откройте его при подключении к интернету.',
            {
              status: 503,
              headers: {
                'Content-Type': 'text/plain; charset=utf-8'
              }
            }
          );
      }
    })());

    return;
  }

  // Для остальных файлов приложения:
  // сначала берём из памяти телефона, если нет — скачиваем из сети
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);

    if (cached) return cached;

    const response = await fetch(request);

    if (response && response.ok) {
      await cache.put(request, response.clone());
    }

    return response;
  })());
});
