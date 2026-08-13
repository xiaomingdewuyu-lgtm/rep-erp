// REP ERP —— Service Worker（网络优先，杜绝旧缓存白屏）
// 关键策略：在线时永远走网络拿最新文件；激活时清空所有历史缓存，从根上避免旧版本资源对不上导致白屏。
const CACHE = 'rep-erp-v2'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL).catch(() => {}))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    // 删除全部缓存（含旧版本），旧资源不再可能被误用
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // API 请求绝不缓存，保证数据实时
  if (url.pathname.startsWith('/api/')) return
  // 网络优先：在线永远取最新；仅在断网时回退到缓存，保证可离线打开
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && url.origin === self.location.origin && url.pathname !== '/sw.js') {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
        }
        return res
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('/index.html'))),
  )
})
