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

      // Anti-loop protection: if we already have a _recover param that is recent, don't try again automatically
      try {
        const params = new URLSearchParams(window.location.search);
        const recoverTime = parseInt(params.get('_recover') || '0', 10);
        const now = Date.now();
        // If recovery was attempted less than 10 seconds ago, stop to prevent infinite loops
        if (recoverTime > 0 && (now - recoverTime) < 10000) {
          console.warn('ChunkLoadRecovery: Recent recovery attempt detected, skipping to avoid infinite loop.');
          return;
        }
      } catch (e) {
        // ignore
      }

      console.log('ChunkLoadRecovery: Chunk error detected, attempting recovery...');

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

      // Small delay to let unregistrations/cache deletes settle
      await new Promise(resolve => setTimeout(resolve, 500));

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

