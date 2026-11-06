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

const VERSION = 'risly-1.2.30';
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './privacy.html',
  './css/app.css',
  './js/app.js',
  './js/colors.js',
  './js/auth.js',
  './js/charts.js',
  './js/cloud.js',
  './js/config.js',
  './js/data.js',
  './js/gdrive.js',
  './js/google-auth-relay.js',
  './js/icons.js',
  './js/pull-to-refresh.js',
  './js/store.js',
  './js/ui.js',
  './js/utils.js',
  './js/forms/account.js',
  './js/forms/cloud.js',
  './js/forms/note.js',
  './js/forms/transaction.js',
  './js/views/accounts.js',
  './js/views/auth.js',
  './js/views/budgets.js',
  './js/views/calendar.js',
  './js/views/categories.js',
  './js/views/common.js',
  './js/views/dashboard.js',
  './js/views/goals.js',
  './js/views/notes.js',
  './js/views/recurring.js',
  './js/views/reports.js',
  './js/views/settings.js',
  './js/views/shell.js',
  './js/views/transactions.js',
  './oauth-callback.html',
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

const CDN_URLS = new Set(CDN_ASSETS);

const isCdnRequest = (url) => CDN_URLS.has(url.href);

/**
 * A response produced by fetch() after following a redirect has
 * `redirected === true`. Browsers reject such a response when the original
 * request uses `redirect: "manual"` (common for navigations), and cached
 * redirected responses keep failing forever. Rebuild the response so the
 * redirect flag is cleared while preserving its body and headers.
 */
function stripRedirectedResponse(response) {
  if (!response || !response.redirected) return response;
  const headers = new Headers(response.headers);
  // The body returned by fetch() is already decoded, so these encoding
  // headers would be wrong (and can corrupt the rebuilt response).
  headers.delete('content-encoding');
  headers.delete('content-length');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // `cache: 'reload'` bypasses the browser HTTP cache so a new app version
    // is never precached with stale files from the previous version.
    await Promise.allSettled(APP_SHELL.map(async (url) => {
      try {
        const response = stripRedirectedResponse(await fetch(url, { cache: 'reload' }));
        if (response && response.ok) await cache.put(url, response);
      } catch { /* optional asset */ }
    }));
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
    // Cloudflare Pages may redirect /privacy.html to another path. Strip the
    // redirected flag before returning or caching, otherwise Chrome rejects
    // the navigation with "redirected response ... redirect mode is not follow".
    const response = stripRedirectedResponse(await fetch(request, { cache: 'no-cache' }));
    if (response && response.ok) {
      // Only app-shell navigations may refresh the cached index.html.
      // Other pages (e.g. oauth-callback.html) must not overwrite it.
      let pathname = '';
      try { pathname = new URL(request.url).pathname; } catch { pathname = ''; }
      if (pathname.endsWith('/') || pathname.endsWith('/index.html')) {
        cache.put('./index.html', response.clone());
      }
      if (pathname.endsWith('/privacy.html')) {
        cache.put('./privacy.html', response.clone());
      }
      if (pathname.endsWith('/oauth-callback.html')) {
        cache.put('./oauth-callback.html', response.clone());
      }
      return response;
    }
    throw new Error(`Navigation response ${response?.status}`);
  } catch {
    let pathname = '';
    try { pathname = new URL(request.url).pathname; } catch { pathname = ''; }
    if (pathname.endsWith('/privacy.html')) {
      const cachedPrivacy = await cache.match('./privacy.html');
      if (cachedPrivacy) return stripRedirectedResponse(cachedPrivacy);
    }
    if (pathname.endsWith('/oauth-callback.html')) {
      const cachedCallback = stripRedirectedResponse(await cache.match('./oauth-callback.html'));
      if (cachedCallback) return cachedCallback;
      return new Response('Halaman login Google sedang dimuat. Coba ulangi login.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
    return stripRedirectedResponse(await cache.match('./index.html')) ||
      stripRedirectedResponse(await cache.match('./')) ||
      new Response('RISLY sedang offline.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
  }
}

const offlineResponse = () => new Response('', { status: 504, statusText: 'Offline' });

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = stripRedirectedResponse(await cache.match(request));
  const network = fetch(request, { cache: 'no-cache' }).then((raw) => {
    const response = stripRedirectedResponse(raw);
    if (response && (response.ok || response.type === 'opaque')) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  }).catch(() => null);
  return cached || (await network) || offlineResponse();
}

async function cacheFirst(request) {
  const cached = stripRedirectedResponse(await caches.match(request));
  if (cached) return cached;
  try {
    const cache = await caches.open(RUNTIME_CACHE);
    const response = stripRedirectedResponse(await fetch(request));
    if (response && (response.ok || response.type === 'opaque')) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    return offlineResponse();
  }
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

  // Only this app's own pages and the known CDN libraries are handled by the
  // service worker. Every other cross-origin request (Google Sign-In, Firebase
  // Auth, gapi, fonts, REST APIs) must go straight to the network: intercepting
  // them used to return the offline fallback and broke Google login.
  if (url.origin !== self.location.origin && !isCdnRequest(url)) return;

  // Let the browser handle the OAuth callback directly. Intercepting it with
  // the service worker can turn a normal online navigation into an offline
  // fallback page even when the network is available.
  if (url.pathname.endsWith('/oauth-callback.html')) return;

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
