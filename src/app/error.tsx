'use client'; // Error components must be Client Components

import { useEffect, useState } from 'react';

const isChunkLoadError = (msg: string) => {
  const m = (msg || '').toLowerCase();
  return (
    m.includes('chunkloaderror') ||
    m.includes('loading chunk') ||
    m.includes('failed to load chunk') ||
    m.includes('dynamically imported module')
  );
};

async function hardReload() {
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

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [isChunkError] = useState(() => isChunkLoadError(error.message));

  useEffect(() => {
    console.error('App Error:', error);

    if (isChunkError) {
      if (typeof window !== 'undefined') {
        const key = 'chunk_load_error_reload';
        const now = Date.now();
        const lastReload = parseInt(sessionStorage.getItem(key) || '0', 10);

        if (now - lastReload > 10000) {
          sessionStorage.setItem(key, now.toString());
          void hardReload();
        }
      }
    }
  }, [error, isChunkError]);

  if (isChunkError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-4">
        <h2 className="text-2xl font-bold mb-4">Updating app…</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6 text-center max-w-md">
          A new version was deployed. Refreshing automatically to get the latest update.
        </p>
        <button
          onClick={() => void hardReload()}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Reload now
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-4">
      <h2 className="text-2xl font-bold mb-4">Something went wrong!</h2>
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 max-w-lg overflow-auto">
        <p className="font-mono text-sm">{error.message}</p>
        {error.digest && <p className="text-xs mt-2">Digest: {error.digest}</p>}
      </div>
      <button
        onClick={() => reset()}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Try again
      </button>
    </div>
  );
}

