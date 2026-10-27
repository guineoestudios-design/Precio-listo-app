// PrecioListo — guarda la app en el celular para que abra rápido y sin internet.
// El lector del celular funciona sin internet; la IA del PC necesita Tailscale y Gemini necesita internet.
const CACHE = "preciolisto-v8";
const FILES = [
  "./", "./index.html", "./manifest.webmanifest",
  "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png",
  "./lib/jspdf.umd.min.js", "./lib/jspdf.plugin.autotable.min.js", "./lib/xlsx.full.min.js",
  "./parser.js", "./lib/tesseract/tesseract.min.js", "./lib/tesseract/worker.min.js",
  "./lib/tesseract/core/tesseract-core-simd-lstm.wasm.js", "./lib/tesseract/lang/spa.traineddata.gz"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // Gemini y fuentes van directo a internet
  // Red primero (para recibir actualizaciones), caché si no hay conexión
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request).then(r => r || caches.match("./index.html")))
  );
});
