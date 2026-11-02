// Service worker: guarda os arquivos do app para funcionar sem internet.
// Ao publicar uma nova versão, altere VERSAO para forçar a atualização.
const VERSAO = 'ee-v5';
const ARQUIVOS = [
  "./",
  "assets/apple-touch-icon.png",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/icon-maskable-512.png",
  "assets/logo.jpg",
  "css/app.css",
  "index.html",
  "js/app.js",
  "js/calc.js",
  "js/comprovante.js",
  "js/config.js",
  "js/exportar.js",
  "js/icones.js",
  "js/scanner.js",
  "js/state.js",
  "js/store/firebase.js",
  "js/store/index.js",
  "js/store/local.js",
  "js/util.js",
  "js/views/ajuda.js",
  "js/views/atividades.js",
  "js/views/configuracoes.js",
  "js/views/consignacao.js",
  "js/views/estoque.js",
  "js/views/etiquetas.js",
  "js/views/painel.js",
  "js/views/pdv.js",
  "js/views/produtos.js",
  "js/views/relatorios.js",
  "js/views/usuarios.js",
  "js/views/vendas.js",
  "manifest.webmanifest",
  "vendor/JsBarcode.all.min.js",
  "vendor/chart.umd.min.js",
  "vendor/firebase.js",
  "vendor/html5-qrcode.min.js",
  "vendor/jspdf.plugin.autotable.min.js",
  "vendor/jspdf.umd.min.js",
  "vendor/xlsx.mini.min.js",
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Arquivos do próprio app: tenta a rede (versão mais nova) por até 3 s; sem internet, usa o cache.
// Requisições de outros domínios (Firebase) passam direto.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSAO);
    const rede = fetch(req).then((r) => { if (r.ok) cache.put(req, r.clone()); return r; });
    rede.catch(() => {});
    const limite = new Promise((res) => setTimeout(res, 3000));
    try {
      const r = await Promise.race([rede, limite]);
      if (r) return r;
    } catch { /* offline */ }
    const emCache = await cache.match(req, { ignoreSearch: true });
    return emCache || rede;
  })());
});
