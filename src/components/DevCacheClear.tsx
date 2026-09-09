'use client';

import { useEffect } from 'react';

/**
 * Development-only cache clear utility
 * Renders only on client side to avoid hydration issues
 */
export function DevCacheClear() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    (window as any).clearAllCaches = async function () {
      const keep: string[] = [];
      try {
        if (typeof caches !== 'undefined' && caches.keys) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch (e) {
        console.warn('clearAllCaches: caches API failed', e);
      }

      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
      } catch (e) {
        console.warn('clearAllCaches: serviceWorker unregister failed', e);
      }

      try {
        if (keep.length === 0) {
          localStorage.clear();
        } else {
          const preserved: Record<string, string> = {};
          keep.forEach((k) => {
            const v = localStorage.getItem(k);
            if (v !== null) preserved[k] = v;
          });
          localStorage.clear();
          Object.entries(preserved).forEach(([k, v]) => localStorage.setItem(k, v));
        }
        sessionStorage.clear();
      } catch (e) {
        console.warn('clearAllCaches: storage clear failed', e);
      }

      try {
        location.reload();
      } catch {
        location.href = location.href;
      }
    };

    console.log('%c🧹 Cache Clear', 'color: #3b82f6; font-weight: bold;', 'Available: window.clearAllCaches()');
  }, []);

  return null;
}
