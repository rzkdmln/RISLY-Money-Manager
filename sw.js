/*
 * RISLY Money Manager — service worker
 *
 * Strategy:
 *  - App shell + local modules are precached so the app opens offline.
 *  - Navigations are network-first with a cached shell fallback.
 *  - Same-origin assets use stale-while-revalidate.
 *  - CDN libraries are cached at runtime (cache-first, opaque-safe).
 *  - Cloud/API traffic is never cached.
 */

const VERSION = 'risly-1.0.1';
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/app.js',
  './js/auth.js',
  './js/charts.js',
  './js/cloud.js',
  './js/config.js',
  './js/data.js',
  './js/icons.js',
  './js/store.js',
  './js/ui.js',
  './js/utils.js',
  './js/forms/account.js',
  './js/forms/note.js',
  './js/forms/transaction.js',
  './js/views/accounts.js',
  './js/views/auth.js',
  './js/views/budgets.js',
  './js/views/calendar.js',
  './js/views/categories.js',
  './js/views/common.js',
  './js/views/dashboard.js',
  './js/views/notes.js',
  './js/views/recurring.js',
  './js/views/reports.js',
  './js/views/settings.js',
  './js/views/shell.js',
  './js/views/transactions.js',
  './icons/favicon-32.png',
  './icons/icon-96.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

const CDN_ASSETS = [
  'https://cdn.tailwindcss.com/3.4.16',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.4/jspdf.plugin.autotable.min.js',
];

const API_HOSTS = [
  'api.jsonbin.io',
  'jsonblob.com',
  'supabase.co',
  'firebaseio.com',
  'firebasedatabase.app',
  'googleapis.com',
];

const isApiRequest = (url) => API_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(APP_SHELL);
    // CDN libraries are best-effort: a failing CDN must not break installation.
    await Promise.allSettled(CDN_ASSETS.map(async (url) => {
      try {
        const response = await fetch(url, { mode: 'no-cors' });
        if (response) await cache.put(url, response);
      } catch { /* optional */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put('./index.html', response.clone());
      return response;
    }
    throw new Error(`Navigation response ${response?.status}`);
  } catch {
    return (await cache.match('./index.html')) ||
      (await cache.match('./')) ||
      new Response('RISLY sedang offline.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request).then((response) => {
    if (response && (response.ok || response.type === 'opaque')) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  }).catch(() => null);
  return cached || (await network) || Response.error();
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const cache = await caches.open(RUNTIME_CACHE);
  const response = await fetch(request);
  if (response && (response.ok || response.type === 'opaque')) {
    cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (!/^https?:$/.test(url.protocol)) return;
  if (isApiRequest(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});
