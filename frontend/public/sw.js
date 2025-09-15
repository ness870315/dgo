// Degen Oracle PWA Service Worker
const CACHE_VERSION = 'v1.2.0'; // Update this when deploying new versions
const CACHE_NAME = `degen-oracle-${CACHE_VERSION}`;
const STATIC_CACHE = `degen-oracle-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `degen-oracle-dynamic-${CACHE_VERSION}`;

// Files to cache for offline use (with cache busting)
const STATIC_FILES = [
  '/',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png'
];

// Dynamic static files that change with each build
const DYNAMIC_STATIC_FILES = [
  '/static/js/bundle.js',
  '/static/css/main.css'
];

// API endpoints to cache (with shorter TTL)
const API_CACHE_PATTERNS = [
  /\/api\/tokens/,
  /\/api\/user\/hype/,
  /\/api\/user\/kol-calls/
];

// Install event - cache static files
self.addEventListener('install', (event) => {
  console.log('🔧 Degen Oracle PWA: Service Worker installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('📦 Caching static files...');
        return cache.addAll(STATIC_FILES);
      })
      .then(() => {
        console.log('✅ Static files cached successfully');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('❌ Failed to cache static files:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('🚀 Degen Oracle PWA: Service Worker activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log('🗑️ Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('✅ Service Worker activated');
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip chrome-extension and other non-http requests
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  event.respondWith(
    handleRequest(request)
  );
});

async function handleRequest(request) {
  const url = new URL(request.url);
  
  // Handle API requests with network-first strategy
  if (url.pathname.startsWith('/api/')) {
    return handleApiRequest(request);
  }
  
  // Handle static files with cache-first strategy
  return handleStaticRequest(request);
}

async function handleApiRequest(request) {
  const url = new URL(request.url);
  
  // Check if this is a cacheable API endpoint
  const isCacheable = API_CACHE_PATTERNS.some(pattern => pattern.test(url.pathname));
  
  if (!isCacheable) {
    // For non-cacheable APIs, always go to network
    return fetch(request);
  }
  
  try {
    // Network-first strategy for API calls
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Cache successful API responses
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
      
      // Set cache expiration (5 minutes for API data)
      const responseWithExpiry = new Response(networkResponse.body, {
        status: networkResponse.status,
        statusText: networkResponse.statusText,
        headers: {
          ...networkResponse.headers,
          'sw-cache-expires': (Date.now() + 5 * 60 * 1000).toString()
        }
      });
      
      return responseWithExpiry;
    }
    
    throw new Error(`API request failed: ${networkResponse.status}`);
    
  } catch (error) {
    console.log('🌐 Network failed, trying cache for:', url.pathname);
    
    // Fallback to cache if network fails
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      // Check if cached data is still fresh (5 minutes)
      const cacheExpiry = cachedResponse.headers.get('sw-cache-expires');
      if (cacheExpiry && Date.now() < parseInt(cacheExpiry)) {
        console.log('📦 Serving fresh cached API data');
        return cachedResponse;
      }
    }
    
    // If no cache or stale cache, return offline page or error
    return new Response(
      JSON.stringify({
        error: 'Offline',
        message: 'No internet connection. Please check your connection and try again.',
        cached: false
      }),
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

async function handleStaticRequest(request) {
  const url = new URL(request.url);
  
  // Check if this is a dynamic static file (JS/CSS bundles)
  const isDynamicFile = DYNAMIC_STATIC_FILES.some(file => url.pathname.includes(file.split('/').pop()));
  
  if (isDynamicFile) {
    // Network-first strategy for dynamic files (JS/CSS bundles)
    return handleDynamicStaticRequest(request);
  }
  
  // Cache-first strategy for truly static files (images, manifest, etc.)
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
    
  } catch (error) {
    console.log('🌐 Network failed for static file:', request.url);
    
    // Return a basic offline page for navigation requests
    if (request.destination === 'document') {
      return new Response(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Degen Oracle - Offline</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                background: #000; color: #fff; 
                display: flex; align-items: center; justify-content: center; 
                height: 100vh; margin: 0; text-align: center;
              }
              .offline { max-width: 400px; padding: 20px; }
              .icon { font-size: 48px; margin-bottom: 20px; }
              h1 { color: #6366f1; margin-bottom: 10px; }
              p { color: #9ca3af; line-height: 1.6; }
            </style>
          </head>
          <body>
            <div class="offline">
              <div class="icon">📱</div>
              <h1>Degen Oracle</h1>
              <p>You're offline. Please check your internet connection and try again.</p>
              <p>Some features may be available with cached data.</p>
            </div>
          </body>
        </html>
      `, {
        headers: { 'Content-Type': 'text/html' }
      });
    }
    
    throw error;
  }
}

async function handleDynamicStaticRequest(request) {
  try {
    // Always try network first for dynamic files
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Cache the new version
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
      console.log('🔄 Updated dynamic file in cache:', request.url);
    }
    
    return networkResponse;
    
  } catch (error) {
    console.log('🌐 Network failed for dynamic file, trying cache:', request.url);
    
    // Fallback to cache if network fails
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('📦 Serving cached dynamic file:', request.url);
      return cachedResponse;
    }
    
    throw error;
  }
}

// Background sync for when connection is restored
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    console.log('🔄 Background sync triggered');
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  // Sync any pending data when connection is restored
  console.log('🔄 Syncing data in background...');
  // Add any pending operations here
}

// Push notification handling for KOL calls
self.addEventListener('push', (event) => {
  console.log('📱 Push notification received:', event);
  
  if (event.data) {
    const data = event.data.json();
    console.log('📱 Push data:', data);
    
    const options = {
      body: data.body,
      icon: data.icon || '/icon-192x192.png',
      badge: data.badge || '/icon-192x192.png',
      image: data.image,
      vibrate: data.vibrate || [200, 100, 200],
      data: data.data || {},
      actions: data.actions || [],
      requireInteraction: data.requireInteraction || true,
      tag: data.tag || 'kol_call',
      renotify: data.renotify || true
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'Degen Oracle', options)
    );
  } else {
    // Fallback notification if no data
    event.waitUntil(
      self.registration.showNotification('Degen Oracle', {
        body: 'New KOL call available!',
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
        vibrate: [200, 100, 200],
        tag: 'kol_call_fallback'
      })
    );
  }
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  console.log('📱 Notification clicked:', event);
  
  event.notification.close();
  
  // Handle different actions
  if (event.action === 'view' && event.notification.data && event.notification.data.url) {
    // Open the specific token page
    event.waitUntil(
      clients.openWindow(event.notification.data.url)
    );
  } else if (event.action === 'dismiss') {
    // Just close the notification
    console.log('📱 Notification dismissed');
  } else {
    // Default action - open main page
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Notification close handling
self.addEventListener('notificationclose', (event) => {
  console.log('📱 Notification closed:', event);
});

console.log('🔧 Degen Oracle PWA Service Worker loaded');
