'use client';

import { useEffect, useRef } from 'react';

/**
 * ChunkLoadRecovery
 * Fixes the common Safari/ServiceWorker deploy issue:
 * "Failed to load chunk /_next/static/chunks/....js"
 *
 * On first detection, clears SW + Cache Storage and reloads once.
 */
export function ChunkLoadRecovery() {
  const didRecoverRef = useRef(false);

  useEffect(() => {
    const isChunkError = (msg: string) => {
      const m = (msg || '').toLowerCase();
      return (
        m.includes('failed to load chunk') ||
        m.includes('chunkloaderror') ||
        m.includes('loading chunk') ||
        m.includes('dynamically imported module')
      );
    };

    const recover = async () => {
      if (didRecoverRef.current) return;
      didRecoverRef.current = true;

      try {
        if (typeof caches !== 'undefined' && caches.keys) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch {
        // ignore
      }

      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
      } catch {
        // ignore
      }

      // Reload (cache-busting)
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('_recover', String(Date.now()));
        window.location.replace(url.toString());
      } catch {
        window.location.reload();
      }
    };

    const onError = (e: ErrorEvent) => {
      if (isChunkError(String(e?.message || ''))) void recover();
    };

    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e?.reason;
      const msg = typeof reason === 'string' ? reason : (reason?.message || String(reason || ''));
      if (isChunkError(String(msg))) void recover();
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}

