/**
 * Shared chunk load error detection and recovery logic.
 * Used by both error.tsx (route-level) and global-error.tsx (root-level).
 */

export function isChunkLoadError(msg: string): boolean {
  const m = (msg || '').toLowerCase();
  return (
    m.includes('chunkloaderror') ||
    m.includes('loading chunk') ||
    m.includes('failed to load chunk') ||
    m.includes('dynamically imported module')
  );
}

export async function hardReload(sessionKey: string): Promise<void> {
  try {
    if (typeof caches !== 'undefined' && caches.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch { /* ignore */ }

  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch { /* ignore */ }

  await new Promise(resolve => setTimeout(resolve, 300));

  try {
    const url = new URL(window.location.href);
    url.searchParams.set('_recover', String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}
