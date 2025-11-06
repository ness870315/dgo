// Degen Oracle PWA Service Worker
// IMPORTANT: Cache version is now based on build timestamp for automatic invalidation
const BUILD_TIMESTAMP = '__BUILD_TIMESTAMP__'; // Replaced during build
const CACHE_VERSION = BUILD_TIMESTAMP || Date.now().toString();
const CACHE_NAME = `degen-oracle-${CACHE_VERSION}`;
const STATIC_CACHE = `degen-oracle-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `degen-oracle-dynamic-${CACHE_VERSION}`;

console.log('🔧 Service Worker Cache Version:', CACHE_VERSION);
console.log('🔧 Service Worker Updated:', new Date().toISOString());

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

// Install event - cache static files and force immediate activation
self.addEventListener('install', (event) => {
  console.log('🔧 Degen Oracle PWA: Service Worker installing...', CACHE_VERSION);
  
  event.waitUntil(
    (async () => {
      try {
        // Clear ALL old caches immediately on install
        const cacheNames = await caches.keys();
        console.log('🗑️ Clearing old caches:', cacheNames.length);
        await Promise.all(
          cacheNames.map(cacheName => {
            if (!cacheName.includes(CACHE_VERSION)) {
              console.log('🗑️ Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
        
        // Open new cache and add static files
        const cache = await caches.open(STATIC_CACHE);
        console.log('📦 Caching static files...');
        await cache.addAll(STATIC_FILES);
        console.log('✅ Static files cached successfully');
        
        // Force immediate activation - skip waiting
        await self.skipWaiting();
        console.log('⚡ Service Worker activated immediately');
      } catch (error) {
        console.error('❌ Failed to install service worker:', error);
      }
    })()
  );
});

// Activate event - clean up old caches and take control immediately
self.addEventListener('activate', (event) => {
  console.log('🚀 Degen Oracle PWA: Service Worker activating...', CACHE_VERSION);
  
  event.waitUntil(
    (async () => {
      try {
        // Clean up any remaining old caches
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log('🗑️ Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
        
        console.log('✅ Service Worker activated');
        
        // Take control of all clients immediately (force refresh)
        await self.clients.claim();
        console.log('⚡ Service Worker now controlling all clients');
        
        // Notify all clients to reload for fresh content
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_UPDATED',
            version: CACHE_VERSION,
            message: 'New version available - reloading...'
          });
        });
      } catch (error) {
        console.error('❌ Failed to activate service worker:', error);
      }
    })()
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
  
  // CRITICAL: Never cache these endpoints - always fetch fresh
  const neverCachePatterns = [
    '/x402/',
    '/fuel-payment',
    '/payment-details',
    '/api/tokens/bonding',  // Pre-bonding tokens - always fresh
    '/api/user/',           // User data - always fresh
    '/price-chart',         // Chart data - always fresh
    '/holders/insights',    // Holder data - always fresh
    '/hybrid-price',        // Live price data - always fresh
    '/api/tokens/',         // All token API endpoints - always fresh
    '/api/hybrid-price'     // Hybrid price stats/cleanup - always fresh
  ];
  
  const shouldNeverCache = neverCachePatterns.some(pattern => url.pathname.includes(pattern));
  
  if (shouldNeverCache) {
    try {
      // Always fetch fresh from network, no caching
      return await fetch(request);
    } catch (error) {
      console.log('⚠️ Network error for critical endpoint:', url.pathname, error.message);
      throw error; // Re-throw to let the caller handle it
    }
  }
  
  // For other API endpoints, use network-first with NO caching
  // This prevents stale data issues on mobile
  try {
    // Always try network first
    const networkResponse = await fetch(request);
    
    // Don't cache API responses to prevent stale data
    // Mobile users will always get fresh data
    return networkResponse;
    
  } catch (error) {
    console.log('🌐 Network failed for API:', url.pathname);
    
    // Return offline error - no cache fallback for APIs
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
