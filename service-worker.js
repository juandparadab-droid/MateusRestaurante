/* Caché del sitio y de los recursos CDN para apertura PWA sin internet. */
'use strict';

const CACHE_NAME = 'mateus-pwa-shell-v4';
const SHELL_FILES = [
  './', './index.html', './admin.html', './privacidad.html',
  './app.js', './admin.js', './mateus-offline.js', './mateus-pwa-store.js', './pwa-register.js',
  './logo.png', './logo.jpg', './login-mark.png', './favicon.ico', './manifest.webmanifest',
];
const CDN_PREFIXES = [
  'https://fonts.googleapis.com/', 'https://fonts.gstatic.com/',
  'https://cdn.jsdelivr.net/', 'https://unpkg.com/', 'https://cdnjs.cloudflare.com/',
];
const CDN_PRELOAD = [
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap',
  'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=DM+Mono:wght@400;500&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4',
  'https://unpkg.com/lucide@latest/dist/umd/lucide.min.js',
  'https://cdn.jsdelivr.net/npm/animejs@3.2.2/lib/anime.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL_FILES);
    await Promise.all(CDN_PRELOAD.map(async url => {
      try {
        const response = await fetch(new Request(url, { mode: 'no-cors', credentials: 'omit' }));
        if (response.ok || response.type === 'opaque') await cache.put(url, response);
      } catch (_) { /* Los recursos CDN se vuelven a intentar al abrir el sitio con internet. */ }
    }));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('mateus-pwa-') && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch (_) {
        const saved = await cache.match(request, { ignoreSearch: true });
        if (saved) return saved;
        if (request.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
        return Response.error();
      }
    })());
    return;
  }

  if (CDN_PREFIXES.some(prefix => request.url.startsWith(prefix))) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok || response.type === 'opaque') await cache.put(request, response.clone());
        return response;
      } catch (_) {
        return (await cache.match(request)) || Response.error();
      }
    })());
  }
});
