/**
 * Service Worker - 离线支持和缓存策略
 *
 * 缓存策略：
 * - Cache First: 静态资源（JS、CSS、字体、图片）
 * - Network First: API 请求（优雅降级到过期缓存）
 * - Stale While Revalidate: HTML（返回缓存，后台更新）
 */

// 重要：每次 navigation/profile 等核心模块改动后必须改版本号，触发旧缓存清理。
// 占位符 __ASSET_VERSION__ 在构建/部署时被替换；本字段同时叠加一个手动 fallback 标记
// 用于无构建脚本环境（开发态）也能产生新缓存命名。
const CACHE_NAME = 'shengsheng-__ASSET_VERSION__-2026-06-17a';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/main.css',
  '/config.js',
  '/favicon.svg',
  '/js/app-modular.js',
  '/js/core/state.js',
  '/js/core/dom.js',
  '/js/core/config.js',
  '/js/core/module-loader.js',
  '/js/core/proxies.js',
  '/js/core/router.js',
  '/js/core/events.js',
  '/js/core/profile.js',
  '/js/core/bootstrap.js',
  '/js/core/templates.js',
  '/js/ui/feedback.js',
  '/js/ui/loading.js',
  '/js/ui/navigation.js',
  '/js/ui/mobile-nav.js',
  '/js/ui/toast.js',
  '/js/modules/wish-wall.js',
  '/js/utils/api.js',
  '/js/utils/helpers.js',
  '/templates/overview.html',
  '/templates/media-library.html',
  '/templates/review.html',
  '/templates/todo.html',
  '/templates/device.html',
  '/templates/borrow.html',
  '/templates/team.html',
  '/templates/topics.html',
  '/templates/settings.html',
];

// 安装事件 - 预缓存静态资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 Service Worker 缓存初始化');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('⚠️ 部分资源缓存失败:', err);
      });
    })
  );
  self.skipWaiting();
});

// 激活事件 - 清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ 删除旧缓存:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 获取事件 - 实现缓存策略
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 仅处理 HTTPS 和同源请求
  if (!url.protocol.startsWith('http') || url.origin !== self.location.origin) {
    return;
  }

  // API 请求：Network First（网络优先，降级到缓存）
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // HTML 文件：Stale While Revalidate（返回缓存，后台更新）
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // 静态资源：Cache First（缓存优先）
  event.respondWith(cacheFirst(request));
});

/**
 * Cache First 策略
 * 1. 检查缓存
 * 2. 如果缓存命中，返回缓存
 * 3. 如果缓存未命中，发起网络请求
 * 4. 缓存新响应并返回
 */
async function cacheFirst(request) {
  try {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }

    const response = await fetch(request);
    if (!response.ok) {
      return response;
    }

    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
    return response;
  } catch (err) {
    console.error('❌ Cache First 错误:', err);
    return new Response('网络错误，离线模式不可用', { status: 503 });
  }
}

/**
 * Network First 策略
 * 1. 发起网络请求
 * 2. 如果成功，缓存响应
 * 3. 如果失败，检查缓存
 * 4. 如果缓存存在，返回缓存（即使已过期）
 * 5. 如果无缓存，返回错误
 */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    console.warn('⚠️ API 请求失败，尝试使用缓存:', err);
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    return new Response(
      JSON.stringify({ error: '网络连接失败，离线模式下无此数据' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Stale While Revalidate 策略
 * 1. 检查缓存，如果存在立即返回
 * 2. 后台发起网络请求
 * 3. 如果网络请求成功，更新缓存
 * 4. 通知客户端有新版本可用
 */
async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);

  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) {
      const cache = caches.open(CACHE_NAME).then((c) => {
        c.put(request, response.clone());
        // 通知所有客户端页面有更新
        self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({
              type: 'UPDATE_AVAILABLE',
              message: '页面有新版本，刷新后生效',
            });
          });
        });
      });
    }
    return response;
  });

  return cached || fetchPromise;
}

// 消息处理（允许客户端控制 Service Worker）
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data?.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      event.ports[0]?.postMessage({ success: true });
    });
  }
});
