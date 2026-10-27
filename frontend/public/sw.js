/**
 * Service worker do AgroMundo (app instalável).
 * - Páginas e arquivos: rede primeiro; sem conexão, usa a última cópia salva.
 * - API (/api) e uploads nunca são guardados: dados sempre frescos.
 */
const CACHE = 'agromundo-v1';
const OFFLINE_URLS = ['/', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(OFFLINE_URLS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/uploads') || url.pathname.startsWith('/share')) return;
  // Arquivos do servidor de desenvolvimento (Vite) não são guardados
  if (url.pathname.startsWith('/@') || url.pathname.startsWith('/node_modules') || url.pathname.startsWith('/src/')) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(req.mode === 'navigate' ? '/' : req, copia));
        }
        return res;
      })
      .catch(() => caches.match(req.mode === 'navigate' ? '/' : req).then((r) => r || caches.match('/')))
  );
});
