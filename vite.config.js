import { defineConfig } from 'vite';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';

/* Writes dist/sw.js after each build: the app shell is cached for offline use and replaced when a new version ships. */
function serviceWorker() {
  return {
    name: 'brew-service-worker',
    apply: 'build',
    closeBundle() {
      const dist = 'dist';
      const files = [];
      (function walk(dir) {
        for (const name of readdirSync(dir)) {
          const p = join(dir, name);
          if (statSync(p).isDirectory()) walk(p);
          else if (name !== 'sw.js') files.push(relative(dist, p).split(sep).join('/'));
        }
      })(dist);
      files.sort();
      const hash = createHash('sha256');
      files.forEach(f => { hash.update(f); hash.update(readFileSync(join(dist, f))); });
      const version = hash.digest('hex').slice(0, 12);
      const assets = ['./'].concat(files.map(f => './' + f));
      const sw = `/* generated at build time */
const CACHE = 'brew-${version}';
const ASSETS = ${JSON.stringify(assets, null, 2)};
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('brew-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; /* GitHub sync always goes to the network */
  if (req.mode === 'navigate') {
    /* the page itself: newest from the network when online, cached copy when offline */
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); return res; })
      .catch(() => caches.match('./index.html').then(r => r || caches.match('./'))));
    return;
  }
  e.respondWith(caches.match(req).then(r => r || fetch(req)));
});
`;
      writeFileSync(join(dist, 'sw.js'), sw);
    }
  };
}

const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(stamp) },
  build: { target: 'es2019', sourcemap: false },
  plugins: [serviceWorker()],
  test: { include: ['tests/unit/**/*.test.js'], environment: 'node' }
});
