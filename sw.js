// NEXOBRA - Service Worker (modo offline / PWA)
//
// Qué hace esta primera versión:
//  - Deja instalar el sitio como app (junto con manifest.json).
//  - Cachea el "esqueleto" de la app (HTML, CSS, los js/*.js, data.js) para
//    que el sitio ABRA aunque no haya conexión -- usando el último catálogo
//    que se haya cargado (data.js ya trae 943 materiales de fábrica, y
//    pricing.js lo sincroniza contra Supabase cuando SÍ hay conexión).
//  - Guarda una copia de las últimas consultas de lectura (GET) a Supabase,
//    para que si se pierde la conexión con la app abierta, se sigan viendo
//    los últimos precios consultados en vez de un error.
//
// Qué NO cubre esta primera versión (a propósito, para no complicar):
//  - Login, mapa de proveedores, carga de precios, reseñas, alertas, y en
//    general cualquier cosa que escriba datos -- todo eso necesita conexión
//    sí o sí. Sin conexión van a fallar con el error de siempre, no hay
//    fallback especial para ellas todavía.
//  - Las llamadas de tipo .rpc() de Supabase (mapa, directorio de
//    proveedores) son POST, no se cachean acá.
//
// *** IMPORTANTE para cuando subas una versión nueva del sitio ***
// Los navegadores NO vuelven a descargar este archivo si no cambia ni una
// letra. Si tocaste style.css o algún js/*.js y querés que los celulares
// que ya instalaron la app dejen de usar la versión vieja cacheada, subí
// este archivo TAMBIÉN y cambiá el número de acá abajo (SW_VERSION) --
// alcanza con sumarle 1. Eso hace que el Service Worker se reinstale solo y
// tire a la basura la caché anterior.
const SW_VERSION = 'v3';

const SHELL_CACHE = `nexobra-shell-${SW_VERSION}`;
const DATA_CACHE = `nexobra-data-${SW_VERSION}`;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/manifest.json',
  '/supabase-config.js',
  '/data.js',
  '/js/state.js',
  '/js/pricing.js',
  '/js/auth.js',
  '/js/catalog.js',
  '/js/computo.js',
  '/js/excel.js',
  '/js/provider.js',
  '/js/map.js',
  '/js/admin.js',
  '/js/main.js',
  '/assets/nexobra-icon.png',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
];

// Scripts de terceros (CDN) que la app necesita para arrancar. Se cachean
// "a mejor esfuerzo": si alguno falla al instalar (ej. el CDN está caído
// justo en ese momento) no rompe el resto de la instalación.
const EXTERNAL_ASSETS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
];

const SUPABASE_ORIGIN = 'https://ibwqkfdfyfdmteheacjz.supabase.co';

async function precacheOne(cache, url, { noCors = false } = {}) {
  try {
    const res = await fetch(url, noCors ? { mode: 'no-cors' } : undefined);
    if (noCors || res.ok) {
      await cache.put(url, res);
    }
  } catch (err) {
    console.warn('[sw] no se pudo precachear (no bloquea la instalación):', url, err);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Uno por uno (no cache.addAll) para que un solo archivo faltante no
    // tire abajo la instalación completa del service worker.
    await Promise.all(SHELL_ASSETS.map((url) => precacheOne(cache, url)));
    await Promise.all(EXTERNAL_ASSETS.map((url) => precacheOne(cache, url, { noCors: true })));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key !== SHELL_CACHE && key !== DATA_CACHE)
        .map((key) => caches.delete(key)),
    );
    await self.clients.claim();
  })());
});

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((res) => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || (await networkPromise) || Response.error();
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Nunca tocamos escrituras (POST/PUT/PATCH/DELETE) -- eso incluye todas
  // las llamadas .rpc() de Supabase y cualquier guardado.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  // Carga directa de la página (abrir/refrescar) -- último HTML conocido
  // si no hay red.
  if (request.mode === 'navigate') {
    event.respondWith(
      networkFirst(request, SHELL_CACHE).catch(() => caches.match('/index.html')),
    );
    return;
  }

  // Esqueleto de la app (HTML/CSS/JS/data.js/íconos propios).
  if (isSameOrigin && SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
    return;
  }

  // CDNs externos precacheados (supabase-js, leaflet).
  if (EXTERNAL_ASSETS.includes(request.url)) {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
    return;
  }

  // Lecturas a Supabase (catálogo, precios, índices). Las llamadas .rpc()
  // son POST y ya quedaron afuera arriba -- esto es solo REST GET normal
  // (ej. lo que usa pricing.js para sincronizar el catálogo).
  if (url.origin === SUPABASE_ORIGIN && url.pathname.startsWith('/rest/v1/')) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  // Todo lo demás (mapa, auth, storage, funciones, terceros no listados):
  // directo a la red, sin intervenir.
});
