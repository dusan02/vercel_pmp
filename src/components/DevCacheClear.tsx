'use client';

/**
 * Development-only cache clear utility
 * Renders only on client side to avoid hydration issues
 */
export function DevCacheClear() {
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <script
      id="cache-clear-utility"
      dangerouslySetInnerHTML={{
        __html: `
                // Make cache clear utility available in console
                window.clearAllCaches = async function() {
                  // NOTE: We cannot dynamic-import TS source files in browser under Next/Turbopack.
                  // Do not clear directly here (Cache Storage + SW + storage), then reload.
                  const keep = [];
                  try {
                    // Clear Cache Storage
                    if (typeof caches !== 'undefined' && caches.keys) {
                      const keys = await caches.keys();
                      await Promise.all(keys.map((k) => caches.delete(k)));
                    }
                  } catch (e) {
                    console.warn('clearAllCaches: caches API failed', e);
                  }

                  try {
                    // Unregister Service Workers
                    if ('serviceWorker' in navigator) {
                      const regs = await navigator.serviceWorker.getRegistrations();
                      await Promise.all(regs.map((r) => r.unregister()));
                    }
                  } catch (e) {
                    console.warn('clearAllCaches: serviceWorker unregister failed', e);
                  }

                  try {
                    // Clear storage (keep allowlist)
                    if (keep.length === 0) {
                      localStorage.clear();
                    } else {
                      const preserved = {};
                      keep.forEach((k) => {
                        const v = localStorage.getItem(k);
                        if (v !== null) preserved[k] = v;
                      });
                      localStorage.clear();
                      Object.keys(preserved).forEach((k) => localStorage.setItem(k, preserved[k]));
                    }
                    sessionStorage.clear();
                  } catch (e) {
                    console.warn('clearAllCaches: storage clear failed', e);
                  }

                  // Reload
                  try {
                    location.reload();
                  } catch {
                    location.href = location.href;
                  }
                };
                console.log('%c🧹 Cache Clear', 'color: #3b82f6; font-weight: bold;', 'Available: window.clearAllCaches()');
        `,
      }}
    />
  );
}
