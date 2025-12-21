// Version management - increment on layout/structure changes
const CACHE_VERSION = "2.0.0";
const CACHE_NAME = `premarketprice-v${CACHE_VERSION}`;
const STATIC_CACHE = `premarketprice-static-v${CACHE_VERSION}`;
const DYNAMIC_CACHE = `premarketprice-dynamic-v${CACHE_VERSION}`;
const API_CACHE = `premarketprice-api-v${CACHE_VERSION}`;

// Files to cache immediately
const STATIC_FILES = [
  "/",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/offline.html",
];

// API endpoints to cache
const API_ENDPOINTS = [
  "/api/stocks",
  "/api/earnings-calendar",
  "/api/background/status",
];

// Install event - cache static files
self.addEventListener("install", (event) => {
  console.log("Service Worker: Installing...");

  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => {
        console.log("Service Worker: Caching static files");
        return cache.addAll(STATIC_FILES);
      })
      .then(() => {
        console.log("Service Worker: Static files cached");
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error("Service Worker: Error caching static files:", error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  console.log("Service Worker: Activating...");

  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // Delete ALL old caches that don't match current version
            // This ensures clean cache on layout changes
            if (
              cacheName.startsWith("premarketprice-") &&
              !cacheName.includes(CACHE_VERSION)
            ) {
              console.log("Service Worker: Deleting old cache:", cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log("Service Worker: Activated");
        // Force claim all clients to use new service worker immediately
        return self.clients.claim();
      })
  );
});

// Fetch event - handle requests
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") {
    return;
  }

  // Handle API requests
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(handleApiRequest(request));
    return;
  }

  // Handle static file requests
  if (url.origin === location.origin) {
    event.respondWith(handleStaticRequest(request));
    return;
  }

  // Handle external requests (logos, etc.)
  if (url.pathname.startsWith("/logos/")) {
    event.respondWith(handleLogoRequest(request));
    return;
  }
});

// Handle API requests with cache-first strategy
async function handleApiRequest(request) {
  try {
    // Try network first
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      // Cache the successful response
      const cache = await caches.open(API_CACHE);
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }

    // If network fails, try cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // If no cache, return network response (even if it failed)
    return networkResponse;
  } catch (error) {
    console.log("Service Worker: Network failed, trying cache:", error);

    // Try cache as fallback
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Return offline response for API requests
    return new Response(
      JSON.stringify({
        error: "Offline mode",
        message: "Data not available offline",
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

// Handle static file requests with cache-first strategy
async function handleStaticRequest(request) {
  try {
    // Try cache first
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // If not in cache, try network
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      // Cache the response for next time
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.log("Service Worker: Static file not found:", error);

    // Return offline page for navigation requests
    if (request.destination === "document") {
      return caches.match("/offline.html");
    }

    // Return empty response for other static files
    return new Response("", { status: 404 });
  }
}

// Handle logo requests with cache-first strategy
async function handleLogoRequest(request) {
  try {
    // Try cache first
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // If not in cache, try network
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      // Cache the logo for next time
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.log("Service Worker: Logo not found:", error);

    // Return a placeholder or empty response
    return new Response("", { status: 404 });
  }
}

// Background sync for offline actions
self.addEventListener("sync", (event) => {
  console.log("Service Worker: Background sync triggered:", event.tag);

  if (event.tag === "background-sync") {
    event.waitUntil(performBackgroundSync());
  }
});

// Perform background sync
async function performBackgroundSync() {
  try {
    console.log("Service Worker: Performing background sync...");

    // Sync any pending data
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({
        type: "BACKGROUND_SYNC",
        data: { timestamp: Date.now() },
      });
    });

    console.log("Service Worker: Background sync completed");
  } catch (error) {
    console.error("Service Worker: Background sync failed:", error);
  }
}

// Push notification handling
self.addEventListener("push", (event) => {
  console.log("Service Worker: Push notification received");

  const options = {
    body: event.data ? event.data.text() : "New market data available!",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1,
    },
    actions: [
      {
        action: "explore",
        title: "View Data",
        icon: "/icon-192.png",
      },
      {
        action: "close",
        title: "Close",
        icon: "/icon-192.png",
      },
    ],
  };

  event.waitUntil(
    self.registration.showNotification("PreMarketPrice", options)
  );
});

// Notification click handling
self.addEventListener("notificationclick", (event) => {
  console.log("Service Worker: Notification clicked");

  event.notification.close();

  if (event.action === "explore") {
    event.waitUntil(clients.openWindow("/"));
  }
});

// Message handling for communication with main thread
self.addEventListener("message", (event) => {
  console.log("Service Worker: Message received:", event.data);

  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data && event.data.type === "GET_VERSION") {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});

// Periodic background sync (if supported)
self.addEventListener("periodicsync", (event) => {
  console.log("Service Worker: Periodic sync triggered:", event.tag);

  if (event.tag === "market-data-sync") {
    event.waitUntil(syncMarketData());
  }
});

// Sync market data periodically
async function syncMarketData() {
  try {
    console.log("Service Worker: Syncing market data...");

    // Fetch latest market data
    const response = await fetch("/api/stocks?limit=10");
    if (response.ok) {
      const cache = await caches.open(API_CACHE);
      cache.put("/api/stocks?limit=10", response.clone());

      // Notify clients of new data
      const clients = await self.clients.matchAll();
      clients.forEach((client) => {
        client.postMessage({
          type: "MARKET_DATA_UPDATED",
          data: { timestamp: Date.now() },
        });
      });
    }
  } catch (error) {
    console.error("Service Worker: Market data sync failed:", error);
  }
}
