/* Service worker de la PWA (Fase 8).
 *
 * - Navegaciones: network-first. Si no hay red, se muestra /offline.
 *   Las páginas NO se guardan en caché (tienen datos del usuario: pedidos, saldo).
 * - Assets estáticos con hash (/_next/static, íconos): cache-first.
 * - Nunca se cachean /api/*, server actions (POST), payloads RSC ni nada que no sea GET.
 * - Web push: muestra la notificación y al tocarla abre/enfoca la URL del pedido.
 *
 * Para publicar cambios de estrategia o del precache, subir VERSION: el
 * `activate` borra los caches de versiones anteriores.
 */

const VERSION = "v1";
const PREFIX = "prepago-";
const SHELL_CACHE = `${PREFIX}shell-${VERSION}`;
const STATIC_CACHE = `${PREFIX}static-${VERSION}`;
const OFFLINE_URL = "/offline";
const PRECACHE = [
  "/icons/icon-192.png",
  "/icons/badge-96.png",
  "/icon.svg",
  "/favicon.ico",
];
const STATIC_LIMIT = 120; // entradas máximas del cache de assets

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(PRECACHE).catch(() => undefined);
      // Si falla, el SW igual se instala (push sigue funcionando) y usa el HTML mínimo.
      await precacheOfflinePage(cache).catch(() => undefined);
      await self.skipWaiting();
    })(),
  );
});

// Guarda /offline y los CSS/JS que referencia, para que se vea bien sin red
// aunque el usuario nunca haya visitado esa página.
async function precacheOfflinePage(shell) {
  const res = await fetch(OFFLINE_URL, { cache: "reload", credentials: "omit" });
  if (!res.ok) throw new Error(`No se pudo precachear ${OFFLINE_URL}: ${res.status}`);
  const html = await res.clone().text();
  await shell.put(OFFLINE_URL, res);
  const assets = [...new Set(html.match(/\/_next\/static\/[^"'\s)<>?]+/g) || [])];
  const statics = await caches.open(STATIC_CACHE);
  await Promise.all(assets.map((url) => statics.add(url).catch(() => undefined)));
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, STATIC_CACHE]);
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith(PREFIX) && !keep.has(n)).map((n) => caches.delete(n)));
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/favicon.ico" ||
    url.pathname === "/icon.svg"
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // server actions, POST a la API, etc.
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  // Payloads RSC de navegaciones del lado del cliente: datos por usuario, nunca al caché.
  if (request.headers.get("RSC") || url.searchParams.has("_rsc")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(event));
    return;
  }
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirstNavigation(event) {
  try {
    const preloaded = await event.preloadResponse;
    if (preloaded) return preloaded;
    return await fetch(event.request);
  } catch {
    const cached = await caches.match(OFFLINE_URL, { cacheName: SHELL_CACHE });
    return (
      cached ||
      new Response("<h1>Sin conexión</h1><p>Revisá tu conexión a internet y volvé a intentar.</p>", {
        status: 503,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      })
    );
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok && res.type === "basic") {
    await cache.put(request, res.clone());
    trim(cache);
  }
  return res;
}

async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length <= STATIC_LIMIT) return;
  await Promise.all(keys.slice(0, keys.length - STATIC_LIMIT).map((k) => cache.delete(k)));
}

// ---------------------------------------------------------------------------
// Web push
// ---------------------------------------------------------------------------

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Prepago";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: data.tag,
      lang: "es-PY",
      data: { url: safePath(data.url) },
    }),
  );
});

// Solo rutas internas: un push nunca puede abrir otro sitio.
function safePath(url) {
  return typeof url === "string" && url.startsWith("/") && !url.startsWith("//") ? url : "/cuenta/pedidos";
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(safePath(event.notification.data && event.notification.data.url), self.location.origin);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const same = windows.find((w) => new URL(w.url).pathname === target.pathname);
      if (same) return same.focus();
      const any = windows.find((w) => new URL(w.url).origin === target.origin);
      if (any) {
        const navigated = await any.navigate(target.href).catch(() => null);
        return (navigated || any).focus();
      }
      return self.clients.openWindow(target.href);
    })(),
  );
});

// El navegador rotó la suscripción: se vuelve a registrar con la misma clave.
self.addEventListener("pushsubscriptionchange", (event) => {
  const options = event.oldSubscription && event.oldSubscription.options;
  if (!options) return;
  event.waitUntil(
    self.registration.pushManager.subscribe(options).then((sub) =>
      fetch("/api/push/suscribir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(sub.toJSON()),
      }),
    ),
  );
});
